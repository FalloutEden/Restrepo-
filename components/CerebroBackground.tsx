// Ambient cerebro background — a procedurally generated SVG that mimics
// the look of the graphify graph.html visualization (colored synapse dots
// in a dense cloud), pulsed with a slow CSS animation. Sits behind every
// page via app/layout.tsx, fixed-positioned at z-index: -2 so content
// renders cleanly on top.
//
// Why not an actual screenshot of graph.html: graph.html is 4MB of D3
// and won't scale across pages or devices. The procedural version is
// ~6KB of SVG, deterministic between renders (so SSR + hydration match),
// and looks the part at low opacity.
//
// The "light flashing" feel comes from .cerebro-bg-dot CSS keyframes
// defined in globals.css — every dot inherits the same animation but
// with a randomized animation-delay so they pulse out-of-phase.

const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const RADIUS = 460;
const NODE_COUNT = 220;

// Palette pulled from the graphify graph visualization — same vibe.
const COLORS = [
  "#e3506a", // pink
  "#f0b34b", // amber
  "#6EDC96", // green
  "#5B8CFF", // blue
  "#A67843", // gold
  "#c98ee8", // purple
  "#7FD8FF" // cyan
];

// Cheap deterministic pseudo-random — same seed → same layout on every
// render. Keeps SSR + client hydration in sync without React state.
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Dot = {
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: number;
};

function buildDots(): Dot[] {
  const rand = seededRand(42);
  const dots: Dot[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    // Polar coords with a slight bias toward the center to mimic the
    // graph's gravitational clustering.
    const t = rand();
    const distance = Math.sqrt(t) * RADIUS;
    const angle = rand() * Math.PI * 2;
    const cx = CENTER + Math.cos(angle) * distance;
    const cy = CENTER + Math.sin(angle) * distance;
    const r = 1.2 + rand() * 2.4;
    const color = COLORS[Math.floor(rand() * COLORS.length)];
    const delay = rand() * 6; // seconds, spread across the 6s pulse cycle
    dots.push({ cx, cy, r, color, delay });
  }

  return dots;
}

const DOTS = buildDots();

export function CerebroBackground() {
  return (
    <div className="cerebro-bg" aria-hidden="true">
      <svg
        className="cerebro-bg-svg"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {DOTS.map((d, i) => (
          <circle
            key={i}
            className="cerebro-bg-dot"
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={d.color}
            style={{ animationDelay: `-${d.delay.toFixed(2)}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
