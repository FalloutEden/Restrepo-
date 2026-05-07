# Meta (Facebook + Instagram) — launch-week ad set

Goal of this campaign: cold-traffic awareness → product-page click → first purchase. Optimize for Purchase events once Pixel has fired ~25 conversions; until then optimize for Add-to-Cart or Landing-Page-View.

## Account setup checklist (before pushing creative)

- [ ] Meta Business Manager: BV business created, ad account claimed
- [ ] Meta Pixel + Conversions API installed on Shopify (Shopify → Settings → Apps → Meta Sales Channel → Connect → enable both)
- [ ] iOS 14+ aggregated event measurement: 8 events configured, top 3 = `Purchase`, `AddToCart`, `ViewContent`
- [ ] Domain verified: `blackvaultapparel.com` (DNS TXT record from Meta)
- [ ] Daily budget cap set at ad-account level so a runaway test can't drain the card

## Audiences (3 ad sets, identical creative — Meta picks the winner)

**Ad Set 1 — Broad Cold (US)**
- Location: United States
- Age: 25–55, men 70% / women 30% split (BV is unisex but skews menswear visually)
- Detailed targeting: NONE (broad performs better post-iOS 14 than narrow lookalikes for new accounts)
- Placements: Advantage+ placements (let Meta optimize)
- Daily budget: **$25/day per ad set**, 7-day test window before scaling

**Ad Set 2 — Lookalike (LAL 1%) on email list**
- Source: Klaviyo "All subscribers" custom audience (export → Meta → 1% LAL US)
- Skip until ~500 emails in list

**Ad Set 3 — Engagement Retargeting**
- Source: Anyone who engaged with BV's IG/FB page in last 90 days
- Useful even at low volume — converts warm fans cheaply

## Creative pack

### Format A — single image, 1:1 (1080x1080)

**Visual:** Hero product on BV mock background (use `composite_on_bv_background` operator tool with mode=ai). The Hoodie or The Vault Tee centered slightly right, BV monogram visible top-left.

**Primary text (above image):**
```
Heavyweight 10.3oz organic cotton. Old Gold monogram embroidered, not printed.
Cut for the next ten years, not the next photo.
```

**Headline (below image):**
```
The Heavyweight Hoodie — $168
```

**Description:** `Built to be Kept.`

**CTA:** `Shop Now` → product page

### Format B — single image, 9:16 (1080x1920) for Reels/Stories

**Visual:** Vertical lifestyle shot, model wearing The Hoodie or The Crewneck on BV background. Bottom 30% reserved for text overlay.

**Primary text:** *(none — the visual carries it; Stories format)*

**Text overlay (centered, lower third):**
```
Heavyweight, embroidered, made to outlast trends.
```

**CTA sticker:** `Shop the Drop`

### Format C — carousel (5 cards, 1:1 each)

Card 1: The Hoodie — "10.3oz organic cotton, hand-embroidered Old Gold monogram"
Card 2: The Crewneck — "Loopwheel-knit, garment-dyed, no logo on the chest"
Card 3: The Vault Tee — "Heavyweight Comfort Colors 1717, washed not printed"
Card 4: The Long Sleeve — "AS Colour 5081, 220gsm combed cotton"
Card 5: The Snapback — "Yupoong 6089M, Old Gold thread, structured 6-panel"

Each card links to its product page.

**Headline pattern:** `<Product> — $<price>`
**Description pattern:** Brand voice line specific to that piece.
**Primary text (above carousel):**
```
Six pieces. No collection-wide gimmicks. Each one made to last.
Built to be Kept. — Black Vault Apparel.
```

## Copy variants for split-test (rotate primary text)

1. *Construction-led:* "10.3oz organic cotton. Embroidered, not screen-printed. The kind of weight that ages instead of pilling."
2. *Anti-fast-fashion:* "Most apparel is built to be replaced. Ours is built to be kept."
3. *Specificity-led:* "GSM listed. Mill listed. Thread color listed. We build it like you'll inspect it — because we want you to."
4. *Editorial:* "Saint Laurent silhouettes, Tom Ford restraint, $168 because it's built to last $168."

Run all 4 against Format A for the first $200 spend, then kill the bottom 2.

## Budget pacing

| Day | Daily spend | Action |
|---|---|---|
| 1–3 | $75/day total ($25 × 3 ad sets) | Let Meta learn. Don't touch. |
| 4–7 | $75/day | If any ad set has CPA < $40, scale it to $50/day. |
| 8–14 | scaled | Kill anything with CPA > $80 after $100 spent. Add winners to a CBO. |

**Hard stop:** if total spend hits $500 with zero purchases, pause everything and audit Pixel + product page.

## Compliance notes

- No medical/health claims. No "guaranteed" language.
- BV monogram + "BLACK VAULT APPAREL" wordmark is registered as the brand mark — don't run ads with the words removed (Meta sometimes auto-crops; pick crops that preserve the upper-left corner).
- US-only until shipping zones outside US are configured in Shopify.
