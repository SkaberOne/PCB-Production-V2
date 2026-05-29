@echo off
title ECB Production Manager - Build Client
cd /d "%~dp0"

echo.
echo ========================================
echo   ECB Production Manager - BUILD CLIENT
echo ========================================
echo.

:: Installer dependances si absent
if not exist "src\\frontend\\node_modules" (
    echo [1/3] Installation dependances frontend...
    cd src\frontend && npm install && cd ..\..
)
if not exist "src\\desktop\\node_modules" (
    echo [2/3] Installation dependances desktop...
    cd src\desktop && npm install && cd ..\..
)

:: Copier config client vers .env frontend
echo Copie client.env → src\frontend\.env
copy /y client.env src\frontend\.env >nul 2>&1

echo.
echo [3/3] Build React + packaging Electron...
echo (Cette etape prend plusieurs minutes)
echo.

cd src\desktop
npm run build:portable

echo.
echo ========================================
echo   Build termine !
echo   Executable : client\dist\
echo   Lancez DEMARRER_CLIENT.bat
echo ========================================
pause
