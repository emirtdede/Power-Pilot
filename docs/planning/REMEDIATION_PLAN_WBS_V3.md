# Power Pilot — Remediation Plan v3 (WBS + Risk + Test)

> **Kaynak denetim:** `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` — 36 bulgu (4 Kritik, 11 Yüksek, 13 Orta, 8 Düşük), karar: **RED / yayına hazır değil**.
> **Plan tarihi:** 26 Ekim 2026
> **Sürüm hedefi:** `1.1.1` sınırlı güvenlik yaması → `1.2.0-beta.1` → `1.2.0-rc.x` → `1.2.0` genel yayın
> **Plan durumu:** Yalnızca plandır. Bu doküman hazırlanırken uygulama kaynak dosyaları değiştirilmedi.
> **Önceki plan:** `docs/planning/archive/REMEDIATION_PLAN_WBS.md` (34 bulguluk eski denetim) korunur; bu doküman onun yerine geçer, onu güncellemez.

---

## 0. Yönetici Özeti

### 0.1 Planın cevabı

Bu plan, `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` içindeki **36 bulgunun tamamını** kapatmak için 28 atomik iş paketi (`WP-00`-`WP-27`) ve **6 kapı** tanımlar: `G0` baseline/testability kapısı, `G1`-`G5` ise yayın kapılarıdır.

| Ölçüt | Plan sonucu |
|---|---|
| Kapsanan bulgu | **36 / 36** |
| Kritik | **4 / 4** — WP-01, WP-02, WP-03, WP-04 |
| Yüksek | **11 / 11** — WP-05, WP-06, WP-07, WP-08, WP-10, WP-14, WP-15, WP-16, WP-17, WP-18, WP-22 |
| Orta | **13 / 13** — WP-04, WP-08, WP-09, WP-11, WP-12, WP-13, WP-14, WP-19, WP-20, WP-21 |
| Düşük | **8 / 8** — WP-03, WP-05, WP-13, WP-23, WP-24, WP-25, WP-26, WP-27 |
| Yeni test kanıtı | Her bulgu için en az bir otomatik regresyon testi; Y-09/Y-10/O-09 için hata enjeksiyonu; kritik UI yolları için E2E |
| Genel yayın koşulu | `G5` + bağımsız yeniden denetimde 36/36 kapalı; istisna yok |

### 0.2 Yayın stratejisi

| Sürüm | Kapsam | Yayın statüsü |
|---|---|---|
| **1.1.1** | `P0` + `P1` (WP-00-WP-13) | Yalnızca sınırlı güvenlik yaması. Genel özellik duyurusu değildir. `P2`/`P3` Yüksek bulguları (Y-03, Y-04, Y-08, Y-09, Y-10, Y-11) açıkken geniş dağıtım için ayrı risk kabul kaydı gerekir; aksi halde 1.1.1 de yayınlanmaz. |
| **1.2.0-beta.1** | `P2` (WP-14-WP-21) | `G3` sonrası beta. P3/P4 bulguları açıktır; dış kullanıcıya genel duyuru yapılmaz. |
| **1.2.0-rc.1** | `P3` (WP-22-WP-23) | `G4` sonrası RC. P4 Düşük bulguları açık olabilir; her biri release notunda listelenir. Genel yayın değildir. |
| **1.2.0** | `P4` (WP-24-WP-27) + 36/36 kapanış | Genel yayın. Yalnızca `G5` ve bağımsız yeniden denetim geçtikten sonra yayınlanır. |

**Kural:** 1.2.0 genel yayını, 36 bulgunun tamamı kapalı olmadan yapılmaz. `1.2.0-rc.1`, P4 Düşük bulguları açıkken üretilebilir; ancak bunlar release notunda listelenir ve genel yayın kapısı `G5`'tir. Kısmi kapanış, "düşük riskli" istisna veya testi ertelenmiş madde genel yayın kapısını geçmez.

**RC hattı:** `1.2.0-rc.1` yalnızca G4/P3 kapanış adayıdır. P4 düzeltmeleri (WP-24–WP-27) RC.1'e dahil olmadığı için G5 bağımsız denetimi, P4 dahil `1.2.0-rc.2` adayı üzerinde yapılır. RC.2 yeni bir yayın aşaması değildir; aynı RC hattının dondurulmuş denetim adayıdır. Denetim düzeltme gerektirirse `1.2.0-rc.3` üretilir.

### 0.3 Planlama ilkeleri

1. **Önce kanıt, sonra düzeltme:** Her düzeltme WP'si, mevcut davranışı gösteren kırmızı bir testle başlar; düzeltme sonrası aynı test yeşile döner. WP-00 yalnızca bu kanıt altyapısını kurar.
2. **Fail-closed:** Yıkıcı güç eylemlerinde ayar, politika, denetim veya kimlik okunamıyorsa eylem reddedilir.
3. **Tek doğruluk kaynağı:** Güvenlik ve kalıcı ayarlar SQLite’tadır; renderer localStorage’ı güvenlik kararı vermez.
4. **Sunucu sahipliği:** `id`, `status`, `enabled`, `source`, `mode`, `policyId` gibi alanları istemci yazamaz.
5. **Kimlik ve yetki ayrı:** PIN, API anahtarı ve ajan kimliği birbirinin yerine geçmez; her giriş noktası aynı kapıdan geçer.
6. **Atomiklik:** Ayar + denetim kaydı aynı transaction’da yazılır; yedek/geri yükleme ve migrasyon “doğrula → değiştir → doğrula → geri al” akışı kullanır.
7. **Ölçülebilir kapanış:** “Çalışıyor” değil; test kimliği, komut çıktısı ve kabul eşiği vardır.

---

## 1. Ölçülmüş Baseline ve Plan Üzerindeki Etkisi

Bu planın başlangıç noktası, `tests/BASELINE.md` içindeki gerçek komut çıktılarıdır. Denetim sırasında uygulama çalıştırılmadı; aşağıdaki baseline denetimden ayrı olarak ölçülmüştür. Bu nedenle “mevcut testler yeşil” ifadesi, denetim bulgularının doğrulanmış olduğu anlamına gelmez.

| # | Ölçüm | Komut | Sonuç | Durum | Plan etkisi |
|---|---|---|---|---|---|
| B1 | Birim/entegrasyon testi | `npm test -- --reporter=dot` | 67 dosya / **649 test** / 0 başarısız / 21,99 s | YEŞİL | Mevcut 649 test korunur; yeni regresyon testleri eklenir. |
| B2 | Kapsam kapısı | `npm run coverage` | Satır **%78,41** (eşik 80), dal **%64,84** (65), fonksiyon **%72,71** (70), ifade **%78,41** (80) | **KIRMIZI** | WP-00 kırmızıyı gizlemez; kritik modül testleriyle 80’in üzerine çıkarır. |
| B3 | Kapsam yapılandırması | `vitest.config.js:33` | `include: ['src/main/**/*.js']` | EKSİK | `main.js`, `src/renderer/**`, `src/console/**`, `src/agent/**`, `src/cli/**` ölçüm dışında. WP-00 iki halkalı kapsam politikası tanımlar. |
| B4 | Kritik handler testi | Mevcut test envanteri | `warning-pin.test.mjs` yalnızca `warning-cancel`/`warning-snooze` sözleşmesini kontrol ediyor | EKSİK | `warning-confirm`, PIN değiştirme/silme ve tray yolları için test yok. WP-02, WP-01, WP-06 bunu kapatır. |
| B5 | Güvenlik taraması | `npm run test:security` | `[security-check] temiz (141 dosya tarandı)` | YEŞİL | Statik tarama davranışsal güvenlik açıklarını yakalamıyor; test kanıtı yerine geçmez. |
| B6 | E2E | `npm run test:e2e` | 11 geçti, 1 atlandı (`packaged.spec.js`), 1,7 dk | YEŞİL | Yeni PIN/uyarı/ayar senaryoları E2E matrisine eklenir. |
| B7 | Paketli E2E | `PP_PACKAGED_EXE=dist\win-unpacked\Power Pilot.exe` ile paketli test | Geçti | YEŞİL | `asar`/worker/`contextBridge` değişiklikleri paketli build’de ayrıca doğrulanır. |
| B8 | Paketleme | `npm run pack` | 21 s | YEŞİL | WP-22 worker dosyası ve WP-26 preload değişikliği sonrası tekrar ölçülür. |
| B9 | Denetim yöntemi | `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` | Statik inceleme; uygulama çalıştırılmadı, Windows OS davranışı ampirik doğrulanmadı | KISIT | Plan, statik kanıtı dinamik test ve Windows manuel matrisiyle tamamlar. |
| B10 | Çalışma ağacı | Denetim sırasında repo kirli | Değişmiş `main.js`, `app.js`, testler; untracked `warningActions.js`, denetim/plan dosyaları | RİSK | WP-00, temiz ve etiketlenebilir bir baseline commit’i veya onaylı koşullu baseline kaydı olmadan düzeltme başlatmaz. |

### 1.1 Baseline’ın plana etkisi

- **649 yeşil test güven vermiyor:** Denetimdeki K-01/K-02/K-03/K-04 davranışlarını kapsamıyor. WP-00, mevcut testlerin karakterizasyonunu alır; her P0 bulgusu için önce kırmızı test yazılır.
- **Kapsam kırmızı:** `%78,41` satır kapsamı, güvenlik modülleri eklendikçe daha da düşebilir. Bu nedenle “tüm dosyaları aynı eşiğe zorla” yaklaşımı yerine iki halkalı politika uygulanır:
  - **Kapı halkası:** `src/main/ipc/validate.js`, `pinGuard.js`, `WarningManager.js`, `TaskManager.js`, `SafetyPolicyEngine.js`, `StorageService.js`, `LocalApiService.js`, `ConsoleServer.js`, `Backup.js`, `MigrateV2.js`, `Database.js` — satır ≥ %85, dal ≥ %75, fonksiyon ≥ %85.
  - **Gözlem halkası:** `main.js`, `src/renderer/**`, `src/console/**`, `src/agent/**`, `src/cli/**` — ölçülür, raporlanır ve her sürümde düşüş yasaktır; 1.2.0’da kademeli ratchet uygulanır.
- **Statik denetim dinamik değildir:** Y-09/Y-10/O-09 gibi dosya sistemi ve SQLite davranışları hata enjeksiyonuyla; Y-03/Y-07 gibi yaşam döngüsü yolları Electron/E2E ile doğrulanır.
- **Kirli ağaç:** WP-00’ın ilk işi, kullanıcı değişikliklerini kaybetmeden baseline commit/tag veya onaylı koşullu baseline kaydı oluşturmaktır. Bu kayıt olmadan hiçbir düzeltme WP’si “tamamlandı” sayılmaz.

---

## 2. Kapsam, Kapsam Dışı ve Varsayımlar

### 2.1 Kapsam

- `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` içindeki 36 bulgunun tamamı.
- Bulguların kök nedenini kapatan uygulama değişiklikleri, şema/migrasyon değişiklikleri ve testler.
- PIN, uyarı, görev doğrulama, otonomi, sırlar, tray, Local API, konsol ajanı, metrikler, yedek/geri yükleme, migrasyon, audit, DB kilidi, performans, i18n, preload ve polling düzeltmeleri.
- Windows 10/11 manuel doğrulama matrisi; paketli uygulama doğrulaması; yeniden denetim protokolü.
- Dokümantasyon: değişiklik günlüğü, sürüm notu, kullanıcı/admin geçiş notları, kanıt matrisi.

### 2.2 Kapsam dışı

- Yeni ürün özellikleri (bulut senkronizasyonu, uzaktan onay akışı, yeni güç eylemi, yeni UI tasarımı).
- `forceCloseApps` ve `remoteApprovalRequired` bayraklarını **uygulamak**. Bu iki alan kaldırılır; kullanıcıya “çalışıyor” izlenimi veren ölü sözleşme korunmaz.
- 24 saatlik PIN kurtarma kapısı veya arka kapı. PIN unutma, yerel yönetici tarafından profil sıfırlama/veri kurtarma prosedürüne bırakılır; güvenlik kapısı zayıflatılmaz.
- Windows OS’nin güç davranışlarının (S3/S4, UPS, pil, oturum kilidi) kodla tam simülasyonu. Bunlar manuel matris ve gerçek donanım/VM doğrulamasıyla kapatılır.
- Mevcut tüm sabit metinlerin 17 dile çevrilmesi. Yalnızca D-03 kapsamındaki mini pencere tooltip/erişilebilirlik metinleri ve bulguda geçen hata yolları çevrilir.
- Paketleme sertifikası, kod imzalama anahtarı temini ve mağaza yayını prosedürü. Bunlar `G5` için doğrulanır, fakat planın kod iş paketi değildir.
- Kapsam dışı bırakılan yapılandırma dosyalarının (electron-builder, CI sağlayıcı ayarları) yeniden tasarımı. Gerekli minimum değişiklikler WP-00 ve WP-22 içinde belirtilir.

### 2.3 Varsayımlar ve sınırlar

1. Denetimdeki satır numaraları, denetim anındaki kirli çalışma ağacına aittir. Her WP başında ilgili sembol/route yeniden doğrulanır; satır numarası kör kopyalanmaz.
2. Baseline ortamı: Windows 11 Pro, Node `v24.22.1`, npm `11.19.1`, Electron `43.4.0`, sürüm `1.1.0`.
3. SQLite için `better-sqlite3` senkron API’si kullanılır; ana iş parçacığında uzun süren dosya taraması yasaktır.
4. Renderer güvenilmez kabul edilir: XSS/compromise durumunda dahi sırları okuyamaz, güvenlik alanlarını yazamaz, yıkıcı görev oluşturamaz.
5. Yerel kullanıcı işletim sistemi düzeyinde dosyalara erişebilir; plan, uygulama içi yetki sınırlarını ve denetim izini güçlendirir, OS yöneticisine karşı mutlak koruma iddia etmez.
6. Başarılı kapanış, testlerin bir kez yeşil olması değil; `G5` sonrası bağımsız yeniden denetimde 36/36 kanıtın tekrar üretilmesidir.

### 2.4 Doküman kuralları

- `P0`–`P4`: öncelik/gate sırası. `P0` yayın blocker’ları, `P1` güvenlik sertleştirmesi, `P2` veri bütünlüğü/yaşam döngüsü, `P3` performans, `P4` düşük/temizlik.
- `WP-xx`: iş paketi. `Txx-yy`: test senaryosu. `Gx`: yayın kapısı.
- Her WP’de **Bağımlılık**, **Dosyalar**, **Uygulama adımları**, **Çıktı**, **Riskler**, **Testler**, **Geri alma**, **DoD** zorunludur.
- Risk tablolarında etki/olasılık `Yüksek`, `Orta`, `Düşük` olarak verilir. “İzlenecek” gibi ölçüsüz ifade kullanılmaz; her riskin azaltma ve fallback maddesi vardır.

---

## 3. Doğrulanmış Teknik Kararlar

Aşağıdaki kararlar, denetim kanıtı ve birincil kaynaklarla gerekçelendirilmiştir. Kaynak kodları `R1`–`R16` olarak verilmiştir; tam URL listesi §12’dedir.

| # | Alan | Karar | Gerekçe / kaynak |
|---|---|---|---|
| D1 | IPC ve renderer sınırı | Tüm mevcut `ipcHandle` sarmalayıcıları korunur; yeni handler’lar da `SenderGuard`/origin doğrulamasından geçer. Renderer’a yalnızca dar, tipli preload yüzeyi açılır. | Electron güvenlik rehberi: IPC göndereni doğrula, dar preload kullan (`R1`). |
| D2 | PIN değiştirme/silme | PIN kuruluysa `set-cancel-pin` mevcut PIN’i, `clear-cancel-pin` her zaman mevcut PIN’i ister. İlk PIN belirleme mevcut PIN olmadan yapılabilir. Her mutasyon ayrı `PinGuard` scope’u, Argon2id ve audit kaydı üretir. | ASVS V7 oturum/kimlik doğrulama; OWASP Authentication; NIST throttling (`R2`, `R3`, `R4`). |
| D3 | PIN deneme sınırı | 5 hatalı denemede kısa süreli kilit; kilit süresi ve kalan deneme sayısı yanıtta döner. Kilit, PIN’i sıfırlama yolu değildir. | NIST SP 800-63B throttling; OWASP Authentication (`R3`, `R4`). |
| D4 | Uyarı onayı | Her uyarıya süreç ömrü boyunca monoton artan `epoch` verilir; restart'ta 1'den başlar. `warning-confirm` `{taskId, epoch}` taşır; handler `await` öncesi aktif kimliği yakalar ve sonra yeniden doğrular. Eşleşmeyen tıklama `WARNING_CHANGED` alır; renderer banner’ı yalnızca `success:true` üzerine gizler. Restart sonrası renderer `get-active-state` ile yeniden kurulur; eski DOM tıklaması taşınmaz. | TOCTOU: kontrol ile kullanım arasında durum değişebilir (`R5`). |
| D5 | Görev şeması | `action` zorunludur. İstemci alanları beyaz listeye alınır; `id/status/enabled/source/mode/policyId/consoleOrderId/requiresMaintenanceWindow/createdAt` sunucu sahiplidir. `warningConfig`, `safetyPolicy`, `snoozeConfig`, `recurrence`, `chain` iç içe şemayla doğrulanır. | OWASP Input Validation; ASVS input validation (`R6`, `R2`). |
| D6 | Uyarının kapatılması | İstemci `warningConfig.enabled:false` gönderemez; uyarıyı kapatma yetkisi yalnızca sunucu politikasındadır. `silentMode` kaldırılır. | Denetim K-03/D-05; güvenlik varsayılanı istemciye bırakılmaz (`R6`). |
| D7 | Otonomi modu | `autonomyMode` yalnızca SQLite’tadır ve yalnızca PIN’li `security-settings-update` ile değişir. Tray doğrudan yazmaz; ana pencereyi PIN akışına yönlendirir. `TaskManager.createTask` modu ayardan damgalar; istemci `mode` gönderemez. | Tek doğruluk kaynağı + sunucu sahipliği; denetim K-04/O-12. |
| D8 | localStorage | Güvenlik ve kalıcı ayarlar için kullanılmaz. Yalnızca tema gibi UI tercihleri kalabilir. Eski `autonomyMode=full` değeri otomatik olarak SQLite’a terfi ettirilmez; kullanıcı PIN’le yeniden etkinleştirir. | O-12; yetki yükseltmesini sessiz migration ile engelleme. |
| D9 | Sırlar | `get-settings`, `save-settings` ve `security-settings-update` yanıtları **public settings** projeksiyonu kullanır. Sır alanları, hash/salt ve webhook sırları çıkarılır; yerine `has*` boolean’ları verilir. `getSettings()` derin kopya döndürür. | Y-01/D-06; en az yetki ve savunmacı kopya (`R1`, `R2`). |
| D10 | Tray eylemleri | PIN kuruluysa tray “Duraklat” ve aktif görev varken “Çıkış” ana pencerede PIN akışına yönlenir. `isQuitting` yalnızca doğrulama sonrası `true` olur. Aktif görev yoksa çıkış PIN istemez. | Y-02; alternatif giriş noktaları aynı yetki kapısını kullanır (`R2`). |
| D11 | Fail-closed politika | Yıkıcı eylemlerde `getSettings`, muafiyet, bakım penceresi, sunucu profili, süreç listesi, tam ekran veya metrik okuma hatası `deny` üretir. Yalnızca tanılama/telemetri yolları fail-open kalabilir. | Y-05; güvenlik kararı hatada açık kalamaz (`R2`, `R7`). |
| D12 | Kullanıcı etkinliği | `checkUserActivity` yalnızca UI dışı kaynaklı (local_api/n8n/console) görevlerde uygulanır. `powerMonitor.getSystemIdleTime()` veya metricCollector idle ölçümü kullanılır; ölçüm yoksa `deny`. UI görevleri kullanıcının kendi eylemi olduğu için bu kontrolle bloke edilmez. | Y-05; Electron powerMonitor (`R15`). |
| D13 | API rolü | Eksik/geçersiz `localApiKeyRole` **admin’e düşmez**; istek `403 ROLE_REQUIRED` alır. `generateApiKey` rolü açıkça ister; servis geçersiz/eksik rolde `INVALID_ROLE` fırlatır; IPC bunu `{success:false, code:'INVALID_ROLE'}`, HTTP admin anahtar ucu varsa `400` olarak döner. Rolü olmayan eski anahtar, yönetici yeni anahtar üretene kadar kullanılamaz. | Y-06; yetkilendirmede fail-closed (`R2`). |
| D14 | URL/Host | `req.url` mutlak URL ise parse edilmeden `400 ABSOLUTE_URL_NOT_ALLOWED` ile reddedilir; göreli URL sabit `http://127.0.0.1` tabanıyla parse edilir. `Host` başlığı ayrıca beklenen host/port allowlist’ine karşı doğrulanır. Parse veya Host hatası `400/421` döner; süreç çökmez. | O-05; OWASP Input Validation (`R6`). |
| D15 | Audit erişimi | Local API `/audit` yalnızca admin; `limit/offset/since` ile sayfalı. `verify` ayrı hafif uçtan sunulur. Viewer tam log okuyamaz. Console tarafında `audit.read` ayrıcalığı admin ile sınırlanır. | O-06; OWASP Logging: hassas denetim verisi en az yetki (`R7`). |
| D16 | Idempotency | Kayıt anahtarı `Idempotency-Key`’dir; fingerprint `method + path + query + ham gövde SHA-256`’sından üretilir. Aynı anahtar/farklı fingerprint `422`; aynı fingerprint uçuştaysa `409`; yalnızca 2xx yanıtı replay edilir. | IETF Idempotency-Key taslağı: 409 in-flight, 422 key reuse (`R8`). |
| D17 | Ayar + audit atomikliği | Güvenlik ayarı ve audit kaydı aynı SQLite `BEGIN IMMEDIATE` transaction’ında yazılır. Audit yazılamazsa ayar geri alınır ve işlem başarısız döner. API restart gibi yan etkiler transaction sonrasıdır; başarısızsa telafi edici rollback + audit yazılır. | O-13; SQLite atomik commit (`R11`), OWASP Logging (`R7`). |
| D18 | Metrik tazeliği | Her sampler kendi `stale/at/error` durumunu taşır. `network_speed`, `disk_activity`, `cpu_threshold`, `user_idle` koşulları yalnızca ilgili metrik taze ve başarılıysa değerlendirilir. Bilinmeyen durum `satisfied:false`’dır. | Y-08; yanlış idle ile yıkıcı eylemi engelleme. |
| D19 | Yedek geri yükleme | Kopyala → doğrula → karantinaya al → yer değiştir → yeniden doğrula. Herhangi bir adım başarısızsa karantinadaki canlı DB geri taşınır; WAL/SHM dosyaları korunur. | Y-09; SQLite WAL/backup/atomic commit (`R9`, `R10`, `R11`). |
| D20 | Migrasyon | Hedef DB varsa `quick_check`, tablo sayıları ve içerik checksum’ı doğrulanır. Eşleşmezse kaynak JSON korunur, `.migrated` yazılmaz. Marker atomik temp+rename ile yazılır; kaynak ancak doğrulama sonrası silinir. | Y-10; SQLite `quick_check` (`R12`), backup (`R10`). |
| D21 | Audit deposu | Tek SQLite + HMAC yolu; legacy JSON yalnızca migrasyon/okuma adaptörü. Append yalnızca yeni kaydı belleğe ekler; pagination ve retention vardır. Retention, arşiv dosyası ve HMAC’li rotation anchor’ı olmadan satır silmez. `rotatedFrom` v2 hash’e dahildir; v1 kayıtlar okunabilir. | O-08/O-10/D-08; OWASP Logging (`R7`), SQLite transaction (`R11`). |
| D22 | DB kilidi | Kilit `fs.openSync(path, 'wx', 0o600)` ile atomik alınır; stale kilit yalnızca PID’nin ölü olduğu kanıtlanınca tombstone’a taşınır. `EPERM` canlı süreç sayılır; şüphede fail-closed. | O-09; Node `fs.open` `wx` atomik oluşturma (`R16`). |
| D23 | Ağır FS taraması | Dizin taraması worker thread’de ve timeout’lu yapılır; scheduler tick’i beklemez. Görev/koşul başına throttle, in-flight ve cache koruması vardır; `evaluateTask()` senkron kalır ve yalnız taze cache/worker sonucunu okur; eski sonuç tetikleme üretmez. | Y-11; Node worker threads ve event loop rehberi (`R13`, `R14`). |
| D24 | UI geri yükleme | Tek restore yolu: `startTimerTo(targetTime, total)`. Tanımsız `startTimer` kaldırılır; `switchView` hata olsa da çalışır; hata loglanır. | O-01; yarım kalmış restore çift interval üretmez. |
| D25 | i18n fallback | Locale yüklenemezse gün etiketi `d` fallback’ine düşer; `substring` yalnızca string üzerinde çağrılır. Mini pencere `data-i18n-title` ve `aria-label` kullanır. | D-01/D-03; çökme yerine güvenli görünüm. |
| D26 | Preload listener | `onWarningEnded` üç kanalı da dinler ve bir unsubscribe fonksiyonu döndürür; unsubscribe üç `removeListener` çağırır. | D-04; listener sızıntısını önleme (`R1`). |
| D27 | Polling | Görev listesi polling’i in-flight guard, görünürlük kontrolü ve sonuç hash’i ile sınırlanır; gizli görünümde durur. | D-07; gereksiz IPC/DOM churn’ü azaltma. |
| D28 | Model boyutu | İlerleme toplamı `ai-status.model.expectedBytes`/`bytes` metadata’sından alınır; bilinmiyorsa belirsiz ilerleme gösterilir. Hardcoded `1374389534` kaldırılır. | D-02; `ModelManager.status()` zaten `expectedBytes` döndürüyor. |
| D29 | Koşul örnek kapsamı | SmartFinish dosya/klasör örnekleri `taskId + koşul kimliği` (id, path veya index) ile anahtarlanır; görev terminal olduğunda `clearTask(taskId)` örnekleri siler. Aynı görevdeki iki koşul birbirinin örneğini sıfırlamaz. | O-03; koşul başına bağımsız örnek durumu ve bellek temizliği. |

---

## 4. Aşama ve Kapı Genel Görünümü

### 4.1 Kapılar

| Kapı | Kapsam | İş paketleri | Çıkış koşulu |
|---|---|---|---|
| **G0** | Baseline ve testability | WP-00 | Temiz baseline commit veya onaylı koşullu baseline kaydı; ölçüm dokümanı; iki halkalı kapsam; fault-injection ve handler harness; P0 için kırmızı test iskeleti; 36 satırlık traceability dosyası |
| **G1** | P0 — Kritik | WP-01–WP-04 | K-01/K-02/K-03/K-04, D-05 ve O-12 kapalı; dört kritik ve iki düşük/orta bulgu için testler yeşil; 1.1.1 için kritik güvenlik ön koşulu |
| **G2** | P1 — Güvenlik | WP-05–WP-13 | Y-01, Y-02, Y-05, Y-06, Y-07 ve O-02/O-04/O-05/O-06/O-08/O-10/O-11/O-13/D-06/D-08 kapalı; 1.1.1 sınırlı yayın kararı |
| **G3** | P2 — Veri ve yaşam döngüsü | WP-14–WP-21 | Y-03, Y-04, Y-08, Y-09, Y-10 ve O-01/O-03/O-07/O-09 kapanışı; 1.2.0 beta |
| **G4** | P3 — Performans | WP-22–WP-23 | Y-11 ve D-07 kapanışı; event-loop bütçesi ve polling testleri |
| **G5** | P4 — Temizlik + yeniden denetim | WP-24–WP-27 + tüm kapanış | D-01/D-02/D-03/D-04 kapanışı; 36/36 kanıt; bağımsız yeniden denetim; 1.2.0 yayın kararı |

### 4.2 Bağımlılık grafiği

```text
WP-00
 ├─ WP-01 ── WP-06
 │    └──── WP-11 ── WP-13
 ├─ WP-02 ─┐
 ├─ WP-03 ─┴─ WP-12
 │    ├─ WP-04
 │    └─ WP-07
 ├─ WP-05 ── WP-11
 ├─ WP-08 ── WP-09
 │    └──── WP-11
 ├─ WP-10
 ├─ WP-14 ── WP-15 ── WP-19 ── WP-22
 ├─ WP-16
 ├─ WP-17
 ├─ WP-18
 ├─ WP-20
 ├─ WP-21
 ├─ WP-23
 ├─ WP-24 ── WP-25
 ├─ WP-26
 └─ WP-27
```

**Kesişen bağlar:** WP-06, WP-01 + WP-04’e; WP-11, WP-01 + WP-05 + WP-08’e; WP-12, WP-02 + WP-03’e; WP-22, WP-15 + WP-19’a bağlıdır. Grafikte tekrarlanmayan bu bağlar, WP başlıklarındaki bağımlılık satırlarında ve §6 dizininde kesindir.

**Kritik kol 1 (güvenlik yaması):** WP-00 → WP-01 → WP-11 → WP-13; WP-11 ayrıca WP-05 ve WP-08’i bekler. **Kritik kol 2 (veri/perf):** WP-00 → WP-14 → WP-15 → WP-19 → WP-22. Bu iki kol ve `WP-23` tamamlanmadan `1.2.0-rc.1` üretilmez.

**Paralellik kuralı:** Aynı dosyaya dokunan WP’ler sıralıdır: WP-03→WP-04, WP-03→WP-07, WP-03→WP-12, WP-01/WP-04→WP-06, WP-08→WP-09, WP-08→WP-11→WP-13, WP-14→WP-15→WP-19→WP-22. `WP-11`, `LocalApiService.generateApiKey` ve audit atomikliği nedeniyle WP-08’i bekler. Diğerleri farklı geliştiricilerde paralel yürüyebilir; ancak her gate tamamlanmadan sonraki gate’in yayın kararı verilmez.

### 4.3 Yayın eşlemesi

| Sürüm | Zorunlu gate | Yayın notu |
|---|---|---|
| `1.1.1` | G2 | Sınırlı güvenlik yaması; P2/P3 Yüksek bulguları (Y-03, Y-04, Y-08, Y-09, Y-10, Y-11) için ayrı risk kabul kaydı yoksa 1.1.1 yayınlanmaz. Kayıt varsa yalnız sınırlı kanalda dağıtılır. |
| `1.2.0-beta.1` | G3 | Veri bütünlüğü ve yaşam döngüsü beta; dış kullanıcıya genel duyuru yok. |
| `1.2.0-rc.1` | G4 | Performans ve polling kapanışı; imza/paket doğrulaması. P4 Düşük bulguları açık olabilir; genel yayın değildir. |
| `1.2.0` | G5 + bağımsız denetim | 36/36 kapalı; genel yayın. |

**RC.2 kuralı:** G4 sonrası `1.2.0-rc.1` dondurulur. P4 düzeltmeleri tamamlanınca, bağımsız denetim için P4 dahil `1.2.0-rc.2` adayı üretilir ve dondurulur; genel `1.2.0` ancak bu aday denetimden geçtikten sonra yayınlanır.

---

## 5. Bulgu → İş Paketi → Test İzlenebilirliği

Bu matris, denetimdeki **36 bulgunun tamamını tam olarak bir kez** eşler. Satır sayısı 36’dır: 4 Kritik, 11 Yüksek, 13 Orta, 8 Düşük.

| Bulgu | Önem | Kısa başlık | İş paketi | Kanıt testleri | Kapı |
|---|---|---|---|---|---|
| K-01 | Kritik | PIN değiştirme/silme mevcut PIN istemiyor | WP-01 | T01-01…T01-08 | G1 |
| K-02 | Kritik | `warning-confirm` TOCTOU / banner'ı koşulsuz gizleme | WP-02 | T02-01…T02-07 | G1 |
| K-03 | Kritik | Görev doğrulaması eksik; sessiz shutdown/full mode | WP-03 | T03-01…T03-07 | G1 |
| K-04 | Kritik | Tray otonomi modu PIN’siz; mod uygulanmıyor | WP-04 | T04-01…T04-06 | G1 |
| Y-01 | Yüksek | `get-settings` çözülmüş sırları renderer’a veriyor | WP-05 | T05-01…T05-03, T05-05 | G2 |
| Y-02 | Yüksek | Tray duraklat/çıkış PIN korumalı iptali atlatıyor | WP-06 | T06-01…T06-06 | G2 |
| Y-03 | Yüksek | `getActiveTasks()` `executing` durumunu dışlıyor | WP-14 | T14-01…T14-03 | G3 |
| Y-04 | Yüksek | `_schedulerFired` sıfırlanmıyor | WP-15 | T15-01…T15-05 | G3 |
| Y-05 | Yüksek | `SafetyPolicyEngine` fail-open / kısmi politika | WP-07 | T07-01…T07-07 | G2 |
| Y-06 | Yüksek | Local API rolü eksik/geçersizse admin | WP-08 | T08-01, T08-02, T08-06 | G2 |
| Y-07 | Yüksek | Konsol global ajan anahtarı, kill-switch fail-open, pause | WP-10 | T10-01…T10-06 | G2 |
| Y-08 | Yüksek | Metrik hataları yutuluyor; sahte idle | WP-16 | T16-01…T16-05 | G3 |
| Y-09 | Yüksek | Backup restore’da rollback yok | WP-17 | T17-01…T17-06 | G3 |
| Y-10 | Yüksek | MigrateV2 hedef DB’yi doğrulamıyor | WP-18 | T18-01…T18-06 | G3 |
| Y-11 | Yüksek | 1 sn tick’te senkron FS taraması | WP-22 | T22-01…T22-06 | G4 |
| O-01 | Orta | `startTimer` tanımsız; restore hata yutuyor | WP-21 | T21-01…T21-05 | G3 |
| O-02 | Orta | `durationSeconds:0` → 30 saniye | WP-12 | T12-01…T12-05 | G2 |
| O-03 | Orta | SmartFinish örnekleri yalnızca `taskId` ile anahtarlı | WP-19 | T19-01…T19-05 | G3 |
| O-04 | Orta | Idempotency method/path/body kapsamıyor | WP-09 | T09-01…T09-06 | G2 |
| O-05 | Orta | Local API `new URL` Host header ile korumasız | WP-08 | T08-03, T08-04 | G2 |
| O-06 | Orta | `/api/v1/audit` tam log’u viewer’a veriyor | WP-08 | T08-05 | G2 |
| O-07 | Orta | `hasProcessConditions` terminal görevleri sayıyor | WP-14 | T14-04 | G3 |
| O-08 | Orta | Audit append tüm tabloyu okuyor; retention yok | WP-13 | T13-01…T13-03, T13-07 | G2 |
| O-09 | Orta | DB kilidi stale-lock TOCTOU | WP-20 | T20-01…T20-06 | G3 |
| O-10 | Orta | `rotatedFrom` hash dışında | WP-13 | T13-04, T13-05 | G2 |
| O-11 | Orta | PIN iptalinde enerji/dil değişiklikleri kalıyor | WP-11 | T11-04…T11-06 | G2 |
| O-12 | Orta | localStorage/SQLite iki kaynak; autonomy drift | WP-04 | T04-03…T04-05 | G1 |
| O-13 | Orta | Audit yazılamazsa güvenlik ayarı uygulanıyor | WP-11 | T11-01…T11-03, T11-07 | G2 |
| D-01 | Düşük | i18n sözlüğü yüklenemezse `substring` çöküyor | WP-24 | T24-01…T24-03 | G5 |
| D-02 | Düşük | Hardcoded 1.28 GB model hedefi | WP-27 | T27-01…T27-04 | G5 |
| D-03 | Düşük | Mini pencere Türkçe tooltip’leri | WP-25 | T25-01…T25-04 | G5 |
| D-04 | Düşük | `onWarningEnded` listener temizliği yok | WP-26 | T26-01…T26-03 | G5 |
| D-05 | Düşük | `silentMode` ölü alan | WP-03 | T03-02 | G1 |
| D-06 | Düşük | `getSettings()` mutable iç nesne | WP-05 | T05-04 | G2 |
| D-07 | Düşük | Görev listesi 5 sn polling, in-flight guard yok | WP-23 | T23-01…T23-05 | G4 |
| D-08 | Düşük | Legacy JSON ve SQLite audit yolları farklı | WP-13 | T13-05, T13-06 | G2 |

**Sayım kontrolü:** K=4, Y=11, O=13, D=8; toplam **36**. Aynı bulgu iki satırda yoktur; bir WP birden fazla bulgu taşıyabilir.

---

## 6. İş Paketi Dizini

| WP | Başlık | Bulgular | Bağımlılık | Kapı |
|---|---|---|---|---|
| WP-00 | Baseline, testability ve kanıt altyapısı | — | — | G0 |
| WP-01 | PIN değiştirme/silme mevcut PIN’e bağlanır | K-01 | WP-00 | G1 |
| WP-02 | Uyarı onayı `taskId+epoch` ile atomikleşir | K-02 | WP-00 | G1 |
| WP-03 | Görev şeması beyaz liste + güvenli varsayılanlar | K-03, D-05 | WP-00 | G1 |
| WP-04 | Otonomi modu tek kaynak + tray PIN akışı | K-04, O-12 | WP-03 | G1 |
| WP-05 | Public settings + savunmacı `getSettings()` | Y-01, D-06 | WP-00 | G2 |
| WP-06 | Tray pause/quit PIN kapısı | Y-02 | WP-01, WP-04 | G2 |
| WP-07 | SafetyPolicyEngine fail-closed + kullanıcı etkinliği | Y-05 | WP-03 | G2 |
| WP-08 | API rolü, URL/Host ve audit erişimi | Y-06, O-05, O-06 | WP-00 | G2 |
| WP-09 | Idempotency fingerprint ve durum makinesi | O-04 | WP-08 | G2 |
| WP-10 | Konsol ajan kimliği ve kill-switch | Y-07 | WP-00 | G2 |
| WP-11 | Atomik ayar+audit ve PIN iptal sırası | O-13, O-11 | WP-01, WP-05, WP-08 | G2 |
| WP-12 | Uyarı süresi 0 semantiği | O-02 | WP-02, WP-03 | G2 |
| WP-13 | Audit append/retention/rotation ve tek yol | O-08, O-10, D-08 | WP-11 | G2 |
| WP-14 | `executing` aktif görev + süreç polling | Y-03, O-07 | WP-00 | G3 |
| WP-15 | Claim-scoped auto-proceed | Y-04 | WP-14 | G3 |
| WP-16 | Metrik bazlı stale ve fail-closed koşullar | Y-08 | WP-00 | G3 |
| WP-17 | Backup restore rollback | Y-09 | WP-00 | G3 |
| WP-18 | Migrasyon hedef doğrulaması | Y-10 | WP-00 | G3 |
| WP-19 | SmartFinish örnek anahtarı ve temizliği | O-03 | WP-15 | G3 |
| WP-20 | Atomik DB kilidi | O-09 | WP-00 | G3 |
| WP-21 | Tek timer restore yolu | O-01 | WP-00 | G3 |
| WP-22 | Async/worker FS taraması | Y-11 | WP-15, WP-19 | G4 |
| WP-23 | Görev polling disiplini | D-07 | WP-00 | G4 |
| WP-24 | i18n gün fallback’i | D-01 | WP-00 | G5 |
| WP-25 | Mini pencere i18n tooltip/erişilebilirlik | D-03 | WP-24 | G5 |
| WP-26 | Preload unsubscribe | D-04 | WP-00 | G5 |
| WP-27 | Model boyutu metadata’sı | D-02 | WP-00 | G5 |

---

## 7. P0 — Yayın Blocker'ları (WP-00 – WP-04)

> **Gate kuralı:** `G1` kapanmadan hiçbir P0 iş paketi “tamamlandı” sayılmaz. `WP-00` tamamlanmadan diğer P0 paketleri başlamaz. `WP-01`, `WP-02` ve `WP-03` farklı dosyalarda paralel ilerleyebilir; `WP-04` yalnızca `WP-03` bittikten sonra başlar. G1 için dördü de merge edilmiş olmalıdır.

### 7.1 WP-00 — Baseline, testability ve kanıt altyapısı

| Alan | Değer |
|---|---|
| **Bulgular** | Doğrudan bulgu yok; B1–B10 baseline risklerini kapatır ve P0–P4 için ölçüm altyapısını kurar. |
| **Öncelik** | P0 / G0 |
| **Bağımlılık** | — |
| **Kapı** | G0 |
| **Dış ön koşullar** | Kullanıcı onayı (kirli çalışma ağacı), Node 24.22.1, `package-lock.json` |
| **Ana dosyalar** | `tests/BASELINE.md`, `tests/helpers/`, `tests/scripts/release-check.test.mjs`, `scripts/release-check.js`, `scripts/coverage-gate.mjs`, `scripts/verify-traceability.mjs`, `vitest.config.js`, `package.json`, `.nvmrc`, `.github/workflows/ci.yml`, `docs/audit/V3_EVIDENCE_MATRIX.md` |
| **Üretim kodu değişikliği** | **Yok.** WP-00 yalnızca test, ölçüm, CI ve kanıt altyapısıdır. |

**Amaç:** Remediation başlamadan önce kaybolmayan bir başlangıç noktası, yeniden üretilebilir test komutları, iki halkalı kapsam kapısı, hata enjeksiyonu yardımcıları ve 36 bulgunun kanıtını izleyen tek bir matris oluşturmak.

**Kabul ilkesi:** WP-00 sonunda “hangi commit'ten başladık, hangi komut ne sonuç verdi, hangi bulgu hangi testle kapanacak?” sorularının üçü de tek başına yanıtlanabilir olmalıdır.

#### 7.1.1 Uygulama adımları

1. **Çalışma ağacını dondur (kullanıcı değişikliklerini kaybetmeden).**
   - `git status --porcelain=v1` çıktısını `docs/audit/baseline-worktree-status.txt` dosyasına yaz.
   - `git diff --binary > docs/audit/baseline-worktree.patch` ve `git ls-files --others --exclude-standard > docs/audit/baseline-untracked.txt` üret.
   - Patch'in uygulanabilirliğini geçici bir worktree'de `git apply --check` ile doğrula.
   - Kullanıcı onayı varsa `chore: freeze v1.1.0 audit baseline` commit'i ve `v1.1.0-audit-baseline` tag'i oluştur; yoksa commit/tag oluşturma, yalnızca patch'i sakla ve WP-00'ı “koşullu tamam” işaretle.
   - `remediation/v1.1.1` dalını aç. `git reset`, `git checkout -- .` veya `git clean` **kullanma**.
2. **Ortamı sabitle.**
   - `.nvmrc` dosyasını ölçülen baseline `24.22.1`'e hizala; `package.json` `engines.node` alt sınırı `>=24.18.1` olarak korunur. Electron sürümünü doğrula; `node -v` çıktısı `24.22.1` değilse dur ve farkı `tests/BASELINE.md` içine yaz.
   - `scripts/release-check.js` içindeki sabit `1.1.0` sürüm ve `24.18.1` `.nvmrc` kontrollerini kaldır; sürüm hattını (`1.1.0`, `1.1.1`, `1.2.0-beta.N`, `1.2.0-rc.N`, `1.2.0`) ve ölçülen `.nvmrc` değerini (`24.22.1`) doğrula. `package-lock.json` sürümü `package.json` ile aynı kalmalı. `npm run release:check` baseline'da yeşil olmalı.
   - `npm ci` çalıştır; `package-lock.json` değişmemeli.
   - Baseline komutlarını sırayla çalıştır ve çıktıları commit hash'iyle `tests/BASELINE.md` içine işle:
     `npm test -- --reporter=dot`, `npm run test:security`, `npm run test:smoke`, `npm run test:e2e`, `npm run coverage`, `npm run pack`, `npm run verify:pack`.
   - B1'deki 67 dosya / 649 test sayısı değişirse testleri “güncel” kabul edip geçme; farkı ve nedenini kaydet.
3. **Kapsam enstrümantasyonunu genişlet.**
   - `vitest.config.js` içindeki `coverage.include` listesine `main.js`, `preload.js`, `src/main/**/*.js`, `src/console/**/*.js`, `src/agent/**/*.js`, `src/cli/**/*.js` ve import edilebilen renderer modüllerini ekle.
   - `src/main/locales`, `src/renderer/locales`, `dist`, `coverage`, `node_modules`, test fixture'ları ve üretilen model dosyalarını hariç tut.
   - Electron entrypoint'leri (`main.js`, `preload.js`) satır yüzdesi kapısına sokma; bunlar E2E davranış kapsamıyla ölçülür. Bu istisna `docs/audit/coverage-exceptions.md` içinde gerekçesiyle yazılır. Amaç yanlış `%0` ile kapıyı düşürmek değil, gerçekten test edilebilen kodu ölçmektir.
4. **İki halkalı kapsam kapısını kur.**
   - `scripts/coverage-policy.json`:
     - **Kapı halkası:** `src/main/ipc/validate.js`, `src/main/ipc/pinGuard.js`, `src/main/services/WarningManager.js`, `src/main/services/TaskManager.js`, `src/main/services/SafetyPolicyEngine.js`, `src/main/services/StorageService.js`, `src/main/services/LocalApiService.js`, `src/console/ConsoleServer.js`, `src/main/storage/Backup.js`, `src/main/storage/MigrateV2.js`, `src/main/storage/Database.js` — satır ≥ 85, dal ≥ 75, fonksiyon ≥ 85.
     - **Gözlem halkası:** Kalan import edilebilir dosyalar — ilk ölçüm baseline'a yazılır; sonraki ölçüm baseline'ın 0,5 puan altına düşemez.
     - **Genel eşik:** satır ≥ 80, dal ≥ 65, fonksiyon ≥ 70, ifade ≥ 80.
   - `scripts/coverage-gate.mjs` `coverage/coverage-summary.json` dosyasını okur; `--gate G0|G1|G2|G3|G4|G5` parametresiyle yalnızca o gate'e atanmış modülleri denetler. Gate ataması `scripts/coverage-policy.json` içinde açıkça tutulur.
   - `vitest.config.js` içindeki eski eşikleri kaldır; eşik ihlali tek yerden, bu script'ten raporlanır. `npm run coverage` yalnızca `vitest run --coverage` üretir; gate için `node scripts/coverage-gate.mjs --gate G0|G1|G2|G3|G4|G5` açıkça çağrılır.
   - Kapı halkası eşikleri G0'da yalnızca mevcut testli modüller için, G1'de P0 modülleri için, G2'de P1 modülleri için, G3–G5'te kalan modüller için zorunludur. Böylece henüz testi yazılmamış modül “yeşil” sayılmaz; gate ilerledikçe ratchet uygulanır.
5. **Kapsamı 80'in üzerine çıkar.**
   - Üretim mantığını değiştirmeden karakterizasyon testleri ekle: `validate.test.mjs`, `taskmanager.test.mjs`, `warning.test.mjs`, `storage.test.mjs`, `localapi.test.mjs`, `backup`/`migrate` mevcut testleri.
   - Yeni testler güvenlik açığını “beklenen davranış” olarak sabitlemez; güvenli gelecek davranışı `it.fails` ile işaretlenir, mevcut davranış yalnızca regresyon karakterizasyonu olarak yazılır.
   - `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G0` yeşil olmadan WP-00 kapanmaz. Yetişmiyorsa kapsam eşiğini düşürme; eksik testleri WP-00 kapsamında tamamla veya G0'ı bloke et.
6. **Handler ve hata enjeksiyonu harness'ini kur.**
   - `tests/helpers/ipc-harness.mjs`:
     - `trustedEvent()` / `untrustedEvent()` — `APP_ORIGIN` ve yabancı origin.
     - `invokeHandler(handler, payload, event)` — `guardIpcHandler` ile sarmalanmış handler'ı çağırır.
     - `makeFakeStorage({ settings, failOn })` — `getSettings`, `updateSettings`, `updateSettingsWithAudit`, `appendAudit`, `getAuditLog`; hata enjeksiyonu.
     - `makeFakeAudit()` — çağrıları kaydeder, `failNext()` ile fırlatır.
     - `makeFakePinGuard()` — deterministik `check` sonuçları.
     - `makeWarningHarness()` — gerçek `WarningManager` + sahte zamanlayıcı.
   - `tests/helpers/fault-injection.mjs`:
     - `failFsRenameOnce()`, `failDbWriteOnce()`, `failAuditAppendOnce()`, `corruptSqliteFile()`, `truncateFile()`, `simulateWorkerCrash()`, `withTempDb()`.
   - Harness iş mantığı içermez; yalnızca sınırları taklit eder. Her yardımcı için en az bir self-test yazılır.
7. **P0 kırmızı test iskeletlerini oluştur.**
   - `tests/main/p0/k01-pin-change.test.mjs`, `k02-warning-confirm.test.mjs`, `k03-task-schema.test.mjs`, `k04-autonomy.test.mjs`.
   - Her dosyada güvenli beklenen davranış `it.fails(...)` ile yazılır; mevcut açık davranış testi yeşil kalır. WP-01–WP-04 düzeltmeyle aynı PR'da `it.fails` → `it` çevrilir.
   - `scripts/verify-traceability.mjs`, her `it.fails` testinin bir WP ve bulgu kimliği taşıdığını denetler.
8. **Kanıt matrisini oluştur.**
   - `docs/audit/V3_EVIDENCE_MATRIX.md` içinde 36 satır: bulgu, önem, WP, test ID'leri, kırmızı kanıt, yeşil komut, artefakt yolu, gate, gözden geçiren, tarih/commit.
   - `scripts/verify-traceability.mjs`:
     - `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` başlıklarından 36 bulgu kimliğini çıkarır.
     - Matriste her kimliğin **tam bir kez** geçtiğini ve K=4/Y=11/O=13/D=8 sayılarını doğrular.
     - Her satırda en az bir test ID'si ve gate bulunmasını zorunlu kılar.
     - `npm run verify:traceability` olarak `package.json`'a eklenir ve CI'da çalışır.
9. **CI'ı güncelle.**
   - `.github/workflows/ci.yml` içindeki iki `node-version: 24.18.1` değerini `24.22.1` yap; dosya başındaki Node sürüm yorumunu da güncelle. Kanıt: `rg -n "24\\.18\\.1" .github/workflows/ci.yml` boş dönmeli.
   - Installer ve artefakt yollarını sabit `Power Pilot Setup 1.1.0.exe` yerine `package.json` sürümünden türet: PowerShell adımında `$version = (Get-Content package.json -Raw | ConvertFrom-Json).version`; `scripts/packaged-e2e.ps1 -Installer "dist\Power Pilot Setup $version.exe"`; artefakt yolları `dist/Power Pilot Setup $version.exe` ve `.blockmap`. CI'da sabit `1.1.0` yol kalmaz.
   - Mevcut Windows job'larını koru; aşağıdakileri ekle:
     - `npm run verify:traceability`
     - `npm run release:check`
     - `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G0`
     - `npm run locales:check`
     - P0 test dosyaları için ayrı ve hızlı bir job.
   - Coverage ve evidence artefaktlarını yükle. `npm audit`, lisans taraması, `test:security` adımlarını gevşetme.
10. **Baseline'ı yeniden ölç ve dondur.**
    - Tüm komutları temiz worktree'de tekrar çalıştır; süreleri ve çıktıları `tests/BASELINE.md` içine işle.
    - Bilinen kırmızı yalnızca coverage ise ve WP-00 sonunda yeşile döndüyse G0'a geç. Başka kırmızı varsa WP-00 kapanmaz; yeni bir blocker kaydı açılır.

#### 7.1.2 Çıktılar

- `v1.1.0-audit-baseline` tag'i (kullanıcı onayı varsa) ve `remediation/v1.1.1` dalı.
- `docs/audit/baseline-worktree.patch`, `baseline-worktree-status.txt`, `baseline-untracked.txt`.
- Güncellenmiş `tests/BASELINE.md`: commit hash, tarih, komut, süre, sonuç.
- `scripts/coverage-policy.json`, `scripts/coverage-gate.mjs`, güncellenmiş `vitest.config.js`, `package.json`, `.nvmrc` ve `scripts/release-check.js`.
- `docs/audit/coverage-exceptions.md`: entrypoint kapsam istisnalarının gerekçesi.
- `tests/scripts/release-check.test.mjs`: release-check sürüm/NVM doğrulama testi.
- `tests/helpers/ipc-harness.mjs`, `tests/helpers/fault-injection.mjs` ve self-test'leri.
- Dört P0 kırmızı test iskeleti.
- `docs/audit/V3_EVIDENCE_MATRIX.md` ve `scripts/verify-traceability.mjs`.
- Güncellenmiş CI iş akışı.

#### 7.1.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Kullanıcı WIP'i commit/tag sırasında kaybolur | Yüksek | Yüksek | Patch + untracked listesi + `git apply --check`; commit öncesi kullanıcı onayı; `reset/clean` yasak | Onay yoksa commit/tag oluşturma; patch'i sakla ve WP-00'ı koşullu kapat |
| Baseline test sayısı ortam farkıyla değişir | Orta | Yüksek | `npm ci`, Node 24.22.1, aynı lockfile; farkı durdurucu kabul et | Farkı belgeleyip yeni baseline'ı onayla; eski sayıyı sessizce güncelleme |
| Release-check sabit sürüm/NVM kontrolü gate'leri yanlış kırmızı yapar | Yüksek | Yüksek | Sürüm hattı ve `.nvmrc` tek yerden; T00-11; CI'da `release:check` | Kontrolü hedef sürüme göre gevşetme; yalnız izinli sürüm setini genişlet |
| Coverage enstrümantasyonu renderer testlerini kırar | Orta | Orta | Ayrı Vitest projeleri; entrypoint'leri satır kapısından çıkar; deneme commit'i | Renderer kapsamını gözlem halkasında tut, kapıyı yalnızca main modüllerinde uygula |
| Kapı halkası 85/75/85 G0'da yetişmez | Yüksek | Orta | Gate bazlı ratchet; G0'da yalnızca mevcut testli modüller; eksik testleri WP-00'da tamamla | Eşiği düşürme; G0'ı bloke et ve kapsam borcunu açıkça kaydet |
| `it.fails` iskeletleri düzeltmeyle birlikte çevrilmez | Orta | Orta | `verify-traceability` her iskeleti WP'ye bağlar; PR kontrol listesi | Kalan `it.fails` varsa G1 kapanmaz |
| Harness üretim mantığını taklit ederek yanlış güven verir | Orta | Orta | Harness yalnızca sınır taklidi; iş mantığı gerçek modülde; code review | Harness'i küçült, gerçek modülü entegre testte kullan |
| CI süresi kabul edilemez düzeye çıkar | Orta | Orta | Cache, job ayırma, hızlı P0 job'u | PR'da çekirdek gate, gece tam matris; gate kaldırma yok |
| CI installer/artefakt yolu sürümle birlikte kayar | Yüksek | Orta | Yol `package.json` sürümünden türetilir; sabit `1.1.0` yok; T00-10 | Workflow'da sürümü sabitleme; dinamik türetimi koru |

#### 7.1.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T00-01 | WIP korunumu | Patch'i temiz worktree'ye uygula; `git diff --binary` ile karşılaştır | Patch temiz uygulanır; kaybolan dosya yok | `git apply --check` çıkışı 0; untracked listesi eşleşir |
| T00-02 | Baseline testi | `npm test -- --reporter=dot` | 67 dosya / 649 test / 0 fail (veya onaylı yeni baseline) | Çıkış kodu 0; sayılar BASELINE.md ile aynı |
| T00-03 | Coverage gate negatif | Sahte `coverage-summary.json` ile eşik altı modül | Script exit 1; hangi modül/ölçüt düştü yazar | Hata mesajı modül + metrik + eşik içerir |
| T00-04 | Coverage gate pozitif | Tüm eşiklerin üstünde sahte özet | Script exit 0 | G0 gate'i yeşil |
| T00-05 | IPC harness | Trusted/untrusted event ile handler çağır | Trusted geçer; untrusted `UNTRUSTED_SENDER` | İki assert de geçer |
| T00-06 | Storage/Audit hata enjeksiyonu | `failAuditAppendOnce()` ile yazma dene | Çağrı fırlatır; state rollback edilebilir | Hata kodu ve state assert edilir |
| T00-07 | FS/DB hata enjeksiyonu | `failFsRenameOnce()`, `failDbWriteOnce()` | Hata enjekte edilir; temizlik çalışır | Geçici dosya/DB kilidi kalmaz |
| T00-08 | P0 kırmızı iskeletleri | `npm test -- tests/main/p0` | Dört dosya da `it.fails` olarak yeşil; güvenli beklenti kayıtlı | Testler çalışır; her biri WP/bulgu etiketli |
| T00-09 | Traceability | `npm run verify:traceability` | 36 benzersiz bulgu; K=4/Y=11/O=13/D=8 | Çıkış 0; eksik/çift yok |
| T00-10 | CI komutları | Tüm yeni komutları yerelde çalıştır; workflow'daki Node sürümü ve installer yolunu denetle | Hepsi belgelenen çıkış kodunu verir; sabit `1.1.0` yol yok | CI job'u aynı komutlarla ve `package.json` sürümünden türetilen installer yoluyla yeşil |
| T00-11 | Release-check sürüm/NVM | İzinli sürümler (`1.1.0`, `1.1.1`, `1.2.0-beta.1`, `1.2.0-rc.1`, `1.2.0-rc.2`, `1.2.0-rc.3`, `1.2.0`), geçersiz `9.9.9` ve `.nvmrc` `24.22.1`/`24.18.1` ile `release-check` doğrulamasını çalıştır | İzinli sürümler ve doğru `.nvmrc` exit 0; geçersiz sürüm ve eski `.nvmrc` exit 1 | Hata mesajı sürüm veya `.nvmrc` alanını gösterir |

#### 7.1.5 Geri alma

- WP-00 commit'ini geri al; üretim kodu değişmediği için uygulama davranışı etkilenmez.
- Baseline tag'i ve patch dosyaları silinmez; bunlar denetim kanıtıdır.
- Coverage/CI değişiklikleri geri alınırsa G0 yeniden açılır; sonraki gate'ler başlamaz.

#### 7.1.6 Definition of Done (DoD)

- [ ] Kullanıcı WIP'i kaybolmadı; patch ve untracked listesi kanıtlandı.
- [ ] Baseline commit/tag (veya onaylı koşullu kayıt) mevcut.
- [ ] `npm test` yeşil; sayılar güncel `tests/BASELINE.md` ile aynı (yeni testler dahil).
- [ ] `npm run coverage` tamamlanıyor ve `node scripts/coverage-gate.mjs --gate G0` yeşil; iki halkalı politika çalışıyor.
- [ ] `npm run test:security` temiz.
- [ ] `npm run release:check` baseline `1.1.0` ve `.nvmrc 24.22.1` ile yeşil; T00-01…T00-11 yeşil.
- [ ] `npm run verify:traceability` 36/36 benzersiz bulgu veriyor.
- [ ] Dört P0 kırmızı iskeleti ve harness self-test'leri mevcut.
- [ ] CI yeni komutlarla Windows/Node 24.22.1 üzerinde yeşil.
- [ ] `.github/workflows/ci.yml` Node `24.22.1` kullanıyor; installer/artefakt yolları `package.json` sürümünden türetiliyor; sabit `1.1.0` yol yok.
- [ ] Üretim kaynak dosyalarında WP-00 kaynaklı değişiklik yok.

---

### 7.2 WP-01 — PIN değiştirme/silme mevcut PIN'e bağlanır

| Alan | Değer |
|---|---|
| **Bulgular** | K-01 |
| **Öncelik** | P0 / G1 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G1 |
| **Ana dosyalar** | `main.js`, `src/main/ipc/pinActions.js` (yeni), `src/main/ipc/validate.js`, `src/main/ipc/pinGuard.js`, `src/main/services/StorageService.js`, `preload.js`, `src/renderer/app.js`, `src/index.html`, `src/renderer/locales/*.json` |
| **İlgili kararlar** | D2, D3, D17 |

**Amaç:** PIN kuruluysa değiştirme ve silme işlemlerinin mevcut PIN'i doğrulamasını; her mutasyonun ayrı deneme sayacı, Argon2id kaydı ve denetim izi üretmesini sağlamak. PIN'i bilmeyen yerel kullanıcı `clear-cancel-pin` + `set-cancel-pin` zinciriyle kapıyı ele geçirememelidir.

#### 7.2.1 Uygulama adımları

1. **Kırmızı testi yeşile çevir.**
   - `tests/main/p0/k01-pin-change.test.mjs` içindeki `it.fails` senaryolarını gerçek testlere dönüştür.
   - Önce yalnızca testleri çalıştır; mevcut kodda kırmızı olduklarını kanıtla. Kırmızı kanıtı `docs/audit/V3_EVIDENCE_MATRIX.md` satırına yaz.
2. **PIN action modülünü ayır.**
   - `src/main/ipc/pinActions.js` oluştur; Electron importu **yok**.
   - API:
     - `setCancelPinAction({ args, storage, pinGuard, requireStoredPin, validateCancelPin, t })`
     - `clearCancelPinAction({ args, storage, requireStoredPin, t })`
     - `getCancelPinStateAction({ storage })`
   - `main.js` yalnızca `ipcHandle` sarmalayıcısı ve bağımlılık enjeksiyonu yapar; iş mantığı modülde kalır.
3. **Mevcut PIN kapısını genelleştir.**
   - `main.js` içindeki `requireCancelPin`ı `requireStoredPin(providedPin, scope)` olarak genelleştir; mevcut çağrılar `scope='cancel'` kullanır.
   - `set-cancel-pin` mevcut PIN için `scope='pin-change'`, `clear-cancel-pin` için `scope='pin-clear'` kullanır. Böylece sayaçlar birbirini etkilemez.
   - `pinGuard.check(scope, pin, stored)` zaten scope başına sayaç tutuyor; yeni scope'lar için ek altyapı gerekmez.
   - `requireStoredPin` PIN yoksa `{ok:true}` döner; çağıran karar verir. `set-cancel-pin` PIN yoksa mevcut PIN istemez; `clear-cancel-pin` PIN yoksa `NO_PIN_SET` döner.
4. **Yeni PIN'i doğrula.**
   - `validateCancelPin(args.pin)` ile 4–8 haneli sayı biçimini kontrol et. Geçersizse mevcut PIN sayacını tüketme; erken `INVALID_PIN` dön.
   - `args.confirmPin` gönderilmişse `args.pin === args.confirmPin` olmalı; değilse `PIN_MISMATCH`. Sunucu bunu zorunlu tutmaz; UI tutar, sunucu yine de doğrular.
   - Yeni PIN, mevcut PIN ile aynı olabilir; ürün kararı olarak engelleme.
5. **Mevcut PIN'i doğrula.**
   - `const current = storage.getSettings(); const hasPin = Boolean(current.cancelPinHash);`
   - `hasPin` ise `requireStoredPin(args.currentPin, 'pin-change')`; hata varsa aynen dön (`PIN_REQUIRED`, `PIN_WRONG`, `PIN_LOCKED`, `retryAfterSec`, `attemptsLeft`).
   - `hasPin` değilse `currentPin` gönderilmiş olsa bile yok say; ilk kurulum akışıdır.
6. **Yeni hash'i üret ve atomik yaz.**
   - `const hash = await Pin.hashPin(args.pin);`
   - `storage.updateSettingsWithAudit({ cancelPinSalt: null, cancelPinHash: hash }, { actor: 'local_user', action: 'cancel_pin_changed', target: 'settings', detail: hasPin ? 'changed' : 'initial' })`.
   - `updateSettingsWithAudit` `StorageService` içinde **WP-01 kapsamında minimal** metot olarak eklenir: ayar flush'ı ve audit insert'i **tek `db.write`** içinde yapar. Audit yazılamazsa ayar da yazılmaz; `AUDIT_WRITE_FAILED` döner. WP-11 bu metodu `_insertAuditRow`, `requireAudit` seçeneği ve checkpoint durumuyla genelleştirir; WP-01 yalnız PIN mutasyonları için dar yolu kurar.
   - Metot yoksa (legacy test double) `updateSettings` + `appendAudit` + hata halinde eski hash'i geri yazma (telafi edici rollback) kullan; bu yol üretimde kullanılmaz.
7. **Silme akışı.**
   - `hasPin` false ise `{ success: true, code: 'NO_PIN_SET' }` döndür; audit yazma, çünkü değişiklik yok.
   - `hasPin` true ise `requireStoredPin(args.pin, 'pin-clear')`; hata varsa dön.
   - Başarılıysa `updateSettingsWithAudit({ cancelPinSalt: null, cancelPinHash: null }, { actor: 'local_user', action: 'cancel_pin_cleared', target: 'settings', detail: '' })`.
   - Başarıda `clear-cancel-pin` yanıtı `{ success: true }`; UI PIN alanlarını temizler.
8. **Legacy SHA-256 yükseltmesi.**
   - `requireStoredPin` başarılı doğrulamada `check.upgrade` dönerse, nihai yazma zaten Argon2id olacağı için set/clear akışında ek yazma yapma.
   - Yalnızca doğrulama amaçlı çağrılarda (`cancel`, `security`) mevcut davranış korunur; yükseltme yazılamazsa logla, işlemi kilitleme.
9. **IPC kablolaması.**
   - `main.js`:
     - `set-cancel-pin` → `setCancelPinAction`
     - `clear-cancel-pin` → `clearCancelPinAction`
     - `get-cancel-pin-state` → `getCancelPinStateAction`
   - `ipcHandle` ve `guardIpcHandler` sarmalayıcısı korunur; yeni handler'lar da aynı kapıdan geçer.
   - `event` nesnesinden gelen hiçbir alan güvenilir kabul edilmez.
10. **Preload yüzeyi.**
    - `setCancelPin: (args) => ipcRenderer.invoke('set-cancel-pin', args)`
    - `clearCancelPin: (pin) => ipcRenderer.invoke('clear-cancel-pin', { pin })`
    - Geriye uyumluluk için eski `setCancelPin(pin)` çağrısını **destekleme**; renderer aynı sürümde güncellenir. Sürüm uyuşmazlığı `INVALID_BODY` ile fail-closed olur.
11. **Renderer UI.**
    - `src/index.html` PIN kartında üç alan:
      - `pin-current` — yalnızca PIN kuruluysa görünür, “Mevcut PIN”.
      - `pin-input` — “Yeni PIN”.
      - `pin-confirm` — “Yeni PIN tekrar”.
    - Set butonu: yeni PIN ve tekrar eşleşmiyorsa `pinMismatch` göster, istek gönderme. PIN kuruluysa `pin-current` boşsa `pinCurrentRequired` göster.
    - Clear butonu: `requestPin(t('pinPromptClear'), { run: (pin) => window.electronAPI.clearCancelPin(pin), done: ... })` ile mevcut PIN'i modalda sor. PIN yoksa butonu devre dışı bırak.
    - Başarıda üç alanı temizle, `refreshPinState()` çağır, `pinStateSet`/`pinStateNotSet` güncelle.
    - Hata eşlemesi: `PIN_WRONG` → kalan hak, `PIN_LOCKED` → kilit süresi, `PIN_REQUIRED` → mevcut PIN uyarısı, `AUDIT_WRITE_FAILED` → “PIN değişikliği kaydedilemedi; tekrar deneyin”.
12. **i18n.**
    - Yeni anahtarlar: `pinCurrentLabel`, `pinNewLabel`, `pinConfirmLabel`, `pinMismatch`, `pinCurrentRequired`, `pinPromptClear`, `pinClearSuccess`, `pinAuditFailed`, `pinNotSet`.
    - `tr` ve `en` başta olmak üzere 17 renderer locale dosyasına ekle; çevirisi olmayan dillerde İngilizce metin kullan. `npm run locales:check` yeşil olmalı.
13. **Denetim ve gizlilik.**
    - Audit `detail` alanına PIN, hash, salt veya türev yazma; yalnızca `initial|changed|cleared` gibi sınıflandırma yaz.
    - Audit kaydı `target='settings'`, `actor='local_user'`.
14. **Regresyon ve E2E.**
    - Birim/entegrasyon testleri T01-01…T01-08.
    - Renderer testi: set/clear butonlarının doğru payload ürettiğini ve hata mesajlarını gösterdiğini doğrula.
    - E2E: PIN kur → yanlış mevcut PIN ile değiştirmeyi dene → hata; doğru PIN ile değiştir → yeni PIN çalışır; clear → PIN ister.

#### 7.2.2 Çıktılar

- `src/main/ipc/pinActions.js` ve testleri.
- `StorageService.updateSettingsWithAudit()` (WP-01 minimal sürümü) ve hata enjeksiyonu testi.
- Güncellenmiş `set-cancel-pin`, `clear-cancel-pin`, `get-cancel-pin-state` handler'ları.
- Üç alanlı PIN UI, preload sözleşmesi ve 17 locale anahtarı.
- Audit kayıtları: `cancel_pin_changed`, `cancel_pin_cleared`.
- T01-01…T01-08 kanıtları.

#### 7.2.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Mevcut PIN'i bilen kullanıcı yeni UI'da yanlış alana yazar | Orta | Orta | Etiketler, placeholder, üç alan; hata mesajı alanı işaret eder | Kullanıcıya “mevcut PIN” ve “yeni PIN” açıklaması; E2E ile doğrula |
| `pin-change` scope'u 5 hatada kullanıcıyı kilitler | Orta | Orta | Kalan hak/kilit süresi göster; scope'lar ayrı; restart sayacı sıfırlar | Kilit süresi dolunca tekrar dene; PIN sıfırlama arka kapısı ekleme |
| Audit transaction hatası PIN değişimini bloke eder | Orta | Orta | `AUDIT_WRITE_FAILED` net mesaj; retry; state değişmez | Ayarsız devam etme; fail-closed kal |
| Eski SHA-256 kaydı yükseltilemez | Düşük | Düşük | Nihai set/clear yazımı Argon2id; yükseltme başarısızsa eski kayıt kalır | Sonraki doğrulamada tekrar dene |
| Preload API'sinin eski imzası otomasyonu kırar | Düşük | Orta | Sürüm notu; `INVALID_BODY` fail-closed; test | Eski imzayı destekleme; güvenlik > geriye uyumluluk |
| 17 locale dosyasında anahtar eksikliği CI'ı kırar | Orta | Düşük | `tr/en` tam, diğerlerinde İngilizce fallback; `locales:check` | Eksik anahtarı parity allowlist'e ekleme; tamamla |

#### 7.2.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T01-01 | İlk PIN kurulumu | PIN yokken `set-cancel-pin({pin:'1234'})` | Başarılı; `cancelPinHash` Argon2id; audit `cancel_pin_changed` detail `initial` | Hash `$argon2id$`; audit 1 kayıt; salt null |
| T01-02 | Doğru mevcut PIN ile değiştir | `set-cancel-pin({currentPin:'1234',pin:'5678'})` | Başarılı; yeni PIN doğrulanır; eski PIN artık geçmez | `Pin.verify('5678', hash)` true; `1234` false; audit `changed` |
| T01-03 | Eksik/yanlış mevcut PIN | `currentPin` yok; `currentPin:'0000'` | `PIN_REQUIRED` / `PIN_WRONG`; hash değişmez | Hash aynı; `attemptsLeft` 4; audit yok |
| T01-04 | Eksik/yanlış PIN ile silme | `clear-cancel-pin({})`, `{pin:'0000'}` | `PIN_REQUIRED` / `PIN_WRONG`; PIN silinmez | `cancelPinHash` dolu; audit yok |
| T01-05 | Doğru PIN ile silme / PIN yokken silme | `{pin:'5678'}`; sonra tekrar `{}` | İlki başarılı, hash null, audit `cleared`; ikincisi `NO_PIN_SET`, audit yok | İlk yanıt success; ikinci success + `NO_PIN_SET`; audit 1 |
| T01-06 | Kilit ve scope izolasyonu | `pin-change` scope'unda 5 yanlış; doğru PIN ile dene; `pin-clear` scope'unda doğru PIN dene | `PIN_LOCKED`; `pin-clear` etkilenmez | `retryAfterSec` 900; diğer scope başarılı |
| T01-07 | Audit yazılamazsa ayar yazılmaz | `failAuditAppendOnce()` ile set/clear | `AUDIT_WRITE_FAILED`; hash eski değerde | DB'de eski hash; audit yok; hata kodu doğru |
| T01-08 | Legacy yükseltme + biçim hatası | Legacy SHA kaydıyla doğru currentPin; geçersiz yeni PIN | Doğrulama başarılı, nihai hash Argon2id; geçersiz yeni PIN `INVALID_PIN` ve sayaç tüketmez | `$argon2id$`; geçersiz PIN'de `attemptsLeft` değişmez |

#### 7.2.5 Geri alma

- Kod commit'ini geri al; PIN alanları (`cancelPinHash`, `cancelPinSalt`) aynı kaldığı için veri migrasyonu gerekmez.
- Kullanıcı PIN'ini değiştirdiyse eski PIN geri gelmez; bu güvenlik davranışıdır, kod rollback'i PIN rollback'i değildir.
- Audit kayıtları geri silinmez; denetim izi korunur.
- UI eski tek alanlı sürüme dönerse yeni handler'lar `INVALID_BODY`/`PIN_REQUIRED` ile fail-closed kalır; eski handler'lara dönülmez.

#### 7.2.6 Definition of Done (DoD)

- [ ] PIN yokken ilk kurulum mevcut PIN istemiyor.
- [ ] PIN varken set/clear yalnızca doğru mevcut PIN ile çalışıyor.
- [ ] `pin-change` ve `pin-clear` ayrı sayaç/kilit kullanıyor.
- [ ] Her başarılı mutasyon tek transaction'da audit yazıyor; audit hatası ayarı geri alıyor.
- [ ] Legacy SHA-256 kaydı başarılı doğrulamada Argon2id'e yükseliyor.
- [ ] UI üç alanlı, hata mesajları eşli ve 17 locale anahtarı tam.
- [ ] T01-01…T01-08 yeşil; `it.fails` işaretleri kaldırılmış.
- [ ] E2E PIN değiştirme/silme akışı yeşil.
- [ ] `npm run test:security` ve `npm run locales:check` yeşil.

---

### 7.3 WP-02 — Uyarı onayı `taskId+epoch` ile atomikleşir

| Alan | Değer |
|---|---|
| **Bulgular** | K-02 |
| **Öncelik** | P0 / G1 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G1 |
| **Ana dosyalar** | `src/main/services/WarningManager.js`, `src/main/ipc/warningActions.js`, `main.js`, `preload.js`, `src/renderer/app.js`, `tests/main/warning-pin.test.mjs`, `tests/renderer/warning-confirm.test.mjs` |
| **İlgili kararlar** | D4 |

**Amaç:** Kullanıcının gördüğü uyarı ile onayladığı uyarının aynı olduğunu kanıtlamak. A uyarısı kapanıp B uyarısı açıldığında eski bir tıklama B'yi onaylamamalı; aktif uyarı yokken “başarılı” yanıtı verilmemeli; renderer yalnızca gerçek başarıda banner'ı gizlemeli.

#### 7.3.1 Uygulama adımları

1. **Kırmızı testi yeşile çevir.**
   - `tests/main/p0/k02-warning-confirm.test.mjs` içindeki `it.fails` senaryolarını gerçek testlere dönüştür.
   - Mevcut kodda A→B senaryosunun B'yi onayladığını kanıtla; kanıtı matrise yaz.
2. **Monoton epoch ekle.**
   - `WarningManager` constructor: `this._warningEpoch = 0;`
   - `showWarning(task)` başında `this._warningEpoch += 1; const epoch = this._warningEpoch;`
   - `activeWarning` nesnesine `epoch` ekle.
   - `warning-started` event'ine `epoch` ekle; `getActiveState()` `epoch` döndür.
   - Epoch process ömrü boyunca artar; restart'ta 1'den başlar. Aynı süreçte eski tıklama farklı epoch taşıdığı için reddedilir. Restart sonrası renderer de yeniden yüklendiğinden eski DOM tıklaması taşınmaz; yeni banner `warning-started`/`getActiveState` ile epoch=1 alır. Restart sonrası aynı `taskId` + epoch=1 teorik çakışması, confirm'in ancak restore tamamlandıktan sonra etkinleşmesiyle kapatılır.
3. **`finishWarning` imzasını genişlet.**
   - `finishWarning(proceed, snoozed, taskId = null, epoch = null)`
   - `if (!this.activeWarning) return false;`
   - `if (taskId && this.activeWarning.taskId !== taskId) return false;`
   - `if (epoch != null && this.activeWarning.epoch !== epoch) return false;`
   - Eşleşme sağlanmadan interval temizleme, state null'lama veya resolve çağırma.
   - `cancelActiveWarning(taskId, epoch)` ve `snoozeActiveWarning(minutes, taskId, epoch)` aynı çift kontrolü desteklesin; mevcut çağıranlar taskId ile çalışmaya devam eder.
4. **Confirm action'ı ayır.**
   - `warningActions.js` içine `confirmWarningAction({ payload, warningManager, t })` ekle.
   - Payload doğrulaması:
     - `taskId` string ve `AutomationTask.isValidId` benzeri desen; boş/çok uzun reddedilir.
     - `epoch` pozitif tam sayı.
     - Eksik/geçersizse `{ success:false, code:'INVALID_WARNING_STATE', message:t('errorInvalidRequest') }`.
   - `const active = warningManager.getActiveState();`
   - `if (!active) return { success:false, code:'NO_ACTIVE_WARNING', message:t('warningNoActive') };`
   - `if (active.taskId !== taskId || active.epoch !== epoch) return { success:false, code:'WARNING_CHANGED', message:t('warningChanged') };`
   - `const ok = warningManager.finishWarning(true, false, taskId, epoch);`
   - `ok ? { success:true, taskId, epoch } : { success:false, code:'WARNING_CHANGED', ... }`.
   - Handler **senkron** olmalı; `await` yok. Böylece kontrol ve kapatma aynı JS tick'inde atomik olur.
5. **`main.js` handler'ını bağla.**
   - `ipcHandle('warning-confirm', (event, payload) => confirmWarningAction({ payload, warningManager, t }));`
   - `event` kullanılmaz; payload dışından state okunmaz.
6. **Preload sözleşmesi.**
   - `warningConfirm: (args) => ipcRenderer.invoke('warning-confirm', args)`.
   - `args` `{ taskId, epoch }`; eski argümansız çağrı `INVALID_WARNING_STATE` alır.
7. **Renderer banner state'i.**
   - `warning-started` handler'ında `banner.dataset.taskId = String(data.taskId); banner.dataset.epoch = String(data.epoch);`.
   - `warning-tick` yalnızca aynı `taskId`/`epoch` için sayacı günceller; eski tick yeni banner'ı ezmez.
   - Confirm tıklamasında dataset'ten `taskId`/`epoch` oku; eksikse istek gönderme, `warningChanged` göster.
   - Restore tamamlanana kadar confirm butonu `disabled`; ilk `getActiveState`/`warning-started` sonrası etkinleşir.
   - `const res = await window.electronAPI.warningConfirm({ taskId, epoch });`
   - Yalnızca `res.success === true` ise `hideWarningBanner()`. `WARNING_CHANGED`, `NO_ACTIVE_WARNING` veya ağ hatasında banner gizlenmez; `applyWarningResult` kullan.
8. **Terminal olay yarışını kapat.**
   - `onWarningEnded` callback'ine gelen `data.taskId`/`data.epoch` ile dataset'i karşılaştır; yalnızca eşleşiyorsa banner'ı gizle.
   - Eşleşmeyen eski terminal olayı yeni banner'ı kapatmamalı.
   - `warning-cancelled`, `warning-snoozed`, `warning-finished` üçü de `taskId` ve `epoch` taşır.
9. **Testler.**
   - Birim: epoch artışı, A→B, aktif yok, eksik payload, aynı taskId farklı epoch.
   - Renderer: dataset güncelleme, sadece success'te hide, eski terminal olayının yeni banner'ı kapatmaması.
   - E2E/entegrasyon: iki uyarıyı sırayla tetikle; eski tıklama yeni uyarıyı onaylamıyor.
10. **i18n.**
    - `warningChanged`, `warningNoActive`, `errorInvalidRequest` anahtarları mevcut değilse ekle; 17 locale dosyasında fallback ile tamamla.
11. **Gözlem.**
    - `warning-confirm` için PIN zorunlu değildir; ürün kararı olarak yalnızca kimlik/epoch koruması uygulanır. Bu, K-02'nin kapsamıdır; PIN eklemek ayrı bir ürün kararıdır ve bu planda yapılmaz.
12. **Kanıt.**
    - `docs/audit/V3_EVIDENCE_MATRIX.md` K-02 satırına birim + renderer + E2E kanıtlarını yaz.

#### 7.3.2 Çıktılar

- `WarningManager` epoch desteği ve genişletilmiş `finishWarning`.
- `confirmWarningAction` ve testleri.
- Güncellenmiş preload/renderer banner sözleşmesi.
- T02-01…T02-07 kanıtları.
- Eski tıklamanın yeni uyarıyı onaylamadığını gösteren ekran/konsol kanıtı.

#### 7.3.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Renderer eski sürümde kalır, `taskId/epoch` göndermez | Orta | Yüksek | Aynı sürümde preload+renderer; eksik payload fail-closed | `INVALID_WARNING_STATE`; banner gizlenmez, kullanıcıya güncelleme uyarısı |
| Terminal olay eski `taskId` ile yeni banner'ı kapatır | Orta | Orta | `onWarningEnded` taskId/epoch eşleşmesi | Eşleşmeyen olayda hide çağırma |
| Epoch restart'ta sıfırlanır | Düşük | Düşük | Restart sonrası renderer yeniden yüklenir; confirm yalnız `getActiveState`/`warning-started` sonrası etkin; eski DOM taşınmaz | Aynı taskId+epoch=1 teorik çakışması kabul edilir; kalıcı eski tıklama yolu yok |
| Aynı taskId ile yeni uyarı (recurrence) | Orta | Orta | Epoch her uyarıda artar; taskId tek başına yetmez | Epoch eşleşmezse `WARNING_CHANGED` |
| `finishWarning` eski çağıranları kırar | Orta | Orta | Yeni parametreler opsiyonel; mevcut `taskId` çağrıları korunur | Testlerle geriye uyumluluk doğrula |
| `it.fails` testi düzeltmeyle çevrilmez | Düşük | Orta | WP-02 PR'ında zorunlu çevirme; traceability kontrolü | G1 kapanmaz |

#### 7.3.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T02-01 | Doğru uyarıyı onayla | A uyarısı açık; `{taskId:A,epoch:A}` ile confirm | `success:true`; A uyarısı kapanır; B yok | `finishWarning` true; `getActiveState()` null |
| T02-02 | Eski tıklama yeni uyarıyı onaylamaz | A açık; A kapanıp B açılır; A'nın `{taskId,epoch}` ile confirm | `WARNING_CHANGED`; B açık kalır | B `getActiveState().taskId` aynı; B resolve olmamış |
| T02-03 | Aktif uyarı yok | Confirm çağır | `NO_ACTIVE_WARNING`; `success:false` | Renderer banner gizlemez |
| T02-04 | Eksik/geçersiz payload | `{}`, `{taskId:A}`, `{taskId:A,epoch:0}`, `{taskId:'x',epoch:1}` | `INVALID_WARNING_STATE` | Hiçbiri state değiştirmez |
| T02-05 | Renderer yalnızca başarıda gizler | Mock API `success:false` / `success:true` | `false` → banner görünür; `true` → gizli | DOM class assert |
| T02-06 | Aynı taskId, farklı epoch | A1 kapanır, A2 açılır; A1 epoch ile confirm | `WARNING_CHANGED`; A2 açık | Epoch kontrolü taskId'den önce/bağımsız çalışır |
| T02-07 | Eski terminal olayı yeni banner'ı kapatmaz | A `warning-finished` olayı B açıldıktan sonra gelir | B banner görünür kalır | `onWarningEnded` taskId/epoch eşleşmez |

> Not: T02-07, aynı WP'nin ek renderer regresyonudur; matriste K-02 satırı T02-01…T02-07 aralığını kapsar.

#### 7.3.5 Geri alma

- Kod commit'ini geri al; `WarningManager` epoch alanı opsiyonel olduğu için eski renderer ile uyumluluk bozulmaz (ancak yeni güvenlik koruması kalkar).
- Devam eden uyarı varsa rollback sırasında `finishWarning(false,false)` ile güvenli kapat; resolve edilmemiş promise bırakma.
- Audit/veri migrasyonu yok.

#### 7.3.6 Definition of Done (DoD)

- [ ] Her uyarı monoton `epoch` taşıyor; `getActiveState` ve event'lerde mevcut.
- [ ] `warning-confirm` `{taskId, epoch}` olmadan state değiştirmiyor.
- [ ] A→B yarışında eski tıklama B'yi onaylamıyor.
- [ ] Aktif uyarı yokken `success:true` dönmüyor.
- [ ] Renderer yalnızca `success:true` üzerine banner'ı gizliyor.
- [ ] Eski terminal olayı yeni banner'ı kapatmıyor.
- [ ] T02-01…T02-07 yeşil; `it.fails` işareti kaldırılmış.
- [ ] E2E/entegrasyon kanıtı matriste.

---

### 7.4 WP-03 — Görev şeması beyaz liste + güvenli varsayılanlar

| Alan | Değer |
|---|---|
| **Bulgular** | K-03, D-05 |
| **Öncelik** | P0 / G1 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G1 |
| **Ana dosyalar** | `src/main/ipc/validate.js`, `src/main/services/models/AutomationTask.js`, `src/main/services/models/taskFields.js` (yeni), `src/main/services/TaskManager.js`, `main.js`, `src/main/services/LocalApiService.js`, `src/main/services/OrderExecutor.js`, `src/main/services/EnterprisePolicies.js`, `src/renderer/app.js`, `tests/main/validate.test.mjs`, `tests/main/taskmanager.test.mjs` |
| **İlgili kararlar** | D5, D6, D7 |

**Amaç:** `create-task` sınırında istemcinin yalnızca beyaz listedeki görev alanlarını göndermesini; `action`/uyarı/politika alanlarının eksik veya `false` gönderilerek yıkıcı davranış üretmesini engellemek. Sunucu sahipli alanlar (`id`, `status`, `enabled`, `source`, `policyId`, `consoleOrderId`, `requiresMaintenanceWindow`, `createdAt`, `snoozeConfig.currentCount`) yalnızca güvenilir iç çağıranlar tarafından `context` üzerinden atanır; `mode` context'ten kabul edilmez, SQLite `autonomyMode` ayarından sunucu tarafından damgalanır.

#### 7.4.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/main/p0/k03-task-schema.test.mjs` içindeki `it.fails` senaryolarını gerçek testlere dönüştür.
   - Mevcut kodda `{}` → shutdown, `warningConfig.enabled:false` → uyarısız kapatma, `mode:'full'` → otomatik devam, `safetyPolicy:{}` → politika bypass olduğunu kanıtla.
2. **Ortak alan sabitlerini ayır.**
   - `src/main/services/models/taskFields.js` oluştur:
     - `CLIENT_TASK_FIELDS = new Set(['name','action','trigger','conditionGroup','warningConfig','safetyPolicy','snoozeConfig','recurrence','chain'])`
     - `SERVER_TASK_FIELDS = new Set(['id','status','enabled','source','mode','policyId','consoleOrderId','requiresMaintenanceWindow','createdAt','updatedAt','lastRunAt','lastResult','errorInfo','lastProgressMessage'])`
     - `SAFE_POLICY_DEFAULTS` (`checkUserActivity`, `checkProtectedApps`, `checkFullscreen`, `checkSystemLoad` — hepsi `true`)
     - `WARNING_DEFAULTS` (`enabled:true`, `durationSeconds:30`)
     - `SNOOZE_DEFAULTS`, `RECURRENCE_DEFAULTS`
   - `AutomationTask.js` ve `validate.js` bu sabitleri kullanır; döngüsel bağımlılık yaratma.
3. **`validateTaskData`ı beyaz listeye çevir.**
   - Girdi plain object olmalı; `null`, dizi, fonksiyon reddedilir.
   - `Object.keys(data)` içinde `CLIENT_TASK_FIELDS` dışında bir anahtar varsa `FORBIDDEN_FIELD`; hata mesajında yalnızca alan adı yazılır, değer loglanmaz.
   - `action` **zorunlu** ve `POWER_ACTIONS` içinde olmalı; yoksa `INVALID_ACTION`.
   - `name` opsiyonel; 1..120 karakter, `<`/`>` yasak; yoksa sunucu `Yeni Otomasyon` üretir.
   - `trigger`, `conditionGroup` mevcut doğrulamayı korur; `conditionGroup.conditions` en fazla 10, desteklenmeyen tip `TaskManager.createTask` içinde erken reddedilir.
   - `warningConfig`:
     - Yalnızca `enabled`, `durationSeconds` anahtarları.
     - `enabled` boolean; `false` → `WARNING_CANNOT_DISABLE` (D6). `silentMode` → `FORBIDDEN_FIELD` (D-05).
     - `durationSeconds` tam sayı **1..3600**; `0` reddedilir (`INVALID_WARNING`). `undefined` → 30. Eski kayıtlardaki `0`, WP-12’de 1’e normalize edilir; “uyarıyı kapatma” yalnızca sunucu tarafı `enabled:false` ile yapılır.
   - `safetyPolicy`:
     - Yalnızca dört güvenlik anahtarı; her biri boolean.
     - `forceCloseApps`, `remoteApprovalRequired` ve diğer ölü alanlar → `FORBIDDEN_FIELD`.
     - Eksik alanlar `SAFE_POLICY_DEFAULTS` ile merge edilir; `{}` bypass değildir.
   - `snoozeConfig`:
     - Yalnızca `allowed` (boolean), `maxCount` (0..10 tam sayı), `durationMinutes` (1..1440 tam sayı).
     - `currentCount` istemciden kabul edilmez; sunucu 0 atar.
   - `recurrence`:
     - `enabled` boolean; `frequency` `none|daily|weekly|weekdays|weekends|custom`; `daysOfWeek` 0..6 benzersiz tam sayılar (en fazla 7); `timeOfDay` `HH:MM` 00:00–23:59.
     - `enabled:true` ve `frequency:'none'` → `INVALID_RECURRENCE`.
   - `chain` mevcut kuralları korur; her halka yalnızca `action` ve `delayMinutes` taşır; fazla anahtar `FORBIDDEN_FIELD`.
   - Başarıda `{ ok:true, value }` döndür; `value` yalnızca beyaz listedeki alanların derin kopyasıdır. `ok` dışında bir şey bekleyen eski çağıranlar güncellenir.
4. **`AutomationTask` varsayılanlarını güvenli hale getir.**
   - `action` varsayılanı **kaldırılır**; model yalnızca doğrulanmış `action` ile kurulur. `new AutomationTask({})` çağrısı `INVALID_ACTION` fırlatır (iç çağıranlar dahil).
   - `safetyPolicy = { ...SAFE_POLICY_DEFAULTS, ...(data.safetyPolicy || {}) }`; bilinmeyen anahtarlar modele girmez.
   - `warningConfig = { enabled: data.warningConfig?.enabled !== false, durationSeconds: ... }`; `silentMode` tamamen kaldırılır.
   - `snoozeConfig` ve `recurrence` varsayılanlarla merge edilir; `currentCount` yalnızca yüklenen kalıcı görevde korunur, yeni görevde 0.
   - `source/status/enabled` modelde kalabilir ve yalnızca `TaskManager.createTask` context'inden gelir; `mode` context'ten gelmez, SQLite `autonomyMode` ayarından damgalanır.
5. **`TaskManager.createTask(data, context)` sözleşmesi.**
   - İmza: `createTask(taskData, context = {})`.
   - `taskData` yalnızca istemci alanları içerir; `SERVER_TASK_FIELDS` varsa `FORBIDDEN_FIELD` fırlat. Bu, IPC doğrulaması atlansa bile ikinci savunma hattıdır.
   - Sunucu alanları yalnızca `context`:
     - `source` (varsayılan `TASK_SOURCE.UI`)
     - `status` (varsayılan `TASK_STATUS.DRAFT`; süreli/zamanlı görevde `createTask` yine `SCHEDULED`/`MONITORING` türetir)
     - `enabled` (varsayılan `true`; yalnızca güvenilir iç çağıran `false` yapabilir)
     - `policyId`, `consoleOrderId`, `requiresMaintenanceWindow`
     - `warningConfig`, `safetyPolicy`, `snoozeConfig`, `recurrence` — yalnızca **güvenilir sunucu politikası** bu alanları sağlayabilir (örn. konsol `warningSeconds:0`); context değeri doğrulanmış istemci değerini ezer, context yoksa istemci değeri kullanılır.
   - `mode` **her zaman** `this.storage.getSettings().autonomyMode === 'full' ? 'full' : 'classic'` olarak damgalanır. `context.mode` kabul edilmez; zincir halkası da kurulduğu andaki ayarı alır. Böylece D7 tek kaynak olur.
   - `id` her zaman `AutomationTask.generateId()`; `createdAt` sunucu zamanı.
   - `warningConfig.enabled:false` yalnızca `context.warningConfig` ile (konsol/enterprise politikası) mümkündür; IPC/AI/UI yolunda değil.
6. **İç çağıranları taşı.**
   - `main.js` `create-task`: `const v = validateTaskData(data); ... taskManager.createTask(v.value, { source: TASK_SOURCE.UI })`.
   - `main.js` `schedule-action`: `createTask({ name, action, trigger }, { source: TASK_SOURCE.UI })`; `source` payload'dan çıkar.
   - `LocalApiService.js` üç çağrı: `createTask({ name, action, trigger }, { source: TASK_SOURCE.LOCAL_API })`; `silentMode` ve `source` payload'dan çıkar.
   - `OrderExecutor.js` `apply-policy`: `materializeToTask` yalnızca istemci alanları döndürür; `createTask(taskData, { source: TASK_SOURCE.CONSOLE, consoleOrderId: order.nonce })`.
   - `OrderExecutor.js` güç eylemi: `createTask({ name, action, trigger }, { source: TASK_SOURCE.CONSOLE, consoleOrderId, policyId, requiresMaintenanceWindow, warningConfig: { enabled:true, durationSeconds:15 } })`.
   - `TaskManager.spawnChainLink`: `createTask({ name, action, safetyPolicy, warningConfig, snoozeConfig:{...currentCount:0}, trigger, chain:rest }, { source: task.source, policyId: task.policyId, requiresMaintenanceWindow: task.requiresMaintenanceWindow })`; `mode` payload'dan çıkar.
   - `EnterprisePolicies.materializeToTask`: `source`, `silentMode` ve ölü politika bayraklarını döndürme; yalnızca istemci alanları + `policyId` gibi meta alanları ayrı döndür.
   - `AutomationTask.fromLegacyTimer` kullanılmıyorsa kaldır; kullanılıyorsa `createTask` context'ine taşı.
7. **Renderer temizliği.**
   - `app.js:1017` ve `app.js:1031` civarındaki `source:'user_interface'` alanlarını kaldır.
   - `app.js:2062` AI görevindeki `mode` alanını kaldır; `localStorage.getItem('autonomyMode')` okumasını kaldır. Sunucu ayarı damgalar.
   - Görev formu yalnızca beyaz liste alanlarını gönderir; `status`, `enabled`, `policyId` gibi alanlar UI'da yoksa eklenmez.
8. **Kalıcı görev normalizasyonu.**
   - `init()` sırasında yüklenen görevlerde `silentMode` ve ölü politika anahtarlarını temizle.
   - `warningConfig.enabled === false` olan eski görevleri güvenli tarafa çek: `enabled:true`, aynı `durationSeconds`; her görev için bir kez `task_policy_normalized` audit kaydı yaz (detail: `warning_enabled`).
   - `mode` ve `source` mevcut kayıtlarda korunur; geçmiş payload kaynağı bilinemediği için geriye dönük `mode` değiştirilmez.
   - Normalizasyon `persistChanges()` ile tek seferde yazılır; hata olursa görev bellekte güvenli değerle çalışır, disk yazımı bir sonraki tick'te tekrar denenir.
9. **Şablon uyumu.**
   - `save-template` `validateTaskData` probe'unu kullanmaya devam eder; `action` zorunlu olduğu için eylemsiz şablonlar reddedilir. Mevcut şablonlarda eylemsiz kayıt varsa migrasyonla `action` eklenir veya şablon devre dışı bırakılır; sessiz varsayılan shutdown verilmez.
   - `validateTaskData` dönüş değeri `value` olduğu için `save-template` yalnızca `ok` kontrolü yapıyorsa da çalışır; yeni kod `value` kullanır.
10. **Testler.**
    - `validate.test.mjs`: tüm kabul/red senaryoları.
    - `taskmanager.test.mjs`: context ile source/status/mode; `FORBIDDEN_FIELD`; zincir; quick timer.
    - `localapi.test.mjs`: API görevi `source:'local_api'`, mode SQLite.
    - `order-executor.test.mjs`: konsol görevi `source:'console'`, policyId, maintenance window.
    - `automationtask.test.mjs`: varsayılanlar, `{}` reddi, `silentMode` yok.
    - Renderer testi: `source`/`mode` gönderilmediğini doğrula.
11. **D-05 temizliği.**
    - `silentMode` tüm kaynaklardan kaldırılır: `AutomationTask.js`, `LocalApiService.js`, `OrderExecutor.js`, `EnterprisePolicies.js`, test fixture'ları.
    - Eski kayıtlarda alan varsa okuma sırasında temizlenir; yeni şemada yok.
12. **Kanıt.**
    - K-03 ve D-05 satırlarını `docs/audit/V3_EVIDENCE_MATRIX.md` içinde test ID'leriyle eşle.

#### 7.4.2 Çıktılar

- `taskFields.js` ve güncellenmiş `validateTaskData` (beyaz liste + `value`).
- `AutomationTask` güvenli varsayılanları; `silentMode` ve ölü politika bayrakları kaldırılmış.
- `TaskManager.createTask(data, context)` ve tüm iç çağıranların taşınması.
- Kalıcı görev normalizasyonu ve audit kaydı.
- Renderer'dan `source`/`mode` gönderiminin kaldırılması.
- T03-01…T03-07 kanıtları.

#### 7.4.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Bir iç çağıran `source`/`mode` göndermeye devam eder ve runtime'da `FORBIDDEN_FIELD` alır | Yüksek | Orta | Tüm `createTask(` çağrılarını grep'le; tablo halinde taşı; entegrasyon testleri | Hatalı çağrıyı context'e taşı; alanı sessizce yok sayma |
| `validateTaskData` dönüş şekli eski çağıranları kırar | Orta | Orta | `ok` kontrolü korunur; `value` opsiyonel okunur; tüm çağıranlar test edilir | Çağıranı `v.value ?? data` ile geçici uyumlu yap, sonra temizle |
| Mevcut şablonlarda `action` yok | Orta | Orta | Migrasyon/şablon denetimi; eylemsiz şablonu reddet | Şablonu devre dışı bırak; varsayılan shutdown verme |
| Eski görevlerde `warningConfig.enabled:false` | Orta | Yüksek | Yüklemede güvenli tarafa çek + audit; kullanıcıya sürüm notu | Görev çalışmadan önce uyarıyı zorunlu kıl |
| Konsol `warningSeconds:0` politikası artık uygulanamaz | Orta | Orta | `context.warningConfig` sunucu yolu; test | Politikayı reddet veya minimum 1 sn'ye yükselt |
| Zincir halkası beklenen modu kaybeder | Orta | Orta | Mod her zaman kuruluş anındaki SQLite ayarından; sürüm notunda açıkla | Zincir halkasını ebeveyn moduyla damgalamak ürün kararıysa ayrı WP |
| `safetyPolicy:{}` merge edilirken yeni alan unutulur | Orta | Yüksek | Ortak `SAFE_POLICY_DEFAULTS`; test tüm anahtarları doğrular | Eksik alanı `true` varsayılanla kapat |
| Normalizasyon audit yazamaz | Düşük | Orta | Audit hatasında görev bellekte güvenli; disk yazımı retry | Bir sonraki açılışta tekrar dene |

#### 7.4.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T03-01 | Boş/eksik görev | `{}`, `{name:'x'}`, `{action:'gecersiz'}` | `INVALID_ACTION`; görev oluşmaz | `TaskManager.tasks` uzunluğu değişmez |
| T03-02 | Uyarıyı kapatma / silentMode | `{action:'shutdown', warningConfig:{enabled:false}}`; `{...,silentMode:true}` | `WARNING_CANNOT_DISABLE` / `FORBIDDEN_FIELD` | Hiçbiri görev oluşturmaz |
| T03-03 | Sunucu alanı enjeksiyonu | `mode`, `source`, `status`, `enabled`, `policyId`, `consoleOrderId`, `requiresMaintenanceWindow`, `createdAt` ayrı ayrı | Her biri `FORBIDDEN_FIELD` | Hata alan adını içerir; görev yok |
| T03-04 | Kısmi politika | `{action:'shutdown', safetyPolicy:{checkProtectedApps:false}}` | Diğer üç kontrol `true` kalır; yalnızca verilen alan false | `SAFE_POLICY_DEFAULTS` merge; bypass yok |
| T03-05 | İç içe şema | Geçersiz `snoozeConfig.maxCount`, `recurrence.timeOfDay`, `recurrence.daysOfWeek`, `chain` fazla alan | `INVALID_SNOOZE` / `INVALID_RECURRENCE` / `INVALID_CHAIN` / `FORBIDDEN_FIELD` | Görev oluşmaz; hata kodu doğru |
| T03-06 | İç çağıranlar | Quick timer, AI, Local API, OrderExecutor, zincir | Her görevde source doğru; mode SQLite ile aynı; warning/policy korunur | `source` beklenen; `mode` ayarla eşit; `silentMode` yok |
| T03-07 | Kalıcı normalizasyon | `enabled:false` uyarılı eski görev yükle; şablon probe | Uyarı `enabled:true`; audit `task_policy_normalized`; eylemsiz şablon reddedilir | Görev çalışırken uyarı açılır; audit 1 kayıt |

#### 7.4.5 Geri alma

- Kod commit'ini geri al; şema değişikliği veri migrasyonu gerektirmez (aynı alanlar).
- `silentMode` alanı geri gelirse eski istemci uyumluluğu artar ama D-05 açılır; geri alma yalnızca acil rollback içindir.
- `warningConfig.enabled` normalizasyonu geri alınmaz; güvenli tarafa çekilmiş kayıtlar kullanıcı lehine kalır.
- Şablon reddi geri alınırsa eylemsiz şablonlar yeniden kabul edilir; bu güvenlik regresyonudur, önerilmez.

#### 7.4.6 Definition of Done (DoD)

- [ ] `action` zorunlu; `{}` görev oluşturmuyor.
- [ ] İstemci `warningConfig.enabled:false` gönderemiyor; `silentMode` şemada yok.
- [ ] `mode`, `source`, `status`, `enabled`, `policyId`, `consoleOrderId`, `requiresMaintenanceWindow`, `createdAt` istemciden reddediliyor.
- [ ] `safetyPolicy:{}` güvenli varsayılanlarla merge ediliyor; dört kontrol açık.
- [ ] `snoozeConfig`, `recurrence`, `chain` iç içe doğrulanıyor.
- [ ] Tüm iç çağıranlar `context` kullanıyor; `source` ve `mode` payload'da yok.
- [ ] Kalıcı görevlerde `silentMode` temizleniyor; uyarısız eski görevler güvenli tarafa çekiliyor.
- [ ] T03-01…T03-07 yeşil; `it.fails` kaldırılmış.
- [ ] `npm test` ve `npm run test:security` yeşil.

---

### 7.5 WP-04 — Otonomi modu tek kaynak + tray PIN akışı

| Alan | Değer |
|---|---|
| **Bulgular** | K-04, O-12 |
| **Öncelik** | P0 / G1 |
| **Bağımlılık** | WP-03 |
| **Kapı** | G1 |
| **Ana dosyalar** | `main.js`, `src/main/tray/autonomyAction.js` (yeni), `src/main/services/TaskManager.js`, `src/renderer/app.js`, `preload.js`, `src/renderer/locales/*.json`, `tests/main/taskmanager.test.mjs`, `tests/renderer/settings-autonomy.test.mjs` |
| **İlgili kararlar** | D7, D8 |

**Amaç:** `autonomyMode` için tek doğruluk kaynağı SQLite olmak; tray'den doğrudan yazma yapılmamak; mod değişikliği yalnızca PIN'li `security-settings-update` akışından geçmek; oluşturulan her görevin modu kuruluş anındaki SQLite ayarıyla damgalanmak.

#### 7.5.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/main/p0/k04-autonomy.test.mjs` içindeki `it.fails` senaryolarını gerçek testlere dönüştür.
   - Mevcut kodda tray tıklamasının PIN'siz `storageService.updateSettings({autonomyMode})` yazdığını; AI görevinin `localStorage` değerini kullandığını kanıtla.
2. **Tray action'ını saf modüle ayır.**
   - `src/main/tray/autonomyAction.js`:
     ```js
     function requestAutonomyModeChange({ mainWindow, desiredMode, t }) {
       if (desiredMode !== 'full' && desiredMode !== 'classic') {
         return { ok: false, code: 'INVALID_MODE' };
       }
       if (!mainWindow || mainWindow.isDestroyed()) {
         return { ok: false, code: 'WINDOW_UNAVAILABLE', message: t('trayWindowUnavailable') };
       }
       mainWindow.show();
       if (mainWindow.isMinimized()) mainWindow.restore();
       mainWindow.focus();
       mainWindow.webContents.send('request-security-settings', {
         setting: 'autonomyMode',
         value: desiredMode,
         reason: 'tray'
       });
       return { ok: true };
     }
     ```
   - Modül `storageService` import etmez; yazma yetkisi yoktur. Testte fake `mainWindow` ile doğrulanır.
3. **Tray menüsünü düzelt.**
   - `main.js` tray menüsündeki mod öğesi:
     - `const desired = mode === 'full' ? 'classic' : 'full';`
     - `requestAutonomyModeChange({ mainWindow, desiredMode: desired, t });`
     - `scheduleTrayUpdate();` yalnızca görsel yenileme; yazma yok.
   - `storageService.updateSettings({ autonomyMode: ... })` satırı tamamen kaldırılır.
   - `mainWindow` yoksa/destroyed ise tray balloon ile “Ayarlar penceresini açın” mesajı; sessizce yazma yok.
4. **Renderer olayını bağla.**
   - `preload.js`: `onSecuritySettingsRequest: (callback) => { const h = (_e, data) => callback(data); ipcRenderer.on('request-security-settings', h); return () => ipcRenderer.removeListener('request-security-settings', h); }`.
   - `app.js` başlangıcında:
     - `switchView('nav-settings')`.
     - İstenen mod radio'sunu geçici olarak işaretle.
     - `saveSecuritySettings({ autonomyMode: value }, commit, { quiet:false, onCancel: restoreRadio })` çağır.
     - `commit`: `settingsState.autonomyMode = value;` radio'yu kalıcı işaretle; `showToast(t('toastSettingsSaved'))`; localStorage'a **yazma**.
     - `onCancel`: radio'yu `settingsState.autonomyMode` değerine geri al.
   - PIN yoksa: `saveSecuritySettings` `PIN_REQUIRED` alır; `getCancelPinState().set === false` ise PIN modalı açma; `showToast(t('pinSetRequiredForMode'), 'error')` ve radio'yu geri al. Kullanıcı önce PIN kurmalı.
   - PIN varsa: mevcut `requestPin` modalı açılır; doğru PIN'de yazma, yanlışta hata/kilit; iptalde radio geri alınır.
5. **`security-settings-update` sonrası tray'i yenile.**
   - `main.js` handler'ında `applySettingsPatch` başarılıysa `scheduleTrayUpdate(true)` çağır.
   - İsteğe bağlı: `mainWindow.webContents.send('settings-changed', { autonomyMode: patch.autonomyMode })`; renderer radio'yu bu olayla senkronlar.
   - Tray etiketi `settings.autonomyMode` kaynağından okunmaya devam eder; doğrudan yazma kaldırıldığı için etiket ile davranış aynı olur.
6. **`TaskManager.createTask` mod damgası.**
   - WP-03'te eklenen `createTask(data, context)` içinde:
     ```js
     const effectiveMode = this.storage.getSettings().autonomyMode === 'full' ? 'full' : 'classic';
     ```
   - `mode` context'ten **kabul edilmez**; tüm görevler (UI, AI, quick timer, local_api, console, zincir) kuruluş anındaki ayarı alır.
   - Mevcut görevlerin modu değişmez; mod değişikliği “sonraki görevden” geçerlidir. Bu davranış sürüm notunda açıklanır.
7. **Renderer'dan localStorage bağımlılığını kaldır.**
   - `app.js:804` `autonomyMode` okumasını kaldır; `loadSettings()` yerine `hydrateSecuritySettings()`:
     ```js
     const s = await window.electronAPI.getSettings();
     const mode = s && s.autonomyMode === 'full' ? 'full' : 'classic';
     settingsState.autonomyMode = mode;
     document.querySelector(`input[name="autonomyMode"][value="${mode}"]`).checked = true;
     ```
   - `app.js:2061` AI görevindeki `localStorage` okumasını ve `mode` alanını kaldır.
   - `app.js:3217` `previous.autonomyMode` değerini `settingsState.autonomyMode` üzerinden al.
   - `app.js:3248` `localStorage.setItem('autonomyMode', ...)` satırını kaldır.
   - Eski `localStorage.autonomyMode='full'` değeri **okunmaz ve SQLite'a terfi ettirilmez** (D8). Kullanıcı full modu PIN ile yeniden etkinleştirir.
8. **Ayarlar kaydetme akışı (G1 için geçici).**
   - `btn-settings-save`: güvenlik dışı ayarlar kaydedildikten sonra `saveSecuritySettings({ autonomyMode }, commit, ...)` çağrısı korunur. **Bu sıra yalnız G1 kapanana kadardır; O-11'i kapatmaz.**
   - `commit` yalnızca PIN başarısından sonra çalışır; `settingsState.autonomyMode` güncellenir; localStorage yazılmaz.
   - `onCancel`/`PIN_REQUIRED` durumunda radio eski değere döner; güvenlik dışı ayarlar zaten kaydedilmişse bu ayrı bir UI durumudur, modun değişmediği açıkça gösterilir.
   - **WP-11 zorunlu geçiş:** G2'de `saveSecuritySettings` önce, genel ayarlar sonra çalışacak şekilde sıra değiştirilir; WP-04'ün bu geçici sırası G2 sonrası üretimde kalmaz (T11-04/T11-05).
9. **i18n.**
   - `pinSetRequiredForMode`, `trayWindowUnavailable`, `modeChangeRequiresPin`, `modeChanged` anahtarlarını 17 locale dosyasına ekle; çevirisi olmayanlarda İngilizce fallback.
10. **Testler.**
    - `tests/main/p0/k04-autonomy.test.mjs`: tray action, mode damgası, localStorage yok sayma.
    - `tests/renderer/settings-autonomy.test.mjs`: `request-security-settings` olayı, PIN yok/PIN var, cancel/restore, localStorage yazmama.
    - `tests/main/taskmanager.test.mjs`: UI/AI/API/console/zincir görevlerinde `mode` SQLite ile aynı.
    - E2E: ayarlar ekranından mod değiştir; PIN sor; doğru PIN'de tray/ayar etiketi güncellenir; yanlışta değişmez.
11. **Manuel Windows kontrolü.**
    - Tray ikonuna sağ tık → mod değiştir → ana pencere açılır, PIN modalı gelir.
    - PIN yokken mod değişmez; kullanıcıya PIN kurma mesajı gelir.
    - PIN varken doğru PIN modu değiştirir; tray etiketi güncellenir.
    - Uygulama yeniden başlatıldığında mod SQLite'tan gelir; localStorage'daki eski değer etkilemez.
12. **Kanıt.**
    - K-04 ve O-12 satırlarını test + manuel kanıtla eşle.

#### 7.5.2 Çıktılar

- `src/main/tray/autonomyAction.js` ve testleri.
- Tray menüsünde doğrudan yazmanın kaldırılması; PIN'li pencere akışı.
- `createTask` mod damgası; tüm kaynaklar için tek kaynak.
- Renderer'da localStorage `autonomyMode` kullanımının kaldırılması.
- T04-01…T04-06 kanıtları ve Windows manuel kaydı.

#### 7.5.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| PIN'siz kullanıcı modu hiç değiştiremez | Yüksek | Orta | UI'da “önce PIN kurun” yönlendirmesi; PIN kurulumu aynı ekranda | Mod değişikliğini PIN kurulumuna yönlendir; PIN'siz yazma yok |
| Tray olayı renderer hazır değilken kaybolur | Orta | Orta | `did-finish-load` sonrası gönder; pencereyi göster; isteği kuyrukla | Kullanıcıya “Ayarlar > Otonomi” yönlendirmesi |
| Eski `localStorage.full` kullanıcıyı yanıltır | Orta | Orta | Değer okunmaz; sürüm notu; UI SQLite'tan doldurulur | Kullanıcı PIN ile yeniden etkinleştirir |
| Mevcut zamanlanmış görevler eski modda kalır | Orta | Düşük | “Kuruluş anında damga” sürüm notu; yeni görevler yeni modu alır | Gerekirse görev bazında yeniden damgalama ayrı özellik |
| `security-settings-update` PIN_REQUIRED ile “PIN yok” ayrımı karışır | Orta | Orta | `getCancelPinState().set` ile ayır; PIN yoksa modal açma | PIN_REQUIRED mesajını genel tut, kullanıcıyı PIN kartına yönlendir |
| Tray etiketi güncellenmez | Orta | Düşük | Başarılı yazımdan sonra `scheduleTrayUpdate(true)`; imza testi | Tray'i yeniden oluştur |
| Headless modda tray yok | Düşük | Düşük | Headless'ta tray kodu çalışmaz; mod API/consol üzerinden PIN'li yoldan değişir | Etkilenmez |

#### 7.5.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T04-01 | PIN yokken tray mod değişimi | Tray mod öğesine tıkla; `getSettings().autonomyMode` oku | Değer değişmez; ana pencere açılır; PIN kurma mesajı | `autonomyMode` aynı; `updateSettings` çağrısı yok |
| T04-02 | PIN varken tray mod değişimi | PIN kur; tray → full; yanlış PIN; doğru PIN | Yanlışta değişmez; doğruda `full`; audit kaydı | `security-settings-update` başarılı; tray etiketi Full |
| T04-03 | Görev modu tek kaynak | SQLite `full`; UI, AI, API, console, zincir görevi oluştur | Hepsinin `mode === 'full'` | Beş kaynakta da eşit |
| T04-04 | localStorage yok sayılır | localStorage `autonomyMode=full`, SQLite `classic`; uygulamayı başlat | UI ve yeni görevler `classic` | Radio classic; görev mode classic |
| T04-05 | Tray etiketi senkronu | Mod değiştir; `scheduleTrayUpdate` çalıştır | Tray etiketi yeni modu gösterir | `trayModeFull`/`trayModeClassic` doğru |
| T04-06 | PIN kapısı fail-closed | PIN yokken `security-settings-update({autonomyMode:'full'})`; PIN kurup tekrar dene | İlki `PIN_REQUIRED`, değişiklik yok; ikincisi başarılı | SQLite değeri sırasıyla classic → full |

#### 7.5.5 Geri alma

- Kod commit'ini geri al; `autonomyMode` SQLite alanı aynı kalır, veri migrasyonu yok.
- Tray doğrudan yazma geri gelirse K-04 yeniden açılır; geri alma yalnızca acil rollback içindir ve release notunda belirtilir.
- localStorage'a yazma geri getirilmez; eski değerler zaten otorite değildir.
- Kullanıcı PIN'i değişmediyse mod değeri korunur.

#### 7.5.6 Definition of Done (DoD)

- [ ] Tray mod öğesi doğrudan `autonomyMode` yazmıyor; pencere + PIN akışına yönlendiriyor.
- [ ] PIN yokken mod değişmiyor; kullanıcı PIN kurmaya yönlendiriliyor.
- [ ] PIN varken yalnızca doğru PIN modu değiştiriyor; audit kaydı var.
- [ ] `TaskManager.createTask` modu SQLite'tan damgalıyor; context/payload modu kabul edilmiyor.
- [ ] UI/AI/API/console/zincir görevleri aynı modu alıyor.
- [ ] Renderer `autonomyMode` için localStorage okumuyor/yazmıyor.
- [ ] Tray etiketi başarılı değişimden sonra güncelleniyor.
- [ ] T04-01…T04-06 yeşil; Windows manuel matrisi kaydedilmiş.

---

### 7.6 G1 — P0 çıkış kontrolü

`G1` aşağıdaki maddelerin tamamı sağlanmadan kapanmaz:

- [ ] WP-00 G0 DoD tamam.
- [ ] WP-01 K-01 kapanışı: PIN değiştirme/silme mevcut PIN'e bağlı; audit atomik; T01-01…T01-08 yeşil.
- [ ] WP-02 K-02 kapanışı: `warning-confirm` `taskId+epoch`; A→B yarışı kapalı; T02-01…T02-07 yeşil.
- [ ] WP-03 K-03 + D-05 kapanışı: beyaz liste, zorunlu action, güvenli uyarı/politika; T03-01…T03-07 yeşil.
- [ ] WP-04 K-04 + O-12 kapanışı: tek kaynak mod, tray PIN akışı; T04-01…T04-06 yeşil.
- [ ] Dört `it.fails` iskeleti normal teste çevrilmiş; hiçbiri kalmamış.
- [ ] `npm test`, `npm run test:security`, `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G1`, `npm run test:e2e`, `npm run locales:check` yeşil.
- [ ] `docs/audit/V3_EVIDENCE_MATRIX.md` içinde K-01…K-04, D-05 ve O-12 satırları kanıtla dolu.
- [ ] `1.1.1` sürüm notu taslağında P1’in bu aşamada henüz açık olduğu ve sürüm adayının G2’den önce üretilmeyeceği belirtilmiş; genel yayın yapılmamış.

---

## 8. P1 — Güvenlik Sertleştirmesi (WP-05 – WP-13)

> **Gate kuralı:** `G2` kapanmadan `1.1.1` sürüm adayı üretilmez. Bu aşamada Y-01, Y-02, Y-05, Y-06, Y-07, O-02, O-04, O-05, O-06, O-08, O-10, O-11, O-13, D-06 ve D-08 kapanır.
>
> **Sıra:** `WP-05` WP-00 sonrası, `WP-06` WP-01 + WP-04 sonrası başlar; ikisi paralel ilerleyebilir. `WP-07` WP-03'e; `WP-08` bağımsız olarak WP-00'a; `WP-09` WP-08'e; `WP-10` bağımsız olarak WP-00'a; `WP-11` WP-01 + WP-05 + WP-08'e; `WP-12` WP-02 + WP-03'e; `WP-13` WP-11'e bağlıdır. Aynı dosyaya dokunan sıra zorunludur: `WP-03 → WP-12`, `WP-05 → WP-11 → WP-13`, `WP-08 → WP-09 → WP-11`.

### 8.1 WP-05 — Public settings projeksiyonu + savunmacı `getSettings()`

| Alan | Değer |
|---|---|
| **Bulgular** | Y-01, D-06 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/security/PublicSettings.js` (yeni), `src/main/services/StorageService.js`, `src/main/security/SecretStore.js`, `main.js`, `preload.js`, `src/renderer/app.js`, `src/index.html`, `src/renderer/locales/*.json`, `tests/main/public-settings.test.mjs`, `tests/main/storage.test.mjs` |
| **İlgili kararlar** | D1, D9 |

**Amaç:** Renderer’a giden her ayar yanıtını dar bir “public settings” projeksiyonuna indirmek; çözülmüş sırları, PIN hash/salt’ını ve webhook sırlarını süreç sınırının dışına çıkarmamak. `StorageService.getSettings()` çağıranın iç nesneyi mutasyona uğratamayacağı bir kopya döndürmek.

#### 8.1.1 Uygulama adımları

1. **Kırmızı testi yeşile çevir.**
   - `tests/main/public-settings.test.mjs` içinde `get-settings` yanıtında `consoleAgentKey`, `localApiKeyPem`, `localApiPfxPassphrase`, `consoleClientKeyPem`, `consoleClientPfxPassphrase`, `localApiKeyHash`, `cancelPinHash`, `cancelPinSalt` alanlarının **bulunmadığını**; `hasConsoleAgentKey`, `hasLocalApiKey`, `hasCancelPin` boolean’larının bulunduğunu doğrula.
   - `tests/main/storage.test.mjs` içinde `getSettings()` sonucunun mutate edilmesinin iç state’i değiştirmediğini doğrula.
2. **Public projeksiyonu ayır.**
   - `src/main/security/PublicSettings.js` oluştur:
     - `SECRET_SETTING_FIELDS` listesini `SecretStore`’dan import et; listeyi ikinci kez kopyalama.
     - `HASH_OR_SALT_FIELDS = ['localApiKeyHash','cancelPinHash','cancelPinSalt','auditHmacKey']`.
     - `WEBHOOK_SECRET_FIELDS = ['bearerToken','basicAuthPass','hmacSecret']`.
     - `publicSettings(settings)`:
       - Girdiyi `structuredClone` ile kopyala; `null`/dizi gelirse boş nesne döndür.
       - Üst düzey sır ve hash/salt alanlarını **sil**.
       - `webhooks` varsa her kayıttan üç sır alanını sil; yerine `hasBearerToken`, `hasBasicAuthPass`, `hasHmacSecret` boolean’ları koy.
       - `hasConsoleAgentKey`, `hasLocalApiKey` (`localApiKeyHash` veya `localApiKeyPem` doluysa), `hasLocalApiTlsKey` (`localApiKeyPem`), `hasLocalApiPfxPassphrase`, `hasConsoleClientKey`, `hasCancelPin` boolean’larını ekle.
       - `localApiKeyMasked`, `localApiKeyCreatedAt`, `localApiKeyRole` gibi sır olmayan meta alanları koru.
       - Döndürülen nesnede `__proto__`, `constructor`, `prototype` anahtarları bulunmasın.
   - `publicSettings` saf fonksiyon olmalı; Electron/StorageService import etmemeli.
3. **`StorageService.getSettings()` savunmacı hale getir.**
   - `return structuredClone(this.data.settings)` kullan; `structuredClone` yoksa `JSON.parse(JSON.stringify(...))` fallback’i ekle (Node 24’te gerekmez, test edilebilirlik için).
   - `getSetting(key)` ve `getSettingsSnapshot()` ekle; mevcut çağıranlar `getSettings()` ile uyumlu kalır.
   - `updateSettings` ve `updateSettingsWithAudit` hâlâ iç state’i güncelleyen tek yol olmalı; hiçbir çağıran `storageService.data.settings` üzerinden yazmamalı. `applySettingsPatch` içindeki doğrudan `storageService.data.settings[field] = value` satırları WP-11’de kaldırılacak; WP-05’te bu satırları `storageService.updateSettings({ [field]: value })` ile değiştir.
4. **IPC yanıtlarını projeksiyona bağla.**
   - `get-settings`: `publicSettings(storageService.getSettings())`.
   - `save-settings` başarı yanıtı: `{ success: true, settings: publicSettings(storageService.getSettings()) }`.
   - `security-settings-update` başarı yanıtı da aynı projeksiyonu kullanır.
   - `get-security-status` zaten ayrı ve dar; secret alanı ekleme.
   - `preload.getSettings` sözleşmesi değişmez; yalnızca dönen gövde daralır.
5. **Renderer’ı `has*` alanlarına geçir.**
   - API/TLS ekranında sır alanlarının “dolu/boş” göstergesi varsa `hasConsoleAgentKey`, `hasLocalApiKey`, `hasLocalApiTlsKey` üzerinden göster.
   - `getSettings()` yanıtında sır bekleyen hiçbir kod kalmadığını `grep` ile doğrula; özellikle `consoleAgentKey`, `localApiKeyPem`, `localApiPfxPassphrase`, `consoleClientKeyPem`, `consoleClientPfxPassphrase`.
   - Kullanıcı sır alanını boş bırakırsa mevcut sır korunur; “temizle” için açık bir checkbox/buton kullan ve `null` gönder. Boş string `INVALID_SECRET` olarak reddedilir.
6. **i18n.**
   - `has*` durumları için yeni anahtarlar: `secretConfigured`, `secretNotConfigured`, `clearSecret`, `secretClearHint`.
   - `tr`/`en` tam; diğer 15 locale’de İngilizce fallback. `npm run locales:check` yeşil.
7. **Testler.**
   - `public-settings.test.mjs`: düz settings, iç içe webhook, `null` webhook, prototype pollution denemesi, `has*` doğruluğu.
   - `storage.test.mjs`: shallow/deep mutate, `getSetting`, snapshot bağımsızlığı, `structuredClone` fallback.
   - `ipc-security.test.mjs`: `get-settings`, `save-settings` ve `security-settings-update` yanıtlarında sır yok.
   - Renderer testi: ayarlar ekranı `has*` ile render ediliyor; sır alanı DOM’a yazılmıyor.
8. **Kanıt.**
   - Y-01 ve D-06 satırlarını `docs/audit/V3_EVIDENCE_MATRIX.md` içinde T05 testleriyle eşle.

#### 8.1.2 Çıktılar

- `src/main/security/PublicSettings.js` ve testleri.
- `StorageService.getSettings()` deep clone; `getSetting`/`getSettingsSnapshot`.
- `get-settings`, `save-settings`, `security-settings-update` public projeksiyon yanıtları.
- Renderer’da `has*` tabanlı sır durumu ve 4 yeni i18n anahtarı.
- T05-01…T05-05 kanıtları.

#### 8.1.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Renderer sır alanını okuyup davranış değiştiriyor | Orta | Yüksek | `grep` + renderer testi; `has*` alanlarına geçiş | Eksik kalan ekranı public projeksiyonla uyumlu hale getir; sırrı geri açma |
| `structuredClone` her çağrıda maliyet üretir | Düşük | Düşük | Ayarlar küçük; profilde ölç; gerekirse `getSetting` kullan | Sıcak yollarda `getSetting`’e geç |
| Mevcut testler iç nesne mutasyonuna dayanıyor | Orta | Orta | Testleri `updateSettings` kullanacak şekilde düzelt; davranışı değiştirme | Geçici `getSettingsSnapshot` ile uyumluluk |
| `publicSettings` bilinmeyen yeni sır alanını kaçırır | Orta | Yüksek | `SecretStore` listesini tek kaynak yap; yeni sır eklenince test | Alanı açık listeye ekle; otomatik `*Hash` sezgisi kullanma |
| Webhook sırları başka uçtan sızar | Orta | Orta | `save-webhooks/get-webhooks` yanıtlarını da aynı projeksiyondan geçir | Ayrı webhook public projeksiyonu; sırları hiç döndürme |
| `null` ile “koru” karışır | Orta | Orta | `undefined` = koru, `null` = temizle, boş string = hata | UI’da açık “temizle” onayı |

#### 8.1.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T05-01 | Sırlar projeksiyondan çıkar | `consoleAgentKey`, `localApiKeyPem`, `...Passphrase`, `localApiKeyHash`, `cancelPinHash`, `cancelPinSalt` dolu settings ile `get-settings` | Hiçbiri yanıtta yok; `has*` boolean’ları doğru | `Object.keys` assert; JSON string’de sır değeri yok |
| T05-02 | Webhook sırları | Webhook’ta `bearerToken/basicAuthPass/hmacSecret` | Alanlar yok; `has*` var | Üç alan da yok |
| T05-03 | Kaydetme yanıtı | `save-settings` ve `security-settings-update` | Aynı public projeksiyon | Sır alanı yok; `success:true` |
| T05-04 | Savunmacı kopya | `const s = getSettings(); s.language='x'; s.webhooks.push(...)` | Sonraki `getSettings()` değişmemiş | İç state ve disk aynı |
| T05-05 | Renderer sözleşmesi | Ayarlar ekranını public settings ile aç | Sır alanı DOM’a yazılmaz; `has*` gösterilir | Renderer testi yeşil |

#### 8.1.5 Geri alma

- Kod commit’ini geri al; public projeksiyon kaldırılırsa Y-01 yeniden açılır. Veri migrasyonu yok.
- `getSettings()` deep clone geri alınırsa D-06 yeniden açılır; çağıranların mutasyonuna güvenilmez.
- Sırlar hiçbir aşamada loglanmaz; rollback sırasında da log/audit’e sır yazılmaz.

#### 8.1.6 Definition of Done (DoD)

- [ ] `get-settings` ve tüm ayar yanıtlarında sır/hash/salt alanı yok.
- [ ] `has*` boolean’ları doğru ve renderer bunları kullanıyor.
- [ ] `getSettings()` deep clone; mutasyon iç state’i değiştirmiyor.
- [ ] Webhook sırları projeksiyondan çıkarılıyor.
- [ ] T05-01…T05-05 yeşil.
- [ ] `npm run test:security` ve `npm run locales:check` yeşil.

---

### 8.2 WP-06 — Tray pause/quit PIN kapısı

| Alan | Değer |
|---|---|
| **Bulgular** | Y-02 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-01, WP-04 |
| **Kapı** | G2 |
| **Ana dosyalar** | `main.js`, `src/main/tray/sensitiveAction.js` (yeni), `src/main/ipc/trayActions.js` (yeni), `src/main/services/TaskManager.js`, `preload.js`, `src/renderer/app.js`, `src/index.html`, `src/renderer/locales/*.json`, `tests/main/tray-pin.test.mjs`, `tests/renderer/tray-action.test.mjs` |
| **İlgili kararlar** | D10, D3 |

**Amaç:** Tray’den “Tümünü Duraklat” ve “Çıkış” eylemlerinin PIN korumalı iptal kapısını atlamasını engellemek. PIN kuruluysa bu eylemler ana pencereye yönlenir ve mevcut PIN doğrulanır; `isQuitting` yalnızca doğrulama/onay sonrası `true` olur.

#### 8.2.1 Uygulama adımları

1. **Kırmızı testi yeşile çevir.**
   - `tests/main/tray-pin.test.mjs`: PIN kurulu + tray pause → `automationPaused` değişmemeli; PIN kurulu + aktif görev + tray quit → `isQuitting` false kalmalı.
   - `tests/renderer/tray-action.test.mjs`: `request-sensitive-action` olayı PIN modalı/onay modalı açmalı; iptalde IPC çağrılmamalı.
2. **Saf karar modülü.**
   - `src/main/tray/sensitiveAction.js`:
     ```js
     function decideTrayAction({ action, hasPin, hasActiveTask, automationPaused }) {
       if (action === 'pause') {
         if (hasPin) return { mode: 'window-pin', nextPaused: !automationPaused };
         return { mode: 'direct', nextPaused: !automationPaused };
       }
       if (action === 'quit') {
         if (!hasActiveTask) return { mode: 'direct' };
         if (hasPin) return { mode: 'window-pin' };
         return { mode: 'window-confirm' };
       }
       return { mode: 'invalid' };
     }
     ```
   - Modül Electron/StorageService import etmez; yalnızca karar verir.
3. **`TaskManager` pause API’sini idempotent yap.**
   - `setPauseAll(value)` ekle: `this.pausedAll = value === true;` ve kalıcı yazım.
   - Yazım `storage.updateSettingsWithAudit` varsa onu kullan:
     - `{ automationPaused: this.pausedAll }`
     - audit `{ actor:'local_user', action: this.pausedAll ? 'automation_paused' : 'automation_resumed', target:'settings', detail:'' }`.
   - `updateSettingsWithAudit` yoksa `updateSettings` + `audit.append`; hata durumunda `pausedAll` eski değere döner ve `{ok:false, code:'PAUSE_PERSIST_FAILED'}` döner.
   - `togglePauseAll()` `setPauseAll(!this.pausedAll)` delegasyonu olur; mevcut çağıranlar `{ok}` sonucunu kontrol eder.
4. **Tray menüsünü yönlendir.**
   - Pause öğesi: `decideTrayAction({action:'pause', hasPin, hasActiveTask, automationPaused})`.
     - `direct` → `taskManager.setPauseAll(nextPaused)`; `scheduleTrayUpdate()`.
     - `window-pin` → `showMainWindowForTrayAction('pause', nextPaused)`; tray doğrudan yazmaz.
   - Quit öğesi:
     - `direct` → `isQuitting = true; app.quit();`.
     - `window-pin` / `window-confirm` → `showMainWindowForTrayAction('quit')`.
   - `showMainWindowForTrayAction(action, nextPaused)` ana pencereyi gösterir, restore/focus eder ve `webContents.send('request-sensitive-action', {action, nextPaused, requiresPin: hasPin})` gönderir.
   - Pencere yoksa/destroyed ise tray balloon ile “Ayarlar penceresini açın” mesajı; sessiz yazma yok.
5. **Yeni IPC.**
   - `src/main/ipc/trayActions.js`:
     - `executeTrayAction({ payload, deps })` async; payload `{action:'pause'|'quit', pin, nextPaused}`.
     - `action` beyaz liste; değilse `INVALID_TRAY_ACTION`.
     - `pause`: PIN kuruluysa `requireStoredPin(pin, 'tray-pause')`; başarılıysa `taskManager.setPauseAll(nextPaused)`; `PAUSE_PERSIST_FAILED` aynen döner.
     - `quit`: aktif görev varsa ve PIN kuruluysa `requireStoredPin(pin, 'tray-quit')`; başarılıysa `isQuitting = true; setImmediate(() => app.quit())`; `success:true` yanıtı önce gönderilir.
     - Aktif görev yoksa PIN istenmez; payload’daki pin yok sayılır.
   - `main.js` handler: `ipcHandle('execute-tray-action', (event, payload) => executeTrayAction({ payload, deps: { storageService, taskManager, requireStoredPin, app, setIsQuitting, t } }))`.
   - `ipcHandle`/`SenderGuard` korunur.
6. **Renderer akışı.**
   - `preload.onSensitiveActionRequest(callback)` ve `preload.executeTrayAction(args)` ekle; unsubscribe döndür.
   - `app.js`:
     - Olayda `switchView('nav-settings')` veya mevcut görünümde kal; modal aç.
     - `pause` + `requiresPin` → `requestPin(t('pinPromptTrayPause'), { run: (pin) => executeTrayAction({action:'pause', pin, nextPaused}), done: ... })`.
     - `pause` + PIN yok → doğrudan `executeTrayAction({action:'pause', nextPaused})`.
     - `quit` + `requiresPin` → PIN modalı; `quit` + `requiresPin:false` → onay modalı (`trayQuitConfirm`), “Çıkış”/“Vazgeç”.
     - Başarıda pause için toast; quit için pencere kapanır. Hata `PIN_WRONG/PIN_LOCKED/PAUSE_PERSIST_FAILED` eşlenir.
     - İptalde hiçbir IPC çağrısı yapılmaz; tray durumu değişmez.
   - Modal `pin-modal` yeniden kullanılır; yeni bir modal eklenmez.
7. **`before-quit` ve `isQuitting`.**
   - `before-quit` içinde `isQuitting = true` yalnızca gerçek çıkışta kalır; tray onayı olmadan `app.quit()` çağrılmaz.
   - `window-all-closed` davranışı WP-14’te in-flight görevle birlikte ele alınır; WP-06 kapsamında tray çıkışı PIN’siz atlanamaz.
8. **Audit ve gizlilik.**
   - `automation_paused`, `automation_resumed`, `app_quit_requested` kayıtları; PIN/hash yazılmaz.
   - `quit` audit’i `isQuitting` öncesi yazılır; audit yazılamazsa çıkış yine yapılır mı? Ürün kararı: çıkış engellenmez, ancak `audit_append_failed` loglanır ve yerel kullanıcı bilgilendirilir. (Çıkışı audit’e bağımlı kılmak kullanıcıyı uygulamada kilitleyebilir.)
9. **i18n.**
   - `pinPromptTrayPause`, `trayQuitConfirm`, `trayQuitConfirmActive`, `trayActionCancelled`, `trayWindowUnavailable` anahtarları; 17 locale.
10. **Testler.**
    - T06-01…T06-06; renderer testi; Windows manuel matrisi.
11. **Kanıt.**
    - Y-02 satırını test + manuel kayıtla eşle.

#### 8.2.2 Çıktılar

- `src/main/tray/sensitiveAction.js`, `src/main/ipc/trayActions.js` ve testleri.
- `TaskManager.setPauseAll` + audit.
- Tray pause/quit PIN/onay akışı; renderer modal ve preload sözleşmesi.
- T06-01…T06-06 kanıtları.

#### 8.2.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Renderer hazır değilken tray olayı kaybolur | Orta | Orta | Pencereyi göster; `did-finish-load` sonrası gönder; isteği kuyrukla | Kullanıcıyı Ayarlar ekranına yönlendir |
| PIN olmayan kullanıcı yanlışlıkla çıkış onaylar | Orta | Orta | Aktif görev varsa onay modalı; varsayılan odak “Vazgeç” | Onay metnini netleştir |
| `execute-tray-action` çift tıklamayla iki kez çalışır | Orta | Orta | Butonu disable; `pause` idempotent; `quit` `isQuitting` guard | İkinci çağrı `ALREADY_QUITTING` |
| Pause audit yazılamazsa ayar uygulanır | Orta | Orta | `setPauseAll` fail-closed; eski değere dön | Kullanıcıya tekrar dene |
| PIN scope’ları paylaşılır | Düşük | Orta | `tray-pause`/`tray-quit` ayrı scope | Ayrı sayaç/kilit |
| Headless’ta tray yok | Düşük | Düşük | Kod yolu çalışmaz; API/consol pause kullanır | Etkilenmez |

#### 8.2.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T06-01 | PIN yok, pause | Tray pause | Doğrudan `automationPaused` değişir; audit | Değer tersine döner; audit 1 |
| T06-02 | PIN var, pause | Tray pause; iptal; sonra doğru PIN | İptalde değişmez; doğruda değişir | `updateSettingsWithAudit` yalnız doğruda çağrılır |
| T06-03 | PIN var, aktif görev, quit | Tray quit; yanlış/doğru PIN | Yanlışta çıkış yok; doğruda çıkış | `isQuitting` sırasıyla false/true |
| T06-04 | PIN yok, aktif görev, quit | Tray quit; onay modalı; vazgeç/onayla | Vazgeçte çıkış yok; onayda çıkış | Onay olmadan `app.quit` yok |
| T06-05 | Aktif görev yok, quit | Tray quit | PIN/onay sorulmadan çıkış | `isQuitting` true; tek audit |
| T06-06 | Geçersiz payload / çift çağrı | `{action:'x'}`; iki kez quit | `INVALID_TRAY_ACTION`; ikinci `ALREADY_QUITTING` | State bozulmaz |

#### 8.2.5 Geri alma

- Kod commit’ini geri al; `automationPaused` SQLite alanı aynı kalır.
- Tray doğrudan yazma geri gelirse Y-02 yeniden açılır; geri alma yalnızca acil rollback içindir.
- `setPauseAll` yerine eski `togglePauseAll` dönerse audit ve hata kontrolü kaybolur; release notunda belirtilir.

#### 8.2.6 Definition of Done (DoD)

- [ ] PIN kuruluysa tray pause/quit doğrudan yazmıyor; ana pencere + PIN akışı kullanılıyor.
- [ ] PIN yokken pause doğrudan çalışıyor; aktif görev varsa quit onay istiyor.
- [ ] `isQuitting` yalnızca doğrulama/onay sonrası true.
- [ ] Pause kalıcı yazımı audit’li ve hata durumunda geri alınıyor.
- [ ] T06-01…T06-06 yeşil; Windows manuel matrisi kayıtlı.
- [ ] `npm test` ve `npm run test:security` yeşil.

---

### 8.3 WP-07 — SafetyPolicyEngine fail-closed + kullanıcı etkinliği

| Alan | Değer |
|---|---|
| **Bulgular** | Y-05 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-03 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/services/SafetyPolicyEngine.js`, `src/main/services/models/taskFields.js`, `main.js`, `src/agent/headless.js`, `src/main/services/TaskManager.js`, `tests/main/safety.test.mjs`, `tests/main/safety-enterprise.test.mjs` |
| **İlgili kararlar** | D11, D12, D5 |

**Amaç:** Kısmi `safetyPolicy` nesnesinin güvenlik kontrollerini atlamasını engellemek; ayar/politika/muafiyet/bakım penceresi/sunucu profili okunamadığında yıkıcı eylemi reddetmek. `checkUserActivity`’yi yalnızca UI dışı kaynaklarda ve ölçüm yoksa `deny` olacak şekilde uygulamak.

#### 8.3.1 Uygulama adımları

1. **Kırmızı testi yeşile çevir.**
   - `safety.test.mjs`: `{safetyPolicy:{checkProtectedApps:true}}` ile dört kontrolün de çalıştığını; `storage.getSettings()` throw ettiğinde `allowed:false` döndüğünü doğrula.
   - `safety-enterprise.test.mjs`: muafiyet/bakım/sunucu profili okuma hatasında `deny` üretildiğini doğrula.
2. **Varsayılanları tek kaynaktan merge et.**
   - `taskFields.js` içindeki `SAFE_POLICY_DEFAULTS` (`checkUserActivity`, `checkProtectedApps`, `checkFullscreen`, `checkSystemLoad` = true) WP-03’te eklendi; engine aynı sabiti import eder.
   - `const policy = { ...SAFE_POLICY_DEFAULTS, ...(task.safetyPolicy || {}) };`
   - Bilinmeyen anahtarlar engine’e girmez; WP-03 zaten şemada reddediyor, engine ikinci savunma olarak yalnızca dört anahtarı okur.
3. **Ayar okumasını fail-closed yap.**
   - `let settings; try { settings = this.storage.getSettings(); } catch (err) { return deny('POLICY_UNAVAILABLE', ...); }`
   - `this.storage` yoksa da `POLICY_UNAVAILABLE`; “ayar yok” diye devam etme.
   - `agentDisabled === true` → `AGENT_DISABLED`.
4. **Kullanıcı etkinliği kontrolünü uygula.**
   - `task.source` UI (`user_interface`) ise `checkUserActivity` atlanır; kullanıcının kendi eylemi engellenmez.
   - `local_api`, `n8n`, `console` için:
     - `idleSec = await this.getUserIdleSeconds()`; `null`/`NaN`/negatif → `deny('IDLE_UNAVAILABLE')`.
     - Eşik: `settings.userActivityThresholdSeconds` tam sayı 1..3600 ise o; değilse 60.
     - `idleSec < threshold` → `deny('USER_ACTIVE')`.
   - Eski `blockRemoteShutdownWhenActive` bloğunu bu genel kontrolle değiştir; yalnızca shutdown/restart değil, tüm yıkıcı eylemler için geçerli olsun. `lock`/`signout` için ürün kararı: aynı kontrol uygulanır; kullanıcı aktifken uzaktan oturum kilitleme engellenir.
   - `getUserIdleSeconds()` artık `null` dönebilir; `idleProvider`, `powerMonitor`, yoksa `null`. “0 = aktif” varsayımı yerine açık `null` kullan.
5. **Headless DI.**
   - `src/agent/headless.js`: `const safety = new SafetyPolicyEngine(storage, null, null, { idleProvider: () => metrics.getMetrics().userIdleSeconds });`
   - İlk ölçüm 0 ise remote görevler `USER_ACTIVE` ile bloke olur; bu fail-closed ve kabul edilebilir. Startup’ta ilk ölçümü bekle; gerekirse 5 sn gecikmeli ilk tick.
   - `main.js`: mevcut `{ powerMonitor }` korunur.
6. **Diğer catch’leri fail-closed yap.**
   - Muafiyet: catch → `deny('EXEMPTION_UNAVAILABLE', ...)`.
   - Bakım penceresi: catch → `deny('MAINTENANCE_WINDOW_UNAVAILABLE', ...)`.
   - Sunucu profili: catch → `deny('SERVER_PROFILE_UNAVAILABLE', ...)`.
   - `getPowerRequests`/`getFullscreenState` zaten fail-closed; mesajları standartlaştır.
   - `isBootGuardActive` hâlâ fail-open olabilir mi? Hayır: storage okunamazsa `true` döndür (boot guard aktif kabul et) veya `deny`; plan: `catch` → `return true` (güvenli taraf) ve logla.
7. **Kaynak güvenilirliği.**
   - `task.source` WP-03’te sunucu tarafından atanır; engine yalnızca bu değeri okur. `task.policyId` varsa console gibi muamele etme kuralı korunur.
   - `forceCloseApps`/`remoteApprovalRequired` WP-03’te şemadan kaldırıldı; engine’de referans bırakma.
8. **Testler.**
   - Kısmi politika dört kontrolü de çalıştırır.
   - `storage.getSettings` throw → `POLICY_UNAVAILABLE`; hiçbir güç eylemi yok.
   - UI kaynağı `checkUserActivity`’den muaf; remote kaynak idle 10 sn → `USER_ACTIVE`; idle 120 sn → geçer.
   - `idleProvider` throw/null → `IDLE_UNAVAILABLE`.
   - Muafiyet/bakım/sunucu profili throw → ilgili `*_UNAVAILABLE` kodu.
   - `agentDisabled` true → `AGENT_DISABLED`.
   - Headless initial metrics → remote görev bloke, UI görev değil.
9. **Kanıt.**
   - Y-05 satırını T07 testleriyle eşle.

#### 8.3.2 Çıktılar

- Fail-closed `SafetyPolicyEngine.evaluate`.
- `SAFE_POLICY_DEFAULTS` merge.
- `checkUserActivity` (UI hariç) + `IDLE_UNAVAILABLE`.
- Headless `idleProvider` bağlantısı.
- T07-01…T07-07 kanıtları.

#### 8.3.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Headless’ta idle 0 → tüm remote görevler bloke | Yüksek | Orta | İlk ölçümü bekle; eşiği ayarlanabilir yap; logla | `userActivityThresholdSeconds`=0 ile kontrolü kapatma **yok**; operatör politikayı ayarlar |
| UI görevleri artık kullanıcı etkinliğinden muaf | Orta | Düşük | Ürün kararı D12; test | UI görevinde de kontrol istenirse ayrı ürün kararı |
| Muafiyet servisi geçici hata → console görevleri bloke | Orta | Orta | Hata kodunu net göster; retry | Muafiyet dosyasını onar; fail-open’a dönme |
| Sunucu profili okuma hatası her console görevini bloke eder | Orta | Yüksek | Hata logu + kullanıcı mesajı; settings onarımı | Sunucu profilini kapatma yok; fail-closed |
| `getPowerRequests` iki kez çağrılır | Orta | Orta | Sonucu istek içinde cache’le; ölçümü tek kez yap | Ayrı performans iyileştirmesi; davranış değişmez |
| `task.source` hâlâ istemciden gelir | Düşük | Yüksek | WP-03 context zorunlu; engine ikinci savunma | WP-03 kapanmadan WP-07 merge etme |

#### 8.3.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T07-01 | Kısmi politika | `{checkProtectedApps:true}` ile protected app çalışıyor | `PROTECTED_APP_RUNNING`; system load/fullscreen de çalışır | Dört kontrol de çağrılır |
| T07-02 | Ayar okunamıyor | `storage.getSettings` throw | `POLICY_UNAVAILABLE` | `allowed:false`; güç eylemi yok |
| T07-03 | UI kaynağı | UI görevi, idle 0 | Diğer kontroller geçerse `allowed:true` | `USER_ACTIVE` yok |
| T07-04 | Remote idle | local_api, idle 10 sn; sonra 120 sn | İlki `USER_ACTIVE`; ikincisi geçer | Eşik 60 |
| T07-05 | Idle ölçülemiyor | `idleProvider` null/throw | `IDLE_UNAVAILABLE` | `allowed:false` |
| T07-06 | Kurumsal catch | Muafiyet/bakım/sunucu profili throw | `*_UNAVAILABLE` | Üçü de fail-closed |
| T07-07 | Kill-switch | `agentDisabled:true` | `AGENT_DISABLED` | Güç eylemi yok |

#### 8.3.5 Geri alma

- Kod commit’ini geri al; `safetyPolicy` şeması aynı kalır.
- Fail-open davranış geri gelirse Y-05 yeniden açılır; geri alma yalnızca acil rollback içindir.
- Headless idle bağlantısı geri alınırsa remote görevler fail-closed kalmaya devam etmeli; “0 = aktif” varsayımına dönülmez.

#### 8.3.6 Definition of Done (DoD)

- [ ] Kısmi politika güvenli varsayılanlarla merge ediliyor.
- [ ] Ayar/muafiyet/bakım/sunucu profili hatalarında yıkıcı eylem reddediliyor.
- [ ] `checkUserActivity` yalnızca UI dışı kaynaklarda ve ölçüm yoksa `deny`.
- [ ] Headless idle ölçümü bağlı; UI görevleri muaf.
- [ ] T07-01…T07-07 yeşil.
- [ ] `npm test` ve `npm run test:security` yeşil.

---

### 8.4 WP-08 — API rolü, URL/Host ve audit erişimi

| Alan | Değer |
|---|---|
| **Bulgular** | Y-06, O-05, O-06 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/services/LocalApiService.js`, `main.js`, `preload.js`, `src/renderer/app.js`, `src/index.html`, `src/renderer/locales/*.json`, `src/console/ConsoleServer.js`, `tests/main/local-api-security.test.mjs`, `tests/console/console-auth.test.mjs` |
| **İlgili kararlar** | D13, D14, D15 |

**Amaç:** Rol bilgisi eksik/geçersizken API’yi `admin` saymayı durdurmak; istek URL’sini `Host` başlığına bağımlı olmadan ve hata durumunda süreç çökmeden ayrıştırmak; denetim günlüğünü yalnızca admin rolüne ve sayfalı olarak açmak.

#### 8.4.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/main/local-api-security.test.mjs`:
     - `localApiKeyRole` yok/`'x'` iken doğru anahtarla istek → `403 ROLE_REQUIRED`; güç eylemi çağrılmamalı.
     - `generateApiKey()` rol verilmeden/geçersiz rol ile → servis `INVALID_ROLE` fırlatır; IPC `generate-api-key` `{success:false, code:'INVALID_ROLE'}` döner; geçerli rol açıkça verilince yalnız o rol yazılmalı.
     - `Host: [` ve `Host: beklenmeyen.example` istekleri → sırasıyla `400 INVALID_HOST` / `421 MISDIRECTED_HOST`; süreç ayakta kalmalı, istek asılı kalmamalı.
     - viewer `/api/v1/audit` → `403`; admin → sayfalı sonuç; `/api/v1/audit/verify` → hafif doğrulama.
   - `tests/console/console-auth.test.mjs`: `audit.read` izninin yalnızca admin’de olduğunu doğrula; viewer/operator 403 almalı.
2. **Rol çözümünü fail-closed yap.**
   - `LocalApiService.roleOf(settings)` artık `ROLE_RANK[r] ? r : null` döndürür. `'admin'` fallback’i kaldırılır.
   - `handleRequest` kimlik doğrulamasından sonra:
     ```js
     const role = LocalApiService.roleOf(settings);
     if (!role) return this.sendJson(res, 403, { error: 'API anahtarı rolü tanımlı değil.', code: 'ROLE_REQUIRED' });
     ```
   - `getSecurityStatus()` içinde `keyRole: role` ve `roleConfigured: !!role`; rol yoksa `warning: 'API_KEY_ROLE_MISSING'`. Anahtar varsa ama rol yoksa açılışta bir kez `log.warn` + audit `api_key_role_missing` yazılır; anahtar silinmez, kullanılamaz.
3. **Anahtar üretiminde rolü zorunlu kıl.**
   - `generateApiKey(role)` yalnızca `viewer|operator|admin` kabul eder; eksik/geçersiz rol `INVALID_ROLE` fırlatır. Varsayılan `admin` kaldırılır.
   - `main.js` `generate-api-key`:
     - `args.role` string ve beyaz listede değilse `{success:false, code:'INVALID_ROLE'}` döner; PIN doğrulaması yine önce çalışır.
     - `localApiService.generateApiKey(role, { audit: {...} })` çağrısı WP-11’de atomik hale gelir; WP-08’de mevcut `updateSettings + audit` korunur, ancak audit hatası anahtarı yine de yazmaz (WP-11’e kadar geçici olarak `try/catch` + geri alma).
   - `src/index.html` API anahtarı kartına `#api-key-role` seçimi ekle (`viewer`, `operator`, `admin`; varsayılan `viewer`). `app.js` seçimi `generateApiKey({ pin, role })` ile gönderir; rol seçilmeden buton çağrısı yapılmaz.
4. **URL ve Host’u ayır.**
   - Önce `req.url` mutlak URL (`http://`, `https://`) mi diye kontrol et; öyleyse `400 ABSOLUTE_URL_NOT_ALLOWED` döndür ve parse etme.
   - Ancak bundan sonra `const parsedUrl = new URL(req.url, 'http://127.0.0.1');` — `Host` header’ı URL tabanında kullanılmaz.
   - `new URL` try/catch içinde; hata `400 INVALID_URL`.
   - Host doğrulaması ayrı fonksiyon:
     ```js
     validateHostHeader(req.headers.host, {
       port: actualPort,
       allow: ['127.0.0.1', 'localhost', '[::1]', boundHost, ...lanAllowedIps]
     })
     ```
     - Eksik Host → `400 HOST_REQUIRED`.
     - Geçersiz biçim → `400 INVALID_HOST`.
     - Port/ana makine izin listesinde değil → `421 MISDIRECTED_HOST`.
     - LAN modu kapalıyken yalnız loopback; LAN modu açıkken `boundHost` + `lanAllowedIps`. Hostname çözümlemesi yapılmaz; string karşılaştırması normalize edilir (`localhost`/`127.0.0.1` eşdeğer kabul edilir).
   - `actualPort` `localApiService.server.address().port`; server yoksa ayardaki port. Port `0` testinde gerçek port kullanılır.
5. **Audit erişimini daralt ve sayfala.**
   - `requiredRole` sonrası route içinde açık admin kontrolü:
     ```js
     if (role !== 'admin') return this.sendJson(res, 403, { error: 'Audit access requires admin', code: 'FORBIDDEN' });
     ```
   - `GET /api/v1/audit` parametreleri: `limit` varsayılan 100, 1..500; `offset` 0..1.000.000; `since` ISO tarih veya `seq` tam sayı. Geçersiz parametre `400 INVALID_PAGINATION`.
   - Yanıt: `{ audit: [...], page: { limit, offset, total }, verify: { ok, records, code } }`. `verify` tam zincir doğrulaması yapar; ağır olabileceği için ayrı uç da eklenir.
   - `GET /api/v1/audit/verify` yalnız admin; yalnız `{ok, records, code}` döner. Viewer/operator 403.
   - WP-08 aşamasında `audit.load()` tüm listeyi okuyorsa bile yanıt sayfalanır; WP-13 bunu DB seviyesinde sayfalamaya çevirir. Bu geçici durum release notunda belirtilir, O-08 kapanmadan G2 kapanmaz.
   - Console tarafında `PERMISSIONS` tablosunu testle sabitle; `audit.read` yalnız admin. Değişiklik gerekmiyorsa kod değiştirme, regresyon testi ekle.
6. **Hata yollarını standartlaştır.**
   - Tüm yeni hatalar `{error, code}`; `sendJson` Content-Type/nosniff korunur.
   - `handleRequest` içindeki `req.on('end')` route çağrısı zaten try/catch; URL/Host hataları buraya düşmeden yanıtlanır.
   - `Host` doğrulaması kimlik doğrulamasından **sonra** yapılır; kimliksiz istek 401 alır, bilgi sızdırmaz.
7. **i18n ve UI.**
   - `apiKeyRoleLabel`, `apiKeyRoleViewer`, `apiKeyRoleOperator`, `apiKeyRoleAdmin`, `apiKeyRoleMissing`, `auditAdminOnly` anahtarları; `tr`/`en` tam, diğerlerinde İngilizce fallback.
   - Rol yoksa API kartında kırmızı uyarı ve “Yeni anahtar üret” yönlendirmesi; anahtar otomatik silinmez.
8. **Kanıt.**
   - Y-06/O-05/O-06 satırlarını T08 testleri ve Windows manuel Host testiyle eşle.

#### 8.4.2 Çıktılar

- Fail-closed `roleOf` ve `ROLE_REQUIRED` yanıtı.
- Rol zorunlu `generateApiKey` + UI rol seçimi.
- Sabit tabanlı URL parse, Host allowlist ve `INVALID_URL`/`INVALID_HOST`/`MISDIRECTED_HOST`.
- Admin-only, sayfalı `/api/v1/audit` ve `/api/v1/audit/verify`.
- T08-01…T08-06 kanıtları.

#### 8.4.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Eski anahtarda rol yok; tüm API kullanıcıları kilitlenir | Yüksek | Orta | Açılışta uyarı; yeni anahtar üretme yolu; release notu | Yönetici PIN ile yeni anahtar üretir; rolü otomatik `admin` yapma |
| Host allowlist LAN’da meşru istemciyi reddeder | Orta | Yüksek | `lanAllowedIps` + `boundHost` allowlist; manuel matris | Host kontrolünü gevşetme; istemciye doğru Host’u belgele |
| `localhost`/IPv6 biçim farkı yanlış reddeder | Orta | Orta | Normalize edilmiş karşılaştırma; testler | Yalnız loopback’te IPv6 kabulü |
| Audit sayfalama `total` pahalı | Orta | Orta | `COUNT(*)` indeksli; WP-13’te DB sayfalama | `total` alanını opsiyonel yap |
| UI rol seçimi yanlış varsayılan | Orta | Orta | Varsayılan `viewer`; açık seçim zorunlu | Seçim yoksa butonu disable et |
| Console `audit.read` başka rolde | Düşük | Yüksek | Testle sabitle; değişiklik varsa admin’e daralt | Ayrı `audit.read` izni tanımla |

#### 8.4.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T08-01 | Rol yok | Geçerli hash, `localApiKeyRole` yok; `POST /api/v1/power/lock` | `403 ROLE_REQUIRED` | Güç servisi çağrılmaz |
| T08-02 | Geçersiz rol üretimi | IPC `generate-api-key` `{role:'root'}`; sonra `{role:'viewer'}` | İlki `{success:false, code:'INVALID_ROLE'}`; ikincisi viewer anahtarı | Ayar yalnız ikinci çağrıda değişir |
| T08-03 | Bozuk URL/Host | `Host: [`; mutlak URL; kontrol karakterli URL | `400 INVALID_HOST` / `400 ABSOLUTE_URL_NOT_ALLOWED` / `400 INVALID_URL` | Süreç çökmez; soket yanıt alır |
| T08-04 | Host uyuşmazlığı | `Host: evil.example:port`; doğru loopback | `421 MISDIRECTED_HOST`; loopback 200 | İstek route’a ulaşmaz |
| T08-05 | Audit erişimi | Viewer `/audit`; admin `/audit?limit=2&offset=1`; `/audit/verify` | Viewer 403; admin 2 kayıt + page | `audit` uzunluğu 2; verify hafif |
| T08-06 | Legacy anahtar | Rol yokken eski anahtar; yeni viewer anahtarı üret; tekrar dene | Eski 403; yeni 200 (viewer yetkisi) | Rol anahtarla birlikte yazıldı |

#### 8.4.5 Geri alma

- Kod commit’ini geri al; `ROLE_REQUIRED` kaldırılırsa Y-06 yeniden açılır. Veri migrasyonu yok.
- Host allowlist geri alınırsa O-05 açılır; yalnız acil rollback.
- Audit route eski haline dönerse O-06 açılır; viewer erişimi geri açılmaz.
- Rolü olmayan anahtarlar silinmez; rollback sonrası da kullanılamaz kalır.

#### 8.4.6 Definition of Done (DoD)

- [ ] Eksik/geçersiz rol `admin`’e düşmüyor; 403 dönüyor.
- [ ] `generateApiKey` rolü açıkça istiyor; UI rol seçimi var.
- [ ] Mutlak URL parse edilmeden reddediliyor; göreli URL sabit tabanla parse ediliyor; Host allowlist ve 400/421 hataları çalışıyor.
- [ ] `/audit` yalnız admin ve sayfalı; `/audit/verify` ayrı.
- [ ] T08-01…T08-06 yeşil; `npm run test:security` yeşil.
- [ ] Windows manuel Host/rol matrisi kayıtlı.

---

### 8.5 WP-09 — Idempotency fingerprint ve durum makinesi

| Alan | Değer |
|---|---|
| **Bulgular** | O-04 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-08 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/services/LocalApiService.js`, `tests/main/local-api-idempotency.test.mjs`, `tests/main/local-api-security.test.mjs` |
| **İlgili kararlar** | D16, D14 |

**Amaç:** `Idempotency-Key`’i yalnız anahtar değil, `method + path + sorgu + ham gövde` fingerprint’i ile kapsamak; aynı anahtarın farklı işlemlerde replay edilmesini engellemek; uçuştaki isteği 409, tamamlanmış 2xx’i replay, 4xx/5xx’i tekrar denenebilir yapmak.

#### 8.5.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - Aynı anahtar `POST /power/lock` sonra `POST /power/shutdown` → ikinci `422 IDEMPOTENCY_KEY_REUSE`, shutdown çalışmaz.
   - Aynı anahtar aynı endpoint farklı gövde → `422`.
   - Aynı anahtar aynı gövde, ilk istek uçuşta → `409 IDEMPOTENCY_IN_PROGRESS`.
   - İlk istek `400` → aynı anahtar düzeltilmiş gövdeyle tekrar denenebilir; eski hata replay edilmez.
   - Başarılı `201` → replay’de aynı gövde + `Idempotency-Replayed: true`.
2. **Gövdeyi idempotency kontrolünden önce oku.**
   - Mevcut `req.on('data')`/`end` akışı korunur; idempotency kontrolü `end` içinde, `JSON.parse` sonrası ve `route` öncesi yapılır.
   - `Content-Type`/boyut kontrolleri önce kalır; 413/415 yanıtları idempotency kaydı oluşturmaz.
   - Header doğrulaması: `Idempotency-Key` 1..255 karakter, yazdırılabilir ASCII; değilse `400 INVALID_IDEMPOTENCY_KEY`.
3. **Fingerprint üret.**
   ```js
   const bodyHash = crypto.createHash('sha256').update(bodyRaw, 'utf8').digest('hex');
   const fingerprint = crypto.createHash('sha256')
     .update(`${method}\n${parsedUrl.pathname}\n${parsedUrl.search}\n${bodyHash}`, 'utf8')
     .digest('hex');
   ```
   - Gövdesiz GET/DELETE’te `bodyRaw=''` kullanılır; query dahil edilir.
   - Fingerprint ham gövdeye bağlıdır; JSON anahtar sırası farklıysa farklı fingerprint (bilinçli; istemci aynı gövdeyi göndermeli).
4. **Durum makinesi.**
   - `this.idempotencyCache: Map<idemKey, entry>`; `entry = { fingerprint, state, status, body, expiresAt, inFlightUntil }`.
   - `route` öncesi:
     - Kayıt yok → `state:'in_flight'`, `inFlightUntil=now+30000`, `expiresAt=now+TTL`; devam.
     - Kayıt var, fingerprint farklı → `422 IDEMPOTENCY_KEY_REUSE`.
     - Kayıt var, `state:'in_flight'` ve süresi dolmamış → `409 IDEMPOTENCY_IN_PROGRESS`.
     - Kayıt var, `state:'completed'` → `sendJson(res, status, body, { 'Idempotency-Replayed':'true' })`; route çalışmaz.
     - `in_flight` süresi dolmuş → otomatik devralma yok; eski yanıt bilinmediği için yeniden çalıştırma riski yerine `409 IDEMPOTENCY_STALE` döndür ve kaydı sil (tercih: güvenli). İstemci yeni anahtarla yeniden dener.
   - `sendJson`:
     - 2xx → `state:'completed'`, `status`, `body`, `expiresAt=now+TTL`; `inFlightUntil=null`.
     - Route tarafından üretilen 4xx/5xx → kaydı **sil** (retry edilebilir); `5xx` hiçbir zaman saklanmaz.
     - Guard yanıtları (`409 IDEMPOTENCY_IN_PROGRESS`, `422 IDEMPOTENCY_KEY_REUSE`, `400 INVALID_IDEMPOTENCY_KEY`) kaydı silmez/değiştirmez; `sendJson` bu yollar için `preserveIdempotency:true` seçeneğiyle çağrılır. `409 IDEMPOTENCY_STALE` istisnadır: süresi dolmuş `in_flight` kaydı önce silinir, sonra yanıt döner.
   - `route` senkron throw veya async reject → kaydı sil; 500 döner.
   - `pruneIdempotency` süresi dolmuş `completed` ve `in_flight` kayıtlarını siler; `IDEMPOTENCY_MAX_ENTRIES` dolunca en eski tamamlanmış kayıt atılır, uçuştaki kayıt atılmaz.
5. **Yanıt başlıkları ve gözlem.**
   - Replay’de `Idempotency-Replayed: true`; ilk yanıtta yok.
   - `sendJson(res, status, data, headers = {}, options = {})` imzası geriye uyumlu genişletilir; `options.preserveIdempotency` guard yanıtlarında kullanılır.
   - `getDiagnostics()` içine `idempotencyHits`, `idempotencyConflicts`, `idempotencyInFlight` sayaçları.
6. **Testler ve kanıt.**
   - T09-01…T09-06; T08 testlerinin idempotency header’ı olmadan geçtiğini doğrula.
   - O-04 satırını testlerle eşle.

#### 8.5.2 Çıktılar

- Fingerprint’li idempotency anahtarı ve durum makinesi.
- 409/422/replay davranışı; yalnız 2xx cache.
- `Idempotency-Replayed` başlığı ve tanılama sayaçları.
- T09-01…T09-06 kanıtları.

#### 8.5.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Aynı iş niyeti farklı JSON sırasıyla 422 alır | Orta | Orta | Dokümantasyon; istemci ham gövdeyi korur | Kanonik JSON fingerprint’e geç (ayrı ürün kararı) |
| Uçuşta kalan kayıt 30 sn sonra 409’a yol açar | Orta | Orta | `IDEMPOTENCY_STALE` + kaydı sil; istemci yeni anahtar | TTL’i uzatma; kilidi kalıcı yapma |
| Bellek içi cache süreç yeniden başlayınca kaybolur | Yüksek | Orta | Dokümantasyon: idempotency yalnız süreç ömründe garanti; kalıcılık gerekirse DB tablosu | Sipariş nonce’u zaten kalıcı; idempotency’yi DB’ye taşıma ayrı WP |
| 2xx olmayan iş kararları (ör. 202) cache’lenir | Orta | Orta | Yalnız 2xx; 202 iş kuyruğa alındıysa aynı nonce ile tekrar kuyruklanmaz | 202’yi de cache’le; iş kimliği nonce ile korunur |
| Header çok büyük/kötü niyetli | Düşük | Düşük | 255 karakter sınırı; ASCII kontrolü | 400 |
| Farklı endpoint aynı anahtarı meşru kullanır | Düşük | Düşük | 422 açık hata; istemci anahtarı işlem başına üretir | İstemci rehberi |

#### 8.5.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T09-01 | Uçlar arası replay | `lock` sonra `shutdown`, aynı anahtar | İkinci `422`; shutdown yok | Güç servisi yalnız lock çağrısı |
| T09-02 | Farklı gövde | Aynı endpoint, aynı anahtar, farklı gövde | `422 IDEMPOTENCY_KEY_REUSE` | İkinci iş çalışmaz; ilk kayıt korunur |
| T09-03 | Uçuşta | Gecikmeli handler; aynı istek iki kez | İkinci `409 IDEMPOTENCY_IN_PROGRESS` | Tek handler çalışır; in-flight kayıt silinmez |
| T09-04 | 4xx retry | İlk `400`; düzeltilmiş gövde aynı anahtar | İkinci çalışır; eski 400 replay edilmez | Cache’te kayıt yok |
| T09-05 | 2xx replay | İlk `201`; aynı istek | Aynı gövde; `Idempotency-Replayed:true` | Handler bir kez |
| T09-06 | Geçersiz header | 256 karakter / kontrol karakteri | `400 INVALID_IDEMPOTENCY_KEY` | Route çalışmaz |

#### 8.5.5 Geri alma

- Kod commit’ini geri al; cache yalnız bellekte olduğu için veri migrasyonu yok.
- Eski davranışa dönmek O-04’ü yeniden açar; yalnız acil rollback.
- 422/409 kodları istemci sözleşmesi olur; release notunda belirtilir.

#### 8.5.6 Definition of Done (DoD)

- [ ] Cache kaydı `Idempotency-Key` anahtarı ile method/path/query/gövde fingerprint’ini birlikte kullanıyor; fingerprint farkı 422.
- [ ] Aynı anahtar farklı fingerprint → 422; uçuşta → 409; 2xx replay.
- [ ] 4xx/5xx cache’lenmiyor; route hatasında kayıt temizleniyor; guard 409/422 yanıtları uçuştaki veya tamamlanmış kaydı silmiyor.
- [ ] T09-01…T09-06 yeşil.
- [ ] `npm test` ve `npm run test:security` yeşil.

---

### 8.6 WP-10 — Konsol ajan kimliği ve kill-switch

| Alan | Değer |
|---|---|
| **Bulgular** | Y-07 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/console/run.js`, `src/console/ConsoleServer.js`, `src/console/ConsoleStore.js`, `src/main/services/ConsoleClient.js`, `src/main/services/OrderQueue.js`, `src/agent/headless.js`, `main.js`, `tests/console/console-identity.test.mjs`, `tests/main/console-client.test.mjs` |
| **İlgili kararlar** | D11, D17 |

**Amaç:** Global ajan anahtarının herhangi bir `agentId` adına heartbeat/makbuz göndermesini engellemek; kill-switch yazımı başarısızken sipariş işlemeyi durdurmak; yerel `pausedAll` ve `agentDisabled` durumlarının heartbeat’i durdurmasını önlemek.

#### 8.6.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/console/console-identity.test.mjs`: `agentId` bağlı olmayan agent anahtarı ile heartbeat → `403 IDENTITY_REQUIRED`; A anahtarı ile B `agentId` → `403 IDENTITY_MISMATCH`; A anahtarı ile A → 200.
   - `tests/main/console-client.test.mjs`: `updateSettingsWithAudit` throw → `KILL_SWITCH_PERSIST_FAILED`; dönen siparişler kuyruğa alınmaz; `pausedAll` true iken heartbeat çağrılır; `agentDisabled` true iken heartbeat sürer.
2. **Ajan anahtarını kimliğe bağla.**
   - `run.js`:
     - `CONSOLE_AGENT_KEY` varsa `CONSOLE_AGENT_ID` **zorunlu**; yoksa açılış `Agent anahtarı için CONSOLE_AGENT_ID gerekli` hatasıyla durur.
     - `keys.agent = { role:'agent', hash: hashKey(key), keyId:'env-agent', agentId: CONSOLE_AGENT_ID, notAfter:null }` şeklinde nesne kaydı.
     - Çoklu ajan için ortam anahtarı yerine admin `/api/v1/keys` (`registerAgent`) kullanılır; `CONSOLE_AGENT_ID` tek ajanlı kurulum içindir.
   - `keyRecord` düz string agent anahtarını hâlâ okuyabilir (legacy), ancak `agentId:null` olduğu için kimlik gerektiren uçlarda reddedilir; admin yeni anahtar üretmelidir.
3. **Heartbeat/receipts kimliğini sunucudan al.**
   - `heartbeat`:
     ```js
     if (!identity || !identity.agentId) return this.sendJson(res, 403, { error:'Agent identity required', code:'IDENTITY_REQUIRED' });
     if (body.agentId && body.agentId !== identity.agentId) return this.sendJson(res, 403, { code:'IDENTITY_MISMATCH', ... });
     const out = this.heartbeat(identity.agentId, body.inventory, body.receipts);
     ```
   - `receipts`: `agentId = identity.agentId`; body `agentId` yalnızca eşleşme kontrolü için okunur, kimlik kaynağı olamaz.
   - `role !== 'agent'` bu uçlarda zaten `needPermission` ile reddedilir.
   - `heartbeat()` içinde gelen `agentId`nin kayıtlı ajanla eşleştiğini ayrıca doğrula; yeni ajan kaydı yalnız `registerAgent` ile.
4. **Kill-switch’i atomik ve fail-closed yaz.**
   - `ConsoleClient` içine `_setAgentDisabled(want)` ekle:
     - `storage.updateSettingsWithAudit` varsa `{agentDisabled: want}` + audit `agent_disabled`/`agent_enabled` tek transaction.
     - Yoksa `updateSettings` + `audit.append`; hata `KILL_SWITCH_PERSIST_FAILED`.
     - Storage yok/`updateSettings` yok → hata.
   - `_syncOnce`:
     ```js
     const wantDisabled = payload.disabled === true;
     if (wantDisabled !== !!s.agentDisabled) {
         const persisted = await this._setAgentDisabled(wantDisabled);
         if (!persisted.ok) return { ok:false, code:'KILL_SWITCH_PERSIST_FAILED', error:persisted.error, disabled:true };
     }
     if (wantDisabled) return { ok:true, disabled:true, orders:[] };
     ```
   - Kill-switch yazılamazsa `disabled:true` ile dön; `main/headless` `orderExecutor.drain` çağırmaz. Siparişler kuyruğa alınmaz; heartbeat sonraki turda yeniden dener.
   - `markReceiptsSent` yalnız heartbeat 2xx olduktan sonra çağrılır (mevcut sıra korunur); kill-switch hatası makbuzları geri almaz.
5. **Senkronu pause/disable’dan ayır.**
   - `main.js` console sync tick:
     ```js
     const res = await consoleClient.sync();       // her zaman
     if (res && res.disabled) return;              // yalnız icra durur
     if (taskManager && taskManager.pausedAll) return;
     await orderExecutor.drain(orderQueue);
     ```
   - `headless.js` aynı sıra: `sync()` her zaman; `res.disabled` veya `tasks.pausedAll` yalnız drain’i engeller.
   - `pausedAll` artık `sync()` öncesi erken `return` değil; konsol `agentDisabled` emri her zaman teslim edilebilir.
   - `agentDisabled===true` iken de `sync()` çağrılır; heartbeat sürer, dönen siparişler işlenmez.
6. **Durum ve gözlem.**
   - `ConsoleClient.getStatus()` (varsa) `identityError`, `killSwitchPersistError`, `lastSyncAt` alanlarını taşır.
   - `get-security-status` veya konsol kartı `agentDisabled` ve son hata kodunu gösterir; kullanıcı yerel olarak kill-switch’i kapatamaz (yalnız konsol açar).
   - Audit: `agent_disabled`, `agent_enabled`, `kill_switch_persist_failed`; `agentId` ve hata kodu, sır yok.
7. **OrderExecutor ve kuyruk.**
   - `OrderExecutor.drain` çağrılmadan önce `storage.getSettings().agentDisabled !== true` ve `pausedAll !== true` kontrolü bir kez daha yapılır (savunma katmanı).
   - Kuyrukta eski siparişler varsa kill-switch sırasında işlenmez; konsol açtığında işlenir. Sipariş `expiresAt` politikası korunur.
8. **Testler.**
   - T10-01…T10-06; `pausedAll` + heartbeat; `agentDisabled` + heartbeat; persist fail; A/B kimlik.
   - Windows manuel: iki ajan kaydı, farklı anahtarlar, birinin diğerini taklit etmesi.
9. **Kanıt.**
   - Y-07 satırını T10 testleri + manuel kayıtla eşle.

#### 8.6.2 Çıktılar

- `CONSOLE_AGENT_ID` zorunlu, `agentId` bağlı anahtar kaydı.
- `IDENTITY_REQUIRED`/`IDENTITY_MISMATCH` sunucu kontrolleri.
- Fail-closed `KILL_SWITCH_PERSIST_FAILED`.
- `sync()` her zaman; pause/disable yalnız icrayı durduruyor.
- T10-01…T10-06 kanıtları.

#### 8.6.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Mevcut tek ajan kurulumu `CONSOLE_AGENT_ID` olmadığı için durur | Yüksek | Orta | Release notu + açılışta net hata; `.env` örneği | Yönetici ID ekler; kimliksiz anahtarla çalışma yok |
| Ajan ID’si inventory’deki ID ile uyuşmaz | Orta | Yüksek | `CONSOLE_AGENT_ID` = envanter `agentId`; açılışta doğrulama | Konsolda yeni anahtar kaydı |
| Kill-switch yazımı kalıcı başarısız → ajan sürekli reddeder | Orta | Orta | Storage onarımı; hata kodu görünür; heartbeat sürer | Konsol `disabled:false` gönderene kadar icra yok |
| `pausedAll` kaldırılınca istenmeyen siparişler işlenir | Orta | Yüksek | Açık kullanıcı eylemi; audit; kuyruk `expiresAt` | Siparişleri konsoldan iptal et |
| Eski string anahtar legacy olarak kullanılmaya devam eder | Orta | Yüksek | Kimliksiz agent anahtarı 403; migration testi | Anahtarı sil; yeni kayıt |
| Heartbeat her zaman çalışınca gereksiz ağ trafiği | Düşük | Düşük | 60 sn aralık; mevcut `sync()` in-flight guard | Aralığı ayarla |

#### 8.6.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T10-01 | Kimliksiz anahtar | Legacy string agent anahtarı; heartbeat | `403 IDENTITY_REQUIRED` | Envanter yazılmaz |
| T10-02 | Taklit | A anahtarı, body `agentId:B` | `403 IDENTITY_MISMATCH` | B’nin kaydı değişmez |
| T10-03 | Doğru kimlik | A anahtarı, body A | 200; heartbeat işlenir | A kaydı güncellenir |
| T10-04 | Kill-switch persist fail | `updateSettingsWithAudit` throw; payload `disabled:true` + sipariş | `KILL_SWITCH_PERSIST_FAILED`; sipariş kuyruğa girmez | `agentDisabled` değişmez; drain yok |
| T10-05 | Pause + heartbeat | `pausedAll:true`; konsol `disabled:true` | Sync çağrılır; heartbeat 200; drain yok | Kill-switch uygulanır |
| T10-06 | Disable + heartbeat | `agentDisabled:true`; sonra konsol `disabled:false` | Heartbeat sürer; açılınca sipariş işlenir | İki yönde de sync çalışır |

#### 8.6.5 Geri alma

- Kod commit’ini geri al; `agentDisabled` SQLite alanı aynı kalır.
- `CONSOLE_AGENT_ID` zorunluluğu geri alınırsa Y-07 yeniden açılır; kimliksiz anahtarla çalışma geri gelmez.
- `sync()` erken dönüşleri geri gelirse kill-switch/pause kilidi yeniden oluşur; yalnız acil rollback.
- Ajan anahtarları silinmez; rollback sonrası da kimlik bağı korunur.

#### 8.6.6 Definition of Done (DoD)

- [ ] Agent anahtarı `agentId`ye bağlı; kimliksiz/yanlış kimlik 403.
- [ ] Heartbeat/receipts kimliği body’den değil anahtar kaydından alıyor.
- [ ] Kill-switch yazılamazsa sipariş işlenmiyor; hata görünür.
- [ ] `pausedAll`/`agentDisabled` heartbeat’i durdurmuyor; yalnız icrayı durduruyor.
- [ ] T10-01…T10-06 yeşil; iki ajanlı manuel test kayıtlı.
- [ ] `npm test` ve `npm run test:security` yeşil.

---

### 8.7 WP-11 — Atomik ayar+audit ve PIN iptal sırası

| Alan | Değer |
|---|---|
| **Bulgular** | O-13, O-11 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-01, WP-05, WP-08 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/services/StorageService.js`, `src/main/services/AuditLog.js`, `src/main/services/LocalApiService.js`, `main.js`, `src/renderer/app.js`, `src/renderer/locales/*.json`, `tests/main/storage-audit-atomic.test.mjs`, `tests/main/ipc-security.test.mjs`, `tests/renderer/settings-save.test.mjs` |
| **İlgili kararlar** | D17, D7 |

**Amaç:** Güvenlik ayarı ile audit kaydını aynı SQLite transaction’ında yazmak; audit yazılamazsa ayarı uygulamamak; PIN iptalinde dil/enerji gibi yan ayarların sunucuda kalmamasını sağlamak.

#### 8.7.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/main/storage-audit-atomic.test.mjs`: audit anahtarı yokken `updateSettingsWithAudit` throw eder, `settings` değişmez; DB yazımı yarıda kalırsa ne ayar ne audit satırı oluşur; başarıda ikisi de vardır.
   - `tests/main/ipc-security.test.mjs`: `security-settings-update` audit yazılamazken `{success:false, code:'AUDIT_WRITE_FAILED'}` döner; `autonomyMode` eski değerde kalır.
   - `tests/renderer/settings-save.test.mjs`: PIN iptalinde `saveSettings` hiç çağrılmaz; dil/enerji formu eski değerde kalır.
2. **WP-01'deki `StorageService.updateSettingsWithAudit` metodunu genelleştir.**
   - WP-01 yalnız PIN mutasyonları için minimal tek-transaction yolu ekler; bu adım ortak audit satırı, seçenekler ve checkpoint ile tam sürümü tamamlar.
   - İmza: `updateSettingsWithAudit(patch, audit, { requireAudit = true } = {})`.
   - Doğrulama: `patch` düz nesne; `audit` `{actor, action, target, detail}`; `__proto__/constructor/prototype` anahtarları atılır.
   - Ön koşullar: DB açık, bakım modunda değil, `hasAuditKey()` true; değilse `AUDIT_KEY_MISSING`/`STORAGE_MAINTENANCE` throw; IPC katmanı bunu kullanıcıya `AUDIT_WRITE_FAILED` olarak döner (cause korunur).
   - `const next = { ...this.data.settings, ...safe };` **bellekte ata değil**.
   - Tek transaction:
     ```js
     let record = null;
     this.db.write(() => {
         this._flushSettings(this._settingsForDisk(next));
         record = this._insertAuditRow(audit);   // WP-11 tanımlar; WP-13 genişletir
         this._setMeta('updated_at', nowIso());
     });
     this.data.settings = next;
     ```
   - `_flushSettings` mevcut snapshot güncellemesini yapar; hata transaction’ı geri alır, `this.data.settings` değişmez.
   - Başarıda `{ ok:true, record }`; hatada `SETTINGS_AUDIT_FAILED` (cause korunur). `false` dönmez. IPC katmanı storage hatalarını `AUDIT_WRITE_FAILED` olarak normalize eder.
   - Audit checkpoint transaction sonrası yazılır; checkpoint hatası ayarı geri almaz, `auditCheckpointPending=true` ve `getSecurityStatus().auditDegraded=true` olur.
3. **Audit yazımını ortaklaştır.**
   - `appendAudit` içindeki satır ekleme/HMAC/seq mantığını `_insertAuditRow(audit)` olarak ayır; hem `appendAudit` hem `updateSettingsWithAudit` aynı fonksiyonu kullanır.
   - `appendAudit` kendi transaction’ında `_insertAuditRow` çağırır; WP-13’te bu fonksiyon tail güncellemesiyle genişletilir.
   - `auditStore()` sözleşmesine `updateSettingsWithAudit` eklenir; `AuditLog` bu yolu kullanır.
4. **`applySettingsPatch` atomik hale getir.**
   - `applySettingsPatch(newSettings, current, auditAction, options = {})`.
   - Güvenlik yolu (`auditAction` dolu):
     - `rest` boş değilse `updateSettingsWithAudit(rest, {actor:'user_interface', action:auditAction, target:Object.keys(rest).join(','), detail:`fields=${...}`})` çağır.
     - Hata → `{success:false, code:'AUDIT_WRITE_FAILED', cause: err.code, message:t('errorAuditWriteFailed')}`; `rest` hiç uygulanmaz.
     - Sır alanları güvenlik anahtarı değildir; ayrı yolda işlenir ve kendi audit’i yazılır. Sır audit’i başarısızsa sır geri alınır.
   - Güvenlik dışı `save-settings`:
     - Sır yoksa ve auditAction yoksa mevcut `updateSettings` kullanılabilir; audit istenirse `updateSettingsWithAudit`.
     - Sır varsa SQLite transaction’ı ile atomik olamaz; `previousSecrets` + `before` ile telafi edici rollback korunur. Sır yazımı başarılı + audit başarısız → sır ve `rest` geri alınır, `AUDIT_WRITE_FAILED` döner.
   - `needsRestart`:
     - Önce ayar+audit commit, sonra `localApiService.restart()`.
     - Restart başarısızsa `updateSettingsWithAudit(before, rollbackAudit)` ile geri al; rollback audit’i `settings_apply_rollback`.
     - Rollback audit’i de yazılamazsa `SETTINGS_ROLLBACK_AUDIT_FAILED`; kullanıcıya “ayarlar geri alındı, denetim kaydı eksik” mesajı; `auditDegraded` işaretle.
   - `generate-api-key`:
     - `LocalApiService.generateApiKey(role, { audit })`; servis `updateSettingsWithAudit` yoksa `AUDIT_BACKEND_UNAVAILABLE` throw eder.
     - Ham anahtar yalnız transaction başarılıysa döner; audit `api_key_generated`.
     - `main.js` PIN doğrulamasından sonra çağırır; hata `AUDIT_WRITE_FAILED` olarak döner.
   - `set-cancel-pin`/`clear-cancel-pin` (WP-01) ve `TaskManager.setPauseAll` (WP-06) bu API’yi kullanır; WP-06 kendi kapsamında `updateSettingsWithAudit` varsa onu, yoksa telafi edici `updateSettings` + audit yolunu uygular. WP-11 onları yeniden yazmaz; ortak `_insertAuditRow` sözleşmesine uyumunu T06-01/T06-02 ve T01 regresyon testleriyle doğrular.
5. **PIN iptal sırasını düzelt (O-11).**
   - `saveSecuritySettings(patch, onDone, { quiet, onCancel, onPinVerified })`:
     - `run(pin)` başarılıysa `onPinVerified(pin)` çağırır; PIN yalnız bu çağrı süresince bellekte tutulur, log/audit’e yazılmaz.
   - Ayarlar kaydet handler’ı:
     1. Form değerlerini ve `previous` durumunu al.
     2. `autonomyMode` mevcut SQLite değerinden farklıysa **önce** `saveSecuritySettings({autonomyMode}, null, {quiet:true, onCancel:restoreForm, onPinVerified})`.
        - `pendingPin` → hiçbir genel ayar kaydedilmez; form eski değerde kalır.
        - `success:false` → `restoreForm`; genel ayar kaydedilmez.
     3. Otonomi değişmediyse PIN sorulmaz; doğrudan genel ayarlara geçilir.
     4. Sonra `saveSettings({ language, ...energy.patch })`.
        - Başarısızsa: otonomi değiştiyse doğrulanmış PIN ile `securitySettingsUpdate({autonomyMode: previous.autonomyMode})` rollback dene; başarısızsa `SETTINGS_PARTIAL_ROLLBACK` göster; `commit()` çağrılmaz.
     5. İkisi de başarılıysa `commit()`: localStorage yalnız tema/autostart/voice/notifications/dil yazar; `autonomyMode` **yazılmaz** (SQLite tek kaynak).
   - `commit` içinde `localStorage.setItem('autonomyMode', ...)` kaldırılır; WP-04 kararıyla uyumlu.
   - `restoreForm` otonomi radyosunu ve dili eski değere döndürür.
6. **Hata mesajları ve audit.**
   - `errorAuditWriteFailed`, `errorSettingsApplyReverted`, `errorSettingsPartialRollback`, `auditDegradedNotice` anahtarları; 17 locale.
   - Audit kayıtları: `settings_security_updated`, `settings_secret_updated`, `api_key_generated`, `settings_apply_rollback`; PIN/hash asla yazılmaz.
   - `get-security-status` `auditDegraded` ve `auditCheckpointPending` alanlarını döner.
7. **Testler.**
   - T11-01…T11-07; renderer PIN iptal testi; `npm test` + `npm run test:e2e`.
8. **Kanıt.**
   - O-13/O-11 satırlarını T11 testleri ve manuel PIN iptal kaydıyla eşle.

#### 8.7.2 Çıktılar

- WP-01 minimal `updateSettingsWithAudit` sürümünü genelleştiren `StorageService` metodu ve ortak `_insertAuditRow`.
- Audit zorunlu güvenlik ayarı yolu; `AUDIT_WRITE_FAILED`.
- Atomik `generate-api-key`; PIN/sır yollarında telafi edici rollback.
- Renderer’da güvenlik-önce kaydetme sırası ve `autonomyMode` localStorage’dan kaldırılması.
- T11-01…T11-07 kanıtları.

#### 8.7.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Audit anahtarı yok → tüm güvenlik ayarları kilitlenir | Orta | Yüksek | Açılışta anahtar provisioning; açık hata; yerel kurtarma prosedürü | Anahtar yokken güvenlik ayarı yazma; downgrade yok |
| Sırlar SQLite transaction’ına giremez | Yüksek | Orta | Sırlar ayrı SecretStore; `before` + `previousSecrets` telafisi; audit zorunlu | Sır değişikliğini ayrı onay adımına böl |
| API restart sonrası rollback audit’i de başarısız | Düşük | Yüksek | `SETTINGS_ROLLBACK_AUDIT_FAILED` + auditDegraded; kullanıcıya net mesaj | Uygulamayı yeniden başlatıp manuel doğrulama |
| PIN rollback için bellekte tutulur | Orta | Orta | Yalnız handler kapsamı; loglanmaz; iş bitince bırakılır | Rollback gerekirse kullanıcıdan PIN tekrar iste |
| Otonomi değişmediğinde PIN sorulmaması yanlış anlaşılır | Düşük | Düşük | UI’da yalnız otonomi değişince PIN istendiğini belirt | Her kayıtta PIN iste (daha güvenli, daha sürtünmeli) |
| `updateSettingsWithAudit` snapshot tutarsızlığı | Orta | Orta | `_flushSettings` snapshot’ı transaction içinde günceller; test | `_primeSnapshots()` ile yeniden kur |

#### 8.7.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T11-01 | Audit anahtarı yok | `security-settings-update` | `AUDIT_WRITE_FAILED`; ayar değişmez | DB’de ne ayar ne audit satırı |
| T11-02 | DB yazım hatası | `_insertAuditRow` throw | Transaction rollback; ayar eski | `updateSettingsWithAudit` throw |
| T11-03 | Başarılı atomik yazım | Güvenlik ayarı + audit | İkisi de commit | Aynı `updated_at`; audit target doğru |
| T11-04 | PIN iptal | Dil/enerji değiştir + otonomi; PIN modalında vazgeç | Dil/enerji SQLite’ta değişmez; form eski | `saveSettings` çağrılmadı |
| T11-05 | Güvenlik başarısız | Otonomi PIN doğru; audit fail | Genel ayar kaydedilmez; hata | `commit()` yok |
| T11-06 | Genel kayıt fail | Otonomi başarılı; `saveSettings` fail | Otonomi rollback denenir; kullanıcı bilgilendirilir | `SETTINGS_PARTIAL_ROLLBACK` veya tam rollback |
| T11-07 | API anahtarı | `generate-api-key` audit fail | Ham anahtar dönmez; ayar değişmez | `AUDIT_WRITE_FAILED` |

#### 8.7.5 Geri alma

- Kod commit’ini geri al; `updateSettingsWithAudit` kaldırılırsa çağıranlar `updateSettings`e döner ve O-13 yeniden açılır.
- Veri migrasyonu yok; audit kayıtları geri silinmez.
- PIN iptal sırası geri alınırsa O-11 yeniden açılır; yalnız acil rollback.
- `autonomyMode` localStorage’a geri yazılmaz; D7/D8 korunur.

#### 8.7.6 Definition of Done (DoD)

- [ ] Güvenlik ayarı + audit tek transaction’da; audit hatasında ayar uygulanmıyor.
- [ ] `generate-api-key` ve PIN mutasyonları atomik audit’li.
- [ ] PIN iptalinde dil/enerji sunucuda değişmiyor.
- [ ] `autonomyMode` yalnız SQLite’ta; localStorage’a yazılmıyor.
- [ ] T11-01…T11-07 yeşil; `npm test` ve `npm run test:e2e` yeşil.
- [ ] `auditDegraded` görünür ve release notunda.

---

### 8.8 WP-12 — Uyarı süresi `0` semantiği

| Alan | Değer |
|---|---|
| **Bulgular** | O-02 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-02, WP-03 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/services/WarningManager.js`, `src/main/services/TaskManager.js`, `src/main/ipc/validate.js`, `src/main/services/models/taskFields.js`, `src/renderer/app.js`, `src/index.html`, `tests/main/warning-manager.test.mjs`, `tests/main/task-validation.test.mjs` |
| **İlgili kararlar** | D5, D6 |

**Amaç:** `durationSeconds:0` değerinin `|| 30` ile sessizce 30 saniyeye dönmesini bitirmek. Yeni kayıtlarda `0` reddedilir; `undefined` 30’dur; eski `0` kayıtları 1 saniyeye normalize edilir. Uyarıyı tamamen kapatmak yalnızca sunucu tarafı `warningConfig.enabled:false` ile mümkündür.

#### 8.8.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `durationSeconds:0` ile görev oluşturma → `INVALID_WARNING`; görev oluşmaz.
   - `durationSeconds:1` → 1 sn; `undefined` → 30; `3601` → red.
   - Eski kayıtlı görevde `0` → yükleme normalizasyonunda 1; audit `warning_duration_normalized`.
2. **Şemayı hizala.**
   - WP-03’teki `taskFields.js` doğrulaması `1..3600` aralığına ayarlanır (WP-03 metni güncellendi).
   - `WARNING_DEFAULTS = { enabled:true, durationSeconds:30 }`; `enabled:false` istemciden reddedilir (D6).
3. **WarningManager’da açık okuma.**
   ```js
   const raw = task.warningConfig && task.warningConfig.durationSeconds;
   const warningSec = raw === 0
     ? 1
     : (Number.isInteger(raw) && raw >= 1 && raw <= 3600 ? raw : 30);
   ```
   - `raw === 0` artık saklanmış olsa bile 1’e kelepçelenir; negatif/ondalık/3600 üstü 30’a düşer; `||` kullanılmaz.
   - `autoProceed` WP-15’te claim’e taşınır; bu WP’de davranış değişmez.
4. **Eski veriyi normalize et.**
   - `StorageService.normalizeLoaded()` veya `TaskManager` yükleme yolu: `warningConfig.durationSeconds === 0` → `1`.
   - Her görev için bir kez `warning_duration_normalized` audit kaydı (`detail: zero_to_one`), yalnız gerçekten değiştiyse.
   - `durationSeconds` negatif/ondalık/3600 üstü ise 30’a çek ve audit `invalid_duration_defaulted`; görev silinmez.
5. **UI.**
   - Uyarı süresi inputu `min="1" max="3600" step="1"`; yardım metni “0 kapatmaz; uyarıyı kapatmak için yalnız yönetici politikası”.
   - `durationSeconds` boşsa 30 göster; kaydetmede boş → 30.
   - `enabled` UI’dan kaldırılır; yalnız sunucu/politika görünümünde.
6. **Testler.**
   - T12-01…T12-05; `npm test`.
7. **Kanıt.**
   - O-02 satırını T12 testleriyle eşle.

#### 8.8.2 Çıktılar

- `1..3600` şema; `0` reddi.
- Açık `Number.isInteger` okuma; `undefined` → 30.
- Eski `0` → 1 normalizasyonu + audit.
- UI min/max ve yardım metni.
- T12-01…T12-05 kanıtları.

#### 8.8.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Eski `0` kullanıcısı 1 sn bekler, “hemen” bekler | Orta | Düşük | Release notu; UI’da min 1 | 0’ı 30’a çevirme; sessiz davranış değişikliği yapma |
| 1 sn uyarı pratikte görünmez | Orta | Orta | Minimum 1; kullanıcı 5+ seçebilir | Ürün kararı: min 5 (ayrı değişiklik) |
| Eski kayıt normalizasyonu audit üretir | Düşük | Düşük | Yalnız değişen görev; tek sefer | Audit anahtarı yoksa normalizasyon yine yapılır, audit uyarısı loglanır |
| `enabled:false` eski istemciden gelir | Orta | Yüksek | WP-03 şema reddi; `WARNING_CANNOT_DISABLE` | Görevi reddet; sessizce true yapma |
| `durationSeconds` ondalık gelir | Düşük | Düşük | Şema integer; runtime 30 fallback | Reddet |

#### 8.8.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T12-01 | Sıfır reddi | `durationSeconds:0` görev oluştur | `INVALID_WARNING` | Görev yok |
| T12-02 | Varsayılan | `undefined` | 30 sn | WarningManager 30 |
| T12-03 | Sınırlar | `1`, `3600`, `3601` | 1, 3600, red | Şema ve runtime aynı |
| T12-04 | Legacy 0 | Kayıtlı görev `0`; yükle | 1 sn + audit | `warningConfig.durationSeconds===1` |
| T12-05 | Enabled false | İstemci `enabled:false` | `WARNING_CANNOT_DISABLE` | Uyarı kapanmaz |

#### 8.8.5 Geri alma

- Kod commit’ini geri al; şema `0` kabul ederse O-02 yeniden açılır.
- Normalize edilmiş 0→1 geri alınmaz; veri kaybı yok.
- UI min/max geri alınırsa kullanıcı 0 girebilir; sunucu yine reddeder.

#### 8.8.6 Definition of Done (DoD)

- [ ] Yeni kayıtta `0` reddediliyor; `undefined` 30.
- [ ] WarningManager `||` kullanmıyor; 1..3600 kelepçesi var.
- [ ] Eski `0` kayıtları 1’e normalize + audit.
- [ ] UI min/max ve yardım metni doğru.
- [ ] T12-01…T12-05 yeşil.

---

### 8.9 WP-13 — Audit append/retention/rotation ve tek yol

| Alan | Değer |
|---|---|
| **Bulgular** | O-08, O-10, D-08 |
| **Öncelik** | P1 / G2 |
| **Bağımlılık** | WP-11 |
| **Kapı** | G2 |
| **Ana dosyalar** | `src/main/storage/schema.sql`, `src/main/services/StorageService.js`, `src/main/services/AuditLog.js`, `src/main/security/AuditCheckpoint.js`, `src/main/services/LocalApiService.js`, `src/main/storage/MigrateV2.js`, `tests/main/audit.test.mjs`, `tests/main/audit-retention.test.mjs`, `tests/main/storage.test.mjs` |
| **İlgili kararlar** | D21 |

**Amaç:** Audit append’in her yazımda tüm tabloyu okumasını bitirmek; sınırlı, arşivli ve doğrulanabilir retention uygulamak; `rotatedFrom`’u HMAC kapsamına almak; legacy JSON ile SQLite audit yollarını tek yazma yoluna indirmek.

#### 8.9.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tests/main/audit.test.mjs`: 10.000 kayıt sonrası append süresi sabit kalmalı; `getAuditLog` tüm tabloyu döndürmemeli; sayfalama doğru.
   - `tests/main/audit-retention.test.mjs`: retention arşiv yazar, anchor oluşturur, eski satırları siler; `rotatedFrom` değiştirilince `verify` `TAMPERED`.
   - Legacy JSON kaydı varken yeni yazım SQLite’a gider; iki yol aynı verify/retention davranışını verir.
2. **Şema v4 ve migrasyon.**
   - `CURRENT_SCHEMA_VERSION = 4`.
   - `openExisting()` içinde `_loadAll()` öncesi `_ensureAuditSchema()`:
     - `PRAGMA table_info(audit_log)`; yoksa `ALTER TABLE audit_log ADD COLUMN hmac_version INTEGER NOT NULL DEFAULT 1;`
     - `ALTER TABLE audit_log ADD COLUMN rotated_from TEXT;`
     - `CREATE TABLE IF NOT EXISTS audit_rotation (id INTEGER PRIMARY KEY CHECK(id=1), first_seq INTEGER NOT NULL, last_removed_hmac TEXT NOT NULL, archive_path TEXT NOT NULL, archive_sha256 TEXT NOT NULL, anchor_hmac TEXT NOT NULL, rotated_at TEXT NOT NULL);`
     - `seq` PK olduğu için ek indeks gerekmez; mevcut `ts` indeksi kalır.
   - Mevcut satırlar `hmac_version=1` kalır; yeniden HMAC hesaplanmaz. `meta.audit_chain='hmac-v2'` yalnız yeni yazım başlayınca set edilir.
   - Migrasyon idempotent; yarıda kalırsa tekrar çalışır. Şema değişikliği `quick_check` sonrası.
3. **HMAC v1/v2 ayrımı.**
   ```js
   function auditCanonical(rec, version = 1) {
       const base = { seq: rec.seq, ts: rec.ts, actor: rec.actor, action: rec.action,
                      target: rec.target, detail: rec.detail, prev_hmac: rec.prev_hmac };
       if (version === 2) return canonicalizeFn({ ...base, hmac_version: 2, rotated_from: rec.rotated_from || null });
       return canonicalizeFn(base);
   }
   ```
   - Yeni satırlar `hmac_version=2`; normal satırlarda `rotated_from=null`.
   - `verifyAuditChain()` her satırın `hmac_version` değerine göre doğru kanonik formu kullanır; bilinmeyen sürüm `UNSUPPORTED_HMAC_VERSION` ile fail-closed.
   - `rotated_from` yalnız retention sonrası ilk satırda dolu; değiştirilirse HMAC bozulur.
4. **Append’i O(1) yap.**
   - `_insertAuditRow(audit)` yalnız `SELECT seq, record_hmac FROM audit_log ORDER BY seq DESC LIMIT 1` çalıştırır; `INSERT` eder; tüm tabloyu okumaz.
   - Commit sonrası `this.data.auditLog.push(rec)`; bellek tail’i `AUDIT_MEMORY_TAIL=5000` ile sınırlanır (eski kayıtlar DB’de kalır).
   - `appendAudit` artık `this.getAuditLog()` çağırmaz; checkpoint için `auditDayCounts` haritasını artırır.
   - `getAuditLog({limit=null, offset=0, since=null, order='asc'}={})`:
     - Parametresiz: bellek tail’i (geriye uyum, en fazla 5000).
     - Parametreli: SQL `LIMIT/OFFSET`, `since` (`ts >= ?` veya `seq >= ?`), `COUNT(*)`.
   - `AuditLog.load({limit, offset})` storage sayfasını kullanır; `AuditLog.verify()` storage `verifyAuditChain()`e delege eder.
5. **Checkpoint’i artımlı yaz.**
   - `AuditCheckpoint.recordAppended({day, count, seq, hmac})` ekle: bugünkü dosyayı okur/yoksa oluşturur; `count`, `lastSeq`, `lastHmac` günceller; atomik temp+rename.
   - `ensureToday(records)` yalnız migrasyon/rebuild için kalır; normal append yolu tam listeyi geçirmez.
   - Açılışta `auditDayCounts` DB’den `SELECT substr(ts,1,10) day, COUNT(*) ... GROUP BY day` ile bir kez doldurulur; bugünkü checkpoint yoksa yeniden yazılır.
6. **Retention ve rotation.**
   - Sabitler: `AUDIT_RETENTION_DAYS=90`, `AUDIT_RETENTION_ROWS=100000`, `AUDIT_ARCHIVE_DIR='audit-archive'`.
   - `applyAuditRetention({now=Date.now(), keepDays, keepRows})`:
     - Yalnız zincir prefix’i silinir: `ageFirstSeq = MIN(seq) WHERE ts >= cutoff` (yoksa `maxSeq+1`), `countFirstSeq = MAX(1, maxSeq-keepRows+1)`, `firstSeq = MAX(ageFirstSeq, countFirstSeq)`; silme `seq < firstSeq` ile yapılır. Saat kayması fazla satır bırakır; ortadan/aralıklı silme yapılmaz.
     - Arşiv: `audit-archive/audit_<fromSeq>_<toSeq>.ndjson` temp+fsync+rename; her satır JSON; SHA-256.
     - `audit_rotation` satırı: `{first_seq, last_removed_hmac, archive_path, archive_sha256, anchor_hmac}`; `anchor_hmac = HMAC(key, canonical({first_seq,last_removed_hmac,archive_sha256}))`.
     - Transaction:
       1. İlk korunacak satırın `prev_hmac` zaten `last_removed_hmac`; `rotated_from=last_removed_hmac`, `hmac_version=2`.
       2. İlk satırdan itibaren tüm korunan satırların HMAC’ini yeni `prev_hmac` zinciriyle yeniden hesapla; `prev_hmac` alanlarını güncelle.
       3. Silinecek satırları `DELETE`.
       4. `audit_rotation` satırını yaz.
     - Arşiv başarısızsa hiçbir satır silinmez; `auditRetentionPending=true`.
     - Re-HMAC maliyeti yalnız retention anında ve korunan satır sayısı kadardır; günlük/100k eşiğinde çalışır.
   - Retention günlük açılışta ve `appendCount % 1000 === 0` kontrolünde; kilit/reentrancy guard.
   - Arşiv dosyaları otomatik silinmez. `AUDIT_ARCHIVE_KEEP_DAYS` (varsayılan 365) yalnız operasyonel temizlik için alt sınırdır; anchor olmadan arşiv silme yoktur.
7. **Doğrulamayı zincir başına genelleştir.**
   - İlk satır `seq > 1` ise `audit_rotation` kaydı zorunlu; `first_seq` eşleşmeli; `rotated_from === last_removed_hmac`; arşiv dosyası var ve SHA-256 eşleşmeli; `anchor_hmac` doğru.
   - Zincir `seq === firstSeq + i`; `prev_hmac` sıralı; her satır kendi `hmac_version` ile doğrulanır.
   - Checkpoint doğrulaması retention sonrası kalan günler için yeniden üretilir; eski günlerin checkpoint’i arşivle birlikte saklanır.
   - `verifyAuditChain()` dönüşü `{ok, records, firstSeq, lastSeq, rotated:true/false}`.
8. **Tek yazma yolu (D-08).**
   - `AuditLog.append(input)`:
     - `storage.appendAudit` varsa ve audit anahtarı varsa yalnız onu çağırır.
     - Anahtar yoksa üretimde `AUDIT_KEY_MISSING` throw; legacy SHA yalnız `{allowLegacy:true}` (migrasyon/test) ile.
   - `StorageService.saveAuditLog` yalnız migrasyon adaptörü; yeni yazım için kullanılmaz. `AuditLog.MAX_RECORDS` sabiti legacy adaptörde de aynı retention politikasına bağlanır.
   - `auditStore()` yeni `appendAudit`, `getAuditLogPage`, `verifyAuditChain`, `hasAuditKey` yüzeyini sunar.
   - Legacy kayıtlar varsa açılışta `audit_chain='legacy'` ise HMAC anahtarı varsa `rebuildAuditChain()` bir kez çalışır; yoksa legacy okuma modu korunur ve yeni yazım reddedilir.
9. **API entegrasyonu.**
   - WP-08 `/audit` route’u `audit.load({limit,offset})` yerine `storage.getAuditLogPage()` kullanır; `total` DB’den.
   - `/audit/verify` `verifyAuditChain()` hafif sonuç döner; tam kayıt döndürmez.
10. **Testler ve kanıt.**
    - T13-01…T13-07; 10k/100k ölçüm; `npm run test:security`.

#### 8.9.2 Çıktılar

- Şema v4: `hmac_version`, `rotated_from`, `audit_rotation`.
- O(1) append, bellek tail’i ve DB sayfalama.
- Arşivli, anchor’lı retention; v1/v2 doğrulama.
- Tek SQLite/HMAC yazma yolu; legacy yalnız migrasyon.
- T13-01…T13-07 kanıtları.

#### 8.9.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Retention re-HMAC’i uzun sürer | Orta | Orta | Yalnız eşikte; transaction; ilerleme logu; 100k sınırı | Retention’i ertele; disk uyarısı |
| Arşiv yazılamazsa audit büyür | Orta | Orta | `auditRetentionPending`; kullanıcı uyarısı; disk kontrolü | Retention’i durdur; silme yok |
| v1/v2 karışımı yanlış doğrulanır | Orta | Yüksek | Satır bazlı sürüm; bilinmeyen sürüm fail-closed; test | Tüm zinciri yeniden hesapla (onaylı migrasyon) |
| Rebuild eski `rotated_from`’u kaybeder | Düşük | Orta | Rebuild öncesi rotation tablosunu koru; anchor’ı taşı | Yeniden denetim; arşivden kurtar |
| Checkpoint artımlı sayımı kayar | Orta | Orta | Açılışta DB count; günlük reconcile; test | Gün checkpoint’ini DB’den yeniden yaz |
| Legacy yazma yolu yanlışlıkla açık kalır | Orta | Yüksek | `allowLegacy` yalnız test/migrasyon; kod araması | Üretimde anahtar yoksa fail-closed |
| `getAuditLog()` tüketicileri tam listeye güvenir | Orta | Orta | Parametresiz tail dokümantasyonu; çağıranları sayfaya geçir | Geçici tam okuma yalnız admin export |

#### 8.9.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T13-01 | O(1) append | 10.000 kayıt; ardışık append süreleri | Süre kayıt sayısıyla artmaz | Son 100 append p95 < 20 ms (CI toleransı) |
| T13-02 | Sayfalama | 250 kayıt; `limit=50,offset=100` | 50 kayıt; `total=250` | Sıra ve seq doğru |
| T13-03 | Retention | 120 gün / 100k üstü simülasyon; saat kayması | Arşiv + anchor; yalnız prefix silinir | Verify yeşil; arşiv SHA eşleşir; ortadan silme yok |
| T13-04 | rotatedFrom tamper | İlk korunan satırın `rotated_from` değiştir | `TAMPERED` | Fail-closed |
| T13-05 | v1/v2 karışım | Eski v1 + yeni v2 satırlar | Verify yeşil; v1 bozulursa fail | Sürüm bazlı doğrulama |
| T13-06 | Tek yol | Legacy JSON + anahtar; yeni append | SQLite’a yazılır; legacy dosya büyümez | `audit_chain='hmac-v2'` |
| T13-07 | Arşivsiz silme | Arşiv yazımı throw | Hiçbir satır silinmez | `auditRetentionPending` |

#### 8.9.5 Geri alma

- Şema v4 geri alınmaz; kolonlar geriye uyumlu. Kod commit’i geri alınırsa yeni satırlar v2 okunamaz; bu nedenle rollback yalnız şema v4 uyumlu kodla.
- Retention durdurulabilir; silinen arşiv geri yüklenebilir (anchor doğrulanarak).
- Legacy yolu geri açmak D-08’i yeniden açar; üretimde önerilmez.
- `getAuditLog()` tail davranışı geri alınırsa O-08 yeniden açılır.

#### 8.9.6 Definition of Done (DoD)

- [ ] Append tüm tabloyu okumuyor; 10k sonrası sabit maliyet.
- [ ] Retention arşiv + anchor olmadan silmiyor; `rotatedFrom` HMAC kapsamında.
- [ ] v1/v2 zincir doğrulaması ve sayfalama çalışıyor.
- [ ] Tek SQLite/HMAC yazma yolu; legacy yalnız migrasyon.
- [ ] T13-01…T13-07 yeşil; `npm run test:security` yeşil.

---

### 8.10 G2 — P1 çıkış kontrolü ve `1.1.1` sınırlı yayın kararı

`G2` aşağıdaki maddelerin tamamı sağlanmadan kapanmaz:

- [ ] WP-00 G0 DoD tamam; iki halkalı kapsam politikası ve `verify:traceability` çalışıyor.
- [ ] WP-05 Y-01 + D-06: tüm ayar IPC yanıtları public projeksiyon; `getSettings()` savunmacı kopya.
- [ ] WP-06 Y-02: tray pause/quit PIN kapısı; doğrudan `updateSettings` yok; T06-01…T06-06 yeşil.
- [ ] WP-07 Y-05: `SafetyPolicyEngine` fail-closed; kısmi politika ve kullanıcı etkinliği; T07-01…T07-07 yeşil.
- [ ] WP-08 Y-06 + O-05 + O-06: rol varsayılanı yok; URL/Host doğrulaması; audit yalnız admin ve sayfalı; T08-01…T08-06 yeşil.
- [ ] WP-09 O-04: idempotency fingerprint ve durum makinesi; T09-01…T09-06 yeşil.
- [ ] WP-10 Y-07: ajan kimliği bağlı; kill-switch fail-closed; pause senkronu; T10-01…T10-06 yeşil.
- [ ] WP-11 O-13 + O-11: ayar+audit tek transaction; PIN iptalinde sunucu rollback; T11-01…T11-07 yeşil.
- [ ] WP-12 O-02: `durationSeconds` 1…3600; `0` reddi; legacy normalizasyonu; T12-01…T12-05 yeşil.
- [ ] WP-13 O-08 + O-10 + D-08: O(1) append, arşivli retention, v1/v2 doğrulama, tek yol; T13-01…T13-07 yeşil.
- [ ] P1’e ait hiçbir `it.fails` kalmamış; her kırmızı test normal `it` olmuş.
- [ ] `npm test`, `npm run test:security`, `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G2` (G2 kapsamı), `npm run test:e2e`, `npm run locales:check`, `npm run verify:traceability`, `npm run release:check` yeşil.
- [ ] `docs/audit/V3_EVIDENCE_MATRIX.md` içinde P1 bulgularının kırmızı/yeşil kanıtı, commit ve gözden geçiren alanları dolu.
- [ ] `1.1.1` sürüm adayı yalnızca P0+P1 değişikliklerini içeriyor; P2/P3 Yüksek bulguları (Y-03, Y-04, Y-08, Y-09, Y-10, Y-11) için ayrı risk kabul kaydı var ve release notunda açıkça listeleniyor.
- [ ] `1.1.1` genel dağıtım değil; sınırlı güvenlik yaması. Genel yayın `1.2.0` ve G5’e bağlı.
- [ ] `1.1.0 → 1.1.1` yükseltme ve `1.1.1 → 1.1.0` geri dönüş testi; veritabanı şeması geriye uyumlu; audit zinciri korunuyor.
- [ ] `npm audit --audit-level=high`, `npm run audit:licenses`, `npm run sbom` yeşil; imzalı installer `scripts/verify-signature.ps1` ile doğrulandı; yeni yüksek/kritik CVE yok veya kabul kaydı var.
- [ ] Güvenlik danışma metni ve operatör iletişimi hazır; PIN, tray ve audit davranış değişiklikleri kullanıcıya açıklanmış.

> **G2 notu:** `1.1.1` sınırlı yamanın amacı K-01…K-04 ve P1 güvenlik açıklarını kapatmaktır. P2/P3’teki Y-03, Y-04, Y-08, Y-09, Y-10 ve Y-11 açıkken ürün “genel kullanıma hazır” ilan edilemez. Bu bulgular için ancak yazılı risk kabulü, etkilenen senaryoların devre dışı bırakılması ve operatör bilgilendirmesi varsa dağıtım yapılabilir.

---

## 9. P2 — Veri Bütünlüğü ve Görev Yaşam Döngüsü (WP-14 – WP-21)

> **Gate kuralı:** `G3` kapanmadan `1.2.0-beta.1` üretilmez. Bu aşamada Y-03, Y-04, Y-08, Y-09, Y-10 ve O-01, O-03, O-07, O-09 kapanır.
>
> **Sıra:** `WP-14`, `WP-16`, `WP-17`, `WP-18`, `WP-20` ve `WP-21` WP-00 sonrası paralel başlayabilir. `WP-15` WP-14’e; `WP-19` WP-15’e; `WP-22` WP-15 + WP-19’a bağlıdır. Aynı dosyaya dokunan sıra korunur: `WP-14 → WP-15 → WP-19 → WP-22`.
>
> **P2 ilkesi:** Veri bütünlüğü testleri yalnızca mock ile değil, gerçek geçici SQLite dosyaları, gerçek WAL/SHM dosyaları ve süreç düzeyinde kilit yarışı ile yapılır. Hata enjeksiyonu `tests/helpers/fault-injection.mjs` üzerinden yapılır; test içinde üretim kodunun özel dalları açılmaz.

### 9.1 WP-14 — `executing` aktif görev ve süreç polling sınırı

| Alan | Değer |
|---|---|
| **Bulgular** | Y-03, O-07 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/services/TaskManager.js`, `main.js`, `src/main/services/monitors/MetricCollector.js`, `preload.js`, `src/renderer/app.js`, `src/main/locales/*.json`, `tests/main/taskmanager.test.mjs`, `tests/main/main-i18n.test.mjs`, `tests/e2e/smoke.spec.js` |
| **İlgili kararlar** | D1 |

**Amaç:** Güç işlemi yürürken (`EXECUTING`) görevin “aktif” sayılmaması nedeniyle kapanış guard’ının, mini pencerenin ve tray sayısının görevi kaçırmasını bitirmek; buna karşılık süreç koşulu polling’ini yalnızca gerçekten koşul izleyen görevlerle sınırlamak.

#### 9.1.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `taskmanager.test.mjs`: `EXECUTING` durumundaki etkin görev `getActiveTasks()` içinde; tamamlanmış/iptal edilmiş görev değil.
   - `main-i18n.test.mjs` veya yeni `active-state.test.mjs`: `get-active-state` yanıtı executing görevi döndürür; mini pencere görünürlük koşulu bu görevi sayar.
   - `taskmanager.test.mjs`: terminal görevde `PROCESS_RUNNING` koşulu olsa bile `hasProcessConditions()` false; yalnız `SCHEDULED`, `MONITORING`, `WAITING`, `WARNING` sayılır.
   - `taskmanager.test.mjs`: `enabled:false` + `EXECUTING` legacy kayıt → `getActiveTasks()` dışlar ama `hasInFlight()` true; çıkış yine engellenir.
   - E2E smoke: executing sırasında pencere kapatma guard’ı ve mini pencere davranışı.
2. **Durum kümelerini tek yerde tanımla.**
   - `TaskManager` içinde:
     ```js
     const ACTIVE_TASK_STATUSES = new Set([
       TASK_STATUS.SCHEDULED, TASK_STATUS.MONITORING, TASK_STATUS.WAITING,
       TASK_STATUS.WARNING, TASK_STATUS.EXECUTING
     ]);
     const CONDITION_WATCH_STATUSES = new Set([
       TASK_STATUS.SCHEDULED, TASK_STATUS.MONITORING,
       TASK_STATUS.WAITING, TASK_STATUS.WARNING
     ]);
     ```
   - `getActiveTasks()` yalnız `enabled === true` ve `ACTIVE_TASK_STATUSES` ile filtreler.
   - `getConditionWatchTasks()` yalnız `enabled === true` ve `CONDITION_WATCH_STATUSES` ile filtreler; dışarıya verilmez.
   - `hasInFlight()` yalnız `status === EXECUTING` arar; `enabled` filtresi **uygulamaz** ve `getActiveTasks()` çağırmaz. Böylece `enabled:false` kalmış legacy/bozuk bir executing kayıt çıkış guard’ını atlayamaz.
   - `recoverTasksOnStartup()` içinde `EXECUTING`/`WARNING` terminalizasyonu `!enabled` erken dönüşünden **önce** yapılır; böylece devre dışı kalmış yarıda görev `FAILED` olur ve kalıcı çıkış kilidi bırakmaz.
   - `hasProcessConditions()` `getConditionWatchTasks()` üzerinden `PROCESS_RUNNING` arar; terminal görevleri asla saymaz.
3. **Kapanış ve çıkış yolunu merkezileştir.**
   - `main.js` içinde `getActiveCount()` ve `hasInFlight()` yardımcıları TaskManager’ı tek noktadan okur; çıkış kararı `getActiveCount() > 0 || hasInFlight()` bileşimidir.
   - `mainWindow.on('close')`: `hasActive = getActiveCount() > 0 || hasInFlight()`; `isQuitting` değilse `preventDefault()` + `hide()` + tray bildirimi.
   - `window-all-closed`: `getActiveCount() > 0 || hasInFlight()` ise `app.quit()` çağrılmaz; `appQuitPending = true` yalnızca kullanıcı çıkış istediyse işaretlenir.
   - `TaskManager` son claim’i bıraktığında `onIdle` / `changeListener` üzerinden `maybeQuitWhenIdle()` çağrılır: pencere yoksa, `getActiveCount() === 0`, `hasInFlight() === false` ve `appQuitPending` ise `app.quit()`.
   - `before-quit`: `hasInFlight()` true ve `forceQuit !== true` ise `preventDefault()`; ana pencereyi göster ve `t('quitBlockedByExecution')` mesajı ver. Tray çıkışı WP-06’nın PIN kapısından geçtikten sonra aynı `requestQuit()` yolunu kullanır.
   - `requestQuit({ force = false })` yalnızca bu dosyada tanımlı; `isQuitting` yalnızca gerçek çıkış anında set edilir.
   - `quitBlockedByExecution` anahtarı 17 main locale dosyasına eklenir; çevirisi olmayanlarda İngilizce fallback kullanılır.
4. **Mini pencere, tray ve `get-active-state`.**
   - Mini pencere görünürlüğü `getActiveTasks().length > 0` kullanır; executing sırasında gizlenmez.
   - Tray “aktif görev” sayısı `getActiveTasks()` üzerinden; executing görevi `0` göstermez.
   - `get-active-state` `activeTasks` alanını `getActiveTasks()` ile üretir; renderer `executing` durumunu `renderMonitoringTasks` ile gösterir.
5. **Süreç polling’ini gerçekten durdur.**
   - `MetricCollector` `needsProcessList` sağlayıcısını `hasProcessConditions()` üzerinden alır; terminal görevler false üretir.
   - `shouldSampleProcesses()` false olduğunda mevcut liste `processListStale = true` yapılır; böylece eski liste taze sanılmaz.
   - Görev tamamlandığında `syncScheduler`/`removeScheduler` sonrası `MetricCollector` bir sonraki tick’te polling’i bırakır; ayrı `stopProcessPolling` gerekmez.
6. **Testler ve kanıt.**
   - T14-01…T14-04; executing için gerçek task nesnesi, terminal için gerçek `COMPLETED`/`CANCELLED`/`FAILED` durumları.
   - E2E’de güç işlemi mock’lanır; gerçek shutdown denenmez.

#### 9.1.2 Çıktılar

- `ACTIVE_TASK_STATUSES`, `CONDITION_WATCH_STATUSES`, `getConditionWatchTasks()`, `hasInFlight()`.
- `EXECUTING` dahil `getActiveTasks()`; kapanış, mini, tray ve active-state entegrasyonu.
- Terminal görevlerde süreç polling’ini durduran `hasProcessConditions()`.
- `requestQuit()` / `maybeQuitWhenIdle()` çıkış yolu.
- T14-01…T14-04 kanıtları.

#### 9.1.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Executing görev yüzünden uygulama hiç kapanmaz | Orta | Orta | `before-quit` yalnız gerçek in-flight’te bekletir; tamamlanınca `maybeQuitWhenIdle`; kullanıcıya durum gösterilir | `forceQuit` yalnız PIN’li tray çıkışında ve onay metniyle |
| Güç işlemi sırasında çıkış zorlanır | Düşük | Yüksek | `forceQuit` yalnız açık kullanıcı onayı; audit kaydı; işlem sonucu yazılamazsa uyarı | Çıkışı reddet; kullanıcıyı beklemeye yönlendir |
| Mini pencere executing sırasında sürekli açık kalır | Orta | Düşük | Süreç bitince `getActiveTasks()` 0; mini kapanır; test | Kullanıcı gizleme düğmesi; tray |
| Terminal görev polling’i durmuyor | Orta | Orta | `CONDITION_WATCH_STATUSES` birim testi; `needsProcessList` sayacı | MetricCollector’da terminal filtresi ikinci savunma |
| Aynı anda iki pencere kapanışı `app.quit()` yarışı | Düşük | Orta | Tek `appQuitPending` bayrağı; `isQuitting` yalnız gerçek çıkışta; idempotent `requestQuit` | İkinci çağrıyı yoksay; logla |

#### 9.1.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T14-01 | Executing aktif sayılır | Görev `SCHEDULED` → `EXECUTING`; `getActiveTasks()`; sonra `enabled:false` legacy varyant | Etkin görev listede ve `hasInFlight()` true; `enabled:false` executing yalnız `hasInFlight()` true | Terminal görev listede değil; in-flight guard `enabled`’dan bağımsız |
| T14-02 | Kapanış/mini/tray/active-state | Executing sırasında `close`, mini görünürlük, tray sayısı, `get-active-state` | Dördü de görevi görür; kapanış `preventDefault` | Pencere gizlenir; mini açık; sayaç 1 |
| T14-03 | Çıkış ertelenir | `window-all-closed` + `before-quit`; görev tamamlanınca | Çıkış beklemede; tamamlanınca `app.quit()` | Erken `quit` yok; sonuç/history yazıldı |
| T14-04 | Terminal polling durur | Tamamlanmış görevde `PROCESS_RUNNING`; `hasProcessConditions()` | false; metric collector süreç listesi istemez | Aktif görevde true; terminalde false |

#### 9.1.5 Geri alma

- Kod commit’i geri alınırsa Y-03 ve O-07 yeniden açılır; kısmi geri alma (yalnız `getActiveTasks`) yapılmaz.
- `ACTIVE_TASK_STATUSES` geri alınacaksa kapanış guard’ı ayrı bir `hasInFlight()` ile korunmalı; aksi halde veri kaybı riski kabul edilemez.
- `window-all-closed` davranışı geri alınırsa yalnız acil rollback; release notunda “executing sırasında kapanış” riski belirtilir.

#### 9.1.6 Definition of Done (DoD)

- [ ] `getActiveTasks()` executing görevini içeriyor.
- [ ] `hasInFlight()` yalnız `EXECUTING` durumuna bakar; `enabled:false` legacy kayıt çıkış guard’ını atlayamaz.
- [ ] Kapanış guard’ı, mini pencere, tray ve `get-active-state` aynı aktif tanımı kullanıyor.
- [ ] `window-all-closed` ve `before-quit` in-flight görevde çıkışı erteliyor; görev bitince çıkış tamamlanıyor.
- [ ] `hasProcessConditions()` terminal görevleri saymıyor; süreç polling’i duruyor.
- [ ] T14-01…T14-04 yeşil; E2E smoke yeşil.

---

### 9.2 WP-15 — Claim-scoped auto-proceed

| Alan | Değer |
|---|---|
| **Bulgular** | Y-04 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-14 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/services/TaskManager.js`, `src/main/services/WarningManager.js`, `tests/main/warning.test.mjs`, `tests/main/taskmanager.test.mjs`, `tests/main/p0/k04-autonomy.test.mjs` |
| **İlgili kararlar** | D4, D7 |

**Amaç:** `_schedulerFired` görev özelliğini kaldırmak; “uyarıyı otomatik geç” kararını yalnızca o execution’ın claim’ine bağlamak. Böylece manuel çalıştırılan bir görev sonraki tekrarlarında uyarıyı atlamaz.

#### 9.2.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `warning.test.mjs`: `showWarning(task, { autoProceed: false })` zaman aşımında `proceed:false`; `{autoProceed:true}` zaman aşımında `proceed:true`.
   - `taskmanager.test.mjs`: `runTaskNow(classic)` sonrası görevde `_schedulerFired` yok; bir sonraki tekrar uyarı bekliyor.
   - Uzak kaynaklı scheduler execution’ında claim `autoProceed:true`; sonraki execution’a taşınmıyor.
2. **Claim alanını tanımla.**
   - `claimTask(taskId, source, options = {})` claim nesnesine `autoProceed: options.autoProceed === true` ekler; varsayılan false.
   - `handleTaskExecution`: yalnız `LOCAL_API`, `N8N`, `CONSOLE` kaynaklı scheduler claim’inde `claim.autoProceed = true`.
   - `runTaskNow`: claim’i `{ source: 'manual', autoProceed: false }` ile alır. Manuel çalıştırmada kaynak ne olursa olsun uyarı gösterilir.
   - `claimTask` çağrılarının diğerleri (UI, zincir, order executor) açık `autoProceed:false` kullanır.
3. **`WarningManager` sözleşmesini netleştir.**
   - `showWarning(task, options = {})`; `autoProceed = options.autoProceed === true || task.mode === 'full'`.
   - `task._schedulerFired` okunmaz; `WarningManager` içinde bu alan geçmez.
   - `showWarning` dönüşü mevcut `{proceed, snoozed}` sözleşmesini korur; zaman aşımı `autoProceed` değerine göre.
   - `full` mod her zaman otomatik; `classic` yalnız aynı execution’ın `autoProceed` değeri true ise otomatik.
4. **TaskManager çağrı noktalarını düzelt.**
   - `executeTask` claim’i aldıktan sonra:
     ```js
     const warning = await this.warningManager.showWarning(task, {
       autoProceed: claim.autoProceed === true
     });
     ```
   - `claim.autoProceed` execution bitince `releaseTask` ile birlikte yok olur; görev nesnesine yazılmaz, persist edilmez.
   - `calculateNextRecurrence` içinde `_schedulerFired` temizliği yapılmaz; alan tamamen kaldırılır. Eski bellekte kalan alan `init()` sırasında `delete task._schedulerFired` ile temizlenir.
5. **Uyarı kimliğiyle birlikte çalış.**
   - WP-02’nin `taskId+epoch` onayı aynen kalır; autoProceed yalnız zaman aşımı davranışını belirler, kullanıcı tıklamasını taklit etmez.
   - Otomatik ilerlemede audit/notification `WARNING_AUTO_PROCEED` nedeniyle `source:scheduler` ve `claimId` taşır; kullanıcı onayıyla karışmaz.
6. **Testler ve kanıt.**
   - T15-01…T15-05; fake timer ile uyarı süresi hızlandırılır.
   - Recurrence testi en az iki dönem çalıştırır; ilk manuel execution’ın ikinci dönemi etkilemediği doğrulanır.

#### 9.2.2 Çıktılar

- `claim.autoProceed` alanı ve tüm claim çağrılarında açık değer.
- `WarningManager.showWarning(task, options)`; `task._schedulerFired` kaldırıldı.
- `runTaskNow` manuel kaynağı; uzak scheduler auto-proceed.
- T15-01…T15-05 kanıtları.

#### 9.2.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Uzak görev artık uyarıda 30 sn bekler | Orta | Orta | `autoProceed` scheduler claim’inde true; test; süre ayarı WP-12 | Uzak kaynak için `warningConfig.enabled:false` sunucu ayarı |
| Manuel çalıştırma yanlışlıkla auto kabul edilir | Düşük | Yüksek | `source:'manual'`; claim testi; `_schedulerFired` grep | Uyarıyı her zaman göster; otomatik yolu kaldır |
| `full` mod davranışı bozulur | Orta | Orta | Ayrı `full` testi; mode SQLite’tan (WP-03/04) | `full` için açık `autoProceed:true` |
| Claim alanı yanlışlıkla görev nesnesine kopyalanır | Düşük | Orta | Yalnız `claim` nesnesi; persist şemasında alan yok | Runtime’da `delete`; test |
| Eski `_schedulerFired` görev bellekte kalır | Düşük | Orta | `init` temizliği; `grep`; sürüm notu | İlk yüklemede tüm görevlerden sil |

#### 9.2.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T15-01 | Manuel classic | `runTaskNow`; uyarı süresini bitir | Uyarı `proceed:false`; görev iptal | `_schedulerFired` yok |
| T15-02 | Zamanlanmış yerel classic | Scheduler tetikler; uyarıyı onayla | Uyarı gösterilir; onayla yürür | Claim autoProceed false |
| T15-03 | Uzak scheduler classic | `LOCAL_API`/`N8N`/`CONSOLE` scheduler | Uyarı gösterilir; süre sonunda otomatik | Claim autoProceed true |
| T15-04 | Tekrar sızıntısı | T15-01 sonrası aynı görevi tekrar zamanla | İkinci çalışma yine uyarı bekler | Görevde kalıcı bayrak yok |
| T15-05 | `full` mod | `autoProceed:false` ama mode full | Zaman aşımında otomatik | Mode kaynağı SQLite |

#### 9.2.5 Geri alma

- `_schedulerFired` geri getirilirse Y-04 yeniden açılır; geri alma yalnız acil rollback, release notunda risk.
- `claim.autoProceed` kaldırılırsa tüm uzak scheduler görevleri uyarıda bekler; operasyonel geri dönüş için uzak kaynakta `warningConfig.enabled:false` kullanılabilir, ancak bu güvenlik kararı ayrı onay ister.
- WP-02 onay kimliği geri alınmaz; auto-proceed onayla karıştırılmaz.

#### 9.2.6 Definition of Done (DoD)

- [ ] `task._schedulerFired` kodda ve persist edilen modelde yok.
- [ ] Auto-proceed yalnız execution claim’inde; manuel çalıştırma sonraki tekrarları etkilemiyor.
- [ ] Uzak scheduler görevleri klasik modda süre sonunda ilerliyor; yerel görevler beklemede kalıyor.
- [ ] T15-01…T15-05 yeşil.

---

### 9.3 WP-16 — Metrik bazlı stale ve fail-closed koşullar

| Alan | Değer |
|---|---|
| **Bulgular** | Y-08 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/services/monitors/MetricCollector.js`, `src/main/services/SmartFinishEngine.js`, `src/main/services/conditions/*.js`, `main.js` (headless ölçüm bağlantısı), `src/main/locales/*.json`, `tests/main/metric.test.mjs`, `tests/main/metric-collector-wp13.test.mjs`, `tests/main/smartfinish.test.mjs` |
| **İlgili kararlar** | D18, D12 |

**Amaç:** Her örnekleyicinin (`processList`, `cpu`, `idle`, `network`, `disk`, `battery`) sağlığını ayrı izlemek; hata veya zaman aşımında eski değeri “taze” saymamak; koşul motorunun yalnız ilgili örnekleyici taze ise karar vermesini sağlamak.

#### 9.3.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `metric.test.mjs`: `sampleNetwork` throw → `networkStale=true`, `networkDownloadKbps=0`; aynı ölçümde disk sağlıklıysa disk koşulu etkilenmez.
   - `metric.test.mjs`: `sampleDisks` throw → `diskStale=true`; disk koşulu tatmin edilmez.
   - `metric.test.mjs`: `idleProvider` throw/null → `idleStale=true`; `USER_IDLE`/`USER_ACTIVE` koşulu tatmin edilmez.
   - `metric-collector-wp13.test.mjs`: timeout ve üst üste tick davranışı korunur.
2. **Örnekleyici sağlık modeli.**
   - `SAMPLER_KEYS = ['processList','cpu','idle','network','disk','battery']`.
   - `this.samplerHealth = Object.fromEntries(SAMPLER_KEYS.map(k => [k, { ok: null, lastSuccessAt: 0, lastErrorAt: 0, lastErrorCode: null }]));`
   - `runSampler(name, fn)`:
     - `try { await withTimeout(fn); markOk(name); } catch (err) { markFailed(name, err); }`
     - Hata logu örnekleyici başına 60 s’de en fazla bir kez; logda yalnız hata kodu, dosya yolu yok.
   - `markFailed` ilgili `currentMetrics[`${name}Stale`] = true`; değeri sıfırlar; son başarı zamanını değiştirmez.
   - `markOk` `lastSuccessAt = now`, `lastErrorCode = null`, ilgili stale bayrağı `false`.
3. **`sampleOnce` akışını yeniden yaz.**
   - Her örnekleyici `runSampler` ile sarılır; `Promise.all` kullanılır, çünkü `runSampler` kendi hatasını yutar ve sağlık kaydı üretir.
   - `sampleCount` yalnız gerçekten tamamlanan turda artar.
   - Genel `stale`: `sampleCount < 3` veya beklenmeyen tur hatası; tek örnekleyici hatası genel `stale` yapmaz, ilgili bayrak yapar.
   - `currentMetrics.degraded` = en az bir sampler `ok:false`; `degradedSamplers` listesi.
4. **Tazelik yaşı.**
   - `samplerStaleAfterMs = options.samplerStaleAfterMs || Math.max(15000, sampleIntervalMs * 3)`.
   - `getMetrics()` döndürmeden önce her sampler için `stale = health.ok === false || (now - lastSuccessAt) > samplerStaleAfterMs || lastSuccessAt === 0` hesaplar.
   - `battery` için ayrı `batteryStaleAfterMs` (varsayılan 90 s); battery hatası network/disk koşulunu etkilemez.
   - `getMetrics()` `structuredClone` döndürür; çağıran `currentMetrics`i mutasyona uğratamaz.
5. **SmartFinishEngine koşul eşlemesi.**
   - `conditionSampler(type)`:
     - `NETWORK_SPEED` → `network`;
     - `DISK_ACTIVITY` → `disk`;
     - `CPU_USAGE` → `cpu`;
     - `USER_IDLE` / `USER_ACTIVE` → `idle`;
     - `PROCESS_RUNNING` → `processList` (mevcut `processListStale` ile birlikte).
   - `evaluateSingleCondition` başında ilgili sampler stale ise `{ satisfied:false, message: t('conditionMetricUnavailable', { metric }) }` döndür.
   - Global `metrics.stale` yalnız ısınma/başlangıç için korunur; `sampleCount < 3` iken (ilk üç tam örnek tamamlanana kadar) hiçbir metrik koşulu tatmin edilmez.
   - `USER_IDLE`/`USER_ACTIVE` için `idleStale` veya `userIdleSeconds` geçersizse fail-closed; 0’a düşürüp “kullanıcı aktif” varsayımı yapılmaz.
6. **Headless ve DI.**
   - Headless `MetricCollector` aynı sağlık modelini kullanır; `idleProvider` yoksa idle koşulları `IDLE_UNAVAILABLE` ile reddedilir, güç eylemi yapılmaz.
   - `main.js` `powerMonitor.getSystemIdleTime()` bağlantısı yalnız ana süreçte; renderer’a metrik sağlığı sızdırılmaz.
7. **Testler ve kanıt.**
   - T16-01…T16-05; fake `now` ile yaş testi; gerçek `systeminformation` çağrısı mock’lanır.
   - `conditionMetricUnavailable` anahtarı 17 main locale dosyasına eklenir; çevirisi olmayanlarda İngilizce fallback kullanılır.

#### 9.3.2 Çıktılar

- `samplerHealth` ve `runSampler`; örnekleyici başına stale bayrakları.
- `getMetrics()` tazelik hesabı ve savunmacı kopya.
- SmartFinish condition→sampler eşlemesi; fail-closed mesajları.
- `degraded`/`degradedSamplers` gözlemlenebilirliği.
- T16-01…T16-05 kanıtları.

#### 9.3.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Tek örnekleyici hatası tüm görevleri bloke eder | Orta | Orta | Koşul bazlı sampler eşlemesi; global stale yalnız ısınma | İlgili koşulu devre dışı bırak; diğerleri çalışır |
| Eski değer sıfırlanınca yanlış karar | Orta | Yüksek | Stale bayrağı öncelikli; sıfır değer tek başına karar vermez | Değeri hiç güncelleme; stale true |
| `powerMonitor` idle 0 döndürür | Orta | Orta | 0 geçerli “aktif” kabul edilir; sağlık `ok` ise; hata yok | Idle koşulunu reddet; kullanıcıya bilgi |
| Battery hatası tüm metrikleri stale yapar | Düşük | Orta | Ayrı `batteryStale`; koşul eşlemesi yok | Battery’yi devre dışı bırak |
| Log seli | Orta | Düşük | Sampler başına 60 s throttle | Yalnız ilk hata + toparlanma logu |

#### 9.3.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T16-01 | Network hatası | `sampleNetwork` throw; network koşulu | `networkStale=true`; koşul false | Eski hız taze sayılmaz |
| T16-02 | Disk hatası | `sampleDisks` throw; disk koşulu | `diskStale=true`; koşul false | Network koşulu etkilenmez |
| T16-03 | Idle sağlayıcı yok | `idleProvider` throw/null; USER_IDLE | `idleStale=true`; koşul false | 0 ile “aktif” varsayımı yok |
| T16-04 | Toparlanma | Hata sonrası başarılı örnekler | Bayrak false; koşul değerlendirilir | İlk başarıdan sonra tazelik |
| T16-05 | Yaşlanma | Son başarı `now - staleAfter - 1` | Stale true; koşul false | Hata olmasa da yaş stale yapar |

#### 9.3.5 Geri alma

- Kod commit’i geri alınırsa Y-08 yeniden açılır; özellikle “network/disk hatası yutulur” davranışı geri getirilmez.
- Stale bayrakları geri alınırken global `stale=false` ile eski değer kullanımı yasak; en az `degraded` alanı korunur.
- Battery ayrımı geri alınabilir; güvenlik koşullarını etkilemez.

#### 9.3.6 Definition of Done (DoD)

- [ ] Network/disk/idle/CPU/processList hataları ayrı sağlık kaydına yazılıyor; eski değer taze sayılmıyor.
- [ ] SmartFinish yalnız ilgili sampler taze ise koşulu değerlendiriyor; hata fail-closed.
- [ ] `getMetrics()` savunmacı kopya; `degraded` gözlemlenebilir.
- [ ] Headless’ta idle yoksa güç eylemi yapılmıyor.
- [ ] T16-01…T16-05 yeşil.

---

### 9.4 WP-17 — Backup restore rollback

| Alan | Değer |
|---|---|
| **Bulgular** | Y-09 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/storage/Backup.js`, `src/main/storage/DbWorker.js`, `src/main/storage/DbWorkerTask.js`, `scripts/restore-db.mjs`, `src/main/storage/Database.js`, `tests/main/backup.test.mjs` (yeni), `tests/main/data-integrity.test.mjs` |
| **İlgili kararlar** | D19 |

**Amaç:** Restore sırasında canlı DB’yi karantinaya taşıdıktan sonra oluşan herhangi bir hata veya doğrulama başarısızlığında eski DB’yi (WAL/SHM dahil) geri getirmek; geri getirilemiyorsa kanıtı korumak ve açık hata kodu üretmek.

#### 9.4.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `backup.test.mjs`: `fs.renameSync(tmp, dbPath)` throw → eski DB `dbPath`’te; `quickCheck` fail → rollback.
   - WAL ve SHM dosyaları varsa rollback sonrası geri gelmeli.
   - Rollback de başarısızsa `RESTORE_ROLLBACK_FAILED`; karantina ve temp silinmemeli.
2. **Restore ön koşulu ve kilit.**
   - `DbWorker.runRestore` çağrılmadan önce ana DB bağlantısı kapatılır; `PRAGMA wal_checkpoint(TRUNCATE)` başarısızsa `RESTORE_DB_BUSY` ile durulur.
   - Aynı anda iki restore yok: `restore.lock` `wx` + `mode:0o600` ile alınır; içerik `{v:1, pid, token, startedAt}`, `token = crypto.randomUUID()`. İkinci çağrı `RESTORE_IN_PROGRESS`.
   - Stale/terk edilmiş kilit: `RESTORE_LOCK_STALE_MS = 60000`, `RESTORE_LOCK_TAKEOVER_MS = 5000`. Kilit taze (`mtime` yaşı < eşik) ve PID canlıysa (`process.kill(pid,0)`; `EPERM` canlı) → `RESTORE_IN_PROGRESS`.
   - Devralma `restore.lock.takeover` üzerinde `wx` + `{pid, token, startedAt}` içerikli mutex ile serileştirilir; sahibi kilidi yeniden okur ve `token`/`startedAt` değişmemişse `rename(lock, lock+'.stale.'+token)` + `wx` ile devralır. Token değiştiyse veya mutex alınamazsa `RESTORE_IN_PROGRESS`; mutex `RESTORE_LOCK_TAKEOVER_MS` sonrası yalnız kendi PID’i ölüyse temizlenir.
   - Parse edilemeyen/boş kilit: yaş < eşik → `RESTORE_IN_PROGRESS`; yaş ≥ eşik → aynı mutex ve yeniden doğrulama ile devralınır. Devralma `restore_lock_taken_over` olarak loglanır; canlı DB’ye dokunulmaz.
   - `inputPath` ve `dbPath` aynı sürücüde geçici dizin; temp adı `restore-<pid>-<nonce>`.
3. **Doğrulanmış temp.**
   - `decryptFile(inputPath, tmp, key)`, `fsync`, `quickCheck(tmp) !== 'ok'` → `RESTORE_DB_CORRUPT`; canlı DB’ye dokunulmaz.
   - Backup SHA/checksum manifest varsa doğrulanır.
4. **Karantina seti.**
   - `quarantineDir` altında `powerpilot_restore_<nonce>/` oluştur.
   - Sırayla `dbPath`, `dbPath-wal`, `dbPath-shm` varsa karantina dizinine `rename`; her adım kaydedilir.
   - Herhangi bir taşıma başarısızsa o ana kadar taşınanlar geri alınır; canlı DB yerinde kalır.
5. **Kurulum ve doğrulama.**
   - `fs.renameSync(tmp, dbPath)`; ardından `quickCheck(dbPath) === 'ok'` ve `PRAGMA integrity_check` (gerekirse) doğrulanır.
   - Hata halinde:
     1. Yeni `dbPath` ve yeni `-wal/-shm` varsa sil (yalnız bu restore’un ürettiği);
     2. Karantina setini ters sırayla geri taşı;
     3. `rolledBack:true` ve orijinal hatayı fırlat.
   - Rollback sırasında hata olursa `RESTORE_ROLLBACK_FAILED`; hata mesajında karantina ve temp yolları; dosyalar silinmez.
6. **Başarı sonrası.**
   - Karantina seti en az 7 gün veya manuel temizlemeye kadar saklanır; `restore.json` manifest `{createdAt, source, backupSha256, oldDb, newDb}` yazar.
   - Başarılı açılış sonrası `Database.open` `quickCheck` ve şema doğrulaması yaparsa `confirmRestore` manifesti siler; eski DB retention politikasına bırakılır.
   - `restore.lock` her durumda `finally` ile bırakılır; release yalnız kendi `token`'ı eşleşiyorsa siler. Temp yalnız başarı veya rollback sonrası silinir.
7. **DB worker timeouts.**
   - UtilityProcess/CLI timeout’unda ana süreç restore’un yarıda kaldığını varsayar; `dbPath` varlığını ve `restore.json`’u kontrol eder; otomatik ikinci deneme yapmaz.
   - `scripts/restore-db.mjs` aynı fonksiyonu kullanır; CLI çıkış kodu `0` yalnız doğrulanmış başarı.
8. **Testler ve kanıt.**
   - T17-01…T17-06; gerçek SQLite temp dosyası ve gerçek WAL.
   - Fault injection: rename, quickCheck, WAL taşıma, rollback.

#### 9.4.2 Çıktılar

- Karantina seti + rollback’li `restoreDatabase`.
- `RESTORE_DB_BUSY`, `RESTORE_IN_PROGRESS`, `RESTORE_DB_CORRUPT`, `RESTORE_ROLLBACK_FAILED` kodları.
- `restore.json` manifesti ve `confirmRestore`.
- T17-01…T17-06 kanıtları.

#### 9.4.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Rollback sırasında ikinci hata | Düşük | Yüksek | Ters sıra, her adım kayıt; `RESTORE_ROLLBACK_FAILED`; dosyaları silme | Kullanıcıya karantina yolu; manuel kurtarma dokümanı |
| WAL/SHM unutulur | Orta | Yüksek | Üçlü set taşıma; test | Restore öncesi checkpoint zorunlu |
| AV/izin rename’i engeller | Orta | Orta | Aynı dizin temp; EPERM retry; hata kodu | Restore’u durdur; canlı DB’ye dokunma |
| Başarılı restore eski DB’yi hemen siler | Orta | Orta | 7 gün karantina; `confirmRestore` | Retention uzat; manuel temizleme |
| CLI/worker timeout yarıda kalır | Orta | Yüksek | Manifest + idempotent kontrol; otomatik retry yok | Operatör müdahalesi; yedekten tekrar |
| Terk edilmiş `restore.lock` restorasyonu süresiz bloke eder | Orta | Yüksek | PID + yaş + `.takeover` mutex + token yeniden doğrulama; T17-06 | Operatör kilit dosyasını silmeden önce PID/yaş kanıtı toplar; dokümante prosedür |

#### 9.4.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T17-01 | Başarılı restore | Geçerli backup; eski DB + WAL/SHM | Yeni DB doğrulandı; karantina seti var | `quickCheck=ok`; eski dosyalar karantinada |
| T17-02 | Kurulum rename hatası | `rename(tmp, db)` throw | Eski DB/WAL/SHM yerinde | `rolledBack:true`; hata orijinal |
| T17-03 | Kurulum sonrası bozuk | `quickCheck(db)` fail | Yeni DB silinir; eski set geri | Eski DB açılabilir |
| T17-04 | WAL geri yükleme | WAL/SHM taşındıktan sonra hata | Üçü de geri gelir | WAL içeriği korunur |
| T17-05 | Rollback hatası | Geri taşıma da throw | `RESTORE_ROLLBACK_FAILED`; dosyalar korunur | Karantina/temp yolu raporda |
| T17-06 | Stale restore kilidi | Ölü PID + yaş ≥ eşik; iki süreç eşzamanlı devralır | Yalnız biri devralır; taze kilit taşınmaz | Diğeri `RESTORE_IN_PROGRESS`; kilit token’ı korunur |

#### 9.4.5 Geri alma

- Eski `restoreDatabase` davranışına dönmek Y-09’u yeniden açar; yalnız acil durumda ve “restore sırasında hata = veri kaybı” riski kabulüyle.
- Karantina seti ve manifest kaldırılırsa geri dönüş kanıtı kaybolur; en az 7 gün saklama korunur.
- WAL/SHM taşıma geri alınırsa restore öncesi checkpoint zorunluluğu kaldırılmaz.

#### 9.4.6 Definition of Done (DoD)

- [ ] Her restore hatasında canlı DB (WAL/SHM dahil) geri geliyor veya kanıt korunarak `RESTORE_ROLLBACK_FAILED` dönüyor.
- [ ] Başarısız restore hiçbir zaman `dbPath`’i sahipsiz bırakmıyor.
- [ ] Başarılı restore karantinayı hemen silmiyor; manifest var.
- [ ] CLI ve utilityProcess aynı güvenlik garantilerini kullanıyor.
- [ ] T17-01…T17-06 yeşil.

---

### 9.5 WP-18 — Migrasyon hedef doğrulaması

| Alan | Değer |
|---|---|
| **Bulgular** | Y-10 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/storage/MigrateV2.js`, `src/main/storage/Database.js`, `src/main/storage/schema.sql`, `tests/main/migrate.test.mjs` (yeni), `tests/main/data-integrity.test.mjs` |
| **İlgili kararlar** | D20 |

**Amaç:** Hedef DB zaten varsa içeriğini doğrulamadan JSON’u `.migrated` işaretlememek; hedef bozuk/eksikse kaynak JSON’u ve doğrulanmış geçici DB’yi koruyarak migrasyonu durdurmak.

#### 9.5.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - Hedef boş/bozuk DB + geçerli JSON → `MIGRATION_TARGET_MISMATCH`; kaynak JSON durur; `.migrated` yok.
   - Hedef sayıları/checksum’ı uyuşmuyor → hata; geçici DB silinmez.
   - Yeni hedef kurulduktan sonra doğrulama fail → hedef geri alınır; kaynak korunur.
   - Aynı migrasyon iki kez çalıştırılınca idempotent; ikinci çalışma marker’ı bozmaz.
2. **Hedef doğrulama yardımcıları.**
   - `openReadonly(target)`, `readCounts(db)`, `readMeta(db)`, `validateTarget(target, expected)`.
   - `validateTarget` sırası:
     1. `quickCheck(target) === 'ok'`;
     2. `meta.schema_version` beklenen sürüm;
     3. `tasks/history/templates/webhooks/exemptions/maintenance_windows` sayıları `counts` ile eşit;
     4. `meta.content_checksum` `contentChecksum(parsed)` ile eşit;
     5. `migrations` içinde `v2-json-to-v3` kaydı ve `sha256 === sourceSha`.
   - Hedef açılamıyorsa `MIGRATION_TARGET_UNREADABLE`.
3. **Hedef varsa.**
   - Doğrulanmış hedef + geçici DB aynı içerikteyse geçici DB’yi sil; marker’ı atomik yaz.
   - Doğrulama başarısızsa **hiçbir dosyayı silme**: `tmpPath` tanı için `tmpPath.failed-<nonce>` olarak korunur; kaynak JSON kalır; marker yazılmaz; `MIGRATION_TARGET_MISMATCH` fırlatılır.
   - Hedef doğrulanmış ama geçici DB farklıysa (ör. önceki yarım deneme) hedefi değiştirme; operatöre raporla.
4. **Hedef yoksa.**
   - `renameSync(tmpPath, target)`;
   - yeni hedefi `validateTarget(target, expected)` ile tekrar doğrula;
   - doğrulama fail ise hedefi `tmpPath`e geri taşı (veya yalnız bu çalışmanın oluşturduğu hedefi sil) ve hata döndür; kaynak JSON’a dokunma.
5. **Marker atomikliği.**
   - Marker içeriği `{version, sourceSha256, targetSha256, counts, migratedAt, toolVersion}`.
   - `${migratedPath}.tmp-<pid>-<nonce>` yaz, `fsync`, `rename`; ancak bundan sonra `source` silinir.
   - Marker zaten varsa ve `sourceSha256` aynıysa idempotent başarı; farklıysa `MIGRATION_MARKER_CONFLICT`; kaynak silinmez.
   - `source` silinemezse marker kalır; sonraki açılışta “migration completed, source cleanup pending” olarak ele alınır.
   - Marker atomikliği tek süreçte geçerlidir; süreçler arası yarış WP-20 `storage.lock` ile kapatılır. WP-18 tamamlanması bu riski tek başına kapatmaz.
6. **Migrasyon raporu.**
   - Sonuç `{ok, target, migrated:false|true, removedTmp:boolean, markerPath, counts}`; CLI çıkış kodu yalnız `ok:true` ise 0.
7. **Testler ve kanıt.**
   - T18-01…T18-06; gerçek SQLite dosyaları; fault injection `corruptSqliteFile`, `truncateFile`, `failFsRenameOnce`.

#### 9.5.2 Çıktılar

- `validateTarget()` ve hedef sayı/checksum/schema doğrulaması.
- Atomik marker; hata durumunda kaynak + temp korunuyor.
- Yeni hedef kurulumu sonrası ikinci doğrulama ve rollback.
- T18-01…T18-06 kanıtları.

#### 9.5.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Geçerli hedef yanlışlıkla reddedilir | Orta | Orta | Sayı + checksum + migration kaydı; gerçek fixture | Operatöre rapor; `--force` yok |
| Bozuk hedef kabul edilir | Düşük | Yüksek | `quickCheck` + checksum + sayı; iki aşamalı doğrulama | Migrasyonu durdur; kaynak korunur |
| Marker yazılıp kaynak silinemez | Düşük | Orta | Atomik marker; cleanup pending durumu | Sonraki açılışta temizle; veri kaybı yok |
| İki migrasyon aynı hedefe yazar | Düşük | Yüksek | WP-20 `storage.lock` ile birlikte marker kontrolü; WP-18 tek başına süreçler arası yarışı kapatmaz | İkinci çalışmayı reddet; G3'te WP-20 ile birlikte doğrula |
| Test fixture eski şemayı temsil etmez | Orta | Orta | `schema.sql` sürümüyle üret; `quickCheck` | Fixture’ı yeniden üret; testi bloke et |

#### 9.5.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T18-01 | Geçerli hedef | Aynı içerikli hedef + JSON | Migrasyon tamam; marker atomik | Kaynak silinir; hedef değişmez |
| T18-02 | Boş hedef | Boş SQLite hedefi | `MIGRATION_TARGET_MISMATCH` | JSON ve temp korunur; marker yok |
| T18-03 | Checksum uyuşmaz | Hedef meta checksum bozuk | Hata; hiçbir silme yok | `quickCheck` yine ok olsa bile red |
| T18-04 | Yeni hedef doğrulama fail | Rename sonrası validate throw | Hedef geri alınır | Kaynak JSON durur |
| T18-05 | Marker atomikliği | Marker yazımı sırasında çökme | Geçici marker yok; kaynak durur | Yeniden çalıştırma idempotent |
| T18-06 | İkinci çalışma | Aynı kaynak ve hedefle tekrar | Başarı; kaynak zaten yoksa no-op | Marker bozulmaz |

#### 9.5.5 Geri alma

- Doğrulama sıkılaştırması geri alınırsa Y-10 yeniden açılır; üretimde önerilmez.
- Marker formatı geriye uyumlu; eski `.migrated` dosyası varsa içerik yoksa yeniden yazılmaz, yalnız loglanır.
- Hata durumunda dosya silme yasağı korunur; rollback yalnız bu çalışmanın oluşturduğu hedefi geri alır.

#### 9.5.6 Definition of Done (DoD)

- [ ] Hedef DB varsa `quickCheck` + sayı + checksum + migration kaydı doğrulanıyor.
- [ ] Doğrulama başarısızsa kaynak JSON, temp DB ve marker durumu korunuyor.
- [ ] Yeni hedef kurulumu sonrası ikinci doğrulama var; fail rollback yapıyor.
- [ ] Marker temp+rename ile atomik; kaynak ancak marker sonrası siliniyor.
- [ ] T18-01…T18-06 yeşil.

---

### 9.6 WP-19 — SmartFinish örnek anahtarı ve temizliği

| Alan | Değer |
|---|---|
| **Bulgular** | O-03 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-15 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/services/SmartFinishEngine.js`, `src/main/services/TaskManager.js`, `src/main/services/conditions/DirectoryIdle.js`, `tests/main/smartfinish.test.mjs`, `tests/main/taskmanager.test.mjs` |
| **İlgili kararlar** | D29 |

**Amaç:** Aynı görevde birden fazla dosya/klasör koşulu olduğunda örneklerin birbirini sıfırlamasını bitirmek; görev terminal duruma geçtiğinde veya tekrarladığında örnekleri temizleyerek bellek sızıntısını önlemek.

#### 9.6.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - İki `FILE_STABLE` koşulu farklı dosyalarla: ikisi de `stableSeconds` sonunda tatmin olur.
   - İki `DIRECTORY_IDLE` koşulu farklı klasörlerle: bağımsız örnekler.
   - Görev tamamlanınca `fileSamples`/`directorySamples`/`stabilityTrackers` içinde `taskId` anahtarı kalmaz.
   - Tekrarlı görev yeni dönemde sıfırdan örnek toplar.
2. **Anahtar üretimi.**
   - `conditionSampleKey(taskId, index, condition, kind)`:
     - Tüm anahtarlar `${taskId}:` önekiyle başlar; `condition.id` varsa `${taskId}:id:${condition.id}`, yoksa `${taskId}:${kind}:${index}:${normalizedPath}`.
     - `normalizedPath` `path.resolve` + `path.normalize`; Windows’ta büyük/küçük harf duyarsız anahtar için `toLowerCase()` (yalnız anahtar; gerçek yol korunur).
   - `fileSamples` ve `directorySamples` `conditionSampleKey` kullanır; `stabilityTrackers` görev grubu için `${taskId}:group` anahtarını korur. Üç map de `${taskId}:` öneki taşır.
   - `evaluateSingleCondition(cond, metrics, taskId, index)` imzası; tüm çağrılar index geçirir.
3. **Temizlik.**
   - `clearTask(taskId)` `taskId:` önekli anahtarları üç map’ten siler.
   - `TaskManager` terminal geçişlerinde çağırır: `COMPLETED`, `CANCELLED`, `FAILED`, `EXPIRED`, `BLOCKED`, `deleteTask`, `applySnooze` sonrası.
   - Tekrarlı görevde `calculateNextRecurrence` sonrası `clearTask` çağrılır; yeni dönem örnekleri sıfırdan başlar.
   - `prune({activeTaskIds, maxAgeMs})` her 60 s’de bir çalışır; aktif olmayan ve `maxAgeMs` (24 saat) geçmiş anahtarları siler.
4. **Sınırlar.**
   - Map başına en fazla `MAX_SAMPLES = 1000`; aşımda en eski pasif anahtar silinir, loglanır.
   - Aynı görevde aynı normalize path iki kez kullanılırsa index farkı anahtarı ayırır; koşul kimliği varsa kimlik önceliklidir.
5. **Testler ve kanıt.**
   - T19-01…T19-05; fake timer ile `stableSeconds`; gerçek geçici dosya/klasör.
   - Bellek testi: 200 görev × 2 koşul sonrası map boyutu aktif görevlerle sınırlı.

#### 9.6.2 Çıktılar

- `conditionSampleKey`, dosya/klasör map’lerinde tutarlı anahtar ve `stabilityTrackers` için `${taskId}:group`.
- `clearTask(taskId)` ve terminal/tekrar çağrıları.
- `prune` ve `MAX_SAMPLES` sınırı.
- T19-01…T19-05 kanıtları.

#### 9.6.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Anahtar yol değişince örnek sıfırlanır | Orta | Düşük | Normalize path; koşul id varsa id | İlk değerlendirmede yeni örnek; bekleme uzar |
| `clearTask` yanlış görevi siler | Düşük | Orta | `taskId:` önek; birim testi | Yalnız tam eşleşme; prefix çakışması testi |
| Terminal geçişi atlanır | Orta | Orta | TaskManager tek `finalizeTask` noktası; test | Periyodik prune ikinci savunma |
| Map hâlâ büyür | Düşük | Orta | `MAX_SAMPLES` + prune | Süreç yeniden başlatma; uyarı |
| Windows path case farkı | Orta | Düşük | Anahtarda lower-case; gerçek yolda değil | Case-sensitive anahtar; test |

#### 9.6.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T19-01 | İki dosya koşulu | A ve B farklı dosya; iki `FILE_STABLE` | İkisi de bağımsız stable | B, A’nın örneğini sıfırlamaz |
| T19-02 | İki klasör koşulu | A ve B farklı klasör | İkisi de bağımsız | Sayaçlar ayrı |
| T19-03 | Terminal temizlik | Görev tamamlanınca | Üç map’te taskId yok | `clearTask` çağrıldı |
| T19-04 | Tekrar sıfırlama | Recurrence sonrası yeni dönem | Örnekler sıfırdan | Eski `since` taşınmaz |
| T19-05 | Bellek sınırı | 200 görev / 400 koşul | Map ≤ aktif×koşul; prune çalışır | `MAX_SAMPLES` aşılmaz |

#### 9.6.5 Geri alma

- `taskId` anahtarına dönmek O-03’ü yeniden açar; önerilmez.
- `clearTask` kaldırılırsa bellek sızıntısı geri gelir; prune tek başına yeterli değildir.
- Anahtar şeması değişikliği veri migrasyonu gerektirmez; yalnız bellekte.

#### 9.6.6 Definition of Done (DoD)

- [ ] `fileSamples`/`directorySamples` anahtarı `taskId` öneki + koşul kimliği (id veya index/path) içeriyor; `stabilityTrackers` `${taskId}:group` kullanıyor; üçü de `clearTask` ile siliniyor.
- [ ] Aynı görevde çoklu dosya/klasör koşulları bağımsız çalışıyor.
- [ ] Terminal ve tekrar sonrası örnekler temizleniyor.
- [ ] Map boyutu sınırlı; prune çalışıyor.
- [ ] T19-01…T19-05 yeşil.

---

### 9.7 WP-20 — Atomik DB kilidi

| Alan | Değer |
|---|---|
| **Bulgular** | O-09 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/main/storage/Database.js`, `main.js` (release çağrısı), `src/main/locales/*.json`, `tests/main/storage.test.mjs`, `tests/main/db-lock.test.mjs` (yeni) |
| **İlgili kararlar** | D22 |

**Amaç:** `existsSync` + `writeFileSync` yarışını bitirmek; kilidi atomik `open(..., 'wx')` ile almak, stale kilidi güvenli biçimde devralmak ve yanlış süreç tarafından silinmesini engellemek.

#### 9.7.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - Aynı dizine 8 çocuk süreç aynı anda `acquireLock` → tam biri başarılı; diğerleri `STORAGE_LOCKED`.
   - Ölü PID’li stale lock → yeni süreç alır; canlı PID → `STORAGE_LOCKED`.
   - Boş/yarım JSON lock taze ise → `STORAGE_LOCKED`; eski ise devralınır.
   - Release yalnız kendi token’ını siler; başka sahibin kilidini silmez.
2. **Kilit dosyası biçimi.**
   - `{ v: 2, pid, token, startedAt }`; `token = crypto.randomUUID()`.
   - `mode: 0o600`; Windows ACL `secure-dir` ile aynı politika.
   - `LOCK_STALE_MS = 30000`; `LOCK_RETRY_MS = 50`; `LOCK_RETRY_COUNT = 3`; `LOCK_TAKEOVER_MS = 5000`.
3. **Atomik alma.**
   ```js
   function tryCreate() {
     const fd = fs.openSync(lockPath, 'wx', 0o600);
     try { fs.writeFileSync(fd, payload); fs.fsyncSync(fd); }
     finally { fs.closeSync(fd); }
   }
   ```
   - `EEXIST` dışındaki hata `STORAGE_LOCK_FAILED`.
   - Başarıda release closure döner; `release()` idempotent.
4. **Stale devralma (serileştirilmiş).**
   - Devralma, `lockPath + '.takeover'` üzerinde `open(..., 'wx', 0o600)` ile alınan kısa ömürlü mutex ile serileştirilir. Mutex alınamazsa kısa retry sonrası `STORAGE_LOCKED`; mutex `LOCK_TAKEOVER_MS` sonrası stale sayılır ve sahibi ölüyse aynı token/PID kurallarıyla temizlenir.
   - Mutex sahibi kilit dosyasını yeniden okur; `token`/`startedAt`/`mtime` ilk gözlemle aynı değilse devralmayı bırakır (`STORAGE_LOCKED`). Böylece başka sürecin taze kilidi taşınmaz.
   - Mevcut dosya parse edilemezse/boşsa `stat.mtimeMs` yaşına bak:
     - yaş < `LOCK_STALE_MS` → `STORAGE_LOCKED` (başka süreç yazıyor olabilir);
     - yaş ≥ eşik → devralma denenir.
   - PID canlıysa (`process.kill(pid,0)`; `EPERM` canlı sayılır) → `STORAGE_LOCKED`.
   - Ölüyse `renameSync(lockPath, lockPath + '.stale.' + token)`; sonra `tryCreate`; mutex'i `finally` ile bırak.
   - `rename` `ENOENT` → başka süreç devraldı; mutex'i bırak ve `STORAGE_LOCKED` dön (kör `tryCreate` yok).
   - `EPERM/EBUSY` → `LOCK_RETRY_COUNT` kadar bekle; sonra `STORAGE_LOCKED`.
   - Başarılı devralmadan sonra stale dosyayı sil; silinemezse `.stale` olarak bırak, logla.
5. **Release.**
   - Dosyayı oku; `token` eşleşmiyorsa silme, `LOCK_OWNERSHIP_LOST` logu.
   - Eşleşiyorsa `unlink`; `ENOENT` no-op.
   - `release()` iki kez çağrılırsa ikinci no-op.
6. **Entegrasyon.**
   - `main.js` uygulama açılışında `acquireLock(userData, process.pid)`; `before-quit`/`will-quit` release.
   - `requestSingleInstanceLock` ile birlikte çalışır; biri başarısızsa uygulama açılmaz ve kullanıcıya `t('storageLocked')` gösterilir. Hangi adım başarısız olursa önceki kaynaklar `finally` ile bırakılır.
   - `storageLocked` anahtarı 17 main locale dosyasına eklenir; çevirisi olmayanlarda İngilizce fallback kullanılır.
   - Testlerde `pid` enjekte edilebilir; release closure döner.
7. **Testler ve kanıt.**
   - T20-01…T20-06; gerçek çocuk süreç (fork) ile yarış; mock yalnız hata enjeksiyonu.

#### 9.7.2 Çıktılar

- Atomik `open('wx')` kilidi, token’lı release.
- Güvenli stale devralma; canlı PID ve taze yarım dosya korunuyor.
- Çocuk süreç yarış testi.
- T20-01…T20-06 kanıtları.

#### 9.7.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| İki süreç stale kilidi aynı anda devralır | Düşük | Yüksek | `.takeover` mutex + yeniden doğrulama + `rename`/`open('wx')`; kaybeden `STORAGE_LOCKED` | Yeniden dene; kilit alma sınırlı |
| Canlı PID yanlışlıkla ölü sanılır | Düşük | Yüksek | `EPERM` canlı; `kill(pid,0)`; mtime | Kilit devralma yok; operatör |
| Windows’ta rename EPERM | Orta | Orta | Retry + aynı süreçte bekleme | `STORAGE_LOCKED`; kullanıcı yeniden dener |
| Release yanlış kilidi siler | Düşük | Yüksek | Token eşleşmesi; test | Silme; uyarı logu |
| Uzun süreçte PID yeniden kullanımı | Düşük | Orta | Canlı PID’e dokunma; mtime/startedAt; operatör | Yeni kullanıcı profili |

#### 9.7.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T20-01 | Eşzamanlı 8 süreç | Aynı anda acquire; sonra aynı stale kilide eşzamanlı devralma | Yalnız biri başarılı | Taze kilit taşınmaz; diğerleri `STORAGE_LOCKED` |
| T20-02 | Canlı PID | Canlı süreç kilidi | Yeni acquire reddedilir | Kilit dosyası değişmez |
| T20-03 | Ölü PID stale | Ölü PID + eski mtime | Devralma başarılı | Yeni token; stale dosya temiz |
| T20-04 | Taze yarım dosya | Boş dosya, mtime yeni | `STORAGE_LOCKED` | Devralma yok |
| T20-05 | Release sahipliği | Başka token’lı kilit varken release | Dosya silinmez | `LOCK_OWNERSHIP_LOST` logu |
| T20-06 | Çift release | Aynı closure iki kez | İkinci no-op | Hata yok |

#### 9.7.5 Geri alma

- Eski `existsSync` yoluna dönmek O-09’u yeniden açar; üretimde yasak.
- Token alanı geriye uyumlu değilse eski kilit dosyaları taze kabul edilip reddedilir; operatör temizliği gerekir. Release notunda belirtilir.
- Atomik `wx` davranışı Windows/antivirus ortamında sorun çıkarırsa retry artırılır; kilitsiz mod yok.

#### 9.7.6 Definition of Done (DoD)

- [ ] Kilit `open('wx')` ile atomik; check-then-write yok.
- [ ] Canlı PID ve taze yarım dosya korunuyor; stale güvenli devralınıyor.
- [ ] Release token sahipliğini doğruluyor.
- [ ] 8 süreç yarışında tam bir kazanan var.
- [ ] T20-01…T20-06 yeşil.

---

### 9.8 WP-21 — Tek timer restore yolu

| Alan | Değer |
|---|---|
| **Bulgular** | O-01 |
| **Öncelik** | P2 / G3 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G3 |
| **Ana dosyalar** | `src/renderer/app.js`, `src/renderer/i18n.js`, `tests/renderer/restore.test.mjs` (yeni), `tests/renderer/bridge.test.mjs`, `tests/e2e/smoke.spec.js` |
| **İlgili kararlar** | D24 |

**Amaç:** Tanımsız `startTimer` çağrısını ve iki ayrı restore yolunu kaldırmak; pencere yenilendiğinde aktif uyarıyı ve zamanlayıcıyı tek, test edilebilir yoldan geri yüklemek; hata durumunda sessiz yutma yerine gözlemlenebilir davranış üretmek.

#### 9.8.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `restore.test.mjs`: `getActiveState` aktif scheduled user_interface timer döndürür; `startTimerTo` bir kez çağrılır; `startTimer` referansı yok.
   - Aktif uyarı + timer birlikte: banner ve sayaç ikisi de görünür; timer bir kez başlar.
   - `targetTime` geçmiş: exception yok; sayaç 0; görev listesi yenilenir.
   - `getActiveState` throw: `console.warn`/telemetry; UI boş durumda kalır; ikinci restore çağrısı yok.
2. **Tek timer yolu.**
   - `restoreActiveTimer()` timer’ı kuran tek fonksiyon; `startTimerTo(targetTime, total)` kullanır.
   - `restoreActiveState()` yalnız uyarı banner’ı ve `renderMonitoringTasks()` yapar; timer branch’i tamamen kaldırılır.
   - `startTimer(...)` adlı tanımsız çağrı silinir; kodda `startTimer(` araması yalnız `startTimerTo` dışında sonuç vermez.
   - İki restore fonksiyonu da tek `bootRestore()` içinde sıralı çağrılır; `restoreActiveTimer` ikinci kez çağrılmaz.
3. **Yarış ve idempotency.**
   - `bootRestore()` renderer ömründe bir kez çalışır: `bootPromise` ilk çağrıda oluşturulur, sonraki çağrılar aynı promise'i döndürür; `getActiveState` ikinci kez çağrılmaz.
   - `activeStatePromise` yalnız eşzamanlı iç çağrıları tek uçuşa indirir; `bootPromise` tamamlandıktan sonra yeni bir `getActiveState` yapılmaz. Yeniden deneme yalnız açık `retryRestore()` ile ve kullanıcı eylemiyle.
   - `restoreGeneration` state; eski async yanıt yeni durumu ezmez.
   - `startTimerTo` çağrılmadan önce `timerTargetTime` kontrolü; hâlihazırda aynı hedef için aktifse yeniden başlatma.
4. **Geçmiş hedef.**
   - `targetTime <= now` ise `startTimerTo` interval başlatmaz; `secondsRemaining=0`, `updateDisplay()`, `switchView('nav-active')` ve `loadTasks()` çağrılır.
   - `getActiveState` yanıtındaki `EXECUTING`/`WARNING` görevleri timer olarak seçilmez.
5. **Hata görünürlüğü.**
   - `catch` içinde `console.warn('[restore]', err.code || err.message)` ve `window.electronAPI.reportUiError?.({code:'RESTORE_FAILED'})` (varsa); kullanıcıya toast yalnız kalıcı hata ise.
   - Hata, sayaç state’ini yarım bırakmaz: önce yerel state temizlenir, sonra boş görünüm.
6. **Testler ve kanıt.**
   - T21-01…T21-05; jsdom fake timers; `startTimerTo` spy.
   - E2E smoke: pencere reload sonrası timer/uyarı.

#### 9.8.2 Çıktılar

- Tek `restoreActiveTimer()` + `restoreActiveState()` (yalnız uyarı).
- Tanımsız `startTimer` kaldırıldı; `bootRestore()` tek çağrı.
- Geçmiş hedef ve hata yolları.
- T21-01…T21-05 kanıtları.

#### 9.8.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Restore iki kez timer başlatır | Orta | Orta | `activeStatePromise` + tek boot; spy testi | Aynı hedefte yeniden başlatma yok |
| Uyarı varken timer başlar | Orta | Yüksek | Timer seçimi yalnız scheduled; warning ayrı; test | Uyarı aktifse timer gösterme; kullanıcı onaya yönlendir |
| Geçmiş hedef negatif interval | Düşük | Düşük | `targetTime <= now` dalı; test | `secondsRemaining=0`; refresh |
| Hata kullanıcıya görünmez | Orta | Düşük | `console.warn` + telemetry kodu | Toast; destek kaydı |
| Eski async yanıt yeni durumu ezer | Düşük | Orta | `restoreGeneration` | Yanıtı yoksay |

#### 9.8.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T21-01 | Tanımsız fonksiyon yok | Aktif timer ile restore | `startTimerTo` çağrılır; ReferenceError yok | Spy 1 çağrı |
| T21-02 | Tek restore | Aynı renderer’da iki kez `bootRestore()` çağır | `bootPromise` paylaşılır; tek timer; tek `getActiveState` | `getActiveState` çağrı sayısı 1 |
| T21-03 | Uyarı + timer | İkisi birlikte | Banner + sayaç; timer 1 | Görünürlük doğru |
| T21-04 | Geçmiş hedef | `targetTime < now` | Sayaç 0; exception yok | `isTimerActive` false |
| T21-05 | Hata gözlemlenir | `getActiveState` throw | Uyarı logu; boş görünüm | UI çökmez |

#### 9.8.5 Geri alma

- `restoreActiveState` timer branch’i geri getirilirse O-01 yeniden açılır; yasak.
- `startTimer` adında bir alias eklemek yerine `startTimerTo` kullanılır; alias geriye uyumluluk gerektiriyorsa yalnız test yardımcısı.
- Hata logu kaldırılırsa sessiz yutma geri gelir; en az telemetry kodu korunur.

#### 9.8.6 Definition of Done (DoD)

- [ ] `startTimer` tanımsız çağrısı yok; timer yalnız `startTimerTo` ile.
- [ ] Tek restore yolu; `bootRestore()` idempotent; çift timer/çift state çağrısı yok.
- [ ] Uyarı ve timer birlikte doğru render ediliyor.
- [ ] Geçmiş hedef ve hata yolları çökmüyor; gözlemlenebilir.
- [ ] T21-01…T21-05 yeşil.

---

### 9.9 G3 — P2 çıkış kontrolü

`G3` aşağıdaki maddelerin tamamı sağlanmadan kapanmaz:

- [ ] WP-14 Y-03 + O-07: executing aktif; kapanış/mini/tray/active-state guard’ı; terminal süreç polling’i duruyor; T14-01…T14-04 yeşil.
- [ ] WP-15 Y-04: auto-proceed claim kapsamında; manuel çalıştırma sonraki tekrarları etkilemiyor; T15-01…T15-05 yeşil.
- [ ] WP-16 Y-08: sampler bazlı stale; network/disk/idle/CPU/processList fail-closed; T16-01…T16-05 yeşil.
- [ ] WP-17 Y-09: restore rollback + WAL/SHM seti; rollback failure kanıtı; T17-01…T17-06 yeşil.
- [ ] WP-18 Y-10: hedef DB doğrulaması; kaynak/temp koruma; T18-01…T18-06 yeşil.
- [ ] WP-19 O-03: koşul bazlı örnek anahtarı; terminal/temizlik; T19-01…T19-05 yeşil.
- [ ] WP-20 O-09: atomik kilit; stale devralma; 8 süreç yarışı; T20-01…T20-06 yeşil.
- [ ] WP-21 O-01: tek timer restore; tanımsız `startTimer` yok; T21-01…T21-05 yeşil.
- [ ] P2’ye ait hiçbir `it.fails` kalmamış.
- [ ] `npm test`, `npm run test:security`, `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G3` (G3 kapsamı), `npm run test:e2e`, `npm run locales:check`, `npm run release:rc` yeşil.
- [ ] Gerçek geçici SQLite, WAL/SHM ve çocuk süreç testleri CI’da çalışıyor; yalnız mock’a dayanan kanıt yok.
- [ ] `docs/audit/V3_EVIDENCE_MATRIX.md` P2 satırları dolu; Y-09/Y-10 için felaket senaryosu kanıtı eklenmiş.
- [ ] `1.2.0-beta.1` yalnızca beta kanalında; genel dağıtım yok. Beta notunda P3/P4 açık bulguları ve bilinen sınırlar listelenmiş.
- [ ] `1.2.0-beta.1 → 1.1.1` geri dönüş testi; DB şeması geriye uyumlu; audit zinciri korunuyor.

---

## 10. P3 — Performans ve Renderer Disiplini (WP-22 – WP-23)

> **Gate kuralı:** `G4` kapanmadan `1.2.0-rc.1` üretilmez. Bu aşamada Y-11 ve D-07 kapanır.
>
> **Sıra:** `WP-22`, `WP-15` + `WP-19` sonrası; `WP-23` WP-00 sonrası bağımsız başlayabilir. `WP-22` ve `WP-23` farklı dosyalarda olduğu için paralel yürüyebilir; ancak G4 performans ölçümü ikisi de merge edilmeden yapılmaz.
>
> **P3 ilkesi:** Performans “hissedilir” değil, ölçülür. Her iddia event-loop gecikmesi, tick süresi, IPC çağrı sayısı veya bellek ölçümüyle kanıtlanır; ölçüm olmadan optimizasyon kabul edilmez.

### 10.1 WP-22 — Async/worker FS taraması

| Alan | Değer |
|---|---|
| **Bulgular** | Y-11 |
| **Öncelik** | P3 / G4 |
| **Bağımlılık** | WP-15, WP-19 |
| **Kapı** | G4 |
| **Ana dosyalar** | `src/main/services/conditions/DirectoryScanService.js` (yeni), `src/main/services/conditions/directoryScanWorker.js` (yeni), `src/main/services/SmartFinishEngine.js`, `src/main/services/conditions/DirectoryIdle.js`, `src/main/locales/*.json`, `package.json`, `tests/main/directory-scan.test.mjs`, `tests/main/smartfinish.test.mjs`, `tests/e2e/packaged.spec.js` |
| **İlgili kararlar** | D23 |

**Amaç:** 1 saniyelik scheduler tick’i içinde senkron `readdir/lstat` taraması yapılmasını bitirmek; klasör imzasını ayrı bir Node worker’ında, sınırlı ve önbellekli biçimde hesaplamak. `SmartFinishEngine.evaluateTask()` senkron kalır; ağır iş worker’a taşınır ve sonuç önbellekten okunur. Böylece `_evaluating` reentrancy tasarımı gereksiz yere async’e çevrilmez.

#### 10.1.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `directory-scan.test.mjs`: 50.000 girişli klasör taraması sırasında ana thread event-loop gecikmesi ölçülür; tarama süresi değil, ana thread blokajı ölçülür.
   - `smartfinish.test.mjs`: tarama henüz yokken `DIRECTORY_IDLE` false; stale/pending sonuçla tetikleme yok.
   - Worker timeout/crash → false; süreç ayakta; yeniden denenebilir.
   - Aynı klasör için eşzamanlı 10 istek → tek worker işi; önbellek paylaşılır.
2. **Worker protokolü.**
   - `directoryScanWorker.js` `worker_threads.parentPort` üzerinden mesaj alır:
     `{ id, dirPath, maxDepth, maxEntries, timeoutMs }`.
   - `scanDirectory` çağrılır; sonuç `{ id, ok, signature, latestMtime, totalSize, fileCount, hasPartial, entryCount, durationMs }` veya `{ id, ok:false, code, message }` döner.
   - Worker yalnız `scanDirectory` ve `isPartialFile` kullanır; DB/Electron/renderer erişimi yok.
   - `dirPath` mutlak, normalize, `\0` içermeyen ve uzunluk sınırında olmalı; aksi halde `INVALID_SCAN_PATH`.
   - Worker `unhandledRejection`/`uncaughtException` yakalar; parent’a hata mesajı gönderir, ölmezse devam eder.
3. **`DirectoryScanService`.**
   - Constructor: `{ workerFactory, maxConcurrent=1, scanTimeoutMs=1500, minIntervalMs=2000, maxCacheAgeMs=10000, maxQueue=16, now }`.
   - `getSignature(dirPath, limits)` senkron döner; sonuç `scannedAt` taşır. Sıra:
     - taze cache (`age <= maxCacheAgeMs`) → `{ok:true, signature, scannedAt, cached:true}` döner; cache `minIntervalMs`’den eskiyse ve in-flight yoksa arka planda tek uçuş yenileme kuyruğa alınır, ancak taze cache yine de kullanılır;
     - taze cache yok + in-flight → `{ok:false, code:'SCAN_PENDING', stale:true}`;
     - taze cache yok/eski → işi kuyruğa alır ve `{ok:false, code:'SCAN_PENDING', stale:true}` döner;
     - kuyruk doluysa `{ok:false, code:'SCAN_QUEUE_FULL', stale:true}` döner.
   - `scanKey = normalizedPath + JSON.stringify(limits)`; aynı anahtar tek uçuş.
   - `queue` sınırı aşılırsa `SCAN_QUEUE_FULL`; en eski bekleyen değil, yeni istek reddedilir (aktif görevlerin taraması korunur).
   - `invalidate(scanKey)` cache kaydını ve varsa bekleyen sonucu temizler; `clearTask` bunu kullanır.
   - Worker yoksa/başlatılamazsa `SCAN_WORKER_UNAVAILABLE`; ana thread’de senkron fallback **yok**.
   - `shutdown()` bekleyenleri reddeder, worker’ı `terminate()` ile kapatır; 2 s içinde kapanmazsa `worker.unref()`.
4. **Worker yaşam döngüsü.**
   - Tek worker tembel oluşturulur; `error`/`exit` olayında tüm pending `SCAN_WORKER_CRASHED` ile reddedilir; 5 s backoff sonrası yeniden denenir.
   - Her iş için `setTimeout(scanTimeoutMs)`; timeout’ta worker `terminate()` edilir, pending reddedilir, yeni worker sonraki işte açılır.
   - Worker `unref()` edilir; uygulama kapanışını engellemez.
5. **SmartFinishEngine entegrasyonu.**
   - `SmartFinishEngine` constructor’ına `directoryScanService` enjekte edilir; testlerde fake.
   - `evaluateSingleCondition` `DIRECTORY_IDLE` için `scanService.getSignature(...)` kullanır; `scanDirectory` importu kaldırılır (yalnız `isPartialFile` gerekirse kalır).
   - Sonuç `ok:false` ise `{satisfied:false, message: t('directoryScanPending'|'directoryScanUnavailable')}`; `stale` sonuç asla `satisfied:true` üretmez.
   - `stableSeconds` sayacı yalnız `scannedAt` ilerlemiş ve imza aynı olan iki sonuçla ilerler; aynı cache’in tekrarı sayacı ilerletmez; pending/cache turu sayacı sıfırlamaz, yalnız bekletir.
   - `fileSamples`/`directorySamples` kaydı `{signature, since, scannedAt}` taşır; WP-19’un `taskId` önekli koşul anahtarları korunur.
   - `clearTask` (WP-19) görev için izlenen `scanKey`’leri de temizler; `SmartFinishEngine` task başına kullandığı anahtarları tutar ve `DirectoryScanService.invalidate(scanKey)` çağırır. Aksi halde terminal görevlerin yolları `maxCacheAgeMs` boyunca bellekte kalır.
   - `directoryScanPending` ve `directoryScanUnavailable` anahtarları 17 main locale dosyasına eklenir; çevirisi olmayanlarda İngilizce fallback kullanılır.
6. **Paketleme.**
   - `package.json` `asarUnpack` listesine `**/directoryScanWorker.js` eklenir; `npm run verify:pack` worker dosyasını paket içinde doğrular.
   - Worker yolu `path.join(__dirname, 'directoryScanWorker.js')`; asar içinden yüklenemezse packaged E2E kırmızı olur.
   - Fallback yalnız aynı `DirectoryScanService` arayüzü altında `utilityProcess.fork`; ana thread senkron tarama alternatifi değildir. Fallback ayrı bir PR ve G4 kanıtı gerektirir.
7. **Testler ve kanıt.**
   - T22-01…T22-06; `tests/helpers/fault-injection.mjs` `simulateWorkerCrash`.
   - 5.000 ve 50.000 girişli fixture; CI’da 50k testi yalnız G4 job’unda.
   - `npm run test:load` event-loop lag çıktısı `docs/audit/G4_PERF.md`.

#### 10.1.2 Çıktılar

- `DirectoryScanService` + worker; önbellek, throttle, timeout, crash recovery.
- `SmartFinishEngine` senkron değerlendirme + async tarama sonucu.
- `asarUnpack` worker ve packaged doğrulama.
- Event-loop lag ve tarama süresi ölçüm raporu.
- T22-01…T22-06 kanıtları.

#### 10.1.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Worker asar içinden yüklenemez | Orta | Yüksek | `asarUnpack` + packaged E2E | `utilityProcess.fork` aynı arayüz; senkron fallback yok |
| İlk tarama gecikmesi koşulu geciktirir | Yüksek | Düşük | `SCAN_PENDING` mesajı; 1–2 tick tolerans; kullanıcıya “taranıyor” | `maxCacheAgeMs` artır; ön tarama |
| Worker crash tüm koşulları bloke eder | Orta | Orta | Backoff + yeniden başlatma; fail-closed | Koşulu devre dışı bırak; kullanıcıya uyarı |
| 50k giriş worker’da bile yavaş | Orta | Orta | maxEntries sınırı; timeout; imza örnekleme | maxEntries düşür; klasörü böl |
| Cache bayat imza kullanır | Orta | Yüksek | maxCacheAge; iki taze imza kuralı; stale deny | Cache’i temizle; koşulu beklet |
| Aynı klasör çok görevde taranır | Orta | Orta | `scanKey` dedupe; tek uçuş | Kuyruk sınırı; adil paylaşım |

#### 10.1.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T22-01 | Event-loop blokajı | 50k girişli klasör; worker taraması | Ana thread lag p99 < 150 ms; tick kaçmaz | Hiçbir tick > 500 ms |
| T22-02 | Tekrar/önbellek | Aynı klasör 10 istek | Tek worker işi; sonuç cache’ten | İş sayısı 1; imza aynı |
| T22-03 | Timeout/crash | Worker’ı öldür; iş gönder | `SCAN_WORKER_CRASHED`; koşul false | Süreç ayakta; sonraki iş çalışır |
| T22-04 | Throttle | Aynı klasör 1 s içinde 3 kez | En fazla 1 tarama; diğerleri pending veya cache | `minIntervalMs` korunur; yeni tarama yok |
| T22-05 | Çoklu klasör | İki farklı klasör koşulu | İki bağımsız imza; biri diğerini ezmez | İki görev de doğru |
| T22-06 | Kapanış/paket | `shutdown`; packaged E2E | Worker kapanır; uygulama asılı kalmaz | Paketli çalışma yeşil |

#### 10.1.5 Geri alma

- Worker kaldırılıp senkron taramaya dönmek Y-11’i yeniden açar; üretimde yasak.
- `utilityProcess` fallback’i aynı sözleşmeyi korur; ana thread fallback yalnız geliştirme ortamında ve açık uyarıyla.
- Cache kaldırılırsa her tick tarama yapılır; performans regresyonu kabul edilemez.
- `asarUnpack` geri alınırsa packaged E2E kırmızı olur; release engellenir.

#### 10.1.6 Definition of Done (DoD)

- [ ] 1 sn tick içinde senkron `readdir/lstat` yok; tarama worker’da.
- [ ] Worker timeout/crash fail-closed; ana thread senkron fallback yok.
- [ ] Önbellek, throttle, dedupe, `invalidate` ve queue sınırı çalışıyor.
- [ ] Paketlenmiş uygulamada worker yükleniyor; T22-01…T22-06 yeşil.
- [ ] Event-loop lag raporu G4 kanıtına eklenmiş.

---

### 10.2 WP-23 — Görev polling disiplini

| Alan | Değer |
|---|---|
| **Bulgular** | D-07 |
| **Öncelik** | P3 / G4 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G4 |
| **Ana dosyalar** | `src/renderer/app.js`, `tests/renderer/tasks-refresh.test.mjs`, `tests/renderer/bridge.test.mjs`, `tests/e2e/smoke.spec.js` |
| **İlgili kararlar** | D27 |

**Amaç:** Görev listesi polling’ini 5 s’den 10 s’ye çıkarmak, aynı anda birden fazla `getTasks` isteğini engellemek, sekme/penceri gizliyken polling’i durdurmak ve değişmeyen sonuçta DOM’u yeniden çizmemek.

#### 10.2.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `tasks-refresh.test.mjs`: `getTasks` 50 ms gecikirken 2 poll → eşzamanlı tek IPC çağrısı; ikinci istek kuyrukta bekler ve ilki bitince bir kez çalışır (toplam 2).
   - 10 s timer; görünürken tetiklenir, `document.hidden` iken tetiklenmez.
   - Aynı görev kümesi → `lastTaskRenderSignature` değişmez; `requestAnimationFrame` yalnız süre hücrelerini günceller.
   - Gizli → görünür geçişte tek yenileme.
2. **Durum bayrakları.**
   - `let tasksLoading = false; let tasksQueued = false; let tasksRequestSeq = 0;`
   - `async function loadTasks(options = {})`:
     - `if (tasksLoading) { tasksQueued = true; return; }`
     - `tasksLoading = true; const seq = ++tasksRequestSeq;`
     - `try { const all = await getTasks(); if (seq !== tasksRequestSeq) return; ... }`
     - `finally { tasksLoading = false; if (tasksQueued) { tasksQueued = false; queueMicrotask(() => loadTasks({ reason:'queued' })); } }`
   - `options.reason` yalnız log/telemetry; iş mantığı değiştirmez.
3. **Polling aralığı ve görünürlük.**
   - `TASKS_REFRESH_MS = 10000`.
   - Timer callback:
     ```js
     if (document.visibilityState !== 'visible') return;
     const view = document.getElementById('view-tasks');
     if (view && !view.classList.contains('hidden')) loadTasks({ reason:'poll' });
     ```
   - `document.addEventListener('visibilitychange', ...)`: görünür olduğunda `loadTasks({reason:'visible'})`.
   - `beforeunload`: timer temizlenir; `tasksLoading` sıfırlanır.
4. **Render disiplini.**
   - Mevcut `taskRenderSignature` + `lastTaskRenderSignature` korunur; hash görev kimliği, durum, action, trigger, targetTime ve enabled alanlarını içerir.
   - Hash aynıysa `renderMonitoringTasks` dahil tam DOM yeniden kurulmaz; yalnız süre hücreleri güncellenir.
   - Hash farklıysa tek `replaceChildren`/`DocumentFragment`; satır başına ayrı DOM sorgusu yok.
   - Hata durumunda `tasks-error` gösterilir; eski tablo korunur; sonraki başarıda temizlenir.
5. **Manuel yenileme.**
   - `btn-refresh-tasks` `loadTasks({reason:'manual'})`; in-flight varsa `tasksQueued` ile bir kez daha çalışır, istek çoğaltmaz.
   - Görev oluşturma/iptal sonrası `loadTasks({reason:'mutation'})`; poll beklenmez.
6. **Testler ve kanıt.**
   - T23-01…T23-05; fake timer ve kontrollü `getTasks` promise.
   - E2E: görev listesi açıkken 3 poll; ağ/IPC gecikmesi enjekte edilir.

#### 10.2.2 Çıktılar

- `tasksLoading`, `tasksQueued`, `tasksRequestSeq`.
- 10 s polling + visibility guard.
- Hash tabanlı render korunuyor; hata/eski veri yarışı yok.
- T23-01…T23-05 kanıtları.

#### 10.2.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Kuyruk sonsuz döngü | Düşük | Orta | `tasksQueued` tek bayrak; microtask bir kez | Kuyruğu temizle; sonraki poll |
| Gizli sekmede gecikmeli istek | Orta | Düşük | visibility guard; sonuç seq kontrolü | Görünür olunca tek yenileme |
| Hash çok agresif → değişiklik kaçar | Orta | Orta | Status/action/trigger/targetTime/enabled alanları; test | Hash’e alan ekle; tam render |
| Manuel yenileme yanıtı eski poll tarafından ezilir | Orta | Orta | `tasksRequestSeq`; yalnız son seq render | Önceki yanıtı yoksay |
| 10 s kullanıcıya yavaş gelir | Düşük | Düşük | Manuel yenileme + mutation sonrası anında | 5 s’ye dönme; yalnız görünürken |

#### 10.2.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T23-01 | In-flight guard | Gecikmeli `getTasks`; iki poll | Eşzamanlı tek IPC çağrısı; kuyruktaki ikinci istek sonra çalışır (toplam 2) | İkinci istek kuyrukta; eşzamanlı çoğalma yok |
| T23-02 | 10 s aralık | Fake timer 5 s / 10 s | 5 s’de çağrı yok; 10 s’de bir | Interval 10000 |
| T23-03 | Gizli görünüm | `document.hidden=true`; timer | Çağrı yok; görünürde bir | Visibility guard |
| T23-04 | Aynı hash | Aynı liste iki kez | Tam render yok; süre hücresi | `lastTaskRenderSignature` sabit |
| T23-05 | Manuel kuyruk | Yükleme sırasında refresh | Bir kez daha; toplam 2 | İstek çoğalmaz |

#### 10.2.5 Geri alma

- 5 s polling’e dönmek D-07’yi yeniden açar; önerilmez.
- In-flight guard kaldırılırsa eski yanıt yeni yanıtı ezebilir; en az `tasksRequestSeq` korunur.
- Visibility guard kaldırılırsa gizli pencerede IPC/CPU artar; kabul edilmez.

#### 10.2.6 Definition of Done (DoD)

- [ ] Polling 10 s; gizliyken duruyor; görünürken tek yenileme.
- [ ] Aynı anda tek `getTasks`; kuyruk tek.
- [ ] Aynı hash’te tam DOM render yok; eski yanıt yeni durumu ezmiyor.
- [ ] Manuel yenileme ve mutation sonrası anında güncelleme.
- [ ] T23-01…T23-05 yeşil.

---

### 10.3 G4 — P3 çıkış kontrolü

`G4` aşağıdaki maddelerin tamamı sağlanmadan kapanmaz:

- [ ] WP-22 Y-11: worker tabanlı tarama; event-loop lag bütçesi; T22-01…T22-06 yeşil.
- [ ] WP-23 D-07: 10 s polling, in-flight guard, visibility, hash; T23-01…T23-05 yeşil.
- [ ] 50k girişli klasör testi CI’da çalıştı; ana thread p99 lag < 150 ms ve hiçbir tick > 500 ms.
- [ ] `npm run pack` ve `npm run verify:pack` yeşil; worker asarUnpack doğrulandı.
- [ ] `npm run test:e2e`, `npm run test:load`, `npm run locales:check` yeşil; packaged E2E worker’ı yükledi.
- [ ] `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G4` (G4 kapsamı) yeşil; renderer gözlem halkası düşmedi.
- [ ] `npm run release:rc`, `npm audit --audit-level=high`, `npm run audit:licenses`, `npm run sbom` yeşil; `1.2.0-rc.1` imzalı artefaktı `scripts/verify-signature.ps1` ile doğrulandı.
- [ ] Windows manuel matrisinin performans/gizli pencere/RTL senaryoları kaydedildi.
- [ ] P0–P2 kapanışlarında regresyon yok; `test:security` yeşil.
- [ ] `1.2.0-rc.1` yalnızca RC kanalında; P4 Düşük bulguları açıkken genel yayın yok.
- [ ] `1.2.0-rc.1` release notunda bilinen Düşük bulgular, performans ölçümleri ve geri dönüş prosedürü var.

---

## 11. P4 — Düşük Bulgular ve Yayın Temizliği (WP-24 – WP-27)

> **Gate kuralı:** `G5` kapanmadan `1.2.0` genel yayını yapılmaz. Bu aşamada D-01, D-02, D-03 ve D-04 kapanır; bağımsız yeniden denetim ve 36/36 kanıt tamamlanır.
>
> **Sıra:** `WP-24` → `WP-25`; `WP-26` ve `WP-27` WP-00 sonrası bağımsız. `WP-26` `preload.js` dosyasını değiştirir; `WP-25` yalnız mevcut `getSettings`/`getLocale` yüzeyini kullandığı için aynı dosyaya yazmaz. Yine de sözleşme çakışmasını önlemek için `WP-26` önce merge edilir; `WP-25`, `WP-26`'nın `subscribe` yardımcısına bağımlı değildir. `WP-25`, `WP-24`'ün güvenli i18n yardımcısını bekler.
>
> **P4 ilkesi:** Düşük bulgu, düşük kanıt demek değildir. Her biri gerçek locale, gerçek mini pencere veya gerçek model metadata’sı ile test edilir; kozmetik olduğu için test atlanmaz.

### 11.1 WP-24 — i18n gün fallback’i

| Alan | Değer |
|---|---|
| **Bulgular** | D-01 |
| **Öncelik** | P4 / G5 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G5 |
| **Ana dosyalar** | `src/renderer/app.js`, `src/renderer/i18n.js`, `tests/renderer/i18n.test.mjs` (yeni), `tests/renderer/timer.test.mjs` (yeni), `tests/renderer/bridge.test.mjs` |
| **İlgili kararlar** | D25 |

**Amaç:** Locale sözlüğü yüklenemediğinde veya `timeFormatDays` eksik/bozuk olduğunda `substring` çağrısının çökmesini bitirmek; gün etiketini güvenli fallback ile göstermek ve i18n katmanının son iyi sözlüğü korumasını sağlamak.

#### 11.1.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `i18n.test.mjs`: `getLocale` `{ok:false}` döndürür; `load()` sonrası `translations` boş ama `t()` anahtar döndürür; çökme yok.
   - `timer.test.mjs`: `secondsRemaining = 90000` (1 gün +); `dict.timeFormatDays` undefined; `updateDisplay()` ve gün cümlesi çökmez.
   - `timeFormatDays: ''`, `null`, sayı → fallback.
2. **Güvenli birim yardımcısı.**
   - `app.js` içinde `timeUnit(key, fallback)`:
     ```js
     function timeUnit(key, fallback) {
       const value = t(key);
       return typeof value === 'string' && value.trim() && value !== key ? value : fallback;
     }
     ```
   - `updateDisplay`: `days.textContent = `${d}${timeUnit('timeFormatDays','d')}`;`
   - `updateTimerSentence` / saat cümlesi: `timeUnit('timeFormatDays','d')`, `timeFormatHours`, `timeFormatMinutes`, `timeFormatSeconds`; hepsi aynı yardımcıdan.
   - Fallback `d` evrensel ve kısa; Türkçe `g` yerine kullanıcıya yanlış dil dayatmaz.
3. **i18n yükleme dayanıklılığı.**
   - `i18n.js` hata durumunda `translations = {}` ile son iyi sözlüğü silmez; `lastGoodTranslations` saklanır.
   - İstenen dil yüklenemezse sırasıyla `en`, `tr` fallback dener; hiçbiri yoksa son iyi sözlük korunur.
   - `window.PPLocale.degraded = true` ve `getStatus()`; UI’da toast zorunlu değil, konsol `console.warn` yeterli.
   - `load()` başarısında `degraded=false`; `documentElement.lang/dir` yalnız başarılı sözlükte değişir.
   - `ready` promise reddetmez; `catch` içinde `return null`.
4. **Diğer `dict.*` erişimleri.**
   - `app.js` içinde `dict.timeFormat*` doğrudan erişimlerini `grep` ile tara; kalan varsa `timeUnit` kullan.
   - `t()` zaten `undefined` yerine anahtar döndürür; yeni kodda `dict[...]` doğrudan kullanılmaz.
5. **Testler ve kanıt.**
   - T24-01…T24-03; jsdom; `getLocale` mock’u.
   - `npm run locales:check` yeşil; locale dosyalarında `timeFormatDays` tüm 17 dilde var.

#### 11.1.2 Çıktılar

- `timeUnit` yardımcısı ve tüm gün/saat/dakika/saniye etiketlerinde kullanım.
- `i18n.js` son iyi sözlük ve `en`/`tr` fallback.
- `PPLocale.degraded`/`getStatus` gözlemlenebilirliği.
- T24-01…T24-03 kanıtları.

#### 11.1.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Fallback `d` yanlış dilde görünür | Orta | Düşük | Yalnız bozuk sözlükte; normalde locale | `t('timeFormatDays')` varsa onu kullan |
| Son iyi sözlük eski dilde kalır | Orta | Düşük | `degraded` bayrağı; dil değişiminde yeniden dene | `tr`/`en` fallback |
| `t()` anahtar döndürünce “yüklenmiş” sanılır | Orta | Orta | `value !== key` kontrolü; test | `timeUnit` fallback |
| i18n hatası kullanıcıya görünmez | Düşük | Düşük | `console.warn` + `degraded` | Destek kaydı; toast |
| Diğer `dict` erişimleri gözden kaçar | Orta | Orta | `grep` + ESLint kuralı önerisi | Testte boş sözlük taraması |

#### 11.1.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T24-01 | Boş sözlük + gün | `timeFormatDays` yok; 90k sn | “1d …” render; çökme yok | `updateDisplay` throw etmez |
| T24-02 | Locale yükleme hatası | `getLocale` ok:false | Son iyi sözlük korunur; `degraded` | `t('x')` anahtar döner |
| T24-03 | Bozuk değer | `timeFormatDays:''` / `null` | Fallback `d` | `substring` çağrısı yok |

#### 11.1.5 Geri alma

- `dict.*` doğrudan erişimine dönmek D-01’i yeniden açar; yasak.
- Son iyi sözlük davranışı geri alınırsa boş sözlükte anahtarlar görünür; çökme yine olmaz, ancak D-01 kapanışı için fallback korunur.
- `en`/`tr` fallback sırası değişebilir; `tr` varsayılan ürün dili olarak kalır.

#### 11.1.6 Definition of Done (DoD)

- [ ] `timeFormatDays` eksik/bozukken gün etiketi çökmeden render ediliyor.
- [ ] `i18n.js` son iyi sözlüğü koruyor; `en`/`tr` fallback var.
- [ ] `dict.timeFormat*` doğrudan erişimi kalmadı.
- [ ] T24-01…T24-03 ve `locales:check` yeşil.

---

### 11.2 WP-25 — Mini pencere i18n tooltip/erişilebilirlik

| Alan | Değer |
|---|---|
| **Bulgular** | D-03 |
| **Öncelik** | P4 / G5 |
| **Bağımlılık** | WP-24 |
| **Kapı** | G5 |
| **Ana dosyalar** | `src/mini.html`, `src/renderer/mini.js`, `src/renderer/locales/*.json` (17), `tests/renderer/mini-i18n.test.mjs` (yeni), `scripts/check-i18n.js` |
| **İlgili kararlar** | D25 |

**Amaç:** Mini pencerenin üç düğme tooltip’ini ve erişilebilirlik etiketlerini aktif dile bağlamak; hardcoded Türkçe metinleri kaldırmak; dil yüklenemezse güvenli Türkçe/İngilizce fallback göstermek.

#### 11.2.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `mini-i18n.test.mjs`: `getSettings` `language:'en'`, `getLocale('en')` sözlüğü ile mini DOM’da `btn-hide.title === 'Send to background'`, `btn-restore.title === 'Open app'`, `btn-cancel.title === 'Cancel timer'`; `aria-label` aynı.
   - `ar` için `dir="rtl"`, `lang="ar"`; tooltip ve aria İngilizce fallback (17 dosyada `ar` çevirisi yok).
   - `getLocale` fail → fallback Türkçe; çökme yok.
2. **HTML sözleşmesi.**
   - Üç düğmeye `data-i18n-title="miniHide|miniRestore|miniCancel"` ve başlangıç `title` + `aria-label` ekle.
   - `title` ve `aria-label` aynı anahtardan; ikon `span` `aria-hidden="true"`.
   - `mini.html` `lang="tr"` başlangıç; JS başarılı yüklemede günceller.
3. **`mini.js` dil yüklemesi.**
   - `applyMiniLanguage()`:
     - `settings = await window.electronAPI.getSettings()`; `lang = settings.language` (SQLite tek kaynak; localStorage okunmaz).
     - `locale = await window.electronAPI.getLocale(lang)`; `locale.ok === true` ise `dict`.
     - `document.querySelectorAll('[data-i18n-title]')`; `dict[key]` string ise `title`/`aria-label`; değilse mevcut Türkçe fallback korunur.
     - `document.documentElement.lang = locale.lang`; `dir = locale.rtl ? 'rtl' : 'ltr'`.
   - `DOMContentLoaded` sonrası bir kez çağrılır; hata `console.warn`; düğmeler çalışmaya devam eder.
   - Dil değişikliği mini pencere açıkken anlık değil; mini yeniden açıldığında uygulanır. Bu sınır release notunda belirtilir.
4. **Locale anahtarları.**
   - `miniHide`, `miniRestore`, `miniCancel` 17 dosyada; `tr` ve `en` gerçek çeviri, diğerleri İngilizce fallback.
   - `scripts/check-i18n.js` anahtar eşitliği ve placeholder parity’yi doğrular.
5. **Testler ve kanıt.**
   - T25-01…T25-04; jsdom mini HTML; `getSettings/getLocale` mock.
   - E2E: mini pencere aç, `en` ve `ar` dillerinde tooltip/aria doğrula.

#### 11.2.2 Çıktılar

- `data-i18n-title` + `aria-label` üç düğme.
- `applyMiniLanguage()`; SQLite dil kaynağı.
- 17 locale anahtarı.
- T25-01…T25-04 kanıtları.

#### 11.2.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Mini preload `getSettings` yok | Düşük | Orta | Preload sözleşmesi testi; mevcut `getSettings` | `getLocale('tr')` fallback |
| Dil değişimi mini açıkken görünmez | Orta | Düşük | Yeniden açma notu; istenirse settings event ayrı WP | Kullanıcı mini’yi kapat/aç |
| Arapça RTL düzeni bozar | Düşük | Orta | `dir=rtl`; CSS testi; E2E | Yalnız tooltip; düzen fallback |
| Anahtar eksikliği build’i kırar | Düşük | Orta | `locales:check` CI; 17 dosya | İngilizce fallback |
| Tooltip ve aria farklı | Düşük | Düşük | Tek anahtar; test | İkisini birlikte güncelle |

#### 11.2.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T25-01 | 17 locale parity | `locales:check` | Üç anahtar tüm dillerde | Eksik yok |
| T25-02 | İngilizce mini | `language:'en'` | Üç tooltip/aria İngilizce | Metinler eşleşir |
| T25-03 | Locale fail | `getLocale` ok:false | Türkçe fallback; düğmeler çalışır | Çökme yok |
| T25-04 | Arapça RTL | `language:'ar'` | `dir=rtl`; `lang=ar`; tooltip/aria İngilizce fallback | RTL yönü doğru; fallback metin boş değil |

#### 11.2.5 Geri alma

- Hardcoded Türkçe’ye dönmek D-03’ü yeniden açar; yalnız acil rollback.
- `aria-label` kaldırılırsa erişilebilirlik geriler; title yeterli değildir.
- Yeni locale anahtarları geri alınırsa `check-i18n` kırmızı olur; anahtarlar korunur.

#### 11.2.6 Definition of Done (DoD)

- [ ] Mini üç düğme tooltip’i ve aria etiketi aktif dilde.
- [ ] Dil SQLite’tan; localStorage’dan değil.
- [ ] 17 locale anahtarı parity; fallback güvenli.
- [ ] T25-01…T25-04 ve `locales:check` yeşil.

---

### 11.3 WP-26 — Preload unsubscribe

| Alan | Değer |
|---|---|
| **Bulgular** | D-04 |
| **Öncelik** | P4 / G5 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G5 |
| **Ana dosyalar** | `preload.js`, `src/renderer/app.js`, `tests/renderer/preload.test.mjs` (yeni), `tests/renderer/bridge.test.mjs` |
| **İlgili kararlar** | D26 |

**Amaç:** `onWarningEnded` gibi çok kanallı aboneliklerin temizlenebilir bir fonksiyon döndürmesini sağlamak; renderer yeniden yüklendiğinde veya test/HMR akışında listener birikmesini önlemek.

#### 11.3.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `preload.test.mjs`: `onWarningEnded(cb)` bir fonksiyon döndürür; üç kanal kaydedilir; cleanup üçünü de `removeListener` eder.
   - İki abonelik birbirinden bağımsız; biri cleanup olunca diğeri kalır.
   - Cleanup iki kez çağrılınca hata yok; iki bağımsız abonelik kendi listener’ını temizler.
2. **Ortak `subscribe` yardımcısı.**
   ```js
   function subscribe(channels, handler, transform = (args) => args[0]) {
     const listener = (_event, ...args) => handler(transform(args));
     for (const channel of channels) ipcRenderer.on(channel, listener);
     return () => {
       for (const channel of channels) ipcRenderer.removeListener(channel, listener);
     };
   }
   ```
   - `onWarningEnded(callback)`:
     ```js
     return subscribe(['warning-cancelled','warning-snoozed','warning-finished'], callback);
     ```
   - Diğer çok kanallı API’ler (`onTimerTick`, `onTaskExecuted`, `onTaskFailed`, `onSystemResumed`) aynı yardımcıyı kullanır; tekil kanallar için de cleanup döndürülür. Geriye uyumluluk: dönüş değerini yoksayan çağıranlar çalışmaya devam eder.
3. **Renderer kullanımı.**
   - `app.js` `warningUnsubscribe = window.electronAPI.onWarningEnded(...)`; `beforeunload` içinde çağır.
   - Diğer uzun ömürlü listener’lar aynı desen; her biri tek kez bağlanır.
   - `bridge.test.mjs` sözleşmesi: her `on*` fonksiyonu `function` ve cleanup döndürüyor.
4. **Testler ve kanıt.**
   - T26-01…T26-03; `electron` mock’u `ipcRenderer.on/removeListener` spy.
   - E2E: pencere reload sonrası uyarı event’i bir kez işlenir.

#### 11.3.2 Çıktılar

- `subscribe` yardımcısı ve cleanup dönen listener API’leri.
- `onWarningEnded` üç kanal cleanup.
- Renderer `beforeunload` temizliği.
- T26-01…T26-03 kanıtları.

#### 11.3.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| Cleanup yanlış listener’ı siler | Düşük | Orta | Aynı listener referansı; kanal başına remove | Test; callback kimliği |
| Eski çağıran cleanup’ı yoksayar | Orta | Düşük | Geriye uyumlu dönüş; JSDoc; app beforeunload | Yeni çağrıda cleanup sakla |
| Çift abonelik | Orta | Orta | `subscribe` idempotent değil; çağıran tek kez | `WeakSet` ile callback dedupe |
| Preload sandbox kısıtı | Düşük | Yüksek | contextBridge sözleşmesi; bridge testi | Mevcut API’yi bozmadan yalnız cleanup ekle |
| `onTimerTick` davranışı değişir | Orta | Orta | Dönüş değeri ek; callback imzası aynı | Eski API alias’ı |

#### 11.3.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T26-01 | Cleanup döner | `onWarningEnded(cb)` | `typeof unsubscribe === 'function'` | Üç kanal bağlı |
| T26-02 | Temizlik | unsubscribe; event gönder | Callback çağrılmaz; üç remove | `removeListener` 3 |
| T26-03 | İzolasyon | İki abonelik; biri cleanup | Diğeri çalışır | Bağımsız listener |

#### 11.3.5 Geri alma

- Cleanup kaldırılırsa D-04 yeniden açılır; yalnız acil rollback.
- API dönüş tipi değişikliği geriye uyumlu; eski çağıranlar etkilenmez.
- `beforeunload` temizliği kaldırılırsa renderer kapanışında birikim riski; en az preload cleanup korunur.

#### 11.3.6 Definition of Done (DoD)

- [ ] `onWarningEnded` cleanup fonksiyonu döndürüyor; üç kanalı siliyor.
- [ ] Renderer beforeunload temizliği yapıyor.
- [ ] Mevcut callback sözleşmesi korunuyor.
- [ ] T26-01…T26-03 ve bridge testi yeşil.

---

### 11.4 WP-27 — Model boyutu metadata’sı

| Alan | Değer |
|---|---|
| **Bulgular** | D-02 |
| **Öncelik** | P4 / G5 |
| **Bağımlılık** | WP-00 |
| **Kapı** | G5 |
| **Ana dosyalar** | `src/renderer/app.js`, `src/main/services/ModelManager.js`, `main.js` (`ai-status`), `tests/renderer/model-progress.test.mjs` (yeni), `tests/main/model-manager.test.mjs`, `tests/e2e/smoke.spec.js` |
| **İlgili kararlar** | D28 |

**Amaç:** Renderer’daki iki hardcoded `1374389534` model hedefini kaldırmak; ilerleme yüzdesini `ai-status` içindeki `model.expectedBytes` / manifest metadata’sından hesaplamak; boyut bilinmiyorsa yanlış yüzde yerine belirsiz ilerleme göstermek.

#### 11.4.1 Uygulama adımları

1. **Kırmızı testleri yeşile çevir.**
   - `model-progress.test.mjs`: `expectedBytes=1282439584`, `partialBytes=641219792` → `%50`.
   - `expectedBytes=null`, manifest yok → `known:false`; `NaN`/`Infinity` yok; çökme yok.
   - `manifest.expectedBytes` varsa fallback olarak kullanılır.
   - Farklı model boyutu (ör. test modeli 1 MB) doğru yüzde.
2. **Sunucu sözleşmesi.**
   - `ModelManager.status()` zaten `expectedBytes` döndürüyor; `ai-status` bunu olduğu gibi korur. `expectedBytes` yoksa `null`; 0 uydurulmaz.
   - Manifest’te `expectedBytes` varsa status’a ikinci fallback olarak eklenir; `sizeBytes` gibi yeni bir alan uydurulmaz.
   - `main.js` `ai-status` yanıtı `model` ve `stt` için `expectedBytes` alanlarını içerir; public sır yok.
3. **Renderer yardımcısı.**
   - `resolveModelProgress(st)`:
     ```js
     function resolveModelProgress(status) {
       const model = status && status.model ? status.model : {};
       const expected = Number(model.expectedBytes)
         || Number(model.manifest && model.manifest.expectedBytes)
         || 0;
       const got = (model.present ? Number(model.bytes) || 0 : 0)
         + (Number(model.partialBytes) || 0);
       if (!Number.isFinite(expected) || expected <= 0) {
         return { known: false, got, total: 0, pct: null };
       }
       return { known: true, got, total: expected, pct: Math.min(100, Math.max(0, Math.round((got / expected) * 100))) };
     }
     ```
   - İki wizard bloğu da bu yardımcıyı kullanır; `1374389534` sabiti kalmaz.
   - `known:false` → bar `width:100%`, `pp-indeterminate` sınıfı, `aria-valuenow` kaldırılır; metin `t('wizardProgressGeneric', { pct:'—', mb })` ile gösterilir.
   - `known:true` → yüzde ve MB; `aria-valuenow` doğru.
4. **Testler ve kanıt.**
   - T27-01…T27-04; model status fixture’ları; `ai-status` E2E.
   - `grep -n "1374389534"` yalnız model sabiti/test fixture’ında; app.js’de yok.

#### 11.4.2 Çıktılar

- `resolveModelProgress()` ve iki wizard bloğunda kullanım.
- Hardcoded hedef kaldırıldı; bilinmeyen boyutta indeterminate.
- `ai-status` `expectedBytes`/manifest fallback.
- T27-01…T27-04 kanıtları.

#### 11.4.3 Riskler ve azaltma

| Risk | Olasılık | Etki | Azaltma | Fallback |
|---|---|---|---|---|
| `expectedBytes` null → yanlış %0 | Orta | Düşük | `known:false` indeterminate; test | “Boyut bilinmiyor” metni |
| Manifest eski model boyutu taşır | Düşük | Orta | `expectedBytes` öncelikli; manifest fallback | Manifest’i yenile |
| İki wizard bloğu farklı davranır | Orta | Düşük | Tek `resolveModelProgress`; iki çağrı | Ortak helper’a zorla |
| STT boyutu toplamı karışır | Orta | Düşük | Yalnız model bileşeni; STT ayrı gösterim | İki ayrı progress |
| `pp-indeterminate` CSS yok | Düşük | Düşük | CSS ekle; görsel test | Width 100% + aria-busy |

#### 11.4.4 Test senaryoları

| ID | Senaryo | Adımlar | Beklenen sonuç | Kabul ölçütü |
|---|---|---|---|---|
| T27-01 | Bilinen boyut | 1.282.439.584 beklenen; yarım | `%50`; aria 50 | Metin ve bar uyumlu |
| T27-02 | Bilinmeyen boyut | `expectedBytes:null` | `known:false`; NaN yok | Indeterminate; çökme yok |
| T27-03 | Manifest fallback | Status expected null; manifest dolu | Beklenen manifest değeri | Doğru yüzde |
| T27-04 | Farklı model | Test modeli 1 MB | Yüzde 1 MB’a göre | Sabit 1.28 GB kullanılmaz |

#### 11.4.5 Geri alma

- Hardcoded sabite dönmek D-02’yi yeniden açar; önerilmez.
- `expectedBytes` kaldırılırsa ilerleme bilinmiyor olur; yanlış yüzde göstermekten iyidir.
- `pp-indeterminate` geri alınırsa bar 100% görünür; metin “—” ile açıklanır.

#### 11.4.6 Definition of Done (DoD)

- [ ] `app.js` içinde hardcoded model boyutu yok.
- [ ] İlerleme `expectedBytes`/manifest’ten; bilinmeyende indeterminate.
- [ ] İki wizard bloğu aynı yardımcıyı kullanıyor; aria doğru.
- [ ] T27-01…T27-04 ve E2E smoke yeşil.

---

### 11.5 G5 — P4 çıkışı, bağımsız yeniden denetim ve `1.2.0` yayın kararı

`G5` aşağıdaki maddelerin tamamı sağlanmadan kapanmaz:

- [ ] WP-24 D-01: gün fallback’i; boş sözlükte çökme yok; T24-01…T24-03 yeşil.
- [ ] WP-25 D-03: mini tooltip/aria 17 dilde; T25-01…T25-04 yeşil.
- [ ] WP-26 D-04: cleanup dönen listener API’leri; T26-01…T26-03 yeşil.
- [ ] WP-27 D-02: model boyutu metadata; hardcoded hedef yok; T27-01…T27-04 yeşil.
- [ ] 36/36 bulgu `docs/audit/V3_EVIDENCE_MATRIX.md` içinde kapalı; her satırda test, commit, artefakt, gözden geçiren ve tarih var.
- [ ] `scripts/verify-traceability.mjs` 36 satırı, K=4/Y=11/O=13/D=8 sayısını ve tekrar yokluğunu doğruluyor.
- [ ] Hiçbir `it.fails` kalmamış; P0–P4 testleri normal `it` olarak yeşil.
- [ ] P4 düzeltmeleri dahil `1.2.0-rc.2` tag’i ve imzalı artefakt donduruldu; denetim sırasında yeni commit yok.
- [ ] `npm test`, `npm run test:security`, `npm run test:smoke`, `npm run test:e2e`, `npm run coverage` ve `node scripts/coverage-gate.mjs --gate G5` (G5 kapsamı), `npm run locales:check`, `npm run models:verify`, `npm run release:rc` (dondurulmuş `1.2.0-rc.2` adayı için), `npm audit --audit-level=high`, `npm run audit:licenses`, `npm run sbom`, `npm run pack`, `npm run verify:pack` yeşil.
- [ ] Kapsam kapısı: kapı halkası satır ≥ 85, dal ≥ 75, fonksiyon ≥ 85; genel satır ≥ 80, dal ≥ 65, fonksiyon ≥ 70, ifade ≥ 80; gözlem halkası baseline’ın 0,5 puan altında değil.
- [ ] Windows 10 22H2 ve Windows 11 23H2/24H2 üzerinde manuel matris tamam; standart kullanıcı + yönetici, yüksek DPI, çoklu monitör, RTL, uyku/uyanma, kilit, pil, antivirüs ve çevrimdışı senaryoları.
- [ ] `1.1.0 → 1.2.0` yükseltme, `1.2.0 → 1.1.1` geri dönüş, DB şema migrasyonu ve audit zinciri doğrulaması.
- [ ] İmzalı installer, SBOM ve lisans raporu üretildi; `scripts/verify-signature.ps1` imzayı doğruladı; yeni yüksek/kritik CVE yok veya kabul kaydı var.
- [ ] Bağımsız yeniden denetim tamamlandı; denetçi uygulayıcıdan farklı kişi/kurum; tüm Kritik/Yüksek bulgular ve Orta/Düşük’ün en az %20’si yeniden üretildi; testlerin negatif kontrolleri (test bozulunca kırmızı) doğrulandı.
- [ ] Yeniden denetimde yeni Kritik/Yüksek bulgu yok; varsa G5 kapanmaz ve yeni WP açılır. Yeni Orta/Düşük bulgular için yazılı kabul veya düzeltme; orijinal 36 bulgu kabulle kapatılamaz.
- [ ] Genel yayın öncesi sürüm `1.2.0` olarak güncellendi; imzalı installer yeniden üretildi, `npm run release:check` ve `scripts/verify-signature.ps1` yeşil.
- [ ] Sürüm komutu ayrımı korundu: `release:rc` yalnız dondurulmuş RC adaylarında (`1.2.0-rc.2`, denetim düzeltmesi gerekirse `1.2.0-rc.3`), nihai `1.2.0` için `release:check` kullanıldı.
- [ ] Release notları, güvenlik danışma metni, geri dönüş prosedürü ve operatör kılavuzu yayınlanmış.
- [ ] Ürün sahibi, güvenlik lideri ve QA lideri imzalı `1.2.0` yayın kararı; tarih/commit/tag kaydedilmiş.

---

## 12. Kesitler Arası Doğrulama, CI ve Yayın Kapıları

### 12.1 Test katmanları ve kanıt standardı

| Katman | Kapsam | Komut | Kapı | Kanıt |
|---|---|---|---|---|
| Birim | Saf fonksiyonlar, validator, policy, idempotency, i18n yardımcıları | `npm test` | G0–G5 | Test dosyası + V3 evidence satırı |
| Entegrasyon | IPC handler + fake storage, gerçek geçici SQLite/WAL, worker, dosya sistemi | `npm test` | G1–G5 | `tests/main/**` + artefakt |
| Renderer | jsdom, preload sözleşmesi, timer restore, polling, mini i18n | `npm test` | G1–G5 | `tests/renderer/**` |
| E2E | Electron ana pencere, tray, mini pencere, PIN/uyarı akışı | `npm run test:e2e` | G1–G5 | Playwright raporu + video/trace |
| Paketli | `asar`, worker, imza, model yolu, güncelleme | `npm run pack`, `npm run verify:pack`, `PP_PACKAGED_EXE=... npx playwright test packaged` | G4–G5 | Paket hash + test raporu |
| Yük/dayanıklılık | 50k klasör, 100k audit, 8 süreç kilidi, uzun oturum | `npm run test:load` | G4–G5 | `docs/audit/G4_PERF.md`, bellek profili |
| Güvenlik | Secret sızıntısı, IPC origin, Host, rol, audit, bağımlılık | `npm run test:security`, `npm audit`, `npm run audit:licenses` | G0–G5 | SBOM + tarama raporu |
| Manuel | Windows sürümleri, DPI, RTL, uyku, AV, erişilebilirlik | Madde 12.4 | G1–G5 | Gate başına matris; G5’te imzalı nihai matris |

> Paketli E2E, `PP_PACKAGED_EXE` ortam değişkeniyle çalışır (`dist/win-unpacked/Power Pilot.exe` veya kurulu EXE). Installer/kurulum doğrulaması `scripts/packaged-e2e.ps1` ile ayrıca yapılır.

**Kanıt kuralları:**

- Her bulgu için en az bir **negatif kontrol** vardır: düzeltme geri alındığında test kırmızı olmalıdır. Yalnızca “çalışıyor” testi kabul edilmez.
- Her test, gerçek üretim modülünü çağırır; test içinde üretim davranışını taklit eden ayrı bir kopya yoktur. Harness yalnızca sınır (IPC, fs, saat, worker) taklit eder.
- Kritik/Yüksek bulgularda test + manuel/otomatik saldırı senaryosu birlikte aranır.
- Kanıt artefaktları `docs/audit/evidence/<WP>/` altında; commit hash, tarih, komut, çıktı özeti ve gözden geçiren içerir.
- Test ortamı Windows + Node 24.22.1 + aynı `package-lock.json`; farklı ortam “yeşil” sayılmaz.

### 12.2 Hata enjeksiyonu matrisi

| WP | Enjeksiyon | Beklenen güvenli davranış | Test |
|---|---|---|---|
| WP-01 | Audit append throw / DB yazma hatası | PIN değişmez; `AUDIT_WRITE_FAILED`; atomik rollback | T01-03, T01-05 |
| WP-02 | Uyarı A→B yarışı, eski epoch tıklaması | Eski tıklama `WARNING_CHANGED`; banner gizlenmez | T02-02, T02-04 |
| WP-03 | `{}`, eksik `action`, `__proto__`, dev mode/source | Reddedilir; güvenli varsayılan; audit | T03-01…T03-07 |
| WP-04 | Tray doğrudan `updateSettings`; PIN yok | Yazma yok; PIN akışı; tek kaynak | T04-01, T04-06 |
| WP-05 | Settings içinde secret/hash; prototype | Public projeksiyonda yok; renderer sırrı okuyamaz | T05-01, T05-04 |
| WP-06 | Tray pause/quit; PIN yok/yanlış | İşlem yok; PIN isteği; audit | T06-01…T06-06 |
| WP-07 | Settings/policy read throw; idle unavailable | `*_UNAVAILABLE`; güç eylemi yok | T07-01…T07-07 |
| WP-08 | Geçersiz rol, `Host: [`, audit viewer | 401/403/400; admin audit; süreç ayakta | T08-01…T08-06 |
| WP-09 | Aynı key farklı body/path; in-flight | 409/422; 4xx cache yok; retry | T09-01…T09-06 |
| WP-10 | Başka agentId; kill-switch persist fail | Kimlik reddi; `KILL_SWITCH_PERSIST_FAILED`; sync durmaz | T10-01…T10-06 |
| WP-11 | Audit throw; PIN cancel | Ayar geri alınır; dil/enerji sunucuda kalmaz | T11-01…T11-07 |
| WP-12 | `durationSeconds:0`, 3601, legacy 0 | 0 red; 3601 red; legacy 1 + audit | T12-01…T12-05 |
| WP-13 | 100k audit, arşiv throw, `rotated_from` tamper | O(1) append; silme yok; `TAMPERED` | T13-01…T13-07 |
| WP-14 | Executing sırasında close; terminal process condition | Kapanış ertelenir; polling durur | T14-01…T14-04 |
| WP-15 | Manuel sonrası recurrence; claim karışması | Otomatik onay sızmaz | T15-01…T15-05 |
| WP-16 | Network/disk/idle throw; eski örnek | İlgili koşul false; diğerleri etkilenmez | T16-01…T16-05 |
| WP-17 | rename throw; quick_check fail; rollback throw | Eski DB/WAL/SHM geri; kanıt korunur | T17-01…T17-06 |
| WP-18 | Boş/bozuk hedef; checksum mismatch; marker crash | Migrasyon durur; kaynak/temp korunur | T18-01…T18-06 |
| WP-19 | İki dosya/klasör koşulu; terminal | Bağımsız örnek; temizlik | T19-01…T19-05 |
| WP-20 | 8 süreç; ölü/canlı PID; taze yarım lock | Tam bir kazanan; canlıya dokunma | T20-01…T20-06 |
| WP-21 | `getActiveState` throw; geçmiş hedef | UI çökmez; tek restore; log | T21-01…T21-05 |
| WP-22 | Worker crash/timeout; 50k giriş | Fail-closed; ana thread lag bütçesi | T22-01…T22-06 |
| WP-23 | Gecikmeli IPC; gizli pencere | Tek uçuş; polling durur | T23-01…T23-05 |
| WP-24 | `getLocale` fail; boş sözlük | Fallback; `substring` yok | T24-01…T24-03 |
| WP-25 | Mini locale fail; `ar` RTL | Türkçe fallback; doğru dir | T25-01…T25-04 |
| WP-26 | Listener birikimi; çift cleanup | Abonelik başına tek callback; üç kanal temiz | T26-01…T26-03 |
| WP-27 | `expectedBytes:null`; farklı model | Indeterminate; NaN yok | T27-01…T27-04 |

**Fault injection araçları (`tests/helpers/fault-injection.mjs`):**

- `failFsRenameOnce`, `failFsWriteOnce`, `failFsUnlinkOnce`.
- `failDbWriteOnce`, `corruptSqliteFile`, `truncateFile`, `simulateWal`.
- `failAuditAppendOnce`, `failSettingsPersistOnce`.
- `simulateWorkerCrash`, `timeoutWorker`, `delayIpc`.
- `fakePowerMonitor({ idle, throwOnIdle })`.
- `fakeStorage({ settings, failOn })`, `makeFakePinGuard()`, `makeWarningHarness()`.

### 12.3 CI ve release gate’leri

**Zorunlu CI işleri (Windows, Node 24.22.1):**

| İş | Komutlar | Gate |
|---|---|---|
| `quality` | `npm ci`, `npm test`, `npm run test:security`, `npm run locales:check`, `npm run verify:traceability`, `npm run release:check` (G0–G2 ve final `1.2.0`) / `npm run release:rc` (G3–G5 RC adayları) | G0–G5 |
| `coverage` | `npm run coverage` + `node scripts/coverage-gate.mjs --gate Gx` (ilgili gate) | G0–G5 |
| `e2e` | `npm run test:e2e` | G1–G5 |
| `packaged` | `npm run pack`, `npm run verify:pack`, `PP_PACKAGED_EXE=... npx playwright test packaged` | G4–G5 |
| `load` | `npm run test:load` (gece + G4/G5 PR) | G4–G5 |
| `security` | `npm audit --audit-level=high`, `npm run audit:licenses`, `npm run sbom` | G0–G5 |
| `evidence` | `npm run verify:traceability`; `docs/audit/V3_EVIDENCE_MATRIX.md` artefakt yolları ve yükleme | G5 |

**Kurallar:**

- Hiçbir adım `continue-on-error`, `|| true` veya `--no-verify` ile geçilemez.
- Coverage, test ve E2E artefaktları 90 gün saklanır; release tag’inde kalıcı kanıt paketi üretilir.
- Korumalı dallar: `main`, `remediation/v1.1.1`, `remediation/v1.2.0`; doğrudan push yok, en az bir reviewer ve tüm zorunlu kontroller.
- Gate geçişi `docs/audit/GATE_LOG.md` içine tarih, commit, CI run ID, onaylayan olarak yazılır.
- Sürüm numarası `package.json` ve `package-lock.json` (kök + `packages[""]`) içinde birlikte güncellenir; gate ile eşleşmeyen sürüm etiketlenmez: G0/G1 `1.1.0` baseline, G2 `1.1.1`, G3 `1.2.0-beta.1`, G4 `1.2.0-rc.1`, G5 denetim adayı `1.2.0-rc.2`, denetim düzeltmesi gerekirse `1.2.0-rc.3`, genel yayın `1.2.0`.
- RC adayları temiz worktree’den `npm run release:rc` (`--strict-git`) ile doğrulanır; G5 denetim adayı `1.2.0-rc.2` dondurulur, genel yayın öncesi sürüm `1.2.0` yapılıp `npm run release:check` tekrar çalıştırılır.
- Release sırası: `npm run release:rc` (aday) / `npm run release:check` (final) → imzalı installer → SHA-256 → SBOM → yükseltme/geri dönüş testi → iki kişi onayı → yayın.
- `1.1.1` yalnız sınırlı güvenlik kanalı; `1.2.0-beta.1` yalnız beta; `1.2.0-rc.1`/`1.2.0-rc.2`/`1.2.0-rc.3` yalnız RC; genel `1.2.0` G5 + bağımsız denetim.

### 12.4 Windows manuel test matrisi

| ID | Ortam | Senaryo | Beklenen |
|---|---|---|---|
| M-01 | Windows 10 22H2, standart kullanıcı | Kurulum, ilk açılış, PIN oluşturma, görev oluşturma/iptal | Çökme yok; PIN ve audit doğru |
| M-02 | Windows 11 23H2, yönetici | Tray pause/quit, PIN yanlış/doğru, görev yürütme | PIN kapısı; sonuç/history |
| M-03 | Windows 11 24H2, %150/%200 DPI, çoklu monitör | Ana pencere, mini pencere, uyarı banner’ı | Taşma yok; mini doğru konum |
| M-04 | Windows 11, uyku/uyanma | Aktif timer + uyku → uyanma | Sayaç senkron; erken/çift tetikleme yok |
| M-05 | Windows 10/11, kilit/oturum kapatma | Kilit sırasında uyarı/timer | Güvenli bekleme; kullanıcı dönüşünde doğru |
| M-06 | Windows 11, Arapça RTL | Ana pencere + mini tooltip/aria | `dir=rtl`; metin doğru |
| M-07 | Windows 11, 17 dil geçişi | Dil değiştir; yeniden aç | UI/tray/mini aynı dil; fallback çalışır |
| M-08 | Windows 11 + antivirüs/Controlled Folder Access | DB lock, restore, packaged worker | Anlaşılır hata; veri kaybı yok |
| M-09 | Windows 11, pil/çevrimdışı | Metrikler, API, uzak görev | Stale fail-closed; çökme yok |
| M-10 | Windows 11, erişilebilirlik | Klavye-only, ekran okuyucu, yüksek kontrast | Tooltip/aria; odak görünür |
| M-11 | Windows 10/11 | `1.1.0 → 1.2.0` yükseltme; `1.2.0 → 1.1.1` geri dönüş | Şema/audit korunur; görevler açılır |
| M-12 | Windows 11, çökme simülasyonu | Executing sırasında süreç öldür; yeniden aç | Yarıda kalan görev `FAILED`; veri tutarlı |

> Güç eylemleri (shutdown/restart/sleep/hibernate) manuel matriste yalnız izole VM’de veya test executor mock’u ile denenir. Gerçek donanımda yıkıcı test yapılmaz.

### 12.5 Bağımsız yeniden denetim protokolü

**Amaç:** Uygulayıcının kendi kanıtını onaylamasını engellemek; 36 bulgunun gerçekten kapandığını bağımsız olarak doğrulamak.

1. **Donma ve kapsam.**
   - `1.2.0-rc.2` (RC.1 + P4) tag’i ve imzalı artefakt dondurulur; denetim bulgusu düzeltme gerektirirse `1.2.0-rc.3` üretilir ve yeniden dondurulur. Denetim sırasında yeni commit yok.
   - Denetçiye `docs/audit/2026-10-26/QA_AUDIT_REPORT.md`, `docs/planning/REMEDIATION_PLAN_WBS_V3.md`, `docs/audit/V3_EVIDENCE_MATRIX.md`, CI artefaktları, SBOM ve kaynak diff’i verilir.
   - Denetçi uygulayıcıdan bağımsızdır; çıkar çatışması beyanı imzalar.
2. **Statik inceleme.**
   - 36 bulgunun her biri için kod yolu, düzeltme ve test eşleşmesi; özellikle PIN, IPC, audit, API, DB, restore ve worker.
   - “Test var ama üretim kodu eski” veya “iki doğruluk kaynağı” kalıntısı aranır.
3. **Dinamik doğrulama.**
   - Temiz clone + `npm ci` + tüm zorunlu komutlar; CI’dan bağımsız çalıştırılır.
   - Tüm Kritik/Yüksek bulgular yeniden üretilir; Orta/Düşük’ün en az %20’si rastgele örneklenir.
   - Her örnek için negatif kontrol: düzeltme geri alınınca test kırmızı mı?
   - Windows manuel matrisinden en az M-01, M-02, M-03, M-04, M-06, M-08, M-11 tekrar edilir.
4. **Paket ve tedarik zinciri.**
   - İmza, hash, SBOM, lisans, bağımlılık CVE’leri; installer’ın `asar` bütünlüğü; worker’ın paket içinde çalışması.
5. **Raporlama.**
   - Bulgu başına `KAPALI / KISMİ / AÇIK`; kanıt referansı; yeni bulgu kimliği (N-01…).
   - Yeni Kritik/Yüksek varsa `G5` kapanmaz; yeni WP ve düzeltme döngüsü açılır.
   - Yeniden denetimde ortaya çıkan yeni Orta/Düşük bulgular için yazılı risk kabulü veya düzeltme; kabul yalnız ürün sahibi + güvenlik lideri imzasıyla. Orijinal 36 bulgunun hiçbiri kabulle kapatılamaz.
6. **Çıkış kriteri.**
   - 36/36 `KAPALI`; yeni Kritik/Yüksek yok; tüm gate komutları yeşil; imzalı rapor.
   - Bağımsız denetçi, ürün sahibi, güvenlik lideri ve QA lideri `1.2.0` yayın kararını imzalar.

### 12.6 Nihai tutarlılık kontrolü

- [ ] `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` başlıklarından **36** bulgu; matriste **36** satır; K=4, Y=11, O=13, D=8.
- [ ] Her bulgu tam **bir** kez eşlenmiş; çift eşleme veya eksik yok.
- [ ] `WP-00`…`WP-27` toplam **28** iş paketi; her biri bulgu, bağımlılık, çıktı, risk, test, kabul, geri alma ve DoD içeriyor.
- [ ] `G0`…`G5` kapıları ve `1.1.0` baseline / `1.1.1` / `1.2.0-beta.1` / `1.2.0-rc.1` / `1.2.0-rc.2` / `1.2.0-rc.3` / `1.2.0` sürüm eşlemesi tutarlı.
- [ ] P0–P4 bağımlılık sırası §4.2 ve §6 ile uyumlu; aynı dosyaya dokunan WP’ler sıralı.
- [ ] `docs/planning/archive/REMEDIATION_PLAN_WBS.md` (eski 34 bulguluk plan) değiştirilmemiş; bu doküman onun yerine geçiyor.
- [ ] Uygulama kaynak dosyaları bu plan hazırlanırken değiştirilmemiş; yalnız plan/denetim dokümanları eklenmiş.
- [ ] Dokümanda geçici devam işareti kalmamış.
- [ ] Tüm test ID’leri matrisle uyumlu; her test ID’si tanımlı ve hiçbir referans tanımsız ID’ye işaret etmiyor.
- [ ] `npm run verify:traceability`, `npm run locales:check`, `npm run verify:pack` release öncesi zorunlu.
- [ ] Yeni her `t('...')` anahtarı ilgili 17 locale dosyasına eklenmiş: renderer anahtarları `src/renderer/locales/*.json`, main anahtarları `npm run build:locales` ile üretilen `src/main/locales/*.server.json`; `tr`/`en` gerçek çeviri, diğer 15 dilde İngilizce fallback; placeholder parity ve `npm run locales:check` yeşil.
- [ ] Bu plan bir uygulama değil, uygulama sözleşmesidir; her WP’nin kodu ve kanıtı ayrı PR’da teslim edilir.

### 12.7 Kaynaklar, varsayımlar ve sınırlar

**Birincil kaynaklar (26 Ekim 2026 itibarıyla erişildi):**

| ID | Kaynak | Kullanıldığı kararlar |
|---|---|---|
| R1 | [Electron Security Checklist](https://electronjs.org/docs/latest/tutorial/security) | D1, D9, D26 |
| R2 | [OWASP ASVS 5.0 — Session Management](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x16-V7-Session-Management.md) | D2, D5, D9, D10, D11, D13 |
| R3 | [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) | D2, D3 |
| R4 | [NIST SP 800-63B — Throttling](https://pages.nist.gov/800-63-4/sp800-63b.html) | D2, D3 |
| R5 | [CWE-367 — TOCTOU](https://cwe.mitre.org/data/definitions/367.html) | D4 |
| R6 | [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) | D5, D6, D14 |
| R7 | [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) | D11, D15, D17, D21 |
| R8 | [IETF Idempotency-Key Header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-04) | D16 |
| R9 | [SQLite WAL](https://sqlite.org/wal.html) | D19 |
| R10 | [SQLite Online Backup API](https://sqlite.org/backup.html) | D19, D20 |
| R11 | [SQLite Atomic Commit](https://sqlite.org/atomiccommit.html) | D17, D19, D21 |
| R12 | [SQLite PRAGMA quick_check](https://sqlite.org/pragma.html#pragma_quick_check) | D20 |
| R13 | [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html) | D23 |
| R14 | [Node.js — Don’t Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) | D23 |
| R15 | [Electron powerMonitor](https://electronjs.org/docs/latest/api/power-monitor) | D12 |
| R16 | [Node.js fs — File System Flags](https://nodejs.org/api/fs.html#file-system-flags) | D22 |

**İç kaynaklar:**

- `docs/audit/2026-10-26/QA_AUDIT_REPORT.md` — 36 bulgu, satır referansları, kök nedenler.
- `tests/BASELINE.md` — 67 test dosyası / 649 test, coverage %78,41 ve paket baseline’ı.
- `package-lock.json`, `vitest.config.js`, `.github/workflows/ci.yml` — sürüm ve CI gerçeği.
- `docs/planning/archive/REMEDIATION_PLAN_WBS.md` — eski 34 bulguluk plan; bu doküman onu geçersiz kılar, silmez.

**Varsayımlar ve sınırlar:**

- Ürün tek kullanıcılı Windows masaüstü ajanı; bulut çok kiracılı değil. Bu nedenle bazı ASVS kontrolleri “yerel kullanıcı + PIN” modeline uyarlanmıştır.
- Kaynak satır numaraları denetim baseline’ına aittir; uygulama sırasında değişebilir. Kod referansları dosya ve davranış üzerinden doğrulanır.
- Bu plan hazırlanırken uygulama kodu değiştirilmedi; testlerin bir kısmı henüz kırmızı iskelet değildir. G0’da `it.fails` iskeletleri oluşturulacaktır.
- `1.1.1` sınırlı yama, P2/P3 Yüksek bulguları açıkken genel kullanım için değildir. Risk kabulü olmadan dağıtım yapılmaz.
- Üçüncü taraf model/STT indirmeleri, Windows sürümleri ve antivirüs davranışı dış ortama bağlıdır; manuel matris ve paketli E2E ile doğrulanır.

---

## 13. Plan Durumu

- **Durum:** Tamamlandı; uygulama için hazır.
- **Kapsam:** 36/36 bulgu, 28 iş paketi, 6 kapı, 4 sürüm hattı (`1.1.1`, `1.2.0-beta.1`, `1.2.0-rc.x`, `1.2.0`).
- **Sonraki adım:** G0/WP-00 onayı ve baseline dondurma; ardından WP-01–WP-04.
- **Değişiklik yasağı:** Bu doküman hazırlanırken `src/**`, `main.js`, `preload.js` ve uygulama yapılandırması değiştirilmedi. Uygulama değişiklikleri yalnız onaylı WP PR’larında yapılır.

