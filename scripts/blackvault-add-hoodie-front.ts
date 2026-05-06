// Add the missing `front` placement file to the AOP Hoodie sync product.
// During original sync creation Printful silently dropped the front file
// (cause unclear; suspect a transient rejection). Backfilling here.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-add-hoodie-front.ts

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET" | "PUT", urlPath: string, body?: unknown) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
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
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  resolveShopifyCredentials("black-vault-apparel"); // sanity: env vars present
  const syncProductId = 431309286;
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants = detail.result?.sync_variants ?? [];

  // Pull the alloverme URL from any existing back placement
  const sample = variants[0];
  const backFile = (sample?.files ?? []).find((f: { type?: string; url?: string }) => f.type === "back");
  if (!backFile?.url) throw new Error("No existing back file to clone URL from");
  const alloverUrl = backFile.url;
  console.log(`[init] alloverme URL: ${alloverUrl.slice(-60)}`);

  // Re-PUT each variant with the full set of files, including front
  const updates = variants.map((v: { id: number; retail_price: string }) => ({
    id: v.id,
    retail_price: v.retail_price,
    files: [
      { type: "front", url: alloverUrl },
      { type: "back", url: alloverUrl },
      { type: "sleeve_left", url: alloverUrl },
      { type: "sleeve_right", url: alloverUrl }
    ]
  }));
  console.log(`[fix] PUTting ${updates.length} variants with all 4 placements…`);
  await pfFetch("PUT", `/store/products/${syncProductId}`, { sync_variants: updates });
  console.log(`✓ Hoodie front placement added. Mockup will re-render in ~1-2 min.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
