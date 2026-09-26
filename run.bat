@echo off
setlocal
title NeuroBeat AI - Neurorehabilitation Platform

echo =====================================================================
echo                    NEUROBEAT AI PLATFORM LAUNCHER
echo =====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Clean up any existing instances on port 5000
echo [1/3] Checking and freeing port 5000...
powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 5000 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0" >nul 2>&1

:: 2. Set environment variables
echo [2/3] Configuring environment variables...
set "SESSION_SECRET=neurobeat-secure-session-secret-key-32chars"
set "PORT=5000"

:: Ensure instance folder exists for SQLite DB
if not exist "instance" mkdir "instance"

:: 3. Launch NeuroBeat Flask Application (Port 5000)
echo [3/3] Starting NeuroBeat Web Application on http://localhost:5000 ...

if exist ".\.venv\Scripts\python.exe" (
    start "NeuroBeat Web Server (Port 5000)" cmd /k "cd /d "%SCRIPT_DIR%" && .\.venv\Scripts\python.exe main.py"
    goto :SERVER_STARTED
)

where uv >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "NeuroBeat Web Server (Port 5000)" cmd /k "cd /d "%SCRIPT_DIR%" && uv run python main.py"
    goto :SERVER_STARTED
)

start "NeuroBeat Web Server (Port 5000)" cmd /k "cd /d "%SCRIPT_DIR%" && python main.py"

:SERVER_STARTED
echo.
echo =====================================================================
echo                    NEUROBEAT IS NOW RUNNING!
echo =====================================================================
echo   - Web Application: http://localhost:5000
echo   - Local Health:    http://localhost:5000/
echo.
echo Launching your default web browser to http://localhost:5000 ...
ping 127.0.0.1 -n 3 >nul
start http://localhost:5000

echo.
echo ---------------------------------------------------------------------
echo Keep this window open while using NeuroBeat.
echo Press ANY KEY at any time to STOP the server.
echo ---------------------------------------------------------------------
pause >nul

echo.
echo Shutting down NeuroBeat services...
powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 5000 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0" >nul 2>&1
taskkill /fi "WINDOWTITLE eq NeuroBeat Web Server*" /t /f >nul 2>&1

echo Services stopped cleanly.
ping 127.0.0.1 -n 2 >nul
exit /b 0
