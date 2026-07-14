@echo off
echo ========================================================
echo   RECO WITH VASWANI - Dependency Restoration Wrapper
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore_dependencies.ps1"
