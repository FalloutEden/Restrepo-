// Fix the existing AOP Hoodie Printful sync product so it does NOT have
// print on the pocket and hood placements — those small zones force the
// alloverme pattern to crop mid-monogram, which the merchant flagged as
// "BV getting cut off at the pocket."
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-fix-hoodie-placements.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
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

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: Array<{ id: number; title: string; tags: string }> }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags`,
    { method: "GET" }
  );
  const hoodie = list.products.find((p) => p.title === "The AOP Hoodie — Unisex");
  if (!hoodie) throw new Error("Hoodie product not found");
  const syncTag = hoodie.tags.split(",").map((t) => t.trim()).find((t) => /^printful-sync:\d+$/.test(t));
  if (!syncTag) throw new Error("No printful-sync tag");
  const syncProductId = Number(syncTag.split(":")[1]);
  console.log(`[init] hoodie sync_product_id=${syncProductId}`);

  // Pull current variants — we want to keep the existing front/back/sleeve
  // file URLs but drop the pocket and hood entries.
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants = detail.result?.sync_variants ?? [];

  const KEEP_PLACEMENTS = new Set(["front", "back", "sleeve_left", "sleeve_right"]);
  const updates = variants.map((v: {
    id: number;
    retail_price: string;
    files?: Array<{ type?: string; url?: string }>;
  }) => {
    const filtered = (v.files ?? []).filter((f) => f.type && KEEP_PLACEMENTS.has(f.type));
    return {
      id: v.id,
      retail_price: v.retail_price,
      files: filtered.map((f) => ({ type: f.type!, url: f.url! }))
    };
  });

  console.log(`[fix] PUTting ${updates.length} variants with pocket+hood removed…`);
  await pfFetch("PUT", `/store/products/${syncProductId}`, { sync_variants: updates });
  console.log(`✓ Hoodie updated. Mockup will re-render in ~1-2 minutes.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
