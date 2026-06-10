import "server-only";

import { claudeForTenant } from "@/lib/claude";
import { withClaudeRetry } from "@/lib/claude-retry";
import type { TenantContext } from "@/lib/tenant-context";
import { resolveBrand } from "@/lib/brands";
import {
  addPostToDrop,
  appendDropLog,
  newPostId
} from "@/lib/content-studio/storage";
import {
  PLATFORM_SPECS,
  type ContentDrop,
  type MediaAsset,
  type Platform,
  type PlatformPost
} from "@/lib/content-studio/types";

// Copy pipeline — generates platform-specific captions for each piece of
// content in a drop. Uses Claude (cheaper haiku-tier OK here, defaults to
// the operator model). One call per platform, returns N captions matching
// the platform's defaultCount.
//
// Asset-to-post mapping is platform-aware:
//   - instagram_post / facebook: each generated caption gets paired with one
//     lifestyle/source image (carousel uses 3-5 images per post)
//   - instagram_reel / tiktok / youtube_short: each caption pairs with one video
//   - pinterest: each caption pairs with one image (vertical preferred)
//   - twitter: each caption pairs with one image
//
// If no videos are available (provider skipped), reels/tiktok/youtube_short
// fall back to using a still image — the user can post it as a static-image
// reel or skip the platform.

const COPY_MODEL = process.env.CONTENT_STUDIO_COPY_MODEL?.trim() || "claude-opus-4-7";

// ── Per-platform planning ─────────────────────────────────────────────────

function selectAssetsForPlatform(platform: Platform, drop: ContentDrop): MediaAsset[][] {
  // Returns a list of asset groups — one group per planned post on the platform.
  const spec = PLATFORM_SPECS[platform];
  const sources = drop.assets.filter((a) => a.kind === "source_photo");
  const lifestyle = drop.assets.filter((a) => a.kind === "lifestyle_image");
  const videos = drop.assets.filter((a) => a.kind === "video");
  const allImages = [...sources, ...lifestyle];

  // Helper to chunk an array into N groups round-robin.
  const chunkIntoGroups = (arr: MediaAsset[], groups: number, perGroup: number): MediaAsset[][] => {
    if (arr.length === 0 || groups === 0) return [];
    const out: MediaAsset[][] = [];
    for (let g = 0; g < groups; g += 1) {
      const items: MediaAsset[] = [];
      for (let i = 0; i < perGroup; i += 1) {
        const idx = (g * perGroup + i) % arr.length;
        if (arr[idx]) items.push(arr[idx]);
      }
      if (items.length > 0) out.push(items);
    }
    return out;
  };

  switch (platform) {
    case "instagram_post":
    case "facebook":
      // Each post is a carousel of 3-5 images.
      return chunkIntoGroups(allImages, spec.defaultCount, 4);
    case "instagram_reel":
    case "tiktok":
    case "youtube_short": {
      // Pair each post with a video; fall back to still image if no videos.
      const hero = videos.length > 0 ? videos : allImages;
      return chunkIntoGroups(hero, spec.defaultCount, 1);
    }
    case "instagram_story":
      // 1 story sequence, uses 3-5 stills + first video if available
      return [[...allImages.slice(0, 4), ...videos.slice(0, 1)]];
    case "pinterest":
      // Each pin is one image. Spread across all available images.
      return chunkIntoGroups(allImages, spec.defaultCount, 1);
    case "twitter":
      return chunkIntoGroups(allImages, spec.defaultCount, 1);
    case "linkedin":
      return chunkIntoGroups(allImages, spec.defaultCount, 1);
    default:
      return [];
  }
}

// ── Prompt construction ───────────────────────────────────────────────────

function buildCopyPrompt(platform: Platform, drop: ContentDrop, postIndex: number, totalForPlatform: number): string {
  const spec = PLATFORM_SPECS[platform];
  const brand = resolveBrand(drop.brandSlug);
  const ctx = drop.productContext ?? {};

  return `You are writing one ${spec.label} caption for ${brand.name}.

## Brand voice
${brand.voice}

## Brand audience
${brand.audience}

## Product
- Title: ${drop.productTitle}
- Description: ${ctx.description ?? "(not provided — write generally on-brand for this title)"}
- Fabric: ${ctx.fabric ?? "(unspecified)"}
- Fit: ${ctx.fit ?? "(unspecified)"}
- Price: ${ctx.priceUsd ? `$${ctx.priceUsd}` : "(unspecified)"}
- Key details: ${ctx.keyDetails?.join(" | ") ?? "(none)"}

## Platform spec
- Platform: ${spec.label}
- Aspect ratio: ${spec.aspectRatio}
- Max caption length: ${spec.maxCaptionLength === 0 ? "no hard limit" : `${spec.maxCaptionLength} characters`}
- Recommended hashtag count: ${spec.recommendedHashtags}
- Tone guidance: ${spec.toneGuidance}

## This caption is post ${postIndex + 1} of ${totalForPlatform} for this platform in this drop.
Make this caption distinct from any other caption you'd write for the same platform — different angle, different opening line. Don't repeat the same phrasing across captions.

## Output strictly as JSON
\`\`\`json
{
  "caption": "the caption body, ready to paste",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "notes": "optional note to the user about this post (suggested time of day, A/B variant rationale, etc.) — short or empty"
}
\`\`\`

Do not include the hashtags in the caption body unless the platform style requires it (e.g., Twitter typically inlines, Instagram typically appends). Use your judgment. Return ONLY the JSON object.
`;
}

// ── Claude call + parsing ─────────────────────────────────────────────────

type ParsedCopy = {
  caption: string;
  hashtags: string[];
  notes?: string;
};

function parseCopy(raw: string): ParsedCopy {
  // Strip code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const obj = JSON.parse(cleaned) as Partial<ParsedCopy>;
    return {
      caption: typeof obj.caption === "string" ? obj.caption : "",
      hashtags: Array.isArray(obj.hashtags) ? obj.hashtags.filter((h): h is string => typeof h === "string") : [],
      notes: typeof obj.notes === "string" ? obj.notes : undefined
    };
  } catch {
    // Fallback: treat raw as caption
    return { caption: cleaned, hashtags: [] };
  }
}

async function generateOneCaption(
  platform: Platform,
  drop: ContentDrop,
  postIndex: number,
  total: number,
  tenantCtx: TenantContext
): Promise<ParsedCopy> {
  const prompt = buildCopyPrompt(platform, drop, postIndex, total);
  const response = await withClaudeRetry(
    () =>
      claudeForTenant(tenantCtx).messages.create({
        model: COPY_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      }),
    { label: `content-studio:${platform}` }
  );
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { caption: "", hashtags: [] };
  }
  return parseCopy(textBlock.text);
}

// ── Public API ────────────────────────────────────────────────────────────

export async function generatePlatformPosts(drop: ContentDrop, platforms: Platform[], tenantCtx: TenantContext): Promise<PlatformPost[]> {
  const created: PlatformPost[] = [];
  for (const platform of platforms) {
    const groups = selectAssetsForPlatform(platform, drop);
    if (groups.length === 0) {
      await appendDropLog(drop.id, "warn", `No assets available for ${platform}, skipping`);
      continue;
    }
    for (let i = 0; i < groups.length; i += 1) {
      try {
        const copy = await generateOneCaption(platform, drop, i, groups.length, tenantCtx);
        const post: PlatformPost = {
          id: newPostId(),
          platform,
          assetIds: groups[i].map((a) => a.id),
          caption: copy.caption,
          hashtags: copy.hashtags,
          posted: false,
          notes: copy.notes
        };
        await addPostToDrop(drop.id, post);
        created.push(post);
        await appendDropLog(drop.id, "info", `Generated ${platform} caption ${i + 1}/${groups.length}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "unknown";
        await appendDropLog(drop.id, "error", `Caption generation failed for ${platform} #${i + 1}: ${msg}`);
      }
    }
  }
  return created;
}
