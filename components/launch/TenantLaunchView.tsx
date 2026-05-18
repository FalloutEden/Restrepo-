"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Tenant-side launch readiness. Two states:
//
//   1. NOT CONNECTED — Shopify credentials missing from the tenant vault.
//      Show a credential form: paste your shpat_… token + store domain.
//      Submit → /api/tenant/credentials encrypts into the vault → re-fetches.
//
//   2. CONNECTED — render the 4 store-level readiness checks. A small
//      "Update credentials" disclosure stays available at the top so the
//      tenant can rotate their token without leaving the page.
//
// The API decides which state we're in: if the first (and only) returned
// check is `shopify_connection: fail` with the "Connect your Shopify" fix
// string, we're in state 1.

type CheckStatus = "ok" | "warn" | "fail";

type LaunchCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

type LaunchReport = {
  brand: string;
  generatedAt: string;
  overall: CheckStatus;
  checks: LaunchCheck[];
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: "#7CCB8E",
  warn: "#E0B567",
  fail: "#E07B6A"
};

const STATUS_BADGE: Record<CheckStatus, string> = {
  ok: "✓ OK",
  warn: "! WARN",
  fail: "✗ FAIL"
};

function isNotConnectedState(report: LaunchReport | null): boolean {
  if (!report) return false;
  if (report.checks.length !== 1) return false;
  const only = report.checks[0];
  return only.id === "shopify_connection" && only.status === "fail";
}

export function TenantLaunchView() {
  const [report, setReport] = useState<LaunchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [shopifyAdminToken, setShopifyAdminToken] = useState("");
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState("");
  const [shopifyWebhookSecret, setShopifyWebhookSecret] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/launch-status", { cache: "no-store" });
      if (r.status === 401) {
        setError("Sign in from the operator dashboard to view launch readiness.");
        setLoading(false);
        return;
      }
      if (!r.ok) {
        setError(`Error ${r.status}`);
        setLoading(false);
        return;
      }
      const data = (await r.json()) as { report?: LaunchReport };
      setReport(data.report ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string> = {};
      if (shopifyAdminToken.trim()) body.shopifyAdminToken = shopifyAdminToken.trim();
      if (shopifyStoreDomain.trim()) body.shopifyStoreDomain = shopifyStoreDomain.trim();
      if (shopifyWebhookSecret.trim()) body.shopifyWebhookSecret = shopifyWebhookSecret.trim();
      if (Object.keys(body).length === 0) {
        setSubmitError("Paste at least your Shopify admin token + store domain.");
        setSubmitting(false);
        return;
      }
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
      // Clear sensitive fields after success.
      setShopifyAdminToken("");
      setShopifyWebhookSecret("");
      setFormOpen(false);
      // Re-run the readiness checks now that creds are saved.
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const notConnected = isNotConnectedState(report);

  return (
    <div style={{ padding: "0 16px 48px", maxWidth: 720, margin: "0 auto", color: "rgba(255,255,255,0.9)" }}>
      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Checking your store…</p>
      )}

      {error && (
        <div
          style={{
            background: "rgba(224,123,106,0.1)",
            border: "1px solid rgba(224,123,106,0.4)",
            color: "#E07B6A",
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 20
          }}
        >
          {error}
        </div>
      )}

      {(notConnected || formOpen) && !loading && (
        <section
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 28,
            background: "rgba(255,255,255,0.04)"
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, color: "#D4B896" }}>
            {notConnected ? "Connect your Shopify store" : "Update Shopify credentials"}
          </h2>
          <p style={{ marginTop: 0, marginBottom: 20, fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
            Paste your Shopify admin API token and store domain. We encrypt them in your private
            vault — your operator reads them when it needs to. We never see the values.
          </p>

          <form onSubmit={submitCredentials} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", display: "block", marginBottom: 6, fontWeight: 600 }}>
                Shopify admin API token
              </span>
              <input
                type="password"
                placeholder="shpat_…"
                value={shopifyAdminToken}
                onChange={(e) => setShopifyAdminToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  background: "rgba(0,0,0,0.35)",
                  color: "#f0f0f0",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 6,
                  boxSizing: "border-box"
                }}
              />
            </label>

            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", display: "block", marginBottom: 6, fontWeight: 600 }}>
                Store domain
              </span>
              <input
                type="text"
                placeholder="your-store.myshopify.com"
                value={shopifyStoreDomain}
                onChange={(e) => setShopifyStoreDomain(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  background: "rgba(0,0,0,0.35)",
                  color: "#f0f0f0",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 6,
                  boxSizing: "border-box"
                }}
              />
            </label>

            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", display: "block", marginBottom: 6, fontWeight: 600 }}>
                Webhook secret (optional)
              </span>
              <input
                type="password"
                placeholder="shpss_… (paste later if you don&apos;t have it yet)"
                value={shopifyWebhookSecret}
                onChange={(e) => setShopifyWebhookSecret(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  background: "rgba(0,0,0,0.35)",
                  color: "#f0f0f0",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 6,
                  boxSizing: "border-box"
                }}
              />
            </label>

            {submitError && (
              <div
                style={{
                  background: "rgba(224,123,106,0.1)",
                  border: "1px solid rgba(224,123,106,0.4)",
                  color: "#E07B6A",
                  padding: "10px 12px",
                  borderRadius: 6,
                  fontSize: 13
                }}
              >
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: "#D4B896",
                  color: "#0F0E0C",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: submitting ? "wait" : "pointer"
                }}
              >
                {submitting ? "Saving…" : notConnected ? "Connect & run checks" : "Save credentials"}
              </button>
              {!notConnected && (
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  style={{
                    background: "transparent",
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    padding: "10px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {report && !notConnected && (
        <>
          {!formOpen && (
            <div style={{ textAlign: "right", marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                style={{
                  background: "transparent",
                  color: "rgba(212,184,150,0.85)",
                  border: "1px solid rgba(212,184,150,0.3)",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                Update credentials
              </button>
            </div>
          )}

          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              background: "rgba(255,255,255,0.02)"
            }}
          >
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#D4B896" }}>Your store</h2>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: STATUS_COLOR[report.overall],
                  border: `1px solid ${STATUS_COLOR[report.overall]}`,
                  padding: "4px 10px",
                  borderRadius: 4
                }}
              >
                Overall: {report.overall}
              </span>
            </header>

            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {report.checks.map((c) => (
                <li
                  key={c.id}
                  style={{
                    padding: "12px 0",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gridTemplateColumns: "100px 1fr",
                    gap: 16,
                    alignItems: "start"
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: STATUS_COLOR[c.status], whiteSpace: "nowrap" }}>
                    {STATUS_BADGE[c.status]}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{c.detail}</div>
                    {c.fix && (
                      <div style={{ fontSize: 12, color: "rgba(212,184,150,0.85)", marginTop: 6, fontStyle: "italic" }}>
                        Fix: {c.fix}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 16, textAlign: "center" }}>
            Auto-refreshes on demand. Checked at {new Date(report.generatedAt).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}
