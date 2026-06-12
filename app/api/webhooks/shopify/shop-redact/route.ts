import { NextResponse } from "next/server";

import { verifyAppWebhook } from "@/lib/shopify-webhook";
import { offboardShop } from "@/lib/shopify-app-onboarding";
import { validateShopDomain } from "@/lib/shopify-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GDPR mandatory webhook: shop/redact. Fires ~48h after a store uninstalls the
// app, requesting erasure of that shop's data. We clear the tenant's stored
// secrets/PII and cancel it.
export async function POST(request: Request) {
  const { ok, rawBody, shopDomain } = await verifyAppWebhook(request);
  if (!ok) return NextResponse.json({ error: "invalid hmac" }, { status: 401 });

  // Prefer the body's shop_domain; fall back to the header.
  let shop = validateShopDomain(shopDomain);
  if (!shop) {
    try {
      const body = JSON.parse(rawBody) as { shop_domain?: string };
      shop = validateShopDomain(body.shop_domain);
    } catch {
      // ignore — handled below
    }
  }
  if (shop) await offboardShop(shop);
  return NextResponse.json({ ok: true });
}
