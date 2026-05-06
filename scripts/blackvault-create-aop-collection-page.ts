// Create a Shopify Smart Collection that auto-includes every BV product
// tagged "all-over-print" — so the new AOP drop gets a dedicated landing
// page (e.g. /collections/the-aop-capsule) and shows up in the storefront's
// collection list.
//
// Idempotent: if a smart collection with the same handle exists, updates
// it in place.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-create-aop-collection-page.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

const COLLECTION = {
  handle: "the-aop-capsule",
  title: "The AOP Capsule",
  body_html: `
<p>The pattern collection. Heavyweight polyester, cut and sewn so the BV monogram tiles unbroken from front to back to sleeve.</p>
<p>Polo, bomber, hoodie, sweatshirt, jersey, and tees — designed as a single drop where every piece reads at twenty paces.</p>
<p><em>Reserved for those who notice.</em></p>
`.trim(),
  rules: [{ column: "tag", relation: "equals", condition: "all-over-print" }],
  disjunctive: false,
  published: true
};

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

async function main() {
  const creds = resolveShopifyCredentials(BRAND);

  // Look up existing smart collections
  const list = await shopifyRest<{
    smart_collections: Array<{ id: number; handle: string }>;
  }>(creds, `/smart_collections.json?handle=${COLLECTION.handle}&limit=10`, { method: "GET" });
  const existing = list.smart_collections.find((c) => c.handle === COLLECTION.handle);

  if (existing) {
    await shopifyRest(creds, `/smart_collections/${existing.id}.json`, {
      method: "PUT",
      body: JSON.stringify({ smart_collection: { id: existing.id, ...COLLECTION } })
    });
    console.log(`✓ Updated existing collection: ${COLLECTION.title} (id=${existing.id})`);
    console.log(`  https://${creds.storeDomain}/collections/${COLLECTION.handle}`);
  } else {
    const created = await shopifyRest<{ smart_collection: { id: number; handle: string } }>(
      creds,
      `/smart_collections.json`,
      {
        method: "POST",
        body: JSON.stringify({ smart_collection: COLLECTION })
      }
    );
    console.log(`✓ Created collection: ${COLLECTION.title} (id=${created.smart_collection.id})`);
    console.log(`  https://${creds.storeDomain}/collections/${created.smart_collection.handle}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
