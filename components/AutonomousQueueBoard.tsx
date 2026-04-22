"use client";

import type { OpportunityQueueJob } from "@/lib/autonomous-research";

type AutonomousQueueBoardProps = {
  eyebrow: string;
  title: string;
  emptyCopy: string;
  items: OpportunityQueueJob[];
  onSelectReviewMission?: (missionId: string) => void;
};

export function AutonomousQueueBoard({
  eyebrow,
  title,
  emptyCopy,
  items,
  onSelectReviewMission
}: AutonomousQueueBoardProps) {
  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="section-title">{title}</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-shell">
          <h3 className="runner-title">Nothing queued</h3>
          <p className="detail-body">{emptyCopy}</p>
        </div>
      ) : (
        <div className="queue-board-grid">
          {items.map((item) => (
            <article key={item.id} className="detail-card queue-opportunity-card">
              <div className="runner-card-header">
                <div>
                  <span className="field-label">{item.channel}</span>
                  <h3 className="task-title">{item.title}</h3>
                </div>
                <span
                  className={`runner-chip runner-chip-${
                    item.reviewStatus ??
                    (item.status === "queued_for_approval"
                      ? "pending"
                      : item.status === "built"
                        ? "completed"
                        : item.status === "ready_to_build"
                          ? "running"
                          : "queued")
                  }`}
                >
                  {item.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="opportunity-meta">
                <p className="detail-body">Output type: {item.outputKind ?? "product"}</p>
                <p className="detail-body">Niche: {item.niche}</p>
                <p className="detail-body">Channel: {item.channel}</p>
                <p className="detail-body">Type: {item.productServiceType}</p>
                <p className="detail-body">Deliverable: {item.deliverableType}</p>
                <p className="detail-body">Confidence: {item.confidenceScore}%</p>
                <p className="detail-body">Buyer: {item.targetBuyer}</p>
              </div>

              <p className="detail-body">Why selected: {item.whySelected}</p>
              <p className="detail-body">Why it may sell: {item.whyItMaySell}</p>
              <p className="detail-body">Next action: {item.nextAction}</p>
              {item.selectedStyle ? <p className="detail-body">Selected style: {item.selectedStyle}</p> : null}
              {item.sourceSignals.length > 0 ? (
                <p className="detail-body">Source signals: {item.sourceSignals.join(" | ")}</p>
              ) : null}

              <div className="report-list">
                <p className="detail-body">Research strength: {item.scoreBreakdown.researchStrength}</p>
                <p className="detail-body">Approved pattern fit: {item.scoreBreakdown.approvedPatternFit}</p>
                <p className="detail-body">Novelty: {item.scoreBreakdown.novelty}</p>
                <p className="detail-body">Feasibility: {item.scoreBreakdown.productionFeasibility}</p>
                <p className="detail-body">Buyer clarity: {item.scoreBreakdown.buyerClarity}</p>
              </div>

              {item.missionId && onSelectReviewMission ? (
                <div className="export-actions">
                  <button type="button" className="export-button" onClick={() => onSelectReviewMission(item.missionId!)}>
                    Open Review
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
