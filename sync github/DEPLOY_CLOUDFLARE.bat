@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - Cloudflare Pages 1-Click Deployer

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" cd /d ".."

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

echo Cloudflare Pages Target Project: !PROJECT_NAME!
echo.

:: 2. Always build fresh production bundle before deploying
echo [1/2] Compiling latest production assets (npm run build)...
call npm run build
if errorlevel 1 goto :BUILD_FAIL

:: 3. Deploy to Cloudflare Pages
echo.
echo [2/2] Deploying fresh 'dist' to Cloudflare Pages: !PROJECT_NAME!...
echo.

call npx --yes wrangler@3 pages deploy dist --project-name="!PROJECT_NAME!" --commit-dirty=true
if errorlevel 1 goto :DEPLOY_FAIL

echo.
echo ==============================================================================
echo                 [SUCCESS] DEPLOYED LIVE TO CLOUDFLARE!
echo ==============================================================================
echo Your updated Web software is now LIVE on Cloudflare!
echo URL: https://www.finpulse.co.in
echo ==============================================================================
goto :END

:BUILD_FAIL
echo.
echo ==============================================================================
echo                 [ERROR] BUILD FAILED!
echo ==============================================================================
echo Please resolve any build errors before deploying.
goto :END

:DEPLOY_FAIL
echo.
echo ==============================================================================
echo                 [ERROR] CLOUDFLARE DEPLOYMENT ENCOUNTERED AN ISSUE!
echo ==============================================================================
echo 1. Make sure you are logged in: npx wrangler@3 login
echo 2. Verify project '!PROJECT_NAME!' exists in your Cloudflare dashboard.
goto :END

:END
echo.
pause
