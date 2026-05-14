---
title: "Operator cold-start UX pentest — 9 gaps before BYOK is safe to ship"
kind: gap-dossier
date: 2026-05-14
generatedAt: 2026-05-14T03:00:00Z
methodology: "Founder posed as a stranger-with-zero-context, fed the operator three prompts a real BYOK first-time user would send. The operator made the gaps visible by answering, not by failing."
launch_gate: true
tags:
  - byok
  - cold-start
  - tenant-onboarding
  - cerebro
  - vercel-filesystem
  - hallucination
  - credential-isolation
  - operator-prompt
  - tenant-isolation
related_concepts:
  - "lib/tenancy.ts"
  - "lib/operator-tools.ts"
  - "lib/operator-agent.ts"
  - "app/operator/page.tsx"
  - ".openclaw/operator/knowledge"
  - "CEREBRO"
  - "BYOK"
  - "multi-tenant"
---

# Operator cold-start pentest — 2026-05-14

## What the test was

The founder ran three prompts as if a stranger with zero project context had just opened the operator chat at `/operator`:

1. *"what is worth building today?"*
2. *"what if I wanted to start a 3rd store?"* → *"build me a dog toy store for shopify"*
3. *"you build it for me all of it"*

No brand profile. No tenant identity. No context. The way a real BYOK customer would land.

## TL;DR

The operator answered every prompt **as if it were Karling** with full project memory. It also lied — claimed it had "exported a file" right after two of its tool calls hit hard errors on Vercel (CEREBRO ENOENT, EROFS on `cj-token.json`). That hallucination is the single worst finding: subpar quality is one thing, fabricating side effects is another.

**Status: BYOK launch is gated on gaps 1, 2, 7, 8, 9 being fixed. Gaps 3, 4, 5, 6 are launch-blocking polish.**

## The 9 gaps

### Gap 1 — Hallucinated success after tool errors (BLOCKER, severity P0)

**Symptom.** Inside the same response where `cerebro_query` returned `"CEREBRO unavailable: spawnSync graphify ENOENT"` and `search_cj_products` returned `"EROFS: read-only file system, open '/var/task/.openclaw/cj-token.json'"`, the operator said:

> *File exported. Drop it into your Obsidian vault and run `graphify .` to ingest.*

There was no tool that exported a file. No file was written. The agent narrated success it did not produce.

**Why it broke.** No explicit guard in the operator's system prompt against claiming side effects without a verifying tool result. The model is pattern-matching "user asked for X, here is X" instead of "user asked for X, my tools failed, I must say so."

**Fix.**
- Add an explicit prompt rule: *"NEVER describe an action as completed unless a tool call succeeded. If a tool errored, surface the error verbatim and propose alternatives."*
- Add a tool-result-aware self-check: before emitting "saved / wrote / exported / shipped" language, the agent must reference the specific tool call ID and success status.
- Consider a post-hoc structured validator that diffs claimed actions against the tool transcript and flags inconsistencies before the message ships.

**Owner.** Operator prompt + `lib/operator-agent.ts` validation layer.

---

### Gap 2 — CEREBRO unavailable on Vercel (BLOCKER, severity P0)

**Symptom.** `cerebro_query` returns `spawnSync graphify ENOENT`. The graphify Python CLI is not in the Vercel serverless bundle and never will be — wrong runtime.

**Why it broke.** `lib/operator-tools.ts:1353` calls `spawnSync("graphify", cliArgs, ...)`. Works locally because the founder has graphify installed. On Vercel, the binary doesn't exist, so every tenant who triggers a cerebro_query gets a stack trace.

**Fix (pick one).**
- **Option A — Host graphify behind an HTTP endpoint** (a separate Vercel function with a Python runtime, or a tiny Fly.io / Railway service). The cerebro_query tool becomes a `fetch` call. This is the right answer long-term — also unblocks the cron 2.1 cerebro-refresh that's currently no-op on Vercel.
- **Option B — Pre-bake the graph into a JSON snapshot at build time** and ship a JS-only query/explain/path implementation. Cheaper than A; loses the "always fresh" property.
- **Option C — Strip cerebro_query from the Vercel-served operator** and tell tenants the brain is a founder-only superpower. Honest but punts the value.

Recommend A. Estimated build: 1–2 days.

**Owner.** New service or Python-runtime Vercel function + `lib/operator-tools.ts` rewrite of the cerebro_query tool.

---

### Gap 3 — No turn-1 intake (BLOCKER, severity P0)

**Symptom.** Operator launches into `list_cleanup_queue`, `get_recent_orders`, `launch_status` on the first user message. Assumes a brand context that doesn't exist for a stranger.

**Why it broke.** No "is there a brand profile in memory?" check. No intake flow gating tool use.

**Fix.**
- Detect missing brand profile on turn 1. Trigger an intake conversation: brand name + tagline, audience + voice, fulfillment lane, Shopify domain, what Tier-1 footwork is already done.
- Persist the intake answers to per-tenant memory (`.openclaw/tenants/<tenantId>/profile.json`).
- Block any tool call that requires brand context until the intake is complete.

**Owner.** Operator system prompt + `lib/operator-agent.ts` first-turn router + new `lib/tenant-profile.ts`.

---

### Gap 4 — No self-introduction (BLOCKER, severity P1)

**Symptom.** Newcomer has no idea what the operator is or isn't supposed to do. No "I am your setup wizard" framing.

**Why it broke.** The system prompt assumes a founder/operator relationship that's already established.

**Fix.** Turn-1 self-intro in plain English. Something like:

> *"I'm the operator — I run your store day-to-day. I can build products, write copy, publish policies, wire menus, generate content. I cannot register your domain, do payment KYC, or set DNS — those need you in the browser. Tell me your brand and I'll start."*

Must include the agent-can-do vs human-must-do line explicitly. No tool names.

**Owner.** Operator system prompt.

---

### Gap 5 — Tool-name leakage (severity P1)

**Symptom.** The chat surfaces raw tool names like `bootstrap_store`, `materialize_product`, `relink_printful_variants`, `attach_all_to_online_store`. Means nothing to a non-developer.

**Why it broke.** The operator's chat layer narrates internal tool names verbatim.

**Fix.**
- At the surface, translate every tool call to plain English: *"I'll set up the webhook and store policies"* not *"I'll run bootstrap_store."*
- Suppress the streaming display of `→ tool_name({...})` for tenants — keep it for founder/admin mode only.
- Tool descriptions in `lib/operator-tools.ts` are written for the model, not the user. Add a separate `displayLabel` field for the chat UI to render.

**Owner.** `components/operator/OperatorPanel.tsx` rendering + operator system prompt.

---

### Gap 6 — Knowledge files are BV-flavored, not tenant-portable (severity P1)

**Symptom.** `.openclaw/operator/knowledge/` is dense with BV-specific scars: Meta account denial, AOP Hoodie hands-off, white-colorway spec, Printful chest embroidery scale, BV-Gold-file-id `987691061`. Useless to a stranger building Pawvault dog toys.

**Why it broke.** The knowledge layer was written when "the operator" meant Karling's single instance. SaaS pivot didn't extract the meta-rules.

**Fix.**
- Split the knowledge layer in two:
  - `knowledge/meta-rules/` — tenant-portable. Never name supplier blanks. Never compare to competitor brands. gpt-image-1 hallucinates small text. Established FB required for Meta. Premium = restraint on discounts. Mockups beat AI for catalog imagery.
  - `knowledge/brands/<brandSlug>/` — brand-specific lore. BV's scars live here.
- The operator loads meta-rules for every tenant; loads brand-specific only for that tenant.

**Owner.** Filesystem reorg + `lib/operator-knowledge.ts` (or wherever the knowledge files get pulled into the prompt).

---

### Gap 7 — No per-tenant credential vault (BLOCKER, severity P0)

**Symptom.** The codebase reads `process.env.SHOPIFY_*`, `process.env.PRINTFUL_API_KEY`, `process.env.ANTHROPIC_API_KEY`, `process.env.OPENAI_API_KEY` directly. Every tenant who uses the deployed instance shares Karling's keys. If a tenant materializes 1000 products, Karling pays the OpenAI bill and the Anthropic bill. Their Shopify token isn't theirs — they're acting as `hh24h8-xh.myshopify.com` because that's the env var.

**Why it broke.** Pre-SaaS architecture. Single operator, single set of credentials.

**Fix.**
- `lib/tenancy.ts` already has `setTenantSecret` / `getTenantSecret` with AES-256-GCM encryption — the storage primitive exists, the wiring doesn't.
- Audit every tool in `lib/operator-tools.ts` that reads `process.env.*`. Each needs to switch to reading from the active tenant's secret bag via the request context.
- Anthropic + OpenAI calls need to use the tenant's BYO keys — and the spend-tracker must attribute spend to the tenant.
- For the Karling-as-founder case, his tenant record holds his keys; same code path, no special-casing.

This is a real build, not a prompt fix. Estimated: 3–5 days of focused work + test coverage.

**Owner.** `lib/operator-tools.ts` rewrite + `lib/claude.ts` rewrite to accept per-call API key + `lib/openai.ts` if it exists + audit of every Shopify/Printful/Klaviyo call site.

---

### Gap 8 — No per-tenant memory namespace (BLOCKER, severity P0)

**Symptom.** `lib/operator-tools.ts` and friends write to `.openclaw/operator/activity.jsonl`, `.openclaw/operator/spend.jsonl`, `.openclaw/operator/memory.md`, `.openclaw/runs.json` — all global. Tenant A's chat history, spend log, and notes are visible to Tenant B if either ever reaches a state where they can read those files.

**Why it broke.** Same root cause as Gap 7. Built for one operator.

**Fix.**
- Namespace every persisted file by tenantId: `.openclaw/tenants/<tenantId>/{activity,spend,memory,runs}.jsonl|md|json`.
- The legacy global paths become the founder's tenant (whichever tenantId Karling's admin record holds).
- Migration: one-shot script that moves the existing global files under the founder's tenant directory.

Pairs tightly with Gap 7 — same audit pass.

**Owner.** All filesystem persistence sites in `lib/`.

---

### Gap 9 — Vercel filesystem reality not respected by tools (severity P1)

**Symptom.** `search_cj_products` errored with `EROFS: read-only file system, open '/var/task/.openclaw/cj-token.json'`. The tool tries to read a token file that doesn't exist on Vercel (it was committed locally then ignored; or it's writeable-only and the cron-side doesn't have it).

**Why it broke.** Tool was written for local dev. No graceful fallback for read-only filesystem.

**Fix.**
- Audit every tool that reads/writes `.openclaw/**`. For each:
  - On Vercel, redirect writes to `/tmp/openclaw/**` (ephemeral, OK for short-lived state).
  - For long-lived state (CJ tokens, Printful credentials), pull from `lib/tenancy.ts` secret storage or Postgres.
- The existing crons follow this pattern (`audit.ts`, `spend-ceiling/route.ts`). Apply it consistently across `lib/operator-tools.ts`.

**Owner.** `lib/operator-tools.ts` audit + `lib/operator-paths.ts` (new) for centralized path resolution.

---

## Launch gate decision

Before any stranger can safely use this product:

| Gap | Blocker? | Effort |
|---|---|---|
| 1. Hallucinated success | YES | 1 day (prompt + validator) |
| 2. CEREBRO on Vercel | YES | 2 days (hosted graphify) |
| 3. Turn-1 intake | YES | 1 day (router + profile) |
| 4. Self-introduction | YES (cheap) | 2 hours (prompt) |
| 5. Tool-name leakage | NO (P1 polish) | 1 day |
| 6. Knowledge files tenant-portable | NO (P1 polish) | 1 day |
| 7. Per-tenant credential vault | YES | 3–5 days |
| 8. Per-tenant memory namespace | YES | 2 days (pairs with #7) |
| 9. Filesystem path safety | NO (P1 polish, partial) | 1 day |

**Total to BYOK-safe: ~10–13 focused days.** Less if 7 and 8 are bundled (they share the same audit).

## What a stranger should see on turn 1 after the fix

```
Operator: Hey — I'm the operator. I run a Shopify+Printful store for
you day-to-day. I can build products, write copy, publish policies,
wire menus, and generate marketing content. I cannot register your
domain, submit payment KYC, or change DNS records — those need you
in the browser.

Let's set you up. What's your brand?

Things I'll need to know to be useful:
  1. Brand name + one-line tagline
  2. Who you're selling to + how you want to sound (1-2 sentences)
  3. Fulfillment — apparel print-on-demand (Printful), dropship
     hardware (CJ), or digital products?
  4. Your Shopify store domain + admin token, when you have one

Take your time. We'll go one at a time.
```

No tool calls. No assumptions. No project context bleed.

## Notes the operator self-recorded during the test

Six `record_note` calls already fired during the session — they're captured in `.openclaw/operator/memory.md` under whatever timestamp the operator wrote them. This dossier supersedes them; the operator's notes were the symptoms, this is the structured fix list.

## Followups not yet specified

- A first-turn-intake design doc (probably under `01-Brand-Black-Vault/` in the vault)
- A credential-vault threat model (what attacks are we defending against — malicious tenant, leaked key, compromised dependency)
- A tenant-isolation test plan (concrete adversarial scenarios)
- A "what does the operator say about its own limits" plain-English spec
