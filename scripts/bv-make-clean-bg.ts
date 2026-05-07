// Generate a clean, wordmark-free dark gradient backdrop for BV product
// composites. Pure synthetic — no source image needed. Matches the warm-black
// → near-black gradient tone of the original BG BV Mock.png so existing
// composites still feel cohesive.
//
// Run:
//   node --import tsx scripts/bv-make-clean-bg.ts
//
// Writes:
//   .openclaw/brand/Mock Up BG/BG BV Mock Clean.png

import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), ".openclaw", "brand", "Mock Up BG", "BG BV Mock Clean.png");

const W = 1254;
const H = 1254;

async function main() {
  // Build a radial-ish gradient in raw RGBA: lit upper-left to deep black bottom-right,
  // matching the editorial look of the original BG without the wordmark text.
  const data = Buffer.alloc(W * H * 4);
  // Anchor: warm dark grey near the top center, fading to near-black at corners
  // — mimics the soft directional lighting from upper-left in the original.
  const ax = W * 0.25;
  const ay = H * 0.30;
  const maxDist = Math.hypot(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const d = Math.hypot(x - ax, y - ay) / maxDist; // 0..~1.4
      const t = Math.min(1, d * 1.1);
      // Gradient from #2A2520 (warm-near-black, anchor) to #0A0908 (deep black)
      const r = Math.round(0x2A * (1 - t) + 0x0A * t);
      const g = Math.round(0x25 * (1 - t) + 0x09 * t);
      const b = Math.round(0x20 * (1 - t) + 0x08 * t);
      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  // Subtle film grain so it doesn't look CGI-flat.
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 6;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }

  const buf = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .blur(0.3) // soften the noise just slightly
    .png()
    .toBuffer();

  await sharp(buf).toFile(OUT);
  const meta = await sharp(OUT).metadata();
  console.log(`[clean-bg] wrote ${OUT} (${meta.width}x${meta.height}, ${(buf.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
