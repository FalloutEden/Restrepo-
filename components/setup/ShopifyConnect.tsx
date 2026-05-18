"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Shopify store-creation deep-link flow. Same shape as DomainPicker — deep
// link out, user does the thing, paste result back. Difference: this lands
// the result in the encrypted credential vault (/api/tenant/credentials)
// rather than the plaintext profile.
//
// What a tenant has to do, in order:
//
//   1. Sign up at shopify.com (deep link). 14-day trial, no card required.
//   2. Inside their admin: Settings → Apps and Sales Channels →
//      "Develop apps" → "Allow custom app development."
//   3. Create a custom app named "The Operator" → configure Admin API access
//      scopes (we list the minimal scope set) → install → reveal the admin
//      API access token (shpat_…).
//   4. Paste shpat_… + the *.myshopify.com store URL into our form.
//
// Once both fields are saved the tenant's launch readiness checks at /launch
// flip from "Connect your Shopify" to live store probes against their token.

type Configured = {
  shopifyAdminToken?: boolean;
  shopifyStoreDomain?: boolean;
};

const SHOPIFY_SIGNUP = "https://www.shopify.com/free-trial";
const CUSTOM_APPS_DOCS = "https://help.shopify.com/manual/apps/app-types/custom-apps";
const ADMIN_API_SCOPES_DOCS = "https://shopify.dev/docs/api/usage/access-scopes";

// The minimum scope set the operator needs to read inventory, list drafts,
// publish products, and read order events. Tenants can re-paste a wider-scope
// token later if they want richer agent capabilities.
const REQUIRED_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
  "read_customers",
  "write_publications"
];

export function ShopifyConnect() {
  const [configured, setConfigured] = useState<Configured>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [storeDomain, setStoreDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/tenant/credentials", { cache: "no-store" });
      if (r.status === 401) {
        setError("Sign in to manage your Shopify connection.");
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
    const body: Record<string, string> = {};
    if (token.trim()) body.shopifyAdminToken = token.trim();
    if (storeDomain.trim()) body.shopifyStoreDomain = storeDomain.trim();
    if (Object.keys(body).length === 0) {
      setSubmitError("Paste at least one of the two fields.");
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
        setSubmitError(data.error ?? `Error ${r.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await r.json()) as { updated: string[] };
      setSavedMsg(`Saved: ${data.updated.join(", ")}. Your readiness checks at /launch will run against this token now.`);
      setToken("");
      setStoreDomain("");
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const tokenSet = configured.shopifyAdminToken === true;
  const domainSet = configured.shopifyStoreDomain === true;
  const bothSet = tokenSet && domainSet;

  if (loading) {
    return <p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading…</p>;
  }

  if (error) {
    return (
      <div style={errorBox}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {bothSet && (
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
          ✓ Shopify is connected. You can update the token below if you ever rotate it.
        </div>
      )}

      <section style={sectionBox}>
        <h2 style={sectionTitle}>1 · Create your Shopify store</h2>
        <p style={sectionBody}>
          If you don&apos;t have one yet, sign up for a 14-day free trial (no card needed). When you
          land in your admin, come back here for the next step.
        </p>
        <a
          href={SHOPIFY_SIGNUP}
          target="_blank"
          rel="noopener noreferrer"
          style={ctaButton}
        >
          Open Shopify signup →
        </a>
      </section>

      <section style={sectionBox}>
        <h2 style={sectionTitle}>2 · Enable custom apps</h2>
        <p style={sectionBody}>
          In your Shopify admin: <strong>Settings → Apps and sales channels → Develop apps</strong>.
          Click <em>&ldquo;Allow custom app development&rdquo;</em> and confirm. Then click
          <em> &ldquo;Create an app&rdquo;</em> and name it <strong>The Operator</strong> (or
          whatever you want — only you see it).
        </p>
        <a
          href={CUSTOM_APPS_DOCS}
          target="_blank"
          rel="noopener noreferrer"
          style={linkSubtle}
        >
          Shopify&apos;s custom-app docs →
        </a>
      </section>

      <section style={sectionBox}>
        <h2 style={sectionTitle}>3 · Configure Admin API scopes</h2>
        <p style={sectionBody}>
          On the app&apos;s <strong>Configuration</strong> tab, click <em>Configure</em> next to
          &ldquo;Admin API access scopes.&rdquo; Check these boxes (you can add more later — the
          operator gracefully degrades if a scope is missing):
        </p>
        <ul style={{ margin: "0 0 14px 18px", padding: 0, color: "rgba(244,241,236,0.75)", fontSize: 13, fontFamily: "'SF Mono', Menlo, monospace", lineHeight: 1.8 }}>
          {REQUIRED_SCOPES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <a
          href={ADMIN_API_SCOPES_DOCS}
          target="_blank"
          rel="noopener noreferrer"
          style={linkSubtle}
        >
          Shopify&apos;s access-scopes reference →
        </a>
      </section>

      <section style={sectionBox}>
        <h2 style={sectionTitle}>4 · Install the app + reveal the token</h2>
        <p style={sectionBody}>
          Click <strong>Install app</strong>. Shopify will show you the
          <em> &ldquo;Admin API access token&rdquo;</em> once — it starts with <code style={inlineCode}>shpat_</code>.
          Copy it now. If you close the modal before copying, you can revoke + regenerate it.
        </p>
      </section>

      <section style={{ ...sectionBox, borderColor: "rgba(166,120,67,0.4)" }}>
        <h2 style={{ ...sectionTitle, color: "#D4B896" }}>5 · Paste it here</h2>
        <p style={sectionBody}>
          We encrypt both fields immediately. The plaintext never touches disk.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>
              Shopify admin API token
              {tokenSet && <span style={configuredBadge}>✓ CONFIGURED</span>}
            </span>
            <input
              type="password"
              placeholder={tokenSet ? "•••• (paste to rotate)" : "shpat_…"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={input}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={fieldLabel}>
              Store domain
              {domainSet && <span style={configuredBadge}>✓ CONFIGURED</span>}
            </span>
            <input
              type="text"
              placeholder="your-store.myshopify.com"
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={input}
            />
            <p style={hint}>The myshopify.com URL, not your custom domain.</p>
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

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" disabled={submitting} style={ctaButton}>
              {submitting ? "Saving…" : "Save & continue"}
            </button>
            {bothSet && (
              <a
                href="/launch"
                style={linkSubtle}
              >
                Or jump straight to readiness checks →
              </a>
            )}
          </div>
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

const hint: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(244,241,236,0.45)",
  margin: "6px 0 0"
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
