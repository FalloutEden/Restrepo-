import "server-only";

import crypto from "node:crypto";

// Shopify embedded-app OAuth — security-critical helpers, kept pure so they can
// be unit-tested without network. The /api/shopify/auth + /callback routes
// orchestrate these. The callback HMAC is verified with the app API SECRET
// (NOT the webhook signing secret — different value, different algorithm).
//
// Flow:
//   1. GET /api/shopify/auth?shop=<shop>.myshopify.com
//        → validate shop, mint state nonce, redirect to the shop's authorize URL
//   2. Shopify redirects back to /api/shopify/callback?code&hmac&shop&state&host
//        → verify state (cookie) + HMAC, exchange code for an offline token,
//          map shop → tenant (token into the encrypted vault), register GDPR
//          webhooks, redirect into the embedded app
//
// A connected shop becomes a tenant: the shop domain is the stable identity and
// the OAuth access token replaces the manually-pasted Shopify admin token.

// Strict shop-domain allowlist. Shopify shop domains are always
// "<store>.myshopify.com". Reject anything else to prevent SSRF / open-redirect
// (an attacker passing ?shop=evil.com would otherwise make us mint an install
// URL or exchange a token against their host).
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function validateShopDomain(shop: string | null | undefined): string | null {
  if (!shop) return null;
  const s = shop.trim().toLowerCase();
  // Defense in depth on top of the regex.
  if (s.includes("..") || s.includes("/") || s.includes("@") || s.includes(":")) return null;
  if (!SHOP_DOMAIN_RE.test(s)) return null;
  return s;
}

export function newOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildInstallUrl(params: {
  shop: string;
  apiKey: string;
  scopes: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(`https://${params.shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id", params.apiKey);
  u.searchParams.set("scope", params.scopes);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("state", params.state);
  return u.toString();
}

/**
 * Verify the OAuth callback HMAC. Shopify signs every query param EXCEPT `hmac`
 * (and the legacy `signature`) with the app secret: sort the remaining params
 * lexicographically by key, join as `key=value` with `&`, HMAC-SHA256, hex.
 * Timing-safe compare against the provided `hmac`.
 */
export function verifyShopifyHmac(
  query: Record<string, string | string[] | undefined>,
  apiSecret: string
): boolean {
  const provided = typeof query.hmac === "string" ? query.hmac : "";
  if (!provided || !apiSecret) return false;

  const pairs: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (k === "hmac" || k === "signature") continue;
    if (v === undefined) continue;
    const val = Array.isArray(v) ? v.join(",") : v;
    pairs.push(`${k}=${val}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Exchange the one-time OAuth code for a permanent (offline) access token. */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
  apiKey: string,
  apiSecret: string
): Promise<{ accessToken: string; scope: string }> {
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code })
  });
  if (!r.ok) {
    throw new Error(`Shopify token exchange failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }
  const body = (await r.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) throw new Error("Shopify token exchange returned no access_token");
  return { accessToken: body.access_token, scope: body.scope ?? "" };
}

/** Derive a stable, unique brand slug from a shop domain (the subdomain). */
export function brandSlugFromShop(shop: string): string {
  return shop.replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9-]/g, "-");
}
