---
title: "Lifecycle email automation playbook — what every BYOK merchant must have running"
kind: marketing-playbook
date: 2026-05-14
tags: [klaviyo, email, lifecycle, abandoned-cart, welcome-series, winback, post-purchase, sms, deliverability, mpp, can-spam, tcpa]
related_concepts:
  - klaviyo-integration
  - operator-knowledge-rules
  - shopify-dtc
  - printful-pod
  - tenant-onboarding
  - revenue-per-recipient
  - apple-mail-privacy-protection
  - lib/klaviyo.ts
---

# Lifecycle email automation playbook

## TL;DR

For a Shopify + Printful POD merchant, **email flows (automations) earn roughly 18x the revenue per recipient of one-off campaigns** while consuming only ~5% of send volume — so the operator's first job on every tenant is to wire the five core flows before suggesting any campaigns. Ranked by ROI: (1) Abandoned Cart ($3.65 average RPR, $14.14 RPR for AOV >$200 stores), (2) Welcome Series (51% open rate, ~10% placed order rate on top performers), (3) Browse Abandonment (0.96% conversion vs 0.10% campaign baseline, ~6% of store revenue), (4) Post-Purchase (drives repeat rate + reviews), (5) Winback (RPR ~$0.84 but reactivates a free audience). Open rate is dead as a north-star metric after Apple MPP (which Apple Mail = ~58% of opens globally as of 2025 inflates by 40-68%); shift the merchant to **click rate, placed-order rate, and revenue-per-recipient** in every report the operator generates. The operator must verify Klaviyo is connected + SPF/DKIM/DMARC authenticated before suggesting any flow, must default to 3-email sequences (6.5x revenue lift vs 1-email), and must never recommend SMS until email's first-party-data flywheel is running.

---

## Section 1: The 5-flow minimum every brand must have

### 1.1 Welcome Series

**Purpose.** Convert a fresh email subscriber (popup opt-in or checkout opt-in) into a first-time buyer while expectations are warm. This is the single highest-engagement moment in the customer lifecycle.

**Trigger (Klaviyo).** Metric trigger: "Subscribed to List" — bound to the merchant's newsletter list. Trigger filter: "Has not placed an order" zero times over all time, so existing customers don't re-enter.

**Sequence.** 3-5 emails over 7-14 days. Klaviyo and Flowium converge on this range as the optimum; below 3 emails leaves revenue on the table, above 5 risks fatiguing a new contact who has zero brand history.

A field-tested apparel-POD sequence:

- **Email 1 (immediate, ~0 min).** Thank-you + deliver promised discount code + 1 hero-product CTA. This email earns the heaviest traffic — keep it ruthlessly single-focus.
- **Email 2 (~36-48 hours).** Founder/brand story. "Why we exist." No discount push. Builds the emotional thesis before re-pitching.
- **Email 3 (~Day 4-5).** Best-sellers / social proof. Customer photos, reviews, "as worn by ___". Repeats the discount code with urgency framing ("your 10% expires in 3 days").
- **Email 4 (~Day 7).** Discount expiration / last call. Branch: subscribers who clicked Email 1 or 3 get a softer "anything catch your eye?" version; non-clickers get the hard "code expires tonight" version.
- **Email 5 (~Day 10-12, optional).** Education content — sizing/fit guide for apparel, care instructions, "how to style it." No CTA pressure; restores the relationship for the long tail.

**Subject lines (real, sourced from Klaviyo case-study reviews and brand inboxes).**

- "Welcome to the cult." — Liquid Death (welcome flow Email 1; on-brand inversion of the generic welcome)
- "Welcome to Phlur. Enjoy 10% off your first order with code: TOPNOTE" — Phlur (the literal Klaviyo-templated formula; clarity + offer)
- "Thank You for Joining Our Saje Community. Take 15% Off Your First Purchase" — Saje
- "Maybe our best email ever" — Atoms (sent later in the series to non-converters; curiosity over clarity)
- "You're in — here's what comes next" — Klaviyo's recommended pairing of clarity + curiosity (outperforms plain "Welcome to ___")

Klaviyo's own data shows the literal subject line "Welcome to ___" generates the highest open, click, and RPR of any tested welcome subject across their customer base — but only because it's a clarity baseline. Curiosity layered on top wins A/B tests.

**Body template — Email 1 (apparel POD).**

```
Subject: Welcome to [Brand]. Here's your 10% off.
Preheader: Code BV10 — good for 7 days. One CTA, no clutter.

[Hero image: a single product, lifestyle shot, mobile-optimized]

You're in.

Use code BV10 for 10% off your first order. It expires in 7 days.

[ SHOP THE COLLECTION ]   ← single CTA, large tappable button

We make [one-line product thesis — e.g., "premium German Shepherd
apparel for dads who don't do generic"]. Tomorrow you'll hear the
why. Today, just enjoy the discount.

— [Founder first name]

P.S. We ship from [origin], orders are made on demand, average
production is 3-5 business days. Questions? Just reply.

[Unsubscribe link]   [Brand address — CAN-SPAM compliance]
```

**Benchmark performance (Klaviyo, 2025-2026 cohort).**
- Welcome series average open rate: **51.26%** (all industries, all-flow average)
- Top welcome series: 45-50% open / 8-12% conversion (Klaviyo Q4 2024 cohort)
- Top 10% welcome series RPR: **~$3.34** for stores with AOV $100-$200 / much higher above
- Fashion & apparel segmented welcome sends: open 54.21%, CTR 6.77%, RPR $91.81 (top-performing segments; not flow average — context: highly segmented top performers, useful as a ceiling)

**Common mistakes (5).**

1. Single-email welcome (forfeits 6.5x revenue lift documented in Klaviyo's abandoned-cart parallel data, which generalizes).
2. Treating the welcome as a single-discount blast — no brand story, no expectation-setting. The subscriber doesn't know what to expect next, churns the relationship.
3. Re-entering existing customers because the trigger filter is missing. Causes "Welcome!" emails to people who've bought 5x. Brand-trust suicide.
4. Buried CTA / multi-CTA emails. Single-CTA emails earn **371% more clicks** than multi-CTA layouts.
5. Sending only to "subscribed AND not yet purchased" without a separate path for "subscribed AT checkout" — the post-checkout subscriber needs an order-confirmation thread, not a discount they didn't get to use.

---

### 1.2 Abandoned Cart

**Purpose.** Recover purchase intent that's already declared itself. Highest-RPR flow in the lifecycle, period.

**Trigger (Klaviyo).** Metric: "Started Checkout" (Shopify's checkout-started event, surfaced via Klaviyo's Shopify integration). Trigger filter: "Placed Order" zero times since Started Checkout. Flow filter: "Started Checkout" at least once in the last 30 days (re-eligibility).

**Sequence.** 3 emails over ~24-48 hours.

- **Email 1: 1-4 hours after abandonment.** Klaviyo's pre-built template defaults to 4 hours; recovery-leader stores test 30-60 minutes. The 1-hour window is the sweet spot for apparel — buyer is still on the device, still reachable. Subject: product-specific.
- **Email 2: 24 hours later.** Light incentive (free shipping > discount, to preserve margin; or 10% off if margin allows). Add social proof (reviews of the abandoned product).
- **Email 3: 48 hours later.** Final urgency: "your size in [Color] is selling fast" / "we'll hold this for 24 more hours." For POD this is a fiction (no inventory holds), so phrase as honest urgency: "ready to lose the cart? we'll stop bugging you."

Multi-email sequences produce **69% more orders** than single-email (Klaviyo) and **6.5x the revenue** ($24.9M vs $3.8M in Klaviyo's customer cohort).

**Subject lines (real-brand and Klaviyo-tested).**

- "Your [Product Name] is waiting" — Klaviyo's recommended product-specific template (highest open in their A/B testing)
- "Forget something?" — generic but reliably mid-tier
- "We saved your cart" — better than "you abandoned your cart" (no buyer-shaming)
- "Still thinking about the [Product Name]?" — softer Email 2 framing
- "Last call on your [Product Name]" — Email 3 urgency

**Body template — Email 1 (apparel POD).**

```
Subject: Your [Product Name] is waiting
Preheader: We saved it for you. One tap to finish checkout.

Hey [First Name],

Looks like you got pulled away. Your cart's still here:

[Dynamic product block: image, name, size, color, price — pulled
from Klaviyo's Shopify checkout-started event]

[ FINISH CHECKOUT ]   ← single CTA, deep-link to recover URL

Free shipping on orders over $75.
Made on demand — orders ship in 3-5 business days.

— [Brand]

[Unsubscribe]  [Brand address]
```

**Benchmark performance.**
- Apparel & accessories abandoned cart: open **51.43%**, CTR **6.25%**, conversion **3.42%** (Klaviyo 2025 benchmarks)
- Average RPR across abandoned cart: **$3.65**
- AOV $100-$200 stores: abandoned cart RPR **$7.01**
- AOV >$200 stores: abandoned cart RPR **$14.14** (the highest of any flow type in Klaviyo's data)
- Top 10% abandoned cart flows: RPR **$28.89**

**Common mistakes (5).**

1. Single email. Documented 6.5x revenue loss.
2. Discounting on Email 1. Trains buyers to abandon for discounts. Lead with the product, layer offer on Email 2/3 only if needed.
3. Stale checkout URL — link expires or doesn't repopulate. Use Klaviyo's `{{ event.extra.checkout_url }}` dynamic token, not a hard-coded /cart link.
4. No suppression branch for buyers who completed checkout between Email 1 and 2. Klaviyo's "Placed Order" trigger filter must be on every node.
5. Treating "checkout started" and "added to cart" as the same trigger. Add-to-cart is a much weaker intent signal; the abandoned-cart flow should fire on Started Checkout only, and a separate (softer) Add-to-Cart flow can run if at all.

---

### 1.3 Browse Abandonment

**Purpose.** Capture the consideration tier — visitors who view a product, don't add to cart, and leave. Lowest-intent of the abandonment flows, but at scale produces ~6% of store revenue.

**Trigger (Klaviyo).** Metric: "Viewed Product" (requires Klaviyo's site-tracking snippet installed; Shopify's Klaviyo integration enables it). Trigger filter: "Started Checkout" zero times since Viewed Product, "Added to Cart" zero times since Viewed Product. Flow filter: profile has an email (anonymous browse won't trigger), and "Placed Order" zero times in last 30 days.

**Sequence.** 1-2 emails.

- **Email 1: 2-4 hours after view.** Show the viewed product dynamically. Frame as "still thinking about this?" — never "we noticed you were browsing" (creep factor).
- **Email 2: 24 hours later, optional.** Show 3-4 similar products from the same collection. "If [X] wasn't quite right, here's what else is in the line." This is where personalized product feeds outperform generic best-sellers 2-3x.

**Subject lines.**

- "Still thinking about the [Product]?"
- "You left this behind"
- "Worth a second look"
- "[First Name], we picked these for you" — Email 2, cross-sell framing
- "Want a closer look at [Product]?"

**Benchmark performance.**
- Browse abandonment conversion: **0.96%** (vs 0.10% for the average campaign — a 9.6x lift, source: Klaviyo)
- Higher open rates than abandoned cart (lower buyer-shame factor)
- Average browse abandonment RPR for AOV $100-$200: **$1.95**
- Share of total store revenue: ~6%

**Common mistakes (5).**

1. Triggering on too-low intent (e.g., homepage view). Trigger only on "Viewed Product" — a specific PDP.
2. Same subject line / copy for every recipient. Browse flow lives or dies on dynamic product blocks pulling from the actual viewed product.
3. Missing site-tracking snippet. Klaviyo's `klaviyo.js` must be on every page; if the merchant's theme strips it, no event fires.
4. Discounting on Email 1. Browse is the lowest-intent flow — a discount this early teaches the audience to wait for one. Lead with the product.
5. No suppression for cart-abandoners. The Klaviyo abandoned-cart flow should always supersede the browse flow (cart > browse signal); enforce this with a flow filter ("Started Checkout zero times since trigger").

---

### 1.4 Post-Purchase (Order Confirmation + Review Request + Cross-Sell)

**Purpose.** This is not one flow but three loosely-chained flows triggered off purchase events. Their combined job: drive a 5-star review (social proof flywheel), reduce returns (sizing/care), and tee up the next purchase.

**Trigger (Klaviyo).** Metric: "Placed Order" (Shopify). For the cross-sell node, "Order Fulfilled" or "Order Shipped." For the review request, default Klaviyo flow waits **14 days after fulfillment**.

**Sequence (3-flow chain).**

- **Email 1 (transactional, immediate).** Order confirmation. This often ships from Shopify's transactional system, not Klaviyo — but Klaviyo's branded version converts the transactional moment into a marketing moment ("here's what to expect"). For POD, set the expectation: "Your item is made-to-order. Production: 3-5 business days. Shipping: 3-7 business days after that."
- **Email 2 (shipping update, on Order Shipped event).** Tracking link + expected delivery window. Apparel-POD nuance: include a one-line care reminder ("First wash: cold, inside-out, no fabric softener — protects the print").
- **Email 3 (review request, +14 days after fulfillment).** Ask for a review. Include a 1-click rating widget; one-tap stars convert at 3-5x text-based "leave a review" CTAs.
- **Email 4 (cross-sell, +18-21 days after fulfillment).** Recommend the next product based on what they bought (not generic best-sellers — Klaviyo's product feeds let you constrain by collection or category).

**Subject lines.**

- "Your order is confirmed — here's what happens next"
- "Your [Product] just shipped"
- "How's the [Product Name] treating you?" — review request, softer than "leave a review"
- "Worn it yet? We'd love to know" — review request, conversational
- "[First Name], based on your [Product] — try this"

**Benchmark performance.**
- Post-purchase open rate: **40-45%**, repeat purchase rate: **10-15%** (Klaviyo Q4 2024)
- Order confirmation: the highest-engagement email a brand ever sends (~70-90% open rate when sent as transactional+marketing hybrid) — the most under-leveraged real estate in DTC
- Cross-sell flows attribute ~5-10% of repeat revenue for apparel POD

**Common mistakes (5).**

1. Letting Shopify's plain-text order confirmation be the only post-purchase touch. Brand it through Klaviyo.
2. Review request sent too early (Day 3 = item hasn't arrived). Standard is 14 days after fulfillment. For apparel POD with longer production, push to 18-21 days post-order.
3. Generic cross-sell (best-sellers, not category-relevant). 2-3x performance gap.
4. No sizing/care reminder. For POD, this is a free returns-reduction lever — DTG prints fail on hot wash; sublimation doesn't crack. Each print method gets its own care line.
5. Re-firing the post-purchase flow on every order. Use flow filter "Placed Order at least 2 times" vs "exactly 1 time" to split first-buyers (full series) from repeat buyers (short thank-you + cross-sell only).

---

### 1.5 Winback (Lapsed Customer)

**Purpose.** Re-engage customers who've already purchased but gone silent. Lower per-email RPR than abandoned cart, but reactivates a *free* audience (no acquisition cost).

**Trigger (Klaviyo).** Date-based trigger: "Placed Order" N days ago, where N = your store's **average time between repeat purchases × 1.5**. Klaviyo's default is 180 days, but that's a guess; for apparel POD with a fashion cycle, 90-120 days is closer.

For most BYOK tenants without enough order history to calculate, the operator's default heuristic should be:
- Consumables / repeat-buy apparel basics: 60-90 days
- Statement / collection apparel: 120-180 days

**Sequence.** 2-3 emails over ~2 weeks.

- **Email 1 (Day 0 of lapse trigger).** Soft re-engagement. "We've missed you." Show new arrivals since their last purchase.
- **Email 2 (+5-7 days).** Light incentive. Free shipping or 10-15% off. "Here's a thank-you for being a customer."
- **Email 3 (+10-14 days).** Last call. Two paths: (a) clicked Email 1 or 2 → softer "let's stay in touch" with a content-only email (no discount push); (b) didn't click → stronger urgency ("we're cleaning our list — still want to hear from us?").

If Email 3 still doesn't get a click, the contact rolls into a **Sunset Flow** (suppression candidate) — see Section 6.

**Subject lines.**

- "We miss you, [First Name]"
- "It's been a while"
- "Here's what's new since you've been gone"
- "Come back — 15% off, just because"
- "Last call: are we still pen pals?"

**Benchmark performance.**
- Winback RPR (AOV $100-$200 stores): **~$0.84** (lowest of the five flows by RPR, but on a free audience)
- Typical reactivation rate: 1-3% of triggered contacts
- Apparel winback is dominated by Email 2 (the incentive); without an offer, conversion is anemic

**Common mistakes (5).**

1. Using 180 days as default for fashion / apparel. Cycle is too long; you lose the customer before you've signaled you remember them.
2. Discount on Email 1. Same logic as abandoned cart — trains the wait-for-discount pattern.
3. No "did this customer subscribe but never get the discount" check. If they're in the winback flow because of a one-and-done purchase 90 days ago, they may not remember the brand at all.
4. Treating winback as a transactional re-pitch. It's a relationship repair. Lead with what's *new* since they left, not with the discount.
5. Failing to feed Email 3 non-clickers into a sunset flow. Continuing to send to non-engagers tanks domain reputation (see Section 6).

---

## Section 2: Premium DTC tier — additional flows

For brands targeting Aimé Leon Dore / Wild One / Liquid Death tier, the 5 core flows above are table stakes. The premium tier adds five more:

### 2.1 VIP / loyalty tier flow
**Trigger.** Segment-based: "Placed Order >= 3 times" OR "Total Spent >= $X" (X depends on AOV; for $80-$120 AOV apparel, $300 is a common VIP threshold).
**Plays.** Early access to drops, exclusive products, free shipping always, a personal note from the founder on milestone purchases.
**Klaviyo.** Backstop with a flow that fires on the threshold-crossing event ("Placed Order" filter, custom-property `lifetime_orders >= 3` first time).

### 2.2 Pre-launch / waitlist flow
**Trigger.** "Subscribed to Waitlist" (custom event from a coming-soon page or Klaviyo signup form tagged with the upcoming SKU).
**Plays.** The Arrivals (DTC outerwear) opens waitlist 2-4 weeks before launch, runs a pre-sale to waitlist members 2 weeks before public launch (rewarding patience + planning inventory). Three-email arc: announce, pre-sale invite, public-launch reminder.
**Why it works.** Validates demand, creates scarcity, manufactures the social moment of "I got it before it dropped."

### 2.3 Restock / Back-in-Stock
**Trigger (Klaviyo).** Metric: "Subscribed to Back in Stock" (from Klaviyo's Back-in-Stock embed). Special flow component: **"Back in Stock delay"** — recipient waits at this node until the SKU is restocked, then auto-fires.
**Premium twist.** Notification strategy rules in Klaviyo let you batch notifications. **Notify VIP segment first** (24-48hr exclusive window), then general subscribers. This is the most under-used Klaviyo feature in the apparel tier — it converts "back in stock" into "VIP-rewarded back in stock."

### 2.4 New-collection drop
**Trigger.** Campaign (not flow), but premiered to a curated segment.
**Plays.** Tease 7-10 days out (no product shots, just mood imagery + date). T-3 days: lookbook. Drop day: full collection. T+2 days: "what sold out / what's left." Liquid Death's drop emails treat each drop as content, not commerce — the campaign earns engagement even from non-buyers.

### 2.5 Referral / advocacy
**Trigger.** "Placed Order at least 2 times" (engaged buyer) OR "Submitted Review" (high-affinity signal).
**Plays.** "Give 15%, get 15%" — referral link with personal code. Integrate Referral Candy / Friendbuy / Yotpo Loyalty; Klaviyo just delivers the touchpoint.

---

## Section 3: Apparel / POD-specific email patterns

POD's failure modes are distinct from inventory-stocked DTC: prints fail when mis-cared-for, sizing is read off generic Printful/Printify charts (not custom-fit garments), and production lead time is longer than buyers expect. Email is the cheapest way to manage these.

### 3.1 Sizing-help email
**When.** Triggered the moment a visitor adds an apparel item to cart **for the first time** (Klaviyo: "Added to Cart" with flow filter `lifetime_apparel_orders = 0`).
**Content.** A side-by-side: "measure a t-shirt you own" vs "use Printful's chart." Include the model's height and the size they're wearing in the product photo.
**Impact.** Anecdotally, well-built sizing emails reduce wrong-size returns 30-50% for first-time POD buyers. For BYOK tenants where every return = a Printful re-print loss, this email pays for the entire Klaviyo subscription.

### 3.2 Fit-guide auto-send after first apparel purchase
**When.** Triggered 1 hour after "Placed Order" if it's the customer's first apparel order.
**Content.** "Your shirt is shipping. Before it arrives — here's how it should fit." Set the expectation (relaxed / tailored / oversized) before unboxing. Reduces "doesn't fit how I expected" returns.

### 3.3 Care instructions (print-method-specific)
**DTG (direct-to-garment, cotton tees/hoodies):** Cold wash, inside-out, gentle cycle, tumble dry low, no iron on print, no fabric softener (clogs print fibers).
**Sublimation (all-over-print polyester):** Cold wash, hang dry preferred, no high-heat dryer (can wrinkle the polyester and dull the print).
**Embroidery (caps, polos):** Hand wash or gentle cycle, no dryer on caps (warps shape), inside-out for embroidered apparel.

Bundle into a single post-purchase touch keyed off the line-item product type. Klaviyo can branch the flow on `event.extra.line_items[].product_type` (custom property exposed by Shopify's integration).

### 3.4 Restock for color/size SKUs
**Trigger.** Subscriber clicks "Notify me" on a sold-out size or color variant.
**Klaviyo nuance.** The Back-in-Stock embed must respect **variant-level** stock (sold-out Medium Black) not product-level. Default Klaviyo embed handles this if the merchant's Shopify product structure exposes variant inventory — verify before promising the merchant it works.
**For POD specifically.** This flow is largely a no-op because POD never runs out — but it's still useful for *retired designs* (e.g., a seasonal drop that's been pulled), where the trigger becomes "subscribe to design-restock waitlist" and the notification fires if the merchant ever reactivates the SKU.

---

## Section 4: SMS — when it works, when it doesn't

### 4.1 TCPA compliance basics (US)
- **Express written consent required.** Implied consent ("they bought from us") is NOT sufficient for SMS. Need an affirmative checkbox or keyword opt-in.
- **Disclosure language at opt-in.** Must include: brand name, msg frequency ("up to 4 msgs/month"), data/msg rates apply, STOP to opt out, HELP for help, link to terms + privacy.
- **Quiet hours.** Federal TCPA enforces 8 AM–9 PM **in the recipient's local timezone**. Klaviyo and Postscript both auto-enforce this.
- **Penalty exposure.** TCPA suits run $500-$1,500 per violating message. Class actions have cost merchants seven figures.

### 4.2 Opt-in patterns that don't get sued
- **Two-tap opt-in on popup** — checkbox unchecked by default, separate from email checkbox, explicit consent language directly above.
- **Checkout opt-in** — same rules; some Shopify themes pre-check the SMS box, which is non-compliant. Audit before launch.
- **Keyword opt-in** — "Text JOIN to 12345 for 10% off." Easiest to defend in court.

### 4.3 When SMS outperforms email
- **Urgency / time-bound.** Flash sale, "your cart is about to expire," "your order's out for delivery."
- **Low-ticket, high-impulse.** Sub-$30 apparel where decision time is seconds.
- **Transactional.** Shipping notifications convert 90%+ on SMS read.
- **Post-purchase upsells within 30 min** of checkout — "add socks to your order before it ships."

### 4.4 When SMS is overkill
- **Long-form brand storytelling.** Can't fit in 160 chars.
- **Low-repeat / high-AOV.** Furniture, statement coats — buyer doesn't want a text from you 4x/month.
- **Cold acquisition.** SMS is permission-only. It's a retention channel, not acquisition.

### 4.5 Cost comparison (Q1 2026)
- **Klaviyo SMS.** ~$0.0150 per US segment (160 chars). Starts ~$30/mo base. Bundled with email subscription. Best fit for BYOK tenants already on Klaviyo for email.
- **Postscript.** Starts ~$100/mo base. Per-message cost similar to Klaviyo. Shopify-native, deeper SMS-specific features (conversational AI, two-way SMS at scale).
- **Attentive.** Enterprise-pricing; only viable above ~$5M ARR.

**Operator default.** For BYOK tenants, recommend Klaviyo SMS (same-tool consolidation) unless the tenant is >$2M GMV and SMS-revenue-dominant, in which case Postscript becomes worth its premium.

---

## Section 5: Apple Mail Privacy Protection (MPP) reality

### 5.1 What MPP did
Released Sept 2021 with iOS 15. Apple Mail pre-fetches email images through Apple's proxy servers, firing the tracking pixel **whether or not the user actually opens the email**. Effect: open rates inflated 40-68% on Apple Mail traffic; up to 75% of "opens" may now be machine-generated.

### 5.2 Scale of the problem
**Apple Mail = ~58% of all global email opens** as of early 2025 (Litmus). For US DTC, the share is higher (iOS-skewed audience). This means **open rate as a metric is essentially uncalibrated** — comparing 2020 opens to 2026 opens is comparing two different measurements.

### 5.3 What metrics actually matter now
- **Click-through rate (CTR).** Requires intentional action. Reliable.
- **Placed order rate / conversion rate.** End-of-funnel. Reliable.
- **Revenue per recipient (RPR).** Dollars-per-send. The cleanest single metric Klaviyo offers; **$1.94 average for flows vs $0.11 for campaigns** is the canonical 18x stat.
- **Reply rate.** Underused; if the brand voice invites replies, this is a strong engagement proxy.
- **Unsubscribe rate.** Inverse engagement signal. Reliable.

### 5.4 The "open as a trigger" anti-pattern
**Stop building flows triggered on "Opened Email."** Apple's pre-fetch fires the open event for ~58% of your audience automatically. Any flow conditioned on opens fires for non-engagers, polluting downstream segments. Replace with **clicked-email triggers** or behavioral segments built on site activity.

**Operator rule.** Audit every flow in a new tenant's Klaviyo account for "Opened Email" triggers/filters and migrate to click-based or activity-based logic before activating.

---

## Section 6: Deliverability — keep landing in the inbox

### 6.1 SPF / DKIM / DMARC (must-haves)
- **SPF.** TXT record listing servers authorized to send on your domain's behalf. Klaviyo provides a value; merchant adds to DNS.
- **DKIM.** Cryptographic signature on every message. Klaviyo provides two CNAME records; merchant adds to DNS.
- **DMARC.** Policy on what to do if SPF/DKIM fail. Start at `p=none` (monitor-only) for 30 days, then move to `p=quarantine`, eventually `p=reject`.

**Why now.** Google, Yahoo, Microsoft (as of May 5, 2025) **require** SPF + DKIM + DMARC for bulk senders. Spam complaint rate must stay under **0.3%**, bounce rate under **2%**. Non-compliant senders get inbox-rejected silently.

**Operator gate.** Before the operator activates any campaign or flow, it must verify the tenant's sending domain passes SPF + DKIM + DMARC. Klaviyo's "Sender Status" surface shows this; the operator should call it via API on every onboarding pass.

### 6.2 Domain warm-up for new senders
- New domains: start at 5-10 sends/day, ramp 2-4 weeks before any large campaign.
- Klaviyo handles this automatically if you use a Klaviyo-shared IP, but **dedicated IPs require manual warm-up** (only relevant for >250k sends/month).
- Pro tip: warm the domain by sending welcome emails (highest engagement) first. ISP reputation scores favor high-engagement sends early.

### 6.3 "Send from" name and domain
- **Use a person + brand combo.** "Sarah at BlackVault" > "BlackVault" alone. A/B tested 20%+ open-rate lift (Braze / BlaBlaCar study).
- **welcome@brand.com vs hello@brand.com.** Negligible delta; pick one and stay consistent (consistency matters more than the word).
- **NEVER send from noreply@.** Kills reply rate (a known engagement signal), looks corporate, and signals "we don't want to talk to you."

### 6.4 List hygiene
- **Suppress unengaged after 90 days.** Klaviyo's defaults: 30/60/90-day engagement segments. Suppress profiles in "not engaged in 90 days" before they tank your reputation.
- **Sunset flow.** Run a 2-email "are we still on?" sequence before suppressing. Recovers ~1-3% of about-to-churn contacts.
- **Never-engaged segment.** People who've never opened or clicked. Many merchants leave these on the list for years. Suppress at 30 days for new-domain senders, 60-90 for established senders.

### 6.5 Klaviyo's "Smart Sending" feature
Klaviyo's Smart Sending blocks the same recipient from getting multiple messages within a configurable window (default 16 hours). **Always on for flows.** Prevents a customer who triggers welcome + browse + abandoned-cart in the same day from getting bombed.

---

## Section 7: Email design + copy that works in 2026

### 7.1 Mobile-first
- **>70% of opens are mobile.** Single-column layouts only.
- **Body font ≥14px**, headlines ≥22px. Below this, mobile readability collapses.
- **Tap targets ≥44px tall** (Apple HIG). Text-link CTAs are guesses on mobile; buttons are taps.

### 7.2 Single-CTA per email
- **371% more clicks** vs multi-CTA layouts.
- The exception: a footer "shop other categories" nav is fine — but the *body* of the email is one focus.

### 7.3 Minimalist "text-mostly" pattern
- Allbirds, Everlane, and many premium DTC brands send mostly-text emails — feels like a personal note, not a corporate broadcast.
- Renders fast, loads on slow mobile, doesn't trip image-blocking.
- Doesn't require designer cycles → faster to A/B test.
- **Operator's content-generation default** for BYOK tenants without a brand designer: single hero image + 60-100 words of body copy + one CTA.

### 7.4 Subject line patterns that test well in apparel/lifestyle DTC
- **Curiosity gap.** "Maybe our best email ever" (Atoms) — tested winner against a clarity-only variant.
- **First-name prefix.** "[Name], here's your code" — ~2 percentage points open-rate lift (modest but free).
- **Question form.** "Still thinking about the [Product]?" — high open-rate driver in abandoned cart.
- **Numbered / specific.** "3 things we'd buy from our new drop" — outperforms generic "new arrivals."
- **Avoid.** All-caps, multiple exclamations, "FREE" in caps, $ in subject — all spam-filter flags.

### 7.5 Preheader text
- The line that previews next to / under the subject line on most clients.
- **40-100 characters.** Treat as a second subject line.
- **Never leave it as the default** ("View this email in your browser") — wastes the highest-engagement real estate after the subject line itself.
- Pair clarity (subject) + specificity (preheader). E.g., subject "Welcome to BlackVault" + preheader "Use code BV10 for 10% off — good for 7 days."

### 7.6 Personalization reality
- **First name in subject:** +2 pp open rate. Free, do it.
- **First name in body:** +5-10% click rate. Free, do it.
- **Behavioral personalization** (referencing a product they viewed, a category they shopped): **2-3x conversion lift**. Worth the segmentation effort.
- **AI-driven product recommendations** in feeds: 2-3x lift over generic best-sellers. Use Klaviyo's product feeds, not hardcoded blocks.

---

## Section 8: Klaviyo-specific implementation

For each flow, the canonical Klaviyo configuration:

### 8.1 Welcome Series
- **Trigger type:** List (Newsletter / Popup list)
- **Trigger filters:** None (or `Placed Order zero times` if separating new from existing)
- **Flow filters:** `Subscribed to List = true`, `Email Marketing Consent = subscribed`
- **Time delays:** 0 / 36hr / Day 4 / Day 7 / Day 12
- **Conditional splits:** Clicked Email 1 (yes → softer Email 4, no → urgency Email 4)
- **A/B test slots:** Subject line on Email 1; CTA copy on Email 3

### 8.2 Abandoned Cart
- **Trigger type:** Metric — Started Checkout
- **Trigger filters:** `Started Checkout` value > $0 (skip zero-dollar test carts)
- **Flow filters:** `Placed Order zero times since Started Checkout`
- **Time delays:** 1hr / +23hr / +24hr (totals 1hr, 24hr, 48hr)
- **Conditional splits:** Cart value > $100 (yes → offer free shipping, no → 10% off code on Email 2)
- **A/B test slots:** Email 1 subject line (product-specific vs generic)

### 8.3 Browse Abandonment
- **Trigger type:** Metric — Viewed Product
- **Trigger filters:** Profile has email, `Started Checkout zero times since trigger`
- **Flow filters:** `Active on Site = true` in last 24hr (filters bot opens)
- **Time delays:** 3hr / +21hr
- **Conditional splits:** Viewed product > $X (yes → premium framing, no → standard)
- **A/B test slots:** Email 1 subject; product block layout

### 8.4 Post-Purchase
- **Trigger type:** Metric — Placed Order, plus separate flow on Order Fulfilled
- **Trigger filters:** Order value > $0
- **Flow filters:** Branch on `Placed Order = 1 time` (full series) vs `>= 2 times` (short series)
- **Time delays:** Order confirm (0min) / Ship update (event-driven) / Review +14d / Cross-sell +21d
- **A/B test slots:** Review request subject; cross-sell product set

### 8.5 Winback
- **Trigger type:** Date-based — N days since Placed Order
- **Trigger filters:** None
- **Flow filters:** `Placed Order zero times in last N days`, `Email Marketing Consent = subscribed`
- **Time delays:** 0 / +5d / +9d
- **Conditional splits:** Clicked Email 1 or 2 (yes → soft Email 3, no → sunset bridge)
- **A/B test slots:** Email 2 incentive (% off vs free shipping)

---

## Section 9: Operator-side rules (for `.openclaw/operator/knowledge/meta-rules/`)

Twelve extracted rules the Operator should enforce or surface to the merchant before suggesting/setting up email automation:

1. **Verify Klaviyo connection before suggesting any flow.** Use the existing `lib/klaviyo.ts` health-check. If the tenant hasn't connected Klaviyo (or their API key is invalid), the operator's first response is "I can wire your email automation, but I need Klaviyo connected — here's the 2-minute setup." No flow recommendations until connected.

2. **Verify SPF / DKIM / DMARC before activating any campaign.** Query Klaviyo's sender-status endpoint. If the domain isn't authenticated, surface the DNS records the merchant needs to add and pause campaign activation. Flows can build in draft, but **no sends until auth is green.**

3. **Default to 3-email sequences, never 1.** 6.5x revenue lift is documented. Reject merchant requests for "just one welcome email" with the 6.5x stat.

4. **Single CTA per email.** When generating copy, enforce one primary CTA. If the merchant asks for multiple CTAs, push back with the 371%-more-clicks stat and route them to a follow-up email.

5. **Never trigger flows on "Opened Email" post-MPP.** Audit any flow the merchant imports for Opened-Email triggers/filters; migrate to click-based or site-activity-based logic.

6. **Always include CAN-SPAM compliant footer.** Physical mailing address + one-click unsubscribe link in every marketing email. Refuse to generate copy without these.

7. **Suppress unengaged at 90 days.** When generating a new flow, also configure or recommend a Sunset Flow + suppression rule. List hygiene is not optional; it's deliverability insurance.

8. **For SMS, require express written consent.** Never enable SMS flows without verifying the merchant's opt-in form uses TCPA-compliant language (separate checkbox, disclosure copy, STOP/HELP handlers).

9. **Welcome series must include an expectation-setting email.** Email 2 in the welcome arc must answer "what should I expect from your emails?" — frequency, content type, next steps. Reduces unsubscribes.

10. **POD-specific care reminder is mandatory in post-purchase.** Branch on print method (DTG / sublimation / embroidery) and include the matching care line. Cuts wash-related complaints.

11. **Don't recommend SMS until email's first-party flywheel is running.** SMS is a retention channel; if abandoned cart + welcome aren't live, the merchant isn't ready for SMS. Defer SMS conversation past the 5-flow baseline.

12. **Report on RPR, CTR, and placed-order-rate — never on open rate alone.** Apple MPP makes open rate uncalibrated. Every operator-generated report should lead with revenue-per-recipient and click-through, with open rate de-emphasized or shown with an MPP-warning footnote.

---

## Section 10: Code/tool changes for our codebase

The operator currently has `lib/klaviyo.ts` (254 lines) with health-check, list ops, and campaign listing. It lacks **flow creation tooling.** To deliver the playbook above as operator capability, add the following:

### 10.1 Extend `lib/klaviyo.ts` with flow primitives
```ts
// New functions to add:
async function getFlows(): Promise<KlaviyoFlow[]>
async function getFlowByName(name: string): Promise<KlaviyoFlow | null>
async function createFlow(spec: FlowSpec): Promise<KlaviyoFlow>
async function updateFlowAction(flowId, actionId, patch): Promise<void>
async function getSenderStatus(): Promise<{ spfPass, dkimPass, dmarcPass, sendingDomain }>
async function getSegments(): Promise<KlaviyoSegment[]>
async function createSegment(definition: SegmentDef): Promise<KlaviyoSegment>
async function getMetrics(): Promise<KlaviyoMetric[]>  // To find "Started Checkout", "Viewed Product" IDs per account
```

### 10.2 New operator tools
- **`setup_welcome_series`** — Wires the 5-email welcome flow into the tenant's Klaviyo. Parameters: brand name, discount code (optional), founder first name, hero product handle. Builds the trigger (List subscribe), the trigger filter (`Placed Order zero times`), the 5 email actions with on-voice copy, the time delays, and the conditional split on Email 1 clicks.
- **`setup_abandoned_cart`** — 3-email recovery. Parameters: discount tier (none / free shipping / 10% off), apply on Email 1 or Email 2. Pulls dynamic checkout URL token.
- **`setup_browse_abandonment`** — 2-email browse recovery. Verifies site-tracking is firing (calls Klaviyo to check for recent "Viewed Product" events).
- **`setup_post_purchase`** — Order confirmation + ship update + review request + cross-sell. Branches on POD print method via line-item product type.
- **`setup_winback`** — Date-based, N-day lapsed trigger. N defaults to 90 days for apparel POD; configurable.
- **`generate_email_copy_for_flow`** — Uses Claude + the brand profile (voice, hero products, founder name, brand origin story) to draft on-voice copy for any of the 30+ emails across the 5 flows. Returns subject + preheader + body + single CTA.
- **`audit_klaviyo_account`** — One-shot read tool. Lists every existing flow, flags `Opened Email` triggers, flags missing SPF/DKIM/DMARC, flags unengaged-segment absence, flags `noreply@` sender names. Returns an actionable checklist for the merchant.
- **`get_email_performance_report`** — Pulls last-30-day flow + campaign metrics from Klaviyo, surfaces RPR / CTR / placed-order-rate (NOT open-rate-as-headline), and benchmarks against industry averages from this playbook.

### 10.3 Operator knowledge file
Materialize this playbook as a curated knowledge document at `.openclaw/operator/knowledge/email-lifecycle-playbook.md` so the operator can cite specific numbers when a merchant asks "why 3 emails not 1?" or "why isn't my open rate climbing?"

### 10.4 Onboarding wizard step
Add a new step to the BYOK onboarding wizard: **"Email automation."** Defaults to "Yes, set up the 5 core flows," gates on Klaviyo connect + SPF/DKIM verification, runs the five `setup_*` tools above, and ships a single confirmation email to the merchant ("Here's what I just turned on. Edit any of it in Klaviyo at these links.").

---

## Sources

- [Klaviyo — 2026 Email Marketing Benchmarks](https://www.klaviyo.com/products/email-marketing/benchmarks)
- [Klaviyo — 2025 Benchmark Report (PDF, AMER)](https://klaviyocms.wpengine.com/wp-content/uploads/2025/02/2025-Benchmark-Report_AMER.pdf)
- [Klaviyo — Ecommerce Email Marketing Benchmark Report](https://www.klaviyo.com/marketing-resources/ecommerce-benchmarks)
- [Klaviyo — Email Segmentation Benchmarks](https://www.klaviyo.com/marketing-resources/segmentation-benchmark-report)
- [Klaviyo — Abandoned Cart Benchmark Report](https://www.klaviyo.com/blog/abandoned-cart-benchmarks)
- [Klaviyo — Abandoned Cart Email Examples & Subject Lines](https://www.klaviyo.com/uk/blog/abandoned-cart-email)
- [Klaviyo — Welcome Email Examples](https://www.klaviyo.com/blog/welcome-email-examples)
- [Klaviyo — Subject Line Best Practices](https://www.klaviyo.com/blog/subject-lines-best-practices)
- [Klaviyo — Browse Abandonment Email Trends](https://www.klaviyo.com/blog/browse-abandonment-email)
- [Klaviyo — Post-Purchase Email Guide](https://www.klaviyo.com/blog/post-purchase-emails)
- [Klaviyo — Revenue Per Recipient](https://www.klaviyo.com/blog/revenue-per-recipient)
- [Klaviyo — How to Re-Engage Lapsed Subscribers with SMS](https://www.klaviyo.com/blog/sms-winback-strategy)
- [Klaviyo Help — How to create an email welcome series](https://help.klaviyo.com/hc/en-us/articles/115002775172)
- [Klaviyo Help — How to create an abandoned cart flow](https://help.klaviyo.com/hc/en-us/articles/115002779411)
- [Klaviyo Help — How to create a browse abandonment flow](https://help.klaviyo.com/hc/en-us/articles/115002775252)
- [Klaviyo Help — How to create a post-purchase flow](https://help.klaviyo.com/hc/en-us/articles/360028872611)
- [Klaviyo Help — How to create a winback flow](https://help.klaviyo.com/hc/en-us/articles/115002775192)
- [Klaviyo Help — How to build a back in stock flow](https://help.klaviyo.com/hc/en-us/articles/115003872251)
- [Klaviyo Help — How to clean your email list](https://help.klaviyo.com/hc/en-us/articles/360044054732)
- [Klaviyo Academy — Anatomy of a flow: Welcome series](https://academy.klaviyo.com/en-us/quick-guides/anatomy-of-a-flow-welcome-series)
- [Klaviyo Academy — Anatomy of a flow: Post-purchase](https://academy.klaviyo.com/en-us/quick-guides/playbook-anatomy-of-a-flow-post-purchase)
- [Klaviyo Academy — Anatomy of a flow: Winback](https://academy.klaviyo.com/en-us/quick-guides/anatomy-of-a-flow-winback)
- [Klaviyo vs Postscript comparison](https://www.klaviyo.com/compare/klaviyo-vs-postscript)
- [Flowium — Top 15 Klaviyo Flows for 2025](https://flowium.com/blog/klaviyo-flows/)
- [DTC Newsletter — Breaking Down Liquid Death's Email Strategy](https://www.directtoconsumer.co/newsletter/death-to-plastic)
- [Tinuiti — Cuts Clothing CRM & Email Case Study](https://tinuiti.com/case-study/cuts-clothing-case-study/)
- [Digiday — DTC brands embrace the online waitlist (The Arrivals)](https://digiday.com/marketing/retail-briefing-dtc-brands-embrace-online-waitlist/)
- [Beehiiv — Impact of Apple MPP on Open Rates](https://www.beehiiv.com/blog/apple-mpp-open-rate)
- [Litmus / industry — Apple Mail at ~58% of opens globally (2025)](https://www.emailtooltester.com/en/blog/apple-mpp-open-rate/)
- [FTC — CAN-SPAM Act Compliance Guide for Business](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [Shopify — Understanding the CAN-SPAM Act (2025)](https://www.shopify.com/blog/can-spam-act)
- [RedSift — Bulk Sender Requirements (2025-2026 SPF/DKIM/DMARC enforcement)](https://redsift.com/guides/how-email-authentication-requirements-are-changing-business-communications-in-2026)
- [Saleshive — DKIM, DMARC, SPF Best Practices (2025)](https://saleshive.com/blog/dkim-dmarc-spf-best-practices-email-security-deliverability/)
- [Braze — Sender name personalization impact (BlaBlaCar A/B study)](https://www.braze.com/resources/articles/email-open-rates)
- [Marketing Dive — Personalized subject lines and open rates](https://www.marketingdive.com/news/study-personalized-email-subject-lines-increase-open-rates-by-50/504714/)
- [Sizechart.shop — POD Sizing Guide (Printful, Printify)](https://www.sizechart.shop/blog/print-on-demand-size-charts)
- [Path to Millions — POD Print Durability & Washing Tips](https://www.gopathtomillions.com/2025/07/print-on-demand-durability-care.html)
- [MailerLite — Email Preheader Best Practices](https://www.mailerlite.com/blog/increase-your-email-open-rate-with-preheaders)
- [Saturate Marketing — Mobile Emails in 2026](https://saturate.marketing/designing-emails-for-mobile-in-2026-structure-speed-and-what-still-works)
- [Demand Curve — Growth Playbooks](https://www.demandcurve.com/playbooks)
- [Reforge — Lifecycle Marketing Templates](https://www.reforge.com/artifacts/c/marketing/lifecycle-marketing)
