import "server-only";

import { claude, CLAUDE_MODEL } from "@/lib/claude";
import { withClaudeRetry } from "@/lib/claude-retry";
import type { CommerceChannel, ResearchExample } from "@/lib/market-intelligence";
import { extractResearchSignals, type AutonomousResearchInput, type RuntimeOpportunitySeed } from "@/lib/autonomous-research";
import type { ProductTrainingFeedback, StyleFeedbackMap } from "@/lib/style-intelligence";

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

// ── Claude tool schemas ────────────────────────────────────────────────────

const CHANNEL_ENUM = ["etsy", "fiverr", "print_on_demand", "content", "other"] as const;

const trendResearchTool = {
  name: "trend_research_output",
  description: "Return trend research results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      prioritizedChannels: { type: "array", items: { type: "string", enum: CHANNEL_ENUM } },
      sourceSignals: { type: "array", items: { type: "string" } },
      approvedPatterns: { type: "array", items: { type: "string" } },
      avoidedPatterns: { type: "array", items: { type: "string" } },
      whitespaceOpportunities: { type: "array", items: { type: "string" } },
      buyerSignals: { type: "array", items: { type: "string" } },
      qualityRisks: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "prioritizedChannels", "sourceSignals", "approvedPatterns", "avoidedPatterns", "whitespaceOpportunities", "buyerSignals", "qualityRisks"]
  }
};

const opportunityRouterTool = {
  name: "opportunity_router_output",
  description: "Return opportunity routing results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      opportunities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            outputKind: { type: "string", enum: ["product", "service"] },
            channel: { type: "string", enum: CHANNEL_ENUM },
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
          required: ["title", "outputKind", "channel", "niche", "productServiceType", "deliverableType", "targetBuyer", "styleDirection", "whySelected", "whyItMaySell", "sourceSignals", "researchStrength", "novelty", "productionFeasibility", "buyerClarity"]
        }
      }
    },
    required: ["summary", "opportunities"]
  }
};

const validationTool = {
  name: "validation_guard_output",
  description: "Return validation results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: CHANNEL_ENUM },
            niche: { type: "string" },
            researchStrength: { type: "integer", minimum: 1, maximum: 100 },
            novelty: { type: "integer", minimum: 1, maximum: 100 },
            productionFeasibility: { type: "integer", minimum: 1, maximum: 100 },
            buyerClarity: { type: "integer", minimum: 1, maximum: 100 },
            validationNotes: { type: "array", items: { type: "string" } }
          },
          required: ["title", "channel", "niche", "researchStrength", "novelty", "productionFeasibility", "buyerClarity", "validationNotes"]
        }
      }
    },
    required: ["summary", "reviews"]
  }
};

const productStrategyTool = {
  name: "product_strategy_output",
  description: "Return product strategy results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      plans: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: CHANNEL_ENUM },
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
};

const designDirectionTool = {
  name: "design_direction_output",
  description: "Return design direction results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      directions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: CHANNEL_ENUM },
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
};

const buildTool = {
  name: "build_output",
  description: "Return build results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      builds: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: CHANNEL_ENUM },
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
};

const reviewTool = {
  name: "review_output",
  description: "Return review results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            channel: { type: "string", enum: CHANNEL_ENUM },
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
};

const runtimeMonitorTool = {
  name: "runtime_monitor_output",
  description: "Return runtime monitor results in structured format",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      handoffNotes: { type: "array", items: { type: "string" } },
      watchouts: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "handoffNotes", "watchouts"]
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────

function compactReferenceExamples(referenceExamples: ResearchExample[]) {
  return referenceExamples.slice(0, 42).map((ex) => ({
    title: ex.title,
    channel: ex.channel,
    niche: ex.niche,
    deliverableType: ex.deliverableType,
    productFormat: ex.productFormat,
    status: ex.status,
    whatLooksGood: ex.whatLooksGood,
    sellabilityNotes: ex.sellabilityNotes,
    visualStyleNotes: ex.visualStyleNotes,
    styleComments: ex.styleComments,
    notes: ex.notes
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

// ── Core Claude agent executor ─────────────────────────────────────────────

async function executeStructuredAgent<T>(
  role: AgentRoleDefinition,
  tool: { name: string; description: string; input_schema: object },
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
    message: `${role.name} is analyzing...`,
    batchIndex
  });

  try {
    const response = await withClaudeRetry(
      async () => {
        attempts += 1;
        return claude.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 8000,
          system: role.systemPrompt,
          tools: [tool as import("@anthropic-ai/sdk/resources").Tool],
          tool_choice: { type: "tool", name: tool.name },
          messages: [
            {
              role: "user",
              content: JSON.stringify(payload, null, 2)
            }
          ]
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
            message: `Rate limit hit. Retrying attempt ${attempt}...`,
            batchIndex,
            attempt,
            retryDelayMs: delayMs
          });
        }
      }
    );

    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new Error(`${role.name} did not return a tool_use block.`);
    }

    const data = toolUseBlock.input as T;
    const summary =
      typeof data === "object" &&
      data &&
      "summary" in (data as Record<string, unknown>) &&
      typeof (data as Record<string, unknown>).summary === "string"
        ? ((data as Record<string, unknown>).summary as string)
        : `${role.name} completed.`;

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
    const message = error instanceof Error ? error.message : "Unknown agent failure.";
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
        summary: `${role.name} failed.`,
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
  const src = goal.toLowerCase();
  if (/automation|zapier|make|workflow/.test(src)) return "automation setup";
  if (/spreadsheet|dashboard|tracker|excel/.test(src)) return "spreadsheet creation";
  if (/video|youtube|reel|short/.test(src)) return "video scripting";
  if (/script/.test(src)) return "script writing";
  if (/planner|worksheet|printable/.test(src)) return "planner design";
  return "ai content generation";
}

function buildFallbackServiceOpportunity(
  input: AgentRuntimeInput,
  payload: ReturnType<typeof buildSharedPayload>
): RuntimeOpportunitySeed {
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
    whySelected: `A ${serviceType} service creates a direct client offer for ${niche}.`,
    whyItMaySell: "Offers clear client outcomes, layered packages, and fast delivery path.",
    sourceSignals: Array.from(new Set([...payload.sourceSignalSummary, `Fallback service: ${serviceType}`])),
    researchStrength: 84, novelty: 78, productionFeasibility: 85, buyerClarity: 82,
    buildGoal: `Create a sellable Fiverr gig for ${serviceType} targeting ${targetBuyer}.`,
    buildConstraints: "Include concrete packages, turnaround, deliverables, and workflow notes.",
    formatHint: "service", productTypeHint: `${serviceType} service`,
    designNotes: ["Use premium Fiverr-style layout.", "Make packages easy to compare."],
    styleWhy: `Chosen from market signals: ${styleDirection}.`,
    approvalNotes: ["Keep delivery manual until approved."],
    approvalSummary: "Fallback service opportunity — keeps a service lane in the queue.",
    buildSummary: "Draft a Fiverr gig with title, packages, process, and fulfillment notes."
  };
  seed.runtimeId = buildSeedId(seed);
  return seed;
}

function buildFallbackProductOpportunity(
  _input: AgentRuntimeInput,
  payload: ReturnType<typeof buildSharedPayload>
): RuntimeOpportunitySeed {
  const niche = payload.nicheSignals[0] || "planning systems";
  const targetBuyer = payload.buyerSignals[0] || "buyers who want a ready-to-use digital product";
  const styleDirection = payload.styleSignals[0] || "premium clean layout with direct buyer clarity";
  const channel = payload.preferredChannels.find((c) => c !== "fiverr") ?? "etsy";
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
    whySelected: "Preserves a product lane in the queue.",
    whyItMaySell: "Converts research into a repeatable asset.",
    sourceSignals: Array.from(new Set([...payload.sourceSignalSummary, `Fallback product: ${channel}`])),
    researchStrength: 83, novelty: 77, productionFeasibility: 86, buyerClarity: 81,
    buildGoal: `Create a sellable ${channel} digital product for ${targetBuyer}.`,
    buildConstraints: "Keep output clear, premium, and aligned with market signals.",
    formatHint: "printable", productTypeHint: "digital product",
    designNotes: ["Use strongest approved style cues.", "Avoid generic blocky layouts."],
    styleWhy: `Chosen from style signals: ${styleDirection}.`,
    approvalNotes: ["Keep publishing manual.", "Validate buyer clarity."],
    approvalSummary: "Fallback product opportunity — keeps a product lane in the queue.",
    buildSummary: "Create a listing-ready digital product with matching style rationale."
  };
  seed.runtimeId = buildSeedId(seed);
  return seed;
}

function toRuntimeSeed(opp: OpportunityRouterOutput["opportunities"][number]): RuntimeOpportunitySeed {
  const seed: RuntimeOpportunitySeed = {
    runtimeId: "",
    outputKind: opp.outputKind,
    title: opp.title,
    channel: opp.channel,
    niche: opp.niche,
    productServiceType: opp.productServiceType,
    deliverableType: opp.deliverableType,
    targetBuyer: opp.targetBuyer,
    styleDirection: opp.styleDirection,
    whySelected: opp.whySelected,
    whyItMaySell: opp.whyItMaySell,
    sourceSignals: opp.sourceSignals,
    researchStrength: opp.researchStrength,
    novelty: opp.novelty,
    productionFeasibility: opp.productionFeasibility,
    buyerClarity: opp.buyerClarity
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
  const validationMap = new Map((validation?.reviews ?? []).map((e) => [createMatchKey(e.title, e.channel, e.niche), e]));
  const strategyMap = new Map((strategy?.plans ?? []).map((e) => [createMatchKey(e.title, e.channel, e.niche), e]));
  const designMap = new Map((design?.directions ?? []).map((e) => [createMatchKey(e.title, e.channel, e.niche), e]));
  const buildMap = new Map((build?.builds ?? []).map((e) => [createMatchKey(e.title, e.channel, e.niche), e]));
  const reviewMap = new Map((review?.reviews ?? []).map((e) => [createMatchKey(e.title, e.channel, e.niche), e]));

  return seeds.map((seed) => {
    const key = createMatchKey(seed.title, seed.channel, seed.niche);
    const vp = validationMap.get(key);
    const sp = strategyMap.get(key);
    const dp = designMap.get(key);
    const bp = buildMap.get(key);
    const rp = reviewMap.get(key);
    return {
      ...seed,
      researchStrength: vp?.researchStrength ?? seed.researchStrength,
      novelty: vp?.novelty ?? seed.novelty,
      productionFeasibility: vp?.productionFeasibility ?? seed.productionFeasibility,
      buyerClarity: vp?.buyerClarity ?? seed.buyerClarity,
      sourceSignals: Array.from(new Set([...seed.sourceSignals, ...(vp?.validationNotes ?? []), ...(sp?.feasibilityNotes ?? []), ...(dp?.designNotes ?? []), ...(rp?.approvalNotes ?? [])])),
      buildGoal: sp?.buildGoal,
      buildConstraints: sp?.buildConstraints,
      formatHint: sp?.formatHint,
      productTypeHint: sp?.productTypeHint,
      styleDirection: dp?.styleDirection ?? seed.styleDirection,
      designNotes: dp?.designNotes ?? [],
      styleWhy: dp?.styleWhy,
      approvalNotes: rp?.approvalNotes ?? [],
      approvalSummary: rp?.approvalSummary,
      buildSummary: bp?.buildSummary,
      title: bp?.draftTitleHint || seed.title
    } satisfies RuntimeOpportunitySeed;
  });
}

function ensureMixedOpportunityTypes(input: AgentRuntimeInput, payload: ReturnType<typeof buildSharedPayload>, opportunities: RuntimeOpportunitySeed[]) {
  const next = [...opportunities];
  const hasService = next.some((e) => e.outputKind === "service");
  const hasProduct = next.some((e) => e.outputKind === "product");
  if ((input.channel === "all" || input.channel === "fiverr") && !hasService) {
    next.push(buildFallbackServiceOpportunity(input, payload));
  }
  if ((input.channel === "all" || input.channel !== "fiverr") && !hasProduct) {
    next.push(buildFallbackProductOpportunity(input, payload));
  }
  return next;
}

function traceWithSummary(trace: AgentRunTrace, data: unknown, fallback: string): AgentRunTrace {
  if (!data || trace.status === "failed") return trace;
  const summary =
    typeof data === "object" && data && "summary" in (data as Record<string, unknown>) && typeof (data as Record<string, unknown>).summary === "string"
      ? ((data as Record<string, unknown>).summary as string)
      : fallback;
  return { ...trace, summary };
}

// ── Main runtime ───────────────────────────────────────────────────────────

export async function runAutonomousAgentRuntime(
  input: AgentRuntimeInput,
  options: AgentRuntimeOptions = {}
): Promise<AgentRuntimeOutput> {
  const enabled = AGENT_ROLE_DEFINITIONS.filter((r) => !r.disabled);
  const payload = buildSharedPayload(input);

  const role = (id: AgentRoleId) => enabled.find((r) => r.id === id)!;

  // Step 1: Trend Research
  const trendResult = await executeStructuredAgent<TrendResearchOutput>(role("trend_research"), trendResearchTool, payload, options);

  // Step 2: Opportunity Router (waits for trend)
  const routerResult = await executeStructuredAgent<OpportunityRouterOutput>(
    role("opportunity_router"),
    opportunityRouterTool,
    {
      ...payload,
      researchSummary: trendResult.data?.summary ?? "Use supplied evidence directly.",
      prioritizedChannels: trendResult.data?.prioritizedChannels ?? payload.preferredChannels,
      whitespaceOpportunities: trendResult.data?.whitespaceOpportunities ?? [],
      buyerSignals: trendResult.data?.buyerSignals ?? payload.buyerSignals
    },
    options
  );

  // Steps 3-5: Validation, Strategy, Design in parallel
  const [validationResult, strategyResult, designResult] = await Promise.all([
    executeStructuredAgent<ValidationOutput>(
      role("validation_guard"), validationTool,
      { ...payload, researchSummary: trendResult.data?.summary ?? "", opportunities: routerResult.data?.opportunities ?? [] },
      options
    ),
    executeStructuredAgent<ProductStrategyOutput>(
      role("product_strategy"), productStrategyTool,
      { ...payload, researchSummary: trendResult.data?.summary ?? "", opportunities: routerResult.data?.opportunities ?? [] },
      options
    ),
    executeStructuredAgent<DesignDirectionOutput>(
      role("design_direction"), designDirectionTool,
      { ...payload, researchSummary: trendResult.data?.summary ?? "", opportunities: routerResult.data?.opportunities ?? [] },
      options
    )
  ]);

  // Step 6: Build (waits for strategy)
  const buildResult = await executeStructuredAgent<BuildOutput>(
    role("build"), buildTool,
    { ...payload, researchSummary: trendResult.data?.summary ?? "", opportunities: routerResult.data?.opportunities ?? [], plans: strategyResult.data?.plans ?? [] },
    options
  );

  // Step 7: Review (waits for strategy + build)
  const reviewResult = await executeStructuredAgent<ReviewOutput>(
    role("review_approval"), reviewTool,
    { ...payload, opportunities: routerResult.data?.opportunities ?? [], plans: strategyResult.data?.plans ?? [] },
    options
  );

  // Step 8: Runtime Monitor
  const monitorResult = await executeStructuredAgent<RuntimeMonitorOutput>(
    role("runtime_monitor"), runtimeMonitorTool,
    {
      ...payload,
      researchSummary: trendResult.data?.summary ?? "",
      routerSummary: routerResult.data?.summary ?? "",
      validationSummary: validationResult.data?.summary ?? "",
      strategySummary: strategyResult.data?.summary ?? "",
      designSummary: designResult.data?.summary ?? "",
      buildSummary: buildResult.data?.summary ?? "",
      reviewSummary: reviewResult.data?.summary ?? "",
      agentStatuses: [trendResult, routerResult, validationResult, strategyResult, designResult, buildResult, reviewResult].map((r) => ({
        roleId: r.trace.roleId, status: r.trace.status, error: r.trace.error ?? ""
      }))
    },
    options
  );

  const seeds = (routerResult.data?.opportunities ?? []).map(toRuntimeSeed);
  const mergedOpportunities = ensureMixedOpportunityTypes(
    input,
    payload,
    mergeOpportunityPlans(seeds, validationResult.data, strategyResult.data, designResult.data, buildResult.data, reviewResult.data)
  );

  return {
    researchSummary: [trendResult.data?.summary, monitorResult.data?.summary].filter(Boolean).join(" "),
    sourceSignalSummary: Array.from(new Set([
      ...payload.sourceSignalSummary,
      ...(trendResult.data?.sourceSignals ?? []),
      ...(monitorResult.data?.handoffNotes ?? []),
      ...(monitorResult.data?.watchouts ?? [])
    ])),
    opportunities: mergedOpportunities,
    agentRuns: [
      traceWithSummary(trendResult.trace, trendResult.data, "Trend research completed."),
      traceWithSummary(routerResult.trace, routerResult.data, "Opportunity routing completed."),
      traceWithSummary(validationResult.trace, validationResult.data, "Validation completed."),
      traceWithSummary(strategyResult.trace, strategyResult.data, "Product strategy completed."),
      traceWithSummary(designResult.trace, designResult.data, "Design direction completed."),
      traceWithSummary(buildResult.trace, buildResult.data, "Build planning completed."),
      traceWithSummary(reviewResult.trace, reviewResult.data, "Approval review completed."),
      traceWithSummary(monitorResult.trace, monitorResult.data, "Runtime monitoring completed.")
    ]
  };
}
