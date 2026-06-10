// File-mode regression tests for the autonomous-run-store Postgres migration
// (2026-06-10). The store now reads/writes through Postgres when POSTGRES_URL
// is set; with it unset it must behave exactly as before — in-memory Map backed
// by .openclaw/runs.json. These tests lock that dev path so the prod branch
// didn't break it. (The Postgres branch needs a live DB and is covered in
// staging, not here.)
//
// STORE_DIR is captured from process.cwd() at module load, so we swap cwd to a
// tmpdir and import the module dynamically AFTER the swap.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/autonomous-run-store.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let modPromise: Promise<{ mod: typeof import("../lib/autonomous-run-store"); dir: string }> | null = null;

function getMod() {
  if (modPromise) return modPromise;
  modPromise = (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runs-store-"));
    const realCwd = process.cwd.bind(process);
    process.cwd = () => dir;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    process.on("exit", () => {
      process.cwd = realCwd;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    });
    const mod = await import("../lib/autonomous-run-store");
    return { mod, dir };
  })();
  return modPromise;
}

test("file-mode run lifecycle: create → start → log → complete, readable throughout", async () => {
  const { mod } = await getMod();
  const rec = await mod.createAutonomousRunRecord({ goal: "test goal" }, [], "_founder");
  assert.equal(rec.status, "queued");
  assert.ok(rec.runId.startsWith("run_"));

  await mod.markAutonomousRunStarted(rec.runId, "pipeline starting");
  await mod.appendAutonomousRunLog(rec.runId, {
    id: "log_1",
    stage: "research",
    level: "info",
    timestamp: new Date().toISOString(),
    message: "scanning the market"
  });

  const mid = await mod.getAutonomousRunRecord(rec.runId);
  assert.equal(mid?.status, "running");
  assert.ok(mid?.events.some((e) => e.message === "scanning the market"));

  await mod.completeAutonomousRun(rec.runId, {
    goal: "test goal",
    maxProductsPerRun: 1,
    runtime: { researchSummary: "", sourceSignalSummary: [], agentRuns: [], materializedProducts: [] },
    logs: []
  });
  const done = await mod.getAutonomousRunRecord(rec.runId);
  assert.equal(done?.status, "completed");
});

test("unknown run id reads as null (not a throw)", async () => {
  const { mod } = await getMod();
  assert.equal(await mod.getAutonomousRunRecord("run_does_not_exist"), null);
});

test("events are cursor-sliceable for the SSE stream", async () => {
  const { mod } = await getMod();
  const rec = await mod.createAutonomousRunRecord({ goal: "g2" }, [], "tnt_aaaa");
  const ev = await mod.getAutonomousRunEvents(rec.runId, 0);
  assert.ok(ev);
  assert.equal(ev.runId, rec.runId);
  assert.ok(ev.events.length >= 1, "queued run should have at least the run-queued event");
  assert.equal(ev.nextCursor, ev.events.length);
});
