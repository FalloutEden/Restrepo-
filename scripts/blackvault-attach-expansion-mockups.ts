// Poll Printful for the mockup previews of the May 4 expansion run (13 SKUs)
// and attach them to the corresponding Shopify drafts. Same pattern as
// blackvault-attach-mockups.ts but reads both result files (the main run
// and the polo retry).
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-attach-expansion-mockups.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const RESULT_FILES = [
  path.join(BRAND_DIR, "expansion-2026-05-04-results.json"),
  path.join(BRAND_DIR, "expansion-2026-05-04-polo-retry-results.json")
];

type Result = {
  slug: string;
  name: string;
  color?: string;
  shopifyProductId?: number;
  printfulSyncProductId?: number;
  status: string;
};

async function pfGet(token: string, storeId: string, p: string) {
  const r = await fetch(`https://api.printful.com${p}`, {
    headers: { Authorization: `Bearer ${token}`, "X-PF-Store-Id": storeId }
  });
  if (!r.ok) throw new Error(`Printful GET ${p} (${r.status}): ${await r.text()}`);
  return r.json();
}

async function getMockupUrl(token: string, storeId: string, syncProductId: number): Promise<string | null> {
  const data = await pfGet(token, storeId, `/store/products/${syncProductId}`);
  const sp = data.result?.sync_product;
  if (sp?.thumbnail_url && !/embroidery|monogram/i.test(sp.thumbnail_url)) return sp.thumbnail_url;
  const variants = data.result?.sync_variants ?? [];
  for (const v of variants) {
    const file = (v.files ?? []).find((f: { type?: string; preview_url?: string }) => f.type === "preview" && f.preview_url);
    if (file?.preview_url) return file.preview_url;
    if (v.product?.image && !/embroidery|monogram/i.test(v.product.image)) return v.product.image;
  }
  return null;
}

async function shopifyAttachImage(
  creds: { storeDomain: string; apiVersion: string; token: string },
  productId: number,
  imageUrl: string,
  alt: string
) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/products/${productId}/images.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ image: { src: imageUrl, alt } })
  });
  if (!r.ok) throw new Error(`Shopify attach (${r.status}): ${await r.text()}`);
}

async function main() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID");
  const shopifyCreds = resolveShopifyCredentials(BRAND);

  const results: Result[] = [];
  for (const file of RESULT_FILES) {
    if (!fs.existsSync(file)) {
      console.warn(`[init] result file not found: ${file}`);
      continue;
    }
    const arr: Result[] = JSON.parse(fs.readFileSync(file, "utf8"));
    results.push(...arr);
  }

  const created = results.filter((r) => r.status === "created" && r.printfulSyncProductId && r.shopifyProductId);
  console.log(`[init] ${created.length} sync products to poll`);

  let attached = 0;
  for (const item of created) {
    console.log(`\n[${item.slug}] polling Printful sync ${item.printfulSyncProductId}…`);
    let mockupUrl: string | null = null;
    for (let attempt = 0; attempt < 8 && !mockupUrl; attempt += 1) {
      mockupUrl = await getMockupUrl(token, storeId, item.printfulSyncProductId!).catch((e) => {
        console.warn(`  attempt ${attempt}: ${e.message}`);
        return null;
      });
      if (!mockupUrl) await new Promise((r) => setTimeout(r, 8000));
    }
    if (!mockupUrl) {
      console.log(`[${item.slug}] no mockup after 8 attempts — skipping`);
      continue;
    }
    console.log(`[${item.slug}] mockup: ${mockupUrl}`);
    try {
      await shopifyAttachImage(shopifyCreds, item.shopifyProductId!, mockupUrl, item.name);
      console.log(`[${item.slug}] ✓ attached to Shopify product ${item.shopifyProductId}`);
      attached += 1;
    } catch (e) {
      console.warn(`[${item.slug}] attach failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${attached}/${created.length} mockups attached.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
