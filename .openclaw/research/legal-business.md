# Indie SaaS Legal + Tax Brief ($99/mo + $499 setup, US, year 1)

Compiled 2026-05-13. Sources: Stripe Atlas, Anrok, TaxJar, Avalara, IRS Pub 3402, salestaxinstitute.com, Numeral, TermsFeed, Insureon, SeedPod Cyber.

## 1. Entity — Recommendation: Single-member LLC, elect S-Corp at ~$60k net profit
- Year-1 (0-50k MRR / <~$80k net): plain LLC, default disregarded-entity tax. Cost: $50-500 filing + ~$300/yr registered agent. Schedule C, full 15.3% SE tax on profit. No payroll headache.
- Upgrade trigger: when net profit (after a "reasonable salary" to yourself) clears ~$40-50k — file Form 2553 to elect S-Corp. Annual compliance jumps to $1.5-3k (payroll, separate return) but saves ~$5-8k/yr in SE tax at $100k profit.
- Skip C-Corp unless raising priced equity. Double taxation + Delaware franchise tax not worth it pre-seed.

## 2. ToS clause checklist
- Liability cap = 12 months of fees paid (industry standard).
- Exclusion of indirect/consequential/lost-profits damages.
- Carve-outs: confidentiality breach, IP indemnity, gross negligence, fraud (cannot be capped in most states).
- IP-indemnity from you (the vendor) for infringement claims; user-indemnity for misuse of service.
- AS-IS / no implied warranties (merchantability, fitness).
- Acceptable Use Policy referenced by URL (kills bad-actor accounts).
- Auto-renewal language compliant with CA ARL + FTC click-to-cancel: clear pricing, renewal reminders, same-channel cancellation.
- Governing law + venue (your state), mandatory arbitration + class-action waiver.
- Service Level: "commercially reasonable efforts" — DO NOT promise uptime % unless you'll honor it.
- Right to modify ToS with notice; data-export on termination (30 days).
- DPA / sub-processor list link if you touch B2B EU/UK data.

## 3. Refund + chargeback playbook
- No US state mandates SaaS refunds. CA/NY ARL only mandates *easy cancellation* + renewal disclosure, not refunds. Policy: "No refunds on monthly fees; pro-rata refund of $499 setup if cancelled within 7 days and no implementation work begun." Publish at checkout + ToS.
- Stripe chargeback ops: 7-day response window (Visa cut from 18 to 9 days July 2025). Stripe charges $15 dispute fee + $15 if you contest and lose. Evidence kit: signed ToS click-acceptance log, login timestamps, usage logs, email thread, refund-policy acknowledgment, delivery proof of setup deliverable. Win rate <40% industry-wide — don't fight <$200 disputes; refund and block.
- Stripe is the *processor*, not your shield: card-network rules bind you, Stripe just relays evidence.

## 4. SaaS sales tax — decision matrix (collect when economic nexus crossed)

| State | SaaS taxable? | Econ. nexus threshold |
|---|---|---|
| New York | Yes | $500k AND 100 txns |
| Texas | Yes (80% of charge) | $500k |
| Washington | Yes | $100k |
| Pennsylvania | Yes (in-state user) | $100k |
| Tennessee | Yes | $100k |
| Massachusetts | Yes | $100k |
| Ohio | Yes (B2B) | $100k |
| Connecticut | Yes (1% B2B, 6.35% B2C) | $100k + 200 txns |
| Utah | Yes | $100k (200-txn rule dropped Jul 2025) |
| Illinois | Yes (local only) | $100k (200-txn dropped Jan 2026) |
| Iowa, Rhode Island, S. Dakota, W. Virginia, D.C., Arizona, Hawaii, NM | Yes | $100k |
| California | NO (B2B SaaS exempt) | n/a for SaaS |
| Florida, Georgia, Virginia, Colorado, Missouri, NJ, NC, Michigan, Wisconsin | NO | n/a |
| Oregon, Montana, NH, Delaware, Alaska (state) | No sales tax at all | n/a |

Action: register + collect only after you cross a state's threshold (trailing 12 months). Use Anrok/TaxJar/Stripe Tax — don't DIY filings past 3 states.

## 5. Marketplace facilitator
Shopify storefront is **NOT** a marketplace facilitator — you collect/remit. Shop App, Amazon, Etsy, Walmart ARE — they collect for you. Your $99 SaaS sold via your own Stripe checkout = your obligation.

## 6. Contractor vs employee
1099-NEC: independent worker, sets own hours, own tools, multiple clients, project-based. Issue 1099 if you pay >$600/yr. W-2: you direct work, set schedule, exclusive — triggers payroll tax, workers comp, unemployment. IRS 20-factor test + state ABC test (CA/NJ/MA strictest). Default to 1099 contractors year-1; first W-2 = trigger payroll provider (Gusto ~$40/mo + per-head).

## 7. Privacy + cookies
- Privacy policy: mandatory (CCPA/CPRA, VA, CO, CT, UT, OR, MT, TX, DE, IA, TN, IN, NH, NJ, MD, KY, MN, RI). Disclose data collected, purposes, third parties, user rights, retention, contact.
- Cookie banner: only required if you use non-essential cookies (analytics, ads). CA + CO require Global Privacy Control honoring; symmetrical "Accept All" / "Reject All" buttons (no dark patterns) effective 2026. Stripe + GA4 alone = need banner. Use Osano/CookieYes free tier.
- "Do Not Sell or Share My Info" link required in footer if you share data with ad networks.

## 8. Insurance — get Tech E&O + Cyber bundle at first paying customer
- Cost: ~$90-180/mo for $1M / $1M (Insureon, Vouch, Embroker, Thimble).
- Tech E&O pays: customer sues because your software failed / caused them loss.
- Cyber pays: breach response, forensics, notification, regulatory fines, ransomware.
- When it pays: only if you reported promptly, had reasonable controls (MFA, backups), and exclusions don't apply (no war/nation-state, no prior known incidents). Many B2B customers will REQUIRE certificate of insurance before signing — buy before sales conversations.
- General Liability: ~$30/mo, only useful if you have an office / in-person events.

## 9. One-year compliance roadmap
- Month 0: LLC formed, EIN, business bank acct, registered agent. Stripe live. ToS + Privacy + Refund + AUP published. Cookie banner if analytics on.
- Month 1: Bookkeeping (Wave free or Xero $15/mo). Separate biz card. Track every $ — IRS audit horizon is 3 years.
- Month 3: Tech E&O + Cyber bundle at first paying customer. Add DPA template for B2B.
- Month 6: Q2 estimated taxes paid (Form 1040-ES). Watch sales-tax nexus dashboard — register in any state crossed. Stripe Tax on if 2+ taxable states.
- Month 9: If net profit on track to >$60k, talk to CPA about S-Corp election for next tax year (must file 2553 by Mar 15).
- Month 12: 1099-NEC to any contractor paid >$600 (due Jan 31). File LLC annual report (varies by state). Reconcile books. Review ToS for new state laws (NJ, MD, IA, TN, MN privacy acts staggered through 2026).

Word count: ~720. Sources: anrok.com/saas-sales-tax-by-state, salestaxinstitute.com/resources/economic-nexus-state-guide, stripe.com/docs/disputes, irs.gov/pub/irs-pdf/p3402.pdf, termsfeed.com, insureon.com, seedpodcyber.com, avalara.com marketplace-facilitator guide.
