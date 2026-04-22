import { NextResponse } from "next/server";
import { AGENT_ROLE_DEFINITIONS } from "@/lib/agent-runtime";
import { loadLocalTrainingData } from "@/lib/local-training-data";
import { DEFAULT_MAX_TOKENS_PER_MINUTE } from "@/lib/token-batching";
import { buildRuntimeStartupReport } from "@/lib/runtime-health";

export const runtime = "nodejs";

export async function GET() {
  try {
    const trainingData = await loadLocalTrainingData();
    const startupCheck = buildRuntimeStartupReport(AGENT_ROLE_DEFINITIONS.filter((role) => !role.disabled).length);

    return NextResponse.json({
      datasets: trainingData.datasets,
      summary: {
        fileCount: trainingData.files.length,
        loadedFileCount: trainingData.files.filter((file) => file.loaded).length,
        exampleCount: trainingData.examples.length
      },
      startupCheck,
      maxTokensPerMinute: DEFAULT_MAX_TOKENS_PER_MINUTE
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load dataset catalogue."
      },
      { status: 500 }
    );
  }
}
