---
title: "Stripe billing + churn operations playbook"
kind: ops-runbook
date: 2026-05-14
tags: [stripe, billing, dunning, churn, refunds, subscriptions, saas-ops]
related_concepts:
  - the-operator-saas
  - byok-pricing
  - managed-payments
  - tenant-lifecycle
  - involuntary-churn
  - cerebro-knowledge-graph
---

# Stripe billing operational playbook

## TL;DR

Wiring `stripe.checkout.sessions.create()` is roughly 10% of the work required
to run a subscription business. The other 90% is the operational layer: what
happens when a card declines on day 28 of month four, when a tenant wants to
downgrade mid-cycle, when a chargeback lands on a customer who is still
actively using the product, when a webhook arrives twice or out of order, or
when a renewal silently lapses because the trial ended on a Saturday.
Industry data shows 20-40% of all SaaS churn is involuntary (failed payments
that recover trivially with the right plumbing), and a properly designed
cancellation flow saves another 15-30% of voluntary cancels. This playbook
maps every operational gap between our current `lib/stripe.ts`
(checkout-session + webhook-verify only) and "subscriptions actually work in
production" — with cited sources, exact Stripe API surfaces, and the new
functions our codebase needs.

---

## Section 1: Payment failure handling (dunning)

### 1.1 The lifecycle

When an automatic subscription charge fails, Stripe transitions the
subscription through a deterministic state machine. The default path is:

```
active  ->  past_due  ->  (retries)  ->  canceled | unpaid | active(recovered)
```

- `active` -> `past_due`: triggered the moment the first charge attempt
  on a renewal invoice fails. `invoice.payment_failed` fires immediately
  with `attempt_count=1`.
- `past_due`: Stripe Smart Retries schedules subsequent attempts. Each
  retry that fails fires another `invoice.payment_failed`, with
  `attempt_count` incrementing and `next_payment_attempt` populated to
  the next scheduled retry timestamp.
- Terminal transition: configurable in Dashboard -> Billing -> Subscriptions
  -> "When all retries fail." Three options:
  - `cancel` (default for most SaaS) -> `customer.subscription.deleted`
  - `mark_uncollectible` -> subscription stays at `past_due`, invoice
    becomes uncollectible (write-off)
  - `pause` -> subscription transitions to `unpaid` and stops generating
    new invoices until manually resumed
- Recovered: any retry that succeeds fires `invoice.payment_succeeded`
  and `customer.subscription.updated` with `status=active`.

### 1.2 Stripe Smart Retries: what it does and where it fails

Smart Retries is an ML-driven retry scheduler trained on hundreds of
billions of transactions across the Stripe network. It uses an Auto-ML
ensemble (transformers + XGBoost variants) over 500+ signals: customer
location, card BIN history, time of day, day of week, issuer behavior
patterns, business industry, currency, and seasonality. The model
predicts the *single timestamp* most likely to succeed for a given
declined attempt.

Stripe's published recovery results:
- ~38% of failed payments are recovered by Smart Retries alone
  (baseline cited by Churnkey and Redux Payments).
- Up to 8 attempts within a 2-month window by default (configurable to
  1/2/3 weeks or 1/2 months).
- For each $1 a customer spends on Billing, Smart Retries returns $9 in
  recovered revenue (Stripe's published number).
- Recovered subscriptions continue ~7 more months on average
  (Stripe + Churnkey data).

Smart Retries **does NOT** trigger when:
- No payment method is on the customer (or all are detached).
- The decline code is a hard decline (`card_declined` for `lost_card`,
  `stolen_card`, `fraudulent`, etc.) — see Stripe decline-code taxonomy.
- The card is India-issued (RBI mandate auto-debit restrictions).
- The Connect account is disconnected.

Where Smart Retries is weak:
- **Soft declines only.** It cannot resurrect a `card_declined` from an
  expired or cancelled card without a new card on file. This is the
  primary gap layered dunning tools fill (Churnkey, ChurnBuster,
  Baremetrics Recover).
- **Silent.** It sends no email, no SMS, no in-app banner. The user
  often does not know their payment failed until the subscription
  cancels. This is the biggest involuntary-churn leak in a stock
  Stripe wiring.
- **No retry on card-network limits.** Visa caps retries at 15 per
  rolling 30-day window, Mastercard at 35. Exceeding can incur fines up
  to $15k. Stock Smart Retries respects these; custom retry logic must.

### 1.3 Industry standard email cadence (and what to actually say)

The proven dunning cadence (Baremetrics, Profitwell Retain, Churnkey
benchmarks) is 4-6 messages over 14-21 days. The numbers:

| Day | Action | Tone | CTA |
|-----|--------|------|-----|
| 0 (failure detected) | Email #1 | Helpful, "your card was declined" | Update payment method (1-click) |
| 1-2 | Smart Retry #1-2 (silent) | n/a | n/a |
| 3 | Email #2 | Reminder + reason if available ("expired card") | Update payment method |
| 7 | Email #3 | Soft urgency, "we'll lose your data" | Update + offer to talk |
| 14 | Email #4 | Final urgency, service-impact warning | Update or contact support |
| 21 | Email #5 | "We've paused your account" | Reactivation link |
| 30 | Subscription canceled | Win-back sequence begins | Discount/reactivation |

Industry-benchmark recovery rates:
- Stripe Smart Retries alone: ~38% of involuntary churn.
- Smart Retries + email cadence: 60-70%.
- Smart Retries + email + SMS + in-app paywall + card updater:
  70-85% (Churnkey "70% of involuntary churn recovered in 2024";
  Baremetrics cites 45-70% range across the 4-email sequence).

What to actually say in each email — copy that works:

**Email #1 (Day 0).** Subject: "Your payment to The Operator didn't go
through." Body: factual ("your Visa ending 4242 declined"), one-line
explanation if the decline_code is shareable (`expired_card`,
`insufficient_funds`), single CTA ("Update payment method"). No threat,
no urgency. ~80 words max.

**Email #3 (Day 7).** Subject: "We're still trying — quick update?"
Body: humanize ("we know payment issues happen"), value reinforcement
(remind them what they get — "your AI operator has handled 47 customer
conversations this week"), offer to talk if there's a real problem.
Single CTA, but secondary "Reply to this email" link to a human.

**Email #4 (Day 14).** Subject: "Your account will pause in 7 days."
Now state the consequence specifically: which features stop, what data
is preserved, what happens after 30 days of non-payment. This is the
email that recovers the highest dollar volume — users who genuinely
missed it act here.

**Anti-patterns to avoid:**
- Hostile/dunning language ("PAYMENT OVERDUE", capitalized).
- Identical content across all 4 emails (training the user to delete).
- Failing to include the decline reason when it's safe to share
  (expired card, insufficient funds).
- Hiding the "update payment method" CTA behind a login wall.

### 1.4 Webhook events to listen for (the dunning state machine)

| Event | Fires when | Operator action |
|-------|------------|-----------------|
| `invoice.payment_failed` | Any charge attempt fails | Trigger email #1 if attempt_count==1, otherwise update internal `payment_state` |
| `invoice.payment_action_required` | 3DS / SCA challenge needed | Email with 3DS challenge link from `next_action.use_stripe_sdk` |
| `customer.subscription.updated` | Any subscription change, including status=past_due | Mirror state into our DB; gate feature access |
| `customer.subscription.deleted` | Terminal cancellation (post-retry exhaustion) | Begin win-back cohort; preserve data 30 days |
| `invoice.payment_succeeded` | Retry succeeded | Clear payment_state; thank-you email if recovered after >1 attempt |
| `customer.source.expiring` | Card expires this month | Pre-emptive email "your card expires soon" (this is the #1 lever for *preventing* involuntary churn) |
| `payment_method.automatically_updated` | Network-pushed card update (Visa Account Updater) | Log; no user-facing action |

### 1.5 What to expose to the user vs handle silently

Expose:
- All payment failures (after attempt #1) via email.
- An in-app banner once subscription is `past_due` for >3 days.
- "Update payment method" deep link in every email.

Handle silently:
- The first retry (typically within a few hours; let Smart Retries cook).
- 3DS challenges that auto-resolve via stored authorization.
- Card updates pushed by the network (Visa Account Updater /
  Mastercard ABU).

### 1.6 The "20-40% of SaaS churn is involuntary" stat

The most-cited number across SaaS billing literature: 20-40% of all
subscription churn is *involuntary* — i.e., a card failed, not a user
choice. Sources:
- ChartMogul SaaS Retention Report: 20-30% of cancellations are
  involuntary in the typical SMB-SaaS cohort.
- Churnkey: "involuntary churn usually accounts for 20-30% of a
  business's churn" and dunning solutions can cut it >50%.
- Baremetrics Recover: cites 25% of lapsed subscriptions are purely
  payment failures; recovered subscriptions continue ~7 more months.
- Stripe internal data: failed payments impact up to 10% of ARR
  for stock-wired SaaS without active dunning.

The math for The Operator at $99/mo, 100 tenants: at 25% involuntary
churn and a 70% recovery rate via proper dunning, that's an annualized
~$5k/year of revenue that the cadence above recovers versus stock
Stripe alone. At 1000 tenants, $50k/year. This work pays for itself in
the first 30 days at any meaningful scale.

---

## Section 2: Prorations + upgrades/downgrades

### 2.1 `proration_behavior` — the three values that matter

Set on `subscriptions.update()` and inside `subscription_schedules`
phases. Defaults to `create_prorations`.

| Value | Behavior | When to use |
|-------|----------|-------------|
| `create_prorations` | Default. Generates proration line items, but they appear on the *next* upcoming invoice (not invoiced immediately). | Standard mid-cycle plan change where you're OK waiting until next billing date for net charge. |
| `always_invoice` | Generates prorations AND immediately invoices the customer (attempts payment now). | Upgrades. The user expects to pay for the upgrade now. |
| `none` | No prorations. New price kicks in at next billing cycle; user keeps current price until then. | "Schedule downgrade for end of period." Also: when changing terms with no in-cycle effect. |

### 2.2 The proration math

Example: customer on $99/mo, 15 days into the month, upgrades to $299/mo.

- Credit for unused 15 days at old price: -$49.50
- Charge for remaining 15 days at new price: +$149.50
- Net charge if `always_invoice`: $100.00, billed immediately.
- At next billing date: full $299 charges normally.

### 2.3 Common gotchas

- **Mid-cycle upgrade with a failed payment method.** `always_invoice`
  creates an invoice that may itself fail collection, kicking the
  subscription into `past_due` for an *upgrade*. Always check that the
  default payment method is healthy before applying `always_invoice`.
- **Downgrade with `create_prorations`.** Generates a credit on the next
  invoice, which can result in a $0 invoice and confuse accounting.
  Many SaaS prefer `none` + scheduled change for downgrades.
- **`billing_cycle_anchor=now`** combined with `proration_behavior=none`
  resets the billing date and charges the full new price immediately.
  Useful for "restart the cycle on upgrade" UX. Risky if the user did
  not expect a fresh full charge.
- **Multi-item subscriptions.** When updating items, you must pass the
  `id` of the existing subscription item or it gets *added* as a new
  line. The destructive way (replace items wholesale) requires
  `clear_usage=true` on the removed items if metered.

### 2.4 Schedule a downgrade for end of period

The cleanest path: convert the subscription to a `subscription_schedule`
with two phases.

```ts
const schedule = await stripe.subscriptionSchedules.create({
  from_subscription: subscriptionId,
});

await stripe.subscriptionSchedules.update(schedule.id, {
  phases: [
    {
      // Phase 1: current period at current price (kept as-is)
      items: [{ price: currentPriceId, quantity: 1 }],
      start_date: schedule.phases[0].start_date,
      end_date: currentPeriodEnd,
      proration_behavior: "none",
    },
    {
      // Phase 2: new (downgraded) price starts at period end
      items: [{ price: downgradePriceId, quantity: 1 }],
      start_date: currentPeriodEnd,
      proration_behavior: "none",
    },
  ],
  end_behavior: "release", // detach schedule once phase 2 starts
});
```

Stripe fires `subscription_schedule.created`, then
`subscription_schedule.updated`, then at phase transition
`subscription_schedule.released` + `customer.subscription.updated`.

Alternative (simpler): `stripe.subscriptions.update(id, { cancel_at:
periodEnd })` cancels at period end without re-enrollment. Use only if
the user is actually leaving, not downgrading.

The Stripe Customer Portal supports scheduled downgrades natively as
of 2024-10-28 (set `schedule_at_period_end` in portal configuration).

---

## Section 3: Cancellation flows

### 3.1 "Pause instead of cancel" — the proven retention move

Industry data (MarketingCharts study cited by Churnkey, Baremetrics):

- 51.8% of at-risk subscribers said they would be "very or extremely
  likely" to pause if offered.
- Companies that offer pause at the cancellation step convert 10-20% of
  cancels into pauses.
- Use of pause features grew 66% in 2024 across SaaS.
- Pause works best for: budget cuts (~1/3 of voluntary churn in 2024),
  time constraints, cyclical usage patterns, seasonal businesses.
- Pause does NOT help when: the user never got value, the product
  doesn't fit, a competitor won them. In those cases pause is just
  delayed cancel and clutters your active count.

### 3.2 Pause API — and the deprecation footgun

Stripe's `pause_collection` API supports three behaviors:

| `pause_collection.behavior` | Effect |
|------------------------------|--------|
| `void` | New invoices are immediately voided; no charges, no emails, no webhooks for upcoming invoices. Most user-friendly. |
| `keep_as_draft` | New invoices generated as drafts with `auto_advance=false`. Resumed manually. |
| `mark_uncollectible` | Existing customer balance applies, then marks uncollectible. For accounting precision. |

**Footgun:** Stripe deprecated `pause_collection` in the Customer
Portal as of 2024-08-01. If you want self-serve pause, you must build it
yourself — call `pause_collection` from your own UI, do not rely on the
portal config flag (it no longer accepts it). The API itself is fully
supported; only the portal toggle was removed.

Resume via `stripe.subscriptions.resume(id, { billing_cycle_anchor:
"now" })`. Note: resume only works on subscriptions with
`collection_method=charge_automatically`. The `resumes_at` field can
schedule an auto-resume.

### 3.3 Cancellation surveys — what to ask, what NOT to ask

Two questions, that's it (per ProsperStack + Userpilot research):
1. "What's the single biggest reason you're canceling?" (multiple
   choice: too expensive / missing feature / not enough time / found
   alternative / no longer needed / other).
2. "How can we improve?" (open text, optional).

What NOT to do:
- Multi-page surveys before letting the user cancel. Hostile UX,
  damages brand, often illegal under recent FTC click-to-cancel rule
  (2024). Cancel must be at least as easy as signup.
- Asking for justification ("are you sure?") more than once.
- Requiring the user to email support to cancel (banned by FTC).
- Surveys that don't route into save-offers. Collecting data without
  using it to retain is performance theater.

### 3.4 Win-back / save offers — when to use, when to refuse

Discounting trade-off (multiple SaaS pricing sources, Lesia Polivod
2026 analysis):
- Discounting lowers LTV by ~30% on discounted cohorts due to higher
  price sensitivity and churn rate.
- Win-back campaigns recover 10-15% of churned customers when
  segmented properly.
- Typical save-offer: 20-25% off for 3 months for high-LTV cancels.

Route by churn reason from the survey:
- "Too expensive" -> offer 20% off for 3 months OR a downgrade path.
- "Missing feature" -> roadmap link + sales/CS conversation, NO
  discount (price wasn't the issue).
- "Not using it" -> pause offer (1/2/3 months), NO discount.
- "Found alternative" -> ask which one (competitive intel), polite
  goodbye, NO discount (they've already moved).
- "No longer needed" -> graceful cancel, send to win-back cohort.

Refuse a save-offer when: the customer has a history of disputes,
when they explicitly say "I don't want a discount, I want to leave,"
or when the LTV is too low to justify CAC payback on the discount.

### 3.5 Self-serve vs require-contact-support

Default to self-serve cancel. The FTC's 2024 Click-to-Cancel rule
mandates that canceling must be at least as easy as signing up; if
the user signed up in two clicks via Stripe Checkout, cancel must
also be ~two clicks. Contact-support-only flows are now an
enforcement target.

Acceptable to surface a "talk to us" option *alongside* the cancel
button — but never *instead of* it.

### 3.6 Reactivation — make it 1-click

Cancellations should be 1-click reversible for 30+ days. The flow:
- After cancel, subscription has `cancel_at_period_end=true` (still
  active until period end). One click un-cancels it
  (`cancel_at_period_end: false` via subscriptions.update).
- Post-period-end (fully canceled): preserve data 30-90 days. A
  reactivation click creates a new subscription on the same customer
  ID, keeps invoice history intact, restores access.
- Email at day 14 post-cancel: "Reactivate in 1 click" — recovers
  3-7% of voluntary churn at zero CAC.

---

## Section 4: Refunds + chargebacks

### 4.1 Refund API mechanics

```ts
// Full refund of a charge
await stripe.refunds.create({
  charge: chargeId,        // OR payment_intent
}, { idempotencyKey: `refund:${chargeId}:${reason}` });

// Partial refund
await stripe.refunds.create({
  payment_intent: piId,
  amount: 4900,            // cents
  reason: "requested_by_customer", // optional: requested_by_customer | duplicate | fraudulent
}, { idempotencyKey: `refund:${piId}:partial:${amount}` });
```

You can issue multiple partial refunds against one charge; total cannot
exceed the original. Refund failures (reasons: `declined`,
`expired_or_canceled_card`, `insufficient_funds` — yes, refunds can
fail because Stripe's balance can't cover, `lost_or_stolen_card`,
`unknown`) credit the amount back to the Stripe balance within 30 days
and fire `refund.updated` with `status=failed`.

**Always pass an idempotency key.** Refund endpoints honor idempotency
on Stripe's side; reusing a key returns the original result instead of
double-refunding. Our convention should be:
`refund:{payment_intent_or_charge}:{reason}:{requestedAt}` — uniquely
ties the refund to the user-visible event that triggered it.

### 4.2 Refund webhooks

| Event | When |
|-------|------|
| `refund.created` | Refund initiated |
| `refund.updated` | Status changes (e.g., bank acknowledged, ARN attached, or failed) |
| `charge.refunded` | Charge marked refunded (full or partial) |

### 4.3 When to refund proactively vs require a request

Refund proactively:
- Service outage that prevented use (Stripe outage, our outage > 4h).
- Mis-billing (we charged for setup twice, etc.).
- Customer was charged after they had a confirmed cancel in our
  records but a race condition let the renewal fire.

Require explicit request (and route through support):
- "I forgot to cancel" past the policy window — judgment call, lean
  generous for low-touch SaaS (under $200/mo), it costs more in
  support time than refunding.
- "I didn't get value" — qualify with the cancellation survey first.

Never:
- Auto-refund based on usage thresholds without a human review (gameable).
- Refund without recording the reason — you'll lose chargeback
  defenses later if a pattern emerges.

### 4.4 Chargeback / dispute evidence checklist (subscriptions)

Stripe's official evidence types for recurring-charge disputes,
prioritized by what actually wins:

**Authorization & identity:**
- AVS (Address Verification System) match.
- CVC confirmation at the time of signup.
- 3DS authentication records if SCA was triggered.
- Customer IP address at signup, matching country to billing.

**Service evidence (the most powerful for SaaS):**
- Login logs proving customer accessed the product post-charge.
- Activity logs (API calls, dashboard loads) within the disputed
  billing period.
- Email confirmations sent and opened (deliverability provider logs).
- Specific feature use (downloads, generated assets, etc.).

**Policy evidence:**
- Screenshot of T&C checkbox on the signup form, with the visible
  text "By subscribing, you agree to recurring monthly billing of
  $X until canceled."
- Refund policy displayed at checkout (extract the relevant
  recurring-charge clause; do not dump the full T&C).
- Cancellation policy with explicit timeframes.

**Communication:**
- Receipts emailed for each charge.
- Renewal reminders sent (where required by jurisdiction — CA, NY,
  several EU states mandate pre-renewal notice for annual plans).
- Any back-and-forth with the cardholder before the dispute.

Stripe's documented guidance: organize chronologically, keep file
length short ("relevant excerpts"), match each file to a specific
evidence-type slot in the dispute response form. Visa CE 3.0
disputes specifically look at prior transaction history on the same
card — a 6-month payment record is the single strongest signal for
"this is a real customer, not fraud."

Deadlines: 7-21 days after dispute opened, varying by network. Set
an internal SLA of 48 hours to respond — late evidence loses cases.

### 4.5 30-day money-back guarantee — operational reality

If we advertise a 30-day guarantee, we need:
- A clear `refundable_until` timestamp stored at signup
  (`subscription.created_at + 30 days`).
- An operator path that refunds without negotiation if requested
  within window.
- A path to *partially* refund the monthly recurring while keeping
  the $499 setup non-refundable, if that's our policy (state it
  explicitly).
- Public refund policy page that matches the marketing.

### 4.6 Real refund policies to model from

| Company | Monthly | Annual | Notes |
|---------|---------|--------|-------|
| Notion | Refund within 3 days of invoice | Refund within 30 days of invoice | Distinguishes by billing cadence; matches user expectation |
| Microsoft Azure | n/a | 30 days from renewal | For annual subscriptions only |
| Form-to-Notion | 30 days from first bill, 100% | n/a | Aggressive, builds trust |
| Linear (per public T&C) | Pro-rated refund on annual; no monthly refunds | 30-day window for annual | Industry-standard B2B SaaS |
| Vercel | Case-by-case; no published guarantee | Case-by-case | Higher-touch, enterprise-leaning |

Recommended for The Operator ($99/mo + $499 setup):
- Monthly: full refund of latest charge if requested within 7 days
  AND tenant hasn't shipped product (verifiable).
- Setup fee: refundable in full within 14 days if onboarding hasn't
  completed; non-refundable after onboarding success.
- Annual (if/when we add it): 30-day full refund.

---

## Section 5: Failed webhook handling

### 5.1 Signature verification edge cases

Stripe signs every webhook with HMAC-SHA256, sending `t=<timestamp>`
and `v1=<signature>` in the `Stripe-Signature` header. The Node SDK's
`stripe.webhooks.constructEvent(payload, sig, secret)` handles
verification, but there are sharp edges:

- **Raw body required.** If your framework parses JSON before the
  webhook handler, signature verification fails. In Next.js App
  Router, you must read the raw body: `await req.text()`, not
  `await req.json()`. Our current `verifyWebhook(payload, signature)`
  is fine *only if* the caller passes the raw string.
- **5-minute replay window.** Default tolerance is 300 seconds.
  Beyond that, `constructEvent` throws even with a valid signature.
  Do not lower tolerance to 0 — it disables replay protection
  entirely.
- **Secret rotation.** You can configure multiple endpoints in Stripe
  with different secrets; if you rotate the secret on an existing
  endpoint, there's a window where in-flight retries arrive with the
  old signature. Stripe's CLI supports keeping both old and new
  secrets active during rotation.
- **Connect platforms** need separate secrets for `account.*` events
  vs subscription events; for our single-tenant setup this isn't
  relevant yet.

### 5.2 Idempotency + replay protection (in our code)

Stripe guarantees **at-least-once** delivery, never exactly-once.
Retries continue for up to 3 days in live mode with exponential
backoff. The endpoint will see duplicates.

Idempotency pattern (the one that actually works):

```ts
async function handleStripeEvent(event: Stripe.Event) {
  // 1. Check + insert into idempotency table in a single transaction.
  //    Use the event.id as the unique key.
  const result = await db.transaction(async (tx) => {
    const exists = await tx.from("stripe_events")
      .where("id", event.id)
      .first();
    if (exists) return { duplicate: true };
    await tx.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      received_at: new Date(),
      payload: event,
    });
    return { duplicate: false };
  });
  if (result.duplicate) return; // 200 OK, no work

  // 2. Do the actual fulfillment in the SAME transaction or with
  //    saga compensation. If the fulfillment write is in a separate
  //    tx and crashes between idempotency-insert and fulfillment,
  //    you've recorded "seen" but not fulfilled — next retry skips.
  //    Solutions:
  //    a) Same DB tx for both writes (preferred)
  //    b) Two-phase: insert with status=pending, do work, update to
  //       status=processed; recovery sweeper re-runs pending events
}
```

Key invariant: **the idempotency record and the business work must be
atomic.** If they aren't, a crash between them creates a "fulfilled but
not recorded" hole that the next retry double-fulfills.

### 5.3 Webhook event reordering — yes, it happens

Stripe does not guarantee order, even for events on the same object.
The classic failure: `customer.subscription.updated` (status=active)
arrives *before* `customer.subscription.created`. Our handler tries
to update a row that doesn't exist yet.

Two patterns to defend:
1. **Upsert everything.** Treat every webhook as "make this state
   true," not "transition from X to Y." Insert-or-update on every
   handler. Source-of-truth comes from the event payload, not from
   what we previously thought the state was.
2. **Reconcile from API.** When an event handler can't find its
   parent record, call the Stripe API directly (`subscriptions.retrieve`,
   `customers.retrieve`) and rebuild. The event becomes a *signal*
   to refetch, not a delta.

For our setup, pattern 1 is sufficient. The tenant row is the parent;
the subscription row upserts under it; both are keyed by Stripe IDs.

### 5.4 Response time

Stripe expects a 2xx within ~30 seconds; longer and the request is
marked failed and retried. Do not do heavy work in the handler:

```ts
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const payload = await req.text();
  const event = verifyWebhook(payload, sig);

  // 1. Persist event for at-least-once / replay
  await persistEvent(event);

  // 2. Enqueue async work
  await enqueue("stripe-event", { eventId: event.id });

  // 3. Return immediately
  return new Response(null, { status: 200 });
}
```

For our scale (low hundreds of events/day initially), it's fine to
process inline as long as the work stays under ~5 seconds. Defer to
a queue when we cross 50 events/minute or any handler takes >10s.

### 5.5 The "missed webhook" recovery pattern

Webhooks WILL be lost — network blips, deploys, signature mismatches
during secret rotation, downtime. The recovery pattern:

```ts
// Run this on a cron every 6h
async function reconcileMissedWebhooks() {
  const sinceTs = lastSuccessfulSync(); // from our DB
  const events = await stripe.events.list({
    created: { gte: sinceTs },
    limit: 100,
    // paginate via starting_after
  });
  for (const event of events.data) {
    await handleStripeEvent(event); // idempotent, safe to re-run
  }
}
```

This costs essentially nothing (Stripe's events.list is free), and
because our handler is idempotent, replaying already-processed events
is a no-op. Stripe retains events for 30 days; we should reconcile at
least daily.

---

## Section 6: Pricing operations

### 6.1 Trial -> paid conversion mechanics

Stripe trials (`trial_period_days` on subscription create) are the
easy path. Lifecycle:

- Subscription created -> `customer.subscription.created` (status=trialing).
- 3 days before trial end -> `customer.subscription.trial_will_end` fires.
- Trial ends -> Stripe finalizes invoice, charges PM, fires
  `invoice.created`, `invoice.finalized`, then `invoice.paid` (or
  `invoice.payment_failed`). Subscription transitions to `active`
  via `customer.subscription.updated`.

**Gotcha:** `customer.subscription.trial_will_end` ONLY contains the
customer ID, not the email. You must `customers.retrieve()` to send
the "your trial ends in 3 days" email. Cache the email at signup to
avoid this extra call.

**Gotcha:** If no payment method is on file when trial ends, Stripe
*does not* charge automatically; the subscription transitions to
`past_due` immediately with an unpaid invoice. To force collection of
PM at signup, use Checkout Session with
`payment_method_collection=always` OR `default_incomplete` payment
behavior. For The Operator, our current Checkout Session flow
collects PM at signup, so this is handled — but flag for future
"trial without card" experiments.

### 6.2 Pause / Resume API

Covered in Section 3.2. Reminder: Customer Portal pause was
deprecated 2024-08-01; build the pause UI in our app and call
`stripe.subscriptions.update(id, { pause_collection: { behavior:
"void" } })` directly.

### 6.3 Adding a coupon mid-subscription

```ts
// Apply a coupon to an existing subscription
await stripe.subscriptions.update(subId, {
  coupon: "WIN_BACK_20_OFF_3MO",
});

// Or remove a coupon
await stripe.subscriptions.update(subId, { coupon: "" });
```

Coupons can be `percent_off` or `amount_off`, `once` / `forever` /
`repeating` (with `duration_in_months`). For save-offers, prefer:
- `percent_off=20, duration=repeating, duration_in_months=3`
  ("20% off for 3 months") — limits LTV impact.
- Never `forever` discounts in a save flow — that's permanent
  margin loss for one moment of churn risk.

Coupons attached to a subscription discount every upcoming invoice
for the duration. Track coupon cohorts in our own DB (which save-offer
won which customer) for retention analysis later.

### 6.4 Multi-currency considerations

Not relevant day-one for The Operator (USD only). Forward-looking
notes when we go multi-currency:
- One Price per currency per Product. Prices are immutable; you do
  not "change the currency" of a Price.
- Subscriptions are pinned to their Price's currency forever.
- Stripe Tax + multi-currency requires Tax registrations per
  collection jurisdiction.
- FX is set at invoice finalization; settlement currency is your
  Stripe account's default.

---

## Section 7: Operator-side rules extracted

For our internal operator agent (the LLM-driven CS assistant), here
are the routing rules for billing events. **Auto-handle** means the
operator acts without human approval. **Escalate** means it drafts an
action and asks the human (us) to confirm.

1. **Failed payment, attempt #1.** Auto-handle: no email yet, let
   Smart Retries try (already silent for 1-2 days). Log internally.

2. **Failed payment, attempt #2+ (>24h since first failure).**
   Auto-handle: send email #1 from the cadence in Section 1.3. Update
   in-app banner.

3. **Subscription canceled by Stripe (retry exhaustion).** Auto-handle:
   send the day-21 "we paused your account" email; trigger win-back
   cohort. Escalate to human if customer has LTV >$1000 or has been
   active for >12 months — those deserve a personal outreach.

4. **Cancellation request via in-app flow.** Auto-handle: route through
   the survey + save-offer flow per Section 3. The operator can offer
   pause and the standard 20%-off-3-months coupon without approval.
   Escalate to human for: any custom discount ask, any "I'm leaving
   because [our product is broken]" answer (treat as a bug report
   first), or annual customers >6 months remaining.

5. **Refund request, within policy window, monthly customer.**
   Auto-handle: issue the refund via `stripe.refunds.create`, send
   confirmation email, log reason. No human approval needed under $500
   total lifetime billed.

6. **Refund request, outside policy window OR annual customer OR
   >$500 lifetime.** Escalate: operator drafts the refund and asks
   human to approve. Default-approve unless something looks fraudy
   (multiple refund history, recent dispute).

7. **Plan change (upgrade).** Auto-handle: apply with
   `proration_behavior=always_invoice`. Confirm with user via in-app
   modal before submitting. No human approval.

8. **Plan change (downgrade).** Auto-handle: schedule via
   `subscription_schedules` for end-of-period with
   `proration_behavior=none`. Send confirmation email. No human
   approval.

9. **Dispute received (`charge.dispute.created` webhook).** Escalate
   immediately. The operator auto-collects evidence (login logs, AVS,
   3DS records, receipts) and drafts a response — human must approve
   submission. Stripe gives us 7-21 days; the operator should have
   draft ready within 24h.

10. **Card expiring this month (`customer.source.expiring`).**
    Auto-handle: email the customer with an update-card link. No
    human approval. This single rule prevents more involuntary churn
    than any other email.

---

## Section 8: Code changes for our `lib/stripe.ts`

Current state: `getStripe()`, `isStripeConfigured()`,
`isStripeLiveMode()`, `createCheckoutSession()`, `verifyWebhook()`.
That's about 10% of the surface we need. Functions to add, with
one-line signatures + purpose:

### Subscription lifecycle

```ts
// Cancel at end of period (the default "cancel" — reversible until period_end)
export async function cancelAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription>;

// Reverse a pending cancel-at-period-end
export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription>;

// Hard-cancel immediately (for fraud / admin / refund-and-go)
export async function cancelImmediately(subscriptionId: string, opts?: { prorate?: boolean; reason?: string }): Promise<Stripe.Subscription>;

// Pause via pause_collection.behavior="void" with optional resumes_at
export async function pauseSubscription(subscriptionId: string, resumesAt?: number): Promise<Stripe.Subscription>;

// Resume a paused subscription
export async function resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
```

### Plan changes

```ts
// Upgrade now with immediate proration + invoice
export async function upgradePlan(subscriptionId: string, newPriceId: string): Promise<Stripe.Subscription>;

// Downgrade scheduled for end of period via subscription_schedules
export async function scheduleDowngrade(subscriptionId: string, newPriceId: string): Promise<Stripe.SubscriptionSchedule>;

// Cancel a pending scheduled change (downgrade) before it takes effect
export async function cancelScheduledChange(scheduleId: string): Promise<Stripe.SubscriptionSchedule>;
```

### Dunning / payment failure

```ts
// Apply a save-offer coupon to a subscription
export async function applyCoupon(subscriptionId: string, couponId: string): Promise<Stripe.Subscription>;

// Retry an open invoice manually (force one-shot collection attempt)
export async function retryInvoice(invoiceId: string): Promise<Stripe.Invoice>;

// Pull current payment status flags for a subscription (status, attempt_count, next_payment_attempt)
export async function getPaymentStatus(subscriptionId: string): Promise<{ status: string; attemptCount: number; nextAttemptAt: number | null; openInvoiceId: string | null }>;
```

### Refunds

```ts
// Refund the most recent charge on a subscription (or a specific invoice)
export async function refundInvoice(invoiceId: string, opts?: { amount?: number; reason?: Stripe.RefundCreateParams.Reason; idempotencyKey?: string }): Promise<Stripe.Refund>;

// Refund the setup-fee one-time payment (separate from subscription invoices)
export async function refundSetupFee(checkoutSessionId: string): Promise<Stripe.Refund>;
```

### Disputes

```ts
// List open disputes (operator dashboard)
export async function listOpenDisputes(): Promise<Stripe.Dispute[]>;

// Submit evidence on a dispute
export async function submitDisputeEvidence(disputeId: string, evidence: Stripe.DisputeUpdateParams.Evidence): Promise<Stripe.Dispute>;
```

### Webhook reconciliation

```ts
// Replay events from a window — for missed-webhook recovery
export async function listEventsSince(sinceTs: number, types?: string[]): Promise<Stripe.Event[]>;

// Idempotency-aware event persistence (call from webhook handler)
// Returns true if already seen; caller short-circuits the handler.
export async function recordEventOnce(event: Stripe.Event): Promise<{ duplicate: boolean }>;
```

### Customer portal (where it still applies)

```ts
// Create a portal session for the user to manage cards / invoices /
// (limited) subscription. Pause is NOT exposed here — build that
// in-app since portal pause was deprecated 2024-08-01.
export async function createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session>;
```

### Trial conversion

```ts
// Caller invokes on customer.subscription.trial_will_end webhook
export async function sendTrialEndingEmail(subscriptionId: string): Promise<void>;
```

Total: 19 new functions on top of the existing 5. Plus a webhook
event-handler dispatcher (separate file, `lib/stripe-webhook-router.ts`)
that owns idempotency, persists every event, and routes to
domain-specific handlers (billing, lifecycle, dispute, refund).

---

## Sources

### Stripe primary docs
- [Automate payment retries (Smart Retries) — docs.stripe.com](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Prorations — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/prorations)
- [Modify subscriptions — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/change)
- [Subscription schedules — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- [Pause subscriptions — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/pause)
- [Pause payment collection — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/pause-payment)
- [Resume a subscription — Stripe API Reference](https://docs.stripe.com/api/subscriptions/resume)
- [Update a subscription — Stripe API Reference](https://docs.stripe.com/api/subscriptions/update)
- [Receive Stripe events in your webhook endpoint — docs.stripe.com](https://docs.stripe.com/webhooks)
- [Using webhooks with subscriptions — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Configure trial offers on subscriptions — docs.stripe.com](https://docs.stripe.com/billing/subscriptions/trials)
- [Configure the customer portal — docs.stripe.com](https://docs.stripe.com/customer-management/configure-portal)
- [Respond to disputes — docs.stripe.com](https://docs.stripe.com/disputes/responding)
- [Dispute evidence best practices — docs.stripe.com](https://docs.stripe.com/disputes/best-practices)
- [Idempotent requests — Stripe API Reference](https://docs.stripe.com/api/idempotent_requests)
- [Customer portal: scheduled downgrades changelog (2024-10-28)](https://docs.stripe.com/changelog/acacia/2024-10-28/customer-portal-schedule-downgrades)

### Stripe engineering / playbooks
- [How we built it: Smart Retries — stripe.com/blog](https://stripe.com/blog/how-we-built-it-smart-retries)
- [Chargebacks 101 — stripe.com](https://stripe.com/resources/more/chargebacks-101)

### Dunning + churn operator research
- [Stripe Smart Retries: FAQs and Best Practices — Churnkey](https://churnkey.co/blog/stripe-smart-retries/)
- [How to Encourage SaaS Customers to Pause — Churnkey](https://churnkey.co/blog/how-to-encourage-saas-customers-to-pause-their-subscriptions-instead-of-cancelling/)
- [Stripe Smart Retries: How They Work — Redux Payments](https://www.reduxpayments.com/blog/stripe-smart-retries-explained)
- [Stripe Failed Payments SaaS Recovery Guide — MRRSaver](https://www.mrrsaver.com/blog/stripe-failed-payments)
- [Stripe Dunning Management — Churnbuster](https://churnbuster.io/articles/stripe-dunning)
- [Stripe Revenue Recovery Ultimate Guide — Hubifi](https://www.hubifi.com/blog/revenue-recovery-stripe)
- [Best Dunning Tools for Small SaaS 2026 — Rebounce](https://www.rebounce.dev/blog/best-dunning-tools-2026)

### Baremetrics + ChartMogul + Profitwell
- [Creating a SaaS Dunning Strategy — Baremetrics](https://baremetrics.com/blog/ultimate-dunning-management-guide)
- [How to Write Effective Dunning Emails — Baremetrics](https://baremetrics.com/blog/dunning-emails)
- [Recover Failed Payments — Baremetrics](https://baremetrics.com/blog/recover-failed-payments-save-lost-revenue)
- [SaaS Retention Report 2024 — ChartMogul](https://chartmogul.com/reports/saas-retention-the-ai-churn-wave/)
- [12 Ways to Reduce SaaS Churn — Baremetrics](https://baremetrics.com/blog/proven-ways-reduce-saas-churn-rate)

### Cancellation flow + win-back
- [Cancellation Flow Examples — Userpilot](https://userpilot.com/blog/cancellation-flow-examples/)
- [Customer Exit Surveys — ProsperStack](https://prosperstack.com/blog/customer-exit-survey/)
- [Churn Win-Back Strategies — Stax Bill](https://staxbill.com/blog/churn-win-back-strategies-saas-retention/)
- [SaaS Discount Strategy 2026 — Lesia Polivod / Medium](https://medium.com/@lesiapolivod/saas-discount-strategy-2026-when-discounts-work-and-when-they-dont-e33dac0014fb)

### Webhooks + idempotency
- [Stripe Webhook Best Practices — HookRay](https://hookray.com/blog/stripe-webhook-best-practices-2026)
- [Stripe Webhooks Complete Implementation Guide — Hooklistener](https://www.hooklistener.com/learn/stripe-webhooks-implementation)
- [Best practices integrating Stripe webhooks — Stigg](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- [Handling Payment Webhooks Reliably — Sohail / Medium](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5)

### Refund policies
- [Notion Refund Policy](https://www.notion.com/help/refunds)
- [Refund Policy for SaaS Apps — TermsFeed](https://www.termsfeed.com/blog/saas-refund-policy/)
- [Dear SaaStr: Good Refund Policy for SaaS — SaaStr](https://www.saastr.com/good-refund-policy-saas-product/)

### Internal reference
- BV CEREBRO node: `reference_stripe_managed_payments_blueprint`
- BV CEREBRO node: `project_phase_2_complete_2026_05_13`
- `lib/stripe.ts` (current implementation)
