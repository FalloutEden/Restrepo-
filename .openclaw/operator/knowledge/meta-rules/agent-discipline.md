# Agent discipline — operator-side patterns

Distilled from current best practice across Anthropic (Building Effective
Agents, Writing Tools for AI Agents, Context Engineering), Cognition (Don't
Build Multi-Agents), Cursor (Plan Mode, agent rules), OpenAI Agents SDK
(guardrails, handoffs), the PocketOS deletion postmortem, and the
AgentTrust runtime-safety paper.

Full research + 10 named patterns + 5 anti-patterns + 20 code-level
changes: `.openclaw/research/agent-design-patterns-2026-05-14.md`.

## Rule 1 — Plan first for any multi-step work

If a request requires more than one tool call, output a `<plan>` block
first listing each step, the tool, the expected outcome, and whether
the step is destructive.

After each tool call: compare the actual outcome to your stated
`expectedOutcome`. If they diverge, STOP and re-plan. Do not push
through.

This is the single largest reliability win at our scale per Cognition's
analysis. Cheap to implement, hard to violate accidentally.

## Rule 2 — Confirm tokens come from THIS turn's tool outputs only

For irreversible tools (publish, delete, bootstrap, attach-all,
remove-menu-item), the `confirm` argument must be the exact resource
identifier echoed by a prior read tool in the SAME turn.

Memory-constructed confirm tokens are forbidden — even if the
identifier is "obviously correct." The PocketOS production database
got deleted because the agent reconstructed a project name from chat
context that pointed at the wrong project. Tokens that aren't from
this turn's tool results don't count.

## Rule 3 — Read tool error shapes literally

Tool errors return `{ ok: false, kind, recovery }`. Read the `recovery`
field. Act on it literally.

If `kind` is `auth_scope_missing`, `tenant_safety_gate`, or
`upstream_unavailable`: do NOT retry. Escalate via `request_human_input`.

Never call the same tool with the same args twice in a turn. If the
first call failed, the second will too — the agent's job is to
escalate or pivot, not to thrash.

## Rule 4 — Persist facts to memory; treat conversation window as scratch

Anything you may need next turn (catalog ids, brand decisions, ROI
numbers, tenant preferences, confirmed/rejected paths): call
`record_note` immediately.

Do NOT rely on conversation history. The window will compact, the
session may drop, the next operator session starts blank. Persistent
memory survives those events; conversation context does not.

## Rule 5 — Pick narrowest-scope tool that fits

When two tools could apply, prefer the one with narrower `Scope`:
per-product over per-brand, per-brand over per-tenant. If uncertain
between two tools: do not guess. Call `request_human_input` and
describe the choice.

This is the cheap version of avoiding "tools that bundle multiple
behaviors then surprise the agent" — a documented agent-design
anti-pattern.

## Rule 6 — Cost ceiling: $5 per task without explicit user confirmation

Do not initiate spend over $5 in a single task without surfacing the
expected cost first via chat AND getting an explicit "yes."

Image generation, Printful mockup batches, CJ catalog pulls, and any
content_studio drop count toward spend. Track running spend by reading
prior tool outputs (every spend-tracked call returns a `costUsd` field).

If a single tool call would exceed $5: refuse the call, propose the
budget via `propose_action`, wait for approval.

## Rule 7 — Brand voice and stated intent conflict → STOP and ask

If the brand profile says "premium-restrained, no discounts" and the
tenant says "make a 50% off banner": do not infer a compromise. Stop.
Surface the conflict explicitly: "Your brand voice rules out discounts.
Do you want to override the brand rules just this once, or pick a
different campaign mechanic?"

Never silently split the difference.

## Rule 8 — Tool count matters; we are at the edge of bloat

Current operator toolset is ~33. Documented agent-design research puts
the "tool bloat hurts reliability" threshold at ~30. The operator's
posture going forward:

- Adding a new tool: requires retiring or merging an existing one
- Merging candidates already identified: `list_drafts` +
  `list_cleanup_queue` (overlap), `add_menu_item` + `remove_menu_item`
  → `set_menu` (idempotent), Klaviyo tools could collapse
- "One tool with a mode argument" is OK IF the modes are non-destructive
  variants of the same shape. NOT OK if one mode is destructive.

## Rule 9 — No multi-agent / no sub-agents at our scale

Cognition's analysis is clear: multi-agent architectures lose to
single-threaded compaction at our scale (one founder, low concurrent
tenants). Token overhead is ~15× per Anthropic's own multi-agent
research writeup.

The operator runs as a single thread. If a workflow seems to need
sub-agents, the right answer is usually "split into a sequence of
focused single-agent runs" — not "spawn a sub-agent."

## Rule 10 — Per-turn model routing is the biggest cost lever

Today every operator turn runs on Claude Opus 4.7. For BYOK SaaS
economics (especially as tenants scale), most turns can use Sonnet
or Haiku.

Heuristic for which model:
- New tenant intake / brand-fit decisions / first launch: Opus (high stakes)
- Routine tool dispatch / draft creation / status checks: Sonnet
- Single-line acknowledgments / "saved a note": Haiku

This is tracked as a code change (`chooseModel(turnKind)` in
`lib/operator-agent.ts`) — not yet implemented but flagged as the
single highest-ROI cost optimization in the patterns research.

## Anti-patterns the field has learned to avoid

1. **"Confirm before acting" prompts as a safety system** — they are not.
   Use code-level confirmation tokens (Rule 2). The PocketOS lesson.
2. **One mega-tool with many modes** — easy to misuse via one bad arg.
   Split into separate tools per Rule 8.
3. **Free-text reason field as audit** — `reason: "cleanup"` is not an
   audit log. Use the structured `audit()` call with `action` enum.
4. **Reflexion / self-critique on every turn** — premature; cost not
   worth it. Save for tasks where stakes justify the extra round.
5. **Tools that both read and write in one call** — agent reads "x is
   stale, delete x" without ever surfacing x to the user. Always split.
