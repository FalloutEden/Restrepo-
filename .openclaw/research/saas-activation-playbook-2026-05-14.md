---
title: "SaaS activation playbook — what the leaders actually do"
kind: activation-research
date: 2026-05-14
tags: [activation, onboarding, intake, retention, magic-moment, byok, saas]
related_concepts:
  - tenant-profile
  - intake_brand_profile
  - operator-agent
  - byok
  - first-success
  - time-to-value
  - magic-moment
  - progressive-disclosure
  - empty-state
  - concierge-onboarding
  - activation-velocity
---

# SaaS activation playbook

## TL;DR

The pattern that shows up in every leader: **activation is a single named action with a stopwatch on it**, not a checklist. Linear measures "first issue resolved." Stripe measures "first successful live charge." Shopify measures the slope of the cohort curve to first sale (and watches a 2-week churn cliff). Vercel measures "first deploy." Our equivalent is "first published Shopify product on the tenant's store" and right now we do not instrument it, do not pre-seed toward it, and do not gate any drip on it. The single highest-leverage upgrade we can ship this week is: (a) instrument `time_to_first_published_product` and `time_to_first_sale`, (b) move the intake from "ask 5 fields then start" to "infer 3 of 5 from the Shopify domain, ask only what we can't infer, and trigger product generation immediately on the first answer." Everything else in this playbook is downstream of those two changes.

## The activation funnel framework

The standard product-led funnel is **AARRR** (Acquisition → Activation → Retention → Referral → Revenue), but for an opinionated builder like ours the useful collapse is four stages with a clock on each. Each company below sets a named threshold per stage; we should too.

| Stage | What it is | The metric (general) | Our specific metric |
|---|---|---|---|
| **Sign up** | Account exists, BYOK creds attempted | conversion from landing | `signup_started` → `signup_completed` |
| **First-value moment** | Tenant sees something *real* about *their* brand | time-to-value, p50/p90 | `time_to_first_published_product_minutes` |
| **Habit-forming action** | Tenant does the thing that predicts retention | "aha moment" — see Facebook 7-in-10, Slack 2000 messages | `tenant_published_5_products` AND `connected_storefront_alive` |
| **Retained week 4** | Account still active 28 days post-signup | W4 retention | `tenant_W4_active` (any tool call in week 4) |

Industry medians (from a 547-company benchmark): **median time-to-value is 1 day, 12 hours, 23 minutes; "healthy" is 1–3 days**.[^ttv-benchmark] Our product should beat that because the agent does the work — our internal target should be **<30 minutes** from BYOK paste to first product live on the store.

## What our product looks like today

The operator's intake flow lives at [`lib/tenant-profile.ts`](../../lib/tenant-profile.ts) and exposes an `intake_brand_profile` tool that captures five fields:

```
brandName        // identity
audience         // "german shepherd dads 35-55"
voice            // "dry, no-fluff, military-adjacent"
fulfillment      // "printful" | "cj-dropship" | "digital" | "manual"
shopifyStoreDomain  // "pawvault.myshopify.com"
```

`isProfileComplete()` requires brandName + audience + voice + fulfillment. There is no time-to-completion metric, no domain-side enrichment, no pre-seeded demo brand, no email drip, no in-app activation checklist, and no instrumented "first-success" event. The agent works once the profile is complete, but **completion of the intake is not the same as activation**. Activation, for us, is the tenant seeing their first generated product live on their own Shopify store. Today nothing in the codebase actually fires when that happens — it's an emergent side effect of tool use.

The hidden cost: a tenant who completes intake but never reaches "first published product" looks identical in our data to a tenant who is actively shipping. Both have `completedAt` set. That's a blind spot we'd never accept on a Shopify dashboard, and we're flying with it on our own product.

## Pattern library

### Pattern 1: Task-driven onboarding (not a tour)

- **Used by:** Linear, Notion, Webflow University, Cursor
- **What it is:** Instead of an overlay tour explaining features, the user is given a small set of *actual product tasks* to complete. Each completion teaches the feature in context.
- **Why it works:** Tours train users to dismiss UI. Tasks force the user's hands onto the actual surface, so the muscle memory is real on day 2.
- **Source(s):** [Linear onboarding teardown — Supademo](https://supademo.com/user-flow-examples/linear), [Notion's lightweight onboarding — Appcues](https://goodux.appcues.com/blog/notions-lightweight-onboarding)
- **Applicability to our product:** **H**. Our operator chat is *already* task-shaped — every turn could be framed as one of three named tasks ("pick your hero product," "approve the first mockup," "publish it"). We're just not naming them.
- **Concrete implementation:** Add a `firstSuccessTasks` array to `TenantBrandProfile` with `{id, label, completedAt}` shape. Surface a 3-task strip in `/operator` UI above the chat. Linear's lesson: **resolved** issue, not created — so the third task must be "your first product is live at https://your-store/products/xyz," not "I generated a draft."

### Pattern 2: Empty state → demo data → real data

- **Used by:** Notion (50 templates default), Canva ("Start with a template" — 75% session-to-creation vs 40% without[^empty-state]), Basecamp (sample project on signup), Linear (sample team)
- **What it is:** A blank dashboard is dead. Pre-populate the account with a clearly-labelled demo brand + 3 demo products so the user sees "what good looks like" in 2 seconds, before they have to author anything.
- **Why it works:** Cognitive: it reduces "what does this even do?" friction. Behavioral: it gives the user something to *delete* or *replace*, which is psychologically easier than authoring from scratch (the IKEA effect, inverted).
- **Source(s):** [Empty state best practices — Userpilot](https://userpilot.com/blog/empty-state-saas/), [UserOnboard empty states](https://www.useronboard.com/onboarding-ux-patterns/empty-states/)
- **Applicability to our product:** **H**. Our `/content-studio` and operator chat both currently show "nothing here yet" on first load.
- **Concrete implementation:** On tenant creation, seed `.openclaw/tenants/<id>/operator/demo-brand.json` with a "Founders' Beans Co" demo brand (coffee subscription, voice samples, 3 placeholder mockups). Render in operator chat as: *"Here's an example of what a brand looks like with us. Replace it with yours, or tell me your audience and I'll start over."*

### Pattern 3: Forced choice with sensible defaults

- **Used by:** Stripe (country/business type/MCC are forced but pre-selected), Vercel (framework auto-detected from repo), Cursor (imports VS Code settings by default[^cursor-import])
- **What it is:** Required questions in the onboarding, but every answer is pre-selected to the modal/most-likely choice. The user *can* change it but the default ships them forward.
- **Why it works:** Defeats decision fatigue — most users accept defaults because defaults reflect the common case, and accepting a default is faster than evaluating choices.[^decision-fatigue]
- **Source(s):** [UserOnboard sensible defaults](https://www.useronboard.com/onboarding-ux-patterns/sensible-defaults/), [Stripe progressive disclosure — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- **Applicability to our product:** **H**. Our intake asks `fulfillment` as a free choice — we should default to `"printful"` (our only fully wired lane today) and only show the others if the user types "actually I do my own fulfillment."
- **Concrete implementation:** In `intake_brand_profile`, set `fulfillment: "printful"` as the implicit default; emit a one-line "I'll assume Printful — say 'manual' if not." Same pattern for `voice`: infer from `audience` ("german shepherd dads" → default voice = "direct, no-fluff").

### Pattern 4: Pre-filled forms from inferable data

- **Used by:** Vercel (repo name → project name, framework detection), Stripe (email domain → company), BuildFire (email → Clearbit auto-fill → 46% MQL lift[^buildfire]), Cursor (machine scan for existing VS Code)
- **What it is:** Anything we can derive, we don't ask. The user confirms instead of authoring.
- **Why it works:** Every form field has a measurable drop-off. Reducing fields from 5 → 2 typically lifts completion by 30-50%. Confirming pre-filled data is one cognitive step; authoring is many.
- **Source(s):** [Clearbit enrichment case study](https://useproof.com/customers/buildfire), [Clearbit blog on enrichment](https://clearbit.com/blog/customized-saas-on-boarding-actions-person-role-referring-link)
- **Applicability to our product:** **H**. The Shopify domain is a goldmine. Given `pawvault.myshopify.com`, we can pull the storefront's shop name, currency, country, locale, primary product images, and existing collection names *with the BYOK token we already have*. That covers `brandName`, gives us strong priors on `audience` and `voice`, and lets the operator open turn 1 with "I see your store is called Pawvault, you're in USD, you have 12 products already in 'The Headwear' collection — should I match that voice or start fresh?"
- **Concrete implementation:** Add `lib/shopify-prefill.ts` with a `prefillFromShopify(domain, token)` function returning `{brandName, currency, locale, sampleProductTitles[], collectionNames[]}`. Call it on the *first* turn after BYOK paste and merge into the profile draft before asking anything.

### Pattern 5: Progressive disclosure

- **Used by:** Stripe (gold-standard: country → KYC → banking → tax, layered[^stripe-progressive]), Notion (jobs-based questionnaire → curated templates → power features), Linear (command menu introduced but advanced features hidden until tasks unlock them)
- **What it is:** Show only what's needed for the current step. Reveal complexity as the user earns it.
- **Why it works:** Cognitive load is finite. The Notion lesson is sharper than the Stripe one: **constrain initial choices to prevent overwhelm, expand possibilities as the user matures**.
- **Source(s):** [Progressive disclosure in SaaS — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [PLG onboarding playbook — Venue](https://venue.cloud/news/insights/from-signup-to-sticky-slack-notion-canva-s-plg-onboarding-playbook)
- **Applicability to our product:** **M-H**. Our operator already does this *implicitly* (it doesn't talk about the cron infra until the user asks), but we don't make it visible. Surfaces like `/admin` should be hidden from a first-day tenant entirely.
- **Concrete implementation:** Gate `/admin` and `/cron` nav links behind `tenant.firstProductPublishedAt`. Until then, the only visible surfaces are `/operator`, `/storefront`, and `/billing`.

### Pattern 6: First success unlocks more

- **Used by:** Linear (next task unlocks on prior completion), Cal.com (calendar connection required, but can be skipped to dashboard), Notion (template selection unlocks editing)
- **What it is:** A milestone gates the next set of features. Until the user does X, X+1 doesn't exist for them.
- **Why it works:** Creates a clear "you are here" instead of an infinite blank canvas. Also concentrates engineering effort: we don't have to make features work for users who haven't done X yet.
- **Source(s):** [Linear start guide](https://linear.app/docs/start-guide), [Cal.com onboarding (calendar-connect skippable)](https://cal.com/)
- **Applicability to our product:** **M**. Risk: feels infantilizing for a power-user merchant. Mitigation: only gate features that *genuinely* don't work pre-activation (e.g., scheduled cron sync to Shopify cannot run if Shopify isn't connected).
- **Concrete implementation:** Add `tenantCapabilities()` helper that returns the list of currently-allowed tool names for the agent. Pre-first-publish, it excludes `schedule_recurring_task`, `connect_meta_pixel`, and the email/SMS surfaces. Once `firstProductPublishedAt` is set, expand the set.

### Pattern 7: AI-assisted setup (our wheelhouse)

- **Used by:** Lindy (form-style "Step-by-Step Onboarding" for agent templates[^lindy-onboarding]), Gorgias (AI Agent Onboarding Wizard), Vercel v0 (generate UI before config), Cursor (one-click VS Code migration)
- **What it is:** The agent runs the setup *for* the user, asking only the questions a human couldn't infer. The user supervises rather than authors.
- **Why it works:** This is the structural advantage of an agent-led product. Traditional SaaS asks 12 questions because each one is gated by a different team's data model. An agent can collapse the questions into a conversation and call APIs in parallel.
- **Source(s):** [Lindy step-by-step onboarding docs](https://docs.lindy.ai/skills/by-lindy/step-by-step-onboarding), [AI agent onboarding UX — Standard Beagle](https://standardbeagle.com/ai-agent-onboarding/)
- **Applicability to our product:** **H — this is the moat**. Lindy is the closest shape-match to us and they explicitly do form-style onboarding *inside* the agent. We should not.
- **Concrete implementation:** Keep the operator chat as the only surface, but add a *visible* progress strip ("Step 2 of 5: pick a hero product") that updates as the agent completes work. The user feels supervisory; the agent runs the loop.

### Pattern 8: Welcome video / founder Loom

- **Used by:** Plain (founders' personal walkthrough in onboarding email), Superhuman (literal human onboarding[^superhuman]), Linear (founders' design philosophy posts pinned in docs)
- **What it is:** A 60-90 second video where the founder explains what the product is for, in their voice, before the user touches the UI.
- **Why it works:** It collapses the "is this for me?" question. Also creates parasocial commitment — users who see the founder's face are measurably more likely to email support instead of churning silently.
- **Source(s):** [Superhuman onboarding playbook — First Round](https://review.firstround.com/superhuman-onboarding-playbook/), [Plain — TechCrunch](https://techcrunch.com/2025/02/14/plain-pulls-in-15m-to-agregate-b2b-customer-services-chats-into-one-platform/)
- **Applicability to our product:** **M**. The Project ELSA story is real and the founder is comfortable on camera (per memory). The risk is performative-startup-vibes; the saving grace is that the actual story (working when a dog died) is unfakeable.
- **Concrete implementation:** Record one 75-second Loom: "Hey, I'm Karli, I built this because [...]. The way it works is, you paste your Shopify token, I have one product live for you in 20 minutes. Hit me up if it breaks." Embed it on the empty-state of `/operator` and in the first onboarding email.

### Pattern 9: Onboarding emails synced to in-app state (not time)

- **Used by:** Customer.io (the canonical pattern), Resend ("one email, trust the user to read"[^resend]), Shopify (cohort-based 5-day pings during the 6-week activation curve[^shopify-cohort])
- **What it is:** Emails fire on *behavioral* triggers (e.g., "signed up 24h ago, no product published") not on a fixed time grid. A user who's actively shipping never gets an email; a user who's stalled gets exactly the email that nudges them past their stall.
- **Why it works:** Time-based drips train users to filter you out. State-based drips train them that emails from you are useful because they match what they're trying to do.
- **Source(s):** [Customer.io onboarding campaign docs](https://docs.customer.io/journeys/onboarding-campaign/), [Resend's one-email approach — SaaSboarding](https://blog.saasboarding.com/p/a-one-email-onboarding-strategy-that), [Activation Velocity at Shopify](https://productled.com/blog/activation-velocity)
- **Applicability to our product:** **H** — and free: we already have a cron infra (per memory).
- **Concrete implementation:** Cron `tenant-nudges` runs daily. Three triggers: (a) `signed_up > 1d AND no_published_product` → "stuck on intake?" email, (b) `published_product = 1 AND no_sale > 7d` → "want help getting your first sale?" email, (c) `no_tool_call > 7d` → "is something broken?" email. All three live in `.openclaw/operator/email-templates/`.

### Pattern 10: Concierge onboarding for the first N users

- **Used by:** Superhuman (90 → 30 min human-led calls, $650k ARR per ramped specialist, 65% transition rate[^superhuman]), Stripe in 2011, early Linear
- **What it is:** Manually onboard the first 10-100 users in a 1:1 call. Don't try to automate. Use the calls to discover what the actual onboarding *should* look like, then automate later.
- **Why it works:** You learn the real failure modes in 10 calls that you'd miss in 1000 analytics events. Also: every concierged user becomes a referral source.
- **Source(s):** [Superhuman playbook](https://review.firstround.com/superhuman-onboarding-playbook/), [White-glove vs self-serve — Command.ai](https://www.command.ai/blog/white-glove-vs-self-serve-onboarding-in-saas/)
- **Applicability to our product:** **M, but opinionated take: do the *recorded async* version, not the live call**. We are one founder with limited bandwidth (per memory — wife's surgery imminent, low capacity). A live 30-min call per tenant doesn't scale below founder, and we are below founder. Better: offer "submit your store, get a personal Loom from Karli within 24h" for the first 25 tenants. Higher signal than self-serve, async-friendly for a low-bandwidth founder.
- **Concrete implementation:** Add a `/operator/welcome` page with a single button: "Send me a 5-min personal walkthrough of *my* store within 24h." Captures the BYOK creds, queues a task in `.openclaw/founder-queue/` for a founder to record a Loom. Hard-cap at 25 tenants then auto-hide.

## What we're missing (concrete gap list)

| # | Gap | Cost to close | Expected impact |
|---|---|---|---|
| 1 | No instrumentation of `time_to_first_published_product` or `time_to_first_sale`. We have `completedAt` on the profile but it measures intake-completion, not value-delivery. | **1 day** — add two timestamps to tenant state, write them when the relevant tool calls succeed, expose in `/admin/metrics`. | **H** — without this we cannot tell whether *any* of the other gaps are getting fixed. |
| 2 | Shopify domain not used for prefill. We ask `brandName` after we have a token that can `GET /admin/api/.../shop.json`. | **1 day** — `lib/shopify-prefill.ts` + wire into the intake prompt. | **H** — turns 5-question intake into a 2-question confirmation. Direct copy of Stripe/Vercel pattern. |
| 3 | Empty state on `/operator` is a literal blank chat. No demo brand, no example products, no "what good looks like." | **1 week** — seed a "Founders' Beans Co" demo brand with three placeholder products + mockups. Add a "wipe demo, use my brand" button. | **H** — Canva data suggests 75% vs 40% session-to-creation lift with seeded templates.[^empty-state] |
| 4 | No founder welcome video. New tenants get no signal that a human built this. | **1 hour** to record + 30 min to embed. | **M** — direct lift on retention is hard to measure but cheap to do. |
| 5 | No state-triggered email drip. Cron infra exists; we don't use it for tenant nudges. | **1 week** — three behavioral triggers, three email templates, wire into existing cron. | **H** — Shopify's own data shows 5% cohort activation lift from 5-day cadence pings during the steep activation window.[^shopify-cohort] |
| 6 | Intake has no defaults. `voice`, `audience`, `fulfillment` are all open-ended fields. | **1 hour** — change the operator prompt to assume `fulfillment: printful` and infer `voice` from `audience`. | **M** — modest completion-rate lift, but compounds with gap #2. |
| 7 | No in-app activation checklist. The user has no visual sense of "you are 2 of 3 steps from your first sale." | **1 week** — a 3-item strip above the chat: brand → first product → first sale. Persists across sessions. | **M-H** — Linear's task-driven onboarding is the canonical version of this. |
| 8 | No "first 25 concierge" path. We have no mechanism to capture the founder's personal attention for early tenants. | **1 day** — `/operator/welcome` + founder queue file + hard-cap counter. | **M** — small-N but high-signal; learnings feed gaps 1-7. |

Eight gaps, four of them costing one day or less, two of them rated H impact. The aggregate engineering cost to close every gap on this list is ~3.5 weeks of focused work. Realistic priority order given founder bandwidth: **#1 → #2 → #6 → #4 → #5 → #3 → #7 → #8**.

## Activation metrics to instrument

These six metrics get written to `.openclaw/metrics/activation/` (or wherever the existing metrics infra lives — per memory there is already an "operational nervous system" with cron + webhooks + incidents UI, so this should plug in).

| Metric | What it measures | Validated by |
|---|---|---|
| `time_to_first_published_product_p50` | Minutes from signup to first Shopify product live. p50 and p90. | Linear's "first issue resolved"[^linear], Vercel's "first deploy"[^vercel] |
| `time_to_first_sale_p50` | Minutes from signup to first paid order webhook. | Shopify's own 2-week churn cliff[^shopify-cohort], Stripe's "first live charge"[^stripe-magic] |
| `tenant_W4_retention_rate` | % of tenants who make any tool call in days 22-28 post-signup. | Standard PLG retention curve; Facebook's 7-in-10 is the canonical version[^facebook] |
| `activation_velocity_curve` | The cumulative distribution of cohort activation over time (not the average). | Shopify's own published methodology[^shopify-cohort] |
| `tasks_completed_count` | Of the 3-step in-app checklist, how many does the median tenant finish in their first session? | Linear's task-driven model[^linear] |
| `intake_completion_rate` | % of tenants who finish the brand profile vs. drop before `completedAt`. | Standard form-completion benchmark[^buildfire] |

We do not need to track all six on day 1. **Days 1-2: metrics 1, 2, and 6.** Metrics 3, 4, 5 require enough cohort data (≥30 tenants) to be meaningful and can wait until we have that.

## Operator-side rules extracted

These three rules go in `.openclaw/operator/knowledge/meta-rules/`. Each one is short enough to live as a bullet in the system prompt's meta-rules block.

**Rule 1 — Prefill before asking.** *Before asking any intake question, call `shopify_prefill` if a domain is available. Open the conversation with the inferred values phrased as confirmations ("Your shop is Pawvault, USD, US locale — should I match the voice of your existing 'Headwear' collection?"), not as questions.* Source: Stripe / Vercel / BuildFire pattern.

**Rule 2 — Default and ship.** *Never ask the tenant to choose between options where one is overwhelmingly the right answer. State the default in one short line and let them override. Fulfillment defaults to Printful. Voice defaults to a one-sentence inference from audience. Pricing tier defaults to $19.99 unless the audience signals premium.* Source: UserOnboard sensible defaults pattern.

**Rule 3 — First success in <30 min or escalate.** *If 30 minutes have elapsed since signup and no product is published, the operator should: (a) stop asking new questions, (b) propose a one-sentence first product based on whatever is known, (c) ship it as a draft visible at the tenant's `/admin/products`, (d) tell the tenant: "I made a draft. Look at it. Tell me what to change."* Source: industry TTV benchmark of 1-3 days[^ttv-benchmark] — beating it by 50-100x is our differentiation.

**Rule 4 (optional)** — *No `/admin` or `/cron` mentions in agent output until `firstProductPublishedAt` is set.* Source: progressive disclosure / Notion's "constrain initial choices" lesson.

**Rule 5 (optional)** — *State-based emails, never time-based. If the operator wants to email the tenant, route through `email_tenant(trigger_id, template_id)` which checks the tenant's state matches the trigger condition before sending.* Source: Customer.io / Shopify cohort-ping methodology.

## Sources

### Companies studied (direct)

- Linear — [Start Guide](https://linear.app/docs/start-guide), [onboarding teardown by Supademo](https://supademo.com/user-flow-examples/linear), [Lulu Wang's hands-on teardown](https://medium.com/design-bootcamp/hands-on-learning-cinematic-transition-linears-thoughtful-onboarding-aa4f16c33d90)
- Vercel — [How I'd Grow Vercel in 90 Days](https://vercel-growth-pov.vercel.app/)
- Stripe — [Stripe AI customer onboarding lessons — Perspective AI](https://getperspective.ai/blog/stripe-ai-customer-onboarding-philosophy-lessons-from-a-conversion-obsessed-company), [Stripe Onboarding docs](https://docs.stripe.com/stripe-apps/onboarding), [Cristiano Betta DX review](https://betta.io/blog/2016/10/16/developer-experience-review-stripe/)
- Notion — [Appcues' lightweight onboarding teardown](https://goodux.appcues.com/blog/notions-lightweight-onboarding), [Candu's 6 lessons](https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users)
- Cal.com — [Cal.com main site](https://cal.com/), [Cal.com routing for onboarding specialists](https://cal.com/routing/routing-for-onboarding-specialists)
- Lindy — [Step-by-step onboarding docs](https://docs.lindy.ai/skills/by-lindy/step-by-step-onboarding), [Academy lesson](https://www.lindy.ai/academy-lessons/step-by-step-onboarding)
- Plain — [TechCrunch Series A coverage](https://techcrunch.com/2025/02/14/plain-pulls-in-15m-to-agregate-b2b-customer-services-chats-into-one-platform/)
- Webflow — [Webflow University](https://university.webflow.com/), [Flowout teardown](https://www.flowout.com/blog/designing-onboarding-experience-with-webflow)
- Resend — [Resend main site](https://resend.com/), [SaaSboarding analysis of Resend's one-email approach](https://blog.saasboarding.com/p/a-one-email-onboarding-strategy-that)
- Supabase — [Supabase Getting Started](https://supabase.com/docs/guides/getting-started)
- Cursor — [Cursor changelog](https://changelog.cursor.sh/), [Cursor onboarding teardown — DEV](https://dev.to/sahilkhurana/cursor-ai-2026-the-complete-guide-to-the-ai-native-ide-3n4h)
- Superhuman — [First Round Review playbook](https://review.firstround.com/superhuman-onboarding-playbook/)

### Pattern and methodology

- [Activation Velocity at Shopify — ProductLed](https://productled.com/blog/activation-velocity)
- [Time-to-Value benchmark report — Userpilot](https://userpilot.com/blog/time-to-value-benchmark-report-2024/)
- [User Activation Rate Benchmark — Userpilot](https://userpilot.com/blog/user-activation-rate-benchmark-report-2024/)
- [Facebook's aha moment — Mode](https://mode.com/blog/facebook-aha-moment-simpler-than-you-think/)
- [Magic numbers are an illusion — Mixpanel](https://mixpanel.com/blog/magic-numbers-are-an-illusion/)
- [Empty State patterns — UserOnboard](https://www.useronboard.com/onboarding-ux-patterns/empty-states/)
- [Sensible Defaults pattern — UserOnboard](https://www.useronboard.com/onboarding-ux-patterns/sensible-defaults/)
- [Progressive Disclosure — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [Demo content best practices — Userpilot](https://userpilot.com/blog/demo-content/)
- [BuildFire Clearbit case study](https://useproof.com/customers/buildfire)
- [Customer.io onboarding campaign methodology](https://docs.customer.io/journeys/onboarding-campaign/)
- [White-glove vs self-serve — Command.ai](https://www.command.ai/blog/white-glove-vs-self-serve-onboarding-in-saas/)
- [AI agent onboarding UX — Standard Beagle](https://standardbeagle.com/ai-agent-onboarding/)
- [Decision fatigue in UX — Optimizely](https://www.optimizely.com/optimization-glossary/decision-fatigue/)
- [PLG onboarding playbook — Venue](https://venue.cloud/news/insights/from-signup-to-sticky-slack-notion-canva-s-plg-onboarding-playbook)

### Footnotes

[^ttv-benchmark]: Userpilot 2024 benchmark, 547 SaaS companies surveyed. Median TTV 1d 12h 23m; "healthy" range 1-3 days.
[^empty-state]: Canva's "Start with a template" empty-state increased first-session-creation from 40% → 75%.
[^cursor-import]: Cursor's first-launch wizard offers one-click migration from VS Code (extensions, settings, themes, keybindings).
[^decision-fatigue]: Optimizely glossary + NN/G "Simplicity Wins Over Abundance of Choice" — defaults are accepted by most users; choice overload causes decision avoidance.
[^buildfire]: BuildFire + Clearbit case: email → enrichment → auto-fill drove 46% lift in MQLs and reportedly 54% signup conversion lift in benchmarks.
[^stripe-progressive]: Stripe's account setup (country → business name → KYC → banking → tax) is widely cited as the canonical progressive-disclosure onboarding.
[^lindy-onboarding]: Lindy explicitly built "Step-by-Step Onboarding" actions inside their agent platform for template creators to onboard others — form-style flow inside an agent UI.
[^superhuman]: Gaurav Vohra at Superhuman: human-led onboarding 90min → 30min; 40 calls/specialist/week × 45 weeks = ~$650k ARR per ramped specialist; 65% transition rate; 15% no-shows.
[^resend]: Resend deliberately sends *one* onboarding email and trusts users to read it, rather than a 10-day drip.
[^shopify-cohort]: Shopify's "Activation Velocity" methodology: cohort curve, not average TTV. First 6 weeks is the steepest part of the curve; 5-day cadence pings during that window lifted cohort activation by 5%.
[^linear]: Linear's activation event is *resolving* (not creating) the first issue — closing the loop from problem to outcome.
[^vercel]: Vercel's first-deploy is the named activation milestone, with starter templates and v0 used to compress time-to-first-deploy.
[^stripe-magic]: Stripe internally measures "first successful live charge" — co-founder John Collison has framed onboarding as the conversion bottleneck that decides whether a developer ever sends a single live charge.
[^facebook]: Facebook's "7 friends in 10 days" — Chamath Palihapitiya / Mode's analysis confirms this was a memorable round-number rally cry, not a precision threshold.
