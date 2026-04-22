"use client";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { Workbook as ExcelWorkbook, Worksheet } from "exceljs";
type WorksheetColumns = Array<{ width?: number }>;
import type {
  CommerceServiceOutput,
  GeneratedProductPage,
  MissionArtifact,
  MissionRecord,
  ProductTheme,
  SpreadsheetWorkbookSpec
} from "@/lib/missions";
import type { ListingPreviewData } from "@/components/ListingPreviewCard";

export type GeneratedProductImageAsset = {
  filename: string;
  pageName: string;
  prompt: string;
  imageDataUrl: string;
};

type ExportPayload = {
  version: "1.0";
  missionId: string;
  mission: MissionRecord["mission"];
  taskList: MissionRecord["tasks"];
  agentAssignments: Array<{
    agentId: string;
    agentName: string;
    role: string;
    status: string;
    contribution: string;
    artifactCount: number;
  }>;
  completedTaskSummaries: Array<{
    taskId: string;
    title: string;
    assignedAgent: string;
    completedAt?: string;
    summary: string;
  }>;
  finalProduct: MissionRecord["report"]["finalProduct"];
  blockers: MissionRecord["report"]["blockers"];
  risks: MissionRecord["report"]["risks"];
  recommendations: {
    recommendedNextAction: string;
    recommendedNextStep: string;
  };
  artifacts: MissionRecord["artifacts"];
  finalMorningReport: MissionRecord["report"];
};

function buildExportPayload(record: MissionRecord): ExportPayload {
  return {
    version: "1.0",
    missionId: record.mission.id,
    mission: record.mission,
    taskList: record.tasks,
    agentAssignments: record.report.agentSummaries,
    completedTaskSummaries: record.tasks
      .filter((task) => task.status === "Completed")
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        assignedAgent: task.assignedAgent,
        completedAt: task.completedAt,
        summary: task.outputSummary
      })),
    finalProduct: record.report.finalProduct,
    blockers: record.report.blockers,
    risks: record.report.risks,
    recommendations: {
      recommendedNextAction: record.mission.recommendedNextAction,
      recommendedNextStep: record.report.recommendedNextStep
    },
    artifacts: record.artifacts,
    finalMorningReport: record.report
  };
}

export function extractListingPreview(record: MissionRecord): ListingPreviewData {
  const product = record.report.finalProduct;

  return {
    outputKind: product.outputKind,
    channel: product.channel,
    productName: product.title,
    title: product.listingTitle,
    description: product.listingDescription,
    tags: product.listingTags,
    price: product.price,
    productFormat: product.productFormat,
    targetBuyer: product.targetBuyer,
    deliverableType: product.deliverableType,
    productContents: product.productContents,
    mockupPrompt: product.mockupPrompt,
    fileDeliveryDescription: product.fileDeliveryDescription,
    workbookSpec: product.workbookSpec,
    serviceType: product.outputKind === "service" ? product.serviceType : undefined,
    deliverables: product.outputKind === "service" ? product.deliverables : undefined,
    deliveryProcess: product.outputKind === "service" ? product.deliveryProcess : undefined,
    packages: product.outputKind === "service" ? product.packages : undefined,
    turnaroundTime: product.outputKind === "service" ? product.turnaroundTime : undefined,
    actualWorkForClient: product.outputKind === "service" ? product.actualWorkForClient : undefined,
    reusableWorkflow: product.outputKind === "service" ? product.reusableWorkflow : undefined,
    scalabilityNotes: product.outputKind === "service" ? product.scalabilityNotes : undefined
  };
}

function ensureListingPreview(record: MissionRecord) {
  const preview = extractListingPreview(record);

  if (!preview.productName || !preview.title || !preview.description) {
    throw new Error("Listing export is missing required content.");
  }

  return preview;
}

function getThemeStyling(theme: ProductTheme) {
  const themeMap: Record<ProductTheme, { separator: string; accentLabel: string }> = {
    "minimalist clean": { separator: "------------------------------", accentLabel: "Minimalist clean" },
    "dark mode": { separator: "==============================", accentLabel: "Dark mode" },
    "feminine aesthetic": { separator: "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~", accentLabel: "Feminine aesthetic" },
    "bold modern": { separator: "##############################", accentLabel: "Bold modern" },
    "soft neutral": { separator: "..............................", accentLabel: "Soft neutral" }
  };

  return themeMap[theme];
}

function getProductFileSections(record: MissionRecord) {
  const preview = ensureListingPreview(record);
  const product = record.report.finalProduct;

  if (product.generatedProductPages.length === 0) {
    throw new Error("Product file export is missing blueprint pages.");
  }

  return {
    productName: preview.productName,
    productOverview: `${product.productType}. Designed for ${product.targetBuyer}. ${product.whyItWillSell}`,
    theme: product.theme,
    productContents: preview.productContents,
    generatedProductPages: product.generatedProductPages,
    fileDelivery: preview.fileDeliveryDescription,
    buyerNotes: "This file is a design blueprint for recreating the product in Canva. It is not a finished designed page pack."
  };
}

function renderGeneratedPagesToText(pages: GeneratedProductPage[]) {
  return pages
    .map((page) =>
      [
        `Page: ${page.pageName}`,
        `Layout: ${page.layoutDescription}`,
        `Sections: ${page.sections.join(" | ")}`,
        `Text Content: ${page.textContent.join(" | ")}`,
        `Style: ${page.visualStyleInstructions.join(" | ")}`,
        `Color Palette: ${page.colorPaletteSuggestion}`,
        `Font Style: ${page.fontStyleSuggestion}`,
        `Canva Build Instructions: ${page.canvaBuildInstructions.join(" | ")}`
      ].join("\n")
    )
    .join("\n\n");
}

function formatList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatArtifacts(artifacts: MissionArtifact[]) {
  return artifacts
    .map(
      (artifact) =>
        `### ${artifact.title}
Type: ${artifact.type}
Created by: ${artifact.createdBy}
File: ${artifact.linkLabel}

${artifact.summary}

${formatList(artifact.details)}`
    )
    .join("\n\n");
}

export function createMissionReportMarkdown(record: MissionRecord) {
  const payload = buildExportPayload(record);
  const completedTasks = payload.completedTaskSummaries.length
    ? payload.completedTaskSummaries
        .map(
          (task) =>
            `- ${task.title} (${task.assignedAgent})${task.completedAt ? ` - ${task.completedAt}` : ""}: ${task.summary}`
        )
        .join("\n")
    : "- No completed tasks recorded.";

  const agentAssignments = payload.agentAssignments
    .map(
      (agent) =>
        `- ${agent.agentName} (${agent.role}) - ${agent.status}: ${agent.contribution} [${agent.artifactCount} artifacts]`
    )
    .join("\n");

  const finalProduct =
    payload.finalProduct.outputKind === "service"
      ? [
          `- Service: ${payload.finalProduct.gigTitle}`,
          `- Target buyer: ${payload.finalProduct.targetBuyer}`,
          `- Why it will sell: ${payload.finalProduct.whyItWillSell}`,
          `- Theme: ${payload.finalProduct.theme}`,
          `- Output kind: ${payload.finalProduct.outputKind}`,
          `- Service type: ${payload.finalProduct.serviceType}`,
          `- Deliverables: ${payload.finalProduct.deliverables.join(", ")}`,
          `- Turnaround: ${payload.finalProduct.turnaroundTime}`,
          `- Packages: ${payload.finalProduct.packages.map((entry) => `${entry.name} ${entry.priceRange}`).join(" | ")}`,
          `- Difficulty: ${payload.finalProduct.estimatedDifficulty}`,
          `- MVP: ${payload.finalProduct.estimatedTimeToMVP}`
        ].join("\n")
      : [
          `- Product: ${payload.finalProduct.title}`,
          `- Target buyer: ${payload.finalProduct.targetBuyer}`,
          `- Why it will sell: ${payload.finalProduct.whyItWillSell}`,
          `- Theme: ${payload.finalProduct.theme}`,
          `- Product format: ${payload.finalProduct.productFormat}`,
          `- Product type: ${payload.finalProduct.productType}`,
          `- File format: ${payload.finalProduct.fileFormat}`,
          `- Product contents: ${payload.finalProduct.productContents.join(", ")}`,
          `- Design blueprint pages: ${payload.finalProduct.generatedProductPages.length}`,
          `- Difficulty: ${payload.finalProduct.estimatedDifficulty}`,
          `- MVP: ${payload.finalProduct.estimatedTimeToMVP}`
        ].join("\n");

  const workbookPreview = payload.finalProduct.workbookSpec
    ? [
        "## Workbook Preview",
        `- Workbook title: ${payload.finalProduct.workbookSpec.workbookTitle}`,
        `- Workbook structure: ${payload.finalProduct.workbookSpec.workbookStructure.join(", ")}`,
        `- Tab names: ${payload.finalProduct.workbookSpec.tabs.map((tab) => tab.tabName).join(", ")}`,
        `- Key formulas: ${payload.finalProduct.workbookSpec.keyFormulas.join(" | ")}`,
        `- What the buyer gets: ${payload.finalProduct.workbookSpec.whatBuyerGets.join(", ")}`
      ].join("\n")
    : "";

  return `# Mission Report: ${record.mission.title}

## Mission Metadata
- Mission ID: ${record.mission.id}
- Status: ${record.mission.status}
- Priority: ${record.mission.priority}
- Created: ${record.mission.createdAt}
- Started: ${record.mission.startedAt ?? "Not started"}
- Completed: ${record.mission.completedAt ?? "Not completed"}

## Mission Goal
${record.mission.goal}

## Constraints
${formatList(record.mission.constraints)}

## Executive Summary
${record.report.executiveSummary}

## Mission Summary
${record.report.missionSummary}

## Task List
${record.tasks
  .map(
    (task) =>
      `- ${task.title} (${task.assignedAgent}) - ${task.status}${task.startedAt ? ` | Started: ${task.startedAt}` : ""}${task.completedAt ? ` | Completed: ${task.completedAt}` : ""}`
  )
  .join("\n")}

## Agent Assignments
${agentAssignments}

## Completed Task Summaries
${completedTasks}

## ${payload.finalProduct.outputKind === "service" ? "Service Output" : "Listing Output"}
${finalProduct}

${workbookPreview}

## Blockers
${formatList(payload.blockers)}

## Risks
${formatList(payload.risks)}

## Recommendations
- Mission next action: ${payload.recommendations.recommendedNextAction}
- Morning report next step: ${payload.recommendations.recommendedNextStep}

## Artifacts
${formatArtifacts(payload.artifacts)}

## Complete ${payload.finalProduct.outputKind === "service" ? "Service" : "Listing"} Output
- ${payload.finalProduct.outputKind === "service" ? "Service" : "Listing"} output:

${record.report.finalMorningReport}

## Final Report Stats
- Confidence score: ${record.report.confidenceScore}%
- Failed task count: ${record.report.failedTaskIds.length}
- Artifact count: ${record.report.artifactsCreated.length}
`;
}

export async function copyMissionListingToClipboard(record: MissionRecord) {
  const preview = ensureListingPreview(record);
  const label = preview.outputKind === "service" ? "Service Name" : "Product Name";
  const content = [
    `${label}: ${preview.productName}`,
    `Title: ${preview.title}`,
    "Description:",
    preview.description,
    `Tags: ${preview.tags.join(", ")}`,
    `Price: ${preview.price}`,
    `Product Contents: ${preview.productContents.join(", ")}`,
    `Mockup Prompt: ${preview.mockupPrompt}`,
    `Product Format: ${preview.productFormat}`,
    `File Delivery Description: ${preview.fileDeliveryDescription}`
  ].join("\n");

  if (!navigator?.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable.");
  }

  await navigator.clipboard.writeText(content);
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function downloadFileBlob(filename: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");

  if (!header || !base64) {
    throw new Error("Generated image data is invalid.");
  }

  const mimeMatch = header.match(/data:(.*);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
}

function getDataUrlBase64(dataUrl: string) {
  const [, base64] = dataUrl.split(",");

  if (!base64) {
    throw new Error("Generated image data is invalid.");
  }

  return base64;
}

function normalizeWorksheetName(name: string) {
  return name.slice(0, 31) || "Sheet";
}

const WORKBOOK_THEME = {
  sheetBackground: "FFF7F1E8",
  headerBand: "FFDCCBB7",
  tableHeader: "FF8B6F5A",
  tableHeaderText: "FFFFFFFF",
  zebraOdd: "FFF9F3EC",
  zebraEven: "FFF3E8DC",
  totalsFill: "FFE5D8CA",
  summaryFill: "FFF1E7DB",
  accentText: "FF3E342D",
  border: "FFD1C2B3"
};

const TRACKER_ENTRY_COUNT = 19;
const CURRENCY_NUMBER_FORMAT = '"$"#,##0.00;[Red]-"$"#,##0.00';
const DATE_NUMBER_FORMAT = "mm/dd/yyyy";
const PERCENT_NUMBER_FORMAT = "0.0%";
const DEFAULT_STATUS_OPTIONS = ["Planned", "Booked", "Paid", "Completed"];
const DEFAULT_WEDDING_CATEGORIES = ["Venue", "Vendors", "Decor", "Attire", "Stationery", "Photography", "Music", "Food & Drink", "Transportation"];
const DEFAULT_GENERIC_CATEGORIES = ["Planning", "Essentials", "Admin", "Marketing", "Personal", "Operations"];
const TABLE_BORDER = {
  top: { style: "thin", color: { argb: WORKBOOK_THEME.border } },
  left: { style: "thin", color: { argb: WORKBOOK_THEME.border } },
  bottom: { style: "thin", color: { argb: WORKBOOK_THEME.border } },
  right: { style: "thin", color: { argb: WORKBOOK_THEME.border } }
} as const;

function createFallbackWorkbookSpec(record: MissionRecord): SpreadsheetWorkbookSpec {
  const product = record.report.finalProduct;

  return {
    workbookTitle: product.title,
    workbookStructure: ["Cover & Info", "Main Tracker", "Summary"],
    previewSummary: `${product.productType} workbook with editable spreadsheet tabs.`,
    tabs: [
      {
        tabName: "Cover & Info",
        purpose: "Workbook overview and buyer instructions.",
        columnHeaders: ["Field", "Value"],
        sampleRows: [
          ["Workbook Title", product.title],
          ["Product Type", product.productType],
          ["File Format", product.fileFormat]
        ],
        formulas: [],
        dropdownFields: [],
        themeStylingInstructions: [`Theme: ${product.theme}`]
      },
      {
        tabName: "Main Tracker",
        purpose: "Primary worksheet for editable buyer data.",
        columnHeaders: ["Data", "Notes"],
        sampleRows: [[product.productType, "Build tracker rows here"]],
        formulas: [],
        dropdownFields: [],
        themeStylingInstructions: ["Keep tracker rows readable and buyer-friendly"]
      },
      {
        tabName: "Summary",
        purpose: "Summary worksheet for buyer review.",
        columnHeaders: ["Summary", "Value"],
        sampleRows: [["Description", product.whyItWillSell]],
        formulas: [],
        dropdownFields: [],
        themeStylingInstructions: ["Use large summary metrics where relevant"]
      }
    ],
    keyFormulas: [],
    whatBuyerGets: product.productContents
  };
}

function toColumnLetter(columnNumber: number) {
  let current = columnNumber;
  let output = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - 1) / 26);
  }

  return output;
}

function findHeaderIndex(headers: string[], matcher: RegExp) {
  return headers.findIndex((header) => matcher.test(header.toLowerCase()));
}

function isIsoDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isCurrencyLabel(label: string) {
  return /(cost|planned|actual|variance|budget|income|price|payment|balance|total|savings)/i.test(label);
}

function isDateLabel(label: string) {
  return /date|month/i.test(label);
}

function isPercentLabel(label: string) {
  return /rate|percent|progress/i.test(label);
}

function extractDropdownValues(tab: SpreadsheetWorkbookSpec["tabs"][number], label: string) {
  const match = tab.dropdownFields.find((field) => field.toLowerCase().startsWith(`${label.toLowerCase()}:`));

  if (!match) {
    return [];
  }

  return match
    .split(":")
    .slice(1)
    .join(":")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function getCategoryOptions(tab: SpreadsheetWorkbookSpec["tabs"][number], columnIndex: number) {
  const explicitOptions = extractDropdownValues(tab, "Category");
  if (explicitOptions.length > 0) {
    return explicitOptions;
  }

  const sampleOptions = Array.from(
    new Set(
      tab.sampleRows
        .map((row) => String(row[columnIndex] ?? "").trim())
        .filter(Boolean)
    )
  );

  if (sampleOptions.length > 0) {
    return sampleOptions;
  }

  return /wedding/i.test(tab.tabName) ? DEFAULT_WEDDING_CATEGORIES : DEFAULT_GENERIC_CATEGORIES;
}

function getStatusOptions(tab: SpreadsheetWorkbookSpec["tabs"][number]) {
  if (/wedding/i.test(tab.tabName)) {
    return DEFAULT_STATUS_OPTIONS;
  }

  return extractDropdownValues(tab, "Status").length > 0 ? extractDropdownValues(tab, "Status") : DEFAULT_STATUS_OPTIONS;
}

function applyFill(cell: ReturnType<Worksheet["getCell"]>, color: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color }
  };
}

function styleHeaderRow(worksheet: Worksheet, rowNumber: number, columnCount: number) {
  const row = worksheet.getRow(rowNumber);
  row.height = 24;

  for (let index = 1; index <= columnCount; index += 1) {
    const cell = row.getCell(index);
    cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: WORKBOOK_THEME.tableHeaderText } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    applyFill(cell, WORKBOOK_THEME.tableHeader);
    cell.border = TABLE_BORDER;
  }
}

function styleBodyCell(cell: ReturnType<Worksheet["getCell"]>, rowNumber: number) {
  cell.font = { name: "Aptos", size: 11, color: { argb: WORKBOOK_THEME.accentText } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  applyFill(cell, rowNumber % 2 === 0 ? WORKBOOK_THEME.zebraOdd : WORKBOOK_THEME.zebraEven);
  cell.border = TABLE_BORDER;
}

function styleTotalsRow(worksheet: Worksheet, rowNumber: number, columnCount: number) {
  const row = worksheet.getRow(rowNumber);
  row.height = 24;

  for (let index = 1; index <= columnCount; index += 1) {
    const cell = row.getCell(index);
    cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: WORKBOOK_THEME.accentText } };
    cell.alignment = { vertical: "middle", horizontal: index === 1 ? "left" : "right" };
    applyFill(cell, WORKBOOK_THEME.totalsFill);
    cell.border = TABLE_BORDER;
  }
}

function setTypedCellValue(cell: ReturnType<Worksheet["getCell"]>, value: string | number, label: string) {
  if (typeof value === "string" && value.startsWith("=")) {
    cell.value = { formula: value.slice(1) };
    return;
  }

  if (typeof value === "string" && isIsoDateString(value)) {
    const parsedDate = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      cell.value = parsedDate;
      cell.numFmt = DATE_NUMBER_FORMAT;
      return;
    }
  }

  if (typeof value === "string" && isPercentLabel(label) && value.trim().endsWith("%")) {
    const parsedPercent = Number.parseFloat(value);
    if (Number.isFinite(parsedPercent)) {
      cell.value = parsedPercent / 100;
      cell.numFmt = PERCENT_NUMBER_FORMAT;
      return;
    }
  }

  cell.value = value;
}

function applyColumnFormatting(worksheet: Worksheet, headers: string[], startRow: number, endRow: number) {
  headers.forEach((header, headerIndex) => {
    const column = worksheet.getColumn(headerIndex + 1);

    if (isCurrencyLabel(header)) {
      column.numFmt = CURRENCY_NUMBER_FORMAT;
      column.alignment = { horizontal: "right" };
    } else if (isDateLabel(header)) {
      column.numFmt = DATE_NUMBER_FORMAT;
      column.alignment = { horizontal: "center" };
    } else if (isPercentLabel(header)) {
      column.numFmt = PERCENT_NUMBER_FORMAT;
      column.alignment = { horizontal: "right" };
    }

    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(headerIndex + 1);
      if (isCurrencyLabel(header) || isPercentLabel(header)) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
      if (isDateLabel(header)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    }
  });
}

function applyDropdownValidation(worksheet: Worksheet, columnIndex: number, startRow: number, endRow: number, options: string[]) {
  const formula = `"${options.join(",")}"`;

  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    worksheet.getRow(rowNumber).getCell(columnIndex).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Choose from the list",
      error: "Select a value from the dropdown list."
    };
  }
}

function buildCoverInfoSheet(workbook: ExcelWorkbook, record: MissionRecord, workbookSpec: SpreadsheetWorkbookSpec) {
  const product = record.report.finalProduct;
  const coverTab = workbookSpec.tabs[0];
  const worksheet = workbook.addWorksheet(normalizeWorksheetName(coverTab?.tabName ?? "Cover & Info"));
  worksheet.properties.defaultRowHeight = 22;
  worksheet.columns = [{ width: 24 }, { width: 54 }];

  worksheet.mergeCells("A1:B1");
  worksheet.getCell("A1").value = workbookSpec.workbookTitle;
  worksheet.getCell("A1").font = { name: "Aptos Display", size: 18, bold: true, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  applyFill(worksheet.getCell("A1"), WORKBOOK_THEME.headerBand);
  worksheet.getCell("A1").border = TABLE_BORDER;
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells("A2:B2");
  worksheet.getCell("A2").value = "A polished planner workbook designed for instant use and simple editing.";
  worksheet.getCell("A2").font = { name: "Aptos", size: 11, italic: true, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
  applyFill(worksheet.getCell("A2"), WORKBOOK_THEME.summaryFill);
  worksheet.getCell("A2").border = TABLE_BORDER;

  worksheet.mergeCells("A3:B3");
  worksheet.getCell("A3").value = "Quick Instructions: update the setup details here, then use the tracker tab for entries and the dashboard tab for rollup totals.";
  worksheet.getCell("A3").font = { name: "Aptos", size: 10, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell("A3").alignment = { wrapText: true, vertical: "middle" };
  applyFill(worksheet.getCell("A3"), WORKBOOK_THEME.zebraOdd);
  worksheet.getCell("A3").border = TABLE_BORDER;
  worksheet.getRow(3).height = 36;

  worksheet.getRow(5).values = ["Field", "Value"];
  styleHeaderRow(worksheet, 5, 2);

  const rows: Array<[string, string | number]> = [
    ...((coverTab?.sampleRows ?? []) as Array<[string, string | number]>),
    ["Product Format", product.productFormat],
    ["File Format", product.fileFormat],
    ["Target Buyer", product.targetBuyer],
    ["Theme", product.theme],
    ["Workbook Structure", workbookSpec.workbookStructure.join(" | ")],
    ["Buyer Gets", workbookSpec.whatBuyerGets.join(" | ")]
  ];

  rows.forEach(([label, value], rowOffset) => {
    const rowNumber = 6 + rowOffset;
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = label;
    setTypedCellValue(row.getCell(2), value, label);
    styleBodyCell(row.getCell(1), rowNumber);
    styleBodyCell(row.getCell(2), rowNumber);
    row.getCell(1).font = { name: "Aptos", size: 11, bold: true, color: { argb: WORKBOOK_THEME.accentText } };
    if (isCurrencyLabel(label)) {
      row.getCell(2).numFmt = CURRENCY_NUMBER_FORMAT;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    if (isDateLabel(label)) {
      row.getCell(2).numFmt = DATE_NUMBER_FORMAT;
      row.getCell(2).alignment = { horizontal: "center" };
    }
  });
}

function buildTrackerSheet(workbook: ExcelWorkbook, workbookSpec: SpreadsheetWorkbookSpec) {
  const trackerTab = workbookSpec.tabs[1];
  const headers = trackerTab?.columnHeaders ?? ["Item", "Category", "Planned Cost", "Actual Cost", "Variance", "Status"];
  const worksheet = workbook.addWorksheet(normalizeWorksheetName(trackerTab?.tabName ?? "Wedding Tracker"), {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  worksheet.properties.defaultRowHeight = 22;
  worksheet.columns = headers.map((header) => ({
    width: /(item|creditor|vendor)/i.test(header) ? 24 : /(category|status)/i.test(header) ? 18 : /(planned|actual|variance|balance|payment|rate)/i.test(header) ? 16 : isDateLabel(header) ? 16 : 20
  }));
  worksheet.autoFilter = { from: "A1", to: `${toColumnLetter(headers.length)}1` };
  worksheet.getRow(1).values = headers;
  styleHeaderRow(worksheet, 1, headers.length);

  const plannedIndex = findHeaderIndex(headers, /planned/);
  const actualIndex = findHeaderIndex(headers, /actual/);
  const varianceIndex = findHeaderIndex(headers, /variance/);
  const startingBalanceIndex = findHeaderIndex(headers, /starting balance/);
  const monthlyPaymentIndex = findHeaderIndex(headers, /monthly payment/);
  const remainingBalanceIndex = findHeaderIndex(headers, /remaining balance/);
  const statusIndex = findHeaderIndex(headers, /status/);
  const categoryIndex = findHeaderIndex(headers, /category/);

  for (let offset = 0; offset < TRACKER_ENTRY_COUNT; offset += 1) {
    const rowNumber = offset + 2;
    const sourceRow = trackerTab?.sampleRows[offset] ?? [];
    const row = worksheet.getRow(rowNumber);

    headers.forEach((header, headerIndex) => {
      const cell = row.getCell(headerIndex + 1);
      const sourceValue = sourceRow[headerIndex];
      const plannedCellRef = plannedIndex >= 0 ? `${toColumnLetter(plannedIndex + 1)}${rowNumber}` : "";
      const actualCellRef = actualIndex >= 0 ? `${toColumnLetter(actualIndex + 1)}${rowNumber}` : "";
      const startingBalanceRef = startingBalanceIndex >= 0 ? `${toColumnLetter(startingBalanceIndex + 1)}${rowNumber}` : "";
      const monthlyPaymentRef = monthlyPaymentIndex >= 0 ? `${toColumnLetter(monthlyPaymentIndex + 1)}${rowNumber}` : "";

      if (varianceIndex === headerIndex && plannedIndex >= 0 && actualIndex >= 0) {
        cell.value = {
          formula: `IF(OR(${actualCellRef}="",${plannedCellRef}=""),"",${actualCellRef}-${plannedCellRef})`
        };
      } else if (remainingBalanceIndex === headerIndex && startingBalanceIndex >= 0 && monthlyPaymentIndex >= 0) {
        cell.value = {
          formula: `IF(OR(${startingBalanceRef}="",${monthlyPaymentRef}=""),"",${startingBalanceRef}-${monthlyPaymentRef})`
        };
      } else if (typeof sourceValue === "string" && sourceValue.startsWith("=")) {
        cell.value = { formula: sourceValue.slice(1) };
      } else if (sourceValue !== undefined) {
        setTypedCellValue(cell, sourceValue, header);
      } else {
        cell.value = "";
      }

      styleBodyCell(cell, rowNumber);
    });
  }

  const totalsRowNumber = TRACKER_ENTRY_COUNT + 2;
  const totalsRow = worksheet.getRow(totalsRowNumber);
  totalsRow.getCell(1).value = "Totals";

  headers.forEach((header, headerIndex) => {
    if (headerIndex === 0) {
      return;
    }

    if (isCurrencyLabel(header)) {
      const columnLetter = toColumnLetter(headerIndex + 1);
      totalsRow.getCell(headerIndex + 1).value = { formula: `SUM(${columnLetter}2:${columnLetter}${TRACKER_ENTRY_COUNT + 1})` };
    }
  });

  styleTotalsRow(worksheet, totalsRowNumber, headers.length);
  applyColumnFormatting(worksheet, headers, 2, totalsRowNumber);

  if (statusIndex >= 0) {
    applyDropdownValidation(worksheet, statusIndex + 1, 2, TRACKER_ENTRY_COUNT + 1, getStatusOptions(trackerTab));
  }

  if (categoryIndex >= 0) {
    applyDropdownValidation(worksheet, categoryIndex + 1, 2, TRACKER_ENTRY_COUNT + 1, getCategoryOptions(trackerTab, categoryIndex));
  }
}

function buildDashboardSheet(workbook: ExcelWorkbook, workbookSpec: SpreadsheetWorkbookSpec) {
  const dashboardTab = workbookSpec.tabs[2];
  const trackerTab = workbookSpec.tabs[1];
  const headers = dashboardTab?.columnHeaders ?? ["Metric", "Value"];
  const worksheet = workbook.addWorksheet(normalizeWorksheetName(dashboardTab?.tabName ?? "Wedding Dashboard"));
  worksheet.properties.defaultRowHeight = 24;
  worksheet.columns = [{ width: 28 }, { width: 22 }];

  worksheet.mergeCells("A1:B1");
  worksheet.getCell("A1").value = dashboardTab?.tabName ?? "Wedding Dashboard";
  worksheet.getCell("A1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  applyFill(worksheet.getCell("A1"), WORKBOOK_THEME.headerBand);
  worksheet.getCell("A1").border = TABLE_BORDER;

  worksheet.mergeCells("A2:B2");
  worksheet.getCell("A2").value = dashboardTab?.purpose ?? "Summary metrics that pull directly from the tracker.";
  worksheet.getCell("A2").font = { name: "Aptos", size: 10, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell("A2").alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
  applyFill(worksheet.getCell("A2"), WORKBOOK_THEME.summaryFill);
  worksheet.getCell("A2").border = TABLE_BORDER;
  worksheet.getRow(2).height = 34;

  worksheet.getRow(4).values = headers;
  styleHeaderRow(worksheet, 4, 2);

  const metrics = dashboardTab?.sampleRows?.length
    ? dashboardTab.sampleRows
    : [["Total Planned", `=SUM('${normalizeWorksheetName(trackerTab?.tabName ?? "Wedding Tracker")}'!C2:C20)`], ["Total Actual", `=SUM('${normalizeWorksheetName(trackerTab?.tabName ?? "Wedding Tracker")}'!D2:D20)`], ["Total Variance", `=SUM('${normalizeWorksheetName(trackerTab?.tabName ?? "Wedding Tracker")}'!E2:E20)`]];

  metrics.forEach(([metric, value], index) => {
    const rowNumber = index + 5;
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = metric;
    if (typeof value === "string" && value.startsWith("=")) {
      row.getCell(2).value = { formula: value.slice(1) };
    } else {
      setTypedCellValue(row.getCell(2), value as string | number, metric as string);
    }

    [row.getCell(1), row.getCell(2)].forEach((cell) => {
      cell.font = { name: "Aptos", size: 12, bold: true, color: { argb: WORKBOOK_THEME.accentText } };
      cell.alignment = { vertical: "middle", horizontal: cell.address.startsWith("B") ? "right" : "left" };
      applyFill(cell, index % 2 === 0 ? WORKBOOK_THEME.summaryFill : WORKBOOK_THEME.zebraOdd);
      cell.border = TABLE_BORDER;
    });

    if (isCurrencyLabel(String(metric))) {
      row.getCell(2).numFmt = CURRENCY_NUMBER_FORMAT;
    }
    if (isPercentLabel(String(metric))) {
      row.getCell(2).numFmt = PERCENT_NUMBER_FORMAT;
    }
  });

  const notesStartRow = metrics.length + 7;
  worksheet.mergeCells(`A${notesStartRow}:B${notesStartRow}`);
  worksheet.getCell(`A${notesStartRow}`).value = `Formula Notes: ${(dashboardTab?.formulas ?? workbookSpec.keyFormulas).join(" | ")}`;
  worksheet.getCell(`A${notesStartRow}`).font = { name: "Aptos", size: 10, color: { argb: WORKBOOK_THEME.accentText } };
  worksheet.getCell(`A${notesStartRow}`).alignment = { wrapText: true, vertical: "middle" };
  applyFill(worksheet.getCell(`A${notesStartRow}`), WORKBOOK_THEME.zebraEven);
  worksheet.getCell(`A${notesStartRow}`).border = TABLE_BORDER;
  worksheet.getRow(notesStartRow).height = 38;
}

async function buildSpreadsheetWorkbook(record: MissionRecord) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const workbookSpec = record.report.finalProduct.workbookSpec ?? createFallbackWorkbookSpec(record);

  workbook.creator = "Agent Dashboard MVP";
  workbook.lastModifiedBy = "Agent Dashboard MVP";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = workbookSpec.previewSummary;
  workbook.title = workbookSpec.workbookTitle;
  workbook.company = "Agent Dashboard MVP";

  buildCoverInfoSheet(workbook, record, workbookSpec);
  buildTrackerSheet(workbook, workbookSpec);
  buildDashboardSheet(workbook, workbookSpec);

  return workbook;
}

async function downloadProductFileXlsx(record: MissionRecord) {
  const workbook = await buildSpreadsheetWorkbook(record);
  const filename = `product-file-${record.mission.id}.xlsx`;
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  downloadFileBlob(filename, blob);
  return filename;
}

async function downloadProductImageSet(record: MissionRecord, generatedImages: GeneratedProductImageAsset[]) {
  if (generatedImages.length === 0) {
    throw new Error("Generate the planner page images before downloading the product package.");
  }

  const zip = new JSZip();
  const packageFolder = zip.folder(`printable-product-${record.mission.id}`);
  const sortedImages = [...generatedImages].sort((left, right) => left.filename.localeCompare(right.filename));

  sortedImages.forEach((image, index) => {
    const orderedFilename = `${String(index + 1).padStart(2, "0")}-${image.filename}`;
    packageFolder?.file(orderedFilename, getDataUrlBase64(image.imageDataUrl), { base64: true });
  });

  packageFolder?.file(
    "README.txt",
    [
      `${record.report.finalProduct.title}`,
      `Included planner pages: ${sortedImages.length}`,
      `Format: PNG`,
      `Package type: Customer-facing printable planner page set`,
      `This ZIP contains the actual generated draft product pages in order.`,
      `Page order:`,
      ...sortedImages.map((image, index) => `${index + 1}. ${image.pageName} (${image.filename})`)
    ].join("\r\n")
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const filename = `printable-product-package-${record.mission.id}-${sortedImages.length}-pages.zip`;
  downloadFileBlob(filename, zipBlob);
  return filename;
}

export async function downloadProductFile(record: MissionRecord, generatedImages: GeneratedProductImageAsset[] = []) {
  if (record.report.finalProduct.outputKind === "service") {
    return downloadServicePackage(record.report.finalProduct);
  }

  if (record.report.finalProduct.productFormat === "spreadsheet") {
    return downloadProductFileXlsx(record);
  }

  return downloadProductImageSet(record, generatedImages);
}

function downloadServicePackage(service: CommerceServiceOutput) {
  const filename = `service-package-${service.id}.txt`;
  downloadBlob(
    filename,
    [
      `Service: ${service.gigTitle}`,
      `Channel: ${service.channel}`,
      `Target Buyer: ${service.targetBuyer}`,
      `Service Type: ${service.serviceType}`,
      `Price Range: ${service.price}`,
      `Turnaround: ${service.turnaroundTime}`,
      ``,
      `Gig Description:`,
      service.gigDescription,
      ``,
      `Deliverables:`,
      ...service.deliverables.map((entry) => `- ${entry}`),
      ``,
      `Packages:`,
      ...service.packages.map(
        (entry) => `- ${entry.name}: ${entry.priceRange} | ${entry.turnaroundTime} | ${entry.deliverables.join(", ")}`
      ),
      ``,
      `Delivery Process:`,
      ...service.deliveryProcess.map((entry, index) => `${index + 1}. ${entry}`),
      ``,
      `What I Actually Do For The Client:`,
      ...service.actualWorkForClient.map((entry) => `- ${entry}`),
      ``,
      `Reusable Workflow:`,
      ...service.reusableWorkflow.map((entry) => `- ${entry}`),
      ``,
      `Scale Notes:`,
      ...service.scalabilityNotes.map((entry) => `- ${entry}`)
    ].join("\n"),
    "text/plain;charset=utf-8"
  );
  return filename;
}

function createEditableProductInstructions(record: MissionRecord) {
  const preview = ensureListingPreview(record);
  const product = record.report.finalProduct;

  if (product.outputKind === "service") {
    return [
      `Reusable Service Workflow`,
      `Service: ${product.gigTitle}`,
      `Target Buyer: ${product.targetBuyer}`,
      `Service Type: ${product.serviceType}`,
      ``,
      `What I Actually Do For The Client:`,
      ...product.actualWorkForClient.map((entry) => `- ${entry}`),
      ``,
      `Delivery Process:`,
      ...product.deliveryProcess.map((entry, index) => `${index + 1}. ${entry}`),
      ``,
      `Reusable Workflow:`,
      ...product.reusableWorkflow.map((entry) => `- ${entry}`),
      ``,
      `Scale Notes:`,
      ...product.scalabilityNotes.map((entry) => `- ${entry}`)
    ].join("\n");
  }

  const pageInstructions = product.generatedProductPages
    .map((page, index) => {
      const layoutMap = page.sections.map((section, sectionIndex) => `  ${sectionIndex + 1}. ${section}`).join("\n");
      const textBlocks = page.textContent.map((line) => `  - ${line}`).join("\n");
      const steps = page.canvaBuildInstructions.map((step, stepIndex) => `  ${stepIndex + 1}. ${step}`).join("\n");

      return [
        `Page ${index + 1}: ${page.pageName}`,
        `Layout Description: ${page.layoutDescription}`,
        `Layout Mapping:`,
        layoutMap,
        `Text Content:`,
        textBlocks,
        `Canva Build Instructions:`,
        steps,
        `Style Notes: ${page.visualStyleInstructions.join(" | ")}`,
        `Palette: ${page.colorPaletteSuggestion}`,
        `Typography: ${page.fontStyleSuggestion}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Editable Product Instructions`,
    `Product: ${product.title}`,
    `Target Buyer: ${product.targetBuyer}`,
    `Product Type: ${product.productType}`,
    `Theme: ${product.theme}`,
    `Delivery Note: Editable version included via Canva instructions`,
    `How to Recreate in Canva:`,
    `1. Create a new portrait page for each planner page in Canva.`,
    `2. Rebuild each page using the layout mapping and text content below.`,
    `3. Apply the listed palette, typography, and style notes consistently across pages.`,
    `4. Export the finished design as PDF or PNG after recreating all pages.`,
    `5. Keep the product title and listing copy aligned with the current draft product assets.`,
    ``,
    `Listing Context:`,
    `Title: ${preview.title}`,
    `File Delivery Description: ${preview.fileDeliveryDescription}`,
    ``,
    pageInstructions
  ].join("\n");
}

export function downloadEditableProductInstructions(record: MissionRecord) {
  const filename = `editable-product-instructions-${record.mission.id}.txt`;
  downloadBlob(filename, createEditableProductInstructions(record), "text/plain;charset=utf-8");
  return filename;
}
export function downloadRawMissionReport(record: MissionRecord) {
  const filename = `raw-report-${record.mission.id}.txt`;
  downloadBlob(filename, record.report.finalMorningReport, "text/plain;charset=utf-8");
  return filename;
}
export function downloadMissionReportPdf(record: MissionRecord) {
  try {
    const preview = ensureListingPreview(record);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (neededHeight = 24) => {
      if (y + neededHeight <= pageHeight - margin) {
        return;
      }

      pdf.addPage();
      y = margin;
    };

    const addHeading = (text: string, size = 14) => {
      ensureSpace(26);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(size);
      pdf.text(text, margin, y);
      y += size + 8;
    };

    const addBody = (text: string, indent = 0) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      const lines = pdf.splitTextToSize(text, contentWidth - indent);
      const blockHeight = lines.length * 15;
      ensureSpace(blockHeight + 4);
      pdf.text(lines, margin + indent, y);
      y += blockHeight + 6;
    };

    addHeading(preview.productName, 20);
    addBody(`Title: ${preview.title}`);
    addBody(`Price: ${preview.price}`);

    addHeading("Description");
    addBody(preview.description);

    addHeading("Product Contents");
    preview.productContents.forEach((item) => addBody(`- ${item}`, 10));

    addHeading("Tags");
    addBody(preview.tags.join(", "));

    addHeading("File Delivery");
    addBody(preview.fileDeliveryDescription);

    addHeading("Mockup Prompt");
    addBody(preview.mockupPrompt);

    const pdfBlob = pdf.output("blob");
    downloadFileBlob(`listing-output-${record.mission.id}.pdf`, pdfBlob);
    return `listing-output-${record.mission.id}.pdf`;
  } catch (error) {
    console.error("PDF EXPORT ERROR:", error);
    throw error instanceof Error ? error : new Error("Export failed.");
  }
}

function buildBlueprintPageDocx(page: GeneratedProductPage, index: number, theme: ProductTheme) {
  const styling = getThemeStyling(theme);

  return [
    new Paragraph({
      text: `Page: ${page.pageName}`,
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: index > 0
    }),
    new Paragraph(styling.separator),
    new Paragraph({
      children: [new TextRun({ text: `Theme: ${styling.accentLabel}`, bold: true })]
    }),
    new Paragraph({
      children: [new TextRun({ text: "Layout Description", bold: true })]
    }),
    new Paragraph(page.layoutDescription),
    new Paragraph({
      children: [new TextRun({ text: "Sections", bold: true })]
    }),
    ...page.sections.map((section) => new Paragraph(`[ SECTION ] ${section}`)),
    new Paragraph({
      children: [new TextRun({ text: "Text Content", bold: true })]
    }),
    ...page.textContent.map((line) => new Paragraph(line)),
    new Paragraph({
      children: [new TextRun({ text: "Visual Style Instructions", bold: true })]
    }),
    ...page.visualStyleInstructions.map((line) => new Paragraph(line)),
    new Paragraph({
      children: [new TextRun({ text: "Color Palette Suggestion", bold: true })]
    }),
    new Paragraph(page.colorPaletteSuggestion),
    new Paragraph({
      children: [new TextRun({ text: "Font Style Suggestion", bold: true })]
    }),
    new Paragraph(page.fontStyleSuggestion),
    new Paragraph({
      children: [new TextRun({ text: "Canva Build Instructions", bold: true })]
    }),
    ...page.canvaBuildInstructions.map((line, lineIndex) => new Paragraph(`${lineIndex + 1}. ${line}`)),
    new Paragraph(styling.separator)
  ];
}

export async function downloadProductFileDocx(record: MissionRecord) {
  try {
    const sections = getProductFileSections(record);

    try {
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: sections.productName,
                heading: HeadingLevel.TITLE
              }),
              new Paragraph({
                children: [new TextRun({ text: `Theme: ${sections.theme}`, bold: true })]
              }),
              new Paragraph({
                children: [new TextRun({ text: "Design Blueprint", bold: true })]
              }),
              new Paragraph("This export is a Canva-style design blueprint, not a finished designed planner."),
              new Paragraph({
                children: [new TextRun({ text: "Product Overview", bold: true })]
              }),
              new Paragraph(sections.productOverview),
              new Paragraph({
                children: [new TextRun({ text: "Product Contents", bold: true })]
              }),
              ...sections.productContents.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })),
              new Paragraph({
                children: [new TextRun({ text: "File Delivery", bold: true })]
              }),
              new Paragraph(sections.fileDelivery),
              new Paragraph({
                children: [new TextRun({ text: "Notes for Buyer", bold: true })]
              }),
              new Paragraph(sections.buyerNotes),
              ...sections.generatedProductPages.flatMap((page, index) => buildBlueprintPageDocx(page, index, sections.theme))
            ]
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      downloadFileBlob(`product-file-${record.mission.id}.docx`, blob);
      return `product-file-${record.mission.id}.docx`;
    } catch (docxError) {
      console.error("DOCX EXPORT ERROR:", docxError);

      const content = `Product Name: ${sections.productName}

Theme:
${sections.theme}

Product Overview:
${sections.productOverview}

Product Contents:
${sections.productContents.map((item) => `- ${item}`).join("\n")}

Design Blueprint:
${renderGeneratedPagesToText(sections.generatedProductPages)}

File Delivery:
${sections.fileDelivery}

Notes for Buyer:
${sections.buyerNotes}
`;

      downloadBlob(`product-file-${record.mission.id}.txt`, content, "text/plain;charset=utf-8");
      return `product-file-${record.mission.id}.txt`;
    }
  } catch (error) {
    console.error("PRODUCT FILE EXPORT ERROR:", error);
    throw error instanceof Error ? error : new Error("Export failed.");
  }
}

export function downloadMissionReportJson(record: MissionRecord) {
  downloadBlob(
    `mission-report-${record.mission.id}.json`,
    JSON.stringify(buildExportPayload(record), null, 2),
    "application/json"
  );
}

export function downloadMissionReportMarkdown(record: MissionRecord) {
  downloadBlob(`listing-output-${record.mission.id}.md`, createMissionReportMarkdown(record), "text/markdown;charset=utf-8");
  return `listing-output-${record.mission.id}.md`;
}

export function downloadMissionArtifactsJson(record: MissionRecord) {
  downloadBlob(
    `mission-artifacts-${record.mission.id}.json`,
    JSON.stringify(record.artifacts, null, 2),
    "application/json"
  );
}
















