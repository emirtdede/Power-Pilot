<#
.SYNOPSIS
  Yerel API / konsol sunucusu için CA imzalı sunucu sertifikası üretir (WP-02.T10).

.DESCRIPTION
  Varsayılan geçerlilik 90 gündür. SAN listesine sunucu adı ve gerekli IP'ler
  eklenir; tarayıcı/ajan doğrulaması CN'e değil SAN'a bakar.

.EXAMPLE
  .\New-PowerPilotServerCert.ps1 -CaThumbprint ABC123 -DnsName powerpilot.sirket.local -IpAddress 10.0.0.5
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CaThumbprint,
    [Parameter(Mandatory = $true)][string[]]$DnsName,
    [string[]]$IpAddress = @(),
    [string]$OutDir = (Join-Path $PSScriptRoot '..\..\data\certs'),
    [int]$Days = 90,
    [securestring]$PfxPassword
)

$ErrorActionPreference = 'Stop'
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ca = Get-Item "Cert:\CurrentUser\My\$($CaThumbprint.Replace(' ', ''))" -ErrorAction Stop
$san = @($DnsName | ForEach-Object { "DNS=$_" }) + @($IpAddress | ForEach-Object { "IP=$_" })

$cert = New-SelfSignedCertificate `
    -Subject "CN=$($DnsName[0]), O=Power Pilot" `
    -Signer $ca `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1", "2.5.29.17={text}$($san -join '&')") `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddDays($Days) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

$cerPath = Join-Path $OutDir 'powerpilot-server.cer'
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

$pfxPath = Join-Path $OutDir 'powerpilot-server.pfx'
if (-not $PfxPassword) {
    $PfxPassword = Read-Host -AsSecureString 'Sunucu PFX parolası'
}
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $PfxPassword | Out-Null

# PEM çıktısı: Node TlsConfig localApiCertFile / localApiKeyFile bekler.
$pemPath = Join-Path $OutDir 'powerpilot-server.pem'
$keyPath = Join-Path $OutDir 'powerpilot-server.key.pem'
$password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword)
)
try {
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
    $x509 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $password, $flags)
    $certPem = "-----BEGIN CERTIFICATE-----`n" +
        [Convert]::ToBase64String($x509.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----`n"
    Set-Content -Path $pemPath -Value $certPem -NoNewline -Encoding ascii

    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($x509)
    $keyPem = "-----BEGIN PRIVATE KEY-----`n" +
        [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey(), 'InsertLineBreaks') + "`n-----END PRIVATE KEY-----`n"
    Set-Content -Path $keyPath -Value $keyPem -NoNewline -Encoding ascii
} finally {
    if ($password) { $password = $null }
}

Write-Host "Sunucu sertifikası oluşturuldu (geçerlilik: $Days gün)."
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  CER        : $cerPath"
Write-Host "  PFX        : $pfxPath"
Write-Host "  PEM cert   : $pemPath"
Write-Host "  PEM key    : $keyPath"
Write-Host ""
Write-Host "Ayarlar: localApiTlsEnabled=true, localApiCertFile=$pemPath, localApiKeyFile=$keyPath"
Write-Host "Yenileme: 90 gün dolmadan bu script'i yeni bir sertifikayla çalıştırıp ayarları güncelleyin."
