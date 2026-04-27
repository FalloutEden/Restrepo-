import { AgentHero } from "@/components/AgentHero";
import { AgentDashboard } from "@/components/AgentDashboard";
import { Memorial } from "@/components/Memorial";
import { mockAgents } from "@/lib/mock-agents";

export default function HomePage() {
  return (
    <div className="page-shell">
      <AgentHero />
      <AgentDashboard agents={mockAgents} />
      <Memorial />
    </div>
  );
}
