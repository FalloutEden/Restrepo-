import { NextResponse, type NextRequest } from "next/server";

import {
  validateShopDomain,
  verifyShopifyHmac,
  exchangeCodeForToken,
  getShopifyAppConfig,
  shopifyAppConfigured
} from "@/lib/shopify-oauth";
import { onboardShopAsTenant } from "@/lib/shopify-app-onboarding";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 2: Shopify redirects here after consent. We verify the request is really
// from Shopify (HMAC) and really from the flow we started (state nonce), then
// exchange the code for an offline token and onboard the shop as a tenant.
export async function GET(request: NextRequest) {
  if (!shopifyAppConfigured()) {
    return NextResponse.json({ error: "Shopify app not configured." }, { status: 503 });
  }

  const cfg = getShopifyAppConfig();
  const q = Object.fromEntries(request.nextUrl.searchParams.entries());

  const shop = validateShopDomain(q.shop);
  if (!shop) return NextResponse.json({ error: "invalid shop" }, { status: 400 });

  // 1. HMAC — proves the callback is genuinely from Shopify and untampered.
  if (!verifyShopifyHmac(q, cfg.apiSecret)) {
    audit({ action: "auth.failed", actor: "shopify-oauth", target: shop, ok: false, detail: { reason: "bad hmac" } });
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }

  // 2. State nonce — CSRF: must match the cookie we set when starting the flow.
  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  if (!q.state || !cookieState || q.state !== cookieState) {
    audit({ action: "auth.failed", actor: "shopify-oauth", target: shop, ok: false, detail: { reason: "state mismatch" } });
    return NextResponse.json({ error: "state mismatch" }, { status: 403 });
  }

  const code = typeof q.code === "string" ? q.code : "";
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  try {
    const { accessToken, scope } = await exchangeCodeForToken(shop, code, cfg.apiKey, cfg.apiSecret);
    const tenant = await onboardShopAsTenant({ shop, accessToken, scope });
    audit({ action: "auth.success", actor: "shopify-oauth", target: tenant.id, detail: { shop } });

    // Land inside the embedded app. `host` is Shopify's base64 admin host param,
    // needed by App Bridge to render inside admin.
    const dest = new URL(`${cfg.appUrl}/dashboard`);
    dest.searchParams.set("shop", shop);
    if (typeof q.host === "string" && q.host) dest.searchParams.set("host", q.host);

    const res = NextResponse.redirect(dest.toString());
    res.cookies.delete("shopify_oauth_state");
    return res;
  } catch (e) {
    audit({
      action: "auth.failed",
      actor: "shopify-oauth",
      target: shop,
      ok: false,
      detail: { reason: e instanceof Error ? e.message : "exchange failed" }
    });
    return NextResponse.json({ error: "oauth exchange failed" }, { status: 502 });
  }
}
