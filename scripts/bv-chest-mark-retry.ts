// Retry the chest mark swap for products that failed in the first pass:
//   - 7 prod-side failures (Printful 429): re-run the sync_variants PUT with
//     long backoff
//   - 4 mockup-side failures (fetch failed on hotspot): re-run mockup-gen +
//     Shopify image attach
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-chest-mark-retry.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const NEW_FILE_ID = 987691061;
const THREAD_GOLD = "#A67843";

type Target = { syncId: number; catalogId: number; shopifyId: number; name: string; needsProd: boolean; needsMockup: boolean };

const TARGETS: Target[] = [
  // Production sync failed (Printful 429)
  { syncId: 430996340, catalogId: 340, shopifyId: 7625765322850, name: "The Polo in White", needsProd: true, needsMockup: false },
  { syncId: 430996346, catalogId: 636, shopifyId: 7625765355618, name: "The Cropped Tee", needsProd: true, needsMockup: false },
  { syncId: 430996350, catalogId: 636, shopifyId: 7625765388386, name: "The Cropped Tee in White", needsProd: true, needsMockup: false },
  { syncId: 430996355, catalogId: 360, shopifyId: 7625765421154, name: "The Relaxed Tee", needsProd: true, needsMockup: false },
  { syncId: 430996359, catalogId: 360, shopifyId: 7625765453922, name: "The Relaxed Tee in White", needsProd: true, needsMockup: false },
  { syncId: 430996365, catalogId: 832, shopifyId: 7625765486690, name: "The Hoodie", needsProd: true, needsMockup: false },
  { syncId: 430998096, catalogId: 832, shopifyId: 7625766699106, name: "The Hoodie in White", needsProd: true, needsMockup: false },
  // Mockup failed (fetch error on hotspot)
  { syncId: 430513709, catalogId: 586, shopifyId: 7623581597794, name: "The Vault Tee", needsProd: false, needsMockup: true },
  { syncId: 430996321, catalogId: 586, shopifyId: 7625765224546, name: "The Vault Tee in White", needsProd: false, needsMockup: true },
  { syncId: 430513822, catalogId: 831, shopifyId: 7623581728866, name: "The Heavyweight Hoodie", needsProd: false, needsMockup: true },
  { syncId: 430996329, catalogId: 831, shopifyId: 7625765257314, name: "The Heavyweight Hoodie in White", needsProd: false, needsMockup: true }
];

async function pf(method: "GET" | "POST" | "PUT", path: string, body?: unknown, retries = 3): Promise<{ result?: Record<string, unknown> }> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const r = await fetch("https://api.printful.com" + path, {
      method,
      headers: {
        Authorization: "Bearer " + process.env.PRINTFUL_API_KEY,
        "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID!,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const t = await r.text();
    if (r.ok) return JSON.parse(t);
    if (r.status === 429 && attempt < retries) {
      // Parse "try again after N seconds" from the body
      const m = t.match(/after (\d+) seconds/);
      const wait = m ? Number(m[1]) + 5 : 65;
      console.log(`    429 — waiting ${wait}s before retry ${attempt + 1}/${retries}…`);
      await new Promise((r2) => setTimeout(r2, wait * 1000));
      continue;
    }
    throw new Error(`Printful ${method} ${path} ${r.status}: ${t.slice(0, 400)}`);
  }
  throw new Error("retries exhausted");
}

async function shopify<T>(c: ShopifyCredentials, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://${c.storeDomain}/admin/api/${c.apiVersion}${path}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${path} ${r.status}: ${t.slice(0, 300)}`);
  return t ? (JSON.parse(t) as T) : ({} as T);
}

async function swapProduction(t: Target) {
  const d = await pf("GET", `/store/products/${t.syncId}`);
  const variants = (d.result as { sync_variants: Array<{ id: number; external_id?: string; variant_id: number; retail_price: string; files: Array<{ type: string; id: number }>; options?: Array<{ id: string; value: unknown }> }> }).sync_variants;
  const newVariants = variants.map((sv) => ({
    id: sv.id,
    external_id: sv.external_id,
    variant_id: sv.variant_id,
    retail_price: sv.retail_price,
    files: sv.files
      .filter((f) => f.type !== "preview")
      .map((f) => (f.type === "embroidery_chest_left" ? { type: f.type, id: NEW_FILE_ID } : { type: f.type, id: f.id })),
    options: sv.options ?? []
  }));
  await pf("PUT", `/store/products/${t.syncId}`, { sync_variants: newVariants });
}

async function regenMockup(t: Target, fileUrl: string): Promise<string[]> {
  const sync = await pf("GET", `/store/products/${t.syncId}`);
  const variantIds = ((sync.result as { sync_variants: Array<{ variant_id: number }> }).sync_variants).map((sv) => sv.variant_id);
  const task = await pf("POST", `/mockup-generator/create-task/${t.catalogId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "EMBROIDERY",
    product_options: { thread_colors_chest_left: [THREAD_GOLD], embroidery_type: "flat", lifelike: false },
    files: [{ placement: "embroidery_chest_left", image_url: fileUrl, position: { area_width: 1200, area_height: 1200, width: 800, height: 800, top: 200, left: 200 } }]
  });
  const key = (task.result as { task_key: string }).task_key;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(key)}`);
    const res = td.result as { status?: string; mockups?: Array<{ mockup_url?: string; extra?: Array<{ url?: string }> }>; error?: unknown };
    if (res?.status === "completed") {
      const set = new Set<string>();
      for (const m of res.mockups ?? []) {
        if (m.mockup_url) set.add(m.mockup_url);
        for (const e of m.extra ?? []) if (e.url) set.add(e.url);
      }
      return [...set];
    }
    if (res?.status === "failed") throw new Error(`mockup failed: ${JSON.stringify(res.error ?? res).slice(0, 300)}`);
  }
  throw new Error("mockup timeout");
}

async function attachMockups(c: ShopifyCredentials, shopifyId: number, mockups: string[], name: string): Promise<number> {
  const imgs = await shopify<{ images: Array<{ id: number; src: string }> }>(c, `/products/${shopifyId}/images.json`);
  const toDelete = (imgs.images ?? []).filter((img) => /premium-heavyweight-tee|premium-eco|womens-|premium-heavy|crew-neck-sweatshirt|relaxed|cropped/i.test(img.src));
  for (const img of toDelete) {
    try { await shopify(c, `/products/${shopifyId}/images/${img.id}.json`, { method: "DELETE" }); } catch {}
  }
  let attached = 0;
  for (const url of mockups.slice(0, 4)) {
    try {
      await shopify(c, `/products/${shopifyId}/images.json`, { method: "POST", body: JSON.stringify({ image: { src: url, alt: `${name} — chest BV` } }) });
      attached += 1;
    } catch {}
  }
  return attached;
}

async function main() {
  const c = resolveShopifyCredentials("black-vault-apparel");
  console.log(`[retry] ${TARGETS.length} products to fix\n`);

  const fileInfo = await pf("GET", `/files/${NEW_FILE_ID}`);
  const fileUrl = (fileInfo.result as { preview_url?: string }).preview_url;
  if (!fileUrl) throw new Error("no preview url");

  // Phase 1: production-only retries (with 8s spacing, plus 429 backoff)
  const prodTargets = TARGETS.filter((t) => t.needsProd);
  console.log(`=== PHASE 1: ${prodTargets.length} production retries ===`);
  for (let i = 0; i < prodTargets.length; i += 1) {
    const t = prodTargets[i];
    process.stdout.write(`[${i + 1}/${prodTargets.length}] ${t.name}… `);
    try {
      await swapProduction(t);
      console.log("✓");
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.slice(0, 150) : "?"}`);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }

  // Phase 2: mockup retries (65s between, mockup-gen rate limit)
  const mockupTargets = TARGETS.filter((t) => t.needsMockup);
  console.log(`\n=== PHASE 2: ${mockupTargets.length} mockup retries (65s spacing) ===`);
  for (let i = 0; i < mockupTargets.length; i += 1) {
    const t = mockupTargets[i];
    console.log(`\n[${i + 1}/${mockupTargets.length}] ${t.name}…`);
    try {
      const mockups = await regenMockup(t, fileUrl);
      const attached = await attachMockups(c, t.shopifyId, mockups, t.name);
      console.log(`  ✓ ${mockups.length} mockups, attached ${attached}`);
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message.slice(0, 200) : "?"}`);
    }
    if (i < mockupTargets.length - 1) {
      console.log(`  sleeping 65s…`);
      await new Promise((r) => setTimeout(r, 65000));
    }
  }
  console.log("\n[done]");
}

main().catch((e) => { console.error(e); process.exit(1); });
