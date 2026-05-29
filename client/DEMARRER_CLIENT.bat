@echo off
title ECB Production Manager - Client
cd /d "%~dp0"

echo.
echo ========================================
echo   ECB Production Manager - CLIENT
echo ========================================
echo.

:: Charger config client
if exist "client.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("client.env") do (
        if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
    )
)

echo [INFO] Serveur cible : %REACT_APP_API_URL%
echo.

:: Verifier si app Electron packagee existe
if exist "dist\\ECB Production Manager.exe" (
    echo [MODE] Application packagee detectee
    echo Lancement...
    start "" "dist\\ECB Production Manager.exe"
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
start npm run start:web
ping -n 4 127.0.0.1 >nul
npm start

:end
echo.
echo === Client arrete ===
pause
