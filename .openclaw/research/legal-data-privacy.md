# US Data Privacy + PII Compliance Brief — Restrepo SaaS

**Scope:** multi-tenant SaaS storing merchant emails, encrypted API tokens (Shopify/Printful/Klaviyo), end-customer order data (names + shipping addresses), and operator chat logs. As of 2026-05-13, 19 US states have comprehensive privacy laws in force.

## 1. Quick-decision table — which laws apply at our current scale

| Law | Threshold | Catches us today? |
|---|---|---|
| CA CCPA/CPRA | $26.625M rev OR 100k CA consumers OR 50%+ data-sale rev | No (well under) |
| VA VCDPA | 100k VA residents OR 25k + 50% data-sale rev | No |
| CO CPA | 100k CO residents OR 25k + any data-sale rev | No |
| CT CTDPA | 100k CT residents OR 25k + 25% data-sale rev | No |
| UT UCPA | $25M rev AND 100k UT residents | No |
| **TX TDPSA** | Any business serving TX residents that isn't a "small business" per SBA | **Likely yes once we scale beyond SBA small-biz** |
| FL FDBR | $1B revenue + adtech criteria | No |
| IA / TN / MT / DE / NE / NH / NJ / MN / MD / IN / KY / RI / OR | Mostly 100k residents or 25k + data-sale rev | **No except RI (35k / 10k + 20% data-sale)** |

**Punchline:** at indie scale, only Texas reliably catches us. But we should design TO the highest bar (CA + CO) because crossing thresholds is a tripwire, not a remodel.

## 2. Universal privacy-policy must-haves

- Categories of PII collected (map to CCPA's 11 categories)
- Sources of collection (merchant signup, Shopify webhook, OAuth tokens)
- Purposes of use (per category)
- Categories of third parties we disclose to (Printful, Klaviyo, Anthropic, OpenAI, Vercel, AWS)
- Whether we "sell" or "share" PII (we don't — say so explicitly)
- Retention periods + criteria
- Consumer rights enumeration + how to exercise
- "Do Not Sell or Share My Info" link (CA, even if no sale, the link must be there OR explicit no-sale statement)
- Sensitive PII section + opt-out of secondary use
- Update date + 12-month refresh commitment
- Contact for privacy requests (dedicated email)

## 3. Data subject rights to wire up

Access, delete, correct, portability, opt-out of sale/share, opt-out of profiling/automated decisions, limit sensitive PII use. Verify identity before fulfilling. Respond within 45 days (CA/VA standard). Free for first request per 12 months.

## 4. Our role: controller vs processor

- **For merchant PII (their email, their tokens):** we are the **controller** — we decide the purpose.
- **For end-customer order PII (passing through from Shopify):** we are the **processor / service provider**. The merchant is the controller. We act on documented instructions only. This is the legally cheaper position — keep it that way.
- **For operator chat logs (we analyze + improve):** controller of merchant chat content; processor for any end-customer PII pasted in.

## 5. Tech controls (legally required vs nice-to-have)

Required: AES-256-GCM at rest (have it), TLS 1.2+ in transit, least-privilege access, audit logs, breach detection, secure deletion. Encryption gives us a **safe harbor** in most state breach laws — but only if the key wasn't also exfiltrated. Store keys in KMS/Vault, never in the same store as ciphertext.

## 6. Breach notification

CA + CO + FL + NY + WA: **30 days**. AL/AZ/IN/NM/OH/OR/RI/TN/VT: 45 days. CT/DE/LA/SD/TX: 60 days. Federal Trade Commission Safeguards Rule: 30 days for >500 records. EU GDPR: **72 hours** to supervisory authority. Stand up a breach-runbook now.

## 7. GDPR exposure

If any merchant's end-customer is in the EU and we process their order PII, **GDPR Article 3(2)(a) catches us** (offering goods/services to EU data subjects via the merchant). Mitigations: (a) DPA with every merchant naming us as processor with EU SCCs attached, (b) appoint an EU representative once volume justifies (Article 27), (c) sub-processor list public, (d) 72-hour breach notice to controller (the merchant), not directly to DPAs.

## 8. DPA / contract requirements

- **With merchants:** they sign our ToS + DPA at signup. DPA states: scope, duration, nature/purpose, data categories, controller-instructions-only, confidentiality, security measures, subprocessor list + flow-down, audit rights, breach notice timing, deletion-on-termination. CCPA also requires the contract to prohibit selling/retaining/using PII outside the service.
- **With subprocessors (Anthropic, OpenAI, Printful, Klaviyo, Shopify, Vercel, AWS):** verify each has a DPA + SCCs; keep a register.
- **With end-customers:** no direct contract — the merchant's storefront privacy policy governs. Our DPA backs the merchant.

## 9. One-year compliance roadmap (legally required → nice-to-have)

**Month 1-2 (required):**
1. Public privacy policy at /privacy covering section 2 list
2. DPA template + auto-accept flow at merchant signup
3. Subprocessor list page (public)
4. privacy@ email + intake form for DSARs
5. Breach runbook (who, what, timeline, draft notice letters)
6. Verify KMS separation of keys from ciphertext

**Month 3-6 (required at scale):**
7. DSAR fulfillment automation (access + delete endpoints in operator)
8. Cookie banner only if we add analytics that drop non-essential cookies
9. Data retention policy + automated purge job
10. Vendor DPAs collected + filed
11. EU representative if EU end-customer volume grows (Article 27)

**Month 7-12 (defensive, not strictly required):**
12. SOC 2 Type 1 if enterprise merchants ask
13. Annual privacy-policy refresh + DPA version bump
14. Penetration test
15. Privacy training log

**Skip for now:** ISO 27001, SOC 2 Type 2, HIPAA BAA (we don't touch PHI), Privacy Shield successor (DPF) — only relevant if we want EU→US data flow self-cert.

## Sources

- [IAPP US State Privacy Legislation Tracker](https://iapp.org/resources/article/us-state-privacy-legislation-tracker)
- [MultiState: 20 State Privacy Laws in Effect in 2026](https://www.multistate.us/insider/2026/2/4/all-of-the-comprehensive-privacy-laws-that-take-effect-in-2026)
- [Husch Blackwell 2025 State Privacy Law Tracker](https://www.huschblackwell.com/2025-state-privacy-law-tracker)
- [California AG — CCPA](https://oag.ca.gov/privacy/ccpa)
- [CPPA — Updated Monetary Thresholds](https://cppa.ca.gov/regulations/cpi_adjustment.html)
- [Privacy Rights Clearinghouse — Breach Notification 50-State Survey 2026](https://privacyrights.org/resources-tools/reports/data-breach-notification-laws-50-state-survey-2026-edition)
- [IAPP — Territorial Scope of the GDPR from a US Perspective](https://iapp.org/news/a/territorial-scope-of-the-gdpr-from-a-us-perspective)
- [Privacy World — Bare Minimum Contracting Requirements Under US Privacy Laws](https://www.privacyworld.blog/2023/03/the-bare-minimum-and-more-complying-with-the-contracting-requirements-under-u-s-privacy-laws/)
- [Foley & Lardner — State Data Breach Notification Laws](https://www.foley.com/insights/publications/2025/10/state-data-breach-notification-laws/)
