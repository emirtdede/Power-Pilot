# Kurulum Artefaktı Kanıtı — Power Pilot 1.1.0

**Ölçüm tarihi:** 2026-11-19 (yerel saat) · **Makine:** Windows 10.0.26200 · **Node:** `>=24.18.1`

Derleme komutu (tek ağaçtan iki hedef):

```powershell
npx electron-builder --win nsis portable --config electron-builder.config.cjs --publish never
```

## 1. Kurulum paketi (NSIS)

| Alan | Değer |
|---|---|
| Dosya | `dist/Power Pilot Setup 1.1.0.exe` |
| Boyut | **112 313 702 bayt** (≈ 107,1 MiB) |
| SHA256 | `FCD0408589703104B2C57672174A7C8487C97B4FE22761277FBA5CB22BFDC614` |
| İmza | **NotSigned** (kod imzalama kapsam dışı — sertifika bu makinede yok) |
| Paket tarihi | 2026-11-19 10:17:48 |

## 2. Taşınabilir sürüm (portable)

| Alan | Değer |
|---|---|
| Dosya | `dist/Power Pilot Portable 1.1.0.exe` |
| Boyut | **112 079 094 bayt** (≈ 106,9 MiB) |
| SHA256 | `91A332BD68490513481DEC265B63AAFD89C248B84C0B98E585FCDB95DA90E912` |
| İmza | **NotSigned** |
| Paket tarihi | 2026-11-19 10:17:56 |

Taşınabilir sürümün iki davranışı kodla sabitlendi (`src/main/util/Portable.js`, `tests/main/portable-mode.test.mjs` — 10 test):

1. **Veri yeri** — `%APPDATA%` yerine SFX'in yanındaki `PowerPilotData/`.
   Ölçüm (SFX gerçekten çalıştırıldı, 30 sn):
   ```
   data_dir_exists=True
   PowerPilotData\powerpilot.db, secrets.v1.json, logs\main.log, backups\, models\
   logs\main.log: [Portable] veri klasörü: C:\...\pp-portable-verify\PowerPilotData
   ```
2. **Zamanlayıcı yolu** — kayıt geçici çıkarma dizinini değil SFX'i gösterir.
   Ölçüm (`scratch/probe-portable-scheduler.cjs`, 5/5 PASS):
   ```
   kayıt: {"command":"...\dist\Power Pilot Portable 1.1.0.exe",
           "arguments":"--run-task=task_mwn879nq_df6a5fed1239"}
   PASS  kayıt SFX yolunu gösteriyor (geçici çıkarma dizini DEĞİL)
   PASS  kayıt --run-task argümanını taşıyor
   ```

## 3. Paket E2E sonucu (yeni derleme)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\packaged-e2e.ps1 `
  -Installer "dist\Power Pilot Setup 1.1.0.exe"
```

Sonuç: **PASS, exit 0** — temiz kurulum → paketlenmiş Playwright doğrulaması
(1/1) → kaldırma → `\PowerPilot\` zamanlayıcı kaydı temizliği.

Yükseltme yolu ayrıca ölçüldü (önceki derleme: `1.0.9` stand-in, aynı ağaçtan
`--config.extraMetadata.version=1.0.9`):

```
[packaged-e2e] Installing: dist\Power Pilot Setup 1.0.9.exe
[packaged-e2e] Installing: dist\Power Pilot Setup 1.1.0.exe
[packaged-e2e] PASS - clean install, upgrade, uninstall and scheduled-task cleanup verified.
SCRIPT_EXIT=0
```

> Not: `1.0.9` artefaktı depoda yayınlanmış eski kurulum olmadığı için yerine
> geçen (stand-in) bir derlemedir; kanıtlanan şey NSIS **yükseltme/kaldırma**
> davranışıdır, eski sürümün iş mantığı değil. Yeni derleme `dist/` üretildikten
> sonra bu dosya silinmiştir; gerekirse aynı komutla yeniden üretilir.

## 4. Masaüstü kopyaları

`C:\Users\emir\Desktop` altına kopyalanan dosyaların SHA256 değerleri kaynakla
birebir aynı doğrulandı:

| Dosya | Boyut | SHA256 eşleşmesi |
|---|---:|---|
| `Power Pilot Setup 1.1.0.exe` | 112 313 702 | ✅ aynı |
| `Power Pilot Portable 1.1.0.exe` | 112 079 094 | ✅ aynı |
