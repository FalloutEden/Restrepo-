#!/bin/sh
# Rebuild the project graph AND merge in the Obsidian vault graph so the
# operator's cerebro_query tool sees both. The default graphify post-commit
# hook only rebuilds the project's graph — that wipes vault content from
# graphify-out/graph.json on every commit. Run this script instead (or wire
# it into your workflow) when you want the operator to see your vault notes.
#
# Usage:
#   scripts/cerebro-update.sh
#
# Override vault location:
#   VAULT_PATH="/some/other/vault" scripts/cerebro-update.sh
set -eu

# Force UTF-8 for all Python I/O. graphify's merge/report steps default to the
# Windows cp1252 charmap, which crashes on unicode in notes (→, ✅, em-dash, etc.)
# with UnicodeEncodeError. PYTHONUTF8=1 makes those steps handle unicode cleanly.
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

VAULT_PATH="${VAULT_PATH:-/c/Users/karli/Documents/Restrepo-Vault/Restrepo-_Vault}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_GRAPH="$PROJECT_ROOT/graphify-out/graph.json"
VAULT_GRAPH="$VAULT_PATH/graphify-out/graph.json"
MERGED="$PROJECT_ROOT/graphify-out/merged-graph.json"

if [ ! -d "$VAULT_PATH" ]; then
  echo "[cerebro-update] vault not found at $VAULT_PATH" >&2
  echo "[cerebro-update] set VAULT_PATH or skip the merge — exiting non-zero" >&2
  exit 2
fi

echo "[cerebro-update] step 1/4: rebuild project graph"
cd "$PROJECT_ROOT" && graphify update . > /dev/null 2>&1

echo "[cerebro-update] step 2/4: rebuild vault graph ($VAULT_PATH)"
cd "$VAULT_PATH" && graphify update . > /dev/null 2>&1

echo "[cerebro-update] step 3/4: merge project + vault graphs"
cd "$PROJECT_ROOT" && graphify merge-graphs "$PROJECT_GRAPH" "$VAULT_GRAPH" --out "$MERGED" 2>&1 | tail -3 || true

echo "[cerebro-update] step 4/4: replace project graph with merged"
cp "$MERGED" "$PROJECT_GRAPH"

# Report final counts so the user sees what happened
python -c "
import json
with open('$PROJECT_GRAPH') as f:
    g = json.load(f)
print(f'[cerebro-update] graph.json now has {len(g[\"nodes\"])} nodes, {len(g[\"links\"])} links')
" 2>/dev/null || echo "[cerebro-update] (could not report final node count — python unavailable)"
