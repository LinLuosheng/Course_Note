@echo off
chcp 65001 >nul 2>&1
title CourseNote

set "APP_DIR=%~dp0..\app"

cd /d "%APP_DIR%"

echo [start] Building...
call npm run build

echo [start] Launching Electron...
call npx electron .
pause
