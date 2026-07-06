@echo off
title PCB Flow Production Suite - Serveur WEB LAN (UI + API sur :8000)
cd /d "%~dp0"

if not exist "..\.venv\Scripts\python.exe" (
    echo [ERREUR] .venv Python introuvable a la racine du projet.
    pause
    exit /b 1
)
if not exist "..\client\src\frontend\build-web\index.html" (
    echo [ERREUR] Build web absent.
    echo Lancez d'abord : client\CONSTRUIRE_WEB.bat
    pause
    exit /b 1
)

:: Dossier du build web servi par le backend
set "WEB_STATIC_DIR=%~dp0..\client\src\frontend\build-web"

:: Cle partagee exigee (X-API-Key). DOIT etre IDENTIQUE a REACT_APP_API_KEY de
:: client\web.env. Definie ici uniquement pour CE process (dev/desktop intacts).
set "API_KEY=pcbflow-lan-2026"

:: Ecoute sur toutes les interfaces -> accessible depuis le LAN
set "API_HOST=0.0.0.0"
set "API_PORT=8000"

echo ================================================================
echo   Serveur WEB LAN demarre (UI + API)
echo   Les collegues ouvrent dans leur navigateur :
echo       http://%COMPUTERNAME%:8000       (ou  http://IP-DU-POSTE:8000 )
echo   Cle API bakee dans le build : %API_KEY%
echo.
echo   Pare-feu : autoriser le port 8000 en entree si besoin :
echo     netsh advfirewall firewall add rule name="PCB Flow Web 8000" ^
echo       dir=in action=allow protocol=TCP localport=8000
echo   (cf docs\guides\Acces_Web_LAN.md)
echo ================================================================
echo.

"..\.venv\Scripts\python.exe" launch.py --host 0.0.0.0 --port 8000
pause
