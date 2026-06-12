// Tests for the multi-provider image layer (2026-06-10). The operator offers
// the merchant a choice of image source — upload, OpenAI gpt-image-1, or Google
// Nano Banana 2 — rather than forcing one. These tests cover provider routing
// and per-tenant credential resolution WITHOUT hitting the live APIs (they
// assert the clear errors raised before any network call).
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/image-provider.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { generateProductImage } from "../lib/image-generation";
import { priceGoogleImage } from "../lib/spend-tracker";
import { tenantContext } from "../lib/tenant-context";
import type { Tenant } from "../lib/tenancy";

function tenantWithout(secret: keyof Tenant["secrets"]): Tenant {
  const secrets: Tenant["secrets"] = {
    shopifyAdminToken: "x",
    shopifyStoreDomain: "x.myshopify.com",
    openaiApiKey: "sk-test",
    googleApiKey: "g-test"
  };
  delete secrets[secret];
  return {
    id: "tnt_img1",
    brandSlug: "img-brand",
    ownerEmail: "img@example.com",
    bearerToken: "btk_img",
    createdAt: "2026-06-10T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
    subscriptionStatus: "active",
    brand: { name: "Img Brand", fulfillment: "printful" },
    secrets,
    config: { operatorEnabled: true }
  };
}

test("google provider requires the tenant's Gemini key (clear error, no network)", async () => {
  const ctx = tenantContext(tenantWithout("googleApiKey"));
  await assert.rejects(
    () => generateProductImage("a logo", { provider: "google" }, ctx),
    /has not configured.*Gemini|Google Gemini API key/i
  );
});

test("openai provider requires the tenant's OpenAI key (clear error, no network)", async () => {
  const ctx = tenantContext(tenantWithout("openaiApiKey"));
  await assert.rejects(
    () => generateProductImage("a logo", { provider: "openai" }, ctx),
    /has not configured.*OpenAI|OpenAI API key/i
  );
});

test("priceGoogleImage scales with image count", () => {
  assert.ok(priceGoogleImage(1) > 0);
  assert.equal(priceGoogleImage(2), Number((priceGoogleImage(1) * 2).toFixed(6)));
});
