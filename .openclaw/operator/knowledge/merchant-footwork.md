# Merchant Footwork Checklist — Do This BEFORE Agents Build

When a merchant says "set up my store" / "let's launch a brand", the agent's first move is to walk them through this checklist. Most failures we've seen come from agents jumping to product materialization while critical setup (DNS, payments, account verification) is still half-done. Once these are complete, agents can focus on what they're good at: building, generating, auditing, and monitoring.

**Rule for agents:** never generate a single product, image, or campaign until at least Tiers 1 + 2 are confirmed done. Push back politely if a merchant tries to skip ahead.

---

## Tier 1 — Merchant-only, do these FIRST (no agent help possible)

These require the merchant's identity, banking, or browser-side OAuth. No API can do them.

### 1. Domain ownership
- Buy the domain at a registrar that has an open API: **Namecheap**, **Cloudflare**, **Porkbun** are all good. Avoid GoDaddy if possible — flaky DNS UI.
- Have DNS access — merchant must be able to log into the registrar and add records.
- **Time:** 10 min to buy, plus DNS records take up to 24h to propagate.

### 2. Shopify store + custom app
- Create the Shopify store at the merchant's chosen myshopify subdomain.
- Pick a paid plan (Basic at minimum — Free trial blocks the Online Store from customers via "powered by Shopify" gate even with password off).
- Create a **custom app** in Shopify admin → Apps → Develop apps → grant the **108-scope set** (we've documented the full list elsewhere).
- Copy the **API access token** (`shpat_...`) and **API secret key** (for HMAC, used as `SHOPIFY_*_WEBHOOK_SECRET`).
- **CRITICAL — paste tokens nowhere except `.env.local` and Vercel env.** GitHub secret scanning will block pushes that contain a `shpat_` token. Past mistakes: we accidentally documented a token in a knowledge file and got blocked.
- **Time:** 15 min including scope-grant clicks.

### 3. Storefront password gate
- Shopify admin → Online store → Preferences → **uncheck "Restrict access to visitors with the password"** → Save.
- **No API for this** — Shopify deliberately walls it off. Merchant must do it in admin.
- Verify in incognito: visiting the customer URL should show the storefront, not "Welcome to the Vault" / "Opening soon" gate.
- **Time:** 1 min, but DOUBLE-CHECK with incognito after — Shopify's admin sometimes shows green "open" banner when state isn't actually saved.

### 4. Payment processing
- Shopify Payments OR Stripe → KYC submission (legal name, business EIN if applicable, bank routing/account, ID upload).
- Approval can take 0-7 days for new merchants.
- Without this, customers can browse but checkout will fail.
- **Time:** 30 min to submit; days to clear.

### 5. Print-on-demand / fulfillment partner
- Printful (apparel) or CJ Dropshipping (hardware) account.
- Wire payment method (CC on file).
- For Printful specifically: **pick a "Manual order / API" platform setup**, not a Shopify-direct integration, so our webhook handler creates orders programmatically without Printful trying to manage Shopify directly.
- **Time:** 20 min.

### 6. Established Facebook account (if Meta is in the plan)
- **2+ year old Facebook with friends, posts, real profile photo.** Brand-new accounts get auto-denied at "Community Standards" verification at high rates in 2024-2026.
- This account becomes the admin of the Business Manager / Page / Pixel / ad account. Brand assets live at the Business level — owner's personal name appears nowhere customer-facing.
- If no established account: skip Meta for launch (Path C: TikTok + Pinterest + Google + Klaviyo + organic IG).
- **Never** create a fresh Facebook just for business setup. It will be denied. Fast track to a 30-day appeal black hole.
- **Time:** 5 min if account exists; 60+ days if you have to create + age one.

### 7. Vercel project + env vars
- Connect the GitHub repo to Vercel (auto-deploys on push to main).
- Set env vars: `SHOPIFY_BLACKVAULT_API_KEY`, `SHOPIFY_BLACKVAULT_WEBHOOK_SECRET`, `SHOPIFY_BLACKVAULT_STORE_DOMAIN`, `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, **`OPERATOR_AUTH_SECRET`** (generated via `openssl rand -hex 32`).
- Without `OPERATOR_AUTH_SECRET` set on Vercel, the operator API fails closed (returns 503) and the deployed dashboard won't work.
- **Time:** 10 min.

---

## Tier 2 — Merchant + Agent collaborative (browser-side merchant action, agent verifies)

### 8. Klaviyo signup
- Free tier (250 contacts, 500 emails/month) is fine for launch.
- Install the **Shopify integration** in Klaviyo (one-click OAuth). Klaviyo auto-pulls products + customers + adds the tracking script.
- **Domain authentication is the slow part.** Use a subdomain like `send.brand.com` or `mail.brand.com` — never the bare root (separates marketing reputation from transactional).
- Use **Entri** for one-click DNS push if your registrar (Namecheap, Cloudflare, GoDaddy, etc.) is supported. Saves 15+ min of manual DNS entry + eliminates typos.
- Generate a **Private API key** with limited scopes (Lists Full, Profiles Full, Events Full, Brands/Campaigns/Catalogs/Composer/Flows/Forms/Metrics/Segments/Subscriptions/Tags/Templates Read; Accounts and Coupons No Access).
- Save key as `KLAVIYO_API_KEY` in `.env.local` only (not Vercel — operator runs locally).
- **Time:** 20-45 min; DNS verification can take up to 24h.

### 9. Pixel / tracking installs (if running paid ads)
- **Meta Pixel** — only viable with established Facebook account from Tier 1 step 6.
- **TikTok Pixel** — sign up at ads.tiktok.com, lighter verification than Meta, install via Shopify TikTok sales channel.
- **Google Tag (GA4 + Ads conversion)** — install via Shopify Google sales channel.
- **Pinterest Tag** — install via Shopify Pinterest sales channel.
- All four are Shopify sales-channel apps; install + pixel select takes ~5 min each once accounts exist.
- **Time:** 15-30 min total once accounts ready.

### 10. Google Merchant Center (if running Shopping ads)
- Connect via Shopify → Google sales channel.
- Submit feed → **3-5 business day review** before Shopping ads can run.
- **Time:** 10 min to submit; days to clear.

---

## Tier 3 — Agent does everything (after Tiers 1 + 2)

Once Tier 1 + 2 are confirmed, agents can take over and the merchant just watches:

- ✓ Materialize products (via `materialize_product` tool — Printful / CJ paths)
- ✓ Audit + categorize drafts (`summarize_drafts` — flags off-brand for delete)
- ✓ Bulk-publish drafts to Online Store (`publish_listing` per product)
- ✓ Customize theme templates (homepage hero, color scheme, CTAs)
- ✓ Update product titles / descriptions for hygiene (no supplier names, no competitor comparisons)
- ✓ Push test contacts to Klaviyo (`klaviyo_push_test_contact`)
- ✓ Pull email metrics (`klaviyo_status` + future tools)
- ✓ Run launch readiness probe (`launch_status` — surfaces remaining blockers)
- ✓ Manage storefront menus (`add_menu_item`, `remove_menu_item`)
- ✓ Generate brand-voice copy (welcome series, abandoned cart, organic captions)
- ✓ Wire orders/paid + products/update webhooks
- ✓ Spot-check storefront via curl probes
- ✓ Monitor Vercel function error rates
- ✓ Suggest pricing tier adjustments based on margin

---

## Hard rules learned the painful way

These come from real scars on this project. Train them into every agent:

1. **gpt-image-1 cannot reliably reproduce small text or letterforms.** Never use AI image-edit modes (`ai`, `editorial`, `cutout`) for catalog product imagery. Default to Printful's mockup-generator output. Save AI editorial for marketing one-offs only — and expect 20-40% of outputs to need re-rolls.
2. **Never name supplier blanks in customer-facing descriptions.** No "Comfort Colors 1717", no "Stanley/Stella", no "Yupoong 6089M", no "AS Colour". Customers Google these and bypass the store. SKU codes also leak supplier identity — strip them.
3. **Never compare to competitor brands in descriptions.** No "Travis Mathew tier", no "Aimé Leon Dore territory". It reads amateur and trains customers to comparison-shop. Describe fabric and construction on its own merits.
4. **Never recommend creating a fresh Facebook account for business setup.** It gets denied. Use established personal account or skip Meta for launch.
5. **Never paste tokens or secrets into committed files** — not even as documentation. GitHub secret scanning blocks pushes. Reference env var NAMES only.
6. **Never use the bare root domain for marketing email** — always use a subdomain (`send.`, `mail.`, `news.`). Protects transactional deliverability if marketing gets a spam complaint.
7. **AOP (all-over-print) products MUST use cutout mode if compositing**, not editorial. Editorial AI re-renders kill the all-over pattern.
8. **For LockLayer (or any custom-app store missing `write_publications` scope):** GraphQL `publishablePublish` returns ACCESS_DENIED. The REST `published: true` PUT works as fallback on active products only — won't pre-attach drafts. Either re-auth the app or use the products/update webhook handler we built to auto-attach when status flips to active.
9. **Editorial deadlines aren't worth shipping a broken brand.** "Quality over timeline" — the merchant explicitly chose to miss a 1800 MST launch deadline rather than launch with hallucinated chest marks. Honor that posture for new stores too.
10. **The `OPERATOR_AUTH_SECRET` must be set in Vercel before push.** Without it, middleware fail-closes the operator API on production. Generate via `openssl rand -hex 32`, never reuse, never commit.

---

## How an agent should USE this checklist

When a NEW merchant says "set up my store" / "I want to launch a brand":

1. **Ask which Tier 1 items are done.** Don't assume. "Have you bought the domain yet? Is your Shopify store created? Do you have an established Facebook account or do you want to skip Meta?"
2. **Walk them through any missing Tier 1 items in order.** Don't generate anything until these are done.
3. **Then walk Tier 2 (Klaviyo + pixels).**
4. **THEN start building (Tier 3).** Begin with `bootstrap_store` to verify token + register webhook + push policies + wire menu.
5. **Surface the hard rules inline** when relevant — e.g., when materializing a product, never mention supplier names in the description; when generating mockups, default to Printful's output not AI editorial.

The merchant's job stays focused: identity verification, payment KYC, account creation. The agent's job stays focused: building, generating, auditing, monitoring. Don't blur the lines.
