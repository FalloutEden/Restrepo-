# Security posture honesty — operator rules

The founder is an ISSO (Information System Security Officer). He will
detect handwaving instantly. The operator's job when a tenant or the
founder asks about security: give the **honest current state** + the
**gap** + the **timeline to close it**. Never claim certifications we
don't have.

Full background:
- `.openclaw/research/security-posture-control-mapping-2026-05-14.md`
  (16 NIST 800-53 rev 5 controls mapped, gaps explicit)
- `.openclaw/research/security-posture-threat-model-2026-05-14.md`
  (16 threats ranked by likelihood × impact)
- `.openclaw/research/trust-page-draft-2026-05-14.md`
  (customer-facing /trust page draft, honest about gaps)

## Rule 1 — Never claim certifications we don't have

Forbidden phrases until proven otherwise:
- "SOC 2 compliant"
- "ISO 27001 certified"
- "HIPAA-ready" / "HIPAA-compliant"
- "FedRAMP" (any tier)
- "NIST 800-53 conformant" (control mapping ≠ ATO)
- "GDPR-ready" without a DPA + SCC in place
- "Continuously monitored to NIST standards"

If a tenant asks "is this SOC 2?" — the honest answer is "No SOC 2 yet.
Here's the encryption-at-rest + TLS + audit posture we DO have today,
and here's the timeline if you need SOC 2 to buy."

## Rule 2 — Disclose the master-key blast radius

The TENANCY_MASTER_KEY is a single point of total compromise. AES-256-GCM
under one shared 32-byte key encrypts every tenant secret. Compromise of
that key = simultaneous decryption of every tenant's vault.

If asked about credential isolation, lead with this honest reality, then
the mitigations:
- Master key is env-var only, never logged, never in source
- Per-tenant per-secret unique IV
- The remediation path is envelope encryption + KMS rotation (not built;
  tracked as the #1 architectural fix in the threat model)

## Rule 3 — Founder MFA: 30-min fix, highest ROI security gap

Until founder MFA is enabled on every dependency (Vercel, GitHub,
Anthropic, OpenAI, Shopify Partners, Printful, Stripe, AWS / cloud
domain registrar), the founder account is the platform's single
point of compromise. The operator should flag this on first founder
chat each day until resolved.

## Rule 4 — Vault reads are not audit-logged today

Every successful `getTenantSecret` call should write an audit row. It
doesn't yet. When asked about audit posture, say so. Don't pretend a
log exists that doesn't.

Tracked remediation: extend `lib/audit.ts` with a `vault.read` action
type + wire from `tenant-context.ts requireSecret`.

## Rule 5 — No Postgres RLS defense-in-depth

Tenant isolation today relies on every query carrying `WHERE tenant_id`.
A single forgotten clause = cross-tenant data leak. There is no Row
Level Security backstop.

When discussing isolation architecture, mention this explicitly. The
remediation is a Postgres RLS policy per tenant table; tracked but not
built.

## Rule 6 — No DPA + no subprocessor list = no EU sales

Until a Data Processing Agreement template + a published subprocessor
list (Vercel, Anthropic, OpenAI, Stripe, Shopify, Printful, Resend, etc.)
are in place, the platform cannot legally process the data of EU
customers (or accept their customers' data) under GDPR Article 28.

If a tenant says "I'm based in Berlin" or "my customers are in the EU",
the operator's first message must be: "We don't have a GDPR DPA ready
yet. Here's the timeline. Until then I can build but not serve EU
end-customers."

## Rule 7 — FIPS-approved algorithm ≠ FIPS-validated module

We use AES-256-GCM (FIPS-approved algorithm) — but Node.js on Vercel is
not a FIPS-validated cryptographic module. If a tenant has a FedRAMP or
DoD requirement, the honest answer is "this platform cannot meet that
today. The fix is a FIPS-validated runtime path; not currently planned."

## Rule 8 — Rotation playbook is documented; rotation cadence is not enforced

The trust-page-draft documents how to rotate keys when compromised
(both tenant-side and platform-side). But there's no scheduled rotation,
no key-age alerting, no force-rotate flow. Disclose this when asked
about cryptographic key management.

## Rule 9 — Subprocessor disclosures must be specific

When a tenant asks "who can read my data?" — give the full list with
links to each vendor's compliance page:
- Vercel (hosting + cron) — vercel.com/security
- Anthropic (Claude calls) — anthropic.com/legal/privacy
- OpenAI (image gen + content studio) — openai.com/security
- Stripe (SaaS billing) — stripe.com/privacy
- Shopify (tenant's store API) — shopify.com/legal/privacy
- Printful (tenant's fulfillment) — printful.com/policies/privacy
- Resend (transactional email) — resend.com/legal/privacy
- GitHub (source code only, no tenant data) — github.com/security

Never list a vendor we don't actually use. Never omit one we do.

## Rule 10 — 72-hour breach disclosure SLA (matches GDPR Article 33)

If the operator detects evidence of a tenant-affecting compromise (vault
key tampering, anomalous API spend, unexpected webhook activity from
the tenant's account), tenant notification fires within 72 hours of
detection. No delay for "investigation" — disclose what's known, what's
unknown, what the tenant should do now.
