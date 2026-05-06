import "server-only";

import { mkdir, readFile, writeFile, readdir, appendFile, access } from "node:fs/promises";
import path from "node:path";

// On Vercel the project filesystem is read-only outside /tmp. We write all
// operator state under /tmp/openclaw/operator when running there. /tmp is
// scoped to each serverless function instance and persists for the lifetime
// of that hot instance (~15 min on Hobby), which is enough for in-flight
// chat turns. For durable history a real KV/Postgres backend would be
// needed, but for a SaaS-resale demo this is good enough.
//
// Curated knowledge files (read-only) are different — they ship with the
// repo, so they live at the repo path even on Vercel and we read them via
// the original cwd path.
const IS_VERCEL = process.env.VERCEL === "1";
const ROOT = IS_VERCEL
  ? path.join("/tmp", "openclaw", "operator")
  : path.join(process.cwd(), ".openclaw", "operator");
const CONV_DIR = path.join(ROOT, "conversations");
const PROPOSAL_DIR = path.join(ROOT, "proposals");
const TASK_DIR = path.join(ROOT, "tasks");
// Knowledge files are read-only — they're committed to the repo and ship
// with the deployment bundle.
const KNOWLEDGE_DIR = path.join(process.cwd(), ".openclaw", "operator", "knowledge");
const ACTIVITY_LOG = path.join(ROOT, "activity.jsonl");
const STATE_FILE = path.join(ROOT, "state.json");
const MEMORY_FILE = path.join(ROOT, "memory.md");

// ── Persistent operator state ─────────────────────────────────────────────
// Single source of truth the operator reads at the top of every turn. Stores
// long-lived facts (which brands are active, when the last autonomous tick
// ran, recent decisions the user accepted/rejected so the operator doesn't
// re-propose them).

export type OperatorState = {
  lastTickAt: string | null;
  lastChatAt: string | null;
  rejectedProposals: Array<{ id: string; reason: string; rejectedAt: string }>;
  notes: string[]; // operator-written notes ("CJ category 192C9D30 has the best smart-lock margin")
};

const DEFAULT_STATE: OperatorState = {
  lastTickAt: null,
  lastChatAt: null,
  rejectedProposals: [],
  notes: []
};

async function ensureDirs() {
  await mkdir(ROOT, { recursive: true });
  await mkdir(CONV_DIR, { recursive: true });
  await mkdir(PROPOSAL_DIR, { recursive: true });
  await mkdir(TASK_DIR, { recursive: true });
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readOperatorState(): Promise<OperatorState> {
  await ensureDirs();
  if (!(await fileExists(STATE_FILE))) return { ...DEFAULT_STATE };
  const raw = await readFile(STATE_FILE, "utf8");
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OperatorState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writeOperatorState(state: OperatorState): Promise<void> {
  await ensureDirs();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function patchOperatorState(patch: Partial<OperatorState>): Promise<OperatorState> {
  const current = await readOperatorState();
  const next = { ...current, ...patch };
  await writeOperatorState(next);
  return next;
}

// On Vercel the read-only repo bundle ships with the original memory.md.
// We treat that as the seed: reads check /tmp first (post-write), fall back
// to the bundle path so the agent still sees its accumulated notes from
// development.
const BUNDLED_MEMORY_FILE = path.join(process.cwd(), ".openclaw", "operator", "memory.md");

export async function readOperatorMemory(): Promise<string> {
  await ensureDirs();
  if (await fileExists(MEMORY_FILE)) return readFile(MEMORY_FILE, "utf8");
  if (IS_VERCEL && (await fileExists(BUNDLED_MEMORY_FILE))) {
    return readFile(BUNDLED_MEMORY_FILE, "utf8");
  }
  return "";
}

// Curated knowledge — markdown files under .openclaw/operator/knowledge/.
// Concatenated and pinned into the operator system prompt every turn so the
// agent has stable, version-controlled context (brand fit rules, supplier
// research, anti-patterns) instead of having to relearn it from chat history.
export async function readOperatorKnowledge(): Promise<string> {
  await ensureDirs();
  try {
    await mkdir(KNOWLEDGE_DIR, { recursive: true });
    const files = await readdir(KNOWLEDGE_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
    if (mdFiles.length === 0) return "";
    const sections = await Promise.all(
      mdFiles.map(async (f) => {
        const body = await readFile(path.join(KNOWLEDGE_DIR, f), "utf8");
        return `\n\n<!-- knowledge/${f} -->\n${body}`;
      })
    );
    return sections.join("");
  } catch {
    return "";
  }
}

export async function appendOperatorMemory(line: string): Promise<void> {
  await ensureDirs();
  const stamped = `- [${new Date().toISOString()}] ${line.trim()}\n`;
  if (!(await fileExists(MEMORY_FILE))) {
    await writeFile(MEMORY_FILE, `# Operator memory\n\n${stamped}`, "utf8");
  } else {
    await appendFile(MEMORY_FILE, stamped, "utf8");
  }
}

// ── Conversations ─────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  // For tool-use turns we also persist the structured tool calls/results so
  // the agent can replay context faithfully on the next turn.
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result: unknown }>;
};

function conversationPath(conversationId: string) {
  return path.join(CONV_DIR, `${conversationId}.jsonl`);
}

export async function appendConversationMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  await ensureDirs();
  await appendFile(conversationPath(conversationId), `${JSON.stringify(message)}\n`, "utf8");
}

export async function readConversation(conversationId: string): Promise<ChatMessage[]> {
  await ensureDirs();
  const p = conversationPath(conversationId);
  if (!(await fileExists(p))) return [];
  const raw = await readFile(p, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ChatMessage);
}

export async function listConversations(): Promise<Array<{ id: string; messageCount: number; lastUpdated: string }>> {
  await ensureDirs();
  const files = await readdir(CONV_DIR).catch(() => [] as string[]);
  const out: Array<{ id: string; messageCount: number; lastUpdated: string }> = [];
  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue;
    const id = file.replace(/\.jsonl$/, "");
    const messages = await readConversation(id);
    if (messages.length === 0) continue;
    out.push({
      id,
      messageCount: messages.length,
      lastUpdated: messages[messages.length - 1].timestamp
    });
  }
  return out.sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));
}

// ── Proposals (operator's spend-bound asks awaiting human approval) ───────

export type ProposalStatus = "pending" | "approved" | "rejected";

export type Proposal = {
  id: string;
  title: string;
  // Short one-paragraph rationale so the user can decide without opening the brief.
  summary: string;
  // What action the operator wants to take and how much it would cost.
  action: string;
  estimatedCostUsd: number;
  estimatedMonthlyRevenueUsd?: { low: number; mid: number; high: number };
  // Path (under .openclaw/operator/proposals/<id>/) to the markdown brief and CSV ROI sheet.
  briefPath?: string;
  roiCsvPath?: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt?: string;
  decisionNotes?: string;
  // What conversation/tick produced this — useful for tracing.
  source: { kind: "chat" | "tick"; conversationId?: string };
};

function proposalDir(id: string) {
  return path.join(PROPOSAL_DIR, id);
}

export async function writeProposal(
  proposal: Omit<Proposal, "createdAt" | "status">,
  artifacts: { briefMarkdown?: string; roiCsv?: string } = {}
): Promise<Proposal> {
  await ensureDirs();
  const dir = proposalDir(proposal.id);
  await mkdir(dir, { recursive: true });

  let briefPath: string | undefined;
  let roiCsvPath: string | undefined;
  if (artifacts.briefMarkdown) {
    briefPath = path.join(dir, "brief.md");
    await writeFile(briefPath, artifacts.briefMarkdown, "utf8");
  }
  if (artifacts.roiCsv) {
    roiCsvPath = path.join(dir, "roi.csv");
    await writeFile(roiCsvPath, artifacts.roiCsv, "utf8");
  }

  const full: Proposal = {
    ...proposal,
    briefPath,
    roiCsvPath,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  await writeFile(path.join(dir, "proposal.json"), JSON.stringify(full, null, 2), "utf8");
  return full;
}

export async function readProposal(id: string): Promise<Proposal | null> {
  const file = path.join(proposalDir(id), "proposal.json");
  if (!(await fileExists(file))) return null;
  return JSON.parse(await readFile(file, "utf8")) as Proposal;
}

export async function listProposals(filter?: { status?: ProposalStatus }): Promise<Proposal[]> {
  await ensureDirs();
  const dirs = await readdir(PROPOSAL_DIR).catch(() => [] as string[]);
  const out: Proposal[] = [];
  for (const d of dirs) {
    const p = await readProposal(d);
    if (!p) continue;
    if (filter?.status && p.status !== filter.status) continue;
    out.push(p);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function decideProposal(
  id: string,
  decision: "approved" | "rejected",
  notes?: string
): Promise<Proposal | null> {
  const current = await readProposal(id);
  if (!current) return null;
  const updated: Proposal = {
    ...current,
    status: decision,
    decidedAt: new Date().toISOString(),
    decisionNotes: notes
  };
  await writeFile(path.join(proposalDir(id), "proposal.json"), JSON.stringify(updated, null, 2), "utf8");
  // Push to operator state so the next chat turn knows.
  if (decision === "rejected") {
    const state = await readOperatorState();
    state.rejectedProposals.push({
      id,
      reason: notes ?? "rejected without notes",
      rejectedAt: updated.decidedAt!
    });
    // Keep the list bounded — last 50 rejections is plenty of context.
    if (state.rejectedProposals.length > 50) {
      state.rejectedProposals = state.rejectedProposals.slice(-50);
    }
    await writeOperatorState(state);
  }
  return updated;
}

// ── Human tasks (things only the user can do — verify EIN, take a photo) ──

export type TaskStatus = "open" | "done" | "dismissed";

export type HumanTask = {
  id: string;
  title: string;
  detail: string;
  why: string;
  status: TaskStatus;
  createdAt: string;
  resolvedAt?: string;
  source: { kind: "chat" | "tick"; conversationId?: string };
};

export async function writeHumanTask(task: Omit<HumanTask, "createdAt" | "status">): Promise<HumanTask> {
  await ensureDirs();
  const full: HumanTask = { ...task, status: "open", createdAt: new Date().toISOString() };
  await writeFile(path.join(TASK_DIR, `${task.id}.json`), JSON.stringify(full, null, 2), "utf8");
  return full;
}

export async function listHumanTasks(filter?: { status?: TaskStatus }): Promise<HumanTask[]> {
  await ensureDirs();
  const files = await readdir(TASK_DIR).catch(() => [] as string[]);
  const out: HumanTask[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await readFile(path.join(TASK_DIR, f), "utf8");
    const task = JSON.parse(raw) as HumanTask;
    if (filter?.status && task.status !== filter.status) continue;
    out.push(task);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function resolveHumanTask(id: string, status: "done" | "dismissed"): Promise<HumanTask | null> {
  const file = path.join(TASK_DIR, `${id}.json`);
  if (!(await fileExists(file))) return null;
  const task = JSON.parse(await readFile(file, "utf8")) as HumanTask;
  const updated: HumanTask = { ...task, status, resolvedAt: new Date().toISOString() };
  await writeFile(file, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

// ── Activity log ──────────────────────────────────────────────────────────
// One JSONL stream of every meaningful operator event so the dashboard can
// render a unified timeline (chat turns, autonomous decisions, tool calls,
// proposal outcomes).

export type ActivityKind =
  | "chat_user"
  | "chat_assistant"
  | "tool_call"
  | "proposal_created"
  | "proposal_decided"
  | "task_created"
  | "task_resolved"
  | "tick_started"
  | "tick_completed"
  | "tick_failed"
  | "note";

export type ActivityEntry = {
  timestamp: string;
  kind: ActivityKind;
  message: string;
  // Optional structured payload, e.g. tool name + brief result summary.
  data?: Record<string, unknown>;
};

export async function logActivity(entry: Omit<ActivityEntry, "timestamp">): Promise<void> {
  await ensureDirs();
  const full: ActivityEntry = { ...entry, timestamp: new Date().toISOString() };
  await appendFile(ACTIVITY_LOG, `${JSON.stringify(full)}\n`, "utf8");
}

export async function readActivity(limit = 100): Promise<ActivityEntry[]> {
  await ensureDirs();
  if (!(await fileExists(ACTIVITY_LOG))) return [];
  const raw = await readFile(ACTIVITY_LOG, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const tail = lines.slice(-limit);
  return tail.map((l) => JSON.parse(l) as ActivityEntry).reverse();
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}
