# Secrets handling — operator hard rules

These rules apply to EVERY tenant interaction, regardless of brand. They
are designed so that "Joe Schmo" / "my mom" / "a 16-year-old" can never
accidentally destroy their own instance by following operator instructions.

Source incident: 2026-05-14 — the operator advisor walked the founder
through `vercel link` (which wiped `.env.local`) then `vercel env pull
--environment=production` (which returned empty values for Sensitive vars
because Vercel CLI cannot decrypt them). Net cost: ~2 hours of manual
recovery. Full postmortem: `.openclaw/research/secrets-handling-failure-mode-2026-05-14.md`.

## Rule 1 — Never suggest a destructive command without an explicit warning

If a tool, CLI command, or instruction can wipe / overwrite / mask / lose
customer state, you MUST:

1. Surface the EXACT side effect in plain English BEFORE recommending the
   command. ("This command will overwrite your local secrets file with
   whatever Vercel has stored. If Vercel has empty values, your local
   secrets are gone.")
2. Offer a backup step first ("Before you run it, copy `.env.local` to
   `.env.local.backup-<today>` — I'll do that for you if you want.")
3. Offer a less destructive alternative if one exists ("Or: open Vercel
   Dashboard → Settings → Environment Variables and copy values manually
   — slower but won't wipe anything.")
4. NEVER tell a tenant "say yes to all prompts" or "use the defaults" on
   any CLI tool. Walk them through each prompt.

## Rule 2 — Always back up `.env.local` before any operation that writes to it

Use `npm run env:backup` (or the equivalent `cp .env.local
.env.local.backup-$(date +%s)`) BEFORE:

- `vercel link` (the env-pull prompt sequence)
- `vercel env pull` (always overwrites)
- Any script that touches secrets

After the operation completes successfully, tell the tenant where the
backup lives so they can restore if needed.

## Rule 3 — Vercel CLI env pull NEVER returns Sensitive values

This is a Vercel platform behavior, not a bug. When discussing
`vercel env pull` with a tenant or founder, ALWAYS include this warning:

> Heads up — Sensitive env vars (most API keys) come back as empty
> strings. The CLI cannot decrypt them. If you've lost your local copy,
> you'll need to view + copy from Vercel Dashboard (eye icon next to each
> var), or rotate the keys at their source (Anthropic console, Shopify
> Partners, etc.).

The values are visible ONLY in the Vercel Dashboard UI (and even there,
click-to-reveal is required). The CLI dump is for env var STRUCTURE,
not values.

## Rule 4 — Two audiences, two patterns

### Founder/admin context (legacy: Karling)

- Local-on-disk (`.env.local`) is the canonical source of truth
- Vercel is the deploy target
- Direction: local → Vercel (push secrets up)
- NEVER overwrite local from Vercel without explicit founder consent + a
  backup
- Operator must surface what would change before any overwrite

### Tenant context (BYOK customer)

- Tenants must NEVER see a `.env.local` or run a Vercel CLI command
- They paste credentials into the operator chat / dashboard ONCE per
  platform (Shopify token, Printful key, etc.)
- The operator stores them encrypted via `lib/tenancy.ts setTenantSecret`
  (AES-256-GCM under TENANCY_MASTER_KEY)
- The operator reads them back via `lib/tenant-context.ts requireSecret`
  per tool call
- If a tenant asks "how do I run this locally?" — the answer is "you
  don't, the operator runs everything for you. Tell me what you want
  built." Reframe their assumption that they need a dev environment.

## Rule 5 — Run env doctor before any state-altering operation

The repo includes `scripts/env-doctor.mjs` (run via `npm run doctor`).
Before suggesting:

- `npm run deploy` / `vercel --prod`
- Any cron endpoint that needs credentials
- Any operator tool that reads env vars

…run env-doctor first. If required vars are missing or blank, surface
that to the tenant BEFORE the destructive op fails halfway through.

A future task list (tracked in the postmortem) is to wire env-doctor as
a pre-deploy guard so `npm run deploy` refuses to proceed with bad env.

## Rule 6 — Be honest about ConMon / NIST / GDPR posture

The founder is an ISSO and will notice handwaving. When asked about
secret handling posture, the honest current state is:

- AT REST: AES-256-GCM under a 32-byte master key (TENANCY_MASTER_KEY)
- IN FLIGHT: TLS via Vercel + the upstream platform's TLS (Anthropic,
  Shopify, etc.)
- ROTATION: not scheduled or automated; ad-hoc when a key is suspected
  compromised
- AUDIT: no log of secret-vault reads exists yet
- KEY SEPARATION: per-tenant via tenant.secrets, but the master key is
  shared across the platform

Do not claim NIST 800-53 conformance or GDPR DPA-ready unless those
controls are actually mapped + documented. They are not yet.

If a tenant or founder asks for a compliance audit, the honest answer is
"here's what we have today, here's the gap, here's the timeline to
close it" — never "we're compliant."

## What this rule set is NOT

This rule set is about avoiding catastrophic destruction of customer
state. It is NOT about:

- Forbidding secrets from being stored anywhere (they have to live
  somewhere)
- Forbidding the use of Vercel (Vercel is fine, the CLI's env-pull
  behavior is the specific footgun)
- Slowing down every interaction with a wall of warnings (the warnings
  are for destructive ops only — read-only ops proceed normally)

Apply these rules surgically. The rest of the time, move fast.
