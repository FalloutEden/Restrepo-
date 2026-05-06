// For each BV AOP product, collect every distinct preview_url that Printful
// rendered across all sync_variants × all files (i.e. one per placement —
// front, back, sleeves), then attach each as a separate Shopify product
// image. Result: each AOP draft gets multiple angles instead of just one
// flat-lay.
//
// Idempotent: removes any previously-attached printful preview images
// before adding the fresh batch, so re-runs converge instead of accumulating.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-attach-all-aop-previews.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET", urlPath: string) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
  const r = await fetch(`${PF_BASE}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "X-PF-Store-Id": storeId }
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

type ShopifyProduct = {
  id: number;
  title: string;
  tags: string;
  images: Array<{ id: number; src: string; position: number }>;
};

type SyncVariant = {
  id: number;
  files?: Array<{ type?: string; preview_url?: string; thumbnail_url?: string }>;
  product?: { image?: string };
};

// Order placements so front comes first, then back, then sleeves — for a
// nicer carousel default order on the storefront.
const PLACEMENT_ORDER = [
  "default",       // crew tees use this
  "front",         // polo, bomber, hoodie, sweatshirt, jersey
  "back",
  "sleeve_left",
  "sleeve_right",
  "preview"        // catch-all final
];

function placementSortKey(t: string | undefined): number {
  if (!t) return 999;
  const idx = PLACEMENT_ORDER.indexOf(t);
  return idx === -1 ? 998 : idx;
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: ShopifyProduct[] }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags,images`,
    { method: "GET" }
  );
  const aop = list.products.filter((p) => {
    const tags = (p.tags ?? "").split(",").map((t) => t.trim());
    return tags.includes("all-over-print") && tags.some((t) => /^printful-sync:\d+$/.test(t));
  });
  console.log(`[init] ${aop.length} AOP product(s)`);

  for (const product of aop) {
    const syncTag = product.tags.split(",").map((t) => t.trim()).find((t) => /^printful-sync:\d+$/.test(t));
    if (!syncTag) continue;
    const syncProductId = Number(syncTag.split(":")[1]);
    console.log(`\n[${product.title}] sync=${syncProductId}`);

    const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
    const variants: SyncVariant[] = detail.result?.sync_variants ?? [];

    // Collect: one preview per (placement) — pick the first variant's
    // preview for each placement type since they're identical across sizes.
    const seen = new Set<string>();
    const collected: Array<{ placement: string; url: string }> = [];
    if (variants.length > 0) {
      const firstVariant = variants[0];
      for (const f of (firstVariant.files ?? [])) {
        const url = f.preview_url ?? f.thumbnail_url;
        if (!url || !f.type) continue;
        // Filter out the input artwork (sync uploads land on cdn.shopify.com),
        // keep only the rendered Printful previews on files.cdn.printful.com.
        if (!/files\.cdn\.printful\.com/.test(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        collected.push({ placement: f.type, url });
      }
    }

    if (collected.length === 0) {
      console.log(`  no rendered previews found yet — try again in 1-2 minutes`);
      continue;
    }
    collected.sort((a, b) => placementSortKey(a.placement) - placementSortKey(b.placement));
    console.log(`  ${collected.length} rendered preview(s): ${collected.map((c) => c.placement).join(", ")}`);

    // Drop any existing printful preview images (which Shopify mirrors to its
    // own CDN once attached). Filename always contains `_preview.png` for
    // Printful-rendered mockups, so use that as the marker regardless of
    // whether the URL is on files.cdn.printful.com or cdn.shopify.com.
    for (const img of product.images) {
      if (/_preview/.test(img.src) || /cdn\.shopify\.com.*bv-aop-(front|all|polo)/i.test(img.src)) {
        try {
          await shopifyRest(creds, `/products/${product.id}/images/${img.id}.json`, { method: "DELETE" });
        } catch {}
      }
    }

    // Attach each preview, in placement order
    let position = 1;
    for (const { url } of collected) {
      try {
        await shopifyRest(creds, `/products/${product.id}/images.json`, {
          method: "POST",
          body: JSON.stringify({ image: { src: url, alt: product.title, position } })
        });
        position += 1;
      } catch (e) {
        console.warn(`    ✗ attach ${url}: ${e instanceof Error ? e.message : e}`);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    console.log(`  ✓ attached ${position - 1} preview(s)`);
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`\nDone.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
