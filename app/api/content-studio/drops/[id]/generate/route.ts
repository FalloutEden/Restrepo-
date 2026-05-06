import { NextResponse } from "next/server";

import { generateContentDrop } from "@/lib/content-studio/orchestrator";
import { assertValidId, readDrop } from "@/lib/content-studio/storage";
import type { Platform } from "@/lib/content-studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generation runs in series across multiple AI providers — typical wall time
// 2–6 minutes. Hold the request open up to 5 minutes so the UI can show
// progress directly. For longer runs the user should poll the drop manifest.
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try { id = assertValidId(rawId, "drop"); }
  catch { return NextResponse.json({ error: "Invalid drop id" }, { status: 400 }); }
  const drop = await readDrop(id);
  if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  if (drop.assets.filter((a) => a.kind === "source_photo").length === 0) {
    return NextResponse.json(
      { error: "Upload at least one source photo before generating" },
      { status: 400 }
    );
  }

  let body: {
    lifestyleScenarios?: string[];
    videoScenes?: string[];
    targetPlatforms?: Platform[];
    maxLifestyleImages?: number;
    maxVideos?: number;
  };
  try {
    body = request.headers.get("content-length") !== "0" ? ((await request.json()) as typeof body) : {};
  } catch {
    body = {};
  }

  try {
    const result = await generateContentDrop(id, body);
    return NextResponse.json({ drop: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
