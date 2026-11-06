<#
.SYNOPSIS
Project Atlas — Script de Instalação e Validação Física no Redmi 12 (Android)

.DESCRIPTION
Executa a detecção, instalação do APK release assinado e guia o teste físico
no smartphone Xiaomi Redmi 12.
#>

$ErrorActionPreference = "Stop"

$AdbPath = "C:\Users\joseo\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$ApkPath = "release-artifacts\Atlas-0.1.0-pilot.1-arm64.apk"
$PackageName = "br.com.atlasinvest.app"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Project Atlas — Validação Física no Dispositivo (Redmi 12)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verificar binário ADB
if (-not (Test-Path $AdbPath)) {
    Write-Error "ADB não encontrado no caminho esperado: $AdbPath"
    exit 1
}

# 2. Verificar artefato APK
if (-not (Test-Path $ApkPath)) {
    Write-Error "APK release assinado não encontrado em: $ApkPath"
    exit 1
}

# 3. Detectar dispositivos conectados
Write-Host "`n[1/4] Verificando conexão via ADB..." -ForegroundColor Yellow
$devicesOutput = & $AdbPath devices -l
Write-Host $devicesOutput

$deviceLines = ($devicesOutput -split "`r?`n") | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices attached" }
$unauthorizedLines = ($devicesOutput -split "`r?`n") | Where-Object { $_ -match "\bunauthorized\b" }

if ($unauthorizedLines) {
    Write-Warning "Dispositivo detectado com status 'unauthorized'!"
    Write-Host "Por favor, desbloqueie seu Redmi 12 e toque em 'Permitir a depuração USB' na tela do aparelho." -ForegroundColor Yellow
    exit 2
}

if (-not $deviceLines) {
    Write-Warning "Nenhum dispositivo Android detectado via USB!"
    Write-Host "`nInstruções para conectar o Redmi 12:" -ForegroundColor Cyan
    Write-Host "1. Conecte o Redmi 12 ao computador via cabo USB."
    Write-Host "2. No aparelho, ative: Configurações -> Opções do desenvolvedor -> Depuração USB."
    Write-Host "3. Também ative 'Instalar via USB' nas opções do desenvolvedor."
    Write-Host "4. Execute este script novamente: .\scripts\test-redmi12-device.ps1"
    exit 3
}

Write-Host "Dispositivo conectado com sucesso!" -ForegroundColor Green

# 4. Instalar APK Release Assinado
Write-Host "`n[2/4] Instalando APK release assinado ($ApkPath)..." -ForegroundColor Yellow
& $AdbPath install -r $ApkPath

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao instalar o APK via ADB."
    exit 4
}
Write-Host "APK instalado com sucesso no dispositivo!" -ForegroundColor Green

# 5. Iniciar Aplicação
Write-Host "`n[3/4] Iniciando o aplicativo no Redmi 12..." -ForegroundColor Yellow
& $AdbPath shell am start -n "$PackageName/.MainActivity"
Write-Host "Aplicativo aberto na tela do aparelho." -ForegroundColor Green

# 6. Roteiro de Validação Física
Write-Host "`n[4/4] Roteiro de Validação Física (Siga no aparelho):" -ForegroundColor Cyan
Write-Host "  [ ] Login: Efetue login e verifique a persistência da sessão."
Write-Host "  [ ] Restore: Feche o app, force stop via multitarefa e reabra; a sessão deve restaurar sem pedir senha."
Write-Host "  [ ] Telas: Navegue por Today, Portfolio, Market e Fiscal."
Write-Host "  [ ] Notificações: Conceda permissão de notificação e confira os alertas no Notification Center."
Write-Host "  [ ] Offline: Desative o Wi-Fi/dados móveis; confira o OfflineBanner e o cache das posições."
Write-Host "  [ ] Logout: Vá em Configurações e execute Logout; tokens e cache devem ser limpos."
Write-Host "`nValidação concluída!" -ForegroundColor Green
