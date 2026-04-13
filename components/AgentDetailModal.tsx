"use client";

import { useEffect } from "react";
import type { Agent } from "@/lib/mock-agents";
import { AgentVisual } from "@/components/AgentVisual";

const statusClassMap: Record<Agent["status"], string> = {
  Running: "status-running",
  Idle: "status-idle",
  Completed: "status-completed",
  Blocked: "status-blocked",
  Error: "status-error"
};

type AgentDetailModalProps = {
  agent: Agent;
  onClose: () => void;
};

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={`agent-title-${agent.id}`}>
        <div className="modal-stage-shell">
          <AgentVisual agent={agent} variant="modal" />
          <div className="modal-stage-overlay">
            <span className={`agent-chip ${statusClassMap[agent.status]}`}>{agent.status}</span>
            <div>
              <h2 className="modal-title" id={`agent-title-${agent.id}`}>
                {agent.name}
              </h2>
              <p className="modal-subtitle">{agent.role}</p>
            </div>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close agent details">
            Close
          </button>
        </div>

        <div className="modal-header">
          <div className="modal-identity">
            <span className="modal-room-tag">Live room render</span>
            <span className="agent-meta">Updated {agent.updatedAt}</span>
          </div>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <h3>Latest Output</h3>
            <p className="detail-body">{agent.latestOutput}</p>
          </article>

          <aside className="detail-list">
            <section className="detail-card">
              <h3>Agent Details</h3>
              <div>
                <span className="detail-item-label">Owner</span>
                <span className="detail-item-value">{agent.owner}</span>
              </div>
              <div>
                <span className="detail-item-label">Last Updated</span>
                <span className="detail-item-value">{agent.updatedAt}</span>
              </div>
              <div>
                <span className="detail-item-label">Queue Depth</span>
                <span className="detail-item-value">{agent.queueDepth} pending items</span>
              </div>
            </section>

            <section className="detail-card">
              <h3>Preview</h3>
              <p className="detail-body">{agent.latestOutputPreview}</p>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
