import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { audit } from "@/lib/audit";

// Industry RSS ingest cron — runs daily via Vercel scheduler.
//
// Pulls a curated list of feeds (Shopify, Printful, Klaviyo, indie hackers
// product launches, ecom analytics) so CEREBRO has a fresh stream of
// industry signal without the founder hunting it down. New items get
// written to .openclaw/research/feeds/<feed-slug>/<date>-<slug>.md so the
// next `graphify update .` pulls them into the brain.
//
// On Vercel: the fetch + parse step still runs (cheap, useful for a daily
// audit-log heartbeat showing what's hot). We do NOT try to persist files
// there because /tmp is ephemeral and graphify isn't installed anyway.
// The response body returns the headline list so the admin dashboard can
// surface "this week in ecom" without anyone keeping a tab open.
//
// Cost: $0 (just outbound HTTP).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Feed = { slug: string; name: string; url: string; tags: string[] };

// Curated set — keep this tight. Each new feed = 1 more outbound request +
// parse cost per day. Add aggressively when an agent surfaces a gap, prune
// when a feed goes dead.
// Validated 2026-05-13 — every URL below returned a parseable feed with at
// least 5 items. Klaviyo / Baymard / Shopify Engineering / IndieHackers do
// not publish public feeds (all 404 or HTML), so we route around them.
const FEEDS: Feed[] = [
  {
    slug: "shopify-changelog",
    name: "Shopify Changelog",
    url: "https://shopify.dev/changelog/feed",
    tags: ["platform", "api", "ecom"]
  },
  {
    slug: "shopify-news",
    name: "Shopify News",
    url: "https://news.shopify.com/feed",
    tags: ["platform", "business", "ecom"]
  },
  {
    slug: "printful-blog",
    name: "Printful Blog",
    url: "https://www.printful.com/blog/feed",
    tags: ["pod", "fulfillment", "ecom"]
  },
  {
    slug: "stripe-blog",
    name: "Stripe Blog",
    url: "https://stripe.com/blog/feed.rss",
    tags: ["payments", "platform"]
  },
  {
    slug: "nielsen-norman",
    name: "Nielsen Norman Group",
    url: "https://www.nngroup.com/feed/rss/",
    tags: ["ux", "research", "conversion"]
  },
  {
    slug: "practical-ecom",
    name: "Practical Ecommerce",
    url: "https://www.practicalecommerce.com/feed",
    tags: ["ecom", "tactics", "news"]
  },
  {
    slug: "producthunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com/feed",
    tags: ["saas", "competitive", "launches"]
  },
  {
    slug: "indiehackers-podcast",
    name: "Indie Hackers Podcast",
    url: "https://feeds.transistor.fm/the-indie-hackers-podcast",
    tags: ["saas", "indie", "playbooks"]
  }
];

type Item = {
  feedSlug: string;
  feedName: string;
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  tags: string[];
};

const LOOKBACK_MS = 36 * 60 * 60 * 1000; // 36h window so we never miss a day on schedule jitter

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractCdata(s: string): string {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}

function pickTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  return decodeEntities(extractCdata(m[1])).trim();
}

function pickLink(xml: string): string | undefined {
  // Atom-style <link href="..."/>
  const atom = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return atom[1];
  // RSS-style <link>url</link>
  return pickTag(xml, "link");
}

function parseFeed(xml: string, feed: Feed): Item[] {
  // RSS: <item>...</item>; Atom: <entry>...</entry>
  const blocks: string[] = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) blocks.push(m[0]);
  if (blocks.length === 0) {
    while ((m = entryRe.exec(xml)) !== null) blocks.push(m[0]);
  }

  const items: Item[] = [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    const link = pickLink(block);
    const pubDate =
      pickTag(block, "pubDate") ?? pickTag(block, "published") ?? pickTag(block, "updated");
    const description =
      pickTag(block, "description") ?? pickTag(block, "summary") ?? pickTag(block, "content");
    if (!title || !link) continue;
    items.push({
      feedSlug: feed.slug,
      feedName: feed.name,
      title: stripTags(title),
      link,
      pubDate,
      description: description ? stripTags(description).slice(0, 600) : undefined,
      tags: feed.tags
    });
  }
  return items;
}

async function fetchFeed(feed: Feed): Promise<{ items: Item[]; error?: string }> {
  try {
    const r = await fetch(feed.url, {
      headers: {
        "User-Agent": "OperatorRSSIngest/1.0 (+https://blackvault.studio)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    const xml = await r.text();
    return { items: parseFeed(xml, feed) };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function withinLookback(item: Item): boolean {
  if (!item.pubDate) return true; // unknown date — assume fresh, dedup downstream
  const t = new Date(item.pubDate).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t <= LOOKBACK_MS;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function writeItemMarkdown(item: Item): { wrote: boolean; path?: string; skipped?: string } {
  const base = path.join(process.cwd(), ".openclaw", "research", "feeds", item.feedSlug);
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  const date = (item.pubDate ? new Date(item.pubDate) : new Date()).toISOString().slice(0, 10);
  const fname = `${date}-${slugify(item.title) || "untitled"}.md`;
  const fpath = path.join(base, fname);
  if (fs.existsSync(fpath)) return { wrote: false, skipped: "exists" };
  const front = `---
title: ${JSON.stringify(item.title)}
feed: ${item.feedName}
link: ${item.link}
pubDate: ${item.pubDate ?? ""}
tags: [${item.tags.map((t) => JSON.stringify(t)).join(", ")}]
---

# ${item.title}

${item.description ?? ""}

Source: ${item.link}
`;
  try {
    fs.writeFileSync(fpath, front);
    return { wrote: true, path: fpath };
  } catch (e) {
    return { wrote: false, skipped: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onVercel = Boolean(process.env.VERCEL);
  const startedAt = Date.now();

  const results = await Promise.all(
    FEEDS.map(async (f) => {
      const { items, error } = await fetchFeed(f);
      const fresh = items.filter(withinLookback);
      return { feed: f, items, fresh, error };
    })
  );

  let wrote = 0;
  let skipped = 0;
  const writeLog: Array<{ slug: string; wrote: number; skipped: number }> = [];

  // Only persist on local — Vercel /tmp is ephemeral and graphify isn't there
  if (!onVercel) {
    for (const r of results) {
      let w = 0;
      let s = 0;
      for (const item of r.fresh) {
        const res = writeItemMarkdown(item);
        if (res.wrote) w += 1;
        else s += 1;
      }
      wrote += w;
      skipped += s;
      writeLog.push({ slug: r.feed.slug, wrote: w, skipped: s });
    }
  }

  const headlines = results
    .flatMap((r) => r.fresh.map((it) => ({ slug: r.feed.slug, title: it.title, link: it.link, pubDate: it.pubDate })))
    .slice(0, 40);

  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ slug: r.feed.slug, error: r.error }));

  audit({
    action: "cron.run",
    actor: "industry-rss-cron",
    target: "feeds",
    detail: {
      feedsChecked: FEEDS.length,
      totalItems: results.reduce((a, r) => a + r.items.length, 0),
      freshItems: results.reduce((a, r) => a + r.fresh.length, 0),
      wrote,
      skipped,
      errors,
      onVercel,
      durationMs: Date.now() - startedAt
    },
    ok: errors.length === 0
  });

  return NextResponse.json({
    ok: true,
    onVercel,
    durationMs: Date.now() - startedAt,
    feedsChecked: FEEDS.length,
    totalFreshItems: headlines.length,
    wrote,
    skipped,
    writeLog: onVercel ? "skipped on vercel — local-only" : writeLog,
    headlines,
    errors
  });
}
