import { NextResponse } from "next/server";

import { runOperator } from "@/lib/operator-agent";
import { logActivity } from "@/lib/operator-state";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Daily autonomous run can take several minutes (CJ search + materialize +
// reasoning loops). Defer to the platform's max execution window.
export const maxDuration = 300;

// Founder-path protection. A tenant bearer is always scoped to its own run
// (see below), so the only thing this guards is the FOUNDER tick: an admin or
// the Vercel cron triggering the founder's autonomous loop. In production that
// must carry the secret; we no longer fall open when the secret is unset, so a
// misconfigured deploy can't let an unauthenticated caller drive the founder
// loop. Tenant bearers bypass this gate because their run is self-scoped.
function founderTickAuthorized(request: Request): boolean {
  const secret = process.env.OPERATOR_TICK_SECRET?.trim();
  const onVercel = process.env.VERCEL === "1" && process.env.NODE_ENV === "production";
  if (!secret) {
    // Fail open only in local dev; never on a real deployment.
    return !onVercel;
  }
  const provided = request.headers.get("x-operator-tick-secret");
  return provided === secret;
}

export async function POST(request: Request) {
  // Resolve who is calling. A tenant bearer (btk_*) runs ITS OWN tick against
  // ITS OWN keys and state — no secret required, and it can never touch the
  // founder loop. Anything resolving to founder context must pass the secret.
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder && !founderTickAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversationId = `tick_${new Date().toISOString().slice(0, 10)}`;
  try {
    const result = await runOperator({
      conversationId,
      source: "tick",
      tenantId: ctx.tenantId
    });
    return NextResponse.json({ ok: true, conversationId, summary: result.finalText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tick error";
    await logActivity(
      {
        kind: "tick_failed",
        message,
        data: { conversationId }
      },
      ctx.tenantId
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Vercel Cron pings GET; mirror POST so the same handler covers both.
  return POST(request);
}
