# Activation discipline — operator rules

Distilled from study of Linear, Vercel, Stripe, Notion, Cal.com, Lindy, Plain,
Webflow, Resend, Supabase, Cursor, Superhuman. Full research:
`.openclaw/research/saas-activation-playbook-2026-05-14.md`.

The target: tenant goes from sign-up to **first product published** in <30
minutes. Industry median is 1.5 days. We're agent-powered — beating that by
50-100x is our differentiation, not a feature.

## Rule 1 — Prefill before asking

If a value can be inferred or auto-detected, never make the tenant type it.
Examples:
- Shopify domain → confirm it (don't ask for brand name separately)
- Brand voice → suggest from audience description, let them override
- Fulfillment lane → default to printful unless they say otherwise
Ask for confirmation, not invention.

## Rule 2 — Default and ship

Every field with a sensible default ships forward without blocking. Empty
voice? Default to "premium-restrained, materials-led" with a note saying
"I picked this — change anytime via `intake_brand_profile`." Forced choice
beats empty form.

## Rule 3 — First success in <30 min or escalate

If a new tenant hasn't reached "first product visible on their store" 30
minutes after profile completion, the operator surfaces a `request_human_input`
explaining what's blocking. Do not let a tenant drift into hour-2 silently.

## Rule 4 — Empty state shows demo data, not blank cards

When a tenant lands on /dashboard with zero products, the operator
pre-seeds 1-2 example draft products (clearly labeled "DEMO — delete or
modify") so the empty-state UX teaches by example instead of paralyzing.
Demo data must be deletable in one click.

## Rule 5 — State-based emails, never time-based

Onboarding emails fire on STATE transitions (intake_complete, first_product_published,
first_order_received), not on time delays. A tenant who finishes intake at
3am doesn't get a "still need help?" email at 9am — they get it 24h after
intake if and only if they haven't progressed.

## Rule 6 — Hide admin tools until first-product-published

`/admin/incidents`, `/pipeline`, `/launch` only appear in the nav once
the tenant has shipped a first product. Pre-shipping, those routes are
distractions that pull attention from the magic moment.

## Rule 7 — Concierge onboarding = async Loom, not live call

If a tenant gets stuck during intake or first-product, the operator offers
a 5-min recorded Loom from Karling explaining the path forward — NOT a
calendar link for a live call. The founder does not have bandwidth for
synchronous onboarding at scale.

## Rule 8 — Track time_to_first_published_product as the activation metric

Not "did they finish intake?" (false signal — completed intake ≠ shipping
tenant). Not "logged in N times" (vanity). The actual metric: how long from
signup to a live, customer-buyable product on their Shopify store.

p50 target: <30 min. p90 target: <2 hours. Anything above 24h is a churn
candidate.
