# ========================================================
# AUDIT WITH VASWANI - PC Migration Preparation Script
# Run this on your OLD PC before transferring to NEW PC
# ========================================================

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-Header "AUDIT WITH VASWANI - Preparing Files for Migration"

# 1. Checkpoint SQLite WAL (network_data.db)
Write-Host "[1/3] Flushing and checkpointing SQLite database (network_data.db)..." -ForegroundColor Green
try {
    & node "$PSScriptRoot\scripts\checkpoint_db.cjs"
} catch {
    Write-Host "[-] Note: SQLite checkpoint encountered an issue. Ensure node servers are stopped before copying files." -ForegroundColor Yellow
}

# 2. Backup Antigravity and GSD AI Configuration (~/.gemini)
Write-Host ""
Write-Host "[2/3] Backing up Antigravity AI agent, GSD skills, plugins, and MCP configs..." -ForegroundColor Green

$GeminiSourceConfig = Join-Path $HOME ".gemini\config"
$GeminiSourceSettings = Join-Path $HOME ".gemini\antigravity-cli\settings.json"
$BackupTarget = Join-Path $PSScriptRoot "_migration_ai_config"

if (!(Test-Path $BackupTarget)) {
    New-Item -ItemType Directory -Path $BackupTarget -Force | Out-Null
}

if (Test-Path $GeminiSourceConfig) {
    $TargetConfig = Join-Path $BackupTarget "config"
    Copy-Item -Path $GeminiSourceConfig -Destination $TargetConfig -Recurse -Force
    Write-Host "[+] Backed up ~/.gemini/config (GSD skills, agents, plugins, MCP config) -> _migration_ai_config\config" -ForegroundColor Green
} else {
    Write-Host "[-] Warning: ~/.gemini/config not found at $GeminiSourceConfig" -ForegroundColor Yellow
}

if (Test-Path $GeminiSourceSettings) {
    Copy-Item -Path $GeminiSourceSettings -Destination (Join-Path $BackupTarget "settings.json") -Force
    Write-Host "[+] Backed up settings.json -> _migration_ai_config\settings.json" -ForegroundColor Green
}

# 3. Provide Summary and Next Steps
Write-Header "Migration Package Ready!"

Write-Host "All local databases, GSD milestones, and AI agent skills are staged for transfer." -ForegroundColor Green
Write-Host ""
Write-Host "TRANSFER RECOMMENDATION:" -ForegroundColor Yellow
Write-Host "  1. Close running node / dev servers: 'taskkill /F /IM node.exe' (optional)." -ForegroundColor White
Write-Host "  2. Copy the entire project folder to your External Drive / USB." -ForegroundColor White
Write-Host "     * TIP: You can SKIP the 'node_modules' folder to save 1 GB+ and transfer in seconds!" -ForegroundColor Cyan
Write-Host "  3. On the NEW PC:" -ForegroundColor White
Write-Host "     - Step A: Run 'restore_dependencies.bat' (installs Node, Python, npm, Playwright, pip)." -ForegroundColor White
Write-Host "     - Step B: Run 'restore_ai_config.bat' (restores Antigravity GSD skills and settings)." -ForegroundColor White
Write-Host "     - Step C: Run 'START_APP.bat' or 'npm run dev' to resume immediately!" -ForegroundColor Green
Write-Host ""

Write-Host "Preparation completed successfully." -ForegroundColor Cyan
