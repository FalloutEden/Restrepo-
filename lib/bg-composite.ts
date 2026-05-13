import "server-only";

import fs from "node:fs";
import path from "node:path";
import { toFile } from "openai/uploads";
import sharp from "sharp";

import { openai, IMAGE_MODEL } from "@/lib/openai";
import { makeBackgroundTransparent } from "@/lib/image-transparency";

// Black Vault model-on-background compositor.
//
// Two paths:
//   1. aiBackgroundReplace — gpt-image-1 image edit. Sends the model photo
//      + the BV background as references with a directive prompt. Best for
//      editorial fashion shots where you want lighting matched and the
//      brand mark visible. Costs one gpt-image-1 edit (~$0.04).
//   2. cutoutComposite — programmatic. Background-removes the subject with
//      gpt-image-1 (transparent edit), then sharp-composites onto the fixed
//      BV background. Deterministic; subject stays pixel-identical. Costs
//      one gpt-image-1 edit if the source isn't already transparent.
//
// The fixed brand background lives at .openclaw/brand/Mock Up BG/BG BV Mock.png.

// Flat #0F0E0C panel — the storefront's --color-background-rgb is 15 14 12,
// so the composite blends seamlessly into the dark theme product grid. The
// earlier "Clean" gradient (rgb 30,26,23 → rgb 15,13,11) created a visible
// patch on the page because the top of every tile was lighter than the
// surrounding page background. Flat removes the seam.
export const BV_MOCK_BG_PATH = path.join(
  process.cwd(),
  ".openclaw",
  "brand",
  "Mock Up BG",
  "BG BV Mock Flat.png"
);

// Gradient BG kept for archival; not used by the compositor any more.
export const BV_MOCK_BG_GRADIENT_PATH = path.join(
  process.cwd(),
  ".openclaw",
  "brand",
  "Mock Up BG",
  "BG BV Mock Clean.png"
);

// Original BG with wordmark — kept for archival; not used by the compositor.
export const BV_MOCK_BG_LEGACY_PATH = path.join(
  process.cwd(),
  ".openclaw",
  "brand",
  "Mock Up BG",
  "BG BV Mock.png"
);

const DEFAULT_BG_PROMPT = [
  "Editorial fashion campaign photograph for Black Vault Apparel, a premium dark-luxury menswear brand.",
  "Place the SUBJECT from the first reference image (the model and their clothing) onto the SECOND reference image as the background — a deep matte-black gradient backdrop with a subtle BV monogram and small 'BLACK VAULT APPAREL' wordmark visible in the upper-left corner.",
  "Preserve the model, pose, garment fit, garment color, and all clothing details EXACTLY. Do not redesign, recolor, or restyle the apparel. Do not add text, logos, or graphics to the clothing.",
  "Match the lighting in the scene to the dark mood of the background — soft warm key from the upper-left, gentle fill, visible cotton or knit fabric texture, deep but readable shadows. The image should feel like a Saint Laurent or Tom Ford editorial: dark, restrained, premium, but not crushed-black.",
  "The BV monogram and 'BLACK VAULT APPAREL' wordmark in the upper-left of the background must remain crisp, legible, and not be obscured by the model. Frame the model so they sit centered or slightly right of center, leaving the brand mark visible.",
  "No additional props, no extra text, no watermarks, no graphic overlays. The result should look like a single cohesive in-studio fashion shot, not a collage."
].join(" ");

const CUTOUT_PROMPT = [
  "Re-render this image with the subject (the person and their clothing) preserved exactly as shown, against a fully transparent background.",
  "Output a clean cutout — no shadows, no floor, no environmental fill — only the subject on transparent pixels.",
  "Preserve every detail of the clothing: color, fit, fabric, embroidery, prints, and pose. Do not redesign anything.",
  "Edges should be clean with feathered alpha for hair and fabric edges. No white halo, no gray fringe."
].join(" ");

// Editorial-styling cutout prompt. Re-renders the subject as a high-end fashion
// editorial shot ON TRANSPARENT BACKGROUND. Used by `editorial` mode in the
// bulk compositor — the resulting transparent subject is then sharp-composited
// onto the real BV mock BG (whose wordmark stays pixel-perfect because we
// never ask the AI to draw the BG).
function buildEditorialPrompt(hint: SubjectHint): string {
  const genderLine =
    hint.gender === "female"
      ? "Render the subject as a FEMALE model. Pose: confident, three-quarter angle, looking past camera. Hair styled simply, no jewelry. The model's clothing should fit a feminine frame appropriately."
      : hint.gender === "male"
        ? "Render the subject as a MALE model. Pose: confident, three-quarter angle, looking past camera. Short hair, clean shave or light stubble, no jewelry."
        : hint.gender === "none"
          ? "DO NOT include any model. Render only the apparel/product itself, displayed on a clean form (mannequin or invisible-body) or laid flat, depending on the source image."
          : "Render the subject as shown — same gender and styling as the source image.";

  const garmentLine = hint.garmentType
    ? `The garment is a ${hint.garmentType}. Preserve its silhouette, length, and construction exactly as shown in the source image. Do NOT change the cut (e.g., do not crop a full-length tee, do not extend a cropped tee).`
    : "Preserve the garment silhouette, length, and construction exactly as shown in the source image.";

  return [
    "Editorial fashion campaign photograph for Black Vault Apparel — premium dark-luxury menswear/womenswear brand.",
    genderLine,
    garmentLine,
    "Preserve the chest mark from the source image. The chest mark is the BV monogram (the letters B and V interlocked) embroidered in Old Gold thread. If the source has BV at the left chest, render BV at the left chest at the same scale and position. The letters MUST read as 'B' and 'V', NEVER 'P' or 'BR' or any other variant.",
    "Lighting: warm directional key from upper-left at ~45 degrees, gentle fill from below, deep but readable shadows. Tom Ford / Saint Laurent campaign exposure — dark, restrained, premium, NOT crushed black.",
    "Output a fully TRANSPARENT background. No backdrop fill, no shadow on floor, no environmental textures, no text, no logos in the background. Only the model + their apparel on transparent pixels.",
    "DO NOT render any text or wordmarks anywhere in the image — no 'BLACK VAULT', no 'APPAREL', no labels, no captions. Only the embroidered chest BV monogram on the garment itself.",
    "Edges should be clean with feathered alpha for hair and fabric edges. No white halo, no gray fringe."
  ].join(" ");
}

export type SubjectHint = {
  gender?: "male" | "female" | "none" | "as-shown";
  garmentType?: string;
};

export type BgCompositeOptions = {
  // Output canvas size. The BV mock background is square; pick 1024 or 1536.
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  // Override the prompt if you want a specific scene direction.
  prompt?: string;
};

export type CutoutCompositeOptions = {
  // 0..1 — how much of the canvas the subject should occupy vertically.
  subjectHeightFrac?: number;
  // 0..1 — horizontal center of the subject (0=left, 0.5=center, 1=right).
  subjectCenterXFrac?: number;
  // 0..1 — vertical position of the subject's bottom edge.
  subjectBottomYFrac?: number;
  // If true, runs makeBackgroundTransparent before composite (skip if input
  // is already a transparent PNG).
  alreadyTransparent?: boolean;
  // Soft drop-shadow for the subject so they don't look pasted on. Default off.
  dropShadow?: boolean;
  // When alreadyTransparent is false, the cutout call uses this prompt path.
  // editorial=true re-styles the subject as a premium editorial shot.
  editorial?: boolean;
  hint?: SubjectHint;
};

function readBgBuffer(): Buffer {
  if (!fs.existsSync(BV_MOCK_BG_PATH)) {
    throw new Error(`BV mock background not found at ${BV_MOCK_BG_PATH}`);
  }
  return fs.readFileSync(BV_MOCK_BG_PATH);
}

/**
 * AI-driven background replacement. Sends the model photo and the BV mock BG
 * as reference images to gpt-image-1, asking it to render a new editorial
 * shot with the model placed onto the BV background.
 *
 * Use this when you want lighting matched and a polished editorial feel.
 */
export async function aiBackgroundReplace(
  modelPhoto: Buffer,
  options: BgCompositeOptions = {}
): Promise<Buffer> {
  const bg = readBgBuffer();
  const size = options.size ?? "1024x1024";
  const prompt = options.prompt ?? DEFAULT_BG_PROMPT;

  const modelFile = await toFile(modelPhoto, "model.png", { type: "image/png" });
  const bgFile = await toFile(bg, "bv-bg.png", { type: "image/png" });

  const response = await openai.images.edit({
    model: IMAGE_MODEL,
    image: [modelFile, bgFile],
    prompt: prompt.slice(0, 4000),
    size,
    n: 1
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data for AI background replace");
  return Buffer.from(b64, "base64");
}

/**
 * Background removal via gpt-image-1 image edit. Returns a transparent PNG
 * containing only the subject. Costs one image edit.
 *
 * Pass `editorial: true` to also re-style the subject as a premium fashion
 * editorial shot (gender-aware via `hint`). When `editorial` is set, the
 * resulting transparent subject is intended to be sharp-composited onto the
 * real BV mock BG so the wordmark stays pixel-perfect.
 */
export async function aiCutoutSubject(
  modelPhoto: Buffer,
  options: { editorial?: boolean; hint?: SubjectHint } = {}
): Promise<Buffer> {
  const file = await toFile(modelPhoto, "model.png", { type: "image/png" });
  const prompt = options.editorial
    ? buildEditorialPrompt(options.hint ?? {})
    : CUTOUT_PROMPT;
  const response = await openai.images.edit({
    model: IMAGE_MODEL,
    image: file,
    prompt: prompt.slice(0, 4000),
    size: "1024x1024",
    background: "transparent",
    n: 1
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data for cutout");
  return Buffer.from(b64, "base64");
}

/**
 * Programmatic compositor. Takes a transparent subject PNG and lays it onto
 * the BV mock BG using sharp at the configured position/scale.
 *
 * Set alreadyTransparent=false (the default) to first run gpt-image-1 to
 * cut out the subject. Set true to skip and assume the input is already
 * a clean transparent PNG (e.g. a Printful flat-lay you've already cut).
 */
export async function cutoutComposite(
  modelPhoto: Buffer,
  options: CutoutCompositeOptions = {}
): Promise<Buffer> {
  const subject = options.alreadyTransparent
    ? modelPhoto
    : await aiCutoutSubject(modelPhoto, {
        editorial: options.editorial,
        hint: options.hint
      });

  const subjectHeightFrac = options.subjectHeightFrac ?? 0.85;
  const subjectCenterXFrac = options.subjectCenterXFrac ?? 0.55; // slight right so BV mark stays visible
  const subjectBottomYFrac = options.subjectBottomYFrac ?? 0.98;

  const bgMeta = await sharp(BV_MOCK_BG_PATH).metadata();
  const bgWidth = bgMeta.width ?? 1080;
  const bgHeight = bgMeta.height ?? 1080;

  const targetSubjectHeight = Math.round(bgHeight * subjectHeightFrac);
  const resizedSubject = await sharp(subject)
    .resize({ height: targetSubjectHeight, fit: "inside" })
    .toBuffer();
  const subjectMeta = await sharp(resizedSubject).metadata();
  const subjectW = subjectMeta.width ?? targetSubjectHeight;
  const subjectH = subjectMeta.height ?? targetSubjectHeight;

  const left = Math.round(bgWidth * subjectCenterXFrac - subjectW / 2);
  const top = Math.round(bgHeight * subjectBottomYFrac - subjectH);

  const layers: sharp.OverlayOptions[] = [];

  if (options.dropShadow) {
    // Make a soft shadow underneath: take subject alpha → black → blur → offset.
    const shadow = await sharp(resizedSubject)
      .ensureAlpha()
      .extractChannel("alpha")
      .toColorspace("b-w")
      .blur(18)
      .toBuffer();
    const shadowComposite = await sharp({
      create: {
        width: subjectW,
        height: subjectH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: shadow, blend: "dest-in" }])
      .png()
      .toBuffer();
    layers.push({
      input: shadowComposite,
      left: left + 12,
      top: top + 18,
      blend: "over"
    });
  }

  layers.push({ input: resizedSubject, left, top, blend: "over" });

  return sharp(BV_MOCK_BG_PATH).composite(layers).png().toBuffer();
}

/**
 * Convenience: take a raw model photo (any background), drop it onto the BV
 * mock BG using whichever path you ask for. Returns the final PNG buffer.
 */
export async function compositeOntoBvMockBackground(
  modelPhoto: Buffer,
  mode: "ai" | "cutout" = "ai",
  options: BgCompositeOptions & CutoutCompositeOptions = {}
): Promise<Buffer> {
  if (mode === "ai") return aiBackgroundReplace(modelPhoto, options);
  return cutoutComposite(modelPhoto, options);
}

/**
 * Sharp-only flat-white background remover for cases where the input is a
 * studio shot on near-white seamless. Re-uses lib/image-transparency. Cheaper
 * than gpt-image-1 cutout when the source is already clean.
 *
 * Thresholds calibrated against Printful AOP mockups: their seamless BG is
 * pure #FFFFFF (255), white-fabric garments top out around #F0F0F0 (240).
 * Cutting at hard=253/soft=248 with edgeOnly flood-fill removes the pure-white
 * BG and a couple steps of anti-alias halo while leaving white-fabric subjects
 * fully intact. Earlier 240/215 thresholds ate the dress fabric.
 */
export async function sharpFlatWhiteCutout(modelPhoto: Buffer): Promise<Buffer> {
  return makeBackgroundTransparent(modelPhoto, {
    hardThreshold: 253,
    softThreshold: 248,
    edgeOnly: true
  });
}
