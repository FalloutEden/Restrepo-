// After the launch script creates Printful sync products, their mockup
// previews take 1–3 minutes to render. This script polls each sync product
// for its preview image and attaches it as the primary product image on the
// matching Shopify draft.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-attach-mockups.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const RESULTS_PATH = path.join(process.cwd(), ".openclaw", "brand", "launch-collection-results.json");

type Result = {
  slug: string;
  name: string;
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
  // Try multiple paths Printful might place the preview at
  const sp = data.result?.sync_product;
  if (sp?.thumbnail_url && !/embroidery/i.test(sp.thumbnail_url)) return sp.thumbnail_url;
  const variants = data.result?.sync_variants ?? [];
  for (const v of variants) {
    const file = (v.files ?? []).find((f: { type?: string; preview_url?: string }) => f.type === "preview" && f.preview_url);
    if (file?.preview_url) return file.preview_url;
    if (v.product?.image && !/embroidery/i.test(v.product.image)) return v.product.image;
  }
  return null;
}

async function shopifyAttachImage(creds: { storeDomain: string; apiVersion: string; token: string }, productId: number, imageUrl: string, alt: string) {
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
  const results: Result[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  const created = results.filter((r) => r.status === "created" && r.printfulSyncProductId && r.shopifyProductId);
  console.log(`[init] ${created.length} sync products to poll`);

  // Poll each up to 6 attempts (90s total per product max)
  for (const item of created) {
    console.log(`\n[${item.slug}] polling Printful sync ${item.printfulSyncProductId}…`);
    let mockupUrl: string | null = null;
    for (let attempt = 0; attempt < 8 && !mockupUrl; attempt += 1) {
      mockupUrl = await getMockupUrl(token, storeId, item.printfulSyncProductId!).catch((e) => { console.warn(`  attempt ${attempt}: ${e.message}`); return null; });
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
    } catch (e) {
      console.warn(`[${item.slug}] attach failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
