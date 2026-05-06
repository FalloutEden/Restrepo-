// Build a polo-specific front design file for the AOP polo placement.
//
// Why we need this: the merchant's source file ("BV Allover the front of me.png")
// is a tileable seamless pattern. Printful's auto-fit on the polo's `front`
// placement tiles it across the print area, so BV monograms land wherever
// tile boundaries happen to fall — NOT down the placket, NOT centered at
// the chest. The merchant's design intent is "BV column down the placket,
// large star at chest" — that requires the file to be sized at the FULL
// Printful print area (no tiling) with deliberate center placement.
//
// This script composites that file via sharp:
//   - 4500x5400 canvas (Printful AOP polo front print area)
//   - Alloverme tile as a faded background pattern
//   - A vertical column of 5 BV monograms running down horizontal center
//     (x=2250, evenly spaced top-to-bottom inside the safe area)
//   - One large 4-point star at vertical center (chest level)
//   - Top 1/10 left transparent so the polo's neckline cut-out doesn't
//     bisect a monogram
//
// Output:
//   .openclaw/brand/aop-polo-front-centered.png
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-build-polo-front.ts

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const ALL_PATTERN_PATH = path.join(BRAND_DIR, "BV Alloverme.png");
const MONOGRAM_PATH = path.join(BRAND_DIR, "BV Monogram.png");
const OUT_PATH = path.join(BRAND_DIR, "aop-polo-front-centered.png");

// Printful AOP polo front print area
const W = 4500;
const H = 5400;

// Visual constants
const NECK_HEADSPACE = Math.round(H * 0.10); // top 10% blank — polo neck cut-out lands here
const SAFE_TOP = NECK_HEADSPACE;
const SAFE_BOTTOM = H - Math.round(H * 0.05);
const SAFE_HEIGHT = SAFE_BOTTOM - SAFE_TOP;

// Center column of BV monograms — 5 down the vertical centerline
const CENTER_BV_COUNT = 5;
const CENTER_BV_SIZE = 700; // monogram width in px (BV is square-ish)

// Large center star (4-point) at chest level — about 30% down the safe area
const STAR_Y_FRACTION = 0.32;
const STAR_SIZE = 900; // diameter

async function buildAlphaBackground(): Promise<Buffer> {
  // Tile alloverme.png to fill WxH, then fade it slightly so the centered
  // elements pop. Read as raw RGBA so the composite step can use it directly.
  const tile = await sharp(ALL_PATTERN_PATH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tw = tile.info.width;
  const th = tile.info.height;
  const cols = Math.ceil(W / tw);
  const rows = Math.ceil(H / th);
  const composites: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      composites.push({ input: tile.data, raw: { width: tw, height: th, channels: 4 }, left: c * tw, top: r * th });
    }
  }
  const tiled = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toBuffer();

  // Fade alpha to ~50% so the centered BV column and star stand out.
  const { data, info } = await sharp(tiled).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * 0.55);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function buildStarSvg(size: number, color: string = "#A67843"): Buffer {
  // Sharp 4-point star with elongated vertical and horizontal beams
  // (matches the BV pattern's star motif). Drawn in SVG, rasterized by sharp.
  const cx = size / 2;
  const cy = size / 2;
  const armLong = size * 0.48;  // long beam
  const armShort = size * 0.06; // narrow midsection
  const points = [
    [cx, cy - armLong],            // top tip
    [cx + armShort, cy - armShort],
    [cx + armLong, cy],            // right tip
    [cx + armShort, cy + armShort],
    [cx, cy + armLong],            // bottom tip
    [cx - armShort, cy + armShort],
    [cx - armLong, cy],            // left tip
    [cx - armShort, cy - armShort]
  ];
  const d = "M " + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ") + " Z";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <path d="${d}" fill="${color}" />
  </svg>`;
  return Buffer.from(svg);
}

async function main() {
  for (const p of [ALL_PATTERN_PATH, MONOGRAM_PATH]) {
    if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  }

  console.log(`[init] target ${W}x${H}, headspace ${NECK_HEADSPACE}px (neckline)`);
  console.log(`[bg] tiling alloverme as faded background…`);
  const background = await buildAlphaBackground();

  // Build the centered BV monogram column
  console.log(`[bv] preparing ${CENTER_BV_COUNT} centered BV monograms at ${CENTER_BV_SIZE}px…`);
  const monogramResized = await sharp(MONOGRAM_PATH)
    .resize(CENTER_BV_SIZE, CENTER_BV_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];
  // Vertical spacing: divide safe area by (count+1) so BVs are evenly distributed
  const ySpacing = SAFE_HEIGHT / (CENTER_BV_COUNT + 1);
  for (let i = 0; i < CENTER_BV_COUNT; i += 1) {
    const cy = SAFE_TOP + ySpacing * (i + 1);
    composites.push({
      input: monogramResized,
      left: Math.round(W / 2 - CENTER_BV_SIZE / 2),
      top: Math.round(cy - CENTER_BV_SIZE / 2)
    });
  }

  // Center star at chest — overrides one of the BV positions roughly
  console.log(`[star] adding centered ${STAR_SIZE}px star at chest level…`);
  const starSvg = buildStarSvg(STAR_SIZE);
  const starBuf = await sharp(starSvg).png().toBuffer();
  composites.push({
    input: starBuf,
    left: Math.round(W / 2 - STAR_SIZE / 2),
    top: Math.round(SAFE_TOP + SAFE_HEIGHT * STAR_Y_FRACTION - STAR_SIZE / 2)
  });

  console.log(`[compose] writing ${OUT_PATH}…`);
  await sharp(background)
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(OUT_PATH);

  const outStat = fs.statSync(OUT_PATH);
  const outMeta = await sharp(OUT_PATH).metadata();
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  ${outMeta.width}x${outMeta.height} (${(outStat.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`\nThis file is sized to fully cover Printful's polo front print area, so`);
  console.log(`no tiling occurs — the centered BV column + chest star will land where designed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
