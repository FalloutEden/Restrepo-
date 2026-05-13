import Link from "next/link";

// The Operator by Black Vault — public marketing landing page.
//
// Naming hierarchy:
//   - Parent company: Black Vault
//   - SaaS product: The Operator
//   - Mission/why (in About/FAQ, never headline): Project ELSA — Evolved
//     Loyal Service Agent
//   - Proof brand: Black Vault Apparel (BV)
//
// Aesthetic: Graphify-style light, technical, clean. SaaS buyers want
// clarity not mood. BV apparel pages stay dark — different audience.

export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        color: "#0F0E0C",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
        lineHeight: 1.55,
        WebkitFontSmoothing: "antialiased"
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          maxWidth: 1200,
          margin: "0 auto",
          borderBottom: "1px solid #f0f0f0"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "#0F0E0C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#A67843",
              fontWeight: 800,
              fontSize: 14,
              fontFamily: "'SF Mono', Menlo, monospace"
            }}
          >
            O
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
            The Operator
          </span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>by Black Vault</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 14, alignItems: "center" }}>
          <a href="#how" style={{ color: "#555", textDecoration: "none" }}>
            How it works
          </a>
          <a href="#pricing" style={{ color: "#555", textDecoration: "none" }}>
            Pricing
          </a>
          <a href="#faq" style={{ color: "#555", textDecoration: "none" }}>
            FAQ
          </a>
          <Link href="/dashboard" style={{ color: "#555", textDecoration: "none" }}>
            Log in
          </Link>
          <Link
            href="/onboard"
            style={{
              background: "#0F0E0C",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 6,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13
            }}
          >
            Launch a brand
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "96px 32px 64px",
          textAlign: "center"
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.2em",
            color: "#A67843",
            marginBottom: 20,
            fontWeight: 600
          }}
        >
          AI OPERATOR · APPAREL · LIVE IN 48 HOURS
        </p>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.05,
            margin: "0 0 24px",
            letterSpacing: "-0.02em"
          }}
        >
          Hire your Operator.<br />
          Run your brand while you sleep.
        </h1>
        <p
          style={{
            fontSize: 19,
            color: "#555",
            maxWidth: 640,
            margin: "0 auto 36px",
            lineHeight: 1.6
          }}
        >
          The Operator is an AI agent that builds and runs a premium print-on-demand brand for you.
          Shopify and Printful wired. Product setup, brand-fit copy, mockups, email flows, daily
          content — handled. You bring the idea and run the marketing.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/onboard"
            style={{
              background: "#0F0E0C",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15
            }}
          >
            Hire your Operator →
          </Link>
          <a
            href="#how"
            style={{
              color: "#0F0E0C",
              padding: "14px 28px",
              borderRadius: 8,
              textDecoration: "none",
              border: "1px solid #e0e0e0",
              fontSize: 15,
              fontWeight: 500
            }}
          >
            See how it works
          </a>
        </div>
        <p style={{ fontSize: 13, color: "#888", marginTop: 24 }}>
          $499 setup · $99/month · cancel anytime · 30-day money-back if your store isn&apos;t live in 48h
        </p>
      </section>

      {/* What you get */}
      <section
        id="how"
        style={{
          background: "#FAFAFA",
          borderTop: "1px solid #f0f0f0",
          borderBottom: "1px solid #f0f0f0"
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px" }}>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              textAlign: "center",
              marginBottom: 12,
              letterSpacing: "-0.01em"
            }}
          >
            What your Operator does
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "#666",
              textAlign: "center",
              marginBottom: 56,
              maxWidth: 560,
              margin: "0 auto 56px"
            }}
          >
            Built on the engine that runs Black Vault Apparel — a live premium brand. The system in
            production, not a pitch deck.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24
            }}
          >
            {[
              {
                t: "A real store in 48 hours",
                b: "Shopify + Printful wired. 8-15 products live with brand-fit copy, mockups, and pricing tuned to your vibe."
              },
              {
                t: "An operator that runs it",
                b: "Chat-driven. Asks 'what should I add' and 'why didn't anyone buy last week' — and proposes specific actions with ROI estimates."
              },
              {
                t: "Daily content",
                b: "Pinterest, Instagram, TikTok captions generated to your voice. You approve and post (or auto-post via API when you connect them)."
              },
              {
                t: "Email + abandoned cart",
                b: "Klaviyo welcome flow and abandoned cart sequence installed and tuned. You connect Klaviyo; we handle the build."
              },
              {
                t: "Knowledge graph",
                b: "Cross-brand learnings via a shared knowledge graph. Your Operator gets smarter as more merchants run on the engine."
              },
              {
                t: "Real margins, no inventory",
                b: "Print-on-demand. Zero stock to hold. Average margin 40-60% per order. Operator audits pricing weekly."
              }
            ].map((card) => (
              <div
                key={card.t}
                style={{
                  background: "#fff",
                  padding: 28,
                  borderRadius: 10,
                  border: "1px solid #ebebeb"
                }}
              >
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    marginTop: 0,
                    marginBottom: 10,
                    letterSpacing: "-0.01em"
                  }}
                >
                  {card.t}
                </h3>
                <p style={{ fontSize: 15, color: "#555", margin: 0 }}>{card.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px" }}>
        <h2
          style={{
            fontSize: 36,
            fontWeight: 800,
            textAlign: "center",
            marginBottom: 12,
            letterSpacing: "-0.01em"
          }}
        >
          One plan
        </h2>
        <p style={{ fontSize: 16, color: "#666", textAlign: "center", marginBottom: 56 }}>
          No tiers. No upsells. No annual lock-in.
        </p>
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            background: "#fff",
            border: "2px solid #0F0E0C",
            borderRadius: 12,
            padding: 40,
            textAlign: "center"
          }}
        >
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.15em",
              color: "#A67843",
              margin: 0,
              fontWeight: 600
            }}
          >
            THE OPERATOR
          </p>
          <div style={{ margin: "20px 0" }}>
            <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em" }}>$499</span>
            <span style={{ fontSize: 17, color: "#666" }}> setup</span>
            <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>then</div>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>$99</span>
            <span style={{ fontSize: 15, color: "#666" }}>/month</span>
          </div>
          <ul
            style={{
              textAlign: "left",
              padding: 0,
              listStyle: "none",
              margin: "24px 0",
              fontSize: 14
            }}
          >
            {[
              "Shopify + Printful build, 8-15 products live in 48 hours",
              "Brand-fit copywriting on every product page",
              "Klaviyo welcome flow + abandoned cart",
              "Hosted Operator agent (chat + automation)",
              "Daily content generation",
              "30-day money-back if your store isn't live in 48 hours",
              "Cancel anytime — your store stays yours"
            ].map((b) => (
              <li
                key={b}
                style={{
                  color: "#333",
                  padding: "8px 0",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  gap: 10
                }}
              >
                <span style={{ color: "#A67843", fontWeight: 700 }}>✓</span>
                {b}
              </li>
            ))}
          </ul>
          <Link
            href="/onboard"
            style={{
              display: "block",
              background: "#0F0E0C",
              color: "#fff",
              padding: "14px 24px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              marginTop: 24
            }}
          >
            Get started →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        style={{
          background: "#FAFAFA",
          borderTop: "1px solid #f0f0f0"
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "80px 32px" }}>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              textAlign: "center",
              marginBottom: 56,
              letterSpacing: "-0.01em"
            }}
          >
            FAQ
          </h2>
          {[
            {
              q: "Who's behind The Operator?",
              a: "Black Vault — an indie founder running a live premium apparel brand (Black Vault Apparel) on this exact engine. The product is the system in production, not a pitch."
            },
            {
              q: "What is Black Vault?",
              a: "Black Vault is the parent company. The Operator is our SaaS product. Black Vault Apparel is our first sub-brand — the proof-of-concept that the engine works end-to-end."
            },
            {
              q: "What if I don't have a logo or product designs?",
              a: "You can provide them, or the onboarding wizard helps you generate brand marks. For garment designs we use Printful's catalog — no custom art needed unless you want it."
            },
            {
              q: "Do you handle marketing?",
              a: "The plan includes daily content generation (Pinterest, IG, TikTok captions). It does NOT include paid ad spend — that's yours to control."
            },
            {
              q: "What's the average revenue?",
              a: "Depends on your channels and effort. We can't promise numbers. Reasonable marketing effort typically hits $1-5k/month within 90 days. Marketing is the bottleneck, not the tech."
            },
            {
              q: "Can I cancel?",
              a: "Yes, any time. Your Shopify and Printful accounts are yours. If you cancel, your store keeps running — you just lose the hosted Operator and content engine."
            },
            {
              q: "What is Project ELSA?",
              a: "ELSA stands for Evolved Loyal Service Agent. It's the mission name behind The Operator — built in memory of the founder's service dog. After losing her, he decided to break from the 9-to-5 path and build something that lets indie founders do the same. The system carries the principles she lived by: loyal, useful, present."
            },
            {
              q: "How is this different from Shopify + a freelancer?",
              a: "A freelancer disappears after the build. The Operator runs your store every day — answering 'what should I add to my catalog' or 'why didn't anyone buy last week' in real time."
            }
          ].map((item) => (
            <details
              key={item.q}
              style={{ padding: "16px 0", borderBottom: "1px solid #ebebeb" }}
            >
              <summary
                style={{ fontSize: 16, fontWeight: 600, cursor: "pointer", color: "#0F0E0C" }}
              >
                {item.q}
              </summary>
              <p style={{ fontSize: 15, color: "#555", marginTop: 12, lineHeight: 1.6 }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <footer
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "48px 32px",
          textAlign: "center",
          color: "#888",
          fontSize: 13,
          borderTop: "1px solid #f0f0f0"
        }}
      >
        <p style={{ margin: 0 }}>
          The Operator — a Black Vault product. © 2026 Black Vault.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#aaa" }}>
          Project ELSA · In memory of Elsa, 09/26/25.
        </p>
      </footer>
    </main>
  );
}
