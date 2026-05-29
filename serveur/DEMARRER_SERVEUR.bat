@echo off
title ECB Production Manager - Serveur API
cd /d "%~dp0"

echo.
echo ========================================
echo   ECB Production Manager - SERVEUR
echo ========================================
echo.

:: Verifier .env
if not exist ".env" (
    echo [ERREUR] Fichier .env introuvable dans serveur\.
    echo Creez le fichier .env a partir du modele dans ce dossier.
    echo.
    pause
    exit /b 1
)
echo [OK] .env trouve

:: === Recherche du venv Python ===
set PYTHON_EXE=

:: 1. venv V2 (racine du projet)
if exist "..\\.venv\\Scripts\\python.exe" (
    set PYTHON_EXE="..\\.venv\\Scripts\\python.exe"
    echo [OK] .venv V2 trouve
    goto check_uvicorn
)

:: 2. venv dans l'ancien dossier (fallback)
if exist "C:\\Users\\Eric\\Documents\\Programme VS Code\\PCB Production (outdated)\\.venv\\Scripts\\python.exe" (
    set PYTHON_EXE="C:\\Users\\Eric\\Documents\\Programme VS Code\\PCB Production (outdated)\\.venv\\Scripts\\python.exe"
    echo [OK] .venv (outdated) trouve - utilise comme fallback
    goto check_uvicorn
)

echo [ERREUR] Aucun .venv Python trouve.
echo Lancez serveur\INSTALLER_SERVEUR.bat pour installer les dependances.
pause
exit /b 1

:check_uvicorn
:: Installer/mettre a jour toutes les dependances depuis requirements.txt
echo Installation des dependances...
%PYTHON_EXE% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERREUR] pip install echoue.
    pause
    exit /b 1
)
echo [OK] Dependances OK

echo.
echo Demarrage du serveur sur http://localhost:8000
echo Swagger UI : http://localhost:8000/docs
echo Ctrl+C pour arreter.
echo.

%PYTHON_EXE% launch.py --no-reload

echo.
echo === Serveur arrete ===
pause
