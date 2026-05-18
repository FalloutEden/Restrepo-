import { NextResponse } from "next/server";

import {
  addAssetToDrop,
  assertValidId,
  newAssetId,
  readDrop,
  saveAssetFile
} from "@/lib/content-studio/storage";
import type { MediaAsset } from "@/lib/content-studio/types";
import { resolveTenantContext } from "@/lib/tenant-context";
import { runWithTenant } from "@/lib/tenant-als";

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

// Hard caps to prevent disk-fill / memory-blowup on hostile uploads.
const MAX_FILES_PER_REQUEST = 20;
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024; // 25 MB per file
const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = assertValidId(rawId, "drop");
  } catch {
    return NextResponse.json({ error: "Invalid drop id" }, { status: 400 });
  }

  // Parse multipart BEFORE wrapping the tenant scope. Parsing the body is
  // tenant-independent; the only thing that's tenant-scoped is filesystem I/O
  // against the drop directory. That keeps the AsyncLocalStorage scope tight
  // around the storage calls, which is the right granularity.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const files = formData.getAll("files");
  if (files.length === 0) return NextResponse.json({ error: "No files in request" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `Too many files: ${files.length} > ${MAX_FILES_PER_REQUEST}` }, { status: 400 });
  }

  const ctx = await resolveTenantContext(request);
  return runWithTenant(ctx.tenantId, async () => {
    const drop = await readDrop(id);
    if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });

    const saved: MediaAsset[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (!(file instanceof File)) continue;
      if (file.size > MAX_BYTES_PER_FILE) {
        return NextResponse.json({ error: `File too large: ${file.size} > ${MAX_BYTES_PER_FILE}` }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = inferExt(file.type, file.name);
      if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 });
      }
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
  });
}
