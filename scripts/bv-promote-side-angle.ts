// Re-order Shopify product gallery images so a side/back angle is primary
// instead of front-flat-lay. The front view shows the inside neck label
// (COMFORT COLORS, PORT AUTHORITY, etc.) which exposes supplier branding
// to customers. Side/back angles hide it.
//
// No Printful regeneration needed — the side/back mockups already exist
// in each product's gallery (Printful's mockup-gen returns front + back +
// left + right by default). We just reorder them.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-promote-side-angle.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

// All 17 chest_left products (resize already applied; chest mark looks right)
const PRODUCT_IDS = [
  7623581532258, // Monogram Tee
  7623581597794, // Vault Tee
  7623581728866, // Heavyweight Hoodie
  7623582023778, // Crewneck
  7623582089314, // Long Sleeve
  7623687864418, // Performance Polo
  7625765191778, // Monogram Tee in White
  7625765224546, // Vault Tee in White
  7625765257314, // Heavyweight Hoodie in White
  7625765290082, // Crewneck in White
  7625765322850, // Polo in White
  7625765355618, // Cropped Tee
  7625765388386, // Cropped Tee in White
  7625765421154, // Relaxed Tee
  7625765453922, // Relaxed Tee in White
  7625765486690, // Hoodie (women's)
  7625766699106  // Hoodie in White (women's)
];

// Angle priority for PRIMARY (position 1). First match in this list wins.
// Left/right 3-quarter view: chest mark prominent, no inside neck label visible.
// Back: panel only, hides neck label (but no chest mark — less ideal for primary).
// Front: shows neck label — demote to last position.
const ANGLE_PRIORITY = ["-left-", "-right-", "-back-", "-front-"];

function angleScore(filename: string): number {
  for (let i = 0; i < ANGLE_PRIORITY.length; i += 1) {
    if (filename.includes(ANGLE_PRIORITY[i])) return i;
  }
  return ANGLE_PRIORITY.length; // unknown angle, put last
}

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
  console.log(`[reorder] processing ${PRODUCT_IDS.length} chest_left products`);

  let reordered = 0;
  let skipped = 0;
  let failed = 0;

  for (const productId of PRODUCT_IDS) {
    try {
      const r = await shopifyRest<{ product: { title: string; images: Array<{ id: number; src: string; position: number }> } }>(
        creds,
        `/products/${productId}.json?fields=title,images`
      );
      const images = r.product.images;
      if (!images || images.length === 0) {
        console.log(`  — ${productId}  ${r.product.title}  (no images, skip)`);
        skipped += 1;
        continue;
      }
      if (images.length === 1) {
        console.log(`  — ${productId}  ${r.product.title}  (1 image only, can't reorder)`);
        skipped += 1;
        continue;
      }

      // Sort by angle priority. Build a new ordering: side/back angles first, front last.
      const sorted = [...images].sort((a, b) => {
        const fa = a.src.split("/").pop()?.split("?")[0] ?? "";
        const fb = b.src.split("/").pop()?.split("?")[0] ?? "";
        return angleScore(fa) - angleScore(fb);
      });

      // Check if reorder is needed (current position 1 isn't already the best angle)
      const currentPrimary = images.sort((a, b) => a.position - b.position)[0];
      const desiredPrimary = sorted[0];
      if (currentPrimary.id === desiredPrimary.id) {
        const fn = currentPrimary.src.split("/").pop()?.split("?")[0] ?? "";
        console.log(`  — ${productId}  ${r.product.title}  (primary already ${fn.match(/-(left|right|back|front)-/)?.[1] ?? "?"}, skip)`);
        skipped += 1;
        continue;
      }

      // Push new positions
      for (let i = 0; i < sorted.length; i += 1) {
        await shopifyRest(creds, `/products/${productId}/images/${sorted[i].id}.json`, {
          method: "PUT",
          body: JSON.stringify({ image: { id: sorted[i].id, position: i + 1 } })
        });
        await new Promise((r) => setTimeout(r, 200));
      }
      const newFn = sorted[0].src.split("/").pop()?.split("?")[0] ?? "";
      const angle = newFn.match(/-(left|right|back|front)-/)?.[1] ?? "?";
      console.log(`  ✓ ${productId}  ${r.product.title}  → primary now ${angle}-angle`);
      reordered += 1;
    } catch (e) {
      console.log(`  ✗ ${productId}  ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
      failed += 1;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n[reorder] ${reordered} reordered, ${skipped} skipped, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
