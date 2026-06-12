import "server-only";

import type { TenantContext } from "@/lib/tenant-context";

// Minimal Klaviyo Admin API client. Used by the operator agent's Klaviyo
// tools (status check, test contact push, metrics read) and any future
// Vercel-side webhook handlers that need to push subscribers.
//
// Auth: Bearer with the Private API key. Tenant-aware: a real merchant's key
//       comes from their encrypted vault (no env fallback — billing safety);
//       the founder falls back to KLAVIYO_API_KEY in env.
// Rev:  Klaviyo's API is versioned by `revision` header — pin to a known-
//       stable version so server upgrades don't silently change behavior.

const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function resolveKlaviyoKey(tenantCtx?: TenantContext): string {
  if (tenantCtx && !tenantCtx.isFounder) return tenantCtx.requireSecret("klaviyoApiKey");
  const key = process.env.KLAVIYO_API_KEY?.trim();
  if (!key) throw new Error("Missing KLAVIYO_API_KEY in env.");
  return key;
}

function authHeaders(tenantCtx?: TenantContext): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${resolveKlaviyoKey(tenantCtx)}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json"
  };
}

async function klaviyo<T>(
  path: string,
  init: RequestInit = {},
  tenantCtx?: TenantContext
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const r = await fetch(`${KLAVIYO_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(tenantCtx), ...(init.headers ?? {}) }
    });
    const text = await r.text();
    if (!r.ok) {
      return { ok: false, status: r.status, error: text || `Klaviyo ${r.status}` };
    }
    return { ok: true, data: text ? (JSON.parse(text) as T) : ({} as T) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "unknown" };
  }
}

// ── Health check ───────────────────────────────────────────────────────────

export type KlaviyoHealthReport = {
  ok: boolean;
  accountId?: string;
  organizationName?: string;
  domain?: { name: string; verified: boolean } | null;
  publicApiKey?: string;
  detail: string;
};

export async function klaviyoHealthCheck(tenantCtx?: TenantContext): Promise<KlaviyoHealthReport> {
  // Hit /lists/ instead of /accounts/ since the operator's API key is
  // scoped without Accounts:Read (intentionally — we follow least-privilege
  // and Accounts has no operationally useful info that justifies the scope).
  // Lists is covered by the Lists:Read/Write grant we DO have.
  const r = await klaviyo<{
    data: Array<{ id: string; attributes: { name: string } }>;
    meta?: { total_count?: number };
  }>("/lists/?page[size]=1", {}, tenantCtx);
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        detail: `Klaviyo auth failed (${r.status}). Check KLAVIYO_API_KEY scopes — needs at minimum Lists:Read.`
      };
    }
    return {
      ok: false,
      detail: `Klaviyo lists fetch failed (${r.status}): ${r.error.slice(0, 200)}`
    };
  }
  return {
    ok: true,
    detail: `Klaviyo API key is live. Found ${r.data.data.length} list(s) accessible (response includes ${r.data.meta?.total_count ?? "?"} total).`
  };
}

// ── Lists ──────────────────────────────────────────────────────────────────

export type KlaviyoList = { id: string; name: string; created: string; updated: string };

export async function klaviyoListLists(tenantCtx?: TenantContext): Promise<KlaviyoList[]> {
  const r = await klaviyo<{
    data: Array<{
      id: string;
      attributes: { name: string; created: string; updated: string };
    }>;
  }>("/lists/", {}, tenantCtx);
  if (!r.ok) throw new Error(`Klaviyo lists fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
  return r.data.data.map((l) => ({
    id: l.id,
    name: l.attributes.name,
    created: l.attributes.created,
    updated: l.attributes.updated
  }));
}

// ── Push test contact ──────────────────────────────────────────────────────

export async function klaviyoUpsertProfile(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, unknown>;
}, tenantCtx?: TenantContext): Promise<{ ok: boolean; profileId?: string; detail: string }> {
  const body = {
    data: {
      type: "profile",
      attributes: {
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        properties: input.properties ?? {}
      }
    }
  };
  // POST /profiles is upsert-by-email behavior in modern Klaviyo (errors
  // 409 if profile exists, but we treat that as success).
  const r = await klaviyo<{ data: { id: string } }>("/profiles/", {
    method: "POST",
    body: JSON.stringify(body)
  }, tenantCtx);
  if (r.ok) {
    return { ok: true, profileId: r.data.data.id, detail: "Profile created." };
  }
  // 409 means profile already exists — pull its ID instead
  if (r.status === 409) {
    const existing = await klaviyo<{
      data: Array<{ id: string }>;
    }>(`/profiles/?filter=equals(email,"${encodeURIComponent(input.email)}")`, {}, tenantCtx);
    if (existing.ok && existing.data.data[0]) {
      return { ok: true, profileId: existing.data.data[0].id, detail: "Profile already exists." };
    }
  }
  return { ok: false, detail: `Profile upsert failed (${r.status}): ${r.error.slice(0, 200)}` };
}

export async function klaviyoSubscribeProfileToList(
  profileId: string,
  listId: string,
  tenantCtx?: TenantContext
): Promise<{ ok: boolean; detail: string }> {
  const r = await klaviyo(`/lists/${listId}/relationships/profiles/`, {
    method: "POST",
    body: JSON.stringify({ data: [{ type: "profile", id: profileId }] })
  }, tenantCtx);
  if (r.ok) return { ok: true, detail: "Subscribed to list." };
  return { ok: false, detail: `Subscribe failed (${r.status}): ${r.error.slice(0, 200)}` };
}

// ── Templates (push HTML email templates to Klaviyo's library) ─────────────

export type KlaviyoTemplate = {
  id: string;
  name: string;
};

export async function klaviyoCreateTemplate(input: {
  name: string;
  html: string;
  subject?: string;
}): Promise<{ ok: boolean; templateId?: string; status: number; detail: string }> {
  const r = await klaviyo<{ data: { id: string } }>("/templates/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "template",
        attributes: {
          name: input.name,
          editor_type: "CODE",
          html: input.html,
          text: input.subject ? `Subject: ${input.subject}` : ""
        }
      }
    })
  });
  if (r.ok) {
    return { ok: true, templateId: r.data.data.id, status: 201, detail: "Template created." };
  }
  return { ok: false, status: r.status, detail: r.error.slice(0, 300) };
}

export async function klaviyoListTemplates(): Promise<KlaviyoTemplate[]> {
  // Klaviyo's templates endpoint maxes page size at 10 — paginate via cursor.
  const out: KlaviyoTemplate[] = [];
  let next: string | null = "/templates/?page[size]=10";
  type TemplatesPage = {
    data: Array<{ id: string; attributes: { name: string } }>;
    links?: { next?: string };
  };
  while (next) {
    const r: Awaited<ReturnType<typeof klaviyo<TemplatesPage>>> = await klaviyo<TemplatesPage>(next);
    if (!r.ok) throw new Error(`Klaviyo templates fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
    for (const t of r.data.data) out.push({ id: t.id, name: t.attributes.name });
    if (r.data.links?.next) {
      next = r.data.links.next.replace(/^https?:\/\/[^/]+\/api/, "");
    } else {
      next = null;
    }
  }
  return out;
}

// ── Metrics + Campaigns ────────────────────────────────────────────────────

export type KlaviyoMetric = { id: string; name: string; integration: string };

export async function klaviyoListMetrics(): Promise<KlaviyoMetric[]> {
  const r = await klaviyo<{
    data: Array<{
      id: string;
      attributes: { name: string; integration: { name: string } };
    }>;
  }>("/metrics/");
  if (!r.ok) throw new Error(`Klaviyo metrics fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
  return r.data.data.map((m) => ({
    id: m.id,
    name: m.attributes.name,
    integration: m.attributes.integration?.name ?? "unknown"
  }));
}

export type KlaviyoCampaign = {
  id: string;
  name: string;
  status: string;
  sendStrategy: string;
  sentAt?: string;
};

export async function klaviyoListCampaigns(tenantCtx?: TenantContext): Promise<KlaviyoCampaign[]> {
  const r = await klaviyo<{
    data: Array<{
      id: string;
      attributes: {
        name: string;
        status: string;
        send_strategy?: { method: string };
        send_time?: string;
      };
    }>;
  }>("/campaigns/?filter=equals(messages.channel,'email')", {}, tenantCtx);
  if (!r.ok) throw new Error(`Klaviyo campaigns fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
  return r.data.data.map((c) => ({
    id: c.id,
    name: c.attributes.name,
    status: c.attributes.status,
    sendStrategy: c.attributes.send_strategy?.method ?? "unknown",
    sentAt: c.attributes.send_time
  }));
}
