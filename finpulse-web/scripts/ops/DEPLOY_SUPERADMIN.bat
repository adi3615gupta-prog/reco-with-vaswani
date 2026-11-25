@echo off
title Deploy Super Admin Portal to Firebase Hosting
cd /d "%~dp0admin-web"

echo ========================================================
echo   Building and Deploying Super Admin Portal to Firebase
echo ========================================================
echo.

echo 1. Building admin-web...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Deploying to Firebase Hosting (reco-vaswani-license)...
call npx --yes firebase-tools deploy --only hosting
if %errorlevel% neq 0 (
    echo.
    echo [!] Authentication required. Opening Google Login in your browser...
    call npx --yes firebase-tools login
    echo.
    echo Re-trying deployment...
    call npx --yes firebase-tools deploy --only hosting
)

echo.
echo ========================================================
echo   Deployment Complete! 
echo   Visit: https://reco-vaswani-license.web.app
echo ========================================================
pause
