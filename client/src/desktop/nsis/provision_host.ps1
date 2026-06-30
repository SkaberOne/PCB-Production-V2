<#
.SYNOPSIS
    Provisionne le poste « Host » : SQL Server Express + réseau + base partagée
    (ADR 0009, Phase 3). Idempotent, journalisé, requiert l'administrateur.

.DESCRIPTION
    Enchaîne, chaque étape vérifiant l'état avant d'agir (re-exécution sûre) :
      1. Installe SQL Server Express (instance SQLEXPRESS) en silencieux si absent.
      2. Force le port TCP statique 1433 (détection dynamique de la version
         d'instance MSSQLxx) + redémarre le service.
      3. Ouvre le pare-feu Windows sur 1433 (scope sous-réseau local).
      4. Crée la base partagée + un login dédié least-privilege (pas « sa »).
      5. Sème le .env du Host (SQL_SERVER_* → localhost) pour que l'app s'y
         connecte. Les TABLES sont créées par le backend au 1er boot
         (init_or_upgrade_schema, ADR 0008) — ici on ne crée que base + login.

    Journal : %PROGRAMDATA%\PCBFlow\provision_host.log
    En cas d'échec d'une étape : log + message + repli manuel (guide DEPLOYMENT.md).

.PARAMETER SaPassword       Mot de passe du compte 'sa' (mode mixte SQL).
.PARAMETER AppLogin         Login applicatif dédié (défaut: pcbflow).
.PARAMETER AppPassword      Mot de passe du login applicatif.
.PARAMETER DbName           Base partagée (défaut: ECB_Production).
.PARAMETER SqlInstaller     Chemin local d'un installeur SQL Express (embarqué).
.PARAMETER DownloadUrl      Lien de repli (bootstrapper SQL Express). À VÉRIFIER au build.
.PARAMETER AppDataDir       Dossier de données de l'app où semer le .env
                            (défaut: %APPDATA%\PCB Flow Production Suite\server).

.NOTES
    Codes de sortie : 0 = succès (idempotent) ; 1 = échec d'une étape critique.
    Versions SQL Express : chemins registre MSSQL15 (2019) / MSSQL16 (2022)
    détectés dynamiquement — ne JAMAIS coder la version en dur.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SaPassword,
    [string]$AppLogin = "pcbflow",
    [Parameter(Mandatory = $true)][string]$AppPassword,
    [string]$DbName = "ECB_Production",
    [string]$SqlInstaller = "",
    [string]$DownloadUrl = "https://go.microsoft.com/fwlink/?linkid=2216019",  # SQL Server 2022 Express bootstrapper (à revérifier au build)
    [string]$AppDataDir = ""
)

$ErrorActionPreference = "Stop"
$Instance = "SQLEXPRESS"
$ServiceName = "MSSQL`$$Instance"          # MSSQL$SQLEXPRESS
$ServerLocal = "localhost\$Instance"

$logDir = Join-Path $env:ProgramData "PCBFlow"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "provision_host.log"

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $log -Value $line
    Write-Host $line
}

# ───────────────────────── 1. SQL Server Express ─────────────────────────
function Test-SqlInstance {
    $key = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
    if (-not (Test-Path $key)) { return $false }
    $names = (Get-ItemProperty $key).PSObject.Properties.Name
    return ($names -contains $Instance)
}

function Install-SqlExpress {
    if (Test-SqlInstance) {
        Write-Log "Instance SQL $Instance déjà présente — installation sautée."
        return
    }
    $setup = $null
    if ($SqlInstaller -and (Test-Path $SqlInstaller)) {
        $setup = $SqlInstaller
        Write-Log "Installeur SQL Express embarqué : $setup"
    }
    else {
        # Bootstrapper SSEI : télécharge puis extrait le média, puis on lance setup.
        $boot = Join-Path $env:TEMP "SQLEXPR-SSEI.exe"
        Write-Log "Téléchargement bootstrapper SQL Express depuis $DownloadUrl"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $boot -UseBasicParsing
        $media = Join-Path $env:TEMP "SQLEXPR_media"
        Write-Log "Extraction du média vers $media"
        Start-Process -FilePath $boot -ArgumentList "/ACTION=Download /MEDIAPATH=`"$media`" /MEDIATYPE=Core /QUIET" -Wait
        # Le média extrait contient SQLEXPR_x64_ENU.exe (auto-extractible) → SETUP.exe
        $sqlexpr = Get-ChildItem -Path $media -Filter "SQLEXPR*x64*.exe" -Recurse | Select-Object -First 1
        if (-not $sqlexpr) { throw "Média SQL Express introuvable après extraction." }
        $extract = Join-Path $env:TEMP "SQLEXPR_extract"
        Start-Process -FilePath $sqlexpr.FullName -ArgumentList "/q /x:`"$extract`"" -Wait
        $setup = Join-Path $extract "SETUP.exe"
        if (-not (Test-Path $setup)) { throw "SETUP.exe introuvable après extraction SQL Express." }
    }

    Write-Log "Installation silencieuse de SQL Server Express (instance $Instance)…"
    $a = @(
        "/Q", "/ACTION=Install", "/FEATURES=SQLENGINE",
        "/INSTANCENAME=$Instance",
        "/SECURITYMODE=SQL", "/SAPWD=`"$SaPassword`"",
        "/TCPENABLED=1",
        "/SQLSYSADMINACCOUNTS=`"BUILTIN\Administrators`"",
        "/IACCEPTSQLSERVERLICENSETERMS"
    ) -join " "
    $p = Start-Process -FilePath $setup -ArgumentList $a -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
        throw "Setup SQL Express a échoué (code $($p.ExitCode)). Voir les logs SQL %ProgramFiles%\Microsoft SQL Server\...\Setup Bootstrap."
    }
    Write-Log "SQL Express installé (code $($p.ExitCode))."
}

# ───────────────────────── 2. Port TCP statique 1433 ─────────────────────────
function Set-StaticPort1433 {
    # Détecter la clé d'instance MSSQLxx.SQLEXPRESS (version non codée en dur).
    $instKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
    $instId = (Get-ItemProperty $instKey).$Instance   # ex: MSSQL16.SQLEXPRESS
    if (-not $instId) { throw "Identifiant d'instance introuvable pour $Instance." }
    $tcpIpAll = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instId\MSSQLServer\SuperSocketNetLib\Tcp\IPAll"
    Write-Log "Configuration port statique 1433 sur $instId"
    Set-ItemProperty -Path $tcpIpAll -Name "TcpPort" -Value "1433"
    Set-ItemProperty -Path $tcpIpAll -Name "TcpDynamicPorts" -Value ""
    Write-Log "Redémarrage du service $ServiceName"
    Restart-Service -Name $ServiceName -Force
}

# ───────────────────────── 3. Pare-feu ─────────────────────────
function Open-Firewall1433 {
    $ruleName = "PCBFlow SQL Server 1433"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Log "Règle pare-feu déjà présente."
        return
    }
    Write-Log "Création règle pare-feu (TCP 1433, profils Domain/Private)."
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort 1433 -Profile Domain,Private | Out-Null
}

# ───────────────────────── 4. Base + login dédié ─────────────────────────
function Initialize-DbAndLogin {
    # Via .NET SqlClient (toujours present sous Windows PowerShell 5.1) plutot que
    # sqlcmd, qui n'est PAS garanti avec SQL Express Engine-only. Auth Windows de
    # l'admin courant (sysadmin via SQLSYSADMINACCOUNTS).
    Write-Log "Creation base [$DbName] + login [$AppLogin] (least-privilege db_owner)."
    $escPwd = $AppPassword.Replace("'", "''")   # echappe les quotes pour le T-SQL
    $connStr = "Server=$ServerLocal;Database=master;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=30"
    $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
    $conn.Open()
    try {
        $exec = {
            param($sql)
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $sql
            [void]$cmd.ExecuteNonQuery()
        }
        & $exec "IF DB_ID(N'$DbName') IS NULL CREATE DATABASE [$DbName];"
        & $exec "IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$AppLogin') CREATE LOGIN [$AppLogin] WITH PASSWORD = N'$escPwd', CHECK_POLICY = ON, DEFAULT_DATABASE = [$DbName];"
        & $exec "USE [$DbName]; IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$AppLogin') BEGIN CREATE USER [$AppLogin] FOR LOGIN [$AppLogin]; ALTER ROLE db_owner ADD MEMBER [$AppLogin]; END"
        Write-Log "Base et login prets."
    }
    finally {
        $conn.Close()
    }
}

# ───────────────────────── 5. Semer le .env du Host ─────────────────────────
function Write-HostEnv {
    if (-not $AppDataDir) {
        $AppDataDir = Join-Path $env:APPDATA "PCB Flow Production Suite\server"
    }
    New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
    $envPath = Join-Path $AppDataDir ".env"
    $content = @"
# Config Host générée par provision_host.ps1 (ADR 0009). Éditable.
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_USER=$AppLogin
SQL_SERVER_PASSWORD=$AppPassword
SQL_SERVER_DATABASE=$DbName
SQL_SERVER_DRIVER=ODBC Driver 17 for SQL Server
MAX_UPLOAD_MB=25
"@
    Set-Content -Path $envPath -Value $content -Encoding UTF8
    Write-Log "Fichier .env Host écrit : $envPath"
}

# ───────────────── 6. Sauvegarde auto (droit SYSTEM + tache planifiee) ─────────────────
function Grant-BackupAccess {
    # Donne au compte SYSTEM le droit de sauvegarder la base (db_backupoperator),
    # pour que la tache planifiee (run SYSTEM, auth Windows) puisse faire BACKUP
    # sans mot de passe stocke.
    Write-Log "Autorisation sauvegarde pour NT AUTHORITY\SYSTEM."
    $connStr = "Server=$ServerLocal;Database=master;Integrated Security=SSPI;TrustServerCertificate=True;Connect Timeout=30"
    $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
    $conn.Open()
    try {
        $exec = { param($sql) $c = $conn.CreateCommand(); $c.CommandText = $sql; [void]$c.ExecuteNonQuery() }
        & $exec "IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'NT AUTHORITY\SYSTEM') CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;"
        & $exec "USE [$DbName]; IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'NT AUTHORITY\SYSTEM') BEGIN CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM]; ALTER ROLE db_backupoperator ADD MEMBER [NT AUTHORITY\SYSTEM]; END"
    }
    finally { $conn.Close() }
}

function Register-BackupTask {
    # Tache planifiee quotidienne appelant backup_db.ps1 (situe a cote de ce script).
    $script = Join-Path $PSScriptRoot "backup_db.ps1"
    if (-not (Test-Path $script)) {
        Write-Log "AVERTISSEMENT : backup_db.ps1 introuvable ($script) - tache non creee."
        return
    }
    Write-Log "Enregistrement de la tache planifiee de sauvegarde (quotidienne 12:30, SYSTEM)."
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -DbName `"$DbName`""
    $trigger = New-ScheduledTaskTrigger -Daily -At 12:30pm
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
    Register-ScheduledTask -TaskName "PCBFlow - Sauvegarde base" -Action $action `
        -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

# ───────────────────────── Orchestration ─────────────────────────
try {
    Write-Log "=== Provisioning Host démarré ==="
    Install-SqlExpress
    Set-StaticPort1433
    Open-Firewall1433
    Initialize-DbAndLogin
    Write-HostEnv
    Grant-BackupAccess
    Register-BackupTask
    Write-Log "=== Provisioning Host terminé avec succès ==="
    exit 0
}
catch {
    Write-Log "ÉCHEC provisioning : $($_.Exception.Message)"
    Write-Log "Repli : suivre la configuration manuelle de SQL Server (DEPLOYMENT.md)."
    exit 1
}
