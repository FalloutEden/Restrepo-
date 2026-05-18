import Link from "next/link";

import { StripeConnect } from "@/components/setup/StripeConnect";

// /setup/stripe — Stripe Connect OAuth flow. Fourth in the partner setup
// series after Namecheap, Shopify, and Klaviyo. Different from the others:
// Stripe handles signup + account configuration + credential handoff in a
// single OAuth bounce. No "go sign up, then come back with a token" — one
// click and Stripe owns the rest of the flow.
//
// Backend: lib/stripe-connect.ts (HMAC-signed state helpers),
//          /api/stripe/connect/authorize (generates URL),
//          /api/stripe/connect/callback (verifies state, exchanges code,
//                                        writes stripeConnectAccountId).
// The callback is in middleware's public allowlist because Stripe can't
// carry our tenant bearer.

export const dynamic = "force-dynamic";

export default function SetupStripePage() {
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
          <span style={{ color: "rgba(244,241,236,0.4)", fontSize: 12 }}>setup · stripe</span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 10, fontWeight: 700 }}>
          SETUP · PAYMENT ACCOUNT
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Get paid with Stripe.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.65)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
          One click. Stripe opens, you approve, you&apos;re back. Shopify already has its own
          built-in checkout — Stripe is for subscriptions, custom payment links, or selling
          outside of Shopify. Optional, but most operators want it.
        </p>

        <StripeConnect />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          We never see your card data — Stripe holds that. We only store your account id so the
          operator knows whose payments to reference. You can disconnect any time from your
          Stripe dashboard.
        </p>
      </div>
    </main>
  );
}
