export type CommerceChannel = "all" | "etsy" | "fiverr" | "print_on_demand" | "content" | "other";
export type ResearchExampleStatus = "approved" | "rejected" | "review";

export type ResearchExample = {
  id: string;
  title: string;
  url: string;
  screenshotDataUrl?: string;
  channel: CommerceChannel;
  niche: string;
  productFormat: string;
  targetBuyer: string;
  deliverableType: string;
  whatLooksGood: string;
  sellabilityNotes: string;
  visualStyleNotes: string;
  styleComments: string;
  notes: string;
  status: ResearchExampleStatus;
  createdAt: string;
};

export type MarketSignalInput = {
  channel?: CommerceChannel;
  niche?: string;
  productFormat?: string;
  targetBuyer?: string;
};

export type MarketSignals = {
  matchingExamples: ResearchExample[];
  preferredPatterns: string[];
  avoidedPatterns: string[];
  nicheTags: string[];
  pricingBands: string[];
  premiumSignals: string[];
  sellabilitySignals: string[];
  approvedReferenceTitles: string[];
  rejectedReferenceTitles: string[];
  signalSummary: string[];
};

export type IngestedReferenceUrl = {
  url: string;
  channel: CommerceChannel;
  nicheTags: string[];
  pricingBands: string[];
  notes: string[];
  titleHint: string;
  productFormatHint: string;
  deliverableTypeHint: string;
};

let researchExamplesContext: ResearchExample[] = [];

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferChannelFromUrl(hostname: string, pathname: string): CommerceChannel {
  const haystack = `${hostname} ${pathname}`;

  if (/etsy/.test(haystack)) {
    return "etsy";
  }

  if (/fiverr/.test(haystack)) {
    return "fiverr";
  }

  if (/printful|printify|gelato|redbubble|teepublic|shopify/.test(haystack)) {
    return "print_on_demand";
  }

  if (/gumroad|substack|notion|beehiiv|youtube|instagram|tiktok|blog/.test(haystack)) {
    return "content";
  }

  return "other";
}

function inferKeywordSignals(source: string) {
  const lower = normalizeText(source);
  const tags: string[] = [];
  const notes: string[] = [];

  const keywordMap: Array<[RegExp, string, string]> = [
    [/wedding|bridal/, "wedding", "Wedding-related references often reward soft premium styling and emotional positioning."],
    [/budget|finance|debt|money/, "finance", "Finance references often convert when the offer feels structured, clear, and practical."],
    [/planner|checklist|worksheet/, "planning", "Planning products tend to sell on clarity, usability, and immediate value."],
    [/prompt|swipe|content|caption/, "content systems", "Content products often perform when they save time and feel operationally useful."],
    [/dashboard|tracker|spreadsheet|excel/, "operations", "Operational tools benefit from structured layouts and premium utility cues."],
    [/shirt|poster|wall art|mug|sticker/, "print-on-demand", "Print-on-demand concepts usually need fast thumbnail readability and a clear niche hook."],
    [/service|audit|package|consult/, "service offers", "Service offers sell best when outcomes and deliverables are concrete."],
    [/teacher|classroom|education/, "education", "Educational references often reward organized layouts and easy implementation."],
    [/template|kit|bundle/, "template bundles", "Bundles and templates sell when the value stack is obvious at a glance."]
  ];

  keywordMap.forEach(([matcher, tag, note]) => {
    if (matcher.test(lower)) {
      tags.push(tag);
      notes.push(note);
    }
  });

  return {
    tags: uniq(tags),
    notes: uniq(notes)
  };
}

function inferProductFormat(source: string) {
  const lower = normalizeText(source);

  if (/spreadsheet|excel|xlsx|dashboard|tracker/.test(lower)) {
    return "spreadsheet";
  }

  if (/service|audit|custom/.test(lower)) {
    return "service";
  }

  if (/print|poster|wall art|shirt|hoodie|merch/.test(lower)) {
    return "print_on_demand";
  }

  if (/content|prompt|caption|script|newsletter/.test(lower)) {
    return "content pack";
  }

  return "printable";
}

function inferDeliverableType(channel: CommerceChannel, format: string, source: string) {
  const lower = normalizeText(source);

  if (channel === "fiverr" || /service|audit|custom/.test(lower)) {
    return "service package";
  }

  if (channel === "content" || /prompt|caption|newsletter|script/.test(lower)) {
    return "content product";
  }

  if (channel === "print_on_demand" || /shirt|poster|merch|wall art/.test(lower)) {
    return "print-on-demand asset";
  }

  if (/spreadsheet|excel|dashboard|tracker/.test(lower) || format === "spreadsheet") {
    return "editable workbook";
  }

  return "digital download";
}

function matchesExample(example: ResearchExample, input?: MarketSignalInput) {
  if (!input) {
    return true;
  }

  const nicheNeedle = normalizeText(input.niche ?? "");
  const buyerNeedle = normalizeText(input.targetBuyer ?? "");
  const formatNeedle = normalizeText(input.productFormat ?? "");
  const matchesChannel =
    !input.channel ||
    input.channel === "all" ||
    example.channel === "all" ||
    example.channel === input.channel;
  const matchesNiche =
    !nicheNeedle ||
    normalizeText(`${example.niche} ${example.whatLooksGood} ${example.sellabilityNotes} ${example.visualStyleNotes}`).includes(nicheNeedle);
  const matchesBuyer = !buyerNeedle || normalizeText(`${example.targetBuyer} ${example.notes}`).includes(buyerNeedle);
  const matchesFormat = !formatNeedle || normalizeText(`${example.productFormat} ${example.deliverableType}`).includes(formatNeedle);

  return matchesChannel && (matchesNiche || matchesBuyer || matchesFormat);
}

function extractPricingBands(text: string) {
  const matches = text.match(/\$?\d+(?:\.\d{2})?(?:\s*-\s*\$?\d+(?:\.\d{2})?)?/g) ?? [];
  return uniq(matches.map((match) => match.replace(/\s+/g, " ").trim()));
}

function extractStylePatterns(example: ResearchExample) {
  const haystack = normalizeText(
    [example.whatLooksGood, example.visualStyleNotes, example.styleComments, example.notes, example.sellabilityNotes].join(" ")
  );
  const patterns: string[] = [];

  const patternMap: Array<[RegExp, string]> = [
    [/\bclean\b|\bminimal\b|\bwhitespace\b|\bairy\b/, "clean spacing"],
    [/\beditorial\b|\bserif\b|\bboutique\b/, "editorial typography"],
    [/\bneutral\b|\bsoft\b|\bwarm\b/, "soft neutral palette"],
    [/\bbold\b|\bcontrast\b|\bhigh contrast\b/, "bold contrast"],
    [/\bgrid\b|\bstructured\b|\baligned\b|\btable\b/, "structured grid"],
    [/\bpremium\b|\bpolished\b|\bluxury\b/, "premium polish"],
    [/\bplayful\b|\bcolorful\b|\bfun\b/, "playful energy"],
    [/\bmodular\b|\bcards\b|\bsections\b/, "modular sections"]
  ];

  patternMap.forEach(([matcher, label]) => {
    if (matcher.test(haystack)) {
      patterns.push(label);
    }
  });

  if (example.status === "rejected" && /\bgeneric\b|\bblocky\b|\blow quality\b|\bcheap\b/.test(haystack)) {
    patterns.push("generic blocky layouts");
  }

  return uniq(patterns);
}

export function ingestReferenceUrl(url: string): IngestedReferenceUrl {
  const fallback = {
    url,
    channel: "other" as CommerceChannel,
    nicheTags: [] as string[],
    pricingBands: [] as string[],
    notes: ["Reference URL saved without extra inferred signals."],
    titleHint: "Reference example",
    productFormatHint: "printable",
    deliverableTypeHint: "digital download"
  };

  try {
    const parsed = new URL(url);
    const hostname = normalizeText(parsed.hostname);
    const pathname = normalizeText(parsed.pathname.replace(/[\-_]/g, " "));
    const source = `${hostname} ${pathname}`;
    const channel = inferChannelFromUrl(hostname, pathname);
    const keywordSignals = inferKeywordSignals(source);
    const pricingBands = extractPricingBands(`${pathname} ${parsed.search}`);
    const titleHint = pathname
      .split("/")
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/\b\w/g, (character) => character.toUpperCase()) || "Reference example";
    const productFormatHint = inferProductFormat(source);
    const deliverableTypeHint = inferDeliverableType(channel, productFormatHint, source);

    return {
      url,
      channel,
      nicheTags: keywordSignals.tags,
      pricingBands,
      notes: uniq([
        `Reference appears to fit the ${channel === "print_on_demand" ? "print on demand" : channel} channel.`,
        ...keywordSignals.notes,
        pricingBands.length > 0 ? `Observed pricing cues: ${pricingBands.join(", ")}.` : ""
      ]),
      titleHint,
      productFormatHint,
      deliverableTypeHint
    };
  } catch {
    return fallback;
  }
}

export function setResearchExamplesContext(nextExamples: ResearchExample[]) {
  researchExamplesContext = nextExamples;
}

export function getResearchExamplesContext() {
  return researchExamplesContext;
}

export function storeResearchExample(
  currentExamples: ResearchExample[],
  entry: Omit<ResearchExample, "id" | "createdAt">
) {
  return [
    {
      ...entry,
      id: createId("research"),
      createdAt: new Date().toISOString()
    },
    ...currentExamples
  ].slice(0, 150);
}

export function listResearchExamples(currentExamples: ResearchExample[] = researchExamplesContext, input?: MarketSignalInput) {
  return currentExamples
    .filter((example) => matchesExample(example, input))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deriveMarketSignals(currentExamples: ResearchExample[] = researchExamplesContext, input?: MarketSignalInput): MarketSignals {
  const matchingExamples = listResearchExamples(currentExamples, input);
  const approvedExamples = matchingExamples.filter((example) => example.status === "approved");
  const rejectedExamples = matchingExamples.filter((example) => example.status === "rejected");

  const preferredPatterns = uniq(approvedExamples.flatMap(extractStylePatterns)).slice(0, 8);
  const avoidedPatterns = uniq(rejectedExamples.flatMap(extractStylePatterns)).slice(0, 8);
  const nicheTags = uniq(matchingExamples.map((example) => example.niche)).slice(0, 8);
  const pricingBands = uniq(matchingExamples.flatMap((example) => extractPricingBands(example.sellabilityNotes))).slice(0, 6);
  const premiumSignals = uniq(
    approvedExamples
      .flatMap((example) => [example.whatLooksGood, example.visualStyleNotes, example.styleComments])
      .map((entry) => entry.trim())
      .filter(Boolean)
  ).slice(0, 6);
  const sellabilitySignals = uniq(
    matchingExamples
      .map((example) => example.sellabilityNotes.trim())
      .filter(Boolean)
  ).slice(0, 6);

  const signalSummary = [
    preferredPatterns.length > 0 ? `Preferred patterns: ${preferredPatterns.join(", ")}` : "",
    avoidedPatterns.length > 0 ? `Avoided patterns: ${avoidedPatterns.join(", ")}` : "",
    nicheTags.length > 0 ? `Active niches: ${nicheTags.join(", ")}` : "",
    pricingBands.length > 0 ? `Observed pricing bands: ${pricingBands.join(", ")}` : "",
    approvedExamples.length > 0 ? `Approved reference examples: ${approvedExamples.map((example) => example.title).join(", ")}` : "",
    rejectedExamples.length > 0 ? `Rejected reference examples: ${rejectedExamples.map((example) => example.title).join(", ")}` : ""
  ].filter(Boolean);

  return {
    matchingExamples,
    preferredPatterns,
    avoidedPatterns,
    nicheTags,
    pricingBands,
    premiumSignals,
    sellabilitySignals,
    approvedReferenceTitles: approvedExamples.map((example) => example.title),
    rejectedReferenceTitles: rejectedExamples.map((example) => example.title),
    signalSummary: signalSummary.length > 0 ? signalSummary : ["No saved market research signals yet."]
  };
}

export function getRecommendedStylePatterns(currentExamples: ResearchExample[] = researchExamplesContext, input?: MarketSignalInput) {
  return deriveMarketSignals(currentExamples, input).preferredPatterns;
}
