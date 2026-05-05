import { NextResponse } from "next/server";

import { markPostPosted, readDrop } from "@/lib/content-studio/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const { id, postId } = await params;
  let body: { posted?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.posted) {
    await markPostPosted(id, postId);
  }
  const updated = await readDrop(id);
  if (!updated) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  return NextResponse.json({ drop: updated });
}
