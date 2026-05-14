---
title: "Customer support automation playbook — operator-led support for SaaS + ecom"
kind: support-playbook
date: 2026-05-14
tags: [support, automation, escalation, templates, sentiment, sla, ai-support]
related_concepts: [operator-agent, brand-fit-guardrails, klaviyo, shopify-inbox, printful-import-workflow, autonomy-master-plan, chargeback-prevention, refund-policy, csat, plain, intercom, help-scout, linear-cx, klarna-postmortem]
---

# Customer support automation playbook

## TL;DR

A one-founder SaaS that hosts hundreds of merchants cannot be on-call. The operator must absorb the volume by splitting support into two tiers — end-customer (the merchant's buyer) and tenant (the merchant) — answering 80% of both automatically using a tight set of templates, a sentiment-and-keyword escalation matrix, and a refund decisioning policy that errs on the side of refunding small amounts without approval. The other 20% routes to the founder through a single channel (an in-app `escalate_to_founder` event that becomes a Slack/email ping) with full conversation context. Klarna's 2024–2025 reversal — they replaced 700 agents with AI and then partially rolled it back when CSAT cratered on complex disputes — is the cautionary tale: AI handles routine, humans handle emotionally loaded edge cases, and the routing logic is the actual product. Linear's rotating-goalie model and Plain's "AI agent + escalation infrastructure" pattern are the closest reference architectures for what The Operator should build.

---

## Section 1: Two-tier support model for our specific product

The Operator sits between two distinct user populations. Confusing them is the failure mode.

### Tier A — End-customer support (the merchant's buyer)

The person who bought a t-shirt, hat, or smartlock from a tenant's Shopify store. They never know The Operator exists; they think they're emailing "Black Vault Apparel" or whatever the tenant brand is.

Volume drivers (from Printful's own published policy guidance and Shopify Inbox usage patterns):
- "Where is my order?" (WISMO) — single largest category in any ecom support inbox
- "Wrong size" / sizing exchange requests
- "I want to return this"
- "Item arrived damaged" / quality complaint
- "I never received this" — distinct from WISMO because tracking says delivered
- "Cancel my order" (within fulfillment window)
- "I was charged twice" / payment dispute precursor
- "Do you ship to [country]?" — pre-purchase

Who owns this: the merchant nominally owns it, but Printful's published policy is clear — customer-initiated size errors are the store owner's problem, not Printful's, and Printful only covers genuine quality defects (mislabeled, damaged-in-print, low-res reprints). Shipping delays past the stated window are also the store's problem with Printful's data as evidence.

The Operator's job for this tier: integrate with Shopify Customer + Klaviyo Conversations + Printful Order, draft a reply, and either send it directly (if confidence is high and the action is recoverable — like sharing a tracking link) or stage it as a draft for the tenant to approve. Klaviyo's 2026 Customer Agent now natively handles order status, returns, subscription changes, and loyalty lookup — we should integrate with it rather than rebuild it for tenants who turn it on, and we should provide a lightweight fallback for tenants who haven't.

### Tier B — Tenant support (the merchant themselves)

The person who signed up for The Operator and is trying to run a store with our help. They know they're talking to AI; they expect it to be smart.

Volume drivers (extrapolated from Cursor's documented support failures, Stripe Atlas FAQ patterns, and Plain's PLG B2B SaaS volume mix):
- "How do I add a product?" — onboarding
- "My Printful API key isn't working" — auth/credential
- "My Shopify webhook didn't fire" — integration
- "How do I change my product price?" — admin task
- "Where do I see my orders?" — UI/navigation
- "Can I use my own domain?" — config
- "I want to cancel my subscription" — churn
- "Stripe says my payout failed" — billing
- "Can you build me X?" — feature request
- "This is broken / [bug report]"

The Operator's job for this tier: this is its native turf. Tenant questions should resolve in chat without leaving the dashboard. The operator already has 8 tools (per `project_operator_agent.md`); add support-specific tools that let it diagnose (e.g., probe webhook status, validate API keys, check sync state) before answering.

### Decision tree: who handles what, when does the operator escalate

```
incoming message
│
├─ from a tenant (authenticated user in our app)
│   ├─ technical-diagnostic answerable from tools we already wrote
│   │   → operator answers directly
│   ├─ billing/refund on the SaaS subscription
│   │   ├─ < $50 OR within Stripe 30-day window → operator processes
│   │   └─ > $50 OR contract dispute → escalate_to_founder
│   ├─ feature request → operator logs to backlog, replies with template #14
│   ├─ bug report → operator logs, replies with template #13, files in Linear/issues
│   └─ angry / escalation keywords present → escalate_to_founder
│
└─ from an end-customer (via tenant's connected Shopify/Klaviyo inbox)
    ├─ WISMO with tracking available → operator drafts reply with tracking link
    ├─ refund < $30 AND within 30-day policy → operator drafts approval
    ├─ refund > $30 OR outside policy → operator drafts, holds for tenant
    ├─ quality defect with photo → operator opens Printful claim, drafts reply
    ├─ chargeback-adjacent language → escalate to tenant (NOT founder)
    └─ anything else → operator drafts, marks "needs tenant review"
```

The cleavage rule: tenant escalations go to the founder. End-customer escalations go to the tenant, never to the founder, because that's their business not ours. The Operator must never agree to do a thing on behalf of the tenant's brand that the tenant hasn't authorized.

---

## Section 2: First-touch response framework

### Response time targets that actually matter

Cross-channel benchmark numbers gathered from Lorikeet's 2026 FRT analysis, Zendesk's chat research, Benchmark Portal's top-quartile B2B SaaS data, and Freshworks' 2025 AI-impact report:

| Channel | Industry top-quartile | Industry average | Customer expectation |
|---|---|---|---|
| Live chat | < 40 seconds | ~2 minutes | 82% expect within 10 minutes |
| Email — SaaS standard | < 4 hours | 7–12 hours | 46% expect within 4 hours |
| Email — SaaS enterprise | < 1 hour | 4 hours | — |
| Email — ecom standard | < 2 hours | 7–10 hours | Vast majority within 24h |
| Social media | < 60 minutes | hours | 4h+ correlates with public escalation |
| Phone | 20–80 seconds | minutes | High abandonment above 2–3 min |

The Operator's targets (set deliberately under the top-quartile):
- **Tenant chat in-app: under 30 seconds.** This is AI, there is no excuse.
- **Tenant email (when they reply to a system email): under 1 hour, 24/7.**
- **End-customer email (when we operate the merchant's inbox on their behalf): under 4 hours initial ack, full reply within 24 hours.**
- **Acknowledgment within 5 minutes is non-negotiable for end-customer touches** even if the substantive reply takes longer. The acknowledgment is what stops the chargeback clock and the public-escalation clock.

### What "first response" must contain at minimum

Drawing from the HEARD method (Hear, Empathize, Apologize, Resolve, Diagnose), Help Scout's "13 tricky email" framework, and Linear's CX writing style:

1. **Acknowledgment of the specific issue** — never "your issue" or "any inconvenience." Restate the problem so they know you read it.
2. **Empathy hook tied to the specific situation** — "I can see why a delayed order before Mother's Day is frustrating," not "Sorry for the inconvenience."
3. **What we know right now** — facts, not speculation.
4. **What we'll do next, with an ETA** — even if the next step is "I'll check back in 24 hours."
5. **A door for them to add information** — "If your shipping address has changed since you ordered, reply to this email."

The "calm down" anti-pattern: never tell a customer to calm down, relax, or take a breath. Validation calms the amygdala (Harvard Business Review on de-escalation); explicit instructions to calm down enrage. Replace with naming the emotion: "I can hear how frustrating this has been."

### The 15 templates

Templates 1–10 are end-customer-facing; 11–15 are tenant-facing. Each has subject + body + when-to-use + fill-in variables. Synthesized from common patterns at Help Scout, Intercom, Front, Plain, Klaviyo's helpdesk knowledge base, and Shopify's Inbox best-practice docs.

#### Template 1 — Order delayed / missing (within carrier window)

**Subject:** Update on your order #{order_number}
**Body:**
> Hi {first_name},
>
> Thanks for reaching out about order #{order_number}. I pulled it up and here's what I see: shipped {ship_date}, tracking shows last scan at {last_scan_location} on {last_scan_date}. {carrier} is still within their normal delivery window of {window_days} business days for {destination_country}.
>
> Here's the live tracking: {tracking_url}
>
> I know waiting is the worst part. If tracking hasn't updated by {next_scan_check_date}, reply to this email and I'll open a trace request with {carrier} and either reship or refund — your call.
>
> — {tenant_brand_name} Support

**When to use:** Tracking shows movement, within stated delivery window. Source: synthesized from Help Scout's "Delivery Delay Frustration" template + Shopify Inbox's standard WISMO flow + Sendcloud's shipment-delay template family.

#### Template 2 — Order delayed (past stated window)

**Subject:** We're sorry your order is late — here's what we're doing
**Body:**
> Hi {first_name},
>
> Your order #{order_number} should have arrived by {promised_date}, and it hasn't. That's on us, not on you.
>
> I've opened a trace with {carrier} (reference: {trace_id}). They'll come back within {carrier_trace_days} business days. While we wait:
>
> Option 1: I reship your order today via {expedited_method} at no charge.
> Option 2: I refund you in full now, and you keep the original if it does eventually arrive.
> Option 3: Wait for the trace result — sometimes packages turn up.
>
> Reply with the number you want. There's no wrong answer.
>
> — {tenant_brand_name} Support

**When to use:** Past window OR tracking has been stalled > 5 business days. Note option 3 explicitly offers the Amazon-style returnless-refund path because for sub-$30 POD items, reverse shipping costs more than the item; this aligns with Shopify's 2026 returnless-refund guidance.

#### Template 3 — Wrong item received

**Subject:** That's not what you ordered — let's fix it
**Body:**
> Hi {first_name},
>
> I'm sorry — order #{order_number} was supposed to be {ordered_item} and you got {received_item}. That's a fulfillment error on our side.
>
> I've already started a replacement order with the correct item ({ordered_item}, {size}, {color}). Expect a shipping confirmation within 48 hours.
>
> No need to send the wrong item back — keep it, donate it, give it to a friend who'll appreciate it.
>
> — {tenant_brand_name} Support

**When to use:** Customer provides photo or order detail mismatch is verifiable in Shopify line items vs. Printful fulfillment. Source: aligns with Printful's quality-issue replacement policy (they cover free reprints when mislabeled) and Amazon's keep-it returnless logic for low-value goods.

#### Template 4 — Refund request (within policy)

**Subject:** Refund processed for order #{order_number}
**Body:**
> Hi {first_name},
>
> No problem at all. I've refunded ${amount} to the {payment_method} ending in {last_four}. You'll see it back in 3–5 business days depending on your bank.
>
> If there's anything specific that didn't work — sizing, color, print quality — I'd genuinely love to know so we can fix it for the next person. No pressure to reply.
>
> Thanks for giving us a try.
>
> — {tenant_brand_name} Support

**When to use:** Within 30-day window, item value under tenant's auto-approve threshold (default $30 unless tenant changed it), no chargeback language present. Source: pattern matches Help Scout's "Refund Approved" canned reply + Klarna's pre-reversal AI approach to low-friction refunds.

#### Template 5 — Refund request (outside policy / declined)

**Subject:** About your refund request — order #{order_number}
**Body:**
> Hi {first_name},
>
> I want to be straight with you on this. Your order shipped on {ship_date} and was delivered on {delivery_date}, which puts the refund request at {days_since_delivery} days after delivery — past our 30-day window.
>
> I can't process a full refund this time, but here's what I can do:
> – Store credit of ${credit_amount} you can use anytime (no expiration)
> – Or, if there's a specific product issue (damage, defect, sizing), send me a photo and I'll re-evaluate
>
> Tell me what works for you.
>
> — {tenant_brand_name} Support

**When to use:** Outside window, no defect claim. Source: Help Scout's "Refund Rejection" template structure — be explicit, give a reason, offer alternatives, dig for underlying cause.

#### Template 6 — Sizing issue

**Subject:** Let's get you the right size
**Body:**
> Hi {first_name},
>
> Sorry the {item} didn't fit right. Sizing varies a lot between brands, and our size chart isn't always perfect.
>
> Because each item is made on demand, I can't do a straight swap — I'd need to order a new one. Here are options:
>
> Option 1: I send you a discount code for 25% off a replacement in the correct size. You keep the original.
> Option 2: Full refund and we part friends.
>
> Quick favor — when you reply, tell me your height and usual t-shirt size? I'll keep an eye on whether our sizing tends to run small for that range, so we can update the chart.
>
> — {tenant_brand_name} Support

**When to use:** Customer-initiated sizing complaint, not a product defect. Source: Printful's published guidance — they don't reprint customer-initiated size errors, so the merchant bears the cost. Combined with Help Scout's "be honest, explain why" pattern + the support-to-product feedback loop from Linear.

#### Template 7 — Payment failed

**Subject:** Your payment didn't go through — here's why
**Body:**
> Hi {first_name},
>
> Your order didn't complete because the payment got declined. The decline reason from your bank was: {decline_reason}. That's coming from your bank, not from us — we never saw your card details rejected on our end.
>
> Most common fixes:
> – Try a different card
> – Call your bank and ask them to authorize the charge (sometimes flagged as suspicious for ecom)
> – Try a smaller order to test
>
> Your cart is still saved here: {cart_recovery_url}
>
> Yell if it keeps failing and I'll dig in further.
>
> — {tenant_brand_name} Support

**When to use:** Stripe/Shopify Payments returned a decline. Source: Stripe's own decline-code messaging guidance + Shopify's checkout failure recovery pattern.

#### Template 8 — Cancellation request (pre-fulfillment)

**Subject:** Cancelled — order #{order_number}
**Body:**
> Hi {first_name},
>
> Done. Order #{order_number} is cancelled and your card was never charged / has been refunded ${amount}.
>
> Mind sharing what changed? Was it pricing, shipping speed, just changed your mind? No wrong answer — it helps us improve.
>
> — {tenant_brand_name} Support

**When to use:** Order not yet sent to Printful for fulfillment (status check in Printful API first).

#### Template 9 — Cancellation request (post-fulfillment)

**Subject:** About cancelling order #{order_number}
**Body:**
> Hi {first_name},
>
> I tried to cancel but {item} has already gone into production at our fulfillment partner. Because each item is made-to-order, once printing starts it can't be stopped.
>
> Here's what I can do:
> – When it arrives, refuse delivery or ship it back to {return_address}. I'll refund ${refund_after_shipping} when it's back (less return shipping).
> – Or keep it and I'll send you a 30% credit toward your next order.
>
> What sounds better?
>
> — {tenant_brand_name} Support

**When to use:** Printful order is in `fulfilled` or `inprocess` state.

#### Template 10 — Quality defect with photo

**Subject:** That's not right — let's make it right
**Body:**
> Hi {first_name},
>
> Thank you for the photos. You're right — that's a print defect, not how this should look. Sorry you opened the package to that.
>
> I've already filed a claim with our fulfillment partner ({printful_claim_id}). A replacement is being printed now and will ship within 3 business days. You'll get a new tracking email.
>
> Keep the defective one — donate it, use it as a rag, whatever you want. No need to ship it back.
>
> — {tenant_brand_name} Support

**When to use:** Photo provided, defect visible. The Operator can open a Printful claim automatically via API.

#### Template 11 — Tenant: "How do I do X" (onboarding)

**Subject (chat reply, no subject needed):**
> Sure thing — here's how to {task}:
>
> 1. {step_1}
> 2. {step_2}
> 3. {step_3}
>
> If you want, I can do step {n} for you right now — just say "go." Otherwise the docs for this live at {docs_url}.

**When to use:** Tenant asks a how-to question that maps to a known workflow. Source: Linear's "extension of the product" support philosophy + Plain's recommendation that the AI agent should offer to take the action, not just describe it.

#### Template 12 — Tenant: technical issue with their store

**Subject:** Looking into your {issue_area} issue
**Body:**
> I dug into your store and here's what I found:
>
> {diagnostic_output}
>
> {if_fixable_now}: I went ahead and fixed it — try it now and let me know.
> {if_needs_their_action}: Here's what you need to do: {action_steps}
> {if_outside_my_scope}: This is something I don't have a tool for. I've pinged Karli on this — expect a reply within {founder_sla_hours} hours.

**When to use:** API key broken, webhook misfiring, sync failure, etc. The Operator must run a diagnostic before responding, not just acknowledge.

#### Template 13 — Bug report (tenant)

**Subject:** Got it — logged the bug
**Body:**
> Thanks for catching this. I've logged it as {bug_id} with the details you sent.
>
> What you saw: {customer_description}
> What should happen: {expected_behavior}
> Repro steps I captured: {steps}
>
> Workaround for now: {workaround_or_none}
>
> I'll update you here when it ships. If you see it again before then or you have a screen recording, drop it here.

**When to use:** Reproducible defect in the product. The Operator files into the internal incidents/bug log (already exists per `project_phase_1_2_shipped`).

#### Template 14 — Feature request (tenant)

**Subject (chat):**
> Logged. Your request was: "{request_summary}"
>
> I've added it to the backlog with a note tying it to your account. We don't promise everything, but every request gets read. Two things help us prioritize: (1) the workaround you're using now, and (2) whether this is a blocker or a nice-to-have. If you have a minute to share, drop it below.

**When to use:** Tenant asks for a feature. Source: Linear's Customer Requests workflow — every request gets attached to the customer record so when the feature ships, the loop closes automatically. Also follows fdback.io's intake-form spec (what, why, current workaround, blocker?).

#### Template 15 — Subscription cancellation (tenant)

**Subject:** Cancelling your subscription
**Body:**
> Confirmed — your subscription will end on {period_end_date}. You'll keep full access until then, and your store will continue working after (we don't break your storefront, ever).
>
> A few things to know:
> – Your data stays exported and downloadable for 90 days at {export_url}
> – You can come back anytime; account history is preserved
> – No prorated refund on the current period, per our terms
>
> One question if you have 20 seconds: what made you cancel? It really does help us. No wrong answer.

**When to use:** Tenant initiates cancel via UI or via message. Source: every B2B SaaS churn-survey playbook ever; specifically structured after Help Scout's "be respectful at the door" cancellation pattern.

---

## Section 3: Escalation rules

The Operator must NEVER assume it can de-escalate a hot situation. The cost of a missed escalation is a chargeback, a Twitter post, or a lawsuit threat that becomes real. The cost of a false-positive escalation is a 30-second founder glance at Slack.

### Keyword-triggered immediate escalations

If the inbound message contains any of these (case-insensitive substring match), escalate immediately, do not draft a reply, ping the founder:

```
chargeback / charge back / dispute the charge
attorney / lawyer / legal action / sue / sued / lawsuit
BBB / Better Business Bureau / FTC / Attorney General / AG complaint
twitter / X / TikTok / Instagram + (post / blast / call out / expose)
data breach / GDPR / CCPA / privacy violation / data deletion / right to be forgotten
security incident / hacked / compromised / unauthorized access
fraud / fraudulent / stolen
threat / threatening / harm
press / journalist / reporter / news
medical / health emergency / safety / injured / hurt
```

Source: synthesized from Plain's escalation triggers ("anger, legal threats, executive complaints, chargeback mentions"), Intercom's 2025 Transformation Report's compliance-risk routing, and SupportLogic's escalation-matrix factors.

### Sentiment + frequency triggers (cumulative)

A single message reads at sentiment X on a 0–1 scale (negative = higher). Escalate if:
- Single message scores > 0.75 negative
- Conversation cumulative score crosses 1.5 across exchanges (per SupportLogic's emotional-accumulation model — frustration compounds)
- 3 or more messages from the same email/customer in 24h on the same thread
- ALL CAPS for > 50% of a message > 20 words
- Repeated profanity (not single instance)

### Dollar-threshold escalation

Per-tenant configurable, defaults:
- Auto-refund up to $30 on end-customer orders
- Auto-refund up to $50 on SaaS subscription billing (within Stripe's 30-day window)
- Anything above: draft the refund, hold for tenant or founder approval respectively
- ANY refund > $200 always requires founder approval regardless of policy

### Repeat-contact escalation

3rd email from same `from_email` in 24h on the same ticket thread → escalate. Pattern from Plain's "customer effort" metric — if a customer needs to write 3 times, something is wrong with our handling or the answer.

### Off-policy / outside-tool-surface

If the request involves anything the Operator's current tools can't do:
- Account merging / deletion outside automated flow
- Custom contract terms
- Custom integration work
- Anything involving a third party we don't already integrate with
- Tax / legal / regulatory questions

→ template-acknowledge ("I'll need to loop in a human on this") + escalate.

### Per-escalation payload

When escalating, the Operator must send (to founder via Slack or email, configurable):
1. The full conversation thread
2. The specific trigger that fired (keyword? sentiment? threshold?)
3. The Operator's draft response if it has one, marked HOLD
4. Customer context: how long they've been a customer, lifetime spend, prior incidents
5. Suggested action: refund / clarify / no-action / urgent-call

Modeled after Plain's "AI hands off with full context so the human doesn't start from zero" principle.

---

## Section 4: Sentiment detection for AI-led support

We have Claude. We do not need a separate sentiment ML model. Use the model to classify on each inbound message with a structured output.

### Lightweight signal extraction

Single prompt-call returns:

```json
{
  "primary_emotion": "angry|frustrated|confused|neutral|happy|anxious",
  "urgency": "low|medium|high|critical",
  "topic": "refund|wismo|defect|sizing|technical|billing|other",
  "escalation_keywords_present": ["chargeback", "lawyer"],
  "customer_effort_signal": "first_contact|repeat_contact|exhausted",
  "recommended_action": "auto_reply|draft_for_approval|escalate"
}
```

This becomes the routing input for everything downstream. Don't fine-tune anything; the model is good enough out of the box and we can iterate the prompt weekly based on misroutes.

### Angry vs. confused — the key distinction

Most "negative" support messages are actually confusion misread as anger. The clue is the verb tense and pronoun use:
- **Angry:** "you" + past tense + value judgment. "You charged me twice. This is ridiculous."
- **Confused:** "I" + present tense + uncertainty. "I think I might have been charged twice? Not sure."
- **Anxious:** future tense + worst-case framing. "If this doesn't ship by Friday I'm going to be in serious trouble."

Each needs a different opening:
- Angry → acknowledge the wrong, fix it, no excuses. "You're right — I'm seeing the duplicate charge. Refunding now."
- Confused → clarify with facts, no apology needed if no wrong occurred. "Let me check. I see one charge of $X on {date}. That's the only one."
- Anxious → reassurance + concrete commitment. "I see your concern. Your order is on track for {date} delivery."

### When to soften tone vs. match urgency

- **Soften** when the customer is angry but we're at fault. Match their seriousness, not their volume. Don't get cute. No exclamation points, no emoji.
- **Match urgency** when the customer is anxious about time. Get to the point in sentence 1.
- **Slow down** when the customer is confused. Numbered steps, short sentences.
- **Never** mirror profanity or hostility back. Stay flat and competent.

### The "calm down" anti-pattern

Forbidden phrases (the Operator should never emit these):
- "Please calm down"
- "Relax"
- "Take a breath"
- "I understand you're upset, but..." (the "but" negates the empathy)
- "Unfortunately our policy is..."
- "I apologize for any inconvenience this may have caused" (corporate-clichéd; Help Scout calls this out specifically)
- "As I mentioned..." (sounds condescending)
- "With all due respect..."
- "It's not our fault that..."

Preferred phrases (HEARD method + Help Scout patterns + Linear's CX writing style):
- "I can see why that's frustrating."
- "You're right — that shouldn't have happened."
- "Here's what I can do right now:"
- "I hear you. Let me fix it."
- "That's on us, not on you."
- "I want to make sure I understand exactly what happened."

Specifically validating the emotion ("frustrating" works better than "upset" — less emotionally charged, more action-oriented) per the cognitive-empathy research cited by GigaBPO and Harvard Business Review.

---

## Section 5: Refund decisioning

### The 30-day money-back operational reality

Public guidance from WebsitePolicies, Usercentrics, and iubenda converges on these rules for a credible 30-day MBG:
- Calendar days from delivery (not from purchase), unless physical goods didn't ship — then from purchase
- No questions asked under $X (tenant configurable, default $30)
- Photo/proof required for "damaged" or "defective" claims
- Original shipping non-refundable on customer-initiated returns; refundable on merchant-error returns
- Restocking fees range 10–20% industry-standard but we recommend tenants skip them for sub-$50 POD items — the friction kills repeat business

### Partial vs. full refund vs. replacement

Decision matrix:

| Situation | Default action |
|---|---|
| Item never arrived, within carrier window | Wait + tracking link |
| Item never arrived, past carrier window | Offer reship OR full refund (customer choice) |
| Item arrived defective, photo provided | Replacement + keep original |
| Item arrived defective, no photo | Request photo before acting |
| Wrong size, customer-initiated | 25% credit OR full refund, no replacement |
| Wrong item shipped (our error) | Full replacement + keep original |
| Customer changed mind, within 30 days | Full refund, customer pays return shipping for items > $30 |
| Customer changed mind, past 30 days | Store credit OR decline |
| Chargeback initiated | Issue full refund immediately, dispute the chargeback with proof later if appropriate |

### "Refund AND let them keep the item" — when it's actually cheaper

Per Amazon's published returnless-refund guidance and Shopify's 2026 returnless-refund analysis:
- Item COGS + reverse logistics > item resale value → returnless refund
- For POD where every item is made-to-order: the unit has zero resale value once shipped. Reverse shipping is pure cost.
- Heuristic: ANY POD refund under $40 should be returnless. Over $40, ask for the item back unless reverse shipping > 30% of item value.

Save the goodwill, save the operational overhead, prevent the chargeback.

### Chargeback prevention

From Radial's 15-best-practices guide, Signifyd's merchant guide, and Verifi RDR / Ethoca alert documentation:
- 86% of chargebacks are "friendly fraud" — customer disputes a legitimate transaction
- Most chargebacks originate 30–90 days post-purchase
- Verifi RDR alerts give a 72-hour window to refund before the chargeback locks in — wire this into the operator if billing volume warrants
- If we see ANY chargeback-adjacent language in an inbound, the right move is to refund proactively. The chargeback fee alone ($15–25) plus the dispute time is more expensive than the refund.
- Clear billing descriptor on the credit card statement is the single biggest chargeback preventer — make sure tenant Stripe accounts have human-readable descriptors

---

## Section 6: The support → product loop

Linear's CX team treats every support conversation as potential product feedback. We should too.

### Extracting feature requests + bugs

Every conversation gets classified by the operator into one of:
- `pure_support` — answer and close, no signal
- `bug_evidence` — open or update an issue in the bug log
- `feature_request` — append to backlog with verbatim customer quote
- `confusion_signal` — append to docs-improvement queue (this is a UX defect, not a feature gap)

Where they go in our codebase:
- Bugs: existing incidents/bug log (already shipped per Phase 1)
- Feature requests: new table `feature_requests` with columns `(tenant_id, raw_text, classified_summary, source_conversation_id, votes, status)`
- Docs improvements: `docs_gaps` table, same shape

The Operator's `record_note` tool already exists — extend it with `record_feedback(kind, summary, source_conversation_id)`.

### The Linear-style closure

When a feature ships:
- Operator gets a `feature_shipped` event hook
- Operator scans `feature_requests` for related entries
- Operator emails each requester: "You asked for X. We just shipped it. Here's how to use it."

This is the highest-leverage retention move in any SaaS. Cheap to build, expensive to omit.

### "Ask 5 customers why they signed up" — Linear move

Once a week, the Operator should pick 5 active tenants (weighted toward new + high-spend) and DM them: "What were you trying to do when you signed up, and did you get it?" Log answers in `tenant_intent_log`. The founder reads it on Sunday for 10 minutes. This is the difference between building features and building the right features.

---

## Section 7: SLAs that actually matter for early SaaS

### Track

| Metric | Target | Why |
|---|---|---|
| First response time (chat, tenant) | < 30 sec | AI, no excuse |
| First response time (email, tenant) | < 1 hour 24/7 | Sets us apart from human-only competitors |
| First response time (email, end-customer-on-merchant-behalf) | < 4 hours | Industry top-quartile per Lorikeet |
| Resolution time (low-complexity) | < 24 hours | Most issues are simple |
| Resolution time (high-complexity, needs founder) | < 72 hours | Realistic with one human |
| Escalation rate | < 20% of conversations | Klarna learned the hard way that going below this hurts CSAT on complex stuff |
| CSAT (if measured) | Target 85%+ (SaaS top-quartile per SurveyVista) | Industry SaaS average is 78% |
| Repeat contact rate | < 15% | Klarna's repeat-contact rate ROSE under AI-only — leading indicator of bad routing |
| Time-to-founder when escalated | < 60 min in business hours, < 6 hours overnight | Karli's day-job reality |

### Don't track (yet)

- NPS (vanity at this scale, noisy with N < 500)
- Number of conversations handled (volume, not outcome)
- "Customer effort score" (good conceptually, hard to operationalize manually; revisit at 100+ tenants)
- Number of canned-response uses (means nothing; quality > activity)

The single most-important meta-metric: **% of conversations resolved without founder involvement**. Klarna's reversal happened because that number was high but masking quality decay. Pair it with repeat-contact-rate to catch the same trap.

---

## Section 8: Operator rules extracted

These slot into the existing operator system prompt (per `project_operator_agent.md`).

1. **Two-tier identity.** When responding to a tenant, you are "The Operator." When drafting a reply on a tenant's behalf to their end-customer, you are the tenant's brand voice — never reveal you are AI, never mention The Operator or Black Vault.

2. **Acknowledge before solving.** Every reply begins with a sentence that restates the specific problem in the customer's words. No "I understand your issue" — name the issue.

3. **Never use forbidden phrases.** No "calm down," no "I apologize for any inconvenience," no "unfortunately our policy." See Section 4 anti-patterns list.

4. **Validate the emotion explicitly.** Use "frustrating," not "upset" or "angry." Validate before solving. Cite the specific situation, not a generic.

5. **Diagnose before responding to technical tenant issues.** Run the relevant tool (webhook check, API key probe, sync state) BEFORE drafting a reply. The reply should include findings.

6. **Refund under threshold = act, over threshold = draft.** Default thresholds: $30 end-customer auto, $50 tenant-subscription auto, $200 hard ceiling requires founder regardless.

7. **Returnless refund is the default for POD under $40.** Reverse shipping costs more than the item. Don't make customers ship POD goods back unless > $40 retail.

8. **Escalate on keyword match, not on negotiation.** If "chargeback / lawyer / BBB / press / breach" appears, stop, escalate, do not try to talk them down — that's the founder's call.

9. **Match conversation tier to escalation target.** Tenant escalations → founder. End-customer escalations → tenant (it's their brand, their relationship). Never escalate end-customer issues to the founder.

10. **Close the feedback loop.** Every conversation must classify into pure_support / bug_evidence / feature_request / confusion_signal. Bugs go to incident log. Feature requests get logged with verbatim quote and the customer's identifier so we can email them when it ships.

11. **Speak in concrete next steps with ETAs.** Never end a message with "we'll get back to you." End with "I'll check back by {specific_datetime}" or "expect an update within {n} hours."

12. **One follow-up rule.** If a customer doesn't reply after our solution, send one polite follow-up at 48 hours and then close the conversation. Don't pester.

---

## Section 9: Code/tool changes for our codebase

### New operator tools

```ts
// lib/operator/tools/support.ts

triage_support_message(message_id, source: 'tenant_chat'|'tenant_email'|'merchant_inbox')
  → { sentiment, urgency, topic, keywords_hit, recommended_action, draft_response }

draft_customer_response(message_id, template_id, variables)
  → { rendered_body, confidence_score, recommendation: 'send'|'hold_for_review' }

escalate_to_founder(conversation_id, trigger, draft_response_if_any, context)
  → posts to Slack channel #operator-escalations + emails karli@blackvault.studio

probe_tenant_health(tenant_id)
  → { shopify_connection, printful_connection, webhook_last_fired, sync_status, last_order, payment_status }

issue_refund(order_id, amount, reason, refund_type: 'returnless'|'standard')
  → uses Shopify refund API + Stripe if applicable; respects threshold rules

open_printful_claim(order_id, defect_type, photo_urls, description)
  → uses Printful Reports API

record_feedback(kind: 'bug'|'feature_request'|'docs_gap', summary, source_conversation_id, customer_quote)
  → writes to appropriate internal log

classify_conversation(conversation_id)
  → assigns final tag: pure_support|bug_evidence|feature_request|confusion_signal
  → triggers downstream actions (e.g., notify feature requester on ship)
```

### Wiring points

- **In-app chat (existing `/operator` route):** add support-triage middleware to every incoming tenant message before LLM call
- **Webhook from Shopify/Klaviyo:** new endpoint `/api/webhooks/customer-message` that ingests end-customer messages from tenant inboxes (Klaviyo Service or Shopify Inbox), runs triage, drafts reply, surfaces in tenant dashboard for approve/send
- **Escalation Slack app:** new minimal Slack workflow that posts to `#operator-escalations` channel with conversation context + one-click "approve refund / send reply / dismiss" buttons
- **Cron:** add nightly job to scan feature_requests table for items shipped this week and email requesters

### Data it reads

- `Klaviyo Service Conversations API` (for tenants using Klaviyo)
- `Shopify Customer + Order + Refund API` (for any Shopify-connected tenant)
- `Printful Order + Report API` (claim filing, fulfillment state)
- `Stripe Subscription + Refund API` (for SaaS-side billing)
- our internal `audit_log`, `incidents`, `feature_requests`, `docs_gaps` tables
- CEREBRO graph (via existing `cerebro_query` tool — for "have we seen this before?" lookups against past incidents)

### Settings per tenant

```ts
type TenantSupportConfig = {
  auto_refund_threshold_usd: number  // default 30
  auto_send_responses: boolean        // default false (drafts for review)
  brand_voice_examples: string[]      // 3-5 sample replies the tenant wrote
  escalation_email: string            // tenant's escalation email
  refund_policy_days: number          // default 30
  inbox_provider: 'klaviyo'|'shopify_inbox'|'gmail_oauth'|'none'
  founder_escalation_enabled: boolean // when tenant explicitly wants Karli looped in for hard cases
}
```

### Failure modes to test before launch

- Operator drafts a refund for the wrong customer (cross-tenant data leak)
- Operator triggers Printful claim against the wrong order
- Escalation Slack pings the founder for false-positive keyword (e.g., "I'd sue for this much chocolate" jokingly)
- AI hallucinates a refund amount that doesn't match Shopify order total → enforce server-side bounds-check before any refund call

---

## Sources

- [Plain — Agentic support stack 2026](https://www.plain.com/blog/agentic-support-stack-2026)
- [Plain — Customer infrastructure platform 2026](https://www.plain.com/blog/customer-infrastructure-platform-2026)
- [Plain — Customer support for PLG B2B SaaS in 2026](https://www.plain.com/blog/customer-support-plg-b2b-saas-2026)
- [Plain — AI support tools for B2B SaaS 2026](https://www.plain.com/blog/ai-support-tools-b2b-saas)
- [Klarna AI assistant — first month results](https://www.klarna.com/international/press/klarna-ai-assistant-handles-two-thirds-of-customer-service-chats-in-its-first-month/)
- [Klarna reverses AI layoffs — case study](https://www.digitalapplied.com/blog/klarna-reverses-ai-layoffs-replacing-700-workers-backfired)
- [When the metrics lie — Klarna AI case study](https://chadbockius.com/case-studies/klarna/)
- [Klarna walks back AI overhaul](https://lasoft.org/blog/klarna-walks-back-ai-overhaul-rehires-staff-after-customer-service-backlash/)
- [Intercom — 2026 Customer Service Transformation Report](https://www.intercom.com/customer-transformation-report)
- [Intercom — Customer service metrics in the age of AI](https://www.intercom.com/blog/customer-service-metrics-ai/)
- [Lorikeet — First response time benchmarks 2026](https://www.lorikeetcx.ai/articles/first-response-time-benchmark-customer-service)
- [Lorikeet — Customer service metrics that actually matter 2026](https://www.lorikeetcx.ai/articles/customer-service-metrics)
- [Help Scout — 13 response templates for tricky customer service emails](https://www.helpscout.com/customer-service-examples/)
- [Help Scout — Go-to scripts for 16 tricky customer service scenarios](https://helpscout.com/helpu/support-email-responses)
- [Help Scout — Ecommerce customer support software](https://www.helpscout.com/industry/ecommerce/)
- [Linear — How our CX team works](https://linear.app/now/cx-in-linear)
- [Linear — Building what customers need, not just what they ask for](https://linear.app/now/building-what-customers-need)
- [Linear — How we think about customer experience](https://linear.app/now/how-we-think-about-customer-experience-at-linear)
- [Linear — Customer Requests](https://linear.app/customer-requests)
- [Reclaim — Closing the customer feedback loop with Intercom + Linear](https://reclaim.ai/blog/customer-feedback-saas-startups-intercom-linear)
- [GigaBPO — Customer service de-escalation (HEARD method)](https://gigabpo.com/customer-service-de-escalation/)
- [GigaBPO — De-escalating angry customers](https://gigabpo.com/de-escalating-angry-customers/)
- [Myra Golden — 57 phrases to de-escalate any angry customer](https://www.myragolden.com/blog/57-phrases-to-de-escalate-any-angry-customer)
- [TextExpander — 30+ empathy statements for customer service 2026](https://textexpander.com/blog/30-phrases-to-show-empathy-in-customer-service)
- [Call Centre Helper — Empathy statements for customer service](https://www.callcentrehelper.com/empathy-statements-customer-service-94643.htm)
- [Maestroqa — Positive positioning to improve call center CX](https://www.maestroqa.com/blog/using-positive-positioning-to-improve-call-center-cx)
- [SupportLogic — Escalation matrix best practices](https://www.supportlogic.com/resources/blog/the-escalation-matrix-best-practices-and-going-beyond/)
- [SupportLogic — Sentiment agent for real-time analysis](https://www.supportlogic.com/supportlogic-sentiment-agent/)
- [Lowcode Agency — AI negative sentiment detection](https://www.lowcode.agency/blog/ai-negative-sentiment-detection)
- [Everworker — AI ticket escalation playbook](https://everworker.ai/blog/ai_ticket_escalation_playbook_support_leaders)
- [Radial — 15 best practices to prevent ecommerce chargeback fraud](https://www.radial.com/insights/prevent-ecommerce-chargeback-fraud)
- [Webgility — Ecommerce chargeback prevention post-purchase](https://www.webgility.com/blog/ecommerce-chargeback-prevention)
- [Signifyd — Ultimate merchant guide to preventing chargebacks](https://www.signifyd.com/blog/ultimate-merchants-guide-to-preventing-chargebacks/)
- [Shopify — Returnless refunds: how they work for retailers 2026](https://www.shopify.com/blog/returnless-refunds)
- [Shopify — Customer service management best practices 2026](https://www.shopify.com/blog/customer-service-management)
- [Shopify — Customer service workflows 2026](https://www.shopify.com/blog/workflow-customer-service)
- [Shopify — Customer service automation tips](https://www.shopify.com/blog/customer-service-automation)
- [Consumer Affairs — Amazon's 'Keep It' returnless refunds growing](https://www.consumeraffairs.com/news/amazons-keep-it-returnless-refunds-are-growing-111125.html)
- [Luzern — Amazon returnless refund analysis](https://www.luzern.co/blog/the-amazon-returnless-refund)
- [Printful — Top 5 policies your store should copy](https://www.printful.com/blog/top-5-printful-policies-your-store-should-copy)
- [Printful — Returns: quality vs change of mind](https://help.printful.com/hc/en-us/articles/360014006840-How-are-returns-handled-for-quality-issues-vs-customer-change-of-mind)
- [Printful — How to report a problem with your order](https://help.printful.com/hc/en-us/articles/360014066699-How-do-I-report-a-problem-with-my-order)
- [WebsitePolicies — Money-back guarantee, instant profit increase](https://www.websitepolicies.com/blog/money-back-guarantee)
- [Usercentrics — 30-day money-back guarantee](https://usercentrics.com/guides/terms-of-service/30-day-money-back-guarantee/)
- [iubenda — Money-back guarantee](https://www.iubenda.com/en/blog/money-back-guarantee/)
- [SurveyVista — CSAT benchmarks](https://surveyvista.com/csat-benchmarks/)
- [Fullview — CSAT benchmarks by industry 2025](https://www.fullview.io/blog/csat-benchmarks-by-industry)
- [Fullview — 20 essential customer support metrics 2025](https://www.fullview.io/blog/customer-support-metrics)
- [Userpilot — CSAT, CES, NPS customer satisfaction benchmarking SaaS](https://userpilot.com/blog/customer-satisfaction-benchmarking/)
- [Klaviyo — AI customer service platform for ecommerce](https://www.klaviyo.com/solutions/customer-service)
- [Klaviyo — What's new spring 2026](https://www.klaviyo.com/whats-new)
- [Freshworks — SaaS customer support strategies 2026](https://www.freshworks.com/customer-service/support/saas/)
- [Pylon — AI-powered customer support reduces response times](https://www.usepylon.com/blog/ai-powered-customer-support-guide)
- [Pylon — SaaS customer support best practices](https://www.usepylon.com/blog/saas-customer-support-what-it-is-best-practices)
- [Groove — 5 principles of effective SaaS customer support](https://www.groovehq.com/blog/saas-customer-support)
- [PartnerHero — SaaS customer support best practices](https://www.partnerhero.com/blog/saas-customer-support-best-practices)
- [Supportbench — What counts as escalation in B2B support](https://www.supportbench.com/what-counts-as-escalation-b2b-support-clear-definitions-examples/)
- [Bolsterbiz — Tier 1 to tier 2 escalation criteria](https://bolsterbiz.com/escalation-criteria-for-routing-customer-inquiries-from-tier-1-to-tier-2-support-2/)
- [Allstars IT — Tier 1, 2, 3 SaaS support structure](https://www.allstarsit.com/blog/tier-1-tier-2-tier-3-how-to-structure-a-tech-support-team-for-saas")
- [Sapling — 26 apologize-for-the-delay templates](https://sapling.ai/snippet-templates/we-apologize-for-the-delay)
- [Sendcloud — 4 shipment delay email templates for ecommerce](https://www.sendcloud.com/shipment-delay-email-template/)
- [Omnisend — 10 apology email templates with real examples](https://www.omnisend.com/blog/apology-email-to-customer/)
- [Flodesk — 5 shipping delay email templates](https://flodesk.com/tips/shipping-delay-email-templates)
- [Fdback.io — How to collect and prioritize feature requests SaaS guide 2026](https://fdback.io/blog/how-to-collect-and-prioritize-feature-requests-for-a-saas-product)
- [Savio — 12 feature request software tools for SaaS](https://www.savio.io/blog/feature-request-software-tools-for-saas/)
- [Stripe Atlas — Help and support](https://support.stripe.com/topics/atlas)
- [eDesk — Best practices for Shopify customer service](https://www.edesk.com/blog/shopify-customer-service-guide/)
- [Get Monetizely — How to measure first response time and resolution SLA](https://www.getmonetizely.com/articles/how-to-measure-first-response-time-and-resolution-sla-a-complete-guide-for-saas-executives)
- [Path to Millions — Print on demand orders gone wrong](https://www.gopathtomillions.com/2025/07/print-on-demand-order-issues.html)
