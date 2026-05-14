---
title: "Print-on-demand operational reality — failure modes + recovery scripts"
kind: ops-runbook
date: 2026-05-14
tags: [pod, printful, fulfillment, returns, refunds, customer-service, ops-reality]
related_concepts: [printful-service, printful-link, printful-orders, printful-credentials, operator-agent, klaviyo-integration, shopify-webhooks]
---

# POD operational reality

## TL;DR

Print-on-demand looks frictionless from the dashboard and breaks loudly the second a real human is at the other end. The truths most "build a t-shirt brand in 24h" content skips: (1) every claim has a hard **30-day window from receipt** and requires a clear, well-lit photo or the supplier will decline you; (2) **Printful covers fulfillment errors and lost-in-transit, never sizing or buyer's remorse, and refuses to cover "tracking says delivered"** — that loss is yours; (3) the **5-minute "order edit" window** is the entire opportunity to catch wrong-address / wrong-variant orders before they're locked in; (4) Q4 fulfillment doubles to 5–10 business days and merchants who didn't pre-announce that fact eat the chargebacks; (5) AOP and sublimation **always show some seam imperfection and minor white streaks** — that is "within tolerance," not a defect, and merchants who don't pre-set this expectation will get refunded into the ground. The Operator's job is to never let a merchant be blindsided by any of these.

## Section 1: The failure-mode catalog

Frequency labels use community sentiment plus Trustpilot/forum density. "Common" = appears in most multi-hundred-order POD threads. "Occasional" = appears repeatedly but not in every store. "Rare" = appears in horror-story threads only.

### 1. Color mismatch between screen mockup and printed product
- **How often:** Common. Printful publishes an explicit Color Matching Disclaimer; they cannot guarantee 100% color accuracy. The screen is RGB-emissive; DTG output is CMYK-subtractive on absorbent fabric. The two will never match exactly.
- **Customer experience:** "The color in the photo is way more vibrant than what I got."
- **Root cause:** RGB→CMYK conversion plus garment color bleed-through plus ambient lighting in the photo studio. Black absorbs ink unevenly. Heather grays show ink shifts more than solids.
- **Detection signal:** Customer email with a phrase like "the color looks washed out / faded / different / wrong" within 1–2 weeks of receipt.
- **Recovery script:** Acknowledge, link to your published color disclaimer, offer one of: replacement at no charge if visibly off-spec, partial refund (20–30%) if borderline, full refund only if customer rejects all other options. Order a replacement from Printful only if the photo clearly shows a banding artifact, not just hue drift.
- **Refund liability:** Merchant eats it. Printful's policy explicitly excludes color shift "within tolerance." File a problem report only if there's a banding or color-channel-missing defect.

### 2. Print misalignment / offset on the garment
- **How often:** Occasional. Most Trustpilot complaint clusters mention "crooked," "off-center," or "duplicated" prints.
- **Customer experience:** "The logo is way off to one side / tilted / the pocket is missing the design."
- **Root cause:** Garment loaded onto the platen at an angle, or the print file had unnecessary canvas padding that shifted the centerline.
- **Detection signal:** Photo evidence shows the design >0.5 inch off the templated position.
- **Recovery script:** This is a Printful-covered fulfillment error. Report problem in dashboard within 30 days with full-body photo plus close-up of the misaligned print. Free replacement, no return required.
- **Refund liability:** Printful covers it (replacement at no cost to merchant). Merchant should refund the customer the original price out of goodwill if the customer doesn't want to wait for a replacement.

### 3. Wrong size shipped
- **How often:** Rare from Printful (in-house QC), more common on Printify (per-supplier variance).
- **Customer experience:** "I ordered M and got L" (or worse, child size when adult was ordered).
- **Root cause:** Pick-and-pack error at the fulfillment center, or a variant-mapping bug between Shopify and Printful where Shopify's M maps to Printful's L.
- **Detection signal:** Customer photo of the garment's neck tag size label.
- **Recovery script:** Apologize, ask for tag photo as proof, then submit Printful problem report. Free replacement covered if the picked SKU does not match the order's stated SKU.
- **Refund liability:** Printful covers if it was their pick error. **Merchant eats it if the variant mapping in Shopify is wrong** — that's the operator's bug, not the supplier's. Detect this by reconciling the Printful sync product's variant IDs to the Shopify variant IDs after every sync.

### 4. Wrong color shipped
- **How often:** Rare. Same root causes as wrong size.
- **Customer experience:** "I ordered the black shirt and got navy."
- **Root cause:** Pick error or variant mapping bug.
- **Recovery script:** Same as wrong size. Photo of the neck tag plus a full garment photo.
- **Refund liability:** Same as wrong size.

### 5. Wrong product entirely
- **How often:** Rare.
- **Customer experience:** "I ordered a hoodie and got a t-shirt" or "this is somebody else's design."
- **Root cause:** Order-label mix-up at the print floor.
- **Recovery script:** Free replacement from Printful. Customer keeps or donates the wrong item — Printful doesn't ask for it back.
- **Refund liability:** Printful covers fully.

### 6. Quality issue (loose threads, weak print, fading after first wash)
- **How often:** Occasional. Trustpilot pattern: prints fading within 2 washes, "bobbling" within 10 weeks, sublimation streaks visible on first wear.
- **Customer experience:** "The print cracked / faded / started peeling after one wash."
- **Root cause:** Pretreatment underapplication on dark garments, white-underbase mis-cure, cheap dye in the blank (Bella+Canvas vs Gildan), or customer hot-washed with bleach.
- **Detection signal:** Customer reports peeling, cracking, or significant color loss within 30 days. Photo of the affected area required.
- **Recovery script:** Submit Printful problem report. Ask for a well-lit close-up of the print defect. Printful will typically replace if reported within 30 days of receipt.
- **Refund liability:** Printful covers within the 30-day window if the defect is visible. After 30 days, merchant decides — recommended: offer 25% off next order rather than full refund.

### 7. Lost in shipping (carrier never delivers)
- **How often:** Occasional, especially USPS Ground Advantage and international economy.
- **Customer experience:** Tracking stalled for 7+ days, then declared lost.
- **Root cause:** Carrier error.
- **Detection signal:** Tracking last-updated date > 7 days ago with no "delivered" event, especially for domestic. International: stalled in transit > 21 days.
- **Recovery script:** Wait until past estimated delivery date + buffer. **Report to Printful within 30 days of estimated delivery date** to get reprint+reship covered. If you miss the 30-day window, Printful won't cover it.
- **Refund liability:** Printful covers reprint and reshipping if reported in time. Merchant covers original shipping if they want to refund the customer immediately rather than wait for replacement.

### 8. Customs hold (international orders)
- **How often:** Common on international.
- **Customer experience:** "It's been sitting in customs for 3 weeks" or "I had to pay $40 to get my $25 shirt out."
- **Root cause:** Country-specific customs inspection or DDU (Delivered Duty Unpaid) shipping.
- **Detection signal:** Tracking shows "held in customs" or stalled in destination country > 14 days.
- **Recovery script:** Educate customer that customs delays add days–weeks per Printful's own delivery time disclaimer. If buyer-paid duty is the issue, refer them to your shipping policy (which MUST disclose this).
- **Refund liability:** Merchant eats it unless they're using Printful's DDP shipping option (which prepays duties at checkout). Operator must default international stores to DDP or surface a "your store charges no duties, buyers will be surprised" warning.

### 9. Damaged in transit
- **How often:** Occasional. Mugs and framed prints are highest-risk.
- **Customer experience:** "Box was crushed, shirt has tire tread on it, mug arrived in pieces."
- **Root cause:** Carrier handling.
- **Detection signal:** Customer photo of damaged packaging plus damaged product.
- **Recovery script:** Submit Printful problem report with photos of (a) the damaged item and (b) the damaged packaging. Tell customer to keep the packaging until resolution — carriers may want it for their own claim. Free replacement covered.
- **Refund liability:** Printful covers via their carrier-claim process. Within 30 days of receipt.

### 10. Sizing complaints — blank runs small/large
- **How often:** Common. Bella+Canvas 3001 women's sizing runs small (recommend sizing up); slim-fit tees made to fit small; relaxed-fit oversized. Gildan and Hanes run larger than B+C for the same nominal size.
- **Customer experience:** "I'm always a Medium and this Medium is way too tight."
- **Root cause:** Blank manufacturer's actual sizing vs the customer's expectation calibrated to a different brand.
- **Detection signal:** "Wrong size" complaint where the picked SKU matches the order.
- **Recovery script:** Politely point to the size chart on the product page (which must show actual measurements, not S/M/L labels). Per Printful's own template: "Our return policy doesn't cover products ordered in the wrong size, so we won't be able to issue you a refund. Thank you for understanding." Offer a 15% discount on the correct size as goodwill.
- **Refund liability:** Merchant eats it. Printful does not cover sizing complaints when the correct SKU was shipped. The Operator must surface the brand-specific sizing chart on every product page automatically.

### 11. Color drift between print runs (same SKU, different batches)
- **How often:** Occasional, more pronounced on heather and pastel garments.
- **Customer experience:** Customer ordered two shirts a month apart and the colors don't match.
- **Root cause:** Different blank batches from B+C, AS Colour, Stanley/Stella have slight dye-lot drift. DTG ink batches also vary marginally.
- **Detection signal:** Same-customer repeat orders that flag a color comparison complaint.
- **Recovery script:** Acknowledge the dye-lot reality, offer 15% off and explain garments are made on demand from rolling stock.
- **Refund liability:** Merchant. This is "within tolerance" per all POD providers.

### 12. Printful canceling an order due to stock issues
- **How often:** Occasional, esp. for niche colorways or new blanks.
- **Customer experience:** Customer's order is suddenly canceled days after placement.
- **Root cause:** Variant went out-of-stock at the fulfillment center between order placement and pick-up. Stock-sync feature can be enabled but is not enforced on every store.
- **Detection signal:** `order_canceled` webhook from Printful with reason "out of stock" or "discontinued."
- **Recovery script:** Email customer immediately with two options: (a) switch to closest available variant (different color or blank), (b) full refund. Don't wait for them to email you.
- **Refund liability:** Merchant refunds the customer; Printful refunds the merchant's Printful Wallet for the canceled order.

### 13. Variant disconnect (Shopify variant maps to wrong Printful variant)
- **How often:** Common in newly-built stores, very rare in established stores.
- **Customer experience:** Customer ordered "Black / M" but received "Navy / L" because the Shopify variant SKU was pointing to the wrong Printful sync variant ID.
- **Root cause:** Manual SKU editing breaks sync, or the sync wizard's auto-mapping picked an adjacent variant on a multi-color product.
- **Detection signal:** Pattern of wrong-size/wrong-color complaints clustered on one product right after publish.
- **Recovery script:** Immediately pause the product in Shopify, re-sync the variants, audit the variant_id mapping in the database, then re-publish. Refund + free replacement to every affected customer. **Don't trust the next 5 orders on this product** — manually verify each.
- **Refund liability:** Merchant eats it; this is a sync bug, not a Printful error. The Operator should run a variant-reconciliation check after every sync_product write.

### 14. Long manufacturing times (Q4 / Black Friday surge)
- **How often:** Common, every Q4 (Oct–Dec). Normal 2–5 business day fulfillment stretches to 5–10 days. Printful's holiday deadline page acknowledges this every year.
- **Customer experience:** "It's been 12 days and my order hasn't shipped — where's my Christmas gift?"
- **Root cause:** Volume spike exceeds production capacity.
- **Detection signal:** Calendar (Oct 15 onward) + storewide tickets about shipping speed.
- **Recovery script:** Pre-announce on banner + product pages from Oct 1 that holiday orders may take longer. For active complaints: acknowledge the delay, give a concrete revised ship date, offer a 10% discount code for the inconvenience. **Do NOT promise specific delivery dates after Dec 5.**
- **Refund liability:** Shared. If a customer paid for express and didn't get it, refund the shipping upgrade. Otherwise merchant decision — Printful won't refund production-time delays.

### 15. Tax/duty surprise for the buyer (international)
- **How often:** Common on EU and UK orders shipped from US fulfillment.
- **Customer experience:** Carrier holds package and demands $20–$80 import duty before delivering.
- **Root cause:** DDU shipping; merchant didn't enable DDP at checkout.
- **Detection signal:** Customer email "I had to pay extra to get my package."
- **Recovery script:** Confirm in your shipping policy that international buyers are responsible for duties. Apologize for surprise; refund the duty amount as a goodwill gesture for the first complaint per region, then update the policy banner. Long term: enable Printful's DDP shipping for routes where it's available.
- **Refund liability:** Merchant unless the merchant chose DDP at checkout, in which case Printful absorbs duties into the upfront price.

### 16. White/light garment seeing print bleed-through
- **How often:** Occasional.
- **Customer experience:** "I can see the design faintly on the inside of the shirt."
- **Root cause:** DTG ink saturation on thin (4.2 oz or lighter) fabrics. Normal physics.
- **Detection signal:** Customer complaint about "ghost image" or visible-through-back.
- **Recovery script:** Explain this is a thin-fabric characteristic, not a defect. Offer a 15% discount on a heavier-weight blank if you carry one.
- **Refund liability:** Merchant. Printful won't refund bleed-through on thin garments — it's "within tolerance."

### 17. AOP (all-over-print) alignment on seams
- **How often:** Common on AOP. Printful's reshipment rate on AOP is reportedly ~3x DTG.
- **Customer experience:** "The pattern doesn't match up at the side seam / underarm / pocket."
- **Root cause:** Sublimation on cut-and-sew garments: fabric stretches during printing, then is hand-aligned during sewing. A few millimeters of natural drift causes pattern misalignment at seams.
- **Detection signal:** AOP-specific complaint about seam pattern.
- **Recovery script:** Publish AOP-specific disclaimer on every AOP product page: "Cut-and-sew construction means patterns may not align perfectly at seams. This is a characteristic of the craft, not a defect." Decline replacement requests for normal seam drift; replace only if the misalignment is dramatic (>1 inch).
- **Refund liability:** Merchant for normal drift; Printful for severe defects.

### 18. AOP white streaks / sublimation imperfections near seams and underarms
- **How often:** Common. Printful's own AOP help docs disclose this.
- **Customer experience:** "There are white streaks under the arms / around the seams / in the folds."
- **Root cause:** Sublimation requires the fabric to be flat against the heat press. Underarms, hems, and seams are folded or stitched — the dye doesn't penetrate uniformly.
- **Detection signal:** AOP photo showing white near seams.
- **Recovery script:** Same as seam alignment — pre-disclose, decline for minor, replace for severe (large white patches > 2 inches).
- **Refund liability:** Merchant for "within tolerance"; Printful for clear defects.

### 19. Embroidery thread color limitations
- **How often:** Occasional surprise for new merchants.
- **Customer experience:** "The color on my hat isn't the exact shade I chose in the mockup."
- **Root cause:** Standard embroidery is limited to ~15 thread colors and up to 6 per design. Pantone codes are reference only. Unlimited Color Embroidery is a separate (premium) option but excludes neon and metallic.
- **Detection signal:** Customer expected exact Pantone match.
- **Recovery script:** Pre-disclose on embroidery product pages: "Embroidery uses a fixed thread palette; the closest match is shown." Decline refund for thread-color drift within the palette.
- **Refund liability:** Merchant. Pre-disclosure is mandatory.

### 20. Discontinued blank — what happens to existing listings
- **How often:** Occasional, every quarter Printful retires SKUs.
- **Customer experience:** "I bought this last month and now the product is gone from your store."
- **Root cause:** Blank manufacturer discontinued the line, or Printful dropped a partner blank.
- **Detection signal:** Product status changes to "discontinued" in Printful dashboard. `stock_updated` webhook with availability state shift. Operator must poll the catalog for status changes.
- **Recovery script:** Operator surfaces a "blank discontinued — pick a replacement" task in the merchant queue. For affected orders already placed: switch to closest equivalent and email customer; if no close equivalent, refund and apologize.
- **Refund liability:** Merchant refunds; Printful refunds wallet for any canceled orders.

### 21. Address validation failures
- **How often:** Common — ~1–2% of orders need address correction.
- **Customer experience:** Package returned to sender after a delivery attempt.
- **Root cause:** Customer typo, missing apartment number, invalid format for international.
- **Detection signal:** `package_returned` webhook from Printful.
- **Recovery script:** Email customer immediately with the original address asking them to confirm + correct. If they want a reship to a corrected address, they pay shipping (per Printful's policy). Update address in Printful dashboard before the order ships, if possible — once shipped, address cannot be changed. **30-day window from notification to request reship.**
- **Refund liability:** Customer pays for the reship if their address was wrong; merchant may absorb as goodwill on first occurrence.

### 22. Order stuck on hold > 30 days, auto-canceled
- **How often:** Rare but catastrophic when it happens.
- **Customer experience:** "I ordered a month ago, nothing has shipped, I want a refund."
- **Root cause:** Print file flagged for review (low DPI, copyright concern, or security flag), and the merchant never resolved it in the Printful dashboard. Printful auto-cancels and refunds the merchant wallet after 30 days.
- **Detection signal:** `order_put_hold` webhook without a subsequent `order_remove_hold` within 72 hours.
- **Recovery script:** Operator must alert the merchant within 24h of every hold and again at 7 days, 14 days, 21 days. If unresolved at day 28: auto-email the customer with apology + refund offer.
- **Refund liability:** Merchant eats the customer-facing refund and the credibility hit. Printful only refunds the production cost.

### 23. Print file rejected (low DPI, copyright, format)
- **How often:** Common at sync time, occasional at order time.
- **Customer experience:** Order delayed without explanation if merchant doesn't act on the hold.
- **Root cause:** File below 150 DPI for most products (300 DPI for phone cases/stickers), non-PNG with transparency expected, JPG with white background where transparent was needed, or copyright concern flagged.
- **Detection signal:** `order_put_hold` with "print file" reason, or sync wizard error at product creation.
- **Recovery script:** Operator surfaces "file needs upgrade" with the exact specs (sRGB IEC61966-2.1, ≥150 DPI, PNG with transparent background, fit within product's print-area dimensions). Re-upload and approve the hold.
- **Refund liability:** Merchant if the file fix delays the order past customer expectations.

### 24. "Marked delivered but not received" claim
- **How often:** Common (~0.5–1% of US orders).
- **Customer experience:** Tracking shows delivered, customer says they don't have it.
- **Root cause:** Porch theft, misdelivered to neighbor, left in wrong unit, or customer mistake.
- **Detection signal:** Customer email after a delivered tracking event.
- **Recovery script:** Per Printful's template: "Tracking shows it was delivered on [date]. Please (a) check with neighbors / household members, (b) check porch / side entrances / mailbox, (c) contact the local carrier facility to ask if it was misdelivered. If still not found after 48h, we'll discuss next steps." Printful explicitly does NOT cover this scenario.
- **Refund liability:** Merchant decides. Common practice: replace once per customer as goodwill, decline second occurrence from same customer (chargeback fraud pattern).

### 25. Payment / billing-method failure on the Printful side
- **How often:** Rare but blocking when it happens.
- **Customer experience:** Order sits in "Waiting for fulfillment" with no movement.
- **Root cause:** Merchant's Printful billing method failed (expired card, declined, wallet empty).
- **Detection signal:** `order_failed` webhook with reason "charging of the payment card fails."
- **Recovery script:** Operator surfaces this immediately as P0. Merchant must top up wallet or fix card in Printful dashboard.
- **Refund liability:** Merchant — and they need to communicate proactively with the customer to keep the order.

## Section 2: Printful-specific operational truths

### Manufacturing time SLAs (actual, not marketing)
- **Standard:** 2–5 business days across all facilities. Printful publishes "97%+ of orders ship within 5 business days" with more than half going out within 3.
- **US fulfillment (Charlotte NC, Los Angeles CA, Dallas TX):** Typically 2–4 business days; 5–7 days door-to-door domestically.
- **Mexico (Tijuana):** Same 2–5 day production window; serves NA cross-border.
- **Latvia (Riga):** Serves EU; 2–5 days production + 2–4 days regional delivery.
- **Spain (Barcelona):** Same as Latvia for southern EU; reduces shipping distance to Iberian and Mediterranean markets.
- **Q4 (Oct 15–Dec 31):** Stretches to 5–10 business days. Plan banners and customer communication accordingly.
- **Warehouse products (non-print):** Ship in ~1–2 business days, faster than print-on-demand.

### Refund / replacement policy verbatim summary
- **Claim window: 30 days from receipt** for damaged, misprinted, or defective items.
- **Lost-in-mail window: 30 days from estimated delivery date** to report.
- **Photo evidence required:** Full photo of damaged item, plus close-up of the defect. Without it, Printful won't proceed.
- **What Printful covers:** Manufacturing errors (wrong size shipped, wrong color shipped, wrong product, misprinted, defective, damaged in transit, lost in mail).
- **What Printful does NOT cover:** Buyer's remorse, wrong size ordered, address typed wrong by buyer, package marked delivered but customer says not received, color drift "within tolerance," AOP seam imperfections within tolerance, embroidery thread shade variation, fading after wash if outside 30 days.
- **Returns:** Customer keeps the defective item; Printful issues replacement or refunds to Printful Wallet. No return-to-sender required for quality issues.

### Cancellation / edit window
- An order can be canceled or edited only while its status is **"Waiting for fulfillment."** Once it transitions to "Being fulfilled," the order is locked.
- Practical window: ~5–30 minutes between order placement and pickup by production. Faster during off-peak, longer at night.
- Operator implication: any "wrong address" or "wrong variant" detection must fire within the first 5 minutes after the Shopify-to-Printful order push, or it's too late.

### Stock-out behavior
- Stock-sync feature (when enabled) marks out-of-stock variants unavailable in the merchant's store automatically.
- Without stock-sync, orders for OOS variants are placed on hold or canceled. Email notification goes to merchant; customer-facing communication is the merchant's responsibility.
- Substitutions are not automatic — merchant must approve a switch in the dashboard.

### White-label packaging
- Printful ships in plain mailers without supplier branding by default. The packing slip is brand-customizable.
- Pack-ins, custom labels, and branded inserts are paid add-ons.
- Outbound emails to the customer (if Printful is configured to send them) can be turned off so the merchant's Shopify notifications are the only customer touchpoint.

### File specs by product type
- **DTG (t-shirts, hoodies, etc.):** Minimum 150 DPI, PNG with transparent background, sRGB IEC61966-2.1 color profile. Avoid background colors on DTG (gets printed as a square). Dark garments require white underbase (auto-applied).
- **Stickers, phone cases, posters:** 300 DPI (higher detail required).
- **DTF (direct-to-film):** Similar to DTG; PNG with transparency, sRGB.
- **Sublimation / AOP:** PNG, fits the specific cut-pattern template (no off-the-shelf canvas).
- **Embroidery:** Vector source preferred, then digitized by Printful for a one-time fee ($6.50/file, $2.95 for adjustments). Max 6 thread colors from the standard palette.
- **DO NOT exceed 300 DPI** — Printful's system caps it and oversized files cause sync delays.

### Method-specific failure modes
- **DTG:** Color drift, fade after wash, dark-garment underbase ghosting, thin-fabric bleed-through.
- **DTF:** Better wash durability than DTG, but edge-cracking on heavy use.
- **Sublimation/AOP:** Seam misalignment, underarm white streaks, fold artifacts — all "within tolerance."
- **Embroidery:** Thread color limits, design size constraints (max ~4 inches wide on hats), digitization fee per design, can pucker on thin fabrics.
- **Cut-and-sew:** Highest variance (~3x replacement rate vs DTG per community reports).

## Section 3: Printful vs Printify vs Gelato vs CJ

| Dimension | Printful | Printify | Gelato | CJ Dropshipping |
|---|---|---|---|---|
| **Fulfillment model** | In-house production | Marketplace of suppliers | Network of 140 partners in 32 countries | Hybrid: own warehouses + sourcing agents |
| **Locations** | US, Mexico, Canada, Latvia, Spain, UK, Australia, Japan | Global supplier network | 32 countries (deepest EU/UK presence) | China + US/EU warehouses |
| **Production time** | 2–5 business days | Varies by supplier (2–7 days) | 2–4 business days, regional routing | 2–6 business days |
| **Print quality consensus** | Consistent (in-house QC) | Variable per supplier — some excellent, some weak | Consistent (centralized QC across network) | Adequate for trend / generic POD |
| **Catalog breadth** | ~340 products, curated | 1,300+ products, broadest | ~500+ products, EU-strong | Broadest non-POD catalog; POD subset smaller |
| **API quality** | Mature REST + webhook v1, OAuth, sync products model | REST API, supplier-aware ordering | Mature API, native multi-region routing | Functional API, less polished docs |
| **Refund policy strictness** | 30-day window, photo required, in-house decisions | 30-day window, must contact each supplier individually (slower) | 30 days (15 days per API docs) — replacement-first | Variable, depends on supplier |
| **Refund speed** | Fast (in-house) | Slower (per-supplier escalation) | Fast (centralized) | Mixed |
| **Branding** | Pack-ins, labels, custom slip | Limited (depends on supplier) | Strong neutral branding | Strongly private-label friendly |
| **Bestsellers** | T-shirts, hoodies, hats, AOP apparel | Mugs, t-shirts, posters (broad) | Wall art, framed prints, mugs, EU apparel | T-shirts + general dropshipping items |
| **Best for** | Apparel-first US/EU brands, premium feel, predictable quality | Maximum SKU variety, lowest production cost shopping | EU/UK-focused brands, eco-conscious, fast regional delivery | China-sourced general dropship + light POD |

### Decision tree
- **Primarily US or US+EU apparel, brand-first?** → Printful
- **Need maximum product variety, OK juggling supplier quality?** → Printify
- **EU/UK-first, wall art + mugs, want eco/local?** → Gelato
- **Mixed dropship + POD, private-label heavy, OK with China lead times for cost savings?** → CJ
- **Selling at scale and want a backup?** Always have a secondary provider configured so a Printful outage doesn't kill the business.

## Section 4: Customer-service script templates

### Template A — Color complaint (first response)
> Subject: Re: Order #[ORDER]
>
> Hi [NAME],
> Thanks for reaching out, and I'm sorry the print color didn't land where you expected. Our products are made on demand using DTG printing, which means colors can shift slightly from how they appear on screen — screens display in RGB, while fabric is printed in CMYK ink. We try to keep this within a tight tolerance, but minor variance is normal.
>
> Could you reply with a well-lit photo of the full garment plus a close-up of the print? That'll help me determine if this is within normal range or if there's a defect we should reprint at no charge.
> — [STORE NAME]

### Template B — Damaged / misprinted product (first response)
> Subject: Re: Order #[ORDER]
>
> Hi [NAME],
> I'm really sorry to hear your order arrived [damaged / misprinted]. We'll absolutely make this right.
>
> Could you reply with:
> 1. A full photo of the item showing the issue
> 2. A close-up of the affected area
> 3. (For damage) A photo of the shipping packaging
>
> Once I have those, I'll start a replacement immediately — no need to send the original back. Expect it in [3–5 business days for production + standard shipping].
> — [STORE NAME]

### Template C — Wrong size complaint (where customer ordered wrong size)
> Subject: Re: Order #[ORDER]
>
> Hi [NAME],
> Thanks for reaching out. I checked your order and the size shipped (Medium) matches what was ordered. Our return policy doesn't cover sizing mismatches because each item is made to order, but I want to help — would a 15% discount code on an order for the correct size work for you?
>
> Our size chart for this product is here: [LINK]. Bella+Canvas runs a bit slimmer than Gildan; I always recommend sizing up if you're between sizes.
> — [STORE NAME]

### Template D — Lost in mail (past estimated delivery date)
> Subject: Re: Order #[ORDER] — checking on your delivery
>
> Hi [NAME],
> I just checked tracking and your package looks like it's stuck in transit. It happens occasionally with [carrier]. Could you give it 2–3 more business days to update, then reply if it still hasn't moved? If we hit the 7-day stall mark, I'll file a lost-package claim with our fulfillment partner and get a free replacement headed your way.
> — [STORE NAME]

### Template E — Marked delivered, not received
> Subject: Re: Order #[ORDER]
>
> Hi [NAME],
> I'm sorry you're dealing with this. Tracking shows delivery on [DATE]; here are the first three things that resolve most of these cases:
> 1. Check with neighbors and anyone in your household.
> 2. Check porches, side entries, garages, and mailboxes — sometimes carriers leave packages out of the obvious spots.
> 3. Contact your local [USPS / UPS / FedEx] facility — give them the tracking number and ask if it was misdelivered.
>
> Most of the time it shows up within 48 hours. If not, reply back and we'll talk through next steps. We can't always replace at no charge for delivered packages (the carrier won't reimburse us), but I want to help you find a solution.
> — [STORE NAME]

### Template F — Customs delay (international)
> Subject: Re: Order #[ORDER] — customs update
>
> Hi [NAME],
> Your package is sitting in customs in [COUNTRY]. This is unfortunately common for international orders, especially during peak season — customs clearance can add anywhere from a few days to a couple of weeks depending on the inspection queue.
>
> Tracking will update once it's released. If it doesn't move within 14 more days, reply back and I'll escalate with our shipping partner.
> — [STORE NAME]

### Template G — Buyer's remorse / changed mind
> Subject: Re: Order #[ORDER]
>
> Hi [NAME],
> I understand. Because every item is printed and made just for you when you order, I'm not able to take it back or offer a refund for a change of mind — there's no resale value for a customized item. I'm sorry about that.
>
> If you'd like, I can offer a 15% discount on a future order. Otherwise, the item is yours to keep, gift, or donate. Thanks for understanding.
> — [STORE NAME]

### Template H — Q4 shipping delay (proactive)
> Subject: Quick update on your order #[ORDER]
>
> Hi [NAME],
> Just a heads-up: our fulfillment partner is seeing higher-than-normal volume due to the holiday season, and your order is taking a bit longer than usual to enter production. Current expected ship date is [DATE], with delivery around [RANGE].
>
> I appreciate your patience, and here's a 10% code for your next order: [CODE]. We'll have tracking to you the moment it ships.
> — [STORE NAME]

### Escalation template — When customer is angry / threatening chargeback
> Hi [NAME],
> I hear how frustrating this has been, and I want to resolve it for you today. To make sure I get this right, can you confirm: you'd prefer a full refund, or a replacement at no charge? Whichever you pick, I'll process it as soon as you confirm.
>
> If you've already filed a chargeback, I'll need to wait for that to resolve on its own — but if you'd like to close the chargeback, I can refund directly within an hour.
> — [STORE NAME]

## Section 5: Operator action protocol per failure mode

| Failure mode | Auto-detect signal | Operator action |
|---|---|---|
| Order on hold | `order_put_hold` webhook | Alert merchant within 1h. Re-alert at 24h, 7d, 14d, 21d. Auto-email customer at 28d if unresolved. |
| Order canceled by Printful | `order_canceled` webhook | Email customer immediately with refund + reorder options. Surface to merchant queue. |
| Order failed (file/payment) | `order_failed` webhook | P0 surface to merchant. Block new orders on the affected product/variant. |
| Package shipped | `package_shipped` webhook | Push tracking to Shopify; trigger Klaviyo "shipped" flow if configured. |
| Package returned | `package_returned` webhook | Auto-draft email to customer asking for address confirmation. Hold for merchant approval. |
| Stock out (variant) | `stock_updated` webhook with availability shift | Auto-disable variant in Shopify (if stock-sync enabled). Surface "variant gone" to merchant queue. |
| Discontinued product | Polling: catalog status changes | Surface "discontinued — pick replacement" task to merchant. Suggest closest alternative SKU. |
| Wrong-variant complaint cluster | 2+ "wrong size" or "wrong color" complaints on same product within 72h | Auto-pause product; run variant-mapping reconciliation; surface to merchant. |
| Sizing complaint | Customer email keyword "too small / tight / large" + correct SKU | Auto-draft Template C (sizing). Hold for merchant approval. |
| Damaged / misprinted | Customer email + attached photo | Auto-draft Template B (damaged). Auto-submit Printful problem report once merchant approves. |
| Lost in mail | Tracking stalled >7 days domestic, >21d intl | Auto-draft Template D. Trigger Printful lost-package report at day 14 (domestic) / 28 (intl). |
| Marked delivered, not received | Customer email after delivered event | Auto-draft Template E. Do NOT auto-refund — surface to merchant for goodwill decision. |
| Customs delay | Tracking stuck in destination country >7d | Auto-draft Template F. Surface to merchant only if customer follows up. |
| Q4 surge incoming | Calendar Oct 1 | Auto-publish banner; Auto-update product pages with "extended holiday processing" notice; surface to merchant for approval. |
| Color complaint | Customer email keyword "color / faded / wrong shade" | Auto-draft Template A. Decline auto-refund — hold for merchant photo review. |
| Buyer's remorse | Customer email keyword "changed mind / don't want / return" | Auto-draft Template G. Hold for merchant approval (some merchants are more generous). |
| Chargeback / threat | Customer email keyword "chargeback / dispute / bank" | P0: escalate to merchant immediately. Do not auto-respond. |

### Auto vs surface vs escalate
- **Auto-action without merchant approval:** webhook-to-Shopify status sync (tracking, fulfillment, cancellation), banner publishing (Q4 prep), variant disable on stock-out.
- **Auto-draft + surface for merchant approval:** all customer-facing emails (every template above).
- **Surface only, no draft:** Q4 strategy decisions, billing-method failures, hold-resolution decisions where merchant input is required.
- **Escalate (human-required):** chargebacks, legal threats, $500+ disputes, repeated complaints from the same customer (possible fraud).

## Section 6: Refund decision tree

```
Buyer reports issue → Was order received?
  ├── NO (lost in mail)
  │     → Past estimated delivery + buffer?
  │         ├── NO → Wait 2–3 days, Template D
  │         └── YES → Within 30 days of estimated delivery?
  │               ├── YES → Submit Printful lost-package claim; free reprint
  │               └── NO → Merchant decides (typically refund as goodwill)
  │
  ├── YES, marked delivered but says not received
  │     → Send Template E (check neighbors / household / carrier)
  │       → Resolved within 48h?
  │           ├── YES → Close ticket
  │           └── NO → Merchant decides (goodwill replacement first time, decline if pattern of fraud)
  │
  └── YES, received
        → Is it a fulfillment error? (wrong size shipped vs ordered, wrong color, wrong product, misprint, damage)
            ├── YES → Within 30 days of receipt?
            │     ├── YES → Photos provided?
            │     │     ├── YES → Submit Printful problem report → free replacement
            │     │     └── NO → Request photos (Template B), then proceed
            │     └── NO → Merchant decides (recommended: partial refund or discount code, not full)
            │
            └── NO (not a fulfillment error)
                  → Is it a sizing complaint where shipped SKU matches ordered SKU?
                      ├── YES → Template C; no refund; offer 15% discount on correct size
                      └── NO → Is it color drift / minor seam imperfection / thin-fabric bleed-through?
                            ├── YES → Template A or AOP disclaimer; decline refund; offer goodwill discount
                            └── NO → Is it a buyer's remorse?
                                  ├── YES → Template G; decline refund per published policy
                                  └── NO → Is it a fade / crack / quality issue?
                                        ├── Within 30 days → Submit Printful claim with photos
                                        └── After 30 days → Merchant decides; recommend 25% off next order
```

## Section 7: Operator hard rules (for `.openclaw/operator/knowledge/meta-rules/`)

1. **30-day claim clock:** For every shipped order, register a 30-day-from-receipt timer. At day 25, if any complaint touched the order, auto-surface to merchant: "Printful claim window closes in 5 days." Past 30 days, Printful will not cover the claim.

2. **5-minute edit window:** After every Shopify-to-Printful order push, hold the order in a "verifying" state for 5 minutes. Re-check the variant_id and shipping address against the Shopify order. If a mismatch is detected, attempt an edit via the Printful API before the order locks.

3. **Variant reconciliation on every sync:** After `sync_product` or `update_sync_variant` calls, fetch the resulting Printful variant tree and compare against Shopify variant SKUs. Any mismatch triggers a P1 alert. Never trust the sync wizard's auto-mapping silently.

4. **Q4 banner mandate:** Between Oct 1 and Dec 31, the operator auto-checks for an active "holiday processing times" banner on each tenant's storefront. If absent, surface "Q4 banner missing" task as P1 with a pre-written banner block.

5. **DDU/DDP surfacing:** On any tenant with international shipping enabled but DDP disabled, surface a P2 warning: "Your international buyers will be charged duties at delivery. Consider enabling DDP shipping in Printful settings."

6. **Photo-evidence enforcement:** Never submit a Printful problem report without an attached customer photo. If a merchant asks the operator to "just refund and report it," refuse — the report will be denied without evidence, and the merchant will lose the cost of the replacement.

7. **Marked-delivered-not-received is merchant-decision:** The operator never auto-refunds or auto-replaces a "marked delivered but not received" claim. Printful explicitly excludes coverage; this loss is the merchant's to absorb or decline. Surface with Template E pre-filled.

8. **Sizing complaint = no refund by default:** When the shipped SKU matches the ordered SKU, the operator's default response is Template C (no refund + 15% discount). Only override if the merchant has set a "size exchange" policy explicitly.

9. **Hold escalation cadence:** Orders in `on_hold` status trigger alerts at 1h, 24h, 7d, 14d, 21d. At day 28, auto-email customer with refund + apology to prevent the day-30 auto-cancel from blindsiding them.

10. **AOP / sublimation pre-disclosure mandatory:** On any AOP or sublimation product page, the operator auto-injects a disclosure block: "Cut-and-sew construction may show minor seam pattern misalignment or small white areas near seams and underarms. This is a characteristic of the printing method, not a defect." Without this, the merchant has no basis to decline refund requests on tolerance-range AOP imperfections.

11. **Embroidery thread palette pre-disclosure:** On embroidery product pages, auto-inject: "Embroidery uses our supplier's fixed thread palette (15 colors, max 6 per design). The closest match to your design is used; Pantone codes are for reference only." Without this, color-exact-match complaints will be unwinnable.

12. **Sample-before-launch nudge:** When a merchant publishes a new product without a recorded sample order in the last 60 days, the operator surfaces a P3 "order a sample" nudge. Printful offers a 20% sample discount, and "no sample" is the #2 most common Printful-acknowledged mistake.

## Sources

### Printful policy + help center (canonical)
- [Printful Return Policy](https://www.printful.com/policies/returns)
- [How long do I have to submit a claim?](https://help.printful.com/hc/en-us/articles/360014007180-How-long-do-I-have-to-submit-a-claim-for-a-return-exchange)
- [Quality issues vs. customer change of mind](https://help.printful.com/hc/en-us/articles/360014006840-How-are-returns-handled-for-quality-issues-vs-customer-change-of-mind)
- [Color Matching Disclaimer](https://help.printful.com/hc/en-us/articles/360014007700-Color-Matching-Disclaimer)
- [Why was my order canceled?](https://help.printful.com/hc/en-us/articles/21074065732636-Why-was-my-order-canceled)
- [Why is my order on hold?](https://help.printful.com/hc/en-us/articles/360014009060-Why-is-my-order-on-hold)
- [What if my order is lost in the mail?](https://help.printful.com/hc/en-us/articles/360014065779-What-if-my-order-is-lost-in-the-mail)
- [Package marked delivered but customer didn't receive](https://help.printful.com/hc/en-us/articles/360014007100-What-happens-if-a-package-wasn-t-delivered-to-my-customer-but-the-tracking-states-that-it-was)
- [If the order gets damaged in the mail](https://help.printful.com/hc/en-us/articles/360014006800-What-if-the-order-gets-damaged-in-the-mail)
- [Order being returned to sender](https://help.printful.com/hc/en-us/articles/360014066499-My-order-shows-it-is-being-returned-to-sender-what-now-)
- [What photos should I submit when reporting a problem?](https://help.printful.com/hc/en-us/articles/20963260366236-What-photos-should-I-submit-when-reporting-a-problem-with-my-order)
- [Can I change or cancel an order already submitted?](https://help.printful.com/hc/en-us/articles/360014007060-Can-I-change-or-cancel-an-order-that-is-already-submitted)
- [How long does fulfillment take?](https://help.printful.com/hc/en-us/articles/360014007980-How-long-does-fulfillment-take)
- [Estimated delivery time calculation](https://help.printful.com/hc/en-us/articles/360017631360-What-is-the-estimated-delivery-time-and-how-is-it-calculated-)
- [Order Fulfillment Statuses Explained](https://www.printful.com/academy/lessons/printful-order-fulfillment-statuses-explained)
- [Out-of-stock variant behavior](https://help.printful.com/hc/en-us/articles/360014066379-What-happens-when-a-product-is-ordered-but-the-supplier-s-out-of-stock)
- [Why are products discontinued?](https://help.printful.com/hc/en-us/articles/360020929240-Why-are-my-products-discontinued)
- [Product stock sync](https://help.printful.com/hc/en-us/articles/4402498011282-What-is-product-stock-sync-and-how-does-it-affect-my-store)
- [What if the recipient's address was wrong?](https://help.printful.com/hc/en-us/articles/360014065739-What-if-the-recipient-s-address-was-wrong)
- [Who pays customs duties & taxes?](https://help.printful.com/hc/en-us/articles/360014066159-Who-pays-the-customs-duties-taxes)
- [Delivered Duty Paid (DDP) shipping option](https://help.printful.com/hc/en-us/articles/15941136562332-What-is-the-Delivered-Duty-Paid-DDP-shipping-option)
- [What should I know about all-over printing?](https://help.printful.com/hc/en-us/articles/360014007460-What-should-I-know-about-all-over-printing)
- [AOP explained](https://help.printful.com/hc/en-us/articles/21045992765468-What-is-AOP-and-how-does-all-over-printing-work)
- [Thread color limits / unlimited color embroidery](https://help.printful.com/hc/en-us/articles/5410467442076-What-s-unlimited-color-embroidery)

### Printful developer + technical
- [Printful Developer Docs](https://developers.printful.com/docs/)
- [Webhook API](https://www.printful.com/docs/webhooks)
- [Create the perfect DTG file](https://www.printful.com/creating-dtg-file)
- [Print file preparation guide](https://www.printful.com/blog/everything-you-need-to-know-to-prepare-the-perfect-printfile)
- [Transparency in DTG files](https://www.printful.com/transparency-in-dtg-files)
- [Graphics and Embroidery Guide](https://www.printful.com/graphics-and-embroidery-guide)
- [DTF print file preparation](https://www.printful.com/blog/preparing-dtf-print-file)
- [Holiday shipping deadlines](https://www.printful.com/blog/your-holiday-shipping-and-order-deadline-guide)
- [Global Fulfillment locations](https://www.printful.com/global-fulfillment)
- [European fulfillment centers](https://help.printful.com/hc/en-us/articles/360014067239-Where-are-the-European-fulfillment-centers-located)
- [Shipping Speeds & Pricing](https://www.printful.com/shipping)

### Printful merchant + community guides
- [17 Critical POD Mistakes (Printful)](https://www.printful.com/blog/print-on-demand-mistakes)
- [6 Most Common Printful Customer Mistakes](https://www.printful.com/blog/online-store-mistakes)
- [Color Matching Guide for POD](https://www.printful.com/ca/blog/color-matching-guide-print-on-demand)
- [Sublimation Printing Guide (Printful)](https://www.printful.com/blog/what-is-sublimation-printing)
- [Printful Policies Your Store Should Copy (Free Templates)](https://www.printful.com/blog/top-5-printful-policies-your-store-should-copy)
- [Printful & Shopify demo store policies/FAQs](https://printful-demo-store.myshopify.com/pages/policies-and-faqs)

### Trustpilot, BBB, and merchant horror stories
- [Printful Trustpilot reviews](https://www.trustpilot.com/review/printful.com)
- [Printful UK Trustpilot page 6](https://uk.trustpilot.com/review/printful.com?page=6)
- [Printful Trustpilot page 3](https://www.trustpilot.com/review/printful.com?page=3)
- [Printful Capterra reviews](https://www.capterra.com/p/209769/Printful/reviews/)
- [Printful BBB reviews](https://www.bbb.org/us/nc/charlotte/profile/fulfillment-services/printful-0473-681505/customer-reviews)
- [Printful PissedConsumer reports](https://printful.pissedconsumer.com/review.html)
- [Printful Awful — T-Shirt Forums](https://www.t-shirtforums.com/threads/need-your-help-printful-is-awful.690017/)
- [Printful Quality Issues — T-Shirt Forums](https://www.t-shirtforums.com/threads/printful-quality-issues-anyone-else.870687/)
- [Long shipping delays — Shopify Community](https://community.shopify.com/t/experiencing-long-shipping-delays-with-printful/33861)
- [Shopify Community: Managing POD returns](https://community.shopify.com/c/shopify-discussions/how-do-you-manage-returns-for-print-on-demand-t-shirts/td-p/965412)
- [Out-of-stock Printful variant in Shopify — Shopify Community](https://community.shopify.com/t/printful-shows-out-of-stock-for-a-variant-and-shopify-does-not-show-the-same/263630)

### Competitor docs (Printify, Gelato, CJ)
- [Printify refund policy](https://help.printify.com/hc/en-us/articles/4483630299025-How-does-Printify-handle-refunds-and-returns)
- [Printify AOP limitations](https://help.printify.com/hc/en-us/articles/4483601277585-What-are-the-limitations-of-all-over-printing-AOP)
- [Printify replacing unavailable products](https://help.printify.com/hc/en-us/articles/4483623844241-How-can-I-replace-an-unavailable-product-in-my-order)
- [Printify embroidery colors](https://help.printify.com/hc/en-us/articles/4483625589905-Which-colors-can-I-use-in-my-embroidery-design)
- [Printify Trustpilot reviews](https://www.trustpilot.com/review/printify.com)
- [Gelato return policy & quality guarantee](https://support.gelato.com/en/articles/8996072-what-is-your-return-policy-and-quality-guarantee)
- [Gelato DTG file guidelines](https://support.gelato.com/en/articles/8996354-what-are-the-guidelines-regarding-design-files-for-dtg-printing)
- [Gelato vs Printify (Printful's blog)](https://www.printful.com/blog/gelato-vs-printify)
- [Gelato vs Printful (Printify's blog)](https://printify.com/blog/gelato-vs-printful/)
- [Printful vs Printify vs Gelato (POD Business)](https://www.printondemandbusiness.com/blog/printful-vs-printify-vs-gelato/)
- [Printful vs Printify vs Gelato (EU sellers)](https://marketing4ecommerce.net/en/gelato-printful-printify-comparative/)
- [CJ vs Printful (CJ blog)](https://cjdropshipping.com/blogs/print-on-demand/Printful-vs-CJdropshipping)
- [CJ POD platforms 2026 comparison](https://cjdropshipping.com/blogs/print-on-demand/Print-on-Demand-Platforms)

### Customer service script + ecommerce ops references
- [Prodigi: Customer Service 101 for POD](https://www.prodigi.com/blog/customer-service-101-for-print-on-demand/)
- [How to Handle POD Returns on Shopify (Return Prime)](https://www.returnprime.com/blog/shopify-print-on-demand-returns-handling)
- [Shopify Refund Policy Generator](https://www.shopify.com/tools/policy-generator/refund)
- [How To Write a Return Policy (Shopify)](https://www.shopify.com/blog/return-policy)
- [Customer service email templates (Shopify)](https://www.shopify.com/blog/customer-service-email-templates)
- [30+ ecommerce customer service scripts (Ringly)](https://www.ringly.io/blog/customer-service-scripts-ecommerce)
- [Lost Package Email Templates (TextExpander)](https://textexpander.com/templates/lost-package-email)
- [Order not received templates (Flodesk)](https://flodesk.com/tips/order-not-received-email-templates)
- [Letter Template: Buyer Says Item Not Received (Fastlane Forum)](https://www.thefastlaneforum.com/community/threads/letter-template-buyer-says-item-not-received-but-its-marked-delivered.66515/)
- [How to handle Etsy+POD returns (Adventures With Art)](https://adventureswithart.com/how-to-handle-print-on-demand-returns/)

### Shipping, customs, and chargebacks
- [USPS international claims](https://www.usps.com/help/international-claims.htm)
- [Chargeback Gurus: delivery confirmation](https://www.chargebackgurus.com/blog/fighting-chargebacks-with-delivery-confirmation)
- [Chargebacks911: delivery confirmation and chargebacks](https://chargebacks911.com/delivery-confirmation-chargebacks/)
- [DDP vs DAP / DDU explainers (Mercury)](https://www.shipmercury.com/glossary/ddp-vs-ddu-incoterms)
- [DDU Complete Guide (GoFreight)](https://gofreight.com/blog/education/the-complete-guide-to-ddu-and-delivery-duty-unpaid.html)
- [USPS undeliverable / RTS handling (GovFacts)](https://govfacts.org/government/federal/independent-executive/usps/usps-says-undeliverable-as-addressed-your-next-steps/)

### Sublimation, DTG, embroidery technical
- [Coastal Business: DTG dark shirt guide](https://www.coastalbusiness.com/blog/direct-to-garment/direct-to-garment-printing-a-step-by-step-guide-to-dark-shirts.html)
- [Sublimation imperfection at seams (AOP+)](https://aopplus.freshdesk.com/support/solutions/articles/77000262926-sublimation-imperfection)
- [7 Common Sublimation Issues (Coastal Business)](https://www.coastalbusiness.com/blog/sublimation/7-common-sublimation-issues-and-how-to-fix-them.html)
- [SanMar: polyester and sublimation compatibility](https://www.education.sanmar.com/decorator-relations/understanding-polyester-fabrics-and-dye-sublimation-compatibility/)
- [Sublimation creasing/shadow — T-Shirt Forums](https://www.t-shirtforums.com/threads/sublimation-print-leaving-crease-and-shadow.162487/)

### Bella+Canvas sizing baseline
- [BELLA+CANVAS Fit & Size Charts](https://www.bellacanvas.com/fit-size-charts)
- [B+C 3001 sizing guide (Printify blog)](https://printify.com/blog/bella-canvas-3001-guide/)
- [B+C sizing guide (Bulkapparel)](https://blog.bulkapparel.com/clothing-retailers/bellacanvas-apparel-sizing-how-to-choose-the-correct-size/)
