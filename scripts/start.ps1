# CourseNote 快速启动 (不编译，直接运行已构建的 dist)
# 适用于开发调试 main process

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectRoot "app"

$mainJs = Join-Path $appDir "dist\main\main\main.js"
if (-not (Test-Path $mainJs)) {
    Write-Host "[start] dist not found, building first..." -ForegroundColor Yellow
    Push-Location $appDir
    try {
        npm run build:main
    }
    finally {
        Pop-Location
    }
}

Write-Host "[start] Launching Electron..." -ForegroundColor Green
Push-Location $appDir
try {
    npx electron .
}
finally {
    Pop-Location
}
