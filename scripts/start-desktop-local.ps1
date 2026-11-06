<#
.SYNOPSIS
  Project Atlas - Local Desktop Launcher
  Starts dedicated PostgreSQL on 5434, local API on 3001, and optionally opens Atlas Desktop.
#>
$ErrorActionPreference = "Stop"

$pgPort = 5434
$apiPort = 3001
$pgDataDir = "$env:LOCALAPPDATA\Atlas\pg_data"
$pgExe = "C:\Program Files\PostgreSQL\18\bin\postgres.exe"
$appExe = "$env:LOCALAPPDATA\Atlas\atlas-app.exe"

Write-Host "=== Project Atlas - Desktop Local Owner Runtime ===" -ForegroundColor Cyan

# 1. Check / Start PostgreSQL
$pgRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port $pgPort -InformationLevel Quiet
if (-not $pgRunning) {
    Write-Host "[1/3] Starting local PostgreSQL on port $pgPort..." -ForegroundColor Yellow
    if (-not (Test-Path $pgExe)) {
        Write-Error "PostgreSQL executable not found at $pgExe"
    }
    Start-Process -FilePath $pgExe -ArgumentList "-D", "`"$pgDataDir`"" -WindowStyle Hidden
    
    $attempts = 0
    while (-not $pgRunning -and $attempts -lt 15) {
        Start-Sleep -Milliseconds 500
        $pgRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port $pgPort -InformationLevel Quiet
        $attempts++
    }
    if ($pgRunning) {
        Write-Host "      PostgreSQL online on port $pgPort." -ForegroundColor Green
    } else {
        Write-Error "Failed to start PostgreSQL on port $pgPort."
    }
} else {
    Write-Host "[1/3] PostgreSQL is already active on port $pgPort." -ForegroundColor Green
}

# 2. Check / Start API
$apiOnline = $false
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($res.StatusCode -eq 200) { $apiOnline = $true }
} catch {
    $apiOnline = $false
}

if (-not $apiOnline) {
    Write-Host "[2/3] Starting Local Atlas API on port $apiPort..." -ForegroundColor Yellow
    $env:DATABASE_URL = "postgresql://atlas:atlas@127.0.0.1:$pgPort/atlas_local?schema=public"
    $env:ATLAS_LOCAL_OWNER_MODE = "true"
    $env:API_PORT = "$apiPort"
    Start-Process -FilePath "pnpm" -ArgumentList "run", "dev:api" -WorkingDirectory $PSScriptRoot\.. -WindowStyle Minimized
    
    $attempts = 0
    while (-not $apiOnline -and $attempts -lt 20) {
        Start-Sleep -Milliseconds 800
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($res.StatusCode -eq 200) { $apiOnline = $true }
        } catch {
            $apiOnline = $false
        }
        $attempts++
    }
    if ($apiOnline) {
        Write-Host "      Atlas API online and healthy on http://127.0.0.1:$apiPort" -ForegroundColor Green
    } else {
        Write-Warning "API is still starting up. Check http://127.0.0.1:$apiPort/ready."
    }
} else {
    Write-Host "[2/3] Atlas API is already running on http://127.0.0.1:$apiPort" -ForegroundColor Green
}

# 3. Launch Desktop App if requested
if ($args -contains "-LaunchApp" -or $args -contains "--app") {
    if (Test-Path $appExe) {
        Write-Host "[3/3] Launching Atlas Desktop..." -ForegroundColor Cyan
        Start-Process -FilePath $appExe
    } else {
        Write-Warning "Atlas Desktop app not found at $appExe. Run 'pnpm --filter @atlas/app tauri:build' first."
    }
} else {
    Write-Host "[3/3] Local runtime services are ready." -ForegroundColor Green
}
