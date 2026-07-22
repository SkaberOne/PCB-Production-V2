@echo off
title PCB Flow Production Suite - Serveur WEB STAGING (test :8001, base copie)
cd /d "%~dp0"

if not exist "..\.venv\Scripts\python.exe" (
    echo [ERREUR] .venv Python introuvable a la racine du projet.
    pause
    exit /b 1
)
if not exist "..\client\src\frontend\build-web-staging\index.html" (
    echo [ERREUR] Build staging absent.
    echo Lancez d'abord : client\CONSTRUIRE_WEB_STAGING.bat
    pause
    exit /b 1
)

:: --- Anti-doublon : fermer toute instance staging (:8001) deja lancee avant de relancer ---
:: (ne touche QUE le port 8001 ; la PROD sur :8000 n'est jamais visee)
echo Fermeture de toute instance staging (:8001) deja en cours...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -match 'launch\.py' -and $_.CommandLine -match 'port 8001' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Dossier du build STAGING servi par le backend
set "WEB_STATIC_DIR=%~dp0..\client\src\frontend\build-web-staging"

:: Cle STAGING (differente de la prod) : seul celui qui la connait accede a :8001
set "API_KEY=pcbflow-staging"

:: Base de TEST (copie de la prod) : les ecritures de test n'impactent JAMAIS la prod.
:: Prioritaire sur serveur\.env (config n'ecrase pas une variable deja definie).
set "DATABASE_URL=mssql+pyodbc://@localhost:1433/ECB_Production_STAGING?driver=ODBC+Driver+17+for+SQL+Server&Encrypt=no&TrustServerCertificate=yes&Trusted_Connection=yes"

echo ================================================================
echo   Serveur WEB STAGING (test) demarre sur le port 8001
echo       http://%COMPUTERNAME%:8001    (ou http://IP-DU-POSTE:8001)
echo   Cle API exigee : pcbflow-staging
echo   Base : ECB_Production_STAGING (copie isolee de la prod)
echo.
echo   La PROD (port 8000) reste intacte et separee.
echo   Pare-feu : autoriser le port 8001 en entree si test depuis un autre poste.
echo ================================================================
echo.

"..\.venv\Scripts\python.exe" launch.py --host 0.0.0.0 --port 8001

:: Serveur arrete (ou remplace par une nouvelle instance) : la fenetre se ferme
:: automatiquement, plus d'accumulation de fenetres bloquees sur "pause".
