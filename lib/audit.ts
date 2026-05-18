import "server-only";

import fs from "node:fs";
import path from "node:path";

// Append-only audit log for security-relevant actions.
//
// What gets logged:
//   - Tenant created
//   - Tenant secret set/rotated
//   - Bearer token rotated
//   - Subscription state changed
//   - Admin actions (any /api/admin/* call)
//   - Failed auth attempts
//   - Rate limit triggers
//
// Storage:
//   - LOCAL DEV: append to .openclaw/audit.jsonl
//   - VERCEL: append to /tmp/openclaw/audit.jsonl (ephemeral, OK for now —
//     we'll move to Postgres audit_log table when traffic warrants)
//
// Each entry is one JSONL line. Never overwrites. Never deletes. If an
// incident happens, this is what you grep.

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

export function audit(entry: Omit<AuditEntry, "ts">): void {
  ensureDir();
  const full: AuditEntry = { ts: new Date().toISOString(), ...entry };
  try {
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(full) + "\n");
  } catch (e) {
    // Never let logging break the actual request
    console.warn("[audit] failed to write entry:", e instanceof Error ? e.message : e);
  }
}

/** Read recent audit entries. Used by /api/admin/audit (admin-only). */
export function readAudit(limit = 100): AuditEntry[] {
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
