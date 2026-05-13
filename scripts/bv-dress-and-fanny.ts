// Phase A — Update The Dress (sync 431477256) to use the 500 DPI BV AOP file
// across all 4 valid placements (top_front, top_back, front, back), add the
// BV Transparent neck label, regenerate mockups, and create the Shopify
// product since it doesn't exist there yet.
//
// Phase B — Create The Fanny Pack (catalog 350) from scratch: Printful sync
// product + mockups + Shopify draft.
//
// Both use file_id 987169507 (BV AOP Linear 500 DPI) and file_id 987217027
// (BV Transparent neck label).
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-dress-and-fanny.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const PF_BASE = "https://api.printful.com";
const AOP_FILE_ID = 987169507; // BV AOP Linear 500 DPI
const NECK_LABEL_FILE_ID = 987217027; // BV Transparent

// ── DRESS CONFIG ────────────────────────────────────────────────────────────
const DRESS = {
  syncProductId: 431477256,
  catalogProductId: 315,
  // Placements: drop "default" (not in catalog spec); use the valid 4 + label_inside.
  placements: ["top_front", "top_back", "front", "back"] as const,
  retailPrice: "58.00",
  shopifyTitle: "The Dress",
  shopifyDescription:
    "A premium all-over-print skater dress. The BV monogram + star pattern tiles edge to edge — bodice front and back, full skirt front and back. Cut-sewn so the print continues unbroken across the waist seam. Smooth color-locked polyester. Built to be Kept."
};

// ── FANNY PACK CONFIG ───────────────────────────────────────────────────────
const FANNY = {
  catalogProductId: 350,
  placements: ["front", "top", "back", "pocket"] as const,
  retailPrice: "58.00",
  shopifyTitle: "The Fanny Pack",
  shopifyDescription:
    "A premium all-over-print fanny pack. The BV monogram + star pattern tiles across the body and zip pocket. Adjustable belt strap, mesh-back panel. The accessory anchor of the AOP capsule — sized to layer over a jacket or cross-body over a tee. Built to be Kept."
};

function ensurePf() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  return { token, storeId };
}

async function pf(method: "GET" | "POST" | "PUT", urlPath: string, body?: unknown) {
  const { token, storeId } = ensurePf();
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

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit = {}) {
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

async function generateMockups(catalogId: number, placements: readonly string[], variantIds: number[]) {
  const spec = await pf("GET", `/mockup-generator/printfiles/${catalogId}`);
  const printfiles = (spec.result?.printfiles ?? []) as Array<{ printfile_id: number; width: number; height: number }>;
  const variantPlacements = spec.result?.variant_printfiles?.[0]?.placements ?? {};

  const fileDetail = await pf("GET", `/files/${AOP_FILE_ID}`);
  const fileUrl = fileDetail.result?.preview_url;
  if (!fileUrl) throw new Error("Could not resolve preview URL");

  const files = placements.map((placement) => {
    const printfileId = variantPlacements[placement];
    const printfile = printfiles.find((p) => p.printfile_id === printfileId);
    if (!printfile) throw new Error(`No printfile spec for ${placement}`);
    return {
      placement,
      image_url: fileUrl,
      position: {
        area_width: printfile.width,
        area_height: printfile.height,
        width: printfile.width,
        height: printfile.height,
        top: 0,
        left: 0
      }
    };
  });

  const task = await pf("POST", `/mockup-generator/create-task/${catalogId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "CUT_SEW",
    files
  });
  const taskKey = task.result?.task_key as string;
  console.log(`  mockup task=${taskKey} polling…`);

  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
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
  throw new Error("mockup task timeout");
}

// ── Phase A: The Dress ─────────────────────────────────────────────────────

async function updateDress(creds: ShopifyCredentials) {
  console.log("=== PHASE A: The Dress ===\n");

  // 1. Update sync_variants with new 500 DPI file + label_inside
  console.log("[dress] updating sync_variants…");
  const detail = await pf("GET", `/store/products/${DRESS.syncProductId}`);
  const syncVariants = detail.result?.sync_variants ?? [];

  const newSyncVariants = syncVariants.map((sv: { id: number; external_id?: string; variant_id: number }) => ({
    id: sv.id,
    external_id: sv.external_id,
    variant_id: sv.variant_id,
    retail_price: DRESS.retailPrice,
    files: [
      ...DRESS.placements.map((p) => ({ type: p, id: AOP_FILE_ID })),
      { type: "label_inside", id: NECK_LABEL_FILE_ID }
    ]
  }));

  await pf("PUT", `/store/products/${DRESS.syncProductId}`, { sync_variants: newSyncVariants });
  console.log(`[dress] ✓ ${syncVariants.length} variants updated to 500 DPI`);
  await new Promise((r) => setTimeout(r, 1500));

  // 2. Regenerate mockups
  console.log("[dress] generating mockups…");
  const productData = await pf("GET", `/products/${DRESS.catalogProductId}`);
  const variantIds = (productData.result?.variants ?? []).map((v: { id: number }) => v.id).slice(0, 8);
  const mockups = await generateMockups(DRESS.catalogProductId, DRESS.placements, variantIds);
  console.log(`[dress] ${mockups.length} mockups returned`);

  // 3. Check if Shopify product exists, create if not
  console.log("[dress] checking Shopify…");
  const search = await shopifyRest<{ products: Array<{ id: number; title: string }> }>(
    creds,
    `/products.json?title=${encodeURIComponent(DRESS.shopifyTitle)}&limit=5`
  );
  let shopifyProductId: number;
  let shopifyVariantIds: number[] = [];
  const existing = (search.products || []).find((p) => p.title === DRESS.shopifyTitle);
  if (existing) {
    shopifyProductId = existing.id;
    console.log(`[dress] Shopify product exists: ${shopifyProductId}`);
    const full = await shopifyRest<{ product: { variants: Array<{ id: number }> } }>(creds, `/products/${shopifyProductId}.json?fields=variants`);
    shopifyVariantIds = full.product.variants.map((v) => v.id);
  } else {
    console.log("[dress] creating new Shopify product…");
    const created = await shopifyRest<{ product: { id: number; variants: Array<{ id: number }> } }>(
      creds,
      "/products.json",
      {
        method: "POST",
        body: JSON.stringify({
          product: {
            title: DRESS.shopifyTitle,
            body_html: `<p>${DRESS.shopifyDescription}</p>`,
            vendor: "Black Vault Apparel",
            product_type: "Dress",
            status: "draft",
            tags: ["autonomous-product", "all-over-print", "brand:black-vault-apparel", "the-aop-capsule"],
            options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] }],
            variants: ["XS", "S", "M", "L", "XL", "2XL", "3XL"].map((size) => ({
              option1: size,
              price: DRESS.retailPrice
            }))
          }
        })
      }
    );
    shopifyProductId = created.product.id;
    shopifyVariantIds = created.product.variants.map((v) => v.id);
    console.log(`[dress] ✓ created Shopify product ${shopifyProductId}`);
  }

  // 4. Attach mockup images
  console.log("[dress] attaching mockups to Shopify…");
  // Wipe existing
  const imgs = await shopifyRest<{ images: Array<{ id: number }> }>(creds, `/products/${shopifyProductId}/images.json`);
  for (const img of imgs.images ?? []) {
    try { await shopifyRest(creds, `/products/${shopifyProductId}/images/${img.id}.json`, { method: "DELETE" }); } catch {}
  }
  let attached = 0;
  for (const url of mockups.slice(0, 6)) {
    try {
      await shopifyRest(creds, `/products/${shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: "The Dress" } })
      });
      attached += 1;
    } catch {}
  }
  console.log(`[dress] ✓ attached ${attached} mockup images`);

  // 5. Link Printful sync_variants external_id to Shopify variant ids
  if (shopifyVariantIds.length === newSyncVariants.length) {
    console.log("[dress] linking sync_variants → Shopify variants…");
    const linkedSyncVariants = newSyncVariants.map((sv: { id: number; variant_id: number; retail_price: string; files: unknown[] }, i: number) => ({
      ...sv,
      external_id: String(shopifyVariantIds[i])
    }));
    await pf("PUT", `/store/products/${DRESS.syncProductId}`, { sync_variants: linkedSyncVariants });
    console.log(`[dress] ✓ linked ${shopifyVariantIds.length} variants`);
  } else {
    console.log(`[dress] ! variant count mismatch (Printful ${newSyncVariants.length} vs Shopify ${shopifyVariantIds.length}); skipping link`);
  }

  console.log(`[dress] DONE — Shopify product ${shopifyProductId}\n`);
  return shopifyProductId;
}

// ── Phase B: The Fanny Pack ────────────────────────────────────────────────

async function createFannyPack(creds: ShopifyCredentials) {
  console.log("=== PHASE B: The Fanny Pack ===\n");

  // 1. Get Fanny Pack catalog variants
  const productData = await pf("GET", `/products/${FANNY.catalogProductId}`);
  const variants = (productData.result?.variants ?? []) as Array<{ id: number; name: string; price: string }>;
  console.log(`[fanny] catalog has ${variants.length} variants:`);
  for (const v of variants) console.log(`  - ${v.id} | ${v.name} | base $${v.price}`);

  // 2. Build sync product on Printful (POST)
  console.log("\n[fanny] creating Printful sync product…");
  const variantFiles = [
    ...FANNY.placements.map((p) => ({ type: p, id: AOP_FILE_ID })),
    { type: "label_inside", id: NECK_LABEL_FILE_ID }
  ];

  const syncResp = await pf("POST", "/store/products", {
    sync_product: {
      name: FANNY.shopifyTitle,
      thumbnail: undefined // Printful auto-generates from first variant mockup
    },
    sync_variants: variants.map((v) => ({
      variant_id: v.id,
      retail_price: FANNY.retailPrice,
      files: variantFiles
    }))
  });
  const fannySyncProductId = syncResp.result?.id;
  console.log(`[fanny] ✓ Printful sync product ${fannySyncProductId}`);
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Generate mockups
  console.log("[fanny] generating mockups…");
  const variantIds = variants.map((v) => v.id);
  const mockups = await generateMockups(FANNY.catalogProductId, FANNY.placements, variantIds);
  console.log(`[fanny] ${mockups.length} mockups returned`);

  // 4. Create Shopify draft product
  console.log("[fanny] creating Shopify product…");
  const sizeOptions = variants.map((v) => v.name.replace(/^All-Over Print Fanny Pack /, "").replace(/[()]/g, "").trim());
  const created = await shopifyRest<{ product: { id: number; variants: Array<{ id: number }> } }>(
    creds,
    "/products.json",
    {
      method: "POST",
      body: JSON.stringify({
        product: {
          title: FANNY.shopifyTitle,
          body_html: `<p>${FANNY.shopifyDescription}</p>`,
          vendor: "Black Vault Apparel",
          product_type: "Accessory",
          status: "draft",
          tags: ["autonomous-product", "all-over-print", "brand:black-vault-apparel", "the-aop-capsule", "accessory"],
          options: [{ name: "Size", values: sizeOptions }],
          variants: sizeOptions.map((size) => ({ option1: size, price: FANNY.retailPrice }))
        }
      })
    }
  );
  const shopifyProductId = created.product.id;
  const shopifyVariantIds = created.product.variants.map((v) => v.id);
  console.log(`[fanny] ✓ Shopify product ${shopifyProductId}`);

  // 5. Attach mockups
  let attached = 0;
  for (const url of mockups.slice(0, 6)) {
    try {
      await shopifyRest(creds, `/products/${shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: "The Fanny Pack" } })
      });
      attached += 1;
    } catch {}
  }
  console.log(`[fanny] ✓ attached ${attached} mockup images`);

  // 6. Link Printful sync_variants to Shopify variants
  console.log("[fanny] linking sync_variants → Shopify variants…");
  const fannyDetail = await pf("GET", `/store/products/${fannySyncProductId}`);
  const syncVariants = (fannyDetail.result?.sync_variants ?? []) as Array<{ id: number; variant_id: number; retail_price: string; files: Array<{ type: string; id: number }> }>;
  if (syncVariants.length === shopifyVariantIds.length) {
    const linked = syncVariants.map((sv, i) => ({
      id: sv.id,
      external_id: String(shopifyVariantIds[i]),
      variant_id: sv.variant_id,
      retail_price: sv.retail_price,
      files: sv.files.filter((f) => f.type !== "preview").map((f) => ({ type: f.type, id: f.id }))
    }));
    await pf("PUT", `/store/products/${fannySyncProductId}`, { sync_variants: linked });
    console.log(`[fanny] ✓ linked ${shopifyVariantIds.length} variants`);
  }

  console.log(`[fanny] DONE — Shopify product ${shopifyProductId}\n`);
  return { shopifyProductId, fannySyncProductId };
}

async function main() {
  ensurePf();
  const creds = resolveShopifyCredentials("black-vault-apparel");

  try {
    const dressShopifyId = await updateDress(creds);
    console.log(`Dress: Shopify ${dressShopifyId} | review at /admin/products/${dressShopifyId}`);
  } catch (e) {
    console.log(`[dress] FAILED: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // Brief pause between phases for rate limit
  await new Promise((r) => setTimeout(r, 60000));

  try {
    const fanny = await createFannyPack(creds);
    console.log(`Fanny: Shopify ${fanny.shopifyProductId} | review at /admin/products/${fanny.shopifyProductId}`);
  } catch (e) {
    console.log(`[fanny] FAILED: ${e instanceof Error ? e.message : "unknown"}`);
  }

  console.log("\nDone. Both products created as DRAFT — review in admin and Activate when ready.");
  console.log("(Products/update webhook will auto-attach to Online Store sales channel on activate.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
