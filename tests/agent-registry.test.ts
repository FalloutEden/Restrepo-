import test from "node:test";
import assert from "node:assert/strict";

import { REGISTERED_AGENT_DEFINITIONS, createQueuedAgentRuns } from "../lib/agent-registry";

test("agent registry exposes the five-stage autonomous product pipeline", () => {
  assert.deepEqual(
    REGISTERED_AGENT_DEFINITIONS.map((agent) => agent.id),
    ["research", "routing", "validation", "build", "output"]
  );

  const queued = createQueuedAgentRuns();
  assert.equal(queued.length, 5);
  assert.ok(queued.every((run) => run.status === "queued"));
});
