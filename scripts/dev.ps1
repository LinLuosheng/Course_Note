# CourseNote 开发模式启动脚本
# 同时启动 Vite dev server + Electron

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectRoot "app"

Write-Host "[dev] Starting CourseNote in development mode..." -ForegroundColor Cyan
Write-Host "[dev] App dir: $appDir" -ForegroundColor Gray

Push-Location $appDir
try {
    # Check node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Host "[dev] Installing npm dependencies..." -ForegroundColor Yellow
        npm install
    }

    # Build main process first
    Write-Host "[dev] Building main process..." -ForegroundColor Yellow
    npm run build:main

    # Start dev mode (vite + electron concurrently)
    Write-Host "[dev] Launching Vite + Electron..." -ForegroundColor Green
    npm run electron:dev
}
finally {
    Pop-Location
}
