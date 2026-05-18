import Link from "next/link";

import { DomainPicker } from "@/components/setup/DomainPicker";

// /setup/domain — Namecheap deep-link flow. First in the partner deep-link
// series. Same shape future Shopify-store-creation and Klaviyo-signup pages
// will use:
//
//   1. Surface deep links out to the partner with prefilled context.
//   2. Capture the resulting credential / identifier back into the tenant
//      profile or encrypted vault.
//   3. Operator picks up the new context automatically on the next turn.

export const dynamic = "force-dynamic";

export default function SetupDomainPage() {
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
          <span style={{ color: "rgba(244,241,236,0.4)", fontSize: 12 }}>setup · domain</span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 10, fontWeight: 700 }}>
          SETUP · YOUR DOMAIN
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Get your custom domain.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.65)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
          Your store needs a real web address — something like <em>yourstore.com</em> instead of
          a long Shopify URL. We&apos;ll suggest some names that match your brand and open
          Namecheap so you can buy one. After you do, paste it back so your operator knows.
        </p>

        <DomainPicker />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          We don&apos;t earn a commission on Namecheap purchases. The choice of registrar is yours —
          this is just the one most merchants use.
        </p>
      </div>
    </main>
  );
}
