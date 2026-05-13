"use client";

import { useState } from "react";

// Admin login — the creator's access path past the Stripe paywall.
//
// Posts the OPERATOR_AUTH_SECRET to /api/admin/login, which sets the
// `x-operator-auth` cookie if it matches. Middleware then admits the
// session into /dashboard, /pipeline, /content-studio, and the /api/operator
// surface.
//
// This page is intentionally not linked from public marketing — it's the
// owner's back door. Bookmark the URL.

export default function AdminLoginPage() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret })
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: `Error ${r.status}` }));
        setError(data.error ?? "Invalid secret");
        setBusy(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F0E0C",
        color: "#F4F1EC",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px"
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.2em",
            color: "#A67843",
            marginBottom: 16,
            fontWeight: 600
          }}
        >
          OWNER ACCESS
        </p>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: "0 0 12px",
            letterSpacing: "-0.01em"
          }}
        >
          The Operator — admin login
        </h1>
        <p style={{ fontSize: 14, color: "rgba(244,241,236,0.6)", marginBottom: 28 }}>
          Enter your <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>OPERATOR_AUTH_SECRET</code>{" "}
          to enter the dashboard without going through the Stripe checkout.
        </p>

        <form onSubmit={submit}>
          <label
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "rgba(244,241,236,0.6)",
              display: "block",
              marginBottom: 8,
              textTransform: "uppercase",
              fontWeight: 600
            }}
          >
            Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            autoComplete="off"
            placeholder="paste OPERATOR_AUTH_SECRET"
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(244,241,236,0.15)",
              borderRadius: 8,
              color: "#F4F1EC",
              fontSize: 14,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              marginBottom: 12,
              boxSizing: "border-box"
            }}
          />

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(255,0,0,0.1)",
                border: "1px solid rgba(255,0,0,0.3)",
                borderRadius: 8,
                color: "#ffb",
                fontSize: 13,
                marginBottom: 12
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !secret.trim()}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "#A67843",
              color: "#0F0E0C",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15,
              cursor: busy ? "wait" : "pointer",
              opacity: busy || !secret.trim() ? 0.6 : 1,
              fontFamily: "inherit"
            }}
          >
            {busy ? "Verifying…" : "Enter dashboard →"}
          </button>
        </form>

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 32, lineHeight: 1.6 }}>
          This is the owner&apos;s entry. Paying merchants use a tenant bearer token (sent to them by
          email) which they paste in the dashboard&apos;s auth field.
        </p>
      </div>
    </main>
  );
}
