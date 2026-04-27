import { NextResponse } from "next/server";
import { createAutonomousRun } from "@/lib/autonomous-run-service";
import type { AutonomousRunRequest } from "@/lib/autonomous-run-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AutonomousRunRequest;
    const result = await createAutonomousRun(body);

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
