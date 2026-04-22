import { AgentDashboard } from "@/components/AgentDashboard";
import { Memorial } from "@/components/Memorial";
import { mockAgents } from "@/lib/mock-agents";

export default function HomePage() {
  return (
    <>
      <AgentDashboard agents={mockAgents} />
      <Memorial />
    </>
  );
}
