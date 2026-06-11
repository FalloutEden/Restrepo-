"use client";

// The whole agency on ONE screen — cyberpunk command center. The living brain at
// the center (agents = synapses firing inside it), with floating neon HUD panels
// around it for each business front. No dropdowns, no tiles; everything visible.
// Numbers are real where we can pull them and clearly labeled PENDING where we
// can't yet (Etsy API approval). Live data + orange completion alerts land in the
// next iterations.

import { useEffect, useState } from "react";
import CerebroBrain from "@/components/CerebroBrain";
import { mockAgents } from "@/lib/mock-agents";

type Metric = { label: string; value: string };
type Live = "live" | "pending" | "demo";
type Block = { status?: "live" | "pending"; [k: string]: unknown };
type Metrics = { shopify?: Block; earnings?: Block; etsy?: Block; imageGen?: Block };

const NEON = { orange: "#ff7a18", amber: "#ffb347", cyan: "#2de2e6", magenta: "#ff2e97", green: "#3ef0a0", violet: "#b98bff" };

function HudPanel({ icon, title, accent, metrics, status, style }: { icon: string; title: string; accent: string; metrics: Metric[]; status: Live; style: React.CSSProperties }) {
  const badge = status === "live" ? { t: "LIVE", c: NEON.green } : status === "pending" ? { t: "PENDING", c: NEON.amber } : { t: "DEMO", c: "#7c8aa5" };
  return (
    <div style={{ position: "absolute", width: 232, padding: "12px 14px", background: "linear-gradient(160deg, rgba(10,14,22,0.92), rgba(6,8,14,0.92))", border: `1px solid ${accent}`, clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))", boxShadow: `0 0 18px ${accent}33, inset 0 0 24px ${accent}14`, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18, filter: `drop-shadow(0 0 5px ${accent})` }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: accent, textShadow: `0 0 8px ${accent}99` }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 8, fontWeight: 800, letterSpacing: 1, color: badge.c, border: `1px solid ${badge.c}66`, borderRadius: 3, padding: "1px 4px" }}>{badge.t}</span>
      </div>
      {metrics.map((m) => (
        <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, padding: "2px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ color: "rgba(180,195,225,0.62)" }}>{m.label}</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: m.value === "—" ? "#5a6478" : "#eaf1ff", textShadow: m.value === "—" ? "none" : `0 0 6px ${accent}55` }}>{m.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CommandCenter() {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch("/api/command-center/metrics", { cache: "no-store" }).then((r) => r.json()).then((d) => on && setM(d)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { on = false; clearInterval(id); };
  }, []);
  const money = (n: unknown) => (n == null || typeof n !== "number" ? "—" : "$" + n.toLocaleString());
  const num = (n: unknown) => (n == null || typeof n !== "number" ? "—" : n.toLocaleString());
  const pct = (n: unknown) => (n == null || typeof n !== "number" ? "—" : (n >= 0 ? "+" : "") + n + "%");
  const sh = m?.shopify ?? {}, ea = m?.earnings ?? {};
  const shStatus: Live = sh.status === "live" ? "live" : "pending";
  const eaStatus: Live = ea.status === "live" ? "live" : "pending";
  return (
    <div style={{ position: "relative", width: "100%", minHeight: 760, background: "radial-gradient(130% 110% at 50% 35%, #0a0e18 0%, #04050a 70%, #020308 100%)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(45,226,230,0.18)", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* circuit-grid backdrop */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(45,226,230,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(45,226,230,0.04) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(120% 100% at 50% 40%, #000 35%, transparent 80%)" }} />

      {/* title bar */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${NEON.orange}44`, background: "linear-gradient(180deg, rgba(255,122,24,0.08), transparent)" }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: NEON.orange, textShadow: `0 0 10px ${NEON.orange}aa` }}>NEURO·AGENT</span>
        <span style={{ color: "rgba(180,195,225,0.4)" }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2.4, color: NEON.cyan, textShadow: `0 0 10px ${NEON.cyan}88` }}>AI ECOSYSTEM</span>
        <span style={{ color: "rgba(180,195,225,0.4)" }}>|</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: NEON.green, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: NEON.green, boxShadow: `0 0 8px ${NEON.green}` }} />ACTIVE SESSION</span>
      </div>

      {/* the brain (centerpiece) */}
      <div style={{ position: "absolute", top: "8%", left: "50%", transform: "translateX(-50%)", width: "min(62%, 720px)" }}>
        <CerebroBrain agents={mockAgents} height={640} />
      </div>

      {/* floating HUD panels */}
      <HudPanel icon="🛒" title="ETSY STORE" accent={NEON.orange} status="pending" style={{ top: 72, left: 18 }}
        metrics={[{ label: "Sales", value: "—" }, { label: "Traffic", value: "—" }, { label: "Conversion", value: "—" }]} />
      <HudPanel icon="🟢" title="SHOPIFY" accent={NEON.green} status={shStatus} style={{ top: 72, right: 18 }}
        metrics={[{ label: "Orders", value: num(sh.orders) }, { label: "Revenue", value: money(sh.revenue) }, { label: "Growth", value: pct(sh.growth) }]} />
      <HudPanel icon="💲" title="GROSS EARNINGS" accent={NEON.amber} status={eaStatus} style={{ top: "44%", left: "50%", transform: "translateX(-50%)", width: 260 }}
        metrics={[{ label: "Total", value: money(ea.total) }, { label: "Net", value: money(ea.net) }, { label: "Monthly", value: money(ea.monthly) }]} />
      <HudPanel icon="💡" title="NEW IDEAS" accent={NEON.cyan} status="live" style={{ bottom: 22, left: 18 }}
        metrics={[{ label: "Agents", value: String(mockAgents.length) }, { label: "Active", value: String(mockAgents.filter((a) => a.status === "Running" || a.status === "Retrying").length) }, { label: "Queued", value: String(mockAgents.reduce((s, a) => s + (a.queueDepth || 0), 0)) }]} />
      <HudPanel icon="🎨" title="IMAGE GEN" accent={NEON.magenta} status="pending" style={{ bottom: 22, right: 18 }}
        metrics={[{ label: "Prompts", value: "—" }, { label: "Styles", value: "—" }, { label: "Output", value: "—" }]} />

      {/* footer */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", gap: 22, padding: "8px 16px", fontSize: 11, letterSpacing: 1.5, color: "rgba(180,195,225,0.45)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span>SETTINGS</span><span>NOTIFICATIONS</span><span>HELP</span>
        <span style={{ marginLeft: "auto", color: m?.shopify?.status === "live" ? NEON.green : NEON.amber }}>● {m?.shopify?.status === "live" ? "Shopify LIVE · Etsy pending" : "connecting…"}</span>
      </div>
    </div>
  );
}
