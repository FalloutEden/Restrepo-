// Smoke test for the spend tracker. Runs ONE Claude call (cheap) and ONE
// gpt-image-1 generation, then summarizes spend. Verifies that the
// instrumentation in lib/claude.ts and lib/openai.ts is recording entries
// into .openclaw/operator/spend.jsonl.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/spend-smoke.ts

import { claude } from "../lib/claude";
import { openai, IMAGE_MODEL } from "../lib/openai";
import { summarizeSpend, withSpendKind } from "../lib/spend-tracker";

async function main() {
  console.log("[spend-smoke] starting");

  const before = await summarizeSpend();
  console.log(`[spend-smoke] BEFORE: total=$${before.totalUsd.toFixed(4)} entries=${before.entryCount}`);

  // 1 cheap Claude call (haiku) — tagged as a synthetic test kind
  await withSpendKind("smoke_test_claude", async () => {
    const r = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "Reply with the single word: yes" }]
    });
    const text = r.content.find((b) => b.type === "text");
    console.log(`[spend-smoke] claude says: ${text?.type === "text" ? text.text.trim() : "(no text)"}`);
  });

  // 1 cheap image generation
  await withSpendKind("smoke_test_image", async () => {
    const r = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt: "A single small black circle on a pure white background, minimalist, centered.",
      n: 1,
      size: "1024x1024"
    });
    console.log(`[spend-smoke] image generated: ${r.data?.length ?? 0} result(s)`);
  });

  const after = await summarizeSpend();
  console.log(`\n[spend-smoke] AFTER:  total=$${after.totalUsd.toFixed(4)} entries=${after.entryCount}`);
  console.log(`[spend-smoke] delta total: $${(after.totalUsd - before.totalUsd).toFixed(6)}`);
  console.log(`[spend-smoke] delta entries: +${after.entryCount - before.entryCount}`);
  console.log(`[spend-smoke] today: $${after.today.toFixed(4)}`);
  console.log(`[spend-smoke] byProvider:`, after.byProvider);
  console.log(`[spend-smoke] byKind (top 5):`);
  Object.entries(after.byKind)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([k, v]) => console.log(`  ${k}: $${v.toFixed(6)}`));
}

main().catch((e) => {
  console.error("[spend-smoke] FAILED:", e);
  process.exit(1);
});
