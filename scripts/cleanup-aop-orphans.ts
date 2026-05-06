// Quick cleanup of the 4 orphan AOP drafts created during the failed first
// run of blackvault-aop-collection.ts (bomber, hoodie, sweatshirt, jersey).
// Their Printful sync_variants have external_id = "bv-the-aop-...-XS" instead
// of the Shopify variant id, so the order webhook would NOT auto-fulfill them.
// Easier to delete and let the fixed rerun produce clean ones.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/cleanup-aop-orphans.ts

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const orphans = [
  { slug: "the-aop-bomber",     shopifyId: 7628499910754, syncId: 431308888 },
  { slug: "the-aop-hoodie",     shopifyId: 7628500107362, syncId: 431308902 },
  { slug: "the-aop-sweatshirt", shopifyId: 7628500238434, syncId: 431308936 },
  { slug: "the-aop-jersey",     shopifyId: 7628500369506, syncId: 431308955 }
];

async function main() {
  const creds = resolveShopifyCredentials("black-vault-apparel");
  const pfToken = process.env.PRINTFUL_API_KEY?.trim();
  const pfStoreId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!pfToken || !pfStoreId) throw new Error("Missing Printful credentials");

  for (const o of orphans) {
    console.log(`\n[${o.slug}]`);
    // Shopify
    try {
      const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/products/${o.shopifyId}.json`, {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" }
      });
      console.log(`  Shopify product ${o.shopifyId} → ${r.status}`);
    } catch (e) {
      console.warn(`  Shopify delete failed: ${e instanceof Error ? e.message : e}`);
    }
    // Printful
    try {
      const r = await fetch(`https://api.printful.com/store/products/${o.syncId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${pfToken}`, "X-PF-Store-Id": pfStoreId }
      });
      console.log(`  Printful sync ${o.syncId} → ${r.status}`);
    } catch (e) {
      console.warn(`  Printful delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log("\nDone. Now safe to re-run scripts/blackvault-aop-collection.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
