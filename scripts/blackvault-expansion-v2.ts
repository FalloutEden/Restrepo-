// Black Vault expansion v2 — fixed version of blackvault-expansion-2026-05-04.ts.
//
// Differences from v1:
//   1. Drops the Under Armour Performance Polo entirely. UA blanks have visible
//      brand logos on the garment — fundamentally off-brand for a private label.
//   2. Embroidery position locked to CHEST_POSITION (450×450 inside a 1200×1200
//      area) — same Travis Mathew / Live Lucky scale tuned for the existing
//      BV launch collection. v1 used Printful's default which renders too large.
//   3. Two-phase: create all Printful sync products + Shopify drafts first,
//      then generate proper mockups via mockup-generator API (rate-limited
//      60s between calls) and attach them as the PRIMARY product image. v1
//      attached the logo PNG as the primary image because mockups weren't ready
//      yet — looked goofy.
//
// 11 SKUs total: 5 men's white + 6 women's (3 SKUs × 2 colors).
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-expansion-v2.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const THREAD_COLOR_OLD_GOLD = "#A67843";

// Travis Mathew / Live Lucky scale — small, elegant chest emblem (~1.5 inches at
// production). Same values as scripts/blackvault-resize-chest-embroidery.ts;
// don't touch without a sample comparison.
const CHEST_POSITION = {
  area_width: 1200,
  area_height: 1200,
  width: 450,
  height: 450,
  top: 375,
  left: 275
};

type ExpansionItem = {
  slug: string;
  name: string;
  brandModel: string;
  printfulProductId: number;
  color: "Black" | "White";
  retailPrice: string;
  productType: string;
  description: string;
};

const COLLECTION: ExpansionItem[] = [
  // Men's white expansion (5)
  {
    slug: "the-monogram-tee-white",
    name: "The Monogram Tee in White",
    brandModel: "Cotton Heritage MC1086",
    printfulProductId: 508,
    color: "White",
    retailPrice: "58.00",
    productType: "T-Shirt",
    description: "<p>A 6.5 oz / 220 GSM heavyweight tee in 100% combed ring-spun cotton, finished in pure white. The BV monogram is embroidered in Old Gold thread at the left chest — a quiet metal whisper against a clean canvas.</p><p>Side-seamed construction. 1×1 rib at collar. Single-needle edge stitch. Pre-shrunk. Regular fit.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-vault-tee-white",
    name: "The Vault Tee in White",
    brandModel: "Comfort Colors 1717",
    printfulProductId: 586,
    color: "White",
    retailPrice: "54.00",
    productType: "T-Shirt",
    description: "<p>A 6.1 oz garment-dyed heavyweight tee in white. Pigment-dyed for a soft hand and lived-in patina from the first wear. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>Each piece arrives with subtle color variation — the mark of true garment-dyed cotton. The shirt that gets better with age.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-heavyweight-hoodie-white",
    name: "The Heavyweight Hoodie in White",
    brandModel: "Stanley/Stella SASU024",
    printfulProductId: 831,
    color: "White",
    retailPrice: "168.00",
    productType: "Hoodie",
    description: "<p>A 10.3 oz / 350 GSM heavyweight organic cotton hoodie in pure white. The BV monogram embroidered in Old Gold thread at the left chest.</p><p>GOTS-certified organic cotton. Drop-shoulder oversized cut. Double-stitched seams. The kind of weight you reach for when nothing else feels substantial enough.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-crewneck-white",
    name: "The Crewneck in White",
    brandModel: "Lane Seven LS14004",
    printfulProductId: 845,
    color: "White",
    retailPrice: "88.00",
    productType: "Sweatshirt",
    description: "<p>An 8.25 oz / 280 GSM mid-weight crewneck in premium ring-spun cotton-blend fleece, in white. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>Ribbed cuffs and hem. Classic relaxed cut. Layer over an oxford or wear alone — it does both.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-polo-white",
    name: "The Polo in White",
    brandModel: "Port Authority K500",
    printfulProductId: 340,
    color: "White",
    retailPrice: "68.00",
    productType: "Polo",
    description: "<p>A premium pique-knit polo in white. Soft hand-feel ring-spun cotton, three-button placket, side vents, double-needle hem. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The everyday polo, made to take a tuck or wear loose. Built to be Kept.</p>"
  },
  // Women's launch (3 SKUs × 2 colors)
  {
    slug: "the-cropped-tee-black",
    name: "The Cropped Tee",
    brandModel: "AS Colour 4062",
    printfulProductId: 636,
    color: "Black",
    retailPrice: "48.00",
    productType: "Women's T-Shirt",
    description: "<p>A premium women's cropped tee in soft hand-feel ring-spun cotton, finished in black. Relaxed cropped silhouette, ribbed neckline. The BV monogram is embroidered in Old Gold thread at the left chest — the same brand mark, sized for the cut.</p><p>Sits at the natural waist. Pairs with high-rise denim or the BV Sweatpants.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-cropped-tee-white",
    name: "The Cropped Tee in White",
    brandModel: "AS Colour 4062",
    printfulProductId: 636,
    color: "White",
    retailPrice: "48.00",
    productType: "Women's T-Shirt",
    description: "<p>A premium women's cropped tee in soft hand-feel ring-spun cotton, in pure white. Relaxed cropped silhouette, ribbed neckline. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>Sits at the natural waist. The clean canvas piece for warm-weather styling.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-relaxed-tee-black",
    name: "The Relaxed Tee",
    brandModel: "Bella+Canvas 6400",
    printfulProductId: 360,
    color: "Black",
    retailPrice: "54.00",
    productType: "Women's T-Shirt",
    description: "<p>A women's relaxed-fit tee in 4.2 oz combed ring-spun cotton, finished in black. Boyfriend-style silhouette, side-seamed construction. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The everyday tee, cut for comfort, finished for restraint.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-relaxed-tee-white",
    name: "The Relaxed Tee in White",
    brandModel: "Bella+Canvas 6400",
    printfulProductId: 360,
    color: "White",
    retailPrice: "54.00",
    productType: "Women's T-Shirt",
    description: "<p>A women's relaxed-fit tee in 4.2 oz combed ring-spun cotton, in pure white. Boyfriend-style silhouette, side-seamed construction. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The off-duty essential, made to be lived in.</p><p>Built to be Kept.</p>"
  },
  {
    slug: "the-womens-hoodie-black",
    name: "The Hoodie",
    brandModel: "Stanley/Stella SASW035",
    printfulProductId: 832,
    color: "Black",
    retailPrice: "148.00",
    productType: "Women's Hoodie",
    description: "<p>A women's pullover hoodie in GOTS-certified organic cotton, finished in black. Soft brushed fleece interior, kangaroo pocket, ribbed cuffs and hem. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The cold-weather anchor, sized and shaped for the women's cut. Built to be Kept.</p>"
  },
  {
    slug: "the-womens-hoodie-white",
    name: "The Hoodie in White",
    brandModel: "Stanley/Stella SASW035",
    printfulProductId: 832,
    color: "White",
    retailPrice: "148.00",
    productType: "Women's Hoodie",
    description: "<p>A women's pullover hoodie in GOTS-certified organic cotton, finished in pure white. Soft brushed fleece interior, kangaroo pocket, ribbed cuffs and hem. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The clean canvas knit, sized and shaped for the women's cut. Built to be Kept.</p>"
  }
];

// ── Printful + Shopify helpers (same pattern as the existing BV scripts) ──

const PF_BASE = "https://api.printful.com";
const PREFERRED_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  return { token, storeId };
}

async function pfFetch(method: "GET" | "POST" | "PUT" | "DELETE", urlPath: string, body?: unknown) {
  const { token, storeId } = ensurePrintful();
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

type PfVariant = { id: number; size: string; color: string; price: string };

async function getColorSizeVariants(productId: number, color: string): Promise<PfVariant[]> {
  const data = await pfFetch("GET", `/products/${productId}`);
  const all = (data.result?.variants ?? []) as PfVariant[];
  const colorMatch = new RegExp(`^${color}$`, "i");
  const matches = all.filter((v) => colorMatch.test(v.color) && PREFERRED_SIZE_ORDER.includes(v.size));
  return matches.sort((a, b) => PREFERRED_SIZE_ORDER.indexOf(a.size) - PREFERRED_SIZE_ORDER.indexOf(b.size));
}

type ShopifyCreds = { storeDomain: string; apiVersion: string; token: string };

async function shopifyRest<T>(creds: ShopifyCreds, endpoint: string, init: RequestInit) {
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

async function uploadLogo(creds: ShopifyCreds): Promise<string> {
  const buf = fs.readFileSync(LOGO_PATH);
  const filename = `blackvault-monogram-v2-${Date.now()}.png`;
  const staged = await shopifyGraphQL<{ stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }> } }>(creds,
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } } }`,
    { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buf], { type: "image/png" }), filename);
  await fetch(target.url, { method: "POST", body: form });
  const fc = await shopifyGraphQL<{ fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> } }>(creds,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on MediaImage { id image { url } } ... on GenericFile { id url } } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] });
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("no file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("no URL");
  return url;
}

// ── Phase 1: create Printful sync product + Shopify draft (no images) ─────

type Phase1Result = {
  slug: string;
  name: string;
  color: string;
  printfulProductId: number;
  shopifyProductId: number;
  printfulSyncProductId: number;
  variantIds: number[];
};

async function createSyncAndDraft(item: ExpansionItem, designUrl: string, creds: ShopifyCreds): Promise<Phase1Result> {
  const sizes = await getColorSizeVariants(item.printfulProductId, item.color);
  if (sizes.length === 0) throw new Error(`No ${item.color} size variants for product ${item.printfulProductId}`);
  console.log(`  [${item.slug}] product=${item.printfulProductId} color=${item.color} sizes=${sizes.map((s) => s.size).join(",")}`);

  // Printful sync product — production embroidery file with positioned placement.
  const syncResp = await pfFetch("POST", `/store/products`, {
    sync_product: { external_id: `bv-${item.slug}`, name: item.name, thumbnail: designUrl },
    sync_variants: sizes.map((sv) => ({
      external_id: `bv-${item.slug}-${sv.size}`,
      variant_id: sv.id,
      retail_price: item.retailPrice,
      files: [{ type: "embroidery_chest_left", url: designUrl, position: CHEST_POSITION }],
      options: [
        { id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] },
        { id: "lifelike", value: true }
      ]
    }))
  });
  const syncProductId = syncResp.result?.id as number;
  if (!syncProductId) throw new Error("No sync product id");
  console.log(`  [${item.slug}] printful sync ${syncProductId}`);

  // Shopify draft — no images yet. Phase 2 attaches the mockup.
  const sizeNames = sizes.map((s) => s.size);
  const created = await shopifyRest<{ product?: { id: number; handle?: string } }>(creds, "/products.json", {
    method: "POST",
    body: JSON.stringify({
      product: {
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
          "embroidery",
          `color:${item.color.toLowerCase()}`,
          `printful-sync:${syncProductId}`,
          `printful-base:${item.brandModel}`,
          item.productType.toLowerCase().includes("women") ? "gender:women" : "gender:men"
        ],
        options: [{ name: "Size", values: sizeNames }],
        variants: sizeNames.map((size) => ({
          option1: size,
          price: item.retailPrice,
          sku: `BV-${item.slug.toUpperCase()}-${size}`
        }))
      }
    })
  });
  const shopifyProductId = created.product?.id;
  if (!shopifyProductId) throw new Error("No Shopify product id");
  console.log(`  [${item.slug}] shopify draft ${shopifyProductId}`);

  return {
    slug: item.slug,
    name: item.name,
    color: item.color,
    printfulProductId: item.printfulProductId,
    shopifyProductId,
    printfulSyncProductId: syncProductId,
    variantIds: sizes.map((s) => s.id)
  };
}

// ── Phase 2: generate proper mockup with position + attach as primary ─────

async function generateAndAttachMockup(p: Phase1Result, designUrl: string, creds: ShopifyCreds, sleepBefore: boolean) {
  if (sleepBefore) {
    console.log(`  [${p.slug}] waiting 65s for Printful mockup-gen rate limit…`);
    await new Promise((r) => setTimeout(r, 65000));
  }

  const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${p.printfulProductId}`, {
    variant_ids: p.variantIds,
    format: "jpg",
    technique: "EMBROIDERY",
    files: [{ placement: "embroidery_chest_left", image_url: designUrl, position: CHEST_POSITION }]
  });
  const taskKey = taskResp.result?.task_key as string;
  console.log(`  [${p.slug}] mockup task=${taskKey}`);

  let mockups: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pfFetch("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
    if (td.result?.status === "completed") {
      const set = new Set<string>();
      (td.result.mockups ?? []).forEach((m: { mockup_url?: string; extra?: Array<{ url?: string }> }) => {
        if (m.mockup_url) set.add(m.mockup_url);
        (m.extra ?? []).forEach((e) => e.url && set.add(e.url));
      });
      mockups = [...set];
      break;
    }
    if (td.result?.status === "failed") throw new Error("mockup task failed");
  }
  if (mockups.length === 0) throw new Error("no mockups returned");
  console.log(`  [${p.slug}] ${mockups.length} mockups returned`);

  // Wipe any auto-generated images Shopify might have attached, then attach
  // mockups in order — the first becomes the primary product image.
  const existing = await shopifyRest<{ images: Array<{ id: number }> }>(creds, `/products/${p.shopifyProductId}/images.json`, { method: "GET" });
  for (const img of existing.images ?? []) {
    await shopifyRest(creds, `/products/${p.shopifyProductId}/images/${img.id}.json`, { method: "DELETE" });
  }
  for (const url of mockups.slice(0, 5)) {
    await shopifyRest(creds, `/products/${p.shopifyProductId}/images.json`, {
      method: "POST",
      body: JSON.stringify({ image: { src: url, alt: p.name } })
    });
  }
  console.log(`  [${p.slug}] ✓ wiped ${existing.images?.length ?? 0} old, attached ${Math.min(mockups.length, 5)} mockups`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo not found at ${LOGO_PATH}`);
  ensurePrintful();
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${creds.brandSlug} store=${creds.storeDomain}`);

  console.log("[init] uploading BV monogram for production + mockup gen…");
  const designUrl = await uploadLogo(creds);
  console.log(`[init] design URL: ${designUrl}\n`);

  // Phase 1 — fast, no rate limit on /store/products.
  console.log("=== PHASE 1: Printful sync products + Shopify drafts ===");
  const phase1: Phase1Result[] = [];
  for (const item of COLLECTION) {
    try {
      phase1.push(await createSyncAndDraft(item, designUrl, creds));
    } catch (e) {
      console.warn(`  [${item.slug}] FAILED phase 1: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Phase 1 done: ${phase1.length}/${COLLECTION.length} sync+drafts created\n`);

  // Phase 2 — mockup-generator is rate-limited, 60s between create-task calls.
  console.log("=== PHASE 2: positioned mockups + image attach ===");
  let attached = 0;
  for (let i = 0; i < phase1.length; i += 1) {
    const p = phase1[i];
    try {
      await generateAndAttachMockup(p, designUrl, creds, i > 0);
      attached += 1;
    } catch (e) {
      console.warn(`  [${p.slug}] FAILED phase 2: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Phase 1 (sync+draft): ${phase1.length}/${COLLECTION.length}`);
  console.log(`Phase 2 (mockups):    ${attached}/${phase1.length}`);
  for (const p of phase1) {
    console.log(`✓ ${p.name} [${p.color}]  shopify=${p.shopifyProductId}  printful=${p.printfulSyncProductId}`);
    console.log(`  https://${creds.storeDomain}/admin/products/${p.shopifyProductId}`);
  }

  fs.mkdirSync(BRAND_DIR, { recursive: true });
  const outFile = path.join(BRAND_DIR, "expansion-v2-results.json");
  fs.writeFileSync(outFile, JSON.stringify(phase1, null, 2));
  console.log(`\nResults saved to ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
