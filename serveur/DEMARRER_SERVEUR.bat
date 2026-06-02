@echo off
title ECB Production Manager - Serveur API
cd /d "%~dp0"

:: Neutraliser une variable d'environnement API_KEY polluee (ex: gabarit
:: non resolu "${user_config.api_key}") qui ecrase le .env et force l'auth.
:: Vide ici => auth desactivee en local, conforme a API_KEY= du .env.
set "API_KEY="

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

:: venv attendu a la racine du projet (parent de serveur/)
if exist "..\\.venv\\Scripts\\python.exe" (
    set PYTHON_EXE="..\\.venv\\Scripts\\python.exe"
    echo [OK] .venv trouve
    goto check_uvicorn
)

echo [ERREUR] Aucun .venv Python trouve a la racine du projet.
echo Lancez serveur\INSTALLER_SERVEUR.bat pour installer les dependances.
pause
exit /b 1

:check_uvicorn
:: Verifier si les dependances sont deja installees (demarrage rapide).
:: Si oui : on saute le pip install (qui prenait 1-2 min a chaque lancement).
%PYTHON_EXE% -c "import uvicorn, fastapi" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Dependances deja installees
    goto run_server
)

echo Premier lancement : installation des dependances (peut prendre 1-2 min)...
%PYTHON_EXE% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERREUR] pip install echoue.
    echo Lancez serveur\INSTALLER_SERVEUR.bat pour reparer l'installation.
    pause
    exit /b 1
)
echo [OK] Dependances installees

:run_server
echo.
echo Demarrage du serveur sur http://localhost:8000
echo Swagger UI : http://localhost:8000/docs
echo Ctrl+C pour arreter.
echo.

%PYTHON_EXE% launch.py --no-reload

echo.
echo === Serveur arrete ===
pause
