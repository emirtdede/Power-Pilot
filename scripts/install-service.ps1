<#
.SYNOPSIS
  PowerPilot Ajanını Windows Servisi olarak kurar (NSSM ile).
.DESCRIPTION
  WP-04.T5: headless ajan paketlenmiş Electron çalıştırılabilirini kullanır
  (PowerPilot.exe --headless --user-data-dir=<dir>). Böylece SecretStore
  Electron safeStorage/DPAPI üzerinden çalışır; düz metin fallback yoktur.
  Geliştirme makinesinde paket yoksa Node ile sırsız modda çalıştırılabilir.
  Gereksinim: NSSM (https://nssm.cc) PATH'te ya da aynı dizinde.
.EXAMPLE
  .\scripts\install-service.ps1 -Install
  .\scripts\install-service.ps1 -Uninstall
#>
param(
    [switch]$Install,
    [switch]$Uninstall,
    [string]$ServiceName = 'PowerPilotAgent',
    [string]$DataDir = (Join-Path $env:ProgramData 'PowerPilot\Agent'),
    [string]$ExePath = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssm) {
    $local = Join-Path $root 'scripts\nssm.exe'
    if (Test-Path $local) { $nssm = $local } else { throw 'NSSM bulunamadı. https://nssm.cc adresinden indirip PATH yapın.' }
}

if ($Uninstall) {
    & $nssm stop $ServiceName
    & $nssm remove $ServiceName confirm
    Write-Host "Servis kaldırıldı: $ServiceName"
    return
}

if (-not $Install) { throw '-Install ya da -Uninstall belirtin.' }

if (-not $ExePath) {
    $candidates = @(
        (Join-Path $root 'dist\win-unpacked\Power Pilot.exe'),
        (Join-Path $root 'dist\win-unpacked\PowerPilot.exe'),
        (Join-Path $root 'Power Pilot.exe')
    )
    $ExePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

if ($ExePath -and (Test-Path $ExePath)) {
    $appArgs = "--headless --user-data-dir=`"$DataDir`""
    & $nssm install $ServiceName $ExePath $appArgs
} else {
    # Geliştirme fallback'i: Node ile yalnızca SIRSIZ kurulum desteklenir.
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { throw 'PowerPilot.exe bulunamadı ve Node.js PATH\'te yok.' }
    $runner = Join-Path $root 'src\agent\headless.js'
    if (-not (Test-Path $runner)) { throw "Çalıştırıcı yok: $runner" }
    Write-Warning 'Paketlenmiş PowerPilot.exe yok; Node fallback kullanılıyor (DPAPI/sır desteği YOK).'
    & $nssm install $ServiceName $node "`"$runner`" `"$DataDir`""
}

# WP-04.T5: Windows Event Log kaynağı (Application günlüğü).
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists('PowerPilot')) {
        New-EventLog -LogName Application -Source 'PowerPilot'
        Write-Host "Event Log kaynağı kaydedildi: PowerPilot"
    }
} catch {
    Write-Warning "Event Log kaynağı kaydedilemedi: $($_.Exception.Message)"
}

& $nssm set $ServiceName AppDirectory $root
& $nssm set $ServiceName DisplayName 'PowerPilot Agent'
& $nssm set $ServiceName Description 'PowerPilot kurumsal ajan (headless güç yönetimi)'
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName ObjectName LocalSystem
& $nssm set $ServiceName AppStdout (Join-Path $DataDir 'agent.stdout.log')
& $nssm set $ServiceName AppStderr (Join-Path $DataDir 'agent.stderr.log')
& $nssm start $ServiceName
Write-Host "Servis kuruldu ve başlatıldı: $ServiceName (veri: $DataDir)"
