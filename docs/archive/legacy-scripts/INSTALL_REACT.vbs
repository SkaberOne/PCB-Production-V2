Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\Eric\Documents\Programme VS Code\PCB Production V2\client\src\frontend"
objShell.Run "cmd /k npm install", 1, False
