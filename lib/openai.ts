import "server-only";

import OpenAI from "openai";

import { getActiveSpendKind, priceOpenAIImage, recordSpend } from "@/lib/spend-tracker";
import { FOUNDER_TENANT_ID, type TenantContext } from "@/lib/tenant-context";

// Tenant-aware OpenAI client resolution.
//
// Before BYOK this module constructed a single client from OPENAI_API_KEY at
// import time and threw if it was missing — which would crash a tenant-only
// deployment that never sets a founder key. Now clients are built lazily and
// cached per tenant: a real merchant's client uses their own openaiApiKey from
// the encrypted vault (no env fallback — billing safety); the founder falls
// back to OPENAI_API_KEY. Each client keeps the image-spend decoration, with
// spend attributed to the owning tenant.

function resolveOpenAIKey(tenantCtx?: TenantContext): string {
  if (tenantCtx && !tenantCtx.isFounder) return tenantCtx.requireSecret("openaiApiKey");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY environment variable.");
  return key;
}

// Wrap images.generate and images.edit to record per-image spend, attributed to
// `tenantId`. Default quality assumed "standard" since the codebase doesn't
// request HD; update the rate lookup in spend-tracker.ts if we move tiers.
function decorateForSpend(client: OpenAI, tenantId: string): OpenAI {
  const origGenerate = client.images.generate.bind(client.images);
  const origEdit = client.images.edit.bind(client.images);

  client.images.generate = (async (...args: Parameters<typeof origGenerate>) => {
    const capturedKind = getActiveSpendKind();
    const result = (await origGenerate(...args)) as unknown;
    const r = result as { data?: Array<unknown> };
    const count = Array.isArray(r?.data) ? r.data.length : 1;
    void recordSpend({
      provider: "openai",
      kind: capturedKind,
      model: "gpt-image-1",
      imageCount: count,
      imageQuality: "standard",
      costUsd: priceOpenAIImage("standard", count),
      tenantId
    }).catch(() => undefined);
    return result;
  }) as typeof origGenerate;

  client.images.edit = (async (...args: Parameters<typeof origEdit>) => {
    const capturedKind = getActiveSpendKind();
    const result = (await origEdit(...args)) as unknown;
    const r = result as { data?: Array<unknown> };
    const count = Array.isArray(r?.data) ? r.data.length : 1;
    void recordSpend({
      provider: "openai",
      kind: capturedKind,
      model: "gpt-image-1:edit",
      imageCount: count,
      imageQuality: "standard",
      costUsd: priceOpenAIImage("standard", count),
      tenantId
    }).catch(() => undefined);
    return result;
  }) as typeof origEdit;

  return client;
}

const _clients = new Map<string, OpenAI>();

/** Resolve a decorated OpenAI client for the given context. Tenants use their
 *  own key; founder/no-context uses the env key. Clients are cached per tenant
 *  so we don't rebuild + re-decorate on every call. */
export function resolveOpenAIClient(tenantCtx?: TenantContext): OpenAI {
  const tenantId = tenantCtx?.tenantId ?? FOUNDER_TENANT_ID;
  const cached = _clients.get(tenantId);
  if (cached) return cached;
  const client = decorateForSpend(new OpenAI({ apiKey: resolveOpenAIKey(tenantCtx) }), tenantId);
  _clients.set(tenantId, client);
  return client;
}

// Backward-compatible founder client. Lazy via a Proxy so importing this module
// never throws at load (only on first actual use without a founder key). Call
// sites that have a tenant context should prefer resolveOpenAIClient(tenantCtx).
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const client = resolveOpenAIClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  }
});

// Model used exclusively for image generation
export const IMAGE_MODEL = "gpt-image-1";
