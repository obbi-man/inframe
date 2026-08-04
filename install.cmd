@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  === InFrame install ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install Node.js LTS 20+ from https://nodejs.org and reopen this window.
  echo.
  pause
  exit /b 1
)

echo Node.js:
node -v
echo npm:
npm -v
echo.

echo Installing dependencies (first run may take a few minutes^)...
call npm install
if errorlevel 1 goto try_mirror

call node scripts\ensure-electron.cjs
if errorlevel 1 goto try_mirror
if not exist "node_modules\electron\dist\electron.exe" goto try_mirror

echo.
echo Done. Start the app with start.cmd
echo.
pause
exit /b 0

:try_mirror
echo.
echo Default download failed or Electron binary missing.
echo Retrying with Electron mirror...
echo.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install failed even with mirror.
  echo Check internet / VPN / firewall and try again.
  echo.
  pause
  exit /b 1
)

call node scripts\ensure-electron.cjs
if errorlevel 1 (
  echo [ERROR] Electron binary still missing.
  pause
  exit /b 1
)

echo.
echo Done. Start the app with start.cmd
echo.
pause
exit /b 0
