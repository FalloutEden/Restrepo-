// Convert operator conversation .jsonl files into clean markdown summaries
// for CEREBRO ingestion. Each conversation becomes one markdown file in
// ./raw/conversations/ — graphify will then semantic-extract concepts, agent
// decisions, and rationale from them.
//
// Schema observed:
//   {role: "user"|"assistant", content: string, timestamp: string}
//
// Output: ./raw/conversations/<conv-id>.md with a header, message blocks,
// and inferred topic/decision tags from content.

import fs from "node:fs";
import path from "node:path";

const SRC = ".openclaw/operator/conversations";
const DST = "raw/conversations";

type Msg = { role: string; content: string; timestamp?: string };

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function tagsFromContent(content: string): string[] {
  const tags = new Set<string>();
  const text = content.toLowerCase();
  const checks: Array<[RegExp, string]> = [
    [/\b(shopify|store|product|merchant)\b/, "shopify"],
    [/\b(printful|mockup|aop|embroider|chest)\b/, "printful"],
    [/\b(klaviyo|email|flow|campaign)\b/, "marketing"],
    [/\b(meta|facebook|google|tiktok|pinterest)\b/, "channels"],
    [/\b(launch|publish|live|production)\b/, "launch"],
    [/\b(operator|agent|tool|skill)\b/, "agent"],
    [/\b(brand|voice|aesthetic|liquid|monogram)\b/, "brand"],
    [/\b(price|pricing|margin|cost|revenue)\b/, "economics"],
    [/\b(error|fail|broken|fix|bug)\b/, "debugging"],
    [/\b(elsa|memorial|service dog)\b/, "elsa"],
    [/\bbrand-fit|guardrail/, "guardrails"]
  ];
  for (const [re, tag] of checks) if (re.test(text)) tags.add(tag);
  return [...tags];
}

function convertFile(srcPath: string): string {
  const lines = fs.readFileSync(srcPath, "utf8").trim().split("\n").filter(Boolean);
  const messages: Msg[] = lines.map((l) => {
    try { return JSON.parse(l) as Msg; } catch { return { role: "unknown", content: l }; }
  });

  const fileName = path.basename(srcPath, ".jsonl");
  const firstTs = messages[0]?.timestamp ?? "";
  const lastTs = messages[messages.length - 1]?.timestamp ?? "";

  // Pull tags from all message content combined
  const allTagsSet = new Set<string>();
  for (const m of messages) for (const t of tagsFromContent(m.content)) allTagsSet.add(t);
  const allTags = [...allTagsSet];

  // First user message often signals the topic
  const firstUserMsg = messages.find((m) => m.role === "user");
  const topicHint = firstUserMsg?.content.slice(0, 200).replace(/\n+/g, " ") ?? "(no user message)";

  let md = `---\n`;
  md += `name: Operator conversation ${fileName}\n`;
  md += `type: conversation\n`;
  md += `started: ${firstTs}\n`;
  md += `ended: ${lastTs}\n`;
  md += `message_count: ${messages.length}\n`;
  md += `tags: [${allTags.join(", ")}]\n`;
  md += `---\n\n`;
  md += `# Operator conversation: ${fileName}\n\n`;
  md += `**Topic hint:** ${topicHint}\n\n`;
  md += `**Tags:** ${allTags.join(", ") || "(none)"}\n\n`;
  md += `---\n\n`;

  for (const m of messages) {
    const role = m.role === "user" ? "User" : m.role === "assistant" ? "Operator agent" : m.role;
    const ts = m.timestamp ? ` *(${m.timestamp})*` : "";
    md += `## ${role}${ts}\n\n`;
    md += m.content.trim() + "\n\n";
  }

  return md;
}

function main() {
  ensureDir(DST);
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".jsonl"));
  console.log(`converting ${files.length} files from ${SRC} -> ${DST}`);

  let totalMessages = 0;
  for (const f of files) {
    const srcPath = path.join(SRC, f);
    const md = convertFile(srcPath);
    const dstPath = path.join(DST, f.replace(/\.jsonl$/, ".md"));
    fs.writeFileSync(dstPath, md, "utf8");
    const lineCount = fs.readFileSync(srcPath, "utf8").trim().split("\n").filter(Boolean).length;
    totalMessages += lineCount;
    console.log(`  ${f.padEnd(40)} -> ${dstPath} (${lineCount} messages, ${md.length} chars)`);
  }

  console.log(`\n[done] ${files.length} conversations converted, ${totalMessages} messages total`);
  console.log(`Next: run 'graphify extract . --backend claude --max-concurrency 1' to ingest into CEREBRO`);
}

main();
