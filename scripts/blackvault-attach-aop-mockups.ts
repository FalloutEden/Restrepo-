// Poll Printful for the rendered mockup of every BV AOP draft and attach it
// as the primary product image on the matching Shopify product. Without this
// step the AOP drafts are imageless in Shopify admin (Printful renders
// mockups asynchronously after sync product creation).
//
// Idempotent: skips products that already have an image.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-attach-aop-mockups.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const AOP_TAG = "all-over-print";
const SYNC_TAG_RE = /^printful-sync:(\d+)$/;

async function pfFetch(method: "GET", urlPath: string) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  const r = await fetch(`https://api.printful.com${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "X-PF-Store-Id": storeId }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
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

async function getMockupUrl(syncProductId: number): Promise<string | null> {
  const data = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants = data.result?.sync_variants ?? [];
  // Look in variant.files for a `type: "preview"` file — that's the
  // Printful-rendered mockup of the actual garment with the design applied.
  // sync_product.thumbnail_url is only the input artwork, not the mockup.
  for (const v of variants) {
    const preview = (v.files ?? []).find(
      (f: { type?: string; preview_url?: string; url?: string }) => f.type === "preview" && f.preview_url
    );
    if (preview?.preview_url) return preview.preview_url;
  }
  // Fallback: any preview_url at all
  for (const v of variants) {
    const anyPreview = (v.files ?? []).find((f: { preview_url?: string }) => f.preview_url);
    if (anyPreview?.preview_url) return anyPreview.preview_url;
  }
  return null;
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags,images`,
    { method: "GET" }
  );
  const aopProducts = list.products.filter((p) => {
    const tags = (p.tags ?? "").split(",").map((t) => t.trim());
    return tags.includes(AOP_TAG) && tags.some((t) => SYNC_TAG_RE.test(t));
  });
  console.log(`[init] ${aopProducts.length} AOP product(s) to inspect`);

  let attached = 0;
  let skipped = 0;
  let pending = 0;
  let errors = 0;

  for (const product of aopProducts) {
    const tags = (product.tags ?? "").split(",").map((t) => t.trim());
    const syncTag = tags.find((t) => SYNC_TAG_RE.test(t));
    const syncProductId = syncTag ? Number(syncTag.split(":")[1]) : null;
    if (!syncProductId) {
      console.log(`  - ${product.title}: no printful-sync tag, skipping`);
      skipped += 1;
      continue;
    }

    // If the existing image came from a Shopify Files cdn upload (i.e. one of
    // our pattern uploads) replace it with the real Printful-rendered mockup.
    // Real Printful mockups live on files.cdn.printful.com.
    const hasOnlyPatternImage =
      product.images.length > 0 &&
      product.images.every((img) => /cdn\.shopify\.com.*bv-aop/.test(img.src));
    if (product.images.length > 0 && !hasOnlyPatternImage) {
      console.log(`  = ${product.title}: already has ${product.images.length} real image(s), skipping`);
      skipped += 1;
      continue;
    }

    // Poll up to 8 attempts for the mockup
    let mockupUrl: string | null = null;
    for (let attempt = 0; attempt < 8 && !mockupUrl; attempt += 1) {
      try {
        mockupUrl = await getMockupUrl(syncProductId);
      } catch (e) {
        console.warn(`  attempt ${attempt}: ${e instanceof Error ? e.message : e}`);
      }
      if (!mockupUrl) await new Promise((r) => setTimeout(r, 8000));
    }

    if (!mockupUrl) {
      console.log(`  ⏳ ${product.title}: no mockup ready after polling (try again later)`);
      pending += 1;
      continue;
    }

    try {
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: mockupUrl, alt: product.title, position: 1 } })
      });
      // Remove old pattern-only images so the rendered mockup is the primary.
      for (const img of product.images) {
        if (/cdn\.shopify\.com.*bv-aop/.test(img.src)) {
          try {
            await shopifyRest(creds, `/products/${product.id}/images/${img.id}.json`, { method: "DELETE" });
          } catch {}
        }
      }
      console.log(`  ✓ ${product.title}: attached ${mockupUrl}`);
      attached += 1;
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
      errors += 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Attached: ${attached}`);
  console.log(`Skipped (already had image): ${skipped}`);
  console.log(`Pending (mockup not yet rendered): ${pending}`);
  console.log(`Errors: ${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
