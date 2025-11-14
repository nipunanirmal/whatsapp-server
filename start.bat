@echo off
echo ================================
echo QuickSend WhatsApp Server
echo ================================
echo.
echo Starting server...
echo.

cd /d "%~dp0"
node server.js

pause
