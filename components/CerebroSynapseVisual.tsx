"use client";

import { useMemo } from "react";

// CEREBRO synapse visualization — replaces the character sprite UI on
// admin/pipeline pages. Lightweight SVG + CSS animation only. No external
// dependencies, no AI image gen, scales cleanly.
//
// Each agent gets a unique neural network seeded from its ID:
//   - Node count varies slightly (10-14)
//   - Layout is deterministic from the seed (same agent = same network)
//   - Color shifts per role (research = blue, design = amber, build = green, etc.)
//   - Pulse animation rate ties to status:
//       running  -> 0.5s pulses, bright
//       retrying -> 0.8s, amber
//       idle     -> 2.5s pulses, dim
//       failed   -> 3s, red, sparse
//       completed-> 1.2s, mint
//
// The visual reads as "an agent thinking" — synapses firing along the graph.
// Replaces the Resident Evil character sprites which were Capcom IP and
// could not ship on customer-facing surfaces.

export type CerebroSynapseStatus =
  | "running"
  | "retrying"
  | "idle"
  | "completed"
  | "blocked"
  | "failed"
  | "error";

type Props = {
  /** Stable identifier — same id = same network layout */
  seed: string;
  /** Agent status — drives pulse rate + color */
  status: CerebroSynapseStatus;
  /** Optional color override (hex) — for role-based theming */
  accentColor?: string;
  /** Card vs modal sizing variant */
  variant?: "card" | "modal";
};

// Deterministic seeded random — same seed = same network every render
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function statusStyle(status: CerebroSynapseStatus) {
  switch (status) {
    case "running":
      return { pulseMs: 500, intensity: 1, glow: 0.9, hueShift: 0 };
    case "retrying":
      return { pulseMs: 800, intensity: 0.85, glow: 0.7, hueShift: 30 };
    case "idle":
      return { pulseMs: 2500, intensity: 0.45, glow: 0.3, hueShift: -20 };
    case "completed":
      return { pulseMs: 1200, intensity: 0.7, glow: 0.6, hueShift: 100 };
    case "blocked":
      return { pulseMs: 2000, intensity: 0.35, glow: 0.25, hueShift: 250 };
    case "failed":
    case "error":
      return { pulseMs: 3000, intensity: 0.4, glow: 0.4, hueShift: 360 };
    default:
      return { pulseMs: 1500, intensity: 0.6, glow: 0.5, hueShift: 0 };
  }
}

export function CerebroSynapseVisual({ seed, status, accentColor, variant = "card" }: Props) {
  const network = useMemo(() => {
    const rng = mulberry32(hashString(seed));
    const nodeCount = 10 + Math.floor(rng() * 5); // 10..14
    const w = 100;
    const h = 100;

    const nodes: Array<{ id: number; x: number; y: number; r: number }> = [];
    // Distribute nodes with a soft grid to avoid clustering
    for (let i = 0; i < nodeCount; i += 1) {
      const tries = 8;
      let placed = false;
      for (let t = 0; t < tries; t += 1) {
        const x = 8 + rng() * (w - 16);
        const y = 8 + rng() * (h - 16);
        const tooClose = nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 14);
        if (!tooClose) {
          nodes.push({ id: i, x, y, r: 1.4 + rng() * 1.4 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        nodes.push({ id: i, x: 8 + rng() * (w - 16), y: 8 + rng() * (h - 16), r: 1.5 });
      }
    }

    // Connect each node to its 2-3 nearest neighbors
    const edges: Array<{ a: number; b: number; len: number }> = [];
    for (const n of nodes) {
      const others = nodes
        .filter((o) => o.id !== n.id)
        .map((o) => ({ o, d: Math.hypot(n.x - o.x, n.y - o.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2 + Math.floor(rng() * 2));
      for (const { o, d } of others) {
        const exists = edges.some(
          (e) => (e.a === n.id && e.b === o.id) || (e.a === o.id && e.b === n.id)
        );
        if (!exists) edges.push({ a: n.id, b: o.id, len: d });
      }
    }
    return { nodes, edges };
  }, [seed]);

  const style = statusStyle(status);
  const baseColor = accentColor ?? "#A67843"; // BV gold as default

  // Unique IDs for SVG gradient defs (avoid collision when many on page)
  const uid = useMemo(() => `cs-${hashString(seed).toString(36)}`, [seed]);

  const dim = variant === "card" ? 200 : 320;

  return (
    <div
      className={`cerebro-synapse cerebro-synapse-${variant} cerebro-synapse-${status}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: `radial-gradient(circle at 50% 60%, rgba(20, 22, 26, 0.65) 0%, rgba(8, 9, 11, 0.96) 80%)`,
        overflow: "hidden",
        borderRadius: "inherit"
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id={`${uid}-node`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={baseColor} stopOpacity={style.intensity} />
            <stop offset="60%" stopColor={baseColor} stopOpacity={style.intensity * 0.6} />
            <stop offset="100%" stopColor={baseColor} stopOpacity={0} />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.2 * style.glow} />
          </filter>
        </defs>

        {/* Edges (drawn first, behind nodes) */}
        {network.edges.map((e, i) => {
          const a = network.nodes[e.a];
          const b = network.nodes[e.b];
          if (!a || !b) return null;
          const delay = (i * 37) % 4000; // stagger pulses across edges
          return (
            <g key={`e-${i}`}>
              {/* Static thin trace */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={baseColor}
                strokeOpacity={0.18 * style.intensity}
                strokeWidth={0.35}
              />
              {/* Animated pulse traveling the edge */}
              <circle r={0.7} fill={baseColor} opacity={style.intensity}>
                <animateMotion
                  dur={`${style.pulseMs}ms`}
                  repeatCount="indefinite"
                  begin={`${delay}ms`}
                  path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                />
                <animate
                  attributeName="opacity"
                  values={`0;${style.intensity};0`}
                  dur={`${style.pulseMs}ms`}
                  repeatCount="indefinite"
                  begin={`${delay}ms`}
                />
              </circle>
            </g>
          );
        })}

        {/* Nodes */}
        {network.nodes.map((n) => (
          <g key={`n-${n.id}`} filter={`url(#${uid}-glow)`}>
            {/* Outer glow */}
            <circle cx={n.x} cy={n.y} r={n.r * 3.2} fill={`url(#${uid}-node)`} />
            {/* Solid core */}
            <circle cx={n.x} cy={n.y} r={n.r} fill={baseColor} opacity={style.intensity}>
              <animate
                attributeName="opacity"
                values={`${style.intensity * 0.4};${style.intensity};${style.intensity * 0.4}`}
                dur={`${style.pulseMs * 2}ms`}
                repeatCount="indefinite"
                begin={`${(n.id * 137) % 2000}ms`}
              />
            </circle>
          </g>
        ))}
      </svg>

      {/* Subtle CRT scanlines — preserves the cyberpunk admin feel without
          referencing any IP. Optional, can disable per-variant. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 3px)",
          mixBlendMode: "multiply"
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 100%, rgba(0,0,0,0.45) 0%, transparent 50%)"
        }}
      />
    </div>
  );
}
