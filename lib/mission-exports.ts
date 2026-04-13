"use client";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import type { GeneratedProductPage, MissionArtifact, MissionRecord, ProductTheme } from "@/lib/missions";
import type { ListingPreviewData } from "@/components/ListingPreviewCard";

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
  const match = record.report.finalMorningReport.match(
    /Product Name:\s*(.*)\nTitle:\s*(.*)\nDescription:\n([\s\S]*?)\nTags:\s*(.*)\nPrice:\s*(.*)\nProduct Contents:\s*(.*)\nMockup Prompt:\s*(.*)\nFile Delivery Description:\s*([\s\S]*)/m
  );

  if (!match) {
    return {
      productName: record.report.finalProduct.title,
      title: "",
      description: "",
      tags: [],
      price: "",
      productContents: record.report.finalProduct.productContents,
      mockupPrompt: "",
      fileDeliveryDescription: ""
    };
  }

  return {
    productName: match[1].trim(),
    title: match[2].trim(),
    description: match[3].trim(),
    tags: match[4]
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    price: match[5].trim(),
    productContents: match[6]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    mockupPrompt: match[7].trim(),
    fileDeliveryDescription: match[8].trim()
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
    productOverview: `${product.productType}. Designed for ${product.targetAudience}. ${product.whyItWillSell}`,
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

  const finalProduct = [
    `- Product: ${payload.finalProduct.title}`,
    `- Target audience: ${payload.finalProduct.targetAudience}`,
    `- Why it will sell: ${payload.finalProduct.whyItWillSell}`,
    `- Theme: ${payload.finalProduct.theme}`,
    `- Product type: ${payload.finalProduct.productType}`,
    `- File format: ${payload.finalProduct.fileFormat}`,
    `- Product contents: ${payload.finalProduct.productContents.join(", ")}`,
    `- Design blueprint pages: ${payload.finalProduct.generatedProductPages.length}`,
    `- Difficulty: ${payload.finalProduct.estimatedDifficulty}`,
    `- MVP: ${payload.finalProduct.estimatedTimeToMVP}`
  ].join("\n");

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

## Etsy Listing Output
${finalProduct}

## Blockers
${formatList(payload.blockers)}

## Risks
${formatList(payload.risks)}

## Recommendations
- Mission next action: ${payload.recommendations.recommendedNextAction}
- Morning report next step: ${payload.recommendations.recommendedNextStep}

## Artifacts
${formatArtifacts(payload.artifacts)}

## Complete Etsy Listing
- Listing output:

${record.report.finalMorningReport}

## Final Report Stats
- Confidence score: ${record.report.confidenceScore}%
- Failed task count: ${record.report.failedTaskIds.length}
- Artifact count: ${record.report.artifactsCreated.length}
`;
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

export function copyMissionListingToClipboard(record: MissionRecord) {
  return navigator.clipboard.writeText(record.report.finalMorningReport);
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
    downloadFileBlob(`etsy-listing-${record.mission.id}.pdf`, pdfBlob);
    return `etsy-listing-${record.mission.id}.pdf`;
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

export async function downloadProductFilePdf(record: MissionRecord) {
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
  downloadBlob(`etsy-listing-${record.mission.id}.md`, createMissionReportMarkdown(record), "text/markdown;charset=utf-8");
  return `etsy-listing-${record.mission.id}.md`;
}

export function downloadMissionArtifactsJson(record: MissionRecord) {
  downloadBlob(
    `mission-artifacts-${record.mission.id}.json`,
    JSON.stringify(record.artifacts, null, 2),
    "application/json"
  );
}
