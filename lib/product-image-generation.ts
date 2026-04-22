import type { GeneratedProductPage, MissionRecord } from "@/lib/missions";

export type PlannerPageKind = "cover" | "monthly" | "weekly" | "tracker" | "checklist" | "notes" | "summary";

export type ProductPageDesignSystem = {
  themeLabel: string;
  palette: string[];
  fontStyle: string;
  spacingRules: string;
  headerStyle: string;
  layoutSystem: string;
};

export type ProductPageImageSpec = {
  id: PlannerPageKind;
  pageName: string;
  displayLabel: string;
  filename: string;
  prompt: string;
  designSystem: ProductPageDesignSystem;
};

type PlannerPageTemplate = {
  id: PlannerPageKind;
  pageName: string;
  matchers: RegExp[];
  layoutFallback: string;
  sectionsFallback: string[];
  textFallback: (record: MissionRecord) => string[];
};

const PAGE_TEMPLATES: PlannerPageTemplate[] = [
  {
    id: "cover",
    pageName: "Cover Page",
    matchers: [/cover/i, /info/i, /title/i],
    layoutFallback: "Airy editorial cover with a refined title in the upper third, a soft subtitle grouping below, and a minimal footer note with generous negative space.",
    sectionsFallback: ["Title band", "Subtitle block", "Promise statement"],
    textFallback: (record) => [
      record.report.finalProduct.title,
      `For ${record.report.finalProduct.targetBuyer}`,
      "Instant download planner page set"
    ]
  },
  {
    id: "monthly",
    pageName: "Monthly Overview",
    matchers: [/monthly/i, /calendar/i, /overview/i],
    layoutFallback: "Portrait monthly planning page with an elegant month header, an airy central planning grid, and a quiet priorities area balanced with soft white space.",
    sectionsFallback: ["Month snapshot", "Calendar grid", "Priorities and reminders"],
    textFallback: () => ["Month:", "Top priorities", "Important dates", "Appointments", "Notes"]
  },
  {
    id: "weekly",
    pageName: "Weekly Planner",
    matchers: [/weekly/i, /week/i, /schedule/i],
    layoutFallback: "Portrait weekly planning page with a refined weekly heading, softly separated daily sections, and a small focus area that feels calm rather than boxed in.",
    sectionsFallback: ["Week header", "Daily planning columns", "Goals and focus"],
    textFallback: () => ["This week", "Goals", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  },
  {
    id: "tracker",
    pageName: "Tracker Page",
    matchers: [/tracker/i, /habit/i, /budget/i, /expense/i, /progress/i],
    layoutFallback: "Refined tracker page with a light header, an organized but breathable tracking area, and a subtle reflection space that keeps the page open and premium.",
    sectionsFallback: ["Summary metrics", "Tracking grid", "Progress reflection"],
    textFallback: (record) => [`${record.report.finalProduct.productType} tracker`, "Category", "Status", "Progress", "Notes"]
  },
  {
    id: "checklist",
    pageName: "Checklist Page",
    matchers: [/checklist/i, /task/i, /launch/i, /to-do/i],
    layoutFallback: "Checklist page with a clean heading, gently structured checklist groupings, and elegant row spacing with subtle divider cues instead of heavy blocks.",
    sectionsFallback: ["Priority checklist", "Upcoming tasks", "Completed items"],
    textFallback: () => ["Must do", "Next up", "Completed", "Notes"]
  },
  {
    id: "notes",
    pageName: "Notes Page",
    matchers: [/notes/i, /brainstorm/i, /reflection/i],
    layoutFallback: "Notes page with a restrained heading, generous writing space, and a soft guided prompt area that feels polished and editorial.",
    sectionsFallback: ["Notes header", "Writing space", "Reflection prompt"],
    textFallback: () => ["Notes", "Ideas", "Reflections", "Next steps"]
  },
  {
    id: "summary",
    pageName: "Summary Page",
    matchers: [/summary/i, /review/i, /recap/i, /dashboard/i],
    layoutFallback: "Summary page with a polished header, balanced recap sections with soft separation, and a graceful next-steps area that matches the rest of the set.",
    sectionsFallback: ["Highlights", "Progress recap", "Next steps"],
    textFallback: () => ["Summary", "Big wins", "In progress", "Next focus", "Final notes"]
  }
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function findMatchingPage(template: PlannerPageTemplate, pages: GeneratedProductPage[]) {
  return pages.find((page) => {
    const haystack = [page.pageName, page.layoutDescription, page.sections.join(" ")].join(" ");
    return template.matchers.some((matcher) => matcher.test(haystack));
  });
}

function buildThemeLabel(record: MissionRecord) {
  const product = record.report.finalProduct;
  const styleName = product.selectedStyleProfile.name;
  const niche = product.productType.toLowerCase();

  if (/finance|budget|debt/.test(niche)) {
    return "minimalist finance";
  }

  if (/wedding|bridal/.test(niche)) {
    return "wedding neutral";
  }

  if (/adhd/.test(niche)) {
    return "ADHD friendly";
  }

  return `${product.theme} ${styleName}`;
}

function buildDesignSystem(record: MissionRecord): ProductPageDesignSystem {
  const product = record.report.finalProduct;
  const style = product.selectedStyleProfile;
  const palette = style.palette;

  return {
    themeLabel: buildThemeLabel(record),
    palette,
    fontStyle: style.typography,
    spacingRules: "Use a soft editorial spacing system with generous outer margins, breathable vertical rhythm, comfortable line spacing, and elegant white space between sections. Avoid cramped layouts and avoid rigid boxed grouping.",
    headerStyle: `Use one refined heading treatment across all pages with clean elegant titles, subtle weight contrast, and restrained soft-neutral accents from ${palette[1]} and ${palette[2]} rather than heavy banners.`,
    layoutSystem: `Use the same premium printable visual language across every page, translating ${style.layout} into softer sectioning, lighter dividers, balanced asymmetry, and cohesive minimalist structure rather than dashboard-like blocks.`
  };
}

function buildPlannerPagePrompt(
  record: MissionRecord,
  template: PlannerPageTemplate,
  designSystem: ProductPageDesignSystem,
  sourcePage?: GeneratedProductPage
) {
  const product = record.report.finalProduct;
  const pageName = sourcePage?.pageName ?? template.pageName;
  const layoutDescription = sourcePage?.layoutDescription ?? template.layoutFallback;
  const sections = sourcePage?.sections.length ? sourcePage.sections : template.sectionsFallback;
  const textContent = sourcePage?.textContent.length ? sourcePage.textContent : template.textFallback(record);
  const pageSpecificStyle = sourcePage?.visualStyleInstructions.length
    ? `${sourcePage.visualStyleInstructions.join(", ")}, interpreted with softer section edges, elegant hierarchy, lighter fills, and premium printable restraint`
    : `${designSystem.layoutSystem}, premium printable design language with soft-neutral restraint`;
  const explicitPalette = designSystem.palette.join(", ");

  return [
    `Use case: ui-mockup`,
    `Asset type: high-resolution printable planner page`,
    `Primary request: create a cohesive premium printable planner page as a finished flat design, not a mockup scene.`,
    `Scene/backdrop: clean white background, straight-on view of a single portrait planner page, no desk props, no hands, no outside shadows.`,
    `Subject: ${pageName} for the product "${product.title}" aimed at ${product.targetBuyer}.`,
    `Theme: exact theme ${designSystem.themeLabel}.`,
    `Style/medium: premium printable planner layout, minimalist clean, polished modern stationery design, soft-neutral visual tone, high-resolution printable quality.`,
    `Composition/framing: portrait 8.5x11 page, centered, balanced margins, refined hierarchy, elegant section balance, and consistent order across the full page set.`,
    `Color palette: use ONLY these explicit hex values across this page and all other pages in the set: ${explicitPalette}.`,
    `Typography style: use the same typography style on every page: ${designSystem.fontStyle}.`,
    `Spacing system: ${designSystem.spacingRules}`,
    `Header style: ${designSystem.headerStyle}`,
    `Layout system: ${designSystem.layoutSystem}`,
    `Layout structure: ${layoutDescription}. Prioritize graceful spacing, subtle section transitions, and less rigid geometry.`,
    `Grid and sections: ${sections.join(" | ")}.`,
    `Visible text guidance: ${textContent.join(" | ")}.`,
    `Page-specific design direction: ${pageSpecificStyle}.`,
    `Consistency requirement: this page must match the rest of the planner set in palette, typography, spacing, heading treatment, divider softness, and overall visual rhythm.`,
    `Printable quality requirement: sharp high-resolution output, refined line work, elegant whitespace, premium hierarchy, and a polished sellable finish.`,
    `Constraints: no flashy effects, no watermarks, no extra branding, no photoreal objects, no device frames, no decorative overload.`,
    `Avoid: inconsistent colors, inconsistent fonts, inconsistent spacing, clutter, distorted text blocks, heavy box fills, corporate dashboard styling, harsh dark backgrounds, and unrealistic shadows.`
  ].join("\n");
}

export function getProductPageImageSpecs(record: MissionRecord): ProductPageImageSpec[] {
  if (record.report.finalProduct.outputKind === "service" || record.report.finalProduct.productFormat === "service") {
    return [];
  }

  const pages = record.report.finalProduct.generatedProductPages;
  const designSystem = buildDesignSystem(record);

  return PAGE_TEMPLATES.map((template, index) => {
    const sourcePage = findMatchingPage(template, pages);
    const pageName = sourcePage?.pageName ?? template.pageName;

    return {
      id: template.id,
      pageName,
      displayLabel: `Page ${index + 1}: ${pageName}`,
      filename: `${String(record.mission.id)}-${String(index + 1).padStart(2, "0")}-${slugify(pageName || template.pageName)}.png`,
      prompt: buildPlannerPagePrompt(record, template, designSystem, sourcePage),
      designSystem
    };
  });
}


