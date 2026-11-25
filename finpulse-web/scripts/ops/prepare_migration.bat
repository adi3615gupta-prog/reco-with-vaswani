@echo off
echo ========================================================
echo   AUDIT WITH VASWANI - Prepare Migration Wrapper
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare_migration.ps1"
