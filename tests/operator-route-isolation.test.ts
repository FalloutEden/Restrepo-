// Route-level isolation regression tests for the 2026-06-10 security sprint.
//
// Background: middleware.ts lets any btk_* tenant bearer through to every API
// route, on the contract that each route handler resolves the tenant itself.
// Several operator routes never did — they called operator-state functions with
// no tenantId, which defaults to FOUNDER_TENANT_ID. So a tenant bearer hitting
// GET /api/operator/state read the FOUNDER's proposals/tasks/activity, and the
// product routes let a tenant mutate a founder brand's Shopify store.
//
// These tests exercise the REAL path end-to-end: route handler →
// resolveTenantContext → getTenantByBearer (file store) → tenant-scoped
// operator-state. No mocking of the auth layer.
//
// tenancy.ts captures TENANTS_DIR from process.cwd() at module-load time, so we
// swap cwd to a private tmpdir and dynamically import every module AFTER the
// swap. cwd stays swapped for the whole file; each test makes its own tenant.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/operator-route-isolation.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── One private world for the whole file, bound before the first import ──────
//
// tsx transpiles this file to CJS (the test harness uses CJS --require
// preloads), so top-level await isn't available. We lazily build the world on
// first use instead: swap cwd, then dynamically import every module so they
// bind to the swapped cwd. Memoized so all tests share one world.

type World = {
  createTenant: typeof import("../lib/tenancy").createTenant;
  writeProposal: typeof import("../lib/operator-state").writeProposal;
  FOUNDER_TENANT_ID: string;
  stateRoute: typeof import("../app/api/operator/state/route");
  materializeRoute: typeof import("../app/api/products/materialize/route");
  productRoute: typeof import("../app/api/products/[id]/route");
};

let worldPromise: Promise<World> | null = null;

function getWorld(): Promise<World> {
  if (worldPromise) return worldPromise;
  worldPromise = (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operator-route-iso-"));
    const realCwd = process.cwd.bind(process);
    process.cwd = () => dir;
    // Force the file-backed tenancy/state stores (no Postgres), and make sure
    // the VERCEL flag doesn't redirect paths to /tmp.
    delete process.env.VERCEL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    process.on("exit", () => {
      process.cwd = realCwd;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    });

    const { createTenant } = await import("../lib/tenancy");
    const { writeProposal } = await import("../lib/operator-state");
    const { FOUNDER_TENANT_ID } = await import("../lib/tenant-context");
    const stateRoute = await import("../app/api/operator/state/route");
    const materializeRoute = await import("../app/api/products/materialize/route");
    const productRoute = await import("../app/api/products/[id]/route");
    return { createTenant, writeProposal, FOUNDER_TENANT_ID, stateRoute, materializeRoute, productRoute };
  })();
  return worldPromise;
}

function bearerRequest(url: string, bearer?: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request(url, { ...init, headers });
}

function seedProposal(
  writeProposal: World["writeProposal"],
  tenantId: string,
  id: string,
  title: string
) {
  return writeProposal(
    {
      id,
      title,
      summary: `${title} summary`,
      action: `${title} action`,
      estimatedCostUsd: 1,
      source: { kind: "chat" }
    },
    {},
    tenantId
  );
}

// ── /api/operator/state ─────────────────────────────────────────────────────

test("operator/state: a tenant bearer never sees the founder's proposals", async () => {
  const w = await getWorld();
  await seedProposal(w.writeProposal, w.FOUNDER_TENANT_ID, "prop_founder_secret", "Founder-only proposal");

  const tenant = await w.createTenant({
    brandSlug: "isolation-tenant-a",
    ownerEmail: "a@example.com",
    brandName: "Tenant A"
  });

  const res = await w.stateRoute.GET(
    bearerRequest("http://localhost/api/operator/state", tenant.bearerToken)
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { pendingProposals: Array<{ id: string }> };

  const ids = body.pendingProposals.map((p) => p.id);
  assert.ok(
    !ids.includes("prop_founder_secret"),
    `LEAK: tenant saw founder proposal — ids=${JSON.stringify(ids)}`
  );
  assert.equal(body.pendingProposals.length, 0, "tenant A has no proposals of its own yet");
});

test("operator/state: a tenant sees ONLY its own proposals", async () => {
  const w = await getWorld();
  const tenant = await w.createTenant({
    brandSlug: "isolation-tenant-b",
    ownerEmail: "b@example.com",
    brandName: "Tenant B"
  });
  await seedProposal(w.writeProposal, tenant.id, "prop_b_only", "Tenant B proposal");

  const res = await w.stateRoute.GET(
    bearerRequest("http://localhost/api/operator/state", tenant.bearerToken)
  );
  const body = (await res.json()) as { pendingProposals: Array<{ id: string; title: string }> };
  assert.equal(body.pendingProposals.length, 1);
  assert.equal(body.pendingProposals[0].id, "prop_b_only");
});

test("operator/state: the founder (no bearer) still sees the founder's proposals", async () => {
  const w = await getWorld();
  const res = await w.stateRoute.GET(bearerRequest("http://localhost/api/operator/state"));
  const body = (await res.json()) as { pendingProposals: Array<{ id: string }> };
  const ids = body.pendingProposals.map((p) => p.id);
  assert.ok(ids.includes("prop_founder_secret"), "founder must still see its own proposal");
});

// ── Founder-only product routes ─────────────────────────────────────────────

test("products/materialize: a tenant bearer is forbidden (founder-brand mutation)", async () => {
  const w = await getWorld();
  const tenant = await w.createTenant({
    brandSlug: "isolation-tenant-c",
    ownerEmail: "c@example.com",
    brandName: "Tenant C"
  });
  const res = await w.materializeRoute.POST(
    bearerRequest("http://localhost/api/products/materialize", tenant.bearerToken, {
      method: "POST",
      body: JSON.stringify({ products: [{ title: "x" }] })
    })
  );
  assert.equal(res.status, 403);
});

test("products/materialize: the founder passes the gate (400 on empty batch, not 403)", async () => {
  const w = await getWorld();
  const res = await w.materializeRoute.POST(
    bearerRequest("http://localhost/api/products/materialize", undefined, {
      method: "POST",
      body: JSON.stringify({ products: [] })
    })
  );
  assert.equal(res.status, 400); // got past the founder gate; rejected for empty array
});

test("products/[id] DELETE: a tenant bearer is forbidden", async () => {
  const w = await getWorld();
  const tenant = await w.createTenant({
    brandSlug: "isolation-tenant-d",
    ownerEmail: "d@example.com",
    brandName: "Tenant D"
  });
  const res = await w.productRoute.DELETE(
    bearerRequest("http://localhost/api/products/123?brand=black-vault-apparel", tenant.bearerToken, {
      method: "DELETE"
    }),
    { params: Promise.resolve({ id: "123" }) }
  );
  assert.equal(res.status, 403);
});

test("products/[id] DELETE: the founder passes the gate (400 on invalid id, not 403)", async () => {
  const w = await getWorld();
  const res = await w.productRoute.DELETE(
    bearerRequest("http://localhost/api/products/notanumber", undefined, { method: "DELETE" }),
    { params: Promise.resolve({ id: "notanumber" }) }
  );
  assert.equal(res.status, 400); // got past the founder gate; rejected for bad id
});
