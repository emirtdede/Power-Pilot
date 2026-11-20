# Veritabanı Geri Yükleme Runbook'u (WP-15.T6)

SQLite (`powerpilot.db`) tek gerçek kaynaktır. Yedekler `VACUUM INTO` +
AES-256-GCM ile `backups/` altında tutulur; anahtar SecretStore'dadır.

## 0. Otomatik kurtarma (bozuk DB)

Uygulama açılışta `PRAGMA quick_check` çalıştırır. Sonuç `ok` değilse **veya**
`new Db()` bozuk başlık nedeniyle istisna fırlatırsa**:

1. Bozuk dosya **silinmez**; `quarantine/powerpilot_corrupt_<ISO>.db` altına taşınır.
   `-wal`/`-shm` artıkları temizlenir.
2. Temiz şemayla yeni bir DB açılır; uygulama kullanılabilir kalır.
3. Arayüz `role="status"` canlı bölgeyle çevrilmiş bildirim + özgün dosya yolunu gösterir.

Karantina taşıması başarısız olursa sessiz veri kaybına girmemek için bakım
moduna düşülür ve "Veri klasörünü aç" düğmesi sunulur.

> Eski `powerpilot_data.json` için sözleşme (T-STO-03) farklıdır: kaynak dosya
> **asla** taşınmaz/değiştirilmez; `backups/powerpilot_data_corrupted_*.json`
> yedeği alınır ve bakım modu + veri klasörü çıkışı gösterilir.

## 1. Bakım moduna al

Konsol: `PP_CONSOLE_MAINTENANCE=1` ile yeniden başlatın; tüm yazma uçları
HTTP 503 `CONSOLE_MAINTENANCE` döner. Masaüstü: uygulamayı kapatın.

## 2. Bütünlük kontrolü

```powershell
node scripts/db-backup.mjs --list --data-dir "$env:APPDATA\powerpilot"
```

Yedek dosyası `.enc` uzantılıdır; yanındaki `.json` manifest sha256 ve boyut taşır.

## 3. Geri yükleme

```powershell
node scripts/restore-db.mjs `
  --data-dir "$env:APPDATA\powerpilot" `
  --backup "$env:APPDATA\powerpilot\backups\powerpilot-YYYYMMDD-HHMMSS.db.enc" `
  --key-file "$env:APPDATA\powerpilot\backup.key"
```

Komut:

1. Mevcut DB'yi `powerpilot.db.pre-restore-<ts>` olarak saklar.
2. Şifreyi çözer, `PRAGMA quick_check` çalıştırır.
3. Şema sürümünü doğrular; düşükse migration uygular.
4. Atomik rename ile yerine koyar.

## 4. Doğrulama

```powershell
node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true});console.log(db.pragma('quick_check'),db.prepare('select count(*) n from tasks').get());db.close()" "$env:APPDATA\powerpilot\powerpilot.db"
```

- [ ] `quick_check` = `ok`
- [ ] Görev/geçmiş sayıları yedek manifestiyle uyumlu.
- [ ] `get-security-status` ve `get-audit` doğrulaması yeşil.
- [ ] Bakım modu kapatıldı; konsol 200 dönüyor.

## 5. Geri alma

`powerpilot.db.pre-restore-*` dosyasını `powerpilot.db` üzerine kopyalayın ve
uygulamayı yeniden başlatın. Yedek anahtarı kaybolduysa veri kurtarılamaz;
`docs/runbooks/incident-response.md` sürecini başlatın.
