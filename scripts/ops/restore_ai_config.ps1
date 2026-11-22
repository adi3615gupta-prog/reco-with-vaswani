# ========================================================
# AUDIT WITH VASWANI - Restore AI Config for New PC
# Run this on your NEW PC to restore Antigravity & GSD
# ========================================================

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-Header "Restoring Antigravity & GSD AI Configuration"

$BackupSource = Join-Path $PSScriptRoot "_migration_ai_config"

if (!(Test-Path $BackupSource)) {
    Write-Host "[-] ERROR: _migration_ai_config directory not found!" -ForegroundColor Red
    Write-Host "    Make sure you ran 'prepare_migration.bat' on your old PC before copying." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    Exit
}

# 1. Restore ~/.gemini/config
$DestGeminiConfig = Join-Path $HOME ".gemini\config"
if (!(Test-Path $DestGeminiConfig)) {
    New-Item -ItemType Directory -Path $DestGeminiConfig -Force | Out-Null
}

$SourceConfig = Join-Path $BackupSource "config"
if (Test-Path $SourceConfig) {
    Copy-Item -Path "$SourceConfig\*" -Destination $DestGeminiConfig -Recurse -Force
    Write-Host "[+] Restored GSD skills, agents, plugins, and MCP configs to $DestGeminiConfig" -ForegroundColor Green
} else {
    Write-Host "[-] Warning: config folder not found inside _migration_ai_config." -ForegroundColor Yellow
}

# 2. Restore ~/.gemini/antigravity-cli/settings.json
$DestCliDir = Join-Path $HOME ".gemini\antigravity-cli"
if (!(Test-Path $DestCliDir)) {
    New-Item -ItemType Directory -Path $DestCliDir -Force | Out-Null
}

$SourceSettings = Join-Path $BackupSource "settings.json"
if (Test-Path $SourceSettings) {
    Copy-Item -Path $SourceSettings -Destination (Join-Path $DestCliDir "settings.json") -Force
    Write-Host "[+] Restored Antigravity settings to $DestCliDir\settings.json" -ForegroundColor Green
}

# 3. Verification
Write-Host ""
Write-Host "Verifying GSD skills on New PC..." -ForegroundColor Yellow
$SkillsCount = (Get-ChildItem -Path "$DestGeminiConfig\skills" -Directory -ErrorAction SilentlyContinue).Count
Write-Host "[+] Detected $SkillsCount GSD skills available in Antigravity!" -ForegroundColor Green

Write-Host ""
Write-Host "[+++] AI ENVIRONMENT RESTORED SUCCESSFULLY! [+++]" -ForegroundColor Green
Write-Host "You can now open Antigravity IDE and invoke /gsd-plan-phase, /gsd-execute-phase, etc." -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit..."
