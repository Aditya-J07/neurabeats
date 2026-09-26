@echo off
setlocal
title Nuro-Beats Unified Launcher

echo =====================================================================
echo                    NURO-BEATS UNIFIED LAUNCHER
echo =====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Clean up any existing instances on ports 8000 and 5000
echo [1/4] Checking and freeing ports 8000 and 5000...
powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 8000, 5000 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0" >nul 2>&1

:: 2. Set environment variables
echo [2/4] Setting environment variables...
set "SESSION_SECRET=super_secret_session_key_123"
set "JWT_SECRET_KEY=super_secret_jwt_key_456"
set "PORT=8000"

:: Ensure instance folder exists for SQLite DB
if not exist "instance" mkdir "instance"

:: Ensure frontend dependencies are installed
if not exist "frontend-react\node_modules" goto :INSTALL_DEPS
goto :CHECK_MODEL

:INSTALL_DEPS
echo Installing frontend dependencies, please wait...
cd frontend-react
call npm.cmd install
cd /d "%SCRIPT_DIR%"

:CHECK_MODEL
if not exist "frontend-react\public\models\pose_landmarker_full.task" (
    echo [WARNING] MediaPipe pose_landmarker_full.task not found in frontend-react\public\models\
)

:: 3. Launch Backend API (Port 8000)
echo [3/4] Starting API Backend on http://localhost:8000 ...

where uv >nul 2>&1
if %ERRORLEVEL% EQU 0 goto :RUN_UV
if exist ".\.venv\Scripts\python.exe" goto :RUN_VENV
goto :RUN_PYTHON

:RUN_UV
start "Nuro-Beats Backend (Port 8000)" cmd /k "cd /d "%SCRIPT_DIR%" && set SESSION_SECRET=super_secret_session_key_123 && set JWT_SECRET_KEY=super_secret_jwt_key_456 && set PORT=8000 && uv run python api_main.py"
goto :START_FRONTEND

:RUN_VENV
start "Nuro-Beats Backend (Port 8000)" cmd /k "cd /d "%SCRIPT_DIR%" && set SESSION_SECRET=super_secret_session_key_123 && set JWT_SECRET_KEY=super_secret_jwt_key_456 && set PORT=8000 && .\.venv\Scripts\python.exe api_main.py"
goto :START_FRONTEND

:RUN_PYTHON
start "Nuro-Beats Backend (Port 8000)" cmd /k "cd /d "%SCRIPT_DIR%" && set SESSION_SECRET=super_secret_session_key_123 && set JWT_SECRET_KEY=super_secret_jwt_key_456 && set PORT=8000 && python api_main.py"

:START_FRONTEND
:: 4. Launch Frontend Dev Server (Port 5000)
echo [4/4] Starting React/Vite Frontend on http://localhost:5000 ...
start "Nuro-Beats Frontend (Port 5000)" cmd /k "cd /d "%SCRIPT_DIR%frontend-react" && npm run dev"

echo.
echo =====================================================================
echo                NURO-BEATS IS RUNNING!
echo =====================================================================
echo   - Web Application: http://localhost:5000
echo   - Backend API:     http://localhost:8000
echo   - API Health:      http://localhost:8000/api/health
echo.
echo Launching your default web browser to http://localhost:5000 ...
ping 127.0.0.1 -n 4 >nul
start http://localhost:5000

echo.
echo ---------------------------------------------------------------------
echo Keep this window open while using Nuro-Beats.
echo Press ANY KEY at any time to STOP both Backend and Frontend servers.
echo ---------------------------------------------------------------------
pause >nul

echo.
echo Shutting down Nuro-Beats services...
powershell -NoProfile -Command "try { Get-NetTCPConnection -LocalPort 8000, 5000 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0" >nul 2>&1
taskkill /fi "WINDOWTITLE eq Nuro-Beats Backend*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Nuro-Beats Frontend*" /t /f >nul 2>&1

echo Services stopped cleanly.
ping 127.0.0.1 -n 2 >nul
exit /b 0

