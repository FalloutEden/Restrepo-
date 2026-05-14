# Security Posture: Control Mapping (Current State + Gap)

**Date:** 2026-05-14
**Author:** CEREBRO research brief
**Subject:** The Operator by Black Vault — BYOK SaaS for Shopify+Printful brand automation
**Frameworks referenced:** NIST SP 800-53 rev 5.1, AICPA SOC 2 Trust Service Criteria (2017, revised points of focus 2022), GDPR Articles 28 and 32

## Scope

Single-founder BYOK SaaS. Tenants supply third-party API credentials (Anthropic, OpenAI, Shopify Admin, Printful, CJ, Klaviyo) encrypted at rest with AES-256-GCM under a 32-byte master key (`TENANCY_MASTER_KEY`). Stripe holds customer billing data. **No current attestation** (no SOC 2, no ISO 27001, no HIPAA BAA). This maps what we do to formal controls; where a control is not implemented the row is marked **GAP**.

## NIST SP 800-53 rev 5 control mapping

| Control ID | Control name | Platform implementation today | Gap | Remediation |
|---|---|---|---|---|
| **AC-2** | Account Management | Tenants via Stripe-gated signup; one founder admin; lifecycle in `lib/auth/`. No taxonomy, no review cadence, no termination playbook. | GAP: no review frequency; no shared-account rotation; founder admin unmonitored. | Document account types. Quarterly review in `docs/security/account-review.md`. Founder-login alerts to Slack/email. |
| **AC-3** | Access Enforcement | Tenant isolation enforced at query layer (every DB query scoped to `tenant_id` derived from session). Bearer-token auth on API routes. RLS not enabled at Postgres layer. | GAP: Authorization is enforced in app code only — a single ORM bug or missing `WHERE tenant_id = ?` clause exposes cross-tenant data. No defense in depth. | Enable Postgres Row-Level Security policies as a second wall. Add an integration test that attempts cross-tenant reads and asserts denial. |
| **AC-6** | Least Privilege | Tenants only see their own resources. Founder admin has full DB and Vercel access — no separation between admin roles. Anthropic/OpenAI keys are *tenant-supplied* (BYOK), so the platform itself does not hold a "god" key for those vendors. | GAP: Founder is single point of compromise. No break-glass or just-in-time elevation. | Split founder identity into `founder-daily` (no prod DB write) and `founder-break-glass` (audited, MFA-required, time-boxed). Document elevation procedure. |
| **AU-2** | Event Logging | App emits structured logs for auth events, Stripe webhooks, and operator tool calls. Logs go to Vercel runtime logs (7-day retention on hobby plan). | GAP: No defined "auditable event" list. Secret-vault reads are **not** logged. No retention beyond Vercel's default. | Define audit-event taxonomy: vault-read, vault-write, founder-admin-login, tenant-key-rotation, billing-state-change, destructive-tool-call. Ship logs to a 1-year-retention sink (e.g., Axiom, Logtail). |
| **AU-3** | Content of Audit Records | Current logs include timestamp, route, status. Often missing: actor identity (tenant\_id), source IP, outcome severity. | GAP: Logs do not consistently capture all six AU-3 required fields (what, when, where, source, outcome, who). | Add a `logAuditEvent({ type, actor, tenant_id, source_ip, outcome, target_resource })` helper and call it at every auditable boundary. |
| **AU-12** | Audit Record Generation | Generation is application-level only. No tamper-evident store. Vercel logs are mutable from the dashboard. | GAP: An attacker with Vercel console access could rotate logs. No write-once destination. | Mirror security-critical events (vault reads, admin logins) to an append-only sink (e.g., a logging vendor with WORM mode, or daily-rolled S3 with Object Lock). |
| **IA-2** | Identification and Authentication (Organizational Users) | Tenants authenticate via email + password (bcrypt). Founder uses the same flow. No MFA. | GAP: AC IA-2(1) requires MFA for privileged accounts; this is the single biggest authn deficiency. | Ship TOTP MFA for the founder admin account **this week**. Ship optional TOTP for tenants within 30 days. WebAuthn/passkeys within 90 days. |
| **IA-5** | Authenticator Management | Passwords hashed with bcrypt (cost factor 12). No password-rotation cadence. No check against breached-password corpora. No documented credential-revocation playbook. | GAP: No HIBP-style breach check; no defined revocation SLO. | Integrate Have-I-Been-Pwned k-anonymity API at signup and password change. Document revocation SLO: 1 hour for confirmed compromise. |
| **SC-8** | Transmission Confidentiality and Integrity | All traffic terminates at Vercel Edge with TLS 1.2+ (HSTS enabled via `next.config.js`). Outbound to Anthropic/OpenAI/Stripe/Shopify/Printful is HTTPS. | Largely **met**. No internal east-west traffic to worry about (serverless). | Add HSTS preload submission. Document TLS version floor in `/trust`. |
| **SC-12** | Cryptographic Key Establishment and Management | `TENANCY_MASTER_KEY` is a 32-byte key stored in Vercel environment variables. No rotation cadence. No key-derivation hierarchy (one key encrypts all tenant rows). No HSM. | GAP: Master key is a single blast-radius. No rotation procedure means a compromise = total exposure. | Implement envelope encryption: per-tenant data-encryption-keys (DEKs) wrapped by the master KEK. Document quarterly KEK rotation. Long-term: migrate KEK to a managed KMS (AWS KMS, GCP KMS). |
| **SC-13** | Cryptographic Protection | AES-256-GCM via Node `crypto` (FIPS algorithm, not a FIPS-validated module on Vercel). TLS via Vercel. | GAP: FIPS-approved algorithms, not validated modules. Fine for commercial; not for federal. | State in `/trust`: "AES-256-GCM via Node.js crypto; not FIPS 140-3 validated." Don't sell federal without a FIPS path. |
| **SC-28** | Protection of Information at Rest | Tenant secrets encrypted at column level (AES-256-GCM, unique IV per row). Postgres data files encrypted at rest by the database provider (e.g., Neon, Supabase). Stripe customer data never lives in our DB — Stripe holds it. | Mostly **met** for secrets. **Gap** for non-secret PII: tenant emails, shop names, etc. are plaintext in DB. | Document the encryption boundary in `/trust`. Tenant emails stay plaintext (operational necessity); document this as accepted residual risk. |
| **SI-4** | System Monitoring | Vercel runtime metrics + uptime monitoring via the platform's `health-monitor` cron. No anomaly detection. No alerting on unusual vault-read patterns or login geolocation anomalies. | GAP: We can tell *if* the system is down, not *whether it's being attacked*. | Stand up rate-based alerts: >10 failed logins/min from one IP, >50 vault reads/min from one tenant, founder-admin login from a new ASN. |
| **SI-10** | Information Input Validation | Zod schemas on every API route. SQL injection mitigated by parameterized queries (Drizzle ORM). Prompt-injection mitigation on operator tool calls is partial — destructive tool calls have a confirm guard. | Mostly **met** for traditional injection. **Gap** for prompt injection of LLM tool calls. | Document the destructive-tool-call guard in `/trust` (it already exists — `operator/guards.ts`). Extend allow-list of tools the operator can call without confirmation. Never let the model produce raw shell or raw SQL. |
| **CP-9** | System Backup | Postgres provider does point-in-time recovery (7-day window on most providers' free tiers). No application-level backup. No tested restore procedure. | GAP: We rely on the DB vendor's backup with no independent copy and no documented RTO/RPO. | Document RPO (1 hour) and RTO (4 hours). Run a quarterly restore drill into a scratch DB. Snapshot encrypted exports to a second region monthly. |
| **CP-10** | System Recovery and Reconstitution | Vercel deployment is reproducible from `main` branch. Postgres restore is provider-dependent. No runbook for "platform is down — what does the founder do?" | GAP: No runbook. | Write `docs/security/recovery-runbook.md`: order-of-operations to rebuild from a clean Vercel project + a Postgres restore. Include who-to-call list (provider support emails). |

## SOC 2 Trust Service Criteria mapping

SOC 2 has five categories (Security mandatory; others elective). 61 criteria, ~300 points of focus, COSO-anchored. Source: [AICPA 2017 TSC](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022). The Operator would target **Security + Confidentiality + Availability** for a Type II (Privacy and Processing Integrity out of scope).

| TSC | Criterion summary | Platform implementation today | Gap |
|---|---|---|---|
| **CC1** (Control Environment) | Tone, structure, accountability | Single founder; no written code of conduct; no segregation of duties (impossible at n=1). | GAP — but typical for pre-seed SaaS. Document explicitly. |
| **CC2** (Communication and Information) | Internal/external comms about security | No public security contact; no incident-disclosure policy. | GAP. Add `security@blackvault.studio` + a `.well-known/security.txt`. |
| **CC3** (Risk Assessment) | Identify and analyze risks | No documented risk register. | GAP. This document IS the start of the risk register. |
| **CC4** (Monitoring Activities) | Continuous monitoring of controls | Health-monitor cron, incidents UI. No control-effectiveness review cadence. | GAP. Document a quarterly self-attestation. |
| **CC5–CC9** (Logical Access, Change Mgmt, Risk Mitigation) | Access, change, vulnerability mgmt | See NIST AC-2/AC-3/AC-6/CM-3 rows above. Vercel git-based deploys provide a change trail; no formal CAB. | Partial. Document deploy review (since founder is the reviewer, this is a single-signer process; acknowledge as residual risk). |
| **A1** (Availability) | System availability commitments | No SLA published. Vercel + provider uptime are inherited. | GAP. Either publish a target SLA (99.5% suggested for a single-founder SaaS) or explicitly state "no SLA, best-effort." |
| **C1** (Confidentiality) | Identifying and protecting confidential info | Tenant API keys are encrypted at column level. Customer Stripe data stays in Stripe. | Mostly met. Document the data taxonomy in `/trust`. |

## GDPR mapping

### Article 32 — Security of Processing
Names two explicit controls (pseudonymisation, encryption) + four capabilities (confidentiality, integrity, availability, resilience). Source: [GDPR Art. 32](https://gdpr-info.eu/art-32-gdpr/).

| GDPR 32 requirement | Platform implementation today | Gap |
|---|---|---|
| Pseudonymisation and encryption of personal data | Tenant secrets encrypted (AES-256-GCM). Tenant emails not pseudonymised. | Acceptable; pseudonymisation is one of several measures, not mandatory. |
| Ongoing confidentiality, integrity, availability, resilience | TLS + encryption-at-rest + Vercel infra. No documented resilience testing. | GAP — quarterly restore drill (see CP-9). |
| Ability to restore availability and access in a timely manner | Vendor PITR backups. No documented RTO. | GAP — see CP-9, CP-10. |
| Regular testing of effectiveness | No pen-test, no internal control review. | GAP — schedule an annual external pen-test (Cure53, Latacora, or a bug bounty via HackerOne are realistic options). |

### Article 28 — Processor obligations
The Operator is a **processor** for tenant data (merchants are controllers of their own customer PII pulled via Shopify admin token). Art. 28 requires a written DPA, sub-processor disclosure, and back-to-back obligations on sub-processors. Source: [GDPR Art. 28](https://gdpr-info.eu/art-28-gdpr/).

| GDPR 28 requirement | Platform implementation today | Gap |
|---|---|---|
| Written DPA with each controller | No DPA yet. | GAP — add a DPA as a clickwrap on tenant signup. Reuse a vetted template (e.g., the IAPP or SCC-aligned DPA). |
| Sub-processor disclosure with right to object | No public sub-processor list. | GAP — publish `/trust#subprocessors` with Vercel, Anthropic, OpenAI, Stripe, Shopify, Printful, Resend, and the chosen Postgres vendor. |
| Back-to-back obligations on sub-processors | We rely on each vendor's published DPA. | Mostly met (Vercel, Anthropic, OpenAI, Stripe all publish GDPR-compliant DPAs). Document the chain in the sub-processor list. |
| Liability for sub-processor failures | We remain liable. | Reflect this honestly in the DPA. No contractual cap below industry norms. |

## Prioritized remediation (top 10, ranked by risk-reduction-per-hour)

1. **Founder MFA** (IA-2). 30 min. Closes the highest-value attacker path.
2. **Audit log for vault reads** (AU-2/AU-3). 2 hrs. Without this we cannot detect or investigate compromise.
3. **Postgres RLS as defense in depth** (AC-3). 1 day. Kills the "missing WHERE clause" cross-tenant class.
4. **Subprocessor list + DPA clickwrap** (GDPR 28). 4 hrs. Required for EU sales.
5. **Envelope encryption with per-tenant DEKs** (SC-12). 2 days. Cuts master-key blast radius from "all tenants" to one.
6. **Quarterly restore drill** (CP-9). 2 hrs/qtr.
7. **Rate-based anomaly alerts** (SI-4). 1 day. Failed-login spikes, vault-read spikes, founder login from new ASN.
8. **Security contact + `.well-known/security.txt`** (CC2). 30 min.
9. **Documented master-key rotation procedure** (SC-12). 1 day. Drilled annually.
10. **Annual third-party pen-test** (GDPR 32). $4–8k post-revenue.

## Sources cited

- [NIST SP 800-53 rev 5 (catalog, official)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf)
- [AC-2 Account Management](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/)
- [AU-3 Content of Audit Records](https://csf.tools/reference/nist-sp-800-53/r5/au/au-3/)
- [IA-2 Identification and Authentication](https://csf.tools/reference/nist-sp-800-53/r5/ia/ia-2/)
- [IA-5 Authenticator Management](https://csf.tools/reference/nist-sp-800-53/r5/ia/ia-5/)
- [SC-8 Transmission Confidentiality and Integrity](https://csf.tools/reference/nist-sp-800-53/r5/sc/sc-8/)
- [SC-12 Cryptographic Key Establishment and Management](https://csf.tools/reference/nist-sp-800-53/r5/sc/sc-12/)
- [SC-28 Protection of Information at Rest](https://csf.tools/reference/nist-sp-800-53/r5/sc/sc-28/)
- [SI-4 System Monitoring](https://csf.tools/reference/nist-sp-800-53/r5/si/si-4/)
- [SI-10 Information Input Validation](https://csf.tools/reference/nist-sp-800-53/r5/si/si-10/)
- [CP-9 System Backup](https://csf.tools/reference/nist-sp-800-53/r5/cp/cp-9/)
- [CP-10 System Recovery and Reconstitution](https://csf.tools/reference/nist-sp-800-53/r5/cp/cp-10/)
- [AICPA 2017 Trust Services Criteria (revised 2022)](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022)
- [GDPR Article 28 — Processor](https://gdpr-info.eu/art-28-gdpr/)
- [GDPR Article 32 — Security of Processing](https://gdpr-info.eu/art-32-gdpr/)
