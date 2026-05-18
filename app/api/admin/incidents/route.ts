import { NextResponse } from "next/server";

import { resolveAuth } from "@/lib/auth";
import { readAudit, type AuditEntry } from "@/lib/audit";

// Returns recent audit entries filtered to incidents (failures, rate-limit
// triggers, paused tenants, webhook auth failures). Two views:
//
//   - ADMIN (founder) — sees every incident across every tenant.
//   - TENANT — sees only incidents where they were the actor OR the target.
//     Their own auth failures, their subscription changes, their token
//     rotations. Never another tenant's events.
//
// Anonymous callers get 401. The /admin/incidents page reloads this every 30s.

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
  const auth = await resolveAuth(req);
  if (auth.kind === "anonymous") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "200");
  const entries = await readAudit(limit);

  // First, drop everything that isn't an incident.
  let incidents: AuditEntry[] = entries.filter(
    (e) => INCIDENT_ACTIONS.includes(e.action) || e.ok === false
  );

  // For tenants, narrow further to events that name them as actor or target.
  // We intentionally don't surface incidents where they're only mentioned
  // inside `detail` — that field is unstructured and would leak hints about
  // other tenants. Actor/target are structured and safe to scope on.
  let viewerKind: "admin" | "tenant" = "admin";
  if (auth.kind === "tenant") {
    viewerKind = "tenant";
    const tenantId = auth.tenant.id;
    incidents = incidents.filter((e) => e.actor === tenantId || e.target === tenantId);
  }

  return NextResponse.json({
    ok: true,
    viewerKind,
    incidents,
    total: incidents.length,
    fetchedAt: new Date().toISOString()
  });
}
