# verify-signature.ps1 - WP-15.T2
# İmzalı NSIS artefaktını Authenticode + RFC 3161 zaman damgası ile doğrular.
# Kullanım: powershell -File scripts/verify-signature.ps1 "dist\Power Pilot Setup 1.1.0.exe"
param(
    [Parameter(Mandatory = $false)]
    [string]$Path = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Path)) {
    $candidate = Get-ChildItem -Path "dist" -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*Setup*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $candidate) {
        Write-Error "[verify-signature] dist altında Setup .exe bulunamadı."
        exit 1
    }
    $Path = $candidate.FullName
}

if (-not (Test-Path -LiteralPath $Path)) {
    Write-Error "[verify-signature] Dosya yok: $Path"
    exit 1
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
    $roots = @(
        "$env:ProgramFiles(x86)\Windows Kits\10\bin",
        "$env:ProgramFiles\Windows Kits\10\bin",
        # Windows SDK kurulu olmayan makinelerde electron-builder'in indirdigi
        # winCodeSign paketindeki signtool kullanilir (ek kurulum gerekmez).
        "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
    )
    $found = $null
    foreach ($root in $roots) {
        if (Test-Path $root) {
            $found = Get-ChildItem -Path $root -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
                Sort-Object FullName -Descending |
                Select-Object -First 1
            if ($found) { break }
        }
    }
    if (-not $found) {
        Write-Error "[verify-signature] signtool.exe bulunamadı (Windows SDK gerekli)."
        exit 1
    }
    $signtool = $found.FullName
} else {
    $signtool = $signtool.Source
}

Write-Host "[verify-signature] signtool verify /pa /all: $Path"
& $signtool verify /pa /all /v "$Path"
if ($LASTEXITCODE -ne 0) {
    Write-Error "[verify-signature] signtool doğrulaması başarısız."
    exit 1
}

$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne "Valid") {
    Write-Error "[verify-signature] Authenticode durumu geçersiz: $($signature.Status)"
    exit 1
}
if (-not $signature.TimeStamperCertificate) {
    Write-Error "[verify-signature] RFC 3161 zaman damgası yok."
    exit 1
}

$hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
Write-Host "[verify-signature] OK - imza geçerli, timestamp mevcut."
Write-Host "[verify-signature] SHA-256: $hash"
exit 0
