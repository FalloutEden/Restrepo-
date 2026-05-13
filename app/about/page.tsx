import Link from "next/link";

// About / origin story for The Operator.
//
// This is where Project ELSA gets its full telling. The landing page hints
// at the "why" with a single line; this page carries the weight.

export const dynamic = "force-dynamic";

export default function AboutPage() {
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
      {/* Nav (same as landing) */}
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
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>The Operator</span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>by Black Vault</span>
        </Link>
        <div style={{ display: "flex", gap: 24, fontSize: 14, alignItems: "center" }}>
          <Link href="/#pricing" style={{ color: "#555", textDecoration: "none" }}>Pricing</Link>
          <Link href="/about" style={{ color: "#0F0E0C", textDecoration: "none", fontWeight: 600 }}>About</Link>
          <Link href="/case-study" style={{ color: "#555", textDecoration: "none" }}>Case study</Link>
          <Link href="/onboard" style={{ background: "#0F0E0C", color: "#fff", padding: "8px 16px", borderRadius: 6, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
            Hire your Operator
          </Link>
        </div>
      </nav>

      <article style={{ maxWidth: 720, margin: "0 auto", padding: "80px 32px 96px" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.2em", color: "#A67843", marginBottom: 16, fontWeight: 600 }}>
          THE WHY
        </p>
        <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.1, marginBottom: 32, letterSpacing: "-0.02em" }}>
          Project ELSA
        </h1>

        <p style={baseText}>
          After losing my service dog Elsa, I decided to break from the 9-to-5 path I&apos;d been on
          and build something different.
        </p>
        <p style={baseText}>
          The Operator is what came out of that decision — an engine that lets indie founders run
          real businesses without giving up the time and attention that actually matters. It carries
          her name because it carries the principles she lived by: loyal, useful, present.
        </p>
        <p style={baseText}>
          I built it because I wanted to choose how I spent my hours. I&apos;m sharing it so other
          people can too.
        </p>

        <h2 style={{ fontSize: 28, fontWeight: 800, marginTop: 64, marginBottom: 16, letterSpacing: "-0.01em" }}>
          What I built
        </h2>
        <p style={baseText}>
          Black Vault started as a premium apparel brand — Black Vault Apparel — because apparel is something I love and a market I could test with real customer orders.
        </p>
        <p style={baseText}>
          But the apparel was never really the point. I wanted to build the kind of engine that lets a one-person business actually be a one-person business. So the engine became the product. The brand became the proof.
        </p>
        <p style={baseText}>
          <strong>The Operator</strong> is the agent that runs Black Vault Apparel. Now it can run yours too.
        </p>

        <h2 style={{ fontSize: 28, fontWeight: 800, marginTop: 64, marginBottom: 16, letterSpacing: "-0.01em" }}>
          What ELSA stands for
        </h2>
        <p style={baseText}>
          <strong>E</strong>volved <strong>L</strong>oyal <strong>S</strong>ervice <strong>A</strong>gent.
        </p>
        <p style={baseText}>
          A service dog is loyal by nature, useful by training, and present by choice. The agent I built is meant to embody the same three things in a system that runs a business: loyal to one merchant at a time, useful in concrete operational ways, and present whether or not the founder is looking.
        </p>
        <p style={baseText}>
          The name carries her with it. That's the entire purpose.
        </p>

        <h2 style={{ fontSize: 28, fontWeight: 800, marginTop: 64, marginBottom: 16, letterSpacing: "-0.01em" }}>
          What I'm not promising
        </h2>
        <p style={baseText}>
          The Operator does not generate customers. It does not write your marketing strategy. It does not make a bad product idea good.
        </p>
        <p style={baseText}>
          What it does is remove the operational friction that kills most one-person brands before they get started. The setup work. The catalog management. The copy. The mockups. The email flows. The daily content. The thousand small clerical decisions that drain attention.
        </p>
        <p style={baseText}>
          You bring the brand idea, the marketing instinct, and the will to do the work that matters. The Operator handles the rest.
        </p>

        <h2 style={{ fontSize: 28, fontWeight: 800, marginTop: 64, marginBottom: 16, letterSpacing: "-0.01em" }}>
          Who I am
        </h2>
        <p style={baseText}>
          I'm a solo indie founder. I write the code, I run the brand, I take the support emails, and I will personally onboard every one of the first 50 merchants.
        </p>
        <p style={baseText}>
          The day I have to hire a team is the day The Operator is genuinely working. Until then, it's me and the agent.
        </p>

        <div
          style={{
            marginTop: 64,
            padding: 32,
            background: "#FAFAFA",
            borderRadius: 12,
            borderLeft: "4px solid #A67843"
          }}
        >
          <p style={{ ...baseText, margin: 0, fontStyle: "italic", color: "#333" }}>
            &ldquo;Loyal by nature, useful by training, present by choice.&rdquo;
          </p>
        </div>

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
            Hire your Operator →
          </Link>
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
