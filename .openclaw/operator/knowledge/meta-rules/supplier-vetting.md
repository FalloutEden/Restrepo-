# Supplier vetting checklist — verify before recommending

**Critical rule:** never recommend a supplier or specific blank to the user without running through this checklist first. The 2026-05-04 Under Armour mistake (recommending a branded blank for a private-label brand) and the Apliiq Gildan 64800 polo near-miss (slim Euro fit that would have caused returns) both happened because this verification step was skipped. Run it every time.

If `web_search` exists in your tools, use it. If a check can't be verified, say so explicitly in the recommendation and flag it as a risk to the user.

## Required checks for any apparel supplier or blank recommendation

### 1. Sizing reputation
- Search for "[blank model] runs small OR runs large" reviews
- Check Trustpilot and Reddit for fit complaints
- Confirm whether the supplier's "fitted" cut differs from their "unisex/relaxed" cut (TapStitch and others have multiple cuts in the same line)
- For BV: prefer relaxed/unisex/classic cuts. Avoid fitted/Euro/slim cuts unless the user specifically asks.
- **Pass if:** consistent feedback that it runs true to size or slightly large. **Fail if:** common complaints of "size up by 1+"

### 2. Brand visibility on garment
- Does the blank carry a visible external brand mark (Adidas/Nike/Under Armour/Champion/Puma/Reebok)?
- Is the supplier's own logo visible on the polybag, hangtag, or interior label seen by the customer?
- **Pass if:** unbranded externally and the supplier offers white-label customization. **Fail if:** any external third-party brand visible. Black Vault is a private label — competitor branding on a BV product breaks the brand.

### 3. Quality + customer reviews
- Trustpilot rating (target: 4+ stars with 100+ reviews)
- Shopify app store rating if applicable (target: 4.5+)
- Search for "[supplier] complaints" and "[supplier] poor quality"
- Look for patterns in the negative reviews — isolated bad orders vs systemic quality issues
- **Pass if:** 4+ Trustpilot, complaints are isolated (slow shipping, occasional defect). **Fail if:** systemic complaints about peeling prints, color fade, embroidery defects, or refund disputes.

### 4. Fabric weight and construction
- For BV premium positioning: minimum 6 oz/yd² (200 GSM) tees, 8+ oz hoodies, 280+ GSM for embroidery-friendly outerwear
- Pique cotton or heavyweight knit for polos
- White-label construction details (taped neck, side seams, twin-needle hems)
- **Pass if:** matches premium tier targets. **Fail if:** lightweight (<5 oz tees), thin pique, or basic construction.

### 5. Shopify integration + automation
- Native Shopify app with strong reviews? OR manual order entry per request?
- For BV's auto-fulfillment model: native Shopify integration required.
- **Pass if:** native Shopify app, 4.5+ stars. **Fail if:** manual ordering only — that breaks the DTC dropship workflow.

### 6. Lead time + production location
- Production time (days from order to ship)
- Domestic shipping speed
- For BV: 7-day delivery window is the customer expectation
- **Pass if:** 5–10 day total customer delivery. **Fail if:** 14+ day average.

### 7. Customization layer (premium signal)
- Custom woven neck labels available?
- Custom hangtags available?
- Custom packaging available?
- Embroidery placement options (chest, sleeve, back)?
- **Pass if:** woven neck labels available — that's the premium signal at this tier.

## Verified status as of 2026-05-04

### TapStitch
- Sizing: ⚠ Their **fashion/fitted cuts run small** (1+ size down). Their **unisex/relaxed cuts run conventional**. Pick relaxed.
- Brand visibility: ✓ Their own private-label blanks, no third-party logos
- Reviews: ✓ Trustpilot 4.3/5 (362 reviews), Shopify 4.7/5
- Fabric: ✓ 250–380 GSM range, 6.5oz+ tees, 400 GSM hoodies (heavier than Printful)
- Integration: ✓ Native Shopify app, 4.6 stars, <10 min setup
- Lead time: ✓ 2–4 day production, ships LA + Guangzhou
- Customization: ✓ Custom woven neck labels (no monthly fee, no MOQ)
- Negative signals: occasional reports of prints peeling after one cold wash; sizing confusion from buyers who don't read the cut description

### Printful (current default)
- Sizing: ✓ Most blanks true to size or slightly large (Cotton Heritage MC1086, Comfort Colors 1717, AS Colour 5081, Stanley/Stella SASU024, Lane Seven LS14004, Bella+Canvas 4737, Bella+Canvas 6400, Stanley/Stella SASW035 — all OK)
- Brand visibility: ✓ Most blanks unbranded (Port Authority, Cotton Heritage, etc.). ❌ Avoid Adidas, Nike, Under Armour blanks.
- Reviews: ✓ Trustpilot 4.2/5 (1,230 reviews) — recurring complaints about slow customer service, occasional crooked prints, embroidery defects
- Fabric: ⚠ Mid-tier — 5–10 oz typical. Stanley/Stella line is the strongest at 10.3 oz
- Integration: ✓ Best-in-class Shopify integration, 21 platforms total
- Lead time: ✓ 2–7 day production, 12+ global facilities
- Customization: ❌ No custom woven neck labels (generic tear-aways only)

### Apliiq
- Sizing: ⚠ Their flagship Cotton Pique Polo is Gildan 64800 — "slim Euro fit," runs small for athletic/larger builds. Apliiq's FAQ explicitly warns customers.
- Brand visibility: ⚠ Some blanks branded (Nike Dri-FIT polo has visible Nike). Their own line is unbranded.
- Reviews: ✓ Shopify 4.8/5 (400+ reviews). Some complaints about slow turnaround and quality issues with branded add-ons.
- Fabric: ✓ Premium-tier blanks
- Integration: ✓ Native Shopify integration
- Lead time: ⚠ 7–14 days production with branding (slow)
- Customization: ✓ Custom woven labels, hangtags, packaging — strongest in this tier

### Threadlogic / Lands' End Business / Merchology
- Real retail brands (TravisMathew, Peter Millar, Brooks Brothers, etc.) embroidered with your logo
- Sizing: ✓ retail blanks, well-documented sizing
- Brand visibility: ❌ TravisMathew/Peter Millar/etc are themselves visible brands — the customer would see "TravisMathew" inside the collar
- Integration: ❌ No Shopify dropship — manual order entry per customer request
- **Use case:** physical samples to benchmark quality. NOT for dropship.

## When to use which (BV-specific)

| Need | Right answer |
|---|---|
| Auto-fulfillment Shopify drops, premium positioning | **TapStitch (relaxed-cut blanks only)** |
| Auto-fulfillment Shopify drops, broad reliability | **Printful** (current default) |
| Premium customization (woven labels, hangtags, packaging) | TapStitch first; Apliiq if TapStitch can't support a specific customization |
| Physical samples to benchmark quality | Threadlogic ($65 small-order fee + ~$20–40/sample) |
| Future private-label cut-and-sew | ASBX (Portugal, 50–100 MOQ); skip until $5–10k revenue validates the SKU |
