<#
.SYNOPSIS
  Bir sertifikanın SHA-256 parmak izini allowlist biçiminde yazdırır (WP-02.T10).

.EXAMPLE
  .\Get-PowerPilotFingerprint.ps1 -Path .\powerpilot-client.cer
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
    [System.IO.Path]::GetFullPath($Path)
)
$fingerprint = ($cert.GetCertHashString('SHA256') -replace '(..)(?=.)', '$1:')
Write-Host "Subject    : $($cert.Subject)"
Write-Host "NotAfter   : $($cert.NotAfter.ToUniversalTime().ToString('u'))"
Write-Host "SHA-256 FP : $fingerprint"
Write-Host "Allowlist  : $($fingerprint.Replace(':', ''))"
