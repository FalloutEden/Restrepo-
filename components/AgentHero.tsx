"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/client-auth";
import type { Agent, AgentStatus } from "@/lib/mock-agents";
import { mockAgents } from "@/lib/mock-agents";
import { AgentCard } from "@/components/AgentCard";
import { AgentDetailModal } from "@/components/AgentDetailModal";

// localStorage key for the persistent agent-tile collapse preference.
// The 11-tile grid is the visual centerpiece of /pipeline, but users
// who only want the launcher + log can fold it away.
const AGENTS_COLLAPSED_KEY = "agent-hero-collapsed";

// Map pipeline role IDs → agent card IDs
const ROLE_TO_AGENT_ID: Record<string, string> = {
  trend_research: "planner-01",
  opportunity_router: "research-02",
  product_strategy: "ops-03",
  design_direction: "writer-04",
  review_approval: "review-05",
  validation_guard: "triage-06",
  build: "builder-07",
  runtime_monitor: "memory-08",
  research_jobs: "research-jobs-09",
  research_longtail: "research-longtail-10",
  research_meta: "research-meta-11"
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
  itemCount?: number;
  done?: boolean;
};

type SSEPayload = {
  events: PipelineEvent[];
  nextCursor: number;
  status: string;
  done?: boolean;
};

const PIPELINE_STAGES = [
  { roleId: "trend_research", label: "Research: Market" },
  { roleId: "research_jobs", label: "Research: Jobs" },
  { roleId: "research_longtail", label: "Research: Long-tail" },
  { roleId: "research_meta", label: "Research: Meta" },
  { roleId: "opportunity_router", label: "Routing" },
  { roleId: "product_strategy", label: "Strategy" },
  { roleId: "design_direction", label: "Design" },
  { roleId: "review_approval", label: "Review" },
  { roleId: "validation_guard", label: "Validate" },
  { roleId: "build", label: "Build" },
  { roleId: "runtime_monitor", label: "Monitor" }
];

export function AgentHero() {
  // Start every agent in Standby (Idle). The mockAgents defaults are demo-only fictional states
  // and shouldn't be displayed when no run is active.
  const [agents, setAgents] = useState<Agent[]>(() =>
    mockAgents.map((a) => ({
      ...a,
      status: "Idle" as AgentStatus,
      latestOutputPreview: "Standby — awaiting pipeline run.",
      queueDepth: 0
    }))
  );
  const [goal, setGoal] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const [activeStages, setActiveStages] = useState<Record<string, string>>({});
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  // Hydrate the collapse preference from localStorage on mount. Kept in an
  // effect (not lazy useState init) to stay SSR-safe — Next renders the
  // initial expanded state on the server, then we sync on the client.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(AGENTS_COLLAPSED_KEY) === "1") {
        setAgentsCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleAgentsCollapsed = useCallback(() => {
    setAgentsCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AGENTS_COLLAPSED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
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
      let lastError: string | null = null;
      // Accumulate every event for the log panel (cap to last 200 to bound memory)
      if (payload.events.length > 0) {
        setEvents((prev) => {
          const next = [...prev, ...payload.events];
          return next.length > 200 ? next.slice(next.length - 200) : next;
        });
      }
      for (const evt of payload.events) {
        if (evt.type === "agent" && evt.roleId) {
          const displayStatus = EXEC_TO_STATUS[evt.status] ?? "Running";
          const patch: Partial<Agent> = {
            status: displayStatus,
            updatedAt: "just now"
          };
          if (evt.message) patch.latestOutputPreview = evt.message;
          if (typeof evt.itemCount === "number") patch.queueDepth = evt.itemCount;
          updateAgentByRole(evt.roleId, patch);

          const roleKey = evt.roleId as string;
          setActiveStages((prev) => ({ ...prev, [roleKey]: evt.status }));
        }

        if (evt.type === "run" || evt.type === "log") {
          if (evt.message) setStatusLine(evt.message);
        }

        // Capture explicit error messages from any failed event so we can show the real reason.
        if (evt.error) lastError = evt.error;
      }

      if (lastError) setRunError(lastError);

      if (payload.done || payload.status === "completed" || payload.status === "failed") {
        setRunState(payload.status === "failed" ? "failed" : "completed");
        esRef.current?.close();
        esRef.current = null;
        if (payload.status === "failed") {
          setStatusLine(lastError ?? "Pipeline failed. See details below.");
        } else {
          setStatusLine("Pipeline complete. Products materialized and queued for review.");
        }
      }
    },
    [updateAgentByRole]
  );

  const startRun = useCallback(async () => {
    if (runState === "running" || runState === "starting") return;
    setRunState("starting");
    setStatusLine("Initializing the Operator pipeline...");
    setActiveStages({});
    setRunError(null);
    setEvents([]);

    // Reset all agents to Idle (clean state, no demo defaults bleeding through)
    setAgents(
      mockAgents.map((a) => ({
        ...a,
        status: "Idle" as AgentStatus,
        latestOutputPreview: "Awaiting deployment...",
        queueDepth: 0
      }))
    );

    try {
      const res = await authedFetch("/api/autonomous-run/start", {
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
  const progressPct = runState === "completed" ? 100 : Math.round((completedCount / PIPELINE_STAGES.length) * 100);

  return (
    <section className="agent-hero">
      {/* Header */}
      <div className="agent-hero-header">
        <div className="agent-hero-title-row">
          <span className="eyebrow">
            <span className="agent-hero-pulse" aria-hidden="true" />
            Black Vault Commerce Division
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
          11 specialized agents running 24/7 — four parallel research operatives, opportunity routing,
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

        {/* Failure banner — surfaces the real reason a run died */}
        {runState === "failed" && runError && (
          <div className="agent-hero-failure-banner" role="alert">
            <span className="agent-hero-failure-label">Pipeline failed</span>
            <span className="agent-hero-failure-msg">{runError}</span>
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

        {/* Event log — collapsible, shows real-time pipeline events */}
        {events.length > 0 && (
          <details className="agent-hero-log" open={runState === "running" || runState === "starting"}>
            <summary className="agent-hero-log-summary">
              <span className="agent-hero-log-label">Pipeline log</span>
              <span className="agent-hero-log-count">{events.length} event{events.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="agent-hero-log-list">
              {events.slice().reverse().map((evt) => {
                const time = new Date(evt.timestamp).toLocaleTimeString([], { hour12: false });
                const cls =
                  evt.status === "failed" || evt.error
                    ? "log-row-failed"
                    : evt.status === "completed"
                      ? "log-row-completed"
                      : evt.status === "running" || evt.status === "retrying"
                        ? "log-row-running"
                        : "";
                return (
                  <div key={evt.index} className={`agent-hero-log-row ${cls}`}>
                    <span className="agent-hero-log-time">{time}</span>
                    <span className="agent-hero-log-type">{evt.roleName ?? evt.type}</span>
                    <span className="agent-hero-log-msg">
                      {evt.message}
                      {typeof evt.itemCount === "number" && evt.itemCount > 0 ? ` · ${evt.itemCount} item${evt.itemCount === 1 ? "" : "s"}` : ""}
                      {evt.error ? ` — ${evt.error}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>

      {/* Agent Grid toggle — the 11 tiles are the visual anchor but some
          users only want the launcher + log surface. Persisted preference
          lives in localStorage (AGENTS_COLLAPSED_KEY). */}
      <div className="agent-hero-grid-toggle-row">
        <button
          type="button"
          className="agent-hero-grid-toggle"
          onClick={toggleAgentsCollapsed}
          aria-expanded={!agentsCollapsed}
          aria-controls="agent-hero-grid"
        >
          <span className={`agent-hero-grid-toggle-caret ${agentsCollapsed ? "is-collapsed" : ""}`}>▾</span>
          {agentsCollapsed ? `Show agents (${agents.length})` : "Hide agents"}
        </button>
      </div>

      {/* Agent Grid */}
      {!agentsCollapsed && (
        <div id="agent-hero-grid" className="agent-hero-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

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
