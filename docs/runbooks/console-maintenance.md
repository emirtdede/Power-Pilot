# Konsol Bakım Modu Runbook'u (WP-15.T6)

Konsol, DB kaynaklı bir sorunda **sessizce bellek moduna düşmez**. Bakım modu:

- Tüm `GET` dışı API çağrıları HTTP **503** + `{ code: "CONSOLE_MAINTENANCE" }`.
- Heartbeat yazılmaz; ajanlar emir teslim almaz.
- Konsol arayüzünde bakım nedeni gösterilir.

## 1. Bakım moduna alma

```powershell
$env:PP_CONSOLE_MAINTENANCE = "1"
node src/console/run.js
```

Kalıcı kurulumda servis ortam değişkenini güncelleyip servisi yeniden başlatın.
Acil durumda `PP_CONSOLE_READONLY=1` ile yalnızca okuma modu kullanılabilir.

## 2. Bakım sırasında

- [ ] Yedek alındı (`node scripts/console-backup.mjs`).
- [ ] `powerpilot.db` üzerinde `PRAGMA quick_check` çalıştırıldı.
- [ ] Migration gerekiyorsa `MigrateV2` çıktısı loglandı.
- [ ] Ajanlara planlı bakım bilgisi iletildi (emir kuyruğu kullanılmaz).

## 3. Çıkış

1. DB bütünlüğü `ok` ise `PP_CONSOLE_MAINTENANCE` kaldırılır.
2. Konsol yeniden başlatılır; `GET /api/v1/health` 200 döner.
3. İlk heartbeat'lerde `order_delivered` denetim kayıtları görülür.
4. Kuyrukta biriken emirler `expiresAt` nedeniyle düşmüşse yeniden oluşturulur.

## 4. Geri alma

Bakım modundan çıkmak veri değiştirmez. Sorun devam ederse
`docs/runbooks/db-restore.md` ile son sağlam yedeğe dönün; konsolu tekrar
bakım moduna alın.
