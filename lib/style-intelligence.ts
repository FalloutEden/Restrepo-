import {
  deriveMarketSignals,
  getRecommendedStylePatterns,
  getResearchExamplesContext,
  type CommerceChannel,
  type MarketSignals
} from "@/lib/market-intelligence";
import type {
  Difficulty,
  GeneratedProductPage,
  ProductFormat,
  ProductTheme,
  SpreadsheetWorkbookSpec
} from "@/lib/missions";

export type StyleProfile = {
  id: string;
  name: string;
  palette: string[];
  layout: string;
  typography: string;
  nicheStyles: string[];
  productTypes: string[];
  formatAffinity: ProductFormat[];
  themeHint: ProductTheme;
  researchNotes: string[];
};

export type StyleFeedbackEntry = {
  approvals: number;
  rejections: number;
  lastOutcome?: "approved" | "rejected";
};

export type StyleFeedbackMap = Record<string, StyleFeedbackEntry>;
export type ProductFeedbackRating = "good" | "mid" | "bad";

export type ProductTrainingFeedback = {
  id: string;
  missionId: string;
  styleId: string;
  styleName: string;
  productType: string;
  rating: ProductFeedbackRating;
  notes: string;
  createdAt: string;
};

export type StyleResearchSnapshot = {
  highPerformingProductTypes: string[];
  colorPalettes: string[];
  layoutPatterns: string[];
  nicheStyles: string[];
  candidateStyleIds: string[];
  feedbackSummary: Array<{
    styleId: string;
    approvals: number;
    rejections: number;
  }>;
  selectedStyleId: string;
  selectedStyleName: string;
  selectedStyleReason: string;
  variationLabel: string;
  trainingSignalSummary: string[];
  recommendedStylePatterns: string[];
  influencingResearchSignals: string[];
  approvedReferenceExamples: string[];
  rejectedReferenceExamples: string[];
};

export type StyledBlueprintFields = {
  selectedStyleProfile: StyleProfile;
  selectedStyleReason: string;
  styleResearch: StyleResearchSnapshot;
};

export type StyleIntelligenceInput = {
  channel?: CommerceChannel;
  niche: string;
  customer: string;
  productTitle: string;
  trendSummary: string;
  conceptSummary: string;
  theme: ProductTheme;
  productFormat: ProductFormat;
  productType: string;
  mockupPrompt: string;
  workbookSpec?: SpreadsheetWorkbookSpec;
  generatedProductPages: GeneratedProductPage[];
  difficulty: Difficulty;
  timeToMVP: string;
};

export type StyledBlueprint<T extends StyleIntelligenceInput> = T & StyledBlueprintFields;

export const STYLE_PROFILES: StyleProfile[] = [
  {
    id: "wedding-soft-neutral",
    name: "wedding soft neutral",
    palette: ["#F5EDE6", "#D8C3A5", "#8E7C6D"],
    layout: "clean grid, soft spacing, elevated summary blocks",
    typography: "thin serif headers, simple body text",
    nicheStyles: ["wedding", "bridal", "romantic neutral", "timeless planning"],
    productTypes: ["planner", "spreadsheet", "tracker", "dashboard"],
    formatAffinity: ["spreadsheet", "printable", "service"],
    themeHint: "soft neutral",
    researchNotes: [
      "Soft neutrals keep wedding products premium without feeling cluttered.",
      "Buyers respond well to spacious layouts and warm restrained palettes in planning tools."
    ]
  },
  {
    id: "minimalist-ops-grid",
    name: "minimalist ops grid",
    palette: ["#FAF7F2", "#D9D4CC", "#3B3733"],
    layout: "structured grid, strong whitespace, crisp data hierarchy",
    typography: "clean sans serif headers, utility-first body text",
    nicheStyles: ["finance", "productivity", "operations", "editorial minimal"],
    productTypes: ["spreadsheet", "tracker", "dashboard", "template"],
    formatAffinity: ["spreadsheet", "printable", "service"],
    themeHint: "minimalist clean",
    researchNotes: [
      "Minimal operational layouts sell well for finance and planning because they feel usable immediately.",
      "Simple contrast and disciplined spacing help spreadsheets feel premium instead of generic."
    ]
  },
  {
    id: "bold-modern-launch",
    name: "bold modern launch",
    palette: ["#F6F1EB", "#C67B5C", "#2D2A28"],
    layout: "stacked sections, high contrast banners, direct callout cards",
    typography: "bold sans serif headers, compact modern body text",
    nicheStyles: ["marketing", "creator business", "launch planning", "high energy"],
    productTypes: ["planner", "template", "spreadsheet", "checklist"],
    formatAffinity: ["spreadsheet", "printable", "service"],
    themeHint: "bold modern",
    researchNotes: [
      "Bold commercial layouts perform well in business-focused niches where clarity and momentum matter.",
      "High-contrast callouts help digital products read as actionable and conversion-oriented."
    ]
  },
  {
    id: "feminine-editorial",
    name: "feminine editorial",
    palette: ["#F9EEF1", "#D7B7C4", "#7D6672"],
    layout: "editorial columns, gentle framing, polished note areas",
    typography: "elegant serif headers, soft sans serif supporting text",
    nicheStyles: ["lifestyle", "creative planning", "boutique", "feminine"],
    productTypes: ["planner", "template", "printable", "workbook"],
    formatAffinity: ["printable", "spreadsheet", "service"],
    themeHint: "feminine aesthetic",
    researchNotes: [
      "Editorial feminine styling helps lifestyle products feel curated rather than templated.",
      "Layered softness and boutique tone tend to elevate perceived product value."
    ]
  },
  {
    id: "dark-studio-strategy",
    name: "dark studio strategy",
    palette: ["#1D1D20", "#56525A", "#F1E7D9"],
    layout: "modular cards, dramatic contrast, focused metric zones",
    typography: "sleek sans serif headers, high-legibility compact body text",
    nicheStyles: ["strategy", "tech", "analytics", "premium modern"],
    productTypes: ["dashboard", "spreadsheet", "tracker", "planner"],
    formatAffinity: ["spreadsheet", "printable", "service"],
    themeHint: "dark mode",
    researchNotes: [
      "Dark premium styles can differentiate strategic and analytics-oriented products in crowded niches.",
      "Used carefully, dramatic contrast gives dashboards a more expensive polished feel."
    ]
  }
];

let feedbackContext: StyleFeedbackMap = {};
let productFeedbackContext: ProductTrainingFeedback[] = [];

export function setStyleFeedbackContext(nextFeedback: StyleFeedbackMap) {
  feedbackContext = nextFeedback;
}

export function getStyleFeedbackContext() {
  return feedbackContext;
}

export function setProductFeedbackContext(nextFeedback: ProductTrainingFeedback[]) {
  productFeedbackContext = nextFeedback;
}

export function getProductFeedbackContext() {
  return productFeedbackContext;
}

export function recordStyleFeedback(
  currentFeedback: StyleFeedbackMap,
  styleId: string,
  outcome: "approved" | "rejected"
): StyleFeedbackMap {
  const current = currentFeedback[styleId] ?? { approvals: 0, rejections: 0 };

  return {
    ...currentFeedback,
    [styleId]: {
      approvals: current.approvals + (outcome === "approved" ? 1 : 0),
      rejections: current.rejections + (outcome === "rejected" ? 1 : 0),
      lastOutcome: outcome
    }
  };
}

export function recordProductTrainingFeedback(
  currentFeedback: ProductTrainingFeedback[],
  entry: Omit<ProductTrainingFeedback, "id" | "createdAt">
) {
  return [
    {
      ...entry,
      id: `${entry.missionId}-${Date.now()}`,
      createdAt: new Date().toISOString()
    },
    ...currentFeedback
  ].slice(0, 100);
}

function hashValue(value: string) {
  return Array.from(value).reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 2147483647, 7);
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

function getRelevantTrainingSignals(input: StyleIntelligenceInput, profile: StyleProfile, feedback: ProductTrainingFeedback[]) {
  const productTypeNeedle = normalizeText(input.productType);

  return feedback.filter((entry) => {
    const sameStyle = entry.styleId === profile.id;
    const sameProductType =
      normalizeText(entry.productType).includes(productTypeNeedle) || productTypeNeedle.includes(normalizeText(entry.productType));
    return sameStyle || sameProductType;
  });
}

function buildRefinementInstructions(feedback: ProductTrainingFeedback[]) {
  const notes = feedback
    .map((entry) => entry.notes.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
    .toLowerCase();

  const instructions: string[] = [];

  if (/clean|clutter|busy|simple|minimal|spacing|whitespace/.test(notes)) {
    instructions.push("Increase whitespace and keep the layout cleaner with less visual clutter.");
  }

  if (/color|palette|contrast|tone|softer|bright/.test(notes)) {
    instructions.push("Refine the color palette balance so accents feel intentional and easier to read.");
  }

  if (/font|type|typography|text|read/.test(notes)) {
    instructions.push("Improve typography hierarchy and keep all planner text highly legible.");
  }

  if (/table|grid|align|structure|layout/.test(notes)) {
    instructions.push("Tighten layout alignment so the planner grid feels more structured and premium.");
  }

  if (/premium|sellable|commerce|polish|professional/.test(notes)) {
    instructions.push("Push the page finish toward a more polished premium commerce look.");
  }

  if (/generic|blocky|low quality|cheap|dated/.test(notes)) {
    instructions.push("Avoid generic blocky sections and raise the perceived production quality.");
  }

  return instructions;
}

function buildMarketRefinementInstructions(marketSignals: MarketSignals) {
  const instructions: string[] = [];

  if (marketSignals.preferredPatterns.includes("clean spacing")) {
    instructions.push("Use clean spacing cues taken from approved references.");
  }

  if (marketSignals.preferredPatterns.includes("editorial typography")) {
    instructions.push("Lean into editorial typography pairings that feel more curated than template-like.");
  }

  if (marketSignals.preferredPatterns.includes("soft neutral palette")) {
    instructions.push("Favor soft neutral palette choices that read as premium and calm.");
  }

  if (marketSignals.avoidedPatterns.includes("generic blocky layouts")) {
    instructions.push("Avoid generic blocky layouts and heavy dashboard boxes.");
  }

  return instructions;
}

function summarizeTrainingSignals(feedback: ProductTrainingFeedback[]) {
  if (feedback.length === 0) {
    return ["No structured training feedback recorded yet."];
  }

  return feedback.slice(0, 4).map((entry) => {
    const noteSuffix = entry.notes.trim() ? ` Notes: ${entry.notes.trim()}` : "";
    return `${entry.rating.toUpperCase()} for ${entry.productType} using ${entry.styleName}.${noteSuffix}`;
  });
}

function profileMatchesPattern(profile: StyleProfile, pattern: string) {
  const haystack = normalizeText(
    [profile.name, profile.layout, profile.typography, ...profile.nicheStyles, ...profile.researchNotes].join(" ")
  );

  const patternNeedles: Record<string, string[]> = {
    "clean spacing": ["clean", "whitespace", "airy", "spacing"],
    "editorial typography": ["editorial", "serif", "boutique"],
    "soft neutral palette": ["soft", "neutral", "warm"],
    "bold contrast": ["bold", "contrast"],
    "structured grid": ["grid", "structured", "hierarchy"],
    "premium polish": ["premium", "polished"],
    "playful energy": ["playful", "energy"],
    "modular sections": ["modular", "sections", "cards"],
    "generic blocky layouts": ["cards", "modular"]
  };

  return (patternNeedles[pattern] ?? [pattern]).some((needle) => haystack.includes(needle));
}

function scoreStyleProfile(
  profile: StyleProfile,
  input: StyleIntelligenceInput,
  goal: string,
  feedback: StyleFeedbackMap,
  productFeedback: ProductTrainingFeedback[],
  marketSignals: MarketSignals,
  recommendedPatterns: string[]
) {
  const haystack = normalizeText(`${goal} ${input.niche} ${input.customer} ${input.productTitle} ${input.productType}`);
  let score = 0;

  if (profile.themeHint === input.theme) {
    score += 4;
  }

  if (profile.formatAffinity.includes(input.productFormat)) {
    score += 3;
  }

  profile.nicheStyles.forEach((styleKeyword) => {
    if (haystack.includes(styleKeyword)) {
      score += 3;
    }
  });

  profile.productTypes.forEach((productKeyword) => {
    if (haystack.includes(productKeyword)) {
      score += 2;
    }
  });

  if (/wedding|bridal/.test(haystack) && profile.id === "wedding-soft-neutral") {
    score += 6;
  }

  if (/budget|debt|finance/.test(haystack) && profile.id === "minimalist-ops-grid") {
    score += 5;
  }

  if (/content|creator|marketing|launch/.test(haystack) && profile.id === "bold-modern-launch") {
    score += 5;
  }

  recommendedPatterns.forEach((pattern) => {
    if (profileMatchesPattern(profile, pattern)) {
      score += 4;
    }
  });

  marketSignals.avoidedPatterns.forEach((pattern) => {
    if (profileMatchesPattern(profile, pattern)) {
      score -= 4;
    }
  });

  const feedbackEntry = feedback[profile.id];
  if (feedbackEntry) {
    score += feedbackEntry.approvals * 3;
    score -= feedbackEntry.rejections * 4;
  }

  const relevantSignals = getRelevantTrainingSignals(input, profile, productFeedback);
  relevantSignals.forEach((entry) => {
    if (entry.rating === "good") {
      score += entry.styleId === profile.id ? 5 : 2;
    }

    if (entry.rating === "bad") {
      score -= entry.styleId === profile.id ? 8 : 3;
    }

    if (entry.rating === "mid") {
      score += entry.styleId === profile.id ? 1 : 0;
    }
  });

  return score;
}

function deriveVariationLabel(goal: string, candidates: StyleProfile[]) {
  if (candidates.length <= 1) {
    return "signature";
  }

  const labels = ["signature", "refined", "boutique", "editorial", "premium"];
  return labels[hashValue(goal) % labels.length];
}

function buildStyleResearch(
  input: StyleIntelligenceInput,
  candidates: StyleProfile[],
  feedback: StyleFeedbackMap,
  productFeedback: ProductTrainingFeedback[],
  marketSignals: MarketSignals,
  recommendedPatterns: string[]
) {
  return {
    highPerformingProductTypes: Array.from(new Set([input.productType, ...candidates.flatMap((profile) => profile.productTypes)])).slice(0, 6),
    colorPalettes: candidates.map((profile) => `${profile.name}: ${profile.palette.join(" / ")}`),
    layoutPatterns: candidates.map((profile) => `${profile.name}: ${profile.layout}`),
    nicheStyles: Array.from(new Set(candidates.flatMap((profile) => profile.nicheStyles))).slice(0, 10),
    feedbackSummary: candidates.map((profile) => ({
      styleId: profile.id,
      approvals: feedback[profile.id]?.approvals ?? 0,
      rejections: feedback[profile.id]?.rejections ?? 0
    })),
    trainingSignalSummary: summarizeTrainingSignals(productFeedback),
    recommendedStylePatterns: recommendedPatterns,
    influencingResearchSignals: marketSignals.signalSummary,
    approvedReferenceExamples: marketSignals.approvedReferenceTitles,
    rejectedReferenceExamples: marketSignals.rejectedReferenceTitles
  };
}

function enhanceWorkbookSpec(workbookSpec: SpreadsheetWorkbookSpec | undefined, profile: StyleProfile, refinements: string[]) {
  if (!workbookSpec) {
    return workbookSpec;
  }

  return {
    ...workbookSpec,
    previewSummary: `${workbookSpec.previewSummary} Styled in ${profile.name} with ${profile.layout}. ${refinements.join(" ")}`.trim(),
    tabs: workbookSpec.tabs.map((tab) => ({
      ...tab,
      themeStylingInstructions: [
        ...tab.themeStylingInstructions,
        `Palette: ${profile.palette.join(", ")}`,
        `Layout pattern: ${profile.layout}`,
        `Typography: ${profile.typography}`,
        ...refinements
      ]
    }))
  };
}

function enhanceGeneratedPages(pages: GeneratedProductPage[], profile: StyleProfile, refinements: string[]) {
  return pages.map((page) => ({
    ...page,
    visualStyleInstructions: [...page.visualStyleInstructions, `Apply ${profile.name} cues with ${profile.layout}`, ...refinements],
    colorPaletteSuggestion: profile.palette.join(", "),
    fontStyleSuggestion: profile.typography
  }));
}

export function applyStyleIntelligence<T extends StyleIntelligenceInput>(
  baseBlueprint: T,
  goal: string,
  feedback: StyleFeedbackMap = feedbackContext,
  productFeedback: ProductTrainingFeedback[] = productFeedbackContext
): StyledBlueprint<T> {
  const marketSignals = deriveMarketSignals(getResearchExamplesContext(), {
    channel: baseBlueprint.channel,
    niche: baseBlueprint.niche,
    productFormat: baseBlueprint.productFormat,
    targetBuyer: baseBlueprint.customer
  });
  const recommendedPatterns = getRecommendedStylePatterns(getResearchExamplesContext(), {
    channel: baseBlueprint.channel,
    niche: baseBlueprint.niche,
    productFormat: baseBlueprint.productFormat,
    targetBuyer: baseBlueprint.customer
  });

  const scoredProfiles = STYLE_PROFILES.map((profile) => ({
    profile,
    score: scoreStyleProfile(profile, baseBlueprint, goal, feedback, productFeedback, marketSignals, recommendedPatterns)
  })).sort((left, right) => right.score - left.score);

  const bestScore = scoredProfiles[0]?.score ?? 0;
  const candidatePool = scoredProfiles
    .filter((entry) => entry.score >= bestScore - 2)
    .map((entry) => entry.profile)
    .slice(0, 3);

  const fallbackPool = candidatePool.length > 0 ? candidatePool : STYLE_PROFILES.slice(0, 3);
  const variationIndex = hashValue(
    `${goal}:${baseBlueprint.productTitle}:${Object.keys(feedback).join(",")}:${productFeedback.length}:${recommendedPatterns.join(",")}`
  ) % fallbackPool.length;
  const selectedStyleProfile = fallbackPool[variationIndex];
  const variationLabel = deriveVariationLabel(goal, fallbackPool);
  const relevantSignals = getRelevantTrainingSignals(baseBlueprint, selectedStyleProfile, productFeedback);
  const refinements = [
    ...buildRefinementInstructions(relevantSignals),
    ...buildMarketRefinementInstructions(marketSignals)
  ];
  const research = buildStyleResearch(baseBlueprint, fallbackPool, feedback, productFeedback, marketSignals, recommendedPatterns);
  const feedbackEntry = feedback[selectedStyleProfile.id];
  const positiveSignals = relevantSignals.filter((entry) => entry.rating === "good").length;
  const negativeSignals = relevantSignals.filter((entry) => entry.rating === "bad").length;
  const neutralSignals = relevantSignals.filter((entry) => entry.rating === "mid").length;
  const marketReason = marketSignals.signalSummary[0] ? ` Research signals considered: ${marketSignals.signalSummary.join(" ")}` : "";
  const feedbackReason = positiveSignals
    ? `It also has ${positiveSignals} local good feedback signal(s) for this style or product type.`
    : negativeSignals
      ? `It was selected carefully despite ${negativeSignals} local bad signal(s), with refinements applied.`
      : neutralSignals
        ? `It includes refinement guidance from ${neutralSignals} local mid feedback signal(s).`
        : feedbackEntry?.approvals
          ? `It has ${feedbackEntry.approvals} prior approval signal(s) locally.`
          : feedbackEntry?.rejections
            ? `It still matched the niche despite ${feedbackEntry.rejections} local rejection signal(s).`
            : "It matches the product niche without any local feedback history yet.";
  const selectedStyleReason = `${selectedStyleProfile.name} was chosen because its palette, layout, and typography align with ${baseBlueprint.niche}; ${feedbackReason}${marketReason}`;
  const refinementSuffix = refinements.length > 0 ? ` Refinement notes applied: ${refinements.join(" ")}` : "";

  return {
    ...baseBlueprint,
    theme: selectedStyleProfile.themeHint,
    conceptSummary: `${baseBlueprint.conceptSummary} Style direction: ${selectedStyleProfile.name} (${variationLabel}) with ${selectedStyleProfile.layout} and ${selectedStyleProfile.typography}.${refinementSuffix}`.trim(),
    mockupPrompt: `${baseBlueprint.mockupPrompt} Use the ${selectedStyleProfile.name} palette ${selectedStyleProfile.palette.join(", ")} with ${selectedStyleProfile.layout} and ${selectedStyleProfile.typography}.${refinementSuffix}`.trim(),
    workbookSpec: enhanceWorkbookSpec(baseBlueprint.workbookSpec, selectedStyleProfile, refinements),
    generatedProductPages: enhanceGeneratedPages(baseBlueprint.generatedProductPages, selectedStyleProfile, refinements),
    selectedStyleProfile,
    selectedStyleReason,
    styleResearch: {
      ...research,
      candidateStyleIds: fallbackPool.map((profile) => profile.id),
      selectedStyleId: selectedStyleProfile.id,
      selectedStyleName: selectedStyleProfile.name,
      selectedStyleReason,
      variationLabel
    }
  };
}
