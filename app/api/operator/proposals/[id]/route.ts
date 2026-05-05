import { NextResponse } from "next/server";

import { decideProposal, logActivity, readProposal } from "@/lib/operator-state";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await readProposal(id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  return NextResponse.json({ proposal });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { decision?: "approved" | "rejected"; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 }
    );
  }
  const updated = await decideProposal(id, body.decision, body.notes);
  if (!updated) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  await logActivity({
    kind: "proposal_decided",
    message: `Proposal ${id} ${body.decision}${body.notes ? `: ${body.notes}` : ""}`,
    data: { proposalId: id, decision: body.decision }
  });

  return NextResponse.json({ proposal: updated });
}
