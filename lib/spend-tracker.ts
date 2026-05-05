import "server-only";

import { mkdir, readFile, appendFile, access } from "node:fs/promises";
import path from "node:path";

// Spend tracker — instruments every Claude and OpenAI call so we know
// exactly what's been charged to the API keys. Append-only JSONL log under
// .openclaw/operator/spend.jsonl. Aggregation reads the tail and groups by
// model + kind + day. Lightweight: no DB, no external deps.

const ROOT = path.join(process.cwd(), ".openclaw", "operator");
const LOG_PATH = path.join(ROOT, "spend.jsonl");

// Cost rates per million tokens (Claude) and per call (OpenAI image).
// Source: anthropic.com/pricing and platform.openai.com/docs/pricing as of
// 2026. Update if rates change.
//
// Note on Claude cache pricing: cache_creation_input_tokens are billed at
// 1.25× input rate; cache_read_input_tokens at 0.1× input rate. Output is
// flat regardless of cache.
const CLAUDE_RATES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4-7[1m]": { input: 30, output: 150 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 }
};

// Anthropic-managed server tools (web_search, web_fetch) bill per call,
// not per token. Recorded separately when present in the response.
const ANTHROPIC_SERVER_TOOL_RATES: Record<string, number> = {
  web_search: 0.01, // $10 per 1000 searches
  web_fetch: 0.001 // $1 per 1000 fetches
};

// gpt-image-1 quality tiers (per generated 1024×1024 image).
const OPENAI_IMAGE_RATES: Record<string, number> = {
  "gpt-image-1:standard": 0.04,
  "gpt-image-1:medium": 0.08,
  "gpt-image-1:high": 0.19,
  "gpt-image-1:edit": 0.04 // same as standard for edits
};

export type SpendEntry = {
  ts: string;
  provider: "anthropic" | "openai";
  // What part of the system made the call (best-effort tagging).
  kind: string;
  model?: string;
  // Anthropic token counts (zero for OpenAI).
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  // For OpenAI image generation, count of images produced.
  imageCount?: number;
  // Quality tier for image gen.
  imageQuality?: "standard" | "medium" | "high";
  // For Anthropic server tools (web_search, web_fetch).
  serverToolName?: string;
  serverToolUses?: number;
  // Final computed dollar cost for this call.
  costUsd: number;
};

async function ensureRoot() {
  await mkdir(ROOT, { recursive: true });
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Cost calculators ──────────────────────────────────────────────────────

export function priceClaudeUsage(opts: {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}): number {
  const rate = CLAUDE_RATES_PER_MTOK[opts.model ?? ""] ?? CLAUDE_RATES_PER_MTOK["claude-opus-4-7"];
  const inputCost = ((opts.inputTokens ?? 0) * rate.input) / 1_000_000;
  const outputCost = ((opts.outputTokens ?? 0) * rate.output) / 1_000_000;
  const cacheWriteCost = ((opts.cacheCreationTokens ?? 0) * rate.input * 1.25) / 1_000_000;
  const cacheReadCost = ((opts.cacheReadTokens ?? 0) * rate.input * 0.1) / 1_000_000;
  return Number((inputCost + outputCost + cacheWriteCost + cacheReadCost).toFixed(6));
}

export function priceServerTool(name: string, uses: number): number {
  const rate = ANTHROPIC_SERVER_TOOL_RATES[name] ?? 0;
  return Number((rate * uses).toFixed(6));
}

export function priceOpenAIImage(quality: "standard" | "medium" | "high" = "standard", count: number = 1): number {
  const rate = OPENAI_IMAGE_RATES[`gpt-image-1:${quality}`] ?? OPENAI_IMAGE_RATES["gpt-image-1:standard"];
  return Number((rate * count).toFixed(6));
}

// ── Recording ─────────────────────────────────────────────────────────────

let currentKind: string = "unknown";

// Set the active "kind" tag for spend that happens during the wrapped call.
// Use this around blocks of work — operator chat turns, pipeline runs,
// content studio drops, etc. Async-local would be cleaner but adds enough
// complexity that a module-global with explicit set/clear is easier to
// reason about for v1. Don't nest these.
export async function withSpendKind<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentKind;
  currentKind = kind;
  try {
    return await fn();
  } finally {
    currentKind = prev;
  }
}

export function getActiveSpendKind(): string {
  return currentKind;
}

export async function recordSpend(partial: Omit<SpendEntry, "ts" | "kind"> & { kind?: string }): Promise<void> {
  await ensureRoot();
  const entry: SpendEntry = {
    ts: new Date().toISOString(),
    kind: partial.kind ?? currentKind,
    ...partial
  };
  await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

// ── Aggregation ───────────────────────────────────────────────────────────

export type SpendSummary = {
  totalUsd: number;
  byProvider: Record<string, number>;
  byKind: Record<string, number>;
  byModel: Record<string, number>;
  byDay: Array<{ day: string; usd: number }>;
  entryCount: number;
  // Computed rolling windows
  today: number;
  last7Days: number;
  last30Days: number;
  // Last entry timestamp (ISO) for "stale" indicators.
  lastEntryAt?: string;
};

export async function summarizeSpend(options: { sinceDays?: number } = {}): Promise<SpendSummary> {
  await ensureRoot();
  if (!(await fileExists(LOG_PATH))) {
    return emptySummary();
  }
  const raw = await readFile(LOG_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const entries: SpendEntry[] = lines
    .map((l) => {
      try {
        return JSON.parse(l) as SpendEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is SpendEntry => !!e);

  const cutoff = options.sinceDays ? Date.now() - options.sinceDays * 24 * 60 * 60 * 1000 : 0;
  const filtered = cutoff ? entries.filter((e) => Date.parse(e.ts) >= cutoff) : entries;

  const byProvider: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byDayMap: Record<string, number> = {};
  let total = 0;

  for (const e of filtered) {
    const cost = e.costUsd ?? 0;
    total += cost;
    byProvider[e.provider] = (byProvider[e.provider] ?? 0) + cost;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + cost;
    if (e.model) byModel[e.model] = (byModel[e.model] ?? 0) + cost;
    const day = e.ts.slice(0, 10);
    byDayMap[day] = (byDayMap[day] ?? 0) + cost;
  }

  const byDay = Object.entries(byDayMap)
    .map(([day, usd]) => ({ day, usd: Number(usd.toFixed(6)) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const todayKey = new Date().toISOString().slice(0, 10);
  const today = byDayMap[todayKey] ?? 0;

  const sinceWindow = (days: number) => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return entries
      .filter((e) => Date.parse(e.ts) >= since)
      .reduce((s, e) => s + (e.costUsd ?? 0), 0);
  };

  return {
    totalUsd: Number(total.toFixed(6)),
    byProvider,
    byKind,
    byModel,
    byDay,
    entryCount: filtered.length,
    today: Number(today.toFixed(6)),
    last7Days: Number(sinceWindow(7).toFixed(6)),
    last30Days: Number(sinceWindow(30).toFixed(6)),
    lastEntryAt: entries.length > 0 ? entries[entries.length - 1].ts : undefined
  };
}

function emptySummary(): SpendSummary {
  return {
    totalUsd: 0,
    byProvider: {},
    byKind: {},
    byModel: {},
    byDay: [],
    entryCount: 0,
    today: 0,
    last7Days: 0,
    last30Days: 0
  };
}

// ── Budget cap ────────────────────────────────────────────────────────────
// Stored under .openclaw/operator/spend-budget.json. Soft cap — emits a
// warning when approached and an alert when exceeded. Does NOT block calls
// in v1 (would require deeper integration in every code path).

export type SpendBudget = {
  monthlyCapUsd: number; // 0 = no cap
  warnAtPct: number; // 0–100, warn when monthly spend exceeds this %
};

const BUDGET_PATH = path.join(ROOT, "spend-budget.json");

const DEFAULT_BUDGET: SpendBudget = {
  monthlyCapUsd: 0,
  warnAtPct: 80
};

export async function readBudget(): Promise<SpendBudget> {
  if (!(await fileExists(BUDGET_PATH))) return { ...DEFAULT_BUDGET };
  try {
    const raw = await readFile(BUDGET_PATH, "utf8");
    return { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as Partial<SpendBudget>) };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export async function writeBudget(budget: SpendBudget): Promise<void> {
  await ensureRoot();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(BUDGET_PATH, JSON.stringify(budget, null, 2), "utf8");
}

export type BudgetStatus = {
  budget: SpendBudget;
  monthlyUsd: number;
  utilizationPct: number;
  warn: boolean;
  exceeded: boolean;
};

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const budget = await readBudget();
  const summary = await summarizeSpend({ sinceDays: 30 });
  const monthlyUsd = summary.totalUsd;
  const utilization =
    budget.monthlyCapUsd > 0 ? (monthlyUsd / budget.monthlyCapUsd) * 100 : 0;
  return {
    budget,
    monthlyUsd: Number(monthlyUsd.toFixed(6)),
    utilizationPct: Number(utilization.toFixed(2)),
    warn: budget.monthlyCapUsd > 0 && utilization >= budget.warnAtPct,
    exceeded: budget.monthlyCapUsd > 0 && monthlyUsd >= budget.monthlyCapUsd
  };
}
