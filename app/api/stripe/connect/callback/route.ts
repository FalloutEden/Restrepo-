import { NextResponse } from "next/server";

import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { setTenantSecret } from "@/lib/tenancy";
import { verifyState } from "@/lib/stripe-connect";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stripe/connect/callback
//
// Stripe redirects here after the tenant completes (or cancels) the Connect
// OAuth flow. Query string carries:
//   - code: the authorization code we exchange for OAuth credentials
//   - state: our HMAC-signed token round-tripping the tenant id
//   - error / error_description: present if the tenant denied the connection
//
// We always redirect the tenant back to /setup/stripe with a status query
// param so the UI can show the right outcome. We never render JSON here —
// this endpoint is browser-facing.

const CALLBACK_REDIRECT = "/setup/stripe";

function buildRedirect(req: Request, query: Record<string, string>): NextResponse {
  const origin = (() => {
    const fromHeader = req.headers.get("origin");
    if (fromHeader) return fromHeader;
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  })();
  const params = new URLSearchParams(query).toString();
  return NextResponse.redirect(`${origin}${CALLBACK_REDIRECT}?${params}`, { status: 303 });
}

function ipFromRequest(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ip = ipFromRequest(request);

  // 1. Tenant denied or Stripe raised an error during OAuth.
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    audit({
      action: "admin.action",
      actor: "stripe-connect-callback",
      target: "anonymous",
      ip,
      detail: { step: "oauth_error", error: errorParam, description: url.searchParams.get("error_description") },
      ok: false
    });
    return buildRedirect(request, { status: "denied", reason: errorParam });
  }

  // 2. Verify state HMAC + freshness before we trust anything else in the URL.
  const stateParam = url.searchParams.get("state") ?? "";
  const verified = verifyState(stateParam);
  if (!verified.ok) {
    audit({
      action: "auth.failed",
      actor: "stripe-connect-callback",
      target: "anonymous",
      ip,
      detail: { step: "state_verification", reason: verified.reason },
      ok: false
    });
    return buildRedirect(request, { status: "bad_state", reason: verified.reason });
  }
  const { tenantId } = verified;

  // 3. Exchange the authorization code for OAuth credentials.
  const code = url.searchParams.get("code") ?? "";
  if (!code) {
    return buildRedirect(request, { status: "no_code" });
  }
  if (!isStripeConfigured()) {
    return buildRedirect(request, { status: "stripe_unconfigured" });
  }

  let connectedAccountId: string;
  try {
    const stripe = getStripe();
    const tokenResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code
    });
    if (!tokenResponse.stripe_user_id) {
      throw new Error("Stripe OAuth response missing stripe_user_id");
    }
    connectedAccountId = tokenResponse.stripe_user_id;
  } catch (e) {
    audit({
      action: "admin.action",
      actor: "stripe-connect-callback",
      target: tenantId,
      ip,
      detail: { step: "token_exchange_failed", message: e instanceof Error ? e.message : "unknown" },
      ok: false
    });
    return buildRedirect(request, { status: "exchange_failed" });
  }

  // 4. Persist the connected account id on the tenant vault. We deliberately
  //    don't store the access_token — Stripe's modern Connect pattern uses
  //    the platform's own secret key with the Stripe-Account header, so the
  //    per-tenant access token isn't needed for ongoing API calls.
  try {
    await setTenantSecret(tenantId, "stripeConnectAccountId", connectedAccountId);
  } catch (e) {
    audit({
      action: "admin.action",
      actor: "stripe-connect-callback",
      target: tenantId,
      ip,
      detail: { step: "vault_write_failed", message: e instanceof Error ? e.message : "unknown" },
      ok: false
    });
    return buildRedirect(request, { status: "vault_write_failed" });
  }

  audit({
    action: "tenant.secret_set",
    actor: tenantId,
    target: tenantId,
    ip,
    detail: { keys: ["stripeConnectAccountId"], via: "oauth_callback", account: connectedAccountId },
    ok: true
  });

  return buildRedirect(request, { status: "connected", account: connectedAccountId });
}
