// Retry the 2 Performance Polo SKUs that failed in the main expansion run.
// Adidas A430 (product 767) returns 404 from Printful API — swapping to
// Under Armour 1370399 (product 766) which is the closest equivalent
// Travis-Mathew-tier performance polo that IS API-accessible.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-retry-polo-2026-05-04.ts

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
  printfulProductId: number;
  color: "Black" | "White";
  retailPrice: string;
  productType: string;
  description: string;
};

const COLLECTION: ExpansionItem[] = [
  {
    slug: "the-performance-polo-black",
    name: "The Performance Polo",
    brandModel: "Under Armour 1370399",
    printfulProductId: 766,
    color: "Black",
    retailPrice: "78.00",
    productType: "Polo",
    description: [
      "<p>A performance pique polo from Under Armour, finished in black with the BV monogram",
      "embroidered in Old Gold thread at the left chest.</p>",
      "<p>Anti-odor technology, moisture-wicking polyester knit with stretch.",
      "Three-button placket. Engineered for movement, finished for the office. The course-to-cocktail polo.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  },
  {
    slug: "the-performance-polo-white",
    name: "The Performance Polo in White",
    brandModel: "Under Armour 1370399",
    printfulProductId: 766,
    color: "White",
    retailPrice: "78.00",
    productType: "Polo",
    description: [
      "<p>A performance pique polo from Under Armour in pure white, with the BV monogram",
      "embroidered in Old Gold thread at the left chest.</p>",
      "<p>Anti-odor technology, moisture-wicking polyester knit with stretch.",
      "Three-button placket. The performance fabric of a course polo, finished with restraint.</p>",
      "<p>Built to be Kept.</p>"
    ].join(" ")
  }
];

const PF_BASE = "https://api.printful.com";
const PREFERRED_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

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
type ShopifyCreds = { storeDomain: string; apiVersion: string; token: string };

async function getColorSizeVariants(productId: number, colorMatch: RegExp): Promise<PfVariant[]> {
  const data = await pfGet(`/products/${productId}`);
  const all = (data.result?.variants ?? []) as PfVariant[];
  const matches = all.filter((v) => colorMatch.test(v.color) && PREFERRED_SIZE_ORDER.includes(v.size));
  return matches.sort((a, b) => PREFERRED_SIZE_ORDER.indexOf(a.size) - PREFERRED_SIZE_ORDER.indexOf(b.size));
}

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

// Reuse the embroidery file the main run uploaded (it's still on the Shopify
// CDN). If something changed, we'd re-upload — for this retry, the URL from
// the previous run's log works.
const EMBROIDERY_URL =
  "https://cdn.shopify.com/s/files/1/0674/3991/9202/files/blackvault-monogram-embroidery-1777902248141.png?v=1777902234";

async function materializeItem(item: ExpansionItem, embroideryFileUrl: string, creds: ShopifyCreds) {
  console.log(`\n[${item.slug}] starting…`);
  try {
    const colorMatch = new RegExp(`^${item.color}$`, "i");
    const sizes = await getColorSizeVariants(item.printfulProductId, colorMatch);
    if (sizes.length === 0) throw new Error(`No ${item.color} size variants for product ${item.printfulProductId}`);
    console.log(`[${item.slug}] product=${item.printfulProductId} color=${item.color} sizes=${sizes.map((s) => s.size).join(",")}`);

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
        "gender:men"
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
      status: "created" as const
    };
  } catch (e) {
    return {
      slug: item.slug,
      name: item.name,
      color: item.color,
      status: "failed" as const,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo not found at ${LOGO_PATH}`);
  const shopifyCreds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${shopifyCreds.brandSlug} store=${shopifyCreds.storeDomain}`);
  ensurePrintful();
  console.log(`[init] reusing embroidery file: ${EMBROIDERY_URL}`);

  const results = [];
  for (const item of COLLECTION) {
    results.push(await materializeItem(item, EMBROIDERY_URL, shopifyCreds));
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    if (r.status === "created") {
      console.log(`✓ ${r.name} [${r.color}]  shopify=${r.shopifyProductId}  printful=${r.printfulSyncProductId}`);
      console.log(`  ${r.shopifyAdminUrl}`);
    } else {
      console.log(`✗ ${r.name} [${r.color}]  ERROR: ${r.error}`);
    }
  }

  const outFile = path.join(BRAND_DIR, "expansion-2026-05-04-polo-retry-results.json");
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
