@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - GitHub & Cloudflare Sync Manager

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" (
    cd /d ".."
)

:MENU
cls
echo ==============================================================================
echo             VASWANI RETURN ENTERPRISE - GITHUB & CLOUDFLARE SYNC
echo ==============================================================================
echo  Repository Root: %CD%
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if not defined CURRENT_BRANCH set CURRENT_BRANCH=main
echo  Active Branch  : %CURRENT_BRANCH%
echo ==============================================================================
echo.
echo   [1] QUICK PUSH       - Stage all (git add .), Commit ("today work"), Push to main
echo   [2] PULL             - Safe Pull with Auto-Stash from origin main
echo   [3] FULL SYNC        - Pull latest from main, merge local work, and Push
echo   [4] GIT STATUS       - Check modified/untracked files and recent commits
echo   [5] DEPLOY CLOUDFLARE- 1-Click build and direct push to Cloudflare Pages
echo   [6] EXIT
echo.
set /p CHOICE="Select an option (1-6) [Default: 1]: "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" goto :QUICK_PUSH
if "%CHOICE%"=="2" goto :PULL
if "%CHOICE%"=="3" goto :FULL_SYNC
if "%CHOICE%"=="4" goto :STATUS
if "%CHOICE%"=="5" goto :CLOUDFLARE
if "%CHOICE%"=="6" goto :EOF
echo.
echo Invalid selection. Please choose 1 to 6.
timeout /t 2 >nul
goto :MENU

:QUICK_PUSH
cls
echo ==============================================================================
echo                            QUICK PUSH TO GITHUB
echo ==============================================================================
echo.
echo Checking changed files:
git status -s
echo.
set /p MSG="Enter commit message (Press Enter for 'today work'): "
if "%MSG%"=="" set MSG=today work

echo.
echo [1/3] Staging changes (git add .)...
git add .

echo.
echo [2/3] Committing changes (git commit -m "%MSG%")...
git commit -m "%MSG%"

:: If on another branch, merge to main so push origin main receives the commit
for /f "tokens=*" %%b in ('git branch --show-current 2^>nul') do set CB=%%b
if not defined CB set CB=main
if not "%CB%"=="main" (
    echo.
    echo Switching to main and fast-forwarding from %CB%...
    git checkout main
    git merge %CB%
)

echo.
echo [3/3] Pushing to origin main...
git push origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Git push encountered an error! Check your network or GitHub access.
) else (
    echo.
    echo [SUCCESS] Successfully pushed changes to origin main!
)
echo.
pause
goto :MENU

:PULL
cls
echo ==============================================================================
echo                           SAFE PULL FROM GITHUB
echo ==============================================================================
echo.

set HAS_DIRTY=0
for /f "tokens=*" %%x in ('git status --porcelain 2^>nul') do set HAS_DIRTY=1

set AUTO_STASHED=0
if "%HAS_DIRTY%"=="1" (
    echo [INFO] Uncommitted local modifications detected.
    echo Stashing your local work safely before pulling to prevent overwrite conflicts...
    git stash push -m "Auto-stashed by SYNC_GITHUB.bat at %TIME%" >nul 2>&1
    if not errorlevel 1 set AUTO_STASHED=1
    echo.
)

echo Pulling latest commits from origin main...
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
    echo [ERROR] Git pull failed! Please check for merge conflicts or connection issues.
) else (
    echo [SUCCESS] Successfully updated from origin main!
)
echo.
pause
goto :MENU

:FULL_SYNC
cls
echo ==============================================================================
echo                           FULL TWO-WAY SYNC
echo ==============================================================================
echo.
set HAS_DIRTY=0
for /f "tokens=*" %%x in ('git status --porcelain 2^>nul') do set HAS_DIRTY=1

set AUTO_STASHED=0
if "%HAS_DIRTY%"=="1" (
    echo [Step 1/5] Local modifications detected. Stashing safely before pull...
    git stash push -m "Auto-stashed by FULL_SYNC at %TIME%" >nul 2>&1
    if not errorlevel 1 set AUTO_STASHED=1
)

echo [Step 2/5] Pulling latest changes from origin main...
git pull origin main
if errorlevel 1 (
    echo [WARNING] Pull reported issues. Review before proceeding.
    if "%AUTO_STASHED%"=="1" git stash pop >nul 2>&1
    pause
    goto :MENU
)

if "%AUTO_STASHED%"=="1" (
    echo.
    echo Restoring local changes...
    git stash pop
)

echo.
echo [Step 3/5] Staging local changes (git add .)...
git add .

set /p MSG="Enter commit message (Press Enter for 'sync work'): "
if "%MSG%"=="" set MSG=sync work

echo.
echo [Step 4/5] Committing local changes...
git commit -m "%MSG%"

:: If on another branch, merge to main
for /f "tokens=*" %%b in ('git branch --show-current 2^>nul') do set CB=%%b
if not defined CB set CB=main
if not "%CB%"=="main" (
    echo Switching to main...
    git checkout main
    git merge %CB%
)

echo.
echo [Step 5/5] Pushing to origin main...
git push origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed!
) else (
    echo.
    echo [SUCCESS] Full two-way sync completed successfully!
)
echo.
pause
goto :MENU

:CLOUDFLARE
cls
if exist "DEPLOY_CLOUDFLARE.bat" (
    call "DEPLOY_CLOUDFLARE.bat"
) else if exist "sycn github\DEPLOY_CLOUDFLARE.bat" (
    call "sycn github\DEPLOY_CLOUDFLARE.bat"
) else (
    echo [ERROR] DEPLOY_CLOUDFLARE.bat not found!
    pause
)
goto :MENU

:STATUS
cls
echo ==============================================================================
echo                              GIT STATUS
echo ==============================================================================
echo.
git status
echo.
echo ------------------------------------------------------------------------------
echo Recent 5 Commits:
echo ------------------------------------------------------------------------------
git log --oneline -5
echo.
pause
goto :MENU
