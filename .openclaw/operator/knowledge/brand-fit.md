# Brand Fit & Luxury Sourcing — Operator Knowledge

This is the canonical reference the Black Vault Umbrella Operator reads on every turn. Curated by the user (Karling) on 2026-05-01. Update via `record_note` or by editing this file directly when a sourcing fact changes.

---

## Black Vault Apparel — what it IS

Premium-essentials lifestyle brand. The customer is a 28–55 lifestyle buyer with taste who shops Nordstrom Men's, Dillard's elevated tier, and specialty boutiques.

- **Tier comparables:** Psycho Bunny · Aimé Leon Dore · James Perse · Theory · Murano · Travis Mathew · Live Lucky
- **Price points:** Tees $48–68 · Polos $68–98 · Hoodies $128–168 · Knits/outerwear $98–228 · Accessories (watches, bags) $89–249
- **Aesthetic:** Minimalist. Dark luxury (warm-black `#0F0E0C`, Old Gold `#A67843` monogram embroidered chest). Tagline: "Built to be Kept."
- **Voice:** Confident, considered, quietly premium. Cites material substance — GSM, fiber composition, construction details. Treats the customer as someone with taste.

## Black Vault — what it is NOT (reject and delete on sight)

These categories will NEVER fit Black Vault. If a pipeline run produces them or someone asks the operator to materialize them under BV, refuse:

- ❌ Occupation-specific apparel ("for nurses", "for veterans", "for teachers", "for moms")
- ❌ Inspirational-quote tees ("rockstar", "hustle", "grind", "queen", "boss babe")
- ❌ All-over-print loud graphics — premium is restraint
- ❌ Cheap blanks (Gildan G500, Hanes 5180) with bold front prints — that's POD-store tier
- ❌ Sticker packs, planners, ebooks, digital downloads
- ❌ Service products ("AI workflow automation", "consulting prep kits") — apparel only
- ❌ Funny / pun-based tees — wrong tone
- ❌ Holiday/seasonal one-offs — undermines the timeless positioning
- ❌ Anything that would feel at home at Walmart, Spencer's, or a pop-up booth

## LockLayer Security — what it IS

Practical home security competing with Wyze, Eufy, Ring. Customer: renters, new homeowners, Airbnb hosts, parents.

- **Tier comparables:** Wyze, Eufy, Ring, Blink, Govee
- **Price points:** $25–179 (single product); $99–399 (bundles)
- **Voice:** Plain English, specific about features (resolution, range, battery life). No fearmongering.

## LockLayer — what it is NOT

- ❌ Apparel of any kind
- ❌ Digital downloads / training materials / certification prep
- ❌ Anything not directly security / safety / IoT / smart home
- ❌ Generic electronics (headphones, chargers — unless specifically tied to security)

---

## Hard rules for any new BV materialization

These came from the 2026-05-04 expansion that had to be re-done:

1. **Never use a branded blank** (Adidas, Nike, Under Armour, Puma, Champion, Fruit of the Loom — any blank with a visible external logo or brand patch). Customer will see "Under Armour" or "Adidas" on a Black Vault listing — that breaks the private-label premise. Acceptable white-label brands: **Cotton Heritage, Comfort Colors, Bella+Canvas, AS Colour, Lane Seven, Stanley/Stella, Port Authority, Flexfit, SOCCO, Gildan (low-tier blanks only when nothing else fits)**.
2. **Always include `position: CHEST_POSITION`** in the Printful sync_variants files entry. Printful's default fills the full chest area, which renders as a giant goofy embroidery. The tuned scale is `{area_width: 1200, area_height: 1200, width: 450, height: 450, top: 375, left: 275}` — Travis Mathew / Live Lucky tier, ~1.5 inches at production. Same value lives in `scripts/blackvault-resize-chest-embroidery.ts`.
3. **Always generate mockups via the mockup-generator API with `technique: "EMBROIDERY"` and `position: CHEST_POSITION` BEFORE attaching images to the Shopify draft.** Don't fall back to attaching the logo PNG as a placeholder — it becomes the primary image and the listing looks broken. If the mockup task takes too long, leave the draft imageless and re-run the mockup attach step later.
4. **Wipe existing Shopify product images before attaching new mockups.** Otherwise old fallback images become orphaned secondaries.

## Pipeline misrouting — known anti-patterns

The 11-agent `run_pipeline` trains on Etsy / Fiverr / job-vocabulary datasets and has historically produced this slop. **Audit every pipeline run within 5 minutes of completion and delete anything matching these patterns:**

1. **"AI Workflow Automation Setup"** style — services, not products
2. **"Search Quality Rater Prep Kit"** style — digital training
3. **"E-commerce Taxonomist Tool"** style — niche B2B
4. **"For [job title]"** apparel under Black Vault — wrong brand tier
5. **Sticker packs / printables / planners** — wrong format
6. **Holiday-specific** ("Mother's Day this", "4th of July that") for a brand positioned as timeless

If you (the operator) trigger a pipeline run on behalf of the user, your responsibility doesn't end at "started" — when it finishes, audit and clean up.

---

## Sourcing tiers — apparel

### POD (no MOQ, drop-ship, current default)

| Supplier | Tier | Use For | Notes |
|---|---|---|---|
| **Printful** | Mid-premium | BV current capsule | Reliable. Embroidery quality high. Stanley/Stella organic line is the closest to true premium feel. Best for v1. |
| **Apliiq** | Premium | BV expansion: heavyweight tees, custom woven labels, premium packaging | Heavyweight tees up to 9.5oz. Slower production (10–14 days). Smaller catalog. |
| **AOP+** | Mid (sublimation) | Skip for BV | Polyester-only, not premium feel |
| **Inkthreadable** | UK premium | Skip unless BV launches UK | UK-based; shipping cost from UK to US is high |
| **Dreamship** | Mid | Backup if Printful has stock issues | Decent polos, weaker embroidery |
| **Threadbird** | Premium small-batch | BV limited drops (24-unit MOQ) | Screen-print + embroidery; bridges POD and small-batch |

### Small-batch private label (50–300 MOQ — requires upfront capital)

For genuine premium where POD can't deliver. Unit cost drops 50–70% but capital + warehousing required.

- **Sanjo Indústria Têxtil (Portugal)** — heavyweight tees, polos, organic cotton; MOQ ~100/style; English-speaking sales
- **Confecções Sintex (Portugal)** — same tier; competitive pricing
- **Indo Knits / Diamond Apparel (Pakistan)** — MOQ 200+; lowest cost premium; Lacoste-supplier-tier
- **Devanlay / Apparelys (Peru, Pima cotton)** — MOQ 100–300; genuine James Perse / Vince feel

**Recommendation:** stay POD for first 90 days (zero risk). After $10k revenue from any single SKU, evaluate moving that SKU to small-batch for margin upgrade.

---

## Watches with BV monogram engraving

User specifically asked for: rose gold, gold, silver, black premium watches that can be engraved with "BV" or "Black Vault."

### POD path (operator-friendly, zero capital)

- **ShineOn** (shineon.com) — POD jewelry/watches with custom engraving, integrates with Shopify
  - **Roman Numeral Watch series:** ~$28 base cost, $89–139 retail target
  - Available in: rose gold, gold, silver, gunmetal/black
  - Engraving on the caseback — perfect spot for BV or full "Black Vault" mark
  - Quality: decent. More "gift store" than heirloom but the metal finish reads premium in photos
  - **Action needed from user:** create ShineOn account at shineon.com (free), connect to Shopify Black Vault store, then the operator can pull their catalog and materialize 4 colorway SKUs
- **Custom Wood Watches via Custom Ink / Print Aura** — some carriers do bamboo/walnut watches but those are off-brand for BV (too rustic)

### Private label path (premium tier, requires capital)

For "real" premium watches at $200–600 retail:

- **Hong Kong — Sea-Gull Watch Group** — mechanical movements, $40–150 cost basis, MOQ 100; closest US wholesaler is **Foksy Watch**
- **Shenzhen factories via Alibaba** (search: "OEM watch laser engraving"); ChiMei Industrial and similar; $15–40 cost; laser engraving included; MOQ 100
- **Mountain View Watches** (US assembly, small-batch white label) — best for "Made-with-care" story; $80–180 cost, MOQ 50

### Recommendation for v1

Start with ShineOn — it's the only path that fits the current POD operating model. Launch 4 BV monogram-engraved watches (rose gold, gold, silver, gunmetal). Once revenue justifies it, upgrade to private label with a Mountain View or Sea-Gull partnership.

---

## Premium polo upgrade (Travis Mathew / Live Lucky tier)

Current "The Polo" uses Port Authority K500 — solid business polo, but it's 100% cotton piqué. Travis Mathew/Live Lucky use 88/12 polyester/spandex 4-way stretch performance fabric. Different feel entirely.

### Upgrades available within Printful

- **Adidas A480 Performance Polo** — 4-way stretch, ~$26 base cost; closest TM/LL fabric clone in catalog
- **Nike Dri-FIT 363807** — ~$30 base; pro-shop tier; embroidery-friendly
- **Port Authority K864** — 4-way stretch performance, ~$24 base; budget TM-fabric clone

### Genuine Lacoste-tier piqué (heavy Pima cotton)

Not in Printful. Path:
- **Apliiq Premium Piqué Polo** — heavyweight Pima, ~$22 base; closest POD option
- **Peru-based private label** — only path for the actual feel

### Recommendation

Add **two new BV polo SKUs** alongside the existing K500:
1. "The Performance Polo" — Adidas A480 in black with BV embroidery — $78 retail
2. "The Pima Polo" — Apliiq premium piqué in Old Gold and stone — $88 retail
Keep K500 "The Polo" at $68 as the entry tier.

---

## Women's line — recommended v1 SKUs

User asked for sourcing for both men and women. Black Vault should expand to women's. Comparables: Vuori Women's, Free People Movement, Outdoor Voices, JW PEI, Reformation knits.

What makes women's premium essentials different:
- Cuts: cropped, fitted, relaxed — not just shrunken men's
- Heavier emphasis on fabric drape (rib knits, modal blends)
- Color extension beyond men's palette (cream, sand, rose tones still work for BV)

### First 3 SKUs (all in Printful catalog — zero new partner setup)

1. **The Cropped Tee** — Bella+Canvas 6400CVC women's relaxed (4.2oz; lighter, intentional) OR AS Colour 4072 women's heavyweight (6.5oz)
2. **The Relaxed Tee** — Comfort Colors 1717 in women's relaxed cut OR AS Colour 4002W boyfriend tee (8.0oz, on-brand heavy)
3. **The Pullover Hoodie** — Stanley/Stella SASA025 women's organic (10.3oz; matches men's BV hoodie weight)

### Phase 2 (add at month 2):

4. **The High-Waisted Sweatpants** — Bella+Canvas 7727 women's
5. **The Long Sleeve** — AS Colour 4055 women's heavyweight long sleeve

All five would carry the same BV monogram in Old Gold thread, embroidered chest. No "BVA Women's" submark — same monogram, same brand, just sized for the cut.

---

## Profitability quick-reference

### Per-unit math at $50–80 retail (BV typical)

| Retail | Printful COGS | + Embroidery | Total COGS | Gross margin | Net (after 3% fees) |
|---|---|---|---|---|---|
| $48 | $9 | $5 | $14 | $34 (71%) | $32.56 |
| $68 | $13 | $5 | $18 | $50 (74%) | $47.96 |
| $128 | $24 | $6 | $30 | $98 (77%) | $94.16 |
| $168 | $32 | $6 | $38 | $130 (77%) | $124.96 |

### Break-even at ad-spend tiers

- $50/week ads ÷ $35 net = **1–2 sales/week** to break even
- $200/week ads ÷ $35 net = **6–7 sales/week** to break even
- $500/week ads ÷ $35 net = **15 sales/week** (would require ~$1k weekly revenue)

### Realistic 90-day BV trajectory (from zero, organic + light paid)

| Month | Revenue range | Drivers |
|---|---|---|
| 1 | $0–300 | Organic only; capsule live; 0–5 sales |
| 2 | $300–1500 | $150–250/wk Meta ads on best tee; retargeting |
| 3 | $1500–5000 | Compounding: more SKUs, women's launch, ad creative library, email list |

Target metrics:
- **AOV**: $75–95 (multi-item carts; the capsule design helps this)
- **Cold traffic conversion**: 1.5–2.5%
- **Retargeting conversion**: 4–6%
- **CAC**: $25–45 acceptable at $75 AOV / 65%+ margin

---

## What needs the user (operator cannot do)

These are blockers the operator should `request_human_input` for, NOT try to bypass:

1. **ShineOn account creation** — free signup at shineon.com; once linked to BV Shopify, operator can pull their catalog
2. **Apliiq account** — free signup; needed for premium tee/polo upgrade path
3. **Physical samples for any private-label decision** — operator can identify the supplier, user has to order/feel/approve
4. **First batch payment for private label** — capital allocation decision
5. **Women's brand-mark decision** — same monogram or different submark (operator's recommendation: same monogram)
6. **Professional product photography** — for premium tier; current Printful mockups are good but not Aimé Leon Dore good

---

## When to use `run_pipeline` vs curated sourcing

`run_pipeline` costs ~$5 and 5–6 minutes. It's research-style — broad ideation across channels. **It will drift off-brand** for Black Vault unless aggressively constrained in the goal prompt.

**Use `run_pipeline` when:**
- The user explicitly asks for it
- You need broad market scan you can't get from CJ search

**Prefer curated sourcing when:**
- Working within an established brand voice
- You can use `search_cj_products` (LockLayer) directly
- You're expanding the existing BV capsule (use this knowledge file's recommendations)

If you do trigger `run_pipeline`, the goal prompt MUST include:
> "Brand: Black Vault Apparel — premium elevated-essentials competing with Psycho Bunny / Aimé Leon Dore / James Perse / Travis Mathew. REJECT any opportunity that is occupation-specific, quote-based, holiday-themed, or under $40 retail. Apparel only — no services, no digital products."

(Or for LockLayer:)
> "Brand: LockLayer Security — practical home/IoT security competing with Wyze and Eufy. Hardware products only — no apparel, no digital, no services."
