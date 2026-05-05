import "server-only";

import { mkdir, readFile, writeFile, readdir, access } from "node:fs/promises";
import path from "node:path";

import type { ContentDrop, ContentDropStatus, MediaAsset, PlatformPost } from "@/lib/content-studio/types";

// All content-studio state lives under .openclaw/operator/content-studio/<dropId>/.
// Drop manifest at <dropId>/drop.json. Source photos under sources/. Generated
// images under generated/. Videos under videos/. Copy is embedded in posts[]
// inside the manifest — no separate file.

const ROOT = path.join(process.cwd(), ".openclaw", "operator", "content-studio");

function dropDir(dropId: string) {
  return path.join(ROOT, dropId);
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureContentStudioRoot() {
  await mkdir(ROOT, { recursive: true });
}

function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

export function newDropId(): string {
  return newId("drop");
}

export function newAssetId(): string {
  return newId("asset");
}

export function newPostId(): string {
  return newId("post");
}

// ── Drop manifest ─────────────────────────────────────────────────────────

export async function createDrop(input: {
  productTitle: string;
  brandSlug: string;
  productId?: number;
  productHandle?: string;
}): Promise<ContentDrop> {
  await ensureContentStudioRoot();
  const id = newDropId();
  const dir = dropDir(id);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "sources"), { recursive: true });
  await mkdir(path.join(dir, "generated"), { recursive: true });
  await mkdir(path.join(dir, "videos"), { recursive: true });

  const now = new Date().toISOString();
  const drop: ContentDrop = {
    id,
    productId: input.productId,
    productHandle: input.productHandle,
    productTitle: input.productTitle,
    brandSlug: input.brandSlug,
    status: "draft",
    assets: [],
    posts: [],
    createdAt: now,
    updatedAt: now,
    log: [{ ts: now, level: "info", message: `Drop created for "${input.productTitle}"` }]
  };
  await saveDrop(drop);
  return drop;
}

export async function saveDrop(drop: ContentDrop): Promise<void> {
  const manifest = path.join(dropDir(drop.id), "drop.json");
  drop.updatedAt = new Date().toISOString();
  await writeFile(manifest, JSON.stringify(drop, null, 2), "utf8");
}

export async function readDrop(id: string): Promise<ContentDrop | null> {
  const manifest = path.join(dropDir(id), "drop.json");
  if (!(await fileExists(manifest))) return null;
  return JSON.parse(await readFile(manifest, "utf8")) as ContentDrop;
}

export async function listDrops(): Promise<ContentDrop[]> {
  await ensureContentStudioRoot();
  const dirs = await readdir(ROOT).catch(() => [] as string[]);
  const drops: ContentDrop[] = [];
  for (const d of dirs) {
    const drop = await readDrop(d);
    if (drop) drops.push(drop);
  }
  return drops.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function patchDrop(
  id: string,
  patch: Partial<Omit<ContentDrop, "id" | "createdAt" | "updatedAt">>
): Promise<ContentDrop | null> {
  const current = await readDrop(id);
  if (!current) return null;
  const updated: ContentDrop = { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  await saveDrop(updated);
  return updated;
}

export async function setDropStatus(id: string, status: ContentDropStatus): Promise<void> {
  await patchDrop(id, { status });
}

export async function appendDropLog(
  id: string,
  level: "info" | "warn" | "error",
  message: string
): Promise<void> {
  const drop = await readDrop(id);
  if (!drop) return;
  drop.log.push({ ts: new Date().toISOString(), level, message });
  await saveDrop(drop);
}

// ── Asset I/O ─────────────────────────────────────────────────────────────

// Save a buffer as an asset under the drop. Returns the relative path stored
// in MediaAsset.filePath. Caller is responsible for adding the MediaAsset to
// the drop manifest.
export async function saveAssetFile(
  dropId: string,
  subdir: "sources" | "generated" | "videos",
  filename: string,
  buffer: Buffer
): Promise<{ relativePath: string; absolutePath: string }> {
  const dir = path.join(dropDir(dropId), subdir);
  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, filename);
  await writeFile(absolutePath, buffer);
  return {
    relativePath: path.join(subdir, filename),
    absolutePath
  };
}

export async function addAssetToDrop(dropId: string, asset: MediaAsset): Promise<void> {
  const drop = await readDrop(dropId);
  if (!drop) return;
  drop.assets.push(asset);
  await saveDrop(drop);
}

export async function addPostToDrop(dropId: string, post: PlatformPost): Promise<void> {
  const drop = await readDrop(dropId);
  if (!drop) return;
  drop.posts.push(post);
  await saveDrop(drop);
}

// Return the absolute filesystem path for an asset's relative path. Used by
// the API + UI to serve assets back to the user.
export function resolveAssetPath(dropId: string, relativePath: string): string {
  return path.join(dropDir(dropId), relativePath);
}

// Mark a post as posted. Used when the user copies content out and posts manually.
export async function markPostPosted(dropId: string, postId: string): Promise<void> {
  const drop = await readDrop(dropId);
  if (!drop) return;
  drop.posts = drop.posts.map((p) =>
    p.id === postId ? { ...p, posted: true, postedAt: new Date().toISOString() } : p
  );
  // If every post is marked posted, flip the drop status.
  if (drop.posts.every((p) => p.posted)) {
    drop.status = "posted";
  }
  await saveDrop(drop);
}
