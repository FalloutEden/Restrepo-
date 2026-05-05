import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { getActiveSpendKind, priceClaudeUsage, priceServerTool, recordSpend } from "@/lib/spend-tracker";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
}

// Raw Anthropic client. Wrapped below so every messages.create call is
// instrumented for spend tracking — we read input_tokens, output_tokens,
// cache_*, and any server_tool_use blocks from the response.
const _claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Bind the original method before overwriting it so we can call through.
const _originalCreate = _claude.messages.create.bind(_claude.messages);

_claude.messages.create = (async (...args: Parameters<typeof _originalCreate>) => {
  // Capture the active spend kind synchronously, BEFORE we await the API.
  // recordSpend below fires in a fire-and-forget Promise, so by the time it
  // runs, the withSpendKind block may have exited and currentKind may have
  // changed. Lock the kind in here.
  const capturedKind = getActiveSpendKind();
  const result = (await _originalCreate(...args)) as unknown;

  // Some overloads return AsyncIterable<...> for streaming. Spend tracking
  // only fires for non-streaming responses since usage isn't known until the
  // stream completes. The codebase doesn't use streaming today; if added
  // later, instrument by accumulating the message_delta usage at stream end.
  type MaybeMessage = {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
    };
    content?: Array<{ type?: string; name?: string; tool_use_id?: string }>;
  };

  const r = result as MaybeMessage;
  if (r && r.usage && typeof r.usage === "object") {
    const tokenCost = priceClaudeUsage({
      model: r.model,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheCreationTokens: r.usage.cache_creation_input_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens
    });
    void recordSpend({
      provider: "anthropic",
      kind: capturedKind,
      model: r.model,
      inputTokens: r.usage.input_tokens ?? 0,
      outputTokens: r.usage.output_tokens ?? 0,
      cacheCreationTokens: r.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      costUsd: tokenCost
    }).catch(() => {
      // never let a tracking failure break the actual call
    });

    // Server tool usage (web_search, web_fetch) — billed per call.
    const stu = r.usage.server_tool_use;
    if (stu) {
      if ((stu.web_search_requests ?? 0) > 0) {
        const c = priceServerTool("web_search", stu.web_search_requests ?? 0);
        void recordSpend({
          provider: "anthropic",
          kind: capturedKind,
          model: r.model,
          serverToolName: "web_search",
          serverToolUses: stu.web_search_requests ?? 0,
          costUsd: c
        }).catch(() => undefined);
      }
      if ((stu.web_fetch_requests ?? 0) > 0) {
        const c = priceServerTool("web_fetch", stu.web_fetch_requests ?? 0);
        void recordSpend({
          provider: "anthropic",
          kind: capturedKind,
          model: r.model,
          serverToolName: "web_fetch",
          serverToolUses: stu.web_fetch_requests ?? 0,
          costUsd: c
        }).catch(() => undefined);
      }
    }
  }
  return result;
}) as typeof _originalCreate;

export const claude = _claude;

// Model to use for all agent calls. Override via CLAUDE_MODEL env var if your
// account doesn't have access to the default (Anthropic returns 400 invalid model
// id when an alias isn't enabled for the account/plan).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-1";
