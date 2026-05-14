"use client";

import type { Agent } from "@/lib/mock-agents";
import { CerebroSynapseVisual, type CerebroSynapseStatus } from "@/components/CerebroSynapseVisual";

// AgentHabitat — the gamified large-card view of a single agent.
//
// Replaces the small AgentCard for the dashboard's "Agents" tab. Each
// agent gets a full habitat: synapse running brightly across the back,
// cyberpunk grid overlay, dark readable plate at the bottom holding
// identity and latest output, status indicator that pulses with role
// accent.
//
// Why a separate component (vs. extending AgentCard): AgentCard is also
// used in the AgentHero pipeline launcher where the small 4-across
// layout makes sense. The Agents tab is the "alive ecosystem" surface
// where each agent should feel like a habitat, not a tile. Two
// different presentations of the same Agent type.

const ACCENT_BY_ROLE: Array<{ test: RegExp; color: string }> = [
  { test: /research|recon|trend|long-tail|vocab|meta/i, color: "#5B8CFF" }, // discovery blue
  { test: /design|direction/i, color: "#A67843" }, // craft gold
  { test: /build|product|mutation/i, color: "#6EDC96" }, // production mint
  { test: /validation|guard|review|approval/i, color: "#F0B34B" }, // gating amber
  { test: /runtime|monitor|core/i, color: "#D6A2FF" }, // meta violet
  { test: /router|opportunity|strategy/i, color: "#7FD8FF" } // orchestration cyan
];

function accentForRole(role: string | undefined): string {
  if (!role) return "#A67843";
  for (const entry of ACCENT_BY_ROLE) {
    if (entry.test.test(role)) return entry.color;
  }
  return "#A67843";
}

function toSynapseStatus(s: Agent["status"]): CerebroSynapseStatus {
  switch (s) {
    case "Running":
      return "running";
    case "Retrying":
      return "retrying";
    case "Idle":
      return "idle";
    case "Completed":
      return "completed";
    case "Blocked":
      return "blocked";
    case "Failed":
      return "failed";
    case "Error":
      return "error";
    default:
      return "idle";
  }
}

const STATUS_COPY: Record<Agent["status"], { label: string; tone: string }> = {
  Running: { label: "ACTIVE", tone: "#6EDC96" },
  Retrying: { label: "RETRYING", tone: "#F0B34B" },
  Idle: { label: "STANDBY", tone: "#A67843" },
  Completed: { label: "COMPLETED", tone: "#6EDC96" },
  Blocked: { label: "BLOCKED", tone: "#ff8b4d" },
  Failed: { label: "FAILED", tone: "#ff4d4d" },
  Error: { label: "ERROR", tone: "#ff4d4d" }
};

type AgentHabitatProps = {
  agent: Agent;
  onClick: () => void;
};

export function AgentHabitat({ agent, onClick }: AgentHabitatProps) {
  const accent = accentForRole(agent.role);
  const synapseStatus = toSynapseStatus(agent.status);
  const status = STATUS_COPY[agent.status];

  return (
    <button type="button" className="agent-habitat" onClick={onClick} aria-label={`${agent.name} — ${agent.role}`}>
      <style>{`
        .agent-habitat {
          all: unset;
          cursor: pointer;
          display: block;
          position: relative;
          width: 100%;
          min-height: 360px;
          background: #0a0908;
          border: 1px solid rgba(166, 120, 67, 0.22);
          border-radius: 14px;
          overflow: hidden;
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
        }
        .agent-habitat:hover {
          transform: translateY(-2px);
          border-color: rgba(166, 120, 67, 0.5);
          box-shadow: 0 18px 48px -16px rgba(166, 120, 67, 0.35);
        }
        .agent-habitat:focus-visible {
          outline: 2px solid #A67843;
          outline-offset: 3px;
        }
        .agent-habitat__synapse {
          position: absolute;
          inset: 0;
          opacity: 0.85;
        }
        .agent-habitat__synapse > * {
          width: 100% !important;
          height: 100% !important;
        }
        .agent-habitat__grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(166, 120, 67, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(166, 120, 67, 0.06) 1px, transparent 1px);
          background-size: 28px 28px;
          pointer-events: none;
          mix-blend-mode: screen;
        }
        .agent-habitat__vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center top, transparent 30%, rgba(10, 9, 8, 0.55) 80%),
            linear-gradient(180deg, rgba(10, 9, 8, 0.0) 30%, rgba(10, 9, 8, 0.92) 100%);
          pointer-events: none;
        }
        .agent-habitat__chip {
          position: absolute;
          top: 14px;
          left: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(166, 120, 67, 0.3);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: #f5f1e8;
          backdrop-filter: blur(8px);
          z-index: 2;
        }
        .agent-habitat__chip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .agent-habitat__corner {
          position: absolute;
          top: 14px;
          right: 14px;
          font-size: 10px;
          letter-spacing: 0.18em;
          color: rgba(166, 120, 67, 0.55);
          font-weight: 700;
          z-index: 2;
        }
        .agent-habitat__plate {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 18px 20px 20px;
          z-index: 2;
        }
        .agent-habitat__role {
          font-size: 10px;
          letter-spacing: 0.22em;
          color: rgba(245, 241, 232, 0.55);
          font-weight: 700;
          margin: 0 0 6px;
          text-transform: uppercase;
        }
        .agent-habitat__name {
          font-size: 22px;
          font-weight: 800;
          color: #f5f1e8;
          margin: 0 0 10px;
          letter-spacing: -0.01em;
        }
        .agent-habitat__preview {
          font-size: 13px;
          color: rgba(245, 241, 232, 0.78);
          margin: 0 0 12px;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .agent-habitat__footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: rgba(245, 241, 232, 0.45);
          letter-spacing: 0.06em;
        }
        .agent-habitat__open {
          color: #A67843;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        @keyframes habitatPulse {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; }
          50%      { box-shadow: 0 0 8px 2px currentColor; }
        }
        .agent-habitat__chip-dot--running {
          animation: habitatPulse 1.4s ease-in-out infinite;
        }
        .agent-habitat__chip-dot--retrying {
          animation: habitatPulse 0.9s ease-in-out infinite;
        }
        .agent-habitat__chip-dot--failed,
        .agent-habitat__chip-dot--error,
        .agent-habitat__chip-dot--blocked {
          animation: habitatPulse 1.6s ease-in-out infinite;
        }
      `}</style>

      <div className="agent-habitat__synapse" aria-hidden="true">
        <CerebroSynapseVisual
          seed={agent.id ?? agent.name}
          status={synapseStatus}
          accentColor={accent}
          variant="modal"
        />
      </div>
      <div className="agent-habitat__grid" />
      <div className="agent-habitat__vignette" />

      <span className="agent-habitat__chip">
        <span
          className={`agent-habitat__chip-dot agent-habitat__chip-dot--${agent.status.toLowerCase()}`}
          style={{ background: status.tone, color: status.tone }}
          aria-hidden="true"
        />
        {status.label}
      </span>

      <span className="agent-habitat__corner" aria-hidden="true">
        HABITAT · {agent.id?.slice(0, 6).toUpperCase() ?? "AGENT"}
      </span>

      <div className="agent-habitat__plate">
        <p className="agent-habitat__role">{agent.role}</p>
        <h3 className="agent-habitat__name">{agent.name}</h3>
        <p className="agent-habitat__preview">{agent.latestOutputPreview}</p>
        <div className="agent-habitat__footer">
          <span>Updated {agent.updatedAt}</span>
          <span className="agent-habitat__open">Enter →</span>
        </div>
      </div>
    </button>
  );
}
