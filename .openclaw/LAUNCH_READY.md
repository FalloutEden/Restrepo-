# BV Launch Readiness — 2026-05-06 → 2026-05-07

State of play for the **2026-05-07 18:00 MST launch**. Most of the prep is now executed against the live store — see "Live state" section at the bottom.

## Storefront is LIVE

Password gate is down (verified). Customers can shop.

## ⚠ DEPLOY NEEDED — uncommitted changes block several features

A lot of work is in your local repo but not yet on Vercel. The Shopify storefront and webhook integration won't pick up these features until you push to main (auto-deploys on Vercel):

- `app/api/webhooks/shopify/products-update/route.ts` — **CRITICAL**: products/update webhook is registered with both stores, but Shopify will get 404 until this route is deployed. Without it, draft → active flips won't auto-publish to Online Store.
- `middleware.ts` — operator API fail-closed (you already set OPERATOR_AUTH_SECRET, but middleware code is local)
- `app/api/launch-status/route.ts` + `app/launch/page.tsx` — readiness probe surfaces
- `lib/launch-status.ts`, `lib/bg-composite.ts`, `lib/bulk-store-ops.ts` — server libs powering the operator tools
- 6 new operator tools: `composite_on_bv_background`, `composite_all_brand_images`, `summarize_drafts`, `launch_status` etc.

**To deploy:**

```powershell
git add -A
git commit -m "BV launch prep: storefront polish, BG compositor, launch-status, webhooks"
git push origin main
```

Vercel auto-deploys in ~90 seconds. Verify with:

```
curl -i https://restrepo.vercel.app/api/webhooks/shopify/products-update -X POST
# expected: 401 invalid hmac (means route is live and HMAC check ran)
```

If you'd rather review the diff first, run `git diff` before committing.

## Open question: AI-generated product models — merchant to review

The 29 BV products have AI-generated editorial model imagery composited onto the BV mock BG. Quality is mixed:

- ~80% look great (clean BV monogram, good gender match, proper silhouette)
- ~20% have hallucination artifacts: "PV"/"RV" instead of "BV" on the chest mark (mainly white-fabric products), garbled wordmark in the upper-left ("BLACA VAULT", "BLACK VHULT MOGRAW"), AOP products lost their pattern (rendered as plain cream tees with single chest mark instead of repeating BV pattern).

**Merchant is reviewing each product image manually.** I've stopped autonomous re-generation per request. When the merchant returns:

- For products that look right → keep as-is
- For products that need re-render → use the operator tool `composite_on_bv_background` with `mode: "editorial"` per product, or run `scripts/bv-bg-bulk-composite.ts --product <id> --mode editorial --force`
- For AOP products specifically → use `mode: "cutout"` (preserves Printful's all-over pattern; editorial mode loses it)
- For broken white-tee chest marks → use `mode: "sharp"` (pure-sharp cutout preserves source pixel-faithful — BUT requires the source to be on white seamless, which Printful mockups are)

**The wordmark hallucination problem is solved going forward**: the compositor now uses a wordmark-free BG (`BG BV Mock Clean.png` — pure dark gradient). Any future re-renders will have clean BGs. Existing composites still have whatever wordmark state they were rendered with.

## Brand assets uploaded to Shopify Files

`.openclaw/brand/asset-cdn-urls.json` — 8 brand assets now have CDN URLs ready for email templates. Substitute `{{BV_LOGO_URL}}`, `{{HERO_IMAGE_URL}}`, etc. in the marketing email files with real Shopify CDN URLs from the manifest.

## What was built tonight

### 1. Brand-mock background compositor

`.openclaw/brand/Mock Up BG/BG BV Mock.png` is now the canonical BV editorial backdrop. New tooling places any model/product photo onto it.

| Surface | Where |
|---|---|
| Library | [lib/bg-composite.ts](lib/bg-composite.ts) — `aiBackgroundReplace`, `cutoutComposite`, `sharpFlatWhiteCutout` |
| CLI | [scripts/bv-bg-composite.ts](scripts/bv-bg-composite.ts) — `node --env-file=.env.local --import tsx scripts/bv-bg-composite.ts --in <photo> --out <output> --mode ai\|cutout\|sharp` |
| Operator tool | `composite_on_bv_background` registered in [lib/operator-tools.ts](lib/operator-tools.ts) — agent can run it from chat |
| Knowledge | [.openclaw/operator/knowledge/launch-playbook.md](.openclaw/operator/knowledge/launch-playbook.md) — agent reads which mode to pick on every turn |

Three modes, picked by use-case: **ai** (gpt-image-1 edit, lighting matched, ~$0.04), **cutout** (deterministic gpt-image-1 BG removal + sharp composite), **sharp** (free, only works on near-white seamless input).

### 2. Security hardening

- [middleware.ts](middleware.ts) updated to **fail closed on Vercel** when `OPERATOR_AUTH_SECRET` is unset. Webhooks still reach Shopify (HMAC-protected); operator/content-studio/pipeline routes return 503 instead of being wide open.
- Generated a fresh secret to install: **`0bb85c0a53d3cb70a68db777b540acbf96e571afa3970a079362033973464594`** — set in Vercel project env as `OPERATOR_AUTH_SECRET`, then redeploy. Without this, the operator API is locked. With it, the local UI continues to work via the bearer header.
- Repo audit clean: no leaked tokens in committed files, .env / .env.local properly gitignored, no real secrets in git history.
- Webhook HMAC verification confirmed timing-safe ([lib/printful-orders.ts:81](lib/printful-orders.ts#L81)).

### 3. Ad creative — staged, not deployed

Pre-written and ready at `.openclaw/marketing/ads/`:

- **meta-launch.md** — 3 ad sets, 3 creative formats (1:1 image, 9:16 reels, 5-card carousel), 4 copy split-test variants. $75/day total budget for week 1.
- **tiktok-launch.md** — Spark Ads + 3 original creatives, 9–15s vertical, 3 hook patterns. $90/day.
- **google-shopping-feed-spec.md** — feed compliance audit + Standard Shopping → PMax progression. $30/day starting.
- **pinterest-launch.md** — organic-first (5 boards seeded), promote-the-winners after 14 days. $0 paid until data warrants.

Total launch-week paid spend cap: **~$1,400/week** if all 4 channels run at recommended floor. Hard stops documented per channel.

### 4a. Organic post copy — staged, not deployed

[.openclaw/marketing/organic/](.openclaw/marketing/organic/) — pre-written captions in BV voice, no API cost to use:

- `instagram-feed.md` — 7 captions for the IG main feed (square/portrait)
- `instagram-reels.md` — 5 captions for vertical short-form
- `tiktok.md` — 5 captions, native TikTok hook voice
- `threads.md` — 6 short Threads-native posts
- `pinterest-pin-text.md` — 8 Pin titles + descriptions across BV boards

Each file pairs captions with suggested visuals (BG-composite mode picks documented).

### 4b. Email + SMS — staged, not deployed

Pre-written at `.openclaw/marketing/emails/` — 3 subject-line variants per send for split-test, full HTML bodies, BV brand voice:

- **welcome-1/2/3.md** — 3-email series (immediate / 48h / 5d)
- **abandoned-cart-1/2.md** — 1h + 24h
- **browse-abandonment.md** — 4h post-view (Klaviyo only)
- **post-purchase-thanks.md** — order-confirmation override
- **launch-announcement.md** — one-off blast for launch day
- **re-engagement.md** — 60-day-no-open re-permission
- **signup-popup.md** — exit-intent + scroll-trigger lead capture form (BV voice, no discount, paste-into-Klaviyo HTML)
- **sms-welcome.md** — SMS welcome + order + restock specs (hold until post-launch, A2P-ready)

Drop-in compatible with Klaviyo or Shopify Email native.

### 5. Launch readiness probe

Three surfaces over the same data:

- **UI:** `/launch` page ([app/launch/page.tsx](app/launch/page.tsx)) — visual checklist per brand with color-coded status badges and inline fix hints. Linked from the homepage nav.
- **API:** `GET /api/launch-status?brand=black-vault-apparel` (or omit `brand` for all configured brands) → JSON.
- **Operator tool:** `launch_status` — agent can answer "are we ready?" in chat with grounded data.
- **Sanity script:** `node --env-file=.env.local --import tsx scripts/check-launch-status.ts` — read-only CLI report.

Library: [lib/launch-status.ts](lib/launch-status.ts).

### 6. Operator agent training

New knowledge file [.openclaw/operator/knowledge/launch-playbook.md](.openclaw/operator/knowledge/launch-playbook.md) auto-loaded into the operator system prompt every turn. Covers:

- When/how to use the BG-composite tool (mode-picking heuristics)
- Where each marketing asset lives so the agent can point the merchant at it
- Launch-day order of operations (T-7 / T-3 / T-1 / launch / post-launch)
- Stock answers for common merchant questions (discounts, ad-window, CAC)

The existing `brand-fit.md` (anti-slop guardrails), `real-suppliers.md`, `supplier-vetting.md`, and `white-and-womens-spec.md` knowledge files remain in place and are unchanged.

---

## What still needs the merchant (cannot be automated)

1. **Set `OPERATOR_AUTH_SECRET` in Vercel project env** — value generated above. Redeploy.
2. **Update `SHOPIFY_BLACKVAULT_API_KEY` in Vercel** to the new 108-scope token. Per memory: production Vercel is still on the pre-2026-05-06 token.
3. **Choose ESP** — Klaviyo (segment-rich) or Shopify Email (no integration work, free for first 10K). Templates work in either.
4. **Verify SPF / DKIM / DMARC for blackvaultapparel.com** before sending the welcome series.
5. **Connect Meta Pixel + TikTok Pixel + Google Tag** via the Shopify sales-channel apps. Verify each fires with browser dev tools / Pixel Helper.
6. **Submit Google Merchant Center feed** — 3–5 day review window before Shopping ads can run.
7. **Decide on launch-day discount** — recommendation: free shipping over $100 (reads as policy). Resist %-off (reads as desperation).
8. **Provide a model photo if you want a real BV-mock-BG composite** — drop a JPG anywhere on disk and ask the operator to run `composite_on_bv_background` on it.
9. **First 5–10 Printful orders need manual confirmation** (default `PRINTFUL_AUTO_CONFIRM=false`). Flip to true in Vercel env after trust is built.

---

## Verified clean

- `npx tsc --noEmit` → green
- `npm test` → 15/15 pass (5 original + 4 bg-composite + 6 launch-status)
- Webhook HMAC verification: timing-safe, multi-secret support
- .env / .env.local: gitignored, no leakage in git log
- Brand-fit filter + curated knowledge: still pinned to operator on every turn

## Drafts triage (surfaced 2026-05-06 evening)

`scripts/summarize-drafts.ts` writes [.openclaw/drafts-summary.md](.openclaw/drafts-summary.md) — categorizes every draft per brand into buckets:

**LockLayer (24 drafts):**
- ✗ **9 OFF-BRAND — recommend DELETE.** Pipeline-slop from before the brand-fit filter was added 2026-05-01: Hospice Nurse hoodies (×3 duplicates), Night Shift ICU Vampire Tumblers (×2), Pediatric PT Canvas, Radiation Therapy Hoodie, Foster Dog Parent Tee, Animal Care Wall Art Series. None of these belong on LockLayer (hardware-only) or any brand BV adjacent.
- ⚠ **15 NEEDS DECISION.** CJ-sourced security hardware (cameras, doorbells, motion sensors, smart locks). On-brand for LockLayer; merchant should verify margin + image quality before publishing.

**black-vault-apparel (9 drafts):**
- ✓ **9 PUBLISH CANDIDATEs.** All on-brand: The Polo (AOP), The Beanie, The Snapback, 6 AOP variants (men's tee, women's tee, jersey, sweatshirt, hoodie, bomber). Walk through with `scripts/store-cleanup.ts` and press P or D on each.

**Recommended action sequence before launch:**
1. Delete the 9 LockLayer slop drafts (one batch operation in admin or via `delete_listing` operator tool).
2. Walk through the 15 CJ hardware drafts in `store-cleanup.ts` — kill the ones with weak margins/images, publish the rest.
3. Walk through the 9 BV drafts in `store-cleanup.ts` — likely publish all unless any need photo work.

Re-run `node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/summarize-drafts.ts` after to verify drafts cleared.

## Live state (per launch-status probe — 2026-05-07 morning)

**Executed against the live store this morning:**

- ✓ **All 29 active BV products** had their primary images replaced with BV-mock-BG composites (`scripts/bv-bg-bulk-composite.ts`, mode=ai). Originals kept as backups at position 2; merchant can prune later.
- ✓ **Homepage template patched** — `templates/index.json`. Hero CTA reads "Shop the Collection" linking to /collections/all. Brand statement heading is "Welcome to the Vault." Featured collection set to display 8 products from "all".
- ✓ **Password page text updated** — `templates/password.json`. "Opening soon" replaced with "Welcome to the Vault." in BV voice + "Heavyweight cotton. Embroidered Old Gold. Built to be Kept. Drop your email — we open the doors soon." Email signup remains so leads still get captured while the gate is up.
- ✓ **9 LockLayer slop drafts deleted** — Hospice Nurse hoodies (×3), Night Shift ICU Vampire Tumblers (×2), Pediatric PT Canvas, Radiation Therapy Hoodie, Foster Dog Parent Tee, Animal Care Wall Art Series.
- ✓ **9 BV draft AOPs/headwear are now active** — they were published between iterations. Total active BV count: 29.
- ✓ **launch-status now includes a `password_protection` check** — flags the password gate as FAIL until the merchant flips it manually.

**Per the live launch-status probe (just now):**

**black-vault-apparel** (overall: FAIL — only because of password):
- ✗ Storefront reachable to customers — **password gate is on; flip it in admin (see top of this file)**
- ✓ 29 active products on Online Store
- ✓ 0 drafts pending (all reviewed and resolved)
- ✓ Webhook secret set
- ✓ All 6 required env vars present
- ✓ Printful auto-confirm OFF (correct posture for first orders)

**locklayer** (overall: WARN):
- ✓ 5 active products
- ⚠ 15 drafts pending — all CJ-sourced security hardware. Merchant decides margin/quality. (The 9 off-brand drafts were deleted this morning.)
- ✓ Same env-var posture as BV

## Live state (per launch-status probe — 2026-05-06 evening, kept for reference)

`scripts/check-launch-status.ts` (read-only sanity check) — current state:

**black-vault-apparel** (overall: WARN):
- ✓ Shopify token connects to `tnbgmr-2d.myshopify.com`
- ✓ 20 active products on Online Store (well above launch floor)
- ⚠ 9 drafts pending review — decide publish/delete before launch
- ✓ Webhook secret set, all 6 required env vars present
- ⚠ `OPERATOR_AUTH_SECRET` unset (set it in Vercel before launch — see security section)
- ✓ Printful auto-confirm OFF (correct posture for first 5–10 orders)

**locklayer** (overall: WARN):
- ✓ Shopify token connects to `hh24h8-xh.myshopify.com`
- ✓ 5 active products
- ⚠ 24 drafts pending review
- Same env-var posture as BV

Run `node --env-file=.env.local --import tsx scripts/check-launch-status.ts` to re-check.

---

## Risk surface to watch on launch day

| Risk | Mitigation in place | What to watch |
|---|---|---|
| Webhook HMAC fails on real order | timing-safe compare, 401 on mismatch | Vercel function logs for 401s when test orders flow |
| Vercel function timeout (10s) on slow Printful API | webhook handler is lean, only awaits one Printful call | Watch for 504s in Vercel logs; first orders should finish in 2–4s |
| Open API surface (operator chat anyone can hit) | middleware fail-closed once OPERATOR_AUTH_SECRET set | Verify `curl restrepo.vercel.app/api/operator/chat` returns 503 after deploy |
| Pixel firing pre-launch but not post-launch | none in code; Shopify sales-channel apps own this | Use Meta Pixel Helper extension on a real product page on launch morning |
| Premium-positioning erosion via launch discount | no discount in any pre-launch email; soft no in operator stock answers | Hold the line if temptation hits at 1700 MST |

The deployment is small, focused, and as safe as it gets for a launch. Push the secret to Vercel, redeploy, verify pixels, send the welcome series — then send the launch broadcast at 1800 MST.

— Built to be Kept.
