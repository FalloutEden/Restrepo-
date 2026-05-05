import "server-only";

import { readFile } from "node:fs/promises";
import sharp from "sharp";

import {
  addAssetToDrop,
  appendDropLog,
  newAssetId,
  resolveAssetPath,
  saveAssetFile
} from "@/lib/content-studio/storage";
import type { ContentDrop, MediaAsset } from "@/lib/content-studio/types";

// ── Image pipeline — source-photo-first ───────────────────────────────────
//
// Hard lesson from 2026-05-04: AI image generation (gpt-image-1, both edit
// and text-to-image modes) cannot be trusted to render a private-label
// product cleanly. It hallucinates corrupted "BV" letters, ignores negative
// prompts ("no logo" → AI adds a logo), and treats brand-related words as
// priming for generation. Every attempted fix (positive-only prompts,
// chest-area overpaint, color-sampled patches) introduced new visual bugs.
//
// The right answer is to never let the AI touch a branded product image.
// The user's phone photos already have the real product with the correct
// embroidered monogram — those photos ARE the source of truth. The pipeline
// now generates platform variants from those source photos via sharp:
// platform-specific aspect-ratio crops, color/exposure treatments. Each
// variant becomes a separate MediaAsset. The AI continues to handle copy
// generation (which works perfectly) and video generation (image-to-video,
// which animates the user's real photo, also preserving the logo).
//
// The "lifestyle scenarios" terminology is preserved in the API for
// backward compatibility, but each scenario now describes a *crop or
// treatment* applied to the user's photo rather than an AI-generated scene.

type Treatment = {
  label: string;
  // Aspect ratio to crop to (width:height). Picked centered on the source.
  aspectRatio: { w: number; h: number };
  // Optional sharp transform to apply after the crop.
  sharpen?: boolean;
  modulate?: { brightness?: number; saturation?: number; lightness?: number };
  grayscale?: boolean;
};

const DEFAULT_TREATMENTS: Treatment[] = [
  { label: "square-1x1-natural", aspectRatio: { w: 1, h: 1 }, sharpen: true },
  { label: "portrait-4x5-natural", aspectRatio: { w: 4, h: 5 }, sharpen: true },
  { label: "vertical-9x16-natural", aspectRatio: { w: 9, h: 16 }, sharpen: true },
  { label: "vertical-2x3-pinterest", aspectRatio: { w: 2, h: 3 }, sharpen: true },
  { label: "square-1x1-warm", aspectRatio: { w: 1, h: 1 }, modulate: { saturation: 1.1, brightness: 1.04 }, sharpen: true }
];

// Backward-compat re-export so existing callers don't break.
export const DEFAULT_LIFESTYLE_SCENARIOS = DEFAULT_TREATMENTS.map((t) => t.label);

function safeFilename(label: string, idx: number, sourceIdx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `lifestyle-${idx}-src${sourceIdx}-${slug || "variant"}.jpg`;
}

// Pick the largest centered crop matching the target aspect ratio.
function computeCenterCrop(
  srcWidth: number,
  srcHeight: number,
  ratio: { w: number; h: number }
): { left: number; top: number; width: number; height: number } {
  const targetRatio = ratio.w / ratio.h;
  const srcRatio = srcWidth / srcHeight;
  let cropW: number;
  let cropH: number;
  if (srcRatio > targetRatio) {
    // source is wider than target — crop the sides
    cropH = srcHeight;
    cropW = Math.round(srcHeight * targetRatio);
  } else {
    // source is taller than target — crop top/bottom
    cropW = srcWidth;
    cropH = Math.round(srcWidth / targetRatio);
  }
  return {
    left: Math.round((srcWidth - cropW) / 2),
    top: Math.round((srcHeight - cropH) / 2),
    width: cropW,
    height: cropH
  };
}

async function applyTreatment(sourceBuffer: Buffer, treatment: Treatment): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(sourceBuffer).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;
  const crop = computeCenterCrop(srcW, srcH, treatment.aspectRatio);

  let pipeline = sharp(sourceBuffer).extract(crop);

  if (treatment.modulate) pipeline = pipeline.modulate(treatment.modulate);
  if (treatment.grayscale) pipeline = pipeline.grayscale();
  if (treatment.sharpen) pipeline = pipeline.sharpen({ sigma: 0.7 });

  // Resize so the long edge is at most 2048px, preserves quality without
  // shipping monster files.
  const longEdge = Math.max(crop.width, crop.height);
  if (longEdge > 2048) {
    const scale = 2048 / longEdge;
    pipeline = pipeline.resize(Math.round(crop.width * scale), Math.round(crop.height * scale));
  }

  pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
  const buffer = Buffer.from(await pipeline.toBuffer());
  const finalMeta = await sharp(buffer).metadata();
  return { buffer, width: finalMeta.width ?? crop.width, height: finalMeta.height ?? crop.height };
}

// Build platform-ready variants of the user's source photos. One variant per
// (source, treatment) combination, capped by maxImages.
export async function generateLifestyleImages(
  drop: ContentDrop,
  scenarios: string[],
  options: { productContext?: string; maxImages?: number } = {}
): Promise<MediaAsset[]> {
  const sourcePhotos = drop.assets.filter((a) => a.kind === "source_photo");
  if (sourcePhotos.length === 0) {
    await appendDropLog(drop.id, "warn", "No source photos uploaded — skipping lifestyle variants");
    return [];
  }

  // Match each requested scenario label to a treatment definition. Unknown
  // labels fall back to the first DEFAULT_TREATMENT so the pipeline never
  // silently drops an item.
  const requestedTreatments: Treatment[] = scenarios
    .map((label) => DEFAULT_TREATMENTS.find((t) => t.label === label))
    .filter((t): t is Treatment => !!t);
  const treatments = requestedTreatments.length > 0 ? requestedTreatments : DEFAULT_TREATMENTS;

  const cap = options.maxImages ?? treatments.length * sourcePhotos.length;
  const generated: MediaAsset[] = [];

  outer: for (let s = 0; s < sourcePhotos.length; s += 1) {
    const source = sourcePhotos[s];
    const sourcePath = resolveAssetPath(drop.id, source.filePath);
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await readFile(sourcePath);
    } catch (e) {
      await appendDropLog(drop.id, "warn", `Could not read source ${source.filePath}: ${e instanceof Error ? e.message : "unknown"}`);
      continue;
    }
    for (let t = 0; t < treatments.length; t += 1) {
      if (generated.length >= cap) break outer;
      const treatment = treatments[t];
      try {
        const { buffer, width, height } = await applyTreatment(sourceBuffer, treatment);
        const filename = safeFilename(treatment.label, t, s);
        const saved = await saveAssetFile(drop.id, "generated", filename, buffer);
        const asset: MediaAsset = {
          id: newAssetId(),
          kind: "lifestyle_image",
          source: "user_upload",
          filePath: saved.relativePath,
          prompt: `Source ${source.filePath} → ${treatment.label} (${treatment.aspectRatio.w}:${treatment.aspectRatio.h})`,
          width,
          height,
          createdAt: new Date().toISOString()
        };
        await addAssetToDrop(drop.id, asset);
        generated.push(asset);
        await appendDropLog(drop.id, "info", `Generated variant ${generated.length}: ${treatment.label} from source ${s + 1}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "unknown";
        await appendDropLog(drop.id, "error", `Variant generation failed for ${treatment.label}: ${msg}`);
      }
    }
  }
  return generated;
}
