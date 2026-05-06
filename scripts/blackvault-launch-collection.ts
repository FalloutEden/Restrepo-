// Materialize Black Vault Apparel's launch collection: 5 premium pieces with
// the BV monogram embroidered in Old Gold (#A67843) at left chest.
//
// Bypasses the AI-artwork pipeline because the design is fixed: it's the user's
// existing BV logo, embroidered, on premium blanks — not generated graphics.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-launch-collection.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
// Monogram-only crop. The full BV Transpo.png includes the "BLACK VAULT APPAREL"
// wordmark below the monogram, which becomes unreadable thread garbage at
// chest-emblem size. See .openclaw/brand/BV Monogram.png.
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");

// Embroidery thread color (Printful's "1672 Old Gold" — matches the storefront
// gold/tan accent).
const THREAD_COLOR_OLD_GOLD = "#A67843";

type CollectionItem = {
  slug: string;
  name: string;
  brandModel: string;
  baseVariantId: number; // Black/M variant — script expands to siblings
  retailPrice: string;
  productType: string; // for Shopify product_type
  description: string; // body_html copy (premium voice, material-specific)
};

const COLLECTION: CollectionItem[] = [
  {
    slug: "the-monogram-tee",
    name: "The Monogram Tee",
    brandModel: "Cotton Heritage MC1086",
    baseVariantId: 12757,
    retailPrice: "58.00",
    productType: "T-Shirt",
    description: [
      "<p>A 6.5 oz / 220 GSM heavyweight tee in 100% combed ring-spun cotton.",
      "The BV monogram is embroidered in Old Gold thread at the left chest —",
      "raised, structured, made to outlast print.</p>",
      "<p>Side-seamed construction. 1×1 rib at collar. Single-needle edge stitch.",
      "Pre-shrunk. Regular fit.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-vault-tee",
    name: "The Vault Tee",
    brandModel: "Comfort Colors 1717",
    baseVariantId: 15115,
    retailPrice: "54.00",
    productType: "T-Shirt",
    description: [
      "<p>A 6.1 oz garment-dyed heavyweight tee. Pigment-dyed for a soft hand and",
      "lived-in patina from the first wear. The BV monogram is embroidered in",
      "Old Gold thread at the left chest.</p>",
      "<p>Each piece arrives with subtle color variation — the mark of true",
      "garment-dyed cotton. The shirt that gets better with age.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-heavyweight-hoodie",
    name: "The Heavyweight Hoodie",
    brandModel: "Stanley/Stella SASU024",
    baseVariantId: 21153,
    retailPrice: "168.00",
    productType: "Hoodie",
    description: [
      "<p>A 10.3 oz / 350 GSM heavyweight organic cotton hoodie. The BV monogram",
      "embroidered in Old Gold thread at the left chest.</p>",
      "<p>GOTS-certified organic cotton. Drop-shoulder oversized cut. Double-stitched",
      "seams. The kind of weight you reach for when nothing else feels substantial",
      "enough.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-crewneck",
    name: "The Crewneck",
    brandModel: "Lane Seven LS14004",
    baseVariantId: 22127,
    retailPrice: "88.00",
    productType: "Sweatshirt",
    description: [
      "<p>An 8.25 oz / 280 GSM mid-weight crewneck in premium ring-spun cotton-blend",
      "fleece. The BV monogram is embroidered in Old Gold thread at the left chest.</p>",
      "<p>Ribbed cuffs and hem. Classic relaxed cut. Layer over an oxford or wear",
      "alone — it does both.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-long-sleeve",
    name: "The Long Sleeve",
    brandModel: "AS Colour 5081",
    baseVariantId: 19214,
    retailPrice: "84.00",
    productType: "Long Sleeve T-Shirt",
    description: [
      "<p>An 8.2 oz / 278 GSM heavyweight long-sleeve from AS Colour, with the BV",
      "monogram embroidered in Old Gold thread at the left chest.</p>",
      "<p>Combed cotton. Regular fit. Drop shoulder. The off-season anchor — built",
      "for layering through the in-between months.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  }
];

// --- Printful helpers -------------------------------------------------------

const PF_BASE = "https://api.printful.com";

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  return { token, storeId };
}

async function pfGet(path: string) {
  const { token } = ensurePrintful();
  const r = await fetch(`${PF_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Printful GET ${path} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function pfPost(path: string, body: unknown) {
  const { token, storeId } = ensurePrintful();
  const r = await fetch(`${PF_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful POST ${path} failed (${r.status}): ${text}`);
  return JSON.parse(text);
}

type PfVariant = { id: number; size: string; color: string; price: string };

async function getBlackSizeVariants(productId: number): Promise<PfVariant[]> {
  const data = await pfGet(`/products/${productId}`);
  const order = ["S", "M", "L", "XL", "2XL"];
  return ((data.result?.variants ?? []) as PfVariant[])
    .filter((v) => /black/i.test(v.color) && order.includes(v.size))
    .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
}

// --- Shopify helpers --------------------------------------------------------

async function shopifyRest<T>(creds: { storeDomain: string; apiVersion: string; token: string }, endpoint: string, init: RequestInit) {
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

async function shopifyGraphQL<T>(creds: { storeDomain: string; apiVersion: string; token: string }, query: string, variables: Record<string, unknown>) {
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

async function uploadLogoToShopifyFiles(creds: { storeDomain: string; apiVersion: string; token: string }, buffer: Buffer): Promise<string> {
  const filename = "blackvault-monogram-embroidery.png";
  // Stage upload
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

  // Poll for ready URL
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

// --- Materialize one collection item ---------------------------------------

type Materialized = {
  slug: string;
  name: string;
  shopifyProductId?: number;
  shopifyAdminUrl?: string;
  printfulSyncProductId?: number;
  mockupUrl?: string;
  status: "created" | "failed";
  error?: string;
};

async function materializeItem(
  item: CollectionItem,
  embroideryFileUrl: string,
  shopifyCreds: { storeDomain: string; apiVersion: string; token: string }
): Promise<Materialized> {
  console.log(`\n[${item.slug}] starting…`);
  try {
    // 1. Look up Printful product ID + size variants for Black
    const variantInfo = await pfGet(`/products/variant/${item.baseVariantId}`);
    const productId = variantInfo.result?.variant?.product_id as number;
    if (!productId) throw new Error(`Could not resolve product_id for variant ${item.baseVariantId}`);
    const sizes = await getBlackSizeVariants(productId);
    if (!sizes.length) throw new Error(`No Black size variants for product ${productId}`);
    console.log(`[${item.slug}] product_id=${productId} sizes=${sizes.map((s) => s.size).join(",")}`);

    // 2. Create Printful sync product with embroidery on every size variant
    const syncVariants = sizes.map((sv) => ({
      external_id: `bv-${item.slug}-${sv.size}`,
      variant_id: sv.id,
      retail_price: item.retailPrice,
      files: [
        {
          type: "embroidery_chest_left",
          url: embroideryFileUrl
        }
      ],
      // Embroidery options live at the variant level. The option id is
      // suffixed with the placement (`thread_colors_chest_left`); the value is
      // an array of allowed Printful thread color codes.
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

    // 3. Fetch the sync product back to grab Printful's auto-generated preview
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

    // 4. Create Shopify draft in Black Vault store with sizes as variants
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
        `printful-sync:${syncProductId}`,
        `printful-base:${item.brandModel}`
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

    // 5. Attach the mockup or fall back to the embroidery file as the listing image
    const imageToAttach = mockupUrl ?? embroideryFileUrl;
    try {
      await shopifyRest(shopifyCreds, `/products/${shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: imageToAttach, alt: item.name } })
      });
    } catch (e) {
      console.warn(`[${item.slug}] failed to attach image: ${e instanceof Error ? e.message : e}`);
    }

    return {
      slug: item.slug,
      name: item.name,
      shopifyProductId,
      shopifyAdminUrl: `https://${shopifyCreds.storeDomain}/admin/products/${shopifyProductId}`,
      printfulSyncProductId: syncProductId,
      mockupUrl,
      status: "created"
    };
  } catch (e) {
    return { slug: item.slug, name: item.name, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Main ------------------------------------------------------------------

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
  for (const r of results) {
    if (r.status === "created") {
      console.log(`✓ ${r.name}  shopify=${r.shopifyProductId}  printful=${r.printfulSyncProductId}`);
      console.log(`  ${r.shopifyAdminUrl}`);
    } else {
      console.log(`✗ ${r.name}  ERROR: ${r.error}`);
    }
  }

  fs.writeFileSync(
    path.join(BRAND_DIR, "launch-collection-results.json"),
    JSON.stringify(results, null, 2)
  );
  console.log(`\nResults saved to ${path.join(BRAND_DIR, "launch-collection-results.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
