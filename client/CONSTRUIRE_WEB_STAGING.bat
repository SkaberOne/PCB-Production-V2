@echo off
title PCB Flow Production Suite - Build WEB STAGING (test :8001)
cd /d "%~dp0"

echo.
echo ========================================
echo   Build WEB STAGING (UI de test)
echo   Sortie : build-web-staging (n'ecrase pas la prod)
echo ========================================
echo.

if not exist "src\frontend\node_modules" (
    echo [1/3] Installation dependances frontend...
    cmd /c "cd src\frontend && npm install"
)

echo [2/3] Copie web.staging.env -^> src\frontend\.env
copy /y web.staging.env "src\frontend\.env" >nul

echo [3/3] Build React (sortie build-web-staging) ... (plusieurs minutes)
cmd /c "cd src\frontend && npm run build"

echo Restauration du .env dev (client.env)
copy /y client.env "src\frontend\.env" >nul

echo.
echo ========================================
echo   [OK] Build staging : client\src\frontend\build-web-staging
echo   Lancez ensuite : serveur\DEMARRER_SERVEUR_WEB_STAGING.bat
echo ========================================
pause
