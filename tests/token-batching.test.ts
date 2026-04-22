import test from "node:test";
import assert from "node:assert/strict";

import { splitResearchExampleBatches, splitToBatches } from "../lib/token-batching";
import type { ResearchExample } from "../lib/market-intelligence";

function buildExample(title: string, note: string): ResearchExample {
  return {
    id: title,
    title,
    url: "",
    screenshotDataUrl: "",
    channel: "fiverr",
    niche: "automation",
    productFormat: "service",
    targetBuyer: "small businesses",
    deliverableType: "service package",
    whatLooksGood: note,
    sellabilityNotes: note,
    visualStyleNotes: "clean hierarchy",
    styleComments: "clear scope",
    notes: note,
    status: "approved",
    createdAt: new Date().toISOString()
  };
}

test("splitToBatches keeps each batch under the token limit", () => {
  const batches = splitToBatches(
    [
      { id: "a", tokens: 90 },
      { id: "b", tokens: 120 },
      { id: "c", tokens: 80 }
    ],
    200,
    (item) => item.tokens
  );

  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((batch) => batch.items.map((item) => item.id)),
    [["a"], ["b", "c"]]
  );
  assert.ok(batches.every((batch) => batch.estimatedTokens <= 200));
});

test("splitResearchExampleBatches splits oversized datasets into internal batches", () => {
  const datasets = [
    {
      key: "dataset-a",
      title: "Dataset A",
      estimatedTokens: 260,
      examples: [buildExample("one", "x".repeat(120)), buildExample("two", "y".repeat(120))]
    },
    {
      key: "dataset-b",
      title: "Dataset B",
      estimatedTokens: 80,
      examples: [buildExample("three", "z".repeat(40))]
    }
  ];

  const batches = splitResearchExampleBatches(datasets, 200);

  assert.equal(batches.length, 3);
  assert.deepEqual(batches[0].datasetKeys, ["dataset-a"]);
  assert.deepEqual(batches[2].datasetKeys, ["dataset-b"]);
  assert.ok(batches.every((batch) => batch.estimatedTokens <= 200));
});
