import "server-only";

import path from "node:path";

// Logo overlay configuration per brand. AI image-edit models (gpt-image-1)
// can't reliably preserve fine embroidered text/marks — they reinterpret the
// monogram as random glyphs (we saw "BV" rendered as "PV" or "RV" in the
// 2026-05-04 smoke test). The fix: ask the AI for a blank chest, then
// composite the real brand mark onto the generated image with sharp.
//
// chestPosition is in pixels relative to a 1024×1024 source image. Tune per
// brand if the AI tends to place the garment at a different position. The
// default targets a typical centered laydown shot.

const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");

export type LogoOverlayConfig = {
  // Absolute path to the PNG with transparent background.
  logoPath: string;
  // Position to composite the logo at, in pixels for a 1024×1024 base image.
  chestPosition: {
    leftPct: number; // % from left (0–100)
    topPct: number; // % from top (0–100)
    widthPct: number; // logo width as % of canvas width
  };
};

const OVERLAYS: Record<string, LogoOverlayConfig | null> = {
  "black-vault-apparel": {
    logoPath: path.join(BRAND_DIR, "BV Monogram.png"),
    chestPosition: {
      // Viewer-right of center, upper-third of the canvas. Matches a typical
      // centered polo/tee laydown where the left chest of the garment sits
      // on the viewer's right side. widthPct bumped from 11→14 so the real
      // monogram is large enough to fully cover any AI-hallucinated chest
      // mark that bleeds through the prompt.
      leftPct: 55,
      topPct: 36,
      widthPct: 14
    }
  },
  // LockLayer doesn't sell apparel — no overlay needed.
  locklayer: null
};

export function getOverlayConfig(brandSlug: string): LogoOverlayConfig | null {
  return OVERLAYS[brandSlug] ?? null;
}
