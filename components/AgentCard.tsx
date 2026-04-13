import type { Agent } from "@/lib/mock-agents";
import { AgentVisual } from "@/components/AgentVisual";

const statusClassMap: Record<Agent["status"], string> = {
  Running: "status-running",
  Idle: "status-idle",
  Completed: "status-completed",
  Blocked: "status-blocked",
  Error: "status-error"
};

const dotClassMap: Record<Agent["status"], string> = {
  Running: "dot-running",
  Idle: "dot-idle",
  Completed: "dot-completed",
  Blocked: "dot-blocked",
  Error: "dot-error"
};

type AgentCardProps = {
  agent: Agent;
  onClick: () => void;
};

export function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <button type="button" className="agent-card" onClick={onClick}>
      <div className="agent-card-stage">
        <AgentVisual agent={agent} variant="card" />
        <span className={`agent-chip agent-chip-stage ${statusClassMap[agent.status]}`}>
          <span className={`agent-dot ${dotClassMap[agent.status]}`} aria-hidden="true" />
          {agent.status}
        </span>
      </div>

      <div className="agent-card-body">
        <div className="agent-card-top">
          <div className="agent-identity agent-identity-card">
            <p className="agent-name">{agent.name}</p>
            <p className="agent-role">{agent.role}</p>
          </div>
          <span className="agent-room-label">Room Active</span>
        </div>

        <p className="agent-preview">{agent.latestOutputPreview}</p>

        <div className="agent-footer">
          <span className="agent-meta">Updated {agent.updatedAt}</span>
          <span className="agent-action">Open details</span>
        </div>
      </div>
    </button>
  );
}
