// Upscale a tileable AOP pattern to Printful-safe resolution.
//
// Printful's AOP placements warn "image too small" when your artwork is
// under ~150 DPI at the placement's print size. Most placements want
// 6000–7200 px on the long edge. Plain pixel upscaling softens the design.
// Better: take a seamless tileable source and TILE it more times onto a
// larger canvas — output is huge AND stays sharp.
//
// This script reads a source pattern PNG, computes how many times it tiles
// into the target dimensions, and composites copies onto a canvas. Output
// goes to .openclaw/brand/<name>-printful.png (or --out <path>).
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/upscale-aop-pattern.ts <input.png> [--out path] [--width N] [--height N] [--mode tile|scale]
//
// Examples:
//   ./upscale-aop-pattern.ts ".openclaw/brand/aop-pattern-dark.png"
//     → .openclaw/brand/aop-pattern-dark-printful.png at 7200x9600
//   ./upscale-aop-pattern.ts pattern.png --width 6000 --height 6000
//     → square output sized for bomber jacket / hoodie back panel
//   ./upscale-aop-pattern.ts pattern.png --mode scale
//     → straight upscale (only use if the source is high-res already)

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Args = {
  input: string;
  output: string;
  width: number;
  height: number;
  mode: "tile" | "scale";
};

function parseArgs(): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  const input = positional[0];
  if (!input) {
    console.error("Usage: upscale-aop-pattern.ts <input.png> [--out path] [--width N] [--height N] [--mode tile|scale]");
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  }
  const width = Number(flags.width ?? 7200);
  const height = Number(flags.height ?? 9600);
  const mode = (flags.mode === "scale" ? "scale" : "tile") as "tile" | "scale";
  const inputDir = path.dirname(input);
  const inputName = path.basename(input, path.extname(input));
  const output = flags.out ?? path.join(inputDir, `${inputName}-printful.png`);
  return { input, output, width, height, mode };
}

async function tileMode(input: string, output: string, width: number, height: number) {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read source dimensions");
  const sw = meta.width;
  const sh = meta.height;

  // How many copies fit on each axis (round UP so we cover the whole canvas).
  const cols = Math.ceil(width / sw);
  const rows = Math.ceil(height / sh);
  console.log(`[tile] source=${sw}x${sh}  target=${width}x${height}  tiling ${cols}x${rows} = ${cols * rows} copies`);

  const sourceBuffer = fs.readFileSync(input);
  const composites: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      composites.push({ input: sourceBuffer, left: c * sw, top: r * sh });
    }
  }

  // Detect whether the source has alpha (transparent background) so we use
  // a matching canvas. Transparent background patterns get a transparent
  // canvas; opaque patterns get a transparent canvas anyway since the
  // composite will fully cover it.
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function scaleMode(input: string, output: string, width: number, height: number) {
  console.log(`[scale] upscaling ${input} → ${width}x${height} (lanczos3)`);
  await sharp(input)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function main() {
  const args = parseArgs();
  console.log(`[init] input=${args.input}\n[init] output=${args.output}\n[init] mode=${args.mode}`);

  if (args.mode === "tile") {
    await tileMode(args.input, args.output, args.width, args.height);
  } else {
    await scaleMode(args.input, args.output, args.width, args.height);
  }

  const stat = fs.statSync(args.output);
  const out = await sharp(args.output).metadata();
  console.log(`\n✓ Wrote ${args.output}`);
  console.log(`  ${out.width}x${out.height} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`\nUpload this file in Printful's design editor — the "image too small" warning should clear.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
