import { NextResponse } from "next/server";
import { getAutonomousRunRecord } from "@/lib/autonomous-run-store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const record = await getAutonomousRunRecord(runId);

  if (!record) {
    return NextResponse.json(
      {
        error: `Run ${runId} was not found.`
      },
      { status: 404 }
    );
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
