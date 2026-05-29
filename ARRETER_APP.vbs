Set objShell = CreateObject("WScript.Shell")
' Tuer les lanceurs EXE (et leurs enfants)
objShell.Run "cmd /c taskkill /F /IM LANCER_SERVEUR.exe /T 2>nul & taskkill /F /IM LANCER_CLIENT.exe /T 2>nul", 0, True
' Tuer les processus enfants restants
objShell.Run "cmd /c taskkill /F /IM python.exe /T 2>nul & taskkill /F /IM pythonw.exe /T 2>nul", 0, True
objShell.Run "cmd /c taskkill /F /IM node.exe /T 2>nul", 0, True
' Attendre 1 seconde pour liberer les ports
objShell.Run "cmd /c timeout /t 1 /nobreak >nul", 0, True
MsgBox "Serveur et client arretes.", 64, "ECB - Stop"
