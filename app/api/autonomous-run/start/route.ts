import { NextResponse } from "next/server";

import { createAutonomousRun } from "@/lib/autonomous-run-service";
import type { AutonomousRunRequest } from "@/lib/autonomous-run-store";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";

// POST /api/autonomous-run/start — kick off a pipeline run for the caller's
// tenant context. Tenant runs are tagged with the caller's tenantId; founder
// runs are tagged with FOUNDER_TENANT_ID. The tenantId is then used by the
// SSE event stream and the run-detail endpoint to enforce ownership.

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const body = (await request.json()) as AutonomousRunRequest;
    const result = await createAutonomousRun(body, ctx.tenantId);

    if (result.status !== 202) {
      return NextResponse.json(result.payload, { status: result.status });
    }

    return NextResponse.json(result.payload, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start run" },
      { status: 500 }
    );
  }
}
