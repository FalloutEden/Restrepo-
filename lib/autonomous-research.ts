import {
  deriveMarketSignals,
  listResearchExamples,
  type CommerceChannel,
  type MarketSignals,
  type ResearchExample
} from "@/lib/market-intelligence";
import type { ProductFeedbackRating, ProductTrainingFeedback, StyleFeedbackMap } from "@/lib/style-intelligence";

export type OpportunityStatus =
  | "research_queued"
  | "shortlisted"
  | "ready_to_build"
  | "built"
  | "queued_for_approval";

export type OpportunityOutputKind = "product" | "service";

export type OpportunityScoreBreakdown = {
  researchStrength: number;
  approvedPatternFit: number;
  novelty: number;
  productionFeasibility: number;
  buyerClarity: number;
  diversityPenalty: number;
  duplicateRisk: number;
  confidence: number;
  reasoning: string[];
};

export type RuntimeOpportunitySeed = {
  runtimeId: string;
  outputKind: OpportunityOutputKind;
  title: string;
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
  buildGoal?: string;
  buildConstraints?: string;
  formatHint?: "printable" | "spreadsheet" | "service";
  productTypeHint?: string;
  designNotes?: string[];
  styleWhy?: string;
  approvalNotes?: string[];
  approvalSummary?: string;
  buildSummary?: string;
};

export type OpportunityCandidate = RuntimeOpportunitySeed & {
  id: string;
  confidenceScore: number;
  status: OpportunityStatus;
  nextAction: string;
  scoreBreakdown: OpportunityScoreBreakdown;
  diversityFingerprint: string;
  duplicateOf?: string;
};

export type OpportunityQueueJob = OpportunityCandidate & {
  createdAt: string;
  missionId?: string;
  selectedStyle?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
};

export type AutonomousResearchSignals = {
  preferredChannels: Array<Exclude<CommerceChannel, "all">>;
  channelScores: Array<{ channel: Exclude<CommerceChannel, "all">; score: number }>;
  nicheSignals: string[];
  deliverableSignals: string[];
  buyerSignals: string[];
  styleSignals: string[];
  marketSignals: MarketSignals;
  referenceCount: number;
  feedbackSignalCount: number;
  approvedPatternCount: number;
  rejectedPatternCount: number;
  sourceSignalSummary: string[];
};

export type AutonomousResearchInput = {
  goal: string;
  channel: CommerceChannel;
  referenceExamples: ResearchExample[];
  productFeedback: ProductTrainingFeedback[];
  styleFeedback: StyleFeedbackMap;
};

export type OpportunityQueueState = {
  researchQueue: OpportunityCandidate[];
  shortlistQueue: OpportunityCandidate[];
  draftBuildQueue: OpportunityCandidate[];
  approvalQueue: OpportunityCandidate[];
  rejectedSimilar: OpportunityCandidate[];
};

export const AUTONOMOUS_BUILD_THRESHOLD = 90;

export const SUPPORTED_RESEARCH_CHANNELS: Array<Exclude<CommerceChannel, "all">> = [
  "etsy",
  "fiverr",
  "print_on_demand",
  "content",
  "other"
];

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toActualChannels(channel: CommerceChannel): Array<Exclude<CommerceChannel, "all">> {
  return channel === "all" ? SUPPORTED_RESEARCH_CHANNELS : [channel];
}

function inferGoalKeywords(goal: string) {
  const source = normalizeText(goal);
  const keywords: string[] = [];
  const knownSignals: Array<[RegExp, string]> = [
    [/wedding|bridal/, "wedding"],
    [/budget|finance|money|debt/, "finance"],
    [/content|creator|social|launch/, "content"],
    [/teacher|classroom|education/, "education"],
    [/business|service|client|agency/, "business"],
    [/print|poster|merch|shirt/, "print"],
    [/planner|template|worksheet|checklist/, "planning"],
    [/productivity|ops|workflow|system/, "operations"]
  ];

  knownSignals.forEach(([matcher, label]) => {
    if (matcher.test(source)) {
      keywords.push(label);
    }
  });

  return uniq(keywords);
}

function sortChannelScores(scores: Record<Exclude<CommerceChannel, "all">, number>) {
  return Object.entries(scores)
    .map(([channel, score]) => ({ channel: channel as Exclude<CommerceChannel, "all">, score }))
    .sort((left, right) => right.score - left.score);
}

function scoreProductFeedback(entry: ProductTrainingFeedback) {
  if (entry.rating === "good") {
    return 5;
  }

  if (entry.rating === "mid") {
    return 2;
  }

  return -4;
}

function buildFeedbackSummary(productFeedback: ProductTrainingFeedback[]) {
  return uniq(
    productFeedback
      .slice(0, 8)
      .map((entry) => `${entry.rating.toUpperCase()} ${entry.productType} via ${entry.styleName}`)
  );
}

export function extractResearchSignals({
  goal,
  channel,
  referenceExamples,
  productFeedback,
  styleFeedback
}: AutonomousResearchInput): AutonomousResearchSignals {
  const goalKeywords = inferGoalKeywords(goal);
  const matchingExamples = listResearchExamples(referenceExamples, channel === "all" ? undefined : { channel });
  const marketSignals = deriveMarketSignals(referenceExamples, channel === "all" ? undefined : { channel });
  const channelScores: Record<Exclude<CommerceChannel, "all">, number> = {
    etsy: 68,
    fiverr: 68,
    print_on_demand: 66,
    content: 68,
    other: 64
  };

  matchingExamples.forEach((example) => {
    if (example.channel === "all") {
      SUPPORTED_RESEARCH_CHANNELS.forEach((entry) => {
        channelScores[entry] += example.status === "approved" ? 5 : example.status === "rejected" ? -4 : 2;
      });
      return;
    }

    channelScores[example.channel] += example.status === "approved" ? 12 : example.status === "rejected" ? -8 : 4;
    if (goalKeywords.some((keyword) => normalizeText(example.niche).includes(keyword))) {
      channelScores[example.channel] += 6;
    }
  });

  productFeedback.forEach((entry) => {
    const feedbackScore = scoreProductFeedback(entry);
    const normalizedType = normalizeText(entry.productType);

    if (/service|audit|client/.test(normalizedType)) {
      channelScores.fiverr += feedbackScore;
    }

    if (/content|prompt|swipe|newsletter/.test(normalizedType)) {
      channelScores.content += feedbackScore;
    }

    if (/spreadsheet|planner|template|worksheet/.test(normalizedType)) {
      channelScores.etsy += Math.round(feedbackScore * 0.9);
      channelScores.other += Math.round(feedbackScore * 0.6);
    }

    if (/print|poster|shirt|merch|wall art/.test(normalizedType)) {
      channelScores.print_on_demand += Math.round(feedbackScore * 0.8);
    }
  });

  Object.values(styleFeedback).forEach((entry) => {
    const delta = entry.approvals * 1 - entry.rejections * 1;
    channelScores.etsy += delta;
    channelScores.content += Math.round(delta * 0.5);
  });

  const rankedChannels = sortChannelScores(channelScores).filter((entry) => channel === "all" || entry.channel === channel);
  const preferredChannels = rankedChannels.map((entry) => entry.channel);
  const nicheSignals = uniq([...goalKeywords, ...matchingExamples.map((example) => example.niche), ...marketSignals.nicheTags]).slice(0, 10);
  const deliverableSignals = uniq(matchingExamples.map((example) => example.deliverableType)).slice(0, 8);
  const buyerSignals = uniq(matchingExamples.map((example) => example.targetBuyer)).slice(0, 8);
  const styleSignals = uniq([
    ...matchingExamples.map((example) => example.visualStyleNotes),
    ...matchingExamples.map((example) => example.whatLooksGood),
    ...marketSignals.preferredPatterns,
    ...marketSignals.premiumSignals
  ]).slice(0, 10);
  const sourceSignalSummary = uniq([
    ...marketSignals.signalSummary,
    ...buildFeedbackSummary(productFeedback),
    preferredChannels.length > 0 ? `Preferred channels: ${preferredChannels.join(", ")}` : ""
  ]);

  return {
    preferredChannels,
    channelScores: rankedChannels,
    nicheSignals,
    deliverableSignals,
    buyerSignals,
    styleSignals,
    marketSignals,
    referenceCount: matchingExamples.length,
    feedbackSignalCount: productFeedback.length,
    approvedPatternCount: marketSignals.approvedReferenceTitles.length,
    rejectedPatternCount: marketSignals.rejectedReferenceTitles.length,
    sourceSignalSummary: sourceSignalSummary.length > 0 ? sourceSignalSummary : ["No saved market signals yet."]
  };
}

function buildDiversityFingerprint(seed: RuntimeOpportunitySeed) {
  return uniq([
    seed.outputKind,
    seed.channel,
    seed.niche,
    seed.productServiceType,
    seed.deliverableType,
    seed.styleDirection
  ])
    .map((entry) => normalizeText(entry))
    .join("|");
}

function buildTokenSet(
  seed: Pick<RuntimeOpportunitySeed, "outputKind" | "channel" | "niche" | "productServiceType" | "deliverableType" | "styleDirection" | "targetBuyer">
) {
  return new Set(
    `${seed.outputKind} ${seed.channel} ${seed.niche} ${seed.productServiceType} ${seed.deliverableType} ${seed.styleDirection} ${seed.targetBuyer}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function calculateOpportunitySimilarity(left: RuntimeOpportunitySeed, right: RuntimeOpportunitySeed) {
  const tokenSimilarity = jaccardSimilarity(buildTokenSet(left), buildTokenSet(right));
  const sameOutputKind = left.outputKind === right.outputKind ? 0.1 : 0;
  const sameChannel = left.channel === right.channel ? 0.12 : 0;
  const sameNiche = normalizeText(left.niche) === normalizeText(right.niche) ? 0.24 : 0;
  const sameDeliverable = normalizeText(left.deliverableType) === normalizeText(right.deliverableType) ? 0.12 : 0;
  const sameStyle = normalizeText(left.styleDirection) === normalizeText(right.styleDirection) ? 0.12 : 0;

  return Math.min(1, tokenSimilarity + sameOutputKind + sameChannel + sameNiche + sameDeliverable + sameStyle);
}

function scoreApprovedPatternFit(seed: RuntimeOpportunitySeed, signals: AutonomousResearchSignals) {
  const haystack = normalizeText(
    `${seed.niche} ${seed.deliverableType} ${seed.styleDirection} ${seed.whySelected} ${seed.sourceSignals.join(" ")}`
  );

  let score = 48;

  signals.marketSignals.preferredPatterns.forEach((pattern) => {
    if (haystack.includes(normalizeText(pattern))) {
      score += 8;
    }
  });

  signals.marketSignals.avoidedPatterns.forEach((pattern) => {
    if (haystack.includes(normalizeText(pattern))) {
      score -= 10;
    }
  });

  if (signals.marketSignals.approvedReferenceTitles.length > 0) {
    score += Math.min(14, signals.marketSignals.approvedReferenceTitles.length * 2);
  }

  if (signals.marketSignals.rejectedReferenceTitles.length > 0) {
    score -= Math.min(12, signals.marketSignals.rejectedReferenceTitles.length * 2);
  }

  return clamp(score);
}

function defaultNextAction(status: OpportunityStatus) {
  switch (status) {
    case "research_queued":
      return "Keep researching and gather stronger evidence before shortlisting.";
    case "shortlisted":
      return "Hold in the opportunity queue until confidence or capacity improves.";
    case "ready_to_build":
      return "Automatically build the draft and send it to approval review.";
    case "built":
      return "Draft is built. Compare it to the opportunity rationale before approving.";
    case "queued_for_approval":
      return "Wait for human approval before any outbound action.";
  }
}

export function scoreOpportunityConfidence(
  seed: RuntimeOpportunitySeed,
  signals: AutonomousResearchSignals,
  diversityPenalty = 0,
  duplicateRisk = 0
) {
  const researchStrength = clamp(seed.researchStrength);
  const approvedPatternFit = scoreApprovedPatternFit(seed, signals);
  const novelty = clamp(seed.novelty - diversityPenalty);
  const productionFeasibility = clamp(seed.productionFeasibility);
  const buyerClarity = clamp(seed.buyerClarity);
  const confidence = clamp(
    researchStrength * 0.28 +
      approvedPatternFit * 0.22 +
      novelty * 0.18 +
      productionFeasibility * 0.17 +
      buyerClarity * 0.15 -
      duplicateRisk * 10
  );

  return {
    researchStrength,
    approvedPatternFit,
    novelty,
    productionFeasibility,
    buyerClarity,
    diversityPenalty: clamp(diversityPenalty),
    duplicateRisk: clamp(duplicateRisk * 100),
    confidence,
    reasoning: [
      `Research strength ${researchStrength}/100 based on source signal quality.`,
      `Approved pattern fit ${approvedPatternFit}/100 from stored references and feedback.`,
      `Novelty ${novelty}/100 after diversity penalties.`,
      `Production feasibility ${productionFeasibility}/100 for build practicality.`,
      `Buyer clarity ${buyerClarity}/100 for audience specificity.`
    ]
  } satisfies OpportunityScoreBreakdown;
}

export function diversifyAndScoreOpportunities(
  seeds: RuntimeOpportunitySeed[],
  signals: AutonomousResearchSignals
) {
  const rankedSeeds = [...seeds].sort((left, right) => {
    const leftBase = left.researchStrength + left.novelty + left.productionFeasibility + left.buyerClarity;
    const rightBase = right.researchStrength + right.novelty + right.productionFeasibility + right.buyerClarity;
    return rightBase - leftBase;
  });

  const accepted: OpportunityCandidate[] = [];
  const rejectedSimilar: OpportunityCandidate[] = [];

  rankedSeeds.forEach((seed) => {
    const similarAccepted = accepted
      .map((candidate) => ({
        candidate,
        similarity: calculateOpportunitySimilarity(seed, candidate)
      }))
      .sort((left, right) => right.similarity - left.similarity)[0];

    const duplicateRisk = similarAccepted?.similarity ?? 0;
    const diversityPenalty = duplicateRisk >= 0.72 ? 28 : duplicateRisk >= 0.58 ? 14 : duplicateRisk >= 0.44 ? 6 : 0;
    const scoreBreakdown = scoreOpportunityConfidence(seed, signals, diversityPenalty, duplicateRisk);
    const candidate: OpportunityCandidate = {
      ...seed,
      id: createId("opportunity"),
      confidenceScore: scoreBreakdown.confidence,
      status: "research_queued",
      nextAction: defaultNextAction("research_queued"),
      scoreBreakdown,
      diversityFingerprint: buildDiversityFingerprint(seed),
      duplicateOf: similarAccepted?.similarity >= 0.82 ? similarAccepted.candidate.id : undefined
    };

    if (similarAccepted?.similarity >= 0.82) {
      rejectedSimilar.push(candidate);
      return;
    }

    accepted.push(candidate);
  });

  return {
    accepted: accepted.sort((left, right) => right.confidenceScore - left.confidenceScore),
    rejectedSimilar
  };
}

export function buildOpportunityQueues(
  candidates: OpportunityCandidate[],
  threshold = AUTONOMOUS_BUILD_THRESHOLD
): OpportunityQueueState {
  const researchQueue: OpportunityCandidate[] = [];
  const shortlistQueue: OpportunityCandidate[] = [];
  const draftBuildQueue: OpportunityCandidate[] = [];

  candidates.forEach((candidate) => {
    if (candidate.confidenceScore >= threshold) {
      draftBuildQueue.push({
        ...candidate,
        status: "ready_to_build",
        nextAction: defaultNextAction("ready_to_build")
      });
      return;
    }

    if (candidate.confidenceScore >= threshold - 12) {
      shortlistQueue.push({
        ...candidate,
        status: "shortlisted",
        nextAction: defaultNextAction("shortlisted")
      });
      return;
    }

    researchQueue.push({
      ...candidate,
      status: "research_queued",
      nextAction: defaultNextAction("research_queued")
    });
  });

  return {
    researchQueue,
    shortlistQueue,
    draftBuildQueue,
    approvalQueue: [],
    rejectedSimilar: []
  };
}

export function createQueueJob(
  candidate: OpportunityCandidate,
  overrides?: Partial<OpportunityQueueJob>
): OpportunityQueueJob {
  return {
    ...candidate,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

export function planOpportunityQueues(
  seeds: RuntimeOpportunitySeed[],
  signals: AutonomousResearchSignals,
  threshold = AUTONOMOUS_BUILD_THRESHOLD
) {
  const { accepted, rejectedSimilar } = diversifyAndScoreOpportunities(seeds, signals);
  const queueState = buildOpportunityQueues(accepted, threshold);

  return {
    ...queueState,
    rejectedSimilar
  } satisfies OpportunityQueueState;
}

export function summarizeSourceSignals(input: AutonomousResearchInput) {
  const signals = extractResearchSignals(input);
  return signals.sourceSignalSummary;
}

export function getFeedbackAffinity(rating: ProductFeedbackRating) {
  switch (rating) {
    case "good":
      return 1;
    case "mid":
      return 0.4;
    case "bad":
      return -0.8;
  }
}
