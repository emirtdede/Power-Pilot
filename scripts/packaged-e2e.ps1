# packaged-e2e.ps1 - WP-15.T3
# NSIS clean install + (optional) upgrade from previous version + uninstall.
#
# Usage:
#   powershell -File scripts/packaged-e2e.ps1 -Installer "dist\Power Pilot Setup 1.1.0.exe"
#   powershell -File scripts/packaged-e2e.ps1 -Installer "dist\...1.1.0.exe" -OldInstaller "artifacts\Power Pilot Setup 1.0.1.exe"
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $false)][string]$OldInstaller = "",
    [Parameter(Mandatory = $false)][string]$ExePath = "$env:LOCALAPPDATA\Programs\Power Pilot\Power Pilot.exe",
    [Parameter(Mandatory = $false)][string]$UserDataDir = "$env:APPDATA\PowerPilot-E2E"
)

$ErrorActionPreference = "Stop"

function Assert-ExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[packaged-e2e] $Step failed (exit=$LASTEXITCODE)."
        exit 1
    }
}

function Install-Nsis([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Error "[packaged-e2e] Installer missing: $Path"
        exit 1
    }
    Write-Host "[packaged-e2e] Installing: $Path"
    $proc = Start-Process -FilePath $Path -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Error "[packaged-e2e] NSIS exit=$($proc.ExitCode)"
        exit 1
    }
}

function Stop-RunningApp {
    Get-Process -Name "Power Pilot" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

function Uninstall-PowerPilot {
    Stop-RunningApp
    $uninstaller = Join-Path (Split-Path -Parent $ExePath) "Uninstall Power Pilot.exe"
    if (Test-Path -LiteralPath $uninstaller) {
        Write-Host "[packaged-e2e] Uninstalling: $uninstaller"
        $proc = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            Write-Error "[packaged-e2e] Uninstall exit=$($proc.ExitCode)"
            exit 1
        }
    }
    if (Test-Path -LiteralPath $ExePath) {
        Write-Error "[packaged-e2e] EXE still exists after uninstall: $ExePath"
        exit 1
    }
}

try {
    Uninstall-PowerPilot
    if (-not [string]::IsNullOrWhiteSpace($OldInstaller)) {
        Install-Nsis $OldInstaller
        if (-not (Test-Path -LiteralPath $ExePath)) {
            Write-Error "[packaged-e2e] EXE not found after previous version install."
            exit 1
        }
    }
    Install-Nsis $Installer
    if (-not (Test-Path -LiteralPath $ExePath)) {
        Write-Error "[packaged-e2e] EXE not found after install: $ExePath"
        exit 1
    }

    Stop-RunningApp
    Write-Host "[packaged-e2e] Running packaged Playwright verification..."
    $env:PP_PACKAGED_EXE = $ExePath
    npx playwright test tests/e2e/packaged.spec.js --reporter=list
    Assert-ExitCode "packaged.spec.js"

    # Kaldırma temizliği: uygulamanın yazdığı Windows Görev Zamanlayıcı
    # kayıtları (uygulama kapalıyken çalışsın diye) kaldırma sırasında
    # silinmeli. Aksi hâlde kullanıcı uygulamayı kaldırdıktan sonra Windows
    # silinmiş bir exe'yi çalıştırmaya çalışır.
    Write-Host "[packaged-e2e] Seeding a PowerPilot scheduled task to verify uninstall cleanup..."
    schtasks /Create /TN "\PowerPilot\task_e2euninstall" /TR "cmd /c exit" /SC ONCE /ST 23:59 /F | Out-Null
    Assert-ExitCode "seed scheduled task"
    Uninstall-PowerPilot
    $leftover = schtasks /Query /FO CSV /NH | Select-String -Pattern '\PowerPilot\' -SimpleMatch
    if ($leftover) {
        Write-Error "[packaged-e2e] Scheduled tasks survived uninstall: $leftover"
        exit 1
    }
    Write-Host "[packaged-e2e] PASS - clean install, upgrade, uninstall and scheduled-task cleanup verified."
    exit 0
} finally {
    # Görev kaldırma sırasında zaten silinmiş olabilir; temizlik hatası
    # PASS sonucunu exit code 1'e düşürmemeli (yerelleştirilmiş "bulunamadı"
    # mesajı schtasks tarafından stderr'e yazılıyor).
    try { schtasks /Delete /TN "\PowerPilot\task_e2euninstall" /F 2>$null | Out-Null } catch { }
    if (Test-Path -LiteralPath $UserDataDir) {
        Remove-Item -LiteralPath $UserDataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
