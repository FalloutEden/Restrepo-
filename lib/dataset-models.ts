import type { CommerceChannel } from "@/lib/market-intelligence";

export type DatasetKey = string;

export type DatasetKind =
  | "market_evidence"
  | "job_vocabulary"
  | "quality_guidance"
  | "agent_guidance";

export type AutomationStage = "research" | "validate" | "design" | "list";

export type DatasetPreviewItem = {
  title: string;
  channel: CommerceChannel;
  niche: string;
  note: string;
};

export type DatasetLoadSummary = {
  key: DatasetKey;
  path: string;
  loaded: boolean;
  exampleCount: number;
  estimatedTokens: number;
  error?: string;
};

export type DatasetCatalogueEntry = DatasetLoadSummary & {
  title: string;
  description: string;
  emphasis: string;
  kind: DatasetKind;
  tags: string[];
  workflowHints: string[];
  channelCoverage: CommerceChannel[];
  previewItems: DatasetPreviewItem[];
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  outcome: string;
  defaultChannel: CommerceChannel;
  stages: AutomationStage[];
  goal: string;
  constraints: string;
  recommendedDatasetTags: string[];
  heroMetric: string;
};

export type WorkflowRunLog = {
  id: string;
  stage: AutomationStage | "system" | "agent";
  level: "info" | "success" | "warning" | "error";
  timestamp: string;
  message: string;
  action?: string;
};

export type WorkflowRunMetrics = {
  accuracyProxy: number;
  revenueEstimateLow: number;
  revenueEstimateHigh: number;
  conversionReadiness: number;
  averageConfidence: number;
  datasetCoverage: number;
  builtDraftCount: number;
  approvalReadyCount: number;
  tokenLoad: number;
  batchCount: number;
  throttledCallCount: number;
  failedAgentCount: number;
};

export type RuntimeDependencyCheck = {
  envVar: string;
  label: string;
  present: boolean;
  severity: "fatal" | "warning";
  message: string;
};

export type RuntimeStartupReport = {
  ready: boolean;
  fatal: boolean;
  expectedAgentCount: number;
  configuredAgentCount: number;
  checks: RuntimeDependencyCheck[];
  errors: string[];
  warnings: string[];
};
