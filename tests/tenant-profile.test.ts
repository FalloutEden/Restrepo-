// Tests for the tenant brand profile module (gap 3 of the BYOK
// launch-gate dossier — turn-1 intake state).
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/tenant-profile.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readTenantProfile,
  patchTenantProfile,
  isProfileComplete,
  summarizeProfileStatus
} from "../lib/tenant-profile";
import { FOUNDER_TENANT_ID } from "../lib/tenant-context";

function freshTmpdir(): { dir: string; restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-profile-"));
  const realCwd = process.cwd.bind(process);
  process.cwd = () => dir;
  return {
    dir,
    restore: () => {
      process.cwd = realCwd;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  };
}

// ── Read/write round-trip ──────────────────────────────────────────────

test("readTenantProfile returns null for a tenant with no profile yet", async () => {
  const { restore } = freshTmpdir();
  try {
    const p = await readTenantProfile("tnt_brand_new");
    assert.equal(p, null);
  } finally {
    restore();
  }
});

test("patchTenantProfile creates the file on first write", async () => {
  const { restore } = freshTmpdir();
  try {
    const p = await patchTenantProfile({ brandName: "Pawvault" }, "tnt_pv");
    assert.equal(p.brandName, "Pawvault");
    assert.ok(p.updatedAt);

    const reread = await readTenantProfile("tnt_pv");
    assert.equal(reread?.brandName, "Pawvault");
  } finally {
    restore();
  }
});

test("incremental patches accumulate (intake flow pattern)", async () => {
  const { restore } = freshTmpdir();
  try {
    await patchTenantProfile({ brandName: "Pawvault" }, "tnt_pv");
    await patchTenantProfile({ audience: "design-conscious dog owners 28-50" }, "tnt_pv");
    await patchTenantProfile({ voice: "premium-restrained, materials-led" }, "tnt_pv");
    const final = await patchTenantProfile({ fulfillment: "cj-dropship" }, "tnt_pv");

    assert.equal(final.brandName, "Pawvault");
    assert.equal(final.audience, "design-conscious dog owners 28-50");
    assert.equal(final.voice, "premium-restrained, materials-led");
    assert.equal(final.fulfillment, "cj-dropship");
    assert.ok(final.completedAt, "completedAt should auto-set when all 4 required fields present");
  } finally {
    restore();
  }
});

test("completedAt is set as soon as the four required fields are filled", async () => {
  const { restore } = freshTmpdir();
  try {
    const p1 = await patchTenantProfile(
      { brandName: "X", audience: "a", voice: "v" },
      "tnt_a"
    );
    assert.ok(!p1.completedAt, "no completedAt yet — fulfillment missing");

    const p2 = await patchTenantProfile({ fulfillment: "printful" }, "tnt_a");
    assert.ok(p2.completedAt, "completedAt set on the patch that filled the last field");
  } finally {
    restore();
  }
});

test("notes are deduplicated and capped to last 20", async () => {
  const { restore } = freshTmpdir();
  try {
    const many = Array.from({ length: 30 }, (_, i) => `note ${i}`);
    const final = await patchTenantProfile({ notes: many }, "tnt_a");
    assert.equal(final.notes?.length, 20);
    // Should keep the LATEST 20
    assert.ok(final.notes?.includes("note 29"));
    assert.ok(!final.notes?.includes("note 0"));

    // Duplicate write does not double-count
    const after = await patchTenantProfile({ notes: ["note 29", "note 30"] }, "tnt_a");
    const noteCount = (after.notes ?? []).filter((n) => n === "note 29").length;
    assert.equal(noteCount, 1, "duplicate dedup'd");
  } finally {
    restore();
  }
});

// ── isProfileComplete ─────────────────────────────────────────────────

test("isProfileComplete: empty / null → false", () => {
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete({ updatedAt: "" }), false);
});

test("isProfileComplete: missing fulfillment → false", () => {
  assert.equal(
    isProfileComplete({
      updatedAt: "x",
      brandName: "X",
      audience: "a",
      voice: "v"
    }),
    false
  );
});

test("isProfileComplete: fulfillment='unknown' → false", () => {
  assert.equal(
    isProfileComplete({
      updatedAt: "x",
      brandName: "X",
      audience: "a",
      voice: "v",
      fulfillment: "unknown"
    }),
    false
  );
});

test("isProfileComplete: all four required + valid fulfillment → true", () => {
  assert.equal(
    isProfileComplete({
      updatedAt: "x",
      brandName: "X",
      audience: "a",
      voice: "v",
      fulfillment: "printful"
    }),
    true
  );
});

// ── summarizeProfileStatus ─────────────────────────────────────────────

test("summarizeProfileStatus(null) flags all four fields missing", () => {
  const s = summarizeProfileStatus(null);
  assert.equal(s.hasProfile, false);
  assert.equal(s.isComplete, false);
  assert.deepEqual(s.missing, ["brandName", "audience", "voice", "fulfillment"]);
});

test("summarizeProfileStatus with partial profile lists exactly missing fields", () => {
  const s = summarizeProfileStatus({
    updatedAt: "x",
    brandName: "Pawvault",
    audience: "dog owners"
    // voice + fulfillment missing
  });
  assert.equal(s.hasProfile, true);
  assert.equal(s.isComplete, false);
  assert.deepEqual(s.missing, ["voice", "fulfillment"]);
  assert.equal(s.brandName, "Pawvault");
});

test("summarizeProfileStatus with complete profile says isComplete + no missing", () => {
  const s = summarizeProfileStatus({
    updatedAt: "x",
    brandName: "Pawvault",
    audience: "dog owners",
    voice: "premium-restrained",
    fulfillment: "cj-dropship"
  });
  assert.equal(s.isComplete, true);
  assert.deepEqual(s.missing, []);
});

// ── Founder context ─────────────────────────────────────────────────

test("founder profile is stored under .openclaw/operator/ (legacy path)", async () => {
  const { dir, restore } = freshTmpdir();
  try {
    await patchTenantProfile({ brandName: "Black Vault" }, FOUNDER_TENANT_ID);
    const founderFile = path.join(dir, ".openclaw", "operator", "profile.json");
    assert.ok(fs.existsSync(founderFile));
  } finally {
    restore();
  }
});

test("tenant profile is stored under .openclaw/tenants/<id>/operator/", async () => {
  const { dir, restore } = freshTmpdir();
  try {
    await patchTenantProfile({ brandName: "Pawvault" }, "tnt_pv");
    const tenantFile = path.join(dir, ".openclaw", "tenants", "tnt_pv", "operator", "profile.json");
    assert.ok(fs.existsSync(tenantFile));
  } finally {
    restore();
  }
});

test("two tenants writing profiles concurrently do not collide", async () => {
  const { restore } = freshTmpdir();
  try {
    await Promise.all([
      patchTenantProfile({ brandName: "Pawvault" }, "tnt_a"),
      patchTenantProfile({ brandName: "StoneAndSteel" }, "tnt_b")
    ]);

    const pa = await readTenantProfile("tnt_a");
    const pb = await readTenantProfile("tnt_b");
    assert.equal(pa?.brandName, "Pawvault");
    assert.equal(pb?.brandName, "StoneAndSteel");
  } finally {
    restore();
  }
});

// ── Knowledge slicing (gap 6) ─────────────────────────────────────────

test("knowledge loader: tenants get meta-rules but NOT flat or founder-brand files", async () => {
  // Set up a tmp .openclaw/operator/knowledge/ with one of each kind
  const { dir, restore } = freshTmpdir();
  try {
    const kdir = path.join(dir, ".openclaw", "operator", "knowledge");
    fs.mkdirSync(path.join(kdir, "meta-rules"), { recursive: true });
    fs.mkdirSync(path.join(kdir, "brands", "black-vault"), { recursive: true });
    fs.writeFileSync(path.join(kdir, "meta-rules", "universal.md"), "UNIVERSAL_RULE_TOKEN");
    fs.writeFileSync(path.join(kdir, "brands", "black-vault", "bv-lore.md"), "BV_LORE_TOKEN");
    fs.writeFileSync(path.join(kdir, "flat-legacy.md"), "FLAT_LEGACY_TOKEN");

    // Lazy-import here so the module picks up the patched cwd
    const mod = await import("../lib/operator-state.ts?slice-test=" + Date.now());
    // The dynamic import bust may or may not work depending on tsx caching;
    // re-importing the same module returns the cached one. Read with the
    // already-imported path that operator-state uses (process.cwd()-based).
    const { readOperatorKnowledge } = mod as typeof import("../lib/operator-state");

    // Founder sees all three slices
    const founderKnowledge = await readOperatorKnowledge(FOUNDER_TENANT_ID);
    assert.ok(founderKnowledge.includes("UNIVERSAL_RULE_TOKEN"), "founder should see meta-rules");
    assert.ok(founderKnowledge.includes("BV_LORE_TOKEN"), "founder should see brands/black-vault");
    assert.ok(founderKnowledge.includes("FLAT_LEGACY_TOKEN"), "founder should see flat legacy");

    // Note: we cannot easily simulate a real tenant here because that requires
    // a tenant record in storage. The tenant code path in readOperatorKnowledge
    // calls getTenant() which would return null in this isolated tmpdir, so
    // the brand-scoped slice gets skipped. The important property — tenants
    // do NOT see flat-legacy files — is covered by the next test.
  } finally {
    restore();
  }
});

test("knowledge loader: tenant without a matching brand directory sees only meta-rules", async () => {
  const { dir, restore } = freshTmpdir();
  try {
    const kdir = path.join(dir, ".openclaw", "operator", "knowledge");
    fs.mkdirSync(path.join(kdir, "meta-rules"), { recursive: true });
    fs.writeFileSync(path.join(kdir, "meta-rules", "universal.md"), "META_TOKEN");
    fs.writeFileSync(path.join(kdir, "flat-legacy.md"), "FLAT_TOKEN");

    const { readOperatorKnowledge } = await import("../lib/operator-state");
    // Tenant id with no matching tenant record in storage — branch returns
    // null for brandSlug, so we still get meta-rules + skip flat (since
    // it's tenant context, not founder).
    const tenantKnowledge = await readOperatorKnowledge("tnt_unknown");
    assert.ok(tenantKnowledge.includes("META_TOKEN"), "tenant must see meta-rules");
    assert.ok(!tenantKnowledge.includes("FLAT_TOKEN"), "tenant must NOT see flat legacy files");
  } finally {
    restore();
  }
});
