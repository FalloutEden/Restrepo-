---
title: "Secrets-handling failure mode + idiot-proof design rules for SaaS BYOK"
kind: postmortem + design-doctrine
date: 2026-05-14
severity: P0 (single command can wipe a tenant's local credentials)
tags:
  - secrets
  - byok
  - vercel
  - footgun
  - operator-rules
  - tenant-safety
  - local-first
  - encrypted-at-rest
  - rotation
  - conmon
  - nist
  - gdpr
related_concepts:
  - "vercel env pull"
  - ".env.local"
  - "Sensitive env vars"
  - "Vercel CLI"
  - "operator system prompt"
  - "BYOK launch gate"
  - "key vault"
  - "credential rotation"
---

# Secrets-handling failure mode + idiot-proof design rules

## What happened on 2026-05-14

**Founder context.** Karling is the ISSO (Information System Security Officer) by background — strong cybersecurity instincts, light DevOps experience. Treats local-on-disk as the canonical source of truth for secrets ("only safe if I have control of it on my pc"). Distrusts cloud platforms to maintain ConMon (Continuous Monitoring) / NIST / GDPR posture — assumes Vercel does NOT meet ConMon and has vulnerabilities they're not addressing. Wants to control secrets local-first and push them to Vercel as the deploy target, not the other way around.

**The failure.** During recovery from a separate Vercel webhook outage, I (the operator agent advisor) instructed the founder to run:

```
vercel link        # prompted: "pull env vars now?" → YES
                   # prompted: "overwrite existing .env.local?" → YES
```

This **wiped his local `.env.local`** and replaced it with Vercel's "development" environment, which was nearly empty.

I then recommended a recovery command:

```
vercel env pull .env.local --environment=production
```

The output looked like a success (34 lines, every expected env var name present). But the actual values were `KEY=""` — empty strings. Vercel's CLI returns the names of "Sensitive" env vars (most secrets, including ANTHROPIC_API_KEY, SHOPIFY_*, PRINTFUL_API_KEY, TENANCY_MASTER_KEY) but never the values, by design. Production code can read them at runtime; the CLI cannot dump them.

Net effect: every key the founder needs for local development is now blank in `.env.local`. To restore he must either:
- Open Vercel Dashboard → Project → Settings → Environment Variables → click "Show" on each, copy/paste into `.env.local`
- OR rotate every key at its source (Anthropic console, Shopify Partners, Printful, CJ, etc.) and update both Vercel + local

**Time cost: ~2 hours of manual recovery.**

## Why this matters for the SaaS

This isn't a Karling-specific problem. The same gun is loaded for every BYOK tenant:

- Tenant runs through onboarding, configures their Shopify + Printful + LLM keys
- Operator (or tenant themselves) eventually triggers a vercel CLI op
- Vercel prompts during `vercel link` / `vercel env pull` walk the tenant straight into wiping local keys with no warning
- Tenant's local dev breaks. Production keeps running. Tenant blames the SaaS, churns, or — worse — distrusts the platform and assumes their secrets leaked

For a "build a Shopify+Printful brand for your mom / your grandma / a 16-year-old / Joe Schmo who doesn't know what an env var is" product, **the platform cannot tolerate any operation that destroys customer state without a confirmation that surfaces the loss in plain English.**

## Operator hard rules (NEW, must be added to meta-rules)

These rules go into `.openclaw/operator/knowledge/meta-rules/secrets-handling.md` so the operator agent enforces them on every tenant interaction. The rules are also pinned into the operator system prompt as a CRITICAL section.

### Rule 1 — Never suggest a destructive command without explicit warning

If a tool, CLI command, or instruction can wipe / overwrite / mask / encrypt-then-lose customer state, the operator MUST:

1. Surface the EXACT side effect in plain English BEFORE recommending the command
2. Offer a backup step first
3. Offer a less destructive alternative if one exists
4. Use a one-shot disclosure pattern: *"This command will X. The reason that matters is Y. Before you run it, run Z to back up."*

**The 2026-05-14 incident violated this rule three times in a row** (`vercel link` env pull prompt, `vercel env pull` recovery command, then `npm run env:pull` — each described as helpful, none warned that Vercel returns empty values for Sensitive vars).

### Rule 2 — Backup before any operation that touches `.env.local`

Before any command that writes to `.env.local`, the operator MUST:

1. Copy the current `.env.local` to `.env.local.backup-<ISO-timestamp>` (gitignored)
2. Tell the user where the backup lives
3. Tell the user how to restore: `mv .env.local.backup-<ts> .env.local`

This is a five-line script. The fact that no such script existed today is the bug. See `scripts/env-doctor.mjs` (NEW in this commit) for the pattern.

### Rule 3 — Vercel CLI env pull NEVER returns Sensitive values

This is a Vercel platform behavior, not a bug. The operator must know:

- `vercel env pull --environment=production` returns names but NOT values for Sensitive vars
- The values are visible ONLY in the Vercel Dashboard UI (and even there, click-to-reveal is required)
- Customers who wipe local and try to restore via CLI WILL get empty strings and have to manually copy or rotate

When suggesting `vercel env pull`, the operator must say: *"Heads up — Sensitive env vars (most API keys) come back as empty strings. The CLI can't decrypt them. If you've lost your local copy, you'll need to view + copy from Vercel Dashboard, or rotate the keys."*

### Rule 4 — Local-first for the founder; vault-first for tenants

Two patterns, two audiences:

- **Founder/admin (Karling)**: local-on-disk is canonical. Vercel is the deploy target. Operator should NEVER overwrite local from Vercel without explicit founder confirmation AND a backup. The "sync local → Vercel" direction is the default; "sync Vercel → local" is only for first-time setup.
- **Tenant (BYOK customer)**: they will never touch the Vercel CLI. They paste credentials into the operator UI once, the operator encrypts them via `lib/tenancy.ts` (AES-256-GCM, TENANCY_MASTER_KEY-derived), the operator stores them in the tenant vault, the operator decrypts them per-call. The tenant never sees env vars, never opens a `.env.local`, never runs a CLI command. **This is already built** (see lib/tenant-context.ts) — the operator must direct tenants down this path, not the env-var path.

### Rule 5 — Always validate keys before suggesting a destructive op

Before any state-altering command, the operator should run a "doctor" check: are all the required env vars present AND non-empty? If yes, proceed. If no, surface what's missing first.

The new `scripts/env-doctor.mjs` is the seed of this. Future automation should:
- Run env-doctor automatically pre-deploy
- Block `npm run deploy` if required env vars are missing/blank
- Surface a single recovery command instead of a list of broken pieces

## Idiot-proofing: what the SaaS must build

The founder's stated standard: *"my mom or grandma or some 16 year old or some joe shmo"* must not be able to break their own instance. Translating that to engineering:

### 1. Tenant-facing key vault UI (not env vars)

Tenants should NEVER see a `.env.local` file or a Vercel CLI. They paste a Shopify token into a form field. The operator UI encrypts it into the tenant vault (`lib/tenancy.ts setTenantSecret`). The operator reads it back via `lib/tenant-context.ts requireSecret` whenever a tool needs it. Already built — needs to be the ONLY path exposed to tenants.

### 2. Pre-flight env doctor

Already shipping in this commit: `scripts/env-doctor.mjs`. Verifies every required env var is present AND non-empty. Reports missing/blank ones with their purpose ("ANTHROPIC_API_KEY is missing — needed for the operator chat. Add it at Anthropic Console → API Keys"). Wired as `npm run doctor` and as a pre-deploy guard.

### 3. Automatic backup before any destructive op

The env-doctor script also exposes `npm run env:backup` which timestamps a copy of `.env.local` to `.env.local.backup-<ISO>`. The operator must call this BEFORE any vercel CLI op the tenant runs (or run it automatically as a wrapper).

### 4. Wrapper scripts that warn, not raw CLI commands

Instead of telling tenants "run `vercel link`", the operator points them at `npm run vercel:setup` which:
- Runs env-doctor first (refuses to proceed if local has unbacked-up keys)
- Runs `vercel link` with `--yes` (skip prompts)
- Does NOT trigger the env-pull prompt
- Confirms success in plain English

Not built yet. Tracked as a followup in the next-session todos.

### 5. Continuous monitoring of secret freshness

If a secret is blank in `.env.local` but the corresponding Vercel env var is set, the operator should detect that mismatch on every chat-loop init and warn the founder/tenant. Not built yet.

### 6. ConMon posture documentation

Karling's ISSO instinct is right to demand a documented security posture, especially since this is a SaaS handling third-party API keys + Stripe customer data + Shopify admin tokens (some of which can read PII). Track these as separate followups:

- NIST 800-53 control mapping for the operator's secret handling
- GDPR DPA template + data-flow diagram
- Vercel platform compliance review (what they DO certify, what we layer on top)
- ConMon plan: how often are tenant secret-vault entries audited / rotated / monitored

The honest current state: lib/tenancy.ts encrypts secrets at rest with AES-256-GCM under a derived master key. That's a solid primitive. But there's no scheduled rotation, no audit log of secret-vault reads, no per-tenant key separation. All addressable, none addressed yet.

## Concrete recovery for the 2026-05-14 incident

For Karling RIGHT NOW:

1. Open Vercel Dashboard → Project "restrepo" → Settings → Environment Variables
2. For each of these keys, click the **eye icon** to reveal the value, then copy into local `.env.local`:
   - ANTHROPIC_API_KEY, OPENAI_API_KEY
   - OPERATOR_AUTH_SECRET, TENANCY_MASTER_KEY
   - SHOPIFY_API_KEY, SHOPIFY_BLACKVAULT_API_KEY, SHOPIFY_BLACKVAULT_STORE_DOMAIN, SHOPIFY_BLACKVAULT_WEBHOOK_SECRET, SHOPIFY_STORE_DOMAIN
   - PRINTFUL_API_KEY, PRINTFUL_STORE_ID
   - CJ_API_KEY, CJ_EMAIL
3. Add (these were never on Vercel, must restore from notes or rotate):
   - STRIPE_SECRET_KEY (Stripe Dashboard → Developers → API Keys)
   - KLAVIYO_API_KEY (if used)
   - ZENDROP_API_KEY (if used)

If the dashboard ALSO won't reveal a value (some Vercel orgs are configured to fully hide Sensitive values), rotate that key:
- Anthropic: console.anthropic.com → API Keys → revoke + create new
- OpenAI: platform.openai.com → API keys → rotate
- Shopify: Partners → app → API credentials → rotate
- Printful: Printful Dashboard → Account → Developers → rotate

After restoring local, run `npm run doctor` to verify everything required is present + non-empty before the next `npm run deploy`.

## Followups tracked

- Build the `npm run vercel:setup` wrapper that bypasses the env-pull prompt
- Build the continuous secret-freshness check
- Document NIST 800-53 control mapping for secret handling
- Build the tenant-facing key vault UI (form field flow, not env vars)
- Block `npm run deploy` if env-doctor reports missing/blank required vars
