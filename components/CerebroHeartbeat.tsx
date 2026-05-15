"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CerebroSynapseVisual, type CerebroSynapseStatus } from "@/components/CerebroSynapseVisual";

// CerebroHeartbeat — the live "this thing is alive, not a gimmick"
// surface. Polls /api/cerebro/heartbeat every 5s and renders:
//
//   - A large CEREBRO synapse (the brain itself), pulse rate driven by
//     graph freshness — fresh graph = running pulse; stale = idle.
//   - Three service health pills (Shopify / Printful / Anthropic) with
//     latency + green/red status.
//   - A scrolling activity log on the right — newest entries pulse in,
//     older ones fade. Every line proves the system is doing real work
//     (chat turns, autonomous runs, tool calls).
//
// This component replaces the AUTOMATION SNAPSHOT block in
// AgentDashboard. Customer-visible. The premium-feel anchor.
//
// Why poll over WebSocket: Vercel + Next.js + the SSE/WS surface area
// all add friction. 5s polling against a static /tmp file read + 3
// HEAD probes is a few hundred ms total; the heartbeat is intentionally
// stateless on the server side.

type GraphState = {
  nodes: number | null;
  edges: number | null;
  communities: number | null;
  commit: string | null;
  builtAt: string | null;
  ageMs: number | null;
  deployCommit: string | null;
  freshness: "fresh" | "stale" | "local-mtime" | "unknown";
};

type ActivityEntry = {
  kind: string;
  message: string;
  timestamp: string;
};

type ServiceProbe = {
  name: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
};

type HeartbeatResponse = {
  ts: string;
  graph: GraphState;
  activity: ActivityEntry[];
  services: ServiceProbe[];
};

const POLL_INTERVAL_MS = 5000;

function fmtTimeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return "just now";
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmtAgeMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function graphFreshnessLabel(graph: GraphState | undefined): string {
  if (!graph) return "Graph: connecting…";
  if (!graph.commit) return "Graph: not built";
  const commit = graph.commit.slice(0, 7);
  switch (graph.freshness) {
    case "fresh":
      return `Graph in sync with deploy · ${commit}`;
    case "stale":
      return `Graph out of sync · graph ${commit} · deploy ${graph.deployCommit?.slice(0, 7) ?? "?"}`;
    case "local-mtime":
      return `Graph rebuilt ${graph.builtAt ? fmtTimeAgo(graph.builtAt) : "?"} · ${commit}`;
    case "unknown":
    default:
      return `Graph commit ${commit}`;
  }
}

function kindLabel(kind: string): { label: string; color: string } {
  // Map activity kinds to short labels + colors. Anything we don't
  // recognize falls through to a neutral gray.
  if (kind.startsWith("chat_user")) return { label: "USER", color: "#A67843" };
  if (kind.startsWith("chat_assistant") || kind.startsWith("chat_op")) return { label: "OPERATOR", color: "#5B8CFF" };
  if (kind.startsWith("tool_")) return { label: "TOOL", color: "#6EDC96" };
  if (kind.startsWith("agent_")) return { label: "AGENT", color: "#7FD8FF" };
  if (kind.includes("error") || kind.includes("fail")) return { label: "ERROR", color: "#ff4d4d" };
  if (kind.includes("warn")) return { label: "WARN", color: "#F0B34B" };
  return { label: kind.toUpperCase().slice(0, 8), color: "#888" };
}

export function CerebroHeartbeat() {
  const [data, setData] = useState<HeartbeatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flickerKey, setFlickerKey] = useState(0); // bumped when a poll returns new graph data
  const lastBuiltAt = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetch("/api/cerebro/heartbeat", { cache: "no-store" });
        if (!alive) return;
        if (!r.ok) {
          setError(`heartbeat ${r.status}`);
        } else {
          const json = (await r.json()) as HeartbeatResponse;
          setData(json);
          setError(null);
          // Flicker the synapse only when the graph actually updated —
          // not on every poll. That preserves the "real signal" feel.
          if (json.graph.builtAt && json.graph.builtAt !== lastBuiltAt.current) {
            lastBuiltAt.current = json.graph.builtAt;
            setFlickerKey((k) => k + 1);
          }
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "poll failed");
      } finally {
        if (alive) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Pick synapse status from graph freshness + service health. If any
  // service is down we go to "retrying" amber; if the graph is missing
  // we go to "failed" red. Otherwise "running."
  const synapseStatus: CerebroSynapseStatus = useMemo(() => {
    if (!data) return "idle";
    if (!data.graph.nodes) return "failed";
    if (data.services.some((s) => !s.ok)) return "retrying";
    return "running";
  }, [data]);

  // Accent color shifts to amber when something's wrong, BV gold when
  // healthy. The shift is subtle but visible — premium-grade signal.
  const accent = useMemo(() => {
    if (!data) return "#A67843";
    if (!data.graph.nodes) return "#ff4d4d";
    if (data.services.some((s) => !s.ok)) return "#F0B34B";
    return "#A67843";
  }, [data]);

  return (
    <section className="cerebro-heartbeat">
      <style>{`
        .cerebro-heartbeat {
          background: linear-gradient(180deg, rgba(15, 14, 12, 0.92) 0%, rgba(15, 14, 12, 0.96) 100%);
          border: 1px solid rgba(166, 120, 67, 0.25);
          border-radius: 14px;
          padding: 24px;
          color: #f5f1e8;
          font-family: inherit;
          position: relative;
          overflow: hidden;
        }
        .cerebro-heartbeat::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(166, 120, 67, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(166, 120, 67, 0.04) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
        }
        .cerebro-heartbeat__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 18px;
          position: relative;
          z-index: 1;
        }
        .cerebro-heartbeat__eyebrow {
          font-size: 11px;
          letter-spacing: 0.2em;
          color: #A67843;
          font-weight: 700;
        }
        .cerebro-heartbeat__title {
          font-size: 22px;
          font-weight: 800;
          margin: 6px 0 0;
          letter-spacing: -0.01em;
        }
        .cerebro-heartbeat__meta {
          font-size: 12px;
          color: rgba(245, 241, 232, 0.55);
          text-align: right;
          line-height: 1.5;
        }
        .cerebro-heartbeat__body {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(280px, 1.4fr);
          gap: 24px;
          position: relative;
          z-index: 1;
        }
        @media (max-width: 760px) {
          .cerebro-heartbeat__body {
            grid-template-columns: 1fr;
          }
        }
        .cerebro-heartbeat__brain {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(166, 120, 67, 0.18);
          border-radius: 10px;
          padding: 18px;
          position: relative;
          overflow: hidden;
        }
        .cerebro-heartbeat__brain-frame {
          position: relative;
          aspect-ratio: 4 / 3;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .cerebro-heartbeat__flash {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(166, 120, 67, 0.35) 0%, transparent 70%);
          opacity: 0;
          pointer-events: none;
          animation: cerebroFlash 700ms ease-out;
        }
        @keyframes cerebroFlash {
          0%   { opacity: 0; }
          15%  { opacity: 0.9; }
          100% { opacity: 0; }
        }
        .cerebro-heartbeat__stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .cerebro-heartbeat__stat {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(166, 120, 67, 0.12);
          border-radius: 6px;
          padding: 10px 12px;
        }
        .cerebro-heartbeat__stat-label {
          font-size: 10px;
          letter-spacing: 0.12em;
          color: rgba(245, 241, 232, 0.5);
          font-weight: 600;
          text-transform: uppercase;
        }
        .cerebro-heartbeat__stat-value {
          font-size: 22px;
          font-weight: 800;
          color: #f5f1e8;
          margin-top: 4px;
          font-family: 'SF Mono', Menlo, monospace;
        }
        .cerebro-heartbeat__services {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          flex-wrap: wrap;
        }
        .cerebro-heartbeat__service {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(166, 120, 67, 0.15);
          border-radius: 999px;
          font-size: 12px;
        }
        .cerebro-heartbeat__service-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .cerebro-heartbeat__service-dot--ok {
          background: #6EDC96;
          box-shadow: 0 0 8px rgba(110, 220, 150, 0.5);
        }
        .cerebro-heartbeat__service-dot--down {
          background: #ff4d4d;
          box-shadow: 0 0 8px rgba(255, 77, 77, 0.6);
          animation: cerebroPulse 1.2s ease-in-out infinite;
        }
        @keyframes cerebroPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        .cerebro-heartbeat__service-name {
          font-weight: 600;
          color: #f5f1e8;
        }
        .cerebro-heartbeat__service-detail {
          color: rgba(245, 241, 232, 0.55);
          font-size: 11px;
          font-family: 'SF Mono', Menlo, monospace;
        }
        .cerebro-heartbeat__log {
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(166, 120, 67, 0.18);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          min-height: 320px;
        }
        .cerebro-heartbeat__log-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 12px;
        }
        .cerebro-heartbeat__log-title {
          font-size: 11px;
          letter-spacing: 0.18em;
          color: #A67843;
          font-weight: 700;
        }
        .cerebro-heartbeat__log-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #6EDC96;
          box-shadow: 0 0 6px rgba(110, 220, 150, 0.7);
          animation: cerebroPulse 1.6s ease-in-out infinite;
        }
        .cerebro-heartbeat__log-list {
          flex: 1;
          overflow-y: auto;
          margin: 0;
          padding: 0;
          list-style: none;
          font-size: 12px;
          font-family: 'SF Mono', Menlo, monospace;
          max-height: 380px;
        }
        .cerebro-heartbeat__log-entry {
          display: grid;
          grid-template-columns: 56px 90px 1fr;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid rgba(166, 120, 67, 0.08);
          color: rgba(245, 241, 232, 0.78);
          line-height: 1.45;
        }
        .cerebro-heartbeat__log-entry:first-child {
          color: #f5f1e8;
          animation: cerebroFlash 800ms ease-out;
        }
        .cerebro-heartbeat__log-time {
          color: rgba(245, 241, 232, 0.4);
        }
        .cerebro-heartbeat__log-kind {
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .cerebro-heartbeat__log-msg {
          color: rgba(245, 241, 232, 0.88);
          word-break: break-word;
          white-space: pre-wrap;
        }
        .cerebro-heartbeat__log-empty {
          color: rgba(245, 241, 232, 0.4);
          font-style: italic;
          font-size: 12px;
          padding: 24px 0;
          text-align: center;
        }
        .cerebro-heartbeat__error {
          color: #ff8b8b;
          font-size: 11px;
          margin-top: 8px;
        }
      `}</style>

      <div className="cerebro-heartbeat__head">
        <div>
          <div className="cerebro-heartbeat__eyebrow">CEREBRO · LIVE</div>
          <h2 className="cerebro-heartbeat__title">The brain</h2>
        </div>
        <div className="cerebro-heartbeat__meta">
          <div>
            {data ? `Last poll ${fmtTimeAgo(data.ts)}` : "Connecting…"}
          </div>
          <div>
            {graphFreshnessLabel(data?.graph)}
          </div>
        </div>
      </div>

      <div className="cerebro-heartbeat__body">
        <div className="cerebro-heartbeat__brain">
          <div className="cerebro-heartbeat__brain-frame">
            <CerebroSynapseVisual
              seed="cerebro-global"
              status={synapseStatus}
              accentColor={accent}
              variant="modal"
            />
            {/* Flash overlay re-mounts when flickerKey changes (graph just updated) */}
            <div key={flickerKey} className="cerebro-heartbeat__flash" />
          </div>

          <div className="cerebro-heartbeat__stats">
            <div className="cerebro-heartbeat__stat">
              <div className="cerebro-heartbeat__stat-label">Nodes</div>
              <div className="cerebro-heartbeat__stat-value">
                {data?.graph.nodes != null ? data.graph.nodes.toLocaleString() : "—"}
              </div>
            </div>
            <div className="cerebro-heartbeat__stat">
              <div className="cerebro-heartbeat__stat-label">Edges</div>
              <div className="cerebro-heartbeat__stat-value">
                {data?.graph.edges != null ? data.graph.edges.toLocaleString() : "—"}
              </div>
            </div>
            <div className="cerebro-heartbeat__stat">
              <div className="cerebro-heartbeat__stat-label">Communities</div>
              <div className="cerebro-heartbeat__stat-value">
                {data?.graph.communities != null ? data.graph.communities.toLocaleString() : "—"}
              </div>
            </div>
            <div className="cerebro-heartbeat__stat">
              <div className="cerebro-heartbeat__stat-label">Age</div>
              <div className="cerebro-heartbeat__stat-value">{fmtAgeMs(data?.graph.ageMs ?? null)}</div>
            </div>
          </div>

          <div className="cerebro-heartbeat__services">
            {(data?.services ?? []).map((svc) => (
              <div key={svc.name} className="cerebro-heartbeat__service">
                <div
                  className={
                    svc.ok
                      ? "cerebro-heartbeat__service-dot cerebro-heartbeat__service-dot--ok"
                      : "cerebro-heartbeat__service-dot cerebro-heartbeat__service-dot--down"
                  }
                />
                <span className="cerebro-heartbeat__service-name">{svc.name}</span>
                <span className="cerebro-heartbeat__service-detail">
                  {svc.ok ? `${svc.latencyMs ?? "?"}ms` : svc.detail}
                </span>
              </div>
            ))}
          </div>

          {error ? <div className="cerebro-heartbeat__error">⚠ {error}</div> : null}
        </div>

        <div className="cerebro-heartbeat__log">
          <div className="cerebro-heartbeat__log-head">
            <div className="cerebro-heartbeat__log-title">LIVE FEED · AGENTS → BRAIN</div>
            <div className="cerebro-heartbeat__log-pulse" />
          </div>
          {data && data.activity.length > 0 ? (
            <ul className="cerebro-heartbeat__log-list">
              {data.activity.map((entry, i) => {
                const k = kindLabel(entry.kind);
                return (
                  <li key={`${entry.timestamp}-${i}`} className="cerebro-heartbeat__log-entry">
                    <span className="cerebro-heartbeat__log-time">{fmtTimeAgo(entry.timestamp)}</span>
                    <span className="cerebro-heartbeat__log-kind" style={{ color: k.color }}>
                      {k.label}
                    </span>
                    <span className="cerebro-heartbeat__log-msg">{entry.message}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="cerebro-heartbeat__log-empty">
              {data ? "No activity in window. Brain is quiet." : "Loading…"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
