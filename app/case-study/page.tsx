import Link from "next/link";

// Case study: Black Vault Apparel as proof-of-concept for The Operator.
// Honest numbers, real screenshots (linked), no fluff.

export const dynamic = "force-dynamic";

export default function CaseStudyPage() {
  const baseText = { color: "#444", fontSize: 17, lineHeight: 1.75, margin: "0 0 24px" };
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        color: "#0F0E0C",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
        lineHeight: 1.55
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#0F0E0C", display: "flex", alignItems: "center", justifyContent: "center", color: "#A67843", fontWeight: 800, fontSize: 14, fontFamily: "'SF Mono', Menlo, monospace" }}>O</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>The Operator</span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>by Black Vault</span>
        </Link>
        <div style={{ display: "flex", gap: 24, fontSize: 14, alignItems: "center" }}>
          <Link href="/#pricing" style={{ color: "#555", textDecoration: "none" }}>Pricing</Link>
          <Link href="/about" style={{ color: "#555", textDecoration: "none" }}>About</Link>
          <Link href="/case-study" style={{ color: "#0F0E0C", textDecoration: "none", fontWeight: 600 }}>Case study</Link>
          <Link href="/onboard" style={{ background: "#0F0E0C", color: "#fff", padding: "8px 16px", borderRadius: 6, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
            Hire your Operator
          </Link>
        </div>
      </nav>

      <article style={{ maxWidth: 760, margin: "0 auto", padding: "80px 32px 96px" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.2em", color: "#A67843", marginBottom: 16, fontWeight: 600 }}>
          PROOF OF CONCEPT
        </p>
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, marginBottom: 16, letterSpacing: "-0.02em" }}>
          Black Vault Apparel
        </h1>
        <p style={{ fontSize: 19, color: "#666", marginBottom: 48 }}>
          The brand that built The Operator into a real working system.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
            marginBottom: 48
          }}
        >
          {[
            { label: "Live since", value: "May 2026" },
            { label: "Active products", value: "31" },
            { label: "Verified order", value: "$148" },
            { label: "Setup time", value: "48h" }
          ].map((stat) => (
            <div key={stat.label} style={{ padding: 20, background: "#FAFAFA", borderRadius: 10, border: "1px solid #ebebeb" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#888", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0F0E0C", letterSpacing: "-0.01em" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 48, marginBottom: 16, letterSpacing: "-0.01em" }}>What we built</h2>
        <p style={baseText}>
          A premium dark-luxury apparel brand. Embroidered chest marks, all-over-print capsule pieces, headwear, accessories. Same lane as Aimé Leon Dore meets Fear of God Essentials — restrained, monogram-centric, built to keep.
        </p>
        <p style={baseText}>
          The Operator handled the entire build:
        </p>
        <ul style={{ ...baseText, paddingLeft: 24 }}>
          <li>Product catalog selection and Printful sync (31 products)</li>
          <li>Brand-fit copy on every product page</li>
          <li>Custom embroidery file setup (gold thread BV mark at 800×800 in 1200×1200 area, ~2.7&quot;)</li>
          <li>500-DPI all-over-print graphic applied across the AOP capsule</li>
          <li>Klaviyo welcome flow + abandoned cart sequence templates</li>
          <li>Sales channel: Shopify Online Store + queued for TikTok Shop + Pinterest</li>
          <li>Daily content prompts for Pinterest seeding (10 starter pins, drafted to brand voice)</li>
        </ul>

        <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 48, marginBottom: 16, letterSpacing: "-0.01em" }}>Real numbers, honest</h2>
        <p style={baseText}>
          We&apos;re at <strong>$148 of verified customer revenue</strong> from one real order. Small. Single-digit traffic days. The brand is barely a month into being a live commercial entity.
        </p>
        <p style={baseText}>
          That is exactly the point. The Operator isn&apos;t for sale because BV is a viral hit. It&apos;s for sale because the <em>system</em> works end-to-end: customer adds to cart, pays via Shopify, webhook fires to Vercel, Printful gets the production order, customer gets shipped a real garment. The chain is verified.
        </p>
        <p style={baseText}>
          Marketing is the slow, hard, ongoing work. The Operator doesn&apos;t fix that. But the operational machine underneath is real, and you can have it for $99/month.
        </p>

        <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 48, marginBottom: 16, letterSpacing: "-0.01em" }}>What broke along the way</h2>
        <p style={baseText}>
          I&apos;m not going to pretend this was clean. A short list of things that broke and got fixed before launch:
        </p>
        <ul style={{ ...baseText, paddingLeft: 24 }}>
          <li>AI image generation hallucinated the BV chest monogram into &ldquo;PV&rdquo; / &ldquo;RV&rdquo; — switched to Printful-rendered mockups only</li>
          <li>AOP graphic was 25 DPI on first pass — replaced with 500 DPI source across all 7 AOP products</li>
          <li>Catalog page background mismatch with white product mockups — flipped to dark theme + selective sharp-cut compositing</li>
          <li>Embroidery thread color wrong on first mockup batch (Printful default) — wired thread_colors_chest_left: #A67843 (Old Gold) across all 17 chest-embroidered products</li>
          <li>Meta ads account auto-denied verification on first attempt — documented and re-routed strategy to organic Pinterest + TikTok Shop</li>
        </ul>
        <p style={baseText}>
          Each of these is now a guardrail in The Operator. Future merchants don&apos;t step on the same mines.
        </p>

        <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 48, marginBottom: 16, letterSpacing: "-0.01em" }}>Why you should care</h2>
        <p style={baseText}>
          If you&apos;ve been sitting on a brand idea for months because Shopify and Printful and Klaviyo and product photography feel like a wall — that wall is what The Operator handles. The work that actually matters (marketing, brand voice, customer relationships) is still on you.
        </p>
        <p style={baseText}>
          But you get to spend your time on those things instead of the operational tax.
        </p>

        <div style={{ marginTop: 64, textAlign: "center" }}>
          <Link
            href="/onboard"
            style={{
              display: "inline-block",
              background: "#0F0E0C",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15
            }}
          >
            Launch your brand →
          </Link>
          <p style={{ fontSize: 13, color: "#888", marginTop: 16 }}>
            $499 setup · $99/month · cancel anytime
          </p>
        </div>
      </article>

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
        <p style={{ margin: 0 }}>The Operator — a Black Vault product. © 2026 Black Vault.</p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#aaa" }}>
          Project ELSA · In memory of Elsa, 09/26/25.
        </p>
      </footer>
    </main>
  );
}
