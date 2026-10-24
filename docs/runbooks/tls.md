# TLS / mTLS Runbook (WP-02)

Bu runbook, Power Pilot yerel API'si ve şirket konsolu için TLS/mTLS kurulum,
yenileme ve iptal adımlarını tanımlar. Kod tarafında tek kaynak
`src/main/security/TlsConfig.js`'tir; sessiz HTTP fallback yoktur.

## 1. Sertifika hiyerarşisi

| Bileşen | Geçerlilik | Anahtar | Kullanım |
|---|---|---|---|
| Kök CA | 10 yıl | RSA 4096 | Yalnızca imzalama; sunucuda çalışmaz |
| Sunucu sertifikası | 90 gün | RSA 2048 | Yerel API ve konsol HTTPS |
| İstemci sertifikası | 30 gün | RSA 2048 | mTLS ajan/operatör istemcileri |

CA özel anahtarı çevrimdışı/HSM'de tutulur. Üretim sunucusunda yalnızca
`powerpilot-server.pem` + `powerpilot-server.key.pem` bulunur.

## 2. İlk kurulum

```powershell
# 1) CA (çevrimdışı atölye makinesi)
.\scripts\certs\New-PowerPilotCa.ps1 -OutDir D:\PowerPilot\certs

# 2) Sunucu sertifikası (90 gün)
.\scripts\certs\New-PowerPilotServerCert.ps1 `
  -CaThumbprint <CA_THUMBPRINT> `
  -DnsName powerpilot.sirket.local `
  -IpAddress 10.0.0.5 `
  -OutDir D:\PowerPilot\certs

# 3) İstemci sertifikası (mTLS kullanılacaksa)
.\scripts\certs\New-PowerPilotClientCert.ps1 `
  -CaThumbprint <CA_THUMBPRINT> `
  -Subject 'CN=pilot-pc-01' `
  -OutDir D:\PowerPilot\certs
```

CA `.cer` dosyasını tüm ajanlara dağıtın ve güvenilen kök deposuna ekleyin.

## 3. Yerel API ayarları

`powerpilot_data.json` içinde (veya Ayarlar ekranından):

```json
{
  "localApiEnabled": true,
  "localApiTlsEnabled": true,
  "localApiCertFile": "D:\\PowerPilot\\certs\\powerpilot-server.pem",
  "localApiKeyFile": "D:\\PowerPilot\\certs\\powerpilot-server.key.pem",
  "localApiCaFile": "D:\\PowerPilot\\certs\\powerpilot-ca.cer",
  "localApiRequireClientCert": true,
  "localApiClientFingerprints": ["<64_HEX_SHA256>"],
  "lanModeEnabled": true,
  "lanAllowedIps": ["10.0.0.0/24"]
}
```

Kurallar:

- `lanModeEnabled=true` iken `localApiTlsEnabled=false` **reddedilir**
  (`LAN_REQUIRES_TLS`); ayar dosyasına yazılmaz.
- TLS açık + materyal eksikse sunucu başlamaz (`TLS_MATERIAL_MISSING`).
- mTLS açıkken istemci sertifikası `socket.authorized === true` değilse,
  `authorizationError` doluysa veya parmak izi allowlist dışındaysa istek
  `401 MTLS_REQUIRED` alır ve bağlantı kapatılır.
- mTLS'i TLS olmadan açmak reddedilir (`MTLS_REQUIRES_TLS`).

## 4. Konsol sunucusu

```powershell
$env:CONSOLE_ADMIN_KEY = '<admin>'
$env:CONSOLE_AGENT_KEY = '<agent>'
$env:CONSOLE_CERT_FILE = 'D:\PowerPilot\certs\powerpilot-server.pem'
$env:CONSOLE_KEY_FILE  = 'D:\PowerPilot\certs\powerpilot-server.key.pem'
$env:CONSOLE_CA_FILE   = 'D:\PowerPilot\certs\powerpilot-ca.cer'
$env:CONSOLE_HOST = '0.0.0.0'
$env:CONSOLE_PORT = '8443'
node src/console/run.js
```

- Konsol varsayılan olarak HTTPS'tir. TLS materyali yoksa başlatma
  `CONSOLE_TLS_REQUIRED` ile reddedilir.
- Geliştirme kaçış kapısı: yalnızca `CONSOLE_HOST=127.0.0.1` **ve**
  `PP_ALLOW_INSECURE_CONSOLE=1` birlikteyken düz HTTP'ye izin verilir.
- Ajan `consoleUrl` değeri `https://` olmalıdır; `http://` → `TLS_REQUIRED`
  (istek hiç gitmez). Yönlendirmeler izlenmez (`CONSOLE_REDIRECT`).
- İstemci 30 sn timeout uygular; sertifika hatası `TLS_CERTIFICATE_ERROR`
  olarak kullanıcıya görünür.

## 5. Windows Firewall

```powershell
# Yönetici PowerShell
.\scripts\firewall.ps1 -Ports 8443 -RemoteAddress '10.0.0.0/24'
```

Yalnızca TLS portları açılır (443/8443). Genel profil için kural açılmaz.

## 6. Parmak izi kaydı / iptali

Kayıt:

```powershell
.\scripts\certs\Get-PowerPilotFingerprint.ps1 -Path D:\PowerPilot\certs\CN_pilot-pc-01.cer
```

Çıktıdaki 64 hex değeri `localApiClientFingerprints` listesine ekleyin.

İptal (uygulama kapalıyken):

```powershell
.\scripts\certs\Revoke-PowerPilotClient.ps1 -Fingerprint 'AA:BB:...'
```

Etki: yeni handshake'ler 401 alır; mevcut keep-alive bağlantısındaki istekler
de allowlist kontrolünden geçtiği için reddedilir ve bağlantı kapatılır
(≤ 5 sn). İşlem öncesi veri dosyasının yedeği alınır.

## 7. Yenileme takvimi

| Süre | Aksiyon |
|---|---|
| Sunucu sertifikası 75. gün | Yeni sertifika üret, dosyaları değiştir, uygulamayı yeniden başlat |
| İstemci sertifikası 25. gün | Yeni istemci sertifikası + parmak izi rotasyonu |
| CA 9. yıl | Yeni kök CA'ya geçiş planı; eski CA'yı en az 90 gün paralel tut |

Yenileme sonrası doğrulama: `tests/main/tls.test.mjs` (T-TLS-01…11) ve
`npm run security:check`.

## 8. Olay müdahalesi

1. Şüpheli istemci: parmak izini allowlist'ten çıkar (§6).
2. Anahtar sızıntısı: konsol ajan anahtarını `POST /api/v1/keys` ile yenile,
   eski kaydı sil; yerel API anahtarını `generate-api-key` ile döndür.
3. TLS hatası logları: `[LocalApiService] Server error` / `[Console] Başlatılamadı`.
   `DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` → CA dağıtımı
   eksik; `CERT_HAS_EXPIRED` → yenileme takvimi atlanmış.
