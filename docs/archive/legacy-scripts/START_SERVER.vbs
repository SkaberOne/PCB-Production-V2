Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\Eric\Documents\Programme VS Code\PCB Production V2\serveur"
objShell.Run "cmd /k DEMARRER_SERVEUR.bat", 1, False
