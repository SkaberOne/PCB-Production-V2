@echo off
cd /d "%~dp0"
copy /y client.env src\frontend\.env >nul 2>&1
echo Demarrage React sur http://localhost:3000 ...
echo Ouvrir Google Chrome sur http://localhost:3000
cd src\frontend
npm start
