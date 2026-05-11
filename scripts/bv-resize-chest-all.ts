// Resize the BV chest_left embroidery on ALL 17 chest_left products to the
// "actual size" (Polo Ralph Lauren / Aimé Leon Dore tier — ~2.7" at production).
//
// Previous run set 450×450 (Travis Mathew tier ~1.5") which the merchant flagged
// as too small. This run bumps to 800×800 in the 1200×1200 placement area.
//
// Two phases:
//   1. Update production sync files for all 17 products (fast, no rate limit)
//   2. Regenerate Printful mockups per product (60s rate limit between create-task)
//      and wipe/re-attach Shopify product images with the new mockups
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/bv-resize-chest-all.ts
//
// Flags:
//   --skip-mockups   only update production files, skip mockup regen (fast)
//   --product <id>   resize one product only (debug)

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const PF_BASE = "https://api.printful.com";
const THREAD_COLOR_OLD_GOLD = "#A67843";

// Tuned 2026-05-11: bumped from 450 (Travis Mathew tier ~1.5") to 800
// (Polo Ralph Lauren / Aimé Leon Dore tier ~2.7"). Merchant feedback:
// previous size was too small relative to mockup imagery and brand position.
const CHEST_POSITION = {
  area_width: 1200,
  area_height: 1200,
  width: 800,
  height: 800,
  top: 200,
  left: 200
};

type Target = {
  slug: string;
  syncProductId: number;
  productId: number;
  shopifyProductId: number;
};

const TARGETS: Target[] = [
  // Original 6 men's chest_left
  { slug: "the-monogram-tee", syncProductId: 430513612, productId: 508, shopifyProductId: 7623581532258 },
  { slug: "the-vault-tee", syncProductId: 430513709, productId: 586, shopifyProductId: 7623581597794 },
  { slug: "the-heavyweight-hoodie", syncProductId: 430513822, productId: 831, shopifyProductId: 7623581728866 },
  { slug: "the-crewneck", syncProductId: 430513982, productId: 845, shopifyProductId: 7623582023778 },
  { slug: "the-long-sleeve", syncProductId: 430514134, productId: 748, shopifyProductId: 7623582089314 },
  { slug: "the-performance-polo", syncProductId: 430528053, productId: 340, shopifyProductId: 7623687864418 },
  // White variants
  { slug: "the-monogram-tee-white", syncProductId: 430996312, productId: 508, shopifyProductId: 7625765191778 },
  { slug: "the-vault-tee-white", syncProductId: 430996321, productId: 586, shopifyProductId: 7625765224546 },
  { slug: "the-heavyweight-hoodie-white", syncProductId: 430996329, productId: 831, shopifyProductId: 7625765257314 },
  { slug: "the-crewneck-white", syncProductId: 430996334, productId: 845, shopifyProductId: 7625765290082 },
  { slug: "the-polo-white", syncProductId: 430996340, productId: 340, shopifyProductId: 7625765322850 },
  // Women's
  { slug: "the-cropped-tee", syncProductId: 430996346, productId: 636, shopifyProductId: 7625765355618 },
  { slug: "the-cropped-tee-white", syncProductId: 430996350, productId: 636, shopifyProductId: 7625765388386 },
  { slug: "the-relaxed-tee", syncProductId: 430996355, productId: 360, shopifyProductId: 7625765421154 },
  { slug: "the-relaxed-tee-white", syncProductId: 430996359, productId: 360, shopifyProductId: 7625765453922 },
  { slug: "the-hoodie", syncProductId: 430996365, productId: 832, shopifyProductId: 7625765486690 },
  { slug: "the-hoodie-white", syncProductId: 430998096, productId: 832, shopifyProductId: 7625766699106 }
];

function args() {
  return {
    skipMockups: process.argv.includes("--skip-mockups"),
    productFilter: (() => {
      const i = process.argv.indexOf("--product");
      return i >= 0 ? Number(process.argv[i + 1]) : null;
    })()
  };
}

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
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text.slice(0, 400)}`);
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
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text.slice(0, 400)}`);
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
    throw new Error(`Shopify GraphQL (${r.status}): ${text.slice(0, 400)}`);
  }
  return parsed.data as T;
}

async function uploadLogo(creds: ShopifyCreds): Promise<string> {
  if (!fs.existsSync(LOGO_PATH)) throw new Error(`Logo missing at ${LOGO_PATH}`);
  const buf = fs.readFileSync(LOGO_PATH);
  const filename = `blackvault-monogram-resize-${Date.now()}.png`;
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }> };
  }>(
    creds,
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } } }`,
    { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] }
  );
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buf], { type: "image/png" }), filename);
  const u = await fetch(target.url, { method: "POST", body: form });
  if (!u.ok) throw new Error(`Staged upload failed (${u.status})`);
  const fc = await shopifyGraphQL<{
    fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> };
  }>(
    creds,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on MediaImage { id image { url } } ... on GenericFile { id url } } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] }
  );
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("no file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(
      creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    ).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("no URL after polling");
  return url;
}

async function updateProductionFile(target: Target, designUrl: string) {
  const detail = await pfFetch("GET", `/store/products/${target.syncProductId}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
    id: number;
    external_id?: string;
    variant_id: number;
    retail_price: string;
  }>;
  await pfFetch("PUT", `/store/products/${target.syncProductId}`, {
    sync_variants: syncVariants.map((sv) => ({
      id: sv.id,
      external_id: sv.external_id,
      variant_id: sv.variant_id,
      retail_price: sv.retail_price,
      files: [{ type: "embroidery_chest_left", url: designUrl, position: CHEST_POSITION }],
      options: [{ id: "thread_colors_chest_left", value: [THREAD_COLOR_OLD_GOLD] }]
    }))
  });
}

async function regenerateMockup(target: Target, creds: ShopifyCreds, designUrl: string, sleepBefore: boolean) {
  if (sleepBefore) {
    console.log(`  sleeping 65s for Printful mockup-gen rate limit…`);
    await new Promise((r) => setTimeout(r, 65000));
  }
  // Get the dominant color variants — for black colorways the "in white" products use White
  const isWhiteVariant = target.slug.endsWith("-white");
  const productData = await pfFetch("GET", `/products/${target.productId}`);
  const variants = (productData.result?.variants ?? []).filter((v: { color?: string }) => {
    const c = (v.color ?? "").trim().toLowerCase();
    return isWhiteVariant ? c === "white" : c === "black";
  });
  if (variants.length === 0) {
    // Fall back: any variant
    console.log(`  no ${isWhiteVariant ? "white" : "black"} variants for product ${target.productId}; using all variants`);
    variants.push(...(productData.result?.variants ?? []).slice(0, 3));
  }
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

  // Wipe existing Shopify product images and attach the new ones
  const existing = await shopifyRest<{ images: Array<{ id: number }> }>(
    creds,
    `/products/${target.shopifyProductId}/images.json`,
    { method: "GET" }
  );
  for (const img of existing.images ?? []) {
    try {
      await shopifyRest(creds, `/products/${target.shopifyProductId}/images/${img.id}.json`, { method: "DELETE" });
    } catch {}
  }
  for (const url of mockups.slice(0, 5)) {
    try {
      await shopifyRest(creds, `/products/${target.shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: target.slug } })
      });
    } catch (e) {
      console.log(`  warn: attach failed for ${url}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  console.log(`  ✓ wiped ${existing.images?.length ?? 0} old, attached ${Math.min(mockups.length, 5)} new`);
}

async function main() {
  ensurePrintful();
  const creds = resolveShopifyCredentials(BRAND);
  const a = args();

  const targets = a.productFilter
    ? TARGETS.filter((t) => t.syncProductId === a.productFilter)
    : TARGETS;

  console.log(`[init] resizing chest embroidery on ${targets.length} BV products`);
  console.log(`[init] new size: ${CHEST_POSITION.width}×${CHEST_POSITION.height} in ${CHEST_POSITION.area_width}×${CHEST_POSITION.area_height} area (~${(CHEST_POSITION.width / 1200 * 4).toFixed(1)}" at production)`);

  console.log(`\n[init] uploading BV Monogram for production + mockup gen…`);
  const designUrl = await uploadLogo(creds);
  console.log(`[init] design URL: ${designUrl.slice(0, 100)}…\n`);

  // Phase 1: production sync files
  console.log("=== PHASE 1: production sync files (no rate limit) ===");
  let productionOk = 0;
  let productionFail: string[] = [];
  for (const t of targets) {
    process.stdout.write(`[${t.slug}] `);
    try {
      await updateProductionFile(t, designUrl);
      console.log(`✓`);
      productionOk += 1;
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
      productionFail.push(t.slug);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\n[phase 1] ${productionOk}/${targets.length} production files updated`);

  if (a.skipMockups) {
    console.log("\n[skip-mockups] phase 2 skipped per flag");
    return;
  }

  // Phase 2: regenerate mockups (rate-limited)
  console.log("\n=== PHASE 2: regenerate mockups (60s between products) ===");
  let mockupOk = 0;
  let mockupFail: string[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    console.log(`\n[${t.slug}] (${i + 1}/${targets.length}) regenerating mockups…`);
    try {
      await regenerateMockup(t, creds, designUrl, i > 0);
      mockupOk += 1;
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
      mockupFail.push(t.slug);
    }
  }
  console.log(`\n[phase 2] ${mockupOk}/${targets.length} mockups regenerated`);
  if (mockupFail.length > 0) console.log(`  failed: ${mockupFail.join(", ")}`);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
