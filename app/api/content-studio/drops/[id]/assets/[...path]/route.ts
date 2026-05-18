import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { assertValidId, resolveAssetPath } from "@/lib/content-studio/storage";
import { resolveTenantContext } from "@/lib/tenant-context";
import { runWithTenant } from "@/lib/tenant-als";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime"
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id: rawId, path: pathSegments } = await params;
  let id: string;
  try { id = assertValidId(rawId, "drop"); }
  catch { return NextResponse.json({ error: "Invalid drop id" }, { status: 400 }); }
  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: "Missing asset path" }, { status: 400 });
  }
  // Sanitize — refuse traversal AND back-slashes (NTFS) AND null bytes.
  const joined = pathSegments.join("/");
  if (joined.includes("..") || joined.includes("\\") || joined.includes("\0")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const ctx = await resolveTenantContext(request);
  // resolveAssetPath reads the tenant root via AsyncLocalStorage, so wrap.
  const absolute = await runWithTenant(ctx.tenantId, () => resolveAssetPath(id, joined));
  try {
    const fileStat = await stat(absolute);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 404 });
    }
    const ext = absolute.slice(absolute.lastIndexOf(".") + 1).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const stream = createReadStream(absolute);
    // Convert Node stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => {
          if (typeof chunk === "string") {
            controller.enqueue(new TextEncoder().encode(chunk));
          } else {
            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          }
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      }
    });
    return new Response(webStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
