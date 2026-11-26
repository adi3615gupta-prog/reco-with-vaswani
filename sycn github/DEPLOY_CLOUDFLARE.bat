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

:: 1. Check or load project name from config
set PROJECT_NAME=
if exist ".cloudflare_project" (
    set /p PROJECT_NAME=<.cloudflare_project
)

if "%PROJECT_NAME%"=="" (
    echo [SETUP] Please enter your Cloudflare Pages Project Name.
    echo (You can find this in Cloudflare Dashboard - Workers ^& Pages)
    echo Example: finpulse or reco-vaswani
    echo.
    set /p PROJECT_NAME="Enter Cloudflare Project Name: "
    if "!PROJECT_NAME!"=="" (
        echo [ERROR] Project name cannot be empty!
        pause
        exit /b 1
    )
    echo !PROJECT_NAME!>.cloudflare_project
    echo Saved project name '!PROJECT_NAME!' to .cloudflare_project
    echo.
) else (
    echo Cloudflare Pages Project: !PROJECT_NAME!
    echo (To change this, edit or delete the file .cloudflare_project)
    echo.
)

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
echo (If you are deploying for the first time, a browser window will open to authorize Cloudflare)
echo.

call npx --yes wrangler pages deploy dist --project-name="!PROJECT_NAME!" --commit-dirty=true
if errorlevel 1 (
    echo.
    echo ==============================================================================
    echo                 [ERROR] CLOUDFLARE DEPLOYMENT ENCOUNTERED AN ISSUE!
    echo ==============================================================================
    echo - Make sure project '!PROJECT_NAME!' exists in Cloudflare Pages dashboard.
    echo - Check your internet connection or run: npx wrangler login
) else (
    echo.
    echo ==============================================================================
    echo                 [SUCCESS] DEPLOYED LIVE TO CLOUDFLARE!
    echo ==============================================================================
    echo Your updated Web software is now LIVE on Cloudflare!
)

echo.
pause
