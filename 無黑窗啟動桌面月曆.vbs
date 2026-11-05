Option Explicit
Dim fso, shell, appDir, electronExe, edgeExe1, edgeExe2, chromeExe, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir

electronExe = appDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
    shell.Run Chr(34) & electronExe & Chr(34) & " .", 0, False
    WScript.Quit 0
End If

rc = shell.Run("cmd.exe /c netstat -ano | findstr "":3207 "" | findstr ""LISTENING"" >nul", 0, True)
If rc <> 0 Then
    shell.Run "node.exe " & Chr(34) & appDir & "\server.mjs" & Chr(34), 0, False
    WScript.Sleep 800
End If

edgeExe1 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
edgeExe2 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"

If fso.FileExists(edgeExe1) Then
    shell.Run Chr(34) & edgeExe1 & Chr(34) & " --app=http://127.0.0.1:3207 --window-size=1080,720", 1, False
ElseIf fso.FileExists(edgeExe2) Then
    shell.Run Chr(34) & edgeExe2 & Chr(34) & " --app=http://127.0.0.1:3207 --window-size=1080,720", 1, False
ElseIf fso.FileExists(chromeExe) Then
    shell.Run Chr(34) & chromeExe & Chr(34) & " --app=http://127.0.0.1:3207 --window-size=1080,720", 1, False
Else
    shell.Run "http://127.0.0.1:3207", 1, False
End If