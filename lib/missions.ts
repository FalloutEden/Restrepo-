import type { Agent } from "@/lib/mock-agents";
import type { CommerceChannel } from "@/lib/market-intelligence";
import { applyStyleIntelligence } from "@/lib/style-intelligence";
import type { StyleProfile, StyleResearchSnapshot, StyledBlueprint } from "@/lib/style-intelligence";

export type MissionStatus = "Draft" | "Queued" | "Running" | "Completed" | "Blocked" | "Failed";
export type MissionPriority = "Critical" | "High" | "Standard";
export type TaskStatus = "Queued" | "Running" | "Completed" | "Blocked" | "Failed";
export type ExecutionMode = "internal" | "local" | "outbound";
export type ArtifactType =
  | "Trend Research"
  | "Product Concept"
  | "Design Blueprint"
  | "Mockup Prompt"
  | "Listing Output"
  | "Service Output"
  | "Approval Packet"
  | "Strategy Summary";
export type Difficulty = "Low" | "Medium" | "High";
export type CommerceOutputKind = "product" | "service";

export type Mission = {
  id: string;
  title: string;
  goal: string;
  channel: CommerceChannel;
  constraints: string[];
  executionMode: ExecutionMode;
  approved: boolean;
  approvalStatus: "granted" | "not_granted";
  status: MissionStatus;
  priority: MissionPriority;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  summary: string;
  recommendedNextAction: string;
};

export type MissionTask = {
  id: string;
  missionId: string;
  executionMode: ExecutionMode;
  assignedAgent: string;
  title: string;
  description: string;
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  outputSummary: string;
  plannedOutputSummary: string;
  artifacts: MissionArtifact[];
  error?: string;
};

export type MissionArtifact = {
  id: string;
  missionId: string;
  title: string;
  type: ArtifactType;
  createdBy: string;
  summary: string;
  linkLabel: string;
  details: string[];
};

export type AgentContribution = {
  agentId: string;
  agentName: string;
  role: string;
  status: TaskStatus;
  contribution: string;
  artifactCount: number;
};

export type GeneratedProductPage = {
  pageName: string;
  layoutDescription: string;
  sections: string[];
  textContent: string[];
  visualStyleInstructions: string[];
  colorPaletteSuggestion: string;
  fontStyleSuggestion: string;
  canvaBuildInstructions: string[];
};

export type ProductTheme = "minimalist clean" | "dark mode" | "feminine aesthetic" | "bold modern" | "soft neutral";
export type ProductFormat = "printable" | "spreadsheet" | "service";
export type SupportedServiceType =
  | "script writing"
  | "spreadsheet creation"
  | "planner design"
  | "ai content generation"
  | "automation setup"
  | "image generation"
  | "video scripting";
export type ServicePackageTier = "Basic" | "Standard" | "Premium";

export type ServicePackageSpec = {
  name: ServicePackageTier;
  priceRange: string;
  turnaroundTime: string;
  deliverables: string[];
};

export type SpreadsheetTabSpec = {
  tabName: string;
  purpose: string;
  columnHeaders: string[];
  sampleRows: Array<Array<string | number>>;
  formulas: string[];
  dropdownFields: string[];
  themeStylingInstructions: string[];
};

export type SpreadsheetWorkbookSpec = {
  workbookTitle: string;
  workbookStructure: string[];
  previewSummary: string;
  tabs: SpreadsheetTabSpec[];
  keyFormulas: string[];
  whatBuyerGets: string[];
};

export type CommerceProductOutput = {
  id: string;
  outputKind: "product";
  channel: CommerceChannel;
  title: string;
  listingTitle: string;
  listingDescription: string;
  listingTags: string[];
  price: string;
  targetBuyer: string;
  whyItWillSell: string;
  theme: ProductTheme;
  productFormat: ProductFormat;
  format: ProductFormat;
  productType: string;
  deliverableType: string;
  fileFormat: string;
  fileDeliveryDescription: string;
  mockupPrompt: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  workbookSpec: SpreadsheetWorkbookSpec | null;
  estimatedDifficulty: Difficulty;
  estimatedTimeToMVP: string;
  selectedStyleProfile: StyleProfile;
  selectedStyleReason: string;
  styleResearch: StyleResearchSnapshot;
};

export type CommerceServiceOutput = {
  id: string;
  outputKind: "service";
  channel: CommerceChannel;
  title: string;
  listingTitle: string;
  listingDescription: string;
  listingTags: string[];
  price: string;
  targetBuyer: string;
  whyItWillSell: string;
  theme: ProductTheme;
  productFormat: "service";
  format: "service";
  productType: string;
  deliverableType: string;
  fileFormat: string;
  fileDeliveryDescription: string;
  mockupPrompt: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  workbookSpec: SpreadsheetWorkbookSpec | null;
  estimatedDifficulty: Difficulty;
  estimatedTimeToMVP: string;
  selectedStyleProfile: StyleProfile;
  selectedStyleReason: string;
  styleResearch: StyleResearchSnapshot;
  serviceType: SupportedServiceType;
  gigTitle: string;
  gigDescription: string;
  deliverables: string[];
  deliveryProcess: string[];
  packages: ServicePackageSpec[];
  turnaroundTime: string;
  actualWorkForClient: string[];
  reusableWorkflow: string[];
  scalabilityNotes: string[];
};

export type CommerceOutput = CommerceProductOutput | CommerceServiceOutput;

export type MorningReport = {
  id: string;
  missionId: string;
  executiveSummary: string;
  missionSummary: string;
  agentSummaries: AgentContribution[];
  completedTaskIds: string[];
  failedTaskIds: string[];
  completedTaskSummaries: Array<{
    taskId: string;
    title: string;
    assignedAgent: string;
    completedAt?: string;
    summary: string;
  }>;
  artifactsCreated: MissionArtifact[];
  finalProduct: CommerceOutput;
  risks: string[];
  blockers: string[];
  recommendations: string[];
  recommendedNextStep: string;
  confidenceScore: number;
  finalMorningReport: string;
};

export type MissionRecord = {
  mission: Mission;
  tasks: MissionTask[];
  artifacts: MissionArtifact[];
  report: MorningReport;
};

export type PublishQueueStatus = "pending" | "approved" | "rejected" | "published";
export type ProductReviewState = "Draft Generated" | "Review Ready" | "Approved";

export type PublishQueueItem = {
  id: number;
  missionId: string;
  channel: CommerceChannel;
  title: string;
  data: string;
  listingData: string;
  tags: string[];
  pricing: string;
  format: ProductFormat;
  deliverableType: string;
  artifacts: MissionArtifact[];
  images: string[];
  listingDraft: string;
  styleProfileId: string;
  styleProfileName: string;
  status: PublishQueueStatus;
  createdAt: string;
};

export type RunnerState = {
  activeMission: Mission | null;
  tasks: MissionTask[];
  artifacts: MissionArtifact[];
  report: MorningReport | null;
  archive: MissionRecord[];
  publishQueue: PublishQueueItem[];
};

export function deriveProductReviewState(
  record: MissionRecord | null,
  options?: {
    queueStatus?: PublishQueueStatus | null;
    assetsReady?: boolean;
  }
): ProductReviewState {
  if (!record) {
    return "Draft Generated";
  }

  if (options?.queueStatus === "approved" || options?.queueStatus === "published") {
    return "Approved";
  }

  if (record.mission.status === "Completed" && options?.assetsReady) {
    return "Review Ready";
  }

  return "Draft Generated";
}

type CommerceBlueprint = {
  niche: string;
  customer: string;
  productTitle: string;
  trendSummary: string;
  conceptSummary: string;
  theme: ProductTheme;
  productFormat: ProductFormat;
  pageBreakdown: string[];
  mockupPrompt: string;
  productType: string;
  fileFormat: string;
  listingTitle: string;
  description: string;
  tags: string[];
  price: string;
  fileDelivery: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  workbookSpec?: SpreadsheetWorkbookSpec;
  difficulty: Difficulty;
  timeToMVP: string;
};

type ServiceBlueprint = {
  channel: CommerceChannel;
  serviceType: SupportedServiceType;
  niche: string;
  customer: string;
  productTitle: string;
  trendSummary: string;
  conceptSummary: string;
  theme: ProductTheme;
  productFormat: "service";
  pageBreakdown: string[];
  mockupPrompt: string;
  productType: string;
  fileFormat: string;
  listingTitle: string;
  description: string;
  tags: string[];
  price: string;
  fileDelivery: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  difficulty: Difficulty;
  timeToMVP: string;
  gigTitle: string;
  gigDescription: string;
  deliverables: string[];
  deliveryProcess: string[];
  packages: ServicePackageSpec[];
  turnaroundTime: string;
  actualWorkForClient: string[];
  reusableWorkflow: string[];
  scalabilityNotes: string[];
};

type StyledProductBlueprint = StyledBlueprint<CommerceBlueprint & { channel: CommerceChannel }>;
type StyledServiceBlueprint = StyledBlueprint<ServiceBlueprint>;
type StyledCommerceBlueprint = StyledProductBlueprint | StyledServiceBlueprint;

type ArtifactBlueprint = {
  title: string;
  type: ArtifactType;
  summary: string;
  linkLabel: string;
  details: string[];
};

type TaskBlueprint = {
  assignedAgent: string;
  title: string;
  description: string;
  outputSummary: string;
  artifacts: ArtifactBlueprint[];
};

const SAFE_CONSTRAINTS = [
  "No live publishing, account creation, checkout, or outbound marketplace actions without explicit approval.",
  "Research Agent must only choose digital product opportunities in planners, trackers, templates, or printable kits.",
  "Create internal research, product concepts, listing copy, and approval-ready digital assets only.",
  "Keep the output to one complete listing output package ready for human review."
] as const;

const AGENT_ORDER = ["Atlas", "Compass", "Anvil", "Core Runtime"] as const;

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function timestampLabel(date: Date) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function deriveMissionTitle(goal: string) {
  const trimmed = goal.trim();
  if (!trimmed) {
    return "Product Pipeline";
  }

  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}

function extractConstraints(rawConstraints: string) {
  const parsed = rawConstraints
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...SAFE_CONSTRAINTS, ...parsed];
}

function createMissionArtifactFromBlueprint(
  missionId: string,
  assignedAgent: string,
  artifact: ArtifactBlueprint
): MissionArtifact {
  return {
    id: createId("artifact"),
    missionId,
    createdBy: assignedAgent,
    title: artifact.title,
    type: artifact.type,
    summary: artifact.summary,
    linkLabel: artifact.linkLabel,
    details: artifact.details
  };
}

function renderGeneratedPagesToText(pages: GeneratedProductPage[]) {
  return pages.map((page) => {
    return [
      `Page: ${page.pageName}`,
      `Layout: ${page.layoutDescription}`,
      `Sections: ${page.sections.join(" | ")}`,
      `Text Content: ${page.textContent.join(" | ")}`,
      `Style: ${page.visualStyleInstructions.join(" | ")}`,
      `Color Palette: ${page.colorPaletteSuggestion}`,
      `Font Style: ${page.fontStyleSuggestion}`,
      `Canva Build Instructions: ${page.canvaBuildInstructions.join(" | ")}`
    ].join(" || ");
  });
}

function withRenderedDesignBlueprint(
  blueprint: Omit<CommerceBlueprint, "designBlueprint">
): CommerceBlueprint {
  return {
    ...blueprint,
    designBlueprint: renderGeneratedPagesToText(blueprint.generatedProductPages)
  };
}

function renderWorkbookSpecDetails(workbookSpec?: SpreadsheetWorkbookSpec) {
  if (!workbookSpec) {
    return [];
  }

  return [
    `Workbook title: ${workbookSpec.workbookTitle}.`,
    `Workbook structure: ${workbookSpec.workbookStructure.join(", ")}.`,
    `Key formulas: ${workbookSpec.keyFormulas.join(" | ")}.`,
    `What the buyer gets: ${workbookSpec.whatBuyerGets.join(", ")}.`
  ];
}

function createWeddingPlannerSpreadsheetBlueprint(): CommerceBlueprint {
  return withRenderedDesignBlueprint({
    niche: "wedding planning spreadsheets",
    customer: "couples and wedding planners who want a polished, editable planning workbook",
    productTitle: "Wedding Planner Spreadsheet Workbook",
    trendSummary:
      "Buyers are increasingly choosing digital spreadsheets for wedding planning because they want clarity, automation, and reusable planning tools in an editable format.",
    conceptSummary:
      "Build a polished wedding planner workbook with a cover/info tab, main tracker tab, and dashboard summary tab tied together with formulas, dropdowns, and a soft neutral wedding theme.",
    theme: "soft neutral",
    productFormat: "spreadsheet",
    pageBreakdown: ["Cover/info tab", "Wedding planning tracker tab", "Planning dashboard tab"],
    mockupPrompt:
      "Create an ecommerce mockup scene of a spreadsheet workbook open to a wedding planning dashboard tab, styled on a marble desk with soft neutral wedding stationery and a laptop beside a bouquet.",
    productType: "Wedding planner spreadsheet",
    fileFormat: "XLSX",
    listingTitle:
      "Wedding Planner Spreadsheet Workbook, Editable Wedding Budget & Timeline Tracker, Printable XLSX Instant Download",
    description:
      "This wedding planner spreadsheet workbook gives buyers an editable .xlsx file with cover instructions, a full planning tracker, built-in formulas, dropdown selections, and a summary dashboard to keep every detail organized.",
    tags: [
      "wedding planner spreadsheet",
      "wedding spreadsheet",
      "wedding budget tracker",
      "wedding planning",
      "xlsx planner",
      "editable spreadsheet",
      "instant download",
      "wedding organizer",
      "wedding checklist",
      "bridal planning"
    ],
    price: "$12.99",
    fileDelivery:
      "Buyer receives one downloadable .xlsx workbook with editable tabs, formulas, dropdown fields, and planning dashboard guidance. No physical item included.",
    productContents: [
      "cover and info tab",
      "wedding planning tracker tab",
      "summary dashboard tab",
      "built-in formulas",
      "dropdown-style fields"
    ],
    workbookSpec: {
      workbookTitle: "Wedding Planner Spreadsheet Workbook",
      workbookStructure: ["Cover & Info", "Wedding Tracker", "Wedding Dashboard"],
      previewSummary: "A polished wedding planning workbook with editable tracker fields, vendor budgeting formulas, and a summary dashboard.",
      tabs: [
        {
          tabName: "Cover & Info",
          purpose: "Introduce the workbook, explain how to use the planner, and capture core event details.",
          columnHeaders: ["Field", "Value"],
          sampleRows: [
            ["Couple Names", "Alex & Jordan"],
            ["Wedding Date", "2026-09-18"],
            ["Venue", "Garden Estate"]
          ],
          formulas: [],
          dropdownFields: [],
          themeStylingInstructions: ["Use a soft neutral header band", "Keep spacing airy and elegant"]
        },
        {
          tabName: "Wedding Tracker",
          purpose: "Track vendors, categories, planned costs, actual costs, and booking status.",
          columnHeaders: ["Item", "Category", "Planned Cost", "Actual Cost", "Variance", "Status"],
          sampleRows: [
            ["Venue", "Vendors", 5000, 5200, "=D2-C2", "Confirmed"],
            ["Catering", "Vendors", 3500, 3400, "=D3-C3", "Confirmed"],
            ["Flowers", "Decor", 800, 760, "=D4-C4", "Pending"]
          ],
          formulas: ["Variance = Actual Cost - Planned Cost", "Total Planned = SUM(C2:C20)", "Total Actual = SUM(D2:D20)"],
          dropdownFields: ["Status: Planned, Confirmed, Pending, Complete"],
          themeStylingInstructions: ["Use soft blush banded rows", "Highlight formula columns and totals"]
        },
        {
          tabName: "Wedding Dashboard",
          purpose: "Summarize budget totals, vendor count, and overall planning progress.",
          columnHeaders: ["Metric", "Value"],
          sampleRows: [
            ["Total Planned", "=SUM('Wedding Tracker'!C2:C20)"],
            ["Total Actual", "=SUM('Wedding Tracker'!D2:D20)"],
            ["Total Variance", "=SUM('Wedding Tracker'!E2:E20)"]
          ],
          formulas: ["Vendor Count = COUNTA('Wedding Tracker'!A2:A20)", "Budget Remaining = Planned Total - Actual Total"],
          dropdownFields: [],
          themeStylingInstructions: ["Use large summary cards", "Accent totals with warm neutral fills"]
        }
      ],
      keyFormulas: [
        "Wedding Tracker!E2:E20 = Actual Cost - Planned Cost",
        "Wedding Dashboard total cells summarize planned, actual, and variance values",
        "Wedding Dashboard vendor count uses COUNTA on tracker items"
      ],
      whatBuyerGets: [
        "Editable .xlsx workbook",
        "Cover and info tab",
        "Wedding tracker tab with formulas",
        "Dashboard summary tab",
        "Status dropdown fields"
      ]
    },
    generatedProductPages: [
      {
        pageName: "Cover & Info Tab",
        layoutDescription:
          "Workbook title and instructions with section blocks for the couple's names, wedding date, and theme styling notes.",
        sections: ["Workbook title area", "Couple details", "Planning instructions"],
        textContent: [
          "Workbook title: Wedding Planner Spreadsheet Workbook",
          "Couple: _________________ & _________________",
          "Wedding date: _________________"
        ],
        visualStyleInstructions: [
          "Soft neutral header band",
          "Clean separation between info blocks",
          "Subtle rule lines for instructions"
        ],
        colorPaletteSuggestion: "Ivory, blush, warm gray",
        fontStyleSuggestion: "Modern serif for headings with a clean sans serif body",
        canvaBuildInstructions: [
          "Create a centered workbook title",
          "Add labeled fields for couple names, event date, and venue",
          "Add a small instruction sidebar explaining the tracker tabs"
        ]
      },
      {
        pageName: "Main Tracker Tab",
        layoutDescription:
          "A core tracking sheet with labeled columns, sample rows, dropdown categories, and cells configured for formulas.",
        sections: ["Task list", "Budget columns", "Status dropdown", "Formula columns"],
        textContent: [
          "Columns: Item / Category / Planned Cost / Actual Cost / Variance / Status",
          "Sample row: Venue / Vendors / 5000 / 5200 / =E2-D2 / Confirmed",
          "Key formulas: Total planned =SUM(D2:D20), Total variance =SUM(E2:E20)"
        ],
        visualStyleInstructions: [
          "Use gentle banded rows",
          "Keep the tracker area wide for long task names",
          "Highlight formula output cells"
        ],
        colorPaletteSuggestion: "Soft blush, sage, pearl",
        fontStyleSuggestion: "Readable sans serif with subtle headings",
        canvaBuildInstructions: [
          "Design a long table with clear column headers",
          "Add a dropdown field on the Status column",
          "Include a formula summary area at the top"
        ]
      },
      {
        pageName: "Dashboard Tab",
        layoutDescription:
          "Summary dashboard with total spend, progress metrics, and formula-driven planning health indicators.",
        sections: ["Totals section", "Status summary", "Key formula summary"],
        textContent: [
          "Key formulas: Remaining budget =Budget total - Actual total", "Progress percent =Actual total / Budget total", "Vendor count =COUNTA(A2:A20)"],
        visualStyleInstructions: [
          "Keep summary blocks large and easy to scan", "Use subtle color accents to highlight totals"],
        colorPaletteSuggestion: "Cashmere, cream, muted gold",
        fontStyleSuggestion: "Bold headings with simple numeric body text",
        canvaBuildInstructions: [
          "Create separate blocks for Budget, Spend, and Progress",
          "Label each metric clearly",
          "Place a small notes area for next steps"
        ]
      }
    ],
    difficulty: "Medium",
    timeToMVP: "1-2 days"
  });
}

function createBudgetSpreadsheetBlueprint(): CommerceBlueprint {
  return withRenderedDesignBlueprint({
    niche: "personal finance spreadsheets",
    customer: "people who want a simple, ready-to-use budgeting workbook",
    productTitle: "Personal Budget Spreadsheet",
    trendSummary:
      "Budget spreadsheet downloads are popular because buyers want editable finance tools that automate totals and help them stay on track month after month.",
    conceptSummary:
      "Create a clean budget workbook with a cover/info tab, detailed monthly tracker tab, and summary dashboard, complete with formula-driven totals and dropdown categories.",
    theme: "minimalist clean",
    productFormat: "spreadsheet",
    pageBreakdown: ["Cover/info tab", "Monthly budget tracker tab", "Budget dashboard tab"],
    mockupPrompt:
      "Create an ecommerce mockup of a budget spreadsheet workbook open to a dashboard tab with modern office styling and soft minimalist colors.",
    productType: "Budget spreadsheet",
    fileFormat: "XLSX",
    listingTitle:
      "Budget Spreadsheet Workbook, Monthly Budget Tracker XLSX, Personal Finance Planner, Editable Excel Workbook",
    description:
      "This budget spreadsheet workbook includes editable Excel-style tabs for planning monthly income and spending, with built-in formulas, dropdown categories, and a dashboard for tracking results.",
    tags: [
      "budget spreadsheet",
      "excel budget",
      "monthly budget",
      "personal finance",
      "xlsx workbook",
      "budget planner",
      "finance tracker",
      "instant download",
      "editable spreadsheet"
    ],
    price: "$9.99",
    fileDelivery:
      "Buyer receives one downloadable .xlsx budget workbook with ready-made formulas, editable fields, and dashboard tracking. No physical item included.",
    productContents: [
      "cover and info tab",
      "monthly budget tracker tab",
      "dashboard summary tab",
      "income and expenses formulas",
      "dropdown categories"
    ],
    workbookSpec: {
      workbookTitle: "Personal Budget Spreadsheet",
      workbookStructure: ["Cover & Info", "Budget Tracker", "Budget Dashboard"],
      previewSummary: "A monthly budgeting workbook with formula-backed spending totals, variance tracking, and a clean dashboard.",
      tabs: [
        {
          tabName: "Cover & Info",
          purpose: "Provide budgeting instructions and setup fields for goals, income, and savings targets.",
          columnHeaders: ["Field", "Value"],
          sampleRows: [
            ["Monthly Income Goal", 4500],
            ["Savings Goal", 600],
            ["Budget Month", "May 2026"]
          ],
          formulas: [],
          dropdownFields: [],
          themeStylingInstructions: ["Use minimalist spacing", "Keep labels crisp and easy to scan"]
        },
        {
          tabName: "Budget Tracker",
          purpose: "Track planned and actual amounts by category with variance and status fields.",
          columnHeaders: ["Category", "Planned", "Actual", "Variance", "Status"],
          sampleRows: [
            ["Rent", 1200, 1200, "=C2-B2", "On track"],
            ["Groceries", 400, 380, "=C3-B3", "On track"],
            ["Utilities", 200, 225, "=C4-B4", "Review"]
          ],
          formulas: ["Variance = Actual - Planned", "Total Planned = SUM(B2:B20)", "Total Actual = SUM(C2:C20)"],
          dropdownFields: ["Status: On track, Review, Over budget"],
          themeStylingInstructions: ["Use subtle row banding", "Highlight totals and negative variances"]
        },
        {
          tabName: "Budget Dashboard",
          purpose: "Summarize total planned spend, actual spend, variance, and savings performance.",
          columnHeaders: ["Metric", "Value"],
          sampleRows: [
            ["Total Planned", "=SUM('Budget Tracker'!B2:B20)"],
            ["Total Actual", "=SUM('Budget Tracker'!C2:C20)"],
            ["Total Variance", "=SUM('Budget Tracker'!D2:D20)"]
          ],
          formulas: ["Remaining Budget = Total Planned - Total Actual", "Savings Rate = Savings / Income"],
          dropdownFields: [],
          themeStylingInstructions: ["Use dashboard cards with soft accent fills", "Keep numbers prominent"]
        }
      ],
      keyFormulas: [
        "Budget Tracker!D2:D20 = Actual - Planned",
        "Budget Dashboard totals roll up planned, actual, and variance values",
        "Budget Dashboard savings rate compares savings against income"
      ],
      whatBuyerGets: [
        "Editable .xlsx workbook",
        "Cover and setup tab",
        "Monthly budget tracker with formulas",
        "Dashboard summary tab",
        "Budget status dropdown fields"
      ]
    },
    generatedProductPages: [
      {
        pageName: "Cover & Info Tab",
        layoutDescription:
          "Workbook instructions and summary fields for monthly goals, total income, and budgeting notes.",
        sections: ["Workbook title", "Monthly goal fields", "Instructions"],
        textContent: [
          "Workbook title: Personal Budget Spreadsheet",
          "Monthly income: _________________",
          "Savings goal: _________________"
        ],
        visualStyleInstructions: ["Clean page layout", "Clear labeled sections", "Soft minimalist accents"],
        colorPaletteSuggestion: "White, charcoal, soft blue",
        fontStyleSuggestion: "Modern clean sans serif",
        canvaBuildInstructions: [
          "Add a page title and subtitle",
          "Create fields for income and savings goals",
          "Include a short instruction paragraph"
        ]
      },
      {
        pageName: "Main Tracker Tab",
        layoutDescription:
          "A tracker table with categories, planned vs actual amounts, variance calculations, and status dropdowns.",
        sections: ["Category", "Planned", "Actual", "Variance", "Status"],
        textContent: [
          "Sample row: Rent / 1200 / 1200 / =D2-C2 / On track",
          "Key formulas: Total planned =SUM(C2:C20), Total actual =SUM(D2:D20), Total variance =SUM(E2:E20)"
        ],
        visualStyleInstructions: ["Easy-to-read grid", "Use mild banding for rows", "Highlight totals"],
        colorPaletteSuggestion: "Navy, slate, cream",
        fontStyleSuggestion: "Neutral sans serif with quiet headings",
        canvaBuildInstructions: [
          "Create a table with five main columns",
          "Add dropdown options for status",
          "Include a totals row at the bottom"
        ]
      },
      {
        pageName: "Dashboard Tab",
        layoutDescription:
          "A summary tab showing overall spending, savings progress, and key budget metrics using formula outputs.",
        sections: ["Total income", "Total expenses", "Savings progress"],
        textContent: [
          "Key formulas: Savings rate =Total savings / Total income", "Expense percent =Total expenses / Total income"],
        visualStyleInstructions: ["Organize metrics in blocks", "Use accent shading for totals"],
        colorPaletteSuggestion: "Soft green, ivory, gray",
        fontStyleSuggestion: "Bold numeric headings with simple text",
        canvaBuildInstructions: [
          "Design three large summary blocks", "Label each metric clearly", "Add a short notes area"
        ]
      }
    ],
    difficulty: "Low",
    timeToMVP: "1 day"
  });
}

function createDebtPayoffTrackerSpreadsheetBlueprint(): CommerceBlueprint {
  return withRenderedDesignBlueprint({
    niche: "debt payoff spreadsheets",
    customer: "people managing multiple debts who want a clear payoff path and formula-driven tracker",
    productTitle: "Debt Payoff Tracker Spreadsheet",
    trendSummary:
      "Debt payoff spreadsheet tools are popular in digital marketplaces because buyers want an editable solution that calculates payoff dates, interest, and balance reduction automatically.",
    conceptSummary:
      "Deliver a debt payoff workbook with a cover tab, debt tracker tab, and dashboard summary tab that calculates remaining balances, monthly payments, and payoff progress.",
    theme: "bold modern",
    productFormat: "spreadsheet",
    pageBreakdown: ["Cover/info tab", "Debt tracker tab", "Payoff dashboard tab"],
    mockupPrompt:
      "Create an ecommerce mockup of a debt payoff spreadsheet open on a laptop with a clean modern dashboard, financial planning props, and bright, optimistic styling.",
    productType: "Debt payoff tracker spreadsheet",
    fileFormat: "XLSX",
    listingTitle:
      "Debt Payoff Tracker Spreadsheet, Debt Snowball & Avalanche XLSX Workbook, Editable Financial Tracker",
    description:
      "This debt payoff tracker spreadsheet workbook includes editable tabs for debts, payment plans, payoff dates, and a progress dashboard made with formulas and dropdown fields.",
    tags: [
      "debt payoff spreadsheet",
      "debt tracker",
      "xlsx debt planner",
      "debt snowball",
      "debt avalanche",
      "editable spreadsheet",
      "financial tracker",
      "instant download"
    ],
    price: "$11.99",
    fileDelivery:
      "Buyer receives one downloadable .xlsx debt payoff workbook with payment calculators, balance tracking, and payoff summary charts. No physical item included.",
    productContents: [
      "cover and info tab",
      "debt tracker tab",
      "payoff dashboard tab",
      "interest and payoff formulas",
      "dropdown payment status"
    ],
    workbookSpec: {
      workbookTitle: "Debt Payoff Tracker Spreadsheet",
      workbookStructure: ["Cover & Info", "Debt Tracker", "Debt Dashboard"],
      previewSummary: "A debt reduction workbook with payoff calculations, remaining balance formulas, and a progress dashboard.",
      tabs: [
        {
          tabName: "Cover & Info",
          purpose: "Explain payoff strategy and collect the buyer's target payoff information.",
          columnHeaders: ["Field", "Value"],
          sampleRows: [
            ["Strategy", "Snowball"],
            ["Target Payoff Date", "2027-12-31"],
            ["Monthly Debt Budget", 600]
          ],
          formulas: [],
          dropdownFields: ["Strategy: Snowball, Avalanche"],
          themeStylingInstructions: ["Use strong modern heading styles", "Emphasize the target payoff date"]
        },
        {
          tabName: "Debt Tracker",
          purpose: "Track creditors, balances, payments, rates, and remaining payoff progress.",
          columnHeaders: ["Creditor", "Starting Balance", "Monthly Payment", "Interest Rate", "Remaining Balance", "Status"],
          sampleRows: [
            ["Credit Card", 5000, 150, "18%", "=B2-C2", "Active"],
            ["Student Loan", 15000, 200, "5%", "=B3-C3", "Active"]
          ],
          formulas: ["Remaining Balance = Starting Balance - Monthly Payment", "Months to Payoff = ROUNDUP(Starting Balance / Monthly Payment, 0)"],
          dropdownFields: ["Status: Active, Paid, Deferred"],
          themeStylingInstructions: ["Use strong row separation", "Highlight balance and payment columns"]
        },
        {
          tabName: "Debt Dashboard",
          purpose: "Summarize total debt, payment totals, and payoff progress.",
          columnHeaders: ["Metric", "Value"],
          sampleRows: [
            ["Total Debt", "=SUM('Debt Tracker'!B2:B20)"],
            ["Monthly Payment Total", "=SUM('Debt Tracker'!C2:C20)"],
            ["Remaining Balance", "=SUM('Debt Tracker'!E2:E20)"]
          ],
          formulas: ["Progress = 1 - Remaining Balance / Total Debt", "Next Target can reference the top unpaid debt row"],
          dropdownFields: [],
          themeStylingInstructions: ["Use bold metric cards", "Apply optimistic accent colors to payoff progress"]
        }
      ],
      keyFormulas: [
        "Debt Tracker!E2:E20 = Starting Balance - Monthly Payment",
        "Debt Dashboard totals summarize total debt and monthly payments",
        "Debt progress compares remaining balances with original totals"
      ],
      whatBuyerGets: [
        "Editable .xlsx workbook",
        "Cover and payoff strategy tab",
        "Debt tracker with formulas",
        "Dashboard summary tab",
        "Debt status dropdown fields"
      ]
    },
    generatedProductPages: [
      {
        pageName: "Cover & Info Tab",
        layoutDescription:
          "Instructions, debt summary fields, and a payment style selector for payoff strategy notes.",
        sections: ["Debt owner details", "Payoff strategy", "Instructions"],
        textContent: [
          "Workbook title: Debt Payoff Tracker Spreadsheet",
          "Strategy: Snowball or Avalanche",
          "Target payoff date: _________________"
        ],
        visualStyleInstructions: ["Modern financial styling", "Clear instruction blocks", "Emphasize key dates"],
        colorPaletteSuggestion: "Steel blue, white, coral",
        fontStyleSuggestion: "Clean sans serif with bold headings",
        canvaBuildInstructions: [
          "Create a prominent title block",
          "Add a strategy dropdown note",
          "Include a short payoff instruction section"
        ]
      },
      {
        pageName: "Main Tracker Tab",
        layoutDescription:
          "A debt tracker table with creditor details, starting balance, payment amounts, interest rate, and payoff date formulas.",
        sections: ["Creditor", "Balance", "Payment", "Interest", "Status"],
        textContent: [
          "Sample row: Credit card / 5000 / 150 / 18% / Active",
          "Key formulas: Remaining balance =B2-C2, Months to payoff =ROUNDUP(B2/C2,0)"
        ],
        visualStyleInstructions: ["Use strong row separation", "Highlight payment totals", "Keep numeric columns aligned"],
        colorPaletteSuggestion: "Midnight, mint, ivory",
        fontStyleSuggestion: "Practical sans serif",
        canvaBuildInstructions: [
          "Create a table with creditor and payment columns",
          "Add a dropdown in the status column",
          "Include formula cells for remaining balance and months"
        ]
      },
      {
        pageName: "Dashboard Tab",
        layoutDescription:
          "A payoff summary showing total debt remaining, progress percentage, and next payment focus.",
        sections: ["Total debt", "Percent paid", "Next target"],
        textContent: [
          "Key formulas: Total remaining =SUM(B2:B20), Progress =1 - Remaining / Starting total"],
        visualStyleInstructions: ["Organize metrics in blocks", "Use optimistic highlight colors"],
        colorPaletteSuggestion: "Teal, pale gold, charcoal",
        fontStyleSuggestion: "Bold numeric headings",
        canvaBuildInstructions: [
          "Design three summary metric panels", "Label each payoff measure clearly", "Reserve a note area for next steps"
        ]
      }
    ],
    difficulty: "Low",
    timeToMVP: "1 day"
  });
}

function createContentPlannerSpreadsheetBlueprint(): CommerceBlueprint {
  return withRenderedDesignBlueprint({
    niche: "content planning spreadsheets",
    customer: "content creators and small business owners who want an easy editorial planning workbook",
    productTitle: "Content Planner Spreadsheet",
    trendSummary:
      "Content planners in spreadsheet form attract buyers who want an editable editorial workflow with formula-backed status tracking and publishing dashboards.",
    conceptSummary:
      "Build a content planner workbook with a cover tab, content calendar tracker tab, and dashboard summary tab for status, due dates, and content type formulas.",
    theme: "minimalist clean",
    productFormat: "spreadsheet",
    pageBreakdown: ["Cover/info tab", "Content calendar tab", "Content dashboard tab"],
    mockupPrompt:
      "Create an ecommerce mockup of a content planning spreadsheet workbook open to a calendar and dashboard, styled with a laptop, coffee, and subtle creative branding.",
    productType: "Content planner spreadsheet",
    fileFormat: "XLSX",
    listingTitle:
      "Content Planner Spreadsheet Workbook, Editable Content Calendar XLSX, Social Media & Blog Planning Tracker",
    description:
      "This content planner spreadsheet workbook includes an editable calendar tracker, content type dropdowns, status formulas, and a dashboard for managing publishing cadence.",
    tags: [
      "content planner spreadsheet",
      "content calendar",
      "xlsx planner",
      "social media planner",
      "blog planner",
      "content tracker",
      "editable spreadsheet",
      "instant download"
    ],
    price: "$10.99",
    fileDelivery:
      "Buyer receives one downloadable .xlsx content planner workbook with calendar tracking, dropdown fields, and summary calculations. No physical item included.",
    productContents: [
      "cover and info tab",
      "content calendar tracker tab",
      "dashboard summary tab",
      "status and content type dropdowns",
      "formula-driven totals"
    ],
    workbookSpec: {
      workbookTitle: "Content Planner Spreadsheet",
      workbookStructure: ["Cover & Info", "Content Tracker", "Content Dashboard"],
      previewSummary: "An editorial planning workbook with calendar rows, status tracking, and dashboard metrics for publishing cadence.",
      tabs: [
        {
          tabName: "Cover & Info",
          purpose: "Set channel goals, audience focus, and workbook instructions for editorial planning.",
          columnHeaders: ["Field", "Value"],
          sampleRows: [
            ["Primary Audience", "Creative founders"],
            ["Publishing Frequency Goal", "3 posts per week"],
            ["Primary Platform", "Instagram"]
          ],
          formulas: [],
          dropdownFields: [],
          themeStylingInstructions: ["Use editorial spacing", "Keep setup fields simple and clean"]
        },
        {
          tabName: "Content Tracker",
          purpose: "Track publish dates, channels, content types, statuses, and notes in one planner tab.",
          columnHeaders: ["Publish Date", "Channel", "Content Topic", "Status", "Notes"],
          sampleRows: [
            ["2026-05-01", "Instagram", "Carousel Post", "Planned", "Write caption"],
            ["2026-05-03", "Blog", "How-to Guide", "Draft", "Outline post"]
          ],
          formulas: ["Planned Count = COUNTA(A2:A20)", "Published Count = COUNTIF(D2:D20, \"Published\")"],
          dropdownFields: ["Status: Planned, Draft, Published, Review", "Channel: Instagram, Blog, Email, TikTok"],
          themeStylingInstructions: ["Use subtle grid lines", "Keep note column wider for workflow details"]
        },
        {
          tabName: "Content Dashboard",
          purpose: "Summarize planned, published, and in-progress content for quick editorial review.",
          columnHeaders: ["Metric", "Value"],
          sampleRows: [
            ["Planned Posts", "=COUNTA('Content Tracker'!A2:A20)"],
            ["Published", "=COUNTIF('Content Tracker'!D2:D20,\"Published\")"],
            ["In Progress", "=COUNTIF('Content Tracker'!D2:D20,\"Draft\")"]
          ],
          formulas: ["Remaining = Planned Posts - Published", "Upcoming This Week can use COUNTIFS with date filters"],
          dropdownFields: [],
          themeStylingInstructions: ["Use simple dashboard blocks", "Accent headline metrics with soft creative color"]
        }
      ],
      keyFormulas: [
        "Content Dashboard counts planned, published, and draft content with COUNTA/COUNTIF",
        "Remaining content equals planned items minus published items",
        "Upcoming content can be filtered with date-based COUNTIFS formulas"
      ],
      whatBuyerGets: [
        "Editable .xlsx workbook",
        "Cover and setup tab",
        "Content tracker tab with formulas",
        "Dashboard summary tab",
        "Status and channel dropdown fields"
      ]
    },
    generatedProductPages: [
      {
        pageName: "Cover & Info Tab",
        layoutDescription:
          "Workbook title, content goals, and planning instructions arranged for editorial clarity.",
        sections: ["Workbook title", "Content goals", "Instructions"],
        textContent: [
          "Workbook title: Content Planner Spreadsheet",
          "Primary audience: _________________",
          "Publishing frequency goal: _________________"
        ],
        visualStyleInstructions: ["Clean editorial layout", "Clear content goal fields", "Simple instruction area"],
        colorPaletteSuggestion: "White, black, pale yellow",
        fontStyleSuggestion: "Modern sans serif",
        canvaBuildInstructions: [
          "Place a bold title at the top", "Add fields for audience and goals", "Include a short how-to section"
        ]
      },
      {
        pageName: "Main Tracker Tab",
        layoutDescription:
          "Content tracker table with publish date, platform, content type, status, and formula summary columns.",
        sections: ["Publish date", "Channel", "Content type", "Status", "Notes"],
        textContent: [
          "Sample row: May 1 / Instagram / Carousel / Planned / Write caption", "Key formulas: Completed count =COUNTIF(E2:E20, \"Completed\"), Remaining =COUNTA(A2:A20) - Completed count"],
        visualStyleInstructions: ["Use subtle grid lines", "Make status dropdown visible", "Keep note area expandable"],
        colorPaletteSuggestion: "Neutral gray, soft teal, cream",
        fontStyleSuggestion: "Readable sans serif",
        canvaBuildInstructions: [
          "Make a tracker table with dates and content status", "Add dropdown values for content type and status", "Feature a small formula summary area"
        ]
      },
      {
        pageName: "Dashboard Tab",
        layoutDescription:
          "A content summary dashboard showing upcoming pieces, task progress, and publishing velocity metrics.",
        sections: ["Upcoming posts", "Progress metrics", "Next actions"],
        textContent: [
          "Key formulas: Upcoming this week = COUNTIFS(B2:B20, '>= ' & TODAY(), C2:C20, 'Planned')"],
        visualStyleInstructions: ["Organize metrics in readable cards", "Use accent color for headline figures"],
        colorPaletteSuggestion: "Soft navy, blush, white",
        fontStyleSuggestion: "Bold headings with clear body text",
        canvaBuildInstructions: [
          "Create blocks for upcoming content and progress metrics", "Label each value clearly", "Add a note area for next priorities"
        ]
      }
    ],
    difficulty: "Low",
    timeToMVP: "1 day"
  });
}

function inferListingBlueprint(goal: string): CommerceBlueprint {
  const source = goal.toLowerCase();

  if ((source.includes("spreadsheet") && source.includes("wedding")) || source.includes("wedding planner")) {
    return createWeddingPlannerSpreadsheetBlueprint();
  }

  if (source.includes("spreadsheet") && source.includes("budget")) {
    return createBudgetSpreadsheetBlueprint();
  }

  if (source.includes("spreadsheet") && (source.includes("debt") || source.includes("payoff"))) {
    return createDebtPayoffTrackerSpreadsheetBlueprint();
  }

  if (source.includes("spreadsheet") && source.includes("content")) {
    return createContentPlannerSpreadsheetBlueprint();
  }

  if (source.includes("teacher") || source.includes("classroom")) {
    return withRenderedDesignBlueprint({
      niche: "teacher printable kits",
      customer: "elementary teachers who want classroom-ready printable behavior and routine tools",
      productTitle: "Boho Classroom Routine Printable Kit",
      trendSummary:
        "Printable classroom kits sell because teachers want instant-use visual systems that save prep time and support classroom routines without waiting for shipping.",
      conceptSummary:
        "Create a cohesive printable classroom kit with calm boho styling, clear routine cards, behavior charts, and student-friendly visual trackers for daily classroom use.",
      theme: "soft neutral",
      productFormat: "printable",
      pageBreakdown: [
        "12-page PDF classroom routine kit",
        "Morning routine visual chart",
        "Dismissal checklist",
        "Behavior tracker sheet",
        "Class jobs chart",
        "Emergency procedure checklist"
      ],
      mockupPrompt:
        "Create an ecommerce mockup scene showing a boho classroom printable kit displayed as printed routine cards, tracker sheets, and a classroom binder cover on a bright elementary teacher desk with neutral decor, warm daylight, tidy school supplies, and a clean commerce-ready composition.",
      productType: "Digital printable classroom kit",
      fileFormat: "PDF, PNG",
      listingTitle:
        "Boho Classroom Routine Printable Kit, Teacher Visual Schedule, Behavior Tracker, Class Jobs Chart, Emergency Checklist, Instant Download",
      description:
        "Help your classroom run more smoothly with a printable routine kit designed for busy teachers who need practical visual tools fast. This digital download includes a coordinated set of classroom management printables with calm boho styling, making it easy to support routines, responsibilities, and transitions throughout the school day.\n\nWhat is included:\n- A 12-page printable classroom toolkit\n- Visual schedule and routine support pages\n- Behavior tracking and classroom jobs pages\n- Emergency checklist materials for quick reference\n- Instant digital download access after purchase\n\nWhy teachers love it:\n- Saves prep time with ready-to-print classroom tools\n- Supports structure and independence for students\n- Matches modern neutral classroom decor\n\nPlease note:\n- Digital product only\n- No physical item will be shipped\n- Colors may vary slightly depending on screen and printer settings",
      tags: [
        "classroom decor",
        "teacher printable",
        "boho classroom",
        "affirmation poster",
        "elementary decor",
        "school wall art",
        "instant download",
        "neutral classroom",
        "rainbow classroom",
        "teacher gift",
        "bulletin board",
        "printable poster",
        "classroom wall art"
      ],
      price: "$6.99",
      fileDelivery:
        "Buyer receives an instant digital download with one printable PDF file and matching PNG pages for easy classroom printing. No physical product included.",
      productContents: [
        "12-page PDF",
        "morning routine visual chart",
        "behavior tracker",
        "class jobs chart",
        "emergency checklist",
        "matching PNG pages"
      ],
      generatedProductPages: [
        {
          pageName: "Cover Page",
          layoutDescription: "Top-centered title block, middle subtitle band, bottom personalization strip",
          sections: ["Top title area", "Middle subtitle area", "Bottom name field"],
          textContent: [
            "Boho Classroom Routine Printable Kit",
            "Daily systems for calm, clear classroom transitions",
            "Teacher Name: ____________________"
          ],
          visualStyleInstructions: ["Soft neutral header band", "Rounded text containers", "Gentle spacing between blocks"],
          colorPaletteSuggestion: "Warm beige, soft clay, muted sage",
          fontStyleSuggestion: "Elegant rounded serif for title, clean sans serif for fields",
          canvaBuildInstructions: [
            "Create a portrait page with a large top text box for the title",
            "Add a rounded rectangle banner in the middle for the subtitle",
            "Place a slim labeled text field near the bottom for teacher name"
          ]
        },
        {
          pageName: "Monthly Overview",
          layoutDescription: "Top header bar, middle two-column planning grid, bottom checklist strip",
          sections: ["Goals block", "Important dates block", "Prep checklist block"],
          textContent: [
            "[ SECTION: MONTHLY OVERVIEW ]",
            "[ GOALS ] Classroom goal: ____________________ | Routine priority: ____________________",
            "[ IMPORTANT DATES ] Week 1 | Week 2 | Week 3 | Week 4",
            "[ PREP CHECKLIST ] Print visuals | Update class jobs | Review emergency steps"
          ],
          visualStyleInstructions: ["Use lightly tinted blocks", "Keep margins wide", "Group each planning area in its own rounded container"],
          colorPaletteSuggestion: "Oatmeal, ivory, muted terracotta",
          fontStyleSuggestion: "Soft serif headers with neutral sans serif body text",
          canvaBuildInstructions: [
            "Add a full-width header bar across the top",
            "Place two rounded rectangles side by side for goals and important dates",
            "Add a full-width rounded checklist box at the bottom"
          ]
        },
        {
          pageName: "Weekly Routine Planner",
          layoutDescription: "Top weekly title area, middle stacked routine blocks, bottom notes band",
          sections: ["Morning routine block", "Transition cues block", "Teacher notes block"],
          textContent: [
            "[ MORNING ROUTINE ] Arrival | Unpack | Attendance | Warm-up task",
            "[ TRANSITIONS ] Before lunch: ____________________ | After specials: ____________________",
            "[ TEACHER NOTES ] What worked this week? | What needs reinforcement next week?"
          ],
          visualStyleInstructions: ["Repeat same block shape down the page", "Use subtle dividers between routine groups", "Keep note area larger for writing space"],
          colorPaletteSuggestion: "Pale sand, dusty blush, warm gray",
          fontStyleSuggestion: "Friendly serif page title with clean worksheet text",
          canvaBuildInstructions: [
            "Duplicate three vertical rounded blocks",
            "Label each block with a small uppercase header",
            "Leave generous space under each label for printable writing lines"
          ]
        },
        {
          pageName: "Behavior Tracker",
          layoutDescription: "Top title band, middle table layout, bottom two reflection prompts",
          sections: ["Tracking table", "Celebration block", "Reflection block"],
          textContent: [
            "[ TRACKER TABLE ] Student Name | Goal | Mon | Tue | Wed | Thu | Fri",
            "[ CELEBRATION ] This week we improved by: ____________________",
            "[ REFLECTION ] One support to add next week: ____________________"
          ],
          visualStyleInstructions: ["Use clear ruled table lines", "Make reflection blocks feel softer and more open", "Keep title area prominent"],
          colorPaletteSuggestion: "Cream, muted mauve, soft charcoal",
          fontStyleSuggestion: "Strong sans serif for table labels, softer serif for headings",
          canvaBuildInstructions: [
            "Create a top header bar with page title",
            "Insert a grid table in the center of the page",
            "Add two full-width prompt boxes underneath the table"
          ]
        },
        {
          pageName: "Class Jobs Planner",
          layoutDescription: "Top title area, middle role assignment list, bottom notes and reminder section",
          sections: ["Assignment list", "Rotation note field", "Reminder area"],
          textContent: [
            "[ JOB ASSIGNMENTS ] Line Leader | ____________________ ; Supply Helper | ____________________ ; Calendar Helper | ____________________",
            "[ ROTATION NOTES ] Change jobs every: ____________________",
            "[ REMINDER ] Preview expectations before switching roles."
          ],
          visualStyleInstructions: ["Use repeated assignment rows", "Add subtle separators between rows", "Keep reminder box highlighted"],
          colorPaletteSuggestion: "Stone, soft taupe, clay pink",
          fontStyleSuggestion: "Neutral serif headings with practical worksheet sans serif",
          canvaBuildInstructions: [
            "Add a top page title box",
            "Stack repeated assignment rows in the center",
            "Place a highlighted notes box at the bottom"
          ]
        },
        {
          pageName: "Launch Checklist",
          layoutDescription: "Top checklist title bar, middle two grouped checklists, bottom completion field",
          sections: ["Setup checklist", "Readiness checklist", "Completion field"],
          textContent: [
            "[ SETUP STEPS ] Laminate visuals | Hang routine cards | Prepare tracker copies | Explain reward system",
            "[ CLASSROOM READINESS ] Students understand signals | Emergency plan reviewed | Jobs chart visible",
            "[ COMPLETION ] Launch date: ____________________"
          ],
          visualStyleInstructions: ["Use checkbox-style rows", "Keep setup and readiness in matching containers", "Completion field should stand alone at bottom"],
          colorPaletteSuggestion: "Muted oat, linen white, soft brown",
          fontStyleSuggestion: "Checklist-friendly sans serif with soft section headers",
          canvaBuildInstructions: [
            "Build two same-size checklist boxes across the middle of the page",
            "Use icon bullets or checkbox markers for each list item",
            "Add a narrow completion field at the bottom"
          ]
        },
        {
          pageName: "Monthly Review",
          layoutDescription: "Top review heading, middle stacked reflection boxes, bottom next-month planning strip",
          sections: ["Wins block", "Challenges block", "Next month plan block"],
          textContent: [
            "[ WINS ] Students responded best to: ____________________",
            "[ CHALLENGES ] Most difficult transition: ____________________",
            "[ NEXT MONTH PLAN ] Keep: ____________________ | Adjust: ____________________ | Add: ____________________"
          ],
          visualStyleInstructions: ["Use equal-height reflection blocks", "Keep lots of breathing room", "Make next-month planning slightly bolder"],
          colorPaletteSuggestion: "Ivory, warm beige, muted rosewood",
          fontStyleSuggestion: "Calm serif headings with light sans serif helper text",
          canvaBuildInstructions: [
            "Stack three large rounded containers vertically",
            "Give each reflection area a small uppercase label",
            "Make the final planning section slightly darker for emphasis"
          ]
        }
      ],
      difficulty: "Low",
      timeToMVP: "1-2 days"
    });
  }

  if (source.includes("wedding") || source.includes("bridal")) {
    return withRenderedDesignBlueprint({
      niche: "wedding templates",
      customer: "brides and event planners who need elegant instant-download signage",
      productTitle: "Minimalist Wedding Welcome Sign Template Bundle",
      trendSummary:
        "Editable wedding signage remains a strong digital category because couples want polished event details without the turnaround time or cost of custom stationery.",
      conceptSummary:
        "Build a clean editable signage bundle with modern serif typography, simple layout hierarchy, and matching wedding-day template variations.",
      theme: "feminine aesthetic",
      productFormat: "printable",
      pageBreakdown: [
        "Editable welcome sign template",
        "Seating chart template",
        "Table number template",
        "Bar menu template",
        "Guestbook sign template",
        "Instruction page"
      ],
      mockupPrompt:
        "Create an ecommerce mockup scene of a minimalist wedding welcome sign on an easel with matching table signs at a bright neutral venue, soft florals, elegant modern serif typography, and premium editorial lighting.",
      productType: "Digital wedding template bundle",
      fileFormat: "Canva, PDF, PNG",
      listingTitle:
        "Wedding Welcome Sign Template Bundle, Minimalist Editable Wedding Signage, Modern Bridal Shower Sign Set, Instant Download Templett Style",
      description:
        "Create a polished wedding day look with a matching bundle of editable wedding signs designed for modern celebrations. This digital template set is ideal for welcome signs, seating displays, bar menus, guestbook tables, and bridal events.\n\nWhat you get:\n- A coordinated collection of minimalist wedding sign templates\n- Editable text fields for names, dates, and event details\n- High-resolution digital files for easy printing\n- Instant download for a faster planning workflow\n\nPerfect for:\n- Wedding welcome tables\n- Bridal shower events\n- Reception signage\n- DIY wedding decor planning\n\nPlease note:\n- Digital files only\n- No printed materials or frames included\n- Editing platform details should be included in the delivery instructions you provide to buyers",
      tags: [
        "wedding sign",
        "editable template",
        "welcome sign",
        "bridal shower",
        "wedding decor",
        "instant download",
        "minimalist wedding",
        "event signage",
        "modern template",
        "reception sign",
        "bridal template",
        "printable wedding",
        "diy wedding decor"
      ],
      price: "$9.99",
      fileDelivery:
        "Buyer receives a PDF with Canva access links, editing instructions, and printable PDF and PNG export guidance. No physical item included.",
      productContents: [
        "editable welcome sign template",
        "editable seating chart",
        "editable table number templates",
        "editable bar menu sign",
        "guestbook sign template",
        "instruction PDF"
      ],
      generatedProductPages: [
        {
          pageName: "Cover Page",
          layoutDescription: "Top editorial title, middle subtitle band, bottom name lockup",
          sections: ["Title area", "Subtitle area", "Names lockup"],
          textContent: [
            "Minimalist Wedding Welcome Sign Template Bundle",
            "Modern editable signage for elegant wedding events",
            "Name One & Name Two"
          ],
          visualStyleInstructions: ["Keep layout airy", "Use elegant alignment", "Add refined spacing between title and names"],
          colorPaletteSuggestion: "Blush nude, champagne, warm ivory",
          fontStyleSuggestion: "High-contrast serif title with thin uppercase sans serif accents",
          canvaBuildInstructions: [
            "Set a centered title at the top third of the page",
            "Add a narrow subtitle band underneath",
            "Place couple names near the lower center with generous white space"
          ]
        },
        {
          pageName: "Welcome Sign Template",
          layoutDescription: "Top centered headline, middle name/date stack, bottom venue and welcome line",
          sections: ["Headline", "Editable names and date", "Footer line"],
          textContent: [
            "[ HEADLINE ] Welcome to the Wedding of",
            "[ DETAILS ] Couple Names | Wedding Date | Venue Name",
            "[ FOOTER ] We are so happy you are here"
          ],
          visualStyleInstructions: ["Center-align all major text", "Use thin line dividers", "Keep footer elegant and understated"],
          colorPaletteSuggestion: "Rose beige, soft pearl, muted taupe",
          fontStyleSuggestion: "Elegant serif centerpiece with minimalist supporting sans serif",
          canvaBuildInstructions: [
            "Create a centered text block at the top for the headline",
            "Stack large name and date fields in the middle",
            "Add venue and footer lines near the bottom with thin dividers"
          ]
        },
        {
          pageName: "Seating Chart Template",
          layoutDescription: "Top title strip, middle multi-column table layout, bottom organizer note",
          sections: ["Table columns", "Organizer prompt", "Readability note"],
          textContent: [
            "[ TABLE LAYOUT ] Table 1 | Guest Names ; Table 2 | Guest Names ; Table 3 | Guest Names",
            "[ ORGANIZER ] List guests alphabetically or by table",
            "[ DESIGN NOTE ] Keep names evenly spaced for print readability"
          ],
          visualStyleInstructions: ["Use clean vertical columns", "Add subtle divider rules", "Keep all spacing symmetrical"],
          colorPaletteSuggestion: "Dusty rose, champagne cream, soft gray",
          fontStyleSuggestion: "Refined serif title with neat uppercase table labels",
          canvaBuildInstructions: [
            "Place the page title at the top center",
            "Build evenly spaced columns for each table group",
            "Add a small planner note box at the bottom"
          ]
        },
        {
          pageName: "Wedding Sign Checklist",
          layoutDescription: "Top title, middle twin planning blocks, bottom deadline field",
          sections: ["Sign checklist", "Editing notes", "Deadline prompt"],
          textContent: [
            "[ CHECKLIST ] Welcome sign | Seating chart | Bar menu | Guestbook sign",
            "[ EDITING NOTES ] Confirm spelling | Confirm venue details | Export print files",
            "[ DEADLINE ] Final print approval date: ____________________"
          ],
          visualStyleInstructions: ["Two balanced mid-page containers", "Use checklist markers", "Bottom field should feel formal and neat"],
          colorPaletteSuggestion: "Soft blush, ivory, warm gold-toned beige",
          fontStyleSuggestion: "Modern serif headers with elegant small caps accents",
          canvaBuildInstructions: [
            "Add a title line across the top",
            "Place two equal rounded boxes in the middle for checklist and notes",
            "Add a slim formal deadline bar at the bottom"
          ]
        },
        {
          pageName: "Bar Menu and Guestbook Sign",
          layoutDescription: "Top split heading layout, middle menu grid, bottom guestbook message",
          sections: ["Menu block", "Guestbook message", "Print tip"],
          textContent: [
            "[ MENU ] Signature Drinks | Wine | Beer | Cocktails",
            "[ GUESTBOOK ] Please sign our guestbook and share your best wishes",
            "[ PRINT TIP ] Use heavier cardstock for table signage"
          ],
          visualStyleInstructions: ["Menu area should feel editorial", "Guestbook section should be softer and welcoming", "Keep margins spacious"],
          colorPaletteSuggestion: "Ivory, dusty mauve, soft taupe",
          fontStyleSuggestion: "Romantic serif title with understated sans serif notes",
          canvaBuildInstructions: [
            "Set up a split visual hierarchy between menu and guestbook sections",
            "Use centered typography for menu items",
            "Add a softer framed note box for the guestbook message"
          ]
        },
        {
          pageName: "Final Delivery Checklist",
          layoutDescription: "Top checklist header, middle two stacked review containers, bottom completion toggle line",
          sections: ["Final review", "Delivery prep", "Completion status"],
          textContent: [
            "[ FINAL REVIEW ] Check margins | Check print sizes | Confirm color settings | Save PNG and PDF",
            "[ DELIVERY PREP ] Upload editable file link | Add instruction sheet | Prepare buyer notes",
            "[ COMPLETION ] Template package ready: Yes / No"
          ],
          visualStyleInstructions: ["Use checklist rows with light line separators", "Keep bottom status bold", "Maintain soft luxury spacing"],
          colorPaletteSuggestion: "Pearl, soft rose, greige",
          fontStyleSuggestion: "Thin serif headings with clean modern checklist text",
          canvaBuildInstructions: [
            "Use one title block at top",
            "Create stacked rounded rectangles for the two main checklist areas",
            "Add a bold completion line at the bottom"
          ]
        },
        {
          pageName: "Collection Expansion Notes",
          layoutDescription: "Top reflective heading, middle feedback and update blocks, bottom expansion ideas strip",
          sections: ["Buyer feedback", "Update notes", "Expansion ideas"],
          textContent: [
            "[ BUYER FEEDBACK ] Most requested sign style: ____________________",
            "[ UPDATE NOTES ] Template to improve next version: ____________________",
            "[ EXPANSION IDEAS ] Menus | Programs | Thank-you cards"
          ],
          visualStyleInstructions: ["Keep the feedback area spacious", "Use delicate separators", "Make expansion ideas concise and visually grouped"],
          colorPaletteSuggestion: "Blushed ivory, warm beige, muted mauve",
          fontStyleSuggestion: "Elegant serif headers with fine uppercase labels",
          canvaBuildInstructions: [
            "Create three vertically stacked writing blocks",
            "Use smaller top labels to identify each block",
            "Keep the final strip more compact for short idea prompts"
          ]
        }
      ],
      difficulty: "Medium",
      timeToMVP: "2-3 days"
    });
  }

  return withRenderedDesignBlueprint({
    niche: "digital business templates",
    customer: "shop owners and side hustlers who want plug-and-play digital templates they can edit instantly",
    productTitle: "Small Business Content Planner Template Kit",
    trendSummary:
      "Digital planners, trackers, and editable template kits keep selling because buyers want immediate organization tools they can start using the same day.",
    conceptSummary:
      "Build a clean digital planner kit that helps small business owners organize content, promotions, and weekly tasks in one editable package.",
    theme: "bold modern",
    productFormat: "printable",
    pageBreakdown: [
      "12-page business planner PDF",
      "Weekly content calendar",
      "promotion tracker",
      "task planner",
      "launch checklist",
      "monthly review sheet"
    ],
    mockupPrompt:
      "Create an ecommerce mockup image showing a digital small business planner template kit on a laptop and tablet with clean neutral branding, visible planner pages, checklist sheets, calendar layouts, minimal desk props, and bright polished ecommerce lighting.",
    productType: "Digital planner and template kit",
    fileFormat: "PDF, Canva",
    listingTitle:
      "Small Business Content Planner Template Kit, Editable Canva Marketing Planner, Weekly Tracker, Launch Checklist, Digital Download",
    description:
      "Plan your content and promotions with a digital template kit made for small business owners who want clarity without building a system from scratch. This instant download includes editable planning pages for weekly content, campaign organization, task tracking, and launch prep so you can manage your business more consistently.\n\nWhat is included:\n- A 12-page business planning kit\n- Editable Canva layouts for easy customization\n- Weekly tracker and content planning pages\n- Launch checklist and monthly review pages\n- Instant digital download access after purchase\n\nPerfect for:\n- shop owners\n- service providers\n- digital product shops\n- small business owners managing content and promotions\n\nPlease note:\n- Digital product only\n- No physical product will be shipped\n- Buyers need a Canva account to edit the template version",
    tags: [
      "canva template",
      "small business",
      "social media kit",
      "instagram template",
      "editable canva",
      "digital download",
      "marketing template",
      "business toolkit",
      "content template",
      "shop owner",
      "brand template",
      "promo graphics",
      "shop owner tools"
    ],
      price: "$8.99",
      fileDelivery:
        "Buyer receives a PDF with Canva access links, a printable PDF planner version, and quick-start instructions. No physical product included.",
    productContents: [
      "12-page PDF",
      "weekly content planner",
      "promotion tracker",
      "task planner",
      "launch checklist",
      "monthly review sheet",
      "editable Canva version"
    ],
    generatedProductPages: [
      {
        pageName: "Cover Page",
        layoutDescription: "Top bold header band, middle statement block, bottom business name field",
        sections: ["Header area", "Subtitle block", "Brand field"],
        textContent: [
          "Small Business Content Planner Template Kit",
          "Plan your content, promotions, and weekly priorities in one place",
          "Business Name: ____________________"
        ],
        visualStyleInstructions: ["Use bold title treatment", "Create confident section spacing", "Keep lower brand field clean and editable"],
        colorPaletteSuggestion: "Charcoal, ivory, muted sand",
        fontStyleSuggestion: "Bold modern sans serif heading with clean support text",
        canvaBuildInstructions: [
          "Add a full-width dark header bar at the top with large white title text",
          "Place a centered subtitle container in the middle",
          "Add a narrow editable name field near the bottom"
        ]
      },
      {
        pageName: "Monthly Overview",
        layoutDescription: "Top title bar, middle two-column grid, bottom key dates strip",
        sections: ["Goals block", "Content focus block", "Important dates strip"],
        textContent: [
          "[ SECTION: MONTHLY OVERVIEW ]",
          "[ GOALS ] Primary revenue goal: ____________________ | Key offer to promote: ____________________",
          "[ CONTENT FOCUS ] Theme of the month: ____________________ | Audience problem to address: ____________________",
          "[ IMPORTANT DATES ] Launch dates | Holiday campaigns | Promo deadlines"
        ],
        visualStyleInstructions: ["Use sharp modern containers", "Keep columns aligned", "Use strong hierarchy between title and planning blocks"],
        colorPaletteSuggestion: "Off-white, blackened charcoal, muted beige",
        fontStyleSuggestion: "Bold sans serif headers with minimalist body text",
        canvaBuildInstructions: [
          "Create a top title strip with strong contrast",
          "Place two equal content blocks in the middle of the page",
          "Add a horizontal dates strip across the bottom"
        ]
      },
      {
        pageName: "Weekly Content Planner",
        layoutDescription: "Top page heading, middle structured planning table, bottom strategy note area",
        sections: ["Planner table", "Content prompt", "Batching reminder"],
        textContent: [
          "[ PLANNER TABLE ] Day | Platform | Content Topic | CTA | Status",
          "[ CONTENT PROMPT ] What do I want my audience to do this week?",
          "[ BATCHING REMINDER ] Create all graphics before scheduling posts"
        ],
        visualStyleInstructions: ["Use a crisp grid in the center", "Make note areas feel structured not decorative", "Keep page rhythm consistent"],
        colorPaletteSuggestion: "Charcoal, warm white, slate beige",
        fontStyleSuggestion: "Clean geometric sans serif throughout",
        canvaBuildInstructions: [
          "Add a strong page title at the top",
          "Insert a clean table across the center with five columns",
          "Add two smaller note blocks below the table"
        ]
      },
      {
        pageName: "Promotion Tracker",
        layoutDescription: "Top campaign header, middle large data grid, bottom priority and optimization notes",
        sections: ["Campaign table", "Priority prompt", "Optimization note"],
        textContent: [
          "[ CAMPAIGN TABLE ] Campaign | Start Date | Offer | Channel | Results Notes",
          "[ PRIORITY ] Which promotion has the highest upside this month?",
          "[ OPTIMIZATION ] Update after each campaign review"
        ],
        visualStyleInstructions: ["Keep the table dominant", "Use subtle modern dividers", "Lower notes should feel concise and operational"],
        colorPaletteSuggestion: "Black, warm gray, pale stone",
        fontStyleSuggestion: "Bold uppercase labels with neutral sans serif rows",
        canvaBuildInstructions: [
          "Build a wide table block in the center of the page",
          "Add a narrow question field below for priority focus",
          "Finish with a smaller optimization note box"
        ]
      },
      {
        pageName: "Task Planner",
        layoutDescription: "Top task title row, middle task table, bottom dual reflection prompts",
        sections: ["Task fields", "Focus prompt", "Delegation prompt"],
        textContent: [
          "[ TASK FIELDS ] Task | Owner | Priority | Due Date | Status",
          "[ FOCUS ] What are the three most important tasks this week?",
          "[ DELEGATION ] What can be postponed, automated, or delegated?"
        ],
        visualStyleInstructions: ["Use compact rows", "Bottom prompts should mirror each other visually", "Maintain bold modern spacing"],
        colorPaletteSuggestion: "Soft white, graphite, mushroom beige",
        fontStyleSuggestion: "Modern sans serif with bold labels and airy tracking",
        canvaBuildInstructions: [
          "Set a title line at the top",
          "Place a structured table in the middle section",
          "Add two matching note boxes underneath for focus and delegation"
        ]
      },
      {
        pageName: "Launch Checklist",
        layoutDescription: "Top title header, middle three stacked checklist blocks, bottom completion strip",
        sections: ["Pre-launch block", "Launch day block", "Post-launch block"],
        textContent: [
          "[ PRE-LAUNCH ] Finalize offer | Write email copy | Create social assets | Check links",
          "[ LAUNCH DAY ] Publish content | Monitor responses | Answer buyer questions",
          "[ POST-LAUNCH ] Review sales | Capture lessons learned | Plan follow-up"
        ],
        visualStyleInstructions: ["Three stacked structured blocks", "Use checkbox style cues", "Keep page energetic and orderly"],
        colorPaletteSuggestion: "Graphite, ivory, soft taupe",
        fontStyleSuggestion: "Strong condensed sans serif for headings, simple body text",
        canvaBuildInstructions: [
          "Add a strong page title at top",
          "Create three stacked checklist containers of equal width",
          "Use checkbox icons or markers at the start of each line"
        ]
      },
      {
        pageName: "Monthly Review",
        layoutDescription: "Top review banner, middle stacked reflection blocks, bottom three-part adjustment strip",
        sections: ["Wins block", "Challenges block", "Next month adjustments"],
        textContent: [
          "[ WINS ] Best-performing content: ____________________ | Highest-converting offer: ____________________",
          "[ CHALLENGES ] What slowed progress this month?",
          "[ NEXT MONTH ADJUSTMENTS ] Start doing: ______ | Stop doing: ______ | Keep doing: ______"
        ],
        visualStyleInstructions: ["Use larger top heading", "Keep reflection blocks evenly spaced", "Bottom adjustment strip should feel decisive"],
        colorPaletteSuggestion: "Warm white, charcoal, light beige",
        fontStyleSuggestion: "Bold sans serif title with lighter utility text",
        canvaBuildInstructions: [
          "Create a full-width banner heading at the top",
          "Add two larger reflection containers in the middle",
          "Use a three-column strip for start, stop, and keep at the bottom"
        ]
      }
    ],
    difficulty: "Low",
    timeToMVP: "1-2 days"
  });
}

function looksLikeServiceGoal(goal: string, channel: CommerceChannel) {
  if (channel === "fiverr") {
    return true;
  }

  return /(service|client|gig|automation|script writing|video scripting|spreadsheet creation|planner design|ai content|image generation)/i.test(
    goal
  );
}

function inferServiceType(goal: string): SupportedServiceType {
  const source = goal.toLowerCase();

  if (/video script|video scripting|youtube script|reel script/.test(source)) {
    return "video scripting";
  }

  if (/script writing|scriptwriter|sales script|ad script/.test(source)) {
    return "script writing";
  }

  if (/spreadsheet|dashboard|tracker|excel|google sheets/.test(source)) {
    return "spreadsheet creation";
  }

  if (/planner design|planner|worksheet|printable/.test(source)) {
    return "planner design";
  }

  if (/automation|zapier|make|workflow|airtable/.test(source)) {
    return "automation setup";
  }

  if (/image generation|thumbnail|visual prompt|mockup/.test(source)) {
    return "image generation";
  }

  if (/ai content|content generation|caption|newsletter|prompt/.test(source)) {
    return "ai content generation";
  }

  return "script writing";
}

function inferServiceNiche(goal: string) {
  const source = goal.toLowerCase();

  if (/real estate/.test(source)) {
    return "real estate marketing";
  }

  if (/wedding|bridal/.test(source)) {
    return "wedding businesses";
  }

  if (/finance|budget|money/.test(source)) {
    return "finance operations";
  }

  if (/creator|youtube|instagram|tiktok/.test(source)) {
    return "creator growth";
  }

  if (/agency|client/.test(source)) {
    return "client services";
  }

  return "online business growth";
}

function inferServiceBuyer(serviceType: SupportedServiceType, niche: string) {
  switch (serviceType) {
    case "script writing":
      return `business owners and ${niche} operators who need persuasive scripts fast`;
    case "spreadsheet creation":
      return `founders and ${niche} teams who need clean operational tracking systems`;
    case "planner design":
      return `coaches, creators, and ${niche} sellers who want branded planning assets`;
    case "ai content generation":
      return `lean teams in ${niche} who need faster content production without losing clarity`;
    case "automation setup":
      return `service businesses in ${niche} that need repeatable workflow automation`;
    case "image generation":
      return `marketers and ${niche} brands that need fast visual concept output`;
    case "video scripting":
      return `creators and ${niche} brands that need short-form and long-form scripts`;
  }

  return `businesses in ${niche} that need a clear done-for-you service`;
}

function buildServiceDeliverables(serviceType: SupportedServiceType): string[] {
  switch (serviceType) {
    case "script writing":
      return ["conversion-focused script", "hook options", "CTA options", "one revision round"];
    case "spreadsheet creation":
      return ["custom spreadsheet build", "formula setup", "dashboard summary", "handoff notes"];
    case "planner design":
      return ["planner page set", "layout direction", "editable design guidance", "delivery-ready asset files"];
    case "ai content generation":
      return ["content batch", "prompt framework", "caption or post copy", "repurposing notes"];
    case "automation setup":
      return ["workflow map", "automation setup", "testing pass", "handoff guide"];
    case "image generation":
      return ["generated image set", "prompt pack", "style direction notes", "revision round"];
    case "video scripting":
      return ["video scripts", "hook variations", "CTA variations", "content angle notes"];
  }

  return ["client deliverable", "handoff notes"];
}

function buildServiceProcess(serviceType: SupportedServiceType): string[] {
  switch (serviceType) {
    case "script writing":
      return [
        "Review the client brief, offer, audience, and desired call to action.",
        "Map the strongest conversion angle and write a first-pass script.",
        "Refine the script for pacing, clarity, and buyer intent.",
        "Deliver the final script with hooks and CTA options."
      ];
    case "spreadsheet creation":
      return [
        "Review the client's workflow, metrics, and data tracking needs.",
        "Design the sheet structure, tabs, columns, and formulas.",
        "Build the spreadsheet and test core logic.",
        "Deliver the finished file with handoff notes and setup guidance."
      ];
    case "planner design":
      return [
        "Review the niche, planner use case, and visual direction.",
        "Plan the page set, hierarchy, and buyer flow.",
        "Create the draft layouts and refine the design system.",
        "Deliver the final planner assets with editable workflow notes."
      ];
    case "ai content generation":
      return [
        "Review the client's offer, voice, audience, and platform goals.",
        "Build a repeatable prompt and angle framework.",
        "Generate the first content batch and tune for clarity.",
        "Deliver the content set with reuse and repurposing guidance."
      ];
    case "automation setup":
      return [
        "Audit the current workflow and identify the highest-friction steps.",
        "Map the automation logic, triggers, and outputs.",
        "Build and test the automation sequence.",
        "Deliver the working setup with handoff and scaling notes."
      ];
    case "image generation":
      return [
        "Review the visual brief, references, and target use case.",
        "Create a prompt strategy and style direction.",
        "Generate image drafts and refine the strongest set.",
        "Deliver the final image pack with reusable prompts."
      ];
    case "video scripting":
      return [
        "Review the topic, audience, offer, and video objective.",
        "Map the hook, structure, key beats, and CTA.",
        "Write and tighten the script for retention and clarity.",
        "Deliver the final scripts with alternate hooks."
      ];
  }

  return ["Review the brief.", "Plan the deliverable.", "Execute the work.", "Deliver the final service package."];
}

function buildServicePackages(serviceType: SupportedServiceType): ServicePackageSpec[] {
  const deliverables = buildServiceDeliverables(serviceType);

  return [
    {
      name: "Basic",
      priceRange: "$25-$45",
      turnaroundTime: "2 days",
      deliverables: deliverables.slice(0, 2)
    },
    {
      name: "Standard",
      priceRange: "$55-$95",
      turnaroundTime: "3 days",
      deliverables: deliverables.slice(0, 3)
    },
    {
      name: "Premium",
      priceRange: "$110-$180",
      turnaroundTime: "5 days",
      deliverables
    }
  ];
}

function buildActualWorkForClient(serviceType: SupportedServiceType): string[] {
  switch (serviceType) {
    case "script writing":
      return [
        "I research the client's offer and audience, outline the persuasion angle, then write the script itself.",
        "I tighten the hook, body, and CTA so the client receives usable copy instead of generic filler.",
        "I package the final script with alternates the client can test immediately."
      ];
    case "spreadsheet creation":
      return [
        "I translate the client's workflow into tabs, formulas, filters, and reporting logic.",
        "I build the actual spreadsheet structure and test whether the key calculations behave correctly.",
        "I deliver a working file plus handoff notes so the client can use it without guesswork."
      ];
    case "planner design":
      return [
        "I define the page structure, layout hierarchy, and visual direction for the planner.",
        "I create the actual planner system so the client gets a coherent, sellable asset set.",
        "I package the deliverables with guidance for edits, reuse, or resale."
      ];
    case "ai content generation":
      return [
        "I build the prompt logic and content framework before generating the deliverables.",
        "I edit the output so it matches the client's offer, audience, and voice more closely.",
        "I deliver a content batch the client can publish or adapt quickly."
      ];
    case "automation setup":
      return [
        "I map the workflow, define trigger logic, and build the automation itself.",
        "I test edge cases and clean up the handoff so the client gets a usable system.",
        "I document the setup so the workflow can be maintained and expanded later."
      ];
    case "image generation":
      return [
        "I interpret the brief, create the prompt strategy, and generate the actual image set.",
        "I review the outputs for consistency and select the strongest concepts for delivery.",
        "I package the final visuals and prompts so the client can reuse the workflow."
      ];
    case "video scripting":
      return [
        "I research the topic and audience, then write the script structure from hook to CTA.",
        "I sharpen the pacing and edit the script for clarity, retention, and action.",
        "I deliver scripts that are ready for filming or voiceover."
      ];
  }

  return [
    "I review the brief and define the delivery scope.",
    "I complete the actual client work instead of only outlining ideas.",
    "I package the finished output with clear handoff notes."
  ];
}

function buildReusableWorkflow(serviceType: SupportedServiceType): string[] {
  switch (serviceType) {
    case "script writing":
      return [
        "Reuse the same brief intake, hook framework, and CTA template for future clients.",
        "Scale by turning the offer research and script QA steps into standardized checklists."
      ];
    case "spreadsheet creation":
      return [
        "Reuse the intake questionnaire, base workbook architecture, and dashboard patterns.",
        "Scale by cloning proven spreadsheet frameworks and customizing only the logic layer."
      ];
    case "planner design":
      return [
        "Reuse the page-set template, design system, and planner assembly checklist.",
        "Scale by turning repeated planner layouts into modular starter kits."
      ];
    case "ai content generation":
      return [
        "Reuse the prompt stack, angle library, and QA pass for each niche.",
        "Scale by batching similar clients and swapping niche-specific inputs."
      ];
    case "automation setup":
      return [
        "Reuse the workflow audit checklist, trigger map, and test script.",
        "Scale by productizing common automation recipes for repeated use cases."
      ];
    case "image generation":
      return [
        "Reuse the visual brief format, prompt system, and style review checklist.",
        "Scale by saving winning prompt frameworks for recurring niches and deliverables."
      ];
    case "video scripting":
      return [
        "Reuse the script structure, retention checkpoints, and CTA templates.",
        "Scale by building repeatable script packages around recurring content pillars."
      ];
  }

  return [
    "Reuse the intake and QA checklist for future clients.",
    "Scale by turning repeated work into standard operating steps."
  ];
}

function createServiceBlueprint(goal: string, channel: CommerceChannel): ServiceBlueprint {
  const serviceType = inferServiceType(goal);
  const niche = inferServiceNiche(goal);
  const customer = inferServiceBuyer(serviceType, niche);
  const deliverables = buildServiceDeliverables(serviceType);
  const deliveryProcess = buildServiceProcess(serviceType);
  const packages = buildServicePackages(serviceType);
  const actualWorkForClient = buildActualWorkForClient(serviceType);
  const reusableWorkflow = buildReusableWorkflow(serviceType);

  return {
    channel,
    serviceType,
    niche,
    customer,
    productTitle: `${serviceType} service package`,
    trendSummary: `This ${serviceType} offer is sellable because buyers in ${niche} want a clear outcome, fast delivery, and a provider who can execute the work instead of only offering ideas.`,
    conceptSummary: `Position this as a productized ${serviceType} offer with clear deliverables, layered packages, premium execution, and a reusable fulfillment workflow.`,
    theme: serviceType === "automation setup" ? "dark mode" : serviceType === "planner design" ? "feminine aesthetic" : "bold modern",
    productFormat: "service",
    pageBreakdown: ["Gig overview", "Packages", "Delivery process", "Scaling workflow"],
    mockupPrompt: `Create a clean Fiverr-style service card for ${serviceType}, using premium presentation, clear hierarchy, and a commercial ${niche} feel.`,
    productType: `${serviceType} service`,
    fileFormat: "Managed service delivery",
    listingTitle: `I will provide ${serviceType} for ${niche}`,
    gigTitle: `I will provide ${serviceType} for ${niche}`,
    description: `Sell a ${serviceType} offer to ${customer}. Emphasize a clear buyer outcome, layered packages, premium execution, and a repeatable delivery workflow.`,
    gigDescription: `Sell a ${serviceType} offer to ${customer}. Emphasize a clear buyer outcome, layered packages, premium execution, and a repeatable delivery workflow.`,
    tags: [serviceType, niche, "fiverr service", "client deliverable", "premium workflow"].slice(0, 5),
    price: packages[1].priceRange,
    fileDelivery: "Final delivery happens as a managed client service with documented deliverables, revisions, and handoff notes.",
    productContents: deliverables,
    designBlueprint: [
      `Service type: ${serviceType}`,
      `Packages: ${packages.map((entry) => `${entry.name} ${entry.priceRange}`).join(" | ")}`,
      `Delivery process: ${deliveryProcess.join(" | ")}`
    ],
    generatedProductPages: [],
    difficulty: serviceType === "automation setup" ? "High" : serviceType === "spreadsheet creation" ? "Medium" : "Low",
    timeToMVP: serviceType === "automation setup" ? "2-4 days" : "1-2 days",
    deliverables,
    deliveryProcess,
    packages,
    turnaroundTime: packages[1].turnaroundTime,
    actualWorkForClient,
    reusableWorkflow,
    scalabilityNotes: [
      "Turn successful client briefs into repeatable templates and checklists.",
      "Standardize intake, QA, and handoff so more jobs can be fulfilled without quality drop."
    ]
  };
}

function formatChannelLabel(channel: CommerceChannel) {
  switch (channel) {
    case "print_on_demand":
      return "print on demand";
    default:
      return channel;
  }
}

function deriveDeliverableType(channel: CommerceChannel, productFormat: ProductFormat, productType: string) {
  const normalized = productType.toLowerCase();

  if (channel === "fiverr") {
    return normalized.includes("service") ? "service package" : "client-ready deliverable";
  }

  if (channel === "content") {
    return normalized.includes("template") ? "content template pack" : "content product";
  }

  if (channel === "print_on_demand") {
    return "print-on-demand asset";
  }

  if (normalized.includes("template")) {
    return "template kit";
  }

  return productFormat === "spreadsheet" ? "editable workbook" : "digital download";
}

function resolveStyledListingBlueprint(goal: string, channel: CommerceChannel): StyledProductBlueprint {
  return applyStyleIntelligence({ ...inferListingBlueprint(goal), channel }, goal);
}

function resolveStyledServiceBlueprint(goal: string, channel: CommerceChannel): StyledServiceBlueprint {
  return applyStyleIntelligence(createServiceBlueprint(goal, channel), goal);
}

function resolveStyledCommerceBlueprint(goal: string, channel: CommerceChannel): StyledCommerceBlueprint {
  return looksLikeServiceGoal(goal, channel) ? resolveStyledServiceBlueprint(goal, channel) : resolveStyledListingBlueprint(goal, channel);
}

function isServiceBlueprint(blueprint: StyledCommerceBlueprint): blueprint is StyledServiceBlueprint {
  return blueprint.productFormat === "service";
}

function buildProductTaskBlueprints(mission: Mission, blueprint: StyledProductBlueprint): TaskBlueprint[] {
  const deliverableType = deriveDeliverableType(mission.channel, blueprint.productFormat, blueprint.productType);
  const channelLabel = formatChannelLabel(mission.channel);

  return [
    {
      assignedAgent: "Atlas",
      title: "Research channel opportunity and style patterns",
      description: `Research Agent identifies one ${channelLabel} opportunity for ${blueprint.customer}, then combines local research examples, style notes, and prior feedback to find the strongest sellable direction before Product Agent generation.`,
      outputSummary: `Research Agent selected the ${channelLabel} product ${blueprint.productTitle}, completed style research, and passed the buyer, channel, and sales direction to the Product Agent.`,
      artifacts: [
        {
          title: "Trend Research Brief",
          type: "Trend Research",
          summary: "A focused trend brief describing the chosen product, buyer, channel, and why it should sell.",
          linkLabel: "trend-research-brief.md",
          details: [
            `Product idea: ${blueprint.productTitle}.`,
            `Channel: ${channelLabel}.`,
            `Target buyer: ${blueprint.customer}.`,
            `Deliverable type: ${deliverableType}.`,
            `Why it will sell: ${blueprint.trendSummary}`,
            `High-performing product types: ${blueprint.styleResearch.highPerformingProductTypes.join(", ")}.`,
            `Niche style patterns: ${blueprint.styleResearch.nicheStyles.join(", ")}.`,
            `Recommended style patterns: ${blueprint.styleResearch.recommendedStylePatterns.join(", ") || "None yet"}.`,
            `Research signals: ${blueprint.styleResearch.influencingResearchSignals.join(" | ")}`,
            `Selected style: ${blueprint.selectedStyleProfile.name}.`,
            `Why this style was chosen: ${blueprint.selectedStyleReason}`
          ]
        }
      ]
    },
    {
      assignedAgent: "Compass",
      title: "Generate digital product concept and contents",
      description:
        "Product Agent converts the research brief into one sellable product concept, including the page breakdown, file format, product contents, deliverable type, and the exact mockup prompt needed for imagery.",
      outputSummary: `Product Agent transformed the research brief into the ${blueprint.productTitle} concept, defined its contents and file format, and handed everything to the Listing Agent.`,
      artifacts: [
        {
          title: "Product Design Concept",
          type: "Product Concept",
          summary: "A single commerce-ready product concept based on the research handoff.",
          linkLabel: "product-design-concept.md",
          details: [
            `Concept name: ${blueprint.productTitle}.`,
            `Channel: ${channelLabel}.`,
            `Theme: ${blueprint.theme}.`,
            `Format: ${blueprint.productFormat}.`,
            `Deliverable type: ${deliverableType}.`,
            `Product type: ${blueprint.productType}.`,
            `File format: ${blueprint.fileFormat}.`,
            `Concept direction: ${blueprint.conceptSummary}`,
            `Selected style profile: ${blueprint.selectedStyleProfile.name}.`,
            `Style palette: ${blueprint.selectedStyleProfile.palette.join(", ")}.`,
            `Style layout pattern: ${blueprint.selectedStyleProfile.layout}.`,
            `Style typography: ${blueprint.selectedStyleProfile.typography}.`,
            `Style choice rationale: ${blueprint.selectedStyleReason}`,
            `Page breakdown: ${blueprint.pageBreakdown.join(", ")}.`,
            `Product contents: ${blueprint.productContents.join(", ")}.`,
            ...renderWorkbookSpecDetails(blueprint.workbookSpec)
          ]
        },
        {
          title: "Design Blueprint",
          type: "Design Blueprint",
          summary: "Canva-style page blueprints with layout, style, and build instructions for recreating the product visually.",
          linkLabel: "design-blueprint.txt",
          details: blueprint.designBlueprint
        },
        {
          title: "Mockup Prompt",
          type: "Mockup Prompt",
          summary: "The image prompt the team can use to create primary commerce mockups.",
          linkLabel: "mockup-prompt.txt",
          details: [blueprint.mockupPrompt]
        }
      ]
    },
    {
      assignedAgent: "Anvil",
      title: "Generate one complete listing output",
      description:
        "Listing Agent turns the digital product concept into one publish-ready listing output with title, full description, thirteen tags, price, file delivery description, and product contents.",
      outputSummary: `Listing Agent produced one complete listing output for ${blueprint.productTitle} and passed the draft to the Approval System.`,
      artifacts: [
        {
          title: "Complete Listing Output",
          type: "Listing Output",
          summary: "A single listing package ready for approval review.",
          linkLabel: "listing-output-ready-for-review.md",
          details: [
            `Channel: ${channelLabel}`,
            `Title: ${blueprint.listingTitle}`,
            `Price: ${blueprint.price}`,
            `Tags: ${blueprint.tags.join(", ")}`,
            `Product contents: ${blueprint.productContents.join(", ")}`,
            `File delivery: ${blueprint.fileDelivery}`,
            blueprint.description
          ]
        }
      ]
    },
    {
      assignedAgent: "Core Runtime",
      title: "Prepare approval packet before publishing",
      description:
        "Approval System assembles the final listing output, preserves each agent handoff, and marks the product ready for human approval before any marketplace action.",
      outputSummary: "Approval System assembled the final listing packet and held publication until the user explicitly approves it.",
      artifacts: [
        {
          title: "Approval Packet",
          type: "Approval Packet",
          summary: "The final human-review package showing how the listing moved through the pipeline.",
          linkLabel: "approval-packet.md",
          details: [
            "Research Agent passed niche and trend evidence to Product Agent.",
            "Product Agent passed concept direction and mockup prompt to Listing Agent.",
            "Listing Agent passed the completed listing output to the Approval System.",
            "Publishing remains blocked until the user approves the product."
          ]
        }
      ]
    }
  ];
}

function buildServiceTaskBlueprints(mission: Mission, blueprint: StyledServiceBlueprint): TaskBlueprint[] {
  const channelLabel = formatChannelLabel(mission.channel);

  return [
    {
      assignedAgent: "Atlas",
      title: "Research service demand and buyer angle",
      description: `Research Agent identifies one ${channelLabel} service opportunity for ${blueprint.customer}, combining local research, feedback, and reference signals before the service package is built.`,
      outputSummary: `Research Agent selected the ${blueprint.serviceType} offer, clarified the buyer, and passed the positioning to the service strategy stage.`,
      artifacts: [
        {
          title: "Trend Research Brief",
          type: "Trend Research",
          summary: "A focused research brief describing the chosen service, buyer, and why it should sell.",
          linkLabel: "service-trend-research-brief.md",
          details: [
            `Service idea: ${blueprint.gigTitle}.`,
            `Channel: ${channelLabel}.`,
            `Target buyer: ${blueprint.customer}.`,
            `Service type: ${blueprint.serviceType}.`,
            `Why it will sell: ${blueprint.trendSummary}`,
            `Research signals: ${blueprint.styleResearch.influencingResearchSignals.join(" | ")}`,
            `Selected style: ${blueprint.selectedStyleProfile.name}.`,
            `Why this style was chosen: ${blueprint.selectedStyleReason}`
          ]
        }
      ]
    },
    {
      assignedAgent: "Compass",
      title: "Define service scope, deliverables, and process",
      description:
        "Product Strategy Agent converts the research brief into a sellable service package with deliverables, process steps, package tiers, fulfillment notes, and reusable workflow guidance.",
      outputSummary: `Product Strategy Agent turned ${blueprint.gigTitle} into a productized service package with clear client-facing scope.`,
      artifacts: [
        {
          title: "Service Strategy Summary",
          type: "Strategy Summary",
          summary: "A productized service definition covering deliverables, packages, process, and scaling notes.",
          linkLabel: "service-strategy-summary.md",
          details: [
            `Gig title: ${blueprint.gigTitle}.`,
            `Service type: ${blueprint.serviceType}.`,
            `Deliverables: ${blueprint.deliverables.join(", ")}.`,
            `Packages: ${blueprint.packages.map((entry) => `${entry.name} ${entry.priceRange} / ${entry.turnaroundTime}`).join(" | ")}.`,
            `What I actually do for the client: ${blueprint.actualWorkForClient.join(" | ")}`,
            `Reusable workflow: ${blueprint.reusableWorkflow.join(" | ")}`
          ]
        }
      ]
    },
    {
      assignedAgent: "Anvil",
      title: "Generate one complete service output",
      description:
        "Build Agent turns the service strategy into a Fiverr-style gig output with title, description, packages, turnaround, deliverables, delivery steps, and fulfillment notes.",
      outputSummary: `Build Agent produced the full service output for ${blueprint.gigTitle} and passed it to approval review.`,
      artifacts: [
        {
          title: "Service Output",
          type: "Service Output",
          summary: "A complete service package ready for approval review.",
          linkLabel: "service-output-ready-for-review.md",
          details: [
            `Channel: ${channelLabel}`,
            `Gig title: ${blueprint.gigTitle}`,
            `Price range: ${blueprint.price}`,
            `Turnaround: ${blueprint.turnaroundTime}`,
            `Deliverables: ${blueprint.deliverables.join(", ")}`,
            `Delivery process: ${blueprint.deliveryProcess.join(" | ")}`,
            blueprint.gigDescription
          ]
        }
      ]
    },
    {
      assignedAgent: "Core Runtime",
      title: "Prepare approval packet before client delivery",
      description:
        "Review Agent assembles the final service output, preserves the handoff between agents, and blocks any outbound action until manual approval happens.",
      outputSummary: "Review Agent assembled the final service packet and held client delivery until explicit approval.",
      artifacts: [
        {
          title: "Approval Packet",
          type: "Approval Packet",
          summary: "The final human-review package showing how the service moved through the pipeline.",
          linkLabel: "service-approval-packet.md",
          details: [
            "Research Agent passed buyer and market evidence to Product Strategy Agent.",
            "Product Strategy Agent passed package structure and fulfillment notes to Build Agent.",
            "Build Agent passed the complete service output to the Review Agent.",
            "Any outbound delivery remains blocked until the user approves the service."
          ]
        }
      ]
    }
  ];
}

function buildTaskBlueprints(mission: Mission, blueprint: StyledCommerceBlueprint): TaskBlueprint[] {
  return isServiceBlueprint(blueprint) ? buildServiceTaskBlueprints(mission, blueprint) : buildProductTaskBlueprints(mission, blueprint);
}

function buildFinalProductOutput(blueprint: StyledProductBlueprint) {
  return [
    "LISTING OUTPUT READY FOR REVIEW",
    "",
    `Channel: ${formatChannelLabel(blueprint.channel)}`,
    `Product Name: ${blueprint.productTitle}`,
    `Title: ${blueprint.listingTitle}`,
    `Target Buyer: ${blueprint.customer}`,
    `Deliverable Type: ${deriveDeliverableType(blueprint.channel, blueprint.productFormat, blueprint.productType)}`,
    "Description:",
    blueprint.description,
    `Tags: ${blueprint.tags.join(", ")}`,
    `Price: ${blueprint.price}`,
    `Product Contents: ${blueprint.productContents.join(", ")}`,
    `Mockup Prompt: ${blueprint.mockupPrompt}`,
    `Product Format: ${blueprint.productFormat}`,
    `Selected Style: ${blueprint.selectedStyleProfile.name}`,
    `Research Signals: ${blueprint.styleResearch.influencingResearchSignals.join(" | ")}`,
    `File Delivery Description: ${blueprint.fileDelivery}${blueprint.fileDelivery.includes("Editable version included via Canva instructions") ? "" : " Editable version included via Canva instructions."}`
  ].join("\n");
}

function buildFinalServiceOutput(blueprint: StyledServiceBlueprint) {
  return [
    "SERVICE OUTPUT READY FOR REVIEW",
    "",
    `Channel: ${formatChannelLabel(blueprint.channel)}`,
    `Gig Title: ${blueprint.gigTitle}`,
    `Service Type: ${blueprint.serviceType}`,
    `Target Buyer: ${blueprint.customer}`,
    `Deliverables: ${blueprint.deliverables.join(", ")}`,
    `Turnaround Time: ${blueprint.turnaroundTime}`,
    "Gig Description:",
    blueprint.gigDescription,
    "Packages:",
    ...blueprint.packages.map(
      (entry) => `- ${entry.name}: ${entry.priceRange} | ${entry.turnaroundTime} | ${entry.deliverables.join(", ")}`
    ),
    `Delivery Process: ${blueprint.deliveryProcess.join(" | ")}`,
    `What I actually do for the client: ${blueprint.actualWorkForClient.join(" | ")}`,
    `Reusable Workflow: ${blueprint.reusableWorkflow.join(" | ")}`,
    `Scale Notes: ${blueprint.scalabilityNotes.join(" | ")}`,
    `Selected Style: ${blueprint.selectedStyleProfile.name}`,
    `Research Signals: ${blueprint.styleResearch.influencingResearchSignals.join(" | ")}`
  ].join("\n");
}

function buildFinalListing(blueprint: StyledCommerceBlueprint) {
  return isServiceBlueprint(blueprint) ? buildFinalServiceOutput(blueprint) : buildFinalProductOutput(blueprint);
}

export function createMissionDraft(
  goal: string,
  rawConstraints: string,
  priority: MissionPriority,
  executionMode: ExecutionMode,
  channel: CommerceChannel
): Mission {
  const createdAt = timestampLabel(new Date());

  return {
    id: createId("mission"),
    title: deriveMissionTitle(goal),
    goal,
    channel,
    constraints: extractConstraints(rawConstraints),
    executionMode,
    approved: false,
    approvalStatus: "not_granted",
    status: "Queued",
    priority,
    createdAt,
    summary: "Autonomous build queued. The system will generate a channel-aware draft output and hold the result for approval.",
    recommendedNextAction: "Run the pipeline to generate a review-ready draft output."
  };
}

export function createMissionTasks(mission: Mission): MissionTask[] {
  const blueprint = resolveStyledCommerceBlueprint(mission.goal, mission.channel);

  return buildTaskBlueprints(mission, blueprint).map((task) => ({
    id: createId("task"),
    missionId: mission.id,
    executionMode: mission.executionMode,
    assignedAgent: task.assignedAgent,
    title: task.title,
    description: task.description,
    status: "Queued",
    outputSummary: "Queued for execution.",
    plannedOutputSummary: task.outputSummary,
    artifacts: task.artifacts.map((artifact) => createMissionArtifactFromBlueprint(mission.id, task.assignedAgent, artifact))
  }));
}

export function createMissionArtifacts(mission: Mission) {
  return createMissionTasks(mission).flatMap((task) => task.artifacts);
}

export function createMissionReport(
  mission: Mission,
  tasks: MissionTask[],
  artifacts: MissionArtifact[],
  agents: Agent[]
): MorningReport {
  const blueprint = resolveStyledCommerceBlueprint(mission.goal, mission.channel);
  const completedTaskIds = tasks.filter((task) => task.status === "Completed").map((task) => task.id);
  const failedTaskIds = tasks.filter((task) => task.status === "Failed").map((task) => task.id);
  const completedTaskSummaries = tasks
    .filter((task) => task.status === "Completed")
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      assignedAgent: task.assignedAgent,
      completedAt: task.completedAt,
      summary: task.outputSummary
    }));

  const agentSummaries = AGENT_ORDER.map((agentName) => {
    const task = tasks.find((entry) => entry.assignedAgent === agentName);
    const agent = agents.find((entry) => entry.name === agentName);
    const artifactCount = artifacts.filter((artifact) => artifact.createdBy === agentName).length;

    return {
      agentId: agent?.id ?? agentName.toLowerCase(),
      agentName,
      role: agent?.role ?? "Product Pipeline Agent",
      status: task?.status ?? "Queued",
      contribution: task?.outputSummary ?? "Awaiting assignment.",
      artifactCount
    };
  });

  const finalProduct: CommerceOutput = isServiceBlueprint(blueprint)
    ? {
        id: createId("service"),
        outputKind: "service",
        channel: mission.channel,
        title: blueprint.gigTitle,
        listingTitle: blueprint.gigTitle,
        listingDescription: blueprint.gigDescription,
        listingTags: blueprint.tags,
        price: blueprint.price,
        targetBuyer: blueprint.customer,
        whyItWillSell: blueprint.trendSummary,
        theme: blueprint.theme,
        productFormat: "service",
        format: "service",
        productType: blueprint.productType,
        deliverableType: "service package",
        fileFormat: blueprint.fileFormat,
        fileDeliveryDescription: blueprint.fileDelivery,
        mockupPrompt: blueprint.mockupPrompt,
        productContents: blueprint.deliverables,
        designBlueprint: blueprint.designBlueprint,
        generatedProductPages: [],
        workbookSpec: null,
        estimatedDifficulty: blueprint.difficulty,
        estimatedTimeToMVP: blueprint.timeToMVP,
        selectedStyleProfile: blueprint.selectedStyleProfile,
        selectedStyleReason: blueprint.selectedStyleReason,
        styleResearch: blueprint.styleResearch,
        serviceType: blueprint.serviceType,
        gigTitle: blueprint.gigTitle,
        gigDescription: blueprint.gigDescription,
        deliverables: blueprint.deliverables,
        deliveryProcess: blueprint.deliveryProcess,
        packages: blueprint.packages,
        turnaroundTime: blueprint.turnaroundTime,
        actualWorkForClient: blueprint.actualWorkForClient,
        reusableWorkflow: blueprint.reusableWorkflow,
        scalabilityNotes: blueprint.scalabilityNotes
      }
    : {
        id: createId("listing"),
        outputKind: "product",
        channel: mission.channel,
        title: blueprint.productTitle,
        listingTitle: blueprint.listingTitle,
        listingDescription: blueprint.description,
        listingTags: blueprint.tags,
        price: blueprint.price,
        targetBuyer: blueprint.customer,
        whyItWillSell: blueprint.trendSummary,
        theme: blueprint.theme,
        productFormat: blueprint.productFormat,
        format: blueprint.productFormat,
        productType: blueprint.productType,
        deliverableType: deriveDeliverableType(mission.channel, blueprint.productFormat, blueprint.productType),
        fileFormat: blueprint.fileFormat,
        fileDeliveryDescription: blueprint.fileDelivery,
        mockupPrompt: blueprint.mockupPrompt,
        productContents: blueprint.productContents,
        designBlueprint: blueprint.designBlueprint,
        generatedProductPages: blueprint.generatedProductPages,
        workbookSpec: blueprint.workbookSpec ?? null,
        estimatedDifficulty: blueprint.difficulty,
        estimatedTimeToMVP: blueprint.timeToMVP,
        selectedStyleProfile: blueprint.selectedStyleProfile,
        selectedStyleReason: blueprint.selectedStyleReason,
        styleResearch: blueprint.styleResearch
      };

  const blockers = tasks
    .filter((task) => task.status === "Blocked" || task.status === "Failed")
    .map((task) => `${task.assignedAgent}: ${task.error ?? "Task could not complete."}`);

  const recommendations = isServiceBlueprint(blueprint)
    ? [
        `Review the completed service output for ${blueprint.gigTitle}.`,
        "Approve the service only after checking buyer fit, packages, pricing, turnaround, and fulfillment clarity.",
        "Keep client delivery disabled until a human confirms the service is ready."
      ]
    : [
        `Review the completed listing output for ${blueprint.productTitle}.`,
        "Approve the product only after checking channel fit, title quality, tags, price, file delivery, and mockup direction.",
        "Keep publishing disabled until a human confirms the listing is ready."
      ];

  return {
    id: createId("report"),
    missionId: mission.id,
    executiveSummary: isServiceBlueprint(blueprint)
      ? `The service pipeline produced a complete draft output for ${blueprint.gigTitle} by passing one opportunity through research, strategy, service packaging, and approval review.`
      : `The product pipeline produced a complete draft output for ${blueprint.productTitle} by passing one opportunity through research, style intelligence, concept generation, listing creation, and approval packaging.`,
    missionSummary: isServiceBlueprint(blueprint)
      ? `The system built one focused channel-aware service draft with the local style profile ${blueprint.selectedStyleProfile.name}, making the offer easier to review, repeat, and scale later.`
      : `The system built one focused channel-aware draft with the local style profile ${blueprint.selectedStyleProfile.name}, making the result easier to review, reinforce, vary, and approve later.`,
    agentSummaries,
    completedTaskIds,
    failedTaskIds,
    completedTaskSummaries,
    artifactsCreated: artifacts,
    finalProduct,
    risks: [
      "Trend direction is simulated from the internal pipeline, not live marketplace scraping.",
      ...(isServiceBlueprint(blueprint)
        ? ["Service quality still depends on the fulfillment workflow and human QA before delivery."]
        : ["Mockups and final design assets still require human creation or a separate generation step."]),
      "Outbound delivery remains intentionally blocked until the user approves the draft."
    ],
    blockers:
      blockers.length > 0
        ? blockers
        : ["No live publishing or client delivery is performed. Final outbound action still requires explicit user approval."],
    recommendations: [
      ...recommendations,
      `Selected style: ${blueprint.selectedStyleProfile.name}.`,
      `Style rationale: ${blueprint.selectedStyleReason}`,
      `Research signals: ${blueprint.styleResearch.influencingResearchSignals.join(" | ")}`
    ],
    recommendedNextStep: recommendations[1],
    confidenceScore: mission.status === "Failed" ? 58 : 89,
    finalMorningReport: buildFinalListing(blueprint)
  };
}

export function buildMissionRecord(
  mission: Mission,
  tasks: MissionTask[],
  agents: Agent[],
  artifacts = tasks.flatMap((task) => (task.status === "Completed" ? task.artifacts : []))
): MissionRecord {
  return {
    mission,
    tasks,
    artifacts,
    report: createMissionReport(mission, tasks, artifacts, agents)
  };
}

function slugifyTag(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function createPublishQueueItem(record: MissionRecord): PublishQueueItem {
  const product = record.report.finalProduct;

  return {
    id: Date.now(),
    missionId: record.mission.id,
    channel: product.channel,
    title: product.title,
    data: record.report.finalMorningReport,
    listingData: product.listingTitle,
    listingDraft: record.report.finalMorningReport,
    styleProfileId: product.selectedStyleProfile.id,
    styleProfileName: product.selectedStyleProfile.name,
    artifacts: record.artifacts,
    images: record.artifacts
      .filter((artifact) => artifact.type === "Mockup Prompt")
      .map((artifact) => artifact.linkLabel),
    tags: product.listingTags.map(slugifyTag).slice(0, 13),
    pricing: product.price,
    format: product.format,
    deliverableType: product.deliverableType,
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

export function hydrateAgentsForMission(agents: Agent[], tasks: MissionTask[], mission: Mission | null) {
  return agents.map((agent) => {
    const task = tasks.find((entry) => entry.assignedAgent === agent.name);
    if (!mission || !task) {
      return agent;
    }

    const missionStatusMap: Record<TaskStatus, Agent["status"]> = {
      Queued: "Idle",
      Running: "Running",
      Completed: "Completed",
      Blocked: "Blocked",
      Failed: "Error"
    };

    return {
      ...agent,
      status: missionStatusMap[task.status],
      latestOutputPreview: task.error ?? task.outputSummary,
      latestOutput: task.error ?? task.description,
      updatedAt: task.completedAt ?? task.startedAt ?? mission.startedAt ?? mission.createdAt,
      queueDepth: task.status === "Queued" ? 1 : 0
    };
  });
}



















