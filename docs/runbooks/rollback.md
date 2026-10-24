# Geri Alma Runbook'u (WP-00.T6)

Bu runbook, yükseltme sonrası sorun çıktığında **veri kaybetmeden** önceki
sürüme dönmeyi anlatır. Çalışan sürümde güvenlik açığını geri getiren hiçbir
runtime anahtarı yoktur; geri dönüş yalnızca önceki ikili + veri yedeği ile
yapılır.

## 1. Yedek al (zorunlu)

```powershell
# Veri (sırlar hariç taşınabilir yedek)
node scripts/export-data.mjs --data-dir "$env:APPDATA\powerpilot" --out "D:\yedek\before-rollback.json"

# Ham veri + sır dosyası (aynı kullanıcı/makinede geri yükleme için)
Copy-Item "$env:APPDATA\powerpilot\powerpilot_data.json" "D:\yedek\powerpilot_data.json"
Copy-Item "$env:APPDATA\powerpilot\secrets.v1.json" "D:\yedek\secrets.v1.json" -ErrorAction SilentlyContinue
```

Konsol tarafında SQLite kullanılıyorsa:

```powershell
Copy-Item "$env:ProgramData\PowerPilot\Console\console.db" "D:\yedek\console.db"
Copy-Item "$env:ProgramData\PowerPilot\Console\console-signing-key.pem" "D:\yedek\console-signing-key.pem"
```

> `secrets.v1.json` DPAPI ile şifrelidir; başka kullanıcı/makinede açılmaz.

## 2. Uygulamayı durdur

```powershell
Stop-Service PowerPilotAgent -ErrorAction SilentlyContinue
Get-Process 'Power Pilot' -ErrorAction SilentlyContinue | Stop-Process
```

## 3. Önceki ikiliye dön

1. Denetim öncesi sürümün kurulum dosyasını (`Power Pilot Setup <eski>.exe`)
   çalıştırın.
2. NSIS kurulumu aynı dizine yazar; kullanıcı verisi silinmez.
3. Sürümü doğrulayın:

```powershell
(Get-Item "$env:LOCALAPPDATA\Programs\Power Pilot\Power Pilot.exe").VersionInfo.ProductVersion
```

## 4. Veriyi geri yükle

- Aynı makine/kullanıcı: `powerpilot_data.json` ve `secrets.v1.json` dosyalarını
  yerine kopyalayın.
- Farklı makine: yalnızca `before-rollback.json` (sırsız) kopyalayın; sırları
  yeniden girin (bkz. `docs/runbooks/backup.md`).

## 5. Sertifika geri alma

```powershell
# Sunucu sertifikasını eski PFX/PEM ile değiştir
Copy-Item "D:\yedek\server.pfx" "$env:ProgramData\PowerPilot\Tls\server.pfx"

# İptal edilen istemci varsa allowlist'ten çıkar (parmak iziyle)
.\scripts\certs\Revoke-PowerPilotClient.ps1 -Thumbprint <THUMBPRINT>
```

Sertifika değişiminden sonra Local API'yi yeniden başlatın ve
`docs/runbooks/tls.md` adımlarıyla doğrulayın.

## 6. Konsol bakım modu

Konsol açılmıyorsa veya veritabanı şüpheliyse:

1. `PP_CONSOLE_MAINTENANCE=1` ile konsolu başlatın (yalnızca yerel yönetim
   uçları açılır, ajan emirleri kuyruğa alınmaz).
2. `console.db` üzerinde `PRAGMA quick_check;` çalıştırın.
3. Sorun varsa yedekten geri yükleyin; üzerine yazmayın.
4. Bakım modundan çıkmadan önce denetim zincirini doğrulayın:
   `GET /api/v1/audit/verify` (admin anahtarı).

## 7. Doğrulama kontrol listesi

- [ ] Uygulama açılıyor, görevler listeleniyor.
- [ ] `secrets.v1.json` düz metin içermiyor (`Select-String` ile kontrol).
- [ ] Local API yalnızca beklenen port/arayüzde dinliyor.
- [ ] TLS/mTLS istemcileri bağlanıyor; yetkisiz istemci reddediliyor.
- [ ] Audit zinciri `verify()` ile temiz.
- [ ] Konsol senkronu çalışıyor; makbuzlar iletiliyor.

## 8. Geri alma sonrası

Olay kaydı açın: sürüm, geri alma nedeni, etkilenen cihazlar, sertifika
değişiklikleri ve doğrulama sonuçları. Güvenlik açığı nedeniyle geri
dönüldüyse aynı sürümü yeniden yayınlamayın; düzeltme sürümünü bekleyin.
