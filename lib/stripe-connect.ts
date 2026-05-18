import "server-only";

import crypto from "node:crypto";

// Stripe Connect OAuth helpers — tenant-scoped state signing + URL building.
//
// The flow:
//   1. Tenant clicks "Connect with Stripe" in /setup/stripe.
//   2. We hit /api/stripe/connect/authorize → builds an OAuth URL with a
//      signed state token (tenantId + nonce + HMAC). State round-trips the
//      tenant identity through Stripe's bounce, since Stripe doesn't carry
//      our session cookies.
//   3. Stripe redirects the tenant to its OAuth UI. They sign in or create
//      a Stripe account.
//   4. Stripe redirects back to /api/stripe/connect/callback?code=…&state=…
//   5. Callback verifies the state HMAC, exchanges the code for an OAuth
//      response, and writes `stripeConnectAccountId` to the tenant vault.
//
// Why HMAC-in-state instead of a server-side state map: state survives
// across instance boundaries on Vercel without needing a Postgres table
// or a Redis. Trade-off is replay-within-window — we bound that by
// embedding the issued-at timestamp and rejecting state older than 10
// minutes (the entire OAuth flow shouldn't take longer).

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STATE_VERSION = "v1";

function getSigningKey(): Buffer {
  // Reuse the same master key the tenant vault uses — it's already required
  // in prod via TENANCY_MASTER_KEY. State signing is a separate primitive
  // (HMAC, not AES-GCM) so even if the key were ever exposed in one context
  // it wouldn't compromise the other directly.
  const env = process.env.TENANCY_MASTER_KEY?.trim();
  if (env) {
    if (env.length !== 64) {
      throw new Error("TENANCY_MASTER_KEY must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(env, "hex");
  }
  if (process.env.VERCEL === "1" && process.env.NODE_ENV === "production") {
    throw new Error(
      "TENANCY_MASTER_KEY is required in production. Generate one with " +
        "`openssl rand -hex 32` and set in Vercel env vars."
    );
  }
  // Dev fallback — matches lib/tenancy.ts DEV_KEY_HEX so the same dev box
  // can sign and verify across the two modules.
  return Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex");
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
}

/** Build a state token that round-trips the tenant id through Stripe's OAuth
 *  bounce. Includes a 16-byte nonce + issuance timestamp so it can be checked
 *  for both authenticity (HMAC) and freshness (TTL). */
export function signState(tenantId: string): string {
  const nonce = crypto.randomBytes(12).toString("base64url");
  const issuedAt = Date.now();
  const payload = `${STATE_VERSION}.${tenantId}.${nonce}.${issuedAt}`;
  return `${payload}.${hmac(payload)}`;
}

export type VerifiedState =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_version" };

/** Verify a state token. Returns tenantId on success, an error reason on
 *  failure. Failure must be treated as untrusted state — never proceed. */
export function verifyState(state: string): VerifiedState {
  if (typeof state !== "string" || !state) return { ok: false, reason: "malformed" };
  const parts = state.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed" };
  const [version, tenantId, nonce, issuedAtStr, sig] = parts;
  if (version !== STATE_VERSION) return { ok: false, reason: "bad_version" };
  if (!/^[a-zA-Z0-9_]+$/.test(tenantId)) return { ok: false, reason: "malformed" };
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: "malformed" };
  const payload = `${version}.${tenantId}.${nonce}.${issuedAtStr}`;
  const expected = hmac(payload);
  // Constant-time compare so a probing attacker can't differentiate based on
  // sig-length match vs sig-content mismatch.
  if (sig.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: "bad_signature" };
  }
  if (Date.now() - issuedAt > STATE_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, tenantId };
}

/** Build the OAuth authorize URL. Returns null if STRIPE_CONNECT_CLIENT_ID
 *  isn't configured so callers can surface a clean "Stripe Connect not set up
 *  yet" UI rather than a 500. */
export function buildAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
  /** Optional — Stripe shows whatever you pre-fill if the user creates a new
   *  account from this OAuth bounce. Reduces friction. */
  email?: string;
}): string | null {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    state: opts.state,
    redirect_uri: opts.redirectUri
  });
  if (opts.email) params.set("stripe_user[email]", opts.email);
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}
