"use client";

import { useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Small live activity ticker for the post-onboard welcome page. Polls
// /api/cerebro/heartbeat every 5s and shows the most recent operator
// activity entries. Premium-feel anchor: the user sees the brain pulse
// the moment they finish payment.
//
// Why not reuse <CerebroHeartbeat /> directly: that one is a full panel
// (synapse + stats + service pills). For the welcome page we just want a
// quiet, narrow feed of "here's what's happening." Visual restraint.

type Entry = {
  kind: string;
  message: string;
  timestamp: string;
};

type HeartbeatResponse = {
  activity: Entry[];
};

const POLL_MS = 5000;
const MAX_ENTRIES = 5;

function fmtTimeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 5000) return "just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function kindBadge(kind: string): { label: string; color: string } {
  if (kind.startsWith("chat_user")) return { label: "YOU", color: "#A67843" };
  if (kind.startsWith("chat_assistant") || kind.startsWith("chat_op")) return { label: "OPERATOR", color: "#5B8CFF" };
  if (kind.startsWith("tool_")) return { label: "TOOL", color: "#6EDC96" };
  if (kind.startsWith("tick_")) return { label: "AUTORUN", color: "#7FD8FF" };
  if (kind.includes("error") || kind.includes("fail")) return { label: "ERROR", color: "#ff4d4d" };
  return { label: "EVENT", color: "rgba(244,241,236,0.45)" };
}

export function AgentTicker() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await authedFetch("/api/cerebro/heartbeat", { cache: "no-store" });
        if (!alive) return;
        if (r.ok) {
          const data = (await r.json()) as HeartbeatResponse;
          setEntries((data.activity ?? []).slice(0, MAX_ENTRIES));
        }
      } catch {
        // Best-effort — never blow up the welcome page over a poll failure.
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "rgba(244,241,236,0.4)",
          marginBottom: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#6EDC96",
            boxShadow: "0 0 6px rgba(110, 220, 150, 0.7)"
          }}
        />
        Live activity
      </div>

      {entries === null && (
        <div style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", fontStyle: "italic" }}>
          Connecting to your operator…
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <div style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", fontStyle: "italic" }}>
          The brain is quiet right now. As soon as your operator runs anything, you&apos;ll see it here.
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {entries.map((e, i) => {
            const badge = kindBadge(e.kind);
            return (
              <li
                key={`${e.timestamp}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "baseline",
                  fontSize: 12,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(244,241,236,0.04)"
                }}
              >
                <span style={{ color: badge.color, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em" }}>
                  {badge.label}
                </span>
                <span style={{ color: "rgba(244,241,236,0.78)" }}>{e.message}</span>
                <span style={{ color: "rgba(244,241,236,0.35)", whiteSpace: "nowrap", fontSize: 11 }}>
                  {fmtTimeAgo(e.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
