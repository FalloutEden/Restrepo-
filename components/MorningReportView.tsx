"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "@/lib/client-auth";
import { ListingPreviewCard } from "@/components/ListingPreviewCard";
import {
  downloadEditableProductInstructions,
  downloadMissionArtifactsJson,
  downloadMissionReportJson,
  downloadMissionReportMarkdown,
  downloadProductFile,
  downloadRawMissionReport,
  extractListingPreview,
  type GeneratedProductImageAsset
} from "@/lib/mission-exports";
import { getProductPageImageSpecs } from "@/lib/product-image-generation";
import {
  deriveProductReviewState,
  type MissionArtifact,
  type MissionRecord,
  type ProductReviewState,
  type PublishQueueStatus
} from "@/lib/missions";
import type { ProductFeedbackRating } from "@/lib/style-intelligence";

type MorningReportViewProps = {
  record: MissionRecord | null;
  onApproveProduct: (record: MissionRecord) => void;
  onRedoProduct: () => void;
  onSubmitTrainingFeedback: (record: MissionRecord, rating: ProductFeedbackRating, notes: string) => void;
  publishQueueStatus: PublishQueueStatus | null;
};

type ImageApiResponse = {
  error?: string;
  imageDataUrl?: string;
};

function formatArtifactDetail(detail: string) {
  const separatorIndex = detail.indexOf(": ");
  if (separatorIndex === -1) {
    return { label: "", value: detail };
  }

  return {
    label: detail.slice(0, separatorIndex),
    value: detail.slice(separatorIndex + 2)
  };
}

function ArtifactCard({ artifact }: { artifact: MissionArtifact }) {
  return (
    <article className="artifact-card artifact-showcase-card">
      <div className="artifact-showcase-header">
        <span className="field-label">{artifact.type}</span>
        <span className="runner-chip runner-chip-completed">{artifact.createdBy}</span>
      </div>
      <h4 className="task-title">{artifact.title}</h4>
      <p className="detail-body">{artifact.summary}</p>
      <div className="artifact-showcase-body">
        {artifact.details.map((detail) => {
          const parsed = formatArtifactDetail(detail);
          return parsed.label ? (
            <div key={detail} className="artifact-detail-row">
              <span className="field-label">{parsed.label}</span>
              <p className="detail-body">{parsed.value}</p>
            </div>
          ) : (
            <p key={detail} className="detail-body artifact-detail-note">
              {detail}
            </p>
          );
        })}
      </div>
      <span className="agent-meta">{artifact.linkLabel}</span>
    </article>
  );
}

export function MorningReportView({
  record,
  onApproveProduct,
  onRedoProduct,
  onSubmitTrainingFeedback,
  publishQueueStatus
}: MorningReportViewProps) {
  const report = record?.report ?? null;
  const listing = report?.finalProduct ?? null;
  const preview = record ? extractListingPreview(record) : null;
  const productPageSpecs = useMemo(() => (record ? getProductPageImageSpecs(record) : []), [record]);
  const isService = listing?.outputKind === "service";
  const outputLabel = isService ? "Service" : "Product";
  const productPreviewRef = useRef<HTMLElement | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const [mockupImageUrl, setMockupImageUrl] = useState("");
  const [mockupStatus, setMockupStatus] = useState("");
  const [productPageImages, setProductPageImages] = useState<GeneratedProductImageAsset[]>([]);
  const [productPageStatus, setProductPageStatus] = useState("");
  const [reviewState, setReviewState] = useState<ProductReviewState>("Draft Generated");
  const [feedbackRating, setFeedbackRating] = useState<ProductFeedbackRating>("good");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");

  const productAssetsReady = Boolean(
    record &&
      (record.report.finalProduct.outputKind === "service" ||
        record.report.finalProduct.productFormat === "spreadsheet" ||
        productPageImages.length === productPageSpecs.length)
  );

  useEffect(() => {
    setReviewState(
      deriveProductReviewState(record, {
        queueStatus: publishQueueStatus,
        assetsReady: productAssetsReady
      })
    );
  }, [productAssetsReady, publishQueueStatus, record]);

  useEffect(() => {
    setFeedbackStatus("");
    setFeedbackNotes("");
    setFeedbackRating("good");
  }, [record?.mission.id]);

  useEffect(() => {
    if (!preview?.mockupPrompt) {
      setMockupImageUrl("");
      setMockupStatus("");
      return;
    }

    let cancelled = false;

    const generateMockup = async () => {
      setMockupStatus("Generating mockup...");
      setMockupImageUrl("");

      try {
        const response = await authedFetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt: preview.mockupPrompt })
        });

        const data = (await response.json()) as ImageApiResponse;

        if (!response.ok || !data.imageDataUrl) {
          if (!cancelled) {
            setMockupStatus(data.error ?? "Mockup preview unavailable.");
          }
          return;
        }

        if (!cancelled) {
          setMockupImageUrl(data.imageDataUrl);
          setMockupStatus("");
        }
      } catch {
        if (!cancelled) {
          setMockupStatus("Mockup preview unavailable.");
        }
      }
    };

    void generateMockup();

    return () => {
      cancelled = true;
    };
  }, [preview?.mockupPrompt]);

  useEffect(() => {
    if (!record || productPageSpecs.length === 0) {
      setProductPageImages([]);
      setProductPageStatus(record?.report.finalProduct.outputKind === "service" ? "Service output does not require planner page rendering." : "");
      return;
    }

    if (record.report.finalProduct.outputKind === "service") {
      setProductPageImages([]);
      setProductPageStatus("Service output does not require planner page rendering.");
      return;
    }

    if (record.report.finalProduct.productFormat === "spreadsheet") {
      setProductPageImages([]);
      setProductPageStatus("Spreadsheet product ready for workbook download.");
      return;
    }

    let cancelled = false;

    const generateProductPages = async () => {
      setProductPageImages([]);
      setProductPageStatus(`Generating planner pages (0/${productPageSpecs.length})...`);
      const generatedAssets: GeneratedProductImageAsset[] = [];

      for (const [index, spec] of productPageSpecs.entries()) {
        if (cancelled) {
          return;
        }

        setProductPageStatus(`Generating planner pages (${index + 1}/${productPageSpecs.length})...`);

        try {
          const response = await authedFetch("/api/generate-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              prompt: spec.prompt,
              size: "1024x1536"
            })
          });

          const data = (await response.json()) as ImageApiResponse;

          if (!response.ok || !data.imageDataUrl) {
            if (!cancelled) {
              setProductPageStatus(data.error ?? `Unable to render ${spec.pageName}.`);
            }
            return;
          }

          generatedAssets.push({
            filename: spec.filename,
            pageName: spec.pageName,
            prompt: spec.prompt,
            imageDataUrl: data.imageDataUrl
          });

          if (!cancelled) {
            setProductPageImages([...generatedAssets]);
          }
        } catch {
          if (!cancelled) {
            setProductPageStatus(`Unable to render ${spec.pageName}.`);
          }
          return;
        }
      }

      if (!cancelled) {
        setProductPageStatus(`Generated ${generatedAssets.length} planner pages. These are the current draft product pages under review.`);
      }
    };

    void generateProductPages();

    return () => {
      cancelled = true;
    };
  }, [productPageSpecs, record]);

  const handlePreviewProduct = () => {
    productPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleProductDownload = async () => {
    if (!record) {
      return;
    }

    try {
      const filename = await downloadProductFile(record, productPageImages);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      console.error("PRODUCT FILE EXPORT UI ERROR:", error);
      setExportStatus(error instanceof Error ? error.message : "Product download failed.");
    }
  };

  const handleApprove = () => {
    if (!record) {
      return;
    }

    onApproveProduct(record);
    setExportStatus(`Current ${isService ? "service" : "product"} marked as approved.`);
  };

  const handleSubmitFeedback = () => {
    if (!record) {
      return;
    }

    onSubmitTrainingFeedback(record, feedbackRating, feedbackNotes.trim());
    setFeedbackStatus(`Saved ${feedbackRating.toUpperCase()} feedback for the current ${isService ? "service" : "product"}.`);
    setFeedbackNotes("");
  };

  const handleMarkdownExport = () => {
    if (!record) {
      return;
    }

    try {
      const filename = downloadMissionReportMarkdown(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Markdown export failed.");
    }
  };

  const handleEditableInstructionsDownload = () => {
    if (!record) {
      return;
    }

    try {
      const filename = downloadEditableProductInstructions(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Editable instructions export failed.");
    }
  };

  const handleRawReportExport = () => {
    if (!record) {
      return;
    }

    try {
      const filename = downloadRawMissionReport(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Raw report export failed.");
    }
  };

  return (
    <section className="report-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Draft Review</span>
          <h2 className="section-title">Review the current generated draft {isService ? "service" : "product"} output</h2>
          <p className="detail-body">The output shown below is the actual current draft for this mission. Approval does not unlock a hidden version.</p>
        </div>
        <div className="report-actions-shell">
          <div className="mission-progress-card">
            <span className="stat-label">{outputLabel} State</span>
            <span className="stat-value">{reviewState}</span>
          </div>
          {record ? (
            <div className="export-actions" aria-label="Draft review actions">
              <button type="button" className="export-button" onClick={handlePreviewProduct}>
                Preview {outputLabel}
              </button>
              <button
                type="button"
                className="export-button"
                onClick={handleProductDownload}
                disabled={record.report.finalProduct.outputKind !== "service" && record.report.finalProduct.productFormat !== "spreadsheet" && !productAssetsReady}
              >
                Download {outputLabel}
              </button>
              <button type="button" className="export-button" onClick={onRedoProduct}>
                Redo {outputLabel}
              </button>
              <button
                type="button"
                className="export-button"
                onClick={handleApprove}
                disabled={!productAssetsReady || reviewState === "Approved"}
              >
                Approve {outputLabel}
              </button>
            </div>
          ) : null}
          <div className="export-format-notes">
            <p className="agent-meta">Download {outputLabel} = the current customer-facing or client-facing draft package</p>
            <p className="agent-meta">
              {isService
                ? "Service outputs download as a fulfillment-ready package with gig details, packages, and workflow notes."
                : "Printable products download as a full ZIP planner page package. Spreadsheet products download as XLSX."}
            </p>
            <p className="agent-meta">Approval does not generate a new hidden version. It marks the current draft as accepted.</p>
          </div>
          {exportStatus ? <p className="detail-body">{exportStatus}</p> : null}
          {record ? (
            <details className="detail-card">
              <summary className="task-title">Advanced Exports</summary>
              <div className="export-actions" aria-label="Advanced exports">
                <button type="button" className="export-button" onClick={handleMarkdownExport}>
                  Markdown
                </button>
                <button type="button" className="export-button" onClick={() => downloadMissionReportJson(record)}>
                  JSON
                </button>
                <button type="button" className="export-button" onClick={() => downloadMissionArtifactsJson(record)}>
                  Artifacts JSON
                </button>
                <button type="button" className="export-button" onClick={handleRawReportExport}>
                  Raw Report
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {report && preview ? (
        <div className="report-grid">
          <article ref={productPreviewRef} className="runner-card runner-card-primary">
            <h3 className="runner-title">Current Draft {outputLabel}</h3>
            <p className="runner-body">This output preview and the related assets below are the actual current draft under review.</p>
            <ListingPreviewCard preview={preview} />
          </article>

          <aside className="runner-side-column">
            <section className="detail-card">
              <h3>Review Status</h3>
              <p className="detail-body">State: {reviewState}</p>
              <p className="detail-body">{productAssetsReady ? "The current draft is ready for review." : "The current draft is still finishing asset generation."}</p>
              <p className="detail-body">Approval does not generate a new hidden version. It marks the current draft as accepted.</p>
            </section>

            <section className="detail-card">
              <h3>Training Feedback</h3>
              <p className="detail-body">Rate this draft so the next generation can reinforce, refine, or avoid the current direction.</p>
              <div className="export-actions" aria-label="Training feedback rating">
                <button type="button" className="export-button" onClick={() => setFeedbackRating("good")}>
                  Good
                </button>
                <button type="button" className="export-button" onClick={() => setFeedbackRating("mid")}>
                  Mid
                </button>
                <button type="button" className="export-button" onClick={() => setFeedbackRating("bad")}>
                  Bad
                </button>
              </div>
              <p className="detail-body">Selected rating: {feedbackRating.toUpperCase()}</p>
              <label className="field-label" htmlFor="training-feedback-notes">
                What should improve?
              </label>
              <textarea
                id="training-feedback-notes"
                className="mission-textarea"
                rows={4}
                value={feedbackNotes}
                onChange={(event) => setFeedbackNotes(event.target.value)}
                placeholder="Share what should improve next time."
              />
              <button type="button" className="export-button" onClick={handleSubmitFeedback}>
                Save Feedback
              </button>
              {feedbackStatus ? <p className="detail-body">{feedbackStatus}</p> : null}
            </section>

            <section className="detail-card">
              <h3>{isService ? "Reusable Workflow" : "Editable Version"}</h3>
              <p className="detail-body">
                {isService ? "This draft includes fulfillment guidance and reusable workflow notes." : "Editable version included via Canva instructions."}
              </p>
              <p className="detail-body">
                {isService
                  ? "Download the reusable workflow notes to see how the job can be fulfilled again and scaled."
                  : "Download step-by-step Canva build instructions, layout mapping, and page text for the current product."}
              </p>
            </section>

            <section className="detail-card">
              <h3>{isService ? "Output Summary" : "Product Summary"}</h3>
              {listing ? (
                <div className="report-list">
                  <p className="detail-body">{isService ? "Service name" : "Product name"}: {listing.title}</p>
                  <p className="detail-body">Channel: {listing.channel}</p>
                  <p className="detail-body">Target buyer: {listing.targetBuyer}</p>
                  <p className="detail-body">Why it will sell: {listing.whyItWillSell}</p>
                  <p className="detail-body">Format: {listing.format}</p>
                  <p className="detail-body">Deliverable type: {listing.deliverableType}</p>
                  <p className="detail-body">Product type: {listing.productType}</p>
                  <p className="detail-body">File format: {listing.fileFormat}</p>
                  {!isService ? <p className="detail-body">Generated page images: {productPageImages.length}/{productPageSpecs.length}</p> : null}
                  {listing.workbookSpec ? (
                    <>
                      <p className="detail-body">Workbook title: {listing.workbookSpec.workbookTitle}</p>
                      <p className="detail-body">Tab names: {listing.workbookSpec.tabs.map((tab) => tab.tabName).join(", ")}</p>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>

            {listing?.outputKind === "service" ? (
              <section className="detail-card">
                <h3>Service Output</h3>
                <p className="detail-body">Gig title: {listing.gigTitle}</p>
                <p className="detail-body">Service type: {listing.serviceType}</p>
                <p className="detail-body">Turnaround time: {listing.turnaroundTime}</p>
                <p className="detail-body">Deliverables: {listing.deliverables.join(", ")}</p>
                <p className="detail-body">Delivery process: {listing.deliveryProcess.join(" | ")}</p>
                <p className="detail-body">What I actually do for the client: {listing.actualWorkForClient.join(" | ")}</p>
                <p className="detail-body">Reusable workflow: {listing.reusableWorkflow.join(" | ")}</p>
              </section>
            ) : null}

            <section className="detail-card mockup-preview-card">
              <h3>Mockup Preview</h3>
              {mockupImageUrl ? (
                <div className="mockup-preview-generated">
                  <img src={mockupImageUrl} alt={`${preview.productName} mockup preview`} className="mockup-preview-image" />
                </div>
              ) : (
                <div className="mockup-preview-placeholder" aria-label="Mockup Preview">
                  <div className="mockup-preview-frame">
                    <span className="field-label">Mockup Preview</span>
                    <p className="detail-body">{mockupStatus || "Mockup Preview"}</p>
                  </div>
                </div>
              )}
              <p className="detail-body">{preview.mockupPrompt}</p>
            </section>

            <section className="detail-card">
              <h3>Style Intelligence</h3>
              <p className="detail-body">Selected channel: {listing?.channel}</p>
              <p className="detail-body">{listing?.selectedStyleProfile.name}</p>
              <p className="detail-body">{listing?.selectedStyleReason}</p>
              <p className="detail-body">Variation: {listing?.styleResearch.variationLabel}</p>
              <p className="detail-body">Research signals: {listing?.styleResearch.influencingResearchSignals.join(" | ")}</p>
              <p className="detail-body">Approved references: {listing?.styleResearch.approvedReferenceExamples.join(", ") || "None yet"}</p>
              <p className="detail-body">Rejected references: {listing?.styleResearch.rejectedReferenceExamples.join(", ") || "None yet"}</p>
              {!isService ? <p className="detail-body">Design system palette: {productPageSpecs[0]?.designSystem.palette.join(", ")}</p> : null}
              {!isService ? <p className="detail-body">Design system type: {productPageSpecs[0]?.designSystem.fontStyle}</p> : null}
              {!isService ? <p className="detail-body">Design system spacing: {productPageSpecs[0]?.designSystem.spacingRules}</p> : null}
            </section>
          </aside>
        </div>
      ) : (
        <div className="empty-shell">
          <h3 className="runner-title">Draft review pending</h3>
          <p className="detail-body">
            Once the workflow completes, the system will show the actual generated draft output, review preview, mockup preview, and download actions here.
          </p>
        </div>
      )}

      {report && preview ? (
        <>
          {!isService ? (
            <section className="detail-card">
              <h3>Generated Planner Pages</h3>
              <p className="detail-body">{productPageStatus || `Preparing ${productPageSpecs.length} planner pages.`}</p>
              <p className="detail-body">These visible planner pages are the current generated draft product. When Download Product is available, the ZIP package includes every rendered page in this ordered set.</p>
              <div className="artifact-grid">
                {productPageImages.map((image) => (
                  <article key={image.filename} className="artifact-card artifact-showcase-card">
                    <div className="artifact-showcase-header">
                      <span className="field-label">Planner Page</span>
                      <span className="runner-chip runner-chip-completed">Rendered</span>
                    </div>
                    <h4 className="task-title">{productPageSpecs.find((spec) => spec.filename === image.filename)?.displayLabel ?? image.pageName}</h4>
                    <div className="mockup-preview-generated">
                      <img src={image.imageDataUrl} alt={image.pageName} className="mockup-preview-image" />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="report-section-grid">
            <section className="detail-card">
              <h3>Agent Contributions</h3>
              <div className="contribution-list">
                {report.agentSummaries.map((agent) => (
                  <div key={agent.agentId} className="contribution-row">
                    <div>
                      <p className="task-title">{agent.agentName}</p>
                      <p className="agent-meta">{agent.role}</p>
                    </div>
                    <div className="contribution-copy">
                      <span className={`runner-chip runner-chip-${agent.status.toLowerCase()}`}>{agent.status}</span>
                      <p className="detail-body">{agent.contribution}</p>
                      <span className="agent-meta">{agent.artifactCount} artifacts</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-card">
              <h3>Mission Notes</h3>
              <p className="detail-body">{report.missionSummary}</p>
              <div className="report-list">
                {report.risks.map((item) => (
                  <p key={item} className="detail-body">
                    Risk: {item}
                  </p>
                ))}
                {report.blockers.map((item) => (
                  <p key={item} className="detail-body">
                    Blocker: {item}
                  </p>
                ))}
              </div>
            </section>
          </div>

          <section className="detail-card">
            <h3>Rendered Artifacts</h3>
            <div className="artifact-grid">
              {report.artifactsCreated.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}










