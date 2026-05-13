// CEREBRO competitor + benchmark scraper. Fetches a curated list of public
// URLs and adds each to graphify's ./raw/ corpus, then triggers semantic
// re-extraction. The brain learns from real revenue stats, founder playbooks,
// channel benchmarks, and conversion case studies — not just our own code.
//
// Targets are chosen for:
//   - Real numbers ($MRR, conversion %, ROAS) — concrete data, not vibes
//   - Public, no-auth content (respect robots/standard etiquette)
//   - Apparel + POD + Shopify + email/conversion relevance
//   - Anti-bot-light surfaces (HTML > JS-heavy SPA)
//
// Run:
//   set -a; source .env.local; set +a; node --import tsx scripts/cerebro-scrape-competitors.ts

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Target = {
  url: string;
  category: "revenue" | "pod" | "email" | "channels" | "founder";
  why: string;
};

const TARGETS: Target[] = [
  // ── Revenue / case studies (real $/MRR numbers) ──
  { url: "https://www.shopify.com/blog/case-studies", category: "revenue", why: "Index of Shopify customer revenue stories — entry to specific case studies" },
  { url: "https://www.indiehackers.com/products", category: "revenue", why: "Founder-reported MRR for active SaaS + ecom — concrete numbers" },
  { url: "https://baremetrics.com/open", category: "revenue", why: "Public revenue dashboards from real SaaS companies — Buffer, Convertkit historically here" },

  // ── POD / apparel playbooks ──
  { url: "https://www.printful.com/blog/best-selling-print-on-demand-products", category: "pod", why: "Printful's own data on what sells — primary source for POD demand signals" },
  { url: "https://www.printful.com/blog/how-to-start-a-clothing-business", category: "pod", why: "Printful canonical playbook for POD apparel — what THEY tell sellers" },
  { url: "https://www.shopify.com/blog/print-on-demand", category: "pod", why: "Shopify's POD-specific guidance — channel-of-record content" },
  { url: "https://www.indiehackers.com/post/lessons-from-running-a-print-on-demand-store-2025", category: "pod", why: "Indie operator's lessons (search for similar real-world posts)" },

  // ── Email / conversion (Klaviyo + benchmarks) ──
  { url: "https://www.klaviyo.com/blog/email-marketing-benchmarks", category: "email", why: "Klaviyo's own benchmark data: open rates, click rates, revenue per send" },
  { url: "https://www.klaviyo.com/customers", category: "email", why: "Klaviyo customer success stories with revenue numbers" },
  { url: "https://baymard.com/lists/cart-abandonment-rate", category: "email", why: "Baymard Institute cart abandonment data — the canonical benchmark" },

  // ── Channels (TikTok / Pinterest / SEO) ──
  { url: "https://business.tiktok.com/en-us/blog", category: "channels", why: "TikTok for Business official blog — channel best practices + creator economy data" },
  { url: "https://newsroom.pinterest.com/en/pinterest-trends", category: "channels", why: "Pinterest trend reports — what's growing in fashion/apparel verticals" },
  { url: "https://ahrefs.com/blog/ecommerce-seo/", category: "channels", why: "Ahrefs ecommerce SEO — canonical playbook for organic search" },

  // ── Founder interviews + playbooks ──
  { url: "https://www.shopify.com/blog/topics/founder-stories", category: "founder", why: "Shopify-hosted founder stories — concrete what-they-did patterns" },
  { url: "https://www.indiehackers.com/interviews", category: "founder", why: "IndieHackers interviews with real founders + their numbers" }
];

async function scrapeOne(t: Target): Promise<{ ok: boolean; reason?: string }> {
  console.log(`\n[${t.category}] ${t.url}`);
  console.log(`  why: ${t.why}`);
  const result = spawnSync("graphify", ["add", t.url], {
    encoding: "utf8",
    timeout: 90_000,
    cwd: process.cwd()
  });
  if (result.error) {
    console.log(`  ✗ ${result.error.message}`);
    return { ok: false, reason: result.error.message };
  }
  if (result.status !== 0) {
    const err = (result.stderr || "").slice(0, 300);
    console.log(`  ✗ exit ${result.status}: ${err}`);
    return { ok: false, reason: `exit ${result.status}: ${err}` };
  }
  console.log(`  ✓ ${(result.stdout || "").trim().split("\n").slice(-2).join(" | ")}`);
  return { ok: true };
}

async function main() {
  console.log(`[scrape] ${TARGETS.length} targets — fetching one at a time with 3s spacing\n`);

  const results: Array<{ url: string; category: string; ok: boolean; reason?: string }> = [];
  for (const t of TARGETS) {
    const r = await scrapeOne(t);
    results.push({ url: t.url, category: t.category, ...r });
    await new Promise((r) => setTimeout(r, 3000));
  }

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n[scrape] ${ok.length}/${TARGETS.length} succeeded`);
  console.log(`\nBy category (ok / total):`);
  for (const cat of ["revenue", "pod", "email", "channels", "founder"]) {
    const inCat = results.filter((r) => r.category === cat);
    const okInCat = inCat.filter((r) => r.ok).length;
    console.log(`  ${cat.padEnd(10)} ${okInCat}/${inCat.length}`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  ✗ ${f.url}  — ${f.reason?.slice(0, 100)}`);
  }

  // Write results summary
  fs.mkdirSync(".openclaw", { recursive: true });
  fs.writeFileSync(".openclaw/cerebro-scrape-results.json", JSON.stringify(results, null, 2));
  console.log(`\n[wrote] .openclaw/cerebro-scrape-results.json`);

  console.log(`\nNext: graphify will already have updated the graph after each 'add'.`);
  console.log(`For a clean cluster pass: graphify cluster-only .`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
