import Link from "next/link";

import { CredentialsForm } from "@/components/settings/CredentialsForm";

// /settings — single home for tenant credential management. Reuses the
// /api/tenant/credentials endpoints. The same form that lives inside
// /launch (as a "Connect your Shopify" prompt) is here as a permanent
// settings surface covering every supported integration:
//
//   - Shopify (admin token, store domain, optional webhook secret)
//   - Printful (API key + store id)
//   - Klaviyo (private API key)
//   - LLM BYOK (Anthropic + OpenAI)
//
// Page is a server component for the chrome (nav, header). The form itself
// is a client component that fetches presence + posts updates with
// authedFetch — same auth flow as every other tenant panel.

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F0E0C",
        color: "#F4F1EC",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "40px 24px"
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
            fontSize: 13
          }}
        >
          <Link href="/dashboard" style={{ color: "rgba(244,241,236,0.55)", textDecoration: "none" }}>
            ← Back to operator
          </Link>
          <span style={{ color: "rgba(244,241,236,0.4)", fontSize: 12 }}>your integrations</span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 10, fontWeight: 700 }}>
          SETTINGS · CREDENTIALS
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Your keys, your control.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.65)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
          Paste your third-party API keys here. We encrypt every value in your private vault — the
          operator reads them only when it needs to. We never see the raw values, and you can rotate
          any of them whenever you want.
        </p>

        <CredentialsForm />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          Storage: AES-256-GCM in Postgres. Reads scoped to your tenant context only.
        </p>
      </div>
    </main>
  );
}
