---
title: "Shopify Plus + Partners deep cuts — what we need to know"
kind: ops-runbook
date: 2026-05-14
tags: [shopify, plus, partners, app-store, webhooks, gdpr, migration, traps, functions, checkout-extensibility, built-for-shopify, rate-limits]
related_concepts: [the-operator, byok-saas, printful-pipeline, multi-tenant-shopify, gdpr-compliance, webhook-reliability, oauth, app-bridge, hydrogen, b2b]
---

# Shopify Plus + Partners deep cuts

## TL;DR

The Operator's biggest near-term land mines are submission-gate booby traps, not Plus features: missing/wrong GDPR webhooks, Asset-API theme injection that survives uninstall, REST-only code paths (REST legacy 2024-10, banned for new public apps 2025-04), and `checkout.liquid` references (in-checkout deprecated 2024-08-13, Thank-You/Order Status 2025-08-28). Webhook reliability is the silent killer: Shopify removes subscriptions after ~19 failures over ~48 h with **no notification**, so we need a daily subscription health-check cron, not just receiver code. The Scripts → Functions cliff is **2026-06-30**; any Plus tenant with custom checkout discount/shipping/payment logic must already be on Functions or default Shopify behavior returns silently. App-store path realities: budget **30–60 days** review (the advertised 8–10 day SLA is fiction in 2026), Theme App Extensions only, Managed Installation + token exchange + session tokens (App Bridge v4), minimum scopes — our 108-scope custom-app footprint gets torn apart on public-app review.

---

## Section 1: App Store submission gauntlet

### Where to find the rules
- Official policy index with section numbers: [shopify.dev — App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) — this is the document review uses against you. Sections 1.x policy, 2.x functionality, 3.x security, 4.x listing, 5.x category-specific.
- [Common rejections](https://shopify.dev/docs/apps/store/common-rejections) — Shopify's own list of what kills apps.
- [Review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process) — status lifecycle (Draft → Submitted → Paused/Reviewed → Published) plus "withdraw" button.

### Mandatory GDPR / privacy webhooks (this is the #1 rejection driver)

Every app distributed via the App Store **must** subscribe to and correctly handle three topics, regardless of whether you collect customer data. Source: [shopify.dev — Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

| Topic | Payload (key fields) | What we must do | Timing |
|---|---|---|---|
| `customers/data_request` | `shop_id`, `shop_domain`, `customer{id,email,phone}`, `orders_requested[]`, `data_request.id` | Compile customer's data and hand it to the **store owner** (NOT the customer directly). 200-series response = ack. | Owner contacts customer; we have **30 days** to respond per [privacy-law-compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance). |
| `customers/redact` | `shop_id`, `shop_domain`, `customer{id,email,phone}`, `orders_to_redact[]` | Delete or anonymize personal data for that customer in our DB. | Shopify delays this 10 days (if no orders in last 6 months) or up to 6 months after deletion request. |
| `shop/redact` | `shop_id`, `shop_domain` | Delete everything we have for that store. | Fired **48 hours after the store uninstalls** the app. |

**Verification requirements (this is where apps fail in review):**
- Verify the `X-Shopify-Hmac-SHA256` header with the **app client secret** against the **raw body**. Wrong/missing HMAC → return **401** (not 200, not 403). The review team intentionally fires a request with a bad signature and rejects you if you 200 it.
- Reply with a **2xx** within **5 seconds** even if processing is async.
- These topics **must be configured in your `shopify.app.toml`** (or equivalent CLI config). Setting them only at runtime via the Admin API will not be honored at review time.

### Common rejection reasons (with policy section numbers)

From [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) + [common rejections](https://shopify.dev/docs/apps/store/common-rejections):

| Section | What kills apps |
|---|---|
| 1.1.1 / 2.2.3 | Embedded app not using session tokens; relies on 3p cookies. App Bridge < v4 fails. |
| 1.1.2 | Bypasses Shopify Checkout (offsite payment, custom funnel). |
| 1.2.1–1.2.3 | App fees charged outside **Shopify Billing API**. Auto-reject. |
| 2.1.1–2.1.3 | Web errors during review (404, 500, infinite redirect). Reviewers run install + first-use. |
| 2.2.4 | New public app on **REST Admin API** — banned since 2025-04-01. |
| 2.3.1–2.3.4 | OAuth not initiated from Shopify-owned surface; UI before token exchange completes. |
| 3.1.1 | Any HTTP (non-TLS) endpoint, including webhook URLs. |
| 3.2.x | `read_all_orders`, `write_payment_mandate`, `write_checkout_extensions_apis`, `read_advanced_dom_pixel_events`, `read_checkout_extensions_chat` without written justification. |
| 4.5.3–4.5.5 | Missing demo screencast OR test creds that don't grant full feature access. |
| 5.1.1 | Theme integration via **Script tags** / **Asset API writes** instead of **Theme App Extensions**. |
| GDPR | Topics not subscribed, or 200 on bad-HMAC test. |
| Uninstall | Theme code not cleaned up — dangling `<script>` tags loading 404'd assets. |

**Real-world rejection patterns** ([community.shopify.dev](https://community.shopify.dev/t/warning-shopify-app-store-review-process/32259)): one team rejected because reviewer couldn't open the dev's `mailto:` support link (no mail client in their VM) — use an https URL or web form for support. 1.1.8 POS rejections are aggressive: any hint of non-Shopify hardware bridging triggers it even when not POS-related. Reviewers often send generic "serious issues prevented full review" with no detail — plan for submit → reject → ask for specifics → resubmit.

### Built for Shopify badge (separate program after listing)

Once listed, [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements) is a higher tier that gets you better discoverability + perks. Real cost:
- **50 net installs from paid shops**, **5+ reviews**, in-good-standing Partner status.
- **Admin performance** (p75 over 28 days, minimum 100 measurements): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms.
- **Storefront performance**: must not drop Lighthouse score > 10 points.
- **Carrier service apps**: p95 rate-endpoint response < 500 ms with 99.9 % success over 28 days (min 1000 requests).
- Annual re-review — you can lose the badge silently.

### Review timeline (real, not advertised)

Shopify states an 8–10 business-day SLA. Forum reality as of May 2026 ([source](https://community.shopify.dev/t/warning-shopify-app-store-review-process/32259)): **30+ days first response is the norm**, with 60+ day stalls reported when reviewer assignment lapses. Plan The Operator's app-store path around a 90-day calendar, not 14 days.

Appeals: there is no formal appeals UI. You reply in the review thread, push back, and hope. If a reviewer is wrong (the `mailto:` story above), be polite + specific in the reply; rejections do get reversed but only with a clear technical demonstration of the misunderstanding.

---

## Section 2: Webhook reliability

### HMAC verification — the edge cases that break us

We already do HMAC. The traps:

1. **Raw body vs parsed body.** Verification must run on the raw request bytes. Next.js / Express default JSON middleware mutates whitespace; if anything touches `req.body` before verification, HMAC fails. Source: [HTTPS webhook delivery](https://shopify.dev/docs/apps/build/webhooks/subscribe/https), corroborated by [DEV: HMAC keeps failing](https://dev.to/prateek32177/why-shopify-webhook-hmac-verification-keeps-failing-33ch).
2. **Wrong secret.** Shopify webhook HMAC uses the **app client secret** (Partner Dashboard → API key/secret), NOT a per-webhook signing secret like Stripe. For shop-created webhooks via the Admin API, the secret is still the app's client secret.
3. **Base64, not hex.** `X-Shopify-Hmac-SHA256` is base64-encoded SHA-256. Mistakenly hex-comparing returns false-negatives.
4. **Client secret rotation.** When you rotate, [the new HMAC takes up to 1 hour to start signing](https://hookdeck.com/webhooks/platforms/definitive-guide-shopify-webhooks-https-hookdeck) — keep both secrets valid during the rollover window.
5. **Timing-safe comparison.** Use `crypto.timingSafeEqual` / equivalent, not `===`.
6. **Storefront-API access tokens are not HMAC-able.** Different verification path.

### Retry schedule — Shopify's docs disagree with itself

**Shopify's troubleshooting doc says 8 retries over 4 hours then removal:** [Troubleshooting webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks).

**Community + tooling vendors consistently report 19 attempts over ~48 hours:** [ShopHooks blog](https://shophooks.dev/blog/shopify-webhook-silent-failure), [EventDock](https://eventdock.app/blog/shopify-webhook-reliability-orders-missing), [Hookdeck](https://hookdeck.com/webhooks/platforms/shopify-webhooks-features-and-best-practices-guide).

The conflict is real and longstanding. **Treat 19 retries / 48 h as the conservative model** — it matches what operators observe. Either way: 5-second response budget, removal is silent (no email, no dashboard alert).

**Operator must do**:
- Health-check cron: query the Admin API for our app's webhook subscriptions on each tenant **daily**; alert + re-register any that have disappeared. This is non-optional.
- Use `X-Shopify-Webhook-Id` header for idempotency. Same webhook ID = same event, even on retry.
- Use `X-Shopify-Triggered-At` to detect late deliveries (eventual-delivery is real — webhooks can arrive minutes to hours late under load).
- ACK fast (200), process async. Anything blocking longer than 5 s is a failure.

### Topic-specific traps

- **`orders/create` fires when the order is created** — payment may still be pending (financial_status `pending`/`authorized`). **`orders/paid` fires when payment is captured.** [Confirmed in forums](https://community.shopify.dev/t/orders-paid-vs-orders-updated/715). For Printful fulfillment, listen on `orders/paid`, not `orders/create`, or you ship unpaid orders.
- **`orders/paid` does not fire for orders created via the `orderCreate` GraphQL mutation** under some conditions ([community thread](https://community.shopify.com/t/orders-paid-webhook-not-triggered-for-orders-created-via-graphql-ordercreate/556148)). If The Operator ever materializes an order programmatically and expects `orders/paid` to fire, verify per-API-version.
- **`orders/updated` is noisy** — fires on tag changes, note edits, anything. Don't use it as a payment signal.
- **`app/uninstalled` is the only signal you have before `shop/redact` arrives 48 h later.** Use it to start the data-deletion clock and stop pushing to that tenant's Printful queue.

### Replay attacks

Shopify webhooks have no nonce. Treat `X-Shopify-Webhook-Id` as a primary key in an "already processed" table and ignore duplicates. Without this, a captured payload can be replayed indefinitely (HMAC will still validate).

---

## Section 3: API breaking changes (last 12 months)

Source: [shopify.dev/changelog](https://shopify.dev/changelog).

| Date | Change | URL | Impact on The Operator |
|---|---|---|---|
| 2024-10-01 | REST Admin API → **legacy**. | [versioning](https://shopify.dev/docs/api/admin-rest/usage/versioning) | Audit every REST call. |
| 2025-04-01 | New public apps **must use GraphQL**. REST submission auto-rejected. | [thread](https://community.shopify.dev/t/from-april-2025-apps-must-use-graphql/6623) | Blocks our app-store path until REST-free. |
| 2025-08-28 | `checkout.liquid` dead for Thank-You / Order Status; ScriptTag on Order Status sunset. | [guide](https://www.muckypuddle.com/blogs/news/shopify-checkout-extensibility-ultimate-guide) | Tenants with legacy thank-you customizations break. |
| 2025-12-10 | Web pixel apps stop receiving PII without Protected Customer Data L1+L2 approval. | [changelog](https://shopify.dev/changelog/protected-customer-data-scopes-required) | Block before adding pixels. |
| 2025-12 | Expiring offline tokens — 90-day refresh-token lifetime, one active per app/shop. | [offline tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens) | Token-refresh path required or connections die at day 90. |
| 2026-01 | `Shop.shopAddress` replaces `Shop.billingAddress`. Bulk mutations: 5 concurrent (was 1). | [shopAddress](https://shopify.dev/changelog/deprecation-of-shop-billingaddress-in-favor-of-shop-shopaddress) | Audit `shop.billingAddress` usage. |
| 2026-04 | Checkout metafields deprecated (use cart/order metafields). ShopifyQL `returns` → `sales_reversals`. | [analytics rename](https://shopify.dev/changelog/shopifyql-returns-fields-deprecated-and-replaced-with-sales-reversals-fields), [checkout metafields](https://shopify.dev/changelog/deprecation-of-checkout-metafields-in-checkout-and-customer-account-ui-extensions) | Update CEREBRO analytics queries. |
| 2026-04-15 | **Scripts editor freezes** — no new or edited Scripts. | [Scripts deprecation](https://shopify.dev/changelog/shopify-scripts-will-be-deprecated-on-june-30-2026) | Plus tenants on Scripts must be on Functions. |
| 2026-05-07 | `ProductVariant` becomes `Publishable` (per-variant channel publish). | [variant publishing](https://shopify.dev/changelog/publish-and-unpublish-product-variants-independently-from-product) | Update materialization pipeline if variant-level publish wanted. |
| 2026-06-30 | **Scripts engine stops.** | [Scripts deprecation](https://shopify.dev/changelog/shopify-scripts-will-be-deprecated-on-june-30-2026) | Hard cliff — broken discount/shipping/payment logic. |
| 2026-07 | `DraftOrderLineItem.grams` removed (use `weight`); `appliesOnSubscription` default flips to `true`; new `Order.cartToken`. | [grams](https://shopify.dev/changelog/draftorderlineitemgrams-field-removed-in-2026-07), [default flip](https://shopify.dev/changelog/default-value-of-appliesonsubscription-changed-to-true-for-app-discount-inputs), [cartToken](https://shopify.dev/changelog/new-field-carttoken-added-to-the-order-graphql-admin-api) | Audit draft-order code; explicit `false` for non-sub discounts. |

API versioning rule: stable version every quarter, supported 12 months minimum with 9 months overlap. We should pin our queries to a known version, not "latest" — silent breakage is worse than a versioning warning.

---

## Section 4: Shopify Plus capabilities (what changes)

### Pricing reality

[Shopify Plus pricing page](https://www.shopify.com/plus/pricing) lists **$2,300/mo on 3-year term** or **$2,500/mo on 1-year**. Above ~$800k–$1M/month GMV, it flips to a **0.25%–0.4% revenue share** with a $40,000/mo cap ([breakdown](https://shopxcommerce.com/blogs/all/shopify-plus-pricing-explained-costs-plans-hidden-fees-2026)). Includes 9 expansion stores; +$300/mo per additional. This is the threshold where Karling's BV stores or our SaaS tenants would consider upgrading.

### What Plus unlocks (and the gotchas)

| Capability | What it does | The trap |
|---|---|---|
| **Shopify Functions** | Wasm modules for discounts, shipping, payment, cart-transform, delivery/payment customization. < 5 ms execution. | Plan-gating: only **Plus** can install **custom** Function apps; any plan can install **public** Function apps from the App Store. Operator-shipped Functions only benefit Plus tenants. ([src](https://shopify.dev/docs/apps/build/functions/migrating-from-shopify-scripts)) |
| **Shopify Flow** | Visual triggers→conditions→actions (tag, email, HTTP, Function). | Overlaps our crons. Boundary: Flow for **Shopify-internal** actions, our cron for cross-system (Printful, Stripe). Don't double-schedule. |
| **Launchpad** | Schedules theme changes, discounts, product publishes for flash sales. | Time-bound only, no conditions. Don't double-schedule via cron + Launchpad on same store. |
| **B2B Catalogs + Companies** | Per-company pricing, terms, draft orders. Unlimited catalogs. | Pricing via discount Functions, not Scripts. Our materialization knows nothing about Companies — entity gap. ([src](https://help.shopify.com/en/manual/b2b/catalogs)) |
| **Checkout Extensibility** | UI Extensions + Branding API + Pixels + Functions. Replaces `checkout.liquid` (in-checkout dead 2024-08-13, Thank-You/Status dead 2025-08-28). | Sandboxed React-like; no arbitrary scripts. Legacy `checkout.liquid` tenants are broken. ([src](https://shopify.dev/changelog/checkout-liquid-will-no-longer-work-for-in-checkout-pages-starting-august-13-2024)) |
| **Expansion Stores** | Up to 9 additional stores, single org admin. | Each is its own shop with its own token — multi-tenant DB must row-per-store. |
| **Org Admin** | SSO, unified analytics, shared config. | Org-level API is separate from per-shop tokens; our OAuth assumes per-shop. |
| **Higher rate limits** | GraphQL bucket: **1000 pts/s on Plus** vs 100 (Std) / 200 (Advanced) / 2000 (Commerce Components). Bulk: 5 concurrent (2026-01). | Single-query cap **1000 pts** regardless of plan — one bad query blows the bucket. ([src](https://shopify.dev/docs/api/usage/limits)) |
| **ShopifyQL → Sidekick** | Custom analytics. ShopifyQL Admin GraphQL is **sunsetting** (2024-07). | Don't build new dashboards on ShopifyQL; dead end. ([src](https://shopify.dev/changelog/shopifyql-admin-graphql-api-sunset)) |
| **Hydrogen / Oxygen** | Headless React Router 7 + Shopify edge runtime. | Engineering investment; default to OS 2.0 + Dawn for 99 % of tenants. |
| **Wholesale Channel** | Sunsetted — use native B2B. | Never recommend Wholesale Channel; suggest dedicated/blended B2B store. |

### Sub-section: Scripts → Functions (the must-know)

[Scripts deprecation](https://help.shopify.com/en/manual/checkout-settings/script-editor/transitioning-to-functions) is the single most disruptive event in the Plus ecosystem this year:

- **April 15, 2026** — Scripts editor frozen.
- **June 30, 2026** — Scripts engine stops executing.
- Migration path: review the Scripts customizations report in the merchant admin → either install a public app that uses Functions OR build a Function in a custom app (Plus-only) OR install one of Shopify's no-code Function templates.
- If a tenant's Scripts go dark on July 1, all their bespoke discount logic reverts to default Shopify behavior — silently. We need a pre-flight check before onboarding any Plus tenant: "Do you have active Scripts? If yes, here's the migration path."

---

## Section 5: Migration path (Basic / Advanced → Plus)

What actually breaks when a merchant upgrades. Source synthesis: [Revize migration playbook](https://www.revize.app/blog/shopify-advanced-to-plus-2026-migration-playbook), [AcquireX](https://acquirex.io/blog/shopify-plus-migration-checklist/), [Easy Sell migration deadline](https://easysellapp.com/blogs/wiki/shopify-checkout-extensibility-migration-deadline-august-2026).

**Pre-flight audit (before the upgrade):**

1. **Scripts inventory** — run the Scripts customizations report; every item needs a Functions plan or it goes dark June 30 2026.
2. **`checkout.liquid` audit** — in-checkout dead 2024-08-13; thank-you/order-status dead 2025-08-28. Migrate to Checkout UI Extensions + Branding API.
3. **ScriptTag + Asset API audit** — swap to Theme App Extensions; embed blocks load on configured surfaces only.
4. **Hardcoded subdomains** — Klaviyo/Drip often hardcode `{shop}.myshopify.com`. Verify after upgrade.
5. **B2B tag workarounds** — rip out price-list-app emulation; use native B2B Companies + Catalogs.
6. **REST → GraphQL** — migrate before upgrade; Plus's higher bucket only helps if you can use it.

**Order of operations:** Scripts → Functions (4–8 wks) · `checkout.liquid` → Extensions (4–12 wks, often longest) · ScriptTag/Asset → Theme Extensions · GraphQL field migration (`billingAddress`, `grams`, `returns`, checkout metafields) · upgrade to Plus · configure Org Admin, expansion stores, B2B · onboard Flow.

**Immediate wins on Plus:** 10x GraphQL bucket (100→1000 pts/s), 5x concurrent bulk mutations, native B2B, Checkout Branding API, 9 expansion stores free.

---

## Section 6: Theme + Storefront traps

### Online Store 2.0 (the reference)

[Dawn](https://github.com/Shopify/dawn) is Shopify's reference OS 2.0 theme — JSON templates, sections that appear on every page, app blocks via Theme App Extensions. Anything not on OS 2.0 ("vintage themes") is on a deprecation glide-path. **Don't recommend vintage themes to tenants** — Script tags are the only injection mechanism on vintage, and Script tags are a rejection-vector for the App Store.

### Sections + blocks (vs legacy)

OS 2.0 sections + blocks allow merchants to compose pages without code. **App blocks** (part of Theme App Extensions) are the modern injection point:

- App blocks: merchant-placed widgets inside sections.
- App embed blocks: page-level injection (loads on all pages OR on selected pages — that's the win over Script tags).
- Auto-removed on uninstall (this is why App Store reviewers love them).

### Hydrogen / Oxygen — when is custom storefront worth it?

[Hydrogen](https://hydrogen.shopify.dev) is Shopify's headless framework (React Router 7-based, formerly Remix). [Oxygen](https://shopify.dev/docs/storefronts/headless/hydrogen/getting-started) is Shopify-hosted edge runtime for Hydrogen. Real signal: **Allbirds**, **Gymshark** are on Hydrogen in production. ([source](https://qualimero.com/en/blog/shopify-hydrogen))

Worth it when:
- Storefront performance is a competitive moat (LCP < 1.5 s, content-heavy).
- Brand needs design control beyond what Dawn + sections can do.
- You're building international with complex market routing.

Not worth it when:
- Merchant team can't maintain a React app.
- The savings from Online Store 2.0 + a paid theme (e.g., Impulse, Symmetry) get you 80 % of the way.

For The Operator's tenants: **default to OS 2.0 + Dawn**. Hydrogen is a manual upgrade path, not something we autoconfigure.

### Theme app extensions vs embed vs Script tag

| Mechanism | When | Status |
|---|---|---|
| **Theme App Extension (app blocks + embed blocks)** | OS 2.0 themes; modern apps. | Required for App Store apps with theme integration ([section 5.1.1](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)). |
| **ScriptTag API** | Vintage themes only. | Legacy. Auto-rejection for new App Store apps if used for theme insertion. |
| **Asset API writes** | Page builders, backup/restore, SEO tools only. | Tightly restricted. Casual theme modification will fail review. |

---

## Section 7: Operator meta-rules (extracted)

Imperative rules for the agent. These pin to the operator system prompt under "Shopify guardrails".

1. **NEVER materialize via REST when an equivalent GraphQL mutation exists.** REST became legacy 2024-10-01; new public apps using REST are auto-rejected. Use `productCreate`, `productSet`, `draftOrderCreate`, `fulfillmentCreateV2`, `webhookSubscriptionCreate`.

2. **BEFORE writing to a theme, check if a Theme App Extension can do it instead.** Direct Asset API writes are limited to page-builder / backup-restore / SEO categories. If we ever go App Store, theme injection via Asset API or Script tags is an auto-reject.

3. **ALWAYS verify webhook subscriptions via a daily health-check cron.** Shopify silently removes subscriptions after ~19 failures over ~48 h with no notification. Query the Admin API per-tenant daily, alert + re-register any missing topics. Especially critical for `app/uninstalled`, `orders/paid`, `shop/redact`.

4. **NEVER trust `orders/create` as a payment signal.** Use `orders/paid` for "send to Printful" / "ship it" decisions. `orders/create` can fire with `financial_status: pending` or `authorized` — we'll fulfill unpaid orders if we shortcut this.

5. **ALWAYS use `X-Shopify-Webhook-Id` for idempotency.** Persist processed IDs in our DB and short-circuit duplicates. Defends against retries AND replay attacks.

6. **BEFORE recommending a Plus upgrade to a merchant, run the pre-flight audit**: (a) inventory active Shopify Scripts, (b) check for `checkout.liquid` customizations, (c) list any ScriptTag-using apps, (d) audit GraphQL field usage for deprecated names (`grams`, `billingAddress`, checkout metafields, ShopifyQL `returns`). Each item is a migration task before they can upgrade cleanly.

7. **NEVER suggest the Wholesale Channel** — it is sunsetted in favor of native B2B (Companies, Catalogs, dedicated/blended B2B stores). Recommend B2B catalogs for any wholesale tenant on Plus.

8. **NEVER build new analytics on ShopifyQL.** The ShopifyQL Admin GraphQL API is sunsetting; use Admin GraphQL queries directly or surface data via Sidekick-AI / native reports. Field renames in 2026-04 (`returns` → `sales_reversals`) signal more breakage ahead.

9. **NEVER submit The Operator for App Store review with a custom-app's 108-scope set.** Strip to minimum necessary scopes per [section 3.2](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements), justify each scope in submission notes, and **separately request Protected Customer Data Level 1 + Level 2** if we touch customer name/email/phone/address.

10. **ALWAYS use Shopify Managed Installation with session tokens + token exchange.** Authorization code grant is the legacy path. Managed Installation auto-handles scope changes and is required for embedded-app session-token compliance ([section 1.1.1 / 2.2.3](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)). App Bridge must be **v4 CDN-loaded** (not bundled) per [section 2.2.3](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements).

11. **WHEN handling `shop/redact`**, treat it as a 48-hour-after-uninstall trigger to wipe all tenant data — including Printful queue state, Stripe customer references, our DB rows. We must respond 200 within 5 s; processing is async.

12. **NEVER bill merchants outside the Shopify Billing API for app fees.** Even though The Operator is BYOK and merchants pay us via Stripe today, the moment we list in the App Store, **app fees** (subscription tier upgrades, per-store charges) must route through Shopify Billing (section 1.2.1). Stripe is fine for the merchant's own customers; not fine for us charging the merchant for The Operator itself if we're App-Store-distributed.

---

## Sources

### Primary (shopify.dev)
- [App Store requirements (policy index)](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) · [Common rejections](https://shopify.dev/docs/apps/store/common-rejections) · [Review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process)
- [Privacy law compliance / GDPR webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) · [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)
- [HTTPS webhook delivery](https://shopify.dev/docs/apps/build/webhooks/subscribe/https) · [Troubleshooting webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks)
- [API limits](https://shopify.dev/docs/api/usage/limits) · [API versioning](https://shopify.dev/docs/api/usage/versioning) · [Changelog](https://shopify.dev/changelog)
- [Scripts deprecation](https://shopify.dev/changelog/shopify-scripts-will-be-deprecated-on-june-30-2026) · [checkout.liquid deprecation](https://shopify.dev/changelog/checkout-liquid-will-no-longer-work-for-in-checkout-pages-starting-august-13-2024)
- [Functions migration guide](https://shopify.dev/docs/apps/build/functions/migrating-from-shopify-scripts) · [About Functions](https://shopify.dev/docs/apps/build/functions)
- [Session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens) · [Offline access tokens (90-day)](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) · [ShopifyQL Admin API sunset](https://shopify.dev/changelog/shopifyql-admin-graphql-api-sunset) · [Hydrogen + Oxygen](https://shopify.dev/docs/storefronts/headless/hydrogen/getting-started)

### Help Center
- [Transitioning to Functions](https://help.shopify.com/en/manual/checkout-settings/script-editor/transitioning-to-functions) · [B2B catalogs](https://help.shopify.com/en/manual/b2b/catalogs) · [B2B by plan](https://help.shopify.com/en/manual/b2b/getting-started/plan-features)

### Community / real-world signal
- [Review-process horror stories](https://community.shopify.dev/t/warning-shopify-app-store-review-process/32259) · [orders/paid vs orders/updated](https://community.shopify.dev/t/orders-paid-vs-orders-updated/715) · [orders/paid not firing for GraphQL orderCreate](https://community.shopify.com/t/orders-paid-webhook-not-triggered-for-orders-created-via-graphql-ordercreate/556148) · [REST→GraphQL mandate](https://community.shopify.dev/t/from-april-2025-apps-must-use-graphql/6623) · [App Bridge v4 token issues](https://community.shopify.dev/t/app-bridge-v4-cdn-automatic-fetch-authorization-sends-expired-undefined-tokens-x-shopify-retry-invalid-session-request-doesnt-recover/32004)

### Vendor / DEV (corroboration)
- [ShopHooks: silent webhook removal](https://shophooks.dev/blog/shopify-webhook-silent-failure) · [Hookdeck: Shopify webhooks guide](https://hookdeck.com/webhooks/platforms/definitive-guide-shopify-webhooks-https-hookdeck) · [DEV: HMAC failure modes](https://dev.to/prateek32177/why-shopify-webhook-hmac-verification-keeps-failing-33ch) · [Gadget: passing review first time](https://gadget.dev/blog/how-to-pass-the-shopify-app-store-review-the-first-time-part-1-the-technical-bit) · [Revize: Advanced→Plus playbook](https://www.revize.app/blog/shopify-advanced-to-plus-2026-migration-playbook) · [ShopXCommerce: Plus pricing 2026](https://shopxcommerce.com/blogs/all/shopify-plus-pricing-explained-costs-plans-hidden-fees-2026) · [LetsTalkShop: GraphQL limits 2026](https://www.letstalkshop.com/blog/shopify-admin-graphql-rate-limits-2026)

### Shopify-owned editorial
- [Shopify Engineering: Webhook best practices](https://shopify.engineering/17488672-webhook-best-practices) · [Plus pricing page](https://www.shopify.com/plus/pricing) · [BFS 2025 updates](https://www.shopify.com/partners/blog/built-for-shopify-updates)
