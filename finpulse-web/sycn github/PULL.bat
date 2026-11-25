@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - Git Pull from GitHub (main)

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" (
    cd /d ".."
)

cls
echo ==============================================================================
echo                 GIT PULL - VASWANI RETURN ENTERPRISE
echo ==============================================================================
echo  Repository Root: %CD%
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if not defined CURRENT_BRANCH set CURRENT_BRANCH=main
echo  Active Branch  : %CURRENT_BRANCH%
echo ==============================================================================
echo.

echo [1/2] Fetching and pulling latest updates from origin main...
git pull origin main
if errorlevel 1 (
    echo.
    echo ==============================================================================
    echo                 [ERROR] PULL ENCOUNTERED ISSUES!
    echo ==============================================================================
    echo Please verify network connectivity or check if there are merge conflicts.
) else (
    echo.
    echo [2/2] Current repository status:
    git status -s
    echo.
    echo ==============================================================================
    echo                 [SUCCESS] PULL COMPLETED FROM MAIN!
    echo ==============================================================================
)

echo.
pause
