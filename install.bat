@echo off
echo ================================
echo Installing QuickSend WhatsApp Server
echo ================================
echo.
echo This will install Node.js dependencies...
echo.

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo After installing, run this script again.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.
echo npm version:
npm --version
echo.
echo Installing dependencies...
echo.

npm install

echo.
echo ================================
echo Installation Complete!
echo ================================
echo.
echo To start the server, run: start.bat
echo.
pause
