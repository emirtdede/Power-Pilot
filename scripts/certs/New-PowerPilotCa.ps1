<#
.SYNOPSIS
  Power Pilot kök CA'sı oluşturur (WP-02.T10).

.DESCRIPTION
  Şirket içi TLS için 10 yıl geçerli, yalnızca sertifika imzalama yetkisi olan
  bir kök CA üretir. Özel anahtar varsayılan olarak makinenin kişisel deposunda
  kalır; üretimde HSM/atölye makinesinde saklayın.

.EXAMPLE
  .\New-PowerPilotCa.ps1 -OutDir D:\PowerPilot\certs
#>
[CmdletBinding()]
param(
    [string]$OutDir = (Join-Path $PSScriptRoot '..\..\data\certs'),
    [string]$Subject = 'CN=Power Pilot Root CA, O=Power Pilot',
    [int]$Years = 10,
    [securestring]$PfxPassword
)

$ErrorActionPreference = 'Stop'
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$cert = New-SelfSignedCertificate `
    -Subject $Subject `
    -KeyAlgorithm RSA `
    -KeyLength 4096 `
    -HashAlgorithm SHA256 `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -KeyExportPolicy NonExportable `
    -NotAfter (Get-Date).AddYears($Years) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

$cerPath = Join-Path $OutDir 'powerpilot-ca.cer'
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

$pfxPath = Join-Path $OutDir 'powerpilot-ca.pfx'
if (-not $PfxPassword) {
    $PfxPassword = Read-Host -AsSecureString 'CA PFX parolası'
}
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $PfxPassword | Out-Null

Write-Host "CA oluşturuldu."
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  CER        : $cerPath"
Write-Host "  PFX        : $pfxPath"
Write-Host ""
Write-Host "Sunucu/istemci sertifikaları bu thumbprint ile imzalanır:"
Write-Host "  .\New-PowerPilotServerCert.ps1 -CaThumbprint $($cert.Thumbprint) -DnsName powerpilot.sirket.local"
Write-Host "  .\New-PowerPilotClientCert.ps1 -CaThumbprint $($cert.Thumbprint) -Subject CN=pilot-pc-01"
