// Retry mockup generation for the 6 AOP products after Phase 1 swapped
// production files to file_id 987169507. Phase 2 errored on placement-name
// strictness (mockup-gen requires `front` not `default` for hoodie/bomber/
// sweatshirt/jersey, and requires explicit position for tees).
//
// This script queries each product's printfile spec from Printful, builds
// the correct mockup-gen request per product, calls create-task, polls until
// complete, then replaces Shopify product images.
//
// Production sync files (set in Phase 1) are NOT modified here — they're
// already correctly pointing at file_id 987169507 and will print at 500 DPI.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/bv-aop-mockup-retry.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const PF_BASE = "https://api.printful.com";
const NEW_FILE_ID = 987169507;

type AopTarget = {
  slug: string;
  syncProductId: number;
  productId: number;
  shopifyProductId: number;
};

const TARGETS: AopTarget[] = [
  { slug: "aop-bomber", syncProductId: 431309271, productId: 390, shopifyProductId: 7628502958178 },
  { slug: "aop-hoodie", syncProductId: 431309286, productId: 388, shopifyProductId: 7628503089250 },
  { slug: "aop-sweatshirt", syncProductId: 431309303, productId: 320, shopifyProductId: 7628503187554 },
  { slug: "aop-jersey", syncProductId: 431309310, productId: 835, shopifyProductId: 7628503384162 },
  { slug: "aop-tee-mens", syncProductId: 431309315, productId: 257, shopifyProductId: 7628503482466 },
  { slug: "aop-tee-womens", syncProductId: 431309334, productId: 261, shopifyProductId: 7628503613538 }
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

// Placements we want the AOP design on (skip interior/label placements which
// would need a different brand mark, not the all-over pattern).
const SKIP_PLACEMENTS = new Set(["label_inside", "label_panel", "label_outside_front", "label_outside_back", "details"]);

async function regenerateMockup(target: AopTarget, creds: ShopifyCredentials, fileUrl: string, sleepBefore: boolean) {
  if (sleepBefore) {
    console.log(`  sleeping 65s for Printful rate limit…`);
    await new Promise((r) => setTimeout(r, 65000));
  }

  // Look up the valid placements + dimensions for this product
  const spec = await pf("GET", `/mockup-generator/printfiles/${target.productId}`);
  const printfiles = (spec.result?.printfiles ?? []) as Array<{ printfile_id: number; width: number; height: number }>;
  const variant = spec.result?.variant_printfiles?.[0] as { placements: Record<string, number> } | undefined;
  if (!variant) throw new Error(`No variant_printfiles for product ${target.productId}`);

  const files = Object.entries(variant.placements)
    .filter(([placement]) => !SKIP_PLACEMENTS.has(placement))
    .map(([placement, printfileId]) => {
      const printfile = printfiles.find((p) => p.printfile_id === printfileId);
      if (!printfile) throw new Error(`No printfile spec for ${placement} (id ${printfileId})`);
      return {
        placement,
        image_url: fileUrl,
        // Full-bleed position: design covers the entire print area
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

  console.log(`  placements: ${files.map((f) => f.placement).join(", ")}`);

  // Variants to mockup — first 8 (covers size range typical)
  const productData = await pf("GET", `/products/${target.productId}`);
  const variantIds = (productData.result?.variants ?? []).map((v: { id: number }) => v.id).slice(0, 8);

  const taskResp = await pf("POST", `/mockup-generator/create-task/${target.productId}`, {
    variant_ids: variantIds,
    format: "jpg",
    technique: "CUT_SEW",
    files
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
    if (td.result?.status === "failed") {
      throw new Error(`mockup task failed: ${JSON.stringify(td.result?.error ?? td.result).slice(0, 400)}`);
    }
  }
  console.log(`  ${mockups.length} mockups returned`);

  // Replace Shopify images
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

  // Get the preview URL of the 500 DPI file (Printful locks high-res origin)
  const fileDetail = await pf("GET", `/files/${NEW_FILE_ID}`);
  const fileUrl = fileDetail.result?.preview_url;
  if (!fileUrl) throw new Error(`Could not resolve preview URL for Printful file ${NEW_FILE_ID}`);
  console.log(`[init] mockup source: ${fileUrl}\n`);

  for (let i = 0; i < TARGETS.length; i += 1) {
    const t = TARGETS[i];
    console.log(`[${t.slug}] (${i + 1}/${TARGETS.length}) regenerating…`);
    try {
      await regenerateMockup(t, creds, fileUrl, i > 0);
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message.slice(0, 400) : "unknown"}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
