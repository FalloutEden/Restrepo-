import "server-only";

import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { resolveOpenAIClient, IMAGE_MODEL } from "@/lib/openai";
import type { TenantContext } from "@/lib/tenant-context";
import {
  addAssetToDrop,
  appendDropLog,
  newAssetId,
  saveAssetFile
} from "@/lib/content-studio/storage";
import { getOverlayConfig, type LogoOverlayConfig } from "@/lib/content-studio/brand-overlays";
import type { ContentDrop, MediaAsset } from "@/lib/content-studio/types";

// ── Model pipeline — AI-generated models wearing the brand's product ─────
//
// Generates appealing AI model imagery for content. Each scenario describes a
// model + scene + crop framing; gpt-image-1 produces the image; sharp
// composites the brand's real monogram onto the chest. The result is
// "lifestyle/mood" content suitable for IG/TikTok feed, not a literal
// representation of the user's exact product.
//
// Limitations (document these to the user, don't hide them):
//  1. The composite uses a fixed chest position per scenario. AI poses vary,
//     so ~20-30% of generations will land the logo slightly off-chest. User
//     can re-roll bad ones.
//  2. AI models can have anatomy issues (hands, fingers, faces). Always
//     review before posting.
//  3. For production-quality model shots, a virtual try-on API
//     (Vmodel.ai / Botika / Drape.ai) is the right answer. Their service
//     takes the real product image + AI model and produces a much higher
//     fidelity result. Wire in when budget allows ($0.20-0.50 per image).

export type ModelScenario = {
  id: string;
  // The prompt fed to gpt-image-1. Should describe model attributes + scene
  // + framing without using any branding language (no "logo", no "brand").
  prompt: string;
  // Where to composite the chest monogram for this pose. All in % of canvas.
  chestPosition: { leftPct: number; topPct: number; widthPct: number };
};

// Default model scenarios for Black Vault Apparel. Tuned for appeal:
// fit/athletic builds, tattoos, considered features. Models are described
// but not over-detailed — gpt-image-1 produces better results when given
// emotional/tonal direction rather than every physical specification.
export const BV_DEFAULT_MODEL_SCENARIOS: ModelScenario[] = [
  {
    id: "athletic-tattooed-front",
    prompt: [
      "Editorial fashion photograph, chest-up portrait of an athletic late-30s man in a solid charcoal-black short-sleeve premium cotton knit polo with smooth uninterrupted fabric across the chest.",
      "Strong jawline, well-groomed dark beard, sleeve tattoos visible on the forearm, calm confident expression looking just past the camera.",
      "Soft warm directional light from upper-left, late-afternoon golden-hour quality, against a warm neutral concrete or weathered plaster wall.",
      "Quiet luxury aesthetic — Aimé Leon Dore / Buck Mason / Brunello Cucinelli editorial energy. Considered, restrained, premium.",
      "Centered composition, subject's chest fills the lower half of the frame, clear unobstructed view of the chest area.",
      "No watermarks, no extra text, no other clothing or accessories beyond the polo, no jewelry larger than a discreet wrist piece, no patterned background."
    ].join(" "),
    chestPosition: { leftPct: 52, topPct: 60, widthPct: 8 }
  },
  {
    id: "creative-considered-coffee",
    prompt: [
      "Editorial fashion photograph, three-quarter portrait of a 30-something creative-professional man wearing a solid pure-white short-sleeve premium cotton knit polo with smooth uninterrupted fabric.",
      "Considered features, light stubble, wire-frame glasses, small minimal tattoo just visible at the side of the neck or upper forearm.",
      "Sitting at a marble cafe table holding a small espresso cup, indirect afternoon window light, blurred sophisticated cafe interior in the background.",
      "James Perse / Mr Porter editorial style — relaxed, unhurried, premium. The polo is the focal piece.",
      "Composition: subject occupies left two-thirds of frame, chest area clearly visible and oriented toward camera.",
      "No watermarks, no extra text, no patterns or graphics on the polo."
    ].join(" "),
    chestPosition: { leftPct: 32, topPct: 42, widthPct: 7 }
  },
  {
    id: "rooftop-golden-hour",
    prompt: [
      "Editorial fashion photograph, half-body shot of a 30s woman with shoulder-length tousled hair, considered features, a small fine-line tattoo visible on the inside of the wrist, wearing a solid pure-white relaxed-fit short-sleeve premium cotton knit polo with smooth uninterrupted fabric.",
      "Confident relaxed posture, slight half-smile, looking off-camera. Hand resting near chin or holding a glass of water.",
      "Golden-hour rooftop setting, soft warm sunset glow, blurred city skyline behind. Premium urban lifestyle aesthetic.",
      "Reformation / Vince / Madewell editorial — quietly luxurious, considered, sun-warmed.",
      "Composition: subject centered, chest area clearly visible and oriented toward camera.",
      "No watermarks, no extra text, no patterns or graphics on the polo."
    ].join(" "),
    chestPosition: { leftPct: 48, topPct: 50, widthPct: 7 }
  },
  {
    id: "studio-portrait-fit",
    prompt: [
      "Editorial fashion photograph, chest-and-shoulders portrait of a fit early-30s man wearing a solid heather-grey short-sleeve premium cotton knit polo with smooth uninterrupted fabric across the chest.",
      "Athletic build, clean-shaven, short modern haircut, half-sleeve tattoo visible on the upper arm, confident neutral expression directly engaging the camera.",
      "Studio lighting — soft key from upper-left, controlled fill, mid-grey seamless backdrop. Premium catalog energy without being sterile.",
      "Cuts Clothing / Buck Mason flagship-store catalog aesthetic.",
      "Centered composition, subject's chest fills the center of the frame, clear unobstructed view of the chest area.",
      "No watermarks, no extra text, no jewelry, no other clothing visible."
    ].join(" "),
    chestPosition: { leftPct: 52, topPct: 58, widthPct: 9 }
  }
];

// Composite the real brand monogram onto a model image at the scenario's
// chest position. Reuses the same composite mechanics as the lifestyle
// pipeline but lets each scenario specify its own chest coordinates because
// model poses vary.
async function compositeMonogramOnModel(
  generatedBuffer: Buffer,
  config: LogoOverlayConfig,
  chest: { leftPct: number; topPct: number; widthPct: number }
): Promise<Buffer> {
  const logoBuffer = await readFile(config.logoPath);
  const baseMeta = await sharp(generatedBuffer).metadata();
  const baseWidth = baseMeta.width ?? 1024;
  const baseHeight = baseMeta.height ?? 1024;

  const logoWidth = Math.max(40, Math.round((chest.widthPct / 100) * baseWidth));
  const left = Math.round((chest.leftPct / 100) * baseWidth);
  const top = Math.round((chest.topPct / 100) * baseHeight);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth, null, { fit: "inside", withoutEnlargement: false })
    .toBuffer();

  return sharp(generatedBuffer)
    .composite([{ input: resizedLogo, left, top }])
    .png()
    .toBuffer();
}

function safeFilename(scenarioId: string, idx: number): string {
  const slug = scenarioId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `model-${idx}-${slug || "shot"}.png`;
}

// Generate one model image per scenario. Returns the saved MediaAssets.
export async function generateModelShots(
  drop: ContentDrop,
  scenarios: ModelScenario[] = BV_DEFAULT_MODEL_SCENARIOS,
  options: { maxShots?: number; applyMonogramComposite?: boolean } = {},
  tenantCtx?: TenantContext
): Promise<MediaAsset[]> {
  const cap = options.maxShots ?? scenarios.length;
  const limited = scenarios.slice(0, cap);
  const overlayConfig = getOverlayConfig(drop.brandSlug);
  const applyComposite = options.applyMonogramComposite !== false && !!overlayConfig;

  const generated: MediaAsset[] = [];
  for (let i = 0; i < limited.length; i += 1) {
    const scenario = limited[i];
    try {
      const response = await resolveOpenAIClient(tenantCtx).images.generate({
        model: IMAGE_MODEL,
        prompt: scenario.prompt.slice(0, 4000),
        n: 1,
        size: "1024x1024"
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        await appendDropLog(drop.id, "warn", `Model gen returned no data for scenario "${scenario.id}"`);
        continue;
      }
      let buffer = Buffer.from(b64, "base64");

      if (applyComposite && overlayConfig) {
        try {
          buffer = Buffer.from(await compositeMonogramOnModel(buffer, overlayConfig, scenario.chestPosition));
          await appendDropLog(drop.id, "info", `Composited monogram on model shot ${i + 1}`);
        } catch (overlayErr) {
          await appendDropLog(
            drop.id,
            "warn",
            `Monogram composite failed on model ${i + 1}: ${overlayErr instanceof Error ? overlayErr.message : "unknown"}`
          );
        }
      }

      const filename = safeFilename(scenario.id, i);
      const saved = await saveAssetFile(drop.id, "generated", filename, buffer);

      const asset: MediaAsset = {
        id: newAssetId(),
        kind: "lifestyle_image",
        source: "gpt_image_1",
        filePath: saved.relativePath,
        prompt: scenario.prompt,
        width: 1024,
        height: 1024,
        createdAt: new Date().toISOString()
      };
      await addAssetToDrop(drop.id, asset);
      generated.push(asset);
      await appendDropLog(drop.id, "info", `Generated model shot ${i + 1}/${limited.length}: ${scenario.id}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      await appendDropLog(drop.id, "error", `Model shot generation failed for ${scenario.id}: ${msg}`);
    }
  }
  return generated;
}
