@echo off
title PCB Flow Production Suite - Client
cd /d "%~dp0.."

echo.
echo ========================================
echo   PCB Flow Production Suite - CLIENT
echo ========================================
echo.

:: Charger config client (ignore les lignes de commentaire commencant par #)
if exist "client.env" (
    for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v /b /c:"#" "client.env"`) do (
        set "%%A=%%B"
    )
)

echo [INFO] Serveur cible : %REACT_APP_API_URL%
echo.

:: Verifier si app Electron packagee existe
if exist "dist\\PCB Flow Production Suite.exe" (
    echo [MODE] Application packagee detectee
    echo Lancement...
    start "" "dist\\PCB Flow Production Suite.exe"
    goto end
)

:: Mode dev : verifier node_modules
echo [MODE] Lancement en mode developpement
if not exist "src\\frontend\\node_modules" (
    echo [INFO] node_modules absent - installation...
    cd src\frontend
    npm install
    cd ..\..
)
if not exist "src\\desktop\\node_modules" (
    cd src\desktop
    npm install
    cd ..\..
)

:: Copier client.env vers .env du frontend
copy /y client.env src\frontend\.env >nul 2>&1

echo.
echo Demarrage Electron + React...
echo Le navigateur : Chrome recommande (http://localhost:3000)
echo Ctrl+C pour arreter.
echo.

cd src\desktop
start "ECB - Serveur React (ne pas fermer)" npm run start:web

:: Attendre que le serveur React (localhost:3000) soit reellement pret
:: avant de lancer Electron (la 1ere compilation peut prendre ~30s).
echo Attente du demarrage de React (localhost:3000)...
set /a _tries=0
:wait_react
curl -s -o nul http://localhost:3000 >nul 2>&1
if not errorlevel 1 goto react_ready
set /a _tries+=1
if %_tries% geq 60 (
    echo [ERREUR] React n'a pas demarre dans le temps imparti.
    echo Verifiez la fenetre "ECB - Serveur React".
    pause
    goto end
)
timeout /t 2 /nobreak >nul
goto wait_react

:react_ready
echo [OK] Serveur React pret. Lancement de l'application...
npm start

:end
echo.
echo === Client arrete ===
pause
