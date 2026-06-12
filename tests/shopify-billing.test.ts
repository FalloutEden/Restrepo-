// Tests for the Shopify Billing safety logic. The one thing that MUST be right
// is that we never create a real (charging) subscription outside genuine
// production — a dev/preview install must always be test mode.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/shopify-billing.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { billingTestMode, billingConfig } from "../lib/shopify-billing";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("local/dev is ALWAYS test mode (no real charges)", () => {
  withEnv({ VERCEL: undefined, NODE_ENV: "development", SHOPIFY_BILLING_TEST: undefined }, () => {
    assert.equal(billingTestMode(), true);
  });
});

test("preview (VERCEL but not production) is test mode", () => {
  withEnv({ VERCEL: "1", NODE_ENV: "preview", SHOPIFY_BILLING_TEST: undefined }, () => {
    assert.equal(billingTestMode(), true);
  });
});

test("genuine Vercel production charges for real", () => {
  withEnv({ VERCEL: "1", NODE_ENV: "production", SHOPIFY_BILLING_TEST: undefined }, () => {
    assert.equal(billingTestMode(), false);
  });
});

test("SHOPIFY_BILLING_TEST=1 forces test mode even in production", () => {
  withEnv({ VERCEL: "1", NODE_ENV: "production", SHOPIFY_BILLING_TEST: "1" }, () => {
    assert.equal(billingTestMode(), true);
  });
});

test("billing config carries a positive price and trial", () => {
  const c = billingConfig();
  assert.ok(c.priceUsd > 0);
  assert.ok(c.trialDays >= 0);
  assert.ok(c.planName.length > 0);
});
