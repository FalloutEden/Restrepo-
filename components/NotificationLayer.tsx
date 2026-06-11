"use client";

// Orange completion notifications for the command center. Polls the live activity
// feed (/api/cerebro/heartbeat) and, when something new lands (an agent/tool/run
// completing), pops a cyberpunk orange toast and bumps an unread NOTIFICATIONS
// counter. Click the counter to open the full feed. Self-contained; positions
// itself absolutely inside the command-center container.

import { useEffect, useRef, useState } from "react";

type Entry = { kind: string; message: string; timestamp: string };
const ORANGE = "#ff7a18";

function kindIcon(kind: string): string {
  if (/error|fail/i.test(kind)) return "⚠";
  if (/agent/i.test(kind)) return "🧠";
  if (/tool/i.test(kind)) return "⚙";
  if (/chat/i.test(kind)) return "✦";
  return "●";
}

export default function NotificationLayer() {
  const [feed, setFeed] = useState<Entry[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastTs = useRef<string>("");
  const tid = useRef(0);

  useEffect(() => {
    let on = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/cerebro/heartbeat", { cache: "no-store" });
        const d = await r.json();
        const act: Entry[] = Array.isArray(d.activity) ? d.activity.slice() : [];
        act.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
        if (!on) return;
        setFeed(act);
        if (lastTs.current && act.length) {
          const fresh = act.filter((e) => (e.timestamp || "") > lastTs.current);
          if (fresh.length) {
            setUnread((u) => u + fresh.length);
            fresh.slice(0, 3).forEach((e) => {
              const id = ++tid.current;
              setToasts((t) => [...t, { id, msg: e.message, kind: e.kind }]);
              setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
            });
          }
        }
        if (act[0]?.timestamp) lastTs.current = act[0].timestamp;
      } catch {
        /* ignore */
      }
    };
    poll();
    const i = setInterval(poll, 10000);
    return () => { on = false; clearInterval(i); };
  }, []);

  return (
    <>
      <style>{`
        @keyframes ccToastIn { from { transform: translateX(26px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes ccBell { 0%,100% { box-shadow: 0 0 0 0 ${ORANGE}00; } 50% { box-shadow: 0 0 14px 2px ${ORANGE}aa; } }
      `}</style>

      {/* NOTIFICATIONS counter (title-bar, top-right) */}
      <button
        onClick={() => { setOpen((o) => !o); setUnread(0); }}
        style={{ position: "absolute", top: 8, right: 14, zIndex: 6, display: "flex", alignItems: "center", gap: 6, background: "rgba(8,10,16,0.85)", border: `1px solid ${unread ? ORANGE : "rgba(255,255,255,0.15)"}`, color: unread ? ORANGE : "rgba(190,205,235,0.7)", borderRadius: 7, padding: "4px 9px", fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", animation: unread ? "ccBell 1.4s ease-in-out infinite" : "none" }}
      >
        <span style={{ fontSize: 12 }}>◔</span>NOTIFICATIONS
        {unread > 0 && <span style={{ background: ORANGE, color: "#1a0e02", borderRadius: 9, padding: "0 6px", fontSize: 10 }}>{unread}</span>}
      </button>

      {/* toast stack (bottom-right) */}
      <div style={{ position: "absolute", bottom: 44, right: 16, zIndex: 6, display: "flex", flexDirection: "column", gap: 8, width: 268, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ animation: "ccToastIn 0.32s ease-out", background: "linear-gradient(160deg, rgba(28,16,4,0.96), rgba(10,8,12,0.96))", border: `1px solid ${ORANGE}`, borderLeft: `3px solid ${ORANGE}`, boxShadow: `0 0 20px ${ORANGE}44`, borderRadius: 8, padding: "9px 11px", color: "#f6ecd9", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, letterSpacing: 1, color: ORANGE, fontSize: 10, marginBottom: 3 }}>{kindIcon(t.kind)} COMPLETE</div>
            <div style={{ lineHeight: 1.35, opacity: 0.9 }}>{t.msg.length > 110 ? t.msg.slice(0, 110) + "…" : t.msg}</div>
          </div>
        ))}
      </div>

      {/* feed panel */}
      {open && (
        <div style={{ position: "absolute", top: 40, right: 14, zIndex: 7, width: 320, maxHeight: "70%", overflowY: "auto", background: "rgba(6,8,14,0.97)", border: `1px solid ${ORANGE}66`, borderRadius: 10, boxShadow: `0 16px 50px rgba(0,0,0,0.6)`, padding: "12px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: ORANGE }}>ACTIVITY FEED</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#cdd7e8", borderRadius: 6, width: 22, height: 22, cursor: "pointer" }}>×</button>
          </div>
          {feed.length === 0 && <div style={{ color: "rgba(180,195,225,0.5)", fontSize: 12, padding: "8px 0" }}>No activity yet — agents are idle.</div>}
          {feed.slice(0, 25).map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "6px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", color: "#dfe8fb" }}>
              <span style={{ opacity: 0.7 }}>{kindIcon(e.kind)}</span>
              <span style={{ opacity: 0.88, lineHeight: 1.35 }}>{e.message?.length > 120 ? e.message.slice(0, 120) + "…" : e.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
