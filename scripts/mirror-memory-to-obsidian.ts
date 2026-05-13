// Mirror agent memory files from the conversation-scoped folder into the
// user's Obsidian vault with Graphafy-compatible structure:
//   - Folder buckets by type (Brand / Agent-Infra / Reference / Feedback)
//   - Cross-file links rewritten from markdown to [[wikilinks]]
//   - Master 00-Index.md replaces MEMORY.md as the home node
//
// This is READ-ONLY against the source memory folder. The original memory
// stays in place; the vault gets a fresh copy. No code, no Shopify, no
// Printful — pure markdown copy.
//
// Run:
//   node --import tsx scripts/mirror-memory-to-obsidian.ts

import fs from "node:fs";
import path from "node:path";

const SRC = "C:\\Users\\karli\\.claude\\projects\\c--Agents-Restrepo-\\memory";
const VAULT = "C:\\Users\\karli\\Documents\\Restrepo-Vault\\Restrepo-_Vault";

// Folder buckets inside the vault
const FOLDERS = {
  brand: "01-Brand-Black-Vault",
  infra: "02-Agent-Infra",
  ref: "03-Reference",
  feedback: "04-Feedback"
};

// Per-file routing — picked by hand to keep Brand vs Reusable separate
// (Brand = BV-specific, Reusable = patterns that survive new merchants)
const ROUTE: Record<string, keyof typeof FOLDERS> = {
  "project_state.md": "infra",
  "reference_external_systems.md": "ref",
  "project_drafts_in_shopify.md": "brand",
  "project_operator_agent.md": "infra",
  "project_brand_fit_guardrails.md": "infra",
  "project_content_studio.md": "infra",
  "reference_shopify_partners_app.md": "ref",
  "project_production_live.md": "brand",
  "reference_shopify_payments_testing.md": "ref",
  "project_store_automation_2026_05_05.md": "brand",
  "project_benchmark_2026_05_05_evening.md": "brand",
  "project_autorun_2026_05_05_findings.md": "brand",
  "project_full_scope_grant_2026_05_06.md": "brand",
  "project_headwear_2026_05_06.md": "brand",
  "reference_printful_import_workflow.md": "ref",
  "project_launch_prep_2026_05_06.md": "brand",
  "feedback_ai_image_hallucination.md": "feedback",
  "reference_meta_verification_failure.md": "ref",
  "project_merchant_footwork_pattern.md": "infra",
  "project_elsa_commitment.md": "brand",
  "reference_bv_catalog_bg_decision.md": "ref",
  "reference_bv_bg_composite_recipe.md": "ref",
  "reference_printful_embroidery_mockup.md": "ref"
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function rewriteLinks(md: string): string {
  // Markdown link → wikilink: [Title](filename.md) → [[filename]]
  // (or [[filename|Title]] if title differs from filename)
  return md.replace(/\[([^\]]+)\]\(([\w_-]+)\.md\)/g, (_match, title: string, file: string) => {
    if (title === file || title.replace(/[\s_-]/g, "").toLowerCase() === file.replace(/[\s_-]/g, "").toLowerCase()) {
      return `[[${file}]]`;
    }
    return `[[${file}|${title}]]`;
  });
}

function main() {
  // Create folder structure
  for (const f of Object.values(FOLDERS)) ensureDir(path.join(VAULT, f));

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
  console.log(`mirroring ${files.length} memory files into ${VAULT}\n`);

  const written: Array<{ file: string; folder: string }> = [];
  const skipped: string[] = [];

  for (const file of files) {
    const route = ROUTE[file];
    if (!route) {
      skipped.push(file);
      continue;
    }
    const src = path.join(SRC, file);
    const dst = path.join(VAULT, FOLDERS[route], file);
    const content = fs.readFileSync(src, "utf8");
    const rewritten = rewriteLinks(content);
    fs.writeFileSync(dst, rewritten, "utf8");
    written.push({ file, folder: FOLDERS[route] });
    console.log(`  ${FOLDERS[route].padEnd(22)} ← ${file}`);
  }

  // Build the master index
  const byBucket: Record<string, Array<{ file: string }>> = { brand: [], infra: [], ref: [], feedback: [] };
  for (const w of written) {
    const bucket = (Object.entries(FOLDERS).find(([, v]) => v === w.folder)?.[0] ?? "") as keyof typeof FOLDERS;
    byBucket[bucket].push({ file: w.file.replace(/\.md$/, "") });
  }

  const indexContent = `# Restrepo Vault — Agent Memory Index

This vault holds the agent's persistent memory between conversations. Markdown files are linked with \`[[wikilinks]]\` so [Graphafy](https://github.com/) can plot the relationships visually.

## How this works

- The agent reads and writes notes here between sessions
- You can edit any note directly in Obsidian — the agent picks up your changes
- New notes are added to the appropriate folder based on type (Brand / Infra / Reference / Feedback)
- The master \`MEMORY.md\` in the source memory folder mirrors this index

---

## 01 Brand — Black Vault Apparel

BV-specific projects, decisions, and state. When the agent template is sold to a new merchant, this folder gets replaced with their brand notes; everything else stays.

${byBucket.brand.map((n) => `- [[${n.file}]]`).join("\n")}

## 02 Agent Infra

Reusable agent patterns — operator, content studio, brand-fit guardrails, merchant onboarding playbook. Survives across brands.

${byBucket.infra.map((n) => `- [[${n.file}]]`).join("\n")}

## 03 Reference

External systems, API quirks, recipes. The agent reaches here when it needs to remember "how to call X" or "what we learned about Y."

${byBucket.ref.map((n) => `- [[${n.file}]]`).join("\n")}

## 04 Feedback

Rules from the user — corrections and confirmations. The agent applies these without re-asking.

${byBucket.feedback.map((n) => `- [[${n.file}]]`).join("\n")}

---

## Quick links

- Active brand: [[project_production_live]]
- Current launch context: [[project_elsa_commitment]]
- Catalog visual direction: [[reference_bv_catalog_bg_decision]]
`;

  fs.writeFileSync(path.join(VAULT, "00-Index.md"), indexContent, "utf8");
  console.log(`\n  ROOT                   ← 00-Index.md (master index, ${indexContent.length} chars)`);

  if (skipped.length > 0) {
    console.log(`\nskipped (no route): ${skipped.join(", ")}`);
  }
  console.log(`\n[done] ${written.length} files mirrored, vault rooted at:\n  ${VAULT}`);
}

main();
