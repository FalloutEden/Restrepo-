import test from "node:test";
import assert from "node:assert/strict";

import { withOpenAIRetry } from "../lib/openai-retry";

function createRateLimitError(retryAfter = "0") {
  return Object.assign(new Error("rate limited"), {
    status: 429,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "retry-after" ? retryAfter : null;
      }
    }
  });
}

test("withOpenAIRetry retries 429 responses and eventually succeeds", async () => {
  let attempts = 0;
  const retryEvents: number[] = [];

  const result = await withOpenAIRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw createRateLimitError();
      }

      return "ok";
    },
    {
      label: "test-call",
      onRetry: (event) => retryEvents.push(event.attempt)
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(retryEvents, [1, 2]);
});

test("withOpenAIRetry does not swallow non-rate-limit failures", async () => {
  await assert.rejects(
    withOpenAIRetry(
      async () => {
        throw new Error("boom");
      },
      { label: "test-call" }
    ),
    /boom/
  );
});
