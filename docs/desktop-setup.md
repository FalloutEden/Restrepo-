# Desktop setup runbook

How to clone, configure, and run this project on a second machine
(e.g., the 7900 XTX desktop) so it matches the laptop development
environment.

Both repos live on GitHub:

| Repo | URL |
|---|---|
| **Main project** | `github.com/FalloutEden/Restrepo-` |
| **Obsidian vault** (private) | `github.com/FalloutEden/Restrepo-Vault` |

`graphify-out/*` is gitignored in both repos — each machine builds its
own merged brain locally from the source markdown + code via
[scripts/cerebro-update.sh](../scripts/cerebro-update.sh).

## One-time install

```bash
# Auth gh CLI on this box
gh auth login

# Clone both repos. The project can live anywhere; the vault should sit
# under your home dir so the scripts find it without env overrides.
gh repo clone FalloutEden/Restrepo- "$HOME/Restrepo-"
gh repo clone FalloutEden/Restrepo-Vault "$HOME/Documents/Restrepo-Vault/Restrepo-_Vault"

# Install JS deps
cd "$HOME/Restrepo-"
npm install

# Install graphify (the CEREBRO graph builder) globally
pip install --upgrade graphify
# OR: pipx install graphify
```

## Environment variables

`.env.local` is **not** in git — it carries secrets. Two ways to get it
onto this machine:

**Option A — pull from Vercel (recommended).** Durable; updates flow
through whenever you rotate keys in the Vercel dashboard.

```bash
npm install -g vercel
vercel login
npm run env:pull
```

**Option B — manual copy.** Faster but stale the moment you rotate any
key. Copy `.env.local` from the source machine's project root via USB,
OneDrive, or `scp`.

## Build the merged brain

The operator queries one graph (`graphify-out/graph.json`) that's the
union of the project code graph + the Obsidian vault graph. The script
does both rebuilds and the merge in one command.

```bash
cd "$HOME/Restrepo-"
bash scripts/cerebro-update.sh
```

If your vault clone lives somewhere other than the default path
(`$HOME/Documents/Restrepo-Vault/Restrepo-_Vault`), override
via env var:

```bash
VAULT_PATH="C:/your/other/path" bash scripts/cerebro-update.sh
```

Re-run after major commits so the operator's brain stays current —
the graphify post-commit hook only rebuilds the project graph, which
silently drops vault content from `graph.json`.

## Verify

```bash
# Type check + tests
npm test

# Dev server
npm run dev
# Browse http://localhost:3000/dashboard
```

If the brain heartbeat panel on `/dashboard` is blank with no values,
check the CSP gotcha in
[reference_dev_csp_eval_gotcha.md](../../../.claude/projects/c--Agents-Restrepo-/memory/reference_dev_csp_eval_gotcha.md)
of the auto-memory store — `'unsafe-eval'` must be in `script-src` in
dev (handled in `next.config.ts`, gated by `NODE_ENV === "development"`).

## Day-to-day

```bash
cd "$HOME/Restrepo-"
git pull
npm install  # always — cheap if no-op, painful when skipped after a dep bump
bash scripts/cerebro-update.sh  # if you want the latest vault notes in the brain
npm run dev
```

If you make changes you want on the other machine, the normal cycle:

```bash
git add <files>
git commit -m "..."
git push
# on the other machine:
git pull
```

The vault is independent — same flow, just inside the vault dir:

```bash
cd "$HOME/Documents/Restrepo-Vault/Restrepo-_Vault"
git add <changed-notes>
git commit -m "..."
git push
```
