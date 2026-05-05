// Generate a clean black-tee hero shot via gpt-image-1, then composite the
// real BV Transpo logo onto the chest area using sharp. Saves to
// .openclaw/brand/hero.png so the deploy script picks it up.
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/blackvault-hero-compose.ts

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Transpo.png");
const TEE_RAW_PATH = path.join(BRAND_DIR, "hero-raw-tee.png"); // clean shirt before composite
const HERO_OUTPUT_PATH = path.join(BRAND_DIR, "hero.png"); // composited final

// Hero dimensions chosen to match what gpt-image-1 supports for wide hero crops.
const HERO_WIDTH = 1536;
const HERO_HEIGHT = 1024;

// Composite knobs — easy to tune if the chest position lands off.
// X is the LEFT edge of the logo as fraction of hero width.
// Y is the TOP edge as fraction of hero height.
// SCALE is logo width as fraction of hero width.
// Left-chest emblem placement (à la Polo / Lacoste) — small, restrained.
const LOGO_X_FRAC = 0.22;
const LOGO_Y_FRAC = 0.32;
const LOGO_SCALE_FRAC = 0.08;
const LOGO_OPACITY = 0.85; // 0..1 — reduces a touch so it reads as a print, not a sticker

const HERO_PROMPT = [
  "Editorial fashion product photograph for a premium dark-aesthetic apparel brand.",
  "Centerpiece: a single MATTE BLACK heavyweight premium cotton t-shirt, neatly folded once, resting at a slight angle on a polished dark walnut wood surface.",
  "The shirt is COMPLETELY BLANK — no graphics, no print, no logo, no text on it whatsoever. Plain black fabric only, with a small clear unblemished centered space on the chest where a logo could later be added.",
  "Lighting: soft warm directional key light from upper-left at roughly 45 degrees, gentle fill from below to keep shadow detail; visible cotton weave texture on the fabric; subtle cream highlights along fold edges.",
  "Mood is dark and luxurious but READABLE — NOT crushed black. The shirt must be clearly visible against the surface. Overall image around 60–70% dark tones, not 95%. Think Tom Ford eyewear campaign exposure.",
  "Wide cinematic 3:2 composition with intentional negative space on the right side of the frame; the shirt should sit in the LEFT-CENTER of the frame.",
  "Style references: Saint Laurent menswear lookbook, John Varvatos fall campaign, Brunello Cucinelli editorial.",
  "No model, no other props, no text, no graphics, no logos."
].join(" ");

async function generateRawTee(): Promise<Buffer> {
  if (fs.existsSync(TEE_RAW_PATH)) {
    console.log(`[tee] reusing cached clean tee at ${TEE_RAW_PATH}`);
    return fs.readFileSync(TEE_RAW_PATH);
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const openai = new OpenAI({ apiKey });
  console.log("[tee] generating clean blank tee with gpt-image-1 (1536x1024)…");
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: HERO_PROMPT.slice(0, 4000),
    n: 1,
    size: "1536x1024"
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  const buffer = Buffer.from(b64, "base64");
  fs.writeFileSync(TEE_RAW_PATH, buffer);
  console.log(`[tee] saved clean tee to ${TEE_RAW_PATH} (${buffer.length} bytes)`);
  return buffer;
}

async function compositeLogo(teeBuffer: Buffer, logoBuffer: Buffer): Promise<Buffer> {
  // 1. Resize the logo to a subtle chest-sized scale.
  const logoTargetWidth = Math.round(HERO_WIDTH * LOGO_SCALE_FRAC);
  const resizedLogo = await sharp(logoBuffer)
    .resize({ width: logoTargetWidth, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    // Dial the opacity down slightly so it reads like a real screen print on
    // dark cotton, not a clipboard sticker.
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * LOGO_OPACITY)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in"
      }
    ])
    .png()
    .toBuffer();

  // 2. Composite onto the tee at the configured chest position.
  const left = Math.round(HERO_WIDTH * LOGO_X_FRAC);
  const top = Math.round(HERO_HEIGHT * LOGO_Y_FRAC);

  const final = await sharp(teeBuffer)
    .composite([
      {
        input: resizedLogo,
        left,
        top,
        blend: "over"
      }
    ])
    .png()
    .toBuffer();

  return final;
}

async function main() {
  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error(`Logo not found at ${LOGO_PATH}`);
  }
  const teeBuffer = await generateRawTee();
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  console.log("[composite] placing BV monogram on chest…");
  const final = await compositeLogo(teeBuffer, logoBuffer);
  fs.writeFileSync(HERO_OUTPUT_PATH, final);
  console.log(`[composite] saved final hero to ${HERO_OUTPUT_PATH} (${final.length} bytes)`);
  console.log(
    `\nLogo position knobs (edit ${path.basename(__filename)} and re-run if off):\n` +
      `  LOGO_X_FRAC=${LOGO_X_FRAC}  LOGO_Y_FRAC=${LOGO_Y_FRAC}  LOGO_SCALE_FRAC=${LOGO_SCALE_FRAC}  LOGO_OPACITY=${LOGO_OPACITY}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
