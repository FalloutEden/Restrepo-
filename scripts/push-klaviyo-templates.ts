// Push the 8 BV email templates from .openclaw/marketing/emails_filled/ into
// Klaviyo's template library. Reads each .md file, extracts the subject line +
// HTML body block, and creates a Klaviyo template via the API.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/push-klaviyo-templates.ts

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { klaviyoCreateTemplate, klaviyoListTemplates } from "@/lib/klaviyo";

const TEMPLATES_DIR = path.join(process.cwd(), ".openclaw", "marketing", "emails_filled");

// Files we want to push. Order is intentional — welcome series first, then
// triggers, then broadcast.
const FILES_IN_ORDER = [
  "welcome-1.md",
  "welcome-2.md",
  "welcome-3.md",
  "abandoned-cart-1.md",
  "abandoned-cart-2.md",
  "browse-abandonment.md",
  "post-purchase-thanks.md",
  "launch-announcement.md"
];

// Map filename → Klaviyo-friendly template name
const NAME_MAP: Record<string, string> = {
  "welcome-1.md": "BV Welcome 1 — You're on the list",
  "welcome-2.md": "BV Welcome 2 — Why we put GSM on every label",
  "welcome-3.md": "BV Welcome 3 — The full collection",
  "abandoned-cart-1.md": "BV Abandoned Cart 1 — Still in your bag",
  "abandoned-cart-2.md": "BV Abandoned Cart 2 — Before we release it back",
  "browse-abandonment.md": "BV Browse Abandonment",
  "post-purchase-thanks.md": "BV Post-Purchase Thanks",
  "launch-announcement.md": "BV Launch Announcement"
};

function extractSubjectAndHtml(md: string): { subject?: string; html?: string } {
  // Subject lines section: pull first numbered subject as the default
  const subjMatch = md.match(/##\s*Subject\s*lines[\s\S]*?\n\s*1\.\s*`?([^`\n]+)`?/i);
  const subject = subjMatch?.[1]?.trim();

  // HTML body block: pull the content of the first ```html ... ``` block
  const htmlMatch = md.match(/```html\s*([\s\S]+?)\s*```/);
  const html = htmlMatch?.[1]?.trim();

  return { subject, html };
}

async function main() {
  console.log(`[klaviyo-templates] reading from ${TEMPLATES_DIR}`);
  const dirContents = await readdir(TEMPLATES_DIR);
  const filesToPush = FILES_IN_ORDER.filter((f) => dirContents.includes(f));
  console.log(`[klaviyo-templates] ${filesToPush.length} of ${FILES_IN_ORDER.length} files found`);

  // Look up existing template names so we don't push duplicates
  let existing: Awaited<ReturnType<typeof klaviyoListTemplates>>;
  try {
    existing = await klaviyoListTemplates();
  } catch (e) {
    console.error(`[klaviyo-templates] failed to list existing templates:`, e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const existingNames = new Set(existing.map((t) => t.name));
  console.log(`[klaviyo-templates] ${existing.length} templates already in library`);

  let created = 0;
  let skipped = 0;
  let failed: Array<{ file: string; reason: string }> = [];

  for (const file of filesToPush) {
    const name = NAME_MAP[file] ?? file;
    if (existingNames.has(name)) {
      console.log(`  — ${name}  (already exists, skipping)`);
      skipped += 1;
      continue;
    }

    const md = await readFile(path.join(TEMPLATES_DIR, file), "utf8");
    const { subject, html } = extractSubjectAndHtml(md);
    if (!html) {
      failed.push({ file, reason: "no HTML block found in markdown" });
      console.log(`  ✗ ${file}  (no html block)`);
      continue;
    }

    const r = await klaviyoCreateTemplate({ name, html, subject });
    if (r.ok) {
      created += 1;
      console.log(`  ✓ ${name}  → template ${r.templateId}`);
    } else {
      failed.push({ file, reason: `${r.status}: ${r.detail}` });
      console.log(`  ✗ ${name}  → ${r.status}: ${r.detail.slice(0, 120)}`);
      // If we hit a 403 on the first push, the scope isn't upgraded — bail
      // early rather than burning more rate limit on doomed calls.
      if (r.status === 403 && created === 0) {
        console.log(`\n[klaviyo-templates] aborting: API key lacks Templates:Full Access scope`);
        console.log(`[klaviyo-templates] upgrade in Klaviyo → Account → API Keys → edit → Templates: Full Access`);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n[klaviyo-templates] created: ${created}  skipped: ${skipped}  failed: ${failed.length}`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  - ${f.file}: ${f.reason.slice(0, 200)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
