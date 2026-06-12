# Print placement standards (premium apparel) — Black Vault

_2026-06-11. Researched industry + luxury conventions. Build products to these._

## Placement sizes (DTG, adult tee; print area ≈ 12"w × 16"h)
- **Left-chest logo:** 3–4" wide, ~3" below collar, ~2" in from the armpit. Small,
  subtle — the premium "pocket logo" look.
- **Center chest:** 6–10" wide (8" typical), 3–3.5" below collar.
- **Full front:** 12–15" wide, up to 16" tall, stop ~1" before side seams.
- **Back print:** ~12×16", placed 3–4" below the collar.
- Oversized/streetwear: 12–15" wide, 14–16" tall.

## Black Vault placement RULES (locked with founder 2026-06-11)
- **Never** a centered chest crest AND a back print together — that's a clash.
- Two valid combos only:
  1. **Centered front print, NO back print**, or
  2. **Back print + small LEFT-CHEST mark** (wearer's left = viewer's right).
- Premium = restraint. Favor the small left-chest mark + back print for branded tees.

## Printful position math (front area 1800×2400 px = 12"×16", so 150 px/inch)
- Left chest crest: width ≈ 520–600 px (3.5–4"), top ≈ 120–180 px (just below the
  print-area top), left ≈ 0.5 × area_width (shifts it to the wearer's left chest).
- Back: width ≈ 0.9 × area_width (~11"), vertically centered/upper.
- Verified mockup pipeline: host design on Shopify CDN → Printful mockup-generator
  (create-task needs the `position` field — MG-4 error if omitted).
