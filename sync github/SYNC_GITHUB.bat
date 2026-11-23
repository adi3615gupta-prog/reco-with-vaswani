@echo off
setlocal enabledelayedexpansion
title Vaswani Enterprise - GitHub Sync Manager

:: Locate Repository Root Directory
cd /d "%~dp0"
if exist "..\.git" (
    cd /d ".."
)

:MENU
cls
echo ==============================================================================
echo             VASWANI RETURN ENTERPRISE - GITHUB SYNC UTILITY
echo ==============================================================================
echo  Repository Root: %CD%
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if not defined CURRENT_BRANCH set CURRENT_BRANCH=main
echo  Active Branch  : %CURRENT_BRANCH%
echo ==============================================================================
echo.
echo   [1] QUICK PUSH  - Stage all (git add .), Commit ("today work"), Push to main
echo   [2] PULL        - Fetch and Pull latest updates from origin main
echo   [3] FULL SYNC   - Pull from origin main, then Commit and Push
echo   [4] GIT STATUS  - Check modified/untracked files and recent commits
echo   [5] EXIT
echo.
set /p CHOICE="Select an option (1-5) [Default: 1]: "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" goto :QUICK_PUSH
if "%CHOICE%"=="2" goto :PULL
if "%CHOICE%"=="3" goto :FULL_SYNC
if "%CHOICE%"=="4" goto :STATUS
if "%CHOICE%"=="5" goto :EOF
echo.
echo Invalid selection. Please choose 1 to 5.
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
echo                           PULL LATEST FROM GITHUB
echo ==============================================================================
echo.
echo Pulling latest commits from origin main...
git pull origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Git pull failed! Please check for merge conflicts or connection issues.
) else (
    echo.
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
echo [Step 1/4] Pulling latest changes from origin main...
git pull origin main
if errorlevel 1 (
    echo.
    echo [WARNING] Pull reported issues. Review before proceeding.
    pause
    goto :MENU
)

echo.
echo [Step 2/4] Staging local changes (git add .)...
git add .

echo.
set /p MSG="Enter commit message (Press Enter for 'sync work'): "
if "%MSG%"=="" set MSG=sync work

echo.
echo [Step 3/4] Committing local changes...
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
echo [Step 4/4] Pushing to origin main...
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
