// Fix The Dress AOP scale mismatch. The earlier pass stretched the same image
// to fill every placement area independently — so the skirt (large area)
// rendered the BV monogram ~2× the size of the bodice (small area).
//
// Fix: lock every placement to the BODICE's render scale. The image renders
// at top_front's pixel dimensions on every panel; the skirt fills the rest
// via Printful's cut_sew tiling. Same monogram size top to bottom.
//
// Then regenerate mockups and replace the Shopify product's images.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-dress-fix-scale.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const PF_BASE = "https://api.printful.com";
const AOP_FILE_ID = 987169507;
const NECK_LABEL_FILE_ID = 987217027;

const DRESS = {
  syncProductId: 431477256,
  catalogProductId: 315,
  shopifyProductId: 7644941418594,
  placements: ["top_front", "top_back", "front", "back"] as const,
  // The bodice (top_front) is the scale reference. Skirt panels render the
  // image at the SAME pixel size as the bodice, centered, so Printful tiles
  // the rest of the (much larger) skirt area at consistent monogram size.
  referencePlacement: "top_front" as const
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

async function main() {
  ensurePf();
  const creds = resolveShopifyCredentials("black-vault-apparel");

  // 1. Query printfile spec to get per-placement dimensions
  console.log("[fix] querying printfile spec for catalog 315…");
  const spec = await pf("GET", `/mockup-generator/printfiles/${DRESS.catalogProductId}`);
  const printfiles = (spec.result?.printfiles ?? []) as Array<{
    printfile_id: number;
    width: number;
    height: number;
    dpi?: number;
  }>;
  const variantPrintfiles = spec.result?.variant_printfiles?.[0]?.placements ?? {};

  const placementDims: Record<string, { width: number; height: number }> = {};
  for (const p of DRESS.placements) {
    const pfId = variantPrintfiles[p];
    const pf = printfiles.find((x) => x.printfile_id === pfId);
    if (!pf) throw new Error(`No printfile for placement ${p}`);
    placementDims[p] = { width: pf.width, height: pf.height };
    console.log(`  ${p.padEnd(11)} → ${pf.width}×${pf.height}px (dpi=${pf.dpi ?? "?"})`);
  }

  // 2. Determine reference scale from the bodice
  const ref = placementDims[DRESS.referencePlacement];
  console.log(`\n[fix] reference (${DRESS.referencePlacement}) = ${ref.width}×${ref.height}px`);
  console.log("[fix] every placement will render the image at this pixel size; cut_sew tiles the remainder.\n");

  // 3. Update sync_variants with consistent-scale positions
  console.log("[fix] reading current sync_variants…");
  const detail = await pf("GET", `/store/products/${DRESS.syncProductId}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
    id: number;
    external_id?: string;
    variant_id: number;
    retail_price: string;
  }>;
  console.log(`[fix] ${syncVariants.length} variants found`);

  const newSyncVariants = syncVariants.map((sv) => ({
    id: sv.id,
    external_id: sv.external_id,
    variant_id: sv.variant_id,
    retail_price: sv.retail_price,
    files: [
      ...DRESS.placements.map((p) => {
        const area = placementDims[p];
        // For the bodice (reference), full-bleed: image fills the entire area.
        // For larger panels (skirt), image renders at bodice's pixel size
        // anchored top-left; cut_sew tiles to fill the rest at consistent scale.
        return {
          type: p,
          id: AOP_FILE_ID,
          position: {
            area_width: area.width,
            area_height: area.height,
            width: ref.width,
            height: ref.height,
            top: 0,
            left: 0
          }
        };
      }),
      { type: "label_inside", id: NECK_LABEL_FILE_ID }
    ]
  }));

  console.log("[fix] writing sync_variants…");
  await pf("PUT", `/store/products/${DRESS.syncProductId}`, { sync_variants: newSyncVariants });
  console.log(`[fix] ✓ ${newSyncVariants.length} variants updated with locked scale\n`);
  await new Promise((r) => setTimeout(r, 3000));

  // 4. Regenerate mockups with the new positions
  console.log("[fix] generating mockups…");
  const productData = await pf("GET", `/products/${DRESS.catalogProductId}`);
  const variantIds = (productData.result?.variants ?? []).map((v: { id: number }) => v.id).slice(0, 8);

  const fileDetail = await pf("GET", `/files/${AOP_FILE_ID}`);
  const fileUrl = fileDetail.result?.preview_url;
  if (!fileUrl) throw new Error("Could not resolve preview URL");

  const files = DRESS.placements.map((p) => {
    const area = placementDims[p];
    return {
      placement: p,
      image_url: fileUrl,
      position: {
        area_width: area.width,
        area_height: area.height,
        width: ref.width,
        height: ref.height,
        top: 0,
        left: 0
      }
    };
  });

  const task = await pf("POST", `/mockup-generator/create-task/${DRESS.catalogProductId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "CUT_SEW",
    files
  });
  const taskKey = task.result?.task_key as string;
  console.log(`[fix] mockup task=${taskKey} polling…`);

  let mockups: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
    if (td.result?.status === "completed") {
      const set = new Set<string>();
      for (const m of td.result.mockups ?? []) {
        if (m.mockup_url) set.add(m.mockup_url);
        for (const e of m.extra ?? []) if (e.url) set.add(e.url);
      }
      mockups = [...set];
      break;
    }
    if (td.result?.status === "failed") {
      throw new Error(`mockup failed: ${JSON.stringify(td.result?.error ?? td.result).slice(0, 300)}`);
    }
  }
  console.log(`[fix] ${mockups.length} mockups returned`);

  // 5. Wipe existing Shopify images, attach new
  console.log("[fix] replacing Shopify images…");
  const imgs = await shopifyRest<{ images: Array<{ id: number }> }>(
    creds,
    `/products/${DRESS.shopifyProductId}/images.json`
  );
  for (const img of imgs.images ?? []) {
    try {
      await shopifyRest(creds, `/products/${DRESS.shopifyProductId}/images/${img.id}.json`, { method: "DELETE" });
    } catch {}
  }
  let attached = 0;
  for (const url of mockups.slice(0, 6)) {
    try {
      await shopifyRest(creds, `/products/${DRESS.shopifyProductId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: "The Dress" } })
      });
      attached += 1;
    } catch {}
  }
  console.log(`[fix] ✓ attached ${attached} mockup images to Shopify product ${DRESS.shopifyProductId}`);

  console.log(`\nDone. Review at /admin/products/${DRESS.shopifyProductId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
