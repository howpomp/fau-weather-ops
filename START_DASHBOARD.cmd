@echo off
setlocal
cd /d "%~dp0"
echo Starting FAU Weather Operations Dashboard...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dashboard-server.ps1"
if errorlevel 1 (
  echo.
  echo The dashboard could not start. Please keep this window open and share the message above.
  pause
)
