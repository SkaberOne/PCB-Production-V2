<#
.SYNOPSIS
    Installe le pilote « ODBC Driver 17 for SQL Server » (ADR 0009, Phase 2).

.DESCRIPTION
    Idempotent : ne fait rien si le pilote est déjà présent (clé de registre
    ODBCINST.INI). Sinon installe le MSI Microsoft en silencieux. Le MSI peut
    être :
      * EMBARQUÉ dans l'installeur (placé par le build dans resources\installers),
        chemin passé via -MsiPath ; ou
      * TÉLÉCHARGÉ depuis Microsoft (lien officiel) si aucun MSI local.

    Journalise dans %PROGRAMDATA%\PCBFlow\install_odbc.log. Requiert des droits
    administrateur (installation machine-wide).

.PARAMETER MsiPath
    Chemin d'un msodbcsql*.msi local à utiliser en priorité (embarqué).

.PARAMETER DownloadUrl
    Lien de repli si aucun MSI local. Par défaut le lien Microsoft « evergreen »
    de l'ODBC Driver 17 x64. À VÉRIFIER au build : Microsoft fait évoluer ces
    liens fwlink. Voir https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server

.NOTES
    Codes de sortie : 0 = déjà présent ou installé ; 1 = échec.
#>
[CmdletBinding()]
param(
    [string]$MsiPath = "",
    [string]$DownloadUrl = "https://go.microsoft.com/fwlink/?linkid=2266337"  # ODBC Driver 17.10 x64 (à revérifier au build)
)

$ErrorActionPreference = "Stop"
$logDir = Join-Path $env:ProgramData "PCBFlow"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "install_odbc.log"

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $log -Value $line
    Write-Host $line
}

function Test-OdbcDriver17 {
    # Présent si la clé du pilote existe dans ODBCINST.INI (machine).
    $key = "HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server"
    return (Test-Path $key)
}

try {
    Write-Log "=== Vérification ODBC Driver 17 ==="
    if (Test-OdbcDriver17) {
        Write-Log "ODBC Driver 17 déjà installé — rien à faire."
        exit 0
    }

    # Résoudre le MSI : local embarqué prioritaire, sinon téléchargement.
    $msi = $null
    if ($MsiPath -and (Test-Path $MsiPath)) {
        $msi = $MsiPath
        Write-Log "MSI embarqué utilisé : $msi"
    }
    else {
        $msi = Join-Path $env:TEMP "msodbcsql17.msi"
        Write-Log "Aucun MSI local — téléchargement depuis $DownloadUrl"
        try {
            # TLS 1.2 explicite (vieux Windows) + barre de progression off (rapide).
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = "SilentlyContinue"
            Invoke-WebRequest -Uri $DownloadUrl -OutFile $msi -UseBasicParsing
            Write-Log "Téléchargement terminé : $msi"
        }
        catch {
            Write-Log "ÉCHEC téléchargement ODBC : $($_.Exception.Message)"
            Write-Log "Le pilote ODBC 17 devra être installé manuellement (voir DEPLOYMENT.md)."
            exit 1
        }
    }

    # Installation silencieuse. IACCEPTMSODBCSQLLICENSETERMS=YES requis (EULA).
    Write-Log "Installation silencieuse du MSI…"
    $args = "/i `"$msi`" /qn IACCEPTMSODBCSQLLICENSETERMS=YES ADDLOCAL=ALL /norestart"
    $p = Start-Process -FilePath "msiexec.exe" -ArgumentList $args -Wait -PassThru
    # 0 = OK, 3010 = OK mais reboot requis (acceptable).
    if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) {
        Write-Log "ODBC installé (code $($p.ExitCode))."
        exit 0
    }
    Write-Log "ÉCHEC installation ODBC (code msiexec $($p.ExitCode))."
    exit 1
}
catch {
    Write-Log "ERREUR inattendue : $($_.Exception.Message)"
    exit 1
}
