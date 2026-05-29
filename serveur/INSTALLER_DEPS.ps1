Set-Location $PSScriptRoot

Write-Host "=== Installation dependances Python ===" -ForegroundColor Cyan

# Trouver python dans le venv
$pythonV2 = "..\\.venv\\Scripts\\python.exe"
$pythonOutdated = "C:\Users\Eric\Documents\Programme VS Code\PCB Production (outdated)\.venv\Scripts\python.exe"

if (Test-Path $pythonV2) {
    $python = $pythonV2
    Write-Host "[OK] venv V2 trouve" -ForegroundColor Green
} elseif (Test-Path $pythonOutdated) {
    $python = $pythonOutdated
    Write-Host "[OK] venv outdated trouve" -ForegroundColor Yellow
} else {
    Write-Host "[ERREUR] Aucun venv trouve !" -ForegroundColor Red
    Read-Host "Appuyez sur Entree pour quitter"
    exit 1
}

Write-Host "Installation de uvicorn + dependances..." -ForegroundColor Cyan
& $python -m pip install uvicorn fastapi sqlalchemy alembic pydantic pydantic-settings python-multipart aiofiles

Write-Host ""
Write-Host "=== Installation terminee ! ===" -ForegroundColor Green
Write-Host "Lancement du serveur..." -ForegroundColor Cyan
Write-Host ""

& $python launch.py --no-reload
