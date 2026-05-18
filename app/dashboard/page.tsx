import Link from "next/link";
import { headers, cookies } from "next/headers";
import { OperatorPanel } from "@/components/operator/OperatorPanel";
import { CerebroHeartbeat } from "@/components/CerebroHeartbeat";
import "../operator.css";
import { DashboardBodyClass } from "./body-class";

// The Operator dashboard — light SaaS theme.
// DashboardBodyClass toggles `body.has-dashboard-light` on mount, which
// operator.css uses to swap the global dark cyberpunk backdrop for the
// light SaaS theme used inside /dashboard.
//
// Admin nav links (/pipeline, /content-studio, /admin/incidents) are
// only rendered when an admin cookie is present. Paying tenants never
// see those routes — they belong to the founder's private cockpit.

export const dynamic = "force-dynamic";

async function isAdmin(): Promise<boolean> {
  // Local dev is always the founder. `.env.local` is often pulled from Vercel
  // (so OPERATOR_AUTH_SECRET AND VERCEL=1 end up set locally), but localhost
  // is your box — it shouldn't gate you behind a cookie login dance. We rely
  // on NODE_ENV here because Next.js sets it to "development" only inside
  // `next dev`; .env.local can't override that the way it can override VERCEL.
  if (process.env.NODE_ENV === "development") return true;

  const expected = process.env.OPERATOR_AUTH_SECRET?.trim();
  if (!expected) return false;

  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("x-operator-auth")?.value?.trim();
  if (cookieVal === expected) return true;
  // Also accept Authorization header for API-like access via curl etc
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";
  return bearer === expected;
}

export default async function DashboardPage() {
  const admin = await isAdmin();
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
            {/* Tenants get the full operator surface (BYOK-scoped, session-isolated
                per project_tenant_full_surface_2026_05_14). All four routes are
                tenant-aware:
                  - /content-studio scopes drops via lib/tenant-als
                  - /pipeline AgentDashboard hides Data Catalogue + Settings Advanced
                  - /admin/incidents filters audit feed to actor/target === tenant.id
                  - /launch renders TenantLaunchView (creds form + store-only checks)
                                                                                  */}
            <Link href="/content-studio" style={navLink}>Content studio →</Link>
            <Link href="/pipeline" style={navLink}>Pipeline →</Link>
            <Link href="/launch" style={navLink}>Launch readiness →</Link>
            <Link href="/admin/incidents" style={navLink}>Incidents →</Link>
            <Link href="/settings" style={navLink}>Settings →</Link>
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
        {/* Brain heartbeat sits above the chat so the user sees the system is alive
            before they type a word — the premium-feel anchor on every tenant's
            landing surface, not just the admin /pipeline route. */}
        <div style={{ margin: "0 0 24px" }}>
          <CerebroHeartbeat />
        </div>
        <OperatorPanel />
      </div>
    </>
  );
}
