@echo off
start /min cmd /c "cd /d %~dp0 && python app.py"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:5000