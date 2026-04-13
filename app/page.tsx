import { AgentDashboard } from "@/components/AgentDashboard";
import { mockAgents } from "@/lib/mock-agents";

export default function HomePage() {
  return <AgentDashboard agents={mockAgents} />;
}
