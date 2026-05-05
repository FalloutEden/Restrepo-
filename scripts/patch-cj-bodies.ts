// Re-render body_html for already-materialized CJ drafts using the latest
// cleanCjDescription + supplier-info-stripped renderer. PATCHes each Shopify
// product in place — no delete+recreate churn.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/patch-cj-bodies.ts <productId1> <productId2> ...

import { getCjProductDetail, cleanCjDescription } from "@/lib/cj-service";
import { resolveBrand } from "@/lib/brands";
import { rewriteProductDescription } from "@/lib/copywriting";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const VER = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2024-04";
const TOKEN = process.env.SHOPIFY_API_KEY;

async function main() {
  const productIds = process.argv.slice(2);
  if (productIds.length === 0) {
    console.error("Usage: patch-cj-bodies.ts <productId1> <productId2> ...");
    process.exit(1);
  }

  for (const id of productIds) {
    // Fetch product to extract its cj-pid:<pid> tag.
    const r = await fetch(`https://${SHOP}/admin/api/${VER}/products/${id}.json`, {
      headers: { "X-Shopify-Access-Token": TOKEN as string }
    });
    if (!r.ok) {
      console.log(`[skip] ${id} — fetch ${r.status}`);
      continue;
    }
    const { product } = (await r.json()) as { product: { tags: string; title: string } };
    const tags = (product.tags ?? "").split(",").map((t) => t.trim());
    const pidTag = tags.find((t) => t.startsWith("cj-pid:"));
    if (!pidTag) {
      console.log(`[skip] ${id} — no cj-pid tag (not CJ-sourced)`);
      continue;
    }
    const cjPid = pidTag.slice("cj-pid:".length);
    const brandSlug = tags.find((t) => t.startsWith("brand:"))?.slice("brand:".length);
    const brand = resolveBrand(brandSlug);

    // Re-pull CJ detail and rebuild body_html using the AI rewriter.
    const detail = await getCjProductDetail(cjPid);
    if (!detail) {
      console.log(`[skip] ${id} — CJ pid ${cjPid} returned no detail`);
      continue;
    }
    const cleanedRaw = cleanCjDescription(detail.description) || detail.title;

    let bodyHtml: string;
    let promotionalTitle: string | undefined;
    try {
      const rewritten = await rewriteProductDescription({
        brand,
        rawTitle: detail.title,
        rawDescription: cleanedRaw,
        category: detail.categoryName
      });
      bodyHtml = rewritten.bodyHtml;
      promotionalTitle = rewritten.promotionalTitle;
    } catch (error) {
      console.warn(`  rewrite failed for ${id}: ${error instanceof Error ? error.message : error}; using clean bullets`);
      const escaped = cleanedRaw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      bodyHtml = escaped.replace(/\r?\n/g, "<br />");
    }

    const update: Record<string, unknown> = { id: Number(id), body_html: bodyHtml };
    if (promotionalTitle && promotionalTitle.length > 0 && promotionalTitle.length < 120) {
      update.title = promotionalTitle;
    }

    const patch = await fetch(`https://${SHOP}/admin/api/${VER}/products/${id}.json`, {
      method: "PUT",
      headers: { "X-Shopify-Access-Token": TOKEN as string, "Content-Type": "application/json" },
      body: JSON.stringify({ product: update })
    });
    console.log(`[${patch.status}] ${id} → ${(promotionalTitle ?? product.title).slice(0, 70)}  (brand=${brand.slug}, cj-pid=${cjPid})`);
  }
}

main().catch((err) => {
  console.error("[patch-cj-bodies] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
