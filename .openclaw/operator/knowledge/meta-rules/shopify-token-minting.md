# Shopify token minting + store facts (Black Vault) — STOP back-pedaling

_2026-06-11. Verified working. Read this before touching Shopify creds so we
never re-derive these facts under pressure again._

## Store domain (settled + verified)
- Use **`black-vault-apparel.myshopify.com`** for `SHOPIFY_BLACKVAULT_STORE_DOMAIN`. A read-only `shop.json` ping succeeds on it.
- The API reports the canonical `myshopify_domain` as **`tnbgmr-2d.myshopify.com`** (that's the handle in the new admin URL `admin.shopify.com/store/tnbgmr-2d`). BOTH work for the Admin API. Don't agonize — `black-vault-apparel.myshopify.com` is what's in `.env.local` and it works.
- Store: "Black Vault Apparel", basic plan, ~30 products.

## In-store custom apps are DEAD — Dev Dashboard + OAuth only
- Shopify removed legacy in-admin "Develop apps" custom apps; the page now just links to the Dev Dashboard. So you CANNOT get a one-click "reveal token" custom app anymore. A store admin token must be minted via the Dev Dashboard app + OAuth. (This is the recurring pain; it's unavoidable now — but the script below makes it one command.)

## The app
- Dev Dashboard app: `dev.shopify.com/dashboard/216149030/apps/354973581313`. Client ID (API key) + Secret (`shpss_…`) live on its Settings/Credentials page. The Secret ALSO doubles as the webhook signing secret — rotating it breaks order-webhook verification until updated.
- App's Allowed redirection URLs include `http://localhost:53682/auth/callback` (for local minting) and a Vercel URL.

## Minting a token — ONE command, no copy-paste
1. Ensure `.env.local` has `SHOPIFY_APP_API_KEY` (Client ID) + `SHOPIFY_APP_API_SECRET` (the `shpss_…`).
2. Run: `node scripts/mint-shopify-token.mjs black-vault-apparel.myshopify.com`
3. It starts a localhost listener (port 53682, path `/auth/callback`), prints an AUTHORIZE_URL.
4. Open that URL → approve (or it auto-redirects since the app is installed) → the localhost page says "✓ Token captured."
5. It auto-writes `SHOPIFY_BLACKVAULT_API_KEY` + `SHOPIFY_BLACKVAULT_STORE_DOMAIN` into `.env.local`. No address-bar copying, no PowerShell prompts.
- The old `scripts/mint-shopify-token.ps1` (paste-the-redirect-URL) is the painful version — prefer the `.mjs`.

## Printful thumbnail status (2026-06-11)
Printful sync-product thumbnails default to the flat design file, so products look
identical in the dashboard (a problem when ordering samples). `scripts/bv-aop-printful-thumbnails.mjs`
fixes this by reusing the real garment mockups already on Shopify and setting them
as the Printful thumbnail (variant-count verified on each — no fulfillment impact).
- DONE (2026-06-11): ALL product thumbnails now show real garments. The 6 AOP
  garments reused Shopify mockups; the last 3 (AOP Polo cut-sew; Beanie + Snapback
  embroidery) were generated via Printful's mockup-generator and set. None show the
  flat design file anymore.
- Safe thumbnail set: `PUT /store/products/{id}` `{sync_product:{thumbnail:url}}`
  (omitting sync_variants preserves them). Printful create-task is rate-limited
  (429) — space ~1.4s + retry with ~45s cooldown.

## .env.local recovery rule
- `vercel env pull` returns BLANK for Sensitive vars (can't decrypt) — it will WIPE your local canonical values. You cannot recover a Sensitive var's value from Vercel (no reveal). Recovery = rotate/re-mint at the source.
- ALWAYS `npm run env:backup` before any `vercel env pull` / `vercel link`. `.env.local.backup-*` is gitignored. `npm run doctor` lists what's missing.
