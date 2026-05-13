# Sync the latest CEREBRO graph artifacts into the Obsidian vault so notes
# and graph live side by side. Idempotent. Run after any 'graphify extract'
# or 'graphify cluster-only' refresh.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-cerebro-to-vault.ps1

$ErrorActionPreference = 'Stop'

$src = 'C:\Agents\Restrepo-\graphify-out'
$dst = 'C:\Users\karli\Documents\Restrepo-Vault\Restrepo-_Vault\05-CEREBRO'

if (-not (Test-Path $src)) {
    Write-Host "ERROR: $src does not exist. Run 'graphify extract .' first." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $dst)) {
    New-Item -Path $dst -ItemType Directory -Force | Out-Null
    Write-Host "Created $dst"
}

# Files to mirror into the vault
$files = @(
    'GRAPH_REPORT.md',
    'graph.html'
)

foreach ($f in $files) {
    $srcFile = Join-Path $src $f
    $dstFile = Join-Path $dst $f
    if (Test-Path $srcFile) {
        Copy-Item $srcFile $dstFile -Force
        $size = (Get-Item $dstFile).Length
        Write-Host "  OK $f ($size bytes)"
    } else {
        Write-Host "  SKIP $f (not in graphify-out)" -ForegroundColor Yellow
    }
}

# Write a README in the CEREBRO folder explaining what's here
$readme = @'
# CEREBRO — Knowledge Graph Artifacts

This folder mirrors selected outputs from `C:\Agents\Restrepo-\graphify-out\`.

- `GRAPH_REPORT.md` — human-readable summary: god nodes, surprising connections, community breakdown
- `graph.html` — interactive visualization (open in browser)

## How to refresh

After code changes in the project:
```powershell
cd C:\Agents\Restrepo-
graphify update .              # AST-only, no API cost
# OR for full semantic re-extract (~$6 on this repo):
graphify extract . --backend claude
graphify cluster-only .        # regenerates report + html
```

Then:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Agents\Restrepo-\scripts\sync-cerebro-to-vault.ps1
```

## Querying from the agent

The Claude Code PreToolUse hook auto-reminds the agent to consult the graph
before doing grep/find searches. The agent uses these commands directly:

- `graphify explain "<concept>"` — node + neighbors
- `graphify query "<question>"` — BFS traversal
- `graphify path "<A>" "<B>"` — shortest path between two concepts
- `graphify update .` — refresh after code changes (no API cost)
'@

Set-Content -Path (Join-Path $dst 'README.md') -Value $readme -Encoding utf8
Write-Host "  OK README.md"

Write-Host ""
Write-Host "CEREBRO synced to vault at:" -ForegroundColor Green
Write-Host "  $dst"
