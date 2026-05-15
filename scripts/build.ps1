# CourseNote 编译为 EXE 安装包
# 依赖: npm, electron-builder

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectRoot "app"
$releaseDir = Join-Path $projectRoot "release"

Write-Host "[build] Building CourseNote EXE..." -ForegroundColor Cyan
Write-Host "[build] App dir: $appDir" -ForegroundColor Gray

Push-Location $appDir
try {
    # Check node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Host "[build] Installing npm dependencies..." -ForegroundColor Yellow
        npm install
    }

    # Build renderer + main
    Write-Host "[build] Compiling renderer (Vite)..." -ForegroundColor Yellow
    npm run build:renderer
    if ($LASTEXITCODE -ne 0) { throw "Renderer build failed" }

    Write-Host "[build] Compiling main process (TypeScript)..." -ForegroundColor Yellow
    npm run build:main
    if ($LASTEXITCODE -ne 0) { throw "Main process build failed" }

    # Package with electron-builder
    Write-Host "[build] Packaging with electron-builder..." -ForegroundColor Yellow
    npx electron-builder --win --x64
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

    Write-Host ""
    Write-Host "[build] Build complete!" -ForegroundColor Green
    Write-Host "[build] Output: $releaseDir" -ForegroundColor Green

    # List output files
    if (Test-Path $releaseDir) {
        Get-ChildItem $releaseDir -Filter "*.exe" | ForEach-Object {
            $sizeMB = [math]::Round($_.Length / 1MB, 1)
            Write-Host "  $($_.Name) ($sizeMB MB)" -ForegroundColor Gray
        }
    }
}
finally {
    Pop-Location
}
