// Run the daily autonomous tick locally (no HTTP). Use this to test what the
// operator does on its own before scheduling it via cron / Vercel Cron / etc.
//
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/operator-tick.ts

import { runOperator } from "../lib/operator-agent";

async function main() {
  const conversationId = `tick_${new Date().toISOString().slice(0, 10)}`;
  console.log(`[tick] starting — conversation ${conversationId}`);
  const result = await runOperator({
    conversationId,
    source: "tick",
    onEvent: (event) => {
      switch (event.kind) {
        case "tool_call":
          console.log(`[tick] → ${event.name}`);
          break;
        case "tool_result":
          console.log(`[tick] ← ${event.name}: ${event.resultPreview.slice(0, 200)}`);
          break;
        case "text_done":
          console.log(`\n[tick] reasoning:\n${event.text}\n`);
          break;
        case "error":
          console.error(`[tick] ! ${event.message}`);
          break;
        case "done":
          break;
      }
    }
  });
  console.log(`\n[tick] DONE — ${result.finalText.length} chars of final text`);
}

main().catch((error) => {
  console.error("[tick] FAILED:", error);
  process.exit(1);
});
