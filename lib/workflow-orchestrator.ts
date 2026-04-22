import type { AgentRunTrace, AgentRuntimeInput, AgentRuntimeOutput } from "@/lib/agent-runtime";
import type { DatasetKey, WorkflowRunLog } from "@/lib/dataset-models";
import type { CommerceChannel, ResearchExample } from "@/lib/market-intelligence";
import type { ProductTrainingFeedback, StyleFeedbackMap } from "@/lib/style-intelligence";
import {
  DEFAULT_MAX_TOKENS_PER_MINUTE,
  splitResearchExampleBatches,
  type DatasetBatchInput
} from "@/lib/token-batching";

type WorkflowRuntimeExecutor = (
  input: AgentRuntimeInput,
  options?: {
    batchIndex?: number;
    onStatus?: (event: {
      roleId: AgentRunTrace["roleId"];
      roleName: string;
      status: AgentRunTrace["status"];
      message: string;
      batchIndex: number;
      attempt?: number;
      retryDelayMs?: number;
      error?: string;
    }) => void;
  }
) => Promise<AgentRuntimeOutput>;

type RunBatchedWorkflowInput = {
  goal: string;
  channel: CommerceChannel;
  referenceExamples: ResearchExample[];
  productFeedback: ProductTrainingFeedback[];
  styleFeedback: StyleFeedbackMap;
  datasets: DatasetBatchInput[];
  maxTokensPerMinute?: number;
  maxOpportunities?: number;
  runtimeExecutor: WorkflowRuntimeExecutor;
};

export type BatchedWorkflowResult = {
  researchSummary: string;
  sourceSignalSummary: string[];
  opportunities: AgentRuntimeOutput["opportunities"];
  agentRuns: AgentRunTrace[];
  logs: WorkflowRunLog[];
  batching: {
    maxTokensPerMinute: number;
    selectedTokenLoad: number;
    batchCount: number;
    selectedDatasetKeys: DatasetKey[];
    selectedDatasetTitles: string[];
  };
};

function createWorkflowLog(
  stage: WorkflowRunLog["stage"],
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

function mergeReferenceExamples(referenceExamples: ResearchExample[], trainingExamples: ResearchExample[]) {
  const seen = new Set<string>();

  return [...referenceExamples, ...trainingExamples].filter((example) => {
    const key = `${example.channel}|${example.title.toLowerCase()}|${example.niche.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeOpportunities(opportunities: AgentRuntimeOutput["opportunities"]) {
  const byKey = new Map<string, AgentRuntimeOutput["opportunities"][number]>();

  opportunities.forEach((opportunity) => {
    const key = `${opportunity.channel}|${opportunity.outputKind}|${opportunity.title.toLowerCase()}|${opportunity.niche.toLowerCase()}`;
    const existing = byKey.get(key);

    if (!existing || existing.researchStrength + existing.productionFeasibility < opportunity.researchStrength + opportunity.productionFeasibility) {
      byKey.set(key, opportunity);
    }
  });

  return Array.from(byKey.values());
}

function aggregateAgentRuns(agentRuns: AgentRunTrace[]) {
  const grouped = new Map<AgentRunTrace["roleId"], AgentRunTrace[]>();

  agentRuns.forEach((run) => {
    const current = grouped.get(run.roleId) ?? [];
    grouped.set(run.roleId, [...current, run]);
  });

  return Array.from(grouped.values()).map((runs) => {
    const latest = runs[runs.length - 1];
    const failedCount = runs.filter((run) => run.status === "failed").length;
    const retryCount = runs.reduce((sum, run) => sum + run.retryCount, 0);
    const completedCount = runs.filter((run) => run.status === "completed").length;
    const status =
      failedCount > 0 && completedCount === 0
        ? "failed"
        : retryCount > 0
          ? "retrying"
          : completedCount > 0
            ? "completed"
            : latest.status;

    return {
      ...latest,
      status,
      summary:
        runs.length > 1
          ? `${latest.summary} Processed ${runs.length} batches${retryCount > 0 ? ` with ${retryCount} retry event${retryCount === 1 ? "" : "s"}` : ""}.`
          : latest.summary,
      itemCount: runs.reduce((sum, run) => sum + run.itemCount, 0),
      attempts: runs.reduce((sum, run) => sum + run.attempts, 0),
      retryCount
    } satisfies AgentRunTrace;
  });
}

export async function runBatchedWorkflow(input: RunBatchedWorkflowInput): Promise<BatchedWorkflowResult> {
  const maxTokensPerMinute = input.maxTokensPerMinute ?? DEFAULT_MAX_TOKENS_PER_MINUTE;
  const selectedTokenLoad = input.datasets.reduce((sum, dataset) => sum + dataset.estimatedTokens, 0);
  const selectedDatasetKeys = input.datasets.map((dataset) => dataset.key);
  const selectedDatasetTitles = input.datasets.map((dataset) => dataset.title);
  const batches = splitResearchExampleBatches(input.datasets, maxTokensPerMinute);
  const logs: WorkflowRunLog[] = [];
  const agentRuns: AgentRunTrace[] = [];
  const sourceSignalSummary = new Set<string>();
  const allOpportunities: AgentRuntimeOutput["opportunities"] = [];
  const summaries: string[] = [];

  for (const batch of batches) {
    logs.push(
      createWorkflowLog(
        "system",
        "info",
        `Starting dataset batch ${batch.index + 1} of ${batches.length} with ${batch.estimatedTokens.toLocaleString()} estimated tokens.`,
        `Datasets: ${batch.datasetTitles.join(", ")}`
      )
    );

    const batchResult = await input.runtimeExecutor(
      {
        goal: input.goal,
        channel: input.channel,
        referenceExamples: mergeReferenceExamples(input.referenceExamples, batch.examples),
        productFeedback: input.productFeedback,
        styleFeedback: input.styleFeedback,
        maxOpportunities: input.maxOpportunities
      },
      {
        batchIndex: batch.index,
        onStatus: (event) => {
          const level =
            event.status === "failed"
              ? "error"
              : event.status === "retrying"
                ? "warning"
                : event.status === "completed"
                  ? "success"
                  : "info";

          logs.push(
            createWorkflowLog(
              "agent",
              level,
              `${event.roleName} is ${event.status} on batch ${event.batchIndex + 1}. ${event.message}`,
              event.error
                ? `Review the failing agent payload or retry the workflow. ${event.error}`
                : event.retryDelayMs
                  ? `The runtime is backing off for ${Math.round(event.retryDelayMs / 1000)}s before retrying.`
                  : undefined
            )
          );
        }
      }
    );

    summaries.push(batchResult.researchSummary);
    batchResult.sourceSignalSummary.forEach((signal) => sourceSignalSummary.add(signal));
    allOpportunities.push(...batchResult.opportunities);
    agentRuns.push(...batchResult.agentRuns);
  }

  return {
    researchSummary: summaries.filter(Boolean).join(" "),
    sourceSignalSummary: Array.from(sourceSignalSummary),
    opportunities: dedupeOpportunities(allOpportunities),
    agentRuns: aggregateAgentRuns(agentRuns),
    logs,
    batching: {
      maxTokensPerMinute,
      selectedTokenLoad,
      batchCount: batches.length,
      selectedDatasetKeys,
      selectedDatasetTitles
    }
  };
}
