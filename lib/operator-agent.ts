import "server-only";

import { claude } from "@/lib/claude";
import { withClaudeRetry } from "@/lib/claude-retry";
import { withSpendKind } from "@/lib/spend-tracker";
import { BRANDS } from "@/lib/brands";
import {
  appendConversationMessage,
  readConversation,
  readOperatorState,
  readOperatorMemory,
  readOperatorKnowledge,
  patchOperatorState,
  logActivity,
  listProposals,
  listHumanTasks,
  type ChatMessage
} from "@/lib/operator-state";
import {
  OPERATOR_TOOLS,
  toAnthropicTools,
  getToolByName,
  type OperatorToolContext
} from "@/lib/operator-tools";

// Operator chat brain. Runs a tool-use loop against Claude — system prompt is
// rebuilt every turn from current operator state + memory + brand registry,
// so the model is always grounded in the latest reality (sales, drafts,
// pending proposals, things the user already rejected).

export const OPERATOR_MODEL = process.env.OPERATOR_MODEL?.trim() || "claude-opus-4-7";

const MAX_TOOL_HOPS = 8;
const MAX_TOKENS = 4096;

// ── System prompt ─────────────────────────────────────────────────────────

function brandsBlock() {
  return Object.values(BRANDS)
    .map((b) =>
      [
        `### ${b.name} (${b.slug})`,
        `- Tagline: ${b.tagline}`,
        `- Default fulfillment: ${b.defaultFulfillment}`,
        `- Audience: ${b.audience}`,
        `- Voice: ${b.voice}`
      ].join("\n")
    )
    .join("\n\n");
}

async function buildSystemPrompt(): Promise<string> {
  const [state, memory, knowledge, pendingProposals, openTasks] = await Promise.all([
    readOperatorState(),
    readOperatorMemory(),
    readOperatorKnowledge(),
    listProposals({ status: "pending" }),
    listHumanTasks({ status: "open" })
  ]);

  const recentRejections =
    state.rejectedProposals.length > 0
      ? state.rejectedProposals
          .slice(-10)
          .map((r) => `- ${r.id}: ${r.reason}`)
          .join("\n")
      : "_(none yet)_";

  const proposalsBlock =
    pendingProposals.length > 0
      ? pendingProposals
          .slice(0, 10)
          .map((p) => `- ${p.id}: "${p.title}" — $${p.estimatedCostUsd}`)
          .join("\n")
      : "_(no pending proposals)_";

  const tasksBlock =
    openTasks.length > 0
      ? openTasks
          .slice(0, 10)
          .map((t) => `- ${t.id}: ${t.title}`)
          .join("\n")
      : "_(no open tasks)_";

  return `You are the Black Vault Umbrella Operator — the managing director of Restrepo, a multi-brand commerce automation pipeline. You speak directly with the user (the founder, Karling). Your job: grow real revenue across the brands listed below, autonomously when you can, with the user's approval when money or customer-facing state changes.

## Brands
${brandsBlock()}

## What you can do without asking
- Create and manage Shopify drafts (drafts are not customer-facing — fully reversible).
- Source new products via CJ Dropshipping (categories, browsing).
- Delete dead-weight drafts.
- Materialize new product drafts (Printful for apparel under Black Vault, CJ for LockLayer).
- Read sales data and reason about it.
- Save notes to operator memory so future you knows what worked.
- Trigger the 11-agent research pipeline when the user explicitly asks for it.
- **Search the live web** (web_search) and **fetch specific URLs** (web_fetch) to research suppliers, competitors, market signals, MOQs, contact details. Use this when a research question is broader than the local tools cover — e.g. "find Portugal-based premium polo manufacturers with MOQ under 100" or "what does Lacoste use for their piqué polos." Don't shy away from these tools; they're the right answer for sourcing intelligence.

## What you MUST ask for first (use propose_action)
- Publishing any draft live (it goes customer-facing).
- Registering a new domain.
- Signing up for any paid tool or service.
- Spending real money on ads or third parties.
- Creating a new brand or splitting an existing one.
- Running the 11-agent pipeline on your own initiative (it costs ~$5 in Claude tokens per run; if the user didn't ask, propose it instead of just running it).

## How to write proposals
Every proposal goes through propose_action and lands in the user's approval inbox with an auto-generated markdown brief and CSV ROI sheet. Always include:
- estimatedCostUsd (real dollars at risk)
- unitCostUsd, retailPriceUsd (so per-unit margin is computable)
- projectedWeeklyVolume {low, mid, high}
- paybackWeeks
- humanFootwork[] — anything alongside approving (verifying details, taking a photo, signing)

If you don't have numbers, say so explicitly in the summary and propose how to get them rather than guessing.

## How to act
- Lead with the next concrete action, not with a question. If the user asks "what's worth doing today?" pick something and either do it (free actions) or propose it (spend-bound).
- Reason in plain English the user can read. No corporate fluff. If you don't know something, say "I don't know" — do not invent numbers.
- Before sourcing or materializing, check list_drafts so you don't duplicate.
- Before judging a listing, check get_recent_orders.
- When you spot something only the user can do (verify EIN, take a product photo, approve a paid signup), call request_human_input — do NOT ask in chat and lose track of it.
- When you learn something useful for future runs, call record_note.

## CRITICAL: brand fit and pipeline auditing

The 11-agent pipeline drifts toward generic Etsy/Fiverr/job-vocabulary slop. **It is your job to catch this.** The knowledge file below contains a complete list of anti-patterns. Specifically:

- Black Vault Apparel is **premium elevated-essentials** (Psycho Bunny / Aimé Leon Dore / James Perse / Travis Mathew tier). NEVER materialize occupation-specific apparel ("for nurses", "for veterans"), inspirational-quote tees, sticker packs, or service products under Black Vault.
- LockLayer is **practical home security hardware** (Wyze / Eufy / Ring tier). NEVER materialize apparel or digital products under LockLayer.
- After ANY pipeline run, you must call list_drafts and audit the new ones. Delete anything matching the anti-patterns in the knowledge file. This audit is non-negotiable — the pipeline auto-materializes 5 drafts per run, so 1 minute of slop creates 5 listings the user has to clean up.
- When you trigger run_pipeline, your responsibility doesn't end at "started." When the run finishes, audit the output before reporting back to the user.

## CRITICAL: supplier vetting before recommending

You will NEVER recommend a supplier, blank, platform, or specific product without running through the supplier-vetting checklist in the knowledge file. This includes: Printful blanks, Apliiq, TapStitch, Threadlogic, any new platform the user mentions or you discover. Verify all 7 dimensions: sizing reputation, brand visibility, quality reviews, fabric weight, Shopify integration, lead time, customization layer.

If a check can't be verified with web_search or web_fetch, say so explicitly and flag it to the user as a risk. Don't paper over uncertainty. The 2026-05-04 Under Armour mistake (recommending a branded blank for a private-label brand) and the near-miss with Apliiq's slim Gildan polo both came from skipping verification. Don't repeat them.

When the user asks about sourcing, your default should be: "let me web_search the sizing and quality reviews first" — not a recommendation off the top.

## Current state (rebuilt every turn)

**Last autonomous tick:** ${state.lastTickAt ?? "_never run_"}
**Last chat:** ${state.lastChatAt ?? "_never_"}

**Pending proposals (awaiting user approval):**
${proposalsBlock}

**Open human tasks:**
${tasksBlock}

**Recent rejections — do NOT re-propose without a materially different angle:**
${recentRejections}

## Operator memory (long-lived notes)

${memory || "_(empty — write your first note when you learn something worth keeping)_"}

## Curated knowledge (brand fit, suppliers, anti-patterns)

${knowledge || "_(no knowledge files yet — see .openclaw/operator/knowledge/ to add)_"}
`;
}

// ── Anthropic message shape helpers ────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

function persistedMessagesToAnthropic(history: ChatMessage[]): AnthropicMessage[] {
  // Persisted history is plain text turns. Tool calls happen inside a single
  // turn and aren't replayed back to the model — the system prompt summarizes
  // results via state instead. Keeping replay simple avoids state-shape drift.
  return history.map((m) => ({ role: m.role, content: m.content }));
}

// ── Agent loop ─────────────────────────────────────────────────────────────

export type AgentRunOptions = {
  conversationId: string;
  userMessage?: string; // omitted when running an autonomous tick
  source: "chat" | "tick";
  // Surfaced to the caller for streaming/UI updates.
  onEvent?: (event: AgentEvent) => void;
};

export type AgentEvent =
  | { kind: "thinking" }
  | { kind: "text_delta"; text: string }
  | { kind: "text_done"; text: string }
  | { kind: "tool_call"; name: string; input: Record<string, unknown> }
  | { kind: "tool_result"; name: string; resultPreview: string }
  | { kind: "error"; message: string }
  | { kind: "done"; finalText: string };

export async function runOperator(options: AgentRunOptions): Promise<{ finalText: string }> {
  return withSpendKind(options.source === "tick" ? "operator_tick" : "operator_chat", () =>
    runOperatorInner(options)
  );
}

async function runOperatorInner(options: AgentRunOptions): Promise<{ finalText: string }> {
  const { conversationId, userMessage, source, onEvent } = options;
  const tools = toAnthropicTools();
  const ctx: OperatorToolContext = { conversationId, source };

  // Persist the user turn first so the system prompt sees it (and so the
  // dashboard activity feed renders it even if the agent crashes mid-loop).
  if (userMessage) {
    await appendConversationMessage(conversationId, {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString()
    });
    await logActivity({ kind: "chat_user", message: userMessage });
  } else if (source === "tick") {
    await logActivity({ kind: "tick_started", message: "Autonomous tick started" });
  }

  const persisted = await readConversation(conversationId);
  const messages: AnthropicMessage[] = persistedMessagesToAnthropic(persisted);

  // For autonomous ticks, inject a synthetic user prompt so the model has
  // something to react to. The system prompt already loaded all the state.
  if (!userMessage && source === "tick") {
    messages.push({
      role: "user",
      content: `It's the daily autonomous tick. Review current state (drafts, recent orders, pending proposals, rejections). Decide on the highest-leverage next action that grows revenue across the brands. If it's a free action (sourcing, drafting, deleting dead-weight), do it via tools. If it's spend-bound, push a propose_action with a real ROI brief. End with a short status note for the user explaining what you did and why.`
    });
  }

  const system = await buildSystemPrompt();
  let finalText = "";
  const toolCallTrace: Array<{ name: string; input: Record<string, unknown>; result: unknown }> = [];

  // Anthropic-managed server tools — Claude calls them, Anthropic runs them,
  // results stream back as content blocks the model uses inline. We don't
  // dispatch these from our tool loop. Adding web_search + web_fetch lets the
  // operator research suppliers, market signals, competitor pricing, etc.
  // without us building a Tavily/SerpAPI integration. Costs ~$10/1k searches.
  const SERVER_TOOLS = [
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    { type: "web_fetch_20260309", name: "web_fetch", max_uses: 5 }
  ];
  const allTools = [...tools, ...SERVER_TOOLS] as import("@anthropic-ai/sdk/resources").ToolUnion[];

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop += 1) {
    onEvent?.({ kind: "thinking" });

    const response = await withClaudeRetry(
      () =>
        claude.messages.create({
          model: OPERATOR_MODEL,
          max_tokens: MAX_TOKENS,
          system,
          tools: allTools,
          messages: messages as import("@anthropic-ai/sdk/resources").MessageParam[]
        }),
      {
        label: "operator",
        onRetry: ({ attempt, delayMs }) => {
          onEvent?.({ kind: "error", message: `Rate limited, retrying (${attempt}, ${delayMs}ms)` });
        }
      }
    );

    const blocks = response.content as ContentBlock[];
    const textBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
    const toolUseBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    if (textBlocks.length > 0) {
      const text = textBlocks.map((b) => b.text).join("\n").trim();
      if (text) {
        finalText = text;
        onEvent?.({ kind: "text_done", text });
      }
    }

    // Append the assistant turn so the next round sees it.
    messages.push({ role: "assistant", content: blocks });

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      break;
    }

    // Execute every tool_use in parallel — they run on our infra, not the model's.
    const toolResults: ContentBlock[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        onEvent?.({ kind: "tool_call", name: block.name, input: block.input });
        const tool = getToolByName(block.name);
        if (!tool) {
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            is_error: true
          };
        }
        try {
          const result = await tool.run(block.input, ctx);
          toolCallTrace.push({ name: block.name, input: block.input, result });
          const serialized = JSON.stringify(result).slice(0, 8000);
          onEvent?.({ kind: "tool_result", name: block.name, resultPreview: serialized.slice(0, 240) });
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: serialized
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          toolCallTrace.push({ name: block.name, input: block.input, result: { error: msg } });
          onEvent?.({ kind: "tool_result", name: block.name, resultPreview: `error: ${msg}` });
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify({ error: msg }),
            is_error: true
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  // Persist the assistant turn (text + tool trace) so the next conversation
  // load reproduces it.
  if (finalText || toolCallTrace.length > 0) {
    await appendConversationMessage(conversationId, {
      role: "assistant",
      content: finalText || "(used tools without text response)",
      timestamp: new Date().toISOString(),
      toolCalls: toolCallTrace
    });
    await logActivity({
      kind: "chat_assistant",
      message: finalText.slice(0, 500) || `(tool-only turn, ${toolCallTrace.length} calls)`
    });
  }

  // Update state pointers.
  await patchOperatorState(
    source === "tick"
      ? { lastTickAt: new Date().toISOString() }
      : { lastChatAt: new Date().toISOString() }
  );

  if (source === "tick") {
    await logActivity({ kind: "tick_completed", message: finalText.slice(0, 300) || "tick done" });
  }

  onEvent?.({ kind: "done", finalText });
  return { finalText };
}
