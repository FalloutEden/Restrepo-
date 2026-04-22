import "server-only";

import { openai } from "@/lib/openai";
import { withOpenAIRetry } from "@/lib/openai-retry";
import type { ResponseFormatJSONSchema } from "openai/resources/shared";
import type { CommerceChannel, ResearchExample } from "@/lib/market-intelligence";
import { extractResearchSignals, type AutonomousResearchInput, type RuntimeOpportunitySeed } from "@/lib/autonomous-research";
import type { ProductTrainingFeedback, StyleFeedbackMap } from "@/lib/style-intelligence";

const OPENAI_AGENT_MODEL = "gpt-5-chat";

export type AgentRoleId =
  | "trend_research"
  | "opportunity_router"
  | "validation_guard"
  | "product_strategy"
  | "design_direction"
  | "build"
  | "review_approval"
  | "runtime_monitor";

export type AgentExecutionStatus = "idle" | "running" | "retrying" | "completed" | "failed";

export type AgentRoleDefinition = {
  id: AgentRoleId;
  name: string;
  responsibility: string;
  systemPrompt: string;
  disabled?: boolean;
};

export type AgentRunTrace = {
  roleId: AgentRoleId;
  name: string;
  responsibility: string;
  summary: string;
  itemCount: number;
  status: AgentExecutionStatus;
  attempts: number;
  retryCount: number;
  batchIndex: number;
  error?: string;
};

export type AgentRuntimeInput = AutonomousResearchInput & {
  maxOpportunities?: number;
};

export type AgentRuntimeOutput = {
  researchSummary: string;
  sourceSignalSummary: string[];
  opportunities: RuntimeOpportunitySeed[];
  agentRuns: AgentRunTrace[];
};

type AgentRuntimeOptions = {
  batchIndex?: number;
  onStatus?: (event: {
    roleId: AgentRoleId;
    roleName: string;
    status: AgentExecutionStatus;
    message: string;
    batchIndex: number;
    attempt?: number;
    retryDelayMs?: number;
    error?: string;
  }) => void;
};

type TrendResearchOutput = {
  summary: string;
  prioritizedChannels: Array<Exclude<CommerceChannel, "all">>;
  sourceSignals: string[];
  approvedPatterns: string[];
  avoidedPatterns: string[];
  whitespaceOpportunities: string[];
  buyerSignals: string[];
  qualityRisks: string[];
};

type OpportunityRouterOutput = {
  summary: string;
  opportunities: Array<{
    title: string;
    outputKind: "product" | "service";
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    productServiceType: string;
    deliverableType: string;
    targetBuyer: string;
    styleDirection: string;
    whySelected: string;
    whyItMaySell: string;
    sourceSignals: string[];
    researchStrength: number;
    novelty: number;
    productionFeasibility: number;
    buyerClarity: number;
  }>;
};

type ValidationOutput = {
  summary: string;
  reviews: Array<{
    title: string;
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    researchStrength: number;
    novelty: number;
    productionFeasibility: number;
    buyerClarity: number;
    validationNotes: string[];
  }>;
};

type ProductStrategyOutput = {
  summary: string;
  plans: Array<{
    title: string;
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    buildGoal: string;
    buildConstraints: string;
    formatHint: "printable" | "spreadsheet" | "service";
    productTypeHint: string;
    feasibilityNotes: string[];
  }>;
};

type DesignDirectionOutput = {
  summary: string;
  directions: Array<{
    title: string;
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    styleDirection: string;
    styleWhy: string;
    designNotes: string[];
  }>;
};

type BuildOutput = {
  summary: string;
  builds: Array<{
    title: string;
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    buildSummary: string;
    draftTitleHint: string;
    nextAction: string;
  }>;
};

type ReviewOutput = {
  summary: string;
  reviews: Array<{
    title: string;
    channel: Exclude<CommerceChannel, "all">;
    niche: string;
    approvalSummary: string;
    approvalNotes: string[];
  }>;
};

type RuntimeMonitorOutput = {
  summary: string;
  handoffNotes: string[];
  watchouts: string[];
};

type AgentExecutionResult<T> = {
  trace: AgentRunTrace;
  data: T | null;
};

export const AGENT_ROLE_DEFINITIONS: AgentRoleDefinition[] = [
  {
    id: "trend_research",
    name: "Trend Research Agent",
    responsibility: "Analyze saved research, references, and feedback to find premium, sellable patterns and whitespace.",
    systemPrompt:
      "You are the Trend Research Agent for an autonomous commerce lab. Work only from the supplied evidence. Summarize what appears to sell, what looks premium, where demand clusters, and what patterns to avoid."
  },
  {
    id: "opportunity_router",
    name: "Opportunity Router Agent",
    responsibility: "Create a diverse queue of opportunities across channel, niche, deliverable, and style direction.",
    systemPrompt:
      "You are the Opportunity Router Agent. Generate materially different commerce opportunities across the allowed channels. Avoid near-identical ideas and return both products and services when the evidence supports them."
  },
  {
    id: "validation_guard",
    name: "Validation Guard Agent",
    responsibility: "Stress-test buyer clarity, feasibility, and signal strength before build automation.",
    systemPrompt:
      "You are the Validation Guard Agent. Evaluate the strongest opportunity patterns from the evidence. Score research strength, novelty, feasibility, and buyer clarity. Be conservative and identify weak spots."
  },
  {
    id: "product_strategy",
    name: "Product Strategy Agent",
    responsibility: "Convert promising opportunities into build-ready goals, constraints, and format hints.",
    systemPrompt:
      "You are the Product Strategy Agent. Turn strong opportunities into build-ready briefs with clear buyer, deliverable, format, and production constraints."
  },
  {
    id: "design_direction",
    name: "Design Direction Agent",
    responsibility: "Assign a concrete design direction that reinforces approved references and avoids weak patterns.",
    systemPrompt:
      "You are the Design Direction Agent. Choose premium, commercially useful style directions. Reinforce approved references and avoid generic, blocky, or low-quality layouts."
  },
  {
    id: "build",
    name: "Build Agent",
    responsibility: "Write draft-ready build briefs for product and service opportunities.",
    systemPrompt:
      "You are the Build Agent. Produce concise build-ready summaries so an internal generator can draft the product or service quickly without publishing anything."
  },
  {
    id: "review_approval",
    name: "Review/Approval Agent",
    responsibility: "Prepare approval notes and ensure all outbound action remains blocked for manual review.",
    systemPrompt:
      "You are the Review and Approval Agent. Prepare approval notes, risks, and guardrails. Manual approval is always required before any outbound action."
  },
  {
    id: "runtime_monitor",
    name: "Runtime Monitor Agent",
    responsibility: "Watch handoffs across the workflow and surface operational risks, throttling, or missing context.",
    systemPrompt:
      "You are the Runtime Monitor Agent. Monitor the workflow handoffs, identify operational risks, and summarize where the agent chain might fail, stall, or need human attention."
  }
];

const trendResearchSchema = {
  name: "trend_research_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      prioritizedChannels: {
        type: "array",
        items: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] }
      },
      sourceSignals: { type: "array", items: { type: "string" } },
      approvedPatterns: { type: "array", items: { type: "string" } },
      avoidedPatterns: { type: "array", items: { type: "string" } },
      whitespaceOpportunities: { type: "array", items: { type: "string" } },
      buyerSignals: { type: "array", items: { type: "string" } },
      qualityRisks: { type: "array", items: { type: "string" } }
    },
    required: [
      "summary",
      "prioritizedChannels",
      "sourceSignals",
      "approvedPatterns",
      "avoidedPatterns",
      "whitespaceOpportunities",
      "buyerSignals",
      "qualityRisks"
    ]
  }
} as const;

const opportunityRouterSchema = {
  name: "opportunity_router_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      opportunities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            outputKind: { type: "string", enum: ["product", "service"] },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            productServiceType: { type: "string" },
            deliverableType: { type: "string" },
            targetBuyer: { type: "string" },
            styleDirection: { type: "string" },
            whySelected: { type: "string" },
            whyItMaySell: { type: "string" },
            sourceSignals: { type: "array", items: { type: "string" } },
            researchStrength: { type: "integer", minimum: 1, maximum: 100 },
            novelty: { type: "integer", minimum: 1, maximum: 100 },
            productionFeasibility: { type: "integer", minimum: 1, maximum: 100 },
            buyerClarity: { type: "integer", minimum: 1, maximum: 100 }
          },
          required: [
            "title",
            "outputKind",
            "channel",
            "niche",
            "productServiceType",
            "deliverableType",
            "targetBuyer",
            "styleDirection",
            "whySelected",
            "whyItMaySell",
            "sourceSignals",
            "researchStrength",
            "novelty",
            "productionFeasibility",
            "buyerClarity"
          ]
        }
      }
    },
    required: ["summary", "opportunities"]
  }
} as const;

const validationSchema = {
  name: "validation_guard_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            researchStrength: { type: "integer", minimum: 1, maximum: 100 },
            novelty: { type: "integer", minimum: 1, maximum: 100 },
            productionFeasibility: { type: "integer", minimum: 1, maximum: 100 },
            buyerClarity: { type: "integer", minimum: 1, maximum: 100 },
            validationNotes: { type: "array", items: { type: "string" } }
          },
          required: [
            "title",
            "channel",
            "niche",
            "researchStrength",
            "novelty",
            "productionFeasibility",
            "buyerClarity",
            "validationNotes"
          ]
        }
      }
    },
    required: ["summary", "reviews"]
  }
} as const;

const productStrategySchema = {
  name: "product_strategy_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      plans: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            buildGoal: { type: "string" },
            buildConstraints: { type: "string" },
            formatHint: { type: "string", enum: ["printable", "spreadsheet", "service"] },
            productTypeHint: { type: "string" },
            feasibilityNotes: { type: "array", items: { type: "string" } }
          },
          required: ["title", "channel", "niche", "buildGoal", "buildConstraints", "formatHint", "productTypeHint", "feasibilityNotes"]
        }
      }
    },
    required: ["summary", "plans"]
  }
} as const;

const designDirectionSchema = {
  name: "design_direction_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      directions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            styleDirection: { type: "string" },
            styleWhy: { type: "string" },
            designNotes: { type: "array", items: { type: "string" } }
          },
          required: ["title", "channel", "niche", "styleDirection", "styleWhy", "designNotes"]
        }
      }
    },
    required: ["summary", "directions"]
  }
} as const;

const buildSchema = {
  name: "build_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      builds: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            buildSummary: { type: "string" },
            draftTitleHint: { type: "string" },
            nextAction: { type: "string" }
          },
          required: ["title", "channel", "niche", "buildSummary", "draftTitleHint", "nextAction"]
        }
      }
    },
    required: ["summary", "builds"]
  }
} as const;

const reviewSchema = {
  name: "review_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: ["etsy", "fiverr", "print_on_demand", "content", "other"] },
            niche: { type: "string" },
            approvalSummary: { type: "string" },
            approvalNotes: { type: "array", items: { type: "string" } }
          },
          required: ["title", "channel", "niche", "approvalSummary", "approvalNotes"]
        }
      }
    },
    required: ["summary", "reviews"]
  }
} as const;

const runtimeMonitorSchema = {
  name: "runtime_monitor_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      handoffNotes: { type: "array", items: { type: "string" } },
      watchouts: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "handoffNotes", "watchouts"]
  }
} as const;

function compactReferenceExamples(referenceExamples: ResearchExample[]) {
  return referenceExamples.slice(0, 42).map((example) => ({
    title: example.title,
    channel: example.channel,
    niche: example.niche,
    deliverableType: example.deliverableType,
    productFormat: example.productFormat,
    status: example.status,
    whatLooksGood: example.whatLooksGood,
    sellabilityNotes: example.sellabilityNotes,
    visualStyleNotes: example.visualStyleNotes,
    styleComments: example.styleComments,
    notes: example.notes
  }));
}

function compactProductFeedback(productFeedback: ProductTrainingFeedback[]) {
  return productFeedback.slice(0, 20).map((entry) => ({
    styleName: entry.styleName,
    productType: entry.productType,
    rating: entry.rating,
    notes: entry.notes
  }));
}

function compactStyleFeedback(styleFeedback: StyleFeedbackMap) {
  return Object.entries(styleFeedback)
    .slice(0, 20)
    .map(([styleId, entry]) => ({
      styleId,
      approvals: entry.approvals,
      rejections: entry.rejections,
      lastOutcome: entry.lastOutcome ?? "unknown"
    }));
}

function createMatchKey(title: string, channel: Exclude<CommerceChannel, "all">, niche: string) {
  return `${channel}|${title.toLowerCase().trim()}|${niche.toLowerCase().trim()}`;
}

function buildSeedId(seed: Pick<RuntimeOpportunitySeed, "title" | "channel" | "niche" | "outputKind">) {
  return `${seed.outputKind}-${seed.channel}-${seed.title}-${seed.niche}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function executeStructuredAgent<T>(
  role: AgentRoleDefinition,
  schema: ResponseFormatJSONSchema["json_schema"],
  payload: Record<string, unknown>,
  options: AgentRuntimeOptions
): Promise<AgentExecutionResult<T>> {
  const batchIndex = options.batchIndex ?? 0;
  let attempts = 0;
  let retryCount = 0;

  options.onStatus?.({
    roleId: role.id,
    roleName: role.name,
    status: "running",
    message: "Starting structured OpenAI call.",
    batchIndex
  });

  try {
    const completion = await withOpenAIRetry(
      async () => {
        attempts += 1;
        return openai.chat.completions.create({
          model: OPENAI_AGENT_MODEL,
          messages: [
            {
              role: "system",
              content: role.systemPrompt
            },
            {
              role: "user",
              content: JSON.stringify(payload, null, 2)
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: schema
          }
        });
      },
      {
        label: role.name,
        onRetry: ({ attempt, delayMs }) => {
          retryCount += 1;
          options.onStatus?.({
            roleId: role.id,
            roleName: role.name,
            status: "retrying",
            message: `OpenAI rate limit encountered. Waiting before retry ${attempt}.`,
            batchIndex,
            attempt,
            retryDelayMs: delayMs
          });
        }
      }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${role.name} returned an empty response.`);
    }

    const data = JSON.parse(content) as T;
    const summary =
      typeof data === "object" &&
      data &&
      "summary" in (data as Record<string, unknown>) &&
      typeof (data as Record<string, unknown>).summary === "string"
        ? ((data as Record<string, unknown>).summary as string)
        : `${role.name} completed successfully.`;

    options.onStatus?.({
      roleId: role.id,
      roleName: role.name,
      status: "completed",
      message: summary,
      batchIndex,
      attempt: attempts
    });

    return {
      data,
      trace: {
        roleId: role.id,
        name: role.name,
        responsibility: role.responsibility,
        summary,
        itemCount:
          typeof data === "object" && data
            ? Object.values(data as Record<string, unknown>).find(Array.isArray)?.length ?? 1
            : 1,
        status: retryCount > 0 ? "retrying" : "completed",
        attempts,
        retryCount,
        batchIndex
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent execution failure.";
    options.onStatus?.({
      roleId: role.id,
      roleName: role.name,
      status: "failed",
      message: "Agent execution failed.",
      batchIndex,
      attempt: attempts,
      error: message
    });

    return {
      data: null,
      trace: {
        roleId: role.id,
        name: role.name,
        responsibility: role.responsibility,
        summary: `${role.name} failed during batch execution.`,
        itemCount: 0,
        status: "failed",
        attempts,
        retryCount,
        batchIndex,
        error: message
      }
    };
  }
}

function buildSharedPayload(input: AgentRuntimeInput) {
  const signals = extractResearchSignals(input);

  return {
    goal: input.goal,
    channelScope: input.channel,
    maxOpportunities: input.maxOpportunities ?? 10,
    preferredChannels: signals.preferredChannels,
    sourceSignalSummary: signals.sourceSignalSummary,
    nicheSignals: signals.nicheSignals,
    deliverableSignals: signals.deliverableSignals,
    buyerSignals: signals.buyerSignals,
    styleSignals: signals.styleSignals,
    approvedPatterns: signals.marketSignals.preferredPatterns,
    avoidedPatterns: signals.marketSignals.avoidedPatterns,
    premiumSignals: signals.marketSignals.premiumSignals,
    referenceExamples: compactReferenceExamples(input.referenceExamples),
    productFeedback: compactProductFeedback(input.productFeedback),
    styleFeedback: compactStyleFeedback(input.styleFeedback)
  };
}

function inferFallbackServiceType(goal: string) {
  const source = goal.toLowerCase();

  if (/automation|zapier|make|workflow/.test(source)) {
    return "automation setup";
  }

  if (/spreadsheet|dashboard|tracker|excel/.test(source)) {
    return "spreadsheet creation";
  }

  if (/video|youtube|reel|short/.test(source)) {
    return "video scripting";
  }

  if (/script/.test(source)) {
    return "script writing";
  }

  if (/image|thumbnail|mockup/.test(source)) {
    return "image generation";
  }

  if (/planner|worksheet|printable/.test(source)) {
    return "planner design";
  }

  return "ai content generation";
}

function buildFallbackServiceOpportunity(input: AgentRuntimeInput, payload: ReturnType<typeof buildSharedPayload>): RuntimeOpportunitySeed {
  const serviceType = inferFallbackServiceType(input.goal);
  const niche = payload.nicheSignals[0] || "online business growth";
  const targetBuyer = payload.buyerSignals[0] || "small businesses that need done-for-you execution";
  const styleDirection = payload.styleSignals[0] || "premium clarity with structured service presentation";

  const seed: RuntimeOpportunitySeed = {
    runtimeId: "",
    outputKind: "service",
    title: `Productized ${serviceType} service for ${niche}`,
    channel: "fiverr",
    niche,
    productServiceType: `${serviceType} service`,
    deliverableType: "service package",
    targetBuyer,
    styleDirection,
    whySelected: `A ${serviceType} service creates a direct client offer for the ${niche} niche and preserves a service lane in the queue.`,
    whyItMaySell: "It offers a clear client outcome, layered packages, and a fast path to delivery.",
    sourceSignals: Array.from(new Set([...payload.sourceSignalSummary, `Fallback service type: ${serviceType}`])),
    researchStrength: 84,
    novelty: 78,
    productionFeasibility: 85,
    buyerClarity: 82,
    buildGoal: `Create a sellable Fiverr gig for ${serviceType} targeting ${targetBuyer}.`,
    buildConstraints: "Include concrete packages, turnaround, deliverables, and reusable workflow notes.",
    formatHint: "service",
    productTypeHint: `${serviceType} service`,
    designNotes: ["Use a premium Fiverr-style service layout.", "Make packages easy to compare."],
    styleWhy: `Chosen from local market and style signals: ${styleDirection}.`,
    approvalNotes: ["Keep delivery manual until approved.", "Validate package scope before outbound use."],
    approvalSummary: "Fallback service opportunity added so the queue keeps a service lane.",
    buildSummary: "Draft a Fiverr-style gig with title, packages, process, and fulfillment notes."
  };

  seed.runtimeId = buildSeedId(seed);
  return seed;
}

function buildFallbackProductOpportunity(input: AgentRuntimeInput, payload: ReturnType<typeof buildSharedPayload>): RuntimeOpportunitySeed {
  const niche = payload.nicheSignals[0] || "planning systems";
  const targetBuyer = payload.buyerSignals[0] || "buyers who want a ready-to-use digital product";
  const styleDirection = payload.styleSignals[0] || "premium clean layout with direct buyer clarity";
  const channel = payload.preferredChannels.find((entry) => entry !== "fiverr") ?? "etsy";

  const seed: RuntimeOpportunitySeed = {
    runtimeId: "",
    outputKind: "product",
    title: `Digital product for ${niche}`,
    channel,
    niche,
    productServiceType: "digital product",
    deliverableType: channel === "content" ? "content product" : "digital download",
    targetBuyer,
    styleDirection,
    whySelected: "This preserves a product lane in the queue so the run does not collapse into services only.",
    whyItMaySell: "It converts the strongest saved research into a repeatable asset buyers can purchase without custom work.",
    sourceSignals: Array.from(new Set([...payload.sourceSignalSummary, `Fallback product channel: ${channel}`])),
    researchStrength: 83,
    novelty: 77,
    productionFeasibility: 86,
    buyerClarity: 81,
    buildGoal: `Create a sellable ${channel} digital product for ${targetBuyer}.`,
    buildConstraints: "Keep the output clear, premium, and aligned with saved market signals.",
    formatHint: "printable",
    productTypeHint: "digital product",
    designNotes: ["Use the strongest approved style cues from research.", "Avoid generic blocky layouts."],
    styleWhy: `Chosen from local style and market signals: ${styleDirection}.`,
    approvalNotes: ["Keep publishing manual.", "Validate buyer clarity before approval."],
    approvalSummary: "Fallback product opportunity added so the queue keeps a product lane.",
    buildSummary: "Create a listing-ready digital product output with matching style rationale."
  };

  seed.runtimeId = buildSeedId(seed);
  return seed;
}

function toRuntimeSeed(opportunity: OpportunityRouterOutput["opportunities"][number]) {
  const seed: RuntimeOpportunitySeed = {
    runtimeId: "",
    outputKind: opportunity.outputKind,
    title: opportunity.title,
    channel: opportunity.channel,
    niche: opportunity.niche,
    productServiceType: opportunity.productServiceType,
    deliverableType: opportunity.deliverableType,
    targetBuyer: opportunity.targetBuyer,
    styleDirection: opportunity.styleDirection,
    whySelected: opportunity.whySelected,
    whyItMaySell: opportunity.whyItMaySell,
    sourceSignals: opportunity.sourceSignals,
    researchStrength: opportunity.researchStrength,
    novelty: opportunity.novelty,
    productionFeasibility: opportunity.productionFeasibility,
    buyerClarity: opportunity.buyerClarity
  };

  seed.runtimeId = buildSeedId(seed);
  return seed;
}

function mergeOpportunityPlans(
  seeds: RuntimeOpportunitySeed[],
  validation: ValidationOutput | null,
  strategy: ProductStrategyOutput | null,
  design: DesignDirectionOutput | null,
  build: BuildOutput | null,
  review: ReviewOutput | null
) {
  const validationMap = new Map(
    (validation?.reviews ?? []).map((entry) => [createMatchKey(entry.title, entry.channel, entry.niche), entry])
  );
  const strategyMap = new Map(
    (strategy?.plans ?? []).map((entry) => [createMatchKey(entry.title, entry.channel, entry.niche), entry])
  );
  const designMap = new Map(
    (design?.directions ?? []).map((entry) => [createMatchKey(entry.title, entry.channel, entry.niche), entry])
  );
  const buildMap = new Map(
    (build?.builds ?? []).map((entry) => [createMatchKey(entry.title, entry.channel, entry.niche), entry])
  );
  const reviewMap = new Map(
    (review?.reviews ?? []).map((entry) => [createMatchKey(entry.title, entry.channel, entry.niche), entry])
  );

  return seeds.map((seed) => {
    const key = createMatchKey(seed.title, seed.channel, seed.niche);
    const validationPlan = validationMap.get(key);
    const strategyPlan = strategyMap.get(key);
    const designPlan = designMap.get(key);
    const buildPlan = buildMap.get(key);
    const reviewPlan = reviewMap.get(key);

    return {
      ...seed,
      researchStrength: validationPlan?.researchStrength ?? seed.researchStrength,
      novelty: validationPlan?.novelty ?? seed.novelty,
      productionFeasibility: validationPlan?.productionFeasibility ?? seed.productionFeasibility,
      buyerClarity: validationPlan?.buyerClarity ?? seed.buyerClarity,
      sourceSignals: Array.from(
        new Set([
          ...seed.sourceSignals,
          ...(validationPlan?.validationNotes ?? []),
          ...(strategyPlan?.feasibilityNotes ?? []),
          ...(designPlan?.designNotes ?? []),
          ...(reviewPlan?.approvalNotes ?? [])
        ])
      ),
      buildGoal: strategyPlan?.buildGoal,
      buildConstraints: strategyPlan?.buildConstraints,
      formatHint: strategyPlan?.formatHint,
      productTypeHint: strategyPlan?.productTypeHint,
      styleDirection: designPlan?.styleDirection ?? seed.styleDirection,
      designNotes: designPlan?.designNotes ?? [],
      styleWhy: designPlan?.styleWhy,
      approvalNotes: reviewPlan?.approvalNotes ?? [],
      approvalSummary: reviewPlan?.approvalSummary,
      buildSummary: buildPlan?.buildSummary,
      title: buildPlan?.draftTitleHint || seed.title
    } satisfies RuntimeOpportunitySeed;
  });
}

function ensureMixedOpportunityTypes(
  input: AgentRuntimeInput,
  payload: ReturnType<typeof buildSharedPayload>,
  opportunities: RuntimeOpportunitySeed[]
) {
  const next = [...opportunities];
  const hasService = next.some((entry) => entry.outputKind === "service");
  const hasProduct = next.some((entry) => entry.outputKind === "product");

  if ((input.channel === "all" || input.channel === "fiverr") && !hasService) {
    next.push(buildFallbackServiceOpportunity(input, payload));
  }

  if ((input.channel === "all" || input.channel !== "fiverr") && !hasProduct) {
    next.push(buildFallbackProductOpportunity(input, payload));
  }

  return next;
}

function createTraceFromOutput(trace: AgentRunTrace, output: unknown, fallbackSummary: string) {
  if (!output || trace.status === "failed") {
    return trace;
  }

  const summary =
    typeof output === "object" &&
    output &&
    "summary" in (output as Record<string, unknown>) &&
    typeof (output as Record<string, unknown>).summary === "string"
      ? ((output as Record<string, unknown>).summary as string)
      : fallbackSummary;

  return {
    ...trace,
    summary
  };
}

export async function runAutonomousAgentRuntime(
  input: AgentRuntimeInput,
  options: AgentRuntimeOptions = {}
): Promise<AgentRuntimeOutput> {
  const enabledAgents = AGENT_ROLE_DEFINITIONS.filter((role) => !role.disabled);
  const sharedPayload = buildSharedPayload(input);

  const trendResearchRole = enabledAgents.find((role) => role.id === "trend_research")!;
  const opportunityRouterRole = enabledAgents.find((role) => role.id === "opportunity_router")!;
  const validationRole = enabledAgents.find((role) => role.id === "validation_guard")!;
  const productStrategyRole = enabledAgents.find((role) => role.id === "product_strategy")!;
  const designDirectionRole = enabledAgents.find((role) => role.id === "design_direction")!;
  const buildRole = enabledAgents.find((role) => role.id === "build")!;
  const reviewRole = enabledAgents.find((role) => role.id === "review_approval")!;
  const runtimeMonitorRole = enabledAgents.find((role) => role.id === "runtime_monitor")!;

  const trendPromise = executeStructuredAgent<TrendResearchOutput>(trendResearchRole, trendResearchSchema, sharedPayload, options);

  const routerPromise = trendPromise.then((trendResult) =>
    executeStructuredAgent<OpportunityRouterOutput>(
      opportunityRouterRole,
      opportunityRouterSchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "Use the supplied evidence directly if the trend summary is unavailable.",
        prioritizedChannels: trendResult.data?.prioritizedChannels ?? sharedPayload.preferredChannels,
        whitespaceOpportunities: trendResult.data?.whitespaceOpportunities ?? [],
        buyerSignals: trendResult.data?.buyerSignals ?? sharedPayload.buyerSignals
      },
      options
    )
  );

  const validationPromise = Promise.all([trendPromise, routerPromise]).then(([trendResult, routerResult]) =>
    executeStructuredAgent<ValidationOutput>(
      validationRole,
      validationSchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "",
        opportunities: routerResult.data?.opportunities ?? []
      },
      options
    )
  );

  const strategyPromise = Promise.all([trendPromise, routerPromise]).then(([trendResult, routerResult]) =>
    executeStructuredAgent<ProductStrategyOutput>(
      productStrategyRole,
      productStrategySchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "",
        opportunities: routerResult.data?.opportunities ?? []
      },
      options
    )
  );

  const designPromise = Promise.all([trendPromise, routerPromise]).then(([trendResult, routerResult]) =>
    executeStructuredAgent<DesignDirectionOutput>(
      designDirectionRole,
      designDirectionSchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "",
        opportunities: routerResult.data?.opportunities ?? []
      },
      options
    )
  );

  const buildPromise = Promise.all([trendPromise, routerPromise, strategyPromise]).then(([trendResult, routerResult, strategyResult]) =>
    executeStructuredAgent<BuildOutput>(
      buildRole,
      buildSchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "",
        opportunities: routerResult.data?.opportunities ?? [],
        plans: strategyResult.data?.plans ?? []
      },
      options
    )
  );

  const reviewPromise = Promise.all([routerPromise, strategyPromise]).then(([routerResult, strategyResult]) =>
    executeStructuredAgent<ReviewOutput>(
      reviewRole,
      reviewSchema,
      {
        ...sharedPayload,
        opportunities: routerResult.data?.opportunities ?? [],
        plans: strategyResult.data?.plans ?? []
      },
      options
    )
  );

  const monitorPromise = Promise.all([
    trendPromise,
    routerPromise,
    validationPromise,
    strategyPromise,
    designPromise,
    buildPromise,
    reviewPromise
  ]).then(([trendResult, routerResult, validationResult, strategyResult, designResult, buildResult, reviewResult]) =>
    executeStructuredAgent<RuntimeMonitorOutput>(
      runtimeMonitorRole,
      runtimeMonitorSchema,
      {
        ...sharedPayload,
        researchSummary: trendResult.data?.summary ?? "",
        routerSummary: routerResult.data?.summary ?? "",
        validationSummary: validationResult.data?.summary ?? "",
        strategySummary: strategyResult.data?.summary ?? "",
        designSummary: designResult.data?.summary ?? "",
        buildSummary: buildResult.data?.summary ?? "",
        reviewSummary: reviewResult.data?.summary ?? "",
        agentStatuses: [
          trendResult.trace,
          routerResult.trace,
          validationResult.trace,
          strategyResult.trace,
          designResult.trace,
          buildResult.trace,
          reviewResult.trace
        ].map((trace) => ({
          roleId: trace.roleId,
          status: trace.status,
          error: trace.error ?? ""
        }))
      },
      options
    )
  );

  const [
    trendResult,
    routerResult,
    validationResult,
    strategyResult,
    designResult,
    buildResult,
    reviewResult,
    monitorResult
  ] = await Promise.all([
    trendPromise,
    routerPromise,
    validationPromise,
    strategyPromise,
    designPromise,
    buildPromise,
    reviewPromise,
    monitorPromise
  ]);

  const seeds = (routerResult.data?.opportunities ?? []).map(toRuntimeSeed);
  const mergedOpportunities = ensureMixedOpportunityTypes(
    input,
    sharedPayload,
    mergeOpportunityPlans(
      seeds,
      validationResult.data,
      strategyResult.data,
      designResult.data,
      buildResult.data,
      reviewResult.data
    )
  );

  return {
    researchSummary: [trendResult.data?.summary, monitorResult.data?.summary].filter(Boolean).join(" "),
    sourceSignalSummary: Array.from(
      new Set([
        ...sharedPayload.sourceSignalSummary,
        ...(trendResult.data?.sourceSignals ?? []),
        ...(monitorResult.data?.handoffNotes ?? []),
        ...(monitorResult.data?.watchouts ?? [])
      ])
    ),
    opportunities: mergedOpportunities,
    agentRuns: [
      createTraceFromOutput(trendResult.trace, trendResult.data, "Trend research completed."),
      createTraceFromOutput(routerResult.trace, routerResult.data, "Opportunity routing completed."),
      createTraceFromOutput(validationResult.trace, validationResult.data, "Validation completed."),
      createTraceFromOutput(strategyResult.trace, strategyResult.data, "Product strategy completed."),
      createTraceFromOutput(designResult.trace, designResult.data, "Design direction completed."),
      createTraceFromOutput(buildResult.trace, buildResult.data, "Build planning completed."),
      createTraceFromOutput(reviewResult.trace, reviewResult.data, "Approval review completed."),
      createTraceFromOutput(monitorResult.trace, monitorResult.data, "Runtime monitoring completed.")
    ]
  };
}
