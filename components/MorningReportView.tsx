"use client";

import { useEffect, useState } from "react";
import { ListingPreviewCard } from "@/components/ListingPreviewCard";
import {
  copyMissionListingToClipboard,
  downloadMissionArtifactsJson,
  downloadProductFilePdf,
  downloadMissionReportJson,
  downloadMissionReportMarkdown,
  downloadMissionReportPdf,
  extractListingPreview
} from "@/lib/mission-exports";
import type { MissionArtifact, MissionRecord } from "@/lib/missions";

type MorningReportViewProps = {
  record: MissionRecord | null;
  onSendToPublishQueue: (record: MissionRecord) => void;
  isQueuedForPublish: boolean;
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

export function MorningReportView({ record, onSendToPublishQueue, isQueuedForPublish }: MorningReportViewProps) {
  const report = record?.report ?? null;
  const listing = report?.finalProduct ?? null;
  const preview = record ? extractListingPreview(record) : null;
  const [copyStatus, setCopyStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [mockupImageUrl, setMockupImageUrl] = useState("");
  const [mockupStatus, setMockupStatus] = useState("");

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
        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt: preview.mockupPrompt })
        });

        const data = (await response.json()) as { error?: string; imageDataUrl?: string };

        if (!response.ok) {
          console.error("IMAGE API RESPONSE:", data);
          if (!cancelled) {
            setMockupStatus(data.error ?? "Mockup preview unavailable.");
          }
          return;
        }

        if (!data.imageDataUrl) {
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

  const handleCopy = async () => {
    if (!record) {
      return;
    }

    try {
      await copyMissionListingToClipboard(record);
      setCopyStatus("Copied listing to clipboard.");
    } catch {
      setCopyStatus("Clipboard copy failed.");
    }
  };

  const handleListingExport = () => {
    if (!record) {
      return;
    }

    try {
      const filename = downloadMissionReportPdf(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      console.error("LISTING EXPORT UI ERROR:", error);
      setExportStatus(error instanceof Error ? error.message : "Listing export failed.");
    }
  };

  const handleProductFileExport = async () => {
    if (!record) {
      return;
    }

    try {
      const filename = await downloadProductFilePdf(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      console.error("PRODUCT FILE EXPORT UI ERROR:", error);
      setExportStatus(error instanceof Error ? error.message : "Product file export failed.");
    }
  };

  const handleMarkdownExport = () => {
    if (!record) {
      return;
    }

    try {
      const filename = downloadMissionReportMarkdown(record);
      setExportStatus(`Downloaded ${filename}.`);
    } catch (error) {
      console.error("MARKDOWN EXPORT UI ERROR:", error);
      setExportStatus(error instanceof Error ? error.message : "Markdown export failed.");
    }
  };

  return (
    <section className="report-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Listing Output</span>
          <h2 className="section-title">Review the single Etsy listing the pipeline prepared</h2>
        </div>
        <div className="report-actions-shell">
          <div className="mission-progress-card">
            <span className="stat-label">Confidence Score</span>
            <span className="stat-value">{report ? `${report.confidenceScore}%` : "--"}</span>
          </div>
          {record ? (
            <div className="export-actions" aria-label="Listing output exports">
              <button type="button" className="export-button" onClick={handleListingExport}>
                Download as PDF
              </button>
              <button type="button" className="export-button" onClick={handleProductFileExport}>
                Download Product File
              </button>
              <button type="button" className="export-button" onClick={handleMarkdownExport}>
                Download as Markdown
              </button>
              <button type="button" className="export-button" onClick={handleCopy}>
                Copy to Clipboard
              </button>
              <button type="button" className="export-button" onClick={() => downloadMissionReportJson(record)}>
                Download Report (JSON)
              </button>
              <button type="button" className="export-button" onClick={() => downloadMissionArtifactsJson(record)}>
                Download Artifacts (JSON)
              </button>
              <button
                type="button"
                className="export-button"
                onClick={() => onSendToPublishQueue(record)}
                disabled={isQueuedForPublish || record.mission.status !== "Completed"}
              >
                {isQueuedForPublish ? "Awaiting Approval" : "Send to Approval Queue"}
              </button>
            </div>
          ) : null}
          <div className="export-format-notes">
            <p className="agent-meta">PDF = printable listing</p>
            <p className="agent-meta">Product File = editable design blueprint</p>
            <p className="agent-meta">Markdown = raw editable text</p>
          </div>
          {copyStatus ? <p className="detail-body">{copyStatus}</p> : null}
          {exportStatus ? <p className="detail-body">{exportStatus}</p> : null}
        </div>
      </div>

      {report && preview ? (
        <div className="report-grid">
          <article className="runner-card runner-card-primary">
            <h3 className="runner-title">Listing Preview Card</h3>
            <p className="runner-body">{report.executiveSummary}</p>
            <ListingPreviewCard preview={preview} />
          </article>

          <aside className="runner-side-column">
            <section className="detail-card">
              <h3>Etsy Listing Output</h3>
              {listing ? (
                <div className="report-list">
                  <p className="detail-body">Product name: {listing.title}</p>
                  <p className="detail-body">Target audience: {listing.targetAudience}</p>
                  <p className="detail-body">Why it will sell: {listing.whyItWillSell}</p>
                  <p className="detail-body">Product type: {listing.productType}</p>
                  <p className="detail-body">File format: {listing.fileFormat}</p>
                  <p className="detail-body">Design blueprint pages: {listing.designBlueprint.length}</p>
                </div>
              ) : null}
            </section>

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
              <h3>Approval Guidance</h3>
              <p className="detail-body">{report.recommendedNextStep}</p>
            </section>
          </aside>
        </div>
      ) : (
        <div className="empty-shell">
          <h3 className="runner-title">Listing output pending</h3>
          <p className="detail-body">
            Once the workflow completes, the system will render one Etsy listing here with formatted listing content,
            product contents, a mockup preview section, and export actions.
          </p>
        </div>
      )}

      {report && preview ? (
        <>
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
