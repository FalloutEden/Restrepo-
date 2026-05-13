// Swap the chest embroidery file across all 17 BV chest_left products from
// the old monogram (file 987204732, blackvault-monogram-resize) to the new
// clean BV Gold mark (file 987691061, 1254×1254 with cleaner serif glyph).
//
// For each product:
//   1. GET sync_variants, swap embroidery_chest_left file id (preserve options
//      including thread_colors_chest_left = #A67843)
//   2. Regenerate mockup via /mockup-generator/create-task with embroidery
//      placement + position + thread color
//   3. Replace primary image on Shopify with the new mockup
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-swap-chest-mark.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import fs from "node:fs";

const NEW_FILE_ID = 987691061;
const OLD_FILE_ID = 987204732;
const THREAD_GOLD = "#A67843";

type Target = { syncId: number; catalogId: number; shopifyId: number; name: string };

// Mapped from chest-left-targets.json + Shopify product IDs (from earlier scripts)
const TARGETS: Target[] = [
  { syncId: 430513612, catalogId: 508, shopifyId: 7623581532258, name: "The Monogram Tee" },
  { syncId: 430996312, catalogId: 508, shopifyId: 7625765191778, name: "The Monogram Tee in White" },
  { syncId: 430513709, catalogId: 586, shopifyId: 7623581597794, name: "The Vault Tee" },
  { syncId: 430996321, catalogId: 586, shopifyId: 7625765224546, name: "The Vault Tee in White" },
  { syncId: 430513822, catalogId: 831, shopifyId: 7623581728866, name: "The Heavyweight Hoodie" },
  { syncId: 430996329, catalogId: 831, shopifyId: 7625765257314, name: "The Heavyweight Hoodie in White" },
  { syncId: 430513982, catalogId: 845, shopifyId: 7623582023778, name: "The Crewneck" },
  { syncId: 430996334, catalogId: 845, shopifyId: 7625765290082, name: "The Crewneck in White" },
  { syncId: 430514134, catalogId: 748, shopifyId: 7623582089314, name: "The Long Sleeve" },
  { syncId: 430528053, catalogId: 340, shopifyId: 7623687864418, name: "The Polo" },
  { syncId: 430996340, catalogId: 340, shopifyId: 7625765322850, name: "The Polo in White" },
  { syncId: 430996346, catalogId: 636, shopifyId: 7625765355618, name: "The Cropped Tee" },
  { syncId: 430996350, catalogId: 636, shopifyId: 7625765388386, name: "The Cropped Tee in White" },
  { syncId: 430996355, catalogId: 360, shopifyId: 7625765421154, name: "The Relaxed Tee" },
  { syncId: 430996359, catalogId: 360, shopifyId: 7625765453922, name: "The Relaxed Tee in White" },
  { syncId: 430996365, catalogId: 832, shopifyId: 7625765486690, name: "The Hoodie" },
  { syncId: 430998096, catalogId: 832, shopifyId: 7625766699106, name: "The Hoodie in White" }
];

async function pf(method: "GET" | "POST" | "PUT", path: string, body?: unknown) {
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
  if (!r.ok) throw new Error(`Printful ${method} ${path} ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
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
  const variants = d.result.sync_variants as Array<{
    id: number;
    external_id?: string;
    variant_id: number;
    retail_price: string;
    files: Array<{ type: string; id: number }>;
    options?: Array<{ id: string; value: unknown }>;
  }>;
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
  const variantIds = (sync.result.sync_variants as Array<{ variant_id: number }>).map((sv) => sv.variant_id);

  const task = await pf("POST", `/mockup-generator/create-task/${t.catalogId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "EMBROIDERY",
    product_options: { thread_colors_chest_left: [THREAD_GOLD], embroidery_type: "flat", lifelike: false },
    files: [
      {
        placement: "embroidery_chest_left",
        image_url: fileUrl,
        position: { area_width: 1200, area_height: 1200, width: 800, height: 800, top: 200, left: 200 }
      }
    ]
  });
  const key = task.result.task_key as string;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(key)}`);
    if (td.result?.status === "completed") {
      const set = new Set<string>();
      for (const m of td.result.mockups ?? []) {
        if (m.mockup_url) set.add(m.mockup_url);
        for (const e of m.extra ?? []) if (e.url) set.add(e.url);
      }
      return [...set];
    }
    if (td.result?.status === "failed") {
      throw new Error(`mockup failed: ${JSON.stringify(td.result?.error ?? td.result).slice(0, 300)}`);
    }
  }
  throw new Error("mockup timeout");
}

async function pushMockupsToShopify(c: ShopifyCredentials, shopifyId: number, mockups: string[], name: string) {
  const imgs = await shopify<{ images: Array<{ id: number; src: string }> }>(c, `/products/${shopifyId}/images.json`);
  // Delete only the previous chest-mark mockups — keep any user-uploaded extras and bv-on-bg composites
  const toDelete = (imgs.images ?? []).filter((img) => /mens-premium-heavyweight-tee|womens-|premium-eco|premium-heavy/.test(img.src) || /chest-mark/.test(img.src));
  for (const img of toDelete) {
    try {
      await shopify(c, `/products/${shopifyId}/images/${img.id}.json`, { method: "DELETE" });
    } catch {}
  }
  let attached = 0;
  for (const url of mockups.slice(0, 4)) {
    try {
      await shopify(c, `/products/${shopifyId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: `${name} — chest BV` } })
      });
      attached += 1;
    } catch (e) {
      console.log(`  warn attach: ${e instanceof Error ? e.message.slice(0, 100) : "?"}`);
    }
  }
  return attached;
}

async function main() {
  const c = resolveShopifyCredentials("black-vault-apparel");
  console.log(`[swap] swapping chest mark ${OLD_FILE_ID} → ${NEW_FILE_ID} on ${TARGETS.length} products\n`);

  const fileInfo = await pf("GET", `/files/${NEW_FILE_ID}`);
  const fileUrl = fileInfo.result?.preview_url;
  if (!fileUrl) throw new Error("no preview url for new file");

  // Phase 1: production sync (no rate limit)
  console.log("=== PHASE 1: production sync_variants ===");
  for (const t of TARGETS) {
    try {
      await swapProduction(t);
      console.log(`  ✓ ${t.syncId.toString().padEnd(11)} ${t.name}`);
    } catch (e) {
      console.log(`  ✗ ${t.syncId.toString().padEnd(11)} ${t.name}: ${e instanceof Error ? e.message.slice(0, 150) : "?"}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Phase 2: mockup regen — 60s between products for Printful rate limit
  console.log("\n=== PHASE 2: mockup regen + Shopify image attach (60s between products) ===");
  const results: Array<{ name: string; ok: boolean; mockups: number; attached: number; error?: string }> = [];
  for (let i = 0; i < TARGETS.length; i += 1) {
    const t = TARGETS[i];
    console.log(`\n[${i + 1}/${TARGETS.length}] ${t.name}…`);
    try {
      const mockups = await regenMockup(t, fileUrl);
      console.log(`  ${mockups.length} mockups`);
      const attached = await pushMockupsToShopify(c, t.shopifyId, mockups, t.name);
      console.log(`  attached ${attached} to Shopify`);
      results.push({ name: t.name, ok: true, mockups: mockups.length, attached });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "?";
      console.log(`  ✗ ${msg}`);
      results.push({ name: t.name, ok: false, mockups: 0, attached: 0, error: msg });
    }
    if (i < TARGETS.length - 1) {
      console.log(`  sleeping 65s for rate limit…`);
      await new Promise((r) => setTimeout(r, 65000));
    }
  }

  fs.writeFileSync(".openclaw/chest-mark-swap-results.json", JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n[done] ${ok}/${TARGETS.length} succeeded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
