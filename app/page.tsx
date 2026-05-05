import Link from "next/link";
import { OperatorPanel } from "@/components/operator/OperatorPanel";
import "./operator.css";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="page-shell">
      <nav
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 16px 0",
          fontSize: 13
        }}
      >
        <Link
          href="/content-studio"
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            textDecoration: "none",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "6px 12px",
            borderRadius: 8
          }}
        >
          Content studio →
        </Link>
        <Link
          href="/pipeline"
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            textDecoration: "none",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "6px 12px",
            borderRadius: 8
          }}
        >
          View pipeline →
        </Link>
      </nav>
      <header className="operator-header">
        <span className="eyebrow">Operator</span>
        <h1 className="operator-title">Black Vault Umbrella Operator</h1>
        <p className="operator-sub">
          The managing-director agent. Free actions run autonomously. Anything spend-bound lands in the
          approval inbox below with an ROI brief. Ask it to run the full pipeline when you want fresh research.
        </p>
      </header>
      <OperatorPanel />
    </div>
  );
}
