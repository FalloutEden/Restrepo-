# Trust — The Operator by Black Vault

*Draft for `/trust`. Last updated 2026-05-14.*

Single-founder SaaS. Security decisions made by one former Information System Security Officer. No marketing team wrote this page — you are reading what we actually do and what we don't.

## Where your secrets live

Your third-party API keys (Anthropic, OpenAI, Shopify Admin, Printful, CJ, Klaviyo, Stripe restricted) are stored in Postgres, encrypted at the column level with **AES-256-GCM** — unique 96-bit IV per row. The master key (`TENANCY_MASTER_KEY`) is a 32-byte random value held only as a Vercel runtime environment variable. Not in source control, not in logs, not visible to the founder via any normal application path.

The database is also encrypted at rest by the Postgres provider, so a stolen disk image yields ciphertext on ciphertext.

Plaintext keys exist for two reasons only: (1) we decrypt them just-in-time in a serverless function to make an API call on your behalf — the decrypted value lives in that function's memory for the request duration only; (2) you can reveal a key in the dashboard, which returns it once over TLS. We log the reveal event, never the key value.

Honest limitation: today a single master key protects every tenant. We are migrating to **envelope encryption** (per-tenant data keys wrapped by a KMS-held key) this quarter so the blast radius of any compromise is one tenant, not all. We will note here when it ships.

## What we collect

We collect the minimum needed to run your account:

- **Your email and a bcrypt-hashed password.** Email is plaintext (necessary to send you receipts and incident notices). Password is hashed with bcrypt cost factor 12; we cannot recover it for you.
- **Your billing relationship via Stripe.** Stripe holds your card number, billing address, and tax ID. We hold only a Stripe `customer_id` and a subscription status. We never see your card.
- **The third-party API keys you give us.** Encrypted as described above.
- **Your Shopify admin token, if you connect Shopify.** This is what lets the Operator read your products and customer data and write new products on your behalf. The token's scope is restricted to what you authorize during OAuth; we do not request scopes we do not use. The full list of requested scopes is shown to you at connect time and recorded in `docs/shopify-scopes.md` in our repo.

That is it. We do not run analytics on your shop's customer data. We do not train models on your conversations.

## Who can read your data

One person: the founder. No contractors, no offshored support, no SaaS analytics vendors with admin reach into our DB. When you email support, the founder reads it.

The founder uses MFA on the admin account (TOTP today, hardware key planned). When we hire, we publish a personnel-change note in the changelog and update this section before granting access. We will never quietly expand the access list.

## Where your data physically lives

- **Application:** Vercel global edge network ([Vercel SOC 2 Type 2 + ISO 27001:2013](https://vercel.com/security)).
- **Database:** US-East region. EU residency is on the roadmap once we have a paying EU customer who requires it.
- **Backups:** Point-in-time recovery via our Postgres provider, 7-day window today, 30-day window once we move off the free tier.

## How traffic is protected

All traffic to The Operator terminates at Vercel Edge with TLS 1.2 or higher (HSTS enabled). Outbound calls to Anthropic, OpenAI, Stripe, Shopify, and Printful are HTTPS, using each vendor's published cert pins via the respective SDK.

## Compliance posture — honest current state

**What we have:**

- AES-256-GCM encryption of all tenant secrets at rest, unique IV per row.
- TLS 1.2+ for all transport, HSTS enabled.
- Hashed passwords (bcrypt cost 12).
- A documented threat model (STRIDE), revised quarterly.
- A documented control mapping to NIST 800-53 rev 5, with explicit gaps.
- A published security contact (`security@blackvault.studio`) and a [`/.well-known/security.txt`](/.well-known/security.txt).

**What we do not have:**

- We do not hold a SOC 2 attestation. We can supply the AICPA Trust Service Criteria gap analysis on request.
- We do not hold ISO 27001 certification.
- We are not HIPAA compliant. We will not sign a Business Associate Agreement. Do not put PHI into The Operator.
- We are not PCI-DSS certified — but we never see your card. Stripe is PCI Service Provider Level 1 and they handle the card data; we hold only a customer reference.
- We do not use FIPS 140-3 validated cryptographic modules. We use FIPS-approved *algorithms* (AES-256-GCM) on standard Node.js. If you need a FIPS-validated stack for federal data, we are not the right vendor today.

We will not buy a SOC 2 logo without doing the work behind it. Once the gap-closure list ships (envelope encryption, vault-read audit logs, MFA defaults, restore drills), we will move toward a SOC 2 Type II with a real auditor. We will publish the attestation date here, not a vendor badge.

## If a key is compromised — rotation playbook

If you suspect **your** key (e.g. your Anthropic key) is compromised:

1. Rotate the key at the upstream vendor (Anthropic, Shopify Partners, Stripe). This revokes the old key immediately.
2. Update the key in The Operator dashboard → Settings → Secrets.
3. We log the update. Old ciphertext is overwritten; no historical versions retained.
4. Email `security@blackvault.studio` with the timestamp. We pull the platform's last-used audit trail so you can correlate with vendor-side logs.

If **our** master key is compromised (e.g. a Vercel advisory about env-var exposure):

1. Rotate `TENANCY_MASTER_KEY` to a new 32-byte random value.
2. Re-encrypt every tenant secret in one transactional script. Dry-run script in `scripts/rotate-master-key.ts`.
3. Email every tenant within 24 hours: what, when, what we did, what you should do (rotate upstream keys as a precaution).
4. File a post-mortem on `/trust/incidents` within 7 days.

We will not lie about an incident. We will not delay disclosure beyond what counsel says is required for an active investigation. Default posture: full disclosure within 72 hours, matching the [GDPR Art. 33 window](https://gdpr-info.eu/art-33-gdpr/).

## Subprocessors

These vendors have access to some portion of platform data. Each is a contractually-bound data subprocessor.

| Subprocessor | What they process | Where they sit | Compliance reference |
|---|---|---|---|
| Vercel | Application hosting, edge cache | US (global edge) | [Vercel Security](https://vercel.com/security) — SOC 2 Type 2, ISO 27001:2013, GDPR DPA |
| Anthropic | Model inference on chat turns | US | [Anthropic Trust Center](https://trust.anthropic.com/) — SOC 2 Type 2, zero-retention available |
| OpenAI | Image generation, occasional model inference | US | [OpenAI Security](https://openai.com/security/) — SOC 2 Type 2 |
| Stripe | Billing, customer card data | US, global | [Stripe Security](https://docs.stripe.com/security) — PCI DSS Level 1, SOC 1, SOC 2 Type II |
| Shopify | Tenant-side commerce data (via tenant's own admin token) | Global | [Shopify Trust](https://www.shopify.com/security) — SOC 2 Type II, ISO 27001, PCI DSS Level 1 |
| Printful | Fulfilment of tenant orders | US, EU | [Printful Security](https://www.printful.com/policies/security) — GDPR, ISO 27001 in progress |
| Resend | Transactional email | US | [Resend Security](https://resend.com/security) — SOC 2 Type II |
| Postgres provider | Tenant DB | US-East | Provider's own SOC 2 / ISO attestation, linked on signup |

30 days' notice via email and a banner here before we add or replace a subprocessor. If you object to a new subprocessor, you may terminate with a pro-rata refund.

## Logging and audit

We log: auth events, billing-state changes, vault-write events, founder-admin logins, destructive tool calls (product delete, order refund). We do **not** log: plaintext secret values, or any operator-to-LLM message body containing a tenant key.

Honest gap: today logs land in Vercel runtime logs (7-day retention on current plan). A 1-year append-only sink ships Q3 2026. Until then, audit requests beyond 7 days may come up empty. This is the top remediation after MFA.

## Tenant isolation

Every tenant row carries a `tenant_id`. Every query is scoped to the session's tenant. Postgres Row-Level Security is being added as a second wall this quarter — once shipped, even a missing `WHERE` clause in our code cannot return another tenant's data, because the DB will refuse.

A CI test in `tests/security/cross-tenant.test.ts` attempts cross-tenant access via the API and asserts denial. It runs on every deploy.

## What we do not do

Things you might assume we do, that we don't:

- We do not train models on your data, conversations, or customer data.
- We do not sell, share, or transmit data to any third party outside the subprocessor list above.
- We do not run third-party analytics scripts (no Segment, Mixpanel, FullStory). Marketing site uses [Plausible](https://plausible.io/) (cookieless); authenticated app uses no analytics.
- We do not phone home from your shop. Our integration calls Shopify with your token; no storefront code injection.
- We do not have a support team that can read your data. Support is the founder.

## How to contact security

`security@blackvault.studio` — PGP key at [/.well-known/security.txt](/.well-known/security.txt). We acknowledge security reports within 24 hours and aim for triage within 72 hours. There is no bug bounty yet; we will reward serious findings out of pocket and credit you on this page (with your permission).

## Changelog

Dated changes appear at `/trust/changelog`:

- 2026-05-14 — initial publication, paired with internal threat model and NIST 800-53 gap analysis.
- *(future)* MFA shipped, vault-read audit log shipped, envelope encryption shipped, RLS shipped, first restore drill completed.

If something on this page is wrong, tell us. We would rather be corrected than confidently inaccurate.
