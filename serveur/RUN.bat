@echo off
cd /d "%~dp0"
"..\\.venv\\Scripts\\python.exe" launch.py --no-reload
pause
