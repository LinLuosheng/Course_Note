@echo off
chcp 65001 >nul 2>&1
title CourseNote Dev

set "APP_DIR=%~dp0..\app"

echo [dev] Starting CourseNote in development mode...

cd /d "%APP_DIR%"

if not exist "node_modules" (
    echo [dev] Installing npm dependencies...
    call npm install
)

echo [dev] Building main process...
call npm run build:main

echo [dev] Launching Vite + Electron...
call npm run electron:dev
pause
