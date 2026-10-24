<#
.SYNOPSIS
  PowerPilot veri dizininin Windows ACL'ini sıkılaştırır (WP-04.T3).
.DESCRIPTION
  Kalıtımı kaldırır; yalnızca geçerli kullanıcı (SID), SYSTEM ve
  Administrators erişimini bırakır. Acl.js ile aynı mantığı kullanır.
.EXAMPLE
  .\scripts\secure-dir.ps1
  .\scripts\secure-dir.ps1 -Path 'C:\ProgramData\PowerPilot\Agent'
#>
param(
    [string]$Path = (Join-Path $env:ProgramData 'PowerPilot')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$aclModule = Join-Path $root 'src\main\security\Acl.js'
if (-not (Test-Path $aclModule)) { throw "Acl.js bulunamadı: $aclModule" }

if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

$resolved = (Resolve-Path $Path).Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js bulunamadı (PATH).' }

& $node -e "const Acl=require(process.argv[1]);const r=Acl.secureDirectory(process.argv[2]);if(!r.ok){console.error(JSON.stringify(r));process.exit(1);}console.log('ACL sıkılaştırıldı:',process.argv[2],'SID:',r.sid);" $aclModule $resolved
if ($LASTEXITCODE -ne 0) { throw "ACL uygulanamadı (çıkış $LASTEXITCODE)." }

Write-Host 'Mevcut erişim listesi:'
& icacls $resolved
