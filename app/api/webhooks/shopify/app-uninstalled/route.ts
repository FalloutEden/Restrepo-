import { NextResponse } from "next/server";

import { verifyAppWebhook } from "@/lib/shopify-webhook";
import { offboardShop } from "@/lib/shopify-app-onboarding";
import { validateShopDomain } from "@/lib/shopify-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lifecycle webhook: app/uninstalled. Fires when a merchant removes the app.
// The stored access token is already invalid at this point, so we cancel the
// tenant and clear its secrets immediately (shop/redact follows ~48h later as
// the GDPR backstop).
export async function POST(request: Request) {
  const { ok, shopDomain } = await verifyAppWebhook(request);
  if (!ok) return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  const shop = validateShopDomain(shopDomain);
  if (shop) await offboardShop(shop);
  return NextResponse.json({ ok: true });
}
