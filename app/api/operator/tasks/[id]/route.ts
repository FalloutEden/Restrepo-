import { NextResponse } from "next/server";

import { logActivity, resolveHumanTask } from "@/lib/operator-state";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: "done" | "dismissed" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "done" && body.status !== "dismissed") {
    return NextResponse.json(
      { error: "status must be 'done' or 'dismissed'" },
      { status: 400 }
    );
  }
  const updated = await resolveHumanTask(id, body.status);
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await logActivity({
    kind: "task_resolved",
    message: `Task ${id} marked ${body.status}`,
    data: { taskId: id, status: body.status }
  });

  return NextResponse.json({ task: updated });
}
