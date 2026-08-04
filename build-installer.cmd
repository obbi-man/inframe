@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  call "%~dp0install.cmd"
  if errorlevel 1 exit /b 1
)

set "OUT=%TEMP%\inframe-release"
if exist "%OUT%" rmdir /s /q "%OUT%" 2>nul

echo Building Windows installer (output: %%TEMP%%\inframe-release^)...
call npm run build
if errorlevel 1 (
  echo [ERROR] Frontend build failed.
  pause
  exit /b 1
)

call npx electron-builder --win --config.directories.output="%OUT%"
if errorlevel 1 (
  echo [ERROR] electron-builder failed.
  pause
  exit /b 1
)

if not exist "%~dp0release" mkdir "%~dp0release"
copy /Y "%OUT%\InFrame-Setup-*.exe" "%~dp0release\" >nul
copy /Y "%OUT%\InFrame-Portable-*.exe" "%~dp0release\" >nul

echo.
echo Done. Installers copied to:
echo   %~dp0release
explorer "%~dp0release"
pause
