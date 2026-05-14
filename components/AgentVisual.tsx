"use client";

import type { Agent } from "@/lib/mock-agents";
import { CerebroSynapseVisual, type CerebroSynapseStatus } from "@/components/CerebroSynapseVisual";

// AgentVisual — single render path: the CEREBRO synapse animation.
//
// History (kept for context, not for re-enabling):
//   Originally this component rendered Capcom-trademarked character sprites
//   (Wesker / Red Queen / HUNK / Nemesis / Ada / etc.) on room backgrounds.
//   The 2026-05-13 visual overhaul added a USE_CEREBRO_SYNAPSE flag and
//   defaulted it to true. 2026-05-14 the legacy sprite path was deleted
//   entirely — the flag is gone, the patrol/blink animation machinery is
//   gone, the agent.avatar / agent.background fields are no longer read.
//   This prevents any future flag-flip regression that could ship Capcom IP
//   to a customer instance. The sprite asset files (public/agents/Wesker
//   etc.) were deleted in the same window.

// Map an agent role to a synapse accent color. Stable across renders so
// the same agent always glows the same hue.
function accentColorForAgent(agent: { role?: string; name?: string }): string {
  const role = (agent.role ?? agent.name ?? "").toLowerCase();
  if (/research|recon|trend|long-tail|vocab|meta/.test(role)) return "#5B8CFF"; // blue — discovery
  if (/design|direction/.test(role)) return "#A67843"; // BV gold — craft
  if (/build|product|mutation/.test(role)) return "#6EDC96"; // mint — production
  if (/validation|guard|review|approval/.test(role)) return "#F0B34B"; // amber — gating
  if (/runtime|monitor|core/.test(role)) return "#D6A2FF"; // violet — meta
  if (/router|opportunity|strategy/.test(role)) return "#7FD8FF"; // cyan — orchestration
  return "#A67843"; // fallback BV gold
}

// Translate the legacy agent.status enum into the synapse status type
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

type AgentVisualProps = {
  // Synapse rendering only needs id (for stable seed), name (fallback seed),
  // role (accent color), and status (pulse rate). The agent.avatar /
  // agent.background / agent.avatarFrames / agent.blinkAnimations fields
  // exist in the type for backward compatibility with persisted mission
  // payloads but are no longer rendered.
  agent: Pick<Agent, "name" | "status"> & { id?: string; role?: string };
  variant: "card" | "modal";
};

export function AgentVisual({ agent, variant }: AgentVisualProps) {
  const rootClassName = [
    "agent-visual",
    variant === "card" ? "agent-visual-card" : "agent-visual-modal",
    "agent-visual-cerebro-synapse",
    `agent-status-${agent.status.toLowerCase()}`
  ].join(" ");

  return (
    <div className={rootClassName} aria-hidden="true">
      <CerebroSynapseVisual
        seed={agent.id ?? agent.name ?? "default"}
        status={toSynapseStatus(agent.status)}
        accentColor={accentColorForAgent(agent)}
        variant={variant}
      />
    </div>
  );
}
