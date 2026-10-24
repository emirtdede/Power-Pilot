# Anahtar Rotasyonu Runbook'u (WP-15.T6)

## 1. Konsol emir imza anahtarı

- Dosya: `console-signing-key.pem` (SecretStore/ACL korumalı).
- Rotasyon: yeni Ed25519 anahtarı üretin, `keyId`'yi artırın (`default` → `default-2`).
- Ajanlara yeni ortak anahtarı **önce** dağıtın (`trustedPublicKeys`).
- 24 saat sonra eski `keyId`'yi allowlist'ten çıkarın.
- Eski özel anahtarı HSM/TPM dışında tutmayın; dosyayı güvenli silin.

## 2. Ajan API anahtarları

```powershell
# Konsol yönetici oturumu
POST /api/v1/keys  { "role": "agent", "agentId": "PC-01" }
```

- Yeni anahtar yalnızca bir kez düz metin döner; SHA-256 özeti saklanır.
- `keyId` ile eski anahtarı `POST /api/v1/keys/revoke` ile iptal edin.
- Ajan 401 alırsa anahtar dosyasını güncelleyip yeniden başlatın.

## 3. Yerel API anahtarı

Arayüz → Entegrasyonlar → **API Anahtarı Oluştur** (PIN gerekir). Yeni anahtar
eskiyi geçersiz kılar; 90 günde bir rotasyon önerilir. Denetim kaydı:
`api_key_generated`.

## 4. Yedek/SBOM anahtarları

- Yedek anahtarı: `safeStorage`/DPAPI; cihaz değişiminde yeniden üretilir,
  eski yedekler yeni anahtarla açılamaz (bilinçli tasarım).
- SBOM imza anahtarı: çevrimdışı release HSM'inde; `PP_SBOM_SIGNING_KEY`
  yalnızca release makinesinde tanımlanır, CI'ya PFX/anahtar secret'ı konmaz.

## 5. Kayıt

Her rotasyonda denetim kaydı + tarih, eski/yeni `keyId`, dağıtım zamanı ve
geri alma penceresi `docs/reports/key-rotation-log.md`'ye yazılır.
