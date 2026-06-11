"use client";

// CerebroBrain — a single living-brain visualization. The whole agent fleet is
// rendered as ONE animated brain (top view): each agent is a neuron placed in a
// named brain region, wired into a connectome, with signals firing along the
// pathways as the agents work. No tiles, no boxes — one cohesive moving image.
// Scales to any number of agents. Click a neuron to open that agent.

import { useEffect, useRef, useState } from "react";
import type { Agent } from "@/lib/mock-agents";

type Props = { agents: Agent[]; onSelect?: (id: string) => void; height?: number };

// --- role + status visual language ------------------------------------------
function roleColor(role: string): [number, number, number] {
  const r = role.toLowerCase();
  if (/research|trend|recon|vocab|meta|opportunity|seo|etsy|listing/.test(r)) return [91, 168, 255]; // blue
  if (/design|direction|curator|render|mockup/.test(r)) return [201, 162, 75]; // gold
  if (/build|product strategy|platform|shopify|engineering/.test(r)) return [79, 214, 160]; // mint
  if (/review|approval|validation|guard/.test(r)) return [242, 180, 65]; // amber
  if (/runtime|monitor|memory|core/.test(r)) return [185, 139, 255]; // violet
  return [150, 170, 200];
}
function statusLevel(status: string): number {
  switch (status) {
    case "Running": return 1;
    case "Retrying": return 0.85;
    case "Completed": return 0.6;
    case "Blocked": return 0.32;
    case "Failed": case "Error": return 0.28;
    default: return 0.42; // Idle
  }
}
// deterministic hash so layout is stable across renders
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

// brain regions (normalized to brain radius, x/y in -1..1)
const REGIONS: { key: RegExp; ax: number; ay: number; label: string }[] = [
  { key: /research|trend|recon|vocab|meta|opportunity|seo|etsy|listing/, ax: 0, ay: -0.58, label: "RESEARCH CORTEX" },
  { key: /design|direction|curator|render|mockup/, ax: -0.52, ay: 0.02, label: "DESIGN LOBE" },
  { key: /build|product strategy|platform|shopify|engineering/, ax: 0.52, ay: 0.02, label: "BUILD LOBE" },
  { key: /review|approval|validation|guard/, ax: 0, ay: 0.58, label: "REVIEW & GUARD" },
  { key: /runtime|monitor|memory|core/, ax: 0, ay: 0.05, label: "CORE RUNTIME" }
];
function regionIndex(role: string): number {
  const idx = REGIONS.findIndex((rg) => rg.key.test(role.toLowerCase()));
  return idx === -1 ? 4 : idx; // default to core
}

type Node = { agent: Agent; x: number; y: number; bx: number; by: number; color: [number, number, number]; level: number; phase: number };
type Edge = { a: number; b: number };
type Signal = { edge: number; t: number; dir: 1 | -1; speed: number; color: [number, number, number] };

export default function CerebroBrain({ agents, onSelect, height = 520 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ id: string; name: string; role: string; status: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cx = 0, cy = 0, rx = 0, ry = 0;
    let nodes: Node[] = [], edges: Edge[] = [], signals: Signal[] = [];
    const spawnTimers: number[] = [];
    let hoverIdx = -1;
    let raf = 0, last = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    function layout() {
      const rect = wrap!.getBoundingClientRect();
      W = Math.max(320, rect.width); H = height;
      canvas!.width = Math.floor(W * dpr); canvas!.height = Math.floor(H * dpr);
      canvas!.style.width = W + "px"; canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2; rx = Math.min(W * 0.34, 360); ry = Math.min(H * 0.42, 250);

      // place nodes per region, deterministic scatter, clamped inside the ellipse
      const counts: Record<number, number> = {}; const seen: Record<number, number> = {};
      agents.forEach((a) => { const ri = regionIndex(a.role); counts[ri] = (counts[ri] || 0) + 1; });
      nodes = agents.map((a) => {
        const ri = regionIndex(a.role); const reg = REGIONS[ri];
        const n = counts[ri]; const k = seen[ri] = (seen[ri] || 0) + 1;
        const ring = (k - 1) / Math.max(1, n);
        const ang = ring * Math.PI * 2 + hash(a.id) * Math.PI * 2;
        const spread = 0.30 + hash(a.id + "r") * 0.14;
        let nx = reg.ax + Math.cos(ang) * spread;
        let ny = reg.ay + Math.sin(ang) * spread * 0.9;
        // clamp into the unit disc so neurons stay inside the brain
        const d = Math.hypot(nx, ny); if (d > 0.86) { nx = (nx / d) * 0.86; ny = (ny / d) * 0.86; }
        return { agent: a, bx: cx + nx * rx, by: cy + ny * ry, x: cx + nx * rx, y: cy + ny * ry, color: roleColor(a.role), level: statusLevel(a.status), phase: hash(a.id + "p") * Math.PI * 2 };
      });

      // connectome: each node to its 2 nearest, plus a spine through the centre
      edges = [];
      const key = new Set<string>();
      const add = (a: number, b: number) => { if (a === b) return; const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (key.has(k)) return; key.add(k); edges.push({ a, b }); };
      const coreIdx = nodes.findIndex((n) => regionIndex(n.agent.role) === 4);
      nodes.forEach((n, i) => {
        const dists = nodes.map((m, j) => ({ j, d: Math.hypot(n.x - m.x, n.y - m.y) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
        add(i, dists[0]?.j ?? i); add(i, dists[1]?.j ?? i);
        if (coreIdx >= 0 && hash(n.agent.id + "core") > 0.45) add(i, coreIdx); // wire some neurons through the core
      });
      signals = []; spawnTimers.length = edges.length; spawnTimers.fill(0);
    }

    function spawn(ei: number) {
      const e = edges[ei]; const lvl = Math.max(nodes[e.a].level, nodes[e.b].level);
      const dir: 1 | -1 = nodes[e.a].level >= nodes[e.b].level ? 1 : -1;
      const src = dir === 1 ? nodes[e.a] : nodes[e.b];
      signals.push({ edge: ei, t: dir === 1 ? 0 : 1, dir, speed: (0.0006 + lvl * 0.0011), color: src.color });
    }

    function frame(ts: number) {
      const dt = Math.min(48, ts - (last || ts)); last = ts;
      ctx!.clearRect(0, 0, W, H);

      // --- brain body: soft glow + bumpy outline (gyri) + fissure ---
      const grad = ctx!.createRadialGradient(cx, cy, 10, cx, cy, Math.max(rx, ry) * 1.2);
      grad.addColorStop(0, "rgba(40,52,80,0.45)"); grad.addColorStop(0.6, "rgba(22,28,46,0.30)"); grad.addColorStop(1, "rgba(10,12,20,0)");
      ctx!.fillStyle = grad; ctx!.beginPath(); ctx!.ellipse(cx, cy, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2); ctx!.fill();

      const t = ts / 1000;
      const outline = (scale: number, alpha: number, lw: number) => {
        ctx!.beginPath();
        const steps = 120;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const bump = 1 + Math.sin(a * 7 + t * 0.6) * 0.022 + Math.sin(a * 13 - t * 0.4) * 0.013;
          const front = a < Math.PI ? 1 : 1.02; // slightly fuller at the back
          const px = cx + Math.cos(a) * rx * scale * bump;
          const py = cy + Math.sin(a) * ry * scale * bump * front;
          if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
        }
        ctx!.closePath(); ctx!.strokeStyle = `rgba(140,170,230,${alpha})`; ctx!.lineWidth = lw; ctx!.stroke();
      };
      outline(1, 0.5, 1.6); outline(0.9, 0.16, 1); outline(0.78, 0.1, 1);
      // longitudinal fissure
      ctx!.beginPath(); ctx!.moveTo(cx, cy - ry * 0.92); ctx!.bezierCurveTo(cx + 12, cy - ry * 0.3, cx - 12, cy + ry * 0.3, cx, cy + ry * 0.92);
      ctx!.strokeStyle = "rgba(120,150,210,0.22)"; ctx!.lineWidth = 1.4; ctx!.stroke();
      // a few gyri folds per hemisphere
      ctx!.strokeStyle = "rgba(120,150,210,0.10)"; ctx!.lineWidth = 1;
      for (let s = -1; s <= 1; s += 2) for (let g = 0; g < 4; g++) {
        const yy = cy + (g - 1.5) * ry * 0.34;
        ctx!.beginPath(); ctx!.moveTo(cx + s * rx * 0.12, yy);
        ctx!.quadraticCurveTo(cx + s * rx * 0.45, yy + ry * 0.12, cx + s * rx * 0.74, yy); ctx!.stroke();
      }

      // --- edges (faint pathways) ---
      ctx!.lineWidth = 1;
      edges.forEach((e) => {
        const A = nodes[e.a], B = nodes[e.b];
        ctx!.strokeStyle = `rgba(120,150,210,${0.05 + Math.max(A.level, B.level) * 0.06})`;
        ctx!.beginPath(); ctx!.moveTo(A.x, A.y); ctx!.lineTo(B.x, B.y); ctx!.stroke();
      });

      // --- signals firing along pathways ---
      if (!reduce) edges.forEach((_, ei) => {
        const e = edges[ei]; const lvl = Math.max(nodes[e.a].level, nodes[e.b].level);
        spawnTimers[ei] -= dt; if (spawnTimers[ei] <= 0) { spawn(ei); spawnTimers[ei] = 420 + (1 - lvl) * 2600 + hash(`${ei}${Math.round(ts / 700)}`) * 500; }
      });
      signals = signals.filter((s) => s.t >= -0.05 && s.t <= 1.05);
      signals.forEach((s) => {
        s.t += s.speed * dt * s.dir;
        const e = edges[s.edge]; if (!e) return; const A = nodes[e.a], B = nodes[e.b];
        const x = A.x + (B.x - A.x) * s.t, y = A.y + (B.y - A.y) * s.t;
        const tx = A.x + (B.x - A.x) * (s.t - 0.06 * s.dir), ty = A.y + (B.y - A.y) * (s.t - 0.06 * s.dir);
        const [r, g, b] = s.color;
        const tail = ctx!.createLinearGradient(tx, ty, x, y);
        tail.addColorStop(0, `rgba(${r},${g},${b},0)`); tail.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
        ctx!.strokeStyle = tail; ctx!.lineWidth = 2; ctx!.beginPath(); ctx!.moveTo(tx, ty); ctx!.lineTo(x, y); ctx!.stroke();
        ctx!.fillStyle = `rgba(${r},${g},${b},0.95)`; ctx!.beginPath(); ctx!.arc(x, y, 2.2, 0, Math.PI * 2); ctx!.fill();
      });

      // --- neurons (agents) ---
      nodes.forEach((n, i) => {
        const [r, g, b] = n.color;
        const pulse = n.level >= 0.6 ? 0.5 + 0.5 * Math.sin(t * (2 + n.level * 4) + n.phase) : 0.35;
        const baseR = 4 + n.level * 4 + (i === hoverIdx ? 3 : 0);
        const glowR = baseR + 8 + pulse * (6 + n.level * 12);
        const halo = ctx!.createRadialGradient(n.x, n.y, baseR * 0.4, n.x, n.y, glowR);
        halo.addColorStop(0, `rgba(${r},${g},${b},${0.45 + n.level * 0.4})`); halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.fillStyle = halo; ctx!.beginPath(); ctx!.arc(n.x, n.y, glowR, 0, Math.PI * 2); ctx!.fill();
        ctx!.fillStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},${0.85 + pulse * 0.15})`;
        ctx!.beginPath(); ctx!.arc(n.x, n.y, baseR, 0, Math.PI * 2); ctx!.fill();
        if (i === hoverIdx) { ctx!.strokeStyle = "rgba(255,255,255,0.85)"; ctx!.lineWidth = 1.5; ctx!.beginPath(); ctx!.arc(n.x, n.y, baseR + 4, 0, Math.PI * 2); ctx!.stroke(); }
      });

      // --- region labels (subtle, not boxed) ---
      ctx!.font = "600 10px ui-sans-serif, system-ui, sans-serif"; ctx!.textAlign = "center";
      REGIONS.forEach((rg) => {
        if (!nodes.some((n) => regionIndex(n.agent.role) === REGIONS.indexOf(rg))) return;
        const lx = cx + rg.ax * rx * 1.04, ly = cy + rg.ay * ry * 1.14;
        ctx!.fillStyle = "rgba(150,175,225,0.45)"; ctx!.fillText(rg.label, lx, ly);
      });

      raf = requestAnimationFrame(frame);
    }

    function onMove(ev: MouseEvent) {
      const rect = canvas!.getBoundingClientRect(); const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best = -1, bd = 16 * 16;
      nodes.forEach((n, i) => { const d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; best = i; } });
      hoverIdx = best; canvas!.style.cursor = best >= 0 ? "pointer" : "default";
      if (best >= 0) { const a = nodes[best].agent; setHover({ id: a.id, name: a.name, role: a.role, status: a.status, x: mx, y: my }); }
      else setHover(null);
    }
    function onClick() { if (hoverIdx >= 0 && onSelect) onSelect(nodes[hoverIdx].agent.id); }
    function onLeave() { hoverIdx = -1; setHover(null); }

    layout();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mouseleave", onLeave);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("click", onClick); canvas.removeEventListener("mouseleave", onLeave); };
  }, [agents, height, onSelect]);

  const running = agents.filter((a) => a.status === "Running" || a.status === "Retrying").length;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", background: "radial-gradient(120% 120% at 50% 30%, #0e1424 0%, #080a12 70%)", border: "1px solid rgba(120,150,210,0.18)" }}>
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 2, fontSize: 12, letterSpacing: 1.5, color: "rgba(170,195,240,0.8)", fontWeight: 700 }}>
        CEREBRO · {agents.length} AGENTS · <span style={{ color: "#4FD6A0" }}>{running} ACTIVE</span>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
      {hover && (
        <div style={{ position: "absolute", left: Math.max(8, hover.x + 14), top: Math.max(8, hover.y - 10), zIndex: 3, pointerEvents: "none", background: "rgba(8,12,22,0.92)", border: "1px solid rgba(120,150,210,0.3)", borderRadius: 8, padding: "6px 10px", color: "#dfe8fb", fontSize: 12, maxWidth: 220 }}>
          <div style={{ fontWeight: 700 }}>{hover.name}</div>
          <div style={{ opacity: 0.7, fontSize: 11 }}>{hover.role}</div>
          <div style={{ marginTop: 2, fontSize: 10, opacity: 0.85 }}>{hover.status} · click to open</div>
        </div>
      )}
    </div>
  );
}
