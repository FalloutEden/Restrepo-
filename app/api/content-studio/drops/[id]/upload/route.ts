import { NextResponse } from "next/server";

import {
  addAssetToDrop,
  newAssetId,
  readDrop,
  saveAssetFile
} from "@/lib/content-studio/storage";
import type { MediaAsset } from "@/lib/content-studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Image uploads can be a few MB; raise the body limit.
export const maxDuration = 60;

function inferExt(mime: string, fallbackName: string): string {
  if (/png/.test(mime)) return "png";
  if (/jpe?g/.test(mime)) return "jpg";
  if (/webp/.test(mime)) return "webp";
  if (/gif/.test(mime)) return "gif";
  const dot = fallbackName.lastIndexOf(".");
  return dot > 0 ? fallbackName.slice(dot + 1).toLowerCase() : "bin";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drop = await readDrop(id);
  if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const files = formData.getAll("files");
  if (files.length === 0) return NextResponse.json({ error: "No files in request" }, { status: 400 });

  const saved: MediaAsset[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = inferExt(file.type, file.name);
    const filename = `source-${Date.now()}-${i}.${ext}`;
    const result = await saveAssetFile(id, "sources", filename, buffer);
    const asset: MediaAsset = {
      id: newAssetId(),
      kind: "source_photo",
      source: "user_upload",
      filePath: result.relativePath,
      createdAt: new Date().toISOString()
    };
    await addAssetToDrop(id, asset);
    saved.push(asset);
  }
  return NextResponse.json({ uploaded: saved });
}
