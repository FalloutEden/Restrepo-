// Tests for the operator hallucination guard.
//
// Replays the exact failure surface from the 2026-05-14 cold-start pentest
// (the dossier lives at .openclaw/research/operator-gaps-2026-05-14.md)
// plus negative cases that the guard must NOT false-positive on.
//
// Run with:
//   node --import tsx --test tests/operator-hallucination-guard.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  detectHallucinatedClaims,
  summarizeHallucination,
  type ToolCallTraceEntry
} from "../lib/operator-hallucination-guard";

// ── Helpers ───────────────────────────────────────────────────────────────

function okResult(name: string): ToolCallTraceEntry {
  return { name, input: {}, result: { ok: true } };
}
function errorResult(name: string, msg = "boom"): ToolCallTraceEntry {
  return { name, input: {}, result: { ok: false, error: msg } };
}

// ── The exact pentest scenario ────────────────────────────────────────────

test("gap-1 regression: 'File exported' after errored cerebro_query + search_cj_products is flagged", () => {
  const pentestText = `File exported. Drop it into your Obsidian vault and run \`graphify .\` to ingest.`;
  const trace: ToolCallTraceEntry[] = [
    errorResult("cerebro_query", "CEREBRO unavailable: spawnSync graphify ENOENT"),
    errorResult("search_cj_products", "EROFS: read-only file system, open '/var/task/.openclaw/cj-token.json'")
  ];

  const claims = detectHallucinatedClaims(pentestText, trace);
  assert.ok(claims.length > 0, "expected at least one hallucinated claim");
  const labels = claims.map((c) => c.label);
  assert.ok(
    labels.includes("claimed-file-export") || labels.includes("claimed-graphify-trigger"),
    `expected file-export or graphify-trigger label, got: ${labels.join(", ")}`
  );
});

test("gap-1: 'TL;DR ... File exported ... drop into Obsidian' fabricated success is flagged", () => {
  const realPentestText = `Here's the full gap dossier in CEREBRO-ingestable form. Save this as a markdown note...

File exported. Drop it into your Obsidian vault and run \`graphify .\` to ingest.

**TL;DR of what's in it:** 9 gaps, ranked.`;
  const trace: ToolCallTraceEntry[] = [
    { name: "record_note", input: { note: "..." }, result: { saved: true } }
  ];
  // record_note saving is fine. But "exported the file / wrote a markdown" is unbacked.
  const claims = detectHallucinatedClaims(realPentestText, trace);
  assert.ok(
    claims.some((c) => c.label === "claimed-file-export"),
    `expected claimed-file-export, got: ${claims.map((c) => c.label).join(", ")}`
  );
});

// ── No-tool-exists category: always flagged ───────────────────────────────

test("'I deployed to vercel' is always a hallucination — no deploy tool exists", () => {
  const claims = detectHallucinatedClaims("Done — pushed to production.", []);
  assert.ok(claims.some((c) => c.label === "claimed-deploy"));
});

test("'I registered the domain' is always a hallucination — human-only", () => {
  const claims = detectHallucinatedClaims("Great — I registered your domain.", []);
  assert.ok(claims.some((c) => c.label === "claimed-domain-action"));
});

test("'I submitted your Shopify Payments KYC' is always a hallucination — human-only", () => {
  const claims = detectHallucinatedClaims("Submitted the payments KYC for you.", []);
  assert.ok(claims.some((c) => c.label === "claimed-payments-kyc"));
});

test("'I ran graphify update' is always a hallucination — no graphify tool", () => {
  const claims = detectHallucinatedClaims("I ran graphify and the brain is now updated.", []);
  assert.ok(claims.some((c) => c.label === "claimed-graphify-trigger"));
});

test("'I emailed you' is always a hallucination — no chat email tool", () => {
  const claims = detectHallucinatedClaims("Sent you an email with the details.", []);
  assert.ok(claims.some((c) => c.label === "claimed-email-sent"));
});

// ── Conditional / future-tense phrasing: must NOT trigger ─────────────────

test("'I'll save a note' (future tense) does NOT trigger", () => {
  const claims = detectHallucinatedClaims("I'll save a note about that and circle back.", []);
  assert.equal(claims.length, 0, `unexpected claims: ${summarizeHallucination(claims)}`);
});

test("'I can publish the listing if you confirm' (conditional) does NOT trigger", () => {
  const claims = detectHallucinatedClaims("I can publish the listing if you confirm.", []);
  assert.equal(claims.length, 0);
});

test("'happy to push the file once you approve' (hypothetical) does NOT trigger", () => {
  const claims = detectHallucinatedClaims("Happy to push to production once you approve.", []);
  assert.equal(claims.length, 0);
});

test("'going to delete the draft' (future) does NOT trigger", () => {
  const claims = detectHallucinatedClaims("I'm going to delete that draft next.", []);
  assert.equal(claims.length, 0);
});

// ── Tool-backed claims: legitimate when tool succeeded ────────────────────

test("'Published the listing' is legitimate when publish_listing succeeded", () => {
  const claims = detectHallucinatedClaims("Published the listing.", [okResult("publish_listing")]);
  assert.equal(claims.length, 0, `unexpected claims: ${summarizeHallucination(claims)}`);
});

test("'Published the listing' is flagged when publish_listing errored", () => {
  const claims = detectHallucinatedClaims("Published the listing.", [errorResult("publish_listing", "401")]);
  assert.ok(claims.some((c) => c.label === "claimed-listing-published" && c.reason === "no-tool-succeeded"));
});

test("'Created the draft' legitimate when materialize_product succeeded", () => {
  const claims = detectHallucinatedClaims("Created the draft.", [okResult("materialize_product")]);
  assert.equal(claims.length, 0);
});

test("'Created the draft' flagged when materialize_product errored", () => {
  const claims = detectHallucinatedClaims("Created the draft.", [errorResult("materialize_product")]);
  assert.ok(claims.some((c) => c.label === "claimed-product-created"));
});

test("'Saved a note' legitimate when record_note succeeded", () => {
  const claims = detectHallucinatedClaims("Saved a note about that.", [okResult("record_note")]);
  assert.equal(claims.length, 0);
});

test("'Submitted a proposal' legitimate when propose_action succeeded", () => {
  const claims = detectHallucinatedClaims("Submitted a proposal.", [okResult("propose_action")]);
  assert.equal(claims.length, 0);
});

// ── Edge cases ────────────────────────────────────────────────────────────

test("Empty final text returns no claims", () => {
  assert.equal(detectHallucinatedClaims("", []).length, 0);
});

test("Mixed legitimate + hallucinated claims both reported correctly", () => {
  const text = `Published the listing. Also deployed to production for you.`;
  const claims = detectHallucinatedClaims(text, [okResult("publish_listing")]);
  assert.equal(claims.length, 1, "publish is legit, deploy is not");
  assert.equal(claims[0].label, "claimed-deploy");
});

test("Word 'saved' inside hypothetical does not trigger", () => {
  const claims = detectHallucinatedClaims("If you want, I can save a note for next time.", []);
  assert.equal(claims.length, 0);
});

test("Tool result with bare error field still counts as failed", () => {
  const trace: ToolCallTraceEntry[] = [
    { name: "record_note", input: {}, result: { error: "filesystem readonly" } }
  ];
  const claims = detectHallucinatedClaims("Saved a note for you.", trace);
  assert.ok(claims.some((c) => c.label === "claimed-note-saved"));
});

test("summarizeHallucination produces a one-line-per-claim string", () => {
  const claims = detectHallucinatedClaims(
    "Pushed to production. Registered the domain.",
    []
  );
  const summary = summarizeHallucination(claims);
  assert.ok(summary.length > 0);
  assert.equal(summary.split("\n").length, claims.length);
});

test("'wrote the file to disk' style is flagged when no file-writing tool ran", () => {
  const claims = detectHallucinatedClaims("Wrote the markdown to disk.", []);
  assert.ok(claims.some((c) => c.label === "claimed-file-export"));
});

test("'wrote the file' is legit when generate_policies succeeded", () => {
  const claims = detectHallucinatedClaims("Wrote the policy file.", [okResult("generate_policies")]);
  // The file-export pattern requires generate_policies in satisfiedBy — should be allowed.
  // But "policy file" contains "file" which the regex catches. Backed by generate_policies — legit.
  assert.equal(claims.filter((c) => c.label === "claimed-file-export").length, 0);
});
