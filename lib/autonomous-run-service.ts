import "server-only";

import { createQueuedAgentRuns } from "@/lib/agent-registry";
import { AGENT_ROLE_DEFINITIONS, runAutonomousAgentRuntime, type AgentRunTrace } from "@/lib/agent-runtime";
import { materializeProduct } from "@/lib/product-materialization";
import { buildRuntimeStartupReport } from "@/lib/runtime-health";
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
import type { RuntimeStartupReport } from "@/lib/dataset-models";

const MAX_PRODUCTS_PER_RUN = 5;

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

async function executeAutonomousRun(runId: string, _body: AutonomousRunRequest, goal: string, startupCheck: RuntimeStartupReport) {
  try {
    await markAutonomousRunStarted(
      runId,
      "The autonomous product pipeline is running: research, routing, validation, build, then Shopify output."
    );

    const runtimeResult = await runAutonomousAgentRuntime(
      {
        goal,
        channel: "all",
        referenceExamples: [],
        productFeedback: [],
        styleFeedback: {}
      },
      {
        onStatus: async (event) => {
          await updateAutonomousRunAgent(runId, event);
        }
      }
    );

    const materializedProducts = await Promise.all(
      runtimeResult.opportunities.slice(0, MAX_PRODUCTS_PER_RUN).map((opportunity) =>
        materializeProduct({
          runtimeId: opportunity.runtimeId,
          title: opportunity.title,
          description: opportunity.buildGoal ?? opportunity.whyItMaySell,
          productType: opportunity.productServiceType,
          fulfillmentType: /printful|print.on.demand/i.test(opportunity.deliverableType) ? "printful" : /zendrop|dropship/i.test(opportunity.deliverableType) ? "zendrop" : "digital",
          niche: opportunity.niche,
          keywords: opportunity.sourceSignals,
          imagePrompt: opportunity.styleDirection
        })
      )
    );

    const createdCount = materializedProducts.filter((product) => product.status === "created").length;
    const failedCount = materializedProducts.length - createdCount;
    const logs: AutonomousRunLog[] = [
      createRunLog("system", "info", `Autonomous product run started for goal: ${goal}`),
      ...(startupCheck.warnings.length > 0
        ? [
            createRunLog(
              "system",
              "warning",
              `Startup warnings: ${startupCheck.warnings.join(" | ")}`,
              "The pipeline will continue, but any missing source will be skipped."
            )
          ]
        : []),
      createRunLog("research", "success", runtimeResult.agentRuns[0]?.summary ?? "Research complete."),
      createRunLog("routing", "success", runtimeResult.agentRuns[1]?.summary ?? "Routing complete."),
      createRunLog("validation", "success", runtimeResult.agentRuns[2]?.summary ?? "Validation complete."),
      createRunLog("build", createdCount > 0 ? "success" : "warning", runtimeResult.agentRuns[3]?.summary ?? "Build complete."),
      createRunLog(
        "output",
        createdCount > 0 ? "success" : "warning",
        `${createdCount} Shopify draft product${createdCount === 1 ? "" : "s"} created.${failedCount > 0 ? ` ${failedCount} product${failedCount === 1 ? "" : "s"} failed during output.` : ""}`,
        createdCount > 0 ? "Review the created drafts in Shopify and refine the next run goal as needed." : "Check source configuration or goal specificity."
      )
    ];

    for (const log of logs) {
      await appendAutonomousRunLog(runId, log);
    }

    const payload: AutonomousRunPayload = {
      goal,
      maxProductsPerRun: MAX_PRODUCTS_PER_RUN,
      runtime: {
        researchSummary: runtimeResult.researchSummary,
        sourceSignalSummary: runtimeResult.sourceSignalSummary,
        agentRuns: runtimeResult.agentRuns,
        materializedProducts
      },
      logs,
      startupCheck
    };

    if (createdCount === 0) {
      await failAutonomousRun(runId, "No real source-backed Shopify products were created for this run.", payload);
      return;
    }

    await completeAutonomousRun(runId, payload);
  } catch (error) {
    await failAutonomousRun(
      runId,
      error instanceof Error ? error.message : "Unknown autonomous product pipeline error"
    );
  }
}
