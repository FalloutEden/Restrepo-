import Link from "next/link";

import { ShopifyConnect } from "@/components/setup/ShopifyConnect";

// /setup/shopify — Shopify store-creation guided flow. Second in the partner
// deep-link series after /setup/domain. Same scaffold (deep links out → user
// does the thing → paste result back), different content:
//
//   - Shopify signup deep link
//   - Step-by-step custom-app + scope configuration walkthrough
//   - Paste-back form that writes shopifyAdminToken + shopifyStoreDomain
//     into the encrypted vault via /api/tenant/credentials
//
// Once the token + domain are saved the /launch readiness checks flip from
// "Connect your Shopify" to live store probes.

export const dynamic = "force-dynamic";

export default function SetupShopifyPage() {
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
          <span style={{ color: "rgba(244,241,236,0.4)", fontSize: 12 }}>setup · shopify</span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 10, fontWeight: 700 }}>
          SETUP · YOUR STORE
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Hook up your Shopify.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.65)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
          Five short steps. If you already have a Shopify store, skip to step 2. If you don&apos;t,
          step 1 takes about 90 seconds — Shopify gives a 14-day free trial with no card.
        </p>

        <ShopifyConnect />

        <p style={{ fontSize: 12, color: "rgba(244,241,236,0.4)", marginTop: 36, textAlign: "center" }}>
          We don&apos;t earn a commission on Shopify signups. The choice of e-commerce platform is
          yours — this is just the one most merchants use and the one your operator knows best.
        </p>
      </div>
    </main>
  );
}
