import "server-only";

// Minimal Klaviyo Admin API client. Used by the operator agent's Klaviyo
// tools (status check, test contact push, metrics read) and any future
// Vercel-side webhook handlers that need to push subscribers.
//
// Auth: Bearer with the Private API key. Pass in env as KLAVIYO_API_KEY.
// Rev:  Klaviyo's API is versioned by `revision` header — pin to a known-
//       stable version so server upgrades don't silently change behavior.

const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function authHeaders(): Record<string, string> {
  const key = process.env.KLAVIYO_API_KEY?.trim();
  if (!key) throw new Error("Missing KLAVIYO_API_KEY in env.");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json"
  };
}

async function klaviyo<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const r = await fetch(`${KLAVIYO_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers ?? {}) }
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

export async function klaviyoHealthCheck(): Promise<KlaviyoHealthReport> {
  // Hit /lists/ instead of /accounts/ since the operator's API key is
  // scoped without Accounts:Read (intentionally — we follow least-privilege
  // and Accounts has no operationally useful info that justifies the scope).
  // Lists is covered by the Lists:Read/Write grant we DO have.
  const r = await klaviyo<{
    data: Array<{ id: string; attributes: { name: string } }>;
    meta?: { total_count?: number };
  }>("/lists/?page[size]=1");
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

export async function klaviyoListLists(): Promise<KlaviyoList[]> {
  const r = await klaviyo<{
    data: Array<{
      id: string;
      attributes: { name: string; created: string; updated: string };
    }>;
  }>("/lists/");
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
}): Promise<{ ok: boolean; profileId?: string; detail: string }> {
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
  });
  if (r.ok) {
    return { ok: true, profileId: r.data.data.id, detail: "Profile created." };
  }
  // 409 means profile already exists — pull its ID instead
  if (r.status === 409) {
    const existing = await klaviyo<{
      data: Array<{ id: string }>;
    }>(`/profiles/?filter=equals(email,"${encodeURIComponent(input.email)}")`);
    if (existing.ok && existing.data.data[0]) {
      return { ok: true, profileId: existing.data.data[0].id, detail: "Profile already exists." };
    }
  }
  return { ok: false, detail: `Profile upsert failed (${r.status}): ${r.error.slice(0, 200)}` };
}

export async function klaviyoSubscribeProfileToList(
  profileId: string,
  listId: string
): Promise<{ ok: boolean; detail: string }> {
  const r = await klaviyo(`/lists/${listId}/relationships/profiles/`, {
    method: "POST",
    body: JSON.stringify({ data: [{ type: "profile", id: profileId }] })
  });
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
  while (next) {
    const r = await klaviyo<{
      data: Array<{ id: string; attributes: { name: string } }>;
      links?: { next?: string };
    }>(next);
    if (!r.ok) throw new Error(`Klaviyo templates fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
    for (const t of r.data.data) out.push({ id: t.id, name: t.attributes.name });
    // links.next is an absolute URL or null. Convert to relative for our base.
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

export async function klaviyoListCampaigns(): Promise<KlaviyoCampaign[]> {
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
  }>("/campaigns/?filter=equals(messages.channel,'email')");
  if (!r.ok) throw new Error(`Klaviyo campaigns fetch failed (${r.status}): ${r.error.slice(0, 200)}`);
  return r.data.data.map((c) => ({
    id: c.id,
    name: c.attributes.name,
    status: c.attributes.status,
    sendStrategy: c.attributes.send_strategy?.method ?? "unknown",
    sentAt: c.attributes.send_time
  }));
}
