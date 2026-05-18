import Link from "next/link";

import { StripeConnect } from "@/components/setup/StripeConnect";

// /setup/stripe — Stripe Connect deep-link flow. Fourth in the partner
// setup series after Namecheap, Shopify, and Klaviyo. Same scaffold:
// signup deep link → walkthrough → paste-back form → vault storage.
//
// Stripe Connect is how the tenant accepts customer payments under their
// own Stripe account (not the founder's). Shopify has built-in payments,
// but tenants who want Stripe for subscriptions, custom checkouts, or
// non-Shopify channels need their own connected account on file.

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
          Four short steps. Shopify has its own payment processor built in — Stripe is for when
          you want subscriptions, custom checkouts, or to take payments outside of Shopify too.
          You can skip this for now and come back when you need it.
        </p>

        <StripeConnect />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          Stripe is the most-used payment processor for SaaS + commerce. Nothing prevents you
          from using it alongside Shopify Payments — pick whichever rails fit each product.
        </p>
      </div>
    </main>
  );
}
