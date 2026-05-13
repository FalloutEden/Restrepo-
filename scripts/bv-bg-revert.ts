// Revert the bulk bv-bg-composite pass. For each active BV product, delete
// the `bv-<id>-on-bg.png` image from Shopify so the original Printful mockup
// (kept as backup at position 2) becomes primary again. Also drop the
// `bv-bg-composited` tag so the product reads as fresh.
//
// Dress (7644941418594) and Fanny Pack (7644942303330) are EXEMPT — those
// two composited cleanly on white-AOP fabric and we keep them.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-bg-revert.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const KEEP = new Set<number>([7644941418594, 7644942303330]); // Dress, Fanny

async function shopify<T>(c: ShopifyCredentials, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://${c.storeDomain}/admin/api/${c.apiVersion}${path}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${path} (${r.status}): ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function main() {
  const c = resolveShopifyCredentials(BRAND);
  const list = await shopify<{ products: Array<{ id: number; title: string; tags: string; images: Array<{ id: number; src: string }> }> }>(
    c,
    "/products.json?limit=250&fields=id,title,tags,images"
  );

  let reverted = 0;
  let kept = 0;
  for (const p of list.products) {
    if (KEEP.has(p.id)) {
      kept += 1;
      console.log(`  — ${p.id}  ${p.title}  (kept)`);
      continue;
    }
    const composites = (p.images ?? []).filter((img) => /bv-\d+-on-bg/.test(img.src));
    if (composites.length === 0) continue;
    for (const img of composites) {
      try {
        await shopify(c, `/products/${p.id}/images/${img.id}.json`, { method: "DELETE" });
      } catch (e) {
        console.log(`  ! failed to delete image on ${p.id}: ${e instanceof Error ? e.message : "?"}`);
      }
    }
    // Drop the bv-bg-composited tag
    const newTags = (p.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t !== "bv-bg-composited")
      .join(", ");
    try {
      await shopify(c, `/products/${p.id}.json`, {
        method: "PUT",
        body: JSON.stringify({ product: { id: p.id, tags: newTags } })
      });
    } catch {}
    console.log(`  ✓ ${p.id}  ${p.title}  (${composites.length} composite${composites.length > 1 ? "s" : ""} deleted)`);
    reverted += 1;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n[revert] ${reverted} reverted, ${kept} kept (Dress + Fanny)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
