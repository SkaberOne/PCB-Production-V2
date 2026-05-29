@echo off
title ECB - Compilation des lanceurs .exe
cd /d "%~dp0\.."

echo.
echo ====================================================
echo   ECB Production Manager - BUILD DES LANCEURS
echo ====================================================
echo   Projet : %CD%
echo ====================================================
echo.

set PYTHON=.venv\Scripts\python.exe
set PIP=.venv\Scripts\pip.exe

:: Vérifier que le venv existe
if not exist "%PYTHON%" (
    echo [ERREUR] .venv\Scripts\python.exe introuvable.
    echo Lancez INSTALLER_SERVEUR.bat d'abord.
    pause
    exit /b 1
)

echo [1/5] Installation de PyInstaller (Python 3.7)...
"%PIP%" install "pyinstaller>=5.0,<6.0" --quiet
if errorlevel 1 (
    echo [ERREUR] pip install pyinstaller a echoue.
    pause
    exit /b 1
)
echo [OK] PyInstaller installe.
echo.

:: Nettoyage build précédent
if exist "_build\build_tmp" rmdir /s /q "_build\build_tmp"
if exist "LANCER_SERVEUR.exe" del /f /q "LANCER_SERVEUR.exe"
if exist "LANCER_CLIENT.exe" del /f /q "LANCER_CLIENT.exe"

echo [2/5] Compilation LANCER_SERVEUR.exe...
"%PYTHON%" -m PyInstaller ^
    --onefile ^
    --console ^
    --name LANCER_SERVEUR ^
    --distpath "." ^
    --workpath "_build\build_tmp" ^
    --specpath "_build" ^
    "_build\launch_server.py"

if errorlevel 1 (
    echo [ERREUR] Compilation LANCER_SERVEUR.exe echouee.
    pause
    exit /b 1
)
if not exist "LANCER_SERVEUR.exe" (
    echo [ERREUR] LANCER_SERVEUR.exe non trouve apres compilation.
    pause
    exit /b 1
)
echo [OK] LANCER_SERVEUR.exe cree.
echo.

echo [3/5] Compilation LANCER_CLIENT.exe...
"%PYTHON%" -m PyInstaller ^
    --onefile ^
    --console ^
    --name LANCER_CLIENT ^
    --distpath "." ^
    --workpath "_build\build_tmp" ^
    --specpath "_build" ^
    "_build\launch_client.py"

if errorlevel 1 (
    echo [ERREUR] Compilation LANCER_CLIENT.exe echouee.
    pause
    exit /b 1
)
if not exist "LANCER_CLIENT.exe" (
    echo [ERREUR] LANCER_CLIENT.exe non trouve apres compilation.
    pause
    exit /b 1
)
echo [OK] LANCER_CLIENT.exe cree.
echo.

echo [4/5] Nettoyage des fichiers temporaires...
if exist "_build\build_tmp" rmdir /s /q "_build\build_tmp"
if exist "_build\LANCER_SERVEUR.spec" del /f /q "_build\LANCER_SERVEUR.spec"
if exist "_build\LANCER_CLIENT.spec" del /f /q "_build\LANCER_CLIENT.spec"
echo [OK] Nettoyage termine.
echo.

echo [5/5] Verification finale...
if exist "LANCER_SERVEUR.exe" (echo [OK] LANCER_SERVEUR.exe present) else (echo [MANQUANT] LANCER_SERVEUR.exe)
if exist "LANCER_CLIENT.exe" (echo [OK] LANCER_CLIENT.exe present) else (echo [MANQUANT] LANCER_CLIENT.exe)
echo.

echo ====================================================
echo   BUILD TERMINE !
echo.
echo   Double-cliquez sur LANCER_SERVEUR.exe
echo   puis sur LANCER_CLIENT.exe pour demarrer.
echo ====================================================
echo.
pause
