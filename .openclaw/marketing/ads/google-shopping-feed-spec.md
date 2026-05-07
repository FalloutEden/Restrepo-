# Google Shopping — feed + Performance Max setup

Google Shopping is the **lowest-CAC channel for established premium apparel** because the buyer is already searching. Pre-launch, the priority is getting the product feed clean — bad data = ads disapproved, no spend, no signal.

## Step 1: Connect the feed (do this first, no spend yet)

- [ ] Google Merchant Center account opened, verified, claimed `blackvaultapparel.com`
- [ ] Shopify → Sales Channels → Google & YouTube → Connect → enable Free Listings AND Shopping Ads
- [ ] Wait 3–5 business days for Google to review the feed. Listings start appearing under Shopping Free Listings in that window — that's free organic traffic and a signal that the feed is clean.

## Step 2: Audit the feed for compliance (Google rejects 30% of new apparel feeds)

For every BV product the feed must include:

| Attribute | Requirement | BV value pattern |
|---|---|---|
| `title` | 70 char max, brand + product type + key descriptor | "Black Vault Apparel — The Hoodie, Heavyweight 10.3oz Organic Cotton, Black" |
| `description` | 150–500 chars ideal, no ALL CAPS | One paragraph from the Shopify body_html, plain text |
| `gtin` | Required for branded apparel where supplier provides one | leave empty if Printful doesn't provide; Google flags as warning, not error |
| `mpn` | Manufacturer part number | Cotton Heritage MC1086, Stanley/Stella SASU024, etc. |
| `brand` | Must say "Black Vault Apparel" | "Black Vault Apparel" |
| `gender` | unisex / male / female | "unisex" for the launch line |
| `age_group` | adult / kids / etc | "adult" |
| `size` | exact size value | "S" "M" "L" "XL" "2XL" — separate variant per size |
| `color` | one color per variant | "Black" "Storm Blue" etc. |
| `material` | comma-separated fibers | "100% organic cotton" or "85% cotton, 15% polyester" |
| `image_link` | 1:1 or 4:5, ≥800px wide, white or neutral background | use the BV-mock-BG composited shots |
| `additional_image_link` | up to 10 alt angles | back, sleeve, embroidery detail |
| `availability` | in stock / out of stock | Shopify auto-fills |
| `price` | with currency | "168.00 USD" |
| `condition` | new / used / refurbished | "new" |

**Common rejection causes for BV-style brands:**
- "Black on black" hero shots get rejected as `image quality issues`. Use the lighter editorial shots (mockup-final.jpg style) for the primary feed image.
- "Unisex" sometimes triggers a manual review — that's normal, approve in 24h.

## Step 3: Performance Max campaign (after feed is clean)

Performance Max is Google's everything-everywhere campaign type. For new accounts with limited data, **start with shopping-only** (legacy "Standard Shopping" campaign), and only graduate to PMax after you have 30+ purchases tracked.

### Standard Shopping campaign (week 1–2)

- Daily budget: **$30/day** (this is the floor that gives Google enough auctions to learn — anything less and the algorithm starves)
- Geographic targeting: US only (until international shipping is configured)
- Bidding: Maximize Clicks (NOT conversions — you don't have conversion history yet)
- Inventory filter: include all 20 active products
- Negative keywords (add to campaign):
  - `cheap`, `discount`, `wholesale`, `replica`, `dupe` — all incompatible with premium pricing

### Performance Max (week 3+)

Switch only once Standard Shopping has driven ≥30 purchases AND the cost-per-purchase is ≤$60. Then:

- Daily budget: $50/day
- Bidding: Maximize Conversion Value, target ROAS 2.5
- Audience signals: upload Klaviyo email list as customer match seed
- Asset groups: one per product category (Tops, Hoodies, Headwear, AOP)
- Final URL expansion: ON

## Hard stops

- If Standard Shopping spends $300 with zero purchases, pause. Likely root cause: feed image quality, product page UX, or pricing-vs-perceived-value mismatch.
- Never run "phrase match" search keywords for "Black Vault" — that's brand-defense bidding territory, only justified once a competitor starts bidding on it. Until then, save the budget.

## Trademark / brand-defense

- Submit BV monogram + "Black Vault Apparel" wordmark to Google Trademark Complaint form once the brand has a registered TM in USPTO. Pre-TM, you can still file a Google Brand Registration which prevents knockoffs from using "Black Vault Apparel" in their ad text.
