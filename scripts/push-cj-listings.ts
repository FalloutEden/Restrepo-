// Push N IoT/security drafts to LockLayer Shopify, sourced from CJ's
// Security & Protection category, applying a 3.5x markup.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/push-cj-listings.ts [count]
//
// Default count = 5. Listings are created as Shopify drafts (not published).

import { searchAndDetailCjProducts, cleanCjDescription } from "@/lib/cj-service";
import { materializeProduct } from "@/lib/product-materialization";

const SECURITY_CATEGORY_ID = "192C9D30-5FEA-4B67-B251-AF6E97678DFF";

// Pull every Shopify product tagged `cj-sourced` and harvest their cj-pid tags
// so we don't re-push the same CJ product twice. Makes push-cj-listings.ts
// idempotent — running it again pulls the next N unseen products.
async function getAlreadyPushedCjPids(): Promise<Set<string>> {
  const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
  const VER = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-04";
  const TOKEN = process.env.SHOPIFY_API_KEY;
  if (!SHOP || !TOKEN) return new Set();
  const pids = new Set<string>();
  // Page through Shopify products (cap at 5 pages = 1250 products — plenty).
  let nextUrl: string = `https://${SHOP}/admin/api/${VER}/products.json?limit=250&fields=id,tags`;
  for (let pages = 0; pages < 5; pages += 1) {
    const resp: Response = await fetch(nextUrl, { headers: { "X-Shopify-Access-Token": TOKEN } });
    if (!resp.ok) break;
    const json = (await resp.json()) as { products?: Array<{ tags?: string }> };
    for (const p of json.products ?? []) {
      for (const tag of (p.tags ?? "").split(",").map((t) => t.trim())) {
        if (tag.startsWith("cj-pid:")) pids.add(tag.slice("cj-pid:".length));
      }
    }
    const link: string = resp.headers.get("link") || resp.headers.get("Link") || "";
    const nextMatch: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    if (!nextMatch) break;
    nextUrl = nextMatch[1];
  }
  return pids;
}

async function main() {
  const count = Math.max(1, Math.min(Number(process.argv[2] ?? 5), 50));
  console.log(`\n--- Pulling fresh products from CJ Security & Protection (target: ${count}) ---`);

  const alreadyPushed = await getAlreadyPushedCjPids();
  console.log(`  ${alreadyPushed.size} CJ products already in Shopify — will skip.`);

  // Pull a wide pool so even after dedupe + image/price filter we have enough.
  const candidates = await searchAndDetailCjProducts({
    categoryId: SECURITY_CATEGORY_ID,
    pageSize: Math.max(count * 4, 30),
    detailLimit: Math.max(count * 3, 20)
  });

  const usable = candidates.filter(
    (c) =>
      c.images.length > 0 &&
      (c.priceMin > 0 || c.variants.some((v) => v.variantSellPrice > 0)) &&
      !alreadyPushed.has(c.pid)
  );
  console.log(`  ${usable.length} usable candidates from ${candidates.length} fetched (after dedupe + image/price filter).`);

  const picks = usable.slice(0, count);
  picks.forEach((p, i) =>
    console.log(`  ${i + 1}. [${p.pid}] ${p.title.slice(0, 70)} | $${p.priceMin}–$${p.priceMax}`)
  );

  console.log(`\n--- Materializing ${picks.length} drafts ---`);
  const results: Array<{ ok: boolean; pid: string; url?: string; title?: string; error?: string }> = [];
  for (const pick of picks) {
    console.log(`\n  Materializing [${pick.pid}] ${pick.title.slice(0, 60)}...`);
    try {
      // Clean BEFORE slicing — slicing raw HTML can leave an orphan <img tag
      // that the cleaner can't match. cleanCjDescription handles missing input
      // by returning "".
      const cleaned = cleanCjDescription(pick.description);
      const description = (cleaned && cleaned.length > 0)
        ? cleaned.slice(0, 800)
        : `${pick.title}. Sourced from a global supplier — backed by LockLayer's ${pick.categoryName ?? "security"} selection.`;
      const result = await materializeProduct({
        runtimeId: `cj_${pick.pid}_${Date.now()}`,
        title: pick.title,
        description,
        productType: pick.categoryName || "Security & Protection",
        fulfillmentType: "zendrop", // routes to materializeDropshipProduct (CJ-backed)
        niche: "home security IoT",
        keywords: ["security", "smart home", "iot"],
        sourceProductId: pick.pid, // pin this exact CJ product (not a fresh search)
        brand: "locklayer"
      });

      if (result.status === "created") {
        console.log(`    ✔ ${result.shopifyProductUrl}`);
        results.push({ ok: true, pid: pick.pid, url: result.shopifyProductUrl, title: result.title });
      } else {
        console.log(`    ✘ ${result.error}`);
        results.push({ ok: false, pid: pick.pid, error: result.error, title: pick.title });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`    ✘ ${msg}`);
      results.push({ ok: false, pid: pick.pid, error: msg, title: pick.title });
    }
  }

  console.log("\n--- Summary ---");
  const created = results.filter((r) => r.ok);
  console.log(`  Created: ${created.length} / ${results.length}`);
  created.forEach((r) => console.log(`    - ${r.title?.slice(0, 60)}`));
  console.log(`    URLs:`);
  created.forEach((r) => console.log(`      ${r.url}`));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.length}`);
    failed.forEach((r) => console.log(`    - ${r.title?.slice(0, 60)}: ${r.error}`));
  }
}

main().catch((err) => {
  console.error("[push-cj-listings] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
