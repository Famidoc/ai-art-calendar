@echo off
cd /d "%~dp0"
echo [AI Art Calendar] 正在安裝 Electron 無邊框桌面小工具引擎，請稍候...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [錯誤] 安裝失敗，請確認網路連線或 Node.js 環境。
    pause
    exit /b 1
)
echo.
echo [完成] 安裝成功！現在雙擊「啟動AI萬年桌面月曆.bat」或「無黑窗啟動桌面月曆.vbs」即會以無邊框桌面模式開啟！
pause