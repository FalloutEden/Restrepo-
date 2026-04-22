"use client";

import {
  downloadMissionArtifactsJson,
  downloadMissionReportJson,
  downloadMissionReportMarkdown
} from "@/lib/mission-exports";
import type { MissionRecord } from "@/lib/missions";

type MissionArchiveProps = {
  archive: MissionRecord[];
};

export function MissionArchive({ archive }: MissionArchiveProps) {
  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Archive</span>
          <h2 className="section-title">Previous product and service pipeline runs</h2>
        </div>
      </div>

      {archive.length > 0 ? (
        <div className="archive-grid">
          {archive.map((entry) => (
            <details key={entry.mission.id} className="detail-card archive-card archive-details">
              <summary className="archive-summary">
                <div className="runner-card-header">
                  <div>
                    <span className="field-label">{entry.mission.createdAt}</span>
                    <h3 className="runner-title">{entry.mission.title}</h3>
                  </div>
                  <span className={`runner-chip runner-chip-${entry.mission.status.toLowerCase()}`}>{entry.mission.status}</span>
                </div>
                <p className="detail-body">{entry.report.executiveSummary}</p>
                <div className="archive-metrics">
                  <span className="constraint-chip">{entry.tasks.length} tasks</span>
                  <span className="constraint-chip">{entry.artifacts.length} artifacts</span>
                  <span className="constraint-chip">{entry.report.confidenceScore}% confidence</span>
                </div>
              </summary>

              <div className="archive-expanded">
                <p className="detail-body">{entry.report.missionSummary}</p>
                <p className="agent-meta">{entry.mission.recommendedNextAction}</p>
                <div className="export-actions" aria-label={`Exports for ${entry.mission.title}`}>
                  <button type="button" className="export-button" onClick={() => downloadMissionReportMarkdown(entry)}>
                    Download Report (Markdown)
                  </button>
                  <button type="button" className="export-button" onClick={() => downloadMissionReportJson(entry)}>
                    Download Report (JSON)
                  </button>
                  <button type="button" className="export-button" onClick={() => downloadMissionArtifactsJson(entry)}>
                    Download Artifacts (JSON)
                  </button>
                </div>

                <div className="archive-expanded-grid">
                  <section className="detail-card">
                    <h3>{entry.report.finalProduct.outputKind === "service" ? "Service Output" : "Listing Output"}</h3>
                    <div className="report-list">
                      <p className="detail-body">{entry.report.finalProduct.title}</p>
                      <p className="detail-body">Channel: {entry.report.finalProduct.channel}</p>
                      <p className="detail-body">Target buyer: {entry.report.finalProduct.targetBuyer}</p>
                      <p className="detail-body">Why it will sell: {entry.report.finalProduct.whyItWillSell}</p>
                      <p className="detail-body">Format: {entry.report.finalProduct.format}</p>
                      <p className="detail-body">Deliverable type: {entry.report.finalProduct.deliverableType}</p>
                      <p className="detail-body">File format: {entry.report.finalProduct.fileFormat}</p>
                      <p className="detail-body">
                        {entry.report.finalProduct.outputKind === "service" ? "Deliverables" : "Product contents"}: {entry.report.finalProduct.productContents.join(", ")}
                      </p>
                      {entry.report.finalProduct.outputKind === "service" ? (
                        <>
                          <p className="detail-body">Gig title: {entry.report.finalProduct.gigTitle}</p>
                          <p className="detail-body">Turnaround: {entry.report.finalProduct.turnaroundTime}</p>
                          <p className="detail-body">Packages: {entry.report.finalProduct.packages.map((pkg) => `${pkg.name} ${pkg.priceRange}`).join(" | ")}</p>
                        </>
                      ) : null}
                      {entry.report.finalProduct.workbookSpec ? (
                        <p className="detail-body">
                          Workbook tabs: {entry.report.finalProduct.workbookSpec.tabs.map((tab) => tab.tabName).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </section>

                  <section className="detail-card">
                    <h3>Artifacts</h3>
                    <div className="report-list">
                      {entry.artifacts.map((artifact) => (
                        <p key={artifact.id} className="detail-body">
                          {artifact.title} ({artifact.type}) by {artifact.createdBy}
                        </p>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="empty-shell">
          <h3 className="runner-title">Archive empty</h3>
          <p className="detail-body">Completed product and service runs will be stored here so you can compare ideas, styles, gig structures, and listing directions over time.</p>
        </div>
      )}
    </section>
  );
}
