# Olay Müdahale Runbook'u (WP-15.T6)

## 1. Sınıflandırma

| Olay | İlk eylem | Sorumlu |
|---|---|---|
| Denetim zinciri uyuşmazlığı (`auditTampered`) | Yıkıcı eylemleri durdur, DB'yi salt-okunur al | Güvenlik |
| Konsol/ajan anahtarı sızıntısı | Anahtarı iptal et, rotasyon uygula | Güvenlik |
| TLS özel anahtarı sızıntısı | Sertifikayı iptal et, yeni materyal dağıt | Sistem |
| Yetkisiz uzaktan kapatma | LAN modunu kapat, loopback'e al | Operasyon |
| Veri bozulması | Bakım modu + son sağlam yedek | Operasyon |

## 2. İzolasyon

1. Konsolu loopback'e alın (`consoleHost=127.0.0.1`) veya servisi durdurun.
2. `PP_CONSOLE_MAINTENANCE=1` ile yazmaları 503'e düşürün.
3. Ajanlarda `agentDisabled=true` (PIN'li güvenlik ayarı) ile yayılımı durdurun.
4. Kanıt: `audit-checkpoints/`, Windows Event Log `PPAUDIT:*`, uygulama logları.

## 3. Kanıt koruma

- DB ve `audit-checkpoints/` dizinini salt-okunur kopyalayın.
- HMAC anahtarını **kopyalamayın**; yalnızca doğrulama çıktısını saklayın.
- Zaman çizelgesi: ilk belirti, tespit, izolasyon, geri dönüş.

## 4. Temizlik ve geri dönüş

- Anahtar rotasyonu: `docs/runbooks/key-rotation.md`.
- Sertifika: `docs/runbooks/tls-renewal.md`.
- Veri: `docs/runbooks/db-restore.md`.
- Yalnızca doğrulanmış yedekten dönün; `quick_check` ve `get-audit` yeşil olmalı.

## 5. Kapanış

- [ ] Kök neden ve etki yazıldı.
- [ ] Denetim kaydı bütünlüğü doğrulandı.
- [ ] Sızıntı yapan anahtar/sertifika iptal edildi.
- [ ] Kalıcı düzeltme ve test eklendi.
- [ ] Müşteri/İK bilgilendirmesi yapıldı (gerekiyorsa).
