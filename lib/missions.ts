import type { Agent } from "@/lib/mock-agents";

export type MissionStatus = "Draft" | "Queued" | "Running" | "Completed" | "Blocked" | "Failed";
export type MissionPriority = "Critical" | "High" | "Standard";
export type TaskStatus = "Queued" | "Running" | "Completed" | "Blocked" | "Failed";
export type ExecutionMode = "internal" | "local" | "outbound";
export type ArtifactType =
  | "Trend Research"
  | "Product Concept"
  | "Design Blueprint"
  | "Mockup Prompt"
  | "Etsy Listing"
  | "Approval Packet"
  | "Strategy Summary";
export type Difficulty = "Low" | "Medium" | "High";

export type Mission = {
  id: string;
  title: string;
  goal: string;
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

export type EtsyProductOutput = {
  id: string;
  title: string;
  targetAudience: string;
  whyItWillSell: string;
  theme: ProductTheme;
  productType: string;
  fileFormat: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  estimatedDifficulty: Difficulty;
  estimatedTimeToMVP: string;
};

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
  finalProduct: EtsyProductOutput;
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

export type PublishQueueItem = {
  id: number;
  missionId: string;
  title: string;
  data: string;
  listingData: string;
  tags: string[];
  pricing: string;
  artifacts: MissionArtifact[];
  images: string[];
  listingDraft: string;
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

type EtsyListingBlueprint = {
  niche: string;
  customer: string;
  productTitle: string;
  trendSummary: string;
  conceptSummary: string;
  theme: ProductTheme;
  pageBreakdown: string[];
  mockupPrompt: string;
  productType: string;
  fileFormat: string;
  etsyTitle: string;
  description: string;
  tags: string[];
  price: string;
  fileDelivery: string;
  productContents: string[];
  designBlueprint: string[];
  generatedProductPages: GeneratedProductPage[];
  difficulty: Difficulty;
  timeToMVP: string;
};

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
  "Research Agent must only choose digital Etsy product opportunities in planners, trackers, templates, or printable kits.",
  "Create internal research, product concepts, listing copy, and approval-ready digital assets only.",
  "Keep the output to one complete Etsy listing package ready for human review."
] as const;

const AGENT_ORDER = ["Wesker", "Red Queen", "Ada", "Umbrella Core"] as const;

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
    return "Etsy Product Pipeline";
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
  blueprint: Omit<EtsyListingBlueprint, "designBlueprint">
): EtsyListingBlueprint {
  return {
    ...blueprint,
    designBlueprint: renderGeneratedPagesToText(blueprint.generatedProductPages)
  };
}

function inferListingBlueprint(goal: string): EtsyListingBlueprint {
  const source = goal.toLowerCase();

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
      pageBreakdown: [
        "12-page PDF classroom routine kit",
        "Morning routine visual chart",
        "Dismissal checklist",
        "Behavior tracker sheet",
        "Class jobs chart",
        "Emergency procedure checklist"
      ],
      mockupPrompt:
        "Create an Etsy mockup scene showing a boho classroom printable kit displayed as printed routine cards, tracker sheets, and a classroom binder cover on a bright elementary teacher desk with neutral decor, warm daylight, tidy school supplies, and a clean Etsy-ready composition.",
      productType: "Digital printable classroom kit",
      fileFormat: "PDF, PNG",
      etsyTitle:
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
        "Editable wedding signage remains a strong Etsy category because couples want polished event details without the turnaround time or cost of custom stationery.",
      conceptSummary:
        "Build a clean editable signage bundle with modern serif typography, simple layout hierarchy, and matching wedding-day template variations.",
      theme: "feminine aesthetic",
      pageBreakdown: [
        "Editable welcome sign template",
        "Seating chart template",
        "Table number template",
        "Bar menu template",
        "Guestbook sign template",
        "Instruction page"
      ],
      mockupPrompt:
        "Create an Etsy mockup scene of a minimalist wedding welcome sign on an easel with matching table signs at a bright neutral venue, soft florals, elegant modern serif typography, and premium editorial lighting.",
      productType: "Digital wedding template bundle",
      fileFormat: "Canva, PDF, PNG",
      etsyTitle:
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
    pageBreakdown: [
      "12-page business planner PDF",
      "Weekly content calendar",
      "promotion tracker",
      "task planner",
      "launch checklist",
      "monthly review sheet"
    ],
    mockupPrompt:
      "Create an Etsy mockup image showing a digital small business planner template kit on a laptop and tablet with clean neutral branding, visible planner pages, checklist sheets, calendar layouts, minimal desk props, and bright polished ecommerce lighting.",
    productType: "Digital planner and template kit",
    fileFormat: "PDF, Canva",
    etsyTitle:
      "Small Business Content Planner Template Kit, Editable Canva Marketing Planner, Weekly Tracker, Launch Checklist, Digital Download",
    description:
      "Plan your content and promotions with a digital template kit made for small business owners who want clarity without building a system from scratch. This instant download includes editable planning pages for weekly content, campaign organization, task tracking, and launch prep so you can manage your business more consistently.\n\nWhat is included:\n- A 12-page business planning kit\n- Editable Canva layouts for easy customization\n- Weekly tracker and content planning pages\n- Launch checklist and monthly review pages\n- Instant digital download access after purchase\n\nPerfect for:\n- Etsy sellers\n- service providers\n- digital product shops\n- small business owners managing content and promotions\n\nPlease note:\n- Digital product only\n- No physical product will be shipped\n- Buyers need a Canva account to edit the template version",
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
      "etsy seller tools"
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

function buildTaskBlueprints(mission: Mission, blueprint: EtsyListingBlueprint): TaskBlueprint[] {
  return [
    {
      assignedAgent: "Wesker",
      title: "Research trending Etsy product direction",
      description: `Research Agent identifies one digital Etsy product for ${blueprint.customer} inside planners, trackers, templates, or printable kits and explains why it should sell.`,
      outputSummary: `Research Agent selected the single digital product ${blueprint.productTitle} and passed the audience and sales rationale to the Product Agent.`,
      artifacts: [
        {
          title: "Trend Research Brief",
          type: "Trend Research",
          summary: "A focused trend brief describing the one chosen Etsy product, target buyer, and why it should sell.",
          linkLabel: "trend-research-brief.md",
          details: [
            `Product idea: ${blueprint.productTitle}.`,
            `Target audience: ${blueprint.customer}.`,
            `Why it will sell: ${blueprint.trendSummary}`
          ]
        }
      ]
    },
    {
      assignedAgent: "Red Queen",
      title: "Generate digital product concept and contents",
      description:
        "Product Agent converts the research brief into one digital Etsy product concept, including the page breakdown, file format, product contents, and the exact mockup prompt needed for imagery.",
      outputSummary: `Product Agent transformed the research brief into the ${blueprint.productTitle} concept, defined its contents and file format, and handed everything to the Listing Agent.`,
      artifacts: [
        {
          title: "Product Design Concept",
          type: "Product Concept",
          summary: "A single digital Etsy product concept based on the research handoff.",
          linkLabel: "product-design-concept.md",
          details: [
            `Concept name: ${blueprint.productTitle}.`,
            `Theme: ${blueprint.theme}.`,
            `Product type: ${blueprint.productType}.`,
            `File format: ${blueprint.fileFormat}.`,
            `Concept direction: ${blueprint.conceptSummary}`,
            `Page breakdown: ${blueprint.pageBreakdown.join(", ")}.`,
            `Product contents: ${blueprint.productContents.join(", ")}.`
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
          summary: "The image prompt the team can use to create primary Etsy listing mockups.",
          linkLabel: "mockup-prompt.txt",
          details: [blueprint.mockupPrompt]
        }
      ]
    },
    {
      assignedAgent: "Ada",
      title: "Generate one complete Etsy listing",
      description:
        "Listing Agent turns the digital product concept into one publish-ready Etsy listing with title, full description, thirteen tags, price, file delivery description, and product contents.",
      outputSummary: `Listing Agent produced one complete Etsy listing for ${blueprint.productTitle} and passed the draft to the Approval System.`,
      artifacts: [
        {
          title: "Complete Etsy Listing",
          type: "Etsy Listing",
          summary: "A single Etsy listing package ready for approval review.",
          linkLabel: "etsy-listing-ready-to-publish.md",
          details: [
            `Title: ${blueprint.etsyTitle}`,
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
      assignedAgent: "Umbrella Core",
      title: "Prepare approval packet before publishing",
      description:
        "Approval System assembles the final listing output, preserves each agent handoff, and marks the product ready for human approval before any marketplace action.",
      outputSummary: "Approval System assembled the final Etsy listing packet and held publication until the user explicitly approves it.",
      artifacts: [
        {
          title: "Approval Packet",
          type: "Approval Packet",
          summary: "The final human-review package showing how the Etsy listing moved through the pipeline.",
          linkLabel: "approval-packet.md",
          details: [
            "Research Agent passed niche and trend evidence to Product Agent.",
            "Product Agent passed concept direction and mockup prompt to Listing Agent.",
            "Listing Agent passed the completed listing to the Approval System.",
            "Publishing remains blocked until the user approves the product."
          ]
        }
      ]
    }
  ];
}

function buildFinalListing(blueprint: EtsyListingBlueprint) {
  return [
    "ETSY LISTING READY TO PUBLISH",
    "",
    `Product Name: ${blueprint.productTitle}`,
    `Title: ${blueprint.etsyTitle}`,
    "Description:",
    blueprint.description,
    `Tags: ${blueprint.tags.join(", ")}`,
    `Price: ${blueprint.price}`,
    `Product Contents: ${blueprint.productContents.join(", ")}`,
    `Mockup Prompt: ${blueprint.mockupPrompt}`,
    `File Delivery Description: ${blueprint.fileDelivery}`
  ].join("\n");
}

export function createMissionDraft(
  goal: string,
  rawConstraints: string,
  priority: MissionPriority,
  executionMode: ExecutionMode
): Mission {
  const createdAt = timestampLabel(new Date());

  return {
    id: createId("mission"),
    title: deriveMissionTitle(goal),
    goal,
    constraints: extractConstraints(rawConstraints),
    executionMode,
    approved: false,
    approvalStatus: "not_granted",
    status: "Queued",
    priority,
    createdAt,
    summary: "Digital Etsy automation workflow queued. The system will generate one digital product and one complete listing draft for approval.",
    recommendedNextAction: "Launch the digital Etsy pipeline to generate a single publish-ready listing."
  };
}

export function createMissionTasks(mission: Mission): MissionTask[] {
  const blueprint = inferListingBlueprint(mission.goal);

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
  const blueprint = inferListingBlueprint(mission.goal);
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
      role: agent?.role ?? "Etsy Pipeline Agent",
      status: task?.status ?? "Queued",
      contribution: task?.outputSummary ?? "Awaiting assignment.",
      artifactCount
    };
  });

  const finalProduct = {
    id: createId("listing"),
    title: blueprint.productTitle,
    targetAudience: blueprint.customer,
    whyItWillSell: blueprint.trendSummary,
    theme: blueprint.theme,
    productType: blueprint.productType,
    fileFormat: blueprint.fileFormat,
    productContents: blueprint.productContents,
    designBlueprint: blueprint.designBlueprint,
    generatedProductPages: blueprint.generatedProductPages,
    estimatedDifficulty: blueprint.difficulty,
    estimatedTimeToMVP: blueprint.timeToMVP
  };

  const blockers = tasks
    .filter((task) => task.status === "Blocked" || task.status === "Failed")
    .map((task) => `${task.assignedAgent}: ${task.error ?? "Task could not complete."}`);

  const recommendations = [
    `Review the completed listing for ${blueprint.productTitle}.`,
    "Approve the product only after checking title quality, tags, price, file delivery, and mockup direction.",
    "Keep publishing disabled until a human confirms the listing is ready."
  ];

  return {
    id: createId("report"),
    missionId: mission.id,
    executiveSummary: `The digital Etsy pipeline produced one complete listing for ${blueprint.productTitle} by passing a single product through research, concept generation, listing creation, and approval packaging.`,
    missionSummary:
      "The system now defaults to one focused digital Etsy product instead of multiple options, making the result easier to review, approve, and publish later.",
    agentSummaries,
    completedTaskIds,
    failedTaskIds,
    completedTaskSummaries,
    artifactsCreated: artifacts,
    finalProduct,
    risks: [
      "Trend direction is simulated from the internal pipeline, not live Etsy scraping.",
      "Mockups and final design assets still require human creation or a separate generation step.",
      "Publishing remains intentionally blocked until the user approves the product."
    ],
    blockers:
      blockers.length > 0
        ? blockers
        : ["No live Etsy publishing is performed. Final marketplace submission still requires explicit user approval."],
    recommendations,
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
  const listing = inferListingBlueprint(record.mission.goal);

  return {
    id: Date.now(),
    missionId: record.mission.id,
    title: listing.productTitle,
    data: record.report.finalMorningReport,
    listingData: listing.etsyTitle,
    listingDraft: record.report.finalMorningReport,
    artifacts: record.artifacts,
    images: record.artifacts
      .filter((artifact) => artifact.type === "Mockup Prompt")
      .map((artifact) => artifact.linkLabel),
    tags: listing.tags.map(slugifyTag).slice(0, 13),
    pricing: listing.price,
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
