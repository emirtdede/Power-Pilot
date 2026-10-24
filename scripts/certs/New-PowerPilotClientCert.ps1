<#
.SYNOPSIS
  mTLS istemci sertifikası üretir ve SHA-256 parmak izini yazdırır (WP-02.T10/T11).

.DESCRIPTION
  Varsayılan geçerlilik 30 gündür. Parmak izi `localApiClientFingerprints`
  allowlist'ine eklenir; iptal için Revoke-PowerPilotClient.ps1 kullanılır.

.EXAMPLE
  .\New-PowerPilotClientCert.ps1 -CaThumbprint ABC123 -Subject 'CN=pilot-pc-01'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CaThumbprint,
    [Parameter(Mandatory = $true)][string]$Subject,
    [string]$OutDir = (Join-Path $PSScriptRoot '..\..\data\certs'),
    [int]$Days = 30,
    [securestring]$PfxPassword
)

$ErrorActionPreference = 'Stop'
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ca = Get-Item "Cert:\CurrentUser\My\$($CaThumbprint.Replace(' ', ''))" -ErrorAction Stop
$cert = New-SelfSignedCertificate `
    -Subject $Subject `
    -Signer $ca `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.2') `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddDays($Days) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

$safeName = ($Subject -replace '[^A-Za-z0-9._-]', '_')
$cerPath = Join-Path $OutDir "$safeName.cer"
$pfxPath = Join-Path $OutDir "$safeName.pfx"
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
if (-not $PfxPassword) {
    $PfxPassword = Read-Host -AsSecureString 'İstemci PFX parolası'
}
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $PfxPassword | Out-Null

$fingerprint = ($cert.GetCertHashString('SHA256') -replace '(..)(?=.)', '$1:')
Write-Host "İstemci sertifikası oluşturuldu (geçerlilik: $Days gün)."
Write-Host "  Subject     : $Subject"
Write-Host "  Thumbprint  : $($cert.Thumbprint)"
Write-Host "  SHA-256 FP  : $fingerprint"
Write-Host "  CER         : $cerPath"
Write-Host "  PFX         : $pfxPath"
Write-Host ""
Write-Host "Allowlist'e eklenecek değer (ayarlar → localApiClientFingerprints):"
Write-Host "  $($fingerprint.Replace(':', ''))"
