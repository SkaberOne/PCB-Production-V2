; Script NSIS custom pour electron-builder (ADR 0009, Phases 2-3).
; Inclus via package.json -> build.nsis.include.
;
; - Page « Client / Host » (nsDialogs) après le choix du dossier.
; - customInstall : installe TOUJOURS l'ODBC 17 ; si Host, provisionne SQL Server.
;
; Prérequis : installeur élevé (perMachine:true) car ODBC + SQL Express sont
; machine-wide. Les .ps1 et le MSI ODBC sont embarqués via extraResources :
;   resources\nsis\install_odbc.ps1, resources\nsis\provision_host.ps1,
;   resources\installers\msodbcsql17.msi (optionnel : sinon téléchargé).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var PCBFlowRoleHost    ; "1" = Host, "0" = Client
Var PCBFlowDbPassword
Var PCBFlowClientRadio
Var PCBFlowHostRadio
Var PCBFlowPwdField

; ───────── Page de choix du rôle (injectée après le choix du dossier) ─────────
!macro customPageAfterChangeDir
  Page custom PCBFlowRolePageCreate PCBFlowRolePageLeave
!macroend

Function PCBFlowRolePageCreate
  !insertmacro MUI_HEADER_TEXT "Type d'installation" "Choisissez le rôle de ce poste."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateRadioButton} 0 5u 100% 12u "Client — se connecte à une base SQL Server existante"
  Pop $PCBFlowClientRadio
  ${NSD_CreateRadioButton} 0 22u 100% 12u "Host — installe et configure SQL Server sur ce poste"
  Pop $PCBFlowHostRadio

  ${NSD_CreateLabel} 0 48u 100% 11u "Mot de passe de la base partagée (requis pour Host) :"
  Pop $0
  ${NSD_CreatePassword} 0 60u 70% 12u ""
  Pop $PCBFlowPwdField

  ${NSD_CreateLabel} 0 80u 100% 22u "Client : renseignez ensuite l'hôte SQL dans Paramètres > Connexion base de données. Host : SQL Server Express, le port 1433, le pare-feu et la base sont configurés automatiquement (plusieurs minutes, administrateur requis)."
  Pop $0

  ${NSD_Check} $PCBFlowClientRadio   ; Client par défaut
  nsDialogs::Show
FunctionEnd

Function PCBFlowRolePageLeave
  ${NSD_GetState} $PCBFlowHostRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $PCBFlowRoleHost "1"
    ${NSD_GetText} $PCBFlowPwdField $PCBFlowDbPassword
    ${If} $PCBFlowDbPassword == ""
      MessageBox MB_ICONEXCLAMATION "Veuillez saisir un mot de passe pour la base partagée (rôle Host)."
      Abort
    ${EndIf}
  ${Else}
    StrCpy $PCBFlowRoleHost "0"
  ${EndIf}
FunctionEnd

; ───────── Exécution post-copie des fichiers ─────────
!macro customInstall
  ; 1) ODBC Driver 17 — toujours (Client et Host). Idempotent (saute si présent).
  DetailPrint "Installation du pilote ODBC Driver 17…"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\nsis\install_odbc.ps1" -MsiPath "$INSTDIR\resources\installers\msodbcsql17.msi"'
  Pop $0
  ${If} $0 != "0"
    DetailPrint "Avertissement : l'installation ODBC a renvoyé le code $0 (voir %PROGRAMDATA%\PCBFlow\install_odbc.log)."
  ${EndIf}

  ; 2) Host uniquement : provisioning SQL Server complet.
  ${If} $PCBFlowRoleHost == "1"
    DetailPrint "Provisioning SQL Server Express (Host)… cela peut prendre plusieurs minutes."
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\nsis\provision_host.ps1" -SaPassword "$PCBFlowDbPassword" -AppPassword "$PCBFlowDbPassword"'
    Pop $0
    ${If} $0 != "0"
      MessageBox MB_ICONEXCLAMATION "Le provisioning SQL Server a échoué (code $0). Consultez %PROGRAMDATA%\PCBFlow\provision_host.log et la configuration manuelle (DEPLOYMENT.md). L'application est installée ; vous pourrez configurer la base ensuite."
    ${EndIf}
  ${EndIf}
!macroend
