import Link from "next/link";
import { OperatorPanel } from "@/components/operator/OperatorPanel";
import "../operator.css";
import { DashboardBodyClass } from "./body-class";

// The Operator dashboard — light SaaS theme.
// DashboardBodyClass toggles `body.has-dashboard-light` on mount, which
// operator.css uses to override globals.css's dark UmbrellaBackground.
// Admin routes (/pipeline, /content-studio) keep the dark globals.

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const navLink: React.CSSProperties = {
    color: "#555",
    textDecoration: "none",
    border: "1px solid #ebebeb",
    padding: "6px 12px",
    borderRadius: 8,
    background: "#fff"
  };

  return (
    <>
      <DashboardBodyClass />
      <div className="page-shell">
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "16px 0",
            fontSize: 13
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#0F0E0C" }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                background: "#0F0E0C",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#A67843",
                fontWeight: 800,
                fontSize: 12,
                fontFamily: "'SF Mono', Menlo, monospace"
              }}
            >
              O
            </div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>The Operator</span>
            <span style={{ fontSize: 11, color: "#888", marginLeft: 2 }}>by Black Vault</span>
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/launch" style={navLink}>Launch readiness →</Link>
            <Link href="/content-studio" style={navLink}>Content studio →</Link>
            <Link href="/pipeline" style={navLink}>View pipeline →</Link>
          </div>
        </nav>
        <header className="operator-header">
          <span className="eyebrow">The Operator · by Black Vault</span>
          <h1 className="operator-title">Your Operator</h1>
          <p className="operator-sub">
            Your managing-director agent. Free actions run autonomously. Anything spend-bound lands in
            the approval inbox below with an ROI brief. Ask it to run the full pipeline when you want
            fresh research.
          </p>
        </header>
        <OperatorPanel />
      </div>
    </>
  );
}
