@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - Cloudflare Pages 1-Click Deployer

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" (
    cd /d ".."
)

cls
echo ==============================================================================
echo             VASWANI ENTERPRISE - CLOUDFLARE PAGES 1-CLICK DEPLOYER
echo ==============================================================================
echo  Repository Root: %CD%
echo ==============================================================================
echo.

:: 1. Check or load project name from config (Default: finpulse)
set PROJECT_NAME=
if exist ".cloudflare_project" (
    set /p PROJECT_NAME=<.cloudflare_project
)
if "!PROJECT_NAME!"=="" set PROJECT_NAME=finpulse

echo Cloudflare Pages Project: !PROJECT_NAME!
echo.

:: 2. Build Check
echo [1/2] Checking production build (dist/)...
if not exist "dist\index.html" (
    echo 'dist' folder not found. Building production assets (npm run build)...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed! Please resolve build errors before deploying.
        pause
        exit /b 1
    )
) else (
    echo Production build found in dist\ directory.
    set /p REBUILD="Do you want to re-build before deploying? (y/N) [Default: N]: "
    if /i "!REBUILD!"=="y" (
        echo Re-building fresh assets...
        call npm run build
        if errorlevel 1 (
            echo [ERROR] Build failed!
            pause
            exit /b 1
        )
    )
)

echo.
echo [2/2] Deploying 'dist' folder to Cloudflare Pages (!PROJECT_NAME!)...
echo.

call npx --yes wrangler@3 pages deploy dist --project-name="!PROJECT_NAME!" --commit-dirty=true
if errorlevel 1 (
    echo.
    echo ==============================================================================
    echo                 [ERROR] CLOUDFLARE DEPLOYMENT ENCOUNTERED AN ISSUE!
    echo ==============================================================================
    echo - Make sure project '!PROJECT_NAME!' exists in Cloudflare Pages dashboard.
    echo - If logged out, run: npx wrangler@3 login
) else (
    echo.
    echo ==============================================================================
    echo                 [SUCCESS] DEPLOYED LIVE TO CLOUDFLARE!
    echo ==============================================================================
    echo Your updated Web software is now LIVE on Cloudflare!
)

echo.
pause
