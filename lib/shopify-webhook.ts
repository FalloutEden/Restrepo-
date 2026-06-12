import "server-only";

import { getShopifyAppConfig, verifyWebhookHmac } from "@/lib/shopify-oauth";

// Shared verification for app-level (compliance/GDPR + lifecycle) Shopify
// webhooks. These are signed with the app's API secret over the raw body.
export async function verifyAppWebhook(
  request: Request
): Promise<{ ok: boolean; rawBody: string; shopDomain: string | null }> {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const ok = verifyWebhookHmac(rawBody, hmac, getShopifyAppConfig().apiSecret);
  return { ok, rawBody, shopDomain };
}
