"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, AgentStatus } from "@/lib/mock-agents";
import { mockAgents } from "@/lib/mock-agents";
import { AgentCard } from "@/components/AgentCard";
import { AgentDetailModal } from "@/components/AgentDetailModal";

// Map pipeline role IDs → agent card IDs
const ROLE_TO_AGENT_ID: Record<string, string> = {
  trend_research: "planner-01",
  opportunity_router: "research-02",
  product_strategy: "ops-03",
  design_direction: "writer-04",
  review_approval: "review-05",
  validation_guard: "triage-06",
  build: "builder-07",
  runtime_monitor: "memory-08"
};

// Map pipeline execution status → display status
const EXEC_TO_STATUS: Record<string, AgentStatus> = {
  idle: "Idle",
  running: "Running",
  retrying: "Retrying",
  completed: "Completed",
  failed: "Failed"
};

type RunState = "idle" | "starting" | "running" | "completed" | "failed";

type PipelineEvent = {
  index: number;
  timestamp: string;
  type: "run" | "agent" | "log";
  status: string;
  message: string;
  roleId?: string;
  roleName?: string;
  error?: string;
  done?: boolean;
};

type SSEPayload = {
  events: PipelineEvent[];
  nextCursor: number;
  status: string;
  done?: boolean;
};

const PIPELINE_STAGES = [
  { roleId: "trend_research", label: "Research" },
  { roleId: "opportunity_router", label: "Routing" },
  { roleId: "product_strategy", label: "Strategy" },
  { roleId: "design_direction", label: "Design" },
  { roleId: "review_approval", label: "Review" },
  { roleId: "validation_guard", label: "Validate" },
  { roleId: "build", label: "Build" },
  { roleId: "runtime_monitor", label: "Monitor" }
];

export function AgentHero() {
  const [agents, setAgents] = useState<Agent[]>(() =>
    mockAgents.map((a) => ({ ...a }))
  );
  const [goal, setGoal] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const [activeStages, setActiveStages] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const updateAgentByRole = useCallback((roleId: string, patch: Partial<Agent>) => {
    const agentId = ROLE_TO_AGENT_ID[roleId];
    if (!agentId) return;
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, ...patch } : a))
    );
  }, []);

  const handleSSEPayload = useCallback(
    (payload: SSEPayload) => {
      for (const evt of payload.events) {
        if (evt.type === "agent" && evt.roleId) {
          const displayStatus = EXEC_TO_STATUS[evt.status] ?? "Running";
          const patch: Partial<Agent> = {
            status: displayStatus,
            updatedAt: "just now"
          };
          if (evt.message) patch.latestOutputPreview = evt.message;
          updateAgentByRole(evt.roleId, patch);

          const roleKey = evt.roleId as string;
          setActiveStages((prev) => ({ ...prev, [roleKey]: evt.status }));
        }

        if (evt.type === "run" || evt.type === "log") {
          if (evt.message) setStatusLine(evt.message);
        }
      }

      if (payload.done || payload.status === "completed" || payload.status === "failed") {
        setRunState(payload.status === "failed" ? "failed" : "completed");
        esRef.current?.close();
        esRef.current = null;
        setStatusLine(
          payload.status === "failed"
            ? "Pipeline encountered an error. Review agent logs."
            : "Pipeline complete. Products materialized and queued for review."
        );
      }
    },
    [updateAgentByRole]
  );

  const startRun = useCallback(async () => {
    if (runState === "running" || runState === "starting") return;
    setRunState("starting");
    setStatusLine("Initializing Umbrella command pipeline...");
    setActiveStages({});

    // Reset all agents to Idle before run
    setAgents(mockAgents.map((a) => ({ ...a, status: "Idle" as AgentStatus })));

    try {
      const res = await fetch("/api/autonomous-run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() || undefined })
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const { runId: newRunId } = (await res.json()) as { runId: string };
      setRunId(newRunId);
      setRunState("running");
      setStatusLine("Pipeline active — agents deploying...");

      // Open SSE stream
      const es = new EventSource(`/api/autonomous-run/${newRunId}/events`);
      esRef.current = es;

      es.onmessage = (e: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(e.data) as SSEPayload;
          handleSSEPayload(payload);
        } catch {
          // malformed event — skip
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setRunState((prev) => (prev === "running" ? "failed" : prev));
        setStatusLine("Connection to pipeline lost.");
      };
    } catch (err) {
      setRunState("failed");
      setStatusLine(err instanceof Error ? err.message : "Failed to start run.");
    }
  }, [goal, runState, handleSSEPayload]);

  const completedCount = Object.values(activeStages).filter((s) => s === "completed").length;
  const progressPct = runState === "completed" ? 100 : Math.round((completedCount / 8) * 100);

  return (
    <section className="agent-hero">
      {/* Header */}
      <div className="agent-hero-header">
        <div className="agent-hero-title-row">
          <span className="eyebrow">
            <span className="agent-hero-pulse" aria-hidden="true" />
            Umbrella Commerce Division
          </span>
          <div className="agent-hero-system-status">
            <span
              className={`agent-hero-system-dot ${
                runState === "running" ? "dot-running" : runState === "failed" ? "dot-error" : "dot-idle"
              }`}
            />
            <span className="agent-hero-system-label">
              {runState === "idle"
                ? "STANDBY"
                : runState === "starting"
                  ? "INITIALIZING"
                  : runState === "running"
                    ? "ACTIVE"
                    : runState === "completed"
                      ? "COMPLETE"
                      : "ERROR"}
            </span>
          </div>
        </div>
        <h1 className="hero-title">
          Autonomous<br />Commerce Group
        </h1>
        <p className="hero-copy">
          8 specialized agents running 24/7 — researching trends, routing opportunities,
          building products, and pushing them live.
        </p>
      </div>

      {/* Run Launcher */}
      <div className="agent-hero-launcher">
        <div className="agent-hero-input-row">
          <input
            className="agent-hero-input"
            type="text"
            placeholder="Goal override (optional) — e.g. 'Focus on premium wall art for Q2'"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startRun()}
            disabled={runState === "running" || runState === "starting"}
          />
          <button
            className={`agent-hero-run-btn ${runState === "running" || runState === "starting" ? "agent-hero-run-btn--active" : ""}`}
            onClick={startRun}
            disabled={runState === "running" || runState === "starting"}
          >
            {runState === "starting" ? (
              <><span className="agent-hero-spinner" />Deploying...</>
            ) : runState === "running" ? (
              <><span className="agent-hero-spinner" />Running</>
            ) : (
              "▶ Run Pipeline"
            )}
          </button>
        </div>

        {/* Progress */}
        {runState !== "idle" && (
          <div className="agent-hero-progress">
            <div className="agent-hero-progress-bar">
              <div
                className={`agent-hero-progress-fill ${runState === "failed" ? "agent-hero-progress-fill--error" : ""}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="agent-hero-progress-meta">
              <span className="agent-hero-status-line">{statusLine}</span>
              {runId && (
                <span className="agent-hero-run-id">
                  {runId.slice(0, 24)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stage pills */}
        {runState !== "idle" && (
          <div className="agent-hero-stages">
            {PIPELINE_STAGES.map(({ roleId, label }) => {
              const s = activeStages[roleId];
              return (
                <span
                  key={roleId}
                  className={`agent-hero-stage-pill ${
                    s === "completed"
                      ? "stage-completed"
                      : s === "running" || s === "retrying"
                        ? "stage-running"
                        : s === "failed"
                          ? "stage-failed"
                          : ""
                  }`}
                >
                  {s === "completed" ? "✓ " : s === "running" ? "⟳ " : ""}
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Grid */}
      <div className="agent-hero-grid">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onClick={() => setSelectedAgent(agent)}
          />
        ))}
      </div>

      {/* Detail modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={agents.find((a) => a.id === selectedAgent.id) ?? selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </section>
  );
}
