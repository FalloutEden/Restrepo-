import { NextResponse } from "next/server";

import { assertValidId, patchDrop, readDrop } from "@/lib/content-studio/storage";
import type { ContentDrop } from "@/lib/content-studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeId(raw: string): string | null {
  try { return assertValidId(raw, "drop"); } catch { return null; }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = safeId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid drop id" }, { status: 400 });
  const drop = await readDrop(id);
  if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  return NextResponse.json({ drop });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = safeId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid drop id" }, { status: 400 });
  let body: Partial<Omit<ContentDrop, "id" | "createdAt" | "updatedAt" | "log" | "assets" | "posts">>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Whitelist fields the client can patch.
  const patch = {
    productTitle: body.productTitle,
    productContext: body.productContext,
    generationPlan: body.generationPlan,
    status: body.status
  };
  Object.keys(patch).forEach((k) => {
    if (patch[k as keyof typeof patch] === undefined) delete patch[k as keyof typeof patch];
  });
  const updated = await patchDrop(id, patch);
  if (!updated) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  return NextResponse.json({ drop: updated });
}
