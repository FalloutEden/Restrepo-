// Delete the front-flat-lay mockup from each chest_left product. These show
// the supplier inside neck label (COMFORT COLORS, PORT AUTHORITY, etc.)
// which exposes blank brand identity to customers. Side/back angles remain.
//
// The side angle is already primary from `bv-promote-side-angle.ts`. Deleting
// the front-flat-lay removes the supplier-tag exposure entirely.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-delete-front-mockups.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

const PRODUCT_IDS = [
  7623581532258, 7623581597794, 7623581728866, 7623582023778, 7623582089314,
  7623687864418, 7625765191778, 7625765224546, 7625765257314, 7625765290082,
  7625765322850, 7625765355618, 7625765388386, 7625765421154, 7625765453922,
  7625765486690, 7625766699106
];

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[delete-front] processing ${PRODUCT_IDS.length} products`);

  let deleted = 0;
  for (const productId of PRODUCT_IDS) {
    try {
      const r = await shopifyRest<{ product: { title: string; images: Array<{ id: number; src: string }> } }>(
        creds,
        `/products/${productId}.json?fields=title,images`
      );
      // Find the -front- image (the one with supplier neck tag visible)
      const fronts = r.product.images.filter((img) => {
        const fn = img.src.split("/").pop()?.split("?")[0] ?? "";
        return fn.includes("-front-");
      });
      if (fronts.length === 0) {
        console.log(`  — ${productId}  ${r.product.title}  (no front image found, skip)`);
        continue;
      }
      // Safety: don't delete if it would leave the product with zero images
      const remaining = r.product.images.length - fronts.length;
      if (remaining < 1) {
        console.log(`  ⚠ ${productId}  ${r.product.title}  (would leave 0 images, skip)`);
        continue;
      }
      for (const front of fronts) {
        await shopifyRest(creds, `/products/${productId}/images/${front.id}.json`, { method: "DELETE" });
        const fn = front.src.split("/").pop()?.split("?")[0] ?? "";
        console.log(`  ✓ ${productId}  ${r.product.title}  → deleted ${fn.slice(0, 60)}`);
        deleted += 1;
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      console.log(`  ✗ ${productId}  ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\n[delete-front] ${deleted} front-flat-lay images deleted`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
