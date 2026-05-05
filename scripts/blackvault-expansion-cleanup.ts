// Delete the 13 expansion drafts created on 2026-05-04 from BOTH Shopify and
// Printful. The drafts had two issues:
//   1. Embroidery sizing wasn't tuned (used Printful default — too big)
//   2. The 2 Performance Polos used Under Armour 1370399 which has visible
//      UA branding on the garment (off-brand for BV)
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-expansion-cleanup.ts

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
  shopifyProductId?: number;
  printfulSyncProductId?: number;
  status: string;
};

async function shopifyDelete(creds: { storeDomain: string; apiVersion: string; token: string }, productId: number) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/products/${productId}.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": creds.token }
  });
  if (!r.ok) throw new Error(`Shopify DELETE (${r.status}): ${await r.text()}`);
}

async function printfulDelete(token: string, storeId: string, syncProductId: number) {
  const r = await fetch(`https://api.printful.com/store/products/${syncProductId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "X-PF-Store-Id": storeId }
  });
  if (!r.ok && r.status !== 404) throw new Error(`Printful DELETE (${r.status}): ${await r.text()}`);
}

async function main() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  const creds = resolveShopifyCredentials(BRAND);

  const results: Result[] = [];
  for (const file of RESULT_FILES) {
    if (fs.existsSync(file)) {
      results.push(...(JSON.parse(fs.readFileSync(file, "utf8")) as Result[]));
    }
  }
  const created = results.filter((r) => r.status === "created");
  console.log(`[init] cleaning up ${created.length} drafts\n`);

  for (const item of created) {
    console.log(`[${item.slug}]`);
    if (item.shopifyProductId) {
      try {
        await shopifyDelete(creds, item.shopifyProductId);
        console.log(`  ✓ shopify ${item.shopifyProductId} deleted`);
      } catch (e) {
        console.warn(`  ✗ shopify delete: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (item.printfulSyncProductId) {
      try {
        await printfulDelete(token, storeId, item.printfulSyncProductId);
        console.log(`  ✓ printful sync ${item.printfulSyncProductId} deleted`);
      } catch (e) {
        console.warn(`  ✗ printful delete: ${e instanceof Error ? e.message : e}`);
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  // Move the result files aside so the next run doesn't try to re-clean them.
  for (const file of RESULT_FILES) {
    if (fs.existsSync(file)) {
      fs.renameSync(file, `${file}.cleaned-up`);
    }
  }
  console.log("\nDone — results files renamed to .cleaned-up");
}

main().catch((e) => { console.error(e); process.exit(1); });
