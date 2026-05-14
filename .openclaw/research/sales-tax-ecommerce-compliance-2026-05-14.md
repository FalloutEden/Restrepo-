---
title: "Sales tax + e-commerce compliance for US-first BYOK SaaS"
kind: tax-runbook
date: 2026-05-14
tags: [tax, sales-tax, nexus, vat, gst, compliance, shopify-tax, stripe-tax, international, wayfair, ioss, oss, printful, dropship]
related_concepts:
  - byok-saas-billing
  - shopify-merchant-onboarding
  - printful-dropship-pipeline
  - operator-policy-rules
  - international-shipping
  - merchant-onboarding-checklist
---

# Sales tax + e-commerce compliance

## DISCLAIMER

We are not lawyers or CPAs. Nothing in this document is legal advice or
tax advice. This is operational research for the Operator agent and for
Karling personally — a frame for how the system *thinks* about tax, plus
pointers at the right primary sources and tooling. Every actionable
filing, registration, or threshold decision must be confirmed against
the relevant state Department of Revenue page, against the latest
vendor documentation (Shopify Tax / Stripe Tax / Avalara / TaxJar /
Quaderno), and ideally with a licensed CPA or sales tax specialist
before money is collected, remitted, or refunded. The Operator must
echo this disclaimer any time it speaks to a tenant about tax. There
are no exceptions to this rule.

## TL;DR

For a US-first BYOK SaaS (we charge the tenant) plus US-first DTC
e-commerce (the tenant charges their customer), there are two distinct
tax surfaces and they do not share rules. On the SaaS side, the dominant
question is whether *Karling* needs to collect sales tax on subscription
fees — the answer depends on which states tax SaaS (about 22-25 do, in
varying form), where Karling and her customers are located, and whether
she crosses each state's economic nexus threshold (most commonly
$100,000 in sales). On the tenant side, the merchant must always
register and collect in their *home state*, must enable Shopify Tax to
automatically calculate destination-correct rates, and must monitor
crossings of each remote state's threshold (set by *South Dakota v.
Wayfair*, 2018). Printful drop-ship adds a resale-certificate dance:
the merchant submits a resale cert to Printful so Printful doesn't
double-tax them on supplier-side transactions. International is a
different animal — EU OSS/IOSS, UK VAT (£135), Canadian GST/HST/PST,
and Australian GST (A$75k) each have their own thresholds and rules,
and the EU is ending its €150 customs duty exemption in 2026. The
Operator's job is to *frame, register, automate, and refer*, never to
*authorize* tax positions.

## Section 1: SaaS side — taxability of subscription fees

### Does Karling need to collect sales tax on SaaS subscriptions?

The short answer: maybe, in some states, eventually. The Operator
SaaS is positioned as "The Operator by Black Vault Studio." Karling is
US-based (founder country: US). Tenants pay a monthly subscription that
funds Karling's company. The Operator is a software service, delivered
via the web, with no tangible personal property. That's the textbook
definition of SaaS, and SaaS taxability is *jurisdiction-specific* and
*state-specific* — there is no federal sales tax in the US.

### Wayfair + economic nexus refresher

Before *South Dakota v. Wayfair* (decided June 21, 2018), states could
only require sales tax collection from businesses with physical
presence (office, employees, warehouse, inventory). Wayfair overturned
that — the Supreme Court said economic activity alone (a threshold of
sales into the state) creates nexus and triggers a collection
obligation. South Dakota's original thresholds — $100,000 in sales
*or* 200 transactions — became the de facto template. Every state with
a sales tax now has an economic nexus rule of some kind.

### Which states tax SaaS at all

As of 2026, roughly 22-25 US jurisdictions tax some form of SaaS, with
the list and the rules changing every legislative session. A rough cut:

- **Clearly taxable, full rate**: New York, Texas (taxes 80% of SaaS
  charges under the "data processing" rule), Pennsylvania, Massachusetts,
  Hawaii, Washington, South Dakota, Utah, Tennessee, Connecticut (1%
  for business use, full rate for personal), Rhode Island, Ohio, Arizona,
  Iowa (taxable for consumers, generally exempt for business),
  Mississippi, New Mexico, Maryland, West Virginia, Alabama.
- **Generally not taxable**: California, Florida, Virginia, North
  Carolina, Georgia, Illinois (with caveats), New Jersey, Missouri,
  Wisconsin, Colorado, Oklahoma, Kansas, Indiana, Minnesota, Kentucky,
  Michigan, Nevada.
- **No statewide sales tax at all**: Alaska (but local Alaska
  jurisdictions can tax), Delaware, Montana, New Hampshire, Oregon.

This list moves every year. Anrok, TaxJar, and Stripe's SaaS taxability
guides are the most reliable cross-references; the state Department of
Revenue page is the only authoritative source.

### Sourcing rules: origin vs destination

US sales tax has two sourcing models:

- **Destination-based** (most states + DC): tax is charged based on
  where the *customer* receives the service or product. The buyer's
  state, county, city, and special-district rates all stack.
- **Origin-based** (a minority — about 12 states; the big ones are
  Texas, Pennsylvania, Ohio, Virginia, and partially California for
  state-level): for *intra-state* sales the rate is based on the
  *seller's* location. For inter-state sales, even origin states
  usually revert to destination sourcing.

For SaaS sold across state lines, destination sourcing is the practical
default — the Operator should assume the buyer's billing address
governs.

### B2B vs B2C exemption (resale certs)

In many states, B2B SaaS sales to a buyer who will *use* the software
(not resell it) are still taxable just like B2C — the "resale
exemption" is narrow. A SaaS reseller who genuinely sublicenses to
their own customers may issue a resale certificate (e.g., Texas Form
01-339), but a customer who simply uses the software does not qualify.
Some states (Iowa, Connecticut) carve out business-use exemptions for
SaaS; most do not. Don't assume B2B = no tax.

### Stripe Tax vs manual vs hire-an-accountant: decision criteria

For a 1-founder SaaS shop:

| Stage | Recommendation | Why |
|-------|----------------|-----|
| $0 - first sale | No tooling. Register sales tax permit in home state only. | Cost zero, learning the surface. |
| First sale - $50k ARR | Enable Stripe Tax in monitoring mode (free until registered). Register only in home state. | Stripe Tax surfaces threshold crossings without billing you 0.5% until you flip the switch. |
| $50k - $250k ARR | Stripe Tax in collection mode for states where you've crossed nexus + registered. Consult a CPA once to validate. | The 0.5% Stripe Tax fee is cheaper than the cost of getting one state wrong. |
| $250k+ ARR | Hire a sales-tax-specific CPA or use Anrok / TaxJar for filings. | Filings (not calc) become the bottleneck. |

### When to register: thresholds + the "wait or comply" trade-off

You are *required* to register in your home state from day one (most
states). For remote states, you register when you cross the threshold.
Over-registering is real money lost — every registered state requires
periodic (monthly, quarterly, or annual) returns even if you collected
zero, and many states impose minimum late-filing penalties ($25-$50 per
return per period). A founder who registers in 50 states "just to be
safe" can spend $5k-$15k/yr on filings alone.

The discipline: monitor with Stripe Tax (or Shopify Tax for the e-com
side), register *as* you cross, not before, and never voluntarily
register in a state where you have zero presence and no threshold
crossing.

## Section 2: Tenant side — sales tax on physical products

### Economic nexus refresher for e-commerce merchants

Same Wayfair foundation as Section 1, applied to physical goods. Every
state with a sales tax has an economic nexus rule. The merchant must
register, collect, and remit in:

1. Their home state (always, from day one — physical presence).
2. Every state where their sales cross the economic nexus threshold.

### Each state's threshold (summary table — verify against state DOR)

| State | Revenue threshold | Transaction threshold | Notes |
|-------|-------------------|----------------------|-------|
| Alabama | $250,000 | (none) | Higher than typical |
| Arizona | $100,000 | (none) | |
| Arkansas | $100,000 | OR 200 txns | |
| California | $500,000 | (none) | Mixed sourcing |
| Colorado | $100,000 | (none) | |
| Connecticut | $100,000 AND 200 txns | (AND) | Dual-threshold |
| Florida | $100,000 | (none) | Prior-year measurement |
| Georgia | $100,000 | OR 200 txns | |
| Hawaii | $100,000 | OR 200 txns | |
| Idaho | $100,000 | (none) | |
| Illinois | $100,000 | (none) | Eliminated 200-txn Jan 1 2026 |
| Indiana | $100,000 | (none) | |
| Iowa | $100,000 | (none) | |
| Kansas | $100,000 | (none) | |
| Kentucky | $100,000 | OR 200 txns | Removing txns Aug 1 2026 |
| Louisiana | $100,000 | (none) | |
| Maine | $100,000 | (none) | |
| Maryland | $100,000 | OR 200 txns | |
| Massachusetts | $100,000 | (none) | |
| Michigan | $100,000 | OR 200 txns | |
| Minnesota | $100,000 | OR 200 txns | |
| Mississippi | $250,000 | (none) | |
| Missouri | $100,000 | (none) | |
| Nebraska | $100,000 | OR 200 txns | |
| Nevada | $100,000 | OR 200 txns | |
| New Jersey | $100,000 | OR 200 txns | |
| New Mexico | $100,000 | (none) | |
| New York | $500,000 AND 100 txns | (AND) | Quarterly evaluation |
| North Carolina | $100,000 | (none) | |
| North Dakota | $100,000 | (none) | |
| Ohio | $100,000 | OR 200 txns | |
| Oklahoma | $100,000 | (none) | |
| Pennsylvania | $100,000 | (none) | |
| Rhode Island | $100,000 | OR 200 txns | |
| South Carolina | $100,000 | (none) | |
| South Dakota | $100,000 | (none) | The original Wayfair state |
| Tennessee | $100,000 | (none) | |
| Texas | $500,000 | (none) | Trailing 12-month |
| Utah | $100,000 | (none) | |
| Vermont | $100,000 | OR 200 txns | |
| Virginia | $100,000 | OR 200 txns | |
| Washington | $100,000 | (none) | |
| West Virginia | $100,000 | OR 200 txns | |
| Wisconsin | $100,000 | (none) | |
| Wyoming | $100,000 | (none) | |
| Alaska, Delaware, Montana, New Hampshire, Oregon | — | — | No statewide sales tax |

Trend: more states are dropping the 200-transaction threshold (16+
states by Jan 1 2026; Kentucky in Aug 2026; Illinois Jan 1 2026). The
revenue floor is the durable rule.

### Marketplace facilitator rules

By 2026, every state with a sales tax has a marketplace facilitator
law. These laws require *the marketplace* (not the seller) to collect
and remit sales tax on facilitated sales. Practical impact:

- **Amazon, Etsy, eBay, Walmart Marketplace, TikTok Shop**: collect on
  the seller's behalf in every state with a marketplace law. The seller
  generally doesn't collect on those sales — but in some states the
  seller still has to file *zero returns* and the marketplace sales
  *count* toward the seller's nexus threshold (relevant if the seller
  also has a direct Shopify storefront).
- **Shopify**: Shopify proper is *not* a marketplace facilitator —
  it's an e-commerce platform. The merchant is the seller of record on
  their own Shopify store and is responsible for collecting and
  remitting. The exception: Shopify's *Shop App* channel acts as a
  marketplace and Shopify does collect there.

For the Operator's tenants, who run Shopify storefronts, this means:
*tenants are responsible for their own tax collection*. Shopify is not
going to do it for them. Shopify Tax is just the calculation engine.

### Shopify Tax — what it does and doesn't

Shopify Tax (shopify.com/tax) is Shopify's native sales tax product.
What it does:

- Calculates the correct sales tax rate at checkout for the buyer's
  destination, across 11,000+ US jurisdictions.
- Tracks liability state-by-state and surfaces a "you're approaching
  nexus" warning when the merchant nears a state's threshold.
- Offers automated filing in eligible US states (file + remit on the
  merchant's behalf — opt-in, paid service).
- Handles product taxability (apparel-exemption nuance in NY, MA, PA,
  etc.).
- Updates rates automatically when states change them.

What it does *not* do:

- Register the merchant in any state. The merchant must do that
  manually with each state's Department of Revenue.
- Decide which states the merchant should be registered in. It tells
  you the threshold is being crossed; you decide whether to register.
- File in every state. The auto-filing feature is opt-in and only
  eligible in some states.

### Shopify Tax pricing model

For US-based stores:

- **Free** for the first $100,000 USD in global sales per calendar
  year per store.
- **Above $100k**: 0.35% per order (0.25% on Shopify Plus), capped at
  $0.99 USD per order, and capped at $5,000 USD per region per
  calendar year.
- **EU shop**: €100,000 threshold; **UK shop**: £100,000.
- Multi-store: threshold is per-store, not aggregated.

This is materially cheaper than Stripe Tax (0.5%) or TaxJar/Avalara
for low-to-medium volume Shopify merchants — which is most of the
Operator's tenant base at launch.

### The home-state question

Every merchant must always collect sales tax in their home state from
day one, regardless of revenue. There is no de minimis "I haven't sold
enough yet" floor for your home state — physical presence is automatic
nexus. Karling's tenants, the moment they get their first order
shipping to their own state, owe sales tax on it.

The Operator must remind tenants of this at onboarding. It's the
single most common missed obligation for indie e-commerce founders.

### Notification obligations even below thresholds

A handful of states (Colorado is the historical example) have
"notification" laws that require remote sellers below the threshold to
notify customers and the state of un-taxed transactions. These have
been largely supplanted by Wayfair-era economic nexus rules, but they
exist as residual obligations and the merchant should check their
state DOR page.

## Section 3: Print-on-demand specific tax weirdness

### The drop-shipping resale cert dance

Printful is the *supplier*. The merchant is the *retailer*. When a
customer buys a t-shirt on the merchant's Shopify store:

1. The customer pays the merchant (retail transaction, retail tax
   applies based on the merchant's nexus footprint).
2. The merchant pays Printful (wholesale transaction, *should* be
   tax-exempt because the merchant is reselling).

But by default, Printful will charge the merchant sales tax on step 2
in every state where Printful has nexus (which is most of them).
Printful's manufacturing/fulfillment footprint includes Charlotte NC,
Dallas TX, Tijuana MX, Riga LV, Birmingham UK, Toronto CA, Barcelona
ES — and California facilities through partners. Printful has nexus in
nearly every US state with sales tax.

The fix: the merchant submits a *resale certificate* via Printful
Dashboard → Billing → Tax information → Resale certificate. Once
approved, Printful stops charging sales tax on supplier-side
transactions for that state.

### Which states recognize MTC resale certs

The Multistate Tax Commission (MTC) publishes a Uniform Sales & Use
Tax Resale Certificate (Multijurisdiction) that is currently
recognized in some form by ~36-38 states. This single form can serve
as a resale cert for most of the merchant's footprint, but with
caveats:

- **California**: does *not* accept out-of-state resale certs. A
  California sales tax permit is the only valid resale cert for CA.
- **Florida, Hawaii, Illinois, Louisiana, Maryland, Massachusetts**:
  more restrictive — usually require state-specific forms or
  registration.
- **Most other states (incl. North Carolina, Texas)**: accept the MTC
  form, *or* accept the merchant's home-state sales tax license as
  proof of resale.

The practical recipe for a new merchant:

1. Get a home-state sales tax permit.
2. Fill out the MTC Multijurisdiction Uniform Resale Certificate.
3. Submit it to Printful.
4. For California specifically: get a CA seller's permit if you ship
   meaningful volume there, or accept that Printful will charge you
   CA sales tax on your supplier purchases (which you then
   theoretically pass on to the customer).

### Printful's tax page and stance

Printful's official position (per their help center): they charge
sales tax in every state where they have nexus unless the merchant
provides a valid resale cert. They do not file or remit *on behalf of*
the merchant — they're just collecting on their own supplier-side
transactions. The retail tax obligation is 100% the merchant's.

### When the merchant needs a sales tax permit in a Printful state

If the merchant's only nexus in a state is *Printful's* nexus (i.e.,
Printful is shipping from there), the merchant generally does *not*
inherit Printful's nexus. The merchant's nexus is based on their own
economic activity. The exception is California — because CA only
accepts CA seller's permits as resale certs, a merchant doing
meaningful Printful drop-ship to California addresses may want to
register for a CA permit to claim the resale exemption from Printful.

## Section 4: International — when the merchant ships outside the US

### When to skip this section

If the merchant's tenant configuration is US-only shipping (geofenced
in Shopify checkout), this entire section is irrelevant. The Operator
should default new tenants to **US-only** at launch and only enable
international after a deliberate conversation about VAT/GST obligations.
International isn't free — it's a paperwork commitment.

### UK VAT (post-Brexit)

The UK is *not* in the EU for VAT purposes. UK VAT rules for ecommerce
imports:

- **Below £135 consignment value**: the *seller* (or marketplace) must
  register for UK VAT, collect at checkout, and remit to HMRC.
- **Above £135**: import VAT and duties are handled at the border,
  typically by the carrier under DDP or by the customer under DAP.
- The UK government announced (2025) plans to remove the £135 de
  minimis by March 2029, but as of 2026 it's still in force.

The merchant needs a UK VAT number to operate compliantly at any
volume.

### EU VAT — OSS and IOSS

The EU's distance-selling VAT regime was overhauled in July 2021 and
is being further reformed in 2026:

- **OSS (One-Stop Shop)**: for intra-EU sales of goods (a merchant
  warehoused in one EU state shipping to consumers in another). A
  single EU-wide €10,000 threshold applies — below it, the merchant
  charges their home country's rate; above it, they must charge the
  destination country's rate. OSS lets them file one consolidated
  return per quarter.
- **IOSS (Import One-Stop Shop)**: for imports *into* the EU from
  outside (a US merchant shipping a t-shirt to a French buyer). IOSS
  covers shipments with a consignment value up to €150 — the merchant
  registers for IOSS (via one EU member state's tax authority),
  collects VAT at checkout, and remits via a single monthly IOSS
  return.

**2026 change**: the €150 customs duty exemption is being abolished.
From 1 July 2026, small parcels entering the EU will be subject to a
€3 flat-rate customs duty per consignment under an interim system,
until the EU Customs Data Hub enables full per-item tariff calculation.
IOSS still covers VAT collection on shipments under €150, but
customs duty now applies as well.

### Canada — GST + HST + PST

Canada is a federation with overlapping taxes:

- **GST** (Goods and Services Tax): 5% federal, applies everywhere.
- **HST** (Harmonized Sales Tax): GST + provincial portion, charged
  in NB, NL, NS (14% as of Apr 2025), ON, PEI. Single combined rate.
- **PST** (Provincial Sales Tax): separately administered in BC, SK,
  MB. Quebec has its own QST.

**Registration threshold**: CAD $30,000 in total taxable sales over
any rolling 4-quarter period (a relatively low bar). Below that, a
non-resident merchant generally doesn't have to register. Above it,
they must register for GST/HST.

Provincial PST (BC, SK, MB) has separate registration with separate
thresholds.

### Australia — GST

- **Threshold**: AUD $75,000 in annual sales to Australia.
- **Low-value goods rule** (since 1 July 2018): GST applies to goods
  valued at A$1,000 or less sold by non-resident sellers to Australian
  consumers, *if* the seller's turnover meets the $75k threshold. The
  seller collects at checkout and remits.
- **Above A$1,000**: GST is collected by Customs at the border.
- Marketplaces (Amazon, eBay) collect for sellers who otherwise
  wouldn't be registered.

### DDP vs DDU shipping — the customer experience question

- **DDP (Delivered Duty Paid)**: the merchant pays import duty and
  VAT at the time of shipment. The customer receives the package with
  no extra fees. Better UX, worse margins on low-AOV apparel.
- **DAP / DDU (Delivered At Place / Delivered Duty Unpaid)**: the
  customer pays duty and VAT to the carrier on delivery, or refuses
  the parcel. Cheaper for the merchant, terrible UX, high refusal
  rate.

For apparel with margins under 20% or AOV under €50, absorbing duties
under DDP can eat the entire profit. For premium goods or higher
AOVs, DDP is the de facto standard in 2026. Shopify Markets and
Printful both support DDP-like flows by collecting duties at checkout.

### HS codes for the Printful catalog

Harmonized System (HS) codes classify goods for customs. For
Printful-style POD apparel and accessories:

- **Knitted t-shirts (cotton)**: 6109.10 — most cotton tees.
- **Knitted t-shirts (other materials)**: 6109.90.
- **Hoodies / sweatshirts (knitted)**: 6110.
- **Caps and hats**: 6505 (knitted caps), 6504 (woven hats), 6506
  (other hats incl. safety helmets — not POD-relevant).
- **Mugs (ceramic)**: 6912.
- **Posters / prints (paper)**: 4911.
- **Phone cases (plastic)**: 3926.
- **Tote bags (cotton)**: 4202.92 or 6307.90 depending on weave.

Printful generally provides HS codes on customs paperwork
automatically. The merchant doesn't have to classify by hand. The
risk is *wrong classification* causing customs holds — usually only
matters for unusual product types.

## Section 5: Tax automation tools — decision matrix

For a 1-founder SaaS + tenant catalog of physical products:

| Tool | Best for | Pricing (2026) | Verdict |
|------|----------|---------------|---------|
| **Shopify Tax** | Tenant e-commerce (Shopify-native) | Free under $100k/yr, then 0.35% capped | The default for every Operator tenant. Period. |
| **Stripe Tax** | SaaS billing side (Karling's own billing) | 0.5% per taxable transaction in registered states; free in monitoring mode | Right tool for The Operator's SaaS revenue. |
| **TaxJar** | Multi-channel e-com sellers (Shopify + Amazon + eBay) | Starter ~$19-39/mo, Professional from $99/mo, AutoFile separate | Worth it for tenants who outgrow Shopify-only. |
| **Avalara AvaTax** | Enterprise compliance, complex jurisdictions | Custom quote, $50-5,000+/mo | Overkill for indie merchants. |
| **Quaderno** | Indie SaaS + digital goods + international VAT | Hobby $29/mo, Startup $49/mo, Business $99/mo | Strong alternative to Stripe Tax for the SaaS side, especially if Karling adds non-Stripe payments. |
| **Anrok** | SaaS-only sales tax automation | Custom quote, low end ~$5k/yr | Mid-market SaaS option, not Operator-stage yet. |

### Decision tree

```
Are you a tenant of The Operator (e-commerce merchant)?
  → Use Shopify Tax (default, free under $100k).
  → If multi-channel beyond Shopify, add TaxJar.

Are you Karling (the SaaS founder)?
  → If only billing through Stripe → Stripe Tax in monitoring mode.
  → If multiple payment processors or non-US billing → Quaderno.
  → At $1M+ ARR → consult Anrok or a sales-tax CPA.
```

## Section 6: The "minimum viable compliance" recipe

For a brand-new merchant at $0-100k/yr revenue, the Operator should
walk them through exactly this sequence:

1. **Register a sales tax permit in your home state.** Always. Free
   to ~$100 depending on state. Usually online via the state
   Department of Revenue.
2. **Enable Shopify Tax.** It's free up to $100k/yr in global sales.
   Configure your home state as the primary nexus. Add product
   taxability overrides where Shopify doesn't auto-classify
   correctly (clothing in PA, NY, MA).
3. **Submit your home-state resale cert (or MTC Uniform form) to
   Printful.** This stops Printful from charging you sales tax on
   supplier-side transactions.
4. **File returns in your home state.** Quarterly is typical for new
   sellers; some states require monthly above a volume threshold.
   File *even if you collected zero* — most states penalize missed
   zero returns.
5. **Monitor nexus crossings via Shopify Tax dashboard.** When you
   approach a remote state's threshold ($100k in most), get ready to
   register *before* you cross.
6. **Cross-the-threshold playbook**:
   - Register with the new state's DOR (online, typically takes 1-10
     business days).
   - Enable collection for that state in Shopify Tax.
   - Add the state to your filing calendar.
   - File the first return for the period in which you registered,
     even if zero collections.
7. **Don't over-comply.** Do not voluntarily register in states where
   you have no presence and no threshold crossing. Each registered
   state is an ongoing filing obligation with minimum penalties for
   missed returns. Under-collecting is fixable with a back-payment;
   over-registering is a perpetual tax on your time.

For international:

- Default to **US-only shipping** at launch.
- Enable each international market deliberately, after registering
  for the relevant VAT/GST scheme (UK VAT, EU IOSS, Canada GST,
  Australia GST).

## Section 7: Common failures the Operator must prevent

These are the predictable ways a non-developer tenant breaks their
own tax compliance. The Operator must surface guardrails for each:

1. **Tenant launches without collecting sales tax in their own home
   state.** Most common error. Home-state nexus is automatic from
   day one. The Operator must check this at onboarding and refuse
   to flip a tenant to live without it.
2. **Tenant ignores threshold-crossing alerts** in Shopify Tax. The
   merchant blows past California's $500k or Texas's $500k threshold
   and only registers six months later, owing back-tax on every
   intervening sale plus interest and penalties.
3. **Tenant collects in wrong states** ("over-collection confusion").
   They read a guide that says "every state taxes online sales" and
   register in 30+ states pre-emptively. Now they owe quarterly
   filings in 30 states for $0 of collection. Each missed return
   = penalty.
4. **Tenant doesn't file zero returns.** They registered in a state,
   never sold there, and assumed silence = compliance. The state
   files an estimated return on their behalf and bills them.
5. **International shipping with wrong HS codes.** Customs holds the
   parcel, customer refunds, merchant eats the return shipping.
   Printful usually handles this, but custom products risk
   mis-classification.
6. **Drop-shipper claims resale exemption with wrong cert format.**
   Submits an MTC Uniform cert to a state that doesn't accept it (CA,
   Hawaii). Printful continues charging sales tax. Merchant
   double-pays.
7. **Founder confuses SaaS-side and tenant-side tax.** Karling, on
   her own SaaS billing, applies the wrong threshold logic to her
   merchant's e-commerce side, or vice versa. They are *separate
   compliance surfaces* with separate registrations.
8. **Tenant enables international shipping before registering for
   VAT.** First UK sale of £200 happens, no UK VAT number, customer
   refused at customs, merchant owes the carrier.

## Section 8: Operator action protocol

For each scenario, what does the Operator say or do?

### Scenario: tenant asks "do I need to collect sales tax?"

**Operator response template**:
"Yes — at minimum in your home state from day one. Beyond that, you
collect in any state where you cross the economic nexus threshold
(usually $100,000 in sales). Shopify Tax handles the calculation
and surfaces threshold crossings; you handle the registration with
each state's Department of Revenue. I am not a CPA — for filing
decisions or unusual situations, please consult a tax professional.
Want me to (a) walk you through your home-state registration, or
(b) enable Shopify Tax in monitoring mode?"

### Scenario: tenant approaches nexus threshold in a new state

**Operator response template**:
"Heads up — your Shopify Tax dashboard shows you're at [X%] of [State]'s
$100k economic nexus threshold. At your current rate you'll cross in
~[Y] weeks. Before that happens, you need to register with the
[State] Department of Revenue. Here is the registration URL: [link].
After registration, I can flip on tax collection for [State] in your
Shopify Tax settings. This is operational guidance only — please
verify the threshold against the state's current rules or with a CPA
before acting."

### Scenario: tenant wants to launch in the EU

**Operator response template**:
"Selling into the EU adds three obligations: (1) register for IOSS
through one EU member state's tax authority for shipments under €150,
(2) collect VAT at checkout at the destination country's rate, (3)
file monthly IOSS returns. The 2026 customs change also adds a €3
flat duty per parcel from 1 July 2026. Before you flip on EU
shipping, do you want me to (a) set up an IOSS-registered fulfillment
flow via Printful, or (b) keep EU off for now? I strongly recommend a
VAT specialist before launch — this is not a domain to wing."

### Scenario: tenant's Shopify Tax dashboard shows an error

**Operator response template**:
"I see Shopify Tax is reporting [specific error]. The most common
causes are: missing nexus configuration, product taxability override
needed, or address validation failure. Let me check your settings.
[Investigates, recommends fix.] If this looks like a configuration
issue I can fix it directly; if it looks like a filing or compliance
issue I'll surface it for you to take to your CPA."

### Scenario: tenant gets a notice from a state DOR

**Operator response template**:
"State Department of Revenue notices are time-sensitive — most have
30-day response windows. I can help you understand what the notice
says and what category of issue it is (nexus questionnaire, missed
return, audit), but the *response* must come from you or your CPA.
Please do not ignore it. Forward it to a sales-tax CPA today. If you
don't have one, here are three vetted resources: [Bench, Pilot,
TaxJar's CPA finder]."

## Section 9: Operator rules extracted

For `.openclaw/operator/knowledge/meta-rules/`:

1. **Never authorize a tax position.** The Operator gives operational
   guidance and points at primary sources. It does not say "yes, you
   are required to collect" or "no, you don't owe" without immediately
   recommending professional verification.

2. **Echo the disclaimer on every tax conversation.** Any time the
   word "tax" appears in user input, the Operator's response must
   contain "I am not a CPA — please verify with a tax professional"
   in some form. Once per conversation is enough; not zero times.

3. **Default new tenants to US-only shipping.** International is
   enabled explicitly, after a tax-implications conversation.

4. **Block go-live without home-state sales tax registration.** The
   tenant cannot publish their store unless they've confirmed they
   have a home-state sales tax permit (or formally declined, with
   acknowledgment of the risk).

5. **Refuse to register in non-home states pre-emptively.** If the
   tenant asks to register in 50 states "to be safe," the Operator
   explains the over-registration penalty trap and recommends the
   monitoring-then-register pattern instead.

6. **Surface threshold crossings proactively.** Cron-based check on
   Shopify Tax dashboard for each tenant; alert the tenant *and* the
   Operator's incident channel when any state hits 80% of threshold.

7. **Refer to the resale-cert flow when Printful first charges
   tax.** First time a Printful invoice shows sales tax in a state,
   surface the resale-cert submission step automatically.

8. **Date-stamp everything.** Tax law moves. Any tax response from
   the Operator should cite "as of [date]" and recommend the user
   re-verify against the state DOR page.

9. **For VAT / IOSS / GST questions, default to "consult a VAT
   specialist."** This is not a domain to bluff. The Operator can
   set up the *mechanics* (IOSS-flagged Printful flow, UK VAT
   registration in Shopify), but the *filing strategy* is a
   specialist's call.

10. **Never use the word "advice" without negation.** "I can offer
    operational guidance, but this is not tax advice" is acceptable.
    "Here's my advice on your tax filing" is not.

## Section 10: Resources to point tenants at

### State revenue department URLs (top US states)

| State | DOR URL |
|-------|---------|
| California | https://cdtfa.ca.gov |
| Texas | https://comptroller.texas.gov |
| New York | https://tax.ny.gov |
| Florida | https://floridarevenue.com |
| Illinois | https://tax.illinois.gov |
| Pennsylvania | https://revenue.pa.gov |
| Ohio | https://tax.ohio.gov |
| Georgia | https://dor.georgia.gov |
| North Carolina | https://ncdor.gov |
| Michigan | https://michigan.gov/taxes |
| Streamlined SST (multi-state registration) | https://streamlinedsalestax.org |

### Vendor sign-up links

- **Shopify Tax**: https://www.shopify.com/tax
- **Stripe Tax**: https://stripe.com/tax
- **Quaderno**: https://quaderno.io
- **TaxJar**: https://taxjar.com
- **Avalara**: https://avalara.com
- **Anrok** (SaaS-focused): https://anrok.com
- **Printful resale cert submission**: Dashboard → Billing → Tax
  information → Resale certificate

### Free guides

- **Avalara's state-by-state economic nexus guide**: highly
  comprehensive, updated regularly:
  https://www.avalara.com/us/en/learn/guides/state-by-state-guide-economic-nexus-laws.html
- **Sales Tax Institute economic nexus chart**:
  https://www.salestaxinstitute.com/resources/economic-nexus-state-guide
- **Numeral state-by-state handbook**:
  https://www.numeral.com/blog/economic-nexus
- **MTC Uniform Resale Certificate**:
  https://www.mtc.gov/resources/uniform-sales-use-tax-exemption-certificate/

### CPA finder services

- **Bench**: https://bench.co — bookkeeping + tax for small business.
- **Pilot**: https://pilot.com — bookkeeping + CFO services for
  startups, including sales tax handling.
- **TaxJar's "Find a Vetted Sales Tax CPA"** directory.
- **AICPA "Find a CPA"**: https://aicpa.org
- **State CPA society directories** — usually the best for finding a
  local-state sales tax specialist.

### International registration

- **EU IOSS portal** (registered through any single EU member state's
  tax authority): https://vat-one-stop-shop.ec.europa.eu
- **UK HMRC VAT registration**:
  https://www.gov.uk/register-for-vat
- **Canada CRA GST/HST registration**:
  https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
- **Australian Taxation Office GST registration**:
  https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses

## Sources

Cited and verified during research, 2026-05-14:

- Numeral, "Economic Nexus: 2026's State-by-State Handbook" —
  https://www.numeral.com/blog/economic-nexus
- Avalara, "Economic Nexus and South Dakota v. Wayfair, Inc." —
  https://www.avalara.com/us/en/learn/sales-tax/south-dakota-wayfair.html
- Avalara, "States eliminating economic nexus transaction thresholds
  in 2025" —
  https://www.avalara.com/blog/en/north-america/2025/06/states-eliminating-economic-nexus-transaction-thresholds.html
- Sales Tax Institute, "Economic Nexus State Chart" —
  https://www.salestaxinstitute.com/resources/economic-nexus-state-guide
- Numeral, "Sales Tax and SaaS: State By State Breakdown (2026)" —
  https://www.numeral.com/blog/sales-tax-on-saas
- TaxCloud, "SaaS Sales Tax by State - Is SaaS Taxable in 2026?" —
  https://taxcloud.com/blog/saas-sales-tax-by-state/
- Anrok, "SaaS sales tax by state in 2026" —
  https://www.anrok.com/saas-sales-tax-by-state
- Stripe, "Introduction to SaaS taxability in the US" —
  https://stripe.com/guides/introduction-to-saas-taxability-in-the-us
- Shopify Help Center, "Shopify Tax pricing" —
  https://help.shopify.com/en/manual/taxes/shopify-tax/pricing
- Shopify, "Sales tax & filing in the United States | Shopify Tax" —
  https://www.shopify.com/tax
- Stripe, "Stripe Tax pricing" — https://stripe.com/tax/pricing
- Stripe Docs, "Stripe Tax" — https://docs.stripe.com/tax
- Numeral, "Marketplace Facilitator Laws 101: State By State (2026)" —
  https://www.numeral.com/blog/marketplace-facilitator
- Avalara, "State-by-state guide to marketplace facilitator laws" —
  https://www.avalara.com/us/en/learn/guides/state-by-state-guide-to-marketplace-facilitator-laws.html
- Printful Help Center, "How does sales tax affect me?" —
  https://help.printful.com/hc/en-us/articles/360014009920
- Printful Help Center, "How do I submit a resale certificate or tax
  exemption certificate?" —
  https://help.printful.com/hc/en-us/articles/360014009900
- Printful, "Beginner's Guide to Dropshipping Sales Tax" —
  https://www.printful.com/blog/beginners-guide-to-drop-shipping-sales-tax
- MTC, "Uniform Sales & Use Tax Resale Certificate" —
  https://www.mtc.gov/resources/uniform-sales-use-tax-exemption-certificate/
- European Commission, "E-commerce: 150 EUR customs duty exemption
  threshold to be removed as of 2026" —
  https://taxation-customs.ec.europa.eu/news/e-commerce-150-eur-customs-duty-exemption-threshold-be-removed-2026-2025-11-13_en
- European Commission, "VAT One Stop Shop" —
  https://vat-one-stop-shop.ec.europa.eu/index_en
- Avalara, "EU to end €150 customs duty exemption in 2026" —
  https://www.avalara.com/blog/en/europe/2025/11/eu-end-150-customs-duty-exemption-2026.html
- ShipBob, "UK Taxes for Ecommerce: 2026 Guide for Online Sales" —
  https://www.shipbob.com/blog/ecommerce-tax/
- Canada Revenue Agency, "Charge and collect the GST/HST" —
  https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
- Australian Taxation Office, "How Australian GST works" —
  https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/how-australian-gst-works
- Streamlined Sales Tax Governing Board — https://www.streamlinedsalestax.org/
- Sales Tax Institute, "Zero liability sales tax return FAQ" —
  https://www.salestaxinstitute.com/sales_tax_faqs/zero_liability_sales_tax_return
- Quaderno, "Quaderno vs TaxJar vs Avalara vs Stripe Tax" —
  https://quaderno.io/blog/quaderno-taxjar-avalara-stripe-tax-comparison/
- Avalara, "Origin sales tax vs. destination sales tax" —
  https://www.avalara.com/us/en/learn/whitepapers/origin-vs-destination-sales-tax.html
- TaxCloud, "Sales Tax Nexus by State Chart 2026" —
  https://taxcloud.com/blog/sales-tax-nexus-by-state/
- Avalara, "Resale certificates by state: 2026 guide" —
  https://www.avalara.com/blog/en/north-america/2023/02/a-state-by-state-guide-to-resale-certificates.html
- Flexport, HS Code 6109 (T-shirts) reference —
  https://www.flexport.com/data/hs-code/6109-tshirts-singlets-tank-tops-and-similar-garments-knitted-or-crocheted/

**Recheck cadence**: this document should be re-verified against
primary sources at least every 6 months, and immediately after any
major federal or state tax legislation. Tax thresholds and rates
change frequently — treat any specific number here as a starting
point for verification, not a final answer.
