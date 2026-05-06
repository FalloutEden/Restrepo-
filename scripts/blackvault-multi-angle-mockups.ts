// Generate multiple mockup angles per AOP product via Printful's
// mockup-generator API (front + back + left + right + scene extras).
// Replaces the current 1-2 attached previews on each Shopify product
// with the full set so the storefront has carousel imagery.
//
// Why this didn't work earlier: Printful's mockup-generator requires
// the `position` field with `area_width`, `area_height`, `width`,
// `height`, `top`, `left` — explicit pixel values from the catalog's
// printfile dimensions. Earlier attempts omitted area_width/height
// and got 400 "Position field is missing".
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-multi-angle-mockups.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET" | "POST", urlPath: string, body?: unknown) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  for (let attempt = 0; attempt < 4; attempt += 1) {
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
    if (r.status === 429) {
      const m = text.match(/(\d+)\s*seconds/i);
      const waitS = m ? Math.min(120, Number(m[1]) + 5) : 65;
      console.log(`    [rate-limit] sleeping ${waitS}s before retry…`);
      await new Promise((r) => setTimeout(r, waitS * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
    return text ? JSON.parse(text) : {};
  }
  throw new Error(`Printful ${method} ${urlPath} exceeded 429 retry budget`);
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

type ShopifyProduct = {
  id: number;
  title: string;
  tags: string;
  images: Array<{ id: number; src: string; position: number }>;
};

type SyncVariant = {
  id: number;
  variant_id: number;
  retail_price: string;
  files?: Array<{ type?: string; url?: string }>;
};

async function getCatalogProductId(catalogVariantId: number): Promise<number> {
  const data = await pfFetch("GET", `/products/variant/${catalogVariantId}`);
  return data.result?.product?.id;
}

async function getPrintfileMap(catalogProductId: number): Promise<Map<string, { width: number; height: number }>> {
  // Returns a map of placement → {width, height} from the catalog's print files.
  // Each placement (front/back/sleeves) has its own printfile_id with explicit
  // pixel dimensions we need to pass to the mockup-generator.
  const data = await pfFetch("GET", `/mockup-generator/printfiles/${catalogProductId}`);
  const printfiles: Array<{ printfile_id: number; width: number; height: number }> = data.result?.printfiles ?? [];
  const variantPrintfiles: Array<{ variant_id: number; placements: Record<string, number> }> = data.result?.variant_printfiles ?? [];
  const placementToFileId: Record<string, number> = variantPrintfiles[0]?.placements ?? {};
  const fileMap = new Map<string, { width: number; height: number }>();
  for (const [placement, fileId] of Object.entries(placementToFileId)) {
    const pf = printfiles.find((p) => p.printfile_id === fileId);
    if (pf) fileMap.set(placement, { width: pf.width, height: pf.height });
  }
  return fileMap;
}

async function generateMockupsForProduct(syncProductId: number, productTitle: string): Promise<string[]> {
  console.log(`\n[${productTitle}] sync=${syncProductId}`);
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants: SyncVariant[] = detail.result?.sync_variants ?? [];
  if (variants.length === 0) return [];

  const catalogProductId = await getCatalogProductId(variants[0].variant_id);
  const placementSizes = await getPrintfileMap(catalogProductId);

  // Use the existing files on the sync product, packaged with the right positioning
  const sample = variants[Math.floor(variants.length / 2)];
  const usableFiles = (sample.files ?? []).filter((f) => f.type && f.type !== "preview" && f.url);
  if (usableFiles.length === 0) {
    console.warn(`  no usable files on sync product`);
    return [];
  }
  console.log(`  catalog ${catalogProductId} | placements: ${usableFiles.map((f) => f.type).join(", ")}`);

  const files = usableFiles.map((f) => {
    const sz = placementSizes.get(f.type!);
    if (!sz) return null;
    return {
      placement: f.type!,
      image_url: f.url!,
      position: { area_width: sz.width, area_height: sz.height, width: sz.width, height: sz.height, top: 0, left: 0 }
    };
  }).filter((f): f is NonNullable<typeof f> => f !== null);

  if (files.length === 0) {
    console.warn(`  no placements matched printfile map`);
    return [];
  }

  const taskBody = {
    variant_ids: [sample.variant_id],
    format: "jpg",
    files
  };

  const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${catalogProductId}`, taskBody);
  const taskKey = taskResp.result?.task_key;
  if (!taskKey) throw new Error(`No task_key: ${JSON.stringify(taskResp).slice(0, 200)}`);
  console.log(`  task_key=${taskKey}, polling…`);

  // Poll up to 30 attempts × 4s
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await pfFetch("GET", `/mockup-generator/task?task_key=${taskKey}`);
    const s = status.result?.status;
    if (s === "completed") {
      // Collect main mockup_url for each placement + all extras (Back/Left/Right/etc)
      const all: string[] = [];
      for (const m of status.result?.mockups ?? []) {
        if (m.mockup_url) all.push(m.mockup_url);
        for (const e of m.extra ?? []) {
          if (e.url) all.push(e.url);
        }
      }
      // Dedupe (some extras may repeat across placements)
      const unique = Array.from(new Set(all));
      console.log(`  ✓ ${unique.length} mockup angle(s)`);
      return unique;
    }
    if (s === "failed") {
      console.warn(`  ✗ task failed: ${JSON.stringify(status.result?.error ?? status.result).slice(0, 200)}`);
      return [];
    }
  }
  console.warn(`  ⏳ task didn't complete in 2 min`);
  return [];
}

async function attachToShopify(creds: ShopifyCredentials, product: ShopifyProduct, mockupUrls: string[]) {
  // Drop existing Printful preview images first (avoid pile-up on re-runs)
  for (const img of product.images) {
    if (/_preview/.test(img.src) || /printful-upload\.s3/.test(img.src) || /files\.cdn\.printful\.com/.test(img.src) || /cdn\.shopify\.com.*-preview/.test(img.src)) {
      try {
        await shopifyRest(creds, `/products/${product.id}/images/${img.id}.json`, { method: "DELETE" });
      } catch {}
    }
  }
  let position = 1;
  for (const url of mockupUrls) {
    try {
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: product.title, position } })
      });
      position += 1;
    } catch (e) {
      console.warn(`    attach ${position}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    "/products.json?limit=250&fields=id,title,tags,images",
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
        await attachToShopify(creds, product, urls);
        console.log(`  ✓ attached ${urls.length} angle(s) to ${product.title}`);
      }
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
    }
    // Rate-limit cushion between products
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
