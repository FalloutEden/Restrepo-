import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { audit } from "@/lib/audit";

// Knowledge-gap tracker cron — runs daily via Vercel scheduler.
//
// Reads .openclaw/cerebro-usage.jsonl (the log that lib/operator-tools.ts
// cerebro_query writes for every brain hit) and surfaces the queries that
// keep returning thin results. Those are the topics CEREBRO is hungry for —
// the gaps a future enrichment cron (or a human briefing) should fill.
//
// Output: writes .openclaw/cerebro-gaps.json with a ranked gap list plus
// summary stats. The operator UI / admin dashboard can then read that file
// and tell the founder "your agents asked about hooks 14 times this week
// and got <3 nodes each time — feed them a brief."
//
// Cost: $0. Pure local-file analysis. Safe to run on Vercel even though
// the usage log only meaningfully populates on the founder's local instance
// for now (operator runs there). The endpoint will report "no usage data
// found" gracefully on Vercel until the brain is hosted.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UsageEntry = {
  ts: string;
  mode: "query" | "explain" | "path";
  input: string;
  budget?: number;
  returnedNodes?: string[];
  nodeCount?: number;
  source?: string;
  conversationId?: string;
  exitStatus?: number | null;
};

type GapSignal = {
  query: string;
  mode: UsageEntry["mode"];
  hits: number;
  avgNodeCount: number;
  lastSeenAt: string;
  exampleConversationId?: string;
};

const USAGE_PATH = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "cerebro-usage.jsonl");
})();

const GAPS_PATH = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "cerebro-gaps.json");
})();

// A query returning fewer than this many nodes counts as a "thin hit" —
// the brain knows almost nothing about the topic and is the signal we mine.
const THIN_HIT_THRESHOLD = 3;

// Only look at the last N days of usage so old gaps that are now filled
// stop dominating the list.
const LOOKBACK_DAYS = 30;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function readUsage(): UsageEntry[] {
  if (!fs.existsSync(USAGE_PATH)) return [];
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const lines = fs.readFileSync(USAGE_PATH, "utf8").split("\n").filter(Boolean);
  const out: UsageEntry[] = [];
  for (const ln of lines) {
    try {
      const e = JSON.parse(ln) as UsageEntry;
      const t = new Date(e.ts).getTime();
      if (!Number.isFinite(t) || t < cutoff) continue;
      out.push(e);
    } catch {}
  }
  return out;
}

function rankGaps(entries: UsageEntry[]): GapSignal[] {
  const byKey = new Map<
    string,
    {
      query: string;
      mode: UsageEntry["mode"];
      hits: number;
      totalNodes: number;
      lastSeenAt: string;
      exampleConversationId?: string;
    }
  >();

  for (const e of entries) {
    const nc = Number(e.nodeCount ?? e.returnedNodes?.length ?? 0);
    if (nc >= THIN_HIT_THRESHOLD) continue;
    const norm = normalize(e.input);
    if (!norm) continue;
    const key = `${e.mode}::${norm}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.hits += 1;
      prev.totalNodes += nc;
      if (e.ts > prev.lastSeenAt) prev.lastSeenAt = e.ts;
      if (!prev.exampleConversationId && e.conversationId) {
        prev.exampleConversationId = e.conversationId;
      }
    } else {
      byKey.set(key, {
        query: e.input,
        mode: e.mode,
        hits: 1,
        totalNodes: nc,
        lastSeenAt: e.ts,
        exampleConversationId: e.conversationId
      });
    }
  }

  const ranked: GapSignal[] = Array.from(byKey.values())
    .map((g) => ({
      query: g.query,
      mode: g.mode,
      hits: g.hits,
      avgNodeCount: g.hits === 0 ? 0 : Number((g.totalNodes / g.hits).toFixed(2)),
      lastSeenAt: g.lastSeenAt,
      exampleConversationId: g.exampleConversationId
    }))
    .sort((a, b) => b.hits - a.hits || a.avgNodeCount - b.avgNodeCount);

  // Cap the file size — top 50 is plenty to drive enrichment decisions
  return ranked.slice(0, 50);
}

function writeGaps(summary: object) {
  const dir = path.dirname(GAPS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(GAPS_PATH, JSON.stringify(summary, null, 2));
  } catch (e) {
    console.warn("[knowledge-gap-tracker] write failed:", e instanceof Error ? e.message : e);
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const entries = readUsage();
  const totalQueries = entries.length;
  const thinHits = entries.filter(
    (e) => Number(e.nodeCount ?? e.returnedNodes?.length ?? 0) < THIN_HIT_THRESHOLD
  ).length;
  const gaps = rankGaps(entries);

  const summary = {
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    thinHitThreshold: THIN_HIT_THRESHOLD,
    usagePath: USAGE_PATH,
    totals: {
      queriesAnalyzed: totalQueries,
      thinHits,
      thinHitRate: totalQueries > 0 ? Number((thinHits / totalQueries).toFixed(3)) : 0,
      distinctGapTopics: gaps.length
    },
    topGaps: gaps
  };

  writeGaps(summary);

  audit({
    action: "cron.run",
    actor: "knowledge-gap-tracker-cron",
    target: "cerebro",
    detail: {
      queriesAnalyzed: totalQueries,
      thinHits,
      distinctGapTopics: gaps.length,
      onVercel: Boolean(process.env.VERCEL)
    },
    ok: true
  });

  return NextResponse.json({
    ok: true,
    ...summary,
    // Drop topGaps from the JSON response too — clients can fetch the file
    // if they want the full list; the response should stay light.
    topGaps: gaps.slice(0, 10),
    note:
      totalQueries === 0
        ? "No CEREBRO usage entries in lookback window — operator likely runs on a different instance. Gap analysis is a no-op until usage is centralized."
        : undefined
  });
}
