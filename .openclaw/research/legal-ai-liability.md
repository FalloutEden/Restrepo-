# Legal exposure for AI agents in indie SaaS — Operator brief

Compiled 2026-05-13 from FTC, Lawfare, IAPP, EFF. Pin in CEREBRO.

## What regulators are catching right now

The FTC's Operation AI Comply (Sept 2024) targets two things: false AI capability claims and AI used as the instrument of an unfair/deceptive act. Settled or active actions hit Workado (53% real vs "98%" claimed accuracy), accessiBe ($1M for WCAG-compliance claims), Evolv (weapons-detection overclaim), DoNotPay ("robot lawyer" deception), and Rite Aid (5-year facial-recognition ban for deploying AI "without reasonable safeguards"). Rytr's consent order was set aside Dec 2025, signaling lighter touch on pure output-generation tools — but capability-claim and consumer-harm cases remain live. Concrete catch: any number, accuracy %, or "fully automated" phrasing on the Operator page must be substantiated, or struck.

Section 230 no longer reliably covers agent output. *Anderson v. TikTok* (3d Cir. 2024, rehearing denied Oct 2024), reading *Moody v. NetChoice*, held algorithmic recommendations are the platform's own first-party speech. By extension, an Operator-generated email, price change, or product description is **our** speech, not user-submitted content. Section 230 will not shield us.

Air Canada (*Moffatt v. Air Canada*, BC CRT 2024) is the controlling fact pattern: the airline was bound by its chatbot's hallucinated bereavement-fare promise. Courts treat the agent as the deployer's agent, full stop.

## State + EU obligations live or imminent

- **CA AB 2013** (effective 2026-01-01): if we develop/fine-tune a GenAI model used by CA residents, post a training-data summary. As a deployer of Anthropic+OpenAI models, the obligation falls on them, not us — but document that we don't train.
- **CA SB 243** (chatbot companions) + **SB 53** (frontier disclosure): apply to large model devs, not us.
- **CO AI Act (SB 24-205)**: delayed to **2026-06-30**. "High-risk" = consequential decisions in employment, housing, finance, health, education, legal, essential services. A merchant-side product/pricing agent is **not high-risk**. If we ever ship hiring/credit features, it flips.
- **NYC Local Law 144**: employment AEDTs only — N/A unless we touch hiring.
- **IL HB 3773** (amends IL Human Rights Act, eff. 2026-01-01): AI in employment decisions — N/A for us.
- **Utah SB 149**: if a consumer asks "are you a bot?", we must say yes. Cheap to comply — bake into Operator system prompt.
- **EU AI Act**: Art. 50 transparency (Aug 2026) requires disclosure that a user is interacting with AI and labeling of AI-generated content. Most high-risk obligations pushed to **Dec 2027 / Aug 2028** under the Digital Omnibus. A merchant-facing storefront agent is limited-risk, not high-risk.

## Required disclosures TODAY

1. Visible "You are chatting with an AI agent" on Operator entry (CA, EU Art. 50, Utah-on-ask).
2. Pre-action confirmation for any write that touches money, customer comms, or published content. Show diff, require merchant click.
3. Logged audit trail per action (who/when/what/model/version) — required to defend negligence claims and to satisfy EU traceability.
4. No accuracy/capability numbers in marketing copy unless backed by test data on file.

## ToS language patterns that survive enforcement

- **Merchant-as-controller clause**: "Merchant directs the Agent; outputs are Merchant's published content and Merchant's act under applicable consumer law." Mirrors Shopify/Stripe pattern.
- **Human-in-the-loop carve-out**: list actions requiring merchant confirmation; disclaim liability only for confirmed actions.
- **Indemnity**: Merchant indemnifies us for (a) customer claims arising from Agent actions Merchant approved, (b) Merchant's content/products, (c) Merchant's regulatory category (alcohol, supplements, etc.). We retain liability for security breach, gross negligence, willful misconduct — courts strike pure waivers.
- **No warranty on AI output** + **cap on damages** at fees paid trailing 12mo. Standard, enforceable.
- **Disclosure flow-through**: Merchant agrees to surface AI disclosure to end-customers where law requires. Pushes Utah/CA/EU disclosure duty downstream.
- **Acceptable Use**: prohibit hiring, credit, healthcare, legal-advice use cases — keeps us out of CO AI Act high-risk and EEOC scope.

Pure "agent is autonomous, not our problem" disclaimers fail under FTC §5 and *Moffatt*. Don't try.

## Hallucination liability

Default rule from *Moffatt* + emerging negligence theory: the deployer (us + merchant jointly) owns the hallucinated output. Mitigation that actually works:
- Ground outputs in merchant's own data (RAG over their catalog) — reduces fabrication and shifts factual liability to the merchant's source-of-truth.
- Refuse-to-answer rails for shipping times, return windows, ingredient/spec claims unless pulled from a live source.
- "Confirm before send" on any customer-facing message.

## Minimum-viable safety checklist

1. AI-disclosure banner on Operator + system-prompt instruction to admit being AI on request.
2. Confirm-before-write on price, publish, email, refund, customer-data export.
3. Per-action audit log (model, prompt hash, merchant approver, timestamp).
4. Block high-risk verticals in ToS Acceptable Use (hiring, credit, health, legal, housing).
5. Indemnity + damages cap + merchant-as-controller clauses in ToS.
6. No capability metrics in marketing without a test file on disk.
7. Quarterly red-team log for prompt-injection / data-exfil — evidence of "reasonable care" under CO AI Act and FTC negligence theory.
8. Incident playbook: pause Operator, notify merchant, preserve logs, 72hr review.
9. Sub-processor list published (Anthropic, OpenAI, Printful, Shopify) for GDPR/CCPA.
10. Annual ToS review against IAPP state tracker + EU AI Act timeline.

Sources: FTC Operation AI Comply press release (2024-09); FTC v. Rite Aid (2023-12); FTC Workado / accessiBe / Evolv orders (2024–2025); Anderson v. TikTok, 3d Cir. (2024); Moffatt v. Air Canada, BC CRT (2024); Lawfare "How Existing Liability Frameworks Can Handle Agentic AI Harms"; IAPP Colorado AI Act explainer + EU AI Act compliance matrix; EFF Anderson v. TikTok amicus (2024-10-07).
