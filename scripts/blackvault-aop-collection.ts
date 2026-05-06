// Materialize Black Vault Apparel's all-over-print (AOP) collection using
// the merchant's hand-designed pattern files:
//
//   .openclaw/brand/BV Allover the front of me.png  →  STAR centered at
//     placket. Used on the FRONT of collared garments only (polo, bomber).
//   .openclaw/brand/BV Alloverme.png                →  Full repeating tile.
//     Used everywhere else (back, sleeves, full-tile non-collared garments).
//
// Outputs: Printful sync products + matching Shopify drafts pre-attached to
// the Online Store sales channel publication. Idempotent on artwork — re-
// running creates new sync/draft pairs each time; clean prior drafts via
// scripts/store-cleanup.ts.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-aop-collection.ts [--only=<slug,slug,...>]
//
// Examples:
//   ./blackvault-aop-collection.ts --only=mens-polo,bomber-jacket
//   ./blackvault-aop-collection.ts                  (builds the full set)

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const FRONT_PATTERN_PATH = path.join(BRAND_DIR, "BV Allover the front of me.png");
const ALL_PATTERN_PATH = path.join(BRAND_DIR, "BV Alloverme.png");

const PF_BASE = "https://api.printful.com";

// ── Catalog mapping ─────────────────────────────────────────────────────────
//
// Each item declares its placements and which pattern goes on each. Collared
// items get the star-centered pattern on FRONT; everything else is full tile.

type Item = {
  slug: string;
  name: string;
  catalogId: number;
  retailPrice: string;
  productType: string;
  description: string;
  // Per-placement file: which of the two pattern files to send.
  // Keys are Printful placement names (front, back, sleeve_left, etc.)
  placements: Record<string, "front" | "all">;
};

// Note on catalog IDs (verified against .openclaw/printful-catalog-v2.json):
//   791  = Men's All-Over Print Slim Fit Polo Shirt (only AOP polo Printful sells)
//   390  = All-Over Print Unisex Bomber Jacket
//   388  = All-Over Print Recycled Unisex Hoodie
//   320  = All-Over Print Recycled Unisex Sweatshirt
//   835  = All-Over Print Premium Basketball Jersey
//   257  = All-Over Print Men's Crew Neck T-Shirt
//   261  = All-Over Print Women's Crew Neck T-Shirt
//
// There is NO women's AOP polo in Printful's catalog as of this writing.

const ITEMS: Item[] = [
  {
    slug: "the-aop-polo-mens",
    name: "The AOP Polo — Men's",
    catalogId: 791,
    retailPrice: "98.00",
    productType: "Polo",
    description: "<p>A men's all-over-print slim-fit polo. The BV monogram + 4-point star pattern tiles edge to edge across the body, with a single star centered at the placket — the buttons become the design's anchor, not its interruption.</p><p>Smooth color-locked polyester. Ribbed collar. Cut-sewn so the print continues unbroken across panel seams.</p><p>Built to be Kept.</p>",
    placements: { front: "front", back: "all", sleeve_left: "all", sleeve_right: "all" }
  },
  {
    slug: "the-aop-bomber",
    name: "The AOP Bomber — Unisex",
    catalogId: 390,
    retailPrice: "185.00",
    productType: "Jacket",
    description: "<p>A unisex all-over-print bomber jacket. The BV monogram + star grid covers every panel — front, back, sleeves — running the full repeating tile across every plane of the garment.</p><p>Lightweight, color-locked polyester shell. Ribbed cuffs and hem. Anchor piece of the AOP capsule.</p><p>Built to be Kept.</p>",
    // Bomber zips at the centerline rather than buttons — full repeating tile
    // works better than the placket-star pattern (which is polo-specific).
    placements: { front: "all", back: "all", sleeve_left: "all", sleeve_right: "all" }
  },
  {
    slug: "the-aop-hoodie",
    name: "The AOP Hoodie — Unisex",
    catalogId: 388,
    retailPrice: "148.00",
    productType: "Hoodie",
    description: "<p>A unisex all-over-print pullover hoodie. The BV monogram + star pattern runs across the body and sleeves; pocket and hood remain solid color so the pattern reads cleanly without seam-edge cutoffs.</p><p>Recycled polyester sustainable fleece. Drawcord hood. Front kangaroo pocket.</p><p>Built to be Kept.</p>",
    // Skip pocket + hood placements — those small print zones force the
    // pattern to crop awkwardly mid-monogram. Body + sleeves only.
    placements: { front: "all", back: "all", sleeve_left: "all", sleeve_right: "all" }
  },
  {
    slug: "the-aop-sweatshirt",
    name: "The AOP Sweatshirt — Unisex",
    catalogId: 320,
    retailPrice: "128.00",
    productType: "Sweatshirt",
    description: "<p>A unisex all-over-print crew sweatshirt. Pullover construction, no placket — the BV monogram + star pattern tiles edge to edge across every panel.</p><p>Recycled polyester sustainable fleece. Ribbed cuffs and hem. Built to layer.</p><p>Built to be Kept.</p>",
    placements: { front: "all", back: "all", sleeve_left: "all", sleeve_right: "all" }
  },
  {
    slug: "the-aop-jersey",
    name: "The AOP Jersey — Unisex",
    catalogId: 835,
    retailPrice: "88.00",
    productType: "Jersey",
    description: "<p>A premium all-over-print basketball jersey. Sleeveless cut, mesh-feel polyester, the BV monogram + star pattern tiling across both panels.</p><p>Loose drape. Lifestyle athletic — not court-spec, but cut to be worn. Built for warm-weather wear and recognition at twenty paces.</p><p>Built to be Kept.</p>",
    placements: { front: "all", back: "all" }
  },
  {
    slug: "the-aop-tee-mens",
    name: "The AOP Tee — Men's",
    catalogId: 257,
    retailPrice: "78.00",
    productType: "T-Shirt",
    description: "<p>A men's all-over-print crew tee. The BV monogram + star pattern tiles edge to edge — front, back, sleeves — printed into the fabric before the panels are cut and sewn.</p><p>Smooth color-locked polyester. Crew neck. Cut-sewn so the print continues uninterrupted across every plane.</p><p>Built to be Kept.</p>",
    // Crew tees use Printful's `default` placement for the front (not `front`)
    placements: { default: "all", back: "all", sleeve_left: "all", sleeve_right: "all" }
  },
  {
    slug: "the-aop-tee-womens",
    name: "The AOP Tee — Women's",
    catalogId: 261,
    retailPrice: "78.00",
    productType: "T-Shirt",
    description: "<p>A women's all-over-print crew tee. Tailored fit, smooth color-locked polyester, the BV monogram + star pattern running edge to edge across every panel.</p><p>Crew neck. Cut-sewn. The print never breaks at the seam.</p><p>Built to be Kept.</p>",
    placements: { default: "all", back: "all", sleeve_left: "all", sleeve_right: "all" }
  }
];

// ── Printful + Shopify helpers ──────────────────────────────────────────────

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  return { token, storeId };
}

async function pfGet(p: string, includeStoreId = false) {
  const { token, storeId } = ensurePrintful();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // /store/* endpoints require the store id header even on GET. /products/*
  // (catalog endpoints) do not.
  if (includeStoreId || p.startsWith("/store/")) headers["X-PF-Store-Id"] = storeId;
  const r = await fetch(`${PF_BASE}${p}`, { headers });
  if (!r.ok) throw new Error(`Printful GET ${p} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function pfFetch(method: "POST" | "PUT", p: string, body: unknown) {
  const { token, storeId } = ensurePrintful();
  const r = await fetch(`${PF_BASE}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful ${method} ${p} (${r.status}): ${text}`);
  return JSON.parse(text);
}

async function pfPost(p: string, body: unknown) { return pfFetch("POST", p, body); }
async function pfPut(p: string, body: unknown) { return pfFetch("PUT", p, body); }

type PfVariant = { id: number; size: string; color: string };

async function getSizeVariants(catalogId: number, preferColor = "White"): Promise<PfVariant[]> {
  const data = await pfGet(`/products/${catalogId}`);
  const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const variants = (data.result?.variants ?? []) as PfVariant[];
  const filtered = variants.filter((v) => order.includes((v.size || "").toUpperCase()));

  // Some AOP products (e.g. polo 791) come in multiple base colors. The
  // merchant's pattern is designed for a single base, so dedupe by size
  // preferring the requested color, falling back to whatever's available.
  const bySize = new Map<string, PfVariant>();
  for (const v of filtered) {
    const size = v.size.toUpperCase();
    const existing = bySize.get(size);
    if (!existing) bySize.set(size, v);
    else if (existing.color !== preferColor && v.color === preferColor) bySize.set(size, v);
  }
  return Array.from(bySize.values()).sort(
    (a, b) => order.indexOf(a.size.toUpperCase()) - order.indexOf(b.size.toUpperCase())
  );
}

type ShopifyCreds = { storeDomain: string; apiVersion: string; token: string };

async function shopifyRest<T>(creds: ShopifyCreds, endpoint: string, init: RequestInit): Promise<T> {
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

async function shopifyGraphQL<T>(creds: ShopifyCreds, query: string, variables: Record<string, unknown>) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed: { data?: T; errors?: unknown } = text ? JSON.parse(text) : {};
  if (!r.ok || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    throw new Error(`Shopify GraphQL (${r.status}): ${text}`);
  }
  return parsed.data as T;
}

async function uploadPatternToShopifyFiles(creds: ShopifyCreds, filePath: string, label: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const filename = `bv-aop-${label}-${Date.now()}.png`;
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
    };
  }>(creds, `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { message }
    }
  }`, {
    input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }]
  });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("Staged upload returned no target");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Staged POST failed (${upload.status})`);

  const fileData = await shopifyGraphQL<{
    fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }>; userErrors: Array<{ message: string }> };
  }>(creds, `mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { ... on MediaImage { id image { url } } ... on GenericFile { id url } }
      userErrors { message }
    }
  }`, {
    files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }]
  });
  const file = fileData.fileCreate.files[0];
  if (!file?.id) throw new Error("fileCreate returned no file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    try {
      const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds,
        `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
        { id: file.id });
      url = polled.node?.url ?? polled.node?.image?.url ?? "";
    } catch {}
  }
  if (!url) throw new Error("Shopify never returned a URL for the AOP pattern");
  return url;
}

// ── Materialize one AOP item ────────────────────────────────────────────────

type PatternUrls = { front: string; all: string };

async function materialize(item: Item, patterns: PatternUrls, shopifyCreds: ShopifyCreds) {
  console.log(`\n[${item.slug}] starting (catalog ${item.catalogId})…`);
  const sizes = await getSizeVariants(item.catalogId);
  if (!sizes.length) throw new Error(`No size variants for catalog ${item.catalogId}`);
  console.log(`[${item.slug}] sizes=${sizes.map((s) => s.size).join(",")}`);

  // Build the per-variant files array. Each placement gets the right pattern.
  const filesForVariant = Object.entries(item.placements).map(([placement, which]) => ({
    type: placement,
    url: which === "front" ? patterns.front : patterns.all
  }));

  const syncVariants = sizes.map((sv) => ({
    external_id: `bv-${item.slug}-${sv.size}`,
    variant_id: sv.id,
    retail_price: item.retailPrice,
    files: filesForVariant
  }));

  const syncResp = await pfPost("/store/products", {
    sync_product: {
      external_id: `bv-${item.slug}`,
      name: item.name,
      thumbnail: patterns.all
    },
    sync_variants: syncVariants
  });
  const syncProductId = syncResp.result?.id as number;
  if (!syncProductId) throw new Error("No sync product id returned");
  console.log(`[${item.slug}] printful sync=${syncProductId}`);

  const sizeNames = sizes.map((s) => s.size);
  const productPayload = {
    title: item.name,
    body_html: item.description,
    vendor: "Black Vault Apparel",
    product_type: item.productType,
    status: "draft",
    tags: [
      "autonomous-product",
      "agent-materialized",
      "brand:black-vault-apparel",
      "fulfillment:printful",
      "all-over-print",
      `printful-sync:${syncProductId}`
    ],
    options: [{ name: "Size", values: sizeNames }],
    variants: sizeNames.map((size) => ({
      option1: size,
      price: item.retailPrice,
      sku: `BV-${item.slug.toUpperCase()}-${size}`
    }))
  };
  const created = await shopifyRest<{ product?: { id: number; handle?: string } }>(shopifyCreds, "/products.json", {
    method: "POST",
    body: JSON.stringify({ product: productPayload })
  });
  const shopifyProductId = created.product?.id;
  if (!shopifyProductId) throw new Error("Shopify product creation returned no id");
  console.log(`[${item.slug}] shopify draft=${shopifyProductId}`);

  // Re-link sync_variants so external_id = String(shopify variant_id).
  // Required for the order-paid webhook to route fulfillment correctly.
  const detailWithVariants = await shopifyRest<{
    product: { variants: Array<{ id: number; option1: string }> };
  }>(shopifyCreds, `/products/${shopifyProductId}.json?fields=id,variants`, { method: "GET" });
  const sizeToShopifyId: Record<string, number> = {};
  for (const v of detailWithVariants.product.variants) {
    const size = v.option1?.toUpperCase?.() ?? "";
    if (size) sizeToShopifyId[size] = v.id;
  }

  const syncDetail = await pfGet(`/store/products/${syncProductId}`);
  const syncVariantsResp = (syncDetail.result?.sync_variants ?? []) as Array<{ id: number; size?: string; product?: { size?: string }; retail_price: string }>;
  const updates = syncVariantsResp.map((sv) => {
    const size = (sv.size ?? sv.product?.size ?? "").toUpperCase();
    const shopifyVariantId = sizeToShopifyId[size];
    return shopifyVariantId
      ? { id: sv.id, external_id: String(shopifyVariantId), retail_price: sv.retail_price }
      : null;
  }).filter((u): u is { id: number; external_id: string; retail_price: string } => Boolean(u));

  if (updates.length > 0) {
    // Update endpoint is PUT, not POST — POST creates a new sync product.
    await pfPut(`/store/products/${syncProductId}`, { sync_variants: updates });
    console.log(`[${item.slug}] re-linked ${updates.length} sync_variants to Shopify variant ids`);
  }

  // Note: drafts can't be pre-attached to Online Store without the
  // write_publications scope. Publish via scripts/store-cleanup.ts when
  // ready — that handles status=active + Online Store in one shot.

  return { slug: item.slug, shopifyProductId, syncProductId };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  for (const p of [FRONT_PATTERN_PATH, ALL_PATTERN_PATH]) {
    if (!fs.existsSync(p)) throw new Error(`Pattern file missing: ${p}`);
  }

  const onlyArg = process.argv.slice(2).find((a) => a.startsWith("--only="))?.slice(7);
  const onlySet = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
  const items = onlySet ? ITEMS.filter((i) => onlySet.has(i.slug)) : ITEMS;
  if (items.length === 0) {
    console.error(`No items matched --only="${onlyArg}". Valid slugs: ${ITEMS.map((i) => i.slug).join(", ")}`);
    process.exit(1);
  }

  const shopifyCreds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${shopifyCreds.storeDomain}`);
  console.log(`[init] building ${items.length} item(s): ${items.map((i) => i.slug).join(", ")}\n`);

  console.log(`[init] uploading patterns to Shopify Files…`);
  const frontUrl = await uploadPatternToShopifyFiles(shopifyCreds, FRONT_PATTERN_PATH, "front");
  const allUrl = await uploadPatternToShopifyFiles(shopifyCreds, ALL_PATTERN_PATH, "all");
  console.log(`[init] front (placket-star) → ${frontUrl}`);
  console.log(`[init] all   (full tile)    → ${allUrl}`);
  const patterns: PatternUrls = { front: frontUrl, all: allUrl };

  const results: Array<{ slug: string; shopifyProductId?: number; syncProductId?: number; error?: string }> = [];
  for (const item of items) {
    try {
      const r = await materialize(item, patterns, shopifyCreds);
      results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  ✗ ${item.slug}: ${msg}`);
      results.push({ slug: item.slug, error: msg });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  const outPath = path.join(BRAND_DIR, "aop-collection-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Created: ${results.filter((r) => r.shopifyProductId).length}/${results.length}`);
  console.log(`Results saved to ${outPath}`);
  console.log("\nNext steps:");
  console.log(" 1. Wait ~2 minutes for Printful to render mockups");
  console.log(" 2. Inspect each product in the BV Shopify admin (admin/products)");
  console.log(" 3. Run scripts/store-cleanup.ts to delete old broken AOP drafts and publish these new ones");
}

main().catch((e) => { console.error(e); process.exit(1); });
