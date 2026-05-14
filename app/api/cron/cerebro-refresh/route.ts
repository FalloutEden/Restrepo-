import { NextResponse } from "next/server";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { audit } from "@/lib/audit";

// CEREBRO refresh cron — runs nightly via Vercel scheduler.
//
// Re-runs `graphify update .` so the brain reflects the latest commits,
// memory notes, and ingested research without a human needing to remember.
//
// Vercel reality check: the `graphify` Python CLI lives on the founder's
// local machine, not in the serverless bundle. On Vercel this endpoint
// reports a graceful "skipped" status so the cron does not page anyone.
// It becomes live in two scenarios:
//   1. BYOK / self-hosted merchant instances where the binary is installed
//   2. When we ship a hosted graphify worker (Phase 5 cohort intelligence)
//
// Even when skipped, the endpoint records an audit entry so we have a heartbeat
// proving the schedule fires.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RefreshResult = {
  ok: boolean;
  ran: boolean;
  reason?: string;
  durationMs?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
  exitStatus?: number | null;
};

async function runGraphifyUpdate(): Promise<RefreshResult> {
  const { spawnSync } = await import("node:child_process");
  const start = Date.now();

  try {
    const result = spawnSync("graphify", ["update", "."], {
      encoding: "utf8",
      timeout: 55_000,
      cwd: process.cwd()
    });

    if (result.error) {
      return {
        ok: false,
        ran: false,
        reason: `graphify binary unavailable: ${result.error.message}`,
        durationMs: Date.now() - start
      };
    }

    const stdout = (result.stdout || "").trim();
    const stderr = (result.stderr || "").trim();
    const exitStatus = result.status;

    return {
      ok: exitStatus === 0,
      ran: true,
      durationMs: Date.now() - start,
      stdoutPreview: stdout.slice(0, 800),
      stderrPreview: stderr ? stderr.slice(0, 400) : undefined,
      exitStatus
    };
  } catch (e) {
    return {
      ok: false,
      ran: false,
      reason: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start
    };
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onVercel = Boolean(process.env.VERCEL);
  const ts = new Date().toISOString();

  // On Vercel the graphify CLI is not in the bundle — short-circuit so we do
  // not waste the 60s timeout window hunting for a binary that will never exist.
  if (onVercel) {
    audit({
      action: "cron.run",
      actor: "cerebro-refresh-cron",
      target: "graphify",
      detail: { ts, environment: "vercel", outcome: "skipped" },
      ok: true
    });
    return NextResponse.json({
      ok: true,
      ran: false,
      environment: "vercel",
      skipped: true,
      reason:
        "graphify CLI is local-only. This cron is a heartbeat on Vercel; AST refresh runs on the founder's local instance and on BYOK self-host deployments."
    });
  }

  const result = await runGraphifyUpdate();

  audit({
    action: "cron.run",
    actor: "cerebro-refresh-cron",
    target: "graphify",
    detail: {
      ts,
      environment: "local",
      ran: result.ran,
      exitStatus: result.exitStatus ?? null,
      durationMs: result.durationMs ?? 0,
      reason: result.reason
    },
    ok: result.ok
  });

  return NextResponse.json({
    ok: result.ok,
    environment: "local",
    ran: result.ran,
    durationMs: result.durationMs,
    exitStatus: result.exitStatus,
    reason: result.reason,
    stdoutPreview: result.stdoutPreview,
    stderrPreview: result.stderrPreview,
    cerebroRoot: path.resolve(".")
  });
}
