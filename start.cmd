@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Run install.cmd first or install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Dependencies missing. Running install.cmd...
  call "%~dp0install.cmd"
  if errorlevel 1 exit /b 1
)

echo Starting InFrame...
call npm run dev
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start. See messages above.
  pause
  exit /b 1
)
