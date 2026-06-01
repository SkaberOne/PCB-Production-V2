@echo off
REM ============================================================
REM  auto_push.bat - Pousse les commits vers GitHub
REM  Usage: double-cliquer depuis l'explorateur de fichiers
REM ============================================================

cd /d "%~dp0"

echo === Status local ===
git status --short
echo.

echo === Branche courante ===
git rev-parse --abbrev-ref HEAD
echo.

echo === Push vers origin ===
git push origin HEAD
if errorlevel 1 (
    echo.
    echo [ERREUR] Push echoue. Verifier:
    echo  - branche distante existe
    echo  - droits Git memorisees
    echo  - reseau / firewall
    pause
    exit /b 1
)

echo.
echo === Push reussi ===
pause
