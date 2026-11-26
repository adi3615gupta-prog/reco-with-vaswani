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

:: Check for uncommitted local changes
set HAS_DIRTY=0
for /f "tokens=*" %%x in ('git status --porcelain 2^>nul') do set HAS_DIRTY=1

set AUTO_STASHED=0
if "%HAS_DIRTY%"=="1" (
    echo [INFO] Uncommitted local modifications detected.
    echo Stashing your local work safely before pulling to prevent overwrite conflicts...
    git stash push -m "Auto-stashed by PULL.bat at %TIME%" >nul 2>&1
    if not errorlevel 1 set AUTO_STASHED=1
    echo.
)

echo [1/2] Fetching and pulling latest updates from origin main...
git pull origin main
set PULL_STATUS=%ERRORLEVEL%

if "%AUTO_STASHED%"=="1" (
    echo.
    echo Restoring your uncommitted local modifications (git stash pop)...
    git stash pop
    if errorlevel 1 (
        echo.
        echo [NOTICE] Some stashed changes had merge overlaps with incoming commits.
        echo Please review git status to inspect conflicting files.
    ) else (
        echo [SUCCESS] Local changes restored cleanly on top of latest commits!
    )
)

echo.
if not "%PULL_STATUS%"=="0" (
    echo ==============================================================================
    echo                 [ERROR] PULL ENCOUNTERED ISSUES!
    echo ==============================================================================
    echo Please verify network connectivity or check if there are merge conflicts.
) else (
    echo [2/2] Current repository status:
    git status -s
    echo.
    echo ==============================================================================
    echo                 [SUCCESS] PULL COMPLETED FROM MAIN!
    echo ==============================================================================
)

echo.
pause
