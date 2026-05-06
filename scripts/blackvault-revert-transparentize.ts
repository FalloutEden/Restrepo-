// Revert the transparentize-images run on the 20 non-AOP BV products by
// re-fetching each product's Printful-rendered mockup and replacing the
// current (broken-looking) Shopify image with it.
//
// What broke: the threshold-based alpha cut treated white-product fabric
// the same as a white background, leaving only the high-contrast features
// (shadows, seams, monogram) — so white shirts looked like photo
// negatives. Edge-only mode should have prevented this but didn't, likely
// because the Printful mockups don't have a sharp shirt-vs-bg boundary.
//
// Skips the 7 AOP products (their previews come from a different placement
// pipeline and are handled by blackvault-attach-all-aop-previews.ts).
//
// Idempotent: safe to re-run.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-revert-transparentize.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET", urlPath: string) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  const r = await fetch(`${PF_BASE}${urlPath}`, {
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

async function getMockupUrl(syncProductId: number): Promise<string | null> {
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants = detail.result?.sync_variants ?? [];
  // Prefer the composite "preview" type — that's the on-body rendered mockup.
  for (const v of variants) {
    const composite = (v.files ?? []).find(
      (f: { type?: string; preview_url?: string }) => f.type === "preview" && f.preview_url
    );
    if (composite?.preview_url) return composite.preview_url;
  }
  // Fallback: the sync_product thumbnail (usually the embroidery file art,
  // not what we want, but better than nothing).
  return detail.result?.sync_product?.thumbnail_url ?? null;
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags,images`,
    { method: "GET" }
  );
  const tagFilter = `brand:${creds.brandSlug}`;
  // SKIP AOP products — they're handled by blackvault-attach-all-aop-previews.ts
  const products = list.products.filter((p) => {
    const tags = (p.tags ?? "").split(",").map((t) => t.trim());
    return tags.includes(tagFilter) && !tags.includes("all-over-print");
  });
  console.log(`[init] ${products.length} non-AOP BV product(s) to revert`);

  let reverted = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    const tags = (product.tags ?? "").split(",").map((t) => t.trim());
    const syncTag = tags.find((t) => /^printful-sync:\d+$/.test(t));
    if (!syncTag) {
      console.log(`  - ${product.title}: no printful-sync tag, skipping`);
      skipped += 1;
      continue;
    }
    const syncProductId = Number(syncTag.split(":")[1]);

    let mockupUrl: string | null = null;
    try {
      mockupUrl = await getMockupUrl(syncProductId);
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
      errors += 1;
      continue;
    }
    if (!mockupUrl) {
      console.log(`  ⏳ ${product.title}: no rendered preview yet`);
      skipped += 1;
      continue;
    }

    try {
      // Attach the fresh Printful mockup as image position 1
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: mockupUrl, alt: product.title, position: 1 } })
      });
      // Delete the broken transparentized image (filename starts with bv-<id>-transparent)
      for (const img of product.images) {
        if (/bv-\d+-transparent/.test(img.src)) {
          try {
            await shopifyRest(creds, `/products/${product.id}/images/${img.id}.json`, { method: "DELETE" });
          } catch {}
        }
      }
      console.log(`  ✓ ${product.title}: reverted to ${mockupUrl.slice(-50)}`);
      reverted += 1;
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
      errors += 1;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Reverted: ${reverted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
