# TikTok Ads Manager — launch-week setup

TikTok is **the top-of-funnel awareness engine** for premium menswear right now (2026). Buying behavior on TikTok looks more like Pinterest than like Meta — people save to their wishlist, then buy off-platform days later. Don't optimize for last-click ROAS; optimize for branded-search lift in Google + direct traffic to blackvaultapparel.com.

## Account setup

- [ ] TikTok Business Account claimed (separate from any personal account)
- [ ] TikTok Pixel installed on Shopify (Shopify → Apps → TikTok Sales Channel → connect)
- [ ] Events API token configured (server-side event mirror — TikTok needs this for any chance at signal post-iOS-14)
- [ ] Spark Ads permissions enabled on the @blackvaultapparel handle so we can boost organic posts

## Campaign structure

**One campaign, two ad groups, six creatives.**

### Ad Group 1 — Spark Ads (boosting organic)

Pick 3 of BV's best organic posts (whichever Content Studio drops perform best in the first week of organic) and boost them as Spark Ads. Spark Ads carry the @blackvaultapparel handle and let viewers follow you — they outperform standard ads 2–4× for premium fashion in 2026.

Daily budget: **$15/day per ad** = $45/day for the ad group.

Targeting:
- Location: US
- Age: 18–44
- Interests: Streetwear, Fashion, Designer apparel, Hypebeast, Menswear
- Custom audiences: layer in "engaged with BV TikTok in last 30d" once the pixel has data

### Ad Group 2 — Original Creative (no Spark)

3 short-form videos, 9–15 seconds each. All three follow this skeleton:

| Frame | Time | Content |
|---|---|---|
| Hook | 0–2s | Tight macro shot — embroidered BV monogram on Old Gold thread, dramatic light |
| Beat 1 | 2–6s | Cut to model wearing the piece, walking past dark concrete |
| Beat 2 | 6–10s | Tag with white text: "10.3oz organic cotton" / "Embroidered, not printed" / "Built to be Kept." |
| CTA | 10–13s | Static product shot, price overlay, "Shop blackvaultapparel.com" |

**Voiceover:** none. Use ambient/cinematic sound (TikTok library: search "luxury fashion ambient"). On-screen captions only.

**Music:** Trending lo-fi instrumental in the apparel/menswear vertical. Pull from TikTok Commercial Music Library — must be CML-licensed for paid ads.

Daily budget: **$15/day per ad** = $45/day. Total ad-group spend: $90/day.

## Hooks to A/B (one per video)

1. **The macro hook:** "This is 10.3oz organic cotton." (extreme close-up, slow zoom out to full hoodie)
2. **The contrast hook:** "Most hoodies pill in 6 months. This one ages." (split-screen — pilled fast-fashion vs. broken-in BV)
3. **The price-justified hook:** "$168 hoodies that don't apologize for it." (text card, then cuts to construction details)

## Hard rules

- **No clickbait.** TikTok's algo punishes accounts that bait clicks with frame 0 then under-deliver. The hook has to BE the product.
- **No discount language in the first month.** Premium positioning collapses if your launch ad mentions 10% off.
- **No talking-head founder intros.** BV's brand voice is restrained editorial, not personal storytelling. Reserve founder content for organic IG.
- **Vertical only (9:16).** Square crops kill watch time on TikTok.

## Budget pacing

| Day | Spend | Action |
|---|---|---|
| 1–7 | $90/day | Don't optimize. Watch. |
| 8 | — | Pull report. Kill any creative with VTR (video-through-rate) < 4%. |
| 8–14 | $135/day | Replace killed creatives with new variants. |
| 15+ | scale | Move winners to CBO at 2× spend. |

**Hard stop:** if total spend hits $1000 with zero traffic uplift to blackvaultapparel.com, pause and audit. Likely root cause: pixel not firing, or the landing page is failing on mobile.
