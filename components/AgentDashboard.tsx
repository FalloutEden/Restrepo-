"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AgentCard } from "@/components/AgentCard";
import { AgentDetailModal } from "@/components/AgentDetailModal";
import { AgentHabitat } from "@/components/AgentHabitat";
import { AutonomousQueueBoard } from "@/components/AutonomousQueueBoard";
import { CerebroHeartbeat } from "@/components/CerebroHeartbeat";
import { DatasetCatalogue } from "@/components/DatasetCatalogue";
import { MorningReportView } from "@/components/MorningReportView";
import { MissionStatusBoard } from "@/components/MissionStatusBoard";
import { PublishQueueView } from "@/components/PublishQueueView";
import type { AgentRunTrace } from "@/lib/agent-runtime";
import type {
  AutomationStage,
  DatasetCatalogueEntry,
  DatasetKind,
  RuntimeStartupReport,
  WorkflowRunLog,
  WorkflowRunMetrics
} from "@/lib/dataset-models";
import { AUTONOMOUS_BUILD_THRESHOLD, createQueueJob, type OpportunityQueueJob } from "@/lib/autonomous-research";
import {
  setResearchExamplesContext,
  type CommerceChannel,
  type ResearchExample
} from "@/lib/market-intelligence";
import {
  recordProductTrainingFeedback,
  recordStyleFeedback,
  setProductFeedbackContext,
  setStyleFeedbackContext,
  type ProductFeedbackRating,
  type ProductTrainingFeedback,
  type StyleFeedbackMap
} from "@/lib/style-intelligence";
import { WORKFLOW_TEMPLATES, cloneWorkflowStages, getWorkflowTemplateById } from "@/lib/workflow-templates";
import type { Agent } from "@/lib/mock-agents";
import { DEFAULT_MAX_TOKENS_PER_MINUTE } from "@/lib/token-batching";
import {
  buildMissionRecord,
  createMissionDraft,
  createMissionTasks,
  createPublishQueueItem,
  hydrateAgentsForMission,
  type ExecutionMode,
  type MissionPriority,
  type MissionRecord,
  type MissionTask,
  type RunnerState
} from "@/lib/missions";

type AgentDashboardProps = {
  agents: Agent[];
  // When false (customer surface), the Data Catalogue tab and the
  // founder-internal Settings sections are hidden. Defaults to true so
  // existing /pipeline (admin-only) renders unchanged.
  isAdmin?: boolean;
};

type DashboardTab =
  | "overview"
  | "catalogue"
  | "approval"
  | "agents"
  | "settings";

type AutonomousRunResponse = {
  runtime: {
    researchSummary: string;
    sourceSignalSummary: string[];
    agentRuns: AgentRunTrace[];
  };
  workflow: {
    templateId: string | null;
    chain: AutomationStage[];
    runLabel: string;
    selectedDatasetKeys: string[];
    selectedDatasetTitles: string[];
    maxTokensPerMinute: number;
  };
  batching?: {
    maxTokensPerMinute: number;
    selectedTokenLoad: number;
    batchCount: number;
    selectedDatasetKeys: string[];
    selectedDatasetTitles: string[];
  };
  logs: WorkflowRunLog[];
  metrics: WorkflowRunMetrics;
  queues: {
    researchQueue: OpportunityQueueJob[];
    shortlistQueue: OpportunityQueueJob[];
    draftBuildQueue: OpportunityQueueJob[];
    approvalQueue: OpportunityQueueJob[];
    rejectedSimilar: OpportunityQueueJob[];
  };
  confidenceThreshold: number;
  trainingData?: {
    fileCount: number;
    loadedFileCount: number;
    exampleCount: number;
    files: Array<{
      key: string;
      path: string;
      loaded: boolean;
      exampleCount: number;
      estimatedTokens: number;
      error?: string;
    }>;
    datasets: DatasetCatalogueEntry[];
  };
  trainingExamples?: ResearchExample[];
  startupCheck?: RuntimeStartupReport;
  error?: string;
  action?: string;
};

type DatasetCatalogueResponse = {
  datasets: DatasetCatalogueEntry[];
  summary: {
    fileCount: number;
    loadedFileCount: number;
    exampleCount: number;
  };
  startupCheck?: RuntimeStartupReport;
  maxTokensPerMinute?: number;
  error?: string;
};

const DEFAULT_TEMPLATE_ID = "mixed-revenue-sprint";
const DEFAULT_GOAL = "Research and create jobs across all supported channels for sellable products or services.";
const DEFAULT_CONSTRAINTS = [
  "Never publish automatically.",
  "Keep printable image generation, spreadsheet generation, listing generation, the feedback loop, and approval review intact.",
  "Automatically build only high-confidence drafts.",
  "Hold every outbound action for manual approval."
].join("\n");

function timestampLabel(date: Date) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildNavigationTabs(isAdmin: boolean): Array<{ id: DashboardTab; label: string }> {
  // Data Catalogue is admin-only — exposes raw token batches, dataset
  // selection, and runtime internals that read as "infrastructure
  // noise" to a paying merchant. Customers see Overview / Approval /
  // Agents / Settings only.
  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "approval", label: "Approval" },
    { id: "agents", label: "Agents" },
    { id: "settings", label: "Settings" }
  ];
  if (isAdmin) {
    tabs.splice(1, 0, { id: "catalogue", label: "Data Catalogue" });
  }
  return tabs;
}

function completeMissionTasks(tasks: MissionTask[]) {
  return tasks.map((task, index) => {
    const startedAt = timestampLabel(new Date(Date.now() + index * 1000));
    const completedAt = timestampLabel(new Date(Date.now() + (index + 1) * 1000));

    return {
      ...task,
      status: "Completed" as const,
      startedAt,
      completedAt,
      outputSummary: task.plannedOutputSummary
    };
  });
}

function buildAutonomousGoal(job: OpportunityQueueJob, originalGoal: string) {
  return [
    `Output type: ${job.outputKind ?? "product"}.`,
    job.buildGoal || `Build a sellable ${job.channel} ${job.productServiceType} for the ${job.niche} niche.`,
    `Target buyer: ${job.targetBuyer}.`,
    `Deliverable type: ${job.deliverableType}.`,
    `Style direction: ${job.styleDirection}.`,
    job.styleWhy ? `Why this style: ${job.styleWhy}.` : "",
    `Why selected: ${job.whySelected}.`,
    `Why it may sell: ${job.whyItMaySell}.`,
    `Source signals: ${job.sourceSignals.join(" | ")}.`,
    `Original autonomous command: ${originalGoal}`
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAutonomousConstraints(baseConstraints: string, job: OpportunityQueueJob) {
  return [
    baseConstraints,
    job.buildConstraints || "",
    job.designNotes?.length ? `Design notes: ${job.designNotes.join(" | ")}` : "",
    job.approvalNotes?.length ? `Approval notes: ${job.approvalNotes.join(" | ")}` : "",
    "Do not publish automatically."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDraftRecord(
  job: OpportunityQueueJob,
  originalGoal: string,
  baseConstraints: string,
  priority: MissionPriority,
  executionMode: ExecutionMode,
  agents: Agent[]
) {
  const mission = {
    ...createMissionDraft(
      buildAutonomousGoal(job, originalGoal),
      buildAutonomousConstraints(baseConstraints, job),
      priority,
      executionMode,
      job.channel
    ),
    status: "Completed" as const,
    startedAt: timestampLabel(new Date()),
    completedAt: timestampLabel(new Date(Date.now() + 4000)),
    summary: `Autonomous draft build completed for ${job.title}.`,
    recommendedNextAction: "Review the built draft, confirm the opportunity rationale, and approve manually if it looks strong."
  };
  const tasks = completeMissionTasks(createMissionTasks(mission));
  const record = buildMissionRecord(mission, tasks, agents, tasks.flatMap((task) => task.artifacts));

  return {
    job,
    record: {
      ...record,
      report: {
        ...record.report,
        confidenceScore: job.confidenceScore,
        executiveSummary: `${record.report.executiveSummary} OpenAI agent orchestration selected this opportunity at ${job.confidenceScore}% confidence.`,
        recommendations: [
          ...record.report.recommendations,
          `Opportunity rationale: ${job.whySelected}`,
          `Source signals: ${job.sourceSignals.join(" | ")}`
        ]
      }
    }
  };
}

function buildAgentRoleCopy(agentRuns: AgentRunTrace[]) {
  return agentRuns.map((run) => `${run.name}: ${run.summary}`);
}

function incrementUsageMap(current: Record<string, number>, keys: string[]) {
  const next = { ...current };
  keys.forEach((key) => {
    next[key] = (next[key] ?? 0) + 1;
  });
  return next;
}

function toAgentStatus(status: AgentRunTrace["status"]): Agent["status"] {
  switch (status) {
    case "running":
      return "Running";
    case "retrying":
      return "Retrying";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

function normalizeRoleLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

function matchTraceToAgent(agent: Agent, traces: AgentRunTrace[]) {
  const agentRole = normalizeRoleLabel(agent.role);
  return traces.find((trace) => {
    const traceName = normalizeRoleLabel(trace.name);
    const traceResponsibility = normalizeRoleLabel(trace.responsibility);
    return agentRole.includes(traceName) || traceName.includes(agentRole) || traceResponsibility.includes(agentRole);
  });
}

function compareByUsage<T extends { key?: string; id?: string; loaded?: boolean }>(
  left: T,
  right: T,
  usageMap: Record<string, number>
) {
  const leftKey = left.key ?? left.id ?? "";
  const rightKey = right.key ?? right.id ?? "";
  const usageDelta = (usageMap[rightKey] ?? 0) - (usageMap[leftKey] ?? 0);
  if (usageDelta !== 0) {
    return usageDelta;
  }

  if ((left.loaded ?? true) !== (right.loaded ?? true)) {
    return left.loaded ? -1 : 1;
  }

  return leftKey.localeCompare(rightKey);
}

function buildExportPayload(payload: object, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function AgentDashboard({ agents, isAdmin = true }: AgentDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("agents");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(DEFAULT_TEMPLATE_ID);
  const [workflowStages, setWorkflowStages] = useState<AutomationStage[]>(() =>
    cloneWorkflowStages(getWorkflowTemplateById(DEFAULT_TEMPLATE_ID)?.stages ?? ["research", "validate", "design", "list"])
  );
  const [missionGoal, setMissionGoal] = useState(getWorkflowTemplateById(DEFAULT_TEMPLATE_ID)?.goal ?? DEFAULT_GOAL);
  const [missionConstraints, setMissionConstraints] = useState(
    getWorkflowTemplateById(DEFAULT_TEMPLATE_ID)?.constraints ?? DEFAULT_CONSTRAINTS
  );
  const [selectedChannel, setSelectedChannel] = useState<CommerceChannel>(
    getWorkflowTemplateById(DEFAULT_TEMPLATE_ID)?.defaultChannel ?? "all"
  );
  const [missionPriority, setMissionPriority] = useState<MissionPriority>("High");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("local");
  const [outboundApproved, setOutboundApproved] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [researchSummary, setResearchSummary] = useState("");
  const [sourceSignalSummary, setSourceSignalSummary] = useState<string[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunTrace[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(AUTONOMOUS_BUILD_THRESHOLD);
  const [runnerState, setRunnerState] = useState<RunnerState>({
    activeMission: null,
    tasks: [],
    artifacts: [],
    report: null,
    archive: [],
    publishQueue: []
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedReviewMissionId, setSelectedReviewMissionId] = useState<string | null>(null);
  const [styleFeedback, setStyleFeedback] = useState<StyleFeedbackMap>({});
  const [productFeedback, setProductFeedback] = useState<ProductTrainingFeedback[]>([]);
  const [researchExamples, setResearchExamples] = useState<ResearchExample[]>([]);
  const [trainingExamples, setTrainingExamples] = useState<ResearchExample[]>([]);
  const [researchQueue, setResearchQueue] = useState<OpportunityQueueJob[]>([]);
  const [shortlistQueue, setShortlistQueue] = useState<OpportunityQueueJob[]>([]);
  const [buildQueue, setBuildQueue] = useState<OpportunityQueueJob[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<OpportunityQueueJob[]>([]);
  const [rejectedSimilar, setRejectedSimilar] = useState<OpportunityQueueJob[]>([]);
  const [datasetCatalogue, setDatasetCatalogue] = useState<DatasetCatalogueEntry[]>([]);
  const [selectedDatasetKeys, setSelectedDatasetKeys] = useState<string[]>([]);
  const [datasetSearch, setDatasetSearch] = useState("");
  const [datasetKindFilter, setDatasetKindFilter] = useState<DatasetKind | "all">("all");
  const [datasetChannelFilter, setDatasetChannelFilter] = useState<CommerceChannel | "all">("all");
  const [datasetCatalogueError, setDatasetCatalogueError] = useState("");
  const [datasetUsage, setDatasetUsage] = useState<Record<string, number>>({});
  const [workflowUsage, setWorkflowUsage] = useState<Record<string, number>>({});
  const [hasSavedDatasetSelection, setHasSavedDatasetSelection] = useState(false);
  const [trainingDataSummary, setTrainingDataSummary] = useState<AutonomousRunResponse["trainingData"] | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowRunLog[]>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowRunMetrics | null>(null);
  const [workflowRunLabel, setWorkflowRunLabel] = useState("Mixed Revenue Sprint");
  const [startupCheck, setStartupCheck] = useState<RuntimeStartupReport | null>(null);
  const [maxTokensPerMinute, setMaxTokensPerMinute] = useState(DEFAULT_MAX_TOKENS_PER_MINUTE);

  const liveAgents = useMemo(() => {
    const missionHydrated = hydrateAgentsForMission(agents, runnerState.tasks, runnerState.activeMission);

    return missionHydrated.map((agent) => {
      const trace = matchTraceToAgent(agent, agentRuns);
      if (!trace) {
        return agent;
      }

      return {
        ...agent,
        status: runtimeBusy && trace.status === "retrying" ? "Retrying" : toAgentStatus(trace.status),
        latestOutputPreview: trace.error ?? trace.summary,
        latestOutput: trace.error ?? `${trace.summary}${trace.retryCount > 0 ? ` Retried ${trace.retryCount} time${trace.retryCount === 1 ? "" : "s"}.` : ""}`,
        updatedAt: trace.status === "running" ? "just now" : `batch ${trace.batchIndex + 1}`,
        queueDepth: trace.itemCount
      };
    });
  }, [agentRuns, agents, runnerState.activeMission, runnerState.tasks, runtimeBusy]);

  const selectedWorkflow = getWorkflowTemplateById(selectedWorkflowId) ?? WORKFLOW_TEMPLATES[0];
  const selectedAgent = liveAgents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedReviewRecord = selectedReviewMissionId
    ? runnerState.archive.find((entry) => entry.mission.id === selectedReviewMissionId) ?? null
    : null;
  const currentMorningRecord: MissionRecord | null =
    selectedReviewRecord ??
    (runnerState.report && runnerState.activeMission
      ? {
          mission: runnerState.activeMission,
          tasks: runnerState.tasks,
          artifacts: runnerState.artifacts,
          report: runnerState.report
        }
      : null);

  const currentOpportunityJob = useMemo(() => {
    if (!currentMorningRecord) {
      return approvalQueue[0] ?? buildQueue[0] ?? shortlistQueue[0] ?? null;
    }

    return (
      approvalQueue.find((job) => job.missionId === currentMorningRecord.mission.id) ??
      buildQueue.find((job) => job.missionId === currentMorningRecord.mission.id) ??
      shortlistQueue[0] ??
      null
    );
  }, [approvalQueue, buildQueue, currentMorningRecord, shortlistQueue]);

  const queuedJobCount = researchQueue.length + shortlistQueue.length + buildQueue.length + approvalQueue.length;
  const currentMissionPublishStatus = currentMorningRecord
    ? runnerState.publishQueue.find((item) => item.missionId === currentMorningRecord.mission.id)?.status ?? null
    : null;

  const sortedTemplates = useMemo(
    () => [...WORKFLOW_TEMPLATES].sort((left, right) => compareByUsage(left, right, workflowUsage)),
    [workflowUsage]
  );

  const sortedCatalogue = useMemo(
    () => [...datasetCatalogue].sort((left, right) => compareByUsage(left, right, datasetUsage)),
    [datasetCatalogue, datasetUsage]
  );

  const visibleDatasets = useMemo(() => {
    const searchNeedle = datasetSearch.toLowerCase().trim();

    return sortedCatalogue.filter((dataset) => {
      if (datasetKindFilter !== "all" && dataset.kind !== datasetKindFilter) {
        return false;
      }

      if (datasetChannelFilter !== "all" && !dataset.channelCoverage.includes(datasetChannelFilter)) {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      const haystack = [
        dataset.title,
        dataset.description,
        dataset.emphasis,
        dataset.tags.join(" "),
        dataset.workflowHints.join(" "),
        dataset.channelCoverage.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchNeedle);
    });
  }, [datasetChannelFilter, datasetKindFilter, datasetSearch, sortedCatalogue]);

  const favoriteDatasets = useMemo(
    () => sortedCatalogue.filter((dataset) => (datasetUsage[dataset.key] ?? 0) > 0).slice(0, 4),
    [datasetUsage, sortedCatalogue]
  );
  const favoriteWorkflows = useMemo(
    () => sortedTemplates.filter((template) => (workflowUsage[template.id] ?? 0) > 0).slice(0, 3),
    [sortedTemplates, workflowUsage]
  );
  const selectedTokenLoad = useMemo(
    () =>
      selectedDatasetKeys.reduce((sum, key) => {
        const dataset = datasetCatalogue.find((entry) => entry.key === key);
        return sum + (dataset?.estimatedTokens ?? 0);
      }, 0),
    [datasetCatalogue, selectedDatasetKeys]
  );
  const estimatedBatchCount = useMemo(
    () => Math.max(1, Math.ceil(selectedTokenLoad / Math.max(1, maxTokensPerMinute))),
    [maxTokensPerMinute, selectedTokenLoad]
  );

  useEffect(() => {
    const savedStyleFeedback = window.localStorage.getItem("style-feedback-map");
    if (savedStyleFeedback) {
      try {
        const parsed = JSON.parse(savedStyleFeedback) as StyleFeedbackMap;
        setStyleFeedback(parsed);
        setStyleFeedbackContext(parsed);
      } catch {
        window.localStorage.removeItem("style-feedback-map");
      }
    }

    const savedProductFeedback = window.localStorage.getItem("product-training-feedback");
    if (savedProductFeedback) {
      try {
        const parsed = JSON.parse(savedProductFeedback) as ProductTrainingFeedback[];
        setProductFeedback(parsed);
        setProductFeedbackContext(parsed);
      } catch {
        window.localStorage.removeItem("product-training-feedback");
      }
    }

    const savedResearchExamples = window.localStorage.getItem("market-research-examples");
    if (savedResearchExamples) {
      try {
        const parsed = JSON.parse(savedResearchExamples) as ResearchExample[];
        setResearchExamples(parsed);
        setResearchExamplesContext(parsed);
      } catch {
        window.localStorage.removeItem("market-research-examples");
      }
    }

    // Migrate legacy "umbrella-mission-archive" key if present, then read
    // from the brand-neutral "operator-mission-archive" key. The old name
    // leaked Capcom IP into devtools; scrubbed 2026-05-14.
    const legacyArchive = window.localStorage.getItem("umbrella-mission-archive");
    if (legacyArchive) {
      try {
        window.localStorage.setItem("operator-mission-archive", legacyArchive);
      } catch {}
      window.localStorage.removeItem("umbrella-mission-archive");
    }
    const savedArchive = window.localStorage.getItem("operator-mission-archive");
    if (savedArchive) {
      try {
        const parsed = JSON.parse(savedArchive) as RunnerState["archive"];
        setRunnerState((current) => ({ ...current, archive: parsed }));
      } catch {
        window.localStorage.removeItem("operator-mission-archive");
      }
    }

    const savedPublishQueue = window.localStorage.getItem("publishQueue");
    if (savedPublishQueue) {
      try {
        setRunnerState((current) => ({ ...current, publishQueue: JSON.parse(savedPublishQueue) as RunnerState["publishQueue"] }));
      } catch {
        window.localStorage.removeItem("publishQueue");
      }
    }

    const queueLoaders: Array<[string, (value: OpportunityQueueJob[]) => void]> = [
      ["autonomous-research-queue", setResearchQueue],
      ["autonomous-shortlist-queue", setShortlistQueue],
      ["autonomous-build-queue", setBuildQueue],
      ["autonomous-approval-queue", setApprovalQueue],
      ["autonomous-rejected-similar", setRejectedSimilar]
    ];

    queueLoaders.forEach(([key, setter]) => {
      const stored = window.localStorage.getItem(key);
      if (!stored) {
        return;
      }

      try {
        setter(JSON.parse(stored) as OpportunityQueueJob[]);
      } catch {
        window.localStorage.removeItem(key);
      }
    });

    const savedAgentRuns = window.localStorage.getItem("autonomous-agent-runs");
    if (savedAgentRuns) {
      try {
        setAgentRuns(JSON.parse(savedAgentRuns) as AgentRunTrace[]);
      } catch {
        window.localStorage.removeItem("autonomous-agent-runs");
      }
    }

    const savedSummary = window.localStorage.getItem("autonomous-research-summary");
    if (savedSummary) {
      setResearchSummary(savedSummary);
    }

    const savedSignals = window.localStorage.getItem("autonomous-source-signal-summary");
    if (savedSignals) {
      try {
        setSourceSignalSummary(JSON.parse(savedSignals) as string[]);
      } catch {
        window.localStorage.removeItem("autonomous-source-signal-summary");
      }
    }

    const savedDatasetUsage = window.localStorage.getItem("dataset-usage-map");
    if (savedDatasetUsage) {
      try {
        setDatasetUsage(JSON.parse(savedDatasetUsage) as Record<string, number>);
      } catch {
        window.localStorage.removeItem("dataset-usage-map");
      }
    }

    const savedWorkflowUsage = window.localStorage.getItem("workflow-usage-map");
    if (savedWorkflowUsage) {
      try {
        setWorkflowUsage(JSON.parse(savedWorkflowUsage) as Record<string, number>);
      } catch {
        window.localStorage.removeItem("workflow-usage-map");
      }
    }

    const savedWorkflowStages = window.localStorage.getItem("workflow-stage-chain");
    if (savedWorkflowStages) {
      try {
        setWorkflowStages(JSON.parse(savedWorkflowStages) as AutomationStage[]);
      } catch {
        window.localStorage.removeItem("workflow-stage-chain");
      }
    }

    const savedWorkflowId = window.localStorage.getItem("selected-workflow-id");
    if (savedWorkflowId && getWorkflowTemplateById(savedWorkflowId)) {
      setSelectedWorkflowId(savedWorkflowId);
    }

    const savedSelectedDatasets = window.localStorage.getItem("selected-dataset-keys");
    if (savedSelectedDatasets) {
      setHasSavedDatasetSelection(true);
      try {
        setSelectedDatasetKeys(JSON.parse(savedSelectedDatasets) as string[]);
      } catch {
        setHasSavedDatasetSelection(false);
        window.localStorage.removeItem("selected-dataset-keys");
      }
    }

    const savedLogs = window.localStorage.getItem("workflow-run-logs");
    if (savedLogs) {
      try {
        setWorkflowLogs(JSON.parse(savedLogs) as WorkflowRunLog[]);
      } catch {
        window.localStorage.removeItem("workflow-run-logs");
      }
    }

    const savedMetrics = window.localStorage.getItem("workflow-run-metrics");
    if (savedMetrics) {
      try {
        setWorkflowMetrics(JSON.parse(savedMetrics) as WorkflowRunMetrics);
      } catch {
        window.localStorage.removeItem("workflow-run-metrics");
      }
    }

    const savedRunLabel = window.localStorage.getItem("workflow-run-label");
    if (savedRunLabel) {
      setWorkflowRunLabel(savedRunLabel);
    }
  }, []);

  useEffect(() => {
    const loadCatalogue = async () => {
      try {
        const response = await fetch("/api/dataset-catalogue", { method: "GET" });
        const payload = (await response.json()) as DatasetCatalogueResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load dataset catalogue.");
        }

        setDatasetCatalogue(payload.datasets);
        setStartupCheck(payload.startupCheck ?? null);
        setMaxTokensPerMinute(payload.maxTokensPerMinute ?? DEFAULT_MAX_TOKENS_PER_MINUTE);
        if (!hasSavedDatasetSelection && selectedDatasetKeys.length === 0) {
          setSelectedDatasetKeys(payload.datasets.filter((dataset) => dataset.loaded).map((dataset) => dataset.key));
        }
      } catch (error) {
        setDatasetCatalogueError(error instanceof Error ? error.message : "Unable to load dataset catalogue.");
      }
    };

    void loadCatalogue();
  }, [hasSavedDatasetSelection, selectedDatasetKeys.length]);

  useEffect(() => {
    window.localStorage.setItem("operator-mission-archive", JSON.stringify(runnerState.archive));
  }, [runnerState.archive]);

  useEffect(() => {
    window.localStorage.setItem("publishQueue", JSON.stringify(runnerState.publishQueue));
  }, [runnerState.publishQueue]);

  useEffect(() => {
    window.localStorage.setItem("style-feedback-map", JSON.stringify(styleFeedback));
    setStyleFeedbackContext(styleFeedback);
  }, [styleFeedback]);

  useEffect(() => {
    window.localStorage.setItem("product-training-feedback", JSON.stringify(productFeedback));
    setProductFeedbackContext(productFeedback);
  }, [productFeedback]);

  useEffect(() => {
    window.localStorage.setItem("market-research-examples", JSON.stringify(researchExamples));
    setResearchExamplesContext(
      [...researchExamples, ...trainingExamples].filter((example, index, array) => {
        const key = `${example.channel}|${example.title.toLowerCase()}|${example.niche.toLowerCase()}`;
        return index === array.findIndex((entry) => `${entry.channel}|${entry.title.toLowerCase()}|${entry.niche.toLowerCase()}` === key);
      })
    );
  }, [researchExamples, trainingExamples]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-research-queue", JSON.stringify(researchQueue));
  }, [researchQueue]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-shortlist-queue", JSON.stringify(shortlistQueue));
  }, [shortlistQueue]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-build-queue", JSON.stringify(buildQueue));
  }, [buildQueue]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-approval-queue", JSON.stringify(approvalQueue));
  }, [approvalQueue]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-rejected-similar", JSON.stringify(rejectedSimilar));
  }, [rejectedSimilar]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-agent-runs", JSON.stringify(agentRuns));
  }, [agentRuns]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-research-summary", researchSummary);
  }, [researchSummary]);

  useEffect(() => {
    window.localStorage.setItem("autonomous-source-signal-summary", JSON.stringify(sourceSignalSummary));
  }, [sourceSignalSummary]);

  useEffect(() => {
    window.localStorage.setItem("dataset-usage-map", JSON.stringify(datasetUsage));
  }, [datasetUsage]);

  useEffect(() => {
    window.localStorage.setItem("workflow-usage-map", JSON.stringify(workflowUsage));
  }, [workflowUsage]);

  useEffect(() => {
    window.localStorage.setItem("workflow-stage-chain", JSON.stringify(workflowStages));
  }, [workflowStages]);

  useEffect(() => {
    window.localStorage.setItem("selected-workflow-id", selectedWorkflowId);
  }, [selectedWorkflowId]);

  useEffect(() => {
    window.localStorage.setItem("selected-dataset-keys", JSON.stringify(selectedDatasetKeys));
  }, [selectedDatasetKeys]);

  useEffect(() => {
    window.localStorage.setItem("workflow-run-logs", JSON.stringify(workflowLogs));
  }, [workflowLogs]);

  useEffect(() => {
    if (workflowMetrics) {
      window.localStorage.setItem("workflow-run-metrics", JSON.stringify(workflowMetrics));
    }
  }, [workflowMetrics]);

  useEffect(() => {
    window.localStorage.setItem("workflow-run-label", workflowRunLabel);
  }, [workflowRunLabel]);

  const handleToggleDataset = (datasetKey: string) => {
    setSelectedDatasetKeys((current) =>
      current.includes(datasetKey) ? current.filter((key) => key !== datasetKey) : [...current, datasetKey]
    );
  };

  const handleSelectVisibleDatasets = () => {
    setSelectedDatasetKeys((current) =>
      Array.from(new Set([...current, ...visibleDatasets.filter((dataset) => dataset.loaded).map((dataset) => dataset.key)]))
    );
  };

  const handleClearSelectedDatasets = () => {
    setSelectedDatasetKeys([]);
  };

  // handleRunMission removed — the legacy /api/autonomous-run endpoint and its
  // batch-the-whole-dataset architecture are gone. Use the AgentHero launcher
  // (top of the page) which calls /api/autonomous-run/start and streams progress
  // via SSE.

  const handleSubmitProductFeedback = (record: MissionRecord, rating: ProductFeedbackRating, notes: string) => {
    const styleId = record.report.finalProduct.selectedStyleProfile.id;
    const nextProductFeedback = recordProductTrainingFeedback(productFeedback, {
      missionId: record.mission.id,
      styleId,
      styleName: record.report.finalProduct.selectedStyleProfile.name,
      productType: record.report.finalProduct.productType,
      rating,
      notes
    });
    setProductFeedback(nextProductFeedback);

    if (rating === "good") {
      setStyleFeedback((current) => recordStyleFeedback(current, styleId, "approved"));
    }

    if (rating === "bad") {
      setStyleFeedback((current) => recordStyleFeedback(current, styleId, "rejected"));
    }
  };

  const handleApproveProduct = (record: MissionRecord) => {
    setRunnerState((current) => {
      const existingItem = current.publishQueue.find((item) => item.missionId === record.mission.id);
      const nextQueue = existingItem
        ? current.publishQueue.map((item) => (item.missionId === record.mission.id ? { ...item, status: "approved" as const } : item))
        : [{ ...createPublishQueueItem(record), status: "approved" as const }, ...current.publishQueue];

      if (record.report.finalProduct.selectedStyleProfile.id) {
        setStyleFeedback((existing) => recordStyleFeedback(existing, record.report.finalProduct.selectedStyleProfile.id, "approved"));
      }

      return {
        ...current,
        publishQueue: nextQueue
      };
    });

    setApprovalQueue((current) =>
      current.map((job) =>
        job.missionId === record.mission.id
          ? {
              ...job,
              reviewStatus: "approved",
              nextAction: "Approved. Keep any outbound step manual and explicitly approved."
            }
          : job
      )
    );
  };

  const handleApproveForOutbound = () => {
    setRunnerState((current) => {
      if (!current.activeMission) {
        return current;
      }

      const approvedMission = {
        ...current.activeMission,
        approved: true,
        approvalStatus: "granted" as const
      };
      const updatedArchive = current.archive.map((entry) =>
        entry.mission.id === approvedMission.id
          ? {
              ...entry,
              mission: approvedMission
            }
          : entry
      );

      return {
        ...current,
        activeMission: approvedMission,
        archive: updatedArchive,
        report: current.report
      };
    });
  };

  const handlePublishQueueStatusChange = (id: number, status: "approved" | "rejected") => {
    const missionId = runnerState.publishQueue.find((item) => item.id === id)?.missionId;

    setRunnerState((current) => {
      const queueItem = current.publishQueue.find((item) => item.id === id);
      const nextQueue = current.publishQueue.map((item) => (item.id === id ? { ...item, status } : item));

      if (queueItem?.styleProfileId) {
        setStyleFeedback((existing) => recordStyleFeedback(existing, queueItem.styleProfileId, status));
      }

      return {
        ...current,
        publishQueue: nextQueue
      };
    });

    if (!missionId) {
      return;
    }

    setApprovalQueue((current) =>
      current.map((job) =>
        job.missionId === missionId
          ? {
              ...job,
              reviewStatus: status,
              nextAction:
                status === "approved"
                  ? "Approved. Keep future outbound steps manual."
                  : "Rejected. Send the notes back into research and strategy."
            }
          : job
      )
    );
  };

  const handleExportTestResults = () => {
    buildExportPayload(
      {
        workflow: {
          id: selectedWorkflowId,
          name: selectedWorkflow.name,
          stages: workflowStages,
          selectedDatasetKeys,
          tokenLoad: selectedTokenLoad,
          maxTokensPerMinute,
          estimatedBatchCount
        },
        metrics: workflowMetrics,
        logs: workflowLogs,
        queues: {
          researchQueue,
          shortlistQueue,
          buildQueue,
          approvalQueue,
          rejectedSimilar
        },
        runtime: {
          summary: researchSummary,
          sourceSignalSummary
        },
        startupCheck
      },
      `automation-run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
    );
  };

  const renderOverviewTab = () => (
    <>
      <section className="archive-shell">
        <div className="status-header">
          <div>
            <span className="eyebrow">Run Pipeline</span>
            <h2 className="section-title">Use the launcher at the top of the page</h2>
            <p className="detail-body">
              The legacy "Run Mission" workflow has been removed. Click <strong>Run Pipeline</strong> in the
              hero section above to fire the autonomous run. Real-time progress streams to the hero
              event log; finished drafts land in the Approval tab.
            </p>
          </div>
        </div>
      </section>

      {/*
        CEREBRO heartbeat — replaces the old "Automation Snapshot" block
        that exposed token batches, dataset selection, and ZENDROP-key
        startup warnings. Those were internal infrastructure noise and
        read as "rebranded LLM wrapper" to a paying merchant. The
        heartbeat surfaces real-time evidence the brain is being fed +
        service health, which is the premium-feel anchor.

        Founder-facing internals (token load, dataset coverage, runtime
        metrics) are still available below, collapsed by default. Phase
        4 of the UX overhaul will gate these behind isAdmin entirely.
      */}
      <CerebroHeartbeat />

      {isAdmin ? (
      <details className="archive-shell" style={{ marginTop: 16 }}>
        <summary
          style={{
            cursor: "pointer",
            listStyle: "none",
            padding: "12px 16px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(166, 120, 67, 0.15)",
            borderRadius: 8,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: "rgba(245, 241, 232, 0.6)",
            fontWeight: 600,
            textTransform: "uppercase"
          }}
        >
          ▸ Internal: dataset coverage + runtime metrics
        </summary>
        <div style={{ marginTop: 12 }}>
          {startupCheck?.errors.length ? (
            <div className="dataset-error-shell">
              <p className="detail-body">Fatal startup checks: {startupCheck.errors.join(" | ")}</p>
              <p className="detail-body">Action: Add the missing server keys or restore the full eight-agent runtime before running the workflow.</p>
            </div>
          ) : null}

          <div className="hero-stats dashboard-stats-wide">
            <div className="stat-card">
              <span className="stat-label">Selected Datasets</span>
              <span className="stat-value">{selectedDatasetKeys.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Token Load</span>
              <span className="stat-value">{Math.round(selectedTokenLoad / 1000)}k</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Queued Jobs</span>
              <span className="stat-value">{queuedJobCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Draft Builds</span>
              <span className="stat-value">{buildQueue.length}</span>
            </div>
          </div>

          <div className="report-section-grid">
            <section className="detail-card">
              <h3>Runtime Status</h3>
              <p className="detail-body">{runtimeStatus || "No workflow has run yet."}</p>
              {runtimeError ? <p className="detail-body">Issue: {runtimeError}</p> : null}
              <p className="detail-body">Workflow: {selectedWorkflow.name}</p>
              <p className="detail-body">Chain: {workflowStages.join(" -> ")}</p>
              <p className="detail-body">Confidence threshold: {confidenceThreshold}%</p>
              <p className="detail-body">
                Token load: {selectedTokenLoad.toLocaleString()} / {maxTokensPerMinute.toLocaleString()} across about {estimatedBatchCount} batch{estimatedBatchCount === 1 ? "" : "es"}
              </p>
            </section>
            <section className="detail-card">
              <h3>Personalized Highlights</h3>
              <p className="detail-body">
                Favorite datasets: {favoriteDatasets.length > 0 ? favoriteDatasets.map((dataset) => dataset.title).join(", ") : "No usage history yet."}
              </p>
              <p className="detail-body">
                Favorite workflows: {favoriteWorkflows.length > 0 ? favoriteWorkflows.map((workflow) => workflow.name).join(", ") : "No usage history yet."}
              </p>
              <p className="detail-body">
                Metrics: {workflowMetrics ? `${workflowMetrics.accuracyProxy}% accuracy proxy and ${workflowMetrics.conversionReadiness}% conversion readiness.` : "Run the testing harness to populate workflow metrics."}
              </p>
              <p className="detail-body">
                Revenue range: {workflowMetrics ? `$${Math.round(workflowMetrics.revenueEstimateLow / 1000)}k-$${Math.round(workflowMetrics.revenueEstimateHigh / 1000)}k` : "$0k-$0k"}
              </p>
              {startupCheck?.errors.length ? <p className="detail-body warning-copy">Startup errors: {startupCheck.errors.join(" | ")}</p> : null}
              {startupCheck?.warnings.length ? <p className="detail-body warning-copy">Startup warnings: {startupCheck.warnings.join(" | ")}</p> : null}
            </section>
          </div>
        </div>
      </details>
      ) : null}

      <details className="archive-shell advanced-shell" open>
        <summary className="archive-summary">
          <div>
            <span className="eyebrow">Advanced</span>
            <h2 className="section-title">Live product pipeline</h2>
          </div>
        </summary>
        <MissionStatusBoard
          mission={runnerState.activeMission}
          tasks={runnerState.tasks}
          artifacts={runnerState.artifacts}
          onApproveForOutbound={handleApproveForOutbound}
        />
      </details>
    </>
  );

  const renderCatalogueTab = () => (
    <>
      {datasetCatalogueError ? (
        <section className="archive-shell">
          <div className="dataset-error-shell">
            <p className="detail-body">Catalogue issue: {datasetCatalogueError}</p>
            <p className="detail-body">Action: Confirm the local dataset files exist and contain valid JSON, then reload the page.</p>
          </div>
        </section>
      ) : null}

      <DatasetCatalogue
        datasets={visibleDatasets}
        selectedDatasetKeys={selectedDatasetKeys}
        searchValue={datasetSearch}
        kindFilter={datasetKindFilter}
        channelFilter={datasetChannelFilter}
        selectedTokenLoad={selectedTokenLoad}
        tokenLimit={maxTokensPerMinute}
        estimatedBatchCount={estimatedBatchCount}
        onSearchChange={setDatasetSearch}
        onKindFilterChange={setDatasetKindFilter}
        onChannelFilterChange={setDatasetChannelFilter}
        onToggleDataset={handleToggleDataset}
        onSelectVisible={handleSelectVisibleDatasets}
        onClearSelection={handleClearSelectedDatasets}
      />
    </>
  );

  const renderApprovalTab = () => (
    <>
      <AutonomousQueueBoard
        eyebrow="Approval Queue"
        title="Drafts waiting for final approval"
        emptyCopy="Once a draft is built, it will remain here until you approve it."
        items={approvalQueue}
        onSelectReviewMission={(missionId) => {
          setSelectedReviewMissionId(missionId);
          setActiveTab("approval");
        }}
      />

      {currentOpportunityJob ? (
        <section className="archive-shell">
          <div className="status-header">
            <div>
              <span className="eyebrow">Selected Opportunity</span>
              <h2 className="section-title">Why this draft was chosen</h2>
            </div>
          </div>

          <div className="report-section-grid">
            <section className="detail-card">
              <h3>Opportunity Metadata</h3>
              <div className="report-list">
                <p className="detail-body">Channel: {currentOpportunityJob.channel}</p>
                <p className="detail-body">Output type: {currentOpportunityJob.outputKind ?? "product"}</p>
                <p className="detail-body">Niche: {currentOpportunityJob.niche}</p>
                <p className="detail-body">Product or service type: {currentOpportunityJob.productServiceType}</p>
                <p className="detail-body">Deliverable type: {currentOpportunityJob.deliverableType}</p>
                <p className="detail-body">Confidence: {currentOpportunityJob.confidenceScore}%</p>
                <p className="detail-body">Selected style: {currentOpportunityJob.selectedStyle ?? currentOpportunityJob.styleDirection}</p>
              </div>
            </section>

            <section className="detail-card">
              <h3>Signal Basis</h3>
              <p className="detail-body">Why selected: {currentOpportunityJob.whySelected}</p>
              <p className="detail-body">Why it may sell: {currentOpportunityJob.whyItMaySell}</p>
              <p className="detail-body">Next action: {currentOpportunityJob.nextAction}</p>
              <p className="detail-body">Source signals: {currentOpportunityJob.sourceSignals.join(" | ") || "No stored source signals yet."}</p>
            </section>
          </div>
        </section>
      ) : null}

      <MorningReportView
        record={currentMorningRecord}
        onApproveProduct={handleApproveProduct}
        onRedoProduct={() => { /* legacy run path removed; use the AgentHero launcher */ }}
        onSubmitTrainingFeedback={handleSubmitProductFeedback}
        publishQueueStatus={currentMissionPublishStatus}
      />

      <details className="archive-shell advanced-shell">
        <summary className="archive-summary">
          <div>
            <span className="eyebrow">Advanced</span>
            <h2 className="section-title">Approval Queue Records</h2>
          </div>
        </summary>
        <PublishQueueView
          queue={runnerState.publishQueue}
          onApprove={(id) => handlePublishQueueStatusChange(id, "approved")}
          onReject={(id) => handlePublishQueueStatusChange(id, "rejected")}
        />
      </details>
    </>
  );

  const renderAgentsTab = () => (
    <>
      <section className="archive-shell">
        <div className="status-header">
          <div>
            <span className="eyebrow">Agents · Habitats</span>
            <h2 className="section-title">Autonomous agent roster and latest runtime summaries</h2>
          </div>
        </div>
        {/*
          Sparser 2-3 across habitat grid (vs. the AgentCard 4-across
          tile grid in AgentHero). Each habitat is a full cyberpunk room
          with the agent's synapse running behind a readable foreground
          plate. The "alive ecosystem" feel — each agent is a habitat,
          not a cramped tile.
        */}
        <div
          aria-label="Agent dashboard"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
            marginTop: 4
          }}
        >
          {liveAgents.map((agent) => (
            <AgentHabitat key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />
          ))}
        </div>
      </section>

      <section className="archive-shell">
        <div className="status-header">
          <div>
            <span className="eyebrow">Runtime Trace</span>
            <h2 className="section-title">What each agent role did in the last run</h2>
          </div>
        </div>

        {agentRuns.length === 0 ? (
          <div className="empty-shell">
            <h3 className="runner-title">No runtime trace yet</h3>
            <p className="detail-body">Run the automation workflow to capture a per-agent runtime summary.</p>
          </div>
        ) : (
          <div className="queue-board-grid">
            {agentRuns.map((run) => (
              <article key={run.roleId} className="detail-card queue-opportunity-card">
                <span className={`runner-chip ${run.status === "failed" ? "runner-chip-failed" : run.status === "retrying" ? "runner-chip-pending" : run.status === "completed" ? "runner-chip-approved" : "runner-chip-running"}`}>
                  {run.status}
                </span>
                <h3 className="task-title">{run.responsibility}</h3>
                <p className="detail-body">{run.summary}</p>
                <p className="detail-body">Items handled: {run.itemCount}</p>
                <p className="detail-body">Attempts: {run.attempts}</p>
                <p className="detail-body">Retries: {run.retryCount}</p>
                {run.error ? <p className="detail-body warning-copy">Error: {run.error}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const renderSettingsTab = () => (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h2 className="section-title">Runtime policy, storage keys, personalization, and dataset loader state</h2>
        </div>
      </div>

      <div className="report-section-grid">
        <section className="detail-card">
          <h3>Runtime Policy</h3>
          <p className="detail-body">Channel scope: {selectedChannel}</p>
          <p className="detail-body">Execution mode: {executionMode}</p>
          <p className="detail-body">Outbound approval: {outboundApproved ? "Granted" : "Not granted"}</p>
          <p className="detail-body">Agent runtime: server-side Claude API (Anthropic)</p>
          <p className="detail-body">Automatic publishing: disabled</p>
          <p className="detail-body">Build threshold: {confidenceThreshold}% confidence</p>
          <p className="detail-body">Selected datasets: {selectedDatasetKeys.length}</p>
          <p className="detail-body">Token load: {selectedTokenLoad.toLocaleString()} / {maxTokensPerMinute.toLocaleString()}</p>
          <p className="detail-body">Estimated batches: {estimatedBatchCount}</p>
          {trainingDataSummary ? (
            <p className="detail-body">
              Local training data: {trainingDataSummary.loadedFileCount}/{trainingDataSummary.fileCount} files loaded, {trainingDataSummary.exampleCount} selected examples available
            </p>
          ) : null}
          {startupCheck?.errors.length ? (
            <p className="detail-body warning-copy">Startup errors: {startupCheck.errors.join(" | ")}</p>
          ) : null}
          {startupCheck?.warnings.length ? (
            <p className="detail-body warning-copy">Startup warnings: {startupCheck.warnings.join(" | ")}</p>
          ) : null}
        </section>

        <details className="detail-card">
          <summary className="task-title">Advanced Storage Details</summary>
          <div className="report-list">
            <p className="detail-body">Research examples: market-research-examples</p>
            <p className="detail-body">Selected datasets: selected-dataset-keys</p>
            <p className="detail-body">Dataset usage: dataset-usage-map</p>
            <p className="detail-body">Workflow usage: workflow-usage-map</p>
            <p className="detail-body">Workflow stage chain: workflow-stage-chain</p>
            <p className="detail-body">Research queue: autonomous-research-queue</p>
            <p className="detail-body">Shortlist queue: autonomous-shortlist-queue</p>
            <p className="detail-body">Draft build queue: autonomous-build-queue</p>
            <p className="detail-body">Approval queue: autonomous-approval-queue</p>
            <p className="detail-body">Runtime trace: autonomous-agent-runs</p>
            <p className="detail-body">Workflow logs: workflow-run-logs</p>
          </div>
        </details>

        <details className="detail-card">
          <summary className="task-title">Local Training Files</summary>
          <div className="report-list">
            {trainingDataSummary ? (
              trainingDataSummary.files.map((file) => (
                <p key={file.key} className="detail-body">
                  {file.key}: {file.loaded ? `loaded (${file.exampleCount} examples, about ${file.estimatedTokens.toLocaleString()} tokens)` : `not loaded${file.error ? ` - ${file.error}` : ""}`} [{file.path}]
                </p>
              ))
            ) : (
              <p className="detail-body">Run the automation workflow to inspect file load status.</p>
            )}
          </div>
        </details>

        <details className="detail-card">
          <summary className="task-title">Last Runtime Agent Roles</summary>
          <div className="report-list">
            {buildAgentRoleCopy(agentRuns).length > 0 ? (
              buildAgentRoleCopy(agentRuns).map((line) => (
                <p key={line} className="detail-body">
                  {line}
                </p>
              ))
            ) : (
              <p className="detail-body">No runtime trace captured yet.</p>
            )}
          </div>
        </details>

        <details className="detail-card">
          <summary className="task-title">Startup Validation</summary>
          <div className="report-list">
            {startupCheck ? (
              startupCheck.checks.map((check) => (
                <p key={check.envVar} className={`detail-body ${!check.present ? "warning-copy" : ""}`}>
                  {check.label}: {check.present ? "configured" : `missing (${check.severity})`} [{check.envVar}]
                </p>
              ))
            ) : (
              <p className="detail-body">Runtime health not loaded yet.</p>
            )}
          </div>
        </details>
      </div>
    </section>
  );

  const tabContentMap: Record<DashboardTab, ReactNode> = {
    overview: renderOverviewTab(),
    catalogue: renderCatalogueTab(),
    approval: renderApprovalTab(),
    agents: renderAgentsTab(),
    settings: renderSettingsTab()
  };

  return (
    <div>
      <nav className="tab-nav" aria-label="Dashboard sections">
        {buildNavigationTabs(isAdmin).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/*
        Fall back to overview when a non-admin somehow lands on a
        gated tab (e.g. activeTab persisted from a prior admin session,
        or someone hand-edits state). Without this guard, an admin tab
        could render to a customer when isAdmin flips false.
      */}
      {!isAdmin && activeTab === "catalogue"
        ? tabContentMap.overview
        : tabContentMap[activeTab]}

      {selectedAgent ? <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgentId(null)} /> : null}
    </div>
  );
}
