// Retry the single Phase-1 rate-limit casualty from the v2 expansion run.
// the-womens-hoodie-white was the 11th in the loop and Printful's
// /store/products endpoint started 429ing. Retrying alone after a cool-down
// avoids that.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-retry-womens-hoodie-white.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const THREAD_COLOR_OLD_GOLD = "#A67843";

const CHEST_POSITION = {
  area_width: 1200,
  area_height: 1200,
  width: 450,
  height: 450,
  top: 375,
  left: 275
};

// Reuse the design URL the main v2 run already uploaded — saves the file upload
// step entirely. URL pulled from the v2 log.
const DESIGN_URL =
  "https://cdn.shopify.com/s/files/1/0674/3991/9202/files/blackvault-monogram-v2-1777903990391.png?v=1777903977";

const ITEM = {
  slug: "the-womens-hoodie-white",
  name: "The Hoodie in White",
  brandModel: "Stanley/Stella SASW035",
  printfulProductId: 832,
  color: "White",
  retailPrice: "148.00",
  productType: "Women's Hoodie",
  description:
    "<p>A women's pullover hoodie in GOTS-certified organic cotton, finished in pure white. Soft brushed fleece interior, kangaroo pocket, ribbed cuffs and hem. The BV monogram is embroidered in Old Gold thread at the left chest.</p><p>The clean canvas knit, sized and shaped for the women's cut. Built to be Kept.</p>"
};

const PF_BASE = "https://api.printful.com";
const PREFERRED_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  return { token, storeId };
}

async function pfFetch(method: "GET" | "POST", urlPath: string, body?: unknown) {
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

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] retry ${ITEM.slug}`);

  // Get White size variants
  const data = await pfFetch("GET", `/products/${ITEM.printfulProductId}`);
  type V = { id: number; size: string; color: string; price: string };
  const all = (data.result?.variants ?? []) as V[];
  const sizes = all
    .filter((v) => /^white$/i.test(v.color) && PREFERRED_SIZE_ORDER.includes(v.size))
    .sort((a, b) => PREFERRED_SIZE_ORDER.indexOf(a.size) - PREFERRED_SIZE_ORDER.indexOf(b.size));
  console.log(`  sizes=${sizes.map((s) => s.size).join(",")}`);

  // Phase 1: Printful sync product with positioned embroidery
  const syncResp = await pfFetch("POST", `/store/products`, {
    sync_product: { external_id: `bv-${ITEM.slug}`, name: ITEM.name, thumbnail: DESIGN_URL },
    sync_variants: sizes.map((sv) => ({
      external_id: `bv-${ITEM.slug}-${sv.size}`,
      variant_id: sv.id,
      retail_price: ITEM.retailPrice,
      files: [{ type: "embroidery_chest_left", url: DESIGN_URL, position: CHEST_POSITION }],
      options: [
        { id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] },
        { id: "lifelike", value: true }
      ]
    }))
  });
  const syncProductId = syncResp.result?.id as number;
  console.log(`  printful sync ${syncProductId}`);

  // Phase 2: Shopify draft (no images yet)
  const sizeNames = sizes.map((s) => s.size);
  const created = await shopifyRest<{ product?: { id: number } }>(creds, "/products.json", {
    method: "POST",
    body: JSON.stringify({
      product: {
        title: ITEM.name,
        body_html: ITEM.description,
        vendor: "Black Vault Apparel",
        product_type: ITEM.productType,
        status: "draft",
        tags: [
          "autonomous-product",
          "agent-materialized",
          "brand:black-vault-apparel",
          "fulfillment:printful",
          "embroidery",
          "color:white",
          `printful-sync:${syncProductId}`,
          `printful-base:${ITEM.brandModel}`,
          "gender:women"
        ],
        options: [{ name: "Size", values: sizeNames }],
        variants: sizeNames.map((size) => ({
          option1: size,
          price: ITEM.retailPrice,
          sku: `BV-${ITEM.slug.toUpperCase()}-${size}`
        }))
      }
    })
  });
  const shopifyProductId = created.product?.id;
  if (!shopifyProductId) throw new Error("No Shopify id");
  console.log(`  shopify draft ${shopifyProductId}`);

  // Phase 3: positioned mockup
  const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${ITEM.printfulProductId}`, {
    variant_ids: sizes.map((s) => s.id),
    format: "jpg",
    technique: "EMBROIDERY",
    files: [{ placement: "embroidery_chest_left", image_url: DESIGN_URL, position: CHEST_POSITION }]
  });
  const taskKey = taskResp.result?.task_key as string;
  console.log(`  mockup task ${taskKey}`);

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
  console.log(`  ${mockups.length} mockups returned`);

  // Phase 4: wipe any auto-attached images, attach mockups as primary
  const existing = await shopifyRest<{ images: Array<{ id: number }> }>(creds, `/products/${shopifyProductId}/images.json`, { method: "GET" });
  for (const img of existing.images ?? []) {
    await shopifyRest(creds, `/products/${shopifyProductId}/images/${img.id}.json`, { method: "DELETE" });
  }
  for (const url of mockups.slice(0, 5)) {
    await shopifyRest(creds, `/products/${shopifyProductId}/images.json`, {
      method: "POST",
      body: JSON.stringify({ image: { src: url, alt: ITEM.name } })
    });
  }
  console.log(`  ✓ wiped ${existing.images?.length ?? 0} old, attached ${Math.min(mockups.length, 5)} mockups`);

  // Append to v2 results file
  const resultsPath = path.join(BRAND_DIR, "expansion-v2-results.json");
  const existingResults = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, "utf8")) : [];
  existingResults.push({
    slug: ITEM.slug,
    name: ITEM.name,
    color: ITEM.color,
    printfulProductId: ITEM.printfulProductId,
    shopifyProductId,
    printfulSyncProductId: syncProductId,
    variantIds: sizes.map((s) => s.id)
  });
  fs.writeFileSync(resultsPath, JSON.stringify(existingResults, null, 2));

  console.log(`\n✓ ${ITEM.name}  shopify=${shopifyProductId}  printful=${syncProductId}`);
  console.log(`  https://${creds.storeDomain}/admin/products/${shopifyProductId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
