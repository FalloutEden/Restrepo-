export type AgentStatus = "Running" | "Retrying" | "Idle" | "Completed" | "Blocked" | "Failed" | "Error";

export type Agent = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  background: string;
  avatarFrames?: string[];
  blinkFrames?: string[];
  blinkAnimations?: string[][];
  frameRate?: number;
  loop?: boolean;
  blinkIntervalMs?: { min: number; max: number };
  flashOnFrames?: { color: string; frames: string[] };
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
  blinkAnimations?: unknown;
  blinkIntervalMs?: unknown;
  flashOnFrames?: unknown;
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
    role: "Trend Research Agent",
    avatar: "/agents/Wesker/glasses-1.png",
    background: "/backgrounds/wesker-room.png",
    avatarFrames: ["/agents/Wesker/glasses-1.png"],
    blinkAnimations: [
      [
        "/agents/Wesker/glasses-2.png",
        "/agents/Wesker/glasses-3.png",
        "/agents/Wesker/glasses-4.png"
      ],
      [
        "/agents/Wesker/dodge-1.png",
        "/agents/Wesker/dodge-2.png",
        "/agents/Wesker/dodge-3.png",
        "/agents/Wesker/dodge-4.png",
        "/agents/Wesker/dodge-5.png",
        "/agents/Wesker/dodge-6.png",
        "/agents/Wesker/dodge-7.png",
        "/agents/Wesker/dodge-8.png",
        "/agents/Wesker/dodge-9.png",
        "/agents/Wesker/dodge-10.png",
        "/agents/Wesker/dodge-11.png",
        "/agents/Wesker/dodge-12.png"
      ]
    ],
    frameRate: 6,
    blinkIntervalMs: { min: 1800, max: 4500 },
    loop: true,
    status: "Running",
    latestOutputPreview: "Synthesizing saved market signals, reference examples, and feedback into a current trend brief.",
    latestOutput: "Compiled a trend brief covering premium patterns, buyer signals, whitespace, and channel priorities for the next research run.",
    updatedAt: "2 minutes ago",
    queueDepth: 4,
    owner: "Executive Command"
  },
  {
    id: "research-02",
    name: "Red Queen",
    role: "Opportunity Router Agent",
    avatar: "/agents/Red Queen/hologram-5.png",
    background: "/backgrounds/red-queen-room.png",
    avatarFrames: [
      "/agents/Red Queen/hologram-1.png",
      "/agents/Red Queen/hologram-2.png",
      "/agents/Red Queen/hologram-3.png",
      "/agents/Red Queen/hologram-4.png",
      "/agents/Red Queen/hologram-5.png",
      "/agents/Red Queen/hologram-6.png",
      "/agents/Red Queen/hologram-7.png",
      "/agents/Red Queen/hologram-8.png",
      "/agents/Red Queen/hologram-9.png",
      "/agents/Red Queen/hologram-10.png"
    ],
    flashOnFrames: {
      color: "rgba(255, 60, 60, 0.18)",
      frames: [
        "/agents/Red Queen/hologram-1.png",
        "/agents/Red Queen/hologram-9.png",
        "/agents/Red Queen/hologram-10.png"
      ]
    },
    frameRate: 6,
    loop: true,
    status: "Completed",
    latestOutputPreview: "Routing the strongest signals into a diverse cross-channel opportunity set.",
    latestOutput: "Produced a non-duplicative opportunity batch across channels, niches, deliverables, and style directions.",
    updatedAt: "12 minutes ago",
    queueDepth: 0,
    owner: "Central Intelligence"
  },
  {
    id: "ops-03",
    name: "HUNK",
    role: "Product Strategy Agent",
    avatar: "/agents/Hunk/standing-rest.png",
    background: "/backgrounds/hunk-room.png",
    avatarFrames: ["/agents/Hunk/standing-rest.png"],
    blinkAnimations: [
      [
        "/agents/Hunk/shooting-1.png",
        "/agents/Hunk/shooting-2.png",
        "/agents/Hunk/shooting-3.png",
        "/agents/Hunk/shooting-4.png",
        "/agents/Hunk/shooting-5.png",
        "/agents/Hunk/shooting-6.png",
        "/agents/Hunk/shooting-7.png",
        "/agents/Hunk/shooting-8.png",
        "/agents/Hunk/shooting-9.png",
        "/agents/Hunk/shooting-10.png",
        "/agents/Hunk/shooting-6.png",
        "/agents/Hunk/shooting-7.png",
        "/agents/Hunk/shooting-8.png",
        "/agents/Hunk/shooting-9.png",
        "/agents/Hunk/shooting-10.png",
        "/agents/Hunk/shooting-6.png",
        "/agents/Hunk/shooting-7.png",
        "/agents/Hunk/shooting-8.png",
        "/agents/Hunk/shooting-9.png",
        "/agents/Hunk/shooting-10.png"
      ]
    ],
    blinkIntervalMs: { min: 4000, max: 8500 },
    flashOnFrames: {
      color: "rgba(255, 255, 255, 0.35)",
      frames: [
        "/agents/Hunk/shooting-6.png",
        "/agents/Hunk/shooting-7.png",
        "/agents/Hunk/shooting-8.png",
        "/agents/Hunk/shooting-9.png",
        "/agents/Hunk/shooting-10.png"
      ]
    },
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Converting shortlisted opportunities into build-ready strategy briefs.",
    latestOutput: "Prepared buyer clarity, feasibility, and build constraints for the strongest opportunities in the queue.",
    updatedAt: "18 minutes ago",
    queueDepth: 1,
    owner: "USS Command"
  },
  {
    id: "writer-04",
    name: "Nemesis",
    role: "Design Direction Agent",
    avatar: "/agents/Nemesis/standing-rest.png",
    background: "/backgrounds/nemesis-room.png",
    avatarFrames: ["/agents/Nemesis/standing-rest.png"],
    blinkAnimations: [
      [
        "/agents/Nemesis/tentacle-1.png",
        "/agents/Nemesis/tentacle-2.png",
        "/agents/Nemesis/tentacle-3.png",
        "/agents/Nemesis/tentacle-4.png",
        "/agents/Nemesis/tentacle-5.png",
        "/agents/Nemesis/tentacle-6.png",
        "/agents/Nemesis/tentacle-7.png",
        "/agents/Nemesis/tentacle-8.png",
        "/agents/Nemesis/tentacle-9.png",
        "/agents/Nemesis/tentacle-10.png"
      ]
    ],
    blinkIntervalMs: { min: 3500, max: 7500 },
    frameRate: 6,
    loop: true,
    status: "Running",
    latestOutputPreview: "Assigning design systems and style directions that reinforce approved references and avoid rejected patterns.",
    latestOutput: "Generated style direction notes, layout cues, and premium execution guidance for each shortlisted opportunity.",
    updatedAt: "4 minutes ago",
    queueDepth: 3,
    owner: "Bio-Weapon Division"
  },
  {
    id: "review-05",
    name: "Birkin",
    role: "Review/Approval Agent",
    avatar: "/agents/William Burkin/blink-1.png",
    background: "/backgrounds/birkin-room.png",
    avatarFrames: ["/agents/William Burkin/blink-1.png"],
    blinkAnimations: [
      [
        "/agents/William Burkin/blink-2.png",
        "/agents/William Burkin/blink-3.png",
        "/agents/William Burkin/blink-4.png"
      ],
      [
        "/agents/William Burkin/roar-2.png",
        "/agents/William Burkin/roar-3.png",
        "/agents/William Burkin/roar-4.png",
        "/agents/William Burkin/roar-5.png"
      ]
    ],
    blinkIntervalMs: { min: 2200, max: 5000 },
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Preparing approval notes and outbound guardrails for built drafts.",
    latestOutput: "Compiled approval summaries, risk notes, and final review guardrails for the approval queue.",
    updatedAt: "7 minutes ago",
    queueDepth: 2,
    owner: "Research Lab"
  },
  {
    id: "triage-06",
    name: "Tyrant",
    role: "Validation Guard Agent",
    avatar: "/agents/Tyrant/tip-hat-1.png",
    background: "/backgrounds/tyrant-room.png",
    avatarFrames: ["/agents/Tyrant/tip-hat-1.png"],
    blinkAnimations: [
      [
        "/agents/Tyrant/tip-hat-2.png",
        "/agents/Tyrant/tip-hat-3.png",
        "/agents/Tyrant/tip-hat-4.png",
        "/agents/Tyrant/tip-hat-5.png",
        "/agents/Tyrant/tip-hat-6.png",
        "/agents/Tyrant/tip-hat-7.png",
        "/agents/Tyrant/tip-hat-8.png",
        "/agents/Tyrant/tip-hat-9.png",
        "/agents/Tyrant/tip-hat-10.png"
      ]
    ],
    blinkIntervalMs: { min: 3000, max: 7000 },
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
    role: "Build Agent",
    avatar: "/agents/Ada/standing-rest.png",
    background: "/backgrounds/ada-room.png",
    avatarFrames: ["/agents/Ada/standing-rest.png"],
    blinkAnimations: [
      [
        "/agents/Ada/side-1.png",
        "/agents/Ada/side-2.png",
        "/agents/Ada/side-3.png"
      ],
      [
        "/agents/Ada/aiming-1.png",
        "/agents/Ada/aiming-2.png",
        "/agents/Ada/aiming-3.png",
        "/agents/Ada/aiming-4.png",
        "/agents/Ada/shooting-1.png",
        "/agents/Ada/shooting-2.png",
        "/agents/Ada/shooting-3.png",
        "/agents/Ada/shooting-4.png",
        "/agents/Ada/shooting-1.png",
        "/agents/Ada/shooting-2.png",
        "/agents/Ada/shooting-3.png",
        "/agents/Ada/shooting-4.png",
        "/agents/Ada/shooting-1.png",
        "/agents/Ada/shooting-2.png",
        "/agents/Ada/shooting-3.png",
        "/agents/Ada/shooting-4.png"
      ]
    ],
    blinkIntervalMs: { min: 3500, max: 7500 },
    flashOnFrames: {
      color: "rgba(255, 255, 255, 0.35)",
      frames: [
        "/agents/Ada/shooting-1.png",
        "/agents/Ada/shooting-2.png",
        "/agents/Ada/shooting-3.png",
        "/agents/Ada/shooting-4.png"
      ]
    },
    frameRate: 6,
    loop: true,
    status: "Running",
    latestOutputPreview: "Writing draft build briefs and kicking high-confidence jobs into the product generator.",
    latestOutput: "Converted build-ready opportunities into executable draft briefs that the generator can turn into listing outputs and assets.",
    updatedAt: "1 minute ago",
    queueDepth: 5,
    owner: "Special Operations"
  },
  {
    id: "memory-08",
    name: "Umbrella Core",
    role: "Runtime Monitor Agent",
    avatar: "/agents/Umbrealla Core/message-1.png",
    background: "/backgrounds/umbrella-core-room.png",
    avatarFrames: ["/agents/Umbrealla Core/message-1.png"],
    blinkAnimations: [
      [
        "/agents/Umbrealla Core/message-2.png",
        "/agents/Umbrealla Core/message-3.png",
        "/agents/Umbrealla Core/message-4.png",
        "/agents/Umbrealla Core/message-5.png",
        "/agents/Umbrealla Core/message-6.png",
        "/agents/Umbrealla Core/message-7.png",
        "/agents/Umbrealla Core/message-8.png",
        "/agents/Umbrealla Core/message-9.png",
        "/agents/Umbrealla Core/message-10.png"
      ],
      [
        "/agents/Umbrealla Core/kneeling-1.png",
        "/agents/Umbrealla Core/kneeling-2.png",
        "/agents/Umbrealla Core/kneeling-3.png",
        "/agents/Umbrealla Core/kneeling-4.png",
        "/agents/Umbrealla Core/kneeling-5.png",
        "/agents/Umbrealla Core/shooting-1.png",
        "/agents/Umbrealla Core/shooting-2.png",
        "/agents/Umbrealla Core/shooting-3.png",
        "/agents/Umbrealla Core/shooting-4.png",
        "/agents/Umbrealla Core/shooting-5.png",
        "/agents/Umbrealla Core/shooting-6.png",
        "/agents/Umbrealla Core/shooting-7.png",
        "/agents/Umbrealla Core/shooting-8.png",
        "/agents/Umbrealla Core/shooting-9.png",
        "/agents/Umbrealla Core/shooting-10.png",
        "/agents/Umbrealla Core/shooting-6.png",
        "/agents/Umbrealla Core/shooting-7.png",
        "/agents/Umbrealla Core/shooting-8.png",
        "/agents/Umbrealla Core/shooting-9.png",
        "/agents/Umbrealla Core/shooting-10.png",
        "/agents/Umbrealla Core/shooting-6.png",
        "/agents/Umbrealla Core/shooting-7.png",
        "/agents/Umbrealla Core/shooting-8.png",
        "/agents/Umbrealla Core/shooting-9.png",
        "/agents/Umbrealla Core/shooting-10.png",
        "/agents/Umbrealla Core/kneeling-6.png",
        "/agents/Umbrealla Core/kneeling-7.png",
        "/agents/Umbrealla Core/kneeling-8.png",
        "/agents/Umbrealla Core/kneeling-9.png",
        "/agents/Umbrealla Core/kneeling-10.png"
      ]
    ],
    blinkIntervalMs: { min: 4500, max: 9000 },
    flashOnFrames: {
      color: "rgba(255, 255, 255, 0.35)",
      frames: [
        "/agents/Umbrealla Core/shooting-6.png",
        "/agents/Umbrealla Core/shooting-7.png",
        "/agents/Umbrealla Core/shooting-8.png",
        "/agents/Umbrealla Core/shooting-9.png",
        "/agents/Umbrealla Core/shooting-10.png"
      ]
    },
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Tracking the OpenAI runtime, queue progression, and handoffs between agents.",
    latestOutput: "Runtime trace captured successfully. Built drafts are staged for approval and remain disconnected from live publishing.",
    updatedAt: "31 minutes ago",
    queueDepth: 1,
    owner: "Umbrella Systems"
  },
  {
    id: "research-jobs-09",
    name: "Zeno",
    role: "Vocabulary Research Agent",
    avatar: "/agents/Zeno/idle-1.png",
    background: "/backgrounds/Zeno.png",
    avatarFrames: ["/agents/Zeno/idle-1.png"],
    blinkAnimations: [
      [
        "/agents/Zeno/smoke-1.png",
        "/agents/Zeno/smoke-2.png",
        "/agents/Zeno/smoke-3.png",
        "/agents/Zeno/smoke-4.png"
      ],
      [
        "/agents/Zeno/smoke2-1.png",
        "/agents/Zeno/smoke2-2.png",
        "/agents/Zeno/smoke2-3.png",
        "/agents/Zeno/smoke2-4.png"
      ]
    ],
    blinkIntervalMs: { min: 3500, max: 7500 },
    frameRate: 4,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Mining core job vocabulary for buyer-language patterns and identity-driven niches.",
    latestOutput: "Surfaced role-driven niche signals with strong buyer-identity pull.",
    updatedAt: "just now",
    queueDepth: 0,
    owner: "Market Intelligence Group"
  },
  {
    id: "research-longtail-10",
    name: "Commander",
    role: "Long-Tail Reconnaissance Agent",
    avatar: "/agents/Commander/hatchet-1.png",
    background: "/backgrounds/commander.png",
    avatarFrames: ["/agents/Commander/hatchet-1.png"],
    blinkAnimations: [
      [
        "/agents/Commander/hatchet-2.png",
        "/agents/Commander/hatchet-3.png",
        "/agents/Commander/hatchet-4.png",
        "/agents/Commander/hatchet-5.png"
      ],
      [
        "/agents/Commander/attack-1.png",
        "/agents/Commander/attack-2.png",
        "/agents/Commander/attack-3.png",
        "/agents/Commander/attack-4.png",
        "/agents/Commander/attack-5.png",
        "/agents/Commander/attack-6.png",
        "/agents/Commander/attack-7.png",
        "/agents/Commander/attack-8.png",
        "/agents/Commander/attack-9.png",
        "/agents/Commander/attack-10.png"
      ]
    ],
    blinkIntervalMs: { min: 4000, max: 9000 },
    frameRate: 6,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Combing the long-tail role corpus for narrow underserved buyer segments.",
    latestOutput: "Edge-case niche reconnaissance complete; flagged candidates with predictable purchase intent.",
    updatedAt: "just now",
    queueDepth: 0,
    owner: "Long-Tail Reconnaissance"
  },
  {
    id: "research-meta-11",
    name: "Gideon",
    role: "Meta-Research Agent",
    avatar: "/agents/Gideon/adjust-1.png",
    background: "/backgrounds/Gideon.webp",
    avatarFrames: ["/agents/Gideon/adjust-1.png"],
    blinkAnimations: [
      [
        "/agents/Gideon/adjust-2.png",
        "/agents/Gideon/adjust-3.png",
        "/agents/Gideon/adjust-4.png",
        "/agents/Gideon/adjust-5.png"
      ],
      [
        "/agents/Gideon/laugh-2.png",
        "/agents/Gideon/laugh-3.png",
        "/agents/Gideon/laugh-4.png",
        "/agents/Gideon/laugh-5.png"
      ]
    ],
    blinkIntervalMs: { min: 3500, max: 8000 },
    frameRate: 5,
    loop: true,
    status: "Idle",
    latestOutputPreview: "Weighing dataset-quality cues and flagging methodology gaps across the research operatives.",
    latestOutput: "Meta-research pass complete; surfaced quality signals and evidence-thinness warnings.",
    updatedAt: "just now",
    queueDepth: 0,
    owner: "Research Quality Cell"
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
    avatar: "not-a-valid-path" as never,
    background: "/backgrounds/birkin-room.png",
    avatarFrames: ["bad-path-no-slash", 12 as never, null as never],
    blinkFrames: "bad-frame-data" as never,
    latestOutputPreview: undefined,
    latestOutput: "Recovered incomplete payload fields and resumed safe local rendering.",
    updatedAt: "7 minutes ago",
    queueDepth: "2" as never,
    owner: "Research Lab"
  },
  agentDefaults[5],
  agentDefaults[6],
  agentDefaults[7],
  agentDefaults[8],
  agentDefaults[9],
  agentDefaults[10]
];

const validStatuses = new Set<AgentStatus>(["Running", "Retrying", "Idle", "Completed", "Blocked", "Failed", "Error"]);

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

function pickNestedImageArray(value: unknown, fallback: string[][] | undefined) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((seq) => (Array.isArray(seq)
      ? seq.filter((f): f is string => typeof f === "string" && f.startsWith("/"))
      : []))
    .filter((seq): seq is string[] => seq.length > 0);
  return normalized.length > 0 ? normalized : fallback;
}

function pickBlinkInterval(value: unknown, fallback: Agent["blinkIntervalMs"]) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as { min?: unknown; max?: unknown };
    if (typeof v.min === "number" && Number.isFinite(v.min) && typeof v.max === "number" && Number.isFinite(v.max)) {
      return { min: v.min, max: v.max };
    }
  }
  return fallback;
}

function pickFlashOnFrames(value: unknown, fallback: Agent["flashOnFrames"]) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as { color?: unknown; frames?: unknown };
    if (typeof v.color === "string" && Array.isArray(v.frames)) {
      const frames = v.frames.filter((f): f is string => typeof f === "string" && f.startsWith("/"));
      if (frames.length > 0) return { color: v.color, frames };
    }
  }
  return fallback;
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
    blinkAnimations: pickNestedImageArray(payload.blinkAnimations, fallback.blinkAnimations),
    blinkIntervalMs: pickBlinkInterval(payload.blinkIntervalMs, fallback.blinkIntervalMs),
    flashOnFrames: pickFlashOnFrames(payload.flashOnFrames, fallback.flashOnFrames),
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
    status: "Failed",
    latestOutputPreview: OPERATIONAL_ERROR_MESSAGE,
    latestOutput: OPERATIONAL_ERROR_MESSAGE,
    queueDepth: 0
  };
}

export const mockAgents: Agent[] = rawAgentPayloads.map((payload, index) => normalizeAgentPayload(payload, agentDefaults[index]));

