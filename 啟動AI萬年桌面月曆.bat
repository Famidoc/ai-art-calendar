@echo off
cd /d "%~dp0"

if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
    exit /b 0
)

netstat -ano | findstr ":3207 " | findstr "LISTENING" >nul
if errorlevel 1 (
    start "AIArtCalendarServer" /min node "%~dp0server.mjs"
    timeout /t 1 /nobreak >nul
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3207 --window-size=1080,720
    exit /b 0
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3207 --window-size=1080,720
    exit /b 0
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:3207 --window-size=1080,720
    exit /b 0
)

start "" http://127.0.0.1:3207