@echo off
title AUDIT WITH VASWANI - 1-Click Unified Server
cd /d "%~dp0"
cls
echo ==============================================================================
echo             AUDIT WITH VASWANI - 1-CLICK ALL-IN-ONE LAUNCHER
echo ==============================================================================
echo.
echo [1/3] Checking and clearing port conflicts (Port 3001 & 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo   - Clearing stale backend on port 3001 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo   - Clearing stale frontend on port 8080 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/3] All ports ready! Starting Backend (3001) + Frontend (8080) + Cloud Tunnel...
echo [3/3] Opening browser at http://localhost:8080 ...
start "" "http://localhost:8080"

echo.
npm start
pause
