# Premium UX vision — operator reference (2026-05-14)

This brief is auto-loaded into the operator system prompt. When the operator reasons about UI/dashboard changes, design proposals, or "should we expose X to the customer," it applies these rules.

## Surface separation (hard rule)

There are exactly two surfaces:

| Surface | Audience | Aesthetic | What lives here |
|---|---|---|---|
| **Customer** (`/dashboard`, `/content-studio`, `/onboard`) | Paying merchants | Dark cyberpunk, alive, gamified | Operator chat, agent habitats, mission status, approval queue, settings, brand/billing |
| **Admin** (`/admin/*`, `/pipeline`) | Founder only | Light SaaS / utilitarian | Incidents, raw datasets, token batches, internal queue debug, system warnings |

Admin links render only when `isAdmin()` returns true (cookie `x-operator-auth` matches `OPERATOR_AUTH_SECRET`, or local dev). Pattern lives in [app/dashboard/page.tsx](app/dashboard/page.tsx). Reuse it — never invent a new gate.

## Routing law

- `/` = public marketing landing (light theme, pricing, FAQ, payment CTA). Anonymous users land here.
- `/dashboard` = the operator chat for logged-in merchants. The operator lives here, NOT at `/`.
- `/operator` = legacy alias, must redirect to `/dashboard` (currently broken — redirects to `/`, stranding admin users on the marketing page mid-session).
- "Back to operator" links from any sub-page (`/content-studio`, `/pipeline`) MUST point to `/dashboard`, never `/`.

If a code change is proposed that creates a new sub-page, the back-link target is `/dashboard` unless explicitly stated otherwise.

## Anti-gimmick principle

The competitive landscape is full of "rebranded LLM wrapper" products charging $50-200/mo. Customers pattern-match these instantly and price-anchor down. The Operator's defense:

1. **Real-time evidence of work.** The dashboard must show agents actually feeding CEREBRO, the synapse actually updating, errors actually appearing — not fake "AI thinking..." spinners.
2. **Service health is loud, not buried.** When Shopify or Printful or Anthropic is down, the customer sees a red node in the synapse and a log line. Never bury infrastructure problems in a yellow startup-warnings sidebar.
3. **No infrastructure leak to customer surface.** Token counts, batch sizes, dataset selection, queue internals — all admin-only. Customer sees outcomes ("Forge built 3 product drafts"), not pipeline noise.
4. **Each agent is a habitat, not a tile.** 11 agents render as large cards with synapse running behind a foreground sprite/state, not a cramped 4-across grid of tiny modules.

## What "premium feel" means in this codebase

- Dark cyberpunk base (`#0F0E0C` + `#A67843` accent) — already established in [components/AgentVisual.tsx](components/AgentVisual.tsx).
- Agent habitats are larger and sparser than current — fewer tiles per row, more visual breathing room around each.
- Synapse animation runs continuously at the actual data tick rate (not random flicker — flicker only when a node was actually just updated).
- Front of agent card is darker (foreground state pops) but synapse layer is brighter (connections readable).
- Onboarding wizard primes the operator with brand context BEFORE the merchant lands on an idle dashboard.

## Canonical components

- [components/AgentVisual.tsx](components/AgentVisual.tsx) — the synapse renderer. Use this for both individual agent habitats AND the global CEREBRO heartbeat. Do not introduce a second visualization library.
- [components/AgentDashboard.tsx](components/AgentDashboard.tsx) — the dashboard shell. Tabs to be split admin-vs-customer.
- [app/dashboard/page.tsx](app/dashboard/page.tsx) — the `isAdmin()` gate to copy.
- [components/operator/OperatorPanel.tsx](components/operator/OperatorPanel.tsx) — the chat panel that sits at the heart of `/dashboard`.

## What NOT to propose

- New design system or component library — extend the existing dark cyberpunk theme.
- Arcade gamification (XP bars, achievement popups, leaderboards) — user wants "alive," not "game."
- Showing ZENDROP / Klaviyo / any optional-key warnings to customers — those are admin signals only.
- A separate `/admin` dashboard wholesale — admin is a *layer* on top of the customer dashboard via the cookie gate, not a parallel app.
