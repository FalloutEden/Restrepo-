// Revert The Dress to full-bleed placements. The previous "lock to bodice
// scale" pass produced empty white areas on the skirt because Printful's
// cut_sew renders the image once at the specified size and leaves the rest
// as base fabric color — it does NOT tile. Full-bleed = full coverage at
// the cost of slight scale variance between bodice (~3750×3450) and skirt
// (8550×4500). That's a known trade-off.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-dress-revert-fullbleed.ts

const PF_BASE = "https://api.printful.com";
const AOP_FILE_ID = 987169507;
const NECK_LABEL_FILE_ID = 987217027;
const SYNC_PRODUCT_ID = 431477256;
const CATALOG_ID = 315;
const SHOPIFY_PRODUCT_ID = 7644941418594;
const PLACEMENTS = ["top_front", "top_back", "front", "back"] as const;

async function pf(method: "GET" | "POST" | "PUT", urlPath: string, body?: unknown) {
  const r = await fetch(`${PF_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID!,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const spec = await pf("GET", `/mockup-generator/printfiles/${CATALOG_ID}`);
  const printfiles = (spec.result?.printfiles ?? []) as Array<{ printfile_id: number; width: number; height: number }>;
  const variantPrintfiles = spec.result?.variant_printfiles?.[0]?.placements ?? {};
  const dims: Record<string, { w: number; h: number }> = {};
  for (const p of PLACEMENTS) {
    const pfId = variantPrintfiles[p];
    const f = printfiles.find((x) => x.printfile_id === pfId);
    if (!f) throw new Error(`No printfile for ${p}`);
    dims[p] = { w: f.width, h: f.height };
  }
  console.log("[revert] dims:", dims);

  const detail = await pf("GET", `/store/products/${SYNC_PRODUCT_ID}`);
  const syncVariants = (detail.result?.sync_variants ?? []) as Array<{ id: number; external_id?: string; variant_id: number; retail_price: string }>;

  const newSyncVariants = syncVariants.map((sv) => ({
    id: sv.id,
    external_id: sv.external_id,
    variant_id: sv.variant_id,
    retail_price: sv.retail_price,
    files: [
      ...PLACEMENTS.map((p) => {
        const a = dims[p];
        return {
          type: p,
          id: AOP_FILE_ID,
          position: { area_width: a.w, area_height: a.h, width: a.w, height: a.h, top: 0, left: 0 }
        };
      }),
      { type: "label_inside", id: NECK_LABEL_FILE_ID }
    ]
  }));

  await pf("PUT", `/store/products/${SYNC_PRODUCT_ID}`, { sync_variants: newSyncVariants });
  console.log(`[revert] ✓ ${newSyncVariants.length} variants set to full-bleed`);

  await new Promise((r) => setTimeout(r, 3000));

  // Regenerate mockups
  const productData = await pf("GET", `/products/${CATALOG_ID}`);
  const variantIds = (productData.result?.variants ?? []).map((v: { id: number }) => v.id).slice(0, 8);
  const fileDetail = await pf("GET", `/files/${AOP_FILE_ID}`);
  const fileUrl = fileDetail.result?.preview_url;

  const files = PLACEMENTS.map((p) => ({
    placement: p,
    image_url: fileUrl,
    position: { area_width: dims[p].w, area_height: dims[p].h, width: dims[p].w, height: dims[p].h, top: 0, left: 0 }
  }));
  const task = await pf("POST", `/mockup-generator/create-task/${CATALOG_ID}`, {
    variant_ids: variantIds, format: "jpg", technique: "CUT_SEW", files
  });
  const key = task.result?.task_key;
  console.log(`[revert] mockup task=${key} polling…`);
  let mockups: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const td = await pf("GET", `/mockup-generator/task?task_key=${encodeURIComponent(key)}`);
    if (td.result?.status === "completed") {
      const set = new Set<string>();
      for (const m of td.result.mockups ?? []) {
        if (m.mockup_url) set.add(m.mockup_url);
        for (const e of m.extra ?? []) if (e.url) set.add(e.url);
      }
      mockups = [...set];
      break;
    }
    if (td.result?.status === "failed") throw new Error("mockup failed");
  }
  console.log(`[revert] ${mockups.length} mockups`);

  // Replace Shopify images
  const { resolveShopifyCredentials } = await import("@/lib/shopify-credentials");
  const c = resolveShopifyCredentials("black-vault-apparel");
  const imgs = await fetch(`https://${c.storeDomain}/admin/api/${c.apiVersion}/products/${SHOPIFY_PRODUCT_ID}/images.json`, { headers: { "X-Shopify-Access-Token": c.token } }).then((r) => r.json());
  for (const img of imgs.images ?? []) {
    await fetch(`https://${c.storeDomain}/admin/api/${c.apiVersion}/products/${SHOPIFY_PRODUCT_ID}/images/${img.id}.json`, { method: "DELETE", headers: { "X-Shopify-Access-Token": c.token } });
  }
  let attached = 0;
  for (const url of mockups.slice(0, 6)) {
    const r = await fetch(`https://${c.storeDomain}/admin/api/${c.apiVersion}/products/${SHOPIFY_PRODUCT_ID}/images.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json" },
      body: JSON.stringify({ image: { src: url, alt: "The Dress" } })
    });
    if (r.ok) attached += 1;
  }
  console.log(`[revert] ✓ replaced with ${attached} full-bleed mockups`);
}

main().catch((e) => { console.error(e); process.exit(1); });
