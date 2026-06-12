import { NextResponse, type NextRequest } from "next/server";

import { validateShopDomain, getShopifyAppConfig, shopifyAppConfigured } from "@/lib/shopify-oauth";
import { getShopTenantToken } from "@/lib/shopify-app-onboarding";
import { getActiveSubscription } from "@/lib/shopify-billing";
import { updateTenant } from "@/lib/tenancy";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Merchant returns here after approving (or declining) the subscription. We do
// NOT trust the redirect / charge_id — we re-query the subscription status with
// the shop's own token (authoritative) before marking the tenant active.
export async function GET(request: NextRequest) {
  if (!shopifyAppConfigured()) {
    return NextResponse.json({ error: "Shopify app not configured." }, { status: 503 });
  }
  const cfg = getShopifyAppConfig();
  const shop = validateShopDomain(request.nextUrl.searchParams.get("shop"));
  if (!shop) return NextResponse.json({ error: "invalid shop" }, { status: 400 });
  const host = request.nextUrl.searchParams.get("host") ?? "";

  const conn = await getShopTenantToken(shop);
  if (conn) {
    try {
      const sub = await getActiveSubscription(shop, conn.token);
      // ACTIVE covers the trial window too. Anything else = not paying yet.
      await updateTenant(conn.tenant.id, {
        subscriptionStatus: sub.status === "ACTIVE" ? "active" : "incomplete"
      });
      audit({
        action: "tenant.subscription_changed",
        actor: "shopify-billing",
        target: conn.tenant.id,
        detail: { shop, shopifyStatus: sub.status }
      });
    } catch {
      // Leave status unchanged; the merchant can retry billing from the app.
    }
  }

  const dash = new URL(`${cfg.appUrl}/dashboard`);
  dash.searchParams.set("shop", shop);
  if (host) dash.searchParams.set("host", host);
  return NextResponse.redirect(dash.toString());
}
