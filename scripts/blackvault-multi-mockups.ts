// For each AOP product on the BV store, kick off a Printful mockup-generator
// task that renders multiple angles/views per variant, poll for completion,
// then attach all rendered mockups to the matching Shopify product.
//
// Why: Printful's default sync-product mockup is just one view per product.
// The mockup-generator endpoint exposes the full set (front, back, sleeve,
// lifestyle/model when available) so the storefront has more than a single
// flat-lay per item.
//
// Idempotent within a run, but re-runs accumulate — clean up old images
// manually or via store-cleanup if you re-run repeatedly.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-multi-mockups.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET" | "POST", urlPath: string, body?: unknown) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  const r = await fetch(`${PF_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type SyncVariant = {
  id: number;
  variant_id: number; // catalog variant id
  product?: { variant_id?: number };
  files?: Array<{ type?: string; url?: string }>;
};

type ShopifyProduct = {
  id: number;
  title: string;
  tags: string;
  images: Array<{ id: number; src: string; position: number }>;
};

async function getCatalogProductIdFromVariant(catalogVariantId: number): Promise<number> {
  const data = await pfFetch("GET", `/products/variant/${catalogVariantId}`);
  const id = data.result?.product?.id;
  if (!id) throw new Error(`No catalog product_id for variant ${catalogVariantId}`);
  return id;
}

async function generateMockupsForProduct(syncProductId: number, productTitle: string): Promise<string[]> {
  console.log(`\n[${productTitle}] sync=${syncProductId}`);
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants: SyncVariant[] = detail.result?.sync_variants ?? [];
  if (variants.length === 0) {
    console.warn(`  no variants`);
    return [];
  }

  // Resolve the catalog product id from the first variant. All sync variants
  // for one sync product share the same catalog product id.
  const firstCatalogVariantId = variants[0].variant_id;
  const catalogProductId = await getCatalogProductIdFromVariant(firstCatalogVariantId);
  console.log(`  catalog product=${catalogProductId}`);

  // Build files array from the first variant (all variants share the same files).
  const files = (variants[0].files ?? [])
    .filter((f) => f.type && f.url)
    .map((f) => ({ placement: f.type!, image_url: f.url! }));
  console.log(`  files: ${files.map((f) => f.placement).join(", ")}`);

  // Use just one variant id (medium-sized) to keep the task fast — mockups
  // render the same regardless of which size variant we pick.
  const middleVariant = variants[Math.floor(variants.length / 2)];
  const variantIds = [middleVariant.variant_id];

  // Kick off the mockup generation task
  const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${catalogProductId}`, {
    variant_ids: variantIds,
    format: "jpg",
    files
  });
  const taskKey = taskResp.result?.task_key;
  if (!taskKey) throw new Error(`No task_key in response: ${JSON.stringify(taskResp)}`);
  console.log(`  task_key=${taskKey}`);

  // Poll up to 30 attempts × 4s = 2 minutes
  let mockupUrls: string[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await pfFetch("GET", `/mockup-generator/task?task_key=${taskKey}`);
    const s = status.result?.status;
    if (s === "completed") {
      const mockups = status.result?.mockups ?? [];
      mockupUrls = mockups
        .map((m: { mockup_url?: string; placement?: string }) => m.mockup_url)
        .filter((u: string | undefined): u is string => Boolean(u));
      console.log(`  ✓ ${mockupUrls.length} mockup(s) ready`);
      break;
    } else if (s === "failed") {
      console.warn(`  ✗ task failed: ${JSON.stringify(status.result?.error ?? status.result)}`);
      break;
    }
  }
  return mockupUrls;
}

async function attachMockupsToShopify(
  creds: ShopifyCredentials,
  product: ShopifyProduct,
  mockupUrls: string[]
) {
  // Strategy: keep at most one existing image as primary, then append new
  // mockup images. To avoid pile-up on re-runs, first remove any image whose
  // src was a printful preview that we attached previously.
  for (const img of product.images) {
    if (/files\.cdn\.printful\.com.*_preview/.test(img.src)) {
      try {
        await shopifyRest(creds, `/products/${product.id}/images/${img.id}.json`, { method: "DELETE" });
      } catch {}
    }
  }
  // Add fresh ones in order
  let position = 1;
  for (const url of mockupUrls) {
    try {
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: product.title, position } })
      });
      position += 1;
    } catch (e) {
      console.warn(`    attach failed for ${url}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags,images`,
    { method: "GET" }
  );
  const aop = list.products.filter((p) => {
    const tags = (p.tags ?? "").split(",").map((t) => t.trim());
    return tags.includes("all-over-print") && tags.some((t) => /^printful-sync:\d+$/.test(t));
  });
  console.log(`[init] ${aop.length} AOP product(s)`);

  for (const product of aop) {
    const syncTag = product.tags.split(",").map((t) => t.trim()).find((t) => /^printful-sync:\d+$/.test(t));
    if (!syncTag) continue;
    const syncProductId = Number(syncTag.split(":")[1]);
    try {
      const urls = await generateMockupsForProduct(syncProductId, product.title);
      if (urls.length > 0) {
        await attachMockupsToShopify(creds, product, urls);
        console.log(`  ✓ attached ${urls.length} mockup(s) to ${product.title}`);
      }
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
