import Link from "next/link";

import { KlaviyoConnect } from "@/components/setup/KlaviyoConnect";

// /setup/klaviyo — Klaviyo signup guided flow. Third in the partner deep-link
// series after Namecheap + Shopify. Simplest of the three since Klaviyo's API
// key is a single field with no scope dance.

export const dynamic = "force-dynamic";

export default function SetupKlaviyoPage() {
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
          <span style={{ color: "rgba(244,241,236,0.4)", fontSize: 12 }}>setup · klaviyo</span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 10, fontWeight: 700 }}>
          SETUP · YOUR EMAIL
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Hook up your email engine.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.65)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
          Klaviyo runs your welcome emails + abandoned-cart sequences. Three short steps. If you
          already use Mailchimp or something else, skip this — you can add Klaviyo later.
        </p>

        <KlaviyoConnect />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          We don&apos;t earn a commission on Klaviyo signups. The choice of email platform is yours —
          this is the one most Shopify merchants use and the one your operator integrates with.
        </p>
      </div>
    </main>
  );
}
