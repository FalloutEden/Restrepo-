// Smoke test: prove CJ search + detail end-to-end with auto-refreshing token.
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/smoke-cj.ts
//
// Env required: CJ_EMAIL, CJ_API_KEY (or legacy CJ_ACCESS_TOKEN).

import { searchCjProducts, getCjProductDetail, findCjCategoryIds } from "@/lib/cj-service";

async function main() {
  console.log("\n--- 1. Discover IoT/security category IDs ---");
  const cats = await findCjCategoryIds(/smart|security|surveillance|camera|lock|sensor|alarm/i);
  cats.forEach((c) => console.log(`  [${c.id}] ${c.path}`));

  // Smart Electronics covers most IoT — doorbells, plugs, cameras, hubs, sensors
  const smartElectronicsId = cats.find((c) => /Smart Electronics/i.test(c.path))?.id;
  const securityId = cats.find((c) => /Security & Protection/i.test(c.path))?.id;
  const targetCategoryId = smartElectronicsId ?? securityId;

  if (!targetCategoryId) {
    console.log("  (no IoT category found — bailing)");
    return;
  }

  console.log(`\n--- 2. Browse "Smart Electronics" category (10 results) ---`);
  const list = await searchCjProducts({ categoryId: targetCategoryId, pageSize: 10 });
  list.forEach((p, i) =>
    console.log(`  ${i + 1}. [${p.pid}] ${p.title.slice(0, 70)} | $${p.priceMin}–$${p.priceMax}`)
  );

  console.log(`\n--- 3. Detail fetch on first hit (variants + images) ---`);
  const candidate = list[0];
  if (!candidate) {
    console.log("  (no candidate)");
    return;
  }
  const detail = await getCjProductDetail(candidate.pid);
  if (!detail) {
    console.log(`  no detail returned for pid=${candidate.pid}`);
    return;
  }
  console.log(`  Title:       ${detail.title}`);
  console.log(`  Category:    ${detail.categoryName ?? "?"}`);
  console.log(`  Price range: $${detail.priceMin}–$${detail.priceMax}`);
  console.log(`  Images:      ${detail.images.length}`);
  detail.images.slice(0, 3).forEach((img) => console.log(`    - ${img.slice(0, 100)}`));
  console.log(`  Variants:    ${detail.variants.length}`);
  detail.variants.slice(0, 5).forEach((v) =>
    console.log(`    - [${v.sku}] ${v.variantName} | $${v.variantSellPrice}`)
  );
}

main().catch((err) => {
  console.error("[smoke-cj] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
