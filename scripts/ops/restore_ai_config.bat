@echo off
echo ========================================================
echo   AUDIT WITH VASWANI - Restore AI Config Wrapper
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore_ai_config.ps1"
