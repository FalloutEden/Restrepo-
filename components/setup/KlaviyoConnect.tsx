"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Klaviyo signup deep-link flow. Third partner surface after Namecheap +
// Shopify. Simplest of the three — Klaviyo's API key is a single field,
// no scope configuration needed.
//
//   1. Sign up at klaviyo.com (deep link).
//   2. Inside their dashboard: Settings → API Keys → Create Private API Key.
//   3. Paste pk_… into our form → encrypted vault via /api/tenant/credentials.
//
// Once stored, the operator can use Klaviyo for welcome flows + abandoned
// cart sequences as part of its content-studio pipeline.

type Configured = { klaviyoApiKey?: boolean };

const KLAVIYO_SIGNUP = "https://www.klaviyo.com/sign-up";
const PRIVATE_API_KEYS_DOCS = "https://help.klaviyo.com/hc/en-us/articles/115005062267";

export function KlaviyoConnect() {
  const [configured, setConfigured] = useState<Configured>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/tenant/credentials", { cache: "no-store" });
      if (r.status === 401) {
        setError("Sign in to manage your Klaviyo connection.");
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
      setError(e instanceof Error ? e.message : "Failed to load credential state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSavedMsg(null);
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setSubmitError("Paste your Klaviyo private API key.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await authedFetch("/api/tenant/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klaviyoApiKey: trimmed })
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setSubmitError(data.error ?? `Error ${r.status}`);
        setSubmitting(false);
        return;
      }
      setSavedMsg("Saved. The operator can now build welcome flows and abandoned-cart sequences in Klaviyo on your behalf.");
      setApiKey("");
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const keySet = configured.klaviyoApiKey === true;

  if (loading) {
    return <p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading…</p>;
  }

  if (error) return <div style={errorBox}>{error}</div>;

  return (
    <div>
      {keySet && (
        <div
          style={{
            background: "rgba(110,220,150,0.1)",
            border: "1px solid rgba(110,220,150,0.35)",
            color: "#6EDC96",
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 28
          }}
        >
          ✓ Klaviyo is connected. You can rotate the key below if you ever revoke it.
        </div>
      )}

      <section style={sectionBox}>
        <h2 style={sectionTitle}>1 · Sign up at Klaviyo</h2>
        <p style={sectionBody}>
          Klaviyo&apos;s free tier covers up to 250 contacts + 500 emails a month — plenty for
          your first few weeks. Skip if you already have an account.
        </p>
        <a href={KLAVIYO_SIGNUP} target="_blank" rel="noopener noreferrer" style={ctaButton}>
          Open Klaviyo signup →
        </a>
      </section>

      <section style={sectionBox}>
        <h2 style={sectionTitle}>2 · Create a private API key</h2>
        <p style={sectionBody}>
          In your Klaviyo dashboard: <strong>Settings → API Keys → Create Private API Key</strong>.
          Name it &ldquo;The Operator&rdquo; (or anything you want — only you see it). Klaviyo will
          show you a key starting with <code style={inlineCode}>pk_</code>. Copy it now.
        </p>
        <a href={PRIVATE_API_KEYS_DOCS} target="_blank" rel="noopener noreferrer" style={linkSubtle}>
          Klaviyo&apos;s API-keys docs →
        </a>
      </section>

      <section style={{ ...sectionBox, borderColor: "rgba(166,120,67,0.4)" }}>
        <h2 style={{ ...sectionTitle, color: "#D4B896" }}>3 · Paste it here</h2>
        <p style={sectionBody}>
          We encrypt it immediately. The plaintext never touches disk.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>
              Klaviyo private API key
              {keySet && <span style={configuredBadge}>✓ CONFIGURED</span>}
            </span>
            <input
              type="password"
              placeholder={keySet ? "•••• (paste to rotate)" : "pk_…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={input}
            />
          </label>

          {submitError && <div style={errorBox}>{submitError}</div>}
          {savedMsg && (
            <div
              style={{
                background: "rgba(110,220,150,0.1)",
                border: "1px solid rgba(110,220,150,0.35)",
                color: "#6EDC96",
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 13
              }}
            >
              {savedMsg}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{ ...ctaButton, alignSelf: "flex-start" }}>
            {submitting ? "Saving…" : "Save Klaviyo key"}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const sectionBox: React.CSSProperties = {
  border: "1px solid rgba(244,241,236,0.12)",
  borderRadius: 12,
  padding: 22,
  background: "rgba(255,255,255,0.02)",
  marginBottom: 14
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  fontSize: 16,
  color: "rgba(244,241,236,0.95)"
};

const sectionBody: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 14,
  color: "rgba(244,241,236,0.7)",
  lineHeight: 1.55
};

const ctaButton: React.CSSProperties = {
  background: "#D4B896",
  color: "#0F0E0C",
  border: "none",
  padding: "10px 18px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block"
};

const linkSubtle: React.CSSProperties = {
  color: "rgba(212,184,150,0.85)",
  fontSize: 13,
  textDecoration: "none",
  fontWeight: 600
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(244,241,236,0.55)",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6
};

const configuredBadge: React.CSSProperties = {
  background: "rgba(110,220,150,0.15)",
  color: "#6EDC96",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  letterSpacing: "0.06em"
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "'SF Mono', Menlo, monospace",
  background: "rgba(0,0,0,0.35)",
  color: "#f0f0f0",
  border: "1px solid rgba(244,241,236,0.15)",
  borderRadius: 6,
  boxSizing: "border-box"
};

const inlineCode: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "'SF Mono', Menlo, monospace"
};

const errorBox: React.CSSProperties = {
  background: "rgba(224,123,106,0.1)",
  border: "1px solid rgba(224,123,106,0.4)",
  color: "#E07B6A",
  padding: "10px 14px",
  borderRadius: 6,
  fontSize: 13
};
