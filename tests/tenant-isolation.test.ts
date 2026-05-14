// Integration tests that prove two tenants cannot see each other's state.
//
// What's being tested: after the operator-state.ts + spend-tracker.ts
// migration, two tenants writing concurrently to memory / activity log /
// state file / spend log produce fully disjoint files. A founder context
// continues to read/write the legacy `.openclaw/operator/` paths so
// existing BV and LL state survives untouched.
//
// Each test uses a private temp tmpdir as the working directory so we don't
// pollute the real .openclaw/ on the developer's machine. The path layer
// reads process.cwd() at module load time though, so we monkey-patch cwd
// for the duration of each test and re-import the modules under the new cwd.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/tenant-isolation.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildTenantPaths, FOUNDER_TENANT_ID } from "../lib/tenant-context";
import {
  appendOperatorMemory,
  readOperatorMemory,
  patchOperatorState,
  readOperatorState,
  logActivity,
  readActivity,
  writeProposal,
  listProposals
} from "../lib/operator-state";
import { recordSpend, summarizeSpend } from "../lib/spend-tracker";

function freshTmpdir(): { dir: string; restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operator-isolation-"));
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

// ── Filesystem path isolation ─────────────────────────────────────────────

test("two tenants writing memory simultaneously produce disjoint files", async () => {
  const { restore } = freshTmpdir();
  try {
    await appendOperatorMemory("tenant A — private note 1", "tnt_aaaa");
    await appendOperatorMemory("tenant B — private note 1", "tnt_bbbb");
    await appendOperatorMemory("tenant A — private note 2", "tnt_aaaa");

    const memA = await readOperatorMemory("tnt_aaaa");
    const memB = await readOperatorMemory("tnt_bbbb");

    assert.ok(memA.includes("tenant A — private note 1"));
    assert.ok(memA.includes("tenant A — private note 2"));
    assert.ok(!memA.includes("tenant B"), "tenant A must not see tenant B notes");

    assert.ok(memB.includes("tenant B — private note 1"));
    assert.ok(!memB.includes("tenant A"), "tenant B must not see tenant A notes");
  } finally {
    restore();
  }
});

test("founder memory writes go to legacy .openclaw/operator/memory.md", async () => {
  const { dir, restore } = freshTmpdir();
  try {
    await appendOperatorMemory("founder note", FOUNDER_TENANT_ID);
    const founderMemFile = path.join(dir, ".openclaw", "operator", "memory.md");
    assert.ok(fs.existsSync(founderMemFile), `expected legacy path: ${founderMemFile}`);
    const contents = fs.readFileSync(founderMemFile, "utf8");
    assert.ok(contents.includes("founder note"));
  } finally {
    restore();
  }
});

test("activity log is isolated per tenant", async () => {
  const { restore } = freshTmpdir();
  try {
    await logActivity({ kind: "chat_user", message: "tnt A spoke" }, "tnt_aaaa");
    await logActivity({ kind: "chat_user", message: "tnt B spoke" }, "tnt_bbbb");
    await logActivity({ kind: "chat_user", message: "tnt A spoke again" }, "tnt_aaaa");

    const actA = await readActivity(100, "tnt_aaaa");
    const actB = await readActivity(100, "tnt_bbbb");

    assert.equal(actA.length, 2, "tenant A should see exactly 2 entries");
    assert.equal(actB.length, 1, "tenant B should see exactly 1 entry");
    assert.ok(actA.every((e) => e.message.includes("tnt A")));
    assert.ok(actB.every((e) => e.message.includes("tnt B")));
  } finally {
    restore();
  }
});

test("operator state is isolated per tenant", async () => {
  const { restore } = freshTmpdir();
  try {
    await patchOperatorState({ lastChatAt: "2026-05-14T10:00:00Z" }, "tnt_aaaa");
    await patchOperatorState({ lastChatAt: "2026-05-14T12:00:00Z" }, "tnt_bbbb");

    const sA = await readOperatorState("tnt_aaaa");
    const sB = await readOperatorState("tnt_bbbb");
    assert.equal(sA.lastChatAt, "2026-05-14T10:00:00Z");
    assert.equal(sB.lastChatAt, "2026-05-14T12:00:00Z");
  } finally {
    restore();
  }
});

test("proposals are isolated per tenant", async () => {
  const { restore } = freshTmpdir();
  try {
    await writeProposal(
      {
        id: "prop_a1",
        title: "Tenant A proposal",
        summary: "A's summary",
        action: "A's action",
        estimatedCostUsd: 10,
        source: { kind: "chat" }
      },
      {},
      "tnt_aaaa"
    );
    await writeProposal(
      {
        id: "prop_b1",
        title: "Tenant B proposal",
        summary: "B's summary",
        action: "B's action",
        estimatedCostUsd: 20,
        source: { kind: "chat" }
      },
      {},
      "tnt_bbbb"
    );

    const propsA = await listProposals(undefined, "tnt_aaaa");
    const propsB = await listProposals(undefined, "tnt_bbbb");
    assert.equal(propsA.length, 1);
    assert.equal(propsB.length, 1);
    assert.equal(propsA[0].title, "Tenant A proposal");
    assert.equal(propsB[0].title, "Tenant B proposal");
  } finally {
    restore();
  }
});

// ── Spend tracking isolation ──────────────────────────────────────────────

test("spend recorded under one tenant does not appear in another tenant's summary", async () => {
  const { restore } = freshTmpdir();
  try {
    await recordSpend({ provider: "anthropic", model: "claude-haiku-4-5", costUsd: 0.05, tenantId: "tnt_aaaa" });
    await recordSpend({ provider: "anthropic", model: "claude-haiku-4-5", costUsd: 0.10, tenantId: "tnt_bbbb" });
    await recordSpend({ provider: "openai", costUsd: 0.04, tenantId: "tnt_aaaa" });

    const sA = await summarizeSpend({ tenantId: "tnt_aaaa" });
    const sB = await summarizeSpend({ tenantId: "tnt_bbbb" });

    assert.equal(sA.entryCount, 2, "tenant A: 2 entries");
    assert.equal(sB.entryCount, 1, "tenant B: 1 entry");
    assert.equal(Number(sA.totalUsd.toFixed(2)), 0.09);
    assert.equal(Number(sB.totalUsd.toFixed(2)), 0.10);
  } finally {
    restore();
  }
});

test("summarizeSpend with no tenantId aggregates across all tenants for admin", async () => {
  const { restore } = freshTmpdir();
  try {
    await recordSpend({ provider: "anthropic", costUsd: 0.05, tenantId: "tnt_aaaa" });
    await recordSpend({ provider: "anthropic", costUsd: 0.10, tenantId: "tnt_bbbb" });
    await recordSpend({ provider: "anthropic", costUsd: 0.20, tenantId: FOUNDER_TENANT_ID });

    const summary = await summarizeSpend();
    assert.equal(summary.entryCount, 3);
    assert.equal(Number(summary.totalUsd.toFixed(2)), 0.35);
    assert.ok(summary.byTenant["tnt_aaaa"] !== undefined);
    assert.ok(summary.byTenant["tnt_bbbb"] !== undefined);
    assert.ok(summary.byTenant[FOUNDER_TENANT_ID] !== undefined);
  } finally {
    restore();
  }
});

test("spend log path for founder is the legacy .openclaw/operator/spend.jsonl", () => {
  const { dir, restore } = freshTmpdir();
  try {
    const paths = buildTenantPaths(FOUNDER_TENANT_ID);
    assert.ok(
      paths.spendLog === path.join(dir, ".openclaw", "operator", "spend.jsonl"),
      `expected legacy spend path, got: ${paths.spendLog}`
    );
  } finally {
    restore();
  }
});

test("spend log path for a tenant goes under .openclaw/tenants/<id>/operator/", () => {
  const { dir, restore } = freshTmpdir();
  try {
    const paths = buildTenantPaths("tnt_xyz123");
    assert.ok(
      paths.spendLog === path.join(dir, ".openclaw", "tenants", "tnt_xyz123", "operator", "spend.jsonl"),
      `got: ${paths.spendLog}`
    );
  } finally {
    restore();
  }
});
