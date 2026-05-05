import "server-only";

import {
  appendDropLog,
  patchDrop,
  readDrop,
  setDropStatus
} from "@/lib/content-studio/storage";
import { generateLifestyleImages, DEFAULT_LIFESTYLE_SCENARIOS } from "@/lib/content-studio/image-pipeline";
import { generateModelShots, BV_DEFAULT_MODEL_SCENARIOS } from "@/lib/content-studio/model-pipeline";
import { generateProductVideos, DEFAULT_VIDEO_SCENES, videoProviderStatus } from "@/lib/content-studio/video-pipeline";
import { generatePlatformPosts } from "@/lib/content-studio/copy-pipeline";
import {
  DEFAULT_PLATFORM_MIX,
  type ContentDrop,
  type Platform
} from "@/lib/content-studio/types";
import { withSpendKind } from "@/lib/spend-tracker";

// Orchestrator — runs the full content drop generation pipeline.
//
// Sequence:
//   1. Lifestyle image generation (gpt-image-1 image edits, preserves the source product)
//   2. Video generation (Runway/Luma image-to-video, env-gated)
//   3. Platform-specific caption generation (Claude per platform per planned post)
//   4. Status flip to "ready"
//
// Designed to be safe to re-run — each pipeline appends rather than replaces,
// so a partial run can be retried.

export type GenerateOptions = {
  lifestyleScenarios?: string[];
  videoScenes?: string[];
  targetPlatforms?: Platform[];
  // Generate AI model shots (people wearing the brand's product). Costs ~$0.05
  // per shot via gpt-image-1. Default true for Black Vault, false for brands
  // without a logo overlay configured.
  generateModelShots?: boolean;
  // Caps to keep cost predictable during testing
  maxLifestyleImages?: number;
  maxModelShots?: number;
  maxVideos?: number;
};

export async function generateContentDrop(
  dropId: string,
  options: GenerateOptions = {}
): Promise<ContentDrop | null> {
  return withSpendKind("content_studio", () => generateContentDropInner(dropId, options));
}

async function generateContentDropInner(
  dropId: string,
  options: GenerateOptions = {}
): Promise<ContentDrop | null> {
  const drop = await readDrop(dropId);
  if (!drop) return null;

  const lifestyle = options.lifestyleScenarios ?? DEFAULT_LIFESTYLE_SCENARIOS;
  const videos = options.videoScenes ?? DEFAULT_VIDEO_SCENES;
  const platforms = options.targetPlatforms ?? DEFAULT_PLATFORM_MIX;

  await setDropStatus(dropId, "generating");
  await patchDrop(dropId, {
    generationPlan: {
      lifestyleScenarios: lifestyle,
      videoScenes: videos,
      targetPlatforms: platforms
    }
  });
  await appendDropLog(dropId, "info", `Generation started: ${lifestyle.length} lifestyle, ${videos.length} videos, ${platforms.length} platforms`);

  // Phase 1: lifestyle variants from the user's source photos (crops + treatments).
  // These are deterministic — sharp transforms only, no AI for product imagery.
  await appendDropLog(dropId, "info", "Phase 1: lifestyle variants from source photos");
  const refreshed = await readDrop(dropId);
  if (refreshed) {
    await generateLifestyleImages(refreshed, lifestyle, {
      productContext: refreshed.productContext?.description,
      maxImages: options.maxLifestyleImages
    });
  }

  // Phase 2: AI model shots — appealing people wearing a generic-looking
  // version of the product, with the real brand monogram composited on top.
  // Default-on for any brand with a logo overlay configured. Skipped for
  // brands without one (e.g. LockLayer doesn't sell apparel).
  const wantModels = options.generateModelShots !== false;
  await appendDropLog(
    dropId,
    "info",
    `Phase 2: AI model shots (${wantModels ? "enabled" : "disabled"})`
  );
  if (wantModels) {
    const refreshedModels = await readDrop(dropId);
    if (refreshedModels) {
      await generateModelShots(refreshedModels, BV_DEFAULT_MODEL_SCENARIOS, {
        maxShots: options.maxModelShots
      });
    }
  }

  // Phase 3: videos (image-to-video on the user's source photos via Runway/Luma)
  const status = videoProviderStatus();
  await appendDropLog(dropId, "info", `Phase 3: video generation (${status.reason})`);
  if (status.provider !== "skip") {
    const refreshed2 = await readDrop(dropId);
    if (refreshed2) {
      await generateProductVideos(refreshed2, videos, { maxVideos: options.maxVideos });
    }
  }

  // Phase 4: platform captions
  await appendDropLog(dropId, "info", "Phase 4: platform caption generation");
  const refreshed3 = await readDrop(dropId);
  if (refreshed3) {
    await generatePlatformPosts(refreshed3, platforms);
  }

  await setDropStatus(dropId, "ready");
  await appendDropLog(dropId, "info", "Drop ready");
  return readDrop(dropId);
}
