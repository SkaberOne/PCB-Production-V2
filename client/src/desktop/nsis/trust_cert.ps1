<#
.SYNOPSIS
    Approuve le certificat public de signature sur un poste (ADR 0009 / #5).

.DESCRIPTION
    A executer en ADMINISTRATEUR sur chaque poste qui recevra l'app signee.
    Importe le .cer dans les magasins machine "Autorites de certification racines
    de confiance" (Root) ET "Editeurs approuves" (TrustedPublisher) : l'app signee
    par le certificat correspondant est alors reconnue (plus d'avertissement
    "editeur inconnu" a l'installation / au lancement).

.PARAMETER CerPath   Chemin du fichier .cer public (genere par make_signing_cert.ps1).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CerPath
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $CerPath)) { throw "Fichier .cer introuvable : $CerPath" }

Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
Write-Host "Certificat approuve (Root + TrustedPublisher, LocalMachine) : $CerPath"
