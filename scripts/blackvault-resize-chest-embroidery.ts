// Apply the smaller-and-shifted-left chest embroidery position to every
// chest_left product (original 5 tees + polo). Updates BOTH the production
// sync product files (so actual orders get the new size) AND the visual
// mockup images on the matching Shopify drafts.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-resize-chest-embroidery.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const PF_BASE = "https://api.printful.com";

const THREAD_COLOR_OLD_GOLD = "#A67843";

// Tuned 2026-04-30 round 2: dropped to 450 (Travis Mathew / Live Lucky scale —
// elegant tiny chest emblem, ~1.5 inches at production). Same horizontal/vertical
// center as the prior pass (500, 600).
const CHEST_POSITION = {
  area_width: 1200,
  area_height: 1200,
  width: 450,
  height: 450,
  top: 375,
  left: 275
};

// All chest_left products: original 5 tees + the polo. Hardcoded for surgical
// targeting — sock/sweatpants/cap have different placements and aren't touched.
const TARGETS: Array<{ slug: string; syncProductId: number; productId: number; shopifyProductId: number }> = [
  { slug: "the-monogram-tee",      syncProductId: 430513612, productId: 508, shopifyProductId: 7623581532258 },
  { slug: "the-vault-tee",         syncProductId: 430513709, productId: 586, shopifyProductId: 7623581597794 },
  { slug: "the-heavyweight-hoodie",syncProductId: 430513822, productId: 831, shopifyProductId: 7623581728866 },
  { slug: "the-crewneck",          syncProductId: 430513982, productId: 845, shopifyProductId: 7623582023778 },
  { slug: "the-long-sleeve",       syncProductId: 430514134, productId: 748, shopifyProductId: 7623582089314 },
  { slug: "the-polo",              syncProductId: 430528053, productId: 340, shopifyProductId: 7623687864418 }
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

async function uploadLogo(creds: ShopifyCreds): Promise<string> {
  const buf = fs.readFileSync(LOGO_PATH);
  const filename = "blackvault-monogram-resize.png";
  const staged = await shopifyGraphQL<{ stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }> } }>(creds,
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } } }`,
    { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buf], { type: "image/png" }), filename);
  await fetch(target.url, { method: "POST", body: form });
  const fc = await shopifyGraphQL<{ fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> } }>(creds,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on MediaImage { id image { url } } ... on GenericFile { id url } } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] });
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("no file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("no URL");
  return url;
}

async function updateProductionFile(target: typeof TARGETS[0], newFileUrl: string) {
  const detail = await pfFetch("GET", `/store/products/${target.syncProductId}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
    id: number; external_id?: string; variant_id: number; retail_price: string;
  }>;
  await pfFetch("PUT", `/store/products/${target.syncProductId}`, {
    sync_variants: syncVariants.map((sv) => ({
      id: sv.id,
      external_id: sv.external_id,
      variant_id: sv.variant_id,
      retail_price: sv.retail_price,
      files: [{ type: "embroidery_chest_left", url: newFileUrl, position: CHEST_POSITION }],
      options: [{ id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] }]
    }))
  });
}

async function regenerateMockup(target: typeof TARGETS[0], creds: ShopifyCreds, designUrl: string, sleepBefore: boolean) {
  if (sleepBefore) {
    console.log(`  sleeping 65s for Printful mockup-gen rate limit…`);
    await new Promise((r) => setTimeout(r, 65000));
  }
  // Get Black size variants
  const productData = await pfFetch("GET", `/products/${target.productId}`);
  const variants = (productData.result?.variants ?? []).filter((v: { color?: string }) => /^black$/i.test(v.color?.trim() ?? ""));
  const variantIds = variants.map((v: { id: number }) => v.id);

  const taskResp = await pfFetch("POST", `/mockup-generator/create-task/${target.productId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "EMBROIDERY",
    files: [{ placement: "embroidery_chest_left", image_url: designUrl, position: CHEST_POSITION }]
  });
  const taskKey = taskResp.result?.task_key as string;
  console.log(`  task=${taskKey} polling…`);

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

  // Wipe existing Shopify images and attach new ones
  const existing = await shopifyRest<{ images: Array<{ id: number }> }>(creds, `/products/${target.shopifyProductId}/images.json`, { method: "GET" });
  for (const img of existing.images ?? []) {
    await shopifyRest(creds, `/products/${target.shopifyProductId}/images/${img.id}.json`, { method: "DELETE" });
  }
  for (const url of mockups.slice(0, 5)) {
    await shopifyRest(creds, `/products/${target.shopifyProductId}/images.json`, {
      method: "POST",
      body: JSON.stringify({ image: { src: url, alt: target.slug } })
    });
  }
  console.log(`  ✓ wiped ${existing.images?.length ?? 0} old, attached ${Math.min(mockups.length, 5)} new`);
}

async function main() {
  ensurePrintful();
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] uploading BV Monogram for production + mockup gen…`);
  const designUrl = await uploadLogo(creds);
  console.log(`[init] design URL: ${designUrl}\n`);

  // Phase 1: update production sync files (no rate limit, fast)
  console.log("=== PHASE 1: production sync files ===");
  for (const t of TARGETS) {
    console.log(`[${t.slug}] updating production embroidery file + position…`);
    try {
      await updateProductionFile(t, designUrl);
      console.log(`[${t.slug}] ✓ production updated`);
    } catch (e) {
      console.warn(`[${t.slug}] production update failed: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Phase 2: regenerate mockups (rate-limited 60s between create-task calls)
  console.log("\n=== PHASE 2: regenerate mockups ===");
  for (let i = 0; i < TARGETS.length; i += 1) {
    const t = TARGETS[i];
    console.log(`[${t.slug}] regenerating mockups…`);
    try {
      await regenerateMockup(t, creds, designUrl, i > 0);
    } catch (e) {
      console.warn(`[${t.slug}] mockup regen failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
