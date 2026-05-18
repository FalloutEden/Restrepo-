import { NextResponse } from "next/server";

import { getAutonomousRunRecord } from "@/lib/autonomous-run-store";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";

// GET /api/autonomous-run/[runId] — fetch a run record. Founder can read any
// run; tenants can only read runs they started. Cross-tenant reads return
// 404 (not 403) to avoid disclosing that a given runId exists for another
// tenant.

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const ctx = await resolveTenantContext(request);
  const record = await getAutonomousRunRecord(runId);

  if (!record || (!ctx.isFounder && record.tenantId !== ctx.tenantId)) {
    return NextResponse.json({ error: `Run ${runId} was not found.` }, { status: 404 });
  }

  return NextResponse.json({
    runId: record.runId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    request: record.request,
    currentMessage: record.currentMessage,
    agentRuns: record.agentRuns,
    logs: record.logs,
    payload: record.payload,
    error: record.error,
    eventCount: record.events.length
  });
}
