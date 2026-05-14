import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { audit } from "@/lib/audit";

// CEREBRO deep refresh cron — semantic enrichment, runs weekly via Vercel.
//
// What it does:
//   1. Looks at recent .openclaw/research/feeds/**.md (last 7d)
//   2. Bundles them into a synthesis prompt
//   3. Asks Claude Haiku to produce a synthesis brief — "what changed in
//      ecom/saas/payments this week, and what should the operator know"
//   4. Writes the brief to .openclaw/research/synthesis/<date>.md
//   5. Emails the founder the synthesis as a weekly digest
//
// Cost guardrails (do not remove without revisiting budget):
//   - Gated behind CEREBRO_DEEP_REFRESH_ENABLED=1 — defaults to OFF so the
//     cron never auto-spends until the founder explicitly opts in
//   - Uses Haiku (cheapest model), not Opus, because synthesis ≠ generation
//   - Token caps: 50k input / 2k output → ~$0.05 per run worst case
//   - Skips if there are <3 fresh items to summarize (nothing to say)
//
// Schedule (set in vercel.json): Sunday 10:00 UTC. Picked because:
//   - After Saturday's feed-ingest run has caught the weekend posts
//   - Founder sees the digest Sunday afternoon US time, planning for the week
//
// Vercel reality: synthesis runs fine on Vercel; we email the result so
// loss of /tmp on cold start doesn't matter. Local instance additionally
// writes the markdown file for graphify pickup.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FRESH_WINDOW_DAYS = 7;
const MIN_ITEMS_TO_SYNTHESIZE = 3;
const SYNTHESIS_MODEL = "claude-haiku-4-5";

type FeedItem = {
  slug: string;
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  filepath?: string;
};

function readFeedsRecent(): FeedItem[] {
  const root = path.join(process.cwd(), ".openclaw", "research", "feeds");
  if (!fs.existsSync(root)) return [];
  const cutoff = Date.now() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const out: FeedItem[] = [];

  const slugs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const slugEntry of slugs) {
    const slugDir = path.join(root, slugEntry.name);
    const files = fs.readdirSync(slugDir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const fp = path.join(slugDir, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) continue;
      const raw = fs.readFileSync(fp, "utf8");
      // Extract minimal fields from the frontmatter we ourselves wrote
      const title = (raw.match(/^title:\s*"([^"]+)"/m)?.[1] ?? "Untitled").slice(0, 200);
      const link = raw.match(/^link:\s*(\S+)/m)?.[1] ?? "";
      const pubDate = raw.match(/^pubDate:\s*(\S+)/m)?.[1];
      // The description is the body after the second `---` and the H1
      const body = raw.split(/^---\s*$/m)[2] ?? "";
      const description = body.replace(/^#.*$/m, "").trim().slice(0, 400);
      out.push({ slug: slugEntry.name, title, link, pubDate, description, filepath: fp });
    }
  }
  // Newest first
  return out.sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));
}

function buildPrompt(items: FeedItem[]): string {
  const bySlug = new Map<string, FeedItem[]>();
  for (const it of items) {
    if (!bySlug.has(it.slug)) bySlug.set(it.slug, []);
    bySlug.get(it.slug)!.push(it);
  }
  const sections: string[] = [];
  for (const [slug, list] of bySlug.entries()) {
    sections.push(`## ${slug} (${list.length} items)`);
    for (const it of list.slice(0, 15)) {
      sections.push(
        `- **${it.title}** (${it.pubDate ?? "no date"})\n  ${it.description ?? ""}\n  ${it.link}`
      );
    }
  }
  return `You are CEREBRO's weekly synthesist — the analyst that reads the last 7 days of industry feeds and tells The Operator (a SaaS that auto-builds Shopify+Printful brands) what changed and what to do about it.

Below are the fresh items grouped by source. Synthesize into a brief that:
1. Names 3-5 themes that show up across multiple sources
2. Flags any platform/API changes that affect our integrations (Shopify, Printful, Stripe, Klaviyo)
3. Identifies actionable signals — "if X is happening, the operator should consider Y"
4. Notes anything the merchant tenants should know about

Write tight. No filler. Markdown headings. Aim for 600-900 words.

---

${sections.join("\n\n")}
`;
}

async function runSynthesis(prompt: string): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
  usage?: { in: number; out: number };
}> {
  // Import lazily so the module doesn't throw at cron-bundle load when the
  // key isn't set (Vercel evaluates routes during build).
  const { claude } = await import("@/lib/claude");
  try {
    const result = await claude.messages.create({
      model: SYNTHESIS_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });
    const text = result.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      ok: true,
      text,
      usage: { in: result.usage?.input_tokens ?? 0, out: result.usage?.output_tokens ?? 0 }
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function persistSynthesis(text: string): { wrote: boolean; path?: string; skipped?: string } {
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) return { wrote: false, skipped: "vercel — not persisting to disk, email only" };
  const dir = path.join(process.cwd(), ".openclaw", "research", "synthesis");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const fpath = path.join(dir, `${date}-weekly.md`);
  try {
    fs.writeFileSync(
      fpath,
      `---\ntitle: "CEREBRO weekly synthesis ${date}"\nkind: synthesis\ngeneratedAt: ${new Date().toISOString()}\n---\n\n${text}\n`
    );
    return { wrote: true, path: fpath };
  } catch (e) {
    return { wrote: false, skipped: e instanceof Error ? e.message : String(e) };
  }
}

async function emailDigest(text: string, itemCount: number): Promise<{ sent: boolean; error?: string }> {
  const to = process.env.FOUNDER_ALERT_EMAIL?.trim();
  if (!to) return { sent: false, error: "FOUNDER_ALERT_EMAIL not set" };
  const { sendEmail } = await import("@/lib/email");
  const subject = `CEREBRO weekly synthesis — ${itemCount} items from this week`;
  // Plaintext-to-HTML: minimal — wrap in pre to preserve markdown formatting
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
<div style="font-family:-apple-system,sans-serif;color:#0F0E0C;max-width:680px;margin:0 auto;padding:32px">
  <p style="color:#888;font-size:12px;letter-spacing:.04em;text-transform:uppercase">CEREBRO · weekly synthesis</p>
  <h1 style="font-size:22px;font-weight:700;margin:8px 0 24px">What changed this week</h1>
  <pre style="white-space:pre-wrap;font-family:'SF Mono',Menlo,monospace;font-size:13px;line-height:1.55;background:#f7f5f1;padding:20px;border-radius:8px">${escaped}</pre>
  <p style="color:#888;font-size:12px;margin-top:32px">${itemCount} feed items analyzed · Generated by The Operator</p>
</div>`;
  try {
    await sendEmail({ to, subject, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const enabled = process.env.CEREBRO_DEEP_REFRESH_ENABLED?.trim() === "1";
  if (!enabled) {
    audit({
      action: "cron.skipped",
      actor: "cerebro-deep-refresh-cron",
      target: "synthesis",
      detail: { reason: "CEREBRO_DEEP_REFRESH_ENABLED!=1 — opt-in gate" },
      ok: true
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "CEREBRO_DEEP_REFRESH_ENABLED is not set to '1'. This cron costs ~$0.05/run; flip the env var on Vercel when you're ready to spend."
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    audit({
      action: "cron.skipped",
      actor: "cerebro-deep-refresh-cron",
      target: "synthesis",
      detail: { reason: "ANTHROPIC_API_KEY missing" },
      ok: false
    });
    return NextResponse.json({ ok: false, skipped: true, reason: "ANTHROPIC_API_KEY not set" });
  }

  const items = readFeedsRecent();
  if (items.length < MIN_ITEMS_TO_SYNTHESIZE) {
    audit({
      action: "cron.skipped",
      actor: "cerebro-deep-refresh-cron",
      target: "synthesis",
      detail: { itemsFound: items.length, threshold: MIN_ITEMS_TO_SYNTHESIZE },
      ok: true
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Only ${items.length} fresh items in the last ${FRESH_WINDOW_DAYS}d — below threshold of ${MIN_ITEMS_TO_SYNTHESIZE}.`
    });
  }

  const prompt = buildPrompt(items);
  const synth = await runSynthesis(prompt);
  if (!synth.ok || !synth.text) {
    audit({
      action: "cron.failed",
      actor: "cerebro-deep-refresh-cron",
      target: "synthesis",
      detail: { error: synth.error, itemCount: items.length },
      ok: false
    });
    return NextResponse.json(
      { ok: false, error: synth.error ?? "synthesis produced no text" },
      { status: 500 }
    );
  }

  const persisted = persistSynthesis(synth.text);
  const emailed = await emailDigest(synth.text, items.length);

  audit({
    action: "cron.run",
    actor: "cerebro-deep-refresh-cron",
    target: "synthesis",
    detail: {
      itemCount: items.length,
      model: SYNTHESIS_MODEL,
      tokensIn: synth.usage?.in ?? 0,
      tokensOut: synth.usage?.out ?? 0,
      persisted: persisted.wrote,
      persistedPath: persisted.path,
      emailed: emailed.sent,
      emailError: emailed.error
    },
    ok: true
  });

  return NextResponse.json({
    ok: true,
    itemCount: items.length,
    model: SYNTHESIS_MODEL,
    usage: synth.usage,
    persisted,
    emailed,
    preview: synth.text.slice(0, 600)
  });
}
