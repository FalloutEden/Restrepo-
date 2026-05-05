// Expand the Black Vault Apparel collection: 4 new pieces (polo, crew sock,
// sweatpants, structured cap) with the BV Gold monogram embroidered. Each one
// uses a different Printful placement + thread-color option ID since polos,
// socks, pants, and caps all have their own embroidery zones.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-collection-expand.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const RESULTS_PATH = path.join(BRAND_DIR, "expansion-results.json");
const PRIOR_RESULTS_PATH = path.join(BRAND_DIR, "launch-collection-results.json");

const THREAD_COLOR_OLD_GOLD = "#A67843";
const PF_BASE = "https://api.printful.com";

type CollectionItem = {
  slug: string;
  name: string;
  brandModel: string;
  baseVariantId: number;
  retailPrice: string;
  productType: string;
  description: string;
  embroideryPlacement: string;
  threadColorOptionId: string;
  position: {
    area_width: number;
    area_height: number;
    width: number;
    height: number;
    top: number;
    left: number;
  };
};

const COLLECTION: CollectionItem[] = [
  {
    slug: "the-polo",
    name: "The Polo",
    brandModel: "Port Authority K500",
    baseVariantId: 9899,
    retailPrice: "62.00",
    productType: "Polo",
    description: [
      "<p>A premium tailored-fit pique polo in 100% combed ring-spun cotton.",
      "The BV monogram is embroidered in Old Gold thread at the left chest —",
      "raised, structured, sitting where you'd expect it on a real Polo Ralph",
      "Lauren or Lacoste.</p>",
      "<p>Three-button placket with dyed-to-match buttons. Flat-knit collar.",
      "Side-vented hem. Modern fit, slimmed through the body and arms.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" "),
    embroideryPlacement: "embroidery_chest_left",
    threadColorOptionId: "thread_colors_chest_left",
    position: { area_width: 1200, area_height: 1200, width: 750, height: 750, top: 225, left: 225 }
  },
  {
    slug: "the-crew-sock",
    name: "The Crew Sock",
    brandModel: "SOCCO SC200",
    baseVariantId: 12675,
    retailPrice: "36.00",
    productType: "Socks",
    description: [
      "<p>A ribbed mid-calf crew sock made in the USA from premium combed",
      "cotton. The BV monogram is embroidered in Old Gold thread on the",
      "outside cuff — visible above sneakers and loafers, hidden under boots",
      "and dress shoes.</p>",
      "<p>Reinforced heel and toe. Cushioned footbed. Fit holds without slipping.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" "),
    embroideryPlacement: "embroidery_outside_left",
    threadColorOptionId: "thread_colors_outside_left",
    // Sock embroidery area is tiny (177x294). Fit the monogram with margin.
    position: { area_width: 177, area_height: 294, width: 140, height: 200, top: 47, left: 18 }
  },
  {
    slug: "the-sweatpants",
    name: "The Sweatpants",
    brandModel: "Bella + Canvas 4737",
    baseVariantId: 23114,
    retailPrice: "98.00",
    productType: "Sweatpants",
    description: [
      "<p>Heavyweight cotton-blend fleece sweatpants with a tailored tapered",
      "leg. The BV monogram is embroidered in Old Gold thread on the front",
      "thigh — visible without dominating the silhouette.</p>",
      "<p>Drawcord waistband with side pockets. Ribbed ankle cuff. Cut for the",
      "cleaner end of athleisure — pair with the Heavyweight Hoodie or wear",
      "with a clean white tee.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" "),
    embroideryPlacement: "embroidery_apparel_front",
    threadColorOptionId: "thread_colors_apparel",
    // Sweatpants front area is 1200x1200; smaller mark for hip placement.
    position: { area_width: 1200, area_height: 1200, width: 550, height: 550, top: 325, left: 325 }
  },
  {
    slug: "the-cap",
    name: "The Cap",
    brandModel: "Flexfit 6277",
    baseVariantId: 5277,
    retailPrice: "48.00",
    productType: "Hat",
    description: [
      "<p>A premium structured 6-panel cap by Flexfit — the same blank used by",
      "every premium streetwear and lifestyle brand for a reason. Wool-blend",
      "front, mid-profile crown, slightly curved bill.</p>",
      "<p>The BV monogram is embroidered prominently in Old Gold thread at the",
      "front center — the brand mark is the entire point of a cap.</p>",
      "<p>Stretch-fit band, no closure on the back — so it sits like it was",
      "made for your head.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" "),
    embroideryPlacement: "embroidery_front_large",
    threadColorOptionId: "thread_colors_front_large",
    // Cap front is 1770x600 (wide). Center the monogram, sized prominently.
    position: { area_width: 1770, area_height: 600, width: 348, height: 500, top: 50, left: 711 }
  }
];

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  return { token, storeId };
}

async function pfFetch(method: "GET" | "POST" | "PUT", urlPath: string, body?: unknown) {
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

async function uploadLogoOnce(creds: ShopifyCreds): Promise<string> {
  const buffer = fs.readFileSync(LOGO_PATH);
  const filename = "blackvault-monogram-expansion.png";
  const staged = await shopifyGraphQL<{ stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>; userErrors: Array<{ message: string }> } }>(
    creds,
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
    { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("staged upload returned no target");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok) throw new Error(`staged POST ${up.status}`);
  const fileData = await shopifyGraphQL<{ fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }>; userErrors: Array<{ message: string }> } }>(
    creds,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on MediaImage { id image { url } } ... on GenericFile { id url } } userErrors { message } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] }
  );
  const file = fileData.fileCreate.files[0];
  if (!file?.id) throw new Error("fileCreate returned no id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    ).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("file upload never returned URL");
  return url;
}

type Materialized = {
  slug: string;
  name: string;
  brandModel: string;
  shopifyProductId?: number;
  shopifyAdminUrl?: string;
  printfulSyncProductId?: number;
  status: "created" | "failed";
  error?: string;
};

async function materializeItem(item: CollectionItem, designUrl: string, shopifyCreds: ShopifyCreds, isFirst: boolean): Promise<Materialized> {
  console.log(`\n[${item.slug}] starting…`);
  try {
    // Look up product_id and Black size variants
    const variantInfo = await pfFetch("GET", `/products/variant/${item.baseVariantId}`);
    const productId = variantInfo.result?.variant?.product_id as number;
    const productData = await pfFetch("GET", `/products/${productId}`);
    const allVariants = (productData.result?.variants ?? []) as Array<{ id: number; size: string; color: string; price: string }>;
    // Exact "Black" only — some products have variants like "Multicam Black"
    // that would also match a loose /black/i filter and cause external_id collisions.
    const blackVariants = allVariants.filter((v) => /^black$/i.test(v.color.trim()));
    if (!blackVariants.length) throw new Error(`No Black variants for product ${productId}`);
    console.log(`[${item.slug}] product_id=${productId} sizes=${blackVariants.map((v) => v.size).join(",")}`);

    // Create Printful sync product
    const syncVariants = blackVariants.map((sv) => ({
      // Variant id makes external_id unique even if a product has overlapping size labels.
      external_id: `bv-${item.slug}-${sv.id}-${sv.size.replace(/[^A-Z0-9]/gi, "")}`,
      variant_id: sv.id,
      retail_price: item.retailPrice,
      files: [{ type: item.embroideryPlacement, url: designUrl }],
      options: [{ id: item.threadColorOptionId, value: [THREAD_COLOR_OLD_GOLD] }]
    }));
    const syncResp = await pfFetch("POST", "/store/products", {
      sync_product: { external_id: `bv-${item.slug}`, name: item.name, thumbnail: designUrl },
      sync_variants: syncVariants
    });
    const syncProductId = syncResp.result?.id as number;
    if (!syncProductId) throw new Error("No sync product id returned");
    console.log(`[${item.slug}] sync product=${syncProductId}`);

    // Generate mockup (rate-limit aware: sleep 65s before each task except the first)
    if (!isFirst) {
      console.log(`[${item.slug}] sleeping 65s for Printful mockup-gen rate limit…`);
      await new Promise((r) => setTimeout(r, 65000));
    }
    const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${productId}`, {
      variant_ids: blackVariants.map((v) => v.id),
      format: "jpg",
      technique: "EMBROIDERY",
      files: [{ placement: item.embroideryPlacement, image_url: designUrl, position: item.position }]
    });
    const taskKey = taskResp.result?.task_key as string | undefined;
    if (!taskKey) throw new Error("create-task returned no task_key");
    console.log(`[${item.slug}] mockup task=${taskKey} polling…`);

    let mockupUrls: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 4000));
      const taskData = await pfFetch("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
      const status = taskData.result?.status as string;
      if (status === "completed") {
        const mockups = (taskData.result?.mockups ?? []) as Array<{ mockup_url?: string; extra?: Array<{ url?: string }> }>;
        const set = new Set<string>();
        mockups.forEach((m) => { if (m.mockup_url) set.add(m.mockup_url); (m.extra ?? []).forEach((e) => e.url && set.add(e.url)); });
        mockupUrls = [...set];
        break;
      }
      if (status === "failed") throw new Error(`Mockup task failed: ${JSON.stringify(taskData.result)}`);
    }
    console.log(`[${item.slug}] ${mockupUrls.length} mockup URLs`);

    // Create Shopify draft listing
    const sizeNames = blackVariants.map((v) => v.size);
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
        sku: `BV-${item.slug.toUpperCase()}-${size.replace(/[^A-Z0-9]/gi, "")}`
      }))
    };
    const created = await shopifyRest<{ product?: { id: number } }>(shopifyCreds, "/products.json", {
      method: "POST",
      body: JSON.stringify({ product: productPayload })
    });
    const shopifyProductId = created.product?.id;
    if (!shopifyProductId) throw new Error("Shopify product create returned no id");

    // Attach mockups (cap at 5)
    for (const url of mockupUrls.slice(0, 5)) {
      try {
        await shopifyRest(shopifyCreds, `/products/${shopifyProductId}/images.json`, {
          method: "POST",
          body: JSON.stringify({ image: { src: url, alt: item.name } })
        });
      } catch (e) {
        console.warn(`[${item.slug}] image attach warning: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`[${item.slug}] ✓ shopify product ${shopifyProductId}`);
    return {
      slug: item.slug,
      name: item.name,
      brandModel: item.brandModel,
      shopifyProductId,
      shopifyAdminUrl: `https://${shopifyCreds.storeDomain}/admin/products/${shopifyProductId}`,
      printfulSyncProductId: syncProductId,
      status: "created"
    };
  } catch (e) {
    return { slug: item.slug, name: item.name, brandModel: item.brandModel, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo not found at ${LOGO_PATH}`);
  ensurePrintful();
  const shopifyCreds = resolveShopifyCredentials(BRAND);
  console.log(`[init] uploading BV Monogram for expansion…`);
  const designUrl = await uploadLogoOnce(shopifyCreds);
  console.log(`[init] design URL: ${designUrl}\n`);

  const results: Materialized[] = [];
  for (let i = 0; i < COLLECTION.length; i += 1) {
    results.push(await materializeItem(COLLECTION[i], designUrl, shopifyCreds, i === 0));
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log("\n=== EXPANSION SUMMARY ===");
  for (const r of results) {
    if (r.status === "created") {
      console.log(`✓ ${r.name}  (${r.brandModel})  shopify=${r.shopifyProductId}  printful=${r.printfulSyncProductId}`);
    } else {
      console.log(`✗ ${r.name}  ERROR: ${r.error}`);
    }
  }
  console.log(`\nSaved to ${RESULTS_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
