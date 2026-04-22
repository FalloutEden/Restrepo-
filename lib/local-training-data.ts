import "server-only";

import { readFile } from "node:fs/promises";
import type { DatasetCatalogueEntry, DatasetKey, DatasetKind, DatasetLoadSummary } from "@/lib/dataset-models";
import type { CommerceChannel, ResearchExample } from "@/lib/market-intelligence";
import { estimateResearchExampleTokens, estimateTokenCount } from "@/lib/token-batching";

type ShopifyDatasetEntry = {
  category: string;
  description: string;
  source?: string;
};

type PrintOnDemandItem = {
  name: string;
  description: string;
  source?: string;
};

type PrintOnDemandDatasetEntry = {
  category: string;
  description?: string;
  items?: PrintOnDemandItem[];
  source?: string;
};

type FiverrDatasetEntry = {
  gig: string;
  description: string;
  source?: string;
};

type JobTitleDataset = {
  jobs: string[];
};

type QualityDatasetEntry = {
  dataset_name: string;
  domain: string;
  description: string;
  potential_use: string;
};

type RelevantDatasetEntry = {
  name: string;
  description: string;
  purpose: string;
  citation?: string;
};

type DatasetDefinition = {
  key: DatasetKey;
  path: string;
  title: string;
  kind: DatasetKind;
  description: string;
  emphasis: string;
  tags: string[];
  workflowHints: string[];
  parse: (parsed: unknown) => ResearchExample[];
};

export type LocalTrainingData = {
  examples: ResearchExample[];
  files: DatasetLoadSummary[];
  datasets: DatasetCatalogueEntry[];
  selectedDatasetInputs: Array<{
    key: DatasetKey;
    title: string;
    estimatedTokens: number;
    examples: ResearchExample[];
  }>;
};

type LoadLocalTrainingDataOptions = {
  selectedDatasetKeys?: DatasetKey[];
};

const DATASET_DEFINITIONS: DatasetDefinition[] = [
  {
    key: "shopify_high_selling",
    path: "c:\\Users\\karli\\Downloads\\shopify_high_selling.json",
    title: "Shopify High Selling Catalogue",
    kind: "market_evidence",
    description: "Commerce evidence focused on high-selling Shopify-style categories and commercial signals.",
    emphasis: "Use for profitable category detection, price framing, and buyer-usefulness cues.",
    tags: ["shopify", "e-commerce", "high selling", "products", "market evidence"],
    workflowHints: ["Mixed Revenue Sprint", "Validate And List Products"],
    parse: (parsed) => normalizeShopifyEntries(parsed as ShopifyDatasetEntry[])
  },
  {
    key: "print_on_demand",
    path: "c:\\Users\\karli\\Downloads\\print_on_demand.json",
    title: "Print On Demand Opportunity Set",
    kind: "market_evidence",
    description: "Validated print-on-demand and printable concepts with category-specific descriptions.",
    emphasis: "Use for design trend detection, printable formats, and thumbnail-friendly direction.",
    tags: ["print on demand", "etsy", "design", "printables", "market evidence"],
    workflowHints: ["Generate Trending Designs", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizePrintOnDemandEntries(parsed as PrintOnDemandDatasetEntry[])
  },
  {
    key: "fiverr_ai_jobs",
    path: "c:\\Users\\karli\\Downloads\\fiverr_ai_jobs.json",
    title: "Fiverr AI Job Signals",
    kind: "market_evidence",
    description: "Service-market evidence centered on Fiverr-style AI gigs and deliverable patterns.",
    emphasis: "Use for gig packaging, buyer-language, and service deliverable design.",
    tags: ["fiverr", "gigs", "services", "ai jobs", "market evidence"],
    workflowHints: ["Find High-Demand Gigs", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizeFiverrEntries(parsed as FiverrDatasetEntry[])
  },
  {
    key: "jobs_dataset_2000",
    path: "c:\\Users\\karli\\Downloads\\jobs_dataset_2000.json",
    title: "Job Vocabulary Dataset 2000",
    kind: "job_vocabulary",
    description: "Broad role vocabulary for niche discovery and service naming.",
    emphasis: "Use lightly to expand target-buyer language and service positioning.",
    tags: ["jobs", "vocabulary", "roles", "niches", "services"],
    workflowHints: ["Find High-Demand Gigs", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizeJobTitleEntries(parsed as JobTitleDataset, "jobs_dataset_2000.json")
  },
  {
    key: "jobs_dataset_1000_1",
    path: "c:\\Users\\karli\\Downloads\\jobs_dataset_1000 (1).json",
    title: "Job Vocabulary Dataset 1000",
    kind: "job_vocabulary",
    description: "Additional role vocabulary for target-buyer expansion and adjacent service discovery.",
    emphasis: "Use lightly to avoid overpowering stronger market-evidence datasets.",
    tags: ["jobs", "vocabulary", "roles", "buyers", "services"],
    workflowHints: ["Find High-Demand Gigs", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizeJobTitleEntries(parsed as JobTitleDataset, "jobs_dataset_1000 (1).json")
  },
  {
    key: "jobs_dataset_remaining",
    path: "c:\\Users\\karli\\Downloads\\jobs_dataset_remaining.json",
    title: "Job Vocabulary Dataset Remaining",
    kind: "job_vocabulary",
    description: "Remaining long-tail role titles used to broaden exploration and niche coverage.",
    emphasis: "Use for edge-case niche discovery and alternate service naming.",
    tags: ["jobs", "long tail", "niches", "services", "buyers"],
    workflowHints: ["Find High-Demand Gigs", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizeJobTitleEntries(parsed as JobTitleDataset, "jobs_dataset_remaining.json")
  },
  {
    key: "quality_datasets_1",
    path: "c:\\Users\\karli\\Downloads\\quality_datasets (1).json",
    title: "Quality Dataset Guidance",
    kind: "quality_guidance",
    description: "Research-quality guidance about useful commerce, search, sentiment, and freelance datasets.",
    emphasis: "Use as evidence-source guidance rather than direct sell-through proof.",
    tags: ["quality", "research", "datasets", "guidance", "signals"],
    workflowHints: ["Validate And List Products", "Mixed Revenue Sprint"],
    parse: (parsed) => normalizeQualityDatasetEntries(parsed as QualityDatasetEntry[])
  },
  {
    key: "relevant_datasets",
    path: "c:\\Users\\karli\\Downloads\\relevant_datasets.json",
    title: "Relevant Agent Dataset Library",
    kind: "agent_guidance",
    description: "Agent-training and instruction dataset summaries covering retrieval, planning, instruction tuning, and multimodal systems.",
    emphasis: "Use as metadata for agent-behavior planning, workflow design, and dataset relevance.",
    tags: ["agents", "instruction corpora", "retrieval", "planning", "research guidance"],
    workflowHints: ["Mixed Revenue Sprint", "Validate And List Products"],
    parse: (parsed) => normalizeRelevantDatasetEntries(parsed as RelevantDatasetEntry[])
  }
] as const;

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanTrainingText(value: string) {
  return value
    .replace(/ã€[^ã€‘]*ã€‘/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function inferFormatFromText(text: string) {
  const source = text.toLowerCase();

  if (/service|automation|script|consult|chatbot|agent/.test(source)) {
    return "service";
  }

  if (/spreadsheet|dashboard|tracker|excel|google sheets/.test(source)) {
    return "spreadsheet";
  }

  if (/shirt|hoodie|poster|wall art|mug|tote|case|drinkware/.test(source)) {
    return "print_on_demand";
  }

  if (/content|copy|prompt|video|youtube|social/.test(source)) {
    return "content pack";
  }

  return "printable";
}

function inferDeliverableType(channel: CommerceChannel, text: string, format: string) {
  const source = text.toLowerCase();

  if (channel === "fiverr" || format === "service" || /service|automation|script|consult|chatbot|agent/.test(source)) {
    return "service package";
  }

  if (channel === "print_on_demand" || /shirt|hoodie|poster|wall art|mug|tote|case|drinkware/.test(source)) {
    return "print-on-demand asset";
  }

  if (/spreadsheet|dashboard|tracker|excel|google sheets/.test(source) || format === "spreadsheet") {
    return "editable workbook";
  }

  if (/content|copy|prompt|video|youtube|social/.test(source)) {
    return "content product";
  }

  return "digital download";
}

function inferTargetBuyer(channel: CommerceChannel, title: string, description: string) {
  const source = `${title} ${description}`.toLowerCase();

  if (channel === "fiverr") {
    if (/youtube|video/.test(source)) {
      return "brands and creators that need done-for-you video production support";
    }

    if (/automation|chatbot|agent/.test(source)) {
      return "businesses that need AI-powered workflow or customer support systems";
    }

    if (/content|copy|prompt/.test(source)) {
      return "teams that need faster AI-assisted content and messaging";
    }

    return "clients that need a clear done-for-you AI service";
  }

  if (/pet/.test(source)) {
    return "pet owners looking for niche-specific offers";
  }

  if (/fitness|sport|yoga/.test(source)) {
    return "health-conscious buyers seeking practical lifestyle products";
  }

  if (/planner|calendar|worksheet|goals|overview/.test(source)) {
    return "buyers who want simple organizational tools they can use right away";
  }

  return "buyers looking for proven, high-interest commerce offers";
}

function inferChannelFromJobTitle(title: string): CommerceChannel {
  const source = title.toLowerCase();

  if (/writer|copywriter|editor|script|content|seo|social media|video/.test(source)) {
    return "content";
  }

  if (
    /designer|artist|animator|modeler|illustrator|developer|consultant|coach|analyst|strategist|marketer|assistant|manager|operator|specialist/.test(
      source
    )
  ) {
    return "fiverr";
  }

  return "other";
}

function buildResearchExample(
  channel: CommerceChannel,
  title: string,
  niche: string,
  description: string,
  notes: string,
  status: ResearchExample["status"] = "approved"
): ResearchExample {
  const cleanedTitle = cleanTrainingText(title);
  const cleanedDescription = cleanTrainingText(description);
  const cleanedNotes = cleanTrainingText(notes);
  const productFormat = inferFormatFromText(`${cleanedTitle} ${cleanedDescription}`);

  return {
    id: createId("training"),
    title: cleanedTitle,
    url: "",
    screenshotDataUrl: "",
    channel,
    niche: cleanTrainingText(niche),
    productFormat,
    targetBuyer: inferTargetBuyer(channel, cleanedTitle, cleanedDescription),
    deliverableType: inferDeliverableType(channel, cleanedDescription, productFormat),
    whatLooksGood: `High-signal category from local training data: ${cleanedTitle}.`,
    sellabilityNotes: cleanedDescription,
    visualStyleNotes:
      channel === "fiverr"
        ? "Prioritize clear package differentiation, professional hierarchy, and strong buyer-outcome framing."
        : channel === "print_on_demand"
          ? "Favor strong thumbnail readability, niche-specific visuals, and commercial clarity."
          : "Favor premium clarity, clean hierarchy, and strong buyer-usefulness cues.",
    styleComments:
      channel === "fiverr"
        ? "Use service-oriented presentation rather than product-only merchandising."
        : "Use this as commercial training input for product positioning and format selection.",
    notes: cleanedNotes,
    status,
    createdAt: new Date().toISOString()
  };
}

function normalizeShopifyEntries(entries: ShopifyDatasetEntry[]) {
  return entries.map((entry) =>
    buildResearchExample(
      "other",
      entry.category,
      entry.category,
      entry.description,
      `Imported from local training file: shopify_high_selling.json. ${entry.source ?? ""}`
    )
  );
}

function inferPrintOnDemandChannel(title: string, description: string): CommerceChannel {
  const source = `${title} ${description}`.toLowerCase();

  if (/planner|calendar|worksheet|goals|overview|snapshot|memo/.test(source)) {
    return "etsy";
  }

  return "print_on_demand";
}

function normalizePrintOnDemandEntries(entries: PrintOnDemandDatasetEntry[]) {
  return entries.flatMap((entry) => {
    if (entry.items?.length) {
      return entry.items.map((item) =>
        buildResearchExample(
          inferPrintOnDemandChannel(item.name, item.description),
          item.name,
          entry.category,
          item.description,
          `Imported from local training file: print_on_demand.json. Parent category: ${entry.category}. ${item.source ?? entry.source ?? ""}`
        )
      );
    }

    return [
      buildResearchExample(
        inferPrintOnDemandChannel(entry.category, entry.description ?? ""),
        entry.category,
        entry.category,
        entry.description ?? "",
        `Imported from local training file: print_on_demand.json. ${entry.source ?? ""}`
      )
    ];
  });
}

function normalizeFiverrEntries(entries: FiverrDatasetEntry[]) {
  return entries.map((entry) =>
    buildResearchExample(
      "fiverr",
      entry.gig,
      entry.gig,
      entry.description,
      `Imported from local training file: fiverr_ai_jobs.json. ${entry.source ?? ""}`
    )
  );
}

function buildJobDatasetDescription(title: string) {
  const source = title.toLowerCase();

  if (/writer|copywriter|editor|script|content|seo|social media|video/.test(source)) {
    return "Role-based demand vocabulary for content and creative services. Useful for target buyer, niche, and offer naming research.";
  }

  if (/developer|consultant|analyst|manager|assistant|strategist|specialist/.test(source)) {
    return "Role-based demand vocabulary for productized digital services and operational offers. Useful for service positioning and buyer-language research.";
  }

  if (/teacher|tutor|coach|professor|counselor/.test(source)) {
    return "Role-based demand vocabulary for educational niches. Useful for course, worksheet, planner, and support-offer research.";
  }

  return "Broad role vocabulary for niche discovery and service-language expansion. Use as directional training input rather than proof of sell-through.";
}

function normalizeJobTitleEntries(dataset: JobTitleDataset, sourceFile: string) {
  return dataset.jobs.map((job) =>
    buildResearchExample(
      inferChannelFromJobTitle(job),
      job,
      job,
      buildJobDatasetDescription(job),
      `Imported from local training file: ${sourceFile}. Treat this as role and niche vocabulary training input, not as direct revenue proof.`,
      "review"
    )
  );
}

function inferChannelFromQualityDomain(domain: string, description: string, potentialUse: string): CommerceChannel {
  const source = `${domain} ${description} ${potentialUse}`.toLowerCase();

  if (/freelancing|gig economy|freelancer|upwork|peopleperhour|guru/.test(source)) {
    return "fiverr";
  }

  if (/social media|pins|pinterest|content|sentiment|search relevance|search ranking/.test(source)) {
    return "content";
  }

  return "other";
}

function normalizeQualityDatasetEntries(entries: QualityDatasetEntry[]) {
  return entries.map((entry) =>
    buildResearchExample(
      inferChannelFromQualityDomain(entry.domain, entry.description, entry.potential_use),
      entry.dataset_name,
      entry.domain,
      `${entry.description} Potential use: ${entry.potential_use}`,
      "Imported from local training file: quality_datasets (1).json. Treat this as research-quality guidance and signal-source metadata, not direct sell-through proof.",
      "review"
    )
  );
}

function inferChannelFromRelevantDataset(entry: RelevantDatasetEntry): CommerceChannel {
  const source = `${entry.name} ${entry.description} ${entry.purpose}`.toLowerCase();

  if (/webshop|e-commerce|purchasing decisions|product research/.test(source)) {
    return "other";
  }

  if (/webgpt|search|retrieval|question answering|instruction|language model|knowledge retrieval/.test(source)) {
    return "content";
  }

  if (/autonomous agent|planning|decision-making|interactive agents|user behaviour/.test(source)) {
    return "fiverr";
  }

  return "other";
}

function normalizeRelevantDatasetEntries(entries: RelevantDatasetEntry[]) {
  return entries.map((entry) =>
    buildResearchExample(
      inferChannelFromRelevantDataset(entry),
      entry.name,
      "agent research datasets",
      `${entry.description} Purpose: ${entry.purpose}`,
      `Imported from local training file: relevant_datasets.json. Treat this as agent-training dataset guidance and source metadata, not direct commercial sell-through proof. ${entry.citation ?? ""}`,
      "review"
    )
  );
}

function dedupeExamples(examples: ResearchExample[]) {
  const seen = new Set<string>();

  return examples.filter((example) => {
    const key = `${example.channel}|${example.title.toLowerCase()}|${example.niche.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildDatasetCatalogueEntry(definition: DatasetDefinition, examples: ResearchExample[], error?: string): DatasetCatalogueEntry {
  const estimatedTokens = examples.reduce((sum, example) => sum + estimateResearchExampleTokens(example), 0);

  return {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    emphasis: definition.emphasis,
    kind: definition.kind,
    tags: definition.tags,
    workflowHints: definition.workflowHints,
    path: definition.path,
    loaded: !error,
    exampleCount: examples.length,
    estimatedTokens,
    error,
    channelCoverage: uniq(examples.map((example) => example.channel)),
    previewItems: examples.slice(0, 4).map((example) => ({
      title: example.title,
      channel: example.channel,
      niche: example.niche,
      note: example.sellabilityNotes || example.notes || example.whatLooksGood
    }))
  };
}

export async function loadLocalTrainingData(options?: LoadLocalTrainingDataOptions): Promise<LocalTrainingData> {
  const selectedKeys = options?.selectedDatasetKeys?.length ? new Set(options.selectedDatasetKeys) : null;
  const datasets: DatasetCatalogueEntry[] = [];
  const datasetExamples = new Map<DatasetKey, ResearchExample[]>();

  for (const definition of DATASET_DEFINITIONS) {
    try {
      const raw = await readFile(definition.path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const examples = dedupeExamples(definition.parse(parsed));
      datasetExamples.set(definition.key, examples);
      const datasetEntry = buildDatasetCatalogueEntry(definition, examples);
      datasets.push({
        ...datasetEntry,
        estimatedTokens: Math.max(datasetEntry.estimatedTokens, estimateTokenCount(raw))
      });
    } catch (error) {
      datasetExamples.set(definition.key, []);
      datasets.push(
        buildDatasetCatalogueEntry(
          definition,
          [],
          error instanceof Error ? error.message : "Unknown read error"
        )
      );
    }
  }

  const selectedDatasets = selectedKeys
    ? datasets.filter((dataset) => dataset.loaded && selectedKeys.has(dataset.key))
    : datasets.filter((dataset) => dataset.loaded);

  return {
    examples: dedupeExamples(selectedDatasets.flatMap((dataset) => datasetExamples.get(dataset.key) ?? [])),
    files: datasets.map<DatasetLoadSummary>(({ key, path, loaded, exampleCount, error }) => ({
      key,
      path,
      loaded,
      exampleCount,
      estimatedTokens: datasets.find((dataset) => dataset.key === key)?.estimatedTokens ?? 0,
      error
    })),
    datasets,
    selectedDatasetInputs: selectedDatasets.map((dataset) => ({
      key: dataset.key,
      title: dataset.title,
      estimatedTokens: dataset.estimatedTokens,
      examples: datasetExamples.get(dataset.key) ?? []
    }))
  };
}
