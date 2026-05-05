# BV expansion materialization — status 2026-05-04

## Result: 13/13 SKUs created and mockup-attached

Existing 10 BV drafts + 13 new = **23 total BV drafts ready to publish.**

### Men's white expansion (5)

| SKU | Blank | Shopify product | Printful sync |
|---|---|---|---|
| The Monogram Tee in White | Cotton Heritage MC1086 | 7625750937698 | 430993382 |
| The Vault Tee in White | Comfort Colors 1717 | 7625751003234 | 430993441 |
| The Heavyweight Hoodie in White | Stanley/Stella SASU024 | 7625751036002 | 430993482 |
| The Crewneck in White | Lane Seven LS14004 | 7625751101538 | 430993545 |
| The Polo in White | Port Authority K500 | 7625751167074 | 430993608 |

### Women's launch — 3 SKUs × 2 colors

| SKU | Blank | Shopify product | Printful sync |
|---|---|---|---|
| The Cropped Tee | AS Colour 4062 (Black) | 7625751298146 | 430993685 |
| The Cropped Tee in White | AS Colour 4062 (White) | 7625751756898 | 430993754 |
| The Relaxed Tee | Bella+Canvas 6400 (Black) | 7625751822434 | 430993822 |
| The Relaxed Tee in White | Bella+Canvas 6400 (White) | 7625751920738 | 430993894 |
| The Hoodie | Stanley/Stella SASW035 (Black) | 7625751986274 | 430993975 |
| The Hoodie in White | Stanley/Stella SASW035 (White) | 7625752019042 | 430994024 |

### Performance polos — both colors

| SKU | Blank | Shopify product | Printful sync |
|---|---|---|---|
| The Performance Polo | Under Armour 1370399 (Black) | 7625752215650 | 430994266 |
| The Performance Polo in White | Under Armour 1370399 (White) | 7625752313954 | 430994316 |

## What's pinned in for the brand

- **Old Gold (#A67843)** monogram embroidered chest across all 13 new SKUs (same thread as existing 10 — full brand consistency)
- Same BV monogram PNG (`.openclaw/brand/BV Monogram.png`) reused — no design drift
- All women's SKUs carry the same monogram (no separate "BVA" women's mark) per the brand-fit decision

## One issue I worked around

**Adidas A430** (the "Sport Polo" I originally recommended) is in Printful's catalog dump but `/products/767` returns 404 from the API — Printful has it locked from sync-product creation. Probably a licensing restriction on specific Adidas SKUs. **Swapped to Under Armour 1370399** which is the same tier (performance polyester knit, embroidery-friendly, pro-shop tier, available in Black/Forest Green/Grey/Navy/White). Updated the knowledge file so future materializations don't try Adidas A430 again.

## Files written

- `scripts/blackvault-expansion-2026-05-04.ts` — main run (11/13)
- `scripts/blackvault-retry-polo-2026-05-04.ts` — polo retry with UA blank (2/2)
- `scripts/blackvault-attach-expansion-mockups.ts` — polled and attached mockups (13/13)
- `.openclaw/brand/expansion-2026-05-04-results.json` — results from main run
- `.openclaw/brand/expansion-2026-05-04-polo-retry-results.json` — polo retry results

## What's next when policies are done

1. **Publish all 23 BV drafts** — once policies push and the storefront is legally ready, publish the whole capsule. The pending proposal `prop_mon7aoxo_os9occ` covers 11 of them; needs to be expanded or replaced with a new "publish 23" proposal.
2. **Photography upgrade** (later) — Printful mockups are decent for v1 but if revenue justifies, real product photography on a model gives the listings 2-3× the conversion lift.
3. **ShineOn watch SKUs** — still pending user creating ShineOn account.
4. **Pricing review** — every SKU launched at the prices in the spec; adjust before publishing if needed.
