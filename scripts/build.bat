@echo off
chcp 65001 >nul 2>&1
title CourseNote Build

set "APP_DIR=%~dp0..\app"
set "RELEASE_DIR=%~dp0..\release"

echo [build] Building CourseNote EXE...

cd /d "%APP_DIR%"

if not exist "node_modules" (
    echo [build] Installing npm dependencies...
    call npm install
)

echo [build] Compiling renderer (Vite)...
call npm run build:renderer
if %errorlevel% neq 0 (
    echo [build] Renderer build failed!
    pause
    exit /b 1
)

echo [build] Compiling main process (TypeScript)...
call npm run build:main
if %errorlevel% neq 0 (
    echo [build] Main process build failed!
    pause
    exit /b 1
)

echo [build] Packaging with electron-builder...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
    echo [build] electron-builder failed!
    pause
    exit /b 1
)

echo.
echo [build] Build complete!
echo [build] Output: %RELEASE_DIR%
dir /b "%RELEASE_DIR%\*.exe" 2>nul
pause
