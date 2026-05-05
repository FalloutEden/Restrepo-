import "server-only";

import { readFile } from "node:fs/promises";

import {
  addAssetToDrop,
  appendDropLog,
  newAssetId,
  resolveAssetPath,
  saveAssetFile
} from "@/lib/content-studio/storage";
import type { ContentDrop, MediaAsset, AssetSource } from "@/lib/content-studio/types";

// Video pipeline — image-to-video via Runway Gen-3 or Luma Dream Machine.
// Both are env-gated; if neither key is set, the pipeline logs a warning and
// skips silently. Each scene becomes one short clip (5–10s typical).
//
// Provider precedence: Runway → Luma → skip. Caller can force a provider via
// the env var CONTENT_STUDIO_VIDEO_PROVIDER ("runway" | "luma" | "auto").

type Provider = "runway" | "luma" | "skip";

function pickProvider(): Provider {
  const forced = (process.env.CONTENT_STUDIO_VIDEO_PROVIDER ?? "auto").toLowerCase();
  if (forced === "runway") return "runway";
  if (forced === "luma") return "luma";
  if (process.env.RUNWAY_API_KEY?.trim()) return "runway";
  if (process.env.LUMA_API_KEY?.trim()) return "luma";
  return "skip";
}

function safeFilename(scene: string, idx: number, ext: string): string {
  const slug = scene
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `video-${idx}-${slug || "scene"}.${ext}`;
}

// ── Runway Gen-3 ────────────────────────────────────────────────────────────
// Docs: https://docs.dev.runwayml.com/api/
// Endpoint: POST https://api.dev.runwayml.com/v1/image_to_video
// Auth: Authorization: Bearer <RUNWAY_API_KEY>; X-Runway-Version: 2024-11-06
// Async: returns a task id, poll GET /v1/tasks/{id} until status="SUCCEEDED",
// then download from output[0].

const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_API_VERSION = "2024-11-06";

type RunwayCreateResponse = {
  id: string;
};

type RunwayTaskResponse = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?: string[];
  failure?: string;
};

async function runwayCreate(token: string, imageDataUrl: string, promptText: string): Promise<RunwayCreateResponse> {
  const r = await fetch(`${RUNWAY_API_BASE}/v1/image_to_video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Runway-Version": RUNWAY_API_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gen3a_turbo",
      promptImage: imageDataUrl,
      promptText,
      duration: 5,
      ratio: "1280:768"
    })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Runway create failed (${r.status}): ${text}`);
  return JSON.parse(text) as RunwayCreateResponse;
}

async function runwayPoll(token: string, taskId: string): Promise<RunwayTaskResponse> {
  const r = await fetch(`${RUNWAY_API_BASE}/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Runway-Version": RUNWAY_API_VERSION
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Runway poll failed (${r.status}): ${text}`);
  return JSON.parse(text) as RunwayTaskResponse;
}

async function runwayImageToVideo(referenceBuffer: Buffer, scenePrompt: string): Promise<Buffer | null> {
  const token = process.env.RUNWAY_API_KEY?.trim();
  if (!token) throw new Error("RUNWAY_API_KEY missing");

  // Runway accepts an image as a data URL or a public URL. Local files need to
  // be base64 data URLs.
  const imageDataUrl = `data:image/png;base64,${referenceBuffer.toString("base64")}`;
  const create = await runwayCreate(token, imageDataUrl, scenePrompt);

  // Poll up to 5 minutes (the typical Gen-3 turbo render is ~30-90 seconds)
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const task = await runwayPoll(token, create.id);
    if (task.status === "SUCCEEDED") {
      const url = task.output?.[0];
      if (!url) return null;
      const dl = await fetch(url);
      if (!dl.ok) throw new Error(`Runway output download failed (${dl.status})`);
      return Buffer.from(await dl.arrayBuffer());
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      throw new Error(`Runway task ${task.status}: ${task.failure ?? "unknown"}`);
    }
  }
  throw new Error("Runway task polling timed out");
}

// ── Luma Dream Machine ─────────────────────────────────────────────────────
// Docs: https://docs.lumalabs.ai/docs/api
// Endpoint: POST https://api.lumalabs.ai/dream-machine/v1/generations
// Auth: Authorization: Bearer <LUMA_API_KEY>
// Async: poll GET /generations/{id} until state="completed".

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";

type LumaGenerationResponse = {
  id: string;
  state: "queued" | "dreaming" | "completed" | "failed";
  failure_reason?: string;
  assets?: { video?: string };
};

async function lumaImageToVideo(referenceBuffer: Buffer, scenePrompt: string): Promise<Buffer | null> {
  const token = process.env.LUMA_API_KEY?.trim();
  if (!token) throw new Error("LUMA_API_KEY missing");

  // Luma needs a public image URL OR a base64 data URL. Use base64.
  const imageDataUrl = `data:image/png;base64,${referenceBuffer.toString("base64")}`;

  const create = await fetch(`${LUMA_API_BASE}/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: scenePrompt,
      keyframes: { frame0: { type: "image", url: imageDataUrl } },
      aspect_ratio: "16:9",
      loop: false
    })
  });
  if (!create.ok) throw new Error(`Luma create failed (${create.status}): ${await create.text()}`);
  const created = (await create.json()) as LumaGenerationResponse;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${LUMA_API_BASE}/generations/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!poll.ok) continue;
    const status = (await poll.json()) as LumaGenerationResponse;
    if (status.state === "completed") {
      const url = status.assets?.video;
      if (!url) return null;
      const dl = await fetch(url);
      if (!dl.ok) throw new Error(`Luma output download failed (${dl.status})`);
      return Buffer.from(await dl.arrayBuffer());
    }
    if (status.state === "failed") {
      throw new Error(`Luma task failed: ${status.failure_reason ?? "unknown"}`);
    }
  }
  throw new Error("Luma generation polling timed out");
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function generateProductVideos(
  drop: ContentDrop,
  scenes: string[],
  options: { maxVideos?: number } = {}
): Promise<MediaAsset[]> {
  const provider = pickProvider();
  if (provider === "skip") {
    await appendDropLog(
      drop.id,
      "warn",
      "Video generation skipped — neither RUNWAY_API_KEY nor LUMA_API_KEY is configured. Set one to enable image-to-video."
    );
    return [];
  }

  const sourcePhotos = drop.assets.filter((a) => a.kind === "source_photo");
  if (sourcePhotos.length === 0) {
    await appendDropLog(drop.id, "warn", "No source photos — skipping video generation");
    return [];
  }

  const reference = sourcePhotos[0];
  const referencePath = resolveAssetPath(drop.id, reference.filePath);
  const referenceBuffer = await readFile(referencePath);

  const cap = options.maxVideos ?? scenes.length;
  const limited = scenes.slice(0, cap);

  const generated: MediaAsset[] = [];
  for (let i = 0; i < limited.length; i += 1) {
    const scene = limited[i];
    try {
      let buffer: Buffer | null = null;
      let assetSource: AssetSource;
      if (provider === "runway") {
        buffer = await runwayImageToVideo(referenceBuffer, scene);
        assetSource = "runway";
      } else {
        buffer = await lumaImageToVideo(referenceBuffer, scene);
        assetSource = "luma";
      }
      if (!buffer) {
        await appendDropLog(drop.id, "warn", `Video provider returned no output for scene "${scene}"`);
        continue;
      }
      const ext = provider === "runway" ? "mp4" : "mp4";
      const filename = safeFilename(scene, i, ext);
      const saved = await saveAssetFile(drop.id, "videos", filename, buffer);
      const asset: MediaAsset = {
        id: newAssetId(),
        kind: "video",
        source: assetSource,
        filePath: saved.relativePath,
        prompt: scene,
        durationSec: 5,
        createdAt: new Date().toISOString()
      };
      await addAssetToDrop(drop.id, asset);
      generated.push(asset);
      await appendDropLog(drop.id, "info", `Generated video ${i + 1}/${limited.length} via ${provider}: "${scene}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      await appendDropLog(drop.id, "error", `Video generation failed for "${scene}": ${msg}`);
    }
  }
  return generated;
}

// Default scene prompts for a premium apparel brand. Each is short and
// physics-friendly — image-to-video models work best with subtle, plausible
// motion rather than complex action.
export const DEFAULT_VIDEO_SCENES = [
  "the garment slowly rotates 30 degrees as soft natural light shifts across the fabric, revealing the texture and weave",
  "camera dollies in slowly toward the embroidered chest detail, shallow depth of field, subtle parallax",
  "the garment lifts gently as if caught by a soft breeze, fabric drape and weight visible, premium editorial atmosphere"
];

export function videoProviderStatus(): { provider: Provider; reason: string } {
  const provider = pickProvider();
  if (provider === "skip") {
    return {
      provider,
      reason: "Set RUNWAY_API_KEY or LUMA_API_KEY in .env.local to enable video generation."
    };
  }
  return { provider, reason: `Active provider: ${provider}` };
}
