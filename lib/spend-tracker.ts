import "server-only";

import { mkdir, readFile, appendFile, access, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import { buildTenantPaths, FOUNDER_TENANT_ID } from "@/lib/tenant-context";

// Spend tracker — instruments every Claude and OpenAI call so we know
// exactly what's been charged to the API keys. Append-only JSONL log.
//
// Per-tenant layout (post-BYOK migration):
//   .openclaw/operator/spend.jsonl                 — founder/admin (legacy path preserved)
//   .openclaw/tenants/<tenantId>/operator/spend.jsonl  — each merchant's own log
//
// Writes go to the per-tenant file so the tenant's dashboard sees only their
// own usage. Cross-tenant aggregation (founder/admin dashboard, spend-ceiling
// cron) iterates tenant directories. The legacy global `.openclaw/operator/
// spend.jsonl` path is preserved for the founder tenant so existing cron and
// reporting code keeps working without per-tenant tenant ID awareness.
//
// Aggregation reads the tail and groups by model + kind + tenant + day.
// Lightweight: no DB, no external deps.

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
  provider: "anthropic" | "openai" | "google";
  // What part of the system made the call (best-effort tagging).
  kind: string;
  // Tenant attribution. "_founder" for admin/dev/internal; tnt_* for real
  // merchants. The spend-ceiling cron uses this to enforce per-tenant caps.
  tenantId: string;
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

// Google Nano Banana 2 (gemini-3.1-flash-image) — ~$0.06/image. Update if
// Google changes pricing. Used to attribute tenant image spend for visibility
// and the per-tenant spend ceiling.
const GOOGLE_IMAGE_RATE = 0.06;
export function priceGoogleImage(count: number = 1): number {
  return Number((GOOGLE_IMAGE_RATE * Math.max(1, count)).toFixed(6));
}

// ── Recording ─────────────────────────────────────────────────────────────

// Active tagging — module-globals updated via with* wrappers. The agent loop
// wraps each turn with both withSpendKind and withSpendTenant so any nested
// API call attributes correctly. Async-local-storage would be more rigorous
// but module-globals are simpler to reason about for v1; don't nest these
// wrappers.
let currentKind: string = "unknown";
let currentTenantId: string = FOUNDER_TENANT_ID;

export async function withSpendKind<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentKind;
  currentKind = kind;
  try {
    return await fn();
  } finally {
    currentKind = prev;
  }
}

export async function withSpendTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentTenantId;
  currentTenantId = tenantId;
  try {
    return await fn();
  } finally {
    currentTenantId = prev;
  }
}

export function getActiveSpendKind(): string {
  return currentKind;
}

export function getActiveTenantId(): string {
  return currentTenantId;
}

function spendLogPathForTenant(tenantId: string): string {
  return buildTenantPaths(tenantId).spendLog;
}

async function ensureSpendDir(p: string) {
  await mkdir(path.dirname(p), { recursive: true });
}

export async function recordSpend(
  partial: Omit<SpendEntry, "ts" | "kind" | "tenantId"> & { kind?: string; tenantId?: string }
): Promise<void> {
  const tenantId = partial.tenantId ?? currentTenantId ?? FOUNDER_TENANT_ID;
  const logPath = spendLogPathForTenant(tenantId);
  await ensureSpendDir(logPath);
  const entry: SpendEntry = {
    ts: new Date().toISOString(),
    kind: partial.kind ?? currentKind,
    tenantId,
    ...partial
  };
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

// ── Aggregation ───────────────────────────────────────────────────────────

export type SpendSummary = {
  totalUsd: number;
  byProvider: Record<string, number>;
  byKind: Record<string, number>;
  byModel: Record<string, number>;
  byTenant: Record<string, number>;
  byDay: Array<{ day: string; usd: number }>;
  entryCount: number;
  // Computed rolling windows
  today: number;
  last7Days: number;
  last30Days: number;
  // Last entry timestamp (ISO) for "stale" indicators.
  lastEntryAt?: string;
};

async function readSpendEntries(tenantId: string): Promise<SpendEntry[]> {
  const logPath = spendLogPathForTenant(tenantId);
  await ensureSpendDir(logPath);
  if (!(await fileExists(logPath))) return [];
  const raw = await readFile(logPath, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as SpendEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is SpendEntry => !!e)
    // Back-fill tenantId on legacy entries written before this migration so
    // grouping works without a migration script.
    .map((e) => ({ ...e, tenantId: e.tenantId ?? FOUNDER_TENANT_ID }));
}

/** All known tenant ids that have a spend log on disk, including the founder. */
async function listTenantIdsWithSpend(): Promise<string[]> {
  const base = (() => {
    const onVercel = Boolean(process.env.VERCEL);
    return onVercel ? path.join("/tmp", "openclaw") : path.join(process.cwd(), ".openclaw");
  })();
  const out: string[] = [FOUNDER_TENANT_ID];
  const tenantsDir = path.join(base, "tenants");
  try {
    const entries = await readdir(tenantsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && /^[a-zA-Z0-9_]+$/.test(e.name)) {
        out.push(e.name);
      }
    }
  } catch {
    // No tenants directory — only founder spend exists
  }
  return out;
}

export async function summarizeSpend(
  options: { sinceDays?: number; tenantId?: string } = {}
): Promise<SpendSummary> {
  const tenantIds = options.tenantId ? [options.tenantId] : await listTenantIdsWithSpend();
  const entriesByTenant = await Promise.all(tenantIds.map(readSpendEntries));
  const entries = entriesByTenant.flat();

  if (entries.length === 0) return emptySummary();

  const cutoff = options.sinceDays ? Date.now() - options.sinceDays * 24 * 60 * 60 * 1000 : 0;
  const filtered = cutoff ? entries.filter((e) => Date.parse(e.ts) >= cutoff) : entries;

  const byProvider: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  const byDayMap: Record<string, number> = {};
  let total = 0;

  for (const e of filtered) {
    const cost = e.costUsd ?? 0;
    total += cost;
    byProvider[e.provider] = (byProvider[e.provider] ?? 0) + cost;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + cost;
    byTenant[e.tenantId] = (byTenant[e.tenantId] ?? 0) + cost;
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

  // entries was flattened from possibly multiple tenant logs. lastEntryAt is
  // the max ts across all of them.
  const lastEntryAt = entries.reduce<string | undefined>((latest, e) => {
    if (!latest || e.ts > latest) return e.ts;
    return latest;
  }, undefined);

  return {
    totalUsd: Number(total.toFixed(6)),
    byProvider,
    byKind,
    byModel,
    byTenant,
    byDay,
    entryCount: filtered.length,
    today: Number(today.toFixed(6)),
    last7Days: Number(sinceWindow(7).toFixed(6)),
    last30Days: Number(sinceWindow(30).toFixed(6)),
    lastEntryAt
  };
}

function emptySummary(): SpendSummary {
  return {
    totalUsd: 0,
    byProvider: {},
    byKind: {},
    byModel: {},
    byTenant: {},
    byDay: [],
    entryCount: 0,
    today: 0,
    last7Days: 0,
    last30Days: 0
  };
}

// ── Budget cap ────────────────────────────────────────────────────────────
// Per-tenant soft cap. Emits a warning when approached and an alert when
// exceeded. The spend-ceiling cron enforces the hard cap by toggling
// tenant.config.operatorEnabled when monthly spend exceeds the tenant's
// configured cap (lib/tenancy.ts spendBudgetUsdMonthly). This file's budget
// is the per-tenant warning layer for the in-app dashboard.

export type SpendBudget = {
  monthlyCapUsd: number; // 0 = no cap
  warnAtPct: number; // 0–100, warn when monthly spend exceeds this %
};

const DEFAULT_BUDGET: SpendBudget = {
  monthlyCapUsd: 0,
  warnAtPct: 80
};

function budgetPathForTenant(tenantId: string): string {
  return buildTenantPaths(tenantId).spendBudgetFile;
}

export async function readBudget(tenantId: string = FOUNDER_TENANT_ID): Promise<SpendBudget> {
  const p = budgetPathForTenant(tenantId);
  if (!(await fileExists(p))) return { ...DEFAULT_BUDGET };
  try {
    const raw = await readFile(p, "utf8");
    return { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as Partial<SpendBudget>) };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export async function writeBudget(
  budget: SpendBudget,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<void> {
  const p = budgetPathForTenant(tenantId);
  await ensureSpendDir(p);
  await writeFile(p, JSON.stringify(budget, null, 2), "utf8");
}

export type BudgetStatus = {
  budget: SpendBudget;
  monthlyUsd: number;
  utilizationPct: number;
  warn: boolean;
  exceeded: boolean;
};

export async function getBudgetStatus(tenantId: string = FOUNDER_TENANT_ID): Promise<BudgetStatus> {
  const budget = await readBudget(tenantId);
  const summary = await summarizeSpend({ sinceDays: 30, tenantId });
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
