@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 goto failed
)
node scripts/assets.mjs
if errorlevel 1 goto failed
call npm.cmd run build
if errorlevel 1 goto failed
node scripts/play.mjs
goto end
:failed
echo Не удалось запустить игру. Проверьте интернет и установленный Node.js.
:end
pause
