// Update the existing AOP Polo Printful sync product to use the new
// custom centered front file (aop-polo-front-centered.png) on the front
// placement, keeping alloverme on back + sleeves.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-update-polo-front.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const POLO_FRONT_PATH = path.join(process.cwd(), ".openclaw", "brand", "aop-polo-front-centered.png");
const ALL_PATTERN_PATH = path.join(process.cwd(), ".openclaw", "brand", "BV Alloverme.png");

const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET" | "PUT", urlPath: string, body?: unknown) {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful credentials");
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

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function shopifyGraphQL<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>) {
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

async function uploadToShopifyFiles(creds: ShopifyCredentials, filePath: string, label: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const filename = `bv-aop-${label}-${Date.now()}.png`;
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

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  const list = await shopifyRest<{ products: Array<{ id: number; title: string; tags: string }> }>(
    creds,
    `/products.json?limit=250&fields=id,title,tags`,
    { method: "GET" }
  );
  const polo = list.products.find((p) => p.title === "The AOP Polo — Men's");
  if (!polo) throw new Error("Polo product not found");
  const syncTag = polo.tags.split(",").map((t) => t.trim()).find((t) => /^printful-sync:\d+$/.test(t));
  if (!syncTag) throw new Error("No printful-sync tag");
  const syncProductId = Number(syncTag.split(":")[1]);
  console.log(`[init] polo sync_product_id=${syncProductId}`);

  console.log(`[upload] uploading custom front + alloverme to Shopify Files…`);
  const [frontUrl, allUrl] = await Promise.all([
    uploadToShopifyFiles(creds, POLO_FRONT_PATH, "polo-front-centered"),
    uploadToShopifyFiles(creds, ALL_PATTERN_PATH, "polo-all")
  ]);
  console.log(`[upload] front=${frontUrl}`);
  console.log(`[upload] all  =${allUrl}`);

  const detail = await pfFetch("GET", `/store/products/${syncProductId}`);
  const variants = detail.result?.sync_variants ?? [];
  const updates = variants.map((v: { id: number; retail_price: string }) => ({
    id: v.id,
    retail_price: v.retail_price,
    files: [
      { type: "front", url: frontUrl },
      { type: "back", url: allUrl },
      { type: "sleeve_left", url: allUrl },
      { type: "sleeve_right", url: allUrl }
    ]
  }));

  console.log(`[update] PUTting ${updates.length} variants with custom front file…`);
  await pfFetch("PUT", `/store/products/${syncProductId}`, { sync_variants: updates });
  console.log(`✓ Polo updated. Mockup will re-render in ~1-2 minutes.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
