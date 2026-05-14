# Stripe billing operations — operator rules

Full research: `.openclaw/research/stripe-billing-operational-playbook-2026-05-14.md`.

Operating reality of running subscriptions: Stripe Smart Retries recover ~38%
of failed payments at baseline. Top-tier SaaS hits 70-85% by layering email
+ SMS + in-app dunning. Involuntary churn is 20-40% of total SaaS churn —
the playbook below catches it.

## Rule 1 — Failed payments: layer dunning, don't rely on Smart Retries alone

When `invoice.payment_failed` fires:
- Smart Retries handles the attempt itself (Stripe-side, automatic)
- Operator sends email at attempt 1 (gentle), attempt 3 (urgent), attempt 5 (final)
- Operator sends in-app banner from attempt 2 onward
- After Smart Retries exhausts, operator pauses (not cancels) the tenant + emails
- Manual reactivation via tenant clicking "update card" → operator retries the invoice

Visa caps retries at 15 per 30-day window; Mastercard at 35. Custom retry
logic that exceeds these can trigger fines up to $15k. Always respect.

## Rule 2 — Webhook events are at-least-once, NOT exactly-once

Stripe guarantees at-least-once delivery. Same event can arrive twice. The
operator's webhook handlers must:
- Record `idempotency_key` (Stripe event id) BEFORE writing state
- Make the idempotency-record + state-write atomic (same DB transaction)
- Treat each event as "make this state true," never "transition from X to Y"
  (events arrive out of order — upsert, don't increment)

A crash between idempotency-record and state-write creates duplicate fulfillment.
This is a common production bug for ALL new Stripe integrations.

## Rule 3 — Customer Portal pause deprecated 2024-08-01 — build pause in-app

The Stripe-hosted customer portal no longer supports pause. The operator
must offer pause-instead-of-cancel via in-app UI calling `pause_collection`
directly. 51.8% of at-risk subscribers will pause if offered. 10-20% of
cancellation attempts convert to pauses when the option exists.

When a tenant clicks "Cancel": always offer pause first ("pause for 1, 2,
or 3 months and you'll keep your store + data"). Cancel as the secondary path.

## Rule 4 — FTC click-to-cancel rule is enforced (2024)

Cancellation must be at least as easy as signup. Contact-support-only
cancellation flows are an FTC enforcement target. The operator never
gates cancellation behind a human conversation.

Acceptable: in-app "Cancel subscription" button → confirmation modal →
done. Forbidden: "Email us to cancel," "Call this number," "Schedule a
call with retention," any flow that takes more than 2 clicks.

## Rule 5 — Trial ending: customer.subscription.trial_will_end event

Stripe fires this 3 days before trial ends. The payload contains customer
ID, NOT email — operator must `customers.retrieve()` to get the email.

Operator behavior:
- T-72h: gentle reminder, "trial ends in 3 days, here's what you'll have"
- T-24h: final reminder + card-on-file check
- T+0: charge attempt → if successful, welcome to paid; if failed, dunning

## Rule 6 — Refunds: refund proactively if dispute is filed

Stripe charges fees per dispute (~$15 regardless of outcome). For amounts
< $50, ALWAYS refund proactively if the customer disputes — winning the
dispute costs more than the refund.

Refund decision matrix:
- Customer-requested refund within 30-day window: auto-approve up to $250
- Customer-requested refund 30-90 days: surface to founder
- Customer-requested refund >90 days: decline, refer to support
- Dispute filed (any amount <$50): auto-refund + close
- Dispute filed (amount >$50): submit pre-drafted evidence + monitor

## Rule 7 — Subscription upgrades: prorate immediately by default

When a tenant upgrades mid-cycle:
- Use `proration_behavior: 'create_prorations'` (default)
- Charge the difference NOW, not at next invoice
- Surface the prorated amount in chat before triggering

Downgrades:
- Schedule for end of period (don't refund the unused premium time)
- Use Subscription Schedules API for clean downgrade-at-period-end

## Rule 8 — Operator escalation matrix for billing events

Auto-handle: failed payment attempts 1-4, trial reminders, plan upgrades
(if amount < $500), invoice generation, receipt emails, card-update flows.

Surface to founder: refunds >$250, plan downgrades (loss signal), disputes,
chargebacks, any subscription >$1000/month going past_due.

Always escalate: legal threats in cancellation messages, mention of FTC/AG,
fraud markers, chargeback rate >1% for any customer cohort.

## Rule 9 — Card-expiring-soon: be proactive

Stripe fires `customer.source.expiring` ~30 days before card expiry. The
operator auto-emails the tenant a card-update link (not a generic dunning
message — this is a PROACTIVE save, not a reactive one).

Failure to update → 60-day reminder → 7-day reminder → expire-day reminder
→ if still not updated, the tenant is now in failed-payment territory.

## Rule 10 — Pricing operations: never offer a discount without expiration

If the operator ever offers a discount (win-back, retention save, etc.),
it MUST have an expiration date. Permanent discounts erode pricing trust
and create grandfather-pricing nightmares.

Coupon defaults:
- Win-back: 30% off for 3 months, expires in 14 days
- Retention save: 1 month free, expires in 7 days
- Beta tester: 50% off year 1, then full price (clearly disclosed)
Never offer "lifetime" anything.
