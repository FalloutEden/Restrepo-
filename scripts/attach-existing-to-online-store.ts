// Retrofit: attach every existing product (across configured brands, or one
// brand) to the Online Store sales-channel publication.
//
// Why: drafts created before today's update were not pre-attached to the
// Online Store publication. Without this attachment, flipping a draft to
// "active" in Shopify admin leaves it off the storefront — the merchant has
// to also tick the Online Store sales-channel checkbox manually. This script
// does that tick once for every product, in bulk, so going forward the only
// action is status=draft → status=active.
//
// Idempotent: re-attaching is a no-op on Shopify's side.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/attach-existing-to-online-store.ts [--brand=<slug>]

import { listConfiguredShopifyCredentials, resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { attachProductToOnlineStore } from "@/lib/shopify-service";

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify GET ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function processStore(creds: ShopifyCredentials) {
  console.log(`\n=== ${creds.brandName} (${creds.storeDomain}) ===`);
  const data = await shopifyRest<{ products: Array<{ id: number; title: string; status: string }> }>(
    creds,
    "/products.json?limit=250&fields=id,title,status"
  );
  console.log(`  ${data.products.length} product(s) to attach`);
  let ok = 0;
  let fail = 0;
  for (const p of data.products) {
    try {
      await attachProductToOnlineStore(p.id, creds.brandSlug);
      ok += 1;
    } catch (e) {
      console.warn(`  ✗ ${p.title} (${p.id}): ${e instanceof Error ? e.message : e}`);
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`  ✓ attached ${ok}, failed ${fail}`);
}

async function main() {
  const brandArg = process.argv.slice(2).find((a) => a.startsWith("--brand="))?.slice(8);
  const credsList = brandArg
    ? [resolveShopifyCredentials(brandArg)]
    : listConfiguredShopifyCredentials();
  if (credsList.length === 0) throw new Error("No configured Shopify credentials found");
  for (const creds of credsList) {
    await processStore(creds);
  }
  console.log("\nDone. From now on, flipping a draft to active in admin will land it on Online Store with no extra step.");
}

main().catch((e) => { console.error(e); process.exit(1); });
