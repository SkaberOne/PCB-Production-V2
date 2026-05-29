Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

' Trouver le bon Python
Dim pythonExe
Dim projectRoot
projectRoot = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

Dim pythonV2
pythonV2 = projectRoot & "\..\\.venv\Scripts\python.exe"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

If fso.FileExists(pythonV2) Then
    pythonExe = pythonV2
Else
    pythonExe = "C:\Users\Eric\Documents\Programme VS Code\PCB Production (outdated)\.venv\Scripts\python.exe"
End If

WScript.Echo "Installation des dependances Python..." & vbCrLf & "Python: " & pythonExe

' Installer uvicorn et dependances
Dim cmd
cmd = """" & pythonExe & """ -m pip install uvicorn fastapi sqlalchemy alembic pydantic pydantic-settings python-multipart aiofiles"

Dim ret
ret = objShell.Run("cmd /c " & cmd & " && echo OK Installation terminee! && pause", 1, True)

If ret = 0 Then
    WScript.Echo "Installation terminee ! Lancement du serveur..."
    objShell.Run "cmd /c cd /d """ & projectRoot & """ && """ & pythonExe & """ launch.py --no-reload && pause", 1, False
Else
    WScript.Echo "Erreur lors de l'installation (code " & ret & ")." & vbCrLf & "Verifiez que Python est bien installe."
End If
