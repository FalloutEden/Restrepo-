"use client";

import type { CommerceChannel } from "@/lib/market-intelligence";
import type { ProductFormat, ServicePackageSpec, SpreadsheetWorkbookSpec } from "@/lib/missions";

export type ListingPreviewData = {
  outputKind: "product" | "service";
  channel: CommerceChannel;
  productName: string;
  title: string;
  description: string;
  tags: string[];
  price: string;
  productFormat: ProductFormat;
  targetBuyer: string;
  deliverableType: string;
  productContents: string[];
  mockupPrompt: string;
  fileDeliveryDescription: string;
  workbookSpec: SpreadsheetWorkbookSpec | null;
  serviceType?: string;
  deliverables?: string[];
  deliveryProcess?: string[];
  packages?: ServicePackageSpec[];
  turnaroundTime?: string;
  actualWorkForClient?: string[];
  reusableWorkflow?: string[];
  scalabilityNotes?: string[];
};

type ListingPreviewCardProps = {
  preview: ListingPreviewData;
};

export function ListingPreviewCard({ preview }: ListingPreviewCardProps) {
  const descriptionParagraphs = preview.description
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const isService = preview.outputKind === "service";

  return (
    <article className="listing-preview-card">
      <div className="listing-preview-header">
        <div>
          <span className="field-label">{isService ? "Service Name" : "Product Name"}</span>
          <h3 className="listing-preview-name">{preview.productName}</h3>
        </div>
        <div className="listing-price-badge">{preview.price}</div>
      </div>

      <section className="listing-preview-section">
        <span className="field-label">Channel</span>
        <p className="detail-body">{preview.channel}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Title</span>
        <p className="listing-preview-title">{preview.title}</p>
      </section>

      {isService ? (
        <section className="listing-preview-section">
          <span className="field-label">Service Output</span>
          <p className="detail-body">Service type: {preview.serviceType}</p>
          <p className="detail-body">Turnaround time: {preview.turnaroundTime}</p>
          {preview.deliverables?.length ? (
            <ul className="listing-bullet-list">
              {preview.deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="listing-preview-section">
        <span className="field-label">Target Buyer</span>
        <p className="detail-body">{preview.targetBuyer}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Deliverable Type</span>
        <p className="detail-body">{preview.deliverableType}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Tags</span>
        <div className="listing-tag-grid">
          {preview.tags.map((tag) => (
            <span key={tag} className="listing-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Description</span>
        <div className="listing-description">
          {descriptionParagraphs.map((paragraph) => (
            <p key={paragraph} className="detail-body">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Format</span>
        <p className="detail-body">{preview.productFormat}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">{isService ? "Deliverables" : "Product Contents"}</span>
        <ul className="listing-bullet-list">
          {preview.productContents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {isService && preview.packages?.length ? (
        <section className="listing-preview-section">
          <span className="field-label">Packages</span>
          <ul className="listing-bullet-list">
            {preview.packages.map((entry) => (
              <li key={entry.name}>
                {entry.name}: {entry.priceRange} | {entry.turnaroundTime} | {entry.deliverables.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isService && preview.deliveryProcess?.length ? (
        <section className="listing-preview-section">
          <span className="field-label">Delivery Process</span>
          <ul className="listing-bullet-list">
            {preview.deliveryProcess.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isService && preview.actualWorkForClient?.length ? (
        <section className="listing-preview-section">
          <span className="field-label">What I Actually Do For The Client</span>
          <ul className="listing-bullet-list">
            {preview.actualWorkForClient.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isService && preview.reusableWorkflow?.length ? (
        <section className="listing-preview-section">
          <span className="field-label">Reusable Workflow</span>
          <ul className="listing-bullet-list">
            {preview.reusableWorkflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isService && preview.scalabilityNotes?.length ? (
        <section className="listing-preview-section">
          <span className="field-label">How To Scale It</span>
          <ul className="listing-bullet-list">
            {preview.scalabilityNotes.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview.workbookSpec ? (
        <section className="listing-preview-section">
          <span className="field-label">Workbook Preview</span>
          <p className="detail-body">{preview.workbookSpec.previewSummary}</p>
          <ul className="listing-bullet-list">
            <li>Workbook structure: {preview.workbookSpec.workbookStructure.join(", ")}</li>
            <li>Tab names: {preview.workbookSpec.tabs.map((tab) => tab.tabName).join(", ")}</li>
            <li>Key formulas: {preview.workbookSpec.keyFormulas.join(" | ")}</li>
            <li>What the buyer gets: {preview.workbookSpec.whatBuyerGets.join(", ")}</li>
          </ul>
        </section>
      ) : null}

      <section className="listing-preview-section">
        <span className="field-label">File Delivery</span>
        <p className="detail-body">{preview.fileDeliveryDescription}</p>
      </section>

      <section className="listing-preview-section">
        <span className="field-label">Mockup Prompt</span>
        <p className="detail-body">{preview.mockupPrompt}</p>
      </section>
    </article>
  );
}
