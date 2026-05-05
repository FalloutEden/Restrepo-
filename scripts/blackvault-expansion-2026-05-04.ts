// Black Vault expansion — May 4, 2026.
// Adds 13 new draft SKUs to the existing 10-piece BV launch collection:
//   - 5 men's white colorways of existing core pieces
//   - 6 women's pieces (Cropped Tee, Relaxed Tee, Hoodie) in black + white
//   - 2 performance polos (Adidas A430) in black + white
//
// Same Old Gold (#A67843) embroidered chest monogram across every piece —
// brand consistency over per-color customization.
//
// Built on the same pattern as scripts/blackvault-launch-collection.ts —
// uses the BV monogram PNG (not AI artwork), creates Printful sync product
// with embroidery options, then mirrors as Shopify draft with size variants
// pulled live from Printful's catalog.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-expansion-2026-05-04.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const THREAD_COLOR_OLD_GOLD = "#A67843";

type ExpansionItem = {
  slug: string;
  name: string;
  brandModel: string;
  // Printful product id (from .openclaw/printful-catalog-v2.json)
  printfulProductId: number;
  // Color name to filter Printful variants by — must match what Printful uses.
  color: "Black" | "White";
  // Match pattern is more permissive than `color` so brand-specific shades
  // ("Off White", "White Solid") still match. Default exact match if unset.
  colorMatch?: RegExp;
  retailPrice: string;
  productType: string;
  description: string;
  // Used for size filtering. Most apparel uses S/M/L/XL/2XL; women's
  // sometimes runs XS-XL. We accept all "common" apparel sizes and let
  // Printful tell us what exists.
};

const COLLECTION: ExpansionItem[] = [
  // ── Men's white expansion (5 SKUs) ───────────────────────────────────────
  {
    slug: "the-monogram-tee-white",
    name: "The Monogram Tee in White",
    brandModel: "Cotton Heritage MC1086",
    printfulProductId: 508,
    color: "White",
    retailPrice: "58.00",
    productType: "T-Shirt",
    description: [
      "<p>A 6.5 oz / 220 GSM heavyweight tee in 100% combed ring-spun cotton, finished in pure white.",
      "The BV monogram is embroidered in Old Gold thread at the left chest — a quiet metal whisper",
      "against a clean canvas.</p>",
      "<p>Side-seamed construction. 1×1 rib at collar. Single-needle edge stitch. Pre-shrunk. Regular fit.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-vault-tee-white",
    name: "The Vault Tee in White",
    brandModel: "Comfort Colors 1717",
    printfulProductId: 586,
    color: "White",
    retailPrice: "54.00",
    productType: "T-Shirt",
    description: [
      "<p>A 6.1 oz garment-dyed heavyweight tee in white. Pigment-dyed for a soft hand and",
      "lived-in patina from the first wear. The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>Each piece arrives with subtle color variation — the mark of true garment-dyed cotton.",
      "The shirt that gets better with age.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-heavyweight-hoodie-white",
    name: "The Heavyweight Hoodie in White",
    brandModel: "Stanley/Stella SASU024",
    printfulProductId: 831,
    color: "White",
    retailPrice: "168.00",
    productType: "Hoodie",
    description: [
      "<p>A 10.3 oz / 350 GSM organic cotton hoodie from Stanley/Stella in pure white,",
      "with the BV monogram embroidered in Old Gold thread at the left chest.</p>",
      "<p>GOTS-certified organic cotton. Drop-shoulder oversized cut. Double-stitched seams.",
      "The kind of weight you reach for when nothing else feels substantial enough.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-crewneck-white",
    name: "The Crewneck in White",
    brandModel: "Lane Seven LS14004",
    printfulProductId: 845,
    color: "White",
    retailPrice: "88.00",
    productType: "Sweatshirt",
    description: [
      "<p>An 8.25 oz / 280 GSM mid-weight crewneck in premium ring-spun cotton-blend fleece, in white.",
      "The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>Ribbed cuffs and hem. Classic relaxed cut. Layer over an oxford or wear alone — it does both.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-polo-white",
    name: "The Polo in White",
    brandModel: "Port Authority K500",
    printfulProductId: 340,
    color: "White",
    retailPrice: "68.00",
    productType: "Polo",
    description: [
      "<p>A premium pique-knit polo in white. Soft hand-feel ring-spun cotton, three-button placket,",
      "side vents, double-needle hem. The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>The everyday polo, made to take a tuck or wear loose. Built to be Kept.</p>"
    ].join(" ")
  },

  // ── Performance polo (Adidas A430) — black + white ───────────────────────
  {
    slug: "the-performance-polo-black",
    name: "The Performance Polo",
    brandModel: "Adidas A430",
    printfulProductId: 767,
    color: "Black",
    retailPrice: "78.00",
    productType: "Polo",
    description: [
      "<p>A performance pique-knit polo from Adidas, finished in black with the BV monogram",
      "embroidered in Old Gold thread at the left chest.</p>",
      "<p>Moisture-wicking polyester knit with stretch. Three-button placket. Engineered for movement,",
      "finished for the office. Pairs with the Sweatpants for a full-look or stands on its own.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-performance-polo-white",
    name: "The Performance Polo in White",
    brandModel: "Adidas A430",
    printfulProductId: 767,
    color: "White",
    retailPrice: "78.00",
    productType: "Polo",
    description: [
      "<p>A performance pique-knit polo from Adidas in pure white, with the BV monogram",
      "embroidered in Old Gold thread at the left chest.</p>",
      "<p>Moisture-wicking polyester knit with stretch. Three-button placket. The performance",
      "fabric of a course polo, finished with restraint.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },

  // ── Women's launch (3 SKUs × 2 colors = 6 SKUs) ─────────────────────────
  {
    slug: "the-cropped-tee-black",
    name: "The Cropped Tee",
    brandModel: "AS Colour 4062",
    printfulProductId: 636,
    color: "Black",
    retailPrice: "48.00",
    productType: "Women's T-Shirt",
    description: [
      "<p>A premium women's cropped tee in soft hand-feel ring-spun cotton, finished in black.",
      "Relaxed cropped silhouette, ribbed neckline. The BV monogram is embroidered in Old Gold",
      "thread at the left chest — the same brand mark, sized for the cut.</p>",
      "<p>Sits at the natural waist. Pairs with high-rise denim or the BV Sweatpants.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-cropped-tee-white",
    name: "The Cropped Tee in White",
    brandModel: "AS Colour 4062",
    printfulProductId: 636,
    color: "White",
    retailPrice: "48.00",
    productType: "Women's T-Shirt",
    description: [
      "<p>A premium women's cropped tee in soft hand-feel ring-spun cotton, in pure white.",
      "Relaxed cropped silhouette, ribbed neckline. The BV monogram is embroidered in Old Gold",
      "thread at the left chest.</p>",
      "<p>Sits at the natural waist. The clean canvas piece for warm-weather styling.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-relaxed-tee-black",
    name: "The Relaxed Tee",
    brandModel: "Bella+Canvas 6400",
    printfulProductId: 360,
    color: "Black",
    retailPrice: "54.00",
    productType: "Women's T-Shirt",
    description: [
      "<p>A women's relaxed-fit tee in 4.2 oz combed ring-spun cotton, finished in black.",
      "Boyfriend-style silhouette, side-seamed construction. The BV monogram is embroidered",
      "in Old Gold thread at the left chest.</p>",
      "<p>The everyday tee, cut for comfort, finished for restraint.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-relaxed-tee-white",
    name: "The Relaxed Tee in White",
    brandModel: "Bella+Canvas 6400",
    printfulProductId: 360,
    color: "White",
    retailPrice: "54.00",
    productType: "Women's T-Shirt",
    description: [
      "<p>A women's relaxed-fit tee in 4.2 oz combed ring-spun cotton, in pure white.",
      "Boyfriend-style silhouette, side-seamed construction. The BV monogram is embroidered",
      "in Old Gold thread at the left chest.</p>",
      "<p>The off-duty essential, made to be lived in.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-womens-hoodie-black",
    name: "The Hoodie",
    brandModel: "Stanley/Stella SASW035",
    printfulProductId: 832,
    color: "Black",
    retailPrice: "148.00",
    productType: "Women's Hoodie",
    description: [
      "<p>A women's pullover hoodie in GOTS-certified organic cotton, finished in black.",
      "Soft brushed fleece interior, kangaroo pocket, ribbed cuffs and hem.",
      "The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>The cold-weather anchor, sized and shaped for the women's cut. Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-womens-hoodie-white",
    name: "The Hoodie in White",
    brandModel: "Stanley/Stella SASW035",
    printfulProductId: 832,
    color: "White",
    retailPrice: "148.00",
    productType: "Women's Hoodie",
    description: [
      "<p>A women's pullover hoodie in GOTS-certified organic cotton, finished in pure white.",
      "Soft brushed fleece interior, kangaroo pocket, ribbed cuffs and hem.",
      "The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>The clean canvas knit, sized and shaped for the women's cut. Built to be Kept.</p>"
    ].join(" ")
  }
];

// ── Printful helpers ────────────────────────────────────────────────────────

const PF_BASE = "https://api.printful.com";

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  return { token, storeId };
}

async function pfGet(p: string) {
  const { token } = ensurePrintful();
  const r = await fetch(`${PF_BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Printful GET ${p} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function pfPost(p: string, body: unknown) {
  const { token, storeId } = ensurePrintful();
  const r = await fetch(`${PF_BASE}${p}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful POST ${p} failed (${r.status}): ${text}`);
  return JSON.parse(text);
}

type PfVariant = { id: number; size: string; color: string; price: string };

const PREFERRED_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

async function getColorSizeVariants(productId: number, colorMatch: RegExp): Promise<PfVariant[]> {
  const data = await pfGet(`/products/${productId}`);
  const all = (data.result?.variants ?? []) as PfVariant[];
  const matches = all.filter((v) => colorMatch.test(v.color) && PREFERRED_SIZE_ORDER.includes(v.size));
  return matches.sort((a, b) => PREFERRED_SIZE_ORDER.indexOf(a.size) - PREFERRED_SIZE_ORDER.indexOf(b.size));
}

// ── Shopify helpers ─────────────────────────────────────────────────────────

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
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} failed (${r.status}): ${text}`);
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
    throw new Error(`Shopify GraphQL failed (${r.status}): ${text}`);
  }
  return parsed.data as T;
}

async function uploadLogoToShopifyFiles(creds: ShopifyCreds, buffer: Buffer): Promise<string> {
  const filename = `blackvault-monogram-embroidery-${Date.now()}.png`;
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
      userErrors: Array<{ message: string }>;
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
  if (!url) throw new Error("Shopify never returned a URL for the embroidery file");
  return url;
}

// ── Materialize one item ────────────────────────────────────────────────────

type Materialized = {
  slug: string;
  name: string;
  color: string;
  shopifyProductId?: number;
  shopifyAdminUrl?: string;
  printfulSyncProductId?: number;
  mockupUrl?: string;
  status: "created" | "failed";
  error?: string;
};

async function materializeItem(item: ExpansionItem, embroideryFileUrl: string, creds: ShopifyCreds): Promise<Materialized> {
  console.log(`\n[${item.slug}] starting…`);
  try {
    const colorMatch = item.colorMatch ?? new RegExp(`^${item.color}$`, "i");
    const sizes = await getColorSizeVariants(item.printfulProductId, colorMatch);
    if (sizes.length === 0) {
      throw new Error(`No ${item.color} size variants found for product ${item.printfulProductId} (${item.brandModel})`);
    }
    console.log(`[${item.slug}] product=${item.printfulProductId} color=${item.color} sizes=${sizes.map((s) => s.size).join(",")}`);

    // Create Printful sync product with embroidery on every size variant.
    const syncVariants = sizes.map((sv) => ({
      external_id: `bv-${item.slug}-${sv.size}`,
      variant_id: sv.id,
      retail_price: item.retailPrice,
      files: [{ type: "embroidery_chest_left", url: embroideryFileUrl }],
      options: [
        { id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] },
        { id: "lifelike", value: true }
      ]
    }));

    const syncResp = await pfPost("/store/products", {
      sync_product: {
        external_id: `bv-${item.slug}`,
        name: item.name,
        thumbnail: embroideryFileUrl
      },
      sync_variants: syncVariants
    });
    const syncProductId = syncResp.result?.id as number;
    if (!syncProductId) throw new Error("No sync product id returned");
    console.log(`[${item.slug}] printful sync product=${syncProductId}`);

    // Pick up Printful's auto-generated mockup.
    let mockupUrl: string | undefined;
    for (let attempt = 0; attempt < 6 && !mockupUrl; attempt += 1) {
      await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
      try {
        const detail = await pfGet(`/store/products/${syncProductId}`);
        mockupUrl = detail.result?.sync_product?.thumbnail_url
          ?? detail.result?.sync_variants?.[0]?.product?.image
          ?? detail.result?.sync_variants?.[0]?.files?.find?.((f: { preview_url?: string }) => f.preview_url)?.preview_url;
      } catch {}
    }
    console.log(`[${item.slug}] mockup_url=${mockupUrl ? "got" : "none"}`);

    // Shopify draft with size variants.
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
    };

    const created = await shopifyRest<{ product?: { id: number; handle?: string } }>(creds, "/products.json", {
      method: "POST",
      body: JSON.stringify({ product: productPayload })
    });
    const shopifyProductId = created.product?.id;
    if (!shopifyProductId) throw new Error("Shopify product creation returned no id");

    // Attach the mockup or fall back to the embroidery file as the listing image.
    const imageToAttach = mockupUrl ?? embroideryFileUrl;
    try {
      await shopifyRest(creds, `/products/${shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: imageToAttach, alt: item.name } })
      });
    } catch (e) {
      console.warn(`[${item.slug}] failed to attach image: ${e instanceof Error ? e.message : e}`);
    }

    return {
      slug: item.slug,
      name: item.name,
      color: item.color,
      shopifyProductId,
      shopifyAdminUrl: `https://${creds.storeDomain}/admin/products/${shopifyProductId}`,
      printfulSyncProductId: syncProductId,
      mockupUrl,
      status: "created"
    };
  } catch (e) {
    return {
      slug: item.slug,
      name: item.name,
      color: item.color,
      status: "failed",
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo not found at ${LOGO_PATH}`);
  const shopifyCreds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${shopifyCreds.brandSlug} store=${shopifyCreds.storeDomain}`);
  ensurePrintful();
  console.log("[init] printful credentials present");

  console.log("[upload] uploading BV monogram to Black Vault Shopify Files for Printful to fetch…");
  const embroideryFileUrl = await uploadLogoToShopifyFiles(shopifyCreds, fs.readFileSync(LOGO_PATH));
  console.log(`[upload] file URL: ${embroideryFileUrl}`);

  const results: Materialized[] = [];
  for (const item of COLLECTION) {
    const r = await materializeItem(item, embroideryFileUrl, shopifyCreds);
    results.push(r);
  }

  console.log("\n=== SUMMARY ===");
  let okCount = 0;
  for (const r of results) {
    if (r.status === "created") {
      okCount += 1;
      console.log(`✓ ${r.name} [${r.color}]  shopify=${r.shopifyProductId}  printful=${r.printfulSyncProductId}`);
      console.log(`  ${r.shopifyAdminUrl}`);
    } else {
      console.log(`✗ ${r.name} [${r.color}]  ERROR: ${r.error}`);
    }
  }
  console.log(`\n${okCount}/${results.length} created`);

  fs.mkdirSync(BRAND_DIR, { recursive: true });
  const outFile = path.join(BRAND_DIR, "expansion-2026-05-04-results.json");
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outFile}`);

  if (okCount < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
