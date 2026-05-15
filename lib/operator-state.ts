import "server-only";

import { mkdir, readFile, writeFile, readdir, appendFile, access } from "node:fs/promises";
import path from "node:path";
import { sql } from "@vercel/postgres";

import { buildTenantPaths, FOUNDER_TENANT_ID, type TenantPaths } from "@/lib/tenant-context";
import { getTenant } from "@/lib/tenancy";

// All persistent operator state lives under tenant-scoped paths. The founder
// tenant (FOUNDER_TENANT_ID) maps to the legacy `.openclaw/operator/` layout
// so existing BV/LL state survives the migration without a one-shot move.
// Real merchants get `.openclaw/tenants/<tenantId>/operator/` subtrees.
//
// On Vercel the project filesystem is read-only outside /tmp, so writes go
// to /tmp/openclaw/{operator,tenants/<id>/operator}. /tmp is scoped to each
// serverless function instance and persists ~15 min (Hobby). For durable
// history a real KV/Postgres backend is needed; for the SaaS-resale demo
// this is good enough.
//
// Curated knowledge files (read-only) stay global — they ship with the repo
// bundle and are the same content for every tenant.

const IS_VERCEL = process.env.VERCEL === "1";

// Knowledge files live at the repo path even on Vercel because they're
// committed and read-only.
//
// Layout after the gap-6 tenant-portable split:
//   knowledge/                      — legacy flat *.md files (founder-only)
//   knowledge/meta-rules/*.md       — universal, loaded for every tenant
//   knowledge/brands/<slug>/*.md    — brand-scoped, loaded only when active
//                                      brand matches the slug
//
// Founder context loads ALL THREE: flat + meta-rules + brands/black-vault
// (founder's primary brand). Tenants load only meta-rules + their own brand
// slice so they never see another tenant's lore or BV-specific scars.
const KNOWLEDGE_DIR = path.join(process.cwd(), ".openclaw", "operator", "knowledge");
const KNOWLEDGE_META_DIR = path.join(KNOWLEDGE_DIR, "meta-rules");
const KNOWLEDGE_BRANDS_DIR = path.join(KNOWLEDGE_DIR, "brands");

/** Brand slug the founder's primary identity maps to. Used when loading
 *  brand-scoped knowledge in founder context. */
const FOUNDER_PRIMARY_BRAND = "black-vault";

// Per-tenant path resolver. Cheap to call — no IO until ensureDirs() fires.
function pathsFor(tenantId: string): TenantPaths {
  return buildTenantPaths(tenantId);
}

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

async function ensureDirs(paths: TenantPaths) {
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.conversationsDir, { recursive: true });
  await mkdir(paths.proposalsDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readOperatorState(tenantId: string = FOUNDER_TENANT_ID): Promise<OperatorState> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  if (!(await fileExists(paths.stateFile))) return { ...DEFAULT_STATE };
  const raw = await readFile(paths.stateFile, "utf8");
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OperatorState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writeOperatorState(
  state: OperatorState,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<void> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  await writeFile(paths.stateFile, JSON.stringify(state, null, 2), "utf8");
}

export async function patchOperatorState(
  patch: Partial<OperatorState>,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<OperatorState> {
  const current = await readOperatorState(tenantId);
  const next = { ...current, ...patch };
  await writeOperatorState(next, tenantId);
  return next;
}

// On Vercel the read-only repo bundle ships with the original memory.md.
// We treat that as the seed for the founder tenant: reads check /tmp first
// (post-write), fall back to the bundle path so the agent still sees its
// accumulated notes from development. Tenant memory has no bundled seed.
const BUNDLED_MEMORY_FILE = path.join(process.cwd(), ".openclaw", "operator", "memory.md");

export async function readOperatorMemory(tenantId: string = FOUNDER_TENANT_ID): Promise<string> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  if (await fileExists(paths.memoryFile)) return readFile(paths.memoryFile, "utf8");
  if (tenantId === FOUNDER_TENANT_ID && IS_VERCEL && (await fileExists(BUNDLED_MEMORY_FILE))) {
    return readFile(BUNDLED_MEMORY_FILE, "utf8");
  }
  return "";
}

// Resolve the brand slug to use when loading brand-scoped knowledge for
// the given tenant. Founder context → FOUNDER_PRIMARY_BRAND. Real tenants
// → tenant.brandSlug (e.g. "pawvault", "stoneandsteel"). The brand-knowledge
// directory is opt-in — if no files exist for a tenant's slug, the operator
// just doesn't load brand-specific content, which is fine for tenants who
// haven't seeded any yet.
async function resolveBrandSlugForKnowledge(tenantId: string): Promise<string | null> {
  if (tenantId === FOUNDER_TENANT_ID) return FOUNDER_PRIMARY_BRAND;
  try {
    const tenant = await getTenant(tenantId);
    if (!tenant) return null;
    // Match against the directory naming convention. brandSlug already lowercase-hyphen.
    return tenant.brandSlug;
  } catch {
    return null;
  }
}

async function readDirMd(dir: string): Promise<Array<{ name: string; body: string }>> {
  try {
    const files = await readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
    const out: Array<{ name: string; body: string }> = [];
    for (const f of mdFiles) {
      const body = await readFile(path.join(dir, f), "utf8");
      out.push({ name: f, body });
    }
    return out;
  } catch {
    return [];
  }
}

// Curated knowledge — markdown files under .openclaw/operator/knowledge/.
// Concatenated and pinned into the operator system prompt every turn so the
// agent has stable, version-controlled context (brand fit rules, supplier
// research, anti-patterns) instead of having to relearn it from chat history.
//
// Tenant slicing (gap 6):
//   - Tenants always get meta-rules/ (universal: supplier vetting, footwork
//     checklist, sourcing framework, CEREBRO usage). NEVER see another
//     tenant's brand lore.
//   - Founder context additionally loads the legacy flat *.md files +
//     brands/black-vault/ (BV's specific scars: AOP hoodie, Meta denial,
//     monogram file id, etc.).
//   - Each tenant gets brands/<their-slug>/*.md if any exists.
export async function readOperatorKnowledge(tenantId: string = FOUNDER_TENANT_ID): Promise<string> {
  try {
    await mkdir(KNOWLEDGE_DIR, { recursive: true });
    const sections: string[] = [];

    // Meta rules — universal, always loaded
    const meta = await readDirMd(KNOWLEDGE_META_DIR);
    for (const m of meta) sections.push(`\n\n<!-- knowledge/meta-rules/${m.name} -->\n${m.body}`);

    // Brand-scoped — load only the active brand's slice
    const brandSlug = await resolveBrandSlugForKnowledge(tenantId);
    if (brandSlug) {
      const brandDir = path.join(KNOWLEDGE_BRANDS_DIR, brandSlug);
      const brandFiles = await readDirMd(brandDir);
      for (const b of brandFiles) {
        sections.push(`\n\n<!-- knowledge/brands/${brandSlug}/${b.name} -->\n${b.body}`);
      }
    }

    // Legacy flat *.md — founder-only, for backward compat with files not
    // yet sorted into meta-rules/ or brands/. Tenants never see flat files
    // because they may contain BV-specific lore that hasn't been moved yet.
    if (tenantId === FOUNDER_TENANT_ID) {
      const flat = await readDirMd(KNOWLEDGE_DIR);
      for (const f of flat) sections.push(`\n\n<!-- knowledge/${f.name} -->\n${f.body}`);
    }

    return sections.join("");
  } catch {
    return "";
  }
}

export async function appendOperatorMemory(
  line: string,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<void> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const stamped = `- [${new Date().toISOString()}] ${line.trim()}\n`;
  if (!(await fileExists(paths.memoryFile))) {
    await writeFile(paths.memoryFile, `# Operator memory\n\n${stamped}`, "utf8");
  } else {
    await appendFile(paths.memoryFile, stamped, "utf8");
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

export async function appendConversationMessage(
  conversationId: string,
  message: ChatMessage,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<void> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  await appendFile(paths.conversation(conversationId), `${JSON.stringify(message)}\n`, "utf8");
}

export async function readConversation(
  conversationId: string,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<ChatMessage[]> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const p = paths.conversation(conversationId);
  if (!(await fileExists(p))) return [];
  const raw = await readFile(p, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ChatMessage);
}

export async function listConversations(
  tenantId: string = FOUNDER_TENANT_ID
): Promise<Array<{ id: string; messageCount: number; lastUpdated: string }>> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const files = await readdir(paths.conversationsDir).catch(() => [] as string[]);
  const out: Array<{ id: string; messageCount: number; lastUpdated: string }> = [];
  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue;
    const id = file.replace(/\.jsonl$/, "");
    const messages = await readConversation(id, tenantId);
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
  // Path (under <tenant>/proposals/<id>/) to the markdown brief and CSV ROI sheet.
  briefPath?: string;
  roiCsvPath?: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt?: string;
  decisionNotes?: string;
  // What conversation/tick produced this — useful for tracing.
  source: { kind: "chat" | "tick"; conversationId?: string };
};

export async function writeProposal(
  proposal: Omit<Proposal, "createdAt" | "status">,
  artifacts: { briefMarkdown?: string; roiCsv?: string } = {},
  tenantId: string = FOUNDER_TENANT_ID
): Promise<Proposal> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const dir = paths.proposal(proposal.id);
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

export async function readProposal(
  id: string,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<Proposal | null> {
  const paths = pathsFor(tenantId);
  const file = path.join(paths.proposal(id), "proposal.json");
  if (!(await fileExists(file))) return null;
  return JSON.parse(await readFile(file, "utf8")) as Proposal;
}

export async function listProposals(
  filter?: { status?: ProposalStatus },
  tenantId: string = FOUNDER_TENANT_ID
): Promise<Proposal[]> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const dirs = await readdir(paths.proposalsDir).catch(() => [] as string[]);
  const out: Proposal[] = [];
  for (const d of dirs) {
    const p = await readProposal(d, tenantId);
    if (!p) continue;
    if (filter?.status && p.status !== filter.status) continue;
    out.push(p);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function decideProposal(
  id: string,
  decision: "approved" | "rejected",
  notes?: string,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<Proposal | null> {
  const paths = pathsFor(tenantId);
  const current = await readProposal(id, tenantId);
  if (!current) return null;
  const updated: Proposal = {
    ...current,
    status: decision,
    decidedAt: new Date().toISOString(),
    decisionNotes: notes
  };
  await writeFile(
    path.join(paths.proposal(id), "proposal.json"),
    JSON.stringify(updated, null, 2),
    "utf8"
  );
  // Push to operator state so the next chat turn knows.
  if (decision === "rejected") {
    const state = await readOperatorState(tenantId);
    state.rejectedProposals.push({
      id,
      reason: notes ?? "rejected without notes",
      rejectedAt: updated.decidedAt!
    });
    // Keep the list bounded — last 50 rejections is plenty of context.
    if (state.rejectedProposals.length > 50) {
      state.rejectedProposals = state.rejectedProposals.slice(-50);
    }
    await writeOperatorState(state, tenantId);
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

export async function writeHumanTask(
  task: Omit<HumanTask, "createdAt" | "status">,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<HumanTask> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const full: HumanTask = { ...task, status: "open", createdAt: new Date().toISOString() };
  await writeFile(paths.task(task.id), JSON.stringify(full, null, 2), "utf8");
  return full;
}

export async function listHumanTasks(
  filter?: { status?: TaskStatus },
  tenantId: string = FOUNDER_TENANT_ID
): Promise<HumanTask[]> {
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  const files = await readdir(paths.tasksDir).catch(() => [] as string[]);
  const out: HumanTask[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await readFile(path.join(paths.tasksDir, f), "utf8");
    const task = JSON.parse(raw) as HumanTask;
    if (filter?.status && task.status !== filter.status) continue;
    out.push(task);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function resolveHumanTask(
  id: string,
  status: "done" | "dismissed",
  tenantId: string = FOUNDER_TENANT_ID
): Promise<HumanTask | null> {
  const paths = pathsFor(tenantId);
  const file = paths.task(id);
  if (!(await fileExists(file))) return null;
  const task = JSON.parse(await readFile(file, "utf8")) as HumanTask;
  const updated: HumanTask = { ...task, status, resolvedAt: new Date().toISOString() };
  await writeFile(file, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

// ── Activity log ──────────────────────────────────────────────────────────
// One stream of every meaningful operator event so the dashboard can render a
// unified timeline (chat turns, autonomous decisions, tool calls, proposal
// outcomes).
//
// Storage:
//   - PRODUCTION (Vercel + POSTGRES_URL set): rows in `activity_log` table.
//     This is the only durable surface — /tmp on Vercel is instance-scoped
//     and ephemeral, so file-based activity was invisible to the dashboard
//     whenever cron writes and dashboard polls landed on different
//     serverless instances (which is most of the time).
//   - LOCAL DEV + TESTS (no POSTGRES_URL): JSONL append to the tenant's
//     activity file. Same public API, same data shape.

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

function usingPostgresForActivity(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);
}

let activityMigrated = false;

async function pgMigrateActivity(): Promise<void> {
  if (activityMigrated) return;
  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      data JSONB
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_tenant_ts ON activity_log(tenant_id, timestamp DESC)`;
  activityMigrated = true;
}

async function pgLogActivity(tenantId: string, entry: ActivityEntry): Promise<void> {
  await pgMigrateActivity();
  const payload = entry.data ? JSON.stringify(entry.data) : null;
  if (payload === null) {
    await sql`
      INSERT INTO activity_log (tenant_id, timestamp, kind, message)
      VALUES (${tenantId}, ${entry.timestamp}, ${entry.kind}, ${entry.message})
    `;
  } else {
    await sql`
      INSERT INTO activity_log (tenant_id, timestamp, kind, message, data)
      VALUES (${tenantId}, ${entry.timestamp}, ${entry.kind}, ${entry.message}, ${payload}::jsonb)
    `;
  }
}

async function pgReadActivity(tenantId: string, limit: number): Promise<ActivityEntry[]> {
  await pgMigrateActivity();
  const r = await sql<{
    timestamp: string;
    kind: string;
    message: string;
    data: Record<string, unknown> | null;
  }>`
    SELECT
      to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,
      kind,
      message,
      data
    FROM activity_log
    WHERE tenant_id = ${tenantId}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return r.rows.map((row) => ({
    timestamp: row.timestamp,
    kind: row.kind as ActivityKind,
    message: row.message,
    ...(row.data ? { data: row.data } : {})
  }));
}

export async function logActivity(
  entry: Omit<ActivityEntry, "timestamp">,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<void> {
  const full: ActivityEntry = { ...entry, timestamp: new Date().toISOString() };
  if (usingPostgresForActivity()) {
    try {
      await pgLogActivity(tenantId, full);
      return;
    } catch (err) {
      // If Postgres is misconfigured we still want the operator turn to
      // succeed — activity is observability, not correctness. Fall through
      // to file write so something is captured.
      console.warn("[operator-state] pg activity write failed, falling back to file:", err);
    }
  }
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  await appendFile(paths.activityLog, `${JSON.stringify(full)}\n`, "utf8");
}

export async function readActivity(
  limit = 100,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<ActivityEntry[]> {
  if (usingPostgresForActivity()) {
    try {
      return await pgReadActivity(tenantId, limit);
    } catch (err) {
      console.warn("[operator-state] pg activity read failed, falling back to file:", err);
      // Fall through to file read so a degraded heartbeat still shows
      // something rather than going dark.
    }
  }
  const paths = pathsFor(tenantId);
  await ensureDirs(paths);
  if (!(await fileExists(paths.activityLog))) return [];
  const raw = await readFile(paths.activityLog, "utf8");
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
