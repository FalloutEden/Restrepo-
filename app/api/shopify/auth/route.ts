import { NextResponse, type NextRequest } from "next/server";

import {
  validateShopDomain,
  buildInstallUrl,
  newOAuthState,
  getShopifyAppConfig,
  shopifyAppConfigured
} from "@/lib/shopify-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1 of the embedded-app install: validate the shop, mint a CSRF state
// nonce (stashed in an HttpOnly cookie), and redirect the merchant to their own
// store's consent screen. Public route — no bearer; the callback verifies HMAC.
export function GET(request: NextRequest) {
  if (!shopifyAppConfigured()) {
    return NextResponse.json(
      { error: "Shopify app not configured. Set SHOPIFY_APP_API_KEY, SHOPIFY_APP_API_SECRET, SHOPIFY_APP_URL." },
      { status: 503 }
    );
  }

  const shop = validateShopDomain(request.nextUrl.searchParams.get("shop"));
  if (!shop) {
    return NextResponse.json(
      { error: "Provide ?shop=<store>.myshopify.com" },
      { status: 400 }
    );
  }

  const cfg = getShopifyAppConfig();
  const state = newOAuthState();
  const installUrl = buildInstallUrl({
    shop,
    apiKey: cfg.apiKey,
    scopes: cfg.scopes,
    redirectUri: `${cfg.appUrl}/api/shopify/callback`,
    state
  });

  const res = NextResponse.redirect(installUrl);
  // SameSite=Lax so the cookie survives Shopify's top-level redirect back.
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600
  });
  return res;
}
