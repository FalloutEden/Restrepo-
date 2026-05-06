// Add two new BV headwear products: a Yupoong 6089M classic snapback and a
// Yupoong 1501KC cuffed beanie. Both with the BV monogram embroidered in
// Old Gold (#A67843) at the front panel — same brand mark scale as the
// existing chest-left embroidery on the shirts.
//
// One-size only (Yupoong 6089M has an adjustable strap, 1501KC stretches),
// Black colorway only — matches the rest of the BV catalog.
//
// Idempotent: Shopify side dedupes by handle. If you re-run, you'll get a
// duplicate product unless you delete the prior one first. (For hats this
// is fine — there's no risk of variant id mismatches like the shirts have.)
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-add-hats-beanies.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";
import { attachProductToOnlineStore } from "@/lib/shopify-service";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const THREAD_COLOR_OLD_GOLD = "#A67843";
const PF_BASE = "https://api.printful.com";

type HeadwearItem = {
  slug: string;
  name: string;
  brandModel: string;
  catalogId: number;
  blackVariantId: number;
  retailPrice: string;
  productType: string;
  description: string;
};

const ITEMS: HeadwearItem[] = [
  {
    slug: "the-snapback",
    name: "The Snapback",
    brandModel: "Yupoong 6089M",
    catalogId: 99,
    blackVariantId: 4792,
    retailPrice: "52.00",
    productType: "Hat",
    description: [
      "<p>A classic 6-panel structured snapback. Yupoong 6089M — wool-blend",
      "front panels, mesh-feel back, flat brim, plastic snap closure.",
      "The BV monogram embroidered in Old Gold thread at the front center.</p>",
      "<p>One size, adjustable. Built for daily wear, not for a single season.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-beanie",
    name: "The Beanie",
    brandModel: "Yupoong 1501KC",
    catalogId: 266,
    blackVariantId: 8936,
    retailPrice: "42.00",
    productType: "Beanie",
    description: [
      "<p>A cuffed knit beanie. Yupoong 1501KC — fine-gauge acrylic, ribbed",
      "fold-up cuff, structured crown that holds shape after wash. The BV",
      "monogram embroidered in Old Gold thread at the cuff front.</p>",
      "<p>One size, stretches. Soft enough to layer under a hood, structured",
      "enough to wear alone.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  }
];

// ── Printful helpers ────────────────────────────────────────────────────────

function ensurePf() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  return { token, storeId };
}

async function pfGet(p: string) {
  const { token } = ensurePf();
  const r = await fetch(`${PF_BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Printful GET ${p} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function pfPost(p: string, body: unknown) {
  const { token, storeId } = ensurePf();
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
  if (!r.ok) throw new Error(`Printful POST ${p} (${r.status}): ${text}`);
  return JSON.parse(text);
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

async function uploadLogoToShopifyFiles(creds: ShopifyCreds, buffer: Buffer): Promise<string> {
  const filename = `bv-monogram-headwear-${Date.now()}.png`;
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
    };
  }>(creds, `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { message }
    }
  }`, { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged target");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const u = await fetch(target.url, { method: "POST", body: form });
  if (!u.ok) throw new Error(`Staged upload failed ${u.status}`);
  const fc = await shopifyGraphQL<{ fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> } }>(
    creds,
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { ... on MediaImage { id image { url } } ... on GenericFile { id url } }
        userErrors { message }
      }
    }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] }
  );
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("No file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 25 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(
      creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    );
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("Never got URL");
  return url;
}

// ── Materialize one item ────────────────────────────────────────────────────

type Materialized = { slug: string; shopifyProductId?: number; printfulSyncProductId?: number; status: "created" | "failed"; error?: string };

async function materializeItem(item: HeadwearItem, embroideryUrl: string, shopifyCreds: ShopifyCreds): Promise<Materialized> {
  console.log(`\n[${item.slug}] starting…`);
  try {
    // Verify the variant exists
    const v = await pfGet(`/products/variant/${item.blackVariantId}`);
    const variantInfo = v.result?.variant;
    if (!variantInfo) throw new Error(`Variant ${item.blackVariantId} not found`);
    console.log(`[${item.slug}] catalog ${item.catalogId} | variant ${item.blackVariantId} (${variantInfo.color}, ${variantInfo.size})`);

    // Create Printful sync product — one-size, single Black variant
    const syncResp = await pfPost("/store/products", {
      sync_product: {
        external_id: `bv-${item.slug}`,
        name: item.name,
        thumbnail: embroideryUrl
      },
      sync_variants: [
        {
          external_id: `bv-${item.slug}-onesize`,
          variant_id: item.blackVariantId,
          retail_price: item.retailPrice,
          files: [{ type: "embroidery_front", url: embroideryUrl }],
          options: [
            { id: "thread_colors_front", value: [THREAD_COLOR_OLD_GOLD] },
            { id: "lifelike", value: true }
          ]
        }
      ]
    });
    const syncProductId = syncResp.result?.id as number;
    if (!syncProductId) throw new Error("No sync product id returned");
    console.log(`[${item.slug}] printful sync=${syncProductId}`);

    // Wait briefly for Printful to render the mockup
    await new Promise((r) => setTimeout(r, 4000));

    // Create Shopify draft
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
        "headwear",
        `printful-sync:${syncProductId}`,
        `printful-base:${item.brandModel}`
      ],
      variants: [{ price: item.retailPrice, sku: `BV-${item.slug.toUpperCase()}-OS` }]
    };
    const created = await shopifyRest<{ product?: { id: number } }>(shopifyCreds, "/products.json", {
      method: "POST",
      body: JSON.stringify({ product: productPayload })
    });
    const shopifyProductId = created.product?.id;
    if (!shopifyProductId) throw new Error("Shopify product creation returned no id");
    console.log(`[${item.slug}] shopify draft=${shopifyProductId}`);

    // Re-link sync_variant external_id to the Shopify variant id (so the
    // order webhook can route fulfillment correctly)
    const detail = await shopifyRest<{ product: { variants: Array<{ id: number }> } }>(
      shopifyCreds,
      `/products/${shopifyProductId}.json?fields=id,variants`,
      { method: "GET" }
    );
    const shopifyVariantId = detail.product.variants[0]?.id;
    if (shopifyVariantId) {
      const syncDetail = await pfGet(`/store/products/${syncProductId}`);
      const sv = syncDetail.result?.sync_variants?.[0];
      if (sv) {
        await fetch(`${PF_BASE}/store/products/${syncProductId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
            "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID!,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sync_variants: [{ id: sv.id, external_id: String(shopifyVariantId), retail_price: sv.retail_price }]
          })
        });
        console.log(`[${item.slug}] re-linked sync_variant external_id to ${shopifyVariantId}`);
      }
    }

    // Pre-attach to Online Store
    try {
      await attachProductToOnlineStore(shopifyProductId, BRAND);
      console.log(`[${item.slug}] attached to Online Store publication`);
    } catch (e) {
      console.warn(`[${item.slug}] online-store attach failed (non-fatal): ${e instanceof Error ? e.message : e}`);
    }

    return { slug: item.slug, shopifyProductId, printfulSyncProductId: syncProductId, status: "created" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { slug: item.slug, status: "failed", error: msg };
  }
}

// ── Attach the rendered Printful mockup back to the Shopify product ────────

async function attachMockup(item: Materialized, shopifyCreds: ShopifyCreds) {
  if (!item.shopifyProductId || !item.printfulSyncProductId) return;
  // Poll up to 8 attempts for the rendered preview
  let mockupUrl: string | null = null;
  for (let attempt = 0; attempt < 8 && !mockupUrl; attempt += 1) {
    try {
      const detail = await pfGet(`/store/products/${item.printfulSyncProductId}`);
      const variants = detail.result?.sync_variants ?? [];
      const preview = variants[0]?.files?.find((f: { type?: string; preview_url?: string }) => f.type === "preview" && f.preview_url);
      if (preview?.preview_url) {
        mockupUrl = preview.preview_url;
        break;
      }
      // Fallback to any preview_url
      const anyPreview = variants[0]?.files?.find((f: { preview_url?: string }) => f.preview_url);
      if (anyPreview?.preview_url) {
        mockupUrl = anyPreview.preview_url;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 8000));
  }
  if (!mockupUrl) {
    console.log(`[${item.slug}] no mockup ready after polling — re-run scripts/blackvault-attach-aop-mockups.ts logic later`);
    return;
  }
  await shopifyRest(shopifyCreds, `/products/${item.shopifyProductId}/images.json`, {
    method: "POST",
    body: JSON.stringify({ image: { src: mockupUrl, alt: item.slug } })
  });
  console.log(`[${item.slug}] attached mockup`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Missing ${LOGO_PATH}`);
  const shopifyCreds = resolveShopifyCredentials(BRAND);

  console.log(`[init] uploading BV monogram to Shopify Files…`);
  const buffer = fs.readFileSync(LOGO_PATH);
  const embroideryUrl = await uploadLogoToShopifyFiles(shopifyCreds, buffer);
  console.log(`[init] embroidery url=${embroideryUrl}`);

  const results: Materialized[] = [];
  for (const item of ITEMS) {
    const r = await materializeItem(item, embroideryUrl, shopifyCreds);
    results.push(r);
    if (r.status === "created") await attachMockup(r, shopifyCreds);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const outPath = path.join(BRAND_DIR, "headwear-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Created: ${results.filter((r) => r.status === "created").length}/${results.length}`);
  for (const r of results) {
    if (r.status === "created") {
      console.log(`  ✓ ${r.slug} → shopify=${r.shopifyProductId}, printful=${r.printfulSyncProductId}`);
    } else {
      console.log(`  ✗ ${r.slug}: ${r.error}`);
    }
  }
  console.log(`\nResults saved to ${outPath}`);
  console.log(`\nNext: review in admin → publish via scripts/store-cleanup.ts when ready`);
}

main().catch((e) => { console.error(e); process.exit(1); });
