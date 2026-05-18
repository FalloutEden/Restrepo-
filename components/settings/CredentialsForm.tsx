"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Tenant credential management form. Three sections:
//
//   1. Shopify — token, store domain, optional webhook secret
//   2. Print-on-demand — Printful API key + store id
//   3. Marketing + LLMs — Klaviyo key + Anthropic + OpenAI BYOK keys
//
// Each field renders an "✓ Configured" badge if the tenant has already saved
// that credential (presence checked via GET /api/tenant/credentials). The
// input itself never shows the stored value — security model is "you can
// rotate but you cannot read." Empty submit on a field = no change. Empty
// string submit = clear the credential.

type Configured = Partial<Record<string, boolean>>;

const FIELDS: Array<{
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  password: boolean;
  group: "shopify" | "print" | "marketing-llm";
}> = [
  { key: "shopifyAdminToken", label: "Shopify admin API token", placeholder: "shpat_…", password: true, group: "shopify",
    hint: "From your Shopify custom app, Admin API access token." },
  { key: "shopifyStoreDomain", label: "Shopify store domain", placeholder: "your-store.myshopify.com", password: false, group: "shopify",
    hint: "The myshopify.com URL — not your custom domain." },
  { key: "shopifyWebhookSecret", label: "Shopify webhook signing secret (optional)", placeholder: "shpss_…", password: true, group: "shopify",
    hint: "Needed for the operator to verify Shopify-pushed events. Can add later." },

  { key: "printfulApiKey", label: "Printful API key", placeholder: "Printful private API key", password: true, group: "print" },
  { key: "printfulStoreId", label: "Printful store id", placeholder: "12345678", password: false, group: "print",
    hint: "Find in Printful → Stores → your store → Details." },

  { key: "klaviyoApiKey", label: "Klaviyo private API key", placeholder: "pk_…", password: true, group: "marketing-llm",
    hint: "For email flows. Skip if you're not using Klaviyo yet." },
  { key: "anthropicApiKey", label: "Anthropic API key (BYOK)", placeholder: "sk-ant-…", password: true, group: "marketing-llm",
    hint: "Your own Anthropic console key. Required for the operator to chat — you pay Anthropic directly, we don't bill through." },
  { key: "openaiApiKey", label: "OpenAI API key (BYOK)", placeholder: "sk-…", password: true, group: "marketing-llm",
    hint: "Your own OpenAI platform key. Used for image generation." }
];

const GROUP_TITLES: Record<string, { title: string; sub: string }> = {
  shopify: {
    title: "Shopify",
    sub: "Connect your store. The token is encrypted in your vault and only the operator reads it back when it needs to."
  },
  print: {
    title: "Print on demand",
    sub: "Optional. Connect Printful if you want the operator to produce + ship apparel for you."
  },
  "marketing-llm": {
    title: "Marketing & LLM keys",
    sub: "Bring-your-own-keys. Your operator runs on your Anthropic + OpenAI billing accounts, not ours."
  }
};

export function CredentialsForm() {
  const [configured, setConfigured] = useState<Configured>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/tenant/credentials", { cache: "no-store" });
      if (r.status === 401) {
        setError("Sign in to manage credentials. Tenant bearer required.");
        setLoading(false);
        return;
      }
      if (!r.ok) {
        setError(`Error ${r.status}`);
        setLoading(false);
        return;
      }
      const data = (await r.json()) as { configured: Configured };
      setConfigured(data.configured ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load credentials state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedKeys(null);
    const body: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      if (typeof v === "string" && v.length > 0) body[f.key] = v;
    }
    if (Object.keys(body).length === 0) {
      setError("Nothing to save — paste at least one credential.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await authedFetch("/api/tenant/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Error ${r.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await r.json()) as { updated: string[] };
      setSavedKeys(data.updated ?? []);
      // Wipe form inputs (never keep secrets in component state after save).
      setValues({});
      // Re-fetch presence so the "✓ Configured" badges update.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading credentials…</p>;
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 28 }}>
      {(["shopify", "print", "marketing-llm"] as const).map((group) => {
        const meta = GROUP_TITLES[group];
        const fields = FIELDS.filter((f) => f.group === group);
        return (
          <section
            key={group}
            style={{
              border: "1px solid rgba(244,241,236,0.12)",
              borderRadius: 12,
              padding: 22,
              background: "rgba(255,255,255,0.02)"
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 17, color: "#D4B896" }}>{meta.title}</h2>
            <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13, color: "rgba(244,241,236,0.55)" }}>
              {meta.sub}
            </p>

            {fields.map((f) => {
              const isSet = configured[f.key] === true;
              return (
                <div key={f.key} style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "rgba(244,241,236,0.55)",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      {f.label}
                      {isSet && (
                        <span
                          style={{
                            background: "rgba(110,220,150,0.15)",
                            color: "#6EDC96",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            letterSpacing: "0.06em"
                          }}
                        >
                          ✓ CONFIGURED
                        </span>
                      )}
                    </span>
                  </label>
                  <input
                    type={f.password ? "password" : "text"}
                    placeholder={isSet ? "•••• (paste to rotate)" : f.placeholder}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontFamily: f.password ? "'SF Mono', Menlo, monospace" : "inherit",
                      background: "rgba(0,0,0,0.35)",
                      color: "#f0f0f0",
                      border: "1px solid rgba(244,241,236,0.15)",
                      borderRadius: 6,
                      boxSizing: "border-box"
                    }}
                  />
                  {f.hint && (
                    <p style={{ fontSize: 12, color: "rgba(244,241,236,0.45)", margin: "6px 0 0" }}>
                      {f.hint}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {error && (
        <div
          style={{
            background: "rgba(224,123,106,0.1)",
            border: "1px solid rgba(224,123,106,0.4)",
            color: "#E07B6A",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {savedKeys && (
        <div
          style={{
            background: "rgba(110,220,150,0.1)",
            border: "1px solid rgba(110,220,150,0.4)",
            color: "#6EDC96",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13
          }}
        >
          Saved {savedKeys.length} credential{savedKeys.length === 1 ? "" : "s"}: {savedKeys.join(", ")}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#D4B896",
            color: "#0F0E0C",
            border: "none",
            padding: "12px 22px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 14,
            cursor: submitting ? "wait" : "pointer"
          }}
        >
          {submitting ? "Saving…" : "Save credentials"}
        </button>
        <span style={{ fontSize: 12, color: "rgba(244,241,236,0.45)" }}>
          Each save is fresh — only paste fields you want to add or rotate.
        </span>
      </div>
    </form>
  );
}
