# CEREBRO Bootstrap - Restrepo brand brain via Graphify
#
# Run from the project root with elevated permissions:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-cerebro.ps1
#
# Idempotent. Safe to re-run.

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([int]$n, [string]$msg)
    Write-Host ''
    Write-Host "==== [$n] $msg ====" -ForegroundColor Cyan
}

function Write-Ok   { param([string]$m) Write-Host "  OK   $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "  WARN $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "  FAIL $m" -ForegroundColor Red }

# Step 1 - Python version check
Write-Step 1 'Verifying Python 3.10 or newer'

$python = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    try {
        $version = & $cmd --version 2>&1
        if ($version -match 'Python (\d+)\.(\d+)') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 10) {
                $python = $cmd
                Write-Ok "$cmd -> $version"
                break
            } else {
                Write-Warn "$cmd is $version - need 3.10 or newer"
            }
        }
    } catch { }
}

if (-not $python) {
    Write-Fail 'Python 3.10 or newer not found'
    Write-Host ''
    Write-Host 'MANUAL STEP REQUIRED:'
    Write-Host '  Install Python 3.10+ from https://www.python.org/downloads/'
    Write-Host '  During install, CHECK the box "Add Python to PATH"'
    Write-Host '  Then re-run this script.'
    exit 1
}

# Step 2 - Install graphifyy
Write-Step 2 'Installing graphifyy from PyPI'

try {
    $existing = & $python -m pip show graphifyy 2>$null
    if ($existing) {
        Write-Ok 'graphifyy already installed - upgrading'
        & $python -m pip install --upgrade graphifyy
    } else {
        & $python -m pip install graphifyy
    }
    Write-Ok 'graphifyy installed'
} catch {
    Write-Fail "pip install failed: $_"
    Write-Host ''
    Write-Host 'MANUAL STEP - try running this directly to see the error:'
    Write-Host "  $python -m pip install graphifyy"
    exit 1
}

# Step 3 - graphify install
Write-Step 3 'Running graphify install for Claude Code integration'

try {
    & graphify install
    Write-Ok 'graphify install complete'
} catch {
    Write-Warn "graphify install threw: $_"
    Write-Warn 'Often safe on re-runs. Run "graphify --help" to verify CLI works.'
}

# Step 4 - Verify CLI
Write-Step 4 'Verifying graphify CLI is reachable'

try {
    $help = & graphify --help 2>&1
    if ($help -match 'graphify') {
        Write-Ok 'graphify CLI responds to --help'
    }
} catch {
    Write-Fail "graphify CLI not reachable: $_"
    Write-Warn 'You may need to restart your terminal so PATH refreshes.'
}

# Final help block - here-string keeps PS 5.1 from re-parsing inside
$next = @'

===========================================
 CEREBRO INSTALL DONE - NEXT STEPS
===========================================

1. RESTART your terminal so PATH picks up the graphify command.

2. Build the initial graph - this takes 5 to 15 minutes for a typical repo:
     cd <project-root>
     graphify .

   Output lands in graphify-out\:
     graph.html       - interactive visualization
     GRAPH_REPORT.md  - core nodes, surprises, suggested questions
     graph.json       - queryable knowledge graph
     cache\           - incremental cache

3. Open graph.html in your browser to see CEREBRO's first map of itself.

4. Try a query:
     graphify query "how does the chest mark embroidery work"

5. Future - set up Obsidian export to keep the vault in sync.

THEN ASK CLAUDE TO TAKE OVER:
  Type: cerebro installed, run the first build and show me a query

'@
Write-Host $next

