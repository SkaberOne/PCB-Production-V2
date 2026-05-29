# ============================================================
# NETTOYAGE - Supprime les anciens fichiers obsolètes à la racine
# Lancer depuis la racine du projet (double-clic ou PowerShell)
# ============================================================

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

Write-Host "=== Nettoyage anciens fichiers ===" -ForegroundColor Cyan
Write-Host "Dossier : $root"
Write-Host ""

# Fichiers bat obsolètes à la racine
$obsoleteFiles = @(
    "COPY_TO_V2.bat",
    "FRONTEND_ONLY.bat",
    "MIGRATION_PLAN.md",
    "NPM_START_DEBUG.bat",
    "SETUP_AND_START.bat",
    "SETUP_FRONTEND.bat",
    "START_BACKEND.bat",
    "START_BACKEND_FIX.bat",
    "START_DEV.bat",
    "3.8",
    "PCB",
    "launch.py"        # remplacé par serveur\launch.py
)

foreach ($file in $obsoleteFiles) {
    $path = Join-Path $root $file
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "[SUPPRIME] $file" -ForegroundColor Yellow
    } else {
        Write-Host "[ABSENT]   $file" -ForegroundColor DarkGray
    }
}

# Dossier .a_supprimer
$toDelete = Join-Path $root ".a_supprimer"
if (Test-Path $toDelete) {
    Remove-Item $toDelete -Recurse -Force
    Write-Host "[SUPPRIME] .a_supprimer\" -ForegroundColor Yellow
}

# Dossier src/ (remplacé par serveur/src et client/src)
$srcDir = Join-Path $root "src"
if (Test-Path $srcDir) {
    Write-Host ""
    Write-Host "ATTENTION: Le dossier src\ existe encore (original)." -ForegroundColor Red
    Write-Host "Les fichiers ont ete COPIES vers serveur\src\ et client\src\" -ForegroundColor Red
    $confirm = Read-Host "Supprimer src\ ? (o/N)"
    if ($confirm -eq "o" -or $confirm -eq "O") {
        Remove-Item $srcDir -Recurse -Force
        Write-Host "[SUPPRIME] src\" -ForegroundColor Yellow
    } else {
        Write-Host "[GARDE]    src\ (supprimer manuellement quand pret)" -ForegroundColor Cyan
    }
}

# Dossier tools/ (remplacé par serveur\launcher\)
$toolsDir = Join-Path $root "tools"
if (Test-Path $toolsDir) {
    Write-Host ""
    $confirm = Read-Host "Supprimer tools\ (remplace par serveur\launcher\) ? (o/N)"
    if ($confirm -eq "o" -or $confirm -eq "O") {
        Remove-Item $toolsDir -Recurse -Force
        Write-Host "[SUPPRIME] tools\" -ForegroundColor Yellow
    } else {
        Write-Host "[GARDE]    tools\" -ForegroundColor Cyan
    }
}

# Dossier scripts/ (obsolète)
$scriptsDir = Join-Path $root "scripts"
if (Test-Path $scriptsDir) {
    Write-Host ""
    $confirm = Read-Host "Supprimer scripts\ (anciens scripts dev) ? (o/N)"
    if ($confirm -eq "o" -or $confirm -eq "O") {
        Remove-Item $scriptsDir -Recurse -Force
        Write-Host "[SUPPRIME] scripts\" -ForegroundColor Yellow
    } else {
        Write-Host "[GARDE]    scripts\" -ForegroundColor Cyan
    }
}

# Dossier database/ et logs/ à la racine (copiés dans serveur/)
foreach ($dir in @("database", "logs")) {
    $dirPath = Join-Path $root $dir
    if (Test-Path $dirPath) {
        Write-Host ""
        $confirm = Read-Host "Supprimer $dir\ (copie dans serveur\$dir\) ? (o/N)"
        if ($confirm -eq "o" -or $confirm -eq "O") {
            Remove-Item $dirPath -Recurse -Force
            Write-Host "[SUPPRIME] $dir\" -ForegroundColor Yellow
        } else {
            Write-Host "[GARDE]    $dir\" -ForegroundColor Cyan
        }
    }
}

Write-Host ""
Write-Host "=== Nettoyage termine ===" -ForegroundColor Green
Write-Host ""
Write-Host "Structure finale :"
Get-ChildItem $root -Exclude ".venv",".git" | Sort-Object Name | ForEach-Object {
    $type = if ($_.PSIsContainer) { "[DIR]  " } else { "[FILE] " }
    Write-Host "  $type $($_.Name)"
}

Write-Host ""
Pause
