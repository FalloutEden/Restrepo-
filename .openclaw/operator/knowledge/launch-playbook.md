# Black Vault — Launch-Day Playbook (added 2026-05-06)

This file gives the operator everything it needs to support BV's full retail launch. Marketing assets are pre-staged in `.openclaw/marketing/` and a new `composite_on_bv_background` operator tool puts model photos onto the official BV mock background.

---

## The brand-mock background — when to use it

Path: `.openclaw/brand/Mock Up BG/BG BV Mock.png`

This is the **canonical Black Vault editorial background** — a deep matte-black gradient with the BV monogram and "BLACK VAULT APPAREL" wordmark in the upper-left. Use it any time you need a model or product photo on a branded backdrop:

- Email hero images (welcome series, launch announcement)
- Meta and TikTok ad creative (square + vertical)
- Pinterest editorial Pins
- Lifestyle hero on the BV homepage
- Any social post where the photo isn't shot in a real BV-branded studio

**Tools:**

| Tool | When |
|---|---|
| `composite_on_bv_background` | Single photo on disk → composited PNG. Pass `inputPath`, get an output file. |
| `composite_all_brand_images` | Bulk: re-skin every active BV product's primary image onto the BV mock BG. Idempotent (skips products tagged `bv-bg-composited`). Default keeps original as backup at position 2. |
| `summarize_drafts` | Categorize all drafts via brand-fit filter into delete/decide/publish buckets. Read-only — surfaces hygiene work before launch. |
| `launch_status` | Read-only readiness check across Shopify/env/Vercel. |

```
{
  "inputPath": "/path/to/model-photo.jpg",
  "mode": "ai" | "cutout" | "sharp",
  "outputPath": ".openclaw/brand/composited/<basename>-on-bg.png" (defaulted)
}
```

### Picking the mode

| Mode | When | Cost | Look |
|---|---|---|---|
| **`editorial` (RECOMMENDED)** | Default for product page imagery. AI re-renders the subject as a premium editorial shot **on transparent BG**, then sharp-composites onto the real BV mock BG. Wordmark in upper-left stays pixel-perfect (NEVER hallucinated). Auto-derives gender + garment hint from product title. | ~$0.04 per image | Editorial-grade model + apparel, real BV wordmark, gender-correct silhouette. |
| `ai` | Legacy. AI generates the entire scene including the BG — risks hallucinating the upper-left wordmark ("BLACA VAULT", "BLACK VAULT POSED", etc.) and getting the gender wrong on women's products. | ~$0.04 | High variance. Use only for one-off creative experiments. |
| `cutout` | When you want the original Printful mockup preserved pixel-identical (no editorial re-render) on the BV BG. | ~$0.04 | Predictable; subject unchanged; less editorial. |
| `sharp` | When the source is already on a near-white seamless studio background. | $0 | Cheapest; only works when the input has clean white BG. |

### Gender + garment hints (auto-derived from product title)

The bulk compositor parses the title to set the right hint:

| Title contains | Gender | Garment hint |
|---|---|---|
| `women`, `cropped` | female | preserves cropped silhouette explicitly so it doesn't extend to a full-length tee |
| `men`, default | male | none |
| `aop` | as-shown | preserves whatever the source shows |
| `hat`, `cap`, `beanie`, `snapback` | none | renders product-only on a clean dark surface |
| `sock` | none | product-only |

**Critical rules baked into the editorial prompt**:
- The chest mark MUST read as "BV" (the letters B and V interlocked) — never "PV", "BR", or any variant.
- DO NOT render any text/wordmark/logo in the background.
- Preserve garment silhouette exactly — DO NOT crop a full-length tee or extend a cropped tee.
- Output transparent BG (no backdrop fill, no shadow on floor).

### Sub-options for cutout / sharp

- `subjectHeightFrac` — how tall the subject is in the canvas (0–1). Default 0.85.
- `subjectCenterXFrac` — horizontal center (0=left, 1=right). Default 0.55 — slightly right so the BV monogram in the upper-left stays visible.
- `subjectBottomYFrac` — where the bottom of the subject sits (0=top, 1=bottom). Default 0.98.
- `dropShadow` — boolean; adds a soft shadow under the subject so they don't look pasted on. Default false.

### Workflow when the merchant uploads a new model photo

1. Merchant drops the photo somewhere (e.g., `C:\Users\karli\Desktop\bv-model-1.jpg`).
2. Call `composite_on_bv_background` with `inputPath` set to that file and `mode: "ai"`.
3. The tool writes the composited PNG to `.openclaw/brand/composited/` by default.
4. Tell the merchant the output path so they can review or use the result.
5. If they want it on Shopify Files for use in emails/ads, follow up with the Shopify Files upload (admin Files → upload).

If the AI result rerenders the model unfavorably, retry with `mode: "cutout"` for a deterministic composite.

---

## Marketing assets — what's pre-staged

Everything below is **drafted, not deployed**. Point the merchant at these files when they ask "are we ready to run ads / send emails / launch?"

### Ad creative (`.openclaw/marketing/ads/`)

- `meta-launch.md` — Meta (FB/IG) campaign structure, three audiences, three creative formats, copy variants
- `tiktok-launch.md` — TikTok Spark Ads + original creative, 3 hook patterns, budget pacing
- `google-shopping-feed-spec.md` — feed compliance audit + Standard Shopping → PMax progression
- `pinterest-launch.md` — organic-first + paid-promote-the-winners playbook

### Email campaigns (`.openclaw/marketing/emails/`)

- `welcome-1.md` / `welcome-2.md` / `welcome-3.md` — 3-email welcome series (immediate / 48h / 5 days)
- `abandoned-cart-1.md` / `abandoned-cart-2.md` — 1h + 24h cart recovery
- `browse-abandonment.md` — 4h post-view (Klaviyo only — needs onsite tracking)
- `post-purchase-thanks.md` — order-confirmation override in BV voice
- `launch-announcement.md` — one-off broadcast for launch day
- `re-engagement.md` — 60-day-no-open re-permission

Each email has 3 subject-line variants for split-test, preview text, full HTML body, and notes.

### Hard rules across all marketing

- **No emoji.** Premium brands don't use them.
- **No "buy now! limited time!" urgency.** Premium = restraint.
- **Discount codes are forbidden in welcome 1–3 + browse abandonment + abandoned cart 1.** Only acceptable in `abandoned-cart-2` (max 10%, single-use) and `launch-announcement` (free shipping, never %-off apparel).
- **GSM and construction details lead the copy.** Brand voice is anchored in specificity.

---

## Launch-day order of operations (what the merchant should do)

When the merchant asks "what do I do to launch?" walk them through this sequence:

### T-7 days
1. Set `OPERATOR_AUTH_SECRET` in Vercel project env. (Generate with `openssl rand -hex 32`.) The middleware now fail-closes the operator API on Vercel without it — leaving it unset keeps everyone, including attackers, locked out, but also keeps the deployed UI from working if they want to use it remotely.
2. Update the Vercel env `SHOPIFY_BLACKVAULT_API_KEY` to the new 108-scope token (the value is in your local `.env.local` — copy it from there, do NOT paste tokens into committed files).
3. Redeploy to Vercel (push to main, auto-deploy).
4. Verify `restrepo.vercel.app/api/webhooks/shopify/order-paid` still answers (a malformed POST should return 401 invalid hmac — that's healthy).

### T-3 days
5. Connect Klaviyo (or Shopify Email) to BV Shopify. Verify SPF + DKIM + DMARC for `blackvaultapparel.com`.
6. Paste the 7 email flows from `.openclaw/marketing/emails/` into Klaviyo / Shopify Email.
7. Verify Meta Pixel + TikTok Pixel + Google Tag are firing on Shopify (use the browser dev tools or Pixel Helper extension).
8. Submit Google Merchant Center feed for review.

### T-1 day
9. Place a $0.01 verify order via Shopify Bogus Gateway → confirm webhook fires → confirm Printful draft created → manually delete + refund.
10. Switch payment processor from Bogus to Shopify Payments / Stripe.

### Launch day (1800 MST)
11. Status flip every product to active + Online Store published (use `attach_all_to_online_store`).
12. Send `launch-announcement.md` via Klaviyo to the entire engaged-60d list.
13. Push first wave of paid ads — Meta $75/day, TikTok $90/day, Google $30/day, Pinterest organic-only for week 1.
14. Watch the first 30 minutes for any error in Vercel function logs (https://vercel.com/falloutedens-projects/restrepo/logs).

### Post-launch (first 72h)
15. Don't touch the ads. Let Meta/TikTok learning phases run. Auditing too early is the #1 launch mistake.
16. Reply to every customer email within 12h. Premium brands reply fast or not at all — slow replies hurt more than no replies.
17. Confirm each Printful order manually for the first 5–10. Do not flip `PRINTFUL_AUTO_CONFIRM=true` in Vercel until trust is built.

---

## Common merchant questions during launch — operator stock answers

**"Should we discount for launch?"**
> Soft no. Free shipping over $100 reads as policy; %-off apparel reads as desperation and collapses premium positioning. Hold the price line for 30 days minimum. If sales lag, we test free shipping, not discounts.

**"How long before we know if ads work?"**
> 7 days for Meta to exit learning phase, 14 days for TikTok signal to be readable, 30 days for Pinterest to compound. Don't kill anything before its window — that's the most expensive ad mistake.

**"Why isn't [feature] on Vercel?"**
> Operator chat, content studio, and the autonomous pipeline run from local because Vercel's read-only filesystem and 10s function timeout can't host them. The webhook handler is the only thing on Vercel by design.

**"What's a healthy CAC for BV?"**
> $25–45 at $75 AOV with 70%+ margin. Above $45 and we're break-even at best — recheck targeting or creative. Below $25 and we should scale aggressively.

**"Do we have product photography?"**
> Currently using Printful's mockup-generator output + AI composites onto the BV mock background. Functional but not Aimé Leon Dore-tier. Real photo shoot is a quarter-2 priority — for launch, the AI composites + Printful mockups are sufficient if used consistently.
