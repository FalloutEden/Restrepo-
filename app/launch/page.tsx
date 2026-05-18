import Link from "next/link";
import { headers, cookies } from "next/headers";

import { getLaunchStatusForAllBrands, type LaunchCheck } from "@/lib/launch-status";
import { TenantLaunchView } from "@/components/launch/TenantLaunchView";
import "../operator.css";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<LaunchCheck["status"], string> = {
  ok: "#7CCB8E",
  warn: "#E0B567",
  fail: "#E07B6A"
};

const STATUS_BADGE: Record<LaunchCheck["status"], string> = {
  ok: "✓ OK",
  warn: "! WARN",
  fail: "✗ FAIL"
};

// Same admin gate pattern as /dashboard + /pipeline. Tenants reach this page
// and get TenantLaunchView (a client component that fetches /api/launch-status
// with authedFetch). Founder gets the all-brands cockpit server-rendered.
async function isAdmin(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const expected = process.env.OPERATOR_AUTH_SECRET?.trim();
  if (!expected) return false;
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("x-operator-auth")?.value?.trim();
  if (cookieVal === expected) return true;
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";
  return bearer === expected;
}

export default async function LaunchPage() {
  const admin = await isAdmin();

  if (!admin) {
    return (
      <div className="page-shell">
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px 0",
            fontSize: 13
          }}
        >
          <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>
            ← Back to operator
          </Link>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>your store</span>
        </nav>
        <header className="operator-header">
          <span className="eyebrow">Launch</span>
          <h1 className="operator-title">Launch readiness</h1>
          <p className="operator-sub">
            Live readiness check on your store. We connect to Shopify with the token you paste
            below, run a few checks, and tell you what&apos;s blocking launch in plain language.
          </p>
        </header>
        <TenantLaunchView />
      </div>
    );
  }

  const reports = await getLaunchStatusForAllBrands();

  return (
    <div className="page-shell">
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px 0",
          fontSize: 13
        }}
      >
        <Link
          href="/"
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            textDecoration: "none"
          }}
        >
          ← Operator
        </Link>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          generated {new Date().toLocaleString()}
        </span>
      </nav>

      <header className="operator-header">
        <span className="eyebrow">Launch</span>
        <h1 className="operator-title">Launch readiness</h1>
        <p className="operator-sub">
          Live readiness check across configured brands. Read-only — fixes go through the operator chat
          or the Vercel admin. Refresh the page to re-run all checks.
        </p>
      </header>

      <div style={{ padding: "0 16px 48px", maxWidth: 920, margin: "0 auto" }}>
        {reports.map((r) => (
          <section
            key={r.brand}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              background: "rgba(255,255,255,0.02)"
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, color: "#D4B896" }}>{r.brand}</h2>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: STATUS_COLOR[r.overall],
                  border: `1px solid ${STATUS_COLOR[r.overall]}`,
                  padding: "4px 10px",
                  borderRadius: 4
                }}
              >
                Overall: {r.overall}
              </span>
            </header>

            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {r.checks.map((c) => (
                <li
                  key={c.id}
                  style={{
                    padding: "12px 0",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gridTemplateColumns: "100px 1fr",
                    gap: 16,
                    alignItems: "start"
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: STATUS_COLOR[c.status],
                      whiteSpace: "nowrap"
                    }}
                  >
                    {STATUS_BADGE[c.status]}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{c.detail}</div>
                    {c.fix && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(212,184,150,0.85)",
                          marginTop: 6,
                          fontStyle: "italic"
                        }}
                      >
                        Fix: {c.fix}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 16, textAlign: "center" }}>
          Same data as <code>GET /api/launch-status</code> · ask the operator to run{" "}
          <code>launch_status</code> for the same view in chat.
        </p>
      </div>
    </div>
  );
}
