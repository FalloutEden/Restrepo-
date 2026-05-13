// CEREBRO STDP foundation — analyze the usage log and surface "hot nodes":
// the concepts the agent (and you) actually reach for. This is the first
// piece of the firing-neurons / edge-weighting layer.
//
// Schema of .openclaw/cerebro-usage.jsonl entries:
//   { ts, mode, input, budget?, returnedNodes[], nodeCount, source,
//     conversationId, exitStatus }
//
// Output:
//   - Console summary: top 20 nodes, top 10 queries, daily volume
//   - JSON dump at graphify-out/hot-nodes.json so the operator (or any
//     future STDP layer) can read it
//
// Run:
//   node --import tsx scripts/cerebro-hot-nodes.ts
//   node --import tsx scripts/cerebro-hot-nodes.ts --days 7

import fs from "node:fs";
import path from "node:path";

type UsageEntry = {
  ts: string;
  mode: "query" | "explain" | "path";
  input: string;
  budget?: number;
  returnedNodes: string[];
  nodeCount: number;
  source?: string;
  conversationId?: string;
  exitStatus?: number;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    days: get("--days") ? Number(get("--days")) : null,
    top: get("--top") ? Number(get("--top")) : 20,
    json: argv.includes("--json")
  };
}

function loadEntries(daysWindow: number | null): UsageEntry[] {
  const logPath = path.join(".openclaw", "cerebro-usage.jsonl");
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const cutoff = daysWindow
    ? Date.now() - daysWindow * 24 * 60 * 60 * 1000
    : 0;
  const entries: UsageEntry[] = [];
  for (const l of lines) {
    try {
      const e = JSON.parse(l) as UsageEntry;
      if (cutoff > 0 && new Date(e.ts).getTime() < cutoff) continue;
      entries.push(e);
    } catch {
      // skip malformed
    }
  }
  return entries;
}

function analyze(entries: UsageEntry[]) {
  const nodeHits = new Map<string, { count: number; lastSeen: string; modes: Set<string> }>();
  const queryHits = new Map<string, { count: number; lastSeen: string }>();
  const byDay = new Map<string, number>();
  const byMode = new Map<string, number>();

  for (const e of entries) {
    // node hits — each node returned by a query counts as a hit
    for (const node of e.returnedNodes || []) {
      const cur = nodeHits.get(node) ?? { count: 0, lastSeen: e.ts, modes: new Set<string>() };
      cur.count += 1;
      cur.lastSeen = e.ts;
      cur.modes.add(e.mode);
      nodeHits.set(node, cur);
    }
    // query hits
    const q = `[${e.mode}] ${e.input}`;
    const qc = queryHits.get(q) ?? { count: 0, lastSeen: e.ts };
    qc.count += 1;
    qc.lastSeen = e.ts;
    queryHits.set(q, qc);

    // daily
    const day = e.ts.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    byMode.set(e.mode, (byMode.get(e.mode) ?? 0) + 1);
  }

  return { nodeHits, queryHits, byDay, byMode };
}

function fmtSummary(entries: UsageEntry[], opts: { top: number }) {
  const { nodeHits, queryHits, byDay, byMode } = analyze(entries);

  const topNodes = [...nodeHits.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, opts.top)
    .map(([node, info]) => ({ node, count: info.count, modes: [...info.modes], lastSeen: info.lastSeen }));

  const topQueries = [...queryHits.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([query, info]) => ({ query, count: info.count, lastSeen: info.lastSeen }));

  return {
    summary: {
      totalQueries: entries.length,
      uniqueNodesTouched: nodeHits.size,
      uniqueQueriesAsked: queryHits.size,
      byMode: Object.fromEntries(byMode),
      byDay: Object.fromEntries(byDay)
    },
    topNodes,
    topQueries
  };
}

function main() {
  const opts = parseArgs();
  const entries = loadEntries(opts.days);

  if (entries.length === 0) {
    console.log("No CEREBRO usage yet. Tool log at .openclaw/cerebro-usage.jsonl is empty.");
    console.log("Once the operator agent runs `cerebro_query`, this will populate.");
    if (opts.json) {
      const empty = { summary: { totalQueries: 0, uniqueNodesTouched: 0, uniqueQueriesAsked: 0, byMode: {}, byDay: {} }, topNodes: [], topQueries: [] };
      fs.mkdirSync("graphify-out", { recursive: true });
      fs.writeFileSync("graphify-out/hot-nodes.json", JSON.stringify(empty, null, 2));
    }
    return;
  }

  const result = fmtSummary(entries, { top: opts.top });

  // Console output
  console.log(`=== CEREBRO Hot Nodes ${opts.days ? `(last ${opts.days} days)` : "(all-time)"} ===`);
  console.log(`Queries:           ${result.summary.totalQueries}`);
  console.log(`Unique nodes hit:  ${result.summary.uniqueNodesTouched}`);
  console.log(`Unique questions:  ${result.summary.uniqueQueriesAsked}`);
  console.log(`By mode:           ${JSON.stringify(result.summary.byMode)}`);
  console.log("");
  console.log(`Top ${opts.top} hot nodes:`);
  for (const n of result.topNodes) {
    console.log(`  ${String(n.count).padStart(3)}  ${n.node}  [${n.modes.join(",")}]`);
  }
  console.log("");
  console.log("Top 10 queries:");
  for (const q of result.topQueries) {
    console.log(`  ${String(q.count).padStart(3)}  ${q.query.slice(0, 100)}`);
  }
  console.log("");
  console.log("Daily volume:");
  for (const [day, count] of Object.entries(result.summary.byDay).sort()) {
    console.log(`  ${day}: ${count}`);
  }

  // Persist JSON for downstream consumption (operator, STDP layer)
  fs.mkdirSync("graphify-out", { recursive: true });
  fs.writeFileSync("graphify-out/hot-nodes.json", JSON.stringify(result, null, 2));
  console.log(`\n[wrote] graphify-out/hot-nodes.json`);
}

main();
