@echo off
title PCB Flow Production Suite - Build WEB (acces LAN navigateur)
cd /d "%~dp0"

echo.
echo ========================================
echo   Build WEB (UI servie par le backend)
echo ========================================
echo.

if not exist "src\frontend\node_modules" (
    echo [1/3] Installation dependances frontend...
    cmd /c "cd src\frontend && npm install"
)

echo [2/3] Copie web.env -^> src\frontend\.env
copy /y web.env "src\frontend\.env" >nul

echo [3/3] Build React (sortie build-web) ... (plusieurs minutes)
cmd /c "cd src\frontend && npm run build"

echo Restauration du .env dev (client.env)
copy /y client.env "src\frontend\.env" >nul

echo.
echo ========================================
echo   [OK] Build web : client\src\frontend\build-web
echo   Lancez ensuite : serveur\DEMARRER_SERVEUR_WEB.bat
echo ========================================
pause
