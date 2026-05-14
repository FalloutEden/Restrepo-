#!/usr/bin/env node
// env-doctor — checks `.env.local` for missing/blank required env vars
// and reports them in plain English. Also offers a one-shot backup.
//
// Usage:
//   node scripts/env-doctor.mjs           — run the doctor check
//   node scripts/env-doctor.mjs --backup  — make a timestamped backup of .env.local
//   node scripts/env-doctor.mjs --help    — show usage
//
// Exit codes:
//   0 — all required vars present + non-empty
//   1 — one or more required vars missing or blank
//   2 — .env.local not found (no setup at all)
//   3 — argument error / unknown flag
//
// Wired in package.json as `npm run doctor` and `npm run env:backup`.
//
// Why this exists: on 2026-05-14 the operator advisor walked the founder
// through `vercel link` (env-pull prompts wiped .env.local) and then a
// `vercel env pull --environment=production` that returned empty values
// for Sensitive vars (Vercel CLI cannot decrypt them). Net cost: ~2 hours
// of manual key recovery. This doctor catches the same failure mode
// before the founder/tenant hits a broken local dev or deploy.
//
// Full postmortem + design rules:
//   .openclaw/research/secrets-handling-failure-mode-2026-05-14.md

import fs from "node:fs";
import path from "node:path";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const HELP = `env-doctor — check .env.local for missing or blank required vars

Usage:
  node scripts/env-doctor.mjs           Run the doctor check
  node scripts/env-doctor.mjs --backup  Timestamped backup before destructive ops
  node scripts/env-doctor.mjs --help    Show this help

Exit codes: 0 ok | 1 missing/blank | 2 no .env.local | 3 arg error
`;

// Required env vars grouped by purpose. Each entry: the key name + what
// it's for (in plain English) + where to get it. The "blank" check is
// the key catch for the Vercel CLI "Sensitive var → empty string" gotcha.
const REQUIRED_VARS = [
  // LLM providers (operator chat + content studio require these)
  {
    key: "ANTHROPIC_API_KEY",
    purpose: "Operator chat (Claude). Without this, /api/operator/chat fails.",
    where: "https://console.anthropic.com → API Keys → Create"
  },
  {
    key: "OPENAI_API_KEY",
    purpose: "Content studio image gen (gpt-image-1). Without this, content drops fail.",
    where: "https://platform.openai.com/api-keys"
  },

  // Multi-tenant SaaS infrastructure
  {
    key: "OPERATOR_AUTH_SECRET",
    purpose: "Admin bearer token for /api/admin/* routes + cookie-auth.",
    where: "Generate: openssl rand -hex 32"
  },
  {
    key: "TENANCY_MASTER_KEY",
    purpose: "AES-256-GCM key that encrypts every tenant's secret vault.",
    where: "Generate: openssl rand -hex 32 (64 hex chars required)"
  },

  // Shopify (founder brand)
  {
    key: "SHOPIFY_BLACKVAULT_API_KEY",
    purpose: "Black Vault Apparel Shopify Admin API token.",
    where: "Shopify Admin → Apps → Develop apps → app → API credentials"
  },
  {
    key: "SHOPIFY_BLACKVAULT_STORE_DOMAIN",
    purpose: "Black Vault store domain (e.g. blackvaultapparel.myshopify.com).",
    where: "Shopify Admin → Settings → Domains → .myshopify.com URL"
  },
  {
    key: "SHOPIFY_BLACKVAULT_WEBHOOK_SECRET",
    purpose: "Verifies Shopify webhook HMAC. Prefix: shpss_...",
    where: "Shopify Partners → app → Webhooks section"
  },

  // Printful (apparel fulfillment)
  {
    key: "PRINTFUL_API_KEY",
    purpose: "Printful API token for sync products + order creation.",
    where: "https://www.printful.com → Account → Developers → Token"
  },
  {
    key: "PRINTFUL_STORE_ID",
    purpose: "Numeric Printful store id (X-PF-Store-Id header).",
    where: "https://www.printful.com → Stores → click your store → URL contains the id"
  }
];

// Optional but flagged-if-missing-when-feature-is-used vars. Not blocking.
const OPTIONAL_VARS = [
  { key: "STRIPE_SECRET_KEY", purpose: "Stripe checkout + subscriptions for the SaaS." },
  { key: "STRIPE_WEBHOOK_SECRET", purpose: "Stripe webhook signature verification." },
  { key: "STRIPE_PRICE_MONTHLY", purpose: "Stripe price id for the monthly subscription." },
  { key: "STRIPE_PRICE_SETUP", purpose: "Stripe price id for the one-time setup fee." },
  { key: "KLAVIYO_API_KEY", purpose: "Klaviyo email platform integration (optional)." },
  { key: "CJ_API_KEY", purpose: "CJ Dropshipping (used for LockLayer brand sourcing)." },
  { key: "CJ_EMAIL", purpose: "CJ Dropshipping account email." },
  { key: "ZENDROP_API_KEY", purpose: "Zendrop alt-supplier integration (optional)." },
  { key: "RESEND_API_KEY", purpose: "Transactional email (welcome emails, alerts)." },
  { key: "FOUNDER_ALERT_EMAIL", purpose: "Where cron alerts + spend digests are sent." },
  { key: "CRON_SECRET", purpose: "Auth for Vercel cron endpoints (Vercel auto-injects)." }
];

function parseEnvFile(contents) {
  const out = new Map();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

function colorize(text, code) {
  // Skip ANSI if not a TTY (e.g. CI logs) — keep output greppable.
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}
const red = (t) => colorize(t, "31");
const green = (t) => colorize(t, "32");
const yellow = (t) => colorize(t, "33");
const bold = (t) => colorize(t, "1");
const dim = (t) => colorize(t, "2");

function runBackup() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(red("✗ No .env.local to back up."));
    process.exit(2);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${ENV_FILE}.backup-${ts}`;
  fs.copyFileSync(ENV_FILE, dest);
  console.log(green("✓ Backup written:"), dest);
  console.log(dim("  Restore with: mv " + dest + " .env.local"));
  process.exit(0);
}

function runDoctor() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(red("✗ .env.local does not exist."));
    console.error(
      "  Create one: cp .env.example .env.local (if .env.example exists),"
    );
    console.error(
      "  or run: npm run env:pull (then add real values — Sensitive vars come back blank)"
    );
    process.exit(2);
  }

  const env = parseEnvFile(fs.readFileSync(ENV_FILE, "utf8"));

  const missing = [];
  const blank = [];
  for (const v of REQUIRED_VARS) {
    if (!env.has(v.key)) {
      missing.push(v);
    } else if ((env.get(v.key) ?? "").length === 0) {
      blank.push(v);
    }
  }

  const optionalGaps = [];
  for (const v of OPTIONAL_VARS) {
    const val = env.get(v.key);
    if (val == null || val.length === 0) optionalGaps.push(v);
  }

  console.log(bold("env-doctor"));
  console.log(dim(`  file: ${ENV_FILE}`));
  console.log(dim(`  vars present: ${env.size}`));
  console.log("");

  if (missing.length === 0 && blank.length === 0) {
    console.log(green("✓ All required env vars present and non-empty."));
  } else {
    console.log(
      red(
        `✗ ${missing.length + blank.length} required env var(s) need attention:`
      )
    );
    console.log("");
    for (const v of missing) {
      console.log(red("  MISSING  ") + bold(v.key));
      console.log(`           ${v.purpose}`);
      console.log(dim(`           Get it: ${v.where}`));
      console.log("");
    }
    for (const v of blank) {
      console.log(yellow("  BLANK    ") + bold(v.key));
      console.log(`           ${v.purpose}`);
      console.log(
        dim(
          "           A blank value usually means `vercel env pull` returned an empty string"
        )
      );
      console.log(
        dim(
          "           for a Sensitive var. Reveal it in Vercel Dashboard → Settings →"
        )
      );
      console.log(
        dim(
          "           Environment Variables → eye icon, OR rotate at the source:"
        )
      );
      console.log(dim(`           ${v.where}`));
      console.log("");
    }
  }

  if (optionalGaps.length > 0) {
    console.log(
      dim(
        `(${optionalGaps.length} optional var(s) not set — only matters if you use those features:)`
      )
    );
    for (const v of optionalGaps) {
      console.log(dim(`    · ${v.key} — ${v.purpose}`));
    }
    console.log("");
  }

  if (missing.length === 0 && blank.length === 0) {
    console.log(
      dim(
        "Tip: before any destructive op (vercel link, vercel env pull, etc.) run:"
      )
    );
    console.log(dim("     npm run env:backup"));
    process.exit(0);
  }

  process.exit(1);
}

const arg = process.argv[2];
if (arg === "--help" || arg === "-h") {
  console.log(HELP);
  process.exit(0);
}
if (arg === "--backup") {
  runBackup();
}
if (arg && arg.startsWith("--")) {
  console.error(red(`Unknown flag: ${arg}`));
  console.error(HELP);
  process.exit(3);
}
runDoctor();
