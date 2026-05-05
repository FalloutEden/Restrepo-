// Burn the hero text ("PREMIUM ESSENTIALS" eyebrow + "Built to be kept." headline)
// directly onto the AI-generated hero image. Sidesteps Shopify's alignment quirks
// and gives precise positioning — same approach big brands use for campaign hero
// imagery (the text IS part of the photo).
//
// Source:  .openclaw/brand/hero.png  (the AI-generated tee with BV monogram)
// Output:  .openclaw/brand/hero-final.png  (with text composited on the right)
//
// Run with:
//   node --import tsx scripts/blackvault-hero-text.ts

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const HERO_INPUT = path.join(BRAND_DIR, "hero.png");
const HERO_OUTPUT = path.join(BRAND_DIR, "hero-final.png");

// Image is 1536x1024. User's red-line zone: ~52%–94% of width, full height.
// Text block lands inside that zone, vertically centered.
const HERO_W = 1536;
const HERO_H = 1024;
const TEXT_BLOCK_W = 640; // pixels of horizontal space text occupies (~42% of frame)
const TEXT_BLOCK_RIGHT_MARGIN = 96; // pixels of breathing room from the right edge
const TEXT_BLOCK_X = HERO_W - TEXT_BLOCK_W - TEXT_BLOCK_RIGHT_MARGIN; // left edge of text block (~796)
const TEXT_BLOCK_Y = Math.round(HERO_H * 0.40); // y of first baseline, vertically near-center

const COLOR_EYEBROW = "#8A7548"; // muted gold (matches theme accent)
const COLOR_HEADLINE = "#D4B896"; // warm tan (matches theme heading)

// SVG with the two lines of copy. Uses a serif fallback ("Cormorant Garamond" if
// installed, else generic serif) for the headline; sans-serif for the tracked
// eyebrow. Sharp/librsvg renders this and we composite it over the hero PNG.
const svg = `
<svg width="${HERO_W}" height="${HERO_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .eyebrow {
        font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 22px;
        font-weight: 500;
        letter-spacing: 6px;
        fill: ${COLOR_EYEBROW};
      }
      .headline {
        font-family: 'Cormorant Garamond', 'EB Garamond', 'Garamond', 'Georgia', serif;
        font-size: 60px;
        font-weight: 500;
        letter-spacing: -1px;
        fill: ${COLOR_HEADLINE};
      }
    </style>
  </defs>
  <text x="${TEXT_BLOCK_X + TEXT_BLOCK_W / 2}" y="${TEXT_BLOCK_Y}" text-anchor="middle" class="eyebrow">PREMIUM ESSENTIALS</text>
  <text x="${TEXT_BLOCK_X + TEXT_BLOCK_W / 2}" y="${TEXT_BLOCK_Y + 80}" text-anchor="middle" class="headline">Built to be Kept.</text>
</svg>
`.trim();

async function main() {
  if (!fs.existsSync(HERO_INPUT)) {
    throw new Error(`Hero source not found at ${HERO_INPUT} — run blackvault-hero-compose.ts or the deploy script first to generate it.`);
  }

  const composed = await sharp(HERO_INPUT)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0, blend: "over" }])
    .png()
    .toBuffer();

  fs.writeFileSync(HERO_OUTPUT, composed);
  console.log(`Saved ${composed.length} bytes to ${HERO_OUTPUT}`);
  console.log(`Position knobs (edit ${path.basename(__filename)} and re-run if off):`);
  console.log(`  TEXT_BLOCK_X=${TEXT_BLOCK_X}  TEXT_BLOCK_Y=${TEXT_BLOCK_Y}`);
  console.log(`  TEXT_BLOCK_W=${TEXT_BLOCK_W}  RIGHT_MARGIN=${TEXT_BLOCK_RIGHT_MARGIN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
