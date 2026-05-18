import { NextResponse } from "next/server";

import { resolveTenantContext } from "@/lib/tenant-context";
import { signState, buildAuthorizeUrl } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stripe/connect/authorize
//
// Generates the Stripe Connect OAuth URL the tenant should be redirected to.
// Returns JSON with { url, state } so the client can choose whether to
// window.location, open a popup, or surface a manual link.
//
// Requires:
//   - Tenant bearer (founder is rejected — founders don't connect Stripe
//     accounts via this surface; they ARE the platform)
//   - STRIPE_CONNECT_CLIENT_ID env var (set this in Stripe Dashboard →
//     Settings → Connect → Onboarding settings → OAuth client id). If
//     missing, returns 503 with a clear message instead of 500-crashing.

function getOrigin(req: Request): string {
  const fromHeader = req.headers.get("origin");
  if (fromHeader) return fromHeader;
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder || !ctx.tenant) {
    return NextResponse.json(
      { error: "Tenant bearer required." },
      { status: 401 }
    );
  }

  const redirectUri = `${getOrigin(request)}/api/stripe/connect/callback`;
  const state = signState(ctx.tenant.id);
  const url = buildAuthorizeUrl({
    state,
    redirectUri,
    email: ctx.tenant.ownerEmail
  });

  if (!url) {
    return NextResponse.json(
      {
        error:
          "Stripe Connect is not configured on this deployment. Set STRIPE_CONNECT_CLIENT_ID in the Vercel project env (find it in Stripe Dashboard → Settings → Connect → Onboarding settings → OAuth client id) and redeploy."
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ url, state, redirectUri });
}
