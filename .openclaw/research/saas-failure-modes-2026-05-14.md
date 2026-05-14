---
title: "SaaS failure-mode catalog — operator rules extracted from real incidents"
kind: failure-mode-catalog
date: 2026-05-14
tags: [failure-mode, operator-rules, postmortem, saas, trust, byok, tenant-safety]
related_concepts:
  - tenant-isolation
  - kill-switch
  - staged-rollout
  - blast-radius
  - destructive-action-confirmation
  - credential-rotation
  - third-party-supply-chain
  - silent-overwrite
  - single-point-of-failure
  - byok
  - postmortem-discipline
  - operator-tools.ts
  - tenant-context.ts
---

# SaaS failure-mode catalog

## TL;DR
Every famous SaaS catastrophe in the last decade comes down to one of three shapes: (1) a destructive action ran with no kill-switch, no staged rollout, or no second confirmation; (2) trust in an upstream — a vendor, a sensor, a credential, a sub-processor — that had no monitoring of its own; or (3) the company found out about its own breach from Twitter. The operator agent's job is to refuse to be the proximate cause of any of these for our tenants.

## Incidents

### 1. CrowdStrike Falcon Channel File 291, July 2024
- **What happened.** On 19 July 2024, CrowdStrike pushed a "Rapid Response Content" update (Channel File 291) to Falcon Sensor on Windows. The sensor parsed the file in kernel mode, hit an out-of-bounds read, and BSOD'd ~8.5 million Windows machines globally inside hours. Airlines grounded, hospitals diverted, banks offline.
- **Root cause.** Mismatch between an IPC template that declared 21 input fields and sensor code that supplied only 20, plus a missing runtime array-bounds check, plus a content-validator logic bug that let the broken file pass. The same payload shipped globally with no canary.
- **Affected scale.** ~8.5M Windows endpoints; estimated $5.4B direct loss to Fortune 500; Delta alone claimed ~$500M.
- **What CrowdStrike should have done.** Treat "content" updates like code updates — staged rings, canary fleets, automated rollback on crash-rate spike. Validators must be tested against intentionally malformed inputs, not trusted to pass.
- **Operator rule extracted.** NEVER ship a config or content change to all tenants at once — every rollout must hit a single canary tenant first and wait for a health signal before fan-out.
- **Sources.** CrowdStrike RCA: https://www.crowdstrike.com/wp-content/uploads/2024/08/Channel-File-291-Incident-Root-Cause-Analysis-08.06.2024.pdf · Wikipedia: https://en.wikipedia.org/wiki/2024_CrowdStrike-related_IT_outages

### 2. Twilio Authy phone-number leak, July 2024
- **What happened.** ShinyHunters scraped 33,420,546 Authy account records (phone number, account ID, device count, status) by hammering an unauthenticated endpoint that confirmed whether a phone number was registered. CSV later dumped publicly.
- **Root cause.** A production API endpoint that took a phone number and returned account metadata required no auth. Classic over-permissive read endpoint; no rate-limit kill-switch on enumeration patterns.
- **Affected scale.** 33M users; high secondary risk because Authy users are by definition MFA-conscious targets worth phishing.
- **What Twilio should have done.** Treat any endpoint that confirms-or-denies existence of a user record as PII; require auth; rate-limit per-IP and per-fingerprint; alert on enumeration shape.
- **Operator rule extracted.** EVERY tenant-data endpoint MUST require an authenticated session-or-key; treat "lookup by external identifier" (email, phone, handle) as enumeration-attack surface and rate-limit it.
- **Sources.** TechCrunch: https://techcrunch.com/2024/07/03/twilio-says-hackers-identified-cell-phone-numbers-of-two-factor-app-authy-users/ · Twilio changelog: https://www.twilio.com/en-us/changelog/Security_Alert_Authy_App_Android_iOS

### 3. Atlassian Insight script wipe, April 2022
- **What happened.** Atlassian engineers ran a cleanup script to delete the deprecated standalone Insight app. They passed the wrong execution mode (permanent-delete instead of mark-for-delete) AND the wrong ID list (cloud-site IDs instead of app IDs). 883 customer sites were fully deleted. The first sites came back online on day 3; the last on day 14.
- **Root cause.** A single script that could both soft-delete and hard-delete based on a flag, taking ambiguous IDs that could mean "this app" or "this entire tenant." No staged execution, no dry-run, no per-tenant confirmation, no instant-rollback snapshot.
- **Affected scale.** ~400 customers fully offline, up to 14 days; long-tail churn impossible to size.
- **What Atlassian should have done.** Separate the destructive script from the routine one; require a separate code path with a second human approver for permanent deletion; restore from snapshot must be O(minutes), not O(weeks).
- **Operator rule extracted.** A single tool MUST NOT expose both reversible and irreversible modes behind a flag — irreversible actions get their own named tool with its own confirmation gate and tenant-scoped blast radius.
- **Sources.** Atlassian PIR: https://www.atlassian.com/blog/atlassian-engineering/post-incident-review-april-2022-outage · Pragmatic Engineer: https://newsletter.pragmaticengineer.com/p/scoop-atlassian

### 4. AWS S3 us-east-1, February 2017
- **What happened.** An authorized S3 engineer ran a debug-playbook command to remove a small number of billing-subsystem servers. A typo in the input list took out a far larger set, which happened to include the index and placement subsystems. S3 in us-east-1 was unavailable for ~4 hours; the index subsystem had not been restarted at scale in years and took longer to come back than anyone expected.
- **Root cause.** A correct-but-overpowered command-line tool with no input-size sanity check, and a recovery path nobody had rehearsed at scale.
- **Affected scale.** Massive — Slack, Quora, Trello, Medium, IFTTT, the AWS Status Page itself went dark. Estimated $150M+ in S&P 500 losses.
- **What AWS should have done.** Cap any single destructive command at a percentage of fleet; require a second confirmation above that cap; test cold-start of every subsystem on a routine schedule.
- **Operator rule extracted.** Any destructive action MUST have a hard ceiling (max N tenants, max X% of fleet) and require explicit re-confirmation to exceed it.
- **Sources.** AWS postmortem: https://aws.amazon.com/message/41926/

### 5. Heroku free tier shutdown, November 2022
- **What happened.** Salesforce-owned Heroku announced in Aug 2022 it would kill all free plans by 28 Nov 2022, citing "fraud and abuse." Millions of hobby apps, demo deployments, and indie SaaS staging environments went dark. The trust damage outweighed the revenue — the PaaS-for-indies center of gravity moved permanently to Railway, Fly.io, Render, Vercel.
- **Root cause.** Not a bug — a strategic decision delivered as a 90-day eviction. Former product head Craig Kerstiens described Salesforce as having starved Heroku of investment for eight years.
- **Affected scale.** Estimated millions of free apps; immeasurable ecosystem trust loss; "remember Heroku" is now shorthand for platform abandonment.
- **What Heroku should have done.** Long sunset (12+ months), grandfathered hobby tier, or migration tooling to a partner platform. The "we changed our mind, you have 90 days" framing is what broke trust.
- **Operator rule extracted.** NEVER end a tenant-facing capability with less than 90 days' notice, and ALWAYS ship an export/migration path before announcing the sunset — the agent must refuse to flip a "deprecation" flag without both.
- **Sources.** TechCrunch: https://techcrunch.com/2022/08/25/heroku-announces-plans-to-eliminate-free-plans-blaming-fraud-and-abuse/ · Heroku FAQ: https://help.heroku.com/RSBRUH58/removal-of-heroku-free-product-plans-faq

### 6. Snowflake customer credential attacks (UNC5537), 2024
- **What happened.** Threat actor UNC5537 used credentials harvested by infostealer malware (Vidar, Redline, Lumma, etc.) — some dating to 2020 — to log into Snowflake customer tenants directly. Tenants that had not rotated those credentials and had not enabled MFA were emptied. AT&T (~110M call records), Ticketmaster (~560M records), Santander, Advance Auto, LendingTree all hit.
- **Root cause.** Snowflake's platform was not breached. Snowflake's default-off MFA, lack of mandatory credential rotation, and absent network ACLs let stolen-on-someone's-laptop credentials log in unchallenged years later.
- **Affected scale.** 165+ customer tenants confirmed; hundreds of millions of consumer records; class actions across multiple jurisdictions.
- **What Snowflake should have done.** Default MFA on, mandatory rotation, IP allowlist out of the box. "Customer-configurable" security defaults that nobody configures are the platform's problem.
- **Operator rule extracted.** MFA, credential rotation, and network/IP allowlists are tenant defaults, NEVER opt-in — the operator must refuse to mark a tenant "production-ready" until all three are enforced.
- **Sources.** Mandiant/Google Cloud: https://cloud.google.com/blog/topics/threat-intelligence/unc5537-snowflake-data-theft-extortion · Wikipedia: https://en.wikipedia.org/wiki/Snowflake_data_breach

### 7. Okta / Sitel (Lapsus$), January 2022
- **What happened.** Lapsus$ RDP'd into a laptop belonging to a support engineer at Sitel, an Okta third-party customer-support sub-processor. From that laptop they had limited access to Okta's superuser tooling for ~five days. Okta's security team saw the alert on 20 Jan and terminated sessions on 21 Jan. Okta did not publicly disclose until 22 March, after Lapsus$ posted screenshots to Telegram.
- **Root cause.** A sub-processor with privileged access to customer tenants, weak endpoint hygiene on the contractor's laptop, and Okta's internal decision to handle the incident quietly via Sitel rather than disclose.
- **Affected scale.** Initially "up to 366 customers"; final scope two tenants; long-tail damage was the credibility hit from the two-month silence.
- **What Okta should have done.** Treat any breach of a sub-processor with tenant access as a tenant-disclosable event within the SLA window, regardless of confirmed impact. Sub-processors with admin power must meet the same endpoint controls as employees.
- **Operator rule extracted.** When ANY upstream the operator depends on (Printful, Shopify, Stripe, BYOK provider) discloses a security event, the operator must surface a tenant-facing notice within 24 hours — silence is the failure mode.
- **Sources.** Okta investigation: https://www.okta.com/blog/2022/03/oktas-investigation-of-the-january-2022-compromise/ · Dark Reading: https://www.darkreading.com/cyberattacks-data-breaches/okta-says-366-customers-impacted-via-third-party-breach

### 8. LastPass vault exfiltration, August–December 2022
- **What happened.** Incident 1: an attacker compromised a LastPass software engineer's corporate laptop, stole source code and an encrypted backup key. Incident 2: using info from incident 1, the attacker compromised a DevOps engineer's *personal* computer via an unpatched Plex CVE (CVE-2020-5741, two years old), installed a keylogger, captured the LastPass master credentials, and downloaded encrypted customer vault backups from AWS S3 between 8–22 Sept 2022.
- **Root cause.** A privileged-engineer personal device sat on the trust path to production backups, was not centrally managed, and ran an unpatched two-year-old CVE. The backup encryption key existed in a place a single laptop could reach.
- **Affected scale.** All paying LastPass customer vaults (≈25M+) encrypted-but-stolen; $24.5M class-action settlement; brand effectively destroyed in security circles.
- **What LastPass should have done.** Privileged production access only from managed, attested, patched devices. Backup encryption keys separated from the data plane by an HSM or KMS the engineer cannot directly reach.
- **Operator rule extracted.** Tenant secrets (BYOK keys, OAuth tokens) MUST live in a managed secret store the operator agent reaches only by scoped, audited calls — never copied into env files, logs, prompts, or scratch files.
- **Sources.** Wikipedia: https://en.wikipedia.org/wiki/2022_LastPass_data_breach · LastPass blog: https://blog.lastpass.com/posts/security-incident-update-recommended-actions

### 9. Cloudflare regex CPU outage, July 2019
- **What happened.** On 2 July 2019, Cloudflare deployed a new WAF managed rule containing a regex with catastrophic backtracking. The rule was pushed globally in one go. CPU pegged on every node serving HTTPS; Cloudflare-fronted sites returned 502 for ~27 minutes. ~10% of the web went dark.
- **Root cause.** A regex engine (PCRE) with unbounded backtracking + a deployment pipeline with no staged rollout for WAF rules + no per-node CPU kill-switch on rule evaluation.
- **Affected scale.** Estimated 10M+ RPS impacted; 27 minutes; widespread enough to be visible on Downdetector worldwide.
- **What Cloudflare should have done.** Stage WAF rules through dogfood → 1% → 10% → global; budget CPU per rule and trip a circuit-breaker when exceeded; use a regex engine with linear-time guarantees (re2/Rust regex).
- **Operator rule extracted.** EVERY operator-authored rule or template that runs in a tenant's hot path must have a per-tenant resource budget and a circuit-breaker that disables that rule (not the tenant) when the budget is exceeded.
- **Sources.** Cloudflare blog: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/

### 10. GitLab.com database wipe, January 2017
- **What happened.** Late at night, an on-call engineer trying to clean up a stuck PostgreSQL replica ran `rm -rf /var/opt/gitlab/postgresql/data/*` on the wrong host — primary instead of secondary. ~300 GB of production data evaporated. Of five configured backup mechanisms, all five had been silently broken for weeks/months. Recovery came from a 6-hour-old staging snapshot. 5,000 projects, 700 user accounts, and a day of issues/comments were permanently lost.
- **Root cause.** Two identical-looking terminals, sudo on a destructive command, and backup systems with no alerting on failure. Discovery happened during the incident, not during routine drills.
- **Affected scale.** 6 hours of permanent data loss across all GitLab.com tenants; 18 hours of downtime; the postmortem livestream became famous, which is the only reason GitLab survived it.
- **What GitLab should have done.** Routinely restore from each backup to a scratch environment, alarming on any restore that fails or produces a stale dataset. Make destructive commands on primaries require a typed hostname confirmation.
- **Operator rule extracted.** A backup is not a backup until a restore has been tested end-to-end — the operator must run a tenant-data restore drill on a cadence and refuse to call the system "backed up" without a recent successful restore.
- **Sources.** GitLab postmortem: https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/ · The Register: https://www.theregister.com/2017/02/01/gitlab_data_loss/

### 11. Optus, September 2022
- **What happened.** An unauthenticated public API endpoint at Optus (`/users/{userId}`-shape) returned full customer records — name, DOB, address, passport, driver-licence numbers — for any sequential integer ID. An attacker enumerated 1, 2, 3, … and walked out with ~10M records, roughly a third of Australia's population.
- **Root cause.** A test endpoint accidentally exposed in production with (a) no authentication, (b) sequential integer IDs instead of UUIDs (IDOR), and (c) no anomaly detection on a single client pulling sequential records.
- **Affected scale.** 9.8M customers; AU$140M+ direct cost; ongoing class action; passport/licence reissue costs pushed to government and consumers.
- **What Optus should have done.** No production endpoint without auth, ever. Random IDs not sequential. Egress anomaly detection. A code-review gate that blocks any route exposed without an explicit auth middleware.
- **Operator rule extracted.** When the operator scaffolds a tenant's API or storefront, EVERY route must be auth-gated by default and IDs in URLs must be opaque (UUID/cuid), not enumerable — the agent refuses to ship otherwise.
- **Sources.** Wikipedia: https://en.wikipedia.org/wiki/2022_Optus_data_breach · UpGuard: https://www.upguard.com/blog/how-did-the-optus-data-breach-happen

### 12. Boeing 737 MAX MCAS (the SaaS analogue), 2018–2019
- **What happened.** Boeing added MCAS, an automatic nose-down trim system, to make the 737 MAX feel like older 737s. Late in development, engineers removed the second trigger (G-force) so MCAS was activated by a *single* angle-of-attack sensor reading. Pilots were not told MCAS existed in the standard manuals. Two crashes (Lion Air JT610, Ethiopian ET302) killed 346 people when a single failed sensor commanded repeated nose-down trim and pilots could not figure out what was fighting them.
- **Root cause.** A safety-critical action triggered by a single sensor; an invisible automatic behavior the operator was not told existed; a probability analysis ("once per 223 trillion hours") that nobody flight-tested.
- **Affected scale.** 346 deaths; ~20-month global grounding; ~$20B direct cost to Boeing; existential brand damage.
- **What Boeing should have done.** Require agreement from two independent sensors before any safety-critical automatic action. Disclose every automatic behavior to the operator. Flight-test the failure modes, not just the happy path.
- **Operator rule extracted.** ANY automatic, invisible action the operator takes on a tenant's behalf (publishing a product, charging a card, deleting a draft, rotating a token) must be (a) logged to a tenant-visible audit feed, (b) reversible within one click, and (c) gated by at least two independent signals — never a single sensor like "user said yes once in chat."
- **Sources.** Seattle Times: https://www.seattletimes.com/business/boeing-aerospace/failed-certification-faa-missed-safety-issues-in-the-737-max-system-implicated-in-the-lion-air-crash/ · Wikipedia: https://en.wikipedia.org/wiki/Maneuvering_Characteristics_Augmentation_System

### 13. `vercel link` silent `.env.local` overwrite (today's footgun)
- **What happened.** Starting with Vercel CLI v49.1.2, running `vercel link --yes` (or in some TTY paths, plain `vercel link`) implicitly pulls remote env vars and silently overwrites the local `.env.local`. Today's recovery cost Karling ~2 hours and a chunk of trust in the operator advisor that suggested it.
- **Root cause.** A "convenience" auto-action attached to a command whose name (`link`) gives no hint it will write to disk. No prompt, no diff, no backup. Issue #15713 tracks this; users have been asking for a `--silent` / `--no-env-pull` flag.
- **Affected scale.** Every developer who's run the command since v49.1.2; per-incident cost is small but trust-corrosive — the agent did this to its own founder.
- **What Vercel should have done.** Name-action match (a command called `link` should not write to disk). Prompt-by-default with diff. `--no-env-pull` flag.
- **Operator rule extracted.** BEFORE running any tool the operator knows can overwrite a tenant file on disk (`.env.local`, `shopify.app.toml`, `theme.liquid`, etc.), the agent MUST diff the current contents and back them up to a timestamped sidecar — and announce both in chat.
- **Sources.** Vercel issue #15713: https://github.com/vercel/vercel/issues/15713 · CLI docs: https://vercel.com/docs/cli/pull

## Synthesized operator hard rules

1. **NEVER push a change to all tenants in one shot.** *Why:* CrowdStrike, Cloudflare 2019 — global fan-out turns a small bug into an extinction event. *Fires when:* the operator generates any code, theme, config, prompt, or rule that would apply to >1 tenant. The change ships to one canary tenant, waits for a health signal, then fans out.

2. **Destructive and non-destructive actions live in separate, separately-named tools.** *Why:* Atlassian 2022 — one flag flipped soft-delete to hard-delete on 400 tenants. *Fires when:* the operator authors any internal tool. `delete-draft` and `purge-tenant` cannot be the same tool with a mode argument.

3. **Hard ceiling on any destructive action; second confirmation to exceed.** *Why:* AWS S3 2017, GitLab 2017. *Fires when:* a tool affects >1 tenant or >N records. Default ceiling baked into `operator-tools.ts`; ceiling overrides require typed-string confirmation from the user.

4. **MFA, credential rotation, opaque IDs, auth-by-default on every route — these are tenant defaults, not options.** *Why:* Snowflake, Optus, Twilio Authy. *Fires when:* the operator scaffolds a new tenant store, route, or webhook. A tenant cannot be marked production-ready without all four green.

5. **Tenant secrets live in a managed secret store; never in env files, logs, prompts, or scratch files.** *Why:* LastPass 2022. *Fires when:* the operator handles a BYOK key, OAuth token, or webhook secret. Read-only scoped access via `tenant-context.ts`; redact from any LLM-visible surface.

6. **A backup is not a backup until a restore has been tested.** *Why:* GitLab 2017 (five backup methods, all silently broken). *Fires when:* a tenant onboards or a major data action runs. Routine restore drill to a scratch environment; alarm on failure.

7. **Every automatic action the operator takes is logged to a tenant-visible audit feed and is one-click reversible.** *Why:* Boeing MCAS, Replit AI deletion. *Fires when:* the operator publishes, charges, deletes, rotates, or mutates anything on the tenant's account. The audit row writes BEFORE the action, not after.

8. **No safety-critical action on a single signal.** *Why:* Boeing MCAS again — one bad AoA sensor killed 346 people. *Fires when:* the operator is about to take an irreversible action based on one chat turn, one webhook, one env var. Require an independent second signal (re-confirmation, a sanity-check API call, a state-machine guard).

9. **Diff and back up before writing to a tenant file on disk.** *Why:* the `vercel link` event of 2026-05-14. *Fires when:* any tool can touch `.env.local`, `shopify.app.toml`, theme files, or anything inside the tenant's repo. Timestamped sidecar + announced diff.

10. **Sunset with 90 days' notice and an export path, or don't sunset.** *Why:* Heroku free tier. *Fires when:* a feature, plan, or capability is being deprecated. The agent refuses to flip the deprecation flag without both gates.

11. **When an upstream we depend on has a security event, tenants hear about it within 24 hours.** *Why:* Okta/Sitel two-month silence. *Fires when:* the operator's incident-monitor detects a postmortem or breach disclosure from Shopify, Printful, Stripe, the BYOK provider, or any other dependency. Tenant-facing notice within the SLA.

12. **Bound every rule, template, and prompt with a per-tenant resource budget and a circuit-breaker that disables the rule, not the tenant.** *Why:* Cloudflare regex 2019. *Fires when:* the operator deploys a generated artifact (regex, query, prompt, cron) into a tenant hot path. CPU/time/cost budget enforced at the runtime, not in spec.

## Cross-incident patterns

1. **Global fan-out without staged rollout.** CrowdStrike, Cloudflare 2019, Atlassian, Heroku, AWS S3. The deployment mechanism is the weapon — every one of these would have been a small incident if the change had hit 1% before 100%.

2. **A "convenience" action with hidden destructive side effects.** Atlassian's dual-mode script, Vercel's `link`, Replit's agent inside a code freeze, AWS's playbook command. The user's mental model of the verb does not match what the verb actually does.

3. **A single sensor / single credential / single laptop as the safety boundary.** Boeing MCAS, LastPass DevOps engineer, Okta/Sitel contractor, Snowflake credentials with no MFA. One thing failed and there was no second thing.

4. **Backups, monitoring, or alerting that nobody verified actually works.** GitLab's five-failed-backups, CrowdStrike's validator that didn't validate, Optus's missing egress anomaly detection. The supposed safety net had a hole the size of the incident.

5. **Silence as the failure mode.** Okta sat on the disclosure for two months; Shopify, Twilio, and Snowflake all initially denied or downplayed; Boeing didn't tell pilots MCAS existed. In every case the silence cost more trust than the original event.

## What this changes about our operator

1. **`operator-tools.ts` gets a destructive-tool registry.** Every tool declares whether it's reversible, what its blast radius is (per-product, per-tenant, cross-tenant), and what its hard ceiling is. The chat loop refuses to call any tool whose blast radius exceeds the ceiling without an explicit user re-confirmation. Direct consequence of incidents 3, 4, 10.

2. **`tenant-context.ts` becomes the single read path for secrets.** No tool reads `process.env.*` for tenant-specific values; everything goes through scoped, audited accessors. Direct consequence of incident 8 and the `vercel link` event.

3. **Every operator action writes an audit row BEFORE it executes.** The tenant has a visible "what the operator did on my behalf" feed in the dashboard, and every row has a one-click "undo" or "explain" button. Direct consequence of incidents 12 (Boeing) and the Replit AI deletion. This is the MCAS lesson translated to SaaS: invisible automatic action is the failure mode.

4. **The operator gets a `pre_write_diff` hook on any tool that touches tenant files.** Diff is computed, sidecar backup is written, both are reported in chat before the write commits. Direct consequence of today's `vercel link` incident — the operator should refuse to participate in that class of footgun for tenants.

5. **CEREBRO grows an "incident-mirror" cron** that watches Shopify, Printful, Stripe, Vercel, and BYOK-provider status pages and security blogs; any postmortem there auto-files a tenant-facing notice draft within the operator's 24-hour disclosure window. Direct consequence of incident 7 (Okta silence). The operator never lets a tenant find out from Hacker News.
