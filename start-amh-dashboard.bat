@echo off
chcp 65001 >nul
title AMH Dashboard 一键启动
setlocal

set "VITE_PORT=5174"
set "HUB_PORT=38787"
set "NODE22=C:\Users\<user>\.workbuddy\binaries\node\versions\22.22.2\node.exe"
set "NODE24=D:\nodejs\node-v24.15.0-win-x64\node.exe"
set "ROOT=%~dp0"

echo ============================================
echo  AMH Dashboard 启动器（幂等：已在跑则跳过）
echo ============================================

REM --- 后端 hub（Node 24）---
%NODE22% "%ROOT%\scripts\port-check.cjs" %HUB_PORT% >nul 2>&1
if "%ERRORLEVEL%"=="1" (
  echo [skip] 后端 hub 已在 :%HUB_PORT% 监听
) else (
  echo [start] 启动后端 hub ...
  start "AMH-hub" /min cmd /c "cd /d %ROOT% && %NODE24% src\index.js app --host 127.0.0.1 --port %HUB_PORT%"
)

REM --- 前端 Vite（Node 22）---
%NODE22% "%ROOT%\scripts\port-check.cjs" %VITE_PORT% >nul 2>&1
if "%ERRORLEVEL%"=="1" (
  echo [skip] 前端 Vite 已在 :%VITE_PORT% 监听
) else (
  echo [start] 启动前端 Vite ...
  start "AMH-vite" /min cmd /c "cd /d %ROOT%\dashboard-next && %NODE22% node_modules\vite\bin\vite.js --host 127.0.0.1 --port %VITE_PORT% --strictPort"
)

echo.
echo  Dashboard 已就绪: http://127.0.0.1:%VITE_PORT%/
echo  (如未自动打开，请在浏览器手动访问)
timeout /t 2 >nul
start "" http://127.0.0.1:%VITE_PORT%/

endlocal
