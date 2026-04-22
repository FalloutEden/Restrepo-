import type { WorkflowTemplate, AutomationStage } from "@/lib/dataset-models";
import type { CommerceChannel } from "@/lib/market-intelligence";

export const DEFAULT_WORKFLOW_STAGES: AutomationStage[] = ["research", "validate", "design", "list"];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "high-demand-gigs",
    name: "Find High-Demand Gigs",
    description: "Research Fiverr-style service demand, validate buyer clarity, and build the strongest gig drafts.",
    outcome: "High-confidence service opportunities with packages, delivery process, and approval-ready gig drafts.",
    defaultChannel: "fiverr",
    stages: ["research", "validate", "design", "list"],
    goal: "Research and build high-demand Fiverr gigs with clear service packages, strong buyer outcomes, and reusable delivery workflows.",
    constraints:
      "Prioritize sellable services. Diversify niches, avoid near-duplicate gigs, and build only high-confidence drafts. Never publish automatically.",
    recommendedDatasetTags: ["fiverr", "jobs", "services", "agent training"],
    heroMetric: "Gig Revenue Potential"
  },
  {
    id: "trending-designs",
    name: "Generate Trending Designs",
    description: "Find promising print-on-demand or printable angles, validate them, and build listing-ready design drafts.",
    outcome: "Research-backed design opportunities with style rationale, draft visuals, and listing-ready outputs.",
    defaultChannel: "print_on_demand",
    stages: ["research", "validate", "design", "list"],
    goal: "Research trending print-on-demand and printable design opportunities, validate commercial fit, and build high-confidence listing-ready drafts.",
    constraints:
      "Favor clear thumbnail readability, niche specificity, and premium layout direction. Avoid generic, blocky, low-quality styles. Never auto-publish.",
    recommendedDatasetTags: ["print on demand", "shopify", "design", "market evidence"],
    heroMetric: "Design Conversion Readiness"
  },
  {
    id: "validate-and-list",
    name: "Validate And List Products",
    description: "Take validated concepts through final design and listing preparation with strong audit visibility.",
    outcome: "Validated products and services moved into draft builds and approval-ready listing packages.",
    defaultChannel: "all",
    stages: ["validate", "design", "list"],
    goal: "Validate the strongest product and service opportunities, finalize their design direction, and prepare listing-ready drafts for approval.",
    constraints:
      "Focus on opportunities with strong research signals, feasible production, and clear buyer positioning. Keep all outbound actions manual.",
    recommendedDatasetTags: ["market evidence", "quality", "listing"],
    heroMetric: "Approval Readiness"
  },
  {
    id: "mixed-revenue-sprint",
    name: "Mixed Revenue Sprint",
    description: "Run the full autonomous pipeline across products and services to surface the best opportunities for the $56k/month push.",
    outcome: "A diversified queue of gigs, designs, and listings routed into research, validation, design, and approval surfaces.",
    defaultChannel: "all",
    stages: ["research", "validate", "design", "list"],
    goal: "Research across all supported channels for high-demand gigs, strong print-on-demand concepts, and sellable product listings that support a path toward $56k per month.",
    constraints:
      "Diversify across channel, niche, output type, and style. Prefer strong demand signals, premium presentation, and repeatable workflows. Never auto-publish.",
    recommendedDatasetTags: ["fiverr", "print on demand", "shopify", "instruction", "agent training"],
    heroMetric: "Monthly Revenue Range"
  }
];

export function getWorkflowTemplateById(templateId: string | null | undefined) {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function cloneWorkflowStages(stages: AutomationStage[]) {
  return [...stages];
}

export function ensureWorkflowStages(stages: AutomationStage[] | undefined | null) {
  if (!stages || stages.length === 0) {
    return cloneWorkflowStages(DEFAULT_WORKFLOW_STAGES);
  }

  return [...stages];
}

export function resolveWorkflowGoal(templateId: string | null | undefined, fallbackGoal: string) {
  return getWorkflowTemplateById(templateId)?.goal ?? fallbackGoal;
}

export function resolveWorkflowConstraints(templateId: string | null | undefined, fallbackConstraints: string) {
  return getWorkflowTemplateById(templateId)?.constraints ?? fallbackConstraints;
}

export function resolveWorkflowChannel(templateId: string | null | undefined, fallbackChannel: CommerceChannel) {
  return getWorkflowTemplateById(templateId)?.defaultChannel ?? fallbackChannel;
}
