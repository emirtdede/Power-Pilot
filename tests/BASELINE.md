# Ölçülmüş Baseline — Power_Pilot v1.1.0

Bu dosya, `docs/planning/archive/REMEDIATION_PLAN_WBS.md` §0'daki baseline iddialarının kanıtıdır.
Her satır gerçekten çalıştırılmış bir komutun çıktısıdır; ölçülmeyen kapı
"ÖLÇÜLMEDİ" olarak işaretlenir, tahminle yeşil sayılmaz.

- Tarih: 26.10.2026
- Commit: `77a40a5` (HEAD) + bu turdaki C-01/C-02 düzeltmesi (commit edilmedi)
- Ortam: Windows 11 Pro, Node `v24.22.1`, npm `11.19.1`, Electron `43.4.0`
- Sürüm: `package.json` → `1.1.0`

## 1. Kapı durumu

| # | Kapı | Komut | Sonuç | Durum |
|---|------|-------|-------|-------|
| G1 | Birim/entegrasyon testleri | `npm test -- --reporter=dot` | 67 dosya / 649 test / 0 hata / 21.99 s | YEŞİL |
| G2 | Güvenlik taraması | `npm run test:security` | `[security-check] temiz (141 dosya tarandı)` | YEŞİL |
| G3 | Yük testi | `npm run test:load` | 100 ajan, 36 tur, 300 emir, kayıp=0, p95=1.14 ms, RSS=%-17.17 | YEŞİL |
| G4 | E2E (Playwright + Electron) | `npm run test:e2e` | 11 geçti, 1 atlandı (`packaged.spec.js`), 1.7 dk | YEŞİL |
| G4b | Paketli E2E (taze artefakt) | `PP_PACKAGED_EXE=dist\win-unpacked\Power Pilot.exe npx playwright test packaged` | 1 geçti, 15.3 s | YEŞİL |
| G5 | Paketleme | `npm run pack` | Taze `app.asar` (112.597.013 bayt), 21 s | YEŞİL |
| G6 | Kapsam kapısı | `npm run coverage` | Satır %78.41, dal %64.84, fonksiyon %72.71 → eşik altı, çıkış kodu 1 | KIRMIZI |

### G1 notu
C-01/C-02 düzeltmesinden önce 66 dosya / 639 test yeşildi. Bu turda
`tests/main/warning-pin.test.mjs` (9 test) ve K-13 paket regresyon testi
(+1) eklendi; toplam 67 dosya / 649 test, son çalıştırma **21.99 s**, çıkış 0.

**Kararlılık uyarısı:** makine paralel yük altındayken (Electron derlemesi +
diğer geliştirme süreçleri) iki test zamanlama eşiği nedeniyle düştü:
`secrets.test.mjs` T-SEC-03 (5 s varsayılan timeout → 20 s'ye çıkarıldı) ve
`console-store.test.mjs` T-CON-07 / `ai-backend.test.mjs` P2 (p95/lag
eşikleri). İzolasyonda üçü de geçiyor. Bu, ürün kusuru değil **test
altyapısının yük izolasyonu eksikliğidir**; CI'da tek iş paralel çalıştığı için
görünmez, yerelde yanlış kırmızı üretir.

### G4 notu
`tests/e2e/packaged.spec.js` varsayılan olarak atlanıyor: `PP_PACKAGED_EXE`
tanımlı değilse kurulum sonrası EXE'yi bilmiyor. Taze `dist/win-unpacked`
artefaktına işaret edilerek çalıştırıldı → **geçti** (G4b): `app://powerpilot/`
origin, preload yüzeyi, `better-sqlite3` ve `powerpilot.db` doğrulandı.

### G5 kanıtı — kök neden bulundu ve düzeltildi
İki ayrı kusur vardı:

1. **Sessiz no-op (asıl kusur).** Proje kökünde `electron-builder.js` adlı
   yapılandırma dosyası varken Windows `cmd`, `PATH` aramasından **önce** çalışma
   dizinindeki `<ad>.js` dosyasını çalıştırır. `npm run pack` gerçek CLI yerine bu
   dosyayı çalıştırıyor, dosya hiçbir şey yapmadan `0` ile çıkıyordu. Kanıt:
   - `where electron-builder` → `D:\...\Power_Pilot\electron-builder.js`
   - `npm run probe` (`electron-builder --version`) → **çıktı yok, çıkış 0**
   - `node_modules\.bin\electron-builder.cmd --version` → `26.15.3`
   - `npm run pack` → 4.1 s, çıktı yok, `app.asar` zaman damgası değişmedi
   Düzeltme: dosya `electron-builder.config.cjs` olarak yeniden adlandırıldı;
   `pack`, `dist`, `dist:nsis` betikleri bu yolu kullanıyor. Regresyon testi:
   `tests/main/release-1.1.test.mjs` ("CWD gölgelemesi").
2. **Yayın çözümlemesinde asılma.** `npx electron-builder --dir` (gerçek CLI)
   `--publish` bayrağı olmadan 30+ dk asılı kaldı; `--publish never` ile 33 s'de
   bitti. Düzeltme: üç betiğe `--publish never` eklendi. CI yayını
   `actions/upload-artifact` ile yapılıyor; otomatik yayın istenmiyor.

Düzeltme sonrası: `npm run pack` → **21 s**, taze `app.asar`
(112.597.013 bayt, 26.10.2026 13:50:20), `npm run verify:pack` → OK.
Not: `verify:pack` tek başına tazelik kanıtı değildir; zaman damgası da
kontrol edilmelidir (bu yüzden G5'te ikisi birlikte raporlanır).

### G6 kanıtı
`vitest.config.js:35-40` eşikleri: satır 80, dal 65, fonksiyon 70, ifade 80.
Ölçülen: satır %78.41, ifade %78.41, dal %64.84, fonksiyon %72.71 → **çıkış 1**.
Bu, 34 denetim bulgusundan bağımsız bir sürüm kapısı kusurudur (denetim `M-12`).

## 2. Kapsam kapsamı (kapsam dışı bırakılan kod)

`vitest.config.js:33` → `include: ['src/main/**/*.js']`.

Kapsam dışında kalan ve ölçüme girmeyen dosyalar:

- `main.js` (depo kökü) — denetimin **en kritik iki bulgusu (C-01, C-02) burada**
- `src/renderer/**` — C-01'in kullanıcıya görünen yarısı (`hideWarningBanner`)
- `src/console/**`, `src/agent/**`, `src/cli/**`

`coverage-summary.json` 66 dosya anahtarı içeriyor, renderer dosyası yok ve
`main.js` yok. Yani "kapsam %80" iddiası, ürünün en riskli iki katmanını
ölçmüyor.

## 3. Dosya bazlı kapsam (düşükten yükseğe)

| Dosya | Satır % | Dal % | Fonksiyon % |
|-------|---------|-------|-------------|
| `src/main/security/Acl.js` | 51.47 | 36.84 | 31.57 |
| `src/main/storage/Database.js` | 52.75 | 57.69 | 58.33 |
| `src/main/ipc/pinGuard.js` | 60.46 | 93.75 | 54.54 |
| `src/main/services/TaskManager.js` | 66.19 | 63.98 | 50.74 |
| `src/main/security/SecretStore.js` | 69.36 | 50.00 | 69.76 |
| `src/main/services/WebhookService.js` | 71.92 | 70.23 | 61.90 |
| `src/main/services/StorageService.js` | 72.20 | 47.16 | 69.35 |
| `src/main/services/WarningManager.js` | 72.32 | 75.75 | 58.33 |
| `src/main/ipc/validate.js` | 72.72 | 69.11 | 53.57 |
| `src/main/services/LocalApiService.js` | 75.32 | 77.04 | 64.70 |
| `src/main/security/SsrfGuard.js` | 76.52 | 62.63 | 100 |
| `src/main/services/OrderQueue.js` | 76.79 | 63.10 | 80.76 |
| `src/main/services/AuditLog.js` | 84.54 | 70.51 | 100 |
| `src/main/util/TimerRegistry.js` | 91.66 | 77.77 | 83.33 |
| `src/main/logger.js` | 92.59 | 60.00 | 40.00 |

## 4. Bu turda kapatılan boşluk

| Boşluk | Önce | Sonra |
|--------|------|-------|
| C-01/C-02 testi | `grep -E "warning-cancel\|warning-snooze" tests/` → 0 eşleşme | `tests/main/warning-pin.test.mjs` → 9 test |
| `warning-cancel` gövdesi | senkron handler, `await` yok | `await cancelWarningAction(...)`, `src/main/ipc/warningActions.js` |
| Renderer banner gizleme | yanıt ne olursa olsun gizleniyor | yalnızca `res.success === true` |
| Paket kapısı (G5) | `npm run pack` sessizce no-op (CWD gölgelemesi) | 21 s'de taze artefakt + `verify:pack` OK |
| Paketli E2E (G4b) | atlanıyordu | taze artefaktla geçti (15.3 s) |

## 5. Yeniden üretme

```powershell
npm test -- --reporter=dot
npm run test:security
npm run test:load
npm run test:e2e
npm run coverage      # bugün kırmızı — beklenen
npm run pack          # 21 s; taze app.asar üretir
npm run verify:pack
```
