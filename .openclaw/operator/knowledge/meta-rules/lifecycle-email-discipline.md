# Lifecycle email discipline — operator rules

Full research (real Klaviyo benchmarks + real brand templates + Apple MPP
adaptation + POD-specific patterns + 8 operator tool specs):
`.openclaw/research/lifecycle-email-automation-playbook-2026-05-14.md`.

The data: flow emails generate **18x more revenue per recipient** than
campaign emails (Klaviyo's published benchmarks). 3-email sequences beat
1-email sequences by **6.5x revenue lift**. A welcome series is the
highest-ROI marketing automation any DTC brand can have.

## Rule 1 — Every brand needs the 5-flow minimum before paid traffic

Before recommending ANY paid acquisition (ads, influencer, SEO investment),
the operator verifies these 5 flows are LIVE in the tenant's Klaviyo:

1. **Welcome series** (3-5 emails, 7-14 days) — captures opt-in conversions
2. **Abandoned cart** (3 emails, 24 hours) — $3.65 avg revenue per recipient
3. **Browse abandonment** (1-2 emails) — 9.6x conversion vs campaign baseline
4. **Post-purchase** (1-3 emails) — review request, cross-sell, sizing help
5. **Winback** (2-3 emails, lapsed 60-180 days) — recovers ~5% of dormant list

Paid traffic without these flows is leaky-bucket. Operator refuses to
help spend money on ads until the flows ship.

## Rule 2 — Open rate is broken; use revenue-per-recipient (RPR) and click rate

Apple Mail Privacy Protection (MPP, 2021) silently opens every email on
Apple devices for "privacy." ~58% of global email opens are now Apple
Mail. Open rates are inflated 40-68% across the board.

**Operator behavior:**
- NEVER use "Opened email" as a trigger or filter in any flow
- NEVER lead a tenant report with open rate
- Report revenue per recipient (RPR), click rate, placed-order rate
- If a tenant asks "what's a good open rate?" — answer "open rate is
  broken post-MPP. Here's what to look at instead: ..."

## Rule 3 — Single-CTA per email

Emails with one call-to-action generate **371% more clicks** than
multi-CTA emails (cited in research). Every operator-generated email
template enforces single-CTA.

If a tenant insists on a "shop the collection" + "read the story" + "follow
on IG" stack: surface the data, recommend single-CTA, defer to tenant
preference if they override.

## Rule 4 — Pre-send compliance gate (CAN-SPAM, TCPA, GDPR)

Before ANY operator-triggered email or SMS leaves the system:

**Required for all emails (CAN-SPAM):**
- Physical mailing address in footer
- Functional unsubscribe link
- Truthful subject line (no clickbait)
- Sender identification (no spoofing)

**Required for emails to EU residents (GDPR):**
- Lawful basis documented (consent at opt-in OR legitimate interest)
- Opt-out as easy as opt-in
- Data controller info

**Required for SMS (TCPA):**
- Explicit opt-in record (double opt-in for highest defensibility)
- "Reply STOP to unsubscribe" in every message
- Quiet hours (no SMS 8pm-8am local time per state laws)

The operator REFUSES to fire any campaign that fails the gate.

## Rule 5 — Welcome series: must include expectation-setting email

Most brands' welcome series sells too hard, too fast. Top performers
(Liquid Death, Allbirds, Aimé Leon Dore tier) lead with expectation-setting:
"Here's what to expect: 2 emails/week, new drops, no spam."

**Operator default template structure:**
1. Email 1 (immediate): "Welcome + here's what to expect" (NO product push)
2. Email 2 (Day 2): Brand story / founder voice
3. Email 3 (Day 5): First product spotlight + discount code
4. Email 4 (Day 9): Social proof / customer photos
5. Email 5 (Day 14): "Stay subscribed?" — explicit opt-in check (improves
   long-term engagement)

Email 1 with NO product push is the load-bearing differentiator. Skip
this and the entire series performs ~30% worse.

## Rule 6 — Apparel-specific: sizing-help BEFORE first cart abandonment

For apparel tenants, the operator inserts a "sizing help" email
TRIGGERED by first product view of an apparel item, BEFORE the standard
abandoned-cart flow fires.

This reduces "wrong size" return rate by ~25% per the research. Returns
on POD are expensive (Printful charges restocking fees on some products).

## Rule 7 — Post-purchase: print-method-branched care emails

Apparel + POD has print-method-specific care:
- DTG (direct-to-garment): cold wash, inside out, no fabric softener
- DTF (direct-to-film): cold wash, no high-heat tumble dry
- Sublimation: care varies by fabric blend (polyester ≠ cotton)
- Embroidery: care minimal, but address loose-thread expectations

**Operator behavior:** after `order.fulfilled` webhook, fire a care
email branched by print method on the order's items. Generic "wash with
care" emails miss the actionable specifics.

## Rule 8 — Deliverability: SPF + DKIM + DMARC are non-negotiable

Since Google + Yahoo + Microsoft tightened bulk-sender requirements
(May 2025), missing DMARC = direct-to-spam.

**Operator behavior:** during bootstrap_store, verify the tenant's
sending domain has:
- SPF record set
- DKIM signing configured in Klaviyo
- DMARC policy at minimum `p=none` (better: `p=quarantine` once warmed up)

Refuse to enable Klaviyo sending without all three. Surface DNS instructions
the tenant follows in their registrar.

## Rule 9 — Domain warm-up for new senders

A brand-new sending domain hitting Gmail from 0 → 5000 sends/day in
week 1 = guaranteed spam folder.

**Operator behavior:** new-domain sending schedule:
- Week 1: max 500 sends/day, only to highly-engaged segment
- Week 2: max 2000/day
- Week 3: max 5000/day
- Week 4+: scale based on engagement metrics

Klaviyo's "Smart Sending" handles some of this — but the operator must
verify the ramp is on, not assume.

## Rule 10 — Suppress unengaged after 90 days

List hygiene = deliverability. Subscribers who haven't opened (pre-MPP)
or clicked (post-MPP) in 90 days hurt sender reputation.

**Operator behavior:** quarterly auto-suppress sweep of any subscriber
with zero clicks in 90 days. Surface count to tenant ("Suppressing 412
subscribers who haven't clicked since Feb — improves your inbox rate").

Don't ask permission. Surface as info. Spam-folder reputation damages
ALL future sends.

## Rule 11 — SMS: use sparingly, transactional first

SMS converts ~3x higher than email for urgent / time-sensitive offers,
but unsubscribe rates are ~4x higher. Overuse kills the list permanently.

**Operator default rules:**
- Transactional SMS (order shipped, delivered): always opt-in for
- Marketing SMS: max 4/month per subscriber
- Quiet hours: 8pm-8am local time, never violate
- Major holidays (US Thanksgiving, Christmas, New Year): pause marketing,
  transactional only

Refuse to send 5+ marketing SMS in a calendar month to the same
subscriber, even if the tenant pushes.

## Rule 12 — Tenant onboarding: don't overload with 12 flows on day 1

When a new tenant lands, don't try to wire all 5 flows + SMS + 8
campaign templates immediately. Sequence:
1. Day 0: welcome series live (highest ROI, lowest setup)
2. Week 1: abandoned cart live
3. Week 2: post-purchase live
4. Week 4: browse abandonment + winback live
5. Month 2: SMS opt-in collection starts; SMS flows go live month 3

Faster ≠ better. Tenant's brand voice needs time to settle before
locking it into 5 different drip sequences.
