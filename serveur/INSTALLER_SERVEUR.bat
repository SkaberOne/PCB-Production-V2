@echo off
title ECB Production Manager - Installation Serveur
cd /d "%~dp0.."

echo.
echo ========================================
echo   ECB Production Manager - INSTALLATION
echo ========================================
echo.

:: Creer venv si absent
if not exist ".venv\\Scripts\\python.exe" (
    echo [1/3] Creation du venv Python...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERREUR] Impossible de creer le venv. Python 3.8+ requis.
        pause
        exit /b 1
    )
    echo [OK] venv cree
) else (
    echo [1/3] venv deja present - OK
)

:: Installer dependances Python
echo [2/3] Installation dependances Python...
.venv\\Scripts\\pip.exe install -r serveur\\requirements.txt
if errorlevel 1 (
    echo [ERREUR] pip install echoue.
    pause
    exit /b 1
)
echo [OK] Dependances Python installees

:: Creer .env si absent
echo [3/3] Verification .env serveur...
if not exist "serveur\\.env" (
    echo [INFO] Aucun .env trouve - copie du modele...
    copy "serveur\\.env.example" "serveur\\.env" >nul 2>&1
    echo [OK] serveur\.env cree - EDITEZ-LE avant de demarrer.
) else (
    echo [OK] .env deja present
)

echo.
echo ========================================
echo   Installation terminee !
echo   Lancez serveur\DEMARRER_SERVEUR.bat
echo ========================================
echo.
pause
