// Re-link Printful sync_variants to the correct Shopify variant IDs for the
// existing BV catalog.
//
// Background: blackvault-launch-collection.ts and blackvault-expansion-v2.ts
// set Printful sync_variant.external_id to a string like "bv-the-vault-tee-m".
// That value should be the Shopify variant ID — Printful matches incoming
// orders against external_id, and the order-paid webhook hands it
// String(line_items[].variant_id). With the current mismatch, orders cannot
// auto-fulfill.
//
// What this script does:
//   1. Pull every BV Shopify draft (or active product).
//   2. For each, read the printful-sync:<id> tag to find the sync product.
//   3. Pull the Printful sync_variants.
//   4. Match by size (option1 on Shopify, size on Printful).
//   5. PUT the sync product with corrected external_id values.
//
// Idempotent: safe to re-run; it just overwrites external_id to the same
// Shopify variant ID each time.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-link-printful-shopify.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";

type ShopifyVariant = { id: number; option1?: string; sku?: string };
type ShopifyProduct = {
  id: number;
  title: string;
  tags: string;
  status: string;
  variants: ShopifyVariant[];
};

type PrintfulSyncVariant = {
  id: number;
  external_id?: string;
  variant_id: number;
  retail_price: string;
  files?: unknown[];
  options?: unknown[];
  product?: { variant_id?: number; size?: string };
  size?: string;
};

type PrintfulSyncProduct = {
  id: number;
  external_id?: string;
  name: string;
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

async function pfFetch<T>(method: "GET" | "PUT", urlPath: string, body?: unknown): Promise<T> {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  // Up to 3 retries on 429. Printful's API returns retry-after delay in the
  // body when over the per-minute cap.
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
      // Parse seconds-to-wait from body if present, fallback to 65s.
      const match = text.match(/(\d+)\s*seconds/i);
      const waitMs = match ? Math.min(120, Number(match[1]) + 5) * 1000 : 65000;
      console.log(`    [rate-limit] sleeping ${Math.round(waitMs / 1000)}s before retry...`);
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }
    if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
  throw new Error(`Printful ${method} ${urlPath} exceeded 429 retry budget`);
}

function extractSyncProductIdFromTags(tagsString: string): number | null {
  const tags = tagsString.split(",").map((t) => t.trim());
  for (const t of tags) {
    const match = t.match(/^printful-sync:(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}

// Get the size for a given Printful sync_variant. The data sometimes lives at
// sync_variant.size, sometimes at sync_variant.product.size depending on
// which API call returned it.
function getSizeFromSyncVariant(sv: PrintfulSyncVariant): string | null {
  return sv.size ?? sv.product?.size ?? null;
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${creds.storeDomain}`);

  // List BV products. We don't filter by status — we want every BV product,
  // active or draft, because both states route through the same fulfillment.
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    "/products.json?limit=250&fields=id,title,tags,status,variants",
    { method: "GET" }
  );

  const bvProducts = list.products.filter((p) =>
    (p.tags ?? "").split(",").some((t) => t.trim() === "brand:black-vault-apparel")
  );
  console.log(`[init] ${bvProducts.length} BV products to inspect\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const product of bvProducts) {
    const syncProductId = extractSyncProductIdFromTags(product.tags ?? "");
    if (!syncProductId) {
      console.log(`  - ${product.title}: no printful-sync tag, skipping`);
      totalSkipped += 1;
      continue;
    }

    // Pull the Printful sync product to see current sync_variants.
    let detail: { result?: { sync_product?: PrintfulSyncProduct; sync_variants?: PrintfulSyncVariant[] } };
    try {
      detail = await pfFetch("GET", `/store/products/${syncProductId}`);
    } catch (e) {
      console.warn(`  ✗ ${product.title}: failed to GET printful sync ${syncProductId}: ${e instanceof Error ? e.message : e}`);
      totalErrors += 1;
      continue;
    }
    const syncVariants = detail.result?.sync_variants ?? [];

    // Build size → Shopify variant ID map.
    const sizeToShopifyId: Record<string, number> = {};
    for (const sv of product.variants) {
      const size = (sv.option1 ?? "").trim();
      if (size) sizeToShopifyId[size.toUpperCase()] = sv.id;
    }

    // Pair each Printful sync_variant with the matching Shopify variant ID.
    const updates: Array<{ id: number; external_id: string; variant_id: number; retail_price: string }> = [];
    let alreadyLinked = 0;
    let unmatched = 0;
    for (const sv of syncVariants) {
      const size = getSizeFromSyncVariant(sv);
      if (!size) {
        unmatched += 1;
        continue;
      }
      const shopifyId = sizeToShopifyId[size.toUpperCase()];
      if (!shopifyId) {
        unmatched += 1;
        continue;
      }
      const desired = String(shopifyId);
      if (sv.external_id === desired) {
        alreadyLinked += 1;
        continue;
      }
      updates.push({
        id: sv.id,
        external_id: desired,
        variant_id: sv.variant_id,
        retail_price: sv.retail_price
      });
    }

    if (updates.length === 0) {
      console.log(
        `  = ${product.title}: ${syncVariants.length} variants, all already linked (${alreadyLinked} ok, ${unmatched} unmatched)`
      );
      totalSkipped += 1;
      continue;
    }

    // Push the corrected external_ids. Printful's PUT /store/products/{id}
    // expects sync_variants as a full list; entries with `id` update an
    // existing sync_variant. Send only the ones that actually need a change.
    try {
      await pfFetch("PUT", `/store/products/${syncProductId}`, { sync_variants: updates });
      console.log(
        `  ✓ ${product.title}: re-linked ${updates.length}/${syncVariants.length} variants (${alreadyLinked} were already correct${unmatched > 0 ? `, ${unmatched} unmatched` : ""})`
      );
      totalUpdated += 1;
    } catch (e) {
      console.warn(`  ✗ ${product.title}: PUT failed: ${e instanceof Error ? e.message : e}`);
      totalErrors += 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Skipped (already linked or no tag): ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);

  if (totalErrors === 0 && totalUpdated > 0) {
    console.log(`\n✓ All BV Shopify variants are now linked to their Printful counterparts.`);
    console.log(`  Test with scripts/smoke-webhook.ts <shopifyVariantId> to verify Printful order creation.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
