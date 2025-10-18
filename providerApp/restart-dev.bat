@echo off
echo Clearing Metro cache and restarting development server...
cd /d "%~dp0"
npx expo start --clear
pause
