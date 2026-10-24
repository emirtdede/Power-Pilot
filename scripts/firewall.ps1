<#
.SYNOPSIS
  Power Pilot için Windows Firewall kurallarını oluşturur (WP-02.T10).

.DESCRIPTION
  Yalnızca TLS portlarını (varsayılan 443 ve 8443) açar. Yerel API LAN modu
  kullanılıyorsa port 18456 yerine TLS üzerinden 8443/443 tercih edilmelidir.
  Kural kapsamı verilirse yalnızca o uzak adreslere izin verilir.

.EXAMPLE
  .\firewall.ps1 -Ports 8443 -RemoteAddress '10.0.0.0/24'
#>
[CmdletBinding()]
param(
    [int[]]$Ports = @(443, 8443),
    [string[]]$RemoteAddress = @('Any'),
    [string]$RuleGroup = 'Power Pilot'
)

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    throw 'Firewall kuralları için yönetici PowerShell gerekli.'
}

foreach ($port in $Ports) {
    $name = "$RuleGroup TLS $port"
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule `
        -DisplayName $name `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -RemoteAddress $RemoteAddress `
        -Action Allow `
        -Profile Domain,Private `
        -Description 'Power Pilot konsol/yerel API TLS uç noktası' | Out-Null
    Write-Host "Kural yazıldı: $name (port $port, uzak: $($RemoteAddress -join ','))"
}

Write-Host 'Not: Genel (Public) profil için kural açılmaz; TLS sonlandırma konsolda yapılır.'
