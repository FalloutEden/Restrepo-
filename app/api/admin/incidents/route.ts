import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { readAudit } from "@/lib/audit";

// Admin-only — returns recent audit entries filtered to incidents
// (failures, rate-limit triggers, paused tenants, webhook auth failures).
// The /admin/incidents page calls this on load + every 30s.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INCIDENT_ACTIONS = [
  "rate_limit.triggered",
  "auth.failed",
  "admin.action",
  "tenant.subscription_changed",
  "tenant.canceled"
];

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unauthorized" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "200");
  const entries = readAudit(limit);

  const incidents = entries.filter(
    (e) => INCIDENT_ACTIONS.includes(e.action) || e.ok === false
  );

  return NextResponse.json({
    ok: true,
    incidents,
    total: incidents.length,
    fetchedAt: new Date().toISOString()
  });
}
