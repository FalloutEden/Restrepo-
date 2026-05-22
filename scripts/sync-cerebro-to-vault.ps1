# Sync the latest CEREBRO graph artifacts into the Obsidian vault so notes
# and graph live side by side. Idempotent. Run after any 'graphify extract'
# or 'graphify cluster-only' refresh.
#
# Paths are resolved relative to this script's location and the current
# user's profile, so it works on any box without edits. Override with env
# vars if your layout differs:
#   $env:RESTREPO_VAULT = 'D:\some\other\vault\Restrepo-_Vault'
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\sync-cerebro-to-vault.ps1

$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$src = Join-Path $projectRoot 'graphify-out'

$defaultVault = Join-Path $env:USERPROFILE 'Documents\Restrepo-Vault\Restrepo-_Vault'
$vaultRoot = if ($env:RESTREPO_VAULT) { $env:RESTREPO_VAULT } else { $defaultVault }
$dst = Join-Path $vaultRoot '05-CEREBRO'

Write-Host "src:   $src"
Write-Host "vault: $vaultRoot"
Write-Host "dst:   $dst"
Write-Host ""

if (-not (Test-Path $src)) {
    Write-Host "ERROR: $src does not exist. Run 'graphify extract .' first." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $vaultRoot)) {
    Write-Host "ERROR: vault not found at $vaultRoot" -ForegroundColor Red
    Write-Host "       Set `$env:RESTREPO_VAULT or clone the vault to the default path." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $dst)) {
    New-Item -Path $dst -ItemType Directory -Force | Out-Null
    Write-Host "Created $dst"
}

# Files to mirror into the vault
$files = @(
    'GRAPH_REPORT.md',
    'graph.html',
    'manifest.json',
    'merged-graph.json'
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

This folder mirrors selected outputs from the project's `graphify-out/`.

- `GRAPH_REPORT.md` — human-readable summary: god nodes, surprising connections, community breakdown
- `graph.html` — interactive visualization (open in browser)
- `manifest.json` / `merged-graph.json` — raw graph state for downstream tools

## How to refresh

After code changes in the project:
```powershell
cd <project-root>
graphify update .              # AST-only, no API cost
# OR for full semantic re-extract (~$6 on this repo):
graphify extract . --backend claude
graphify cluster-only .        # regenerates report + html
```

Then from the project root:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-cerebro-to-vault.ps1
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
