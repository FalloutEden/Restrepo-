// The original launch created Printful sync products referencing the FULL BV
// lockup (monogram + "BLACK VAULT APPAREL" wordmark). At chest-emblem size
// the wordmark embroiders as unreadable thread garbage. This script swaps the
// embroidery file on each existing sync product to the monogram-only crop, so
// the actual production order — when one comes in — uses the cleaner design.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-update-sync-files.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const RESULTS_PATH = path.join(BRAND_DIR, "launch-collection-results.json");

const THREAD_COLOR_OLD_GOLD = "#A67843";
const PF_BASE = "https://api.printful.com";

type ShopifyCreds = { storeDomain: string; apiVersion: string; token: string };

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

async function uploadToShopifyFiles(creds: ShopifyCreds, buffer: Buffer, filename: string): Promise<string> {
  const staged = await shopifyGraphQL<{ stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>; userErrors: Array<{ message: string }> } }>(
    creds,
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
    { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("staged upload target missing");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok) throw new Error(`staged POST ${up.status}`);

  const fileData = await shopifyGraphQL<{ fileCreate: { files: Array<{ id?: string; url?: string; image?: { url?: string } }>; userErrors: Array<{ message: string }> } }>(
    creds,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on MediaImage { id image { url } } ... on GenericFile { id url } } userErrors { message } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] }
  );
  const file = fileData.fileCreate.files[0];
  if (!file?.id) throw new Error("fileCreate returned no id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(
      creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    ).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("no URL returned");
  return url;
}

async function pfFetch(method: "GET" | "PUT" | "DELETE", urlPath: string, body?: unknown) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
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

type Result = { slug: string; name: string; printfulSyncProductId?: number; status: string };

async function updateSyncProductFiles(syncProductId: number, newFileUrl: string) {
  // Fetch existing sync product to know its variants
  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
    id: number;
    external_id?: string;
    variant_id: number;
    retail_price: string;
  }>;
  console.log(`  ${syncVariants.length} sync variants to update`);

  // PUT replaces the sync_variants array. Position config matches the mockup
  // generator's settings so production embroidery sizes/places identically.
  const body = {
    sync_variants: syncVariants.map((sv) => ({
      id: sv.id,
      external_id: sv.external_id,
      variant_id: sv.variant_id,
      retail_price: sv.retail_price,
      files: [{
        type: "embroidery_chest_left",
        url: newFileUrl,
        position: {
          area_width: 1200,
          area_height: 1200,
          width: 650,
          height: 650,
          top: 275,
          left: 175
        }
      }],
      options: [
        { id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] },
        { id: "lifelike", value: true }
      ]
    }))
  };
  await pfFetch("PUT", `/store/products/${syncProductId}`, body);
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo not found at ${LOGO_PATH}`);
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] uploading BV Monogram.png to Shopify Files…`);
  const newUrl = await uploadToShopifyFiles(creds, fs.readFileSync(LOGO_PATH), "blackvault-monogram-prod.png");
  console.log(`[init] new file URL: ${newUrl}\n`);

  const results: Result[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  const items = results.filter((r) => r.status === "created" && r.printfulSyncProductId);
  for (const item of items) {
    console.log(`[${item.slug}] updating sync product ${item.printfulSyncProductId}…`);
    try {
      await updateSyncProductFiles(item.printfulSyncProductId!, newUrl);
      console.log(`[${item.slug}] ✓ updated`);
    } catch (e) {
      console.warn(`[${item.slug}] failed: ${e instanceof Error ? e.message : e}`);
    }
    // Avoid hammering Printful — small delay between updates
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("\nDone. Production embroidery on all sync products now points to monogram-only file.");
}

main().catch((e) => { console.error(e); process.exit(1); });
