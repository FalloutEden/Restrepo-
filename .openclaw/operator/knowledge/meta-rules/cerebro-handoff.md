# CEREBRO — The Restrepo brand brain

**What it is:** A Graphify-based knowledge graph that ingests this codebase, the Obsidian vault, docs, and (eventually) conversation history. Agents query it to retrieve relevant context instead of carrying everything in window.

**Tagline for non-technical users:** "It's the agent's memory between conversations. You write notes in Obsidian; CEREBRO remembers them and connects them."

## Install state checks

Before doing anything CEREBRO-related, run:

```bash
graphify --help    # if this errors, CEREBRO isn't installed yet
```

If not installed: tell the user to run `powershell -ExecutionPolicy Bypass -File .\scripts\install-cerebro.ps1` from the project root. Don't try to install Python or graphifyy yourself — that needs admin rights on Windows.

## What you can automate (do without asking)

- `graphify .` — rebuild the graph after codebase or vault changes
- `graphify query "<question>"` — retrieve context for a user's question
- `graphify path "<from>" "<to>"` — find the connection path between two concepts
- `graphify explain` — describe a specific node
- Reading `graphify-out/GRAPH_REPORT.md` to find "god nodes" and "surprises"
- Mirroring memory writes to both the source folder AND the Obsidian vault
- Updating `00-Index.md` in the vault when adding new memory notes

## What requires the human (manual gate, ask first)

- **Installing Python** — admin install, user must do via python.org
- **Brain name change** — currently CEREBRO; if user wants to rename it, do a sed across vault + CLAUDE.md + this file
- **Multi-brand routing** — currently one graph per project. To add a second brand's graph, the user has to decide naming + folder structure
- **Obsidian app actions** — opening graph view, installing Graphify plugin (the vault plugin, separate from the Python tool), turning on community plugins
- **STDP weighting layer** — multi-week build, do not start without explicit user approval
- **Anything that costs money to compute** — Graphify uses the user's existing LLM API key. Large repo builds can spend $1-5. Get approval before triggering a full rebuild on a 1000+ file repo

## Quality bar — what "good" looks like

A good CEREBRO query response surfaces 2-4 relevant nodes with their connecting edges. If the response is:
- One isolated node — graph might not have ingested the right files; suggest a rebuild
- 50+ nodes — query was too broad; narrow the question
- Zero results — concept isn't in the graph yet; capture it as a memory note first

## Pre-stage workflow (what the agent does before answering the user)

When the user asks a question that might benefit from CEREBRO context:

1. Run `graphify query "<distilled question>"` quietly
2. Read the top 2-3 nodes returned + their edges
3. Compose the answer using that context PLUS any current conversation state
4. Cite the source nodes in the answer ("per `[[reference_bv_bg_composite_recipe]]`...")

If the user explicitly says "use CEREBRO" or "check the brain" — always run a query first, even if you think you know the answer. They're testing the integration.

## When NOT to use CEREBRO

- Pure code edits where the file is already open — just edit, no need to query
- Trivia / general knowledge that has nothing to do with this project
- Time-sensitive operations (live API calls, webhook responses)
- When the user is mid-flow on a specific task — don't break their concentration with a "let me check the brain" pause

## Failure modes seen

(populated as we encounter them — currently empty, fresh install)
