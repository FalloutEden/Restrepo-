import { NextResponse } from "next/server";
import { AGENT_ROLE_DEFINITIONS, runAutonomousAgentRuntime, type AgentRunTrace } from "@/lib/agent-runtime";
import type { AutomationStage, DatasetKey, WorkflowRunLog, WorkflowRunMetrics, RuntimeStartupReport } from "@/lib/dataset-models";
import {
  AUTONOMOUS_BUILD_THRESHOLD,
  extractResearchSignals,
  planOpportunityQueues,
  type OpportunityQueueJob
} from "@/lib/autonomous-research";
import { loadLocalTrainingData } from "@/lib/local-training-data";
import type { CommerceChannel, ResearchExample } from "@/lib/market-intelligence";
import type { ProductTrainingFeedback, StyleFeedbackMap } from "@/lib/style-intelligence";
import { DEFAULT_MAX_TOKENS_PER_MINUTE } from "@/lib/token-batching";
import { buildRuntimeStartupReport } from "@/lib/runtime-health";
import { runBatchedWorkflow } from "@/lib/workflow-orchestrator";

export const runtime = "nodejs";

type AutonomousRunRequest = {
  goal?: string;
  channel?: CommerceChannel;
  referenceExamples?: ResearchExample[];
  productFeedback?: ProductTrainingFeedback[];
  styleFeedback?: StyleFeedbackMap;
  confidenceThreshold?: number;
  selectedDatasetKeys?: DatasetKey[];
  workflowTemplateId?: string;
  workflowChain?: AutomationStage[];
  runLabel?: string;
  maxTokensPerMinute?: number;
};

function toQueueJobs(candidates: ReturnType<typeof planOpportunityQueues>["researchQueue"]): OpportunityQueueJob[] {
  return candidates.map((candidate) => ({
    ...candidate,
    createdAt: new Date().toISOString()
  }));
}

function createRunLog(
  stage: AutomationStage | "system",
  level: WorkflowRunLog["level"],
  message: string,
  action?: string
): WorkflowRunLog {
  return {
    id: `${stage}-${Math.random().toString(36).slice(2, 10)}`,
    stage,
    level,
    timestamp: new Date().toISOString(),
    message,
    action
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildWorkflowMetrics(
  queues: {
    researchQueue: OpportunityQueueJob[];
    shortlistQueue: OpportunityQueueJob[];
    draftBuildQueue: OpportunityQueueJob[];
    rejectedSimilar: OpportunityQueueJob[];
  },
  selectedDatasetCount: number,
  selectedTokenLoad: number,
  batchCount: number,
  agentRuns: AgentRunTrace[]
): WorkflowRunMetrics {
  const scored = [
    ...queues.researchQueue,
    ...queues.shortlistQueue,
    ...queues.draftBuildQueue
  ];
  const averageConfidence =
    scored.length > 0 ? scored.reduce((sum, job) => sum + job.confidenceScore, 0) / scored.length : 0;
  const builtDraftCount = queues.draftBuildQueue.length;
  const approvalReadyCount = queues.draftBuildQueue.length;
  const datasetCoverage = clamp(selectedDatasetCount * 11 + Math.min(scored.length, 12) * 3, 10, 100);
  const conversionReadiness = clamp(averageConfidence * 0.72 + builtDraftCount * 7 - queues.rejectedSimilar.length * 2, 8, 99);
  const accuracyProxy = clamp(averageConfidence * 0.68 + datasetCoverage * 0.24 + builtDraftCount * 3, 12, 98);
  const revenueCenter = builtDraftCount * 2200 + queues.shortlistQueue.length * 680 + queues.researchQueue.length * 180;
  const throttledCallCount = agentRuns.reduce((sum, run) => sum + run.retryCount, 0);
  const failedAgentCount = agentRuns.filter((run) => run.status === "failed").length;

  return {
    accuracyProxy,
    revenueEstimateLow: Math.max(500, Math.round(revenueCenter * 0.7)),
    revenueEstimateHigh: Math.max(1800, Math.round(revenueCenter * 1.28)),
    conversionReadiness,
    averageConfidence: clamp(averageConfidence, 0, 99),
    datasetCoverage,
    builtDraftCount,
    approvalReadyCount,
    tokenLoad: selectedTokenLoad,
    batchCount,
    throttledCallCount,
    failedAgentCount
  };
}

export async function POST(request: Request) {
  try {
    const startupCheck: RuntimeStartupReport = buildRuntimeStartupReport(AGENT_ROLE_DEFINITIONS.filter((role) => !role.disabled).length);
    if (startupCheck.fatal) {
      return NextResponse.json(
        {
          error: startupCheck.errors.join(" "),
          action: "Add the missing server environment keys or restore the full eight-agent configuration before retrying.",
          startupCheck
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AutonomousRunRequest;
    const goal = body.goal?.trim();

    if (!goal) {
      return NextResponse.json(
        {
          error: "Missing autonomous goal.",
          action: "Add a goal or choose a workflow template before running the automation pipeline."
        },
        { status: 400 }
      );
    }

    const trainingData = await loadLocalTrainingData({ selectedDatasetKeys: body.selectedDatasetKeys });
    const selectedDatasets = body.selectedDatasetKeys?.length
      ? trainingData.datasets.filter((dataset) => dataset.loaded && body.selectedDatasetKeys?.includes(dataset.key))
      : trainingData.datasets.filter((dataset) => dataset.loaded);

    if (selectedDatasets.length === 0) {
      return NextResponse.json(
        {
          error: "No selected datasets were available for this workflow run.",
          action: "Open the Data Catalogue, choose at least one loaded dataset, or fix missing file paths before retrying."
        },
        { status: 400 }
      );
    }

    const input = {
      goal,
      channel: body.channel ?? "all",
      referenceExamples: body.referenceExamples ?? [],
      productFeedback: body.productFeedback ?? [],
      styleFeedback: body.styleFeedback ?? {}
    };
    const confidenceThreshold = Math.max(50, Math.min(99, Math.round(body.confidenceThreshold ?? AUTONOMOUS_BUILD_THRESHOLD)));
    const maxTokensPerMinute = Math.max(50_000, Math.round(body.maxTokensPerMinute ?? DEFAULT_MAX_TOKENS_PER_MINUTE));
    const runtimeResult = await runBatchedWorkflow({
      ...input,
      datasets: trainingData.selectedDatasetInputs,
      maxTokensPerMinute,
      maxOpportunities: input.channel === "all" ? 10 : 8,
      runtimeExecutor: runAutonomousAgentRuntime
    });
    const researchSignals = extractResearchSignals({
      ...input,
      referenceExamples: [...(body.referenceExamples ?? []), ...trainingData.examples]
    });
    const queues = planOpportunityQueues(runtimeResult.opportunities, researchSignals, confidenceThreshold);
    const queuePayload = {
      researchQueue: toQueueJobs(queues.researchQueue),
      shortlistQueue: toQueueJobs(queues.shortlistQueue),
      draftBuildQueue: toQueueJobs(queues.draftBuildQueue),
      approvalQueue: [] as OpportunityQueueJob[],
      rejectedSimilar: toQueueJobs(queues.rejectedSimilar)
    };
    const workflowChain = body.workflowChain?.length ? body.workflowChain : (["research", "validate", "design", "list"] as AutomationStage[]);
    const logs: WorkflowRunLog[] = [
      createRunLog(
        "system",
        "info",
        `${body.runLabel ?? "Workflow run"} started with ${selectedDatasets.length} dataset${selectedDatasets.length === 1 ? "" : "s"} and ${runtimeResult.batching.batchCount} token-safe batch${runtimeResult.batching.batchCount === 1 ? "" : "es"}.`
      ),
      ...(startupCheck.warnings.length > 0
        ? [
            createRunLog(
              "system",
              "warning",
              `Startup warnings detected: ${startupCheck.warnings.join(" | ")}`,
              "The workflow can continue, but live marketplace validation stays limited until those keys are configured."
            )
          ]
        : []),
      createRunLog(
        "research",
        "success",
        `Trend research completed using ${selectedDatasets.map((dataset) => dataset.title).join(", ")}.`,
        "Adjust dataset selection in the catalogue to narrow or widen signal coverage."
      ),
      createRunLog(
        "validate",
        queues.shortlistQueue.length > 0 || queues.draftBuildQueue.length > 0 ? "success" : "warning",
        `${queues.shortlistQueue.length} opportunities shortlisted and ${queues.rejectedSimilar.length} near-duplicates filtered.`,
        "If the shortlist feels thin, add stronger market evidence or loosen the goal wording."
      ),
      createRunLog(
        "design",
        queues.draftBuildQueue.length > 0 ? "success" : "warning",
        `${queues.draftBuildQueue.length} high-confidence drafts were built for design and listing preparation.`,
        "Use approval feedback and reference examples to improve the next design pass."
      ),
      createRunLog(
        "list",
        queues.draftBuildQueue.length > 0 ? "info" : "warning",
        `${queues.draftBuildQueue.length} drafts are ready for manual listing review. Auto-publishing remains blocked.`,
        "Review the draft builds and approve manually before any outbound action."
      ),
      ...runtimeResult.logs
    ];
    const metrics = buildWorkflowMetrics(
      queuePayload,
      selectedDatasets.length,
      runtimeResult.batching.selectedTokenLoad,
      runtimeResult.batching.batchCount,
      runtimeResult.agentRuns
    );

    return NextResponse.json({
      runtime: {
        researchSummary: runtimeResult.researchSummary,
        sourceSignalSummary: runtimeResult.sourceSignalSummary,
        agentRuns: runtimeResult.agentRuns
      },
      signals: researchSignals,
      queues: queuePayload,
      workflow: {
        templateId: body.workflowTemplateId ?? null,
        chain: workflowChain,
        runLabel: body.runLabel ?? "Workflow run",
        selectedDatasetKeys: selectedDatasets.map((dataset) => dataset.key),
        selectedDatasetTitles: selectedDatasets.map((dataset) => dataset.title),
        maxTokensPerMinute
      },
      batching: runtimeResult.batching,
      logs,
      metrics,
      confidenceThreshold,
      startupCheck,
      trainingData: {
        fileCount: trainingData.files.length,
        loadedFileCount: trainingData.files.filter((file) => file.loaded).length,
        exampleCount: trainingData.examples.length,
        files: trainingData.files,
        datasets: trainingData.datasets
      },
      trainingExamples: trainingData.examples
    });
  } catch (error) {
    console.error("AUTONOMOUS RUN ERROR:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown autonomous agent runtime error",
        action: "Retry the workflow, adjust dataset selection, or review the server logs for the failing agent step."
      },
      { status: 500 }
    );
  }
}
