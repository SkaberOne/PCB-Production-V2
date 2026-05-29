Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\Eric\Documents\Programme VS Code\PCB Production V2"
objShell.Run "cmd /c _build\BUILD_LAUNCHERS.bat", 1, True
MsgBox "Build termine ! Verifiez la presence de LANCER_SERVEUR.exe et LANCER_CLIENT.exe a la racine du projet.", 64, "ECB - Build"
