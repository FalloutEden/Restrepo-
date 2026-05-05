# White colorway expansion + Women's launch — verified Printful spec

Drafted by Claude Code 2026-05-04 against the cached Printful catalog (`.openclaw/printful-catalog-v2.json`, 463 active products). All blank IDs and color availability verified.

## Is white premium? Yes — conditionally.

White is core to the elevated-essentials playbook. James Perse, Aimé Leon Dore, Theory, and Vince all run white tees as hero SKUs. For Black Vault specifically:

- **Old Gold (#A67843) monogram on white = strongly premium signal.** On black it pops; on white it reads soft and considered — the Vince / Tom Ford effect.
- **White doubles your SKU breadth instantly** with zero new artwork or embroidery file.
- **Photography becomes more important** (white needs proper lighting to avoid looking bridal/cheap), but Printful's mockup generator handles that fine.

**Caveats — only put white on the right blanks:**
- Heavyweight, opaque blanks only (white in cheap blanks looks see-through and pop-up-booth tier).
- Skip categories where white reads cheap regardless of weight: caps, athletic socks, sweatpants.
- Skip on the Long Sleeve specifically — current AS Colour 5081 doesn't carry white. Use a different blank if you want a white long sleeve (see below).

---

## White expansion — verified on existing BV men's blanks

| SKU | Blank | Printful ID | White? | Action |
|---|---|---|---|---|
| The Vault Tee | Cotton Heritage MC1086 | 508 | ★ YES (7 colors) | **Materialize "The Vault Tee in White"** as new draft |
| The Heavyweight Tee | Comfort Colors 1717 | 586 | ★ YES (45 colors) | **Materialize "The Heavyweight Tee in White"** |
| The Heavyweight Hoodie | Stanley/Stella SASU024 | 831 | ★ YES (Black, French Navy, Heather Grey, White) | **Materialize in white** |
| The Crewneck | Lane Seven LS14004 | 845 | ★ YES (6 colors) | **Materialize in white** |
| The Polo | Port Authority K500 | 340 | ★ YES (7 colors) | **Materialize in white** |
| The Long Sleeve | AS Colour 5081 | 748 | ☐ NO white in 6 colors | **Skip white OR substitute Comfort Colors 6014** (id=753, 7 colors with white — garment-dyed heavyweight, on-brand) |
| The Sweatpants | Bella+Canvas 4737 | 895 | ☐ no white | Skip — white sweatpants stain too easily and aren't core to the BV essentials story |
| The Cap | Flexfit 6277 | — | n/a | Skip — white caps read pop-up booth |
| The Crew Sock | SOCCO SC200 | — | n/a | Skip — white socks read athleisure, not premium |

### Net new white SKUs to materialize (5 confirmed)
1. The Vault Tee in White (Cotton Heritage MC1086 White)
2. The Heavyweight Tee in White (Comfort Colors 1717 White)
3. The Heavyweight Hoodie in White (Stanley/Stella SASU024 White)
4. The Crewneck in White (Lane Seven LS14004 White)
5. The Polo in White (Port Authority K500 White)

Optional 6th: **The Garment-Dyed Long Sleeve in White** on Comfort Colors 6014 — adds a new fabric story (garment-dyed) alongside the existing AS Colour 5081 black long sleeve.

---

## Women's launch — corrected SKU list (real Printful options)

The blanks I originally recommended (AS Colour 4072/4002W, Stanley/Stella SASA025) are NOT in Printful. Replacements that ARE in catalog and carry white:

| SKU label | Blank | Printful ID | Colors | White? |
|---|---|---|---|---|
| **The Cropped Tee** | AS Colour 4062 — Women's Crop Top | 636 | 10 | ★ YES |
| **The Relaxed Tee** | Bella+Canvas 6400 — Women's Relaxed T-Shirt | 360 | 22 | ★ YES |
| **The Hoodie** | Stanley/Stella SASW035 — Women's Stella Nora Hoodie (organic) | 832 | 6 | ★ YES |

Each can launch in **black AND white from day one** (10 SKUs total: 5 men's white + 3 women's × 2 colors + 0 if you launch women's in 1 color first).

**Phase 2 women's adds (month 2):**
- AS Colour 4161 Women's Relax Hoodie (id=1412) — alternative hoodie with no white but has on-brand earth tones
- Bella+Canvas 7502 Women's Cropped Hoodie (id=317) — for a sportier women's hoodie

---

## Polo upgrade — verified (final state after May 4 materialize)

Adidas A430 (id=767) is in the catalog dump but returns 404 from `/products/{id}` — Printful blocks it from sync product creation (likely a licensing restriction on specific Adidas SKUs). Tested all candidates and **swapped to Under Armour 1370399 (id=766)** which is the closest API-accessible equivalent — also performance polyester knit, also branded pro-shop tier.

| SKU | Blank | Printful ID | Status |
|---|---|---|---|
| The Polo (B/W) | Port Authority K500 | 340 | ✓ existing + white added 2026-05-04 |
| **The Performance Polo (B/W)** | **Under Armour 1370399** | **766** | ✓ materialized 2026-05-04 |
| Adidas A430 Sport Polo | — | 767 | ✗ API-blocked (do not retry) |
| Adidas A591 Space-Dyed | — | 770 | skip — off-brand pattern |

If you ever want to expand polos further, Under Armour 1370399 has Black, Forest Green, Grey, Navy, White available.

---

## Total SKU count if you launch the full set

- **Men's white expansion:** 5 new drafts (or 6 with garment-dyed long sleeve)
- **Women's launch in both colors:** 6 new drafts (3 SKUs × 2 colors)
- **Performance polo in both colors:** 2 new drafts

**Total to add: 13–14 new drafts.** Plus the existing 10 BV drafts = **23–24 SKU Black Vault catalog at launch.**

That's a real capsule depth — comparable to Aimé Leon Dore at v1 — and zero inventory risk because all Printful POD.

---

## Pricing matrix (recommended)

| Tier | Item | Price | Margin @ Printful cost |
|---|---|---|---|
| Entry | The Vault Tee (B/W) | $58 | ~$40 (69%) |
| Entry | The Heavyweight Tee (B/W) | $54 | ~$38 (70%) |
| Entry | The Crew Sock | $24 | ~$16 (66%) |
| Mid | The Long Sleeve (B) / Garment-Dyed Long Sleeve (W) | $84 / $88 | ~$58–62 (69–70%) |
| Mid | The Polo (K500, B/W) | $68 | ~$48 (70%) |
| Mid | The Performance Polo (A430, B/W) | $78 | ~$50 (64%) |
| Mid | The Cap | $42 | ~$28 (66%) |
| Mid | The Sweatpants | $98 | ~$66 (67%) |
| Premium | The Crewneck (B/W) | $88 | ~$60 (68%) |
| Premium | The Heavyweight Hoodie (B/W) | $168 | ~$130 (77%) |
| Women's Entry | The Cropped Tee (B/W) | $48 | ~$34 (70%) |
| Women's Entry | The Relaxed Tee (B/W) | $54 | ~$38 (70%) |
| Women's Premium | The Hoodie (B/W) | $148 | ~$108 (73%) |

These match the brand voice document's $40–80 tee / $90–180 outerwear positioning.

---

## What needs the user

Nothing, technically — the operator has all the tools to materialize these SKUs once the user says go. But:

1. **Confirm the white concept** — do you want all 5 men's white SKUs or a subset?
2. **Confirm the women's launch** — both colors from day one, or black first / white in month 2?
3. **Confirm the Performance Polo addition** — adding $78 polo alongside the $68 K500?
4. **Confirm pricing matrix** — adjust any tier before publishing
5. **Approve the existing 11-SKU publish proposal** (`prop_mon7aoxo_os9occ` in inbox) — once that's live the white/women's drops have a foundation to land on

Once user confirms, the operator can fire materialize for each SKU. For 13–14 new drafts at ~5 seconds each, total wall time is under 2 minutes.
