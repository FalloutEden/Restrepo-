// Content Studio types — the AI content factory layer.
//
// Workflow: user uploads phone photos of a real product → orchestrator runs
// the photos through image enhancement, video generation, and platform-
// specific copy generation → output is a ContentDrop, a structured bundle
// of platform-ready posts the user can download or schedule.
//
// All file storage happens under .openclaw/operator/content-studio/<dropId>/.

export type Platform =
  | "instagram_post"
  | "instagram_reel"
  | "instagram_story"
  | "tiktok"
  | "youtube_short"
  | "pinterest"
  | "twitter"
  | "facebook"
  | "linkedin";

export type AssetKind =
  | "source_photo" // user-uploaded
  | "lifestyle_image" // gpt-image-1 generated context shot
  | "detail_image" // crop/zoom of source
  | "video"; // runway/luma/etc generated

export type AssetSource = "user_upload" | "gpt_image_1" | "runway" | "luma" | "veo" | "stub";

export type MediaAsset = {
  id: string;
  kind: AssetKind;
  source: AssetSource;
  filePath: string; // relative path from drop root
  // Original prompt for AI-generated assets, scene description for source photos
  prompt?: string;
  // Width/height when known
  width?: number;
  height?: number;
  // For videos: duration in seconds
  durationSec?: number;
  createdAt: string;
};

export type PlatformPost = {
  id: string;
  platform: Platform;
  // Which assets this post uses (asset IDs from MediaAsset list)
  assetIds: string[];
  // Platform-formatted caption
  caption: string;
  hashtags: string[];
  // Suggested posting time (ISO) — operator can use for scheduling later
  suggestedSchedule?: string;
  // True if user has marked this post as published
  posted: boolean;
  postedAt?: string;
  // Notes — anything the operator wants the user to know
  notes?: string;
};

export type ContentDropStatus = "draft" | "generating" | "ready" | "posted" | "archived";

export type ContentDrop = {
  id: string;
  productId?: number; // shopify product id, optional (could be product-agnostic)
  productHandle?: string;
  productTitle: string;
  brandSlug: string;
  status: ContentDropStatus;
  assets: MediaAsset[];
  posts: PlatformPost[];
  createdAt: string;
  updatedAt: string;
  // The product context fed into copy generation
  productContext?: {
    description?: string;
    fabric?: string;
    fit?: string;
    priceUsd?: number;
    keyDetails?: string[];
  };
  // Generation manifest — what the operator decided to generate
  generationPlan?: {
    lifestyleScenarios: string[];
    videoScenes: string[];
    targetPlatforms: Platform[];
  };
  // Logs for debugging
  log: Array<{ ts: string; level: "info" | "warn" | "error"; message: string }>;
};

// ── Platform spec ─────────────────────────────────────────────────────────
// Format constraints + caption-writing guidance per platform. Used by the
// copy pipeline to generate platform-native content.

export type PlatformSpec = {
  platform: Platform;
  label: string;
  // Max caption length (or 0 for unlimited)
  maxCaptionLength: number;
  // Recommended hashtag count
  recommendedHashtags: number;
  // Aspect ratio guidance (image)
  aspectRatio: string;
  // Caption tone guidance — fed into the Claude prompt
  toneGuidance: string;
  // Posting cadence suggestion (per drop, how many of this platform to generate)
  defaultCount: number;
};

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  instagram_post: {
    platform: "instagram_post",
    label: "Instagram Feed Post",
    maxCaptionLength: 2200,
    recommendedHashtags: 8,
    aspectRatio: "1:1 or 4:5",
    toneGuidance:
      "Editorial, considered. Lead with the strongest visual hook in the first sentence (only the first 125 characters show before 'more'). No emoji-spam. 1-2 emoji max if any. Treat the caption like a magazine cutline.",
    defaultCount: 3
  },
  instagram_reel: {
    platform: "instagram_reel",
    label: "Instagram Reel",
    maxCaptionLength: 2200,
    recommendedHashtags: 5,
    aspectRatio: "9:16 vertical",
    toneGuidance:
      "Short, hooky. First 3 seconds matter most. Caption should complement, not duplicate, the video. Provide a 1-line hook + 1-line value/story.",
    defaultCount: 2
  },
  instagram_story: {
    platform: "instagram_story",
    label: "Instagram Story",
    maxCaptionLength: 0,
    recommendedHashtags: 0,
    aspectRatio: "9:16 vertical",
    toneGuidance:
      "Conversational, behind-the-scenes. Story copy is short — 1 sentence overlay max. Suggest 3-5 frames with brief on-image text per frame.",
    defaultCount: 1
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    maxCaptionLength: 2200,
    recommendedHashtags: 5,
    aspectRatio: "9:16 vertical",
    toneGuidance:
      "Native TikTok energy — direct, real, slightly informal. The hook drives everything. Avoid overly polished brand-speak. Caption should drive comments (open with a question or POV).",
    defaultCount: 2
  },
  youtube_short: {
    platform: "youtube_short",
    label: "YouTube Short",
    maxCaptionLength: 100,
    recommendedHashtags: 3,
    aspectRatio: "9:16 vertical",
    toneGuidance:
      "YouTube favors descriptive, SEO-friendly titles. Include category keywords (premium polo, heavyweight cotton, etc.) in the first sentence.",
    defaultCount: 2
  },
  pinterest: {
    platform: "pinterest",
    label: "Pinterest Pin",
    maxCaptionLength: 500,
    recommendedHashtags: 0,
    aspectRatio: "2:3 vertical",
    toneGuidance:
      "Pinterest is search-driven. Caption should be keyword-rich and descriptive: fabric, color, fit, occasion, style category. Think SEO-for-images. NO hashtags (Pinterest deprioritizes them).",
    defaultCount: 5
  },
  twitter: {
    platform: "twitter",
    label: "X / Twitter",
    maxCaptionLength: 280,
    recommendedHashtags: 1,
    aspectRatio: "16:9 or 1:1",
    toneGuidance:
      "Punchy, voice-driven. Premium brands on X work via single-tweet observations or short founder POVs. No corporate fluff. Lead with the detail (fabric, construction, design choice).",
    defaultCount: 3
  },
  facebook: {
    platform: "facebook",
    label: "Facebook Post",
    maxCaptionLength: 63206,
    recommendedHashtags: 2,
    aspectRatio: "1:1 or 4:5",
    toneGuidance:
      "Slightly more conversational than IG. Facebook favors longer-form storytelling. 2-4 sentences ideal. Friendly without being saccharine.",
    defaultCount: 1
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    maxCaptionLength: 3000,
    recommendedHashtags: 3,
    aspectRatio: "1:1 or 1.91:1",
    toneGuidance:
      "Founder POV, building-in-public flavor. Talk about the brand journey, supplier choice, design decisions. Less product-pushy, more behind-the-business.",
    defaultCount: 1
  }
};

export const ALL_PLATFORMS: Platform[] = Object.keys(PLATFORM_SPECS) as Platform[];

// Default platform mix for a content drop — covers the channels with highest
// organic leverage for a premium DTC apparel brand. LinkedIn is opt-in.
export const DEFAULT_PLATFORM_MIX: Platform[] = [
  "instagram_post",
  "instagram_reel",
  "tiktok",
  "pinterest",
  "twitter"
];
