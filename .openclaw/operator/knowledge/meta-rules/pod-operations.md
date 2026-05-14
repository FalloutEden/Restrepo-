# Print-on-demand operational rules — operator playbook

Full research (25-mode failure catalog + Printful-specific truths + comparison
matrix + customer-service templates):
`.openclaw/research/pod-operational-reality-2026-05-14.md`.

## Rule 1 — The 5-minute edit window is the only fix opportunity for new orders

Printful locks orders for editing 5 minutes after creation. After that:
wrong address, wrong variant, wrong size are unfixable without cancel +
re-order.

**Operator implication:** Never push to Printful synchronously. ALWAYS
queue with a 5-minute hold. If the customer realizes the mistake in those
5 minutes, the hold lets us fix without canceling. After 5 min, the order
is locked and the merchant eats any address/variant fix cost.

## Rule 2 — Damage/misprint claim window starts at RECEIPT; lost-mail starts at ESTIMATED DELIVERY

Two different anchor dates for the 30-day claim window. Operator must track
both:
- `received_at` from carrier API (if available) — damage/misprint countdown
- `estimated_delivery_date` from Printful order — lost-in-mail countdown

If the operator can't determine `received_at`, fall back to
`shipped_at` + carrier_avg_transit_days. Surface the deadline to the
merchant when a customer complains.

## Rule 3 — "Marked delivered, not received" is NEVER covered by Printful

Printful explicitly excludes this from refund coverage. Merchant must
decide: eat the cost as goodwill, or hold firm.

**Operator default:** for orders <$50, suggest goodwill refund (cheaper than
the negative review). For orders ≥$50, suggest "file claim with carrier
first, then we'll discuss." Surface to merchant decision queue either way.

## Rule 4 — AOP + sublimation REQUIRE pre-disclosure copy on the PDP

All-over-print and sublimation products have "within tolerance" variance
that customers reasonably interpret as defects. Without pre-disclosure on
the product description page, the merchant has no defensible refund-decline
basis.

**Operator behavior:** when materializing any AOP or sublimation product,
auto-inject the variance disclosure paragraph into the product description.
Refuse to publish AOP listings without it. Template stored in the
brand-knowledge files.

## Rule 5 — Photo evidence is non-negotiable for problem reports

Printful's policy: no photo, no claim. The operator NEVER submits a
problem report to Printful without:
- Photo of the defect / wrong item / damage
- Photo of the shipping label (proves it's the same order)
- Order number visible in one of the photos

If the customer refuses to provide photos, the operator tells the merchant:
"Without photos we can't get Printful to cover this. You'd be eating the
cost. Want to refund or decline?"

## Rule 6 — Color management: never promise pixel-perfect

Mockups are RGB; printed products are CMYK. Hex codes don't translate
directly. Acceptable color variance per Printful: ΔE up to ~5 (visually
similar but not identical).

**Operator behavior:** when a tenant complains "the color is wrong":
- First response: "Color variance up to ΔE 5 is within Printful's normal
  tolerance. Was this a significant mismatch or a subtle shift?"
- If significant: photo evidence → claim → likely covered
- If subtle: educate the merchant + politely decline customer refund OR
  goodwill refund (merchant's call)

## Rule 7 — Sizing complaints: blanks run different per SKU; pre-empt

Bella+Canvas runs small. Gildan runs large. Yupoong fits standard. Operator
must know the brand-specific size baseline for every blank in the catalog
(stored in brand-knowledge meta).

**Operator behavior:** when materializing any apparel product, auto-inject
the brand-specific sizing guidance ("Runs small — order one size up if
you're between sizes") into the product description.

When a customer complains about size: refund/replacement is on the
MERCHANT, not Printful (sizing isn't a defect). Default response: goodwill
exchange for first-time customer, decline for repeat.

## Rule 8 — Q4 surge: SLAs double, set expectations early

October-December production times double. A normal 3-day fulfillment
becomes 5-7. Shipping carriers add an extra 2-3 days.

**Operator behavior:** from October 15 onward, auto-update all product
pages' shipping estimates to "Holiday production: 5-10 business days +
shipping." Surface this to merchant for confirmation on Oct 1. Restore
normal estimates on January 5.

## Rule 9 — Stock-outs: substitute only with explicit merchant approval

Printful can substitute a sold-out variant (different color, similar
blank). The operator must NEVER auto-approve substitutions — merchant
brand integrity is more important than completing the order.

When Printful flags stock-out:
- Auto-pause the order (don't let it ship a substitute silently)
- Notify merchant within 1 hour
- Merchant chooses: substitute / refund / restock-wait
- Operator executes the merchant's decision

## Rule 10 — Refund decision tree

```
Customer complaint received
├─ Defect (color/print/damage)?
│   ├─ Photo evidence → file claim → Printful covers
│   └─ No photo → ask for one. If refused, merchant decides.
├─ Wrong size shipped (Printful's fault)?
│   └─ Photo + order number → Printful replaces.
├─ Wrong size (customer ordered wrong)?
│   └─ Merchant decides: exchange/refund/decline (sizing is buyer responsibility).
├─ Late delivery?
│   ├─ Within Printful's stated SLA → decline politely with order tracking.
│   └─ Beyond SLA → Printful credits/refunds.
├─ Lost in mail (carrier marked delivered)?
│   └─ NEVER covered by Printful. Merchant decides goodwill vs decline.
├─ Lost in mail (carrier lost)?
│   └─ File claim with Printful + carrier. Usually covered.
└─ Customer changed mind?
    └─ Merchant's policy decides. Default: no refund on POD (unique-make).
```

## Rule 11 — White-label packaging: not 100% white-label

Printful's branding shows on:
- Return address (their warehouse)
- Some packaging slips (depending on product)
- Tracking emails (if merchant doesn't override)

**Operator behavior:** during bootstrap_store, enable "branded packing
slip" if available in the merchant's plan (paid feature). Auto-configure
Klaviyo shipping notification to override Printful's default.

## Rule 12 — Order cancellation: 5-minute window, then full price

If a customer asks to cancel within 5 minutes of order placement: cancel
+ full refund.

If after 5 minutes:
- Order not yet in production → Printful may still cancel with 50% restocking fee
- Order in production → no cancellation possible. Customer gets the item OR a
  goodwill refund from the merchant (Printful keeps the production fee).

Operator should surface this trade-off to merchant before responding to
the customer.

## Rule 13 — Comparison decision tree: Printful vs Printify vs Gelato vs CJ

Use Printful when: US-based brand, premium positioning, quality matters,
willing to pay for it.

Use Printify when: budget brand, US/EU mass-market, willing to accept
quality variance across the multi-supplier network.

Use Gelato when: international brand (15+ countries production), fast
shipping required globally.

Use CJ when: hardware / non-apparel dropship, willing to accept slower
shipping for catalog breadth.

Operator never materializes a product on the wrong fulfillment lane for
the brand's positioning.
