// Swap every AOP product's design file from the old 25-dpi 4604×4127 source
// to the new 500-dpi 9736×7793 source uploaded to Printful (file id 987169507).
//
// CRITICAL: never download or re-encode the source — that loses DPI. We
// reference the Printful file_id directly, so the high-DPI source is preserved
// across the entire production + mockup pipeline.
//
// SKIPS the AOP Polo (merchant marked it complete).
//
// For the AOP Hoodie specifically: adds `pocket` and `hood` placements
// alongside the existing front/back/sleeves so the all-over pattern covers
// every customer-visible panel.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/bv-aop-update-500dpi.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";
const NEW_FILE_ID = 987169507; // BV AOP Linear Graphic 500 DPI, uploaded to Printful

type AopTarget = {
  slug: string;
  syncProductId: number;
  productId: number;
  shopifyProductId: number;
  // Optional: panels to ADD that aren't already in the sync (hoodie gets pocket+hood)
  additionalPlacements?: string[];
};

const TARGETS: AopTarget[] = [
  { slug: "aop-bomber", syncProductId: 431309271, productId: 390, shopifyProductId: 7628502958178 },
  { slug: "aop-hoodie", syncProductId: 431309286, productId: 388, shopifyProductId: 7628503089250, additionalPlacements: ["pocket", "hood"] },
  { slug: "aop-sweatshirt", syncProductId: 431309303, productId: 320, shopifyProductId: 7628503187554 },
  { slug: "aop-jersey", syncProductId: 431309310, productId: 835, shopifyProductId: 7628503384162 },
  { slug: "aop-tee-mens", syncProductId: 431309315, productId: 257, shopifyProductId: 7628503482466 },
  { slug: "aop-tee-womens", syncProductId: 431309334, productId: 261, shopifyProductId: 7628503613538 }
  // AOP Polo (431464874) intentionally NOT in this list — merchant marked complete
];

function ensurePrintful() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  return { token, storeId };
}

async function pf(method: "GET" | "POST" | "PUT", urlPath: string, body?: unknown) {
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

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit) {
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

async function updateProductionFiles(target: AopTarget) {
  const detail = await pf("GET", `/store/products/${target.syncProductId}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
    id: number;
    external_id?: string;
    variant_id: number;
    retail_price: string;
    files: Array<{ type: string; id?: number; url?: string }>;
  }>;

  // Build new files array per variant: keep the existing placement TYPES,
  // swap file_id to the new 500 DPI file, drop preview file (Printful regenerates).
  // For products with `additionalPlacements`, append those with the same file_id.
  const newSyncVariants = syncVariants.map((sv) => {
    const placementsSeen = new Set<string>();
    const newFiles: Array<{ type: string; id: number }> = [];

    for (const f of sv.files) {
      // Skip auto-generated preview files — Printful re-creates these on save
      if (f.type === "preview") continue;
      newFiles.push({ type: f.type, id: NEW_FILE_ID });
      placementsSeen.add(f.type);
    }

    // Add any additional placements not already present
    for (const placement of target.additionalPlacements ?? []) {
      if (!placementsSeen.has(placement)) {
        newFiles.push({ type: placement, id: NEW_FILE_ID });
      }
    }

    return {
      id: sv.id,
      external_id: sv.external_id,
      variant_id: sv.variant_id,
      retail_price: sv.retail_price,
      files: newFiles
    };
  });

  await pf("PUT", `/store/products/${target.syncProductId}`, {
    sync_variants: newSyncVariants
  });
}

async function regenerateMockup(target: AopTarget, creds: ShopifyCredentials, sleepBefore: boolean) {
  if (sleepBefore) {
    console.log(`  sleeping 65s for Printful mockup-gen rate limit…`);
    await new Promise((r) => setTimeout(r, 65000));
  }

  // Get all variants for this catalog product (AOP usually one color, multiple sizes)
  const productData = await pf("GET", `/products/${target.productId}`);
  const variantIds = (productData.result?.variants ?? []).map((v: { id: number }) => v.id).slice(0, 8);

  // Build files for ALL placements this product supports based on the existing sync
  const detail = await pf("GET", `/store/products/${target.syncProductId}`);
  const firstVariant = detail.result?.sync_variants?.[0];
  const placementTypes = new Set<string>();
  for (const f of (firstVariant?.files ?? [])) {
    if (f.type !== "preview") placementTypes.add(f.type);
  }
  for (const p of target.additionalPlacements ?? []) placementTypes.add(p);

  // Printful's mockup-gen needs image_url. The high-res original is locked
  // (403 from outside CDN — Printful guards the file). The preview_url is
  // accessible and scaled down (~1000px) which is fine for mockup display
  // since the mockup itself is downscaled to fit Shopify product cards.
  // Production printing still uses file_id 987169507 (500 dpi) via the
  // sync_variants update above — this is independent of the mockup source.
  const fileDetail = await pf("GET", `/files/${NEW_FILE_ID}`);
  const fileUrl = fileDetail.result?.preview_url;
  if (!fileUrl) throw new Error(`Could not resolve preview URL for Printful file ${NEW_FILE_ID}`);

  const taskResp = await pf("POST", `/mockup-generator/create-task/${target.productId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "CUT_SEW",
    files: [...placementTypes]
      .filter((p) => p !== "label_inside" && p !== "label_panel") // skip interior labels for mockup-gen
      .map((placement) => ({
        placement,
        image_url: fileUrl
      }))
  });
  const taskKey = taskResp.result?.task_key as string;
  console.log(`  task=${taskKey} polling…`);

  let mockups: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
    if (td.result?.status === "completed") {
      const set = new Set<string>();
      for (const m of td.result.mockups ?? []) {
        if (m.mockup_url) set.add(m.mockup_url);
        for (const e of m.extra ?? []) {
          if (e.url) set.add(e.url);
        }
      }
      mockups = [...set];
      break;
    }
    if (td.result?.status === "failed") throw new Error("mockup task failed");
  }
  console.log(`  ${mockups.length} mockups returned`);

  // Replace Shopify images: wipe + add new
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
  let attached = 0;
  for (const url of mockups.slice(0, 6)) {
    try {
      await shopifyRest(creds, `/products/${target.shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: target.slug } })
      });
      attached += 1;
    } catch (e) {
      console.log(`  warn: attach failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  console.log(`  ✓ wiped ${existing.images?.length ?? 0} old, attached ${attached} new`);
}

async function main() {
  ensurePrintful();
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] AOP redo with 500 DPI Printful file_id ${NEW_FILE_ID}`);
  console.log(`[init] ${TARGETS.length} products in scope (Polo skipped per merchant)\n`);

  // Phase 1: production files
  console.log("=== PHASE 1: production sync files ===");
  for (const t of TARGETS) {
    process.stdout.write(`[${t.slug}] `);
    try {
      await updateProductionFiles(t);
      console.log(`✓ swapped to file_id ${NEW_FILE_ID}${t.additionalPlacements ? ` + added ${t.additionalPlacements.join("+")}` : ""}`);
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Phase 2: regenerate mockups
  console.log("\n=== PHASE 2: regenerate mockups (60s rate limit between products) ===");
  for (let i = 0; i < TARGETS.length; i += 1) {
    const t = TARGETS[i];
    console.log(`\n[${t.slug}] (${i + 1}/${TARGETS.length}) regenerating mockups…`);
    try {
      await regenerateMockup(t, creds, i > 0);
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message.slice(0, 300) : "unknown"}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
