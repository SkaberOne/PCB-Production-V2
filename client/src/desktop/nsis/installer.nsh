; Script NSIS custom pour electron-builder (ADR 0009, Phases 2-3).
; Inclus via package.json -> build.nsis.include.
;
; - Page Â« Client / Host Â» (nsDialogs) aprÃ¨s le choix du dossier.
; - customInstall : installe TOUJOURS l'ODBC 17 ; si Host, provisionne SQL Server.
;
; PrÃ©requis : installeur Ã©levÃ© (perMachine:true) car ODBC + SQL Express sont
; machine-wide. Les .ps1 et le MSI ODBC sont embarquÃ©s via extraResources :
;   resources\nsis\install_odbc.ps1, resources\nsis\provision_host.ps1,
;   resources\installers\msodbcsql17.msi (optionnel : sinon tÃ©lÃ©chargÃ©).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER  ; tout le bloc ci-dessous est install-only

Var PCBFlowRoleHost    ; "1" = Host, "0" = Client
Var PCBFlowDbPassword
Var PCBFlowClientRadio
Var PCBFlowHostRadio
Var PCBFlowPwdField

; â”€â”€â”€â”€â”€â”€â”€â”€â”€ Page de choix du rÃ´le (injectÃ©e aprÃ¨s le choix du dossier) â”€â”€â”€â”€â”€â”€â”€â”€â”€
!macro customPageAfterChangeDir
  Page custom PCBFlowRolePageCreate PCBFlowRolePageLeave
!macroend

Function PCBFlowRolePageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateRadioButton} 0 5u 100% 12u "Client â€” se connecte Ã  une base SQL Server existante"
  Pop $PCBFlowClientRadio
  ${NSD_CreateRadioButton} 0 22u 100% 12u "Host â€” installe et configure SQL Server sur ce poste"
  Pop $PCBFlowHostRadio

  ${NSD_CreateLabel} 0 48u 100% 11u "Mot de passe de la base partagÃ©e (requis pour Host) :"
  Pop $0
  ${NSD_CreatePassword} 0 60u 70% 12u ""
  Pop $PCBFlowPwdField

  ${NSD_CreateLabel} 0 80u 100% 22u "Client : renseignez ensuite l'hÃ´te SQL dans ParamÃ¨tres > Connexion base de donnÃ©es. Host : SQL Server Express, le port 1433, le pare-feu et la base sont configurÃ©s automatiquement (plusieurs minutes, administrateur requis)."
  Pop $0

  ${NSD_Check} $PCBFlowClientRadio   ; Client par dÃ©faut
  nsDialogs::Show
FunctionEnd

Function PCBFlowRolePageLeave
  ${NSD_GetState} $PCBFlowHostRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $PCBFlowRoleHost "1"
    ${NSD_GetText} $PCBFlowPwdField $PCBFlowDbPassword
    ${If} $PCBFlowDbPassword == ""
      MessageBox MB_ICONEXCLAMATION "Veuillez saisir un mot de passe pour la base partagÃ©e (rÃ´le Host)."
      Abort
    ${EndIf}
  ${Else}
    StrCpy $PCBFlowRoleHost "0"
  ${EndIf}
FunctionEnd

; â”€â”€â”€â”€â”€â”€â”€â”€â”€ ExÃ©cution post-copie des fichiers â”€â”€â”€â”€â”€â”€â”€â”€â”€
!macro customInstall
  ; 1) ODBC Driver 17 â€” toujours (Client et Host). Idempotent (saute si prÃ©sent).
  DetailPrint "Installation du pilote ODBC Driver 17â€¦"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\nsis\install_odbc.ps1" -MsiPath "$INSTDIR\resources\installers\msodbcsql17.msi"'
  Pop $0
  ${If} $0 != "0"
    DetailPrint "Avertissement : l'installation ODBC a renvoyÃ© le code $0 (voir %PROGRAMDATA%\PCBFlow\install_odbc.log)."
  ${EndIf}

  ; 2) Host uniquement : provisioning SQL Server complet.
  ${If} $PCBFlowRoleHost == "1"
    DetailPrint "Provisioning SQL Server Express (Host)â€¦ cela peut prendre plusieurs minutes."
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\nsis\provision_host.ps1" -SaPassword "$PCBFlowDbPassword" -AppPassword "$PCBFlowDbPassword"'
    Pop $0
    ${If} $0 != "0"
      MessageBox MB_ICONEXCLAMATION "Le provisioning SQL Server a Ã©chouÃ© (code $0). Consultez %PROGRAMDATA%\PCBFlow\provision_host.log et la configuration manuelle (DEPLOYMENT.md). L'application est installÃ©e ; vous pourrez configurer la base ensuite."
    ${EndIf}
  ${EndIf}
!macroend


!endif  ; BUILD_UNINSTALLER
