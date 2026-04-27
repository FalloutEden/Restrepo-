import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentExecutionStatus, AgentRoleId, AgentRunTrace } from "@/lib/agent-runtime";
import type { MaterializedProduct } from "@/lib/product-materialization";
import type { RuntimeStartupReport } from "@/lib/dataset-models";

export type AutonomousRunRequest = {
  goal?: string;
  referenceExamples?: Array<{
    title: string;
    niche: string;
    notes: string;
    whatLooksGood?: string;
    sellabilityNotes?: string;
  }>;
};

export type AutonomousRunLog = {
  id: string;
  stage: "system" | "research" | "routing" | "validation" | "build" | "output";
  level: "info" | "success" | "warning" | "error";
  timestamp: string;
  message: string;
  action?: string;
};

export type AutonomousRunPayload = {
  goal: string;
  maxProductsPerRun: number;
  runtime: {
    researchSummary: string;
    sourceSignalSummary: string[];
    agentRuns: AgentRunTrace[];
    materializedProducts: MaterializedProduct[];
  };
  logs: AutonomousRunLog[];
  startupCheck?: RuntimeStartupReport;
  error?: string;
  action?: string;
};

export type AutonomousRunStatus = "queued" | "running" | "completed" | "failed";

export type AutonomousRunEvent = {
  index: number;
  timestamp: string;
  type: "run" | "agent" | "log";
  status: AutonomousRunStatus | AgentExecutionStatus;
  message: string;
  roleId?: AgentRoleId;
  roleName?: string;
  batchIndex?: number;
  error?: string;
  itemCount?: number;
};

export type AutonomousRunRecord = {
  runId: string;
  status: AutonomousRunStatus;
  createdAt: string;
  updatedAt: string;
  request: AutonomousRunRequest;
  currentMessage: string;
  agentRuns: AgentRunTrace[];
  logs: AutonomousRunLog[];
  events: AutonomousRunEvent[];
  payload?: AutonomousRunPayload;
  error?: string;
};

type AutonomousRunStoreFile = {
  runs: AutonomousRunRecord[];
};

const STORE_DIR = path.join(process.cwd(), ".openclaw");
const STORE_PATH = path.join(STORE_DIR, "runs.json");

let storePromise: Promise<Map<string, AutonomousRunRecord>> | null = null;
let persistChain = Promise.resolve();
let mutationChain = Promise.resolve<AutonomousRunRecord | null>(null);

async function loadStore() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutonomousRunStoreFile>;
    const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
    return new Map(runs.map((run) => [run.runId, run]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Map<string, AutonomousRunRecord>();
    }

    throw error;
  }
}

async function getStore() {
  if (!storePromise) {
    storePromise = loadStore();
  }

  return storePromise;
}

function queuePersist(map: Map<string, AutonomousRunRecord>) {
  persistChain = persistChain.then(async () => {
    await mkdir(STORE_DIR, { recursive: true });
    const runs = Array.from(map.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    await writeFile(STORE_PATH, JSON.stringify({ runs }, null, 2), "utf8");
  });

  return persistChain;
}

async function updateRun(runId: string, updater: (current: AutonomousRunRecord) => AutonomousRunRecord) {
  mutationChain = mutationChain.then(async () => {
    const store = await getStore();
    const existing = store.get(runId);
    if (!existing) {
      throw new Error(`Run ${runId} not found`);
    }

    const next = updater(existing);
    store.set(runId, next);
    await queuePersist(store);
    return next;
  });

  return mutationChain;
}

function appendEvent(record: AutonomousRunRecord, event: Omit<AutonomousRunEvent, "index" | "timestamp">) {
  const timestamp = new Date().toISOString();
  return {
    ...record,
    updatedAt: timestamp,
    currentMessage: event.message,
    events: [
      ...record.events,
      {
        ...event,
        index: record.events.length,
        timestamp
      }
    ]
  };
}

export async function createAutonomousRunRecord(request: AutonomousRunRequest, agentRuns: AgentRunTrace[]) {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const record: AutonomousRunRecord = {
    runId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    request,
    currentMessage: "Run queued and waiting for the product pipeline to start.",
    agentRuns,
    logs: [],
    events: []
  };
  const withRunEvent = appendEvent(record, {
    type: "run",
    status: "queued",
    message: "Run queued and waiting for the product pipeline to start."
  });
  const withAgentEvents = agentRuns.reduce(
    (current, agent) =>
      appendEvent(current, {
        type: "agent",
        status: "queued",
        message: `${agent.name}: queued for execution.`,
        roleId: agent.roleId,
        roleName: agent.name,
        batchIndex: agent.batchIndex
      }),
    withRunEvent
  );

  const store = await getStore();
  store.set(runId, withAgentEvents);
  await queuePersist(store);
  return withAgentEvents;
}

export async function markAutonomousRunStarted(runId: string, message: string) {
  return updateRun(runId, (current) => ({
    ...appendEvent(
      {
        ...current,
        status: "running"
      },
      {
        type: "run",
        status: "running",
        message
      }
    )
  }));
}

export async function appendAutonomousRunLog(runId: string, log: AutonomousRunLog) {
  return updateRun(runId, (current) =>
    appendEvent(
      {
        ...current,
        logs: [...current.logs, log]
      },
      {
        type: "log",
        status: log.level === "error" ? "failed" : current.status,
        message: log.message
      }
    )
  );
}

export async function updateAutonomousRunAgent(runId: string, event: {
  roleId: AgentRoleId;
  roleName: string;
  status: AgentExecutionStatus;
  message: string;
  batchIndex: number;
  attempt?: number;
  retryDelayMs?: number;
  error?: string;
  itemCount?: number;
}) {
  return updateRun(runId, (current) => {
    const existingTrace = current.agentRuns.find((trace) => trace.roleId === event.roleId);
    const nextTrace: AgentRunTrace = {
      roleId: event.roleId,
      name: existingTrace?.name ?? event.roleName,
      responsibility: existingTrace?.responsibility ?? event.roleName,
      summary: event.error ? `${event.message} ${event.error}`.trim() : event.message,
      itemCount: event.itemCount ?? existingTrace?.itemCount ?? 0,
      status: event.status,
      attempts: Math.max(existingTrace?.attempts ?? 0, event.attempt ?? 0),
      retryCount: (existingTrace?.retryCount ?? 0) + (event.retryDelayMs ? 1 : 0),
      batchIndex: event.batchIndex,
      error: event.error
    };

    const agentRuns = current.agentRuns.map((trace) => (trace.roleId === event.roleId ? nextTrace : trace));
    return appendEvent(
      {
        ...current,
        status: current.status === "queued" ? "running" : current.status,
        agentRuns
      },
      {
        type: "agent",
        status: event.status,
        message: `${event.roleName}: ${event.message}`,
        roleId: event.roleId,
        roleName: event.roleName,
        batchIndex: event.batchIndex,
        error: event.error,
        itemCount: event.itemCount
      }
    );
  });
}

export async function completeAutonomousRun(runId: string, payload: AutonomousRunPayload) {
  return updateRun(runId, (current) => ({
    ...appendEvent(
      {
        ...current,
        status: "completed",
        payload,
        agentRuns: payload.runtime.agentRuns,
        logs: payload.logs
      },
      {
        type: "run",
        status: "completed",
        message: "Run completed and the created products are ready."
      }
    )
  }));
}

export async function failAutonomousRun(runId: string, error: string, payload?: AutonomousRunPayload) {
  return updateRun(runId, (current) => ({
    ...appendEvent(
      {
        ...current,
        status: "failed",
        error,
        payload: payload ?? current.payload
      },
      {
        type: "run",
        status: "failed",
        message: "Run failed before completion.",
        error
      }
    )
  }));
}

export async function getAutonomousRunRecord(runId: string) {
  const store = await getStore();
  return store.get(runId) ?? null;
}

export async function getAutonomousRunEvents(runId: string, cursor = 0) {
  const record = await getAutonomousRunRecord(runId);
  if (!record) {
    return null;
  }

  return {
    runId: record.runId,
    status: record.status,
    cursor,
    nextCursor: record.events.length,
    events: record.events.slice(Math.max(0, cursor))
  };
}
