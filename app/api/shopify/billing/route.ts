import { NextResponse, type NextRequest } from "next/server";

import { validateShopDomain, getShopifyAppConfig, shopifyAppConfigured } from "@/lib/shopify-oauth";
import { getShopTenantToken } from "@/lib/shopify-app-onboarding";
import { getActiveSubscription, createAppSubscription } from "@/lib/shopify-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ensure the shop has an active subscription. Reached right after install (the
// OAuth callback redirects here). If already subscribed → into the app; else
// create the trial subscription and send the merchant to Shopify's approval page.
export async function GET(request: NextRequest) {
  if (!shopifyAppConfigured()) {
    return NextResponse.json({ error: "Shopify app not configured." }, { status: 503 });
  }
  const cfg = getShopifyAppConfig();
  const shop = validateShopDomain(request.nextUrl.searchParams.get("shop"));
  if (!shop) return NextResponse.json({ error: "invalid shop" }, { status: 400 });
  const host = request.nextUrl.searchParams.get("host") ?? "";

  const conn = await getShopTenantToken(shop);
  if (!conn) {
    // Not onboarded (or token cleared) → restart the install.
    return NextResponse.redirect(`${cfg.appUrl}/api/shopify/auth?shop=${encodeURIComponent(shop)}`);
  }

  const dash = new URL(`${cfg.appUrl}/dashboard`);
  dash.searchParams.set("shop", shop);
  if (host) dash.searchParams.set("host", host);

  try {
    const sub = await getActiveSubscription(shop, conn.token);
    if (sub.status === "ACTIVE") {
      return NextResponse.redirect(dash.toString());
    }
    const returnUrl =
      `${cfg.appUrl}/api/shopify/billing/callback?shop=${encodeURIComponent(shop)}` +
      (host ? `&host=${encodeURIComponent(host)}` : "");
    const confirmationUrl = await createAppSubscription(shop, conn.token, returnUrl);
    return NextResponse.redirect(confirmationUrl);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "billing setup failed" },
      { status: 502 }
    );
  }
}
