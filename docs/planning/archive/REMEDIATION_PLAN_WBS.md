# Power_Pilot — Remediation Plan v2 (WBS + Risk + Test)

**Kaynak denetim:** `PRE_DEPLOYMENT_QA_AUDIT.md` (34 bulgu: 4 Critical, 6 High, 11 Medium, 13 Low)
**Sürüm stratejisi:** aşamalı — `1.1.1` (kritik güvenlik) → `1.2.0` (tam kapsam)
**Test altyapısı:** Vitest 3.2.4 (`tests/main`, `tests/renderer`), Playwright 1.64.1 (`tests/e2e`), `scripts/security-check.mjs`, `scripts/load-test.mjs`
**Plan tarihi:** 2026-10-25
**Revizyon:** v2 — v1'in 8 kusuru kapatıldı (§3.5'te satır satır izlenebilir)

---

## 0. Ölçülmüş Baseline (varsayım değil, komut çıktısı)

Bu planın tamamı aşağıdaki dört ölçüme dayanır.

| # | Ölçüm | Komut | Sonuç | Durum |
|---|---|---|---|---|
| B1 | Birim/entegrasyon testi | `npm test -- --reporter=dot` | **67 dosya / 649 test / 0 başarısız / 21.99 s** | YEŞİL |
| B2 | Kapsam kapısı | `npm run coverage` | satır **78.41** (eşik 80) · dal **64.84** (65) · fonksiyon **72.71** (70) · ifade **78.41** (80) | **KIRMIZI** (exit 1) |
| B3 | Kapsam kapsamı | `vitest.config.js:33` | `include: ['src/main/**/*.js']` | `main.js`, `src/renderer/**`, `src/console/**`, `src/agent/**`, `src/cli/**` **ölçüm dışı** |
| B4 | Kritik handler testi | `grep -E "warning-cancel\|warning-snooze\|set-cancel-pin\|clear-cancel-pin" tests/` | **9 test** (`tests/main/warning-pin.test.mjs`) | KAPANDI (C-01/C-02) |
| B5 | Paketleme | `npm run pack` + `verify:pack` | **21 s**, taze `app.asar` (112.597.013 bayt) | YEŞİL |
| B6 | Paketli E2E | `PP_PACKAGED_EXE=dist\win-unpacked\Power Pilot.exe npx playwright test packaged` | **1 geçti / 15.3 s** | YEŞİL |
| B7 | Yük testi | `npm run test:load` | 100 ajan · 36 tur · 300 emir · kayıp 0 · p95 1.14 ms | YEŞİL |
| B8 | Güvenlik taraması | `npm run test:security` | 141 dosya · temiz | YEŞİL |

Kanıt dosyası: `tests/BASELINE.md`.

### 0.1 Baseline'ın plana etkisi

B1+B4 birlikte tek bir şeyi kanıtlar: **639 yeşil test, 4 kritik hatanın hiçbirini görmüyordu** — o dört IPC kanalını çağıran tek bir test yoktu. Bu turda C-01/C-02 için 9 test eklendi; C-04 (`set-cancel-pin` / `clear-cancel-pin`) hâlâ testsiz ve `WP-1.3`'ün ilk işi.

B2+B3 ikinci gerçeği ortaya çıkarır: **C-01, C-02 ve C-04'ün bulunduğu `main.js` dosyası kapsam ölçümünün tamamen dışında.** Kapı yalnızca `src/main/**` altını ölçüyor, `main.js` depo kökünde. Projenin kendi kapsam kapısı en tehlikeli dosyayı hiç görmüyor — ve buna rağmen **şu anda kırmızı**.

Bu iki bulgu plana üç zorunlu değişiklik getirdi:

1. `WP-0.1` artık "baseline kaydet" değil, "**ölç, kör noktayı kanıtla, kapsamı genişlet**" işidir.
2. Kapsam eşiği **düşürülmez**; önce `src/main` yeşile çekilir, sonra `main.js` kapsama alınır (D20).
3. Her WP'nin DoD'sine **dosya bazlı kapsam hedefi** eklendi (§0.2) — "testler yeşil" artık yeterli değil.

### 0.2 Planın dokunduğu dosyaların ölçülmüş kapsamı

| Dosya | Satır % | Dal % | Fonksiyon % | Hedef | Sorumlu WP |
|---|---|---|---|---|---|
| `main.js` | ölçüm dışı | — | — | ölç → ratchet | WP-0.1 |
| `src/renderer/app.js` | ölçüm dışı | — | — | E2E + shim | WP-1.2, 4.2 |
| `src/console/ConsoleStore.js` | ölçüm dışı | — | — | ölç → ratchet | WP-3.6 |
| `src/console/ConsoleServer.js` | ölçüm dışı | — | — | ölç → ratchet | WP-2.2 |
| `src/main/security/Acl.js` | **51.47** | **36.84** | **31.57** | ≥80 / 65 / 70 | WP-1.3 |
| `src/main/storage/Database.js` | **52.75** | 57.69 | 58.33 | ≥70 / 60 / 60 | WP-3.7 |
| `src/main/ipc/pinGuard.js` | **60.46** | 93.75 | **54.54** | ≥80 / 65 / 70 | WP-1.3 |
| `src/main/services/TaskManager.js` | **66.19** | 63.98 | **50.74** | ≥80 / 65 / 70 | WP-3.4 |
| `src/main/security/SecretStore.js` | 69.36 | **50.00** | 69.76 | ≥80 / 65 / 70 | WP-4.3 |
| `src/main/services/WebhookService.js` | 71.92 | 70.23 | **61.90** | ≥80 / 65 / 70 | WP-2.4 |
| `src/main/services/StorageService.js` | 72.20 | **47.16** | 69.35 | ≥80 / 65 / 70 | WP-3.4, 4.1a, 4.1b |
| `src/main/services/WarningManager.js` | 72.32 | 75.75 | **58.33** | ≥80 / 65 / 70 | WP-1.1, 4.3 |
| `src/main/ipc/validate.js` | 72.72 | 69.11 | **53.57** | ≥80 / 65 / 70 | WP-3.3, 5.1 |
| `src/main/services/LocalApiService.js` | 75.32 | 77.04 | **64.70** | ≥80 / 65 / 70 | WP-3.1, 6.3 |
| `src/main/services/SsrfGuard.js` | 76.52 | 62.63 | 100 | ≥80 / 65 / 70 | WP-5.2 |
| `src/main/services/OrderQueue.js` | 76.79 | 63.10 | 80.76 | ≥80 / 65 / 70 | WP-3.4 |
| `src/main/services/AuditLog.js` | 84.54 | 70.51 | 100 | hedefi geçiyor | — |
| `src/main/util/TimerRegistry.js` | 91.66 | 77.77 | 83.33 | hedefi geçiyor | — |
| `src/main/logger.js` | 92.59 | **60.00** | **40.00** | dal ≥70 | WP-7.1 |

**Okunuşu:** planın en kritik iki işi (`WP-1.3` PIN sertleştirme, `WP-3.4` persist zinciri) kapsam tablosunun **en altındaki** dosyalara dokunuyor. `Acl.js` %51 satır / %31 fonksiyon kapsamıyla, PIN kurtarma tasarımının (D15) taşıyıcı modülü. Bu bir tesadüf değil: düşük kapsamlı dosyalar, hataların hayatta kaldığı dosyalardır.

### 0.3 Bu turda uygulanan düzeltmeler (26.10.2026)

Plan onaylanmadan önce hasarı durduran minimum paket uygulandı. Amaç planın yerini almak değil, **en pahalı iki hatayı (C-01/C-02) yayına taşımamak**.

| # | Düzeltme | Dosya | Kanıt |
|---|---|---|---|
| F1 | `warning-cancel` / `warning-snooze` async + `await`; gövdeler test edilebilir modüle taşındı | `main.js:1188-1205`, `src/main/ipc/warningActions.js` | `tests/main/warning-pin.test.mjs` 9 test |
| F2 | PIN doğrulaması sonrası TOCTOU kontrolü: `taskId` değiştiyse eylem uygulanmaz (`WARNING_CHANGED`) | `src/main/ipc/warningActions.js` | aynı dosya, "TOCTOU" testleri |
| F3 | Banner yalnızca `res.success === true` ise gizlenir; hata toast ile gösterilir | `src/renderer/app.js:2930-2943, 2959-2988` | E2E `security.spec.js` + `timer.spec.js` |
| F4 | `npm run pack` sessiz no-op'u: `electron-builder.js` → `electron-builder.config.cjs` (CWD gölgelemesi) | `package.json`, `electron-builder.config.cjs`, `scripts/release-check.js` | `npm run pack` 21 s + taze `app.asar` |
| F5 | `--publish never` (yayın çözümlemesinde 30+ dk asılma) | `package.json` (`pack`, `dist`, `dist:nsis`) | 33 s → 21 s |
| F6 | ACL testi 5 s varsayılan timeout → 20 s (icacls alt süreci) | `tests/main/secrets.test.mjs:175` | izolasyonda 1.14 s |

**Kapatılmayanlar (planın gerçek işi):** C-03 (`startTimer`), C-04 (PIN değiştirme mevcut PIN'i doğrulamıyor), H-01…H-06, M-01…M-12, B2/B3 kapsam kapısı. Bunlar `WP-1.x`–`WP-7.x` altında duruyor; hiçbiri bu turda "düzeltildi" sayılmaz.

---

## 1. Kapsam Dışı (non-goals)

Bu maddeler **bilinçli olarak yapılmayacak**. Her biri için gerekçe bağlayıcıdır; plan içinde bunlara iş açılmaz.

| # | Kapsam dışı | Gerekçe | Tekrar değerlendirme koşulu |
|---|---|---|---|
| N1 | React/TypeScript'e geçiş | 3.207 satırlık `app.js`'i yeniden yazmak 34 bulgunun hiçbirini kapatmaz; riski düzeltmelerin üstüne ekler | v1.2.0 yayınlandıktan sonra ayrı bir yeniden yazım projesi |
| N2 | Çok kullanıcılı / bulut senkron | Yerel-öncelikli mimari; sunucu tarafı yok | Ürün kararı değişirse |
| N3 | Linux/macOS paketleme | `Acl.js` Windows SID'lerine bağlı; platform soyutlaması yeni bir iş paketi gerektirir | Talep gelirse ayrı WBS |
| N4 | DB motoru değişimi | `better-sqlite3` senkron API'si mevcut atomiklik varsayımlarının temeli | Ölçülen bir limit darboğazı çıkarsa |
| N5 | UI yeniden tasarımı | Kapsam 34 bulgu + regresyon; görsel iş yok | — |
| N6 | Telemetri yüklemesi | Gizlilik duruşu; metrikler **yalnızca yerel** (WP-7.1) | — |
| N7 | Yeni özellik | Sürüm hedefi düzeltme, özellik değil | v1.3.0 |
| N8 | Otomatik güncelleme akışı değişikliği | Mevcut `autoUpdater` akışı bu denetimin kapsamı dışında; `before-quit` düzeltmesi (WP-2.3) akışı **bozmadan** çalışmak zorunda | Ayrı denetim |

---

## 2. Doğrulanmış Teknik Kararlar

Her karar ya birincil kaynağa ya da **bu depoda doğrulanmış koda** dayanır. "Kaynak" kolonunda `kod` yazan satırlar, web araştırması değil, dosyada okunan gerçektir.

| # | Karar | Kaynak | WP |
|---|---|---|---|
| D1 | `ipcMain.handle` içinde hata **fırlatılmayacak**; `{ success:false, code, message? }` dönecek | Electron: `handle` hataları serileştirilir, renderer'a yalnızca `message` ulaşır — `code` kaybolur ([ipc-main.md](https://github.com/electron/electron/blob/main/docs/api/ipc-main.md), electron#24427) | 1.1, 1.3, 3.4 |
| D2 | `server.listen()` hataları **`'error'` olayı** ile gelir; `try/catch` yakalamaz | Node.js: dinleyicisiz `'error'` olayı süreci sonlandırır ([errors.html](https://nodejs.org/api/errors.html), expressjs#2856) | 2.1, 2.2 |
| D3 | Bind başarısı `'listening'` ile kesinleşir; `start()` Promise döndürür | `once('listening')` + `once('error')` + cleanup ([async-listen#13](https://github.com/vercel/async-listen/pull/13)) | 2.1, 2.2 |
| D4 | Idempotency anahtarı bileşik: `sha256(method + path + actor + client-key)` | draft-ietf-httpapi-idempotency-key-header-07 §5 — düşük entropili anahtar veri sızıntısı üretir | 3.1 |
| D5 | **409** = aynı anahtar işlemde, **422** = aynı anahtar farklı payload | draft-07 §2.6/§2.7 | 3.1 |
| D6 | Idempotency cache yalnızca 2xx (+409) saklar; 4xx saklanmaz | draft-07 §2.7 — 401/429 kalıcılaşırsa istemci kilitlenir | 3.1 |
| D7 | Toplu yazma: tek transaction + yeniden kullanılan prepared statement | better-sqlite3: 100 insert tek transaction'da ~6.6× ([performance.md](https://github.com/WiseLibs/better-sqlite3/blob/HEAD/docs/performance.md)) | 4.1a, 4.1b |
| D8 | WAL + `synchronous` açıkça seçilir; kritik yazmalar `FULL` | better-sqlite3 WAL varsayılanı `NORMAL`; commit kaybı riski | 4.1b |
| D9 | `before-quit` → `preventDefault()` + bayrak + `await shutdown()` + tekrar `app.quit()` | Electron async callback'i **await etmez** ([app.md](https://github.com/electron/electron/blob/main/docs/api/app.md), electron#9433) | 2.3 |
| D10 | Preload **unsubscribe closure** döndürür; `off(channel, cb)` renderer'a açılmaz | `contextBridge` callback kimliğini korumaz → `removeListener` sessiz no-op ([ipc-renderer.md](https://github.com/electron/electron/blob/main/docs/api/ipc-renderer.md)) | 6.2 |
| D11 | Webhook: global + hedef-başına eşzamanlılık, backoff + full jitter, yalnız 408/429/5xx retry | [Svix](https://www.svix.com/resources/guides/webhook-reliability/), [Hookdeck](https://hookdeck.com/docs/outpost/guides/outbound-webhook-retry-best-practices) | 2.4 |
| D12 | SSRF: yönlendirme takip edilmez, çözümlenen IP doğrulanır, bağlantı o IP'ye | [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | 5.2 |
| D13 | `getSettings()` kopya döndürür (dizi alanları dahil) | `kod`: `StorageService.js:1003` nesneyi yerinde değiştiriyor → dış referanslar bayatlıyor | 3.5 |
| D14 | Şema sürümü `schema_version` + `migrate()` kapısı | `quickCheck()` fiziksel bütünlük doğrular, şema uyumu doğrulamaz | 3.6 |
| **D15** | **PIN kurtarma: düz CLI bayrağı YASAK.** Kurtarma = `Acl.js` ile ACL-korumalı `recovery.json` + yükseltilmiş oturum + **24 saat gecikmeli** uygulama + audit | `kod`: `Acl.js` SID tabanlı ACL sertleştirmesi zaten var (owner+SYSTEM+Administrators); `AuditLog.js` var. Düz bayrak, PIN'in varlık nedenini (fiziksel erişimi olan kişiyi engellemek) yok eder | 1.3 |
| **D16** | `await requireCancelPin(...)` sonrası **durum yeniden okunur**; `status !== 'warning'` → `CANCEL_TOO_LATE`, eylem yok | `kod`: `await` PIN modalı süresince (saniyeler) handler'ı askıya alır; `WarningManager` sayacı bağımsız çalışmaya devam eder → düzeltmenin kendi ürettiği TOCTOU | 1.1 |
| **D17** | Renderer testi: `app.js`'e **koşullu** `__test__` shim; durum geçişleri Playwright E2E | `kod`: `app.js` 3.207 satır, modül değil, dışa açılmış fonksiyon yok → iç fonksiyon testi aksi halde kırılgan `window` hack'i gerektirir | 1.2, 4.2, 7.3 |
| **D18** | Veri migrasyonu `MigrateV2.js` desenini **yeniden kullanır**, yeni desen icat etmez | `kod`: `MigrateV2.js` zaten yedek+SHA-256 → geçici DB → tek transaction → checksum → `quick_check` → rename → `.migrated` → yeniden başlatılabilir akışını uyguluyor | 3.7 |
| **D19** | Observability mevcut `logger.js` + `MetricCollector.js` üzerine kurulur; **sayaçlar enjekte edilebilir** olur, log satırı ayrıştırılmaz | `kod`: `logger.js` `NODE_ENV=test`/`VITEST` altında **no-op** → test log çıktısını okuyamaz | 7.1 |
| **D20** | Kapsam eşiği **düşürülmez**. `src/main/**` eşiği 80/65/70'te sabit ve `v1.1.1`'de yeşile çekilir. `main.js`, `src/console/**`, `src/agent/**` **F0'da ölçüme alınır** (glob bazlı ayrı eşik = ölçülen taban, sürüm başına **+2 puan ratchet**, düşüş yasak). Ölçüme almak ≠ 80 uygulamak; bu ayrım kaybolursa plan kendi kendini kilitler | `kod`: `vitest.config.js:35-40` eşikleri + B2/B3 ölçümü; eşiği düşürmek kapıyı dekoratif yapar | 0.1, 7.2 |
| **D21** | Her şema migrasyonu **geri dönüş yolu ile birlikte** teslim edilir: `down()` adımı **veya** "forward-only + doğrulanmış yedekten geri yükleme" runbook'u. Hangisi seçilirse seçilsin, geri dönüş **test edilmiş** olmalı (`WP-3.7` kabul kriteri) | `kod`: `MigrateV2.js` yalnızca ileri yönlü; yedek alıyor ama geri yükleme adımı yok. Geri dönüşü olmayan migrasyon, başarısız bir sürümde kullanıcıyı eski sürüme döndüremez | 3.7 |
| **D22** | PIN kurtarma kapısı **duvar saatine güvenmez**: `issuedAt` + kalıcı monotonik sayaç + HMAC zinciri; saat geriye giderse süre **dolmamış** sayılır (fail-closed). Ayrıca **iptal yetkisi kurtarma kilidinden bağımsızdır**: 24 saatlik kilit yalnızca PIN sıfırlamayı bekletir, **devam eden kapanmayı durdurmayı engellemez** | `kod`: `RecoveryGate` duvar saati + dosya zaman damgası kullanıyor; kullanıcı saati ileri alarak 24 saati atlayabilir. Kilit iptal yetkisini de kapsarsa kullanıcı kapatmayı durduramaz — D15'in kabul edilemez yan etkisi | 1.3 |
| **D23** | Yeni hata kodlarının **tamamı** 17 dilde anahtar taşır (`src/main/locales/*.server.json` + `src/renderer/locales/*.json`); `npm run locales:check` + `i18n-parity` testi kapıdır. İngilizce anahtar "sonra eklenir" diye bırakılmaz | `kod`: `locales:check` zaten var ve parity testi geçiyor; 7 yeni kod eklenirse 17×2 dosya güncellenmezse kapı kırmızı olur. Çeviri borcu, hata kodunun kullanıcıya `undefined` göstermesi demektir | 1.1, 3.x, 6.x |
| **D24** | Süre tahminleri **P50/P90 aralığı** olarak verilir; tek sayı (örn. "6 saat") bütçe değildir. Kapasite hesabı P50 ile, taahhüt P90 ile yapılır | Değerlendirme bulgusu: tek nokta tahminleri 197 görevde sistematik iyimserlik üretir; buffer "gizli tahmin" olur | 3.1, 7 |
| **D25** | **De-scoping kuralı:** bir WP P90'ın **1.5 katını** aşarsa F0 kontrol noktasında ya (a) minimum sözleşmeye indirilir ya (b) `v1.2.x`'e taşınır. Karar tarih + gerekçe ile kaydedilir; "biraz daha çalışırız" geçerli bir seçenek değildir | Değerlendirme bulgusu: planın hiçbir yerinde kapsam küçültme kuralı yok; 197 görevlik DAG'de tek gecikme tüm takvimi kaydırır | 3.1, 7 |
| **D26** | Derleme yapılandırması, çalıştırılan komutla **aynı adı taşımaz**: `electron-builder.config.cjs` (`.js` değil) + `--publish never` | `kod`: Windows `cmd` PATH'ten önce CWD'deki `<ad>.js` dosyasını çalıştırır; `electron-builder.js` varken `npm run pack` gerçek CLI yerine yapılandırmayı çalıştırıp **0 koduyla hiç derleme yapmıyordu** (B5 kanıtı) | 0.1, 7.2 |

---

## 3. Yönetici Özeti

### 3.1 Kapasite modeli (takvim buradan türetilir, tahmin edilmez)

| Değişken | Değer | Türetme |
|---|---|---|
| Net üretken saat / gün | **6** | 8 saat − toplantı, CI bekleme, inceleme turu, bağlam değişimi |
| Geliştirici sayısı | **1** | Plan tek geliştirici varsayar; ikinci geliştirici §3.3'te ayrı hesaplanır |
| Baz efor **P50** | **180 h** | §4'teki 28 WP'nin toplamı (satır satır doğrulanabilir) |
| **P90** | **225 h** | P50 + %25. Buffer ayrı bir tahmin değil, **P50→P90 farkıdır**: ilk kez dokunulan kod, E2E flake, inceleme düzeltmeleri, kapsam borcu |
| Taahhüt | **225 h (P90)** | Taahhüt P50 ile değil P90 ile verilir (D24) |
| Takvim (P50) | **30 iş günü** | 180 / 6 |
| Takvim (taahhüt) | **38 iş günü** | 225 / 6 = 37.5 → 38 |
| `v1.1.1` P50 / P90 | **42 h / 53 h** | F0 (8) + F1 (34); ×1.25 = 53 |
| `v1.1.1` takvim | **9 iş günü** | 53 / 6 = 8.8 → 9 |

**De-scoping kuralı (D25):** her WP için P90 = WP P50 × 1.25'dir. F0 kontrol noktasında (gün 2) ve her faz kapanışında ölçülen gerçek süre WP P90'ın **1.5 katını** aşarsa WP ya minimum sözleşmeye indirilir ya `v1.2.x`'e taşınır. Karar, tarih + gerekçe ile `REMEDIATION_PLAN_WBS.md` sonundaki karar günlüğüne yazılır.

**Neden tek geliştirici:** Bu bir masaüstü aracı; iki geliştirici varsayımı takvimi yarıya indirir ama planı kırılgan yapar. Tek geliştirici + %25 buffer, gecikmeyi **öngörülebilir** kılar. İkinci geliştirici senaryosu §3.3'te ayrıca ve açıkça verilir — varsayılmaz.

### 3.2 Faz tablosu (efor toplamı 180 h, elle doğrulanabilir)

| Faz | Kapsam | WP | Atomik görev | Efor (h) | Bağımlılık |
|---|---|---|---|---|---|
| F0 | Baseline, kör nokta kanıtı, kapsam genişletme | 1 | 8 | **8** | — |
| F1 | Kritik güvenlik yolu (C-01…C-04) | 4 | 31 | **34** | F0 |
| F2 | Süreç yaşam döngüsü | 4 | 34 | **37** | F0 |
| F3 | Veri bütünlüğü + migrasyon | 7 | 51 | **47** | F1, F2 |
| F4 | Performans, bellek, toplu yazma | 4 | 25 | **20** | F3 |
| F5 | Tutarlılık & UX | 2 | 11 | **8** | F3 |
| F6 | Temizlik & preload yüzeyi | 3 | 17 | **11** | F1–F5 |
| F7 | Observability + release gate | 3 | 20 | **15** | Tümü |
| **Toplam** | | **28** | **197** | **180** | |

### 3.3 İki senaryo (ikisi de hesaplanmış, biri varsayılmamış)

| Senaryo | Kapasite | Baz | Buffer | Taahhüt | Takvim |
|---|---|---|---|---|---|
| **A — 1 geliştirici (plan varsayımı)** | 6 h/gün | 180 h | 45 h | 225 h | **38 iş günü** |
| B — 2 geliştirici | 12 h/gün | 180 h | 45 h | 225 h | **19 iş günü**, *ancak* `app.js`/`main.js` dosya kilitleri paralelliği sınırlar → gerçekçi **23 gün** |

Senaryo B'de kazanç %40, %50 değil: `WP-1.2 → 1.4 → 4.2 → 5.2 → 6.1 → 6.2` zinciri tek dosyada (`app.js`) seridir ve 6 WP'yi sıraya bağlar.

### 3.4 Bağımlılık grafiği doğrulaması

**Düğüm:** 28 WP. **Döngü:** yok. Aşağıdaki topolojik sıra, her WP'nin bağımlılıklarının kendisinden **önce** geldiğini gösterir — okuyucu tek geçişte doğrulayabilir.

```
0.1 → 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 3.5 → 4.1a → 2.3 → 3.1 → 3.2 → 3.3
    → 2.4 → 5.2 → 3.4 → 4.1b → 4.2 → 3.6 → 3.7 → 4.3 → 5.1 → 6.1 → 6.2 → 6.3
    → 7.1 → 7.2 → 7.3
```

**Kırılan döngü (v1 kusuru #1):** v1'de `WP-3.4 ↔ WP-4.1` karşılıklı bağımlıydı; kritik yol hesaplanamıyordu. Çözüm:

- `WP-4.1a` = **sözleşme** (`saveTasksBulk(tasks) → {ok, written}` + tek `_persist` + prepared statement cache). Bağımlılığı: `2.1, 3.5`.
- `WP-3.4` = persist **sonuç zinciri**. Bağımlılığı: `4.1a, 2.1`.
- `WP-4.1b` = **performans** (tek geçişli stringify, benchmark, WAL). Bağımlılığı: `3.4`.

Geri kenar yok: `4.1a → 3.5, 2.1`; `3.4 → 4.1a, 2.1`; `4.1b → 3.4`. Zincir `4.1a → 3.4 → 4.1b` tek yönlüdür.

**Kritik yol (efor ağırlıklı):** `0.1(8) → 2.1(9) → 2.3(10) → 2.4(11) → 5.2(5) → 7.2(7) → 7.3(3)` = **53 h**.

**Kritik okunuş:** kritik yol 53 h, taahhüt 225 h. Yani plan **efor-bağımlı**, bağımlılık-bağımlı değil. Takvimi toplam efor belirler; bağımlılık optimizasyonu takvimi kısaltmaz. Bu, v1'de yanlış kurulmuş bir varsayımın düzeltilmesidir.

### 3.5 v1'in 8 kusuru → v2'deki karşılığı

| # | v1 kusuru | v2 çözümü | Kanıt |
|---|---|---|---|
| 1 | `3.4 ↔ 4.1` döngüsel bağımlılık | `4.1a` / `4.1b` bölünmesi | §3.4 topolojik sıra |
| 2 | `--reset-cancel-pin` PIN'i dekoratif yapıyor | D15: ACL + yükseltilmiş oturum + 24 h gecikme + audit | WP-1.3, T18 |
| 3 | `await`'in ürettiği TOCTOU analiz edilmemiş | D16 + `T-1.1.3` + T09 | WP-1.1 |
| 4 | Efor 2–3× iyimser, sıfır buffer | 180 h baz + %25 buffer + kapasite modeli | §3.1 |
| 5 | Renderer testleri modülsüz `app.js`'te uygulanamaz | D17: koşullu `__test__` shim + E2E | WP-1.2, T-7.3.6 |
| 6 | Veri migrasyonu yok | `WP-3.7`, `MigrateV2.js` deseni | T61, T62 |
| 7 | Baseline ölçülmemiş | B1–B4 + §0.2 dosya tablosu | §0 |
| 8 | `Seviye = E×O` ilan edilmiş, uygulanmamış | §5'te `Seviye` kolonu, ≥6 = yayın blokeri | §5 |

**v2'de eklenen, v1'de olmayan üç şey:** kapsam kapısının kendisi bir iş kalemi oldu (B2/B3), observability ayrı bir WP oldu (`WP-7.1`), ve sürüm aşamalandırıldı (`1.1.1` / `1.2.0`).

### 3.6 Aşamalı sürüm kararı

| Sürüm | Kapsam | Neden ayrı |
|---|---|---|
| **1.1.1** | F0 + F1 (`WP-0.1, 1.1, 1.2, 1.3, 1.4`) | 4 kritik bulgu **9 günde** kapanır. Kalan 30 bulgu için 38 gün beklemek, PIN bypass'ını gereksiz yere sahada tutar |
| **1.2.0** | F2–F7 | Kalan 30 bulgu + observability + kapsam kapısı yeşil |

`1.1.1` yayınlanmadan `1.2.0` dalı açılmaz; `1.1.1` için `main`'e cherry-pick yapılmaz — F1 tek başına derlenebilir ve test edilebilir olacak şekilde tasarlandı (hiçbir F1 görevi F2+ dosyalarına dokunmaz).

---

## 4. WBS — Faz Faz İş Kırılımı

Her iş parçası: **Amaç · Atomik görevler · Bağımlılık · Çıktı · DoD**. DoD'ler ölçülebilir; "çalışıyor" gibi ifade yok.

---

### F0 — Baseline, Kör Nokta Kanıtı, Kapsam Genişletme

#### WP-0.1 Ölçülmüş baseline ve kapsam kapısının onarımı · 8 görev · 8 h

**Amaç:** Düzeltmelerin regresyon ürettiğini anında görmek; kapsam kapısının görmediği dosyaları görünür kılmak; her düzeltmeyi tek başına geri alınabilir yapmak.

| ID | Görev | Dosya / Komut | Çıktı |
|---|---|---|---|
| T-0.1.1 | `npm test -- --reporter=dot` çalıştır, sonucu dondur | `tests/BASELINE.md` | `66 dosya / 639 test / 0 fail / 19.51 s` |
| T-0.1.2 | `npm run coverage` çalıştır, **kırmızı** sonucu ve eşikleri kaydet | `tests/BASELINE.md` | 78.41 / 64.84 / 72.71 / 78.41 + eşik tablosu |
| T-0.1.3 | `vitest.config.js` kapsam `include`'unu genişlet: `main.js`, `src/console/**`, `src/agent/**` ekle; **eşiği düşürme**; glob bazlı eşik yaz (D20) | `vitest.config.js:33-40` | Glob eşik yapılandırması |
| T-0.1.4 | Genişletilmiş kapsamın **ilk ölçümünü** al; `main.js` için taban satırı yaz | `tests/BASELINE.md` | `main.js` satır/dal/fonksiyon tabanı |
| T-0.1.5 | Ratchet kuralını yaz: her sürümde +2 puan, düşüş yasak, istisna = `/* v8 ignore */` + gerekçe | `docs/coverage-policy.md` | Politika (1 sayfa) |
| T-0.1.6 | `tests/helpers/fixtures.mjs`'i genişlet: `makeTask`, `makeStorageMock`, `makePinGuardMock`, `makeWarningHarness` | mevcut dosya | 4 fikstür |
| T-0.1.7 | `warning-cancel/snooze` için **kırmızı** testler (T03–T08) — B4 kör noktasını kanıtlar | `tests/main/warning-pin.test.mjs` | 6 kırmızı test |
| T-0.1.8 | 34 audit ID'sini test adı / manuel kontrole eşle; eşleşmeyen = yayın blokeri | `tests/TRACEABILITY.md` | 34 satırlık matris |

**Bağımlılık:** Yok
**Çıktı:** Baseline dokümanı, glob kapsam eşiği, kapsam politikası, 4 fikstür, 6 kırmızı test, traceability matrisi
**DoD:** `npm test` sayıları T-0.1.1 ile birebir aynı (66/639); kapsam komutu **artık kırmızı olduğunu belgeliyor** (gizlenmiyor); 6 yeni test kırmızı ve nedeni C-01/C-02 olarak yazılı; `main.js` kapsam tabanı ölçülmüş (sayı, tahmin değil).

---

### F1 — Kritik Güvenlik Yolu (v1.1.1 kapsamı)

#### WP-1.1 `warning-cancel` / `warning-snooze` await + TOCTOU · 8 görev · 10 h

**Amaç:** PIN doğrulaması ile iptal/erteleme eylemini tek sıralı akışa bağlamak **ve** `await`'in açtığı zaman penceresini kapatmak.

| ID | Görev | Dosya |
|---|---|---|
| T-1.1.1 | `warning-cancel` handler'ını `async` yap, `await requireCancelPin(...)` ekle | `main.js:1185-1201` |
| T-1.1.2 | `warning-snooze` handler'ını `async` yap, `await` ekle | `main.js:1203-1221` |
| T-1.1.3 | **TOCTOU kapısı:** await dönüşünde `warningManager.getActiveState()` yeniden oku; `status !== 'warning'` → `{success:false, code:'CANCEL_TOO_LATE'}`, eylem yok (D16) | `main.js` |
| T-1.1.4 | `try/catch` → `{success:false, code:'INTERNAL'}` (D1); audit'e `cancel_handler_error` | `main.js` |
| T-1.1.5 | Dönüş sözleşmesini sabitle: `{success, code, message?, minutes?, retryAfterSec?}` — her iki kanal aynı şekil | `main.js` |
| T-1.1.6 | Audit: `cancel_pin_verified`, `cancel_denied`, `snooze_pin_verified` (mevcut `AuditLog`) | `main.js` |
| T-1.1.7 | 6 birim testi: PIN yok / yanlış / doğru × 2 kanal (T03–T08) | `tests/main/warning-pin.test.mjs` |
| T-1.1.8 | TOCTOU testi: PIN beklerken süre dolar → `CANCEL_TOO_LATE`, `cancelActiveTask` **0 kez** (T09) | aynı dosya |

**Bağımlılık:** WP-0.1
**Çıktı:** 2 düzeltilmiş handler + TOCTOU kapısı + 7 test
**DoD:** PIN'siz çağrı `PIN_REQUIRED` **ve** görev durumu değişmemiş; doğru PIN'de `cancelActiveTask()` tam **1** kez (`vi.fn` sayımı); TOCTOU senaryosunda 0 kez ve `CANCEL_TOO_LATE`; `WarningManager.js` satır kapsamı ≥80.

---

#### WP-1.2 Renderer sonuç kapısı + test shim · 6 görev · 6 h

**Amaç:** Ana süreç doğru davransa bile kullanıcıya yanlış "başarılı" sinyali verilmesini engellemek; renderer'ı test edilebilir kılmak.

| ID | Görev | Dosya |
|---|---|---|
| T-1.2.1 | Ortak yardımcı `applyWarningActionResult(res, {onSuccess})` — `success !== true` ise toast + `return` | `app.js` (yeni) |
| T-1.2.2 | `btnWarnStop` bu yardımcıyı kullansın (koşulsuz gizleme kaldırılır) | `app.js:2959-2972` |
| T-1.2.3 | `btnWarnSnooze` aynı | `app.js:2973-2986` |
| T-1.2.4 | `isPinChallenge(res)` kontrolünü **ilk** sıraya al (PIN varsa toast yok) | aynı bloklar |
| T-1.2.5 | **Koşullu shim** (D17): `if (window.__PP_TEST_SHIM__) window.__PP_TEST__ = { applyWarningActionResult, isPinChallenge }` — shim yalnız test öncesi set edilen bayrakla aktive olur, üretimde `undefined` | `app.js` sonu |
| T-1.2.6 | 4 renderer testi: `success:false` / `true` / `null` / `pendingPin` | `tests/renderer/warning-ui.test.mjs` |

**Bağımlılık:** WP-1.1 (dönüş sözleşmesi)
**Çıktı:** 1 yardımcı + 2 handler + shim + 4 test
**DoD:** Dört durumun **dördünde de** banner görünür kalıyor; yalnız `success:true` gizliyor; paketlenmiş build'de `__PP_TEST__` **yok** (T-7.3.6 + T92 `verify:pack` ile kanıtlanır).

---

#### WP-1.3 PIN yönetimi sertleştirme + güvenli kurtarma · 9 görev · 10 h

**Amaç:** PIN değiştirme/silme işlemini mevcut PIN'e bağlamak; PIN kapısını tek çağrıyla kaldırmayı imkânsız kılmak; unutma durumunu **kontrolü yok etmeden** çözmek.

| ID | Görev | Dosya |
|---|---|---|
| T-1.3.1 | `set-cancel-pin`: mevcut PIN varsa `await requireSecurityPin(currentPin)` | `main.js:1067-1074` |
| T-1.3.2 | `clear-cancel-pin`: `await requireSecurityPin(pin)` zorunlu | `main.js:1075-1078` |
| T-1.3.3 | `updateSettings` `false` dönerse `{success:false, code:'SAVE_FAILED'}` | `main.js` |
| T-1.3.4 | Audit olayları: `cancel_pin_set`, `cancel_pin_cleared`, `cancel_pin_reset_requested`, `cancel_pin_reset_applied` | `main.js` + `AuditLog.js` |
| T-1.3.5 | **`RecoveryGate` modülü (D15):** `requestReset()` → `effectiveAt = now + 24h`; `applyReset()` yalnız `now >= effectiveAt` **ve** yükseltilmiş oturumda | `src/main/security/RecoveryGate.js` (yeni) |
| T-1.3.6 | `recovery.json` dosyasını `Acl.js` ile sertleştir (owner + SYSTEM + Administrators, SID ile) | `RecoveryGate.js` + `Acl.js` |
| T-1.3.7 | CLI: `powerpilot recovery request\|status\|cancel` — API üzerinden, yerel token zorunlu; **`--reset-cancel-pin` bayrağı yok** | `src/cli/powerpilot.js` |
| T-1.3.8 | Renderer PIN modalına `currentPin` alanı ekle; kurtarma isteğinde "24 saat sonra etkinleşir" uyarısı + 17 dil anahtarı | `app.js` + `locales/*` |
| T-1.3.9 | 5 test: PIN'siz clear, doğru PIN clear, currentPin'siz set, yanlış currentPin, kurtarma 24 h kapısı (T14–T18) | `tests/main/pin-guard.test.mjs` |

**Bağımlılık:** WP-1.1
**Çıktı:** 2 handler + `RecoveryGate` + ACL sertleştirme + CLI komutları + 5 test
**DoD:** PIN kaldırma yalnız doğru mevcut PIN ile; `applyReset()` 24 saatten önce `RECOVERY_NOT_DUE` döner; `grep -r "reset-cancel-pin"` **0 eşleşme**; `Acl.js` ve `pinGuard.js` satır kapsamı ≥80 (bugün 51.47 / 60.46).

---

#### WP-1.4 Sayaç geri yükleme (C-03 + H-05) · 8 görev · 8 h

**Amaç:** Tek geri yükleme yolu; tanımsız fonksiyon çağrısını kaldırmak; çift sayaç riskini bitirmek.

| ID | Görev | Dosya |
|---|---|---|
| T-1.4.1 | `restoreActiveState()` içindeki timer dalını çıkar; yalnız banner + `renderMonitoringTasks` kalsın | `app.js:2893-2926` |
| T-1.4.2 | `applyRestoredTimer(tasks)` ekle: `startTimerTo(targetTime, total)` | `app.js` (yeni) |
| T-1.4.3 | Başında idempotent `if (countdownInterval) clearInterval(countdownInterval)` | aynı |
| T-1.4.4 | `total` hesabını `createdAt`'ten türet; `Math.max(1, ...)` + `Number.isFinite` guard | aynı |
| T-1.4.5 | `restoreActiveTimer()` ve `app.js:3399` çağrısını **sil** | `app.js:545-560`, `:3399` |
| T-1.4.6 | `catch (_)` yerine `log.warn` (sessiz yutma kaldırılır) | `app.js:2925` |
| T-1.4.7 | Statik regresyon testi: `startTimer(` referansı **0** (yalnız `startTimerTo(`) | `tests/renderer/timer-restore.test.mjs` |
| T-1.4.8 | E2E: reload sonrası kalan süre `targetTime - now` ile ±2 s | `tests/e2e/timer.spec.js` |

**Bağımlılık:** WP-0.1
**Çıktı:** 1 yeniden yazılmış + 1 yeni fonksiyon, 2 silme, 3 test
**DoD:** `getActiveState()` açılışta **tam 1** kez (spy); reload sonrası tek `countdownInterval`; `createdAt` yoksa progress 0..1 aralığında kalıyor (negatif payda yok).

---

### F2 — Süreç Yaşam Döngüsü

#### WP-2.1 `LocalApiService.start()` bind hatasını yay · 8 görev · 9 h

**Amaç:** Bind başarısızlığını çağırana taşımak; `main.js`'in ayar geri alma yolunu gerçekten çalışır hale getirmek.

| ID | Görev | Dosya |
|---|---|---|
| T-2.1.1 | `start()` → `Promise<{ok, code?, transport?, host?}>` | `LocalApiService.js:198-269` |
| T-2.1.2 | `once('error')` + `once('listening')` + `cleanup()` deseni (D3) | aynı |
| T-2.1.3 | Hata yolunda `this.server = null; this.transport = 'disabled'` | aynı |
| T-2.1.4 | IPv6→IPv4 fallback'i Promise akışına taşı; fallback de başarısızsa `EAFNOSUPPORT` döndür | `:254-265` |
| T-2.1.5 | `restart()` içinde `await this.start()`; `ok:false` ise yeniden denemeden dön | `LocalApiService.js` |
| T-2.1.6 | `main.js` geri alma: `started.ok === false` → `updateSettings(prev)` + `API_RESTART_FAILED` | `main.js:1330-1336` |
| T-2.1.7 | Çift `start()` çağrısı: `ALREADY_RUNNING` döndür (fırlatma yok) | `LocalApiService.js` |
| T-2.1.8 | 3 test: port işgali, geri alma, port boşalınca kurtarma (T23–T25) | `tests/main/localapi.test.mjs` |

**Bağımlılık:** WP-0.1
**Çıktı:** Yeniden yazılmış `start()` + `main.js` geri alma + 3 test
**DoD:** `EADDRINUSE` altında `start()` ≤1000 ms içinde `ok:false` çözüyor; süreç ayakta; `this.server === null`; sonraki `start()` başarılı; `ERR_SERVER_ALREADY_LISTEN` hiçbir testte görünmüyor.

---

#### WP-2.2 `ConsoleServer` hata yakalama + hata zarfı · 7 görev · 7 h

**Amaç:** Bind hatasında süreç çökmesini bitirmek; ham hata mesajı sızıntısını kapatmak.

| ID | Görev | Dosya |
|---|---|---|
| T-2.2.1 | `start()` içine `server.on('error')`: log + `close()` + `this.server = null` | `ConsoleServer.js:674-710` |
| T-2.2.2 | `new URL(...)` try/catch → 400 `BAD_REQUEST_TARGET` | `:760-766` |
| T-2.2.3 | Route catch: 5xx → `INTERNAL_ERROR` + generic mesaj; 4xx → `err.message` | `:784-786` |
| T-2.2.4 | `sendJson`'a `headersSent` / `writableEnded` guard | `:742-745` |
| T-2.2.5 | `closing` bayrağı: `error` içinde `close()` ikinci `error` üretmesin | aynı |
| T-2.2.6 | 2 test: port dolu (fırlatmıyor, `server === null`), bozuk `req.url` → 400 (T28, T29) | `tests/main/console-server.test.mjs` |
| T-2.2.7 | 2 test: route throw → 500 sızdırmıyor, çift `sendJson` → tek yanıt (T30, T31) | aynı |

**Bağımlılık:** WP-0.1
**Çıktı:** 5 kod değişikliği + 4 test
**DoD:** `EADDRINUSE` altında test süreci hayatta; hiçbir 5xx gövdesinde dosya yolu / stack yok; `ConsoleServer.js` kapsamı ölçülür ve `tests/BASELINE.md`'ye yazılır (bugün ölçüm dışı).

---

#### WP-2.3 Merkezi kapanış orkestrasyonu · 9 görev · 10 h

**Amaç:** Üç yere dağılmış kapanış sırasını tek `shutdown()` altında toplamak; uçuştaki yazmaları kesmemek.

| ID | Görev | Dosya |
|---|---|---|
| T-2.3.1 | `src/main/lifecycle/shutdown.js`: `registerShutdown({timers, webhooks, api, metrics, upsMonitor, storage})` | yeni |
| T-2.3.2 | Sabit sıra: `timers.clearAll()` → `await webhooks.dispose()` → `await api.stop()` → `metrics.stopSampling()` → `upsMonitor.close()` → `auditCheckpoint.write()` → `storage.close()` | aynı |
| T-2.3.3 | Her adım `try/catch` + 2 s üst sınır (`Promise.race`) | aynı |
| T-2.3.4 | `before-quit` → `preventDefault()` + `isQuitting` bayrağı + `await shutdown()` + `app.quit()` (D9) | `main.js` |
| T-2.3.5 | `headless.js` `stop()` → `async`, aynı orkestrasyon | `headless.js:186-195` |
| T-2.3.6 | `headless.js:161`: `const started = await api.start()`; `ok:false` → `exit(1)` | `headless.js` |
| T-2.3.7 | 3 test: kapanış temizliği, çift `before-quit`, checkpoint→close sırası (T32, T34, T35) | `tests/main/lifecycle.test.mjs` |
| T-2.3.8 | Test: uçuştaki `sync()` sırasında `stop()` → `SQLITE_MISUSE` yok (T33) | aynı |
| T-2.3.9 | Test: headless `stop()` aynı orkestrasyonu kullanıyor, exit code 0 (T36) | `tests/main/headless-agent.test.mjs` |

**Bağımlılık:** WP-2.1, WP-2.2
**Çıktı:** Yeni lifecycle modülü + 2 dosyada entegrasyon + 5 test
**DoD:** Kapanış sonrası `timers.size === 0` ve `api.server === null`; `before-quit` iki kez tetiklendiğinde sonsuz döngü yok; toplam kapanış ≤5 s.

---

#### WP-2.4 Webhook teslim motoru · 10 görev · 11 h

**Amaç:** Sınırsız fan-out'u sınırlı kuyruğa çevirmek; retry'ları sınıflandırmak; 4xx'i boşuna denememek.

| ID | Görev | Dosya |
|---|---|---|
| T-2.4.1 | `_queue` + `_active` + `maxConcurrent` (varsayılan 4, üst 16) | `WebhookService.js:42-55` |
| T-2.4.2 | `_enqueue` / `_drain` deseni; `setImmediate` yalnız drain içinde | aynı |
| T-2.4.3 | `setTimeoutFn` → `TimerRegistry.setTimeout` (enjekte edilebilir) | `:31`, `:118`, `:171` |
| T-2.4.4 | Retry sınıflandırma: 408/429/5xx/timeout → retry; 400/401/403/404/410/422 → terminal | `:100-130` |
| T-2.4.5 | Backoff: `min(base·2ⁿ, 120s) × (1 + 0.2·rand(−1,1))`, base 2 s | aynı |
| T-2.4.6 | `Retry-After` (saniye veya HTTP-date) varsa ona uy | aynı |
| T-2.4.7 | `dispose()`: kuyruğu boşalt, timer'ları temizle, uçuştaki isteği `AbortController` ile iptal et | `WebhookService.js` |
| T-2.4.8 | 2 test: 20 hook → eşzamanlı ≤4 (T37); 404/503/429 sınıflandırma (T38) | `tests/main/webhook.test.mjs` |
| T-2.4.9 | 2 test: `dispose()` sonrası yeni timer yok (T39); jitter sınırları (T40) | aynı |
| T-2.4.10 | `WebhookService.js` fonksiyon kapsamını ≥70'e çıkar (bugün 61.90) | `tests/main/webhook.test.mjs` |

**Bağımlılık:** WP-2.3
**Çıktı:** Yeniden yazılmış dağıtım çekirdeği + 4 test
**DoD:** 20 hook × 1 olayda maksimum eşzamanlı istek 4; 404 tek denemede biter; kapanışta bekleyen retry yok; jitter ölçülen gecikme `[0.8×, 1.2×]` bandında.

---

### F3 — Veri Bütünlüğü ve Migrasyon

#### WP-3.1 Idempotency kapsamlama · 9 görev · 9 h

**Amaç:** Anahtarı kapsamlandırmak; 4xx kilitlenmesini bitirmek; payload uyuşmazlığını ayırt etmek.

| ID | Görev | Dosya |
|---|---|---|
| T-3.1.1 | Bileşik anahtar: `sha256(method + ' ' + pathname + ' ' + role + ' ' + idemKey)` (D4) | `LocalApiService.js:385-396` |
| T-3.1.2 | `Idempotency-Key` biçim doğrulaması: 8–255 karakter, `[A-Za-z0-9._:-]` | aynı |
| T-3.1.3 | Payload parmak izi: gövdenin SHA-256'sı; aynı anahtar + farklı parmak izi → **422** (D5) | `:413+` |
| T-3.1.4 | İşlemdeki anahtar için **409** (`inFlight` Set) | aynı |
| T-3.1.5 | `sendJson` yalnız 2xx/409 saklar; `skipCache` opsiyonu (D6) | `:750-759` |
| T-3.1.6 | Replay yanıtına `Idempotent-Replay: true` başlığı | aynı |
| T-3.1.7 | `inFlight` sızıntı koruması: `finally` + 60 s TTL süpürme | aynı |
| T-3.1.8 | 3 test: çapraz uç nokta (T41), 401→token yenile→aynı anahtar 200 (T42), payload uyuşmazlığı 422 (T43) | `tests/main/localapi.test.mjs`, `localapi-auth.test.mjs` |
| T-3.1.9 | 2 test: paralel çift → 201+409 (T44), replay başlığı (T45) | `tests/main/localapi.test.mjs` |

**Bağımlılık:** WP-2.1 *(v1'deki `WP-3.2` bağımlılığı kaldırıldı — idempotency, ayar atomikliğine bağımlı değildir; bu v1'de gereksiz bir serileştirmeydi)*
**Çıktı:** Idempotency katmanı + 5 test
**DoD:** 401/429 cache'lenmiyor; çapraz uç nokta sızıntısı yok; 422/409 semantiği draft-07 ile uyumlu; `inFlight` 60 s sonra boşalıyor.

---

#### WP-3.2 Atomik ayar kaydı · 8 görev · 8 h

**Amaç:** Tek IPC, tek transaction, tek restart; PIN iptalinde sıfır yan etki.

| ID | Görev | Dosya |
|---|---|---|
| T-3.2.1 | Ayar handler'ında PIN kapısını **en başa** al (hiçbir alan yazılmadan) | `main.js` save-settings |
| T-3.2.2 | Tüm alanları tek `updateSettings(rest)` ile yaz | aynı |
| T-3.2.3 | `prev` snapshot al; restart `ok:false` ise `updateSettings(prev)` + `settings_reverted` audit | `:1330-1336` |
| T-3.2.4 | Renderer: `saveSettings` + `saveSecuritySettings` çağrılarını **tek** payload'ta birleştir | `app.js:1839-1868` |
| T-3.2.5 | Dil/enerji/otonomi kaydını tek payload + tek PIN kapısına taşı | `app.js:3244-3261` |
| T-3.2.6 | `saveSecuritySettings` PIN beklerken **hiçbir alan** yazmıyor (erken return) | `app.js` |
| T-3.2.7 | 3 test: PIN iptali → deep-equal (T46), restart hatası → geri alma (T47), tek `updateSettings` çağrısı (T49) | `tests/main/settings-atomic.test.mjs` |
| T-3.2.8 | 1 renderer testi: dil+otonomi iptali → `language` değişmedi (T48) | `tests/renderer/settings.test.mjs` |

**Bağımlılık:** WP-2.1, WP-1.1
**Çıktı:** 1 handler + 2 renderer akışı + 4 test
**DoD:** PIN iptalinde diskte tek byte değişmiyor; restart hatasında ayarlar başlangıç değerine dönüyor; `updateSettings` çağrı sayısı **1** (spy).

---

#### WP-3.3 Görev şeması doğrulama · 9 görev · 8 h

**Amaç:** `source`, `mode`, `recurrence`, `safetyPolicy`, `snoozeConfig` alanlarını doğrulanabilir kılmak; `source`'u sunucuda atamak.

| ID | Görev | Dosya |
|---|---|---|
| T-3.3.1 | `SOURCES` allowlist + `source` doğrulaması | `validate.js:157-241` |
| T-3.3.2 | `mode` allowlist (`classic\|assisted\|autonomous`) | aynı |
| T-3.3.3 | `recurrence`: `intervalMinutes` 1..10080, `count` 1..1000 | aynı |
| T-3.3.4 | `safetyPolicy`: düz nesne, değerler `boolean\|number` | aynı |
| T-3.3.5 | `snoozeConfig.defaultMinutes` 1..1440 | aynı |
| T-3.3.6 | `create-task` handler'ında `data.source = 'user_interface'` **sunucuda** ata | `main.js` |
| T-3.3.7 | 40 öğeli geçersiz payload corpus'u (her alan × tip/sınır) | `tests/main/validate.test.mjs` |
| T-3.3.8 | 2 test: `source:'remote'` → `user_interface` (T51), sınır değerler (T52) | `tests/main/ipc-security.test.mjs` |
| T-3.3.9 | Geriye uyum: kayıtlı eski görev **okuma** yolunda reddedilmez, normalize edilir (T53) | `tests/main/validate.test.mjs` |

**Bağımlılık:** WP-0.1, WP-1.1
**Çıktı:** Genişletilmiş validator + 4 test
**DoD:** Corpus'un **40/40**'ı `code` ile reddediliyor; hiçbir doğrulama "sessiz kabul" ile geçmiyor; `validate.js` fonksiyon kapsamı ≥70 (bugün 53.57).

---

#### WP-3.4 Persist sonuç zinciri · 8 görev · 8 h

**Amaç:** "Bellekte var, diskte yok" durumunu imkânsız kılmak.

| ID | Görev | Dosya |
|---|---|---|
| T-3.4.1 | `_persist` → `{ok:false, code:'MAINTENANCE'\|'NO_DB'\|'WRITE_FAILED'}` | `StorageService.js:946-958` |
| T-3.4.2 | `persistChanges()` → `{ok, changed, failed}` | `TaskManager.js:828-849` |
| T-3.4.3 | `createTask` hata yolunda bellek geri alması + `PERSIST_FAILED` | `TaskManager.js:529-582` |
| T-3.4.4 | `OrderQueue.persist` → `boolean` | `OrderQueue.js:25-31` |
| T-3.4.5 | `LocalApiService` sipariş yolu: `persist === false` → **503** + `Retry-After: 5` | `LocalApiService.js` |
| T-3.4.6 | `persistChanges` dönüşünü yok sayan **tüm** çağrı yerlerini listele ve işaretle (`grep`) | `TaskManager.js` + çağıranlar |
| T-3.4.7 | 2 test: `saveTask=false` → `PERSIST_FAILED` + listede yok (T54); `saveOrders=false` → 503, 201 yok (T55) | `tests/main/taskmanager.test.mjs`, `order-queue.test.mjs` |
| T-3.4.8 | 2 test: rollback sonrası görev sayısı değişmedi (T57); tüm çağrı yerleri sözleşmeyi kullanıyor (T56) | aynı |

**Bağımlılık:** WP-4.1a, WP-2.1
**Çıktı:** 4 serviste sözleşme değişikliği + 4 test
**DoD:** Simüle edilmiş her yazma hatasında çağıran `ok:false` görüyor; "sessiz başarı" kalmıyor; `TaskManager.js` satır kapsamı ≥80 (bugün 66.19), fonksiyon ≥70 (bugün 50.74).

---

#### WP-3.5 `getSettings()` kopya semantiği · 5 görev · 3 h

**Amaç:** Ayar nesnesine dışarıdan yapılan mutasyonun diske ve sonraki okumaya sızmamasını sağlamak.

| ID | Görev | Dosya |
|---|---|---|
| T-3.5.1 | `getSettings()` sığ kopya + dizi alanları kopyala (D13) | `StorageService.js:992-994` |
| T-3.5.2 | Sıcak yollar için `_getSettingsRef()` (yalnız iç kullanım, dışa açılmaz) | aynı |
| T-3.5.3 | `requireCancelPin` / `requireSecurityPin` her çağrıda taze okuma yapıyor mu doğrula | `main.js:87-130` |
| T-3.5.4 | 1 test: dönen nesneyi mutasyona uğrat → sonraki `getSettings()` etkilenmiyor (T58) | `tests/main/storage.test.mjs` |
| T-3.5.5 | 1 test: `updateSettings` sonrası eski referans bayat, yeni okuma güncel | aynı |

**Bağımlılık:** WP-1.1
**Çıktı:** 2 metot + 2 test
**DoD:** Dışarıdan mutasyon diske ve sonraki okumaya yansımıyor; `StorageService.js` dal kapsamı ≥65 (bugün 47.16).

---

#### WP-3.6 `ConsoleStore` dayanıklılık · 5 görev · 4 h

**Amaç:** Tek bozuk satırın tüm konsol snapshot'ını düşürmesini bitirmek; yeni şema sürümünü eski uygulamaya karşı kapıda durdurmak.

| ID | Görev | Dosya |
|---|---|---|
| T-3.6.1 | `snapshot()`: `safeParse` null → `_quarantine(row.id)` + `continue` | `ConsoleStore.js:700-715` |
| T-3.6.2 | `queues` şemasına `state='corrupt'` ekle; tüm `state IN (...)` sorgularını güncelle | şema |
| T-3.6.3 | `SCHEMA_VERSION` sabiti + `init()` kapısı (`too new` → `SCHEMA_TOO_NEW`) | `:93` |
| T-3.6.4 | `migrate(from, to)` iskeleti (v1→v2→v3) | yeni |
| T-3.6.5 | 2 test: bozuk satır → çökme yok (T59); `schema_version` yeni → `SCHEMA_TOO_NEW` (T60) | `tests/main/console-store.test.mjs` |

**Bağımlılık:** WP-2.3
**Çıktı:** 3 kod değişikliği + 2 test
**DoD:** Tek bozuk satır snapshot'ı düşürmüyor; yeni sürüm DB'si eski uygulamada açılmıyor; `ConsoleStore.js` kapsamı ölçülür ve baseline'a yazılır.

---

#### WP-3.7 Veri migrasyonu (yeni — v1'de yoktu) · 7 görev · 7 h

**Amaç:** WP-3.3'ün yeni doğrulama kuralları ve WP-3.6'nın şema kapısı, mevcut kurulumlardaki veriyi reddetmesin. `PP_LEGACY_TASKS=1` bir kaçış kapısıdır, migrasyon değildir.

| ID | Görev | Dosya |
|---|---|---|
| T-3.7.1 | Mevcut `MigrateV2.js` desenini incele ve `MigrateV3.js` iskeletini kur (D18): yedek + SHA-256 → geçici DB → tek transaction → checksum → `quick_check` → rename | `src/main/storage/MigrateV3.js` (yeni) |
| T-3.7.2 | **Dry-run modu:** hiçbir şey yazmadan `{scanned, normalizable, rejected, reasons[]}` raporu üret | aynı |
| T-3.7.3 | Normalizasyon kuralları: eksik `source` → `'legacy_import'`; eksik `mode` → `'classic'`; geçersiz `recurrence` → `null` + uyarı | aynı |
| T-3.7.4 | **Reddetme politikası:** normalize edilemeyen kayıt silinmez; `quarantine` tablosuna taşınır + audit | aynı |
| T-3.7.5 | Geri alma: migrasyon öncesi yedek dosya yolu `tests/MIGRATION.md`'ye yazılır; geri yükleme komutu tek satır | `docs/migration.md` |
| T-3.7.6 | 1 test: gerçek DB kopyası üzerinde dry-run → rapor şeması doğru, hiçbir yazma yok (T61) | `tests/main/migration.test.mjs` |
| T-3.7.7 | 1 test: yarıda kalan migrasyon → geçici DB atılır, kaynak bozulmaz, ikinci deneme başarılı (T62) | aynı |

**Bağımlılık:** WP-3.3, WP-3.6
**Çıktı:** `MigrateV3.js` + dry-run raporu + geri alma dokümanı + 2 test
**DoD:** Dry-run hiçbir byte yazmıyor (`fs` spy); yarıda kesilen migrasyonda kaynak dosyanın SHA-256'sı değişmemiş; ikinci deneme başarılı; `Database.js` satır kapsamı ≥70 (bugün 52.75).

---

### F4 — Performans, Bellek, Toplu Yazma

#### WP-4.1a Toplu yazma **sözleşmesi** · 5 görev · 4 h

**Amaç:** `WP-3.4`'ün ihtiyaç duyduğu toplu yazma API'sini, performans optimizasyonundan **önce** tanımlamak. Bu ayrım v1'deki `3.4 ↔ 4.1` döngüsünü kırar.

| ID | Görev | Dosya |
|---|---|---|
| T-4.1a.1 | `saveTasksBulk(tasks) → {ok, written, failed}` imzasını tanımla; tek `_persist` çağrısı yapar | `StorageService.js:922-934` |
| T-4.1a.2 | Prepared statement'ları constructor'da bir kez hazırla, `Map` ile cache'le | `StorageService.js` |
| T-4.1a.3 | `TaskManager.persistChanges` → `saveTasksBulk(dirty)` tek çağrı | `TaskManager.js:828-839` |
| T-4.1a.4 | 1 test: `_persist` çağrı sayısı **1** (spy) (T63) | `tests/main/performance.test.mjs` |
| T-4.1a.5 | 1 test: `prepare` çağrı sayısı N yazma için **1** (T64) | aynı |

**Bağımlılık:** WP-2.1, WP-3.5
**Çıktı:** `saveTasksBulk` sözleşmesi + prepared cache + 2 test
**DoD:** Sözleşme `WP-3.4` tarafından tüketilebilir; `_persist` 1 kez; imza değişikliği `grep` ile tüm çağrı yerlerinde karşılanmış.

---

#### WP-4.1b Toplu yazma **performansı** · 6 görev · 6 h

**Amaç:** O(n²)'yi O(n)'e indirmek; çift `stringify`'ı kaldırmak; dayanıklılık politikasını açıkça seçmek.

| ID | Görev | Dosya |
|---|---|---|
| T-4.1b.1 | `_flushRows`: `nextJson` map'ini tek geçişte üret (D7) | `StorageService.js:439-464` |
| T-4.1b.2 | WAL + `synchronous` politikasını açıkça ayarla; `audit`/`orders` için `FULL` oturumu (D8) | init |
| T-4.1b.3 | 2000+ görevde 500'lük dilimleme | `StorageService.js` |
| T-4.1b.4 | Benchmark: 500 görev toplu güncelleme × 20 tur, önce/sonra `performance.now()` | `scripts/load-test.mjs` |
| T-4.1b.5 | 1 test: p95 ≤150 ms **ve** `JSON.stringify` çağrı sayısı = satır sayısı (T65) | `tests/main/performance.test.mjs` |
| T-4.1b.6 | 1 test: `journal_mode=wal` ve `synchronous` pragma değerleri doğrulanıyor (T66) | `tests/main/storage.test.mjs` |

**Bağımlılık:** WP-3.4
**Çıktı:** 2 dosya + benchmark raporu + 2 test
**DoD:** 500 görev p95 ≤150 ms (öncesi ölçülüp baseline'a yazılır); `_persist` 1; `stringify` sayısı = n; `StorageService.js` satır kapsamı ≥80 (bugün 72.20).

---

#### WP-4.2 Renderer polling disiplini · 5 görev · 4 h

**Amaç:** Eşzamanlı istek fırtınasını ve bayat yanıtın DOM'u ezmesini engellemek; gizli sekmede gereksiz trafiği kesmek.

| ID | Görev | Dosya |
|---|---|---|
| T-4.2.1 | `tasksLoadInFlight` guard | `app.js:1228` |
| T-4.2.2 | `tasksLoadSeq` monotonik sayaç; bayat yanıtı at | aynı |
| T-4.2.3 | `document.visibilityState !== 'visible'` → poll atla | `app.js:1388-1391` |
| T-4.2.4 | 2 test: 3 eşzamanlı çağrı → 1 IPC (T67); bayat seq → DOM güncellenmiyor (T68) | `tests/renderer/tasks-poll.test.mjs` |
| T-4.2.5 | 1 test: gizli sekmede 15 s'de 0 istek (T69) — `visibilityState` `defineProperty` ile mock | aynı |

**Bağımlılık:** WP-1.4
**Çıktı:** 3 kod değişikliği + 3 test
**DoD:** Aynı anda en fazla 1 uçuşta `getTasks`; gizli sekmede 0 istek/15 s; 5 s poll aralığı korunuyor.

---

#### WP-4.3 Bellek ve timer hijyeni · 9 görev · 6 h

**Amaç:** Sahipsiz interval, sınırsız nonce dizisi ve gereksiz fsync üretimini bitirmek; her timer'ı tek kayıt defterine bağlamak.

| ID | Görev | Dosya |
|---|---|---|
| T-4.3.1 | `syncWebhooks` tek `writeAtomic()` | `SecretStore.js:256-277` |
| T-4.3.2 | Başarısız `rename` sonrası temp dosyayı sil | `SecretStore.js:180-227` |
| T-4.3.3 | `SmartFinishEngine.onTaskRemoved(taskId)` + periyodik süpürme | `SmartFinishEngine.js` |
| T-4.3.4 | `consumeNonce`: TTL 1 s + `MAX=1000` + periyodik filtre | `StorageService.js` |
| T-4.3.5 | `WarningManager` interval'ı `TimerRegistry.setInterval`'a bağla | `WarningManager.js:51` |
| T-4.3.6 | `finishWarning`/`cancel`/`snooze` yollarının hepsinde `_clearTick()` (`try/finally`) | aynı |
| T-4.3.7 | 1 test: 5 hook × 3 alan → `writeAtomic` **1** kez (T70) | `tests/main/secrets.test.mjs` |
| T-4.3.8 | 1 test: uyarı bitince `timers.size` başlangıca döndü (T71) | `tests/main/warning.test.mjs` |
| T-4.3.9 | 1 test: 5000 nonce sonrası `seenNonces.length ≤ 1000` (T72) | `tests/main/storage.test.mjs` |

**Bağımlılık:** WP-2.3
**Çıktı:** 4 serviste değişiklik + 3 test
**DoD:** Sır senkronu tek fsync; uyarı bitince sıfır sahipsiz interval; nonce dizisi sınırlı; `SecretStore.js` dal kapsamı ≥65 (bugün 50.00).

---

### F5 — Tutarlılık ve UX

#### WP-5.1 Limit tek kaynak · 5 görev · 3 h

**Amaç:** Renderer, validator ve preload'daki süre limitlerini tek sabitten türetmek; 28 gün / 29 gün sınırının iki katmanda aynı davranmasını sağlamak.

| ID | Görev | Dosya |
|---|---|---|
| T-5.1.1 | `src/shared/limits.js` (`MAX_DURATION_MS`, `_SECONDS`, `_DAYS`) | yeni |
| T-5.1.2 | `validate.js` bu modülden import etsin | `validate.js:11` |
| T-5.1.3 | `preload.js` → `window.PPLimits` (`Object.freeze` kopya) | `preload.js` |
| T-5.1.4 | `app.js` `clampInput` + `totalSeconds` kontrolü bu sabitlerden gelsin | `app.js:250`, `:282` |
| T-5.1.5 | 2 test: 28 gün kabul / 29 gün red (iki katmanda) (T73); `grep` ikinci sayısal limit bulamıyor (T74) | `tests/main/validate.test.mjs` |

**Bağımlılık:** WP-3.3
**Çıktı:** Yeni shared modül + 3 dosyada entegrasyon + 2 test
**DoD:** Üç yerdeki limit aynı sabitten geliyor; `grep -rn "2419200\|2592000" src/ main.js` yalnız `limits.js` döndürüyor.

---

#### WP-5.2 Webhook URL doğrulama + i18n · 6 görev · 5 h

**Amaç:** UI'ın kabul ettiği her webhook URL'sinin `SsrfGuard`'dan geçmesini sağlamak; reddin nedenini 17 dilde göstermek; eski `http://` kayıtları silmeden devre dışı bırakmak.

| ID | Görev | Dosya |
|---|---|---|
| T-5.2.1 | `validateWebhookUrl()`: https zorunlu, port `''\|443\|8443`, userinfo yasak | `app.js:1965-1969` |
| T-5.2.2 | `SsrfGuard` sonucu `reason` → kullanıcı mesajı eşlemesi (D12) | `app.js` webhook bloğu |
| T-5.2.3 | 6 red nedeni için 17 dilde i18n anahtarı | `locales/*` |
| T-5.2.4 | 2 test: `http://`, `:9000`, `user@host` red + doğru neden (T75); geçerli https kabul (T76) | `tests/renderer/webhook-ui.test.mjs` |
| T-5.2.5 | Açılışta kayıtlı hook'ları doğrula; geçersizse "devre dışı + uyarı" (silme yok) | `main.js` startup |
| T-5.2.6 | 1 test: eski `http://` hook açılışta devre dışı, silinmemiş (T77) | `tests/main/webhook-ssrf.test.mjs` |

**Bağımlılık:** WP-2.4, WP-3.3
**Çıktı:** 1 validator + 6 i18n anahtarı + 3 test
**DoD:** UI'ın kabul ettiği her URL `SsrfGuard`'dan geçiyor; geçmeyen URL'de neden gösteriliyor; `locales:check` 17 dil parity geçiyor.

---

### F6 — Temizlik ve Preload Yüzeyi

#### WP-6.1 Ölü kod ve sabitler · 7 görev · 4 h

**Amaç:** Yanıltıcı ölü referansları ve çoklanmış sabitleri kaldırmak; `grep` ile doğrulanabilir tek tanım bırakmak.

| ID | Görev | Dosya |
|---|---|---|
| T-6.1.1 | `escHtml` kullanılmıyorsa sil, kullanılıyorsa gerekçe yorumu ekle | `app.js:1094` |
| T-6.1.2 | `currentActionString` ölü atamalarını sil | `app.js:198, 229, 2922` |
| T-6.1.3 | `directClaim` / `void directClaim` kaldır | `TaskManager.js:376, 386` |
| T-6.1.4 | `catch (err)` kullanılmayan yerleri `catch (_)` yap (tek stil) | proje geneli |
| T-6.1.5 | `expectedBytes` alanını `ModelManager.getStatus()`'a ekle; 2 sabit kaldır | `ModelManager.js`, `app.js:2518, 2820` |
| T-6.1.6 | `getAppVersion()` yardımcısı; 2 sabit kaldır | `main.js:203, 418` |
| T-6.1.7 | Statik test: ölü referanslar 0, sürüm literali tek (T78) | `tests/main/dead-code.test.mjs` |

**Bağımlılık:** WP-1.4, WP-4.2
**Çıktı:** 6 dosyada temizlik + 1 test
**DoD:** `escHtml`/`startTimer`/`currentActionString`/`directClaim` için 0 referans; `'1.1.0'` ve `1374389534` tek tanım.

---

#### WP-6.2 Preload unsubscribe yüzeyi · 6 görev · 4 h

**Amaç:** Reload'da biriken IPC listener'larını bitirmek; `contextBridge`'in kimlik korumadığı gerçeğine uygun bir abonelik sözleşmesi kurmak.

| ID | Görev | Dosya |
|---|---|---|
| T-6.2.1 | `subscribe(channel, cb)` yardımcısı → unsubscribe closure (D10) | `preload.js` |
| T-6.2.2 | Tüm `onX` metotları closure döndürsün | `preload.js:80-95` |
| T-6.2.3 | `onTimerCancelled`'daki `event` sızıntısını düzelt (`callback(...args)` sarmalı) | `preload.js:80` |
| T-6.2.4 | Renderer `beforeunload`'da tüm unsubscribe'ları çağırsın | `app.js` |
| T-6.2.5 | 1 test: 2 subscribe + 1 unsubscribe → handler 1 kez (T79) | `tests/renderer/bridge.test.mjs` |
| T-6.2.6 | 1 test: `event` nesnesi renderer'a geçmiyor (T80) | aynı |

**Bağımlılık:** WP-1.2
**Çıktı:** Yeniden yazılmış preload yüzeyi + 2 test
**DoD:** Reload sonrası `MaxListenersExceededWarning` yok; `event` nesnesi renderer'a ulaşmıyor; `off(channel, cb)` API'si **açılmıyor** (D10).

---

#### WP-6.3 URL parse ve `headersSent` · 4 görev · 3 h

**Amaç:** Bozuk `Host`/`req.url` değerinin yakalanmamış istisnaya dönüşmesini ve çift yanıt yazımını bitirmek.

| ID | Görev | Dosya |
|---|---|---|
| T-6.3.1 | `new URL(req.url, 'http://localhost')` try/catch içinde, `Host` başlığı kullanılmadan | `LocalApiService.js:375` |
| T-6.3.2 | `sendJson` başına `if (!res \|\| res.writableEnded \|\| res.headersSent) return;` | `:750` |
| T-6.3.3 | 1 test: `Host: [` → 400, süreç ayakta (T81) | `tests/main/localapi.test.mjs` |
| T-6.3.4 | 1 test: çift `sendJson` → tek yanıt, `ERR_HTTP_HEADERS_SENT` yok (T82) | aynı |

**Bağımlılık:** WP-2.1
**Çıktı:** 2 kod değişikliği + 2 test
**DoD:** Bozuk `Host`/`req.url` hiçbir koşulda yakalanmamış istisna üretmiyor; `LocalApiService.js` fonksiyon kapsamı ≥70 (bugün 64.70).

---

### F7 — Observability ve Release Gate

#### WP-7.1 Observability (yeni — v1'de yoktu) · 7 görev · 5 h

**Amaç:** Sahada "ne oldu" sorusunu log kazmadan cevaplamak; sayaçları test edilebilir kılmak.

| ID | Görev | Dosya |
|---|---|---|
| T-7.1.1 | Ortak `ERROR_CODES` haritası: IPC ve HTTP aynı kodu kullanır (`PIN_REQUIRED`, `EADDRINUSE`, `PERSIST_FAILED`, …) | `src/shared/errorCodes.js` (yeni) |
| T-7.1.2 | Her HTTP isteğine `requestId` (uuid); yanıt başlığına `X-Request-Id`, log satırına aynı ID | `LocalApiService.js` |
| T-7.1.3 | Sayaçlar: `api.requests`, `idempotency.hit/miss`, `webhook.delivered/failed/retried`, `shutdown.ms` | `MetricCollector.js` |
| T-7.1.4 | Sayaçlar **enjekte edilebilir** (D19): `logger.js` testte no-op olduğu için log ayrıştırma yasak | `MetricCollector.js` |
| T-7.1.5 | `/health`: `{ok, db, api, timers, version, uptimeMs}` — 200/503 | `ConsoleServer.js` |
| T-7.1.6 | 2 test: `requestId` yanıt başlığında ve log argümanında aynı (T83); `/health` şeması (T84) | `tests/main/observability.test.mjs` |
| T-7.1.7 | 1 test: sayaçlar doğru artıyor (idempotency hit/miss, webhook outcome, shutdown ms) (T85) | aynı |

**Bağımlılık:** WP-2.3, WP-3.1, WP-3.4
**Çıktı:** `errorCodes.js` + requestId + 4 sayaç + `/health` + 3 test
**DoD:** Aynı `requestId` ile log satırı ve HTTP yanıtı eşleşiyor; `/health` DB kapalıyken 503; sayaçlar log okumadan doğrulanabiliyor; `logger.js` dal kapsamı ≥70 (bugün 60.00).

---

#### WP-7.2 Tam regresyon + yük + paket + kapsam · 7 görev · 7 h

**Amaç:** Yedi bağımsız kapının **yedisini de** exit 0'a getirmek; kapsam kapısının `main.js`'i gördüğünü kanıtlamak.

| ID | Görev | Komut | Kabul |
|---|---|---|---|
| T-7.2.1 | Birim/integrasyon | `npm test` | 66+ dosya, %100 yeşil, süre ≤ baseline ×1.3 |
| T-7.2.2 | **Kapsam kapısı** | `npm run coverage` | satır ≥80, dal ≥65, fonksiyon ≥70, ifade ≥80 — **exit 0** |
| T-7.2.3 | Dosya bazlı kapsam | `coverage-summary.json` | §0.2'deki her satır hedefini geçiyor; hiçbiri baseline'ın altında değil |
| T-7.2.4 | Güvenlik | `npm run test:security` | 0 bulgu |
| T-7.2.5 | E2E | `npm run test:e2e` | %100 yeşil, `retries: 1` |
| T-7.2.6 | Yük | `npm run test:load` | p95 hedefleri (§7.3) |
| T-7.2.7 | Paket + i18n | `npm run pack && npm run verify:pack && npm run locales:check` | Fuse'lar doğru, 17 dil parity |

**Bağımlılık:** F1–F6 tamamı
**Çıktı:** 6 rapor + kapsam çıktısı
**DoD:** Yedi komutun **yedisi de** exit 0; kapsam raporu `main.js`'i **içeriyor** (B3 kapatıldı).

---

#### WP-7.3 Release checklist ve sürüm notu · 6 görev · 3 h

**Amaç:** 34 bulgunun her birinin kapandığını kanıtlamak; test shim'inin paketlenmiş build'e sızmadığını doğrulamak.

| ID | Kontrol | Kanıt |
|---|---|---|
| T-7.3.1 | 34 bulgu kapanış matrisi: her satırda test adı **veya** commit SHA | `tests/TRACEABILITY.md` 34/34 |
| T-7.3.2 | Manuel E2E iptal: banner → PIN → görev `cancelled`, güç eylemi **çalışmaz** | Ekran kaydı + DB satırı |
| T-7.3.3 | Manuel E2E erteleme: 10 dk sonra tetikleniyor, öncesinde çalışmıyor | Log + `targetTime` |
| T-7.3.4 | Reload sonrası sayaç ±2 s | Ekran görüntüsü ×2 |
| T-7.3.5 | PIN kaldırma mevcut PIN olmadan reddediliyor; kurtarma 24 h önce uygulanamıyor | IPC yanıtı ×2 |
| T-7.3.6 | **Paketlenmiş build:** `__PP_TEST__` yok, `asar` içinde `tests/` yok, sürüm `package.json` ile aynı | `verify:pack` çıktısı + `CHANGELOG.md` |

**Bağımlılık:** WP-7.2
**Çıktı:** Kapanış matrisi, 5 kanıt dosyası, `CHANGELOG.md`
**DoD:** Matriste boş satır yok; `CHANGELOG.md` 34 audit ID'sini içeriyor; paketlenmiş build'de test shim'i **yok**.

---

## 5. Risk ve Önlem Matrisi

**Ölçek:** E (etki) ve O (olasılık) = **Y**üksek (3) / **O**rta (2) / **D**üşük (1).
**Seviye = E × O**, 1–9 arası. **Seviye ≥ 6 olan satırlar `R` ile işaretlidir ve yayın öncesi kapatılmak zorundadır** — fallback'e düşmek yeterli değildir. Bu kural v1'de ilan edilmiş ama uygulanmamıştı.

### 5.1 F0–F2

| WP | Risk | E | O | Seviye | Önlem | Fallback |
|---|---|---|---|---|---|---|
| 0.1 | Kapsam `include` genişletilince oran çöker, ekip eşiği düşürmek ister | Y | Y | **9 R** | D20: glob bazlı eşik; `main.js` tabanı ölçülür, ratchet +2/sürüm | Eşik düşürülmez; genişletme bir sonraki sürüme ertelenir, kapsam borcu yazılı kalır |
| 0.1 | Mevcut 639 test "yeşil ama kör"; yeni testler de aynı körlüğü tekrarlar | Y | O | **6 R** | T-0.1.8 traceability: her audit ID'si bir test adına bağlanır | Eşleşmeyen ID → sürüm bloke |
| 0.1 | Kırmızı testler yanlış nedenden kırmızı (fikstür eksik) | O | O | 4 | Fikstür önce yazılır (T-0.1.6), sonra test | Kırmızı nedeni raporlanır; yanlış neden = test düzeltilir |
| 1.1 | **`await` PIN penceresi açar; süre dolar, görev `executing`'e geçer** | Y | Y | **9 R** | D16 + T-1.1.3 durum yeniden okuma + T09 testi | `CANCEL_TOO_LATE` döner; görev iptal edilmez, güç eylemi çalışır — yanlış başarı gösterilmez |
| 1.1 | `guardIpcHandler` Promise'i beklemez | Y | D | 3 | Doğrulandı: dönüş doğrudan `ipcMain.handle`'a gidiyor, Electron await eder | `return Promise.resolve(handler(...))` ekle |
| 1.1 | `cancelActiveTask()` içinde istisna → yarım durum | Y | D | 3 | `try/catch` → `INTERNAL` + audit | Banner açık kalır, kullanıcı tekrar dener |
| 1.2 | Shim üretim build'ine sızar | Y | O | **6 R** | Koşullu aktivasyon (`__PP_TEST_SHIM__`) + T-7.3.6 `verify:pack` kontrolü | Shim `asar`'dan çıkarılamıyorsa WP geri alınır, E2E'ye dönülür |
| 1.2 | Toast + banner çakışması | O | O | 4 | `success:false`'ta banner korunur, toast 5 s | Toast banner altına sabitlenir |
| 1.3 | **Kurtarma akışı ayrıcalık yükseltme yüzeyi açar** | Y | O | **6 R** | D15: ACL (owner+SYSTEM+Admins) + 24 h gecikme + audit; `applyReset` yükseltilmiş oturum ister | Kurtarma tamamen kapatılır; kullanıcı ayarları sıfırlar (PIN dahil) — dokümante |
| 1.3 | Mevcut kullanıcı PIN'ini bilmiyor, 24 h beklemek istemez | Y | O | **6 R** | Kurtarma isteği audit'e yazılır; UI'da geri sayım gösterilir | Destek prosedürü: tam ayar sıfırlama (veri kaybı uyarısıyla) |
| 1.3 | `Acl.js` bugün %51 kapsamlı; sertleştirme test edilmemiş yollarda çalışır | Y | O | **6 R** | T-1.3.6 + `Acl.js` kapsam hedefi ≥80 | ACL uygulanamazsa kurtarma dosyası hiç oluşturulmaz (fail-closed) |
| 1.4 | `createdAt` yoksa `total` negatif | O | Y | **6 R** | `Math.max(1, ...)` + `Number.isFinite` | `total = remaining` (progress yalnız bu oturum) |
| 1.4 | Silinen fonksiyona başka çağrı kalır | O | D | 2 | `grep` sıfır eşleşme + statik test T-1.4.7 | No-op'a çevir, sonra kaldır |
| 2.1 | `start()` Promise dönünce senkron çağıranlar bozulur | Y | Y | **9 R** | Tüm çağıranlar `grep` ile bulunur (`main.js`, `restart`, `headless`) ve `await` eklenir | Geçişte hibrit (Promise + senkron `server` alanı), sonra temizlenir |
| 2.1 | IPv6 fallback çift `listen()` → `ERR_SERVER_ALREADY_LISTEN` | O | O | 4 | `close(cb)` içinde yeniden bind | Fallback kaldırılır, `0.0.0.0` |
| 2.1 | `EACCES` kullanıcıya anlamsız | O | O | 4 | `code` → i18n eşlemesi | Genel "port kullanılamıyor" |
| 2.2 | `error` içinde `close()` yeni `error` üretir | O | O | 4 | `closing` bayrağı + `once` | `setImmediate` ile ayır |
| 2.2 | Generic 5xx saha teşhisini zorlaştırır | O | Y | **6 R** | Log'a tam stack + `requestId`; yanıta `code`+`requestId` (WP-7.1) | `PP_DEBUG_ERRORS=1` yerel ayrıntı |
| 2.3 | `preventDefault` + `quit` sonsuz döngü | Y | O | **6 R** | `isQuitting` bayrağı; ikinci girişte return | 8 s sert timeout → `app.exit(1)` |
| 2.3 | Kapanış 5 s'yi aşar | O | O | 4 | Adım başı 2 s cap, toplam 5 s | "Kapatılıyor" göstergesi + 8 s zorla çıkış |
| 2.3 | `storage.close()` sonrası checkpoint | Y | O | **6 R** | Sabit sıra + T-2.3.7 sıra testi | Checkpoint'i senkron yaz |
| 2.3 | Windows shutdown/logout'ta `before-quit` **hiç tetiklenmez** | Y | O | **6 R** | Bu yol için `session-end`/`powerMonitor` dinleyicisi eklenir; kapanış idempotent olduğu için iki kez çalışabilir | Yazma yolu `synchronous=FULL` olduğundan son commit korunur |
| 2.4 | 100 hook'lu kurulumda gecikme | O | O | 4 | `maxConcurrent` ayarlanabilir (4–16) | CPU %70 üstünde 4'e düşür |
| 2.4 | `Retry-After` HTTP-date parse hatası | O | D | 2 | İki biçim + parse hatasında backoff | Backoff |
| 2.4 | `dispose()` TLS'i yarıda keser | O | O | 4 | `AbortController` + `catch` | 2 s bekle, sonra iptal |

### 5.2 F3–F7

| WP | Risk | E | O | Seviye | Önlem | Fallback |
|---|---|---|---|---|---|---|
| 3.1 | Bileşik anahtar 255 karakteri aşar | D | O | 2 | `sha256` ile 64 karaktere indir (D4) | Ham anahtar + uzunluk sınırı |
| 3.1 | Fingerprint büyük gövdede CPU yakar | O | D | 2 | Gövde `MAX_BODY_BYTES` ile sınırlı, tek geçiş | 1 MB üstünde fingerprint atla |
| 3.1 | `inFlight` set'i sızar (istek hiç bitmezse) | O | O | 4 | `finally` + 60 s TTL süpürme | Periyodik süpürme |
| 3.2 | Tek `updateSettings` kısmi yazar | Y | D | 3 | Tek `_persist` (transaction) | `prev` snapshot ile geri alma |
| 3.2 | PIN en başa alınınca UX bozulur | D | Y | 3 | PIN yalnız güvenlik alanı değiştiyse sorulur | Değişiklik yoksa sorma |
| 3.2 | Geri almada audit yanlış kalır | O | O | 4 | `settings_reverted` olayı | Audit'i en sonda yaz |
| 3.3 | Yeni doğrulama kayıtlı görevleri reddeder | Y | Y | **9 R** | Okuma yolu normalize eder + WP-3.7 migrasyon | `PP_LEGACY_TASKS=1` geçici bayrak (migrasyon sonrası kaldırılır) |
| 3.3 | `source` sabitleme ajan görevlerini bozar | O | O | 4 | Ajan ayrı `ingest` yolu kullanır | `source` yalnız `create-task`'te sabitlenir |
| 3.4 | `persistChanges` dönüş tipi tüm çağrı yerlerini bozar | Y | Y | **9 R** | T-3.4.6: tüm çağrı yerleri listelenir, bilinçli işaretlenir | Geçişte `{ok:true}` varsayılanı, sonra sıkılaştır |
| 3.4 | `createTask` geri alma yarışı (eşzamanlı iki create) | O | D | 2 | Tek iş parçacığı (main) + senkron DB → yarış yok | Mutex |
| 3.4 | 503 → ajan sonsuz retry | O | O | 4 | `Retry-After` + ajan tarafında maks 5 deneme | DLQ |
| 3.5 | Kopya sıcak yolda yavaşlatır | D | O | 2 | `_getSettingsRef()` yalnız iç kullanım | Elle kopya (`structuredClone`'dan hızlı) |
| 3.6 | `state='corrupt'` mevcut sorguları bozar | O | O | 4 | Tüm `state IN (...)` sorguları `grep` ile güncellenir | `corrupt` yerine `expired` |
| 3.7 | **Migrasyon yarıda kalır, veri bozulur** | Y | O | **6 R** | `MigrateV2.js` deseni (D18): yedek+SHA-256 → geçici DB → tek transaction → checksum → `quick_check` → rename | Kaynak dosyaya hiç dokunulmaz; geçici DB silinir; ikinci deneme (T62) |
| 3.7 | Normalize edilemeyen kayıt sessizce kaybolur | Y | O | **6 R** | Reddedilen kayıt `quarantine` tablosuna + audit; **silme yok** | Kullanıcı dry-run raporunu onaylamadan migrasyon çalışmaz |
| 3.7 | Dry-run yanlışlıkla yazar | Y | D | 3 | `fs` spy testi (T61): yazma çağrısı 0 | Migrasyon `--dry-run` bayrağı olmadan çalışmaz |
| 4.1a | Sözleşme değişikliği `saveTasksBulk` çağıranlarını bozar | Y | O | **6 R** | İmza `grep` ile tüm çağrı yerlerinde karşılanır | Geçişte eski `saveTask` sarmalayıcı korunur |
| 4.1b | Uzun transaction main thread'i bloke eder | Y | O | **6 R** | 500 görevde ≤150 ms hedef; 2000+ için 500'lük dilim | Dilim 250 |
| 4.1b | `synchronous=NORMAL` elektrik kesintisinde son commit'i kaybeder | Y | D | 3 | `audit`/`orders` için `FULL` oturumu | Tümüyle `FULL` (%20 perf kaybı) |
| 4.2 | Guard "yenilenmiyor" hissi | O | O | 4 | 5 s poll korunur; guard yalnız eşzamanlıyı engeller | Manuel yenile düğmesi |
| 4.2 | jsdom'da `visibilityState` hep `visible` | D | Y | 3 | `Object.defineProperty` mock (T-4.2.5) | Poll'u enjekte edilebilir yap |
| 4.3 | Tek yazmada kısmi hata tüm sırları kaybeder | Y | D | 3 | Bellekte tamamla → tek yaz → hata ise geri al | Sır başına yazmaya dön |
| 4.3 | Nonce `MAX` düşürmesi replay korumasını zayıflatır | Y | O | **6 R** | TTL 1 s + `MAX ≥ tepe_sipariş/s × 3600` hesabı | `MAX=10000` (~1 MB) |
| 4.3 | `clearAll()` sonrası uyarı `TIMER_REGISTRY_CLOSED` fırlatır | O | O | 4 | Kapanışta uyarı başlatılmaz (`stopped` bayrağı) | `try/catch` + düz `setInterval` |
| 5.1 | Renderer limitleri değiştirir | D | D | 1 | `Object.freeze` kopya; backend otorite | Backend her zaman doğrular |
| 5.2 | Kayıtlı `http://` hook'lar geçersizleşir | O | Y | **6 R** | Açılışta doğrula → "devre dışı + uyarı", silme yok (T77) | Kullanıcıya tek seferlik düzeltme sihirbazı |
| 5.2 | 6 yeni i18n anahtarı 17 dilde eksik kalır | O | O | 4 | `locales:check` T-7.2.7'de zorunlu | Eksik dil → İngilizceye düş, `locales:check` kırmızı kalır |
| 6.1 | `escHtml` silinince XSS kapısı sanılır | D | O | 2 | `validate.js:170` yasağı korunur + yorum | — |
| 6.2 | Unsubscribe closure `contextBridge`'den geçmez | Y | O | **6 R** | D10 doğrulandı: closure preload'da oluşur, fonksiyon olarak geçer | `removeAllListeners(channel)` sun |
| 6.3 | `Host` yok saymak ters proxy'yi bozar | O | D | 2 | Yalnız `pathname`+`query` kullanıldığı doğrulandı | `Host` doğrula + sabit taban |
| 7.1 | `requestId` her log satırına eklenince log hacmi büyür | D | O | 2 | 5 MB rotasyon mevcut; `requestId` yalnız istek kapsamında | Örnekleme (%10) |
| 7.1 | Sayaçlar log'a yazılıyor, testte no-op olduğu için doğrulanamıyor | Y | O | **6 R** | D19: sayaçlar enjekte edilebilir nesne, log ayrıştırma yok | Sayaçları `MetricCollector` örneği üzerinden doğrula |
| 7.2 | Kapsam eşiği hâlâ tutmuyor | Y | O | **6 R** | §0.2 dosya hedefleri + T-7.2.3 dosya bazlı kontrol | Eksik dosya listelenir; `/* v8 ignore */` yalnız gerekçeyle — **eşik düşürülmez** |
| 7.2 | E2E Electron sürümünde flake | O | Y | **6 R** | `retries: 1`; timer testlerinde sahte saat | Manuel kontrol listesi (T-7.3.2/3) |
| 7.3 | Kapanış referansı olmayan bulgu kalır | O | O | 4 | 34 satırlık matris; her satır test adı veya SHA | Eksik satır → sürüm bloke |

**Seviye ≥6 sayısı: 25** (F0–F2: 13, F3–F7: 12). Bunların tamamı yayın öncesi kapatılmalı; hiçbiri "fallback yeterli" sayılmaz.

---

## 6. Test Senaryoları ve Kabul Kriterleri

**92 senaryo.** Her satır: senaryo · adımlar · kabul kriteri (ölçülebilir) · tip. "Tip" alanı testin **fiilen nerede** koşacağını söyler — v1'de bu alan yoktu ve renderer testlerinin uygulanamaz olduğu görülmüyordu.

### 6.1 F0–F1 (T01–T22)

| # | WP | Senaryo | Adımlar | Kabul kriteri | Tip |
|---|---|---|---|---|---|
| T01 | 0.1 | Baseline tekrarlanabilirliği | `npm test` iki kez | 66 dosya / 639 test / 0 fail, süre ±%20 bandında | CI |
| T02 | 0.1 | İzlenebilirlik tamlığı | `tests/TRACEABILITY.md` satırlarını say | 34/34 audit ID eşleşmiş, boş satır 0 | Statik |
| T03 | 1.1 | PIN'siz iptal | `warningCancel()` (pin yok) | `{success:false, code:'PIN_REQUIRED'}`; `cancelActiveTask` **0** kez; görev durumu değişmedi | Birim |
| T04 | 1.1 | Yanlış PIN | `warningCancel('0000')` | `PIN_INVALID`; `attemptsLeft` azaldı; `cancelActiveTask` 0 | Birim |
| T05 | 1.1 | Doğru PIN | `warningCancel(doğru)` | `{success:true, code:'CANCELLED'}`; `cancelActiveTask` **1** kez; görev `cancelled` | Birim |
| T06 | 1.1 | PIN'siz erteleme | `warningSnooze(10)` | `PIN_REQUIRED`; `snoozeTask` 0; `targetTime` değişmedi | Birim |
| T07 | 1.1 | Doğru PIN ile erteleme | `warningSnooze(10, doğru)` | `{success:true, minutes:10}`; `targetTime ≈ now+600 s` (±1 s) | Birim |
| T08 | 1.1 | 5 yanlış deneme | 5 × yanlış PIN | 6. denemede `RATE_LIMITED` + `retryAfterSec > 0` | Birim |
| **T09** | 1.1 | **TOCTOU: PIN beklerken süre dolar** | `requireCancelPin` 3 s geciktirilir; bu arada uyarı süresi biter | `{success:false, code:'CANCEL_TOO_LATE'}`; `cancelActiveTask` **0**; güç eylemi çalışır; UI başarı göstermez | Birim |
| T10 | 1.2 | `success:false` | Mock yanıt + `btnWarnStop` tıkla | Banner `hidden` **değil**; toast görünür | Renderer (shim) |
| T11 | 1.2 | `success:true` | Mock yanıt + tıkla | Banner gizli; toast yok | Renderer (shim) |
| T12 | 1.2 | `null` yanıt | Mock `null` | Banner görünür; hata toast'u | Renderer (shim) |
| T13 | 1.2 | `pendingPin` | Mock `{pendingPin:true}` | PIN modal açılır; banner görünür; **toast yok** | Renderer (shim) |
| T14 | 1.3 | PIN'siz `clear-cancel-pin` | IPC çağır | `PIN_REQUIRED`; `cancelPinHash` önceki değerle **aynı** | Birim |
| T15 | 1.3 | Doğru PIN ile temizleme | IPC(doğru) | `success:true`; hash `null`; audit `cancel_pin_cleared` | Birim |
| T16 | 1.3 | currentPin'siz değiştirme | `set-cancel-pin(yeni)` | `PIN_REQUIRED`; hash değişmedi | Birim |
| T17 | 1.3 | Yanlış currentPin | `set-cancel-pin(yeni, yanlış)` | `PIN_INVALID`; hash değişmedi | Birim |
| **T18** | 1.3 | **Kurtarma 24 s kapısı** | `requestReset()` → hemen `applyReset()` | `RECOVERY_NOT_DUE`; audit `cancel_pin_reset_requested` var, `..._applied` **yok**; `grep -r "reset-cancel-pin"` 0 | Birim |
| T19 | 1.4 | Reload sonrası sayaç | Görev başlat → 30 s bekle → `webContents.reload()` | Kalan süre `targetTime-now` ±2 s; tek `countdownInterval` | E2E |
| T20 | 1.4 | Çift geri yükleme yok | Açılışta `getActiveState` spy | Çağrı sayısı **tam 1** | Renderer (shim) |
| T21 | 1.4 | Ölü referans yok | `grep -rn "startTimer(" src/` | Yalnız `startTimerTo(` eşleşmeleri | Statik |
| T22 | 1.4 | `createdAt` yok | Eksik `createdAt` ile geri yükle | `total ≥ 1`; progress 0..1; `NaN` yok | Renderer (shim) |

### 6.2 F2 (T23–T40)

| # | WP | Senaryo | Adımlar | Kabul kriteri | Tip |
|---|---|---|---|---|---|
| T23 | 2.1 | Port işgali | 18456'yı dinle → `start()` | ≤1000 ms içinde `{ok:false, code:'EADDRINUSE'}`; süreç ayakta | Birim |
| T24 | 2.1 | Başarısız restart geri alma | Ayar kaydet, portu işgal et | IPC `success:false`; `getSettings()` eski port | Birim |
| T25 | 2.1 | Kurtarma | T24 → portu boşalt → tekrar kaydet | `success:true`; `server.listening === true` | Birim |
| T26 | 2.1 | IPv6 fallback tek `listen` | IPv6 bind `EAFNOSUPPORT` zorla | `ERR_SERVER_ALREADY_LISTEN` yok; `listen` çağrı sayısı ≤2 | Birim |
| T27 | 2.1 | Çift `start()` | `start()` iki kez await | İkincisi `ALREADY_RUNNING`; istisna yok | Birim |
| T28 | 2.2 | Konsol port çakışması | 8443'ü dinle → `start()` | Fırlatmıyor; `server === null`; süreç ayakta | Birim |
| T29 | 2.2 | Bozuk request target | `req.url = '//['` | 400 `BAD_REQUEST_TARGET`; istisna yok | Birim |
| T30 | 2.2 | Ham hata sızıntısı | Route'ta `throw new Error('C:\\secret\\path')` | 500 + `INTERNAL_ERROR`; gövdede `secret` **yok** | Birim |
| T31 | 2.2 | Çift `sendJson` | İki kez çağır | Tek yanıt; `ERR_HTTP_HEADERS_SENT` yok | Birim |
| T32 | 2.3 | Kapanış temizliği | `app.quit()` | ≤5 s; `timers.size === 0`; `server === null` | E2E |
| T33 | 2.3 | Uçuşta kapanış | `sync()` sürerken `stop()` | `SQLITE_MISUSE` yok; yazma ya tam ya hiç | Birim |
| T34 | 2.3 | Çift `before-quit` | İki kez `app.quit()` | Sonsuz döngü yok; tek kapanış; `shutdown` 1 kez | Birim |
| T35 | 2.3 | Checkpoint sırası | Kapanış log sırasını yakala | `auditCheckpoint.write` **önce**, `storage.close` **sonra** | Birim |
| T36 | 2.3 | Headless kapanış | `headless.stop()` | Aynı orkestrasyon; exit code 0; açık timer 0 | Birim |
| T37 | 2.4 | Fan-out sınırı | 20 hook, 1 olay | Eşzamanlı aktif ≤4 (gözlem) | Birim |
| T38 | 2.4 | Retry sınıflandırma | 404 / 503 / 429 + `Retry-After: 30` | 404: 1 deneme · 503: retry · 429: ≥30 s sonra | Birim |
| T39 | 2.4 | `dispose()` | `dispose()` sonrası 60 s bekle | Yeni timer yok; `timers.size` artmadı | Birim |
| T40 | 2.4 | Jitter sınırları | 50 retry gecikmesini kaydet | Her gecikme `[0.8×, 1.2×] × min(base·2ⁿ, 120 s)` | Birim |

### 6.3 F3 (T41–T62)

| # | WP | Senaryo | Adımlar | Kabul kriteri | Tip |
|---|---|---|---|---|---|
| T41 | 3.1 | Çapraz uç nokta | `POST /orders` `K:abc` → `GET /inventory` `K:abc` | İkinci istek **gerçek** envanter yanıtı (sipariş gövdesi değil) | Birim |
| T42 | 3.1 | 4xx kilitlenmesi | 401 al → token yenile → aynı anahtar | 200 döner (cache'e takılmadı) | Birim |
| T43 | 3.1 | Payload uyuşmazlığı | Aynı anahtar, farklı gövde | 422 + `IDEMPOTENCY_KEY_REUSED` | Birim |
| T44 | 3.1 | Paralel çift | Aynı anahtar iki paralel istek | Biri 201, diğeri 409 | Birim |
| T45 | 3.1 | Replay başlığı | Aynı istek 2 kez | İkinci yanıtta `Idempotent-Replay: true` | Birim |
| T46 | 3.2 | PIN iptali atomikliği | Snapshot al → ayar kaydet → PIN iptal | `getSettings()` snapshot ile deep-equal | Birim |
| T47 | 3.2 | Restart hatası geri alma | Port işgal → kaydet | Tüm alanlar eski; tek `settings_reverted` audit | Birim |
| T48 | 3.2 | Dil+otonomi iptali | Dil değiştir + otonomi → PIN iptal | `language` **değişmedi**; localStorage eski | Renderer |
| T49 | 3.2 | Tek `updateSettings` | Ayar kaydet | `updateSettings` çağrı sayısı **1** (spy) | Birim |
| T50 | 3.3 | Geçersiz alan corpus'u | 40 payload | 40/40 `code` ile red | Birim |
| T51 | 3.3 | `source` sahteleme | `create-task({source:'remote'})` | Kayıtta `source === 'user_interface'` | Birim |
| T52 | 3.3 | Sonsuz recurrence | `intervalMinutes:0` / `count:99999` | `INVALID_RECURRENCE` | Birim |
| T53 | 3.3 | Geriye uyum | Eski şemalı görevi oku | Reddedilmiyor; normalize edilip dönüyor | Birim |
| T54 | 3.4 | Yazma hatası | `saveTask → false` | `{ok:false, code:'PERSIST_FAILED'}`; görev listede yok | Birim |
| T55 | 3.4 | Sipariş yazma hatası | `saveOrders → false` | 503 `ORDER_PERSIST_FAILED`; 201 yok | Birim |
| T56 | 3.4 | Çağrı yeri kapsaması | `grep` + tip testi | `persistChanges` dönüşünü yok sayan çağrı **0** | Statik |
| T57 | 3.4 | Rollback | Simüle `_persist` hatası | Görev sayısı değişmedi; bellek ve disk tutarlı | Birim |
| T58 | 3.5 | Settings mutasyonu | `getSettings().localApiPort = 1` | Sonraki okuma 18456 | Birim |
| T59 | 3.6 | Bozuk satır | `signed='{bozuk'` | `snapshot()` çökmüyor; satır `corrupt`; diğerleri dönüyor | Birim |
| T60 | 3.6 | Yeni şema | `schema_version = 999` | `SCHEMA_TOO_NEW` | Birim |
| T61 | 3.7 | Dry-run yazmıyor | Gerçek DB kopyası + dry-run | Rapor `{scanned, normalizable, rejected}`; `fs` yazma çağrısı **0** | Birim |
| T62 | 3.7 | Yarıda kalan migrasyon | Migrasyonu %50'de kes | Kaynak SHA-256 **değişmedi**; geçici DB silindi; 2. deneme başarılı | Birim |

### 6.4 F4–F7 (T63–T92)

| # | WP | Senaryo | Adımlar | Kabul kriteri | Tip |
|---|---|---|---|---|---|
| T63 | 4.1a | Tek `_persist` | 50 görevi toplu güncelle | `_persist` çağrı sayısı **1** | Birim |
| T64 | 4.1a | Prepared cache | 50 yazma | `prepare` çağrı sayısı **1** | Birim |
| T65 | 4.1b | Toplu güncelleme performansı | 500 görev, tümünü duraklat × 20 tur | p95 ≤150 ms; `stringify` sayısı = satır sayısı | Benchmark |
| T66 | 4.1b | Pragma değerleri | `PRAGMA journal_mode` / `synchronous` oku | `wal`; kritik oturumda `full` | Birim |
| T67 | 4.2 | Eşzamanlı poll | 3 hızlı `loadTasks()` | IPC isteği **1** | Renderer |
| T68 | 4.2 | Bayat yanıt | 1. yanıtı geciktir, 2. hızlı dön | DOM **2.** yanıtı gösteriyor | Renderer |
| T69 | 4.2 | Gizli sekme | `visibilityState='hidden'` + 15 s | İstek sayısı **0** | Renderer |
| T70 | 4.3 | Sır senkronu | 5 hook × 3 alan | `writeAtomic` **1** kez | Birim |
| T71 | 4.3 | Uyarı timer'ı | Uyarı başlat → iptal | `timers.size` başlangıca döndü | Birim |
| T72 | 4.3 | Nonce sınırı | 5000 nonce | `seenNonces.length ≤ 1000`; en eski düşer | Birim |
| T73 | 5.1 | Limit tutarlılığı | 28 gün / 29 gün | 28 kabul, 29 red — **hem UI hem backend** | Birim |
| T74 | 5.1 | Tek kaynak | `grep` sayısal limit | Yalnız `src/shared/limits.js` döndürüyor | Statik |
| T75 | 5.2 | Webhook URL reddi | `http://`, `:9000`, `user@host` | Üçü de red + doğru neden anahtarı | Renderer |
| T76 | 5.2 | Geçerli URL | `https://example.com/hook` | Kabul | Renderer |
| T77 | 5.2 | Eski `http://` hook | Açılışta kayıtlı hook'u yükle | "Devre dışı + uyarı"; kayıt **silinmemiş** | Birim |
| T78 | 6.1 | Ölü kod | `grep` | `escHtml(`/`startTimer(`/`currentActionString`/`directClaim` → 0 | Statik |
| T79 | 6.2 | Listener sızıntısı | 2 subscribe + 1 unsubscribe → emit | Handler **1** kez | Renderer |
| T80 | 6.2 | `event` sızıntısı | `onTimerCancelled` emit | Callback argümanında `event` nesnesi **yok** | Renderer |
| T81 | 6.3 | Bozuk `Host` | `Host: [` | 400; istisna yok | Birim |
| T82 | 6.3 | Çift `sendJson` | İki kez çağır | Tek yanıt; `ERR_HTTP_HEADERS_SENT` yok | Birim |
| T83 | 7.1 | `requestId` korelasyonu | 1 istek at | Yanıt başlığı `X-Request-Id` == log satırındaki ID | Birim |
| T84 | 7.1 | `/health` şeması | DB açık / kapalı | 200 `{ok:true,...}` / 503 `{ok:false,...}` | Birim |
| T85 | 7.1 | Sayaçlar | 2 istek (1 hit, 1 miss) + 1 webhook | `idempotency.hit=1`, `miss=1`, `webhook.delivered=1` | Birim |
| T86 | 7.2 | Tam regresyon | `npm test` | 66+ dosya, %100 yeşil, süre ≤ baseline ×1.3 | CI |
| T87 | 7.2 | **Kapsam kapısı** | `npm run coverage` | ≥80 / 65 / 70 / 80 — **exit 0** | CI |
| T88 | 7.2 | Dosya bazlı kapsam | `coverage-summary.json` | §0.2'deki **sayısal hedefli 13 dosya** hedefini geçiyor; ölçüme alınan 3 dosya (`main.js`, `ConsoleStore`, `ConsoleServer`) baseline'ın altına düşmüyor; hiçbir dosyada düşüş yok | CI |
| T89 | 7.3 | Manuel iptal E2E | UI → banner → PIN → iptal | Banner kaybolur; görev `cancelled`; güç eylemi **çalışmaz** | Manuel |
| T90 | 7.3 | Manuel erteleme E2E | UI → PIN → 10 dk | 10 dk sonra uyarı yeniden; öncesinde çalışmaz | Manuel |
| T91 | 7.3 | Reload + PIN kaldırma | Reload; sonra PIN'siz kaldırma dene | Sayaç ±2 s; kaldırma `PIN_REQUIRED`; kurtarma 24 h önce `RECOVERY_NOT_DUE` | Manuel |
| T92 | 7.3 | Paketlenmiş build | `npm run pack && npm run verify:pack` | `app.asar` zaman damgası kaynaklardan yeni; `__PP_TEST__` yok; `asar` içinde `tests/` yok; sürüm `package.json` ile aynı | CI |

**Toplam: 92 senaryo** — 62 birim · 14 renderer (6 shim + 8 DOM) · 5 CI · 5 statik · 3 manuel · 2 E2E · 1 benchmark.

---

## 7. Takvim, Aşamalı Sürüm ve Performans Eşikleri

### 7.1 Takvim (38 iş günü = 180 h P50 + 45 h P50→P90 payı)

Kümülatif saat, topolojik sıraya göre hesaplandı (6 net h/gün).

| Gün | WP | Kümülatif h | Çıktı |
|---|---|---|---|
| 1–2 | 0.1 | 8 | Baseline + kırmızı testler + kapsam politikası |
| 2–3 | 1.1 | 18 | PIN/TOCTOU düzeltmesi + 7 test |
| 3–4 | 1.2 | 24 | Renderer kapısı + shim + 4 test |
| 4–6 | 1.3 | 34 | PIN sertleştirme + `RecoveryGate` + 5 test |
| 6–7 | 1.4 | 42 | Sayaç geri yükleme + 3 test |
| **8–9** | **buffer** | 42 → 53 | **`v1.1.1` yayını — 4 kritik bulgu kapalı** |
| 9 | 2.1 | 51 | Bind hataları yayılıyor |
| 10 | 2.2 | 58 | Konsol dayanıklı |
| 11 | 3.5, 4.1a | 65 | Settings kopyası + toplu yazma sözleşmesi |
| 12–13 | 2.3 | 75 | Merkezi kapanış |
| 14 | 3.1 | 84 | Idempotency |
| 15–16 | 3.2 | 92 | Atomik ayarlar |
| 17 | 3.3 | 100 | Şema doğrulama |
| 18–19 | 2.4 | 111 | Webhook motoru |
| 20 | 5.2 | 116 | Webhook URL + i18n |
| 21 | 3.4 | 124 | Persist zinciri |
| 22 | 4.1b | 130 | Toplu yazma performansı |
| 23 | 4.2, 3.6 | 138 | Polling + ConsoleStore |
| 24–25 | 3.7 | 145 | Veri migrasyonu |
| 26 | 4.3 | 151 | Bellek/timer hijyeni |
| 26 | 5.1 | 154 | Limit tek kaynak |
| 27 | 6.1, 6.2 | 162 | Temizlik + preload |
| 28 | 6.3 | 165 | URL parse / headersSent |
| 29 | 7.1 | 170 | Observability |
| 30 | 7.2, 7.3 | 180 | Regresyon + checklist |
| **31–38** | **buffer** | 180 → 225 | **`v1.2.0` yayını** |

**Buffer kuralı:** Buffer tek bir havuz değil, **iki ayrı rezerv**: `v1.1.1` için 11 h (gün 8–9), `v1.2.0` için 34 h (gün 31–38). Böylece kritik sürüm, sonraki 30 bulgunun gecikmesinden etkilenmez.

**Dosya kilitleri (paralel çalışmada uyulacak):**
- `app.js`: `1.2 → 1.4 → 4.2 → 5.2 → 6.1 → 6.2` (seri, 6 WP)
- `main.js`: `1.1 → 1.3 → 2.1 → 3.2 → 3.3 → 6.1` (seri, 6 WP)
- `StorageService.js`: `3.5 → 4.1a → 3.4 → 4.1b` (seri, 4 WP)

### 7.2 Aşamalı sürüm kapıları

| Kapı | Koşul | Kapı geçilmezse |
|---|---|---|
| `v1.1.1` | F0+F1 tamam; `npm test` yeşil; T03–T22 yeşil; T92 (taze paket) geçiyor; `npm run verify:pack` + `PP_PACKAGED_EXE` ile `packaged.spec.js` geçiyor | Yayın yok; F1 eksik WP listelenir |
| `v1.2.0` | F2–F7 tamam; T86–T88 exit 0; **`npm run coverage` yeşil (B2 kapandı)**; T89–T91 manuel kanıtlanmış | Yayın yok; kapsam borcu `CHANGELOG`'a yazılır, sürüm ertelenir |

**Tazelik kuralı (B5 dersi):** `verify:pack` eski bir artefaktı da doğrular. Bu yüzden paket kapısı iki koşulu birlikte arar: (1) `app.asar` zaman damgası, değişen en yeni kaynak dosyadan **sonra**, (2) `verify:pack` OK. Tek başına (2) yeterli değildir.

### 7.3 Performans ve dayanıklılık eşikleri

| Metrik | Eşik | Ölçüm yöntemi | Test |
|---|---|---|---|
| 500 görev toplu güncelleme | p95 ≤ 150 ms | `performance.now()` × 20 tur | T65 |
| `getActiveState()` açılış | 1 çağrı, ≤50 ms | spy + süre | T20 |
| `loadTasks` eşzamanlılık | ≤1 uçuşta | spy | T67 |
| Webhook eşzamanlı | ≤4 | sayaç gözlemi | T37 |
| Kapanış süresi | ≤5 s | kronometre | T32 |
| Boşta RSS (10 dk) | artış ≤10 MB | `process.memoryUsage()` | manuel |
| Kapsam | ≥80 / 65 / 70 / 80 | `coverage-summary.json` | T87, T88 |

---

## 8. Global "Bitti" Tanımı

Bir WP ancak **dokuzunun tamamında** kapanır:

1. Kod commit'lendi: `fix(wp-x.y): <AUDIT-ID> ...`.
2. WP'nin testleri yazıldı ve yeşil; test adı WP ID'sini içeriyor.
3. `npm test` tamamı yeşil (66+ dosya, 0 fail).
4. **WP'nin dokunduğu dosyalar §0.2 hedefini geçiyor** veya baseline'ın altına düşmüyor (T88).
5. Audit ID'si commit mesajında **ve** `CHANGELOG.md`'de referanslı.
6. Davranış değişikliği varsa `docs/` altında tek paragraflık not.
7. §5'teki `R` işaretli risklerden WP'ye ait olanlar **kapatıldı** (fallback'e düşmek yetmez).
8. İnceleme: normal WP'de 1, güvenlik WP'lerinde (`1.1`, `1.3`, `3.1`, `3.7`) 2 göz.
9. Geri alma yolu yazılı: `git revert <sha>` tek başına yeterli **veya** WP kendi feature flag'ini belgeliyor.

---

## 9. Kaynaklar

| Kaynak | Kullanıldığı karar |
|---|---|
| [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) | D4, D5, D6 |
| [Node.js Errors — `'error'` event](https://nodejs.org/api/errors.html) | D2 |
| [expressjs/express#2856](https://github.com/expressjs/express/issues/2856) | D2, D3 |
| [vercel/async-listen#13](https://github.com/vercel/async-listen/pull/13) | D3 |
| [Electron `ipc-main.md`](https://github.com/electron/electron/blob/main/docs/api/ipc-main.md) | D1 |
| [electron/electron#24427](https://github.com/electron/electron/issues/24427) | D1 |
| [Electron `app.md` — before-quit](https://github.com/electron/electron/blob/main/docs/api/app.md) | D9 |
| [electron/electron#9433](https://github.com/electron/electron/issues/9433) | D9 |
| [Electron `ipc-renderer.md`](https://github.com/electron/electron/blob/main/docs/api/ipc-renderer.md) | D10 |
| [better-sqlite3 performance.md](https://github.com/WiseLibs/better-sqlite3/blob/HEAD/docs/performance.md) | D7, D8 |
| [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | D12 |
| [Svix — Webhook reliability](https://www.svix.com/resources/guides/webhook-reliability/) | D11 |
| [Hookdeck — Outbound retry best practices](https://hookdeck.com/docs/outpost/guides/outbound-webhook-retry-best-practices) | D11 |
| **Depo kodu (web değil)** | |
| `vitest.config.js:33-40` | D20 (kapsam kapsamı ve eşikleri) |
| `main.js:87`, `:1067-1078`, `:1185-1221` | D16 (TOCTOU penceresi), WP-1.1/1.3 |
| `src/main/security/Acl.js` | D15 (SID tabanlı ACL mevcut) |
| `src/main/storage/MigrateV2.js` | D18 (kanıtlanmış migrasyon deseni) |
| `src/main/logger.js` | D19 (testte no-op) |
| `src/renderer/app.js` (3.207 satır, modül değil) | D17 (shim zorunluluğu) |

---

## 10. Karar Günlüğü

Plan yürütülürken verilen kararlar buraya yazılır; sözlü karar geçerli değildir.

| Tarih | Karar | Gerekçe | Etki |
|---|---|---|---|
| 26.10.2026 | C-01/C-02 minimum paketi plan onayından **önce** uygulandı (F1–F3) | İki `await` eksikliği PIN korumalı iptali tamamen devre dışı bırakıyor; plan 38 gün, hasar ise her kapanmada oluşuyor | `v1.1.1` kapsamından C-01/C-02 testleri düştü (9 test hazır); WP-1.1 kalanı (C-04 + TOCTOU genişletmesi) duruyor |
| 26.10.2026 | Paket kapısı düzeltildi (F4–F5, D26) | `npm run pack` sessizce hiç derleme yapmıyordu; release doğrulaması stale artefakt üzerindeydi | B5/B6 yeşil; `WP-0.1`'in paket adımı kapandı |
| 26.10.2026 | Kapsam eşiği **düşürülmedi**; B2 kırmızı kabul edildi ve `v1.2.0` kapısına bağlandı (D20) | Eşiği %78'e çekmek kapıyı yeşile boyar, körlüğü kalıcılaştırır | `WP-7.2` kapsamında kapanacak; `v1.1.1` bu kapıyı beklemez |
| 26.10.2026 | Test kararlılığı borcu kaydedildi (T-SEC-03 timeout düzeltildi; p95/lag testleri yük altında dalgalanıyor) | Yerelde yanlış kırmızı, gerçek regresyonu gürültüden ayırmayı zorlaştırıyor | `WP-7.3`'e "test izolasyonu" maddesi eklenecek |

---

*Plan v2 sonu. 28 iş parçası · 197 atomik görev · 92 test senaryosu · 180 h P50 + 45 h P50→P90 payı = 225 h taahhüt · 38 iş günü · 2 aşamalı sürüm (`1.1.1` gün 9, `1.2.0` gün 38).*
