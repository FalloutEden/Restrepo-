# Shopify platform traps — operator hard rules

Distilled from Shopify Partners documentation, shopify.dev/changelog,
shopify.community + reddit horror stories, and the App Store rejection
catalog. Full research:
`.openclaw/research/shopify-plus-and-partners-deep-cuts-2026-05-14.md`.

## Rule 1 — REST API is soft-killed for new public-app submissions (2025-04-01)

The Shopify Admin REST API is legacy as of 2024-10 and **banned for
new public-app submissions as of 2025-04-01**. Custom-app distribution
(what BV uses today) is unaffected, but if we ever list The Operator
publicly, every REST call has to become GraphQL.

**Fires when:** the operator authors any new Shopify API call OR
plans to list a tenant's app in the Shopify App Store.
**Do:** use GraphQL Admin API for new code. Don't add new REST calls.
Track existing REST call sites for eventual migration.

## Rule 2 — Webhook retry behavior: assume 19 retries / 48 hours

Shopify's own troubleshooting page claims 8 retries / 4 hours.
Community vendors (ShopHooks, EventDock, Hookdeck) consistently
report 19 retries / ~48 hours. Operator experience matches 19/48h.

**Fires when:** designing a webhook handler.
**Do:** plan for at-most-once-with-aggressive-retry semantics. The
HMAC handler must be idempotent — a retry of a successfully-processed
webhook must NOT duplicate the side effect (don't double-create the
fulfillment order, don't double-charge, etc.). Idempotency key =
`X-Shopify-Webhook-Id` header.

## Rule 3 — App Store review SLA is broken in 2026

Shopify's advertised SLA: 8-10 business days. Forum threads from
May 2026 show real review times of 30-60+ days.

**Fires when:** planning the App Store listing path for The Operator.
**Do:** budget the calendar around 90 days from submission to live.
Do NOT promise tenants a public-listing-by-X date based on Shopify's
SLA — quote the realistic 90-day timeline.

## Rule 4 — Mandatory GDPR webhooks must be live before listing

Every public Shopify app must implement three GDPR webhooks:
- `customers/data_request` — within 30 days, return all customer data
  the app stores
- `customers/redact` — within 30 days, delete the customer's data
- `shop/redact` — within 48 hours of uninstall, delete the shop's data

Missing/broken handlers = automatic rejection AND ongoing compliance
risk.

**Fires when:** preparing for public listing.
**Do:** implement all three before submission, with test fixtures
that prove each returns the right payload within the SLA. Tracked
TODO: we don't have these yet.

## Rule 5 — 108-scope custom-app footprint won't survive public review

Section 3.2.x of the Shopify Partner Program Agreement requires
justification for each sensitive scope. The operator currently uses
~108 scopes including:
- `read_all_orders` (requires separate Shopify approval)
- `write_payment_mandate` (high-trust)
- Anything reading PII = Protected Customer Data Level 1+2 approval

**Fires when:** planning public listing OR adding a new scope.
**Do:** for public listing, audit every scope. Drop any not actively
used. Justify each remaining one in writing. Apply for Protected
Customer Data approval separately. For custom-app (current state):
no immediate action needed, but the scope sprawl is a future blocker.

## Rule 6 — Expiring offline tokens land Dec 2025

Shopify introduced 90-day refresh cycles for offline access tokens
(used to be permanent). Tokens issued before the cutoff stay valid;
new tokens must be refreshed every 90 days.

**Fires when:** the operator authenticates a new tenant store after
Dec 2025.
**Do:** implement the OAuth refresh flow. A tenant's store will
silently disconnect on day 91 without it. Tracked: our current OAuth
code probably doesn't handle refresh — verify.

## Rule 7 — App fees billing must use Shopify Billing API if publicly listed

Section 1.2.1 of the Partner Program Agreement requires that any
fees charged TO MERCHANTS for the app's functionality go through the
Shopify Billing API (Shopify takes its 15% cut).

**Fires when:** planning public listing of The Operator.
**Do:** the SaaS subscription fees (what BV/tenant pays us) would
need to move from Stripe to Shopify Billing if we list. BYOK
customers' OWN payment processing (Stripe Checkout on their
storefront) is unaffected — that's the customer paying the merchant,
not the merchant paying us.

## Rule 8 — Theme app extensions ≠ regular embeds

Online Store 2.0 introduced sections + blocks via theme app
extensions. The operator's installer must handle both:
- Theme app extensions (TAEs): merchant enables in theme customizer,
  no code injection
- Legacy script tag embeds: deprecated for new apps

**Fires when:** the operator suggests adding a script tag to a tenant
theme.
**Do:** prefer TAE. Script tags only as a fallback with explicit
deprecation acknowledgment. Tracked: our content_studio + analytics
embed paths probably use script tags — verify + plan migration.

## Rule 9 — Shopify Scripts are being replaced by Functions

Shopify Scripts (Ruby) are deprecated. Shopify Functions (Wasm)
replaced them for discounts, cart transforms, payment customization,
delivery customization, and checkout extensibility.

**Fires when:** a tenant asks for discount logic, cart rules, or
checkout customization.
**Do:** use Functions for new work. Tenants who have legacy Scripts
will need migration; flag this at intake. Functions are required for
all new Shopify Plus stores.

## Rule 10 — Checkout extensibility replaced the script editor

The legacy "Checkout.liquid" editor (Plus-only) is end-of-life
August 28, 2024 for one-page checkout, August 13, 2025 for thank-you
and order-status pages.

**Fires when:** tenant asks to customize checkout.
**Do:** use Checkout UI Extensions exclusively. Refuse to edit
checkout.liquid — it's about to break.

## Rule 11 — Shopify Plus features we should know about

If a tenant is on Plus (or migrating to):
- **Flow** — Shopify-native automation; potentially replaces some of
  our crons for the tenant. Don't double-trigger.
- **Launchpad** — scheduled campaign launches; useful for
  product-drop choreography.
- **B2B Catalogs** — separate catalogs per customer; tenant might
  need this if they sell wholesale + DTC from the same store.
- **Shopify Functions for B2B** — checkout rules that vary by
  customer segment.
- **ShopifyQL** — Plus-only analytics query language; better than
  REST for sales reporting.

**Fires when:** a tenant mentions Plus pricing, wholesale, or
multi-storefront.
**Do:** ask which of the above they need. Don't auto-rebuild
infrastructure if Shopify-native handles it.

## Rule 12 — Webhook HMAC verification: edge cases

Standard HMAC SHA256 verification works for 99% of webhooks. Edge
cases that bite:
- Body must be the RAW bytes, not parsed JSON (parsing
  reformats whitespace, breaks the signature)
- Header is `X-Shopify-Hmac-Sha256` (case matters in some frameworks)
- Compare with `crypto.timingSafeEqual` not `==` (timing attacks)

**Fires when:** authoring any webhook handler.
**Do:** read the raw body, hash with the webhook secret, compare
timing-safely. Our existing `printful/order-status` webhook handler
is the reference pattern.
