import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { requireAdmin } from "@/lib/auth";

// Admin-only — returns the latest CEREBRO knowledge-gap snapshot.
// The /api/cron/knowledge-gap-tracker job writes .openclaw/cerebro-gaps.json
// daily; this endpoint just serves it.
//
// Empty response is expected on a fresh Vercel deploy until the cron has
// run at least once (or until the operator usage log is centralized so
// Vercel even has data to analyze).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GAPS_PATH = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "cerebro-gaps.json");
})();

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unauthorized" },
      { status: 401 }
    );
  }

  if (!fs.existsSync(GAPS_PATH)) {
    return NextResponse.json({
      ok: true,
      empty: true,
      reason: "knowledge-gap-tracker cron has not run yet (or no usage log on this instance)",
      gapsPath: GAPS_PATH
    });
  }

  try {
    const raw = fs.readFileSync(GAPS_PATH, "utf8");
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        gapsPath: GAPS_PATH
      },
      { status: 500 }
    );
  }
}
