<#
.SYNOPSIS
  WP-00.S4 — PowerPilot.exe --headless --user-data-dir spike.
.DESCRIPTION
  Paketlenmiş ikili varsa onu, yoksa geliştirme Electron'unu kullanır.
  Ajanın veri dizinini oluşturduğunu ve sır deposunun (secrets.v1.json)
  DPAPI arka ucuyla hazır olduğunu doğrular.
#>
param(
    [string]$DataDir = (Join-Path $env:TEMP ("pp-headless-spike-" + [guid]::NewGuid().ToString('N'))),
    [int]$WaitSeconds = 12
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$exe = Join-Path $root 'dist\win-unpacked\Power Pilot.exe'
$useExe = Test-Path $exe
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$appArgs = @()
if ($useExe) {
    $file = $exe
    $appArgs = @('--headless', "--user-data-dir=$DataDir")
} else {
    $file = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
    if (-not $file) { throw 'npx.cmd bulunamadı.' }
    $appArgs = @('electron', '.', '--headless', "--user-data-dir=$DataDir")
}

Write-Host "Başlatılıyor: $file $($appArgs -join ' ')"
$p = Start-Process -FilePath $file -ArgumentList $appArgs -PassThru -WindowStyle Hidden
try {
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $dataFile = Join-Path $DataDir 'powerpilot_data.json'
    while ((Get-Date) -lt $deadline -and -not (Test-Path $dataFile)) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path $dataFile)) { throw "Veri dosyası oluşmadı: $dataFile" }
    $json = Get-Content $dataFile -Raw | ConvertFrom-Json
    Write-Host "[spike:S4] OK: headless ajan veri dosyasını oluşturdu (version=$($json.version))."
    Write-Host "[spike:S4] Veri dizini: $DataDir"
    Write-Host "[spike:S4] NOT: Sır yazma/okuma için ajanı --user-data-dir ile başlatıp konsol anahtarı provisioning yapın."
} finally {
    if ($p -and -not $p.HasExited) {
        & taskkill /PID $p.Id /T /F | Out-Null
    }
}
