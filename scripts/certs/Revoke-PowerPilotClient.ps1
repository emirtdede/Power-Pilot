<#
.SYNOPSIS
  mTLS istemci parmak izini allowlist'ten çıkarır (WP-02.T10/T11).

.DESCRIPTION
  Power Pilot kapalıyken çalıştırılmalıdır. Veri dosyasının zaman damgalı
  yedeğini alır, `settings.localApiClientFingerprints` listesinden verilen
  SHA-256 parmak izini (iki nokta ile veya düz) kaldırır.

  Kaldırma sonrası: yeni TLS handshake'leri 401 alır; açık keep-alive
  bağlantılarındaki istekler de allowlist kontrolünden geçtiği için reddedilir
  ve bağlantı kapatılır.

.EXAMPLE
  .\Revoke-PowerPilotClient.ps1 -Fingerprint 'AA:BB:CC:...'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Fingerprint,
    [string]$DataFile = (Join-Path $env:APPDATA 'Power Pilot\powerpilot_data.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $DataFile)) {
    throw "Veri dosyası bulunamadı: $DataFile"
}
$running = Get-Process -Name 'Power Pilot' -ErrorAction SilentlyContinue
if ($running) {
    throw 'Power Pilot çalışıyor. İptal işlemi için uygulamayı kapatın.'
}

$normalized = ($Fingerprint -replace '[:\s]', '').ToUpperInvariant()
if ($normalized -notmatch '^[0-9A-F]{64}$') {
    throw 'Parmak izi 64 karakterlik SHA-256 hex olmalı (iki nokta opsiyonel).'
}

$backup = "$DataFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $DataFile -Destination $backup

$raw = Get-Content -LiteralPath $DataFile -Raw
$data = $raw | ConvertFrom-Json
if (-not $data.settings) { $data | Add-Member -NotePropertyName settings -NotePropertyValue ([pscustomobject]@{}) }
$list = @($data.settings.localApiClientFingerprints)
$before = $list.Count
$kept = @($list | Where-Object { (($_ -replace '[:\s]', '').ToUpperInvariant()) -ne $normalized })

if ($kept.Count -eq $before) {
    Write-Warning 'Parmak izi allowlist içinde bulunamadı; dosya değiştirilmedi.'
    Remove-Item -LiteralPath $backup
    exit 0
}

$data.settings | Add-Member -NotePropertyName localApiClientFingerprints -NotePropertyValue $kept -Force
$json = $data | ConvertTo-Json -Depth 64
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($DataFile, $json, $utf8)

Write-Host "Parmak izi iptal edildi: $normalized"
Write-Host "  Kalan izinli istemci: $($kept.Count)"
Write-Host "  Yedek: $backup"
Write-Host "  Ayarları uygulamak için Power Pilot'u yeniden başlatın."
