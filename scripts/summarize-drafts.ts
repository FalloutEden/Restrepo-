// Read-only: list every draft product per brand and write a markdown digest
// to .openclaw/drafts-summary.md so the merchant has a one-glance view of
// what's pending review before launch.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/summarize-drafts.ts

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { listConfiguredShopifyCredentials } from "@/lib/shopify-credentials";
import { listShopifyDrafts, type ShopifyDraftSummary } from "@/lib/shopify-service";
import { evaluateBrandFit } from "@/lib/brand-fit-filter";

type Bucket = "publish_candidate" | "off_brand_delete" | "wrong_brand_for_apparel" | "needs_decision";

function inferFulfillment(d: ShopifyDraftSummary): "printful" | "zendrop" | "digital" {
  const tags = (d.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("zendrop") || t.includes("cj-"))) return "zendrop";
  return "printful";
}

function classify(d: ShopifyDraftSummary, brandSlug: string): { bucket: Bucket; reason: string } {
  const fit = evaluateBrandFit(
    { title: d.title, productServiceType: d.productType ?? "", niche: undefined },
    inferFulfillment(d),
    brandSlug
  );
  if (!fit.ok) {
    return { bucket: "off_brand_delete", reason: fit.reason ?? "fails brand-fit filter" };
  }
  // LockLayer is hardware-only. Any apparel/wall-art/drinkware draft on LockLayer
  // is a pipeline-misroute even if it would pass brand-fit elsewhere.
  if (brandSlug === "locklayer") {
    const t = (d.productType ?? "").toLowerCase();
    if (/apparel|t-shirt|hoodie|tumbler|drinkware|wall art|canvas|jersey|sweatshirt|hat|polo/.test(t)) {
      return {
        bucket: "wrong_brand_for_apparel",
        reason: `${d.productType} listed under LockLayer (hardware-only brand)`
      };
    }
  }
  // CJ-sourced LockLayer hardware = needs human margin check before publish.
  if (brandSlug === "locklayer" && (d.tags ?? []).some((t) => t.startsWith("cj-pid:"))) {
    return { bucket: "needs_decision", reason: "CJ-sourced — verify margin + image quality before publish" };
  }
  // Default for BV / non-flagged: publish-candidate.
  return { bucket: "publish_candidate", reason: "on-brand, ready for publish/skip decision" };
}

async function main() {
  const creds = listConfiguredShopifyCredentials();
  const sections: string[] = [
    `# Drafts pending review`,
    ``,
    `Generated ${new Date().toISOString()}.`,
    ``,
    `Each draft is invisible to customers until you Publish (P) it via \`scripts/store-cleanup.ts\` or the Shopify admin. Buckets below are decisions, not commands — nothing here changes state.`,
    ``,
    `**Buckets:**`,
    `- **off_brand_delete** — fails brand-fit filter (occupation-specific, quote-based, holiday). Recommendation: delete.`,
    `- **wrong_brand_for_apparel** — apparel/drinkware/wall-art accidentally created under LockLayer (which is hardware-only). Recommendation: delete or rebrand.`,
    `- **needs_decision** — CJ-sourced hardware that's on-brand for LockLayer but needs the merchant to verify margin and image quality before publish.`,
    `- **publish_candidate** — on-brand, default safe to publish.`,
    ``
  ];

  let totalDrafts = 0;
  const aggregate: Record<Bucket, number> = {
    off_brand_delete: 0,
    wrong_brand_for_apparel: 0,
    needs_decision: 0,
    publish_candidate: 0
  };

  for (const c of creds) {
    const drafts = await listShopifyDrafts(250, c.brandSlug);
    totalDrafts += drafts.length;
    sections.push(`## ${c.brandSlug} (${drafts.length})`);
    sections.push("");
    if (drafts.length === 0) {
      sections.push(`_No drafts pending._`);
      sections.push("");
      continue;
    }
    const grouped: Record<Bucket, Array<{ d: ShopifyDraftSummary; reason: string }>> = {
      off_brand_delete: [],
      wrong_brand_for_apparel: [],
      needs_decision: [],
      publish_candidate: []
    };
    for (const d of drafts) {
      const { bucket, reason } = classify(d, c.brandSlug);
      grouped[bucket].push({ d, reason });
      aggregate[bucket] += 1;
    }
    const renderBucket = (label: string, items: typeof grouped[Bucket]) => {
      if (items.length === 0) return;
      sections.push(`### ${label} — ${items.length}`);
      sections.push("");
      for (const { d, reason } of items) {
        const tagSummary =
          d.tags && d.tags.length > 0 ? ` · tags: \`${d.tags.slice(0, 4).join(", ")}\`` : "";
        sections.push(
          `- **${d.title}** — [${d.id}](${d.adminUrl}) · ${d.productType || "no type"}${tagSummary}`
        );
        sections.push(`   _${reason}_`);
      }
      sections.push("");
    };
    renderBucket("OFF-BRAND — recommend DELETE", grouped.off_brand_delete);
    renderBucket("WRONG BRAND (apparel under LockLayer) — recommend DELETE", grouped.wrong_brand_for_apparel);
    renderBucket("NEEDS DECISION", grouped.needs_decision);
    renderBucket("PUBLISH CANDIDATE", grouped.publish_candidate);
  }

  sections.push(``);
  sections.push(`## Summary`);
  sections.push("");
  sections.push(`- Total drafts: ${totalDrafts}`);
  sections.push(`- Off-brand (delete): **${aggregate.off_brand_delete}**`);
  sections.push(`- Wrong brand (delete): **${aggregate.wrong_brand_for_apparel}**`);
  sections.push(`- Needs decision: ${aggregate.needs_decision}`);
  sections.push(`- Publish candidates: **${aggregate.publish_candidate}**`);

  sections.push(`## Total: ${totalDrafts} draft${totalDrafts === 1 ? "" : "s"} pending`);
  sections.push(``);
  sections.push(`To work through them interactively:`);
  sections.push("");
  sections.push("```");
  sections.push("node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/store-cleanup.ts");
  sections.push("```");
  sections.push("");
  sections.push(`Each draft will prompt: \`[V]iew  [P]ublish  [D]elete  [S]kip  [Q]uit\`. Safe to interrupt — it picks up where you stopped on next run.`);

  const outPath = path.join(process.cwd(), ".openclaw", "drafts-summary.md");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, sections.join("\n"), "utf8");
  console.log(`[summary] wrote ${outPath}`);
  console.log(`[summary] ${totalDrafts} draft(s) total across ${creds.length} brand(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
