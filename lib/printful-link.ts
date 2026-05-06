import "server-only";

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

// Re-link Printful sync_variant external_ids to the correct Shopify variant ids
// for a given brand.
//
// Why this exists: when a Shopify draft is created with size variants alongside
// a Printful sync product, the sync_variant.external_id field needs to equal
// String(shopify variant_id). Printful matches incoming orders against
// external_id, and the order-paid webhook hands String(line_items[].variant_id).
// If they don't match, orders silently fail to fulfill.
//
// This function sweeps every product on a brand's store, finds the Printful
// sync via the `printful-sync:<id>` tag, and patches any sync_variants whose
// external_id is wrong. Idempotent — already-correct entries are skipped.

const PF_BASE = "https://api.printful.com";

type ShopifyVariant = { id: number; option1?: string };
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
  product?: { size?: string };
  size?: string;
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
      const match = text.match(/(\d+)\s*seconds/i);
      const waitMs = match ? Math.min(120, Number(match[1]) + 5) * 1000 : 65000;
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }
    if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text}`);
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
  throw new Error(`Printful ${method} ${urlPath} exceeded 429 retry budget`);
}

export type RelinkSummary = {
  brand: string;
  totalProducts: number;
  updated: number;
  alreadyLinked: number;
  noPrintfulTag: number;
  errors: Array<{ title: string; message: string }>;
};

export async function relinkPrintfulVariants(brand: string): Promise<RelinkSummary> {
  const creds = resolveShopifyCredentials(brand);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    "/products.json?limit=250&fields=id,title,tags,status,variants",
    { method: "GET" }
  );
  const tagFilter = `brand:${creds.brandSlug}`;
  const products = list.products.filter((p) => (p.tags ?? "").split(",").some((t) => t.trim() === tagFilter));

  const summary: RelinkSummary = {
    brand: creds.brandSlug,
    totalProducts: products.length,
    updated: 0,
    alreadyLinked: 0,
    noPrintfulTag: 0,
    errors: []
  };

  for (const product of products) {
    const tags = (product.tags ?? "").split(",").map((t) => t.trim());
    const syncTag = tags.find((t) => /^printful-sync:\d+$/.test(t));
    if (!syncTag) {
      summary.noPrintfulTag += 1;
      continue;
    }
    const syncProductId = Number(syncTag.split(":")[1]);

    let detail: { result?: { sync_variants?: PrintfulSyncVariant[] } };
    try {
      detail = await pfFetch("GET", `/store/products/${syncProductId}`);
    } catch (e) {
      summary.errors.push({ title: product.title, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const syncVariants = detail.result?.sync_variants ?? [];

    const sizeToShopifyId: Record<string, number> = {};
    for (const sv of product.variants) {
      const size = (sv.option1 ?? "").trim().toUpperCase();
      if (size) sizeToShopifyId[size] = sv.id;
    }

    const updates: Array<{ id: number; external_id: string; variant_id: number; retail_price: string }> = [];
    let alreadyOk = 0;
    for (const sv of syncVariants) {
      const size = (sv.size ?? sv.product?.size ?? "").toUpperCase();
      if (!size) continue;
      const shopifyId = sizeToShopifyId[size];
      if (!shopifyId) continue;
      const desired = String(shopifyId);
      if (sv.external_id === desired) {
        alreadyOk += 1;
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
      summary.alreadyLinked += 1;
      continue;
    }

    try {
      await pfFetch("PUT", `/store/products/${syncProductId}`, { sync_variants: updates });
      summary.updated += 1;
    } catch (e) {
      summary.errors.push({ title: product.title, message: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return summary;
}
