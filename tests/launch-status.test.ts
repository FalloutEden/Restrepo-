// Tests for the launch readiness probe. We mock global.fetch so the checks
// don't actually hit Shopify, then assert the report shape + statuses.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/launch-status.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { getLaunchStatus } from "../lib/launch-status";

type MockResponse = { url: string; status: number; body: unknown };

function installMockFetch(responses: MockResponse[]) {
  const realFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const mock = responses.find((r) => url.includes(r.url));
    if (!mock) {
      throw new Error(`Unmocked fetch: ${url}`);
    }
    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return () => {
    global.fetch = realFetch;
  };
}

test("getLaunchStatus returns ok when Shopify works and 5+ products are active", async () => {
  const restore = installMockFetch([
    { url: "/shop.json", status: 200, body: { shop: { name: "BV" } } },
    { url: "/products/count.json", status: 200, body: { count: 7 } },
    { url: "/products.json", status: 200, body: { products: [] } },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    assert.equal(r.brand, "black-vault-apparel");
    assert.ok(Array.isArray(r.checks));
    const conn = r.checks.find((c) => c.id === "shopify_connection");
    const products = r.checks.find((c) => c.id === "products_active");
    assert.equal(conn?.status, "ok");
    assert.equal(products?.status, "ok");
  } finally {
    restore();
  }
});

test("getLaunchStatus warns when active count is between 1 and 4", async () => {
  const restore = installMockFetch([
    { url: "/shop.json", status: 200, body: { shop: { name: "BV" } } },
    { url: "/products/count.json", status: 200, body: { count: 2 } },
    { url: "/products.json", status: 200, body: { products: [] } },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    const products = r.checks.find((c) => c.id === "products_active");
    assert.equal(products?.status, "warn");
    assert.match(products?.detail ?? "", /\b2 active products\b/);
  } finally {
    restore();
  }
});

test("getLaunchStatus fails when Shopify returns 401", async () => {
  const restore = installMockFetch([
    { url: "/shop.json", status: 401, body: { errors: "Invalid API key or access token" } },
    { url: "/products/count.json", status: 401, body: {} },
    { url: "/products.json", status: 401, body: {} },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    const conn = r.checks.find((c) => c.id === "shopify_connection");
    assert.equal(conn?.status, "fail");
    assert.match(conn?.fix ?? "", /[Rr]e-authorize|invalid|revoked/);
    assert.equal(r.overall, "fail");
  } finally {
    restore();
  }
});

test("getLaunchStatus reports webhook secret as ok when env is set", async () => {
  const prev = process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET;
  process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET = "shpss_dummy_for_test";
  const restore = installMockFetch([
    { url: "/shop.json", status: 200, body: { shop: {} } },
    { url: "/products/count.json", status: 200, body: { count: 6 } },
    { url: "/products.json", status: 200, body: { products: [] } },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    const w = r.checks.find((c) => c.id === "webhook_secret");
    assert.equal(w?.status, "ok");
  } finally {
    if (prev === undefined) delete process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET;
    else process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET = prev;
    restore();
  }
});

test("operator_auth_secret check is fail on Vercel without secret", async () => {
  const prevVercel = process.env.VERCEL;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.OPERATOR_AUTH_SECRET;
  // Both VERCEL=1 AND NODE_ENV=production are required to simulate the
  // production Vercel runtime. VERCEL=1 alone also fires when .env.local
  // was pulled from prod to a dev box, so launch-status / middleware /
  // tenant-context / audit all gate on the pair to avoid that false
  // positive.
  process.env.VERCEL = "1";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  delete process.env.OPERATOR_AUTH_SECRET;
  const restore = installMockFetch([
    { url: "/shop.json", status: 200, body: { shop: {} } },
    { url: "/products/count.json", status: 200, body: { count: 6 } },
    { url: "/products.json", status: 200, body: { products: [] } },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    const a = r.checks.find((c) => c.id === "operator_auth_secret");
    assert.equal(a?.status, "fail");
    assert.match(a?.fix ?? "", /OPERATOR_AUTH_SECRET/);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    if (prevSecret !== undefined) process.env.OPERATOR_AUTH_SECRET = prevSecret;
    restore();
  }
});

test("required_env check fails when an expected key is missing", async () => {
  const prev = process.env.PRINTFUL_API_KEY;
  delete process.env.PRINTFUL_API_KEY;
  const restore = installMockFetch([
    { url: "/shop.json", status: 200, body: { shop: {} } },
    { url: "/products/count.json", status: 200, body: { count: 6 } },
    { url: "/products.json", status: 200, body: { products: [] } },
    { url: "restrepo.vercel.app/api/operator/state", status: 401, body: {} }
  ]);
  try {
    const r = await getLaunchStatus("black-vault-apparel");
    const env = r.checks.find((c) => c.id === "required_env");
    assert.equal(env?.status, "fail");
    assert.match(env?.detail ?? "", /PRINTFUL_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.PRINTFUL_API_KEY = prev;
    restore();
  }
});
