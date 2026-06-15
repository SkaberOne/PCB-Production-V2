<#
.SYNOPSIS
    Sauvegarde la base partagée SQL Server + applique une rétention (ADR 0009 / #2).

.DESCRIPTION
    Exécutée par une tâche planifiée Windows (compte SYSTEM, authentification
    Windows intégrée — aucun mot de passe stocké). Fait un BACKUP DATABASE complet
    vers un dossier local, puis purge les sauvegardes plus vieilles que -KeepDays.

    Journalise dans %PROGRAMDATA%\PCBFlow\backup_db.log.

.PARAMETER DbName       Base à sauvegarder (défaut: ECB_Production).
.PARAMETER Instance     Instance SQL locale (défaut: localhost\SQLEXPRESS).
.PARAMETER BackupDir    Dossier des .bak (défaut: %PROGRAMDATA%\PCBFlow\backups).
.PARAMETER KeepDays     Rétention en jours (défaut: 14).

.NOTES
    Code de sortie : 0 = succès ; 1 = échec (la tâche planifiée le remonte).
    Le compte SYSTEM doit avoir le droit BACKUP sur la base (login + rôle
    db_backupoperator créés par provision_host.ps1).
#>
[CmdletBinding()]
param(
    [string]$DbName = "ECB_Production",
    [string]$Instance = "localhost\SQLEXPRESS",
    [string]$BackupDir = "",
    [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"
$logDir = Join-Path $env:ProgramData "PCBFlow"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "backup_db.log"

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $log -Value $line
    Write-Host $line
}

try {
    if (-not $BackupDir) { $BackupDir = Join-Path $logDir "backups" }
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $bakPath = Join-Path $BackupDir "$($DbName)_$stamp.bak"
    Write-Log "=== Sauvegarde $DbName -> $bakPath ==="

    # BACKUP via .NET SqlClient (auth Windows intégrée du compte de la tâche).
    $connStr = "Server=$Instance;Database=master;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=30"
    $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        # COMPRESSION non supporté par Express -> backup simple. NOFORMAT/INIT = 1 fichier/run.
        $cmd.CommandText = "BACKUP DATABASE [$DbName] TO DISK = N'$bakPath' WITH INIT, NAME = N'$DbName-full', STATS = 10;"
        $cmd.CommandTimeout = 600
        [void]$cmd.ExecuteNonQuery()
    }
    finally {
        $conn.Close()
    }

    $size = [math]::Round((Get-Item $bakPath).Length / 1MB, 1)
    Write-Log "Sauvegarde OK ($size Mo)."

    # Rétention : supprimer les .bak plus vieux que KeepDays.
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $old = Get-ChildItem -Path $BackupDir -Filter "$($DbName)_*.bak" |
        Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) {
        Remove-Item $f.FullName -Force
        Write-Log "Purge ancienne sauvegarde : $($f.Name)"
    }

    Write-Log "Terminé. Sauvegardes conservées : $((Get-ChildItem -Path $BackupDir -Filter "$($DbName)_*.bak").Count)."
    exit 0
}
catch {
    Write-Log "ÉCHEC sauvegarde : $($_.Exception.Message)"
    exit 1
}
