import "server-only";

import sharp from "sharp";

// Make a near-white background transparent. Designed for product mockups
// that come on a flat white studio background — typical Printful previews,
// AI-generated product stills, anything photographed on white seamless.
//
// Strategy:
//   - For each pixel, compute "whiteness" as min(R, G, B) / 255.
//   - Pixels above WHITE_HARD become fully transparent.
//   - Pixels between WHITE_SOFT and WHITE_HARD get a proportional alpha so
//     anti-aliased edges (logo letters, garment edges) feather cleanly
//     instead of getting a chunky cutout halo.
//   - Pixels below WHITE_SOFT stay opaque.
//
// Not designed for busy backgrounds — for those use proper segmentation.
// For our case (Printful mockups, AI flat-lays), this is ~all we need.

export type TransparentizeOptions = {
  // Min channel value above which a pixel counts as "fully white". 0–255.
  hardThreshold?: number;
  // Min channel value above which a pixel starts feathering. 0–255.
  softThreshold?: number;
  // If true, only feather/erase pixels reachable from the edge of the image.
  // Slower but preserves white text/highlights inside the subject. Default false.
  edgeOnly?: boolean;
};

const DEFAULT_HARD = 248;
const DEFAULT_SOFT = 230;

export async function makeBackgroundTransparent(
  input: Buffer,
  options: TransparentizeOptions = {}
): Promise<Buffer> {
  const hard = options.hardThreshold ?? DEFAULT_HARD;
  const soft = options.softThreshold ?? DEFAULT_SOFT;
  if (soft >= hard) throw new Error("softThreshold must be < hardThreshold");

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${info.channels}`);
  }

  const { width, height } = info;
  const total = width * height;

  // Step 1: classify every pixel as white/feather/keep based on thresholds.
  // 0 = keep opaque, 1 = feather, 2 = transparent.
  const classification = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const minChannel = r < g ? (r < b ? r : b) : (g < b ? g : b);
    if (minChannel >= hard) classification[i] = 2;
    else if (minChannel >= soft) classification[i] = 1;
    else classification[i] = 0;
  }

  // Step 2 (optional): if edgeOnly, flood-fill from image edges through
  // white/feather pixels. Anything not reached stays opaque even if it
  // looked white (preserves white text/highlights inside the subject).
  let reachable: Uint8Array | null = null;
  if (options.edgeOnly) {
    reachable = new Uint8Array(total);
    const stack: number[] = [];
    const push = (idx: number) => {
      if (idx < 0 || idx >= total) return;
      if (reachable![idx]) return;
      if (classification[idx] === 0) return;
      reachable![idx] = 1;
      stack.push(idx);
    };
    for (let x = 0; x < width; x += 1) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      push(y * width);
      push(y * width + (width - 1));
    }
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x > 0) push(idx - 1);
      if (x < width - 1) push(idx + 1);
      if (y > 0) push(idx - width);
      if (y < height - 1) push(idx + width);
    }
  }

  // Step 3: write final alpha values.
  const range = hard - soft;
  for (let i = 0; i < total; i += 1) {
    const cls = classification[i];
    if (cls === 0) continue;
    if (reachable && !reachable[i]) continue;
    const alphaIdx = i * 4 + 3;
    if (cls === 2) {
      data[alphaIdx] = 0;
    } else {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const minChannel = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const t = (minChannel - soft) / range; // 0..1
      data[alphaIdx] = Math.round(255 * (1 - t));
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
