export type AgentStatus = "Running" | "Idle" | "Completed" | "Blocked" | "Error";

export type Agent = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  background: string;
  avatarFrames?: string[];
  blinkFrames?: string[];
  frameRate?: number;
  loop?: boolean;
  status: AgentStatus;
  latestOutputPreview: string;
  latestOutput: string;
  updatedAt: string;
  queueDepth: number;
  owner: string;
};

type AgentPayload = Partial<Agent> & {
  avatarFrames?: unknown;
  blinkFrames?: unknown;
  frameRate?: unknown;
  loop?: unknown;
  queueDepth?: unknown;
  status?: unknown;
};

const OPERATIONAL_ERROR_MESSAGE = "Agent data unavailable. Review payload and retry.";

const agentDefaults: Agent[] = [
  {
    id: "planner-01",
    name: "Wesker",
    role: "Research Agent",
    avatar: "/agents/Albert Wesker.png",
    background: "/backgrounds/wesker-room.png",
    avatarFrames: ["/agents/Albert Wesker.png"],
    blinkFrames: ["/agents/Albert Wesker.png"],
    frameRate: 6,
    loop: true,
    status: "Running",
    latestOutputPreview: "Scanning promising Etsy categories and narrowing the workflow to one commercially viable product direction.",
    latestOutput: "Compiled a trend brief that highlights one product angle, its buyer profile, and the strongest internal reason to pursue it next.",
    updatedAt: "2 minutes ago",
    queueDepth: 4,
    owner: "Executive Command"
  },
  {
    id: "research-02",
    name: "Red Queen",
    role: "Product Agent",
    avatar: "/agents/Red Queen.png",
    background: "/backgrounds/red-queen-room.png",
    avatarFrames: ["/agents/Red Queen.png"],
    blinkFrames: ["/agents/Red Queen.png"],
    frameRate: 6,
    loop: true,
    status: "Completed",
    latestOutputPreview: "Transforming the research brief into a product concept and a clear mockup prompt for the listing workflow.",
    latestOutput: "Finished converting the chosen niche into a concrete Etsy product idea with a visual direction the listing team can execute against.",
    updatedAt: "12 minutes ago",
    queueDepth: 0,
    owner: "Central Intelligence"
  },
  {
    id: "ops-03",
    name: "HUNK",
    role: "Operations Support",
    avatar: "/agents/HUNK.png",
    background: "/backgrounds/hunk-room.png",
    avatarFrames: ["/agents/HUNK.png"],
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Standing by for recovery operations while monitoring queue growth and potential extraction events.",
    latestOutput: "No active incidents detected. Retry rates remain inside tolerance and the backlog is stable pending the next spike event.",
    updatedAt: "18 minutes ago",
    queueDepth: 1,
    owner: "USS Command"
  },
  {
    id: "writer-04",
    name: "Nemesis",
    role: "Listing Backup",
    avatar: "/agents/Nemesis.png",
    background: "/backgrounds/nemesis-room.png",
    avatarFrames: ["/agents/Nemesis.png"],
    blinkFrames: ["/agents/Nemesis.png"],
    frameRate: 6,
    loop: true,
    status: "Running",
    latestOutputPreview: "Driving an aggressive status brief that converts raw telemetry into pursuit-grade mission directives.",
    latestOutput: "Generating a two-part operational dossier with current system posture first, followed by high-confidence risk targets and projected breach vectors.",
    updatedAt: "4 minutes ago",
    queueDepth: 3,
    owner: "Bio-Weapon Division"
  },
  {
    id: "review-05",
    name: "Birkin",
    role: "Quality Review",
    avatar: "/agents/William Birkin.png",
    background: "/backgrounds/birkin-room.png",
    avatarFrames: ["/agents/William Birkin.png"],
    blinkFrames: ["/agents/William Birkin.png"],
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Mutation analysis payload normalized and ready for local execution review.",
    latestOutput: "Fallback defaults were applied to incomplete payload fields so the card could render safely without halting the dashboard.",
    updatedAt: "7 minutes ago",
    queueDepth: 2,
    owner: "Research Lab"
  },
  {
    id: "triage-06",
    name: "Tyrant",
    role: "Approval Guard",
    avatar: "/agents/Tyrant.png",
    background: "/backgrounds/tyrant-room.png",
    avatarFrames: ["/agents/Tyrant.png"],
    blinkFrames: ["/agents/Tyrant.png"],
    frameRate: 6,
    loop: true,
    status: "Completed",
    latestOutputPreview: "Sorted incoming incident reports into rendering faults, alert noise, and export corruption clusters.",
    latestOutput: "Processed 42 incident reports. The largest cluster involved stale activity timestamps, with mobile clipping and export formatting issues following behind.",
    updatedAt: "22 minutes ago",
    queueDepth: 0,
    owner: "Containment Ops"
  },
  {
    id: "builder-07",
    name: "Ada",
    role: "Listing Agent",
    avatar: "/agents/Ada Wong.png",
    background: "/backgrounds/ada-room.png",
    avatarFrames: ["/agents/Ada Wong.png"],
    blinkFrames: ["/agents/Ada Wong.png"],
    frameRate: 6,
    loop: true,
    status: "Running",
    latestOutputPreview: "Writing one Etsy listing package with title, description, tags, price, and delivery notes.",
    latestOutput: "Built a complete Etsy listing draft from the product concept and mockup prompt so the approval system can review one final output.",
    updatedAt: "1 minute ago",
    queueDepth: 5,
    owner: "Special Operations"
  },
  {
    id: "memory-08",
    name: "Umbrella Core",
    role: "Approval System",
    avatar: "/agents/Umbrella-Core.png",
    background: "/backgrounds/umbrella-core-room.png",
    avatarFrames: ["/agents/Umbrella-Core.png"],
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Packaging the final listing and preserving each handoff before publication stays blocked for approval.",
    latestOutput: "Approval packet compiled successfully. The completed Etsy listing is staged for human review and not connected to live publishing.",
    updatedAt: "31 minutes ago",
    queueDepth: 1,
    owner: "Umbrella Systems"
  }
];

const rawAgentPayloads: AgentPayload[] = [
  agentDefaults[0],
  agentDefaults[1],
  agentDefaults[2],
  agentDefaults[3],
  {
    id: "review-05",
    name: "Birkin",
    role: "Mutation Analysis",
    avatar: "/agents/William Birkin.png",
    background: "/backgrounds/birkin-room.png",
    avatarFrames: ["/agents/William Birkin.png", 12 as never, null as never],
    blinkFrames: "bad-frame-data" as never,
    latestOutputPreview: undefined,
    latestOutput: "Recovered incomplete payload fields and resumed safe local rendering.",
    updatedAt: "7 minutes ago",
    queueDepth: "2" as never,
    owner: "Research Lab"
  },
  agentDefaults[5],
  agentDefaults[6],
  agentDefaults[7]
];

const validStatuses = new Set<AgentStatus>(["Running", "Idle", "Completed", "Blocked", "Error"]);

function pickString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function pickNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function pickStatus(value: unknown, fallback: AgentStatus) {
  return typeof value === "string" && validStatuses.has(value as AgentStatus) ? (value as AgentStatus) : fallback;
}

function pickImagePath(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") ? value : fallback;
}

function pickImageArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.filter((entry): entry is string => typeof entry === "string" && entry.startsWith("/"));
  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeAgentPayload(payload: AgentPayload, fallback: Agent): Agent {
  const normalized: Agent = {
    id: pickString(payload.id, fallback.id),
    name: pickString(payload.name, fallback.name),
    role: pickString(payload.role, fallback.role),
    avatar: pickImagePath(payload.avatar, fallback.avatar),
    background: pickImagePath(payload.background, fallback.background),
    avatarFrames: pickImageArray(payload.avatarFrames, fallback.avatarFrames ?? [fallback.avatar]),
    blinkFrames: pickImageArray(payload.blinkFrames, fallback.blinkFrames ?? [fallback.avatar]),
    frameRate: pickNumber(payload.frameRate, fallback.frameRate ?? 6),
    loop: pickBoolean(payload.loop, fallback.loop ?? true),
    status: pickStatus(payload.status, fallback.status),
    latestOutputPreview: pickString(payload.latestOutputPreview, fallback.latestOutputPreview),
    latestOutput: pickString(payload.latestOutput, fallback.latestOutput),
    updatedAt: pickString(payload.updatedAt, fallback.updatedAt),
    queueDepth: pickNumber(payload.queueDepth, fallback.queueDepth),
    owner: pickString(payload.owner, fallback.owner)
  };

  const missingRequiredData = !normalized.id || !normalized.name || !normalized.avatar || !normalized.background;
  if (!missingRequiredData) {
    return normalized;
  }

  return {
    ...fallback,
    status: "Error",
    latestOutputPreview: OPERATIONAL_ERROR_MESSAGE,
    latestOutput: OPERATIONAL_ERROR_MESSAGE,
    queueDepth: 0
  };
}

export const mockAgents: Agent[] = rawAgentPayloads.map((payload, index) => normalizeAgentPayload(payload, agentDefaults[index]));
