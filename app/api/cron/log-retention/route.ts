import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { audit } from "@/lib/audit";

// Daily log-retention cron. Trims activity_log and audit_log to a rolling
// 90-day window so the Postgres tables don't grow forever. Two tables, two
// DELETEs, one audit entry per table noting how many rows were removed.
//
// Why 90 days: long enough to investigate any incident the founder hears
// about within a quarter; short enough that the tables stay cheap. Bump the
// constant if a specific compliance posture needs longer retention.
//
// Auth: Vercel cron header (x-vercel-cron) or CRON_SECRET bearer. Same gate
// every other cron uses via lib/cron-auth.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RETENTION_DAYS = 90;

async function trim(table: "activity_log" | "audit_log", tsColumn: "timestamp" | "ts"): Promise<number> {
  // String-format the column name; Postgres template-literal placeholders
  // can't substitute identifiers, and the column choice is fixed per call.
  if (table === "activity_log") {
    const r = await sql`
      DELETE FROM activity_log
      WHERE timestamp < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
    `;
    return r.rowCount ?? 0;
  }
  // audit_log uses `ts` not `timestamp`.
  const r = await sql`
    DELETE FROM audit_log
    WHERE ts < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
  `;
  return r.rowCount ?? 0;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // POSTGRES_URL has to be set for either table to exist; bail cleanly if
  // not (local dev with no DB shouldn't 500 the cron probe).
  if (!process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING) {
    return NextResponse.json({
      ok: true,
      skipped: "no POSTGRES_URL configured",
      retentionDays: RETENTION_DAYS
    });
  }

  const results: { table: string; deleted: number; error?: string }[] = [];

  for (const t of [
    { table: "activity_log" as const, column: "timestamp" as const },
    { table: "audit_log" as const, column: "ts" as const }
  ]) {
    try {
      const deleted = await trim(t.table, t.column);
      results.push({ table: t.table, deleted });
    } catch (e) {
      results.push({
        table: t.table,
        deleted: 0,
        error: e instanceof Error ? e.message : "unknown"
      });
    }
  }

  // One audit entry summarizing what happened. The audit log itself just got
  // trimmed but that's fine — this entry is from "now" so it's well inside
  // the window.
  audit({
    action: "cron.run",
    actor: "log-retention-cron",
    target: "activity_log,audit_log",
    detail: { retentionDays: RETENTION_DAYS, results },
    ok: results.every((r) => !r.error)
  });

  return NextResponse.json({
    ok: results.every((r) => !r.error),
    retentionDays: RETENTION_DAYS,
    results,
    ranAt: new Date().toISOString()
  });
}
