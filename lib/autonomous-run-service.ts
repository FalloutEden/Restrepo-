import "server-only";

import { createQueuedAgentRuns } from "@/lib/agent-registry";
import { AGENT_ROLE_DEFINITIONS, runAutonomousAgentRuntime, type AgentRunTrace } from "@/lib/agent-runtime";
import { materializeProduct } from "@/lib/product-materialization";
import { buildRuntimeStartupReport } from "@/lib/runtime-health";
import { loadLocalTrainingData } from "@/lib/local-training-data";
import { estimateResearchExampleTokens } from "@/lib/token-batching";
import type { ResearchExample } from "@/lib/market-intelligence";
import {
  appendAutonomousRunLog,
  completeAutonomousRun,
  createAutonomousRunRecord,
  failAutonomousRun,
  markAutonomousRunStarted,
  updateAutonomousRunAgent,
  type AutonomousRunLog,
  type AutonomousRunPayload,
  type AutonomousRunRequest
} from "@/lib/autonomous-run-store";
import type { DatasetKey, RuntimeStartupReport } from "@/lib/dataset-models";

const MAX_PRODUCTS_PER_RUN = 5;

// Token budget for the curated reference set fed to the research operatives.
// Hard cap so we never recreate the 12M-token batching disaster of the legacy path.
const REFERENCE_TOKEN_BUDGET = 12_000;

// High-signal dataset keys passed to the research operatives. The bulky
// jobs_dataset_remaining (~2.1MB) is intentionally excluded — Claude does not
// need to read 100k+ raw job titles to identify niches.
const HIGH_SIGNAL_DATASET_KEYS: DatasetKey[] = [
  "shopify_high_selling",
  "print_on_demand",
  "fiverr_ai_jobs",
  "quality_datasets_1",
  "relevant_datasets"
];

function createRunLog(
  stage: AutonomousRunLog["stage"],
  level: AutonomousRunLog["level"],
  message: string,
  action?: string
): AutonomousRunLog {
  return {
    id: `${stage}-${Math.random().toString(36).slice(2, 10)}`,
    stage,
    level,
    timestamp: new Date().toISOString(),
    message,
    action
  };
}

function validateAutonomousRunRequest(body: AutonomousRunRequest) {
  const startupCheck: RuntimeStartupReport = buildRuntimeStartupReport(
    AGENT_ROLE_DEFINITIONS.length
  );

  if (!process.env.PRINTFUL_API_KEY?.trim() && !process.env.ZENDROP_API_KEY?.trim()) {
    startupCheck.errors.push("At least one real product source is required. Configure PRINTFUL_API_KEY or ZENDROP_API_KEY.");
    startupCheck.ready = false;
    startupCheck.fatal = true;
  }

  if (startupCheck.fatal) {
    return {
      startupCheck,
      status: 500 as const,
      payload: {
        error: startupCheck.errors.join(" "),
        action: "Add the required environment keys before running the product pipeline.",
        startupCheck
      }
    };
  }

  const goal = body.goal?.trim();
  if (!goal) {
    return {
      startupCheck,
      status: 400 as const,
      payload: {
        error: "Missing autonomous goal.",
        action: "Describe the product lane you want the system to research and build."
      }
    };
  }

  return {
    startupCheck,
    status: 200 as const,
    goal
  };
}

export async function createAutonomousRun(body: AutonomousRunRequest) {
  const validation = validateAutonomousRunRequest(body);
  if (validation.status !== 200) {
    return validation;
  }

  const record = await createAutonomousRunRecord(body, createQueuedAgentRuns() as unknown as AgentRunTrace[]);
  void executeAutonomousRun(record.runId, body, validation.goal, validation.startupCheck);

  return {
    status: 202 as const,
    payload: {
      runId: record.runId,
      status: record.status
    }
  };
}

// Token-budgeted subset of training examples. Sorts examples by inferred priority
// (market_evidence > others), takes them in order until budget is hit. Prevents the
// 12M-token batching disaster that killed runs through the legacy harness.
function subsetByTokenBudget(examples: ResearchExample[], budget: number): { kept: ResearchExample[]; tokensUsed: number } {
  const sorted = [...examples].sort((a, b) => {
    const priorityA = a.notes?.includes("market_evidence") ? 0 : 1;
    const priorityB = b.notes?.includes("market_evidence") ? 0 : 1;
    return priorityA - priorityB;
  });
  const kept: ResearchExample[] = [];
  let tokensUsed = 0;
  for (const ex of sorted) {
    const cost = estimateResearchExampleTokens(ex);
    if (tokensUsed + cost > budget) break;
    kept.push(ex);
    tokensUsed += cost;
  }
  return { kept, tokensUsed };
}

async function executeAutonomousRun(runId: string, _body: AutonomousRunRequest, goal: string, startupCheck: RuntimeStartupReport) {
  // Helper: log a structured step inline so the user sees real-time progress in the SSE log.
  const log = async (
    stage: AutonomousRunLog["stage"],
    level: AutonomousRunLog["level"],
    message: string,
    action?: string
  ) => {
    const entry = createRunLog(stage, level, message, action);
    console.log(`[run ${runId}] ${stage}/${level}: ${message}${action ? ` | ${action}` : ""}`);
    await appendAutonomousRunLog(runId, entry);
    return entry;
  };

  const runStart = Date.now();
  const collectedLogs: AutonomousRunLog[] = [];
  const remember = (entry: AutonomousRunLog) => collectedLogs.push(entry);

  try {
    await markAutonomousRunStarted(
      runId,
      "Pipeline starting: loading curated datasets, then dispatching 4 parallel research operatives."
    );
    remember(await log("system", "info", `Autonomous run started. Goal: "${goal}"`));

    if (startupCheck.warnings.length > 0) {
      remember(await log("system", "warning", `Startup warnings: ${startupCheck.warnings.join(" | ")}`,
        "Pipeline will continue but degraded fulfillment options may apply."));
    }

    // === Phase 1: dataset load + smart subset ===
    remember(await log("system", "info",
      `Loading high-signal datasets (${HIGH_SIGNAL_DATASET_KEYS.length} of 8): ${HIGH_SIGNAL_DATASET_KEYS.join(", ")}`,
      "Bulky job vocabulary datasets are intentionally skipped to keep token load under control."));
    const trainingData = await loadLocalTrainingData({ selectedDatasetKeys: HIGH_SIGNAL_DATASET_KEYS });
    const failedDatasets = trainingData.files.filter((f) => !f.loaded);
    if (failedDatasets.length > 0) {
      remember(await log("system", "warning",
        `${failedDatasets.length} dataset file${failedDatasets.length === 1 ? "" : "s"} failed to load: ${failedDatasets.map((f) => `${f.key} (${f.error ?? "unknown error"})`).join(", ")}`,
        "Check the data/ folder; pipeline will continue with whatever loaded."));
    }
    const totalRawExamples = trainingData.examples.length;
    const { kept: referenceExamples, tokensUsed } = subsetByTokenBudget(trainingData.examples, REFERENCE_TOKEN_BUDGET);
    remember(await log("system", "info",
      `Dataset subset: ${referenceExamples.length} of ${totalRawExamples} examples kept (~${Math.round(tokensUsed / 1000)}k tokens, budget ${Math.round(REFERENCE_TOKEN_BUDGET / 1000)}k).`,
      referenceExamples.length === 0 ? "WARNING: zero examples passed to the agents — research will be Claude-knowledge-only." : undefined));

    // === Phase 2: dispatch agents ===
    remember(await log("research", "info",
      "Dispatching 4 parallel research operatives (market evidence, jobs, long-tail, meta) plus the downstream pipeline."));

    const runtimeStart = Date.now();
    const runtimeResult = await runAutonomousAgentRuntime(
      {
        goal,
        channel: "all",
        referenceExamples,
        productFeedback: [],
        styleFeedback: {}
      },
      {
        onStatus: async (event) => {
          await updateAutonomousRunAgent(runId, event);
        }
      }
    );
    const runtimeMs = Date.now() - runtimeStart;
    remember(await log("research", "success",
      `Agent runtime completed in ${(runtimeMs / 1000).toFixed(1)}s. ${runtimeResult.opportunities.length} opportunities produced.`));

    if (runtimeResult.opportunities.length === 0) {
      remember(await log("routing", "warning",
        "Zero opportunities returned by opportunity_router. Likely cause: the agents could not find concrete buyer signals in the curated evidence — try a more specific goal or adjust the reference examples.",
        "Run will fail at materialization."));
    }

    // Per-agent summary
    for (const trace of runtimeResult.agentRuns) {
      const status = trace.status === "failed" ? "error" : trace.status === "retrying" ? "warning" : "success";
      remember(await log("research", status,
        `${trace.name}: ${trace.summary}${trace.itemCount ? ` (${trace.itemCount} item${trace.itemCount === 1 ? "" : "s"})` : ""}`,
        trace.error ?? undefined));
    }

    // === Phase 3: materialize products ===
    const opportunitiesToMaterialize = runtimeResult.opportunities.slice(0, MAX_PRODUCTS_PER_RUN);
    remember(await log("build", "info",
      `Materializing top ${opportunitiesToMaterialize.length} of ${runtimeResult.opportunities.length} opportunities.`));

    const materializeStart = Date.now();
    const materializedProducts = await Promise.all(
      opportunitiesToMaterialize.map(async (opportunity) => {
        const fulfillmentType: "printful" | "zendrop" | "digital" =
          /printful|print.on.demand/i.test(opportunity.deliverableType) ? "printful" :
          /zendrop|dropship/i.test(opportunity.deliverableType) ? "zendrop" : "digital";
        await log("build", "info",
          `Materializing "${opportunity.title}" (${fulfillmentType}, niche: ${opportunity.niche})`);
        try {
          const result = await materializeProduct({
            runtimeId: opportunity.runtimeId,
            title: opportunity.title,
            description: opportunity.buildGoal ?? opportunity.whyItMaySell,
            productType: opportunity.productServiceType,
            fulfillmentType,
            niche: opportunity.niche,
            keywords: opportunity.sourceSignals,
            imagePrompt: opportunity.styleDirection
          });
          if (result.status === "created") {
            await log("build", "success",
              `Created "${opportunity.title}" — Shopify product ${result.shopifyProductId}`);
          } else {
            await log("build", "error",
              `Failed "${opportunity.title}": ${result.error ?? "unknown materialization failure"}`);
          }
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "unknown error";
          await log("build", "error",
            `Exception materializing "${opportunity.title}": ${errorMsg}`);
          throw error;
        }
      })
    );
    const materializeMs = Date.now() - materializeStart;

    const createdCount = materializedProducts.filter((p) => p.status === "created").length;
    const failedCount = materializedProducts.length - createdCount;
    const totalMs = Date.now() - runStart;

    remember(await log("output",
      createdCount > 0 ? "success" : "error",
      `Run complete in ${(totalMs / 1000).toFixed(1)}s. ${createdCount} draft${createdCount === 1 ? "" : "s"} created, ${failedCount} failed.${runtimeMs ? ` (Research+routing: ${(runtimeMs / 1000).toFixed(1)}s, materialization: ${(materializeMs / 1000).toFixed(1)}s)` : ""}`,
      createdCount > 0 ? "Drafts available at /api/products/drafts. Review before publishing." : "No products were created. Check the per-agent log entries above for the failing step."));

    const payload: AutonomousRunPayload = {
      goal,
      maxProductsPerRun: MAX_PRODUCTS_PER_RUN,
      runtime: {
        researchSummary: runtimeResult.researchSummary,
        sourceSignalSummary: runtimeResult.sourceSignalSummary,
        agentRuns: runtimeResult.agentRuns,
        materializedProducts
      },
      logs: collectedLogs,
      startupCheck
    };

    if (createdCount === 0) {
      await failAutonomousRun(runId, `No products were created. ${runtimeResult.opportunities.length === 0 ? "Agents returned zero opportunities — see research log entries above." : `${failedCount} of ${materializedProducts.length} materialization attempts failed.`}`, payload);
      return;
    }

    await completeAutonomousRun(runId, payload);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown autonomous product pipeline error";
    const stack = error instanceof Error && error.stack ? `\n${error.stack}` : "";
    console.error(`[run ${runId}] FATAL: ${errorMsg}${stack}`);
    await appendAutonomousRunLog(runId, createRunLog("system", "error", `Pipeline crashed: ${errorMsg}`, "See server console for full stack trace."));
    await failAutonomousRun(runId, errorMsg);
  }
}
