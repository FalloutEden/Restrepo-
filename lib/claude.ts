import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  getActiveSpendKind,
  getActiveTenantId,
  priceClaudeUsage,
  priceServerTool,
  recordSpend
} from "@/lib/spend-tracker";
import { FOUNDER_TENANT_ID, type TenantContext } from "@/lib/tenant-context";

// Anthropic clients, instrumented for spend tracking.
//
// Two access paths:
//
//   - `claude` (legacy export) — lazy founder/admin singleton. Used by all
//     pre-BYOK callers (copywriting, agent-runtime, launch-status, cron jobs).
//     Auth from process.env.ANTHROPIC_API_KEY. Throws on first use if the
//     env var is missing in production. Lazy-init via Proxy so a missing
//     key doesn't break tests or import-time evaluation.
//
//   - `claudeForTenant(ctx)` — per-tenant client. Used by the operator
//     agent loop and any tool that should bill against the calling
//     merchant's Anthropic account. The tenant must have configured an
//     anthropicApiKey secret; otherwise requireSecret throws with a clear
//     "configure in dashboard" message so we never silently charge the
//     founder's card. Founder context falls through to the same env var
//     the legacy `claude` export uses.
//
// Both paths share the same instrumentation: every messages.create response
// records spend tagged with the active kind (operator_chat, operator_tick,
// content_studio, etc.) AND the active tenantId, so per-tenant billing and
// cap enforcement work end-to-end.

const _tenantClients = new Map<string, Anthropic>();
let _founderClient: Anthropic | null = null;

/** Wrap a raw Anthropic client so every messages.create call records spend.
 *  The wrap reads currentKind + currentTenantId at the start of the call so
 *  fire-and-forget recordSpend Promises don't race the with*-wrapper exits. */
function instrumentClient(client: Anthropic): Anthropic {
  const originalCreate = client.messages.create.bind(client.messages);

  client.messages.create = (async (...args: Parameters<typeof originalCreate>) => {
    // Lock in tags synchronously — the with*-wrappers may exit before the
    // fire-and-forget recordSpend below actually runs.
    const capturedKind = getActiveSpendKind();
    const capturedTenant = getActiveTenantId();
    const result = (await originalCreate(...args)) as unknown;

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
        tenantId: capturedTenant,
        model: r.model,
        inputTokens: r.usage.input_tokens ?? 0,
        outputTokens: r.usage.output_tokens ?? 0,
        cacheCreationTokens: r.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
        costUsd: tokenCost
      }).catch(() => {
        // Never let a tracking failure break the actual call
      });

      // Server tool usage (web_search, web_fetch) — billed per call.
      const stu = r.usage.server_tool_use;
      if (stu) {
        if ((stu.web_search_requests ?? 0) > 0) {
          const c = priceServerTool("web_search", stu.web_search_requests ?? 0);
          void recordSpend({
            provider: "anthropic",
            kind: capturedKind,
            tenantId: capturedTenant,
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
            tenantId: capturedTenant,
            model: r.model,
            serverToolName: "web_fetch",
            serverToolUses: stu.web_fetch_requests ?? 0,
            costUsd: c
          }).catch(() => undefined);
        }
      }
    }
    return result;
  }) as typeof originalCreate;

  return client;
}

/** Build (or fetch from cache) the Anthropic client for the given tenant.
 *  Founder context uses the env-var key; tenant contexts use their own
 *  encrypted vault and have NO env fallback so they never silently spend
 *  on the founder's billing account. */
export function claudeForTenant(ctx: TenantContext): Anthropic {
  const cached = _tenantClients.get(ctx.tenantId);
  if (cached) return cached;

  const apiKey = ctx.requireSecret("anthropicApiKey");
  const client = instrumentClient(new Anthropic({ apiKey }));
  _tenantClients.set(ctx.tenantId, client);
  return client;
}

/** Reset the per-tenant client cache. Use after rotating a tenant's
 *  anthropicApiKey so subsequent calls pick up the new key. */
export function invalidateTenantClient(tenantId: string): void {
  _tenantClients.delete(tenantId);
  if (tenantId === FOUNDER_TENANT_ID) {
    _founderClient = null;
  }
}

/** Lazy founder client builder. Reads process.env.ANTHROPIC_API_KEY only
 *  on first use so missing-env-during-import doesn't crash module load
 *  (which would break tests and Vercel cold starts where the env var is
 *  legitimately unavailable). */
function getFounderClient(): Anthropic {
  if (_founderClient) return _founderClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY environment variable. " +
        "Set it for the founder/admin context, or use claudeForTenant(ctx) " +
        "for per-tenant calls."
    );
  }
  _founderClient = instrumentClient(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  return _founderClient;
}

// Legacy export — backward compat for every caller that imports `claude`
// directly. A Proxy forwards every property access to the lazily-built
// founder client, so the env-var check fires at first use instead of at
// import time.
export const claude: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, _receiver) {
    const target = getFounderClient() as unknown as Record<string | symbol, unknown>;
    return target[prop as string];
  }
});

// Model to use for all agent calls. Override via CLAUDE_MODEL env var if your
// account doesn't have access to the default (Anthropic returns 400 invalid model
// id when an alias isn't enabled for the account/plan).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-1";
