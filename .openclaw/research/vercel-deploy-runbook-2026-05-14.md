---
title: "Vercel deploy runbook + automation — Restrepo / The Operator"
kind: ops-runbook
date: 2026-05-14
tags:
  - vercel
  - deploy
  - operations
  - byok
  - webhook-failure
  - cron-limits
related_concepts:
  - "vercel.json"
  - ".github/workflows/deploy.yml"
  - ".env.local"
  - "Vercel Pro plan"
  - "GitHub Actions"
---

# Vercel deploy runbook — Restrepo / The Operator

## TL;DR — three ways to deploy, ranked

1. **GitHub Actions auto-deploy on push** (primary) — `.github/workflows/deploy.yml` runs `vercel deploy --prod` whenever main moves. Bypasses the broken-webhook failure mode. Requires `VERCEL_TOKEN` secret in the GitHub repo.
2. **Local CLI** — `npm run deploy` (= `vercel --prod`). Fast manual fallback. Requires the Vercel CLI installed locally and `vercel link` already run once.
3. **Vercel-dashboard "Redeploy"** — only re-runs an existing deployment. Cannot deploy a new commit unless GitHub's auto-deploy webhook is firing. Last-resort manual button.

## What broke 2026-05-14 (the postmortem)

**Symptom.** Over ~21 hours, 14+ commits landed on `origin/main` (the entire BYOK migration, the Capcom-IP scrub, etc.). The Vercel dashboard showed a "Production" deployment of commit `fe1ca7a` (the most recent commit BEFORE the work started). Hard-refreshing the deployed pages still rendered the old code — sprites, Umbrella branding, the works.

**Root cause.** Vercel's GitHub auto-deploy webhook silently stopped firing on push. Every "Redeploy without cache" attempted from the dashboard rebuilt the SAME old commit (because Redeploy targets an existing deployment, not the latest tip of main).

**Diagnosis steps that worked.**

1. Compare `git rev-parse origin/main` to the SHA shown in Vercel → Deployments → top-of-list.
2. If they differ AND no deployment in the list references a SHA ≥ the missing commits, the webhook is dead.
3. In the deployments list, look for entries titled "Redeploy of X" vs ones with a `main · <SHA>` source. The last actual git-triggered build is the real "latest" that Vercel knows about.

**Recovery that worked.**

1. `npm i -g vercel`
2. `vercel link` — authenticate, link to the existing project (auto-detected via `.vercel/repo.json` if present; otherwise pick from the prompt list).
3. `vercel --prod` — uploads local code + builds + deploys. Bypasses the webhook entirely.

## The `vercel env pull` gotcha (don't fall into it again)

During `vercel link` you'll be prompted "Would you like to pull environment variables now?" and then "Found existing file '.env.local'. Do you want to overwrite?"

**Saying yes BOTH times overwrites your local `.env.local` with whatever's in Vercel's `development` environment** — which for this project was nearly empty. All local keys (ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, TENANCY_MASTER_KEY, etc.) get wiped from the local file.

**Correct path** if you want the keys you actually have in Vercel's production env:

```
vercel env pull .env.local --environment=production
```

Always specify `--environment=production` unless you specifically want the dev environment's separate set. The npm script `npm run env:pull` wraps this so you don't have to remember the flag.

## The Hobby plan cron limit (don't ship with sub-daily crons on Hobby)

Vercel Hobby allows at-most-once-per-day cron schedules. Sub-daily entries in `vercel.json` (e.g. `*/5 * * * *` or `0 * * * *`) cause `vercel --prod` to error:

> Error: Hobby accounts are limited to daily cron jobs. This cron expression (*/5 * * * *) would run more than once per day. Upgrade to the Pro plan to unlock all Cron Jobs features on Vercel.

**On this project we run sub-daily crons** for proper SaaS monitoring:
- `health-check` every 5 min — 15-min outage detection
- `spend-ceiling` hourly — fast tenant cap enforcement

Therefore **the project requires Vercel Pro**. Downgrade-to-Hobby is a one-line `vercel.json` edit (commit `22df7a9` shows the pattern) but degrades outage detection + cap enforcement to 24-hour windows.

## Required GitHub secret for the auto-deploy workflow

To use the GitHub Actions workflow you must add ONE secret to the repo:

`Settings → Secrets and variables → Actions → New repository secret`

| Name | Value | Where to get it |
|---|---|---|
| `VERCEL_TOKEN` | A token from your Vercel account | Vercel Dashboard → top-right avatar → Account Settings → Tokens → Create. Scope: full account or just the project. |

The other two values the workflow needs (`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`) are hardcoded in the workflow file because they aren't secrets — they're public identifiers visible in any Vercel URL.

## Project IDs (not secret)

```
VERCEL_ORG_ID     = team_O2QE3dej2lnTzvL05GRa0znj
VERCEL_PROJECT_ID = prj_WjEV0BLTYKnYmDukPy1FzU8K1K4V
```

These live in `.vercel/repo.json` after `vercel link` and are referenced by `.github/workflows/deploy.yml`.

## Smoke-test after any deploy

When a `vercel --prod` or GHA-triggered deploy finishes:

1. Vercel Dashboard → Deployments → confirm the SHA matches `git rev-parse origin/main`.
2. Hard-refresh `/pipeline` in an incognito window. Should show synapse animations + brand-neutral agent names (Atlas / Compass / Forge / Loom / Sentinel / Warden / Anvil / Chimera / Core Runtime / Zeno / Commander / Gideon). NO Capcom IP.
3. Hard-refresh `/dashboard`. Should render the light SaaS theme; no Umbrella backdrop.
4. Hit `/api/health`. Should return `{ "ok": true, ... }`.

## Followup automation TODOs (for future sessions)

- **Deployment drift detector**: a cron that compares Vercel's "Production" SHA (via Vercel REST API) to `git rev-parse origin/main`. If >2 commits behind, email the founder so they know the GHA workflow is failing silently.
- **Pre-deploy lint of vercel.json**: a CI step that rejects sub-daily cron schedules with a clear error so we never re-discover the Hobby limit at deploy time.
- **GHA → Slack/email on deploy failure**: hook the workflow's failure event to FOUNDER_ALERT_EMAIL so dead webhooks (or bad commits) page the founder.
