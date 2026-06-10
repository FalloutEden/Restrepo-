// Tests for the tenant-safety gate that blocks credential-touching operator
// tools when invoked from a non-founder context. Until each underlying
// service lib (lib/shopify-credentials.ts, lib/cj-service.ts,
// lib/printful-service.ts, lib/klaviyo.ts) is refactored to accept per-tenant
// credentials, those tools are founder-only.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/tenant-tool-gate.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { tenantSafetyGate, type OperatorToolContext } from "../lib/operator-tools";
import { FOUNDER_TENANT_ID } from "../lib/tenant-context";

function founderCtx(): OperatorToolContext {
  return { source: "chat", conversationId: "conv_test", tenantId: FOUNDER_TENANT_ID };
}

function tenantCtx(): OperatorToolContext {
  return { source: "chat", conversationId: "conv_test", tenantId: "tnt_aaaa" };
}

// ── Founder context: no gating ───────────────────────────────────────────

test("founder context never gates any tool — legacy behavior preserved", () => {
  for (const tool of [
    "materialize_product",
    "publish_listing",
    "delete_listing",
    "bootstrap_store",
    "search_cj_products",
    "klaviyo_status",
    "get_recent_orders",
    "run_pipeline"
  ]) {
    assert.equal(tenantSafetyGate(tool, founderCtx()), null, `founder must pass ${tool}`);
  }
});

test("founder context with no tenantId also passes (defaults to founder)", () => {
  const ctx: OperatorToolContext = { source: "chat" };
  assert.equal(tenantSafetyGate("materialize_product", ctx), null);
});

// ── Tenant context: credential-touching tools are blocked ────────────────

test("tenant context blocks materialize_product (needs Printful BYOK on product-materialization.ts)", () => {
  const gated = tenantSafetyGate("materialize_product", tenantCtx());
  assert.ok(gated && gated.ok === false);
  assert.equal(gated?.error, "tenant-byok-pending");
  assert.match(gated?.message ?? "", /materialize_product/);
});

test("tenant context ALLOWS bootstrap_store (lifted 2026-06-10 — store-bootstrap.ts threads tenantCtx)", () => {
  assert.equal(tenantSafetyGate("bootstrap_store", tenantCtx()), null);
});

test("tenant context ALLOWS delete_listing (lifted 2026-06-10 — shopify-service already tenant-aware)", () => {
  assert.equal(tenantSafetyGate("delete_listing", tenantCtx()), null);
});

test("tenant context ALLOWS the Shopify-family tools lifted 2026-06-10", () => {
  for (const tool of [
    "list_menus",
    "add_menu_item",
    "remove_menu_item",
    "summarize_drafts",
    "launch_status",
    "generate_policies",
    "publish_policies"
  ]) {
    assert.equal(tenantSafetyGate(tool, tenantCtx()), null, `${tool} should be lifted for tenants`);
  }
});

// ── Lifted tools (Shopify read + non-destructive write) — must pass through ─

test("tenant context ALLOWS list_drafts (lifted 2026-05-14 once shopify-credentials.ts became tenant-aware)", () => {
  assert.equal(tenantSafetyGate("list_drafts", tenantCtx()), null);
});

test("tenant context ALLOWS get_recent_orders (lifted same migration)", () => {
  assert.equal(tenantSafetyGate("get_recent_orders", tenantCtx()), null);
});

test("tenant context ALLOWS list_cleanup_queue (lifted same migration)", () => {
  assert.equal(tenantSafetyGate("list_cleanup_queue", tenantCtx()), null);
});

test("tenant context ALLOWS publish_listing (lifted after shopify-service write fns accept tenantCtx)", () => {
  assert.equal(tenantSafetyGate("publish_listing", tenantCtx()), null);
});

test("tenant context ALLOWS attach_all_to_online_store (lifted same migration)", () => {
  assert.equal(tenantSafetyGate("attach_all_to_online_store", tenantCtx()), null);
});

test("tenant context ALLOWS relink_printful_variants (lifted after printful-link.ts migrated)", () => {
  assert.equal(tenantSafetyGate("relink_printful_variants", tenantCtx()), null);
});

test("tenant context blocks search_cj_products (needs CJ BYOK)", () => {
  const gated = tenantSafetyGate("search_cj_products", tenantCtx());
  assert.ok(gated && gated.ok === false);
});

test("tenant context blocks klaviyo_status (needs Klaviyo BYOK)", () => {
  const gated = tenantSafetyGate("klaviyo_status", tenantCtx());
  assert.ok(gated && gated.ok === false);
});

test("tenant context blocks run_pipeline (uses every credential type)", () => {
  const gated = tenantSafetyGate("run_pipeline", tenantCtx());
  assert.ok(gated && gated.ok === false);
});

test("tenant context blocks cerebro_query (gap 2: graphify not on Vercel)", () => {
  const gated = tenantSafetyGate("cerebro_query", tenantCtx());
  assert.ok(gated && gated.ok === false);
});

// ── Tenant context: tenant-safe tools pass through ───────────────────────

test("tenant context allows record_note (writes to tenant memory)", () => {
  assert.equal(tenantSafetyGate("record_note", tenantCtx()), null);
});

test("tenant context allows propose_action (writes to tenant proposals dir)", () => {
  assert.equal(tenantSafetyGate("propose_action", tenantCtx()), null);
});

test("tenant context allows request_human_input (writes to tenant tasks dir)", () => {
  assert.equal(tenantSafetyGate("request_human_input", tenantCtx()), null);
});

test("tenant context allows get_spend_summary (reads tenant spend log)", () => {
  assert.equal(tenantSafetyGate("get_spend_summary", tenantCtx()), null);
});

test("tenant context allows set_spend_budget (writes tenant budget file)", () => {
  assert.equal(tenantSafetyGate("set_spend_budget", tenantCtx()), null);
});

// ── Unknown tools pass through (handled separately as 'Unknown tool' error) ─

test("unknown tool name is not gated (the dispatcher handles missing tools)", () => {
  assert.equal(tenantSafetyGate("totally-fake-tool", tenantCtx()), null);
});

// ── Error message quality ────────────────────────────────────────────────

test("blocked error message tells the user which tools DO work for tenants", () => {
  const gated = tenantSafetyGate("materialize_product", tenantCtx());
  const msg = gated?.message ?? "";
  assert.match(msg, /record_note/);
  assert.match(msg, /propose_action/);
  assert.match(msg, /request_human_input/);
});

test("blocked error message names the platform that's pending BYOK migration", () => {
  const gated = tenantSafetyGate("materialize_product", tenantCtx());
  const msg = gated?.message ?? "";
  // Should mention at least one of: Shopify, Printful, CJ, Klaviyo, OpenAI
  assert.match(msg, /Shopify|Printful|CJ|Klaviyo|OpenAI/);
});
