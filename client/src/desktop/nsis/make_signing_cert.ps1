<#
.SYNOPSIS
    Genere un certificat de signature de code auto-signe (usage interne, ADR 0009 / #5).

.DESCRIPTION
    A executer UNE FOIS sur la machine de build. Produit :
      * un .pfx (cle privee, SECRET) -> a passer a electron-builder via CSC_LINK ;
      * un .cer (cle publique) -> a deployer sur chaque poste via trust_cert.ps1
        (Trusted Root + Trusted Publisher) pour supprimer l'avertissement
        "editeur inconnu".

    NB : un cert auto-signe ne donne PAS de reputation SmartScreen globale (seul un
    cert EV le ferait). Il suffit en revanche pour une diffusion INTERNE controlee :
    une fois le .cer approuve sur les postes, l'app signee est reconnue.

.PARAMETER PfxPassword   Mot de passe protegeant le .pfx (obligatoire).
.PARAMETER Subject       Sujet du certificat.
.PARAMETER OutDir        Dossier de sortie (hors depot Git).
.PARAMETER YearsValid    Validite en annees.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PfxPassword,
    [string]$Subject = "CN=ECB PCB Flow Code Signing",
    [string]$OutDir = "$env:USERPROFILE\pcbflow-cert",
    [int]$YearsValid = 5
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject `
    -KeyUsage DigitalSignature -KeyExportPolicy Exportable `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears($YearsValid) -HashAlgorithm SHA256

$pfx = Join-Path $OutDir "pcbflow-codesign.pfx"
$cer = Join-Path $OutDir "pcbflow-codesign.cer"
$sec = ConvertTo-SecureString -String $PfxPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $sec | Out-Null
Export-Certificate -Cert $cert -FilePath $cer | Out-Null

Write-Host ""
Write-Host "Certificat de signature cree."
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  PFX (SECRET, pour CSC_LINK) : $pfx"
Write-Host "  CER (public, a deployer)    : $cer"
Write-Host ""
Write-Host "Pour builder signe :"
Write-Host "  `$env:CSC_LINK = '$pfx'"
Write-Host "  `$env:CSC_KEY_PASSWORD = '<le mot de passe du pfx>'"
Write-Host "  cd client\src\desktop ; npm run publish:signed"
Write-Host ""
Write-Host "Sur chaque poste (admin) : .\trust_cert.ps1 -CerPath '$cer'"
