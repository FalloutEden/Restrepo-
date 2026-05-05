import { NextResponse } from "next/server";

import { runOperator } from "@/lib/operator-agent";
import { logActivity } from "@/lib/operator-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Daily autonomous run can take several minutes (CJ search + materialize +
// reasoning loops). Defer to the platform's max execution window.
export const maxDuration = 300;

// Optional shared-secret protection so a public deployment doesn't let anyone
// trigger a tick. Set OPERATOR_TICK_SECRET in the environment if exposed.
function authorized(request: Request): boolean {
  const secret = process.env.OPERATOR_TICK_SECRET?.trim();
  if (!secret) return true;
  const provided = request.headers.get("x-operator-tick-secret");
  return provided === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversationId = `tick_${new Date().toISOString().slice(0, 10)}`;
  try {
    const result = await runOperator({
      conversationId,
      source: "tick"
    });
    return NextResponse.json({ ok: true, conversationId, summary: result.finalText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tick error";
    await logActivity({
      kind: "tick_failed",
      message,
      data: { conversationId }
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Vercel Cron pings GET; mirror POST so the same handler covers both.
  return POST(request);
}
