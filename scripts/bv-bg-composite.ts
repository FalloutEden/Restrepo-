// Drop one or more model photos onto the BV mock background.
//
// Run:
//   node --env-file=.env.local --import tsx scripts/bv-bg-composite.ts \
//     --in path/to/model.jpg --out .openclaw/brand/composited.png --mode ai
//
// Modes:
//   --mode ai      → gpt-image-1 image edit, lighting matched, editorial feel
//   --mode cutout  → gpt-image-1 background removal + sharp composite onto BG
//   --mode sharp   → sharp-only (assumes the input is on near-white seamless)
//
// Optional positional knobs (cutout/sharp only):
//   --subjectHeight 0.9       fraction of canvas height the subject takes
//   --subjectX 0.55           horizontal center (0=left, 1=right)
//   --subjectBottomY 0.98     where the bottom of the subject sits
//   --shadow                  add a soft drop shadow

import fs from "node:fs";
import path from "node:path";

import {
  aiBackgroundReplace,
  cutoutComposite,
  sharpFlatWhiteCutout,
  BV_MOCK_BG_PATH
} from "@/lib/bg-composite";
import sharp from "sharp";

type Args = {
  in: string;
  out: string;
  mode: "ai" | "cutout" | "sharp";
  subjectHeight?: number;
  subjectX?: number;
  subjectBottomY?: number;
  shadow: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  const inPath = get("--in");
  const outPath = get("--out");
  const mode = (get("--mode") ?? "ai") as Args["mode"];
  if (!inPath) throw new Error("--in <path> required");
  if (!outPath) throw new Error("--out <path> required");
  if (!["ai", "cutout", "sharp"].includes(mode)) {
    throw new Error(`--mode must be ai|cutout|sharp, got ${mode}`);
  }
  return {
    in: inPath,
    out: outPath,
    mode,
    subjectHeight: get("--subjectHeight") ? Number(get("--subjectHeight")) : undefined,
    subjectX: get("--subjectX") ? Number(get("--subjectX")) : undefined,
    subjectBottomY: get("--subjectBottomY") ? Number(get("--subjectBottomY")) : undefined,
    shadow: has("--shadow")
  };
}

async function main() {
  const args = parseArgs();
  if (!fs.existsSync(BV_MOCK_BG_PATH)) {
    throw new Error(`BV mock BG missing at ${BV_MOCK_BG_PATH}`);
  }
  if (!fs.existsSync(args.in)) {
    throw new Error(`Input photo not found: ${args.in}`);
  }
  const inputBuffer = fs.readFileSync(args.in);

  console.log(`[bv-bg] mode=${args.mode}  in=${args.in}  out=${args.out}`);
  let result: Buffer;
  if (args.mode === "ai") {
    console.log("[bv-bg] calling gpt-image-1 (image edit) — about $0.04");
    result = await aiBackgroundReplace(inputBuffer);
  } else if (args.mode === "cutout") {
    console.log("[bv-bg] cutting out subject + compositing onto BV BG");
    result = await cutoutComposite(inputBuffer, {
      subjectHeightFrac: args.subjectHeight,
      subjectCenterXFrac: args.subjectX,
      subjectBottomYFrac: args.subjectBottomY,
      dropShadow: args.shadow
    });
  } else {
    console.log("[bv-bg] sharp white-bg cutout + composite (no AI cost)");
    const subject = await sharpFlatWhiteCutout(inputBuffer);
    result = await cutoutComposite(subject, {
      subjectHeightFrac: args.subjectHeight,
      subjectCenterXFrac: args.subjectX,
      subjectBottomYFrac: args.subjectBottomY,
      dropShadow: args.shadow,
      alreadyTransparent: true
    });
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, result);
  const meta = await sharp(result).metadata();
  console.log(
    `[bv-bg] wrote ${args.out} — ${meta.width}x${meta.height}, ${(result.length / 1024).toFixed(0)} KB`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
