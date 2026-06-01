@echo off
REM ============================================================
REM  restart_serveur.bat - Tue le serveur et le relance
REM  Usage: double-cliquer depuis l'explorateur
REM ============================================================

cd /d "%~dp0"

echo === Recherche du process sur port 8000 ===
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo Tue PID %%a
    taskkill /F /PID %%a 2>nul
)

timeout /t 2 /nobreak > nul

echo.
echo === Lancement du serveur ===
call serveur\DEMARRER_SERVEUR.bat
