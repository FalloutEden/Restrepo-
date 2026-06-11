# GthicPrintables (Etsy) — strategy + hard constraints

_2026-06-11. The founder's dormant Etsy shop (gothic niche) being revived._

## ✅ ETSY API IS LIVE (2026-06-11) — auth format gotcha (CRITICAL)
The Etsy app was APPROVED. Creds in `.env.local`: `ETSY_API_KEYSTRING` + `ETSY_SHARED_SECRET`.
**The `x-api-key` header MUST be `keystring:shared_secret`, NOT the keystring alone** —
every prior 403 ("shared secret is required in x-api-key header") was this. Verified:
`openapi-ping` → 200, application_id 1492614155004.
- **GthicPrintables shop_id = 40775757.** Public stats (active listings, transaction_sold_count,
  num_favorers) come from `GET /v3/application/shops?shop_name=GthicPrintables` — app-level,
  NO OAuth needed. Wired into `/api/command-center/metrics` (Etsy panel LIVE; currently 0/0/0
  because the shop is dormant — numbers populate as we relist).
- **OAuth (PKCE) is still needed** for PRIVATE data + listing management/creation (the
  "AI drafts → founder activates" automation). Authorize: `etsy.com/oauth/connect`; token:
  `POST api.etsy.com/v3/public/oauth/token` (client_id = keystring, code_verifier/challenge,
  redirect must be whitelisted in the Etsy app). Access token format: `{user_id}.{token}`.

## The hard constraint (don't re-derive this)
**GthicPrintables is an Etsy-platform store in Printful (Printful store 10020261).**
The Printful API CANNOT manage it — `/store/products` returns 400
("applies only to Manual Order / API platform stores"). So:
- The API CANNOT create, draft, or delete products in the Etsy store. That's UI-only.
- The API CANNOT create product templates either. VERIFIED 2026-06-11: `POST
  /product-templates` (and v2 variants) all return 404 — no create endpoint exists.
  GET /product-templates is read-only. Templates are UI-only, same as products.
- The Printful mockup-generator API DOES work for any product — so the operator can
  produce mockup PREVIEWS of a design, just not create products/templates/listings.
- FULL automation (AI drafts a listing → human clicks live) is only possible via the
  **Etsy Open API directly** (OAuth + an Etsy app) — a future build, not yet done.

## What the operator CAN do for Etsy today
Generate the designs, generate Printful mockups (mockup API works on any product),
and write the Etsy SEO (title + all 13 tags + description). The human does the
Printful-UI publish + paste. Division of labor, not full automation.

## Niche + design direction (Etsy 2026 research)
**Romantic goth is the winning lane** — refined/witchy, not harsh: black cats, tarot,
tasteful skeletons, celestial/moon, death's-head moths, skeletal botanicals, ravens,
occult sigils; dramatic serif fonts; pops of purple / neon green / orange.
- **Apparel = BLACK garments** (Comfort Colors Pepper, Gildan Dark Heather). CRITICAL:
  designs must be WHITE/light line art on transparent (a dark design vanishes on black).
- **Stickers** = fastest way to test a new design before scaling.
- **Wall art / digital prints** = strong, but need high resolution (AI ~1024px caps are
  too small for large prints → upscale or sell as smaller/stickers).
- gothic/witchy didn't fail as a niche — it's one of Etsy's strongest; GthicPrintables
  failed on SEO + most listings are now EXPIRED on Etsy (delisted).

## Starter collection (2026-06-11)
Generated white-line-art transparent designs in `.openclaw/gthic-designs/`: death's-head
moth, celestial black cat, The Moon tarot, skeletal hand + roses, raven occult moon,
moon-phase botanical. (gpt-image-1, transparent — good for stickers/chest prints; upscale
for full prints.)
