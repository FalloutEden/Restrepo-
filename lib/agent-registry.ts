export type AgentRoleId =
  | "research"
  | "routing"
  | "validation"
  | "build"
  | "output";

export type AgentExecutionStatus = "queued" | "running" | "retrying" | "completed" | "failed";

export type AgentRoleDefinition = {
  id: AgentRoleId;
  name: string;
  responsibility: string;
};

export type AgentRunTrace = {
  roleId: AgentRoleId;
  name: string;
  responsibility: string;
  summary: string;
  itemCount: number;
  status: AgentExecutionStatus;
  attempts: number;
  retryCount: number;
  batchIndex: number;
  error?: string;
};

export const REGISTERED_AGENT_DEFINITIONS: AgentRoleDefinition[] = [
  {
    id: "research",
    name: "Research Agent",
    responsibility: "Turn the user goal into high-quality search queries and product-source directions."
  },
  {
    id: "routing",
    name: "Routing Agent",
    responsibility: "Select the best real-product lanes and limit the run to a reliable set of candidates."
  },
  {
    id: "validation",
    name: "Validation Agent",
    responsibility: "Approve only the strongest candidates that can be backed by real Zendrop or Printful data."
  },
  {
    id: "build",
    name: "Build Agent",
    responsibility: "Convert approved candidates into real source-backed products with title, description, price, and images."
  },
  {
    id: "output",
    name: "Output Agent",
    responsibility: "Create Shopify draft products only when real sourced product data exists."
  }
];

export function createQueuedAgentRuns(batchIndex = 0): AgentRunTrace[] {
  return REGISTERED_AGENT_DEFINITIONS.map((agent) => ({
    roleId: agent.id,
    name: agent.name,
    responsibility: agent.responsibility,
    summary: "Queued for execution.",
    itemCount: 0,
    status: "queued",
    attempts: 0,
    retryCount: 0,
    batchIndex
  }));
}
