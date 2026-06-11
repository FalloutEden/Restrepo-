"use client";

// CerebroBrain — the whole operation as ONE living brain (no tiles, no rooms).
// Agents are neurons placed in named brain FRONTS (Intelligence, Etsy, Shopify,
// the Apps, Review & Guard, Core); signals fire along the connectome as they work.
// Each front is clickable → an analytics panel for that part of the business.
// Click a neuron → open that agent. All-black; the only color is the neural glow.

import { useEffect, useRef, useState } from "react";
import type { Agent } from "@/lib/mock-agents";

type Props = { agents: Agent[]; onSelect?: (id: string) => void; height?: number };

type Front = { key: string; match: RegExp; ax: number; ay: number; label: string; desc: string; tone: [number, number, number] };
const FRONTS: Front[] = [
  { key: "intel", match: /research|trend|recon|vocab|meta|opportunity/, ax: 0, ay: -0.62, label: "INTELLIGENCE", desc: "Trend & niche research", tone: [91, 168, 255] },
  { key: "etsy", match: /etsy|seo|listing/, ax: -0.62, ay: -0.06, label: "ETSY · GthicPrintables", desc: "Romantic-goth shop", tone: [201, 162, 75] },
  { key: "shopify", match: /design|direction|curator|render|mockup/, ax: 0.62, ay: -0.06, label: "SHOPIFY · Black Vault", desc: "Premium apparel", tone: [79, 214, 160] },
  { key: "apps", match: /platform|shopify app|engineering|build|product strategy/, ax: -0.36, ay: 0.56, label: "THE APPS", desc: "Operator + Shopify app", tone: [185, 139, 255] },
  { key: "guard", match: /review|approval|validation|guard/, ax: 0.42, ay: 0.52, label: "REVIEW & GUARD", desc: "Quality & safety", tone: [242, 180, 65] },
  { key: "core", match: /runtime|monitor|memory|core/, ax: 0, ay: 0.06, label: "CORE", desc: "Runtime", tone: [150, 170, 200] }
];
function frontIndex(role: string): number { const i = FRONTS.findIndex((f) => f.match.test(role.toLowerCase())); return i === -1 ? FRONTS.length - 1 : i; }
function statusLevel(s: string): number { return s === "Running" ? 1 : s === "Retrying" ? 0.85 : s === "Completed" ? 0.6 : s === "Blocked" || s === "Failed" || s === "Error" ? 0.3 : 0.42; }
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

type Node = { agent: Agent; x: number; y: number; color: [number, number, number]; level: number; phase: number; front: number };
type Edge = { a: number; b: number };
type Signal = { edge: number; t: number; dir: 1 | -1; speed: number; color: [number, number, number] };
type Hot = { key: string; x: number; y: number; w: number };

export default function CerebroBrain({ agents, onSelect, height = 600 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ name: string; role: string; status: string; x: number; y: number } | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const regionRef = useRef<string | null>(null);
  useEffect(() => { regionRef.current = region; }, [region]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let W = 0, H = height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cx = 0, cy = 0, rx = 0, ry = 0;
    let nodes: Node[] = [], edges: Edge[] = [], signals: Signal[] = [], hots: Hot[] = [];
    const timers: number[] = [];
    let hoverIdx = -1, raf = 0, last = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    function layout() {
      const rect = wrap!.getBoundingClientRect();
      W = Math.max(320, rect.width); H = height;
      canvas!.width = Math.floor(W * dpr); canvas!.height = Math.floor(H * dpr);
      canvas!.style.width = W + "px"; canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2; rx = Math.min(W * 0.36, 420); ry = Math.min(H * 0.42, 280);
      const counts: Record<number, number> = {}, seen: Record<number, number> = {};
      agents.forEach((a) => { const fi = frontIndex(a.role); counts[fi] = (counts[fi] || 0) + 1; });
      nodes = agents.map((a) => {
        const fi = frontIndex(a.role), f = FRONTS[fi], n = counts[fi], k = seen[fi] = (seen[fi] || 0) + 1;
        const ang = ((k - 1) / Math.max(1, n)) * Math.PI * 2 + hash(a.id) * 6.283;
        const spread = 0.22 + hash(a.id + "r") * 0.12;
        let nx = f.ax + Math.cos(ang) * spread, ny = f.ay + Math.sin(ang) * spread * 0.85;
        const d = Math.hypot(nx, ny); if (d > 0.84) { nx = (nx / d) * 0.84; ny = (ny / d) * 0.84; }
        return { agent: a, x: cx + nx * rx, y: cy + ny * ry, color: f.tone, level: statusLevel(a.status), phase: hash(a.id + "p") * 6.283, front: fi };
      });
      edges = []; const key = new Set<string>();
      const add = (a: number, b: number) => { if (a === b) return; const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (key.has(k)) return; key.add(k); edges.push({ a, b }); };
      const core = nodes.findIndex((n) => n.front === FRONTS.length - 1);
      nodes.forEach((n, i) => { const ds = nodes.map((m, j) => ({ j, d: Math.hypot(n.x - m.x, n.y - m.y) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d); add(i, ds[0]?.j ?? i); add(i, ds[1]?.j ?? i); if (core >= 0 && hash(n.agent.id + "c") > 0.4) add(i, core); });
      signals = []; timers.length = edges.length; timers.fill(0);
    }

    function frame(ts: number) {
      const dt = Math.min(48, ts - (last || ts)); last = ts; const t = ts / 1000;
      ctx!.clearRect(0, 0, W, H);
      // body glow (monochrome)
      const g = ctx!.createRadialGradient(cx, cy, 10, cx, cy, Math.max(rx, ry) * 1.25);
      g.addColorStop(0, "rgba(34,40,54,0.5)"); g.addColorStop(0.6, "rgba(16,18,26,0.28)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = g; ctx!.beginPath(); ctx!.ellipse(cx, cy, rx * 1.2, ry * 1.2, 0, 0, 6.283); ctx!.fill();
      const outline = (sc: number, al: number, lw: number) => { ctx!.beginPath(); const steps = 130; for (let i = 0; i <= steps; i++) { const a = (i / steps) * 6.283; const bump = 1 + Math.sin(a * 7 + t * 0.5) * 0.024 + Math.sin(a * 13 - t * 0.35) * 0.014; const px = cx + Math.cos(a) * rx * sc * bump, py = cy + Math.sin(a) * ry * sc * bump * (a < Math.PI ? 1 : 1.03); if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py); } ctx!.closePath(); ctx!.strokeStyle = `rgba(190,200,220,${al})`; ctx!.lineWidth = lw; ctx!.stroke(); };
      outline(1, 0.34, 1.4); outline(0.9, 0.12, 1); outline(0.78, 0.08, 1);
      ctx!.beginPath(); ctx!.moveTo(cx, cy - ry * 0.92); ctx!.bezierCurveTo(cx + 14, cy - ry * 0.3, cx - 14, cy + ry * 0.3, cx, cy + ry * 0.92); ctx!.strokeStyle = "rgba(170,180,200,0.16)"; ctx!.lineWidth = 1.3; ctx!.stroke();
      ctx!.strokeStyle = "rgba(170,180,200,0.07)"; ctx!.lineWidth = 1;
      for (let s = -1; s <= 1; s += 2) for (let gi = 0; gi < 4; gi++) { const yy = cy + (gi - 1.5) * ry * 0.34; ctx!.beginPath(); ctx!.moveTo(cx + s * rx * 0.12, yy); ctx!.quadraticCurveTo(cx + s * rx * 0.45, yy + ry * 0.12, cx + s * rx * 0.74, yy); ctx!.stroke(); }
      // edges
      ctx!.lineWidth = 1; edges.forEach((e) => { const A = nodes[e.a], B = nodes[e.b]; ctx!.strokeStyle = `rgba(170,180,200,${0.04 + Math.max(A.level, B.level) * 0.05})`; ctx!.beginPath(); ctx!.moveTo(A.x, A.y); ctx!.lineTo(B.x, B.y); ctx!.stroke(); });
      // signals
      if (!reduce) edges.forEach((_, ei) => { const e = edges[ei], lvl = Math.max(nodes[e.a].level, nodes[e.b].level); timers[ei] -= dt; if (timers[ei] <= 0) { const dir: 1 | -1 = nodes[e.a].level >= nodes[e.b].level ? 1 : -1; signals.push({ edge: ei, t: dir === 1 ? 0 : 1, dir, speed: 0.0006 + lvl * 0.0011, color: (dir === 1 ? nodes[e.a] : nodes[e.b]).color }); timers[ei] = 420 + (1 - lvl) * 2600 + hash(`${ei}${Math.round(ts / 700)}`) * 500; } });
      signals = signals.filter((s) => s.t >= -0.05 && s.t <= 1.05);
      signals.forEach((s) => { s.t += s.speed * dt * s.dir; const e = edges[s.edge]; if (!e) return; const A = nodes[e.a], B = nodes[e.b]; const x = A.x + (B.x - A.x) * s.t, y = A.y + (B.y - A.y) * s.t; const tx = A.x + (B.x - A.x) * (s.t - 0.06 * s.dir), ty = A.y + (B.y - A.y) * (s.t - 0.06 * s.dir); const [r, gg, b] = s.color; const grad = ctx!.createLinearGradient(tx, ty, x, y); grad.addColorStop(0, `rgba(${r},${gg},${b},0)`); grad.addColorStop(1, `rgba(${r},${gg},${b},0.9)`); ctx!.strokeStyle = grad; ctx!.lineWidth = 2; ctx!.beginPath(); ctx!.moveTo(tx, ty); ctx!.lineTo(x, y); ctx!.stroke(); ctx!.fillStyle = `rgba(${r},${gg},${b},0.95)`; ctx!.beginPath(); ctx!.arc(x, y, 2.2, 0, 6.283); ctx!.fill(); });
      // neurons
      nodes.forEach((n, i) => { const [r, gg, b] = n.color; const pulse = n.level >= 0.6 ? 0.5 + 0.5 * Math.sin(t * (2 + n.level * 4) + n.phase) : 0.35; const baseR = 4 + n.level * 4 + (i === hoverIdx ? 3 : 0); const glowR = baseR + 8 + pulse * (6 + n.level * 12); const halo = ctx!.createRadialGradient(n.x, n.y, baseR * 0.4, n.x, n.y, glowR); halo.addColorStop(0, `rgba(${r},${gg},${b},${0.42 + n.level * 0.4})`); halo.addColorStop(1, `rgba(${r},${gg},${b},0)`); ctx!.fillStyle = halo; ctx!.beginPath(); ctx!.arc(n.x, n.y, glowR, 0, 6.283); ctx!.fill(); ctx!.fillStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, gg + 60)},${Math.min(255, b + 60)},${0.85 + pulse * 0.15})`; ctx!.beginPath(); ctx!.arc(n.x, n.y, baseR, 0, 6.283); ctx!.fill(); if (i === hoverIdx) { ctx!.strokeStyle = "rgba(255,255,255,0.85)"; ctx!.lineWidth = 1.5; ctx!.beginPath(); ctx!.arc(n.x, n.y, baseR + 4, 0, 6.283); ctx!.stroke(); } });
      // front labels (clickable hotspots)
      hots = []; ctx!.textAlign = "center";
      FRONTS.forEach((f, fi) => { if (!nodes.some((n) => n.front === fi)) return; const lx = cx + f.ax * rx * 1.06, ly = cy + f.ay * ry * 1.16; const active = regionRef.current === f.key; ctx!.font = `${active ? 700 : 600} 11px ui-sans-serif, system-ui, sans-serif`; const [r, gg, b] = f.tone; ctx!.fillStyle = active ? `rgba(${r},${gg},${b},0.95)` : "rgba(180,195,225,0.5)"; ctx!.fillText(f.label, lx, ly); const w = ctx!.measureText(f.label).width; hots.push({ key: f.key, x: lx, y: ly, w: w / 2 + 10 }); });
      raf = requestAnimationFrame(frame);
    }

    function pos(ev: MouseEvent) { const r = canvas!.getBoundingClientRect(); return { mx: ev.clientX - r.left, my: ev.clientY - r.top }; }
    function onMove(ev: MouseEvent) { const { mx, my } = pos(ev); let best = -1, bd = 256; nodes.forEach((n, i) => { const d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; best = i; } }); hoverIdx = best; const overLabel = hots.some((h) => Math.abs(mx - h.x) < h.w && Math.abs(my - h.y) < 12); canvas!.style.cursor = best >= 0 || overLabel ? "pointer" : "default"; if (best >= 0) { const a = nodes[best].agent; setHover({ name: a.name, role: a.role, status: a.status, x: mx, y: my }); } else setHover(null); }
    function onClick(ev: MouseEvent) { const { mx, my } = pos(ev); if (hoverIdx >= 0) { onSelect?.(nodes[hoverIdx].agent.id); return; } const hit = hots.find((h) => Math.abs(mx - h.x) < h.w && Math.abs(my - h.y) < 14); setRegion(hit ? (prev) => (prev === hit.key ? null : hit.key) : null); }

    layout(); raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => layout()); ro.observe(wrap);
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("click", onClick); canvas.addEventListener("mouseleave", () => { hoverIdx = -1; setHover(null); });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("click", onClick); };
  }, [agents, height, onSelect]);

  const running = agents.filter((a) => a.status === "Running" || a.status === "Retrying").length;
  const front = FRONTS.find((f) => f.key === region) ?? null;
  const frontAgents = front ? agents.filter((a) => FRONTS[frontIndex(a.role)].key === front.key) : [];
  const dot = (s: string) => (s === "Running" || s === "Retrying" ? "#4FD6A0" : s === "Completed" ? "#9fb0c8" : s === "Failed" || s === "Error" ? "#f0b34b" : "#5a6478");

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", borderRadius: 18, overflow: "hidden", background: "radial-gradient(120% 120% at 50% 25%, #0a0c12 0%, #000 75%)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 2, fontSize: 12, letterSpacing: 1.6, color: "rgba(190,205,235,0.85)", fontWeight: 700 }}>
        CEREBRO · {agents.length} AGENTS · <span style={{ color: "#4FD6A0" }}>{running} ACTIVE</span>
        <span style={{ marginLeft: 10, fontWeight: 500, letterSpacing: 0.5, color: "rgba(150,165,195,0.6)" }}>· click a region for analytics</span>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
      {hover && (
        <div style={{ position: "absolute", left: Math.max(8, hover.x + 14), top: Math.max(8, hover.y - 10), zIndex: 3, pointerEvents: "none", background: "rgba(0,0,0,0.92)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, padding: "6px 10px", color: "#e7edf8", fontSize: 12, maxWidth: 220 }}>
          <div style={{ fontWeight: 700 }}>{hover.name}</div>
          <div style={{ opacity: 0.7, fontSize: 11 }}>{hover.role}</div>
          <div style={{ marginTop: 2, fontSize: 10, opacity: 0.85 }}>{hover.status} · click to open</div>
        </div>
      )}
      {front && (
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(340px, 80%)", zIndex: 4, background: "rgba(4,5,8,0.94)", borderLeft: `2px solid rgba(${front.tone[0]},${front.tone[1]},${front.tone[2]},0.5)`, backdropFilter: "blur(6px)", padding: "18px 16px", overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,0.6)" }}>
          <button onClick={() => setRegion(null)} style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#cdd7e8", borderRadius: 6, width: 24, height: 24, cursor: "pointer" }}>×</button>
          <div style={{ fontSize: 11, letterSpacing: 1.4, color: `rgba(${front.tone[0]},${front.tone[1]},${front.tone[2]},0.9)`, fontWeight: 700 }}>{front.label}</div>
          <div style={{ fontSize: 12, color: "rgba(180,195,225,0.6)", marginTop: 2 }}>{front.desc}</div>
          <div style={{ display: "flex", gap: 14, margin: "14px 0", fontSize: 12, color: "#dfe8fb" }}>
            <div><div style={{ fontSize: 22, fontWeight: 700 }}>{frontAgents.length}</div><div style={{ opacity: 0.55 }}>agents</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#4FD6A0" }}>{frontAgents.filter((a) => a.status === "Running" || a.status === "Retrying").length}</div><div style={{ opacity: 0.55 }}>active</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700 }}>{frontAgents.reduce((s, a) => s + (a.queueDepth || 0), 0)}</div><div style={{ opacity: 0.55 }}>queued</div></div>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(150,165,195,0.6)", margin: "6px 0 8px" }}>NEURONS IN THIS REGION</div>
          {frontAgents.map((a) => (
            <button key={a.id} onClick={() => onSelect?.(a.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 11px", marginBottom: 8, cursor: "pointer", color: "#e7edf8" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: dot(a.status), boxShadow: `0 0 6px ${dot(a.status)}` }} />{a.name}<span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.5 }}>{a.status}</span></div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{a.role}</div>
              <div style={{ fontSize: 11, opacity: 0.78, marginTop: 5, lineHeight: 1.35 }}>{a.latestOutputPreview}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
