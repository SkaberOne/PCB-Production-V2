@echo off
title PCB Flow Production Suite - Build backend (ecb-server.exe)
cd /d "%~dp0"

echo.
echo ========================================
echo   Build backend package (PyInstaller)
echo ========================================
echo.

:: === Recherche du venv Python (racine du projet) ===
if not exist "..\\.venv\\Scripts\\python.exe" (
    echo [ERREUR] Aucun .venv Python trouve a la racine du projet.
    echo Lancez serveur\INSTALLER_SERVEUR.bat d'abord.
    pause
    exit /b 1
)
set PYTHON_EXE="..\\.venv\\Scripts\\python.exe"
echo [OK] .venv trouve

:: === PyInstaller installe ? ===
%PYTHON_EXE% -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo Installation de PyInstaller...
    %PYTHON_EXE% -m pip install pyinstaller --quiet
    if errorlevel 1 (
        echo [ERREUR] Installation de PyInstaller echouee.
        pause
        exit /b 1
    )
)
echo [OK] PyInstaller disponible

:: === Nettoyage build precedent ===
if exist "build" rmdir /s /q "build"
if exist "dist\ecb-server" rmdir /s /q "dist\ecb-server"

:: === Build via la spec (mode onedir) ===
echo.
echo Construction de ecb-server.exe ...
%PYTHON_EXE% -m PyInstaller ecb-server.spec --noconfirm
if errorlevel 1 (
    echo [ERREUR] Build PyInstaller echoue.
    pause
    exit /b 1
)

echo.
echo [OK] Backend construit : serveur\dist\ecb-server\ecb-server.exe
echo.
echo Test rapide (Ctrl+C pour arreter) :
echo   dist\ecb-server\ecb-server.exe --port 8123
echo   puis http://127.0.0.1:8123/api/health
echo.
pause
