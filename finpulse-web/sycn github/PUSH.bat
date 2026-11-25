@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - Git Push to GitHub (main)

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" (
    cd /d ".."
)

cls
echo ==============================================================================
echo                 GIT PUSH - VASWANI RETURN ENTERPRISE
echo ==============================================================================
echo  Repository Root: %CD%
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if not defined CURRENT_BRANCH set CURRENT_BRANCH=main
echo  Active Branch  : %CURRENT_BRANCH%
echo ==============================================================================
echo.

echo [1/4] Pending changes:
git status -s
echo.

set /p MSG="Enter commit message (Press Enter for 'today work'): "
if "%MSG%"=="" set MSG=today work

echo.
echo [2/4] Staging all files (git add .)...
git add .

echo.
echo [3/4] Committing changes (git commit -m "%MSG%")...
git commit -m "%MSG%"

:: If on another branch, merge to main
for /f "tokens=*" %%b in ('git branch --show-current 2^>nul') do set CB=%%b
if not defined CB set CB=main
if not "%CB%"=="main" (
    echo.
    echo Switching to main and merging %CB%...
    git checkout main
    git merge %CB%
)

echo.
echo [4/4] Pushing to GitHub (git push origin main)...
git push origin main
if errorlevel 1 (
    echo.
    echo ==============================================================================
    echo                 [ERROR] PUSH FAILED!
    echo ==============================================================================
    echo Please verify your internet connection or GitHub repository access rights.
) else (
    echo.
    echo ==============================================================================
    echo                 [SUCCESS] PUSH COMPLETED TO MAIN!
    echo ==============================================================================
)

echo.
pause
