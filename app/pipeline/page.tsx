import Link from "next/link";
import { AgentHero } from "@/components/AgentHero";
import { AgentDashboard } from "@/components/AgentDashboard";
import { Memorial } from "@/components/Memorial";
import { mockAgents } from "@/lib/mock-agents";

export default function PipelinePage() {
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
        <Link href="/" style={{ color: "rgba(255, 255, 255, 0.6)", textDecoration: "none" }}>
          ← Back to operator
        </Link>
        <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 12 }}>
          Pipeline view — 11-agent autonomous run
        </span>
      </nav>
      <AgentHero />
      <AgentDashboard agents={mockAgents} />
      <Memorial />
    </div>
  );
}
