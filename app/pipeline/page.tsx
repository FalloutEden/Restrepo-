import Link from "next/link";
import { headers, cookies } from "next/headers";
import { AgentHero } from "@/components/AgentHero";
import { AgentDashboard } from "@/components/AgentDashboard";
import { Memorial } from "@/components/Memorial";
import { mockAgents } from "@/lib/mock-agents";

export const dynamic = "force-dynamic";

// Same isAdmin gate as /dashboard. Local dev = always admin. On Vercel,
// require OPERATOR_AUTH_SECRET cookie or bearer. Tenants without that get
// the tenant-safe view of AgentDashboard (Data Catalogue tab hidden, Settings
// Advanced hidden — already wired via the isAdmin prop's gates).
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

export default async function PipelinePage() {
  const admin = await isAdmin();
  return (
    <div className="page-shell">
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px 0",
          fontSize: 13
        }}
      >
        <Link href="/dashboard" style={{ color: "rgba(255, 255, 255, 0.6)", textDecoration: "none" }}>
          ← Back to operator
        </Link>
        <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 12 }}>
          {admin ? "Pipeline view — 11-agent autonomous run" : "Your agent ecosystem"}
        </span>
      </nav>
      {/* AgentHero's "Hunt now" button kicks off /api/autonomous-run/start,
          which is tenant-aware: runs are tagged with the caller's tenantId
          and the execution wrapped in runWithTenant so every storage call
          inside the 11-agent pipeline routes to the right bucket. Reads of
          /api/autonomous-run/[runId] + its SSE event stream check ownership. */}
      <AgentHero />
      <AgentDashboard agents={mockAgents} isAdmin={admin} />
      <Memorial />
    </div>
  );
}
