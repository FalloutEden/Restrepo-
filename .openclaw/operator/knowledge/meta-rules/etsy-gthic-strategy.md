# GthicPrintables (Etsy) — strategy + hard constraints

_2026-06-11. The founder's dormant Etsy shop (gothic niche) being revived._

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
