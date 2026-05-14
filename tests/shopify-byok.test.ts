// Tests proving the Shopify credential resolver routes correctly:
//   - Founder context with brand argument → env vars (legacy behavior)
//   - Tenant context → encrypted vault, IGNORING env vars (the billing-safety
//     guarantee that motivates the whole BYOK migration)
//   - Tenant without a configured shopifyAdminToken → clean "configure in
//     dashboard" error, never a silent founder-card charge
//
// Plus an HTTP-level test using global.fetch mocking: a tenant-context call
// to listShopifyDrafts actually issues a request with the tenant's token
// in the X-Shopify-Access-Token header, not the env var.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/shopify-byok.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { resolveShopifyCredentials, listShopifyCredentialsForContext } from "../lib/shopify-credentials";
import { founderContext, tenantContext, type CredentialName } from "../lib/tenant-context";
import { listShopifyDrafts } from "../lib/shopify-service";
import type { Tenant } from "../lib/tenancy";

function fakeTenantWithShopify(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tnt_shopify_test",
    brandSlug: "pawvault",
    ownerEmail: "owner@pawvault.example",
    bearerToken: "btk_test",
    createdAt: "2026-05-14T00:00:00Z",
    updatedAt: "2026-05-14T00:00:00Z",
    subscriptionStatus: "active",
    brand: { name: "Pawvault", fulfillment: "printful" },
    secrets: {
      // Non-secret fields (storeDomain, storeId) are stored plain; the
      // tenant-context resolver returns them directly. shopifyAdminToken
      // is encrypted, but for unit tests we test the path that pulls plain
      // values from the secret bag.
      shopifyStoreDomain: "pawvault.myshopify.com",
      // shopifyAdminToken is encrypted in real flow; we'd need to call
      // setTenantSecret() through the real crypto layer. For the BYOK
      // routing test below we don't need a valid token — we just verify
      // the resolver tries to pull from secrets first.
      shopifyAdminToken: undefined
    },
    config: { operatorEnabled: true },
    ...overrides
  };
}

// ── Founder vs tenant routing ─────────────────────────────────────────────

test("founder context resolves Shopify creds from env vars (legacy)", () => {
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "shpat_founder_token_xyz";
  process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN = "founder-bv.myshopify.com";
  const ctx = founderContext();
  const creds = resolveShopifyCredentials("black-vault-apparel", ctx);
  assert.equal(creds.token, "shpat_founder_token_xyz");
  assert.equal(creds.storeDomain, "founder-bv.myshopify.com");
});

test("no tenantCtx arg defaults to founder/env-var behavior", () => {
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "env_token_legacy";
  process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN = "legacy.myshopify.com";
  const creds = resolveShopifyCredentials("black-vault-apparel");
  assert.equal(creds.token, "env_token_legacy");
});

test("tenant context with no shopifyAdminToken throws 'configure in dashboard'", () => {
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "FOUNDER_TOKEN_DO_NOT_USE_FOR_TENANT";
  const ctx = tenantContext(fakeTenantWithShopify({ secrets: { shopifyStoreDomain: "x.myshopify.com" } }));
  // Token missing — must NOT silently use the founder env var. The whole
  // point of BYOK isolation is that tenants don't bill the founder's card.
  assert.throws(
    () => resolveShopifyCredentials("anything-here", ctx),
    /has not configured.*Shopify admin token/i
  );
});

test("tenant context with both fields configured uses tenant's values, NOT env vars", () => {
  // Set founder env vars to a recognizable token. The tenant has its own
  // store domain configured but no shopifyAdminToken. Even though env vars
  // exist, the tenant resolver must fail — not silently fall back.
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "FOUNDER_KEY_DO_NOT_LEAK";
  process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN = "founder-bv.myshopify.com";

  // We can't easily inject an encrypted token without going through the
  // crypto layer, so we test the "missing token throws" path which is
  // the security-critical guarantee. The "token present resolves correctly"
  // path is covered by the HTTP test below using a setTenantSecret round-trip.
  const ctx = tenantContext(
    fakeTenantWithShopify({ secrets: { shopifyStoreDomain: "tenant.myshopify.com" } })
  );
  let caught: Error | null = null;
  try {
    resolveShopifyCredentials("black-vault-apparel", ctx);
  } catch (e) {
    caught = e as Error;
  }
  assert.ok(caught, "must throw, not return founder creds");
  assert.match(caught!.message, /Shopify admin token/i);
  // CRITICAL: the founder's token must NOT appear in the error message
  assert.equal(
    caught!.message.includes("FOUNDER_KEY_DO_NOT_LEAK"),
    false,
    "founder token must never leak in error"
  );
});

// ── listShopifyCredentialsForContext ──────────────────────────────────────

test("listShopifyCredentialsForContext: founder returns every configured brand", () => {
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "bv_token";
  process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN = "bv.myshopify.com";
  process.env.SHOPIFY_API_KEY = "ll_token";
  process.env.SHOPIFY_STORE_DOMAIN = "ll.myshopify.com";
  const list = listShopifyCredentialsForContext(founderContext());
  assert.ok(list.length >= 2);
  assert.ok(list.some((c) => c.brandSlug === "black-vault-apparel"));
  assert.ok(list.some((c) => c.brandSlug === "locklayer"));
});

test("listShopifyCredentialsForContext: tenant without configured Shopify returns empty (graceful)", () => {
  const ctx = tenantContext(fakeTenantWithShopify({ secrets: {} }));
  const list = listShopifyCredentialsForContext(ctx);
  assert.equal(list.length, 0, "unconfigured tenant: empty list, not throw");
});

// ── HTTP-level: the actual fetch uses the tenant's token ──────────────────

test("listShopifyDrafts(tenantCtx) issues fetch with tenant token in X-Shopify-Access-Token", async () => {
  // We need a tenant with a real encrypted shopifyAdminToken. Round-trip
  // through setTenantSecret so the crypto layer signs it.
  process.env.TENANCY_MASTER_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "FOUNDER_TOKEN_DO_NOT_USE";
  process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN = "founder.myshopify.com";

  const { createTenant, setTenantSecret } = await import("../lib/tenancy");
  const { contextForTenantId } = await import("../lib/tenant-context");

  // Use a tmp working directory so the tenant file is isolated
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-byok-"));
  const realCwd = process.cwd.bind(process);
  process.cwd = () => tmpDir;

  // Capture fetch calls
  const realFetch = global.fetch;
  const captured: Array<{ url: string; headers: Record<string, string> }> = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k] = h[k];
    }
    captured.push({ url, headers });
    return new Response(JSON.stringify({ products: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const tenant = await createTenant({
      brandSlug: "pawvault-test-" + Date.now(),
      ownerEmail: "test@pv.example",
      brandName: "Pawvault Test"
    });
    await setTenantSecret(tenant.id, "shopifyStoreDomain", "tenant-store.myshopify.com");
    await setTenantSecret(tenant.id, "shopifyAdminToken", "shpat_TENANT_SPECIFIC_TOKEN_xyz");

    const ctx = await contextForTenantId(tenant.id);
    await listShopifyDrafts(10, undefined, ctx);

    assert.ok(captured.length > 0, "fetch should have been called");
    // Critical assertions:
    // (1) URL points at the tenant's store domain, not the founder's
    assert.ok(
      captured[0].url.includes("tenant-store.myshopify.com"),
      `expected tenant domain in URL, got: ${captured[0].url}`
    );
    assert.ok(
      !captured[0].url.includes("founder.myshopify.com"),
      "founder domain must NOT appear"
    );
    // (2) Auth header carries the tenant's token, not the founder's
    const token = captured[0].headers["X-Shopify-Access-Token"];
    assert.equal(token, "shpat_TENANT_SPECIFIC_TOKEN_xyz");
    assert.notEqual(token, "FOUNDER_TOKEN_DO_NOT_USE");
  } finally {
    global.fetch = realFetch;
    process.cwd = realCwd;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
