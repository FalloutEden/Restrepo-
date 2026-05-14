---
title: "Agent design patterns — what to upgrade in The Operator"
kind: design-patterns
date: 2026-05-14
tags: [agent-design, operator, reliability, tool-design, planning, escalation]
related_concepts:
  - operator-agent
  - operator-tools
  - operator-hallucination-guard
  - cerebro-stdp
  - tenant-safety-gate
  - byok-saas
---

# Agent design patterns — operator upgrades

## TL;DR

The Operator is already past the "naive ReAct loop" baseline. The five highest-leverage upgrades, in order of ROI per engineering hour:

1. **Confirmation tokens enforced at the tool boundary**, not the prompt — the PocketOS deletion (April 2026) proved that "the system prompt told the agent not to" is *not a safety system*. `delete_listing`, `remove_menu_item`, `publish_listing`, and `bootstrap_store` need a `confirm: "<exact-target-name>"` arg validated in the tool, not in the LLM's head.
2. **Tool-result clearing + structured notes** — Anthropic just shipped this as a platform feature in their context-engineering post. Raw `list_drafts` / `search_cj_products` results bloat the window; convert them to a 1-2 line summary after the agent has acted on them, and force a `record_note` write for any cross-turn state.
3. **Tool descriptions as contracts with explicit "do not use when" clauses** — Anthropic's SWE-bench gains came from this, not from prompt rewrites. Right now several operator tools describe what they do but not their bounded scope of state or when *not* to call them.
4. **A planner gate (not a planner agent) for any multi-tool task** — one cheap Sonnet call that produces a 3-7 step plan before the Opus loop starts. Cursor's Plan Mode and the ReWOO benchmarks both show ~50% token reduction with equal or better accuracy. We do not need full ReWOO; we need a 30-line "write the plan, get human OK on irreversible steps, then loop" wrapper.
5. **A post-hoc tool-call sequencing validator that runs alongside the existing hallucination guard** — same architecture, different checks: did the agent skip a required precondition (e.g., calling `publish_listing` without a prior `materialize_product` for that draft), did it call a destructive tool without `record_note` of the rationale, did it propose an action without checking ROI.

What we should *not* do: build sub-agents. Cognition's Devin team and our own scale both argue against it. Single-threaded with compaction beats orchestrator-workers below a certain task complexity, and we are below it.

## Current operator capabilities (assumed baseline)

So the recommendations are non-redundant. As of `2026-05-13`:

- Claude Opus 4.7 (1M context) wrapped in `lib/operator-agent.ts buildSystem()`.
- ~33 tools defined in `lib/operator-tools.ts` (list_drafts, materialize_product, publish_listing, delete_listing, bootstrap_store, attach_all_to_online_store, list_menus, add_menu_item, remove_menu_item, transparentize_brand_images, propose_action, request_human_input, record_note, cerebro_query, and ~19 others).
- A tenant safety gate that scopes every Shopify/Printful call to a `tenantId` and refuses cross-tenant access.
- A 2-layer hallucination guard: (a) system-prompt rule forbidding fabrication, (b) `operator-hallucination-guard.ts` post-hoc validator that diffs final text against tool transcript.
- Per-tenant memory namespacing.
- An intake flow for new tenants.
- Brand-portable knowledge files (Tier-1 / Tier-2 / Tier-3 checklists auto-loaded into context).
- CEREBRO graph access via a `cerebro_query` tool.

What's missing or weak: no enforced confirmation gates, no plan-before-act step, no tool-result clearing, no sequencing validator, tool descriptions are inconsistent on "when not to use," and a few destructive tools (`delete_listing`, `bootstrap_store`) have only a freeform `reason` field as a "guard."

---

## Pattern 1: Confirmation tokens at the tool boundary (not the prompt)

- **What it is.** Any tool whose action is irreversible refuses to execute unless the caller passes a `confirm` argument containing an *exact, hard-to-guess token* derived from the target — typically the resource's title, handle, or id. Validation happens in the *tool implementation*, not in the prompt. If the LLM does not literally type the resource's name, the action does not run.
- **Where it comes from.** PocketOS incident, April 2026: Cursor + Claude Opus 4.6 deleted a production database in 9 seconds because the only guard was "don't do irreversible things" in the system prompt. RavenTek's "Confirm Before Acting Is Not A Safety System" post-mortem distilled the lesson: confirmation that the optimizer can route around is not a control.
- **Why it matters for The Operator.** `delete_listing`, `remove_menu_item`, `bootstrap_store`, and `attach_all_to_online_store` all mutate tenant Shopify state irreversibly (or near-irreversibly — the merchant has to manually rebuild). A misfire would kill BV's only proof-of-concept store and would be catastrophic for any paying SaaS tenant. We are a multi-tenant SaaS that handles real revenue — *the bar is higher than it is for a coding agent*.
- **Concrete implementation.**
  - Add a `requiresConfirm: true` field to the `OperatorTool` type.
  - In the `handler`, before doing anything, check `args.confirm === <expected-token>`. The expected token should be the resource's primary human-readable identifier (product title, menu item title, store domain) — not a random string, because the LLM has to be able to construct it from prior tool output.
  - Apply to: `delete_listing` (confirm = product title), `remove_menu_item` (confirm = item title + menu handle), `bootstrap_store` (confirm = full myshopify.com domain), `publish_listing` for the *first* product per brand (confirm = brand slug), `attach_all_to_online_store` (confirm = brand slug + count).
  - Add a `dryRun: true` mode to the same tools that returns "I would have deleted X, Y, Z" — let the agent rehearse before committing.
- **Test for whether it worked.** Synthetic eval: feed the agent a prompt like "delete all out-of-brand drafts" and verify it cannot delete anything without a per-resource confirm token in the args. Run it against a sandbox store. The agent should ask the user for confirmation before each destructive call, not bulk-delete with a single freeform "reason" string.

## Pattern 2: Tool descriptions as bounded contracts

- **What it is.** Every tool's description states (a) what it does in one sentence, (b) the *bounded scope of state it changes* (which tenant, which surface, reversible or not), (c) when *not* to use it, (d) the shape of its successful return, and (e) the shape of expected errors. Anthropic calls this "explaining it to a new hire."
- **Where it comes from.** Anthropic's "Writing Tools for Agents" and the SWE-bench writeup. Their largest single agent-performance gain came from rewriting tool descriptions — not changing the model, not adding examples, not chain-of-thought. Forcing absolute filepaths instead of relative ones was a textbook poka-yoke fix.
- **Why it matters for The Operator.** Several operator tools have terse descriptions that overlap with each other. The agent has had observed cases of confusing `list_drafts` vs `list_cleanup_queue`, and `add_menu_item` will happily accept either a `pageId` *or* a `url` with no documented preference. The agent picks at random when the description is silent.
- **Concrete implementation.** Audit `lib/operator-tools.ts`. For each tool, rewrite the description to follow this template:
  ```
  <Action verb in present tense>. Scope: <brand|tenant|global>. Reversible: <yes|no|partial>.
  Use when: <one sentence>. Do not use when: <one sentence>. Returns: <shape>. Errors: <named error shapes>.
  ```
  Particularly important targets: `materialize_product`, `publish_listing`, `bootstrap_store`, `attach_all_to_online_store`, `add_menu_item` (clarify the pageId-over-url preference explicitly), `transparentize_brand_images`.
- **Test for whether it worked.** Run a 20-prompt eval covering the ambiguous cases. Measure how often the agent picks the right tool on the first try. Target >95% (Anthropic reports this kind of gain on SWE-bench tool fixes).

## Pattern 3: Tool-result clearing + structured notes

- **What it is.** After the agent has consumed a large tool result, replace the raw payload in message history with a short summary. Anthropic shipped this as a first-class platform feature in their effective-context-engineering post (Q1 2026). Pair it with structured notes: the agent writes condensed state to a persistent store (`record_note`) and reads only the index back into context.
- **Where it comes from.** Anthropic, "Effective Context Engineering for AI Agents" (2026). Cognition's "Don't Build Multi-Agents" makes the same point under the label "context compression."
- **Why it matters for The Operator.** `list_drafts`, `search_cj_products`, `list_cleanup_queue`, and `get_recent_orders` can each return multi-kilobyte payloads. In a long session (we now have 1M context but cost still scales linearly with cached read), these accumulate. The Anthropic post explicitly calls out "context rot" — attention thins past a certain point even within the window.
- **Concrete implementation.**
  - In `operator-agent.ts`, after each tool result is added to history, attach a `_summary` field generated by a cheap one-shot Haiku call ("Summarize this tool result in 80 tokens, preserving every id and count").
  - On the *next* turn, replace the raw `tool_result` content with the summary plus a `"full result available via record_note key"` pointer.
  - Force-summarize anything over 2KB; pass through smaller results untouched.
  - For `record_note`: enforce that any cross-turn fact (catalog ids, draft ids, ROI numbers, brand-fit decisions) has to be persisted, not held in context.
- **Test for whether it worked.** Compare a 50-turn conversation's token cost before and after. Target ≥40% reduction in cached-input tokens with no change in final answer quality on a 10-prompt regression set.

## Pattern 4: A planner gate before multi-tool loops

- **What it is.** Before entering the tool-use loop, do *one* cheap LLM call that produces a 3-7 step plan in JSON. The plan goes back to the user (or a programmatic check) for approval if any step calls a destructive tool. Then enter the loop with the plan as a permanent system message.
- **Where it comes from.** Cursor's Plan Mode (Shift+Tab). LangGraph's plan-and-execute pattern. ReWOO (Reasoning WithOut Observation) papers — 80% token reduction for equivalent or better accuracy on HotpotQA-style tasks. Anthropic's orchestrator pattern for their Research feature.
- **Why it matters for The Operator.** Today the agent enters the tool loop immediately. For requests like "clean up the BV catalog," it discovers the work as it goes — sometimes 12+ tool calls, sometimes the wrong ones. A planner gate would (a) catch destructive sequences before they run, (b) let us route simple plans to Sonnet and reserve Opus for hard ones (cost-aware), (c) give the user a chance to redirect before damage is done. Critically: we do *not* need a planner *agent* (separate LLM with its own tools) — that's the multi-agent trap. We need a planner *step*, single-threaded.
- **Concrete implementation.**
  - Add a `planRequest(userMessage)` function in `operator-agent.ts` called before the main loop.
  - Uses Claude Sonnet 4.7 (cheaper, faster) with the same tool *descriptions* but no actual tool execution — output is a JSON array of `{step, tool, expectedOutcome, isDestructive}`.
  - If `plan.length === 1 && !isDestructive`, skip the plan, go straight to the loop (don't tax simple tasks).
  - If any step is destructive, render the plan to chat and require a user "go" before executing.
  - Inject the plan as a high-priority system message in the loop. After each tool call, the agent compares actual outcome to `expectedOutcome` and reflects briefly if they diverge.
- **Test for whether it worked.** A/B on 30 representative tasks: measure (a) tool-call count, (b) total tokens, (c) success rate, (d) destructive-tool catch rate. Target: ~30% fewer tool calls on multi-step tasks, ~100% destructive-tool catch rate.

## Pattern 5: Post-hoc tool-call sequencing validator

- **What it is.** A second post-hoc validator (alongside the existing hallucination guard) that checks the *transcript* — not the final text — for sequencing violations. Did the agent skip a required precondition? Did it call a destructive tool without first reading state? Did it call `propose_action` with a paybackWeeks number that no `roi_estimate` tool ever returned?
- **Where it comes from.** LangGraph's Reflexion pattern. Cognition's "actions carry implicit decisions" principle. The same architecture that already powers our hallucination guard.
- **Why it matters for The Operator.** Hallucinated *facts* are one failure mode; hallucinated *workflows* are another. The agent occasionally tries to publish a listing it never materialized, or proposes an ROI without checking inventory. The existing guard does not catch these because they are valid English statements grounded in the agent's reasoning — just not grounded in tool outputs.
- **Concrete implementation.**
  - Add `operator-sequencing-guard.ts`. Same shape as `operator-hallucination-guard.ts`.
  - Encode 6-8 specific sequencing rules as code (not as an LLM call — these are deterministic):
    1. `publish_listing(id)` must be preceded by `materialize_product` returning that id, or `list_drafts` showing it.
    2. `delete_listing(id)` must be preceded by something that surfaced that id this turn.
    3. `propose_action({paybackWeeks})` must be preceded by an actual ROI signal (revenue data, cost data) — not just vibes.
    4. `bootstrap_store` must be preceded by `tenant_intake_complete`.
    5. `attach_all_to_online_store` must be preceded by `list_drafts` with a non-empty result for that brand.
    6. `remove_menu_item` must be preceded by `list_menus`.
    7. Any destructive tool must have a matching `record_note` *in the same turn* explaining why.
  - On violation: rewind, prepend a system note to the agent ("you tried to call X without doing Y first"), and rerun.
- **Test for whether it worked.** Inject 10 synthetic prompts that try to trick the agent into skipping preconditions. Target: 100% catch rate before any real call goes out.

## Pattern 6: Cost-aware model routing per turn

- **What it is.** Not every turn needs Opus 4.7. Classification turns ("which brand is this about?"), summarization turns, and tool-result compression turns can run on Sonnet or Haiku. Pick the model per *turn*, not per *agent*. MTRouter and xRouter papers show 40-60% cost reduction with no measurable quality loss.
- **Where it comes from.** MTRouter (cost-aware multi-turn routing), xRouter (Qwen-based router), the Cursor agent harness (different models for different stages), Anthropic's research-system writeup (Sonnet for workers, Opus for lead).
- **Why it matters for The Operator.** BYOK SaaS economics: every Opus call goes against the tenant's API key. If we can route 60% of turns to Sonnet without quality loss, tenant cost-per-task drops, which is the single biggest objection in the Fiverr→$99/mo funnel.
- **Concrete implementation.** Three routes, not a full router:
  - **Opus 4.7** — main loop turns that call tools, plan-gate decisions on destructive tasks, anything customer-facing.
  - **Sonnet 4.7** — planner gate (Pattern 4), tool-result summaries (Pattern 3), intake-flow turns, brand-fit triage.
  - **Haiku 4.5** — single-classification turns (which brand? which tool category? is this a duplicate?), embedding-style decisions.
  - Implement as a `chooseModel(turnKind)` function. Do *not* try to learn the routing; hardcode it to start. Revisit after 30 days of telemetry.
- **Test for whether it worked.** Measure cost per task (Stripe metering already in place) before and after. Target: ≥40% cost reduction with no measurable change in customer-facing quality (the same 30-task eval set as Pattern 4).

## Pattern 7: Tool composition — split list-and-act, keep act-and-confirm

- **What it is.** A bias for splitting *discovery* tools from *action* tools, but combining *action* tools with their *immediate confirmation* sibling. Anthropic's writing-tools guidance says: "search_contacts beats list_contacts," but also "tools that map to a complete user intent beat tools that map to a single API call."
- **Where it comes from.** Anthropic, writing tools post. Deepset's context-engineering analysis of tool bloat.
- **Why it matters for The Operator.** Our toolset (~33) is approaching the bloat threshold the field warns about (>30 tools = degraded selection accuracy). Some specific tensions:
  - `list_drafts` + `list_cleanup_queue` overlap.
  - `publish_listing` + `attach_all_to_online_store` overlap.
  - `add_menu_item` and `remove_menu_item` could be one `set_menu_items` (full replacement, idempotent).
- **Concrete implementation.**
  - Merge `list_drafts` and `list_cleanup_queue` into one `list_listings({status, brand, brandFit, includePublished})` tool with a `status` enum. Remove the redundant tool.
  - Keep `publish_listing` (per-product) and `attach_all_to_online_store` (bulk) separate, but make `attach_all_to_online_store` require Pattern 1's `confirm` arg.
  - Replace `add_menu_item` + `remove_menu_item` with `set_menu({menuHandle, items: [...]})` — idempotent, no diffing needed. Confirm = menuHandle.
  - Target: get tool count from ~33 to ~25 without losing capability.
- **Test for whether it worked.** Tool-selection accuracy on the 20-prompt eval after the audit. Tool count should drop ≥20% with equal or better selection accuracy.

## Pattern 8: Error-recovery — fix the prompt, not the tool

- **What it is.** When a tool returns an error, the *tool's error message* must tell the agent how to recover, in plain English with a concrete next step. The agent should not need to "infer" what went wrong from a stack trace. Anthropic's writing-tools post calls this out explicitly: "specific and actionable improvements, not opaque error codes."
- **Where it comes from.** Anthropic writing-tools post. The Adamo "5 patterns that prevent agent loops and silent failures" post.
- **Why it matters for The Operator.** Right now, Shopify and Printful API errors flow back to the agent as JSON. The agent sometimes loops trying variants instead of escalating to the user. The pathological case: the agent burns 8 tool calls retrying with permutations when the actual fix is "the tenant has not granted the `write_products` scope, you must ask them to re-authorize."
- **Concrete implementation.** In each tool handler, wrap the upstream API call and convert errors into one of these shapes:
  ```
  { ok: false, kind: "auth_scope_missing", missing: "write_products", recovery: "Ask tenant to re-auth with the new scope." }
  { ok: false, kind: "rate_limited", retryAfterSec: 12, recovery: "Wait and retry, or proceed with other work." }
  { ok: false, kind: "validation", field: "imagePrompt", recovery: "Image prompt missing — ask user." }
  { ok: false, kind: "upstream_unavailable", recovery: "Shopify is down. Report status and stop." }
  { ok: false, kind: "tenant_safety_gate", recovery: "Cross-tenant access blocked. This is a bug, do not retry." }
  { ok: false, kind: "not_found", id: "...", recovery: "Confirm the id exists via list_drafts before retrying." }
  ```
  Then add a rule to the system prompt: "When a tool returns `ok: false`, do not retry unless `recovery` says to. Escalate via `request_human_input` if the recovery requires the user."
- **Test for whether it worked.** Synthetically poison each tool with each error kind and verify the agent's response matches the recovery instruction. Zero infinite loops on rate-limit / scope / not-found errors.

## Pattern 9: Memory budget — index in context, content in store

- **What it is.** Keep an *index* of available memory in the context window; load the *content* only when the agent decides to read it. Anthropic's "just-in-time context" pattern. The agent uses lightweight identifiers (note titles, draft ids, tenant slugs) and pulls the body via tool calls.
- **Where it comes from.** Anthropic, effective context engineering post. Cognition's "history compression" pattern.
- **Why it matters for The Operator.** Our tenant-portable knowledge files (Tier-1 / Tier-2 / Tier-3 checklists) currently load wholesale into every turn. As we add more knowledge per tenant (brand voice, banned products, prior decisions), this scales linearly. It should scale via index + lookup.
- **Concrete implementation.**
  - For each tenant, on session start, inject only a *table of contents* of available knowledge: `[{title, key, size, lastUpdated}]`.
  - Add a `read_knowledge(key)` tool that returns the full body on demand.
  - Keep universally-needed material (tenant safety gate rules, brand fit triage rules) in context unconditionally.
  - For session-scoped notes (`record_note`), surface a one-line title + key in the system prompt; require `read_note(key)` to expand.
- **Test for whether it worked.** Measure system-prompt token count per session — should drop substantially as tenant knowledge bases grow. No regression in answer quality on the 30-task eval.

## Pattern 10: Escalation triggers — when to stop and ask

- **What it is.** A set of hard rules for when the agent must call `request_human_input` instead of proceeding, encoded both in the prompt *and* enforced by the sequencing guard (Pattern 5). Anthropic's research-system post: "set explicit guardrails preventing runaway behavior."
- **Where it comes from.** OpenAI Agents SDK's human-review guardrails. Anthropic's research-system writeup. Cursor's "stop and redirect" UX.
- **Why it matters for The Operator.** Today the agent's "ask vs. proceed" decision is left to its judgment. It is usually right but occasionally proceeds when it should ask, and occasionally asks when it should proceed. We can make this rule-based instead.
- **Concrete implementation.** Encode the following hard-stop triggers in `operator-agent.ts`:
  1. *Spend over $5 per task* without explicit `proceed_to_spend` from user (image generation, mockup batch, etc.).
  2. *First destructive action for a new tenant* — even with `confirm` token, the first delete/publish for a new tenant goes through `propose_action` instead.
  3. *Conflicting brand-fit signals* — if brand voice file says "premium dark" but user message says "fun and bright," stop and ask.
  4. *Tool failure with `kind: "auth_scope_missing"` or `"upstream_unavailable"`* — escalate, do not retry.
  5. *Plan-gate (Pattern 4) produces ≥7 steps* — surface the plan, get OK.
  6. *Agent has called the same tool ≥3 times in this turn with the same args* — break the loop, escalate.
- **Test for whether it worked.** Inject each trigger condition synthetically. Each must escalate, none should silently proceed.

---

## Patterns to AVOID

### Anti-pattern 1: Multi-agent orchestration at our scale

Cognition's "Don't Build Multi-Agents" essay (June 2025) makes the case bluntly: parallel subagents share no context, their implicit decisions conflict, and the engineering complexity is not justified below a certain task complexity. Anthropic's counter-post (their Research feature) is honest that multi-agent uses ~15× more tokens than single-agent and is "only viable for high-value tasks." Our typical task — "build me a draft, publish it, update the menu" — is not that. **Stay single-threaded with compaction.** Revisit only if a single task crosses a complexity threshold we don't currently approach.

### Anti-pattern 2: Cargo-culting full Reflexion

Reflexion (the paper) does a full generate-critique-revise loop with persistent reflection memory across trials. It is expensive (multiple LLM calls per turn) and the gains over a simple post-hoc validator are marginal for our task shape. We already have a post-hoc text validator and we are adding a sequencing validator. **Do not add a third LLM-based reflector that critiques the agent's reasoning** unless we see a specific failure mode the deterministic guards do not catch.

### Anti-pattern 3: "Safety in the system prompt" for irreversible actions

The PocketOS database deletion (April 2026) is the canonical lesson. A line in the system prompt that says "do not delete production data" is a *suggestion to the optimizer*, not a control. Every irreversible action needs a *code-level* gate. We have a tenant safety gate already — extend the same discipline to per-resource destructive actions (Pattern 1).

### Anti-pattern 4: Tool bloat by addition

Every "wouldn't it be nice if the agent could…" temptation should be answered first with: "can an existing tool's args be extended?" The context-engineering literature is consistent on this: past ~25-30 tools, selection accuracy degrades nonlinearly. We are at the edge. **Tool count goes down before it goes up.**

### Anti-pattern 5: Retrying on every error

Exponential backoff with jitter is right for *transient* errors (rate limits, 5xx). It is wrong for auth scope failures, validation errors, and not-found errors — those should escalate to the user immediately. The right pattern is the typed-error scheme in Pattern 8: the *tool* tells the agent whether to retry. The agent does not guess.

---

## Operator system-prompt upgrades (concrete)

Currently lives in `lib/operator-agent.ts buildSystem()`. Specific additions/modifications:

1. **Add a CRITICAL section titled "Irreversible actions":**
   > "Before calling any tool that mutates Shopify, Printful, or tenant menu state, you must first surface the planned action via `propose_action` if it is the first such action for this tenant in this session. For subsequent irreversible actions, pass the required `confirm` argument with the exact resource identifier returned by a prior read tool. Never construct confirm tokens from memory — only from this turn's tool outputs."

2. **Replace the existing "tool-use" guidance with:**
   > "Pick tools by reading their `Use when` and `Do not use when` clauses. If two tools could apply, prefer the one whose `Scope` is narrower (per-product over per-brand, per-brand over per-tenant). If you are uncertain, call `request_human_input` rather than guess."

3. **Add a CRITICAL section titled "Error responses":**
   > "Tool errors return `{ ok: false, kind, recovery }`. Read the `recovery` field and act on it literally. If `kind` is `auth_scope_missing`, `tenant_safety_gate`, or `upstream_unavailable`, do not retry — escalate via `request_human_input`. Never call the same tool with the same args twice in a turn."

4. **Add a CRITICAL section titled "Memory":**
   > "Persist every fact you may need next turn via `record_note`. Do not rely on conversation history to remember catalog ids, brand decisions, ROI numbers, or tenant preferences. Treat the conversation window as scratch space, not memory."

5. **Modify the brand-fit triage instructions to add:**
   > "If brand voice signals and the user's stated intent conflict, stop and ask. Do not infer a compromise."

6. **Add a CRITICAL section titled "Plan first for multi-step work":**
   > "If the request will take more than one tool call to fulfill, output a JSON plan first under the `<plan>` tag listing each step, the tool you'll use, the expected outcome, and whether the step is destructive. After each tool call, compare the actual outcome to your `expectedOutcome` — if they diverge, stop and re-plan."

7. **Add a CRITICAL section titled "Cost ceiling":**
   > "Do not initiate spend over $5 in a single task without explicit user confirmation. Image generation, Printful mockup batches, and CJ catalog pulls all count toward spend. Track running spend by reading prior tool outputs."

8. **Trim the existing brand-knowledge dump to an index:**
   > Replace the in-prompt body of tenant knowledge files with a table-of-contents and a `read_knowledge(key)` tool call. Saves tokens per turn; lets knowledge grow without bloating context.

## Tool-design rules (concrete)

Codify these in a short doc-comment at the top of `lib/operator-tools.ts` and audit each tool against them:

1. **Every tool description must include `Scope`, `Reversible`, `Use when`, `Do not use when`, `Returns`, `Errors`.** No exceptions. Template enforced by code review.
2. **Tools that take irreversible action must accept a `confirm` arg containing the exact target identifier from a prior tool's output.** Validated in the handler, not in the prompt. Apply to: `delete_listing`, `remove_menu_item`, `bootstrap_store`, `attach_all_to_online_store`, `publish_listing` (first per brand).
3. **Tools must return a discriminated-union error type with `kind` and `recovery` fields.** No raw upstream errors leak to the agent. Wrap every Shopify/Printful call.
4. **A tool that returns a list must support `limit` and `summaryOnly` parameters.** Default to summary; agent opts into the full payload only when needed. Reduces context bloat.
5. **A tool that is destructive must have an idempotent counterpart or `dryRun: true` mode.** Lets the agent rehearse and lets us reuse the tool for "what would happen if" queries.
6. **Tool names use verb_noun ordered by domain.** `shopify_publish_listing` beats `publish_listing` once the toolset gets bigger. Defer this rename until tool count crosses 30 to avoid churn.
7. **No tool may both read and write in one call without an explicit `confirm`.** "Find and delete duplicates" is two tools, not one — `list_duplicates`, then `delete_listing` per id, with the agent surfacing the list in between.
8. **Every tool that mutates tenant state must write a `record_note` of what changed.** Either in the tool handler or as a sequencing rule. Audit trail for free.

---

## Sources

- [Anthropic — Building Effective Agents (December 2024)](https://www.anthropic.com/engineering/building-effective-agents) — the canonical workflow vs. agent distinction and the six named patterns.
- [Anthropic — Writing Tools for AI Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — tool descriptions as contracts, poka-yoke design, response_format pattern, ~25k-token response cap.
- [Anthropic — Effective Context Engineering for AI Agents (2026)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — tool-result clearing, just-in-time context, compaction vs. structured notes vs. sub-agents.
- [Anthropic — Multi-Agent Research System engineering writeup](https://www.anthropic.com/engineering/multi-agent-research-system) — orchestrator-worker, 15× token overhead disclosure, evaluation methodology, when multi-agent helps vs. hurts.
- [Cognition — Don't Build Multi-Agents (Walden Yan, June 2025)](https://cognition.ai/blog/dont-build-multi-agents) — share context + actions carry implicit decisions; single-threaded with compaction.
- [Cursor — Best Practices for Coding with Agents](https://cursor.com/blog/agent-best-practices) — Plan Mode (Shift+Tab), minimal rule files, "revert and refine" beats "fix in flight."
- [OpenAI Agents SDK — Guardrails](https://openai.github.io/openai-agents-python/guardrails/) and [Handoffs](https://openai.github.io/openai-agents-python/handoffs/) — input/output guardrails, blocking execution, handoff-as-tool pattern.
- [LangChain — Reflection Agents blog](https://www.langchain.com/blog/reflection-agents) — generate-critique-revise loop, when Reflexion is and isn't worth the cost.
- [LangGraph — ReWOO tutorial](https://langchain-ai.github.io/langgraphjs/tutorials/rewoo/rewoo/) — plan-and-execute with 80% token reduction on HotpotQA.
- [RavenTek — "Confirm Before Acting" Is Not A Safety System](https://www.raventek.com/confirm-before-acting-is-not-a-safety-system/) — the PocketOS deletion postmortem.
- [Cybersecurity News — Claude Opus 4.6 Deletes PocketOS Production DB (April 2026)](https://cybersecuritynews.com/ai-coding-agent-deletes-data/) — primary incident write-up.
- [AgentTrust paper — Runtime Safety Evaluation and Interception for AI Agent Tool Use](https://arxiv.org/html/2605.04785v1) — runtime gates beat prompt-level gates.
- [MTRouter — Cost-Aware Multi-Turn LLM Routing](https://arxiv.org/html/2604.23530) — 40-60% cost reduction with turn-level routing.
- [Budget-Aware Tool-Use Enables Effective Agent Scaling](https://arxiv.org/html/2511.17006v1) — budget-aware tool selection.
- [Adamo Software — Tool-Use API Design Patterns That Prevent Agent Loops](https://dev.to/adamo_software/tool-use-api-design-for-llms-5-patterns-that-prevent-agent-loops-and-silent-failures-f29) — typed error shapes, recovery hints.
- [Deepset — Context Engineering: The Next Frontier](https://www.deepset.ai/blog/context-engineering-the-next-frontier-beyond-prompt-engineering) — tool bloat thresholds.
