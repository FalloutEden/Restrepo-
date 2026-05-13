import Link from "next/link";

// Minimal docs page for merchants. Covers:
//   - How to authenticate (bearer token)
//   - Where to chat with The Operator
//   - How to add Shopify/Printful credentials
//   - Support contact

export const dynamic = "force-dynamic";

export default function DocsPage() {
  const baseText = { color: "#444", fontSize: 16, lineHeight: 1.75, margin: "0 0 16px" };
  const codeBlock: React.CSSProperties = {
    background: "#FAFAFA",
    border: "1px solid #ebebeb",
    borderRadius: 8,
    padding: 16,
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    fontSize: 13,
    overflowX: "auto",
    margin: "0 0 24px"
  };

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
          <Link href="/case-study" style={{ color: "#555", textDecoration: "none" }}>Case study</Link>
          <Link href="/dashboard" style={{ color: "#555", textDecoration: "none" }}>Log in</Link>
        </div>
      </nav>

      <article style={{ maxWidth: 760, margin: "0 auto", padding: "60px 32px 96px" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.2em", color: "#A67843", marginBottom: 16, fontWeight: 600 }}>
          DOCS
        </p>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 16, letterSpacing: "-0.02em" }}>
          Using your Operator
        </h1>
        <p style={{ fontSize: 17, color: "#666", marginBottom: 48 }}>
          The short, honest guide. Bookmark this page or save the bearer token email from your welcome
          message.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 0, marginBottom: 12, letterSpacing: "-0.01em" }}>
          Your bearer token
        </h2>
        <p style={baseText}>
          When you signed up, we emailed you a token that starts with{" "}
          <code style={{ background: "#FAFAFA", padding: "2px 6px", borderRadius: 4, fontSize: 14, fontFamily: "'SF Mono', Menlo, monospace" }}>btk_</code>.
          That token is how you authenticate to your Operator.
        </p>
        <p style={baseText}>
          <strong>Save it in a password manager.</strong> We don&apos;t keep a retrievable copy. If you lose it,
          ask support to rotate (the old token instantly stops working; a new one gets generated and
          emailed).
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 48, marginBottom: 12, letterSpacing: "-0.01em" }}>
          Chat with the Operator
        </h2>
        <p style={baseText}>
          Go to <Link href="/dashboard" style={{ color: "#A67843", fontWeight: 600 }}>/dashboard</Link>.
          You&apos;ll be prompted for your bearer token. After that you have a chat interface to your
          Operator agent.
        </p>
        <p style={baseText}>Things to try first:</p>
        <ul style={{ ...baseText, paddingLeft: 24 }}>
          <li>&ldquo;What do you need from me to start the build?&rdquo;</li>
          <li>&ldquo;Show me my current product catalog&rdquo;</li>
          <li>&ldquo;Generate three caption ideas for my latest product&rdquo;</li>
          <li>&ldquo;What&apos;s a reasonable retail price for a heavyweight hoodie at 12oz?&rdquo;</li>
        </ul>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 48, marginBottom: 12, letterSpacing: "-0.01em" }}>
          API access (advanced)
        </h2>
        <p style={baseText}>
          You can hit your Operator&apos;s API directly. The bearer token in an{" "}
          <code style={{ background: "#FAFAFA", padding: "2px 6px", borderRadius: 4, fontSize: 14, fontFamily: "'SF Mono', Menlo, monospace" }}>Authorization</code>{" "}
          header is all you need. Example chat call:
        </p>
        <pre style={codeBlock}>
{`curl -X POST https://operator.blackvault.studio/api/operator/chat \\
  -H "Authorization: Bearer btk_YOUR_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{ "message": "Show me my current product catalog" }'`}
        </pre>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 48, marginBottom: 12, letterSpacing: "-0.01em" }}>
          Adding your Shopify + Printful credentials
        </h2>
        <p style={baseText}>
          During onboarding we&apos;ll email you instructions for connecting:
        </p>
        <ol style={{ ...baseText, paddingLeft: 24 }}>
          <li>Create a Shopify free trial at <code>shopify.com/free-trial</code></li>
          <li>Add our build-staff email as a staff account with Products, Themes, Orders, Online Store permissions</li>
          <li>Create a Printful account and add our email as a team member</li>
          <li>Reply to the welcome email with both confirmations</li>
        </ol>
        <p style={baseText}>
          Once we have access, your Operator finishes the build within 48 hours. Encryption: your
          Shopify and Printful tokens are AES-256-GCM encrypted at rest (we use a per-installation
          master key — neither the database nor backups carry plaintext credentials).
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 48, marginBottom: 12, letterSpacing: "-0.01em" }}>
          Security
        </h2>
        <ul style={{ ...baseText, paddingLeft: 24 }}>
          <li>Tokens encrypted at rest (AES-256-GCM, unique IV per credential)</li>
          <li>HTTPS-only via Vercel (HSTS preload, 2-year max-age)</li>
          <li>Content Security Policy headers on every response</li>
          <li>Rate limiting on signup + auth endpoints</li>
          <li>Append-only audit log of security-relevant actions</li>
          <li>Stripe webhooks HMAC-verified inline (no payment state mutated on unsigned requests)</li>
        </ul>
        <p style={baseText}>
          If you spot something concerning, email <strong>security@blackvault.studio</strong>. Responsible
          disclosure appreciated; no bounty program yet.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 48, marginBottom: 12, letterSpacing: "-0.01em" }}>
          Support + cancellation
        </h2>
        <p style={baseText}>
          One indie founder runs support today. Reply to your welcome email; usual response within 24
          hours.
        </p>
        <p style={baseText}>
          To cancel: visit your Stripe customer portal link (in your welcome email). Cancellations are
          immediate at end-of-period. Your Shopify and Printful stay yours.
        </p>

        <div style={{ marginTop: 48, padding: 24, background: "#FAFAFA", borderRadius: 10, borderLeft: "4px solid #A67843" }}>
          <p style={{ ...baseText, margin: 0, fontSize: 15 }}>
            Found a gap in these docs? Reply to your welcome email and tell us what was missing. We
            add to this page when real merchants ask real questions.
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
