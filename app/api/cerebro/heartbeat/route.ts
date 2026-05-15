import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

// /api/cerebro/heartbeat — the live signal behind the dashboard's
// CEREBRO heartbeat panel.
//
// This is the "real deal not a gimmick" surface — it returns evidence
// the brain is actually being fed and the platform integrations are
// actually reachable. Polled every 5s by the dashboard. The endpoint is
// designed to never throw — every data source is optional, missing data
// degrades gracefully to a "?" or "unknown" rather than a 500.
//
// What it returns:
//   - graph: nodes, edges, last commit, freshness (read from
//     graphify-out/GRAPH_REPORT.md)
//   - activity: last N entries from the operator activity log
//   - services: parallel probes of Shopify/Printful/Anthropic with
//     2-second timeouts so a slow upstream can't slow the dashboard
//
// This endpoint is read-only. No auth — it exposes node counts +
// truncated activity messages, no secrets. If activity messages need
// redaction in the future, do it here at the API edge, not in the
// component.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GraphState = {
  nodes: number | null;
  edges: number | null;
  communities: number | null;
  commit: string | null;
  builtAt: string | null; // mtime of GRAPH_REPORT.md as ISO string. NULL on
  // Vercel — the deploy bundle stamps all files with a default epoch
  // (~2018), so mtime is meaningless. Use `freshness` instead.
  ageMs: number | null;
  // Deploy commit (from VERCEL_GIT_COMMIT_SHA, only set on Vercel).
  // Compare against `commit` to know if the graph is fresh-with-deploy.
  deployCommit: string | null;
  // "fresh" = graph commit matches deploy commit. "stale" = differ.
  // "local-mtime" = no deploy context, trust mtime/age. "unknown" = no
  // graph or no commit info either way.
  freshness: "fresh" | "stale" | "local-mtime" | "unknown";
};

type ActivityEntry = {
  kind: string;
  message: string;
  timestamp: string;
};

type ServiceProbe = {
  name: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
};

type HeartbeatResponse = {
  ts: string;
  graph: GraphState;
  activity: ActivityEntry[];
  services: ServiceProbe[];
};

// Path resolution mirrors the rest of the codebase (lib/tenancy.ts,
// webhook routes, lib/audit.ts): on Vercel the writable surface is /tmp,
// locally everything lives under ./.openclaw. The graph report is a
// build artifact shipped with the deploy — same path either way.
const onVercel = Boolean(process.env.VERCEL);
const GRAPH_REPORT_PATH = path.join(process.cwd(), "graphify-out", "GRAPH_REPORT.md");
const ACTIVITY_LOG_PATH = onVercel
  ? path.join("/tmp", "openclaw", "operator", "activity.jsonl")
  : path.join(process.cwd(), ".openclaw", "operator", "activity.jsonl");

async function readGraphState(): Promise<GraphState> {
  const deployCommit = onVercel ? (process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? null) : null;
  const empty: GraphState = {
    nodes: null,
    edges: null,
    communities: null,
    commit: null,
    builtAt: null,
    ageMs: null,
    deployCommit,
    freshness: "unknown"
  };
  try {
    const stat = await fs.stat(GRAPH_REPORT_PATH);
    const raw = await fs.readFile(GRAPH_REPORT_PATH, "utf8");
    // Match: "- 2037 nodes · 4263 edges · 163 communities (...)"
    const summary = raw.match(/-\s*(\d[\d,]*)\s*nodes\s*[·•]\s*(\d[\d,]*)\s*edges\s*[·•]\s*(\d[\d,]*)\s*communities/i);
    // Match: "- Built from commit: `7571bed7`"
    const commit = raw.match(/Built from commit:\s*`([a-f0-9]+)`/i);
    const graphCommit = commit ? commit[1] : null;

    // Vercel stamps deploy-bundle files with a default epoch (around
    // 2018), so mtime is useless on prod. Suppress builtAt/ageMs on
    // Vercel and rely on the commit-hash match to indicate freshness.
    // Locally mtime is real, so we surface it.
    const builtAt = onVercel ? null : stat.mtime.toISOString();
    const ageMs = onVercel ? null : Date.now() - stat.mtime.getTime();

    let freshness: GraphState["freshness"];
    if (!graphCommit) {
      freshness = "unknown";
    } else if (deployCommit) {
      // Compare prefix-tolerantly — graph stores 8 chars, deploy SHA is full 40
      freshness = deployCommit.startsWith(graphCommit) || graphCommit.startsWith(deployCommit) ? "fresh" : "stale";
    } else {
      freshness = "local-mtime";
    }

    return {
      nodes: summary ? Number(summary[1].replace(/,/g, "")) : null,
      edges: summary ? Number(summary[2].replace(/,/g, "")) : null,
      communities: summary ? Number(summary[3].replace(/,/g, "")) : null,
      commit: graphCommit,
      builtAt,
      ageMs,
      deployCommit,
      freshness
    };
  } catch {
    return empty;
  }
}

async function readActivity(limit = 25): Promise<ActivityEntry[]> {
  try {
    const raw = await fs.readFile(ACTIVITY_LOG_PATH, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const recent = lines.slice(-limit);
    const out: ActivityEntry[] = [];
    for (const line of recent) {
      try {
        const parsed = JSON.parse(line) as { kind?: string; message?: string; timestamp?: string };
        if (!parsed.timestamp) continue;
        const message = (parsed.message ?? "").toString();
        out.push({
          kind: (parsed.kind ?? "event").toString(),
          // Truncate long messages so a 4KB chat dump doesn't dominate the panel
          message: message.length > 240 ? message.slice(0, 237) + "..." : message,
          timestamp: parsed.timestamp
        });
      } catch {
        // Skip malformed line — activity log is best-effort
      }
    }
    return out.reverse(); // newest first
  } catch {
    return [];
  }
}

async function probeWithTimeout(
  name: string,
  url: string,
  init: RequestInit,
  timeoutMs = 2000
): Promise<ServiceProbe> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    // For our purposes, any 2xx/3xx/4xx response (i.e. the host responded
    // at all) means the service is reachable. Auth failures are still
    // "service is up" — only network errors / 5xx / timeouts are "down."
    const ok = r.status > 0 && r.status < 500;
    return {
      name,
      ok,
      latencyMs,
      detail: ok ? `HTTP ${r.status}` : `HTTP ${r.status} (server error)`
    };
  } catch (e) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return {
      name,
      ok: false,
      latencyMs,
      detail: e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable"
    };
  }
}

async function probeServices(): Promise<ServiceProbe[]> {
  // Use the public-most endpoint of each upstream so we're testing
  // reachability, not credentials. We deliberately do NOT send tenant
  // tokens here — the dashboard heartbeat is shared infra; per-tenant
  // credential checks belong on a separate per-tenant probe.
  const probes = await Promise.all([
    // Shopify status page is public
    probeWithTimeout("Shopify", "https://www.shopifystatus.com/", { method: "HEAD" }),
    // Printful API root responds even without auth
    probeWithTimeout("Printful", "https://api.printful.com/", { method: "HEAD" }),
    // Anthropic API root — 401 without key, but that's "reachable"
    probeWithTimeout("Anthropic", "https://api.anthropic.com/", { method: "HEAD" })
  ]);
  return probes;
}

export async function GET() {
  const [graph, activity, services] = await Promise.all([
    readGraphState(),
    readActivity(25),
    probeServices()
  ]);
  const body: HeartbeatResponse = {
    ts: new Date().toISOString(),
    graph,
    activity,
    services
  };
  return NextResponse.json(body, {
    headers: {
      // Don't cache — this needs to be fresh every poll
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
