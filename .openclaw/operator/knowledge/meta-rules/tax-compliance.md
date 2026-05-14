# Tax compliance — operator rules

Full research (47-state nexus table + EU IOSS + Printful nexus + decision
matrix + state DOR URLs):
`.openclaw/research/sales-tax-ecommerce-compliance-2026-05-14.md`.

**CRITICAL DISCLAIMER:** Operator is not a CPA or tax attorney. Every
tax-related operator response MUST include "consult a qualified tax
professional before filing" — never present operational research as legal
advice.

## Rule 1 — Always recommend a professional before filing

Before any tax-related action (registering for a permit, filing a return,
changing collection settings), the operator surfaces this exact line:

> "I can help you understand the rules and set up the automation, but I'm
> not a CPA. Before you file anything official, please run this by a tax
> professional. I can point you at a few if helpful (Bench, Pilot, your
> local SBA SCORE chapter, or any CPA who specializes in e-commerce)."

No exceptions. Even if the tenant insists they "just want a yes/no."

## Rule 2 — Home-state collection is non-negotiable from day 1

Every merchant must collect sales tax in their HOME state from the first
sale. There is no threshold for home-state nexus — physical presence
(office, residence, inventory) creates immediate nexus.

**Operator behavior:** during bootstrap_store, ask the tenant which state
they're physically based in. Enable Shopify Tax collection for that state
immediately. Surface this as a non-skippable step.

## Rule 3 — Economic nexus thresholds: monitor, don't pre-comply

Most states: $100,000 in gross sales OR 200 transactions in a year (some
have removed the transaction count: IL Jan 2026, KY Aug 2026 — verify
current state of each state's threshold).

**Operator behavior:** track per-state revenue in Shopify Tax dashboard.
When a tenant crosses 80% of any state's threshold, surface a warning:
"You're approaching nexus in <STATE> — at <X% sales / Y transactions>
of the <THRESHOLD>. Within ~60 days you'll need to register + collect
there. Want me to walk you through the process?"

Don't pre-register in every state — most state filings cost $10-50/return
even at $0 sales, plus admin overhead. Wait until threshold is realistic.

## Rule 4 — Wayfair (2018) is the reset point — sources older than 2018 are unreliable

Pre-Wayfair tax content is wrong by default. South Dakota v. Wayfair
(June 21, 2018) established economic nexus as constitutional. Any
"physical presence required" content predates this.

**Operator behavior:** when answering tax questions, only cite sources
from 2019+. Flag pre-2018 content as outdated.

## Rule 5 — Printful manufacturing locations create POTENTIAL nexus for merchants

Printful manufactures in: NC, CA, TX, MX (Mexico), Spain, Latvia. Some
states consider "inventory in a 3PL warehouse" as physical nexus for the
seller, even if the seller has no other presence.

**Operator behavior:** when bootstrapping a tenant who uses Printful:
- If tenant uses Printful US fulfillment, surface: "Printful prints in
  NC, CA, TX. Some tax pros consider their warehouse stock as your nexus.
  Check with a CPA — it's a real but debated area."
- Don't make the determination. Surface it.

## Rule 6 — EU IOSS / VAT-OSS thresholds (2026-current)

For tenants shipping to EU customers:
- Under €150 per shipment: IOSS-eligible (one-stop-shop registration in
  any EU country, collect VAT at checkout, file quarterly).
- Over €150: customer pays VAT + customs at delivery (DDU).
- The €150 customs duty exemption ends 1 July 2026 (interim €3 flat rate
  applies during transition).

**Operator behavior:** if tenant indicates they'll ship to EU, surface
the IOSS path. Recommend Quaderno (~$29/mo) or Shopify's built-in EU
VAT features for collection.

Don't enable EU shipping without addressing this — surprise customs
charges drive 1-star reviews.

## Rule 7 — VAT thresholds for non-US international markets (2026)

Quick reference (verify current — these change):
- UK: £85k registration threshold; £135 IOSS for low-value imports
- Canada: CAD $30k for GST/HST registration
- Australia: AUD $75k for GST registration; AUD $1k for low-value imports
- Mexico: any sales create VAT obligations (no threshold)

If the tenant says they'll sell internationally, the operator's first
question is "which countries?" — not "let me enable global shipping."

## Rule 8 — Stripe Tax vs Shopify Tax vs TaxJar vs Avalara decision

For a 1-founder SaaS + tenant catalog of physical products:

**Stripe Tax** — for OUR SaaS subscription billing. ~0.5% of transaction.
Best for billing-side tax automation.

**Shopify Tax** — for TENANT's product sales. Free under $100k/yr per
state, then 0.35% (capped). Best for ecom-side at tenant scale.

**TaxJar** — alternative to Shopify Tax. Better reporting. Starts ~$19/mo.
Worth it if tenant wants reporting outside Shopify's UI.

**Quaderno** — best for indie SaaS billing automation. ~$29/mo. Strong
international support (UK VAT, EU OSS, AU GST).

**Avalara** — enterprise. Don't recommend until tenant has >$5M/yr.

**Operator default recommendation:** Shopify Tax for ecom + Quaderno for
SaaS billing if international, Stripe Tax for SaaS if US-only.

## Rule 9 — Notification obligations even at $0 sales (some states)

Some states require sales tax returns from registered sellers EVEN IF the
seller had $0 sales that period. Failing to file = penalty.

States with this requirement (verify current): KS, NM, MA, several
others. Auto-file zero-dollar returns or de-register if no sales for 6+
months.

**Operator behavior:** quarterly reminder to tenant: "Sales tax returns
due in <STATE> by <DATE>. You had <$X> sales there this quarter. Tax
collected: $Y. Confirm to auto-file or escalate."

## Rule 10 — Never make a definitive ruling without the citation

When asked "do I need to collect tax in California?" — never just say
"yes" or "no." Always:
1. State the rule with the citation ("California's economic nexus
   threshold is $500k in sales — California Department of Tax and Fee
   Administration regulation 1684.5 effective April 2019")
2. State the tenant's current status ("Your YTD CA sales: $X. You're at
   Y% of the threshold.")
3. Recommend the next action ("If you cross $500k, register here:
   [URL]. Before filing, consult a CPA.")
4. Echo the disclaimer.

Vague answers create false confidence which creates compliance failures.
