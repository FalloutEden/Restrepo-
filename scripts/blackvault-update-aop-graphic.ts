// Update all 7 BV AOP products to use the new "BV AOP Linear Graphic" pattern.
// Polo is special — it uses the merchant's hand-designed Printful template
// (id 102235494) which already encodes the right pattern + placement
// arrangement. The other 6 AOP products (bomber, hoodie, sweatshirt, jersey,
// men's tee, women's tee) get the upscaled linear graphic on every placement.
//
// Idempotent: re-running just re-points all sync_variants to the same files.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-update-aop-graphic.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PATTERN_PATH = path.join(process.cwd(), ".openclaw", "brand", "BV AOP Linear Graphic-printful.png");
const POLO_TEMPLATE_ID = 102235494;
const PF_BASE = "https://api.printful.com";

async function pfFetch(method: "GET" | "PUT" | "POST", urlPath: string, body?: unknown) {
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

async function uploadPatternToShopifyFiles(creds: ShopifyCredentials): Promise<string> {
  const buffer = fs.readFileSync(PATTERN_PATH);
  const filename = `bv-aop-linear-graphic-${Date.now()}.png`;
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
  // Larger files (the 6.4 MB upscaled pattern) take longer to be available.
  // 50 polls × up to 3s = ~2 min budget.
  for (let i = 0; i < 50 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 1500 + Math.min(i * 100, 1500)));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(
      creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    );
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("Never got URL after 50 polls");
  return url;
}

type AopProduct = { title: string; shopifyId: number; syncId: number; isPolo: boolean };

async function main() {
  if (!fs.existsSync(PATTERN_PATH)) throw new Error(`Missing ${PATTERN_PATH}`);
  const creds = resolveShopifyCredentials(BRAND);

  // Find all AOP products
  const list = await shopifyRest<{ products: Array<{ id: number; title: string; tags: string }> }>(
    creds,
    "/products.json?limit=250&fields=id,title,tags",
    { method: "GET" }
  );
  const aop: AopProduct[] = [];
  for (const p of list.products) {
    const tags = p.tags.split(",").map((t) => t.trim());
    if (!tags.includes("all-over-print")) continue;
    const syncTag = tags.find((t) => /^printful-sync:\d+$/.test(t));
    if (!syncTag) continue;
    aop.push({
      title: p.title,
      shopifyId: p.id,
      syncId: Number(syncTag.split(":")[1]),
      isPolo: /polo/i.test(p.title)
    });
  }
  console.log(`[init] ${aop.length} AOP product(s) to update`);
  for (const p of aop) console.log(`  - ${p.title}${p.isPolo ? " (polo — using template)" : ""}`);

  console.log(`\n[upload] uploading new linear graphic to Shopify Files…`);
  const newGraphicUrl = await uploadPatternToShopifyFiles(creds);
  console.log(`[upload] ${newGraphicUrl}`);

  for (const product of aop) {
    console.log(`\n[${product.title}] updating sync ${product.syncId}…`);
    try {
      // Get current variants so we know which to PUT
      const detail = await pfFetch("GET", `/store/products/${product.syncId}`);
      const variants = (detail.result?.sync_variants ?? []) as Array<{
        id: number;
        retail_price: string;
        files?: Array<{ type?: string; url?: string }>;
      }>;

      let updates;
      if (product.isPolo) {
        // Polo uses the merchant's Printful template — every variant gets
        // product_template_id, no manual files needed.
        updates = variants.map((v) => ({
          id: v.id,
          retail_price: v.retail_price,
          product_template_id: POLO_TEMPLATE_ID
        }));
      } else {
        // Other AOP products: replace every existing placement with the new graphic.
        // Use the placements that were on the variant (front/default/back/sleeves)
        // so we preserve the per-product placement set.
        const placementsForProduct = new Set<string>();
        for (const v of variants) {
          for (const f of v.files ?? []) {
            if (f.type && f.type !== "preview") placementsForProduct.add(f.type);
          }
        }
        if (placementsForProduct.size === 0) {
          console.warn(`  no placements found, skipping`);
          continue;
        }
        const newFiles = Array.from(placementsForProduct).map((p) => ({ type: p, url: newGraphicUrl }));
        console.log(`  replacing ${placementsForProduct.size} placement(s): ${Array.from(placementsForProduct).join(", ")}`);
        updates = variants.map((v) => ({
          id: v.id,
          retail_price: v.retail_price,
          files: newFiles
        }));
      }

      await pfFetch("PUT", `/store/products/${product.syncId}`, { sync_variants: updates });
      console.log(`  ✓ ${variants.length} variant(s) updated`);
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n=== Done. Mockups will re-render in ~1-2 min. ===`);
  console.log(`Run blackvault-attach-all-aop-previews.ts after that to refresh Shopify images.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
