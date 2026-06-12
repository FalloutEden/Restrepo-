// Security tests for the Shopify OAuth helpers. The shop-domain validation and
// callback HMAC verification are the parts an attacker probes, so they're pure
// functions with direct coverage here (no network).
//
// Run with:
//   node --import tsx --test tests/shopify-oauth.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  validateShopDomain,
  buildInstallUrl,
  verifyShopifyHmac,
  verifyWebhookHmac,
  brandSlugFromShop
} from "../lib/shopify-oauth";

// ── validateShopDomain ──────────────────────────────────────────────────────

test("accepts a real myshopify domain (and lowercases it)", () => {
  assert.equal(validateShopDomain("Cool-Store.myshopify.com"), "cool-store.myshopify.com");
});

test("rejects non-myshopify and injection attempts (SSRF / open-redirect guard)", () => {
  for (const bad of [
    "evil.com",
    "store.myshopify.com.evil.com",
    "store.myshopify.com/admin",
    "store.myshopify.com@evil.com",
    "store.myshopify.com:8080",
    "../store.myshopify.com",
    "store..myshopify.com",
    "",
    null,
    undefined
  ]) {
    assert.equal(validateShopDomain(bad as string), null, `should reject: ${String(bad)}`);
  }
});

// ── buildInstallUrl ─────────────────────────────────────────────────────────

test("install URL targets the shop and carries client_id, scope, redirect, state", () => {
  const url = buildInstallUrl({
    shop: "cool-store.myshopify.com",
    apiKey: "API_KEY_123",
    scopes: "read_products,write_products",
    redirectUri: "https://app.example.com/api/shopify/callback",
    state: "nonce123"
  });
  const u = new URL(url);
  assert.equal(u.host, "cool-store.myshopify.com");
  assert.equal(u.pathname, "/admin/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "API_KEY_123");
  assert.equal(u.searchParams.get("scope"), "read_products,write_products");
  assert.equal(u.searchParams.get("redirect_uri"), "https://app.example.com/api/shopify/callback");
  assert.equal(u.searchParams.get("state"), "nonce123");
});

// ── verifyShopifyHmac ───────────────────────────────────────────────────────

const SECRET = "shpss_test_secret";

function signed(params: Record<string, string>): Record<string, string> {
  const message = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("&");
  const hmac = crypto.createHmac("sha256", SECRET).update(message).digest("hex");
  return { ...params, hmac };
}

test("accepts a correctly-signed callback", () => {
  const q = signed({ code: "abc", shop: "cool-store.myshopify.com", state: "nonce123", timestamp: "1700000000" });
  assert.equal(verifyShopifyHmac(q, SECRET), true);
});

test("rejects a tampered param", () => {
  const q = signed({ code: "abc", shop: "cool-store.myshopify.com", state: "nonce123" });
  q.shop = "attacker.myshopify.com";
  assert.equal(verifyShopifyHmac(q, SECRET), false);
});

test("rejects when hmac is missing", () => {
  assert.equal(verifyShopifyHmac({ code: "abc", shop: "x.myshopify.com" }, SECRET), false);
});

test("rejects under the wrong secret", () => {
  const q = signed({ code: "abc", shop: "cool-store.myshopify.com" });
  assert.equal(verifyShopifyHmac(q, "wrong_secret"), false);
});

test("ignores the legacy signature param when computing the digest", () => {
  const q = signed({ code: "abc", shop: "cool-store.myshopify.com", state: "n" });
  // Adding a `signature` param must not invalidate an otherwise-correct hmac.
  (q as Record<string, string>).signature = "legacy-should-be-ignored";
  assert.equal(verifyShopifyHmac(q, SECRET), true);
});

// ── verifyWebhookHmac (base64, raw body — GDPR/lifecycle webhooks) ──────────

test("accepts a correctly-signed webhook body", () => {
  const body = JSON.stringify({ shop_domain: "cool-store.myshopify.com" });
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  assert.equal(verifyWebhookHmac(body, sig, SECRET), true);
});

test("rejects a tampered webhook body", () => {
  const body = JSON.stringify({ shop_domain: "cool-store.myshopify.com" });
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  assert.equal(verifyWebhookHmac(JSON.stringify({ shop_domain: "evil.myshopify.com" }), sig, SECRET), false);
});

test("rejects webhook with missing header or wrong secret", () => {
  const body = "{}";
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  assert.equal(verifyWebhookHmac(body, null, SECRET), false);
  assert.equal(verifyWebhookHmac(body, sig, "wrong"), false);
});

// ── brandSlugFromShop ───────────────────────────────────────────────────────

test("derives a stable brand slug from the shop subdomain", () => {
  assert.equal(brandSlugFromShop("cool-store.myshopify.com"), "cool-store");
});
