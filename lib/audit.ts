import "server-only";

import fs from "node:fs";
import path from "node:path";
import { sql } from "@vercel/postgres";

// Append-only audit log for security-relevant actions.
//
// What gets logged:
//   - Tenant created / updated / canceled
//   - Tenant secret set/rotated, bearer rotated
//   - Subscription state changed
//   - Admin actions (any /api/admin/* call)
//   - Failed auth attempts, rate-limit triggers
//   - Stripe webhook events
//   - Operator tool calls + hallucination flags
//   - Cron runs (success, skip, failure)
//
// Storage strategy:
//   - PRODUCTION (Vercel + POSTGRES_URL): rows in `audit_log` table. Durable
//     across instance boundaries; survives cold starts. This is the only
//     surface where /admin/incidents actually has data to show on Vercel.
//   - LOCAL DEV (no POSTGRES_URL): append to .openclaw/audit.jsonl. Same
//     shape, just file-based for offline debugging.
//
// The `audit()` writer keeps its sync signature so the ~30 call sites don't
// need to be updated. Internally it fires the Postgres write inside a
// fire-and-forget async IIFE — audit is observability, not correctness, so a
// dropped write must never bubble up and break the actual request. The local
// file write is still synchronous on dev for deterministic visibility.

export type AuditAction =
  | "tenant.created"
  | "tenant.updated"
  | "tenant.secret_set"
  | "tenant.bearer_rotated"
  | "tenant.canceled"
  | "tenant.subscription_changed"
  | "auth.failed"
  | "auth.success"
  | "rate_limit.triggered"
  | "admin.action"
  | "stripe.webhook"
  | "operator.tool_call"
  | "operator.hallucination_suspected"
  | "cron.run"
  | "cron.skipped"
  | "cron.failed";

export type AuditEntry = {
  ts: string;
  action: AuditAction;
  actor: string; // tenantId, "admin", "anonymous", "stripe", etc.
  target?: string; // tenantId being acted on, route, etc.
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
  ok?: boolean;
};

const AUDIT_PATH = (() => {
  // Only treat as Vercel-prod when this is genuinely the prod runtime — not
  // when .env.local pulled VERCEL=1 from prod to the developer's box. Same
  // poison pattern fixed in middleware.ts / tenant-context.ts / dashboard.
  const onVercel = Boolean(process.env.VERCEL) && process.env.NODE_ENV === "production";
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "audit.jsonl");
})();

function ensureDir() {
  const dir = path.dirname(AUDIT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function usingPostgresForAudit(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);
}

let auditMigrated = false;

async function pgMigrateAudit(): Promise<void> {
  if (auditMigrated) return;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      target TEXT,
      ip TEXT,
      user_agent TEXT,
      ok BOOLEAN,
      detail JSONB
    )
  `;
  // Tenant-filtered reads in /api/admin/incidents do
  // `WHERE actor = $1 OR target = $1` — both columns get an index.
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_actor_ts ON audit_log(actor, ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_target_ts ON audit_log(target, ts DESC)`;
  auditMigrated = true;
}

async function pgInsertAudit(e: AuditEntry): Promise<void> {
  await pgMigrateAudit();
  const detailJson = e.detail ? JSON.stringify(e.detail) : null;
  if (detailJson === null) {
    await sql`
      INSERT INTO audit_log (ts, action, actor, target, ip, user_agent, ok)
      VALUES (${e.ts}, ${e.action}, ${e.actor}, ${e.target ?? null}, ${e.ip ?? null}, ${e.userAgent ?? null}, ${e.ok ?? null})
    `;
  } else {
    await sql`
      INSERT INTO audit_log (ts, action, actor, target, ip, user_agent, ok, detail)
      VALUES (${e.ts}, ${e.action}, ${e.actor}, ${e.target ?? null}, ${e.ip ?? null}, ${e.userAgent ?? null}, ${e.ok ?? null}, ${detailJson}::jsonb)
    `;
  }
}

async function pgReadAudit(limit: number): Promise<AuditEntry[]> {
  await pgMigrateAudit();
  const r = await sql<{
    ts: string;
    action: string;
    actor: string;
    target: string | null;
    ip: string | null;
    user_agent: string | null;
    ok: boolean | null;
    detail: Record<string, unknown> | null;
  }>`
    SELECT
      to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts,
      action, actor, target, ip, user_agent, ok, detail
    FROM audit_log
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
  return r.rows.map((row) => ({
    ts: row.ts,
    action: row.action as AuditAction,
    actor: row.actor,
    ...(row.target !== null ? { target: row.target } : {}),
    ...(row.ip !== null ? { ip: row.ip } : {}),
    ...(row.user_agent !== null ? { userAgent: row.user_agent } : {}),
    ...(row.ok !== null ? { ok: row.ok } : {}),
    ...(row.detail ? { detail: row.detail } : {})
  }));
}

export function audit(entry: Omit<AuditEntry, "ts">): void {
  const full: AuditEntry = { ts: new Date().toISOString(), ...entry };

  // Local file: keep synchronous so dev `tail -f` works deterministically.
  // This also serves as the read source when POSTGRES_URL is unset.
  try {
    ensureDir();
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(full) + "\n");
  } catch (e) {
    console.warn("[audit] local file write failed:", e instanceof Error ? e.message : e);
  }

  // Postgres write: fire-and-forget. Audit is observability, not correctness;
  // a dropped row must never bubble up and break the actual request.
  if (usingPostgresForAudit()) {
    void pgInsertAudit(full).catch((e) => {
      console.warn("[audit] pg insert failed:", e instanceof Error ? e.message : e);
    });
  }
}

/** Read recent audit entries. Used by /api/admin/incidents. Returns newest
 *  first. Reads from Postgres in production; falls back to the local JSONL
 *  in dev or when Postgres is unconfigured. */
export async function readAudit(limit = 100): Promise<AuditEntry[]> {
  if (usingPostgresForAudit()) {
    try {
      return await pgReadAudit(limit);
    } catch (e) {
      console.warn("[audit] pg read failed, falling back to file:", e instanceof Error ? e.message : e);
      // Fall through — better to show stale local data than to render an
      // empty incidents page on a transient DB blip.
    }
  }
  if (!fs.existsSync(AUDIT_PATH)) return [];
  const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
  const recent = lines.slice(-limit);
  const out: AuditEntry[] = [];
  for (const l of recent) {
    try {
      out.push(JSON.parse(l) as AuditEntry);
    } catch {}
  }
  return out.reverse();
}
