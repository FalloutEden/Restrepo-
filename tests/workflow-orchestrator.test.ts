import test from "node:test";
import assert from "node:assert/strict";

import { runBatchedWorkflow } from "../lib/workflow-orchestrator";
import type { AgentRunTrace } from "../lib/agent-runtime";
import type { ResearchExample } from "../lib/market-intelligence";

function buildExample(title: string, note: string): ResearchExample {
  return {
    id: title,
    title,
    url: "",
    screenshotDataUrl: "",
    channel: "etsy",
    niche: "planner",
    productFormat: "printable",
    targetBuyer: "buyers who want a planner",
    deliverableType: "digital download",
    whatLooksGood: note,
    sellabilityNotes: note,
    visualStyleNotes: "clean layout",
    styleComments: "clear hierarchy",
    notes: note,
    status: "approved",
    createdAt: new Date().toISOString()
  };
}

function buildAgentRuns(batchIndex: number): AgentRunTrace[] {
  const roles: Array<AgentRunTrace["roleId"]> = [
    "trend_research",
    "opportunity_router",
    "validation_guard",
    "product_strategy",
    "design_direction",
    "build",
    "review_approval",
    "runtime_monitor"
  ];

  return roles.map((roleId) => ({
    roleId,
    name: roleId,
    responsibility: `${roleId} responsibility`,
    summary: `${roleId} completed`,
    itemCount: 1,
    status: "completed",
    attempts: 1,
    retryCount: 0,
    batchIndex
  }));
}

test("runBatchedWorkflow splits large datasets and aggregates all eight agents", async () => {
  const runtimeCalls: number[] = [];

  const result = await runBatchedWorkflow({
    goal: "Research profitable planner products.",
    channel: "all",
    referenceExamples: [],
    productFeedback: [],
    styleFeedback: {},
    maxTokensPerMinute: 200,
    datasets: [
      {
        key: "dataset-a",
        title: "Dataset A",
        estimatedTokens: 260,
        examples: [buildExample("one", "x".repeat(120)), buildExample("two", "y".repeat(120))]
      },
      {
        key: "dataset-b",
        title: "Dataset B",
        estimatedTokens: 120,
        examples: [buildExample("three", "z".repeat(60))]
      }
    ],
    runtimeExecutor: async (input, options) => {
      runtimeCalls.push(input.referenceExamples.length);
      assert.ok(input.referenceExamples.length >= 1);

      return {
        researchSummary: `batch ${options?.batchIndex ?? 0}`,
        sourceSignalSummary: [`signal-${options?.batchIndex ?? 0}`],
        opportunities: [
          {
            runtimeId: `opportunity-${options?.batchIndex ?? 0}`,
            outputKind: "product",
            title: `Batch ${(options?.batchIndex ?? 0) + 1} planner`,
            channel: "etsy",
            niche: "planner",
            productServiceType: "digital product",
            deliverableType: "digital download",
            targetBuyer: "buyers who want a planner",
            styleDirection: "premium clean",
            whySelected: "strong demand",
            whyItMaySell: "clear buyer utility",
            sourceSignals: [`signal-${options?.batchIndex ?? 0}`],
            researchStrength: 92,
            novelty: 82,
            productionFeasibility: 91,
            buyerClarity: 90
          }
        ],
        agentRuns: buildAgentRuns(options?.batchIndex ?? 0)
      };
    }
  });

  assert.equal(result.batching.batchCount, 3);
  assert.equal(runtimeCalls.length, 3);
  assert.equal(result.agentRuns.length, 8);
  assert.equal(result.opportunities.length, 3);
  assert.ok(result.logs.some((log) => log.message.includes("Starting dataset batch")));
});
