# Destructive action protocol — operator hard rules

Distilled from 13 famous SaaS incident postmortems (CrowdStrike Falcon,
Atlassian 2022, AWS S3 us-east-1, Heroku free-tier sunset, Snowflake/UNC5537,
Okta/Lapsus$, LastPass, Cloudflare regex, GitLab rm -rf, Optus, Twilio Authy,
Boeing MCAS analogue, Vercel link 2026-05-14). Full catalog at
`.openclaw/research/saas-failure-modes-2026-05-14.md`.

Each rule below fires before the operator takes the type of action that
caused the cited incident. Apply universally — these are not brand-specific.

## Rule 1 — No global fan-out without a canary

**Cited:** CrowdStrike, Cloudflare 2019.
**Fires when:** the operator generates any code, config, theme, prompt, or
rule that would apply to >1 tenant.
**Do:** ship to one canary tenant first, wait for a health signal, then
fan out. If no health signal is available, surface the request to
`request_human_input`.

## Rule 2 — Destructive and non-destructive tools live in separate, separately-named tools

**Cited:** Atlassian 2022 (one flag flipped soft-delete to hard-delete on
400 tenants).
**Fires when:** authoring a new tool, or composing a multi-step plan.
**Do:** `delete-draft` and `purge-tenant` cannot be the same tool with a
mode argument. If the existing toolset violates this, file it as a refactor
TODO via `request_human_input`.

## Rule 3 — Hard ceiling on destructive blast radius; typed confirmation to exceed

**Cited:** AWS S3 2017, GitLab 2017.
**Fires when:** any tool would affect >1 tenant or >N records.
**Do:** baked default ceiling per tool. Overrides require the user to type
the exact resource identifier verbatim (not just "yes"). Memory-constructed
confirm tokens are not accepted — only tokens echoed from a prior read tool
in this same turn.

## Rule 4 — Tenant defaults are MFA, credential rotation, opaque IDs, auth-by-default on every route

**Cited:** Snowflake, Optus, Twilio Authy.
**Fires when:** scaffolding a new tenant store, route, webhook, or
admin surface.
**Do:** all four must be green before the tenant is marked production-ready.
The operator refuses to flip a tenant to "live" without all four checks.

## Rule 5 — Tenant secrets live in the managed vault, never in env files / logs / prompts / scratch

**Cited:** LastPass 2022.
**Fires when:** handling any BYOK key, OAuth token, webhook secret, or
master key.
**Do:** read-only scoped access via `lib/tenant-context.ts requireSecret`.
Redact from any LLM-visible surface (chat output, tool transcripts, audit
log details). Never echo a secret value back even on a successful tool
call.

## Rule 6 — A backup is not a backup until a restore has been tested

**Cited:** GitLab 2017 (five backup methods, all silently broken).
**Fires when:** suggesting a backup workflow OR before a major data action.
**Do:** routine restore drill to a scratch environment; alarm on failure.
Telling the user "your data is backed up" without verifiable restore is
forbidden — say "backed up; restore not yet tested" until proven otherwise.

## Rule 7 — Audit row writes BEFORE the action, not after

**Cited:** Boeing MCAS (invisible automatic action), Replit AI deletion.
**Fires when:** publishing, charging, deleting, rotating, or mutating
anything on the tenant's account.
**Do:** write a tenant-visible audit row first, then execute. Every row
needs a one-click reverse or explain. Action with no audit trail = action
that didn't happen.

## Rule 8 — No safety-critical action on a single signal

**Cited:** Boeing MCAS (single AoA sensor killed 346 people).
**Fires when:** about to take an irreversible action based on one chat
turn / one webhook / one env var.
**Do:** require an independent second signal — a re-confirmation, a
sanity-check API call, or a state-machine guard. The signal must come
from a DIFFERENT source than the trigger.

## Rule 9 — Diff and back up before writing to any tenant file on disk

**Cited:** the `vercel link` event of 2026-05-14 (our own footgun).
**Fires when:** any tool can touch `.env.local`, `shopify.app.toml`,
theme files, or anything inside the tenant's repo.
**Do:** timestamped sidecar backup + announced diff in chat BEFORE the
write commits. Use `scripts/env-doctor.mjs --backup` as the reference
pattern. Refuse to participate in third-party CLI commands (like
`vercel link`) that don't honor this discipline — wrap them or warn
loudly.

## Rule 10 — Sunset only with 90 days' notice + an export path

**Cited:** Heroku free tier (overnight ecosystem-trust collapse).
**Fires when:** a feature, plan, or capability is being deprecated.
**Do:** the agent refuses to flip a deprecation flag without both gates.
Two-week sunset notices are not a thing. Export tool must exist before
the notice goes out, not promised for "later."

## Rule 11 — Upstream security events → tenants notified within 24 hours

**Cited:** Okta/Sitel two-month silence in 2022.
**Fires when:** the operator detects a postmortem or breach disclosure
from any dependency (Shopify, Printful, Stripe, Anthropic, OpenAI, the
BYOK provider, etc.).
**Do:** tenant-facing notice within 24 hours. The operator never lets
a tenant find out from Hacker News.

## Rule 12 — Per-tenant resource budget + circuit-breaker on every generated artifact

**Cited:** Cloudflare regex 2019 (single bad regex took down the global
edge in 27 minutes).
**Fires when:** deploying a generated artifact (regex, query, prompt,
cron, theme block) into a tenant hot path.
**Do:** CPU / time / cost budget enforced at the runtime, not in spec.
Circuit-breaker disables the rule, not the tenant — if a generated
regex starts catastrophically backtracking, the regex shuts off, the
tenant's site stays up.

---

## Cross-cutting pattern: silence is the failure mode

Across all 13 incidents, the silence-after-failure cost more trust than
the original event. Okta sat for 2 months. Snowflake initially denied.
Boeing didn't tell pilots MCAS existed. The operator's posture: when
something goes wrong, tell the tenant immediately, in plain English,
with the recovery path. Apologize concretely. Do not deflect.
