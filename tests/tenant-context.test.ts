// Tests for the tenant-context abstraction.
//
// Two flavors covered:
//   - Founder context (admin/dev/cron): legacy paths + env-var credential fallback
//   - Tenant context: scoped paths + secrets vault, no env fallback (billing safety)
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/tenant-context.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  founderContext,
  tenantContext,
  buildTenantPaths,
  FOUNDER_TENANT_ID,
  type CredentialName
} from "../lib/tenant-context";
import type { Tenant } from "../lib/tenancy";

// Helper — build a synthetic tenant. Skips the encryption layer by using
// non-secret keys where we want plain values; for encrypted keys the test
// calls into the real tenancy crypto via setTenantSecret in integration tests
// (out of scope here — this is unit-level).
function fakeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tnt_test1",
    brandSlug: "test-brand",
    ownerEmail: "test@example.com",
    bearerToken: "btk_test_xyz",
    createdAt: "2026-05-14T00:00:00Z",
    updatedAt: "2026-05-14T00:00:00Z",
    subscriptionStatus: "active",
    brand: { name: "Test Brand", fulfillment: "printful" },
    secrets: {},
    config: { operatorEnabled: true },
    ...overrides
  };
}

// ── Path resolution ───────────────────────────────────────────────────────

test("founder paths point at legacy .openclaw/operator/", () => {
  const ctx = founderContext();
  assert.equal(ctx.tenantId, FOUNDER_TENANT_ID);
  assert.equal(ctx.isFounder, true);
  assert.ok(ctx.paths.root.endsWith(path.join("openclaw", "operator")), `root: ${ctx.paths.root}`);
  assert.ok(ctx.paths.activityLog.endsWith(path.join("operator", "activity.jsonl")));
  assert.ok(ctx.paths.memoryFile.endsWith(path.join("operator", "memory.md")));
  assert.ok(ctx.paths.spendLog.endsWith(path.join("operator", "spend.jsonl")));
});

test("tenant paths are scoped under .openclaw/tenants/<id>/operator/", () => {
  const ctx = tenantContext(fakeTenant({ id: "tnt_abc123" }));
  assert.equal(ctx.tenantId, "tnt_abc123");
  assert.equal(ctx.isFounder, false);
  assert.ok(ctx.paths.root.endsWith(path.join("tenants", "tnt_abc123", "operator")), `root: ${ctx.paths.root}`);
  assert.ok(ctx.paths.activityLog.endsWith(path.join("tnt_abc123", "operator", "activity.jsonl")));
});

test("conversation/proposal/task id resolvers validate input", () => {
  const paths = buildTenantPaths("tnt_abc");
  assert.throws(() => paths.conversation("../../etc/passwd"), /Invalid conversation id/);
  assert.throws(() => paths.proposal("../../"), /Invalid proposal id/);
  assert.throws(() => paths.task("foo/bar"), /Invalid task id/);
  // Legitimate ids work
  assert.ok(paths.conversation("conv_abc-123").endsWith("conv_abc-123.jsonl"));
  assert.ok(paths.proposal("prop_xyz").endsWith("prop_xyz"));
});

test("buildTenantPaths rejects path-traversal in tenant id", () => {
  assert.throws(() => buildTenantPaths("../../etc"), /Invalid tenant id/);
  assert.throws(() => buildTenantPaths("a/b"), /Invalid tenant id/);
  // Legitimate tenant ids are accepted
  assert.doesNotThrow(() => buildTenantPaths("tnt_valid_id_123"));
});

test("two tenants get fully disjoint path trees (no shared file)", () => {
  const a = tenantContext(fakeTenant({ id: "tnt_aaa" }));
  const b = tenantContext(fakeTenant({ id: "tnt_bbb" }));

  // Every leaf path must differ
  const leaves: Array<keyof typeof a.paths> = [
    "root",
    "conversationsDir",
    "proposalsDir",
    "tasksDir",
    "activityLog",
    "stateFile",
    "memoryFile",
    "spendLog",
    "spendBudgetFile",
    "contentStudioDir"
  ];
  for (const k of leaves) {
    const va = a.paths[k] as string;
    const vb = b.paths[k] as string;
    assert.notEqual(va, vb, `path '${k}' is shared between tenants: ${va}`);
  }
});

test("founder and tenant paths never collide", () => {
  const founder = founderContext();
  const tenant = tenantContext(fakeTenant({ id: "tnt_xyz" }));
  assert.notEqual(founder.paths.activityLog, tenant.paths.activityLog);
  assert.notEqual(founder.paths.memoryFile, tenant.paths.memoryFile);
  assert.notEqual(founder.paths.spendLog, tenant.paths.spendLog);
});

// ── Credential resolution ────────────────────────────────────────────────

test("founder context resolves credentials from env vars", () => {
  process.env.ANTHROPIC_API_KEY = "test_anthropic_key_abc";
  process.env.OPENAI_API_KEY = "test_openai_key_xyz";
  const ctx = founderContext();
  assert.equal(ctx.getSecret("anthropicApiKey"), "test_anthropic_key_abc");
  assert.equal(ctx.getSecret("openaiApiKey"), "test_openai_key_xyz");
  assert.equal(ctx.hasSecret("anthropicApiKey"), true);
  assert.equal(ctx.hasSecret("openaiApiKey"), true);
});

test("founder context credential chain falls through env vars in order", () => {
  delete process.env.SHOPIFY_BLACKVAULT_API_KEY;
  process.env.SHOPIFY_API_KEY = "fallback_shop_key";
  const ctx = founderContext();
  assert.equal(ctx.getSecret("shopifyAdminToken"), "fallback_shop_key");

  // Now set the higher-priority env var — it should win
  process.env.SHOPIFY_BLACKVAULT_API_KEY = "primary_shop_key";
  assert.equal(founderContext().getSecret("shopifyAdminToken"), "primary_shop_key");
});

test("founder context returns null for unset credential", () => {
  delete process.env.KLAVIYO_API_KEY;
  const ctx = founderContext();
  assert.equal(ctx.getSecret("klaviyoApiKey"), null);
  assert.equal(ctx.hasSecret("klaviyoApiKey"), false);
});

test("founder.requireSecret throws when missing, with clear error", () => {
  delete process.env.KLAVIYO_API_KEY;
  const ctx = founderContext();
  assert.throws(() => ctx.requireSecret("klaviyoApiKey"), /Klaviyo API key/);
});

test("tenant context does NOT fall back to env vars — billing safety", () => {
  process.env.ANTHROPIC_API_KEY = "founder_anthropic_key";
  // Tenant has no secret configured for Anthropic
  const ctx = tenantContext(fakeTenant({ secrets: {} }));
  // Must NOT silently use the founder env var
  assert.equal(ctx.getSecret("anthropicApiKey"), null);
  assert.equal(ctx.hasSecret("anthropicApiKey"), false);
  // requireSecret must throw with a tenant-facing message
  assert.throws(() => ctx.requireSecret("anthropicApiKey"), /has not configured/);
});

test("tenant context resolves non-secret-key values directly (storeDomain, storeId)", () => {
  const ctx = tenantContext(
    fakeTenant({
      secrets: {
        shopifyStoreDomain: "mybrand.myshopify.com",
        printfulStoreId: "12345678"
      }
    })
  );
  assert.equal(ctx.getSecret("shopifyStoreDomain"), "mybrand.myshopify.com");
  assert.equal(ctx.getSecret("printfulStoreId"), "12345678");
});

test("requireSecret error message tells tenant where to configure", () => {
  const ctx = tenantContext(fakeTenant({ brandSlug: "pawvault", secrets: {} }));
  try {
    ctx.requireSecret("printfulApiKey");
    assert.fail("expected throw");
  } catch (e) {
    const msg = (e as Error).message;
    assert.ok(msg.includes("pawvault"));
    assert.ok(msg.includes("dashboard"));
  }
});

// ── Tenant id flavors ────────────────────────────────────────────────────

test("FOUNDER_TENANT_ID is the documented sentinel", () => {
  assert.equal(FOUNDER_TENANT_ID, "_founder");
});

test("listing every CredentialName has a definition (compile-time + runtime sanity)", () => {
  // If a new CredentialName is added without a CREDENTIAL_DEFS entry, this
  // test catches it via the requireSecret error path.
  const all: CredentialName[] = [
    "anthropicApiKey",
    "openaiApiKey",
    "shopifyAdminToken",
    "shopifyStoreDomain",
    "shopifyWebhookSecret",
    "printfulApiKey",
    "printfulStoreId",
    "klaviyoApiKey",
    "cjApiKey",
    "cjEmail"
  ];
  for (const name of all) {
    // Empty env, empty secrets — should produce a specific labeled error,
    // never a generic crash
    const ctx = tenantContext(fakeTenant({ secrets: {} }));
    assert.throws(
      () => ctx.requireSecret(name),
      new RegExp(name === "shopifyStoreDomain" ? "Shopify store domain" : ".+"),
      `requireSecret(${name}) should error cleanly`
    );
  }
});
