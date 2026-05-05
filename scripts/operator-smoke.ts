// Smoke test for the operator agent loop. Bypasses the HTTP layer entirely —
// just calls runOperator() and prints the streamed events to stdout. Use to
// verify the tool loop, system prompt, and Anthropic credentials before
// exposing the chat in the dashboard.
//
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/operator-smoke.ts
//   or pass a custom prompt: node ... scripts/operator-smoke.ts "delete drafts older than 30 days"

import { runOperator } from "../lib/operator-agent";
import { newId } from "../lib/operator-state";

async function main() {
  const userMessage =
    process.argv.slice(2).join(" ").trim() ||
    "List the current Shopify drafts across all brands and tell me which look like dead weight. Don't delete anything yet.";

  const conversationId = newId("smoke");
  console.log(`[smoke] conversation: ${conversationId}`);
  console.log(`[smoke] prompt:       ${userMessage}\n`);

  const result = await runOperator({
    conversationId,
    userMessage,
    source: "chat",
    onEvent: (event) => {
      switch (event.kind) {
        case "thinking":
          process.stdout.write("[smoke] thinking...\n");
          break;
        case "tool_call":
          console.log(`[smoke] → ${event.name}(${JSON.stringify(event.input).slice(0, 200)})`);
          break;
        case "tool_result":
          console.log(`[smoke] ← ${event.name}: ${event.resultPreview.slice(0, 200)}`);
          break;
        case "text_done":
          console.log(`\n[smoke] assistant:\n${event.text}\n`);
          break;
        case "error":
          console.error(`[smoke] ! ${event.message}`);
          break;
        case "done":
          // handled by main return
          break;
      }
    }
  });

  console.log(`\n[smoke] DONE — ${result.finalText.length} chars of final text`);
}

main().catch((error) => {
  console.error("[smoke] FAILED:", error);
  process.exit(1);
});
