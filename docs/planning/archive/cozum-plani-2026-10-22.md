# Power Pilot — Denetim Bulguları İçin Uçtan Uca Çözüm Planı

**Sürüm:** 1.0  
**Tarih:** 22 Ekim 2026  
**Kaynak denetim:** [`docs/denetim-raporu-2026-10-22.md`](../../audit/2026-10-22/denetim-raporu-2026-10-22.md)  
**Hedef sürüm:** 1.1.0  
**Kapsam:** Electron 43.4.0 + vanilla JavaScript masaüstü uygulaması, yerel API, konsol sunucusu ve headless ajan  
**Plan tipi:** Uygulanabilir WBS; her iş kalemi için bağımlılık, çıktı, risk, test ve kabul kriteri

---

## 0. Yönetici Özeti

Denetim raporundaki **49 bulgunun tamamı** bu planda iş paketlerine bağlanmıştır: 6 Kritik, 13 Yüksek, 18 Orta, 12 Düşük. Ayrıca raporun performans bölümündeki **P-01–P-08**, veri bütünlüğü bölümündeki **D-01–D-10** ve temizlik bölümündeki **C-01–C-08** kalemleri aynı izlenebilirlik matrisinde kapatılır.

Plan **16 iş paketi (WP-00–WP-15)**, **5 faz** ve **5 zorunlu kalite kapısı**ndan oluşur. Kritik yol:

```text
WP-00 → WP-01 → WP-02 → WP-03 → WP-11 → WP-15
                 └────→ WP-04
WP-05 / WP-06 / WP-07 → WP-08 → WP-10 → WP-14
```

İki geliştiriciyle toplam **8–10 takvim haftası**, tek geliştiriciyle **14–16 hafta** öngörülmüştür. Faz 0’daki K-03, K-04, K-05 ve K-06 düzeltmeleri ilk 72 saat içinde ayrı bir yama sürümü olarak yayınlanabilir; bunlar birbirinden bağımsızdır ve veri migrasyonu gerektirmez. Ancak `app://`/ASAR, native modül paketleme ve headless `safeStorage` spike’ları tamamlanmadan WP-01, WP-10, WP-11 ve WP-15 başlamaz.

**Yayın ilkesi:** Bu plan “önce hızlı yama, sonra mimari düzeltme” sırasını izler; ancak güvenlik açısından geri dönüşü olmayan hiçbir adım (imzasız emir kabulü, düz HTTP, `exec` ile kabuk çalıştırma) ara sürümde açık bırakılmaz. Eski davranışı geri getiren runtime anahtarı yoktur; geri alma yalnızca yedek veri ve önceki ikili dosya ile yapılır.

### 0.1. Yayın kapıları

| Kapı | Ne zaman | Zorunlu koşul |
|---|---|---|
| G0 — Baseline | Faz 0 sonu | WP-00 ve S1–S4 spike’ları tamam; Faz 0’daki K-03/K-04/K-05/K-06 ve H-10 regresyon testleri yeşil |
| G1 — Kritik kapanış | Faz 1 sonu | WP-01, WP-02, WP-04 tamam; bu WP’lerin kapattığı K-01/K-02, H-01/H-02/H-03/H-05/H-06 testleri yeşil; TLS/mTLS entegrasyonu, sertifika iptali ve sızma testi tekrarı temiz |
| G2 — Davranış kapanışı | Faz 2 sonu | WP-03, WP-08, WP-09, WP-10 tamam; bu WP’lerin kapattığı H-04/H-07/H-08/H-09/H-11/H-13 ve M-06/M-08/M-11/M-12/M-14/M-16 testleri yeşil; E2E ve kaos yeşil |
| G3 — Veri/ölçek | Faz 3 sonu | WP-11, WP-12, WP-13 tamam; H-12, M-02–M-05/M-07/M-13/M-18, D-01–D-10 ve P-01–P-05/P-07 testleri yeşil; SQLite migrasyonu, audit checkpoint, ağır DB işlerinin utilityProcess’te çalışması, 100 ajan yük testi ve geri alma provası başarılı |
| G4 — Yayın | Faz 4 sonu | WP-14, WP-15 tamam; M-17, P-06, P-08 ve kalan tüm testler yeşil; imza, fuses, ASAR bütünlüğü, SBOM/provenance, NSIS kurulum ve 24 saat soak başarılı |

---

## 1. Kapsam, Yöntem ve Doğrulanmış Baseline

### 1.1. Kapsam

Bu plan yalnızca aşağıdaki dosya ve dizinlerdeki bulguları kapatır:

- `main.js`, `preload.js`
- `src/index.html`, `src/mini.html`
- `src/main/**`
- `src/console/**`
- `src/agent/**`
- `src/renderer/i18n.js`

React, Next.js, SSR, hydration, RSC ve ORM’e özgü kontroller kapsam dışıdır; projede React/Next.js yoktur. Plan, yeni bir web framework’ü veya bulut servisi eklemez.

### 1.2. Doğrulanmış çalışma zamanı

| Bileşen | Doğrulanmış değer | Kaynak |
|---|---|---|
| Electron | 43.4.0 | `package.json`, denetim raporu |
| Chromium | 150.0.7871.46 | Electron 43 sürüm notları |
| Node.js (Electron içinde) | 24.17.0 | Electron 43 sürüm notları |
| V8 | 15.0 | Electron 43 sürüm notları |
| Geliştirme/CI Node.js | 24.18.1 | `package.json` `engines` |
| İşletim sistemi | Windows 10 22H2 ve Windows 11 23H2+ x64 | Ürün hedefi |
| Paketleme | electron-builder 26.15.3, NSIS | `package.json` |
| Test | Vitest 3.2.4, Playwright 1.64.1 | `package.json` |

Electron 43.4.0’ın gömülü Node sürümü 24.17.0’dır; `package.json` ise geliştirme için `>=24.18.1` ister. Bu fark bilinçli kabul edilir: CI ve yerel geliştirme 24.18.1 kullanır, üretim davranışı Electron içindeki 24.17.0’a karşı test edilir. Yeni eklenecek native bağımlılıkların Electron ABI’sinde değil, N-API üzerinden çalışması zorunludur.

### 1.3. Öncelik ve tanımlar

| Kısaltma | Anlam |
|---|---|
| K / H / M / L | Kritik / Yüksek / Orta / Düşük bulgu |
| P | Performans bulgusu |
| D | Veri bütünlüğü bulgusu |
| C | Temizlik/ölü kod bulgusu |
| WP | İş paketi; bağımsız olarak yayınlanabilen dikey dilim |
| T-xxx | Test kimliği |
| Fail-closed | Ölçüm/doğrulama yapılamıyorsa güç eylemini reddetme |
| At-least-once | Emrin en az bir kez teslim edilmesi; ajan tarafında nonce ile idempotent icra |
| Kabul kriteri | Otomatik test veya ölçülebilir gözlemle doğrulanan sonuç |

### 1.4. Planın sınırları

- Bu belge bir uygulama planıdır; bu adımda üretim kodu değiştirilmemiştir.
- Denetim statik ve akış analizine dayanır; dinamik sızma testi yapılmamıştır. Bu plan, eksik dinamik doğrulamayı WP-15’te zorunlu hale getirir.
- Her WP ayrı bir pull request’tir. Bir WP’nin kabul kriteri sağlanmadan sonraki WP’nin güvenlik davranışı varsayılmaz.
- Veri migrasyonu geri alınabilir; güvenlik davranışı geri alınamaz. Önceki ikiliye dönüş yalnızca veri yedeğiyle birlikte yapılır.

### 1.5. Mevcut yapıdan hedef yapıya eşleme

| Mevcut dosya/alan | Hedef | Ana değişiklik |
|---|---|---|
| `main.js` | `main.js` + `src/main/app/bootstrap.js`, `src/main/ipc/guard.js` | IPC sahibi doğrulama, `app://`, fuses, tek başlatma |
| `src/index.html` içindeki inline JS/CSS | `src/renderer/app.js`, `src/renderer/views/*.js`, `src/renderer/styles.css` | CSP uyumlu modüller, DOM API’leri |
| `src/mini.html` | `src/renderer/mini.js` | Aynı origin, ayrı küçük pencere |
| `src/main/services/SignedOrderService.js` | `src/main/order/OrderSchema.js`, `OrderV2.js`, `Nonce.js`, `src/main/security/safeCompare.js` | `params` imzası, RFC 8785, replay, zaman |
| `src/main/services/LocalApiService.js` | `LocalApiService.js` + `src/main/security/TlsConfig.js` | HTTPS/mTLS, limitler, idempotency |
| `src/main/services/StorageService.js` | `src/main/storage/Database.js`, `schema.sql`, `MigrateV2.js` | JSON → SQLite v3, audit HMAC |
| `src/main/services/TaskSchedulerBridge.js` | Aynı dosya + `buildCreateArgs()` | `execFile`, sunucu ID’si, `/tr` kaçışı |
| `src/console/ConsoleServer.js` | `ConsoleServer.js` + `ConsoleStore.js` | HTTPS, SQLite, makbuzlu kuyruk |
| `src/agent/headless.js` | `PowerPilot.exe --headless --user-data-dir=...` | `safeStorage`, servis yaşam döngüsü |
| `src/renderer/i18n.js` | `src/renderer/locales/<lang>.json`, `src/main/locales/<lang>.server.json` | Lazy load, `vm` kaldırma |

Bu tablo uygulama sırasında dosya sahipliğini netleştirir; mevcut dosya adları korunur, yeni dosyalar yalnızca belirtilen sorumluluğu devralır.

---

## 2. Hedef Mimari Kararları (ADR)

Bu bölümdeki kararlar, denetim raporundaki düzeltme önerilerini birbirleriyle çelişmeyecek tek bir tasarıma indirger. Her ADR’nin kaynağı Bölüm 10’da listelenmiştir.

### ADR-01 — Emir protokolü v2: `params` dahil RFC 8785 imzası

**Karar:** Konsol ile ajan arasındaki tüm emirler sürüm 2 zarfıyla taşınır. İmza, aşağıdaki nesnenin RFC 8785 kanonik JSON’u üzerinden Ed25519 ile üretilir. `params` alanı imza kapsamındadır; bilinmeyen üst düzey alanlar reddedilir.

```json
{
  "v": 2,
  "action": "apply-policy",
  "params": { "policy": { "action": "shutdown", "targetTime": 1790000000000 } },
  "targets": ["agent_7f3c9a2e4b1d8065"],
  "nonce": "9f2c1d7e6a4b8c0d1e2f3a4b",
  "issuedAt": 1789999400000,
  "expiresAt": 1789999999999,
  "issuer": "console",
  "keyId": "console-2026-10"
}
```

**Zarf:** `{ "order": { ... }, "sig": "<base64url>" }`  
**İmza verisi:** `canonicalize(order)` çıktısının UTF-8 baytları  
**Doğrulama sırası:** şema → sürüm → yayıncı → hedef → zaman → nonce → `keyId` → imza → eylem parametreleri

**Sınırlar:** `params` en fazla 64 KiB, derinlik 8, dizi 1000 eleman, string 8192 karakter; `NaN`/`Infinity` yasak; `__proto__`, `constructor`, `prototype` anahtarları yasak. `targets` tam olarak bir ajan kimliği içerir; çoklu hedef, konsol tarafından ajan başına ayrı imzalı emre bölünür. Emir TTL’si 10 dakikadır; `expiresAt` zorunludur ve `issuedAt + 10 dk`’dan büyük olamaz. Bu, bir ajanın başka ajana ait emri yeniden oynatmasını engeller.

**Gerekçe:** Mevcut `canonical()` yalnızca altı alanı imzalıyor; `params` imza dışında kaldığı için araya giren bir saldırgan politikayı değiştirebiliyor (K-01). RFC 8785, sayı ve string serileştirmesini sabitler; `JSON.stringify`’ın anahtar sırasına bağımlılığını ortadan kaldırır.

### ADR-02 — Kanonikleştirme için `canonicalize@5.1.0`

**Karar:** El yazımı `stable()` veya `JSON.stringify` kullanılmaz. RFC 8785’in referans uygulamaları arasında gösterilen `canonicalize` paketinin **5.1.0** sürümü kullanılır. Paket ESM-only olduğu için süreç başlangıcında bir kez `await import('canonicalize')` ile yüklenir; `canonicalize` fonksiyonu modül kapsamında tutulur ve `sign()`/`verify()` senkron kalır. Yükleme tamamlanmadan imza işlemi `CANONICALIZER_NOT_READY` ile reddedilir.

**Gerekçe:** RFC 8785 sayı biçimi, negatif sıfır, `NaN` reddi ve UTF-16 kod birimi sıralaması gibi ayrıntıları tanımlar. Kendi yazdığımız sıralayıcı, özellikle sayı ve Unicode kaçışlarında iki taraf arasında uyumsuzluk üretir. `canonicalize` 5.1.0 sıfır bağımlılıklıdır, Node >=22 ister ve RFC’nin JavaScript referansı olarak listelenir. Electron 43’ün Node 24.17.0 çalışma zamanı bu koşulu karşılar.

### ADR-03 — Depolama: `better-sqlite3@13.0.3`, WAL, tek yazıcı

**Karar:** Uygulama verisi `powerpilot.db`, konsol verisi `console.db` olur. Her ikisi de `better-sqlite3@13.0.3` ve aşağıdaki PRAGMA’larla açılır:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA journal_size_limit = 67108864;
```

**Neden `node:sqlite` değil:** Node 24.17 dokümantasyonunda `node:sqlite` hâlâ **Release Candidate (Stability 1.2)** olarak işaretlidir. Üretim verisi için RC API’ye bağımlılık kabul edilmez. `better-sqlite3` 13.0.3 N-API tabanlıdır, `win32-x64` ön-derlenmiş ikilisi vardır ve mevcut `electron-rebuild` hattıyla uyumludur.

**Tek yazıcı:** GUI ve headless ajan aynı `userData` dizinini aynı anda kullanamaz. `StorageService` açılışta `storage.lock` dosyasını `wx` ile oluşturur; içine `{pid, startedAt, app}` yazar. Kilit varsa ve PID yaşıyorsa ikinci süreç açılmaz; PID ölüyse kilit 30 saniye sonra devralınır. Bu, iki sürecin aynı görevi iki kez çalıştırmasını engeller. Yazma transaction’ları `BEGIN IMMEDIATE` ile açılır; böylece deferred transaction’ın sonradan kilit yükseltmesi `SQLITE_BUSY` üretmez.

**Main thread sınırı:** `better-sqlite3` senkrondur. Normal görev/ayar sorguları kısa tutulur; migrasyon, `VACUUM INTO`, 10.000 kayıtlık dışa aktarma ve yedekleme **utilityProcess** içinde ayrı DB bağlantısıyla çalışır. Main thread yalnızca kısa okuma/yazma yapar; ana süreçte 50 ms’den uzun DB işlemi kabul edilmez.

**WAL dayanıklılığı:** `synchronous=FULL`, WAL commit’inde fsync yapar; güç kesintisinde son işlem kaybı yerine dayanıklılık tercih edilir. `NORMAL` yalnızca checkpoint’te dayanıklıdır ve bu ürün için yeterli değildir.

### ADR-04 — Sırlar: `safeStorage` async + Argon2id

**Karar:** Sırlar (`localApiKeyPem`, `consoleAgentKey`, webhook HMAC/bearer, PFX parolası, `auditHmacKey`, `backupAesKey`) `powerpilot_data.json` içinde tutulmaz. Ayrı `secrets.v1.json` dosyasında, her değer `safeStorage.encryptStringAsync()` ile şifrelenmiş base64 olarak saklanır. `safeStorage.decryptStringAsync()` `{ result, shouldReEncrypt }` döndürür; `result` kullanılır, `shouldReEncrypt=true` ise yeni şifreli değer atomik olarak yeniden yazılır. `await safeStorage.isAsyncEncryptionAvailable()` false ise uygulama **açılmaz**; düz metin fallback yoktur.

**PIN:** `cancelPinHash`, Argon2id PHC string’i olarak saklanır. Parametreler: `m=19456 KiB`, `t=2`, `p=1`, `outputLen=32`, 16 baytlık rastgele salt. Uygulama `@node-rs/argon2@2.2.2` kullanır; N-API olduğu için Electron ABI yeniden derlemesi gerekmez. 5 hatalı denemeden sonra 15 dakika kilit uygulanır.

**Tehdit modeli:** Windows DPAPI, aynı kullanıcı hesabıyla çalışan başka süreçlere karşı **koruma sağlamaz**; Electron dokümantasyonu bunu açıkça belirtir. Bu kontrolün sağladığı: diskte/backupta düz metin olmaması, başka kullanıcıların okuyamaması ve çevrimdışı kopyanın çözülememesi. Aynı kullanıcıda çalışan zararlı süreç için ayrıca EDR/AppLocker gerekir; bu planın kapsamı dışındadır ve kabul kriteri bunu iddia etmez.

**Konsol imza anahtarı:** `ConsoleServer` Ed25519 özel anahtarını `console-store.json` içinde tutmaz. Anahtar `console-signing-key.pem` dosyasında, yalnızca servis hesabının erişebildiği ACL ve Windows EFS ile korunur. `console-store.json` yalnızca `keyId` ve açık anahtarı taşır. Bu, H-02’nin konsol tarafındaki eşdeğeridir ve K-01 imza güvenini korur.

**Headless:** `src/agent/headless.js` doğrudan `node` ile çalıştırılmaz. Windows servisi `PowerPilot.exe --headless --user-data-dir=<dir>` olarak çalışır; böylece `app.whenReady()` ve `safeStorage` kullanılabilir, `StorageService`’ın `electron.app` bağımlılığı da gerçekten karşılanır.

### ADR-05 — Taşıma güvenliği: konsol HTTPS, LAN’da TLS + mTLS

**Karar:** Konsol sunucusu yalnızca HTTPS dinler. Düz HTTP yalnızca `127.0.0.1`/`::1` ve `PP_ALLOW_INSECURE_CONSOLE=1` açıkça verildiğinde geliştirme içindir; `0.0.0.0` ile asla birleşmez. Yerel API’de `lanModeEnabled=true` ise `localApiTlsEnabled=true`, geçerli sertifika/anahtar ve mTLS zorunludur. Loopback’te TLS yoksa HTTP kabul edilir; bu durumda anahtar yalnızca yerel süreçlerce görülebilir.

| Mod | Bind | TLS | İstemci sertifikası | API anahtarı |
|---|---|---|---|---|
| Yerel varsayılan | `127.0.0.1` | Kapalı | Yok | Zorunlu |
| Yerel TLS | `127.0.0.1` | TLS 1.2+ | Yok | Zorunlu |
| LAN | `0.0.0.0` / `::` | Zorunlu | Zorunlu (mTLS) | Zorunlu |
| Konsol | `0.0.0.0` / `::` | Zorunlu | Yok (ajan API anahtarı) | Zorunlu |

**TLS ayarları:** `minVersion: 'TLSv1.2'`, `maxVersion: 'TLSv1.3'`, `ca` zorunlu, `sessionTimeout: 0` (TLS 1.3 oturum yeniden kullanımında istemci sertifikasının atlanmasını engellemek için). LAN/mTLS modunda `requestCert: true`, `rejectUnauthorized: true`; yerel TLS-only modunda `requestCert: false`. İstemci parmak izi allowlist’i mTLS modunda zorunludur ve boş olamaz.

**Sertifika ömrü ve iptal:** Konsol sunucu sertifikası **90 gün**, istemci sertifikası **30 gün** geçerlidir; yenileme 30/7 gün önce otomatik yapılır. İptal, `localApiAllowedClientFingerprints` listesinden parmak izinin çıkarılmasıyla anında etkili olur; kısa ömür bu kontrolün bypass edilme penceresini sınırlar. Bu dağıtımda CRL/OCSP zorunlu değildir; kurumsal politika gerektirirse aynı allowlist mekanizması korunur.

### ADR-06 — Renderer: `app://` özel protokolü + katı CSP

**Karar:** `file://` yerine `app://powerpilot/` kullanılır. `protocol.registerSchemesAsPrivileged` ile `standard`, `secure`, `supportFetchAPI` açılır; `protocol.handle` yalnızca `src/` kökü altındaki dosyaları servis eder ve path traversal’ı reddeder.

CSP:

```text
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'none';
media-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
worker-src 'none';
```

**Gerekçe:** Mevcut HTML’de 288 KB’lık gömülü script, gömülü Tailwind yapılandırması ve `<style>` bloğu vardır. `'unsafe-inline'` ile CSP eklemek XSS’i engellemez. Bu nedenle script’ler `src/renderer/*.js` modüllerine, stiller derlenmiş `styles.css`’e taşınır; Tailwind runtime yerine `tailwindcss@3.4.19` ile build-time derlenir. `innerHTML` lavaboları DOM API’lerine çevrilir.

**Ek savunma:** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`, `devTools: !app.isPackaged`; `window.open` reddedilir; `will-navigate` yalnızca `app://powerpilot/`’e izin verir; dış bağlantılar HTTPS allowlist ile `shell.openExternal`’a gider.

### ADR-07 — Güvenlik motoru fail-closed

**Karar:** `SafetyPolicyEngine` bir ölçümü yapamıyorsa sonuç `allowed: false` olur. “Bilinmeyen” ile “güvenli” ayrılır. `PROCESS_LIST_UNAVAILABLE`, `POWER_REQUESTS_UNAVAILABLE`, `FULLSCREEN_STATE_UNAVAILABLE` kodları audit log’a yazılır ve kullanıcıya gerekçe gösterilir. Varsayılan olarak kullanıcı bypass’ı yoktur; yalnızca imzalı konsol emri veya PIN’li yerel yönetici işlemiyle tek seferlik istisna tanımlanabilir.

**Gerekçe:** H-11’de `ps-list`/PowerShell hatası boş liste döndürüyor ve motor “korunan uygulama yok” varsayımına düşüyor. Fail-open, güvenlik özelliğinin tam da koruması gereken anda devre dışı kalmasıdır.

### ADR-08 — Zamanlayıcı: `execFile` + sunucu tarafı kimlik

**Karar:** `schtasks` yalnızca `execFile('schtasks.exe', args, { windowsHide: true, timeout: 15000 })` ile çağrılır. Kabuk (`exec`, `shell: true`) yoktur. Görev kimliği istemciden kabul edilmez; sunucu `task_<timestamp>_<random>` üretir ve `^[A-Za-z0-9_-]{1,64}$` doğrular. `/tr` değeri `"<exePath>" --run-task=<safeId>` biçimindedir; `exePath` `process.execPath`’ten gelir.

**Gerekçe:** K-06’da `task.id` ham olarak `/tr` içine giriyor ve `exec` kabuk yorumlaması yapıyor. `execFile` argüman dizisi kabuğu tamamen devre dışı bırakır; sunucu tarafı kimlik üretimi ise ikinci savunma katmanıdır.

### ADR-09 — Koşullu görevlerde `targetTime` yok, `notBefore` var

**Karar:** `conditionGroup` içeren görevler `monitoring` durumunda kalır. Erteleme `trigger.notBefore` alanına yazılır; `targetTime` yalnızca koşulsuz zamanlayıcı görevlerinde kullanılır. `TaskSchedulerBridge` yalnızca koşulsuz `scheduled` görevleri Windows Görev Zamanlayıcı’ya yazar. Koşul değerlendirmesi her zaman çalışır.

**Gerekçe:** K-04’te koşullu görev `SCHEDULED`’a çevriliyor ve `evaluateTasks` koşulu atlıyor; ayrıca `TaskSchedulerBridge` aynı görevi Windows’a yazıp uygulama kapalıyken bile çalıştırabiliyor. `notBefore` ayrımı bu iki yolu da kapatır.

### ADR-10 — i18n: dile göre JSON, tek aktif sözlük

**Karar:** 17 dil için `src/renderer/locales/<lang>.json` ve ana süreç için yalnızca kullanılan anahtarları içeren `src/main/locales/<lang>.server.json` üretilir. Renderer aktif dili IPC ile alır; ana süreç `vm.runInContext` kullanmaz. İlk açılışta yalnızca aktif dil dosyası okunur; dil değişiminde önceki sözlük bellekten bırakılır.

**Gerekçe:** M-17/P-06’da 686–749 KB’lık sözlük hem renderer’da hem ana süreçte ayrıştırılıyor. JSON + lazy load, açılış süresi ve RAM maliyetini düşürür; `vm` güvenlik sınırı olmadığı için kaldırılması ayrıca doğrudur.

### ADR-11 — Webhook: HTTPS, SSRF savunması, DNS pinning

**Karar:** Webhook yalnızca `https:` ve 443/8443 portlarına gider. URL’de kullanıcı adı/parola olamaz. Host DNS ile çözülür; `ipaddr.js` ile yalnızca `unicast` aralığı kabul edilir; loopback, private, link-local, CGNAT, multicast, unspecified ve IPv4-mapped özel adresler reddedilir. `https.request`’e özel `lookup` verilerek bağlantı, doğrulanmış IP’ye sabitlenir; SNI ve `Host` başlığı orijinal host olarak kalır. Yönlendirme izlenmez. Zaman aşımı 15 saniye, en fazla 3 deneme, üstel geri çekilme ve `Idempotency-Key` vardır.

**Gerekçe:** M-04’te URL yalnızca şema açısından kontrol ediliyor; `127.0.0.1` ve `169.254.169.254` kabul ediliyor. Ayrıca `timeout` ve `error` olayları iki kez retry başlatıyor. DNS pinning, çözümleme ile bağlantı arasındaki rebinding yarışını kapatır.

### ADR-12 — Saat kayması, gelecek zaman ve monotonik sayaç

**Karar:** Emirde `issuedAt` gelecekte en fazla **120 saniye** olabilir; `issuedAt` 120 saniyeden fazla ileriyse `CLOCK_SKEW` ile reddedilir. `expiresAt`, `issuedAt + 10 dakika`’dan büyük olamaz. Ajan ve konsol NTP ile senkronize edilir; etki alanındaki makinelerde `w32time` zorunludur. Kullanıcıya saat farkı 2 dakikayı aşarsa uyarı, 5 dakikayı aşarsa yıkıcı eylem engeli gösterilir.

**Sayaç:** Renderer’da hedefe kalan süre duvar saati (`Date.now()`) ile hesaplanır; geçen süre/uyku ölçümü `performance.now()` tabanlı monotonik sayaçla yapılır. Uyku/uyanma sonrası hedef geçmişse “süre doldu, sonuç bekleniyor” durumuna geçilir; negatif sayaç gösterilmez. Bu, T-REN-10 ve T-ORD-09 ile doğrulanır.

### ADR-13 — Audit kanıtı: HMAC zinciri + günlük checkpoint

**Karar:** `audit_log` her satırda `seq`, `prev_hmac`, `record_hmac` taşır. `record_hmac = HMAC-SHA256(auditHmacKey, canonical(record))`; burada `record`, `record_hmac` alanı hariç tutulmuş kayıttır. Anahtar SecretStore’dadır ve dosyaya düz metin yazılmaz. Günlük olarak `audit-checkpoints/YYYY-MM-DD.json` dosyasına son `seq`, son HMAC ve kayıt sayısı yazılır; checkpoint ayrı ACL+EFS dosyasına ve Windows Event Log’a özet olarak düşülür. Event Log kaynağı installer tarafından bir kez oluşturulur; yazma başarısızsa checkpoint yine zorunludur ve eksiklik tamper sayılır. İki kaynaktan biri eksik veya HMAC uyuşmuyorsa `auditTampered=true` olur ve yıkıcı eylemler durur.

**Gerekçe:** Anahtarsız `prev_hash` zinciri, veritabanına yazabilen bir saldırgan tarafından baştan hesaplanabilir. HMAC anahtarı DPAPI ile korunduğu için yalnızca DB’ye yazabilen saldırgan zinciri yeniden üretemez. Checkpoint, tüm zincirin sessizce silinmesini/geri alınmasını tespit eder. Aynı kullanıcıda çalışan malware bu anahtarı okuyabilir; bu sınır ADR-04’teki tehdit modeliyle aynıdır.

---

## 3. Faz Planı ve Bağımlılıklar

| Faz | Süre | İş paketleri | Çıkış kapısı |
|---|---:|---|---|
| Faz 0 — Baseline, spike ve acil yamalar | 5 iş günü | WP-00 (spike’lar dahil), WP-05, WP-06, WP-07, WP-01 başlangıç | G0 |
| Faz 1 — Kritik/Yüksek güvenlik | 10 iş günü | WP-01, WP-02, WP-04 | G1 |
| Faz 2 — Konsol, renderer, güvenlik motoru | 12 iş günü | WP-03, WP-08, WP-09, WP-10 | G2 |
| Faz 3 — Depolama, ağ, performans | 12 iş günü | WP-11, WP-12, WP-13 | G3 |
| Faz 4 — i18n, paketleme, yayın | 6 iş günü | WP-14, WP-15 | G4 |

**Paralel çalışma kuralı:** WP-01 ve WP-02 aynı `SignedOrderService`/`LocalApiService` dosyalarına dokunabilir; iki geliştirici çalışıyorsa WP-01 önce `OrderV2` şemasını ve testlerini merge eder, WP-02 TLS katmanını ayrı dosyalarda yürütür. WP-11’e başlamadan WP-03’ün SQLite erişim katmanı ve PRAGMA testleri tamamlanmış olmalıdır; iki ekip aynı `Database` yardımcı dosyasını çatallamaz.

### 3.1. Kritik yol ve tampon

- **Kritik yol:** WP-00 (spike alt kapısı) → WP-01 → WP-02 → WP-03 → WP-11 → WP-15.
- **Spike alt kapısı:** WP-00.S1–S4 kanıtlanmadan WP-01/WP-10/WP-11/WP-15 başlamaz. Spike başarısızsa mimari karar (ör. `app://` yerine başka bir özel protokol veya farklı native paketleme) aynı fazda revize edilir; açık uçlu erteleme yapılmaz.
- **En riskli bağımlılık:** WP-01’in emir protokolü v2’si, WP-03’ün makbuzlu teslimi ve WP-11’in nonce tablosu aynı `nonce` semantiğini paylaşır. Bu nedenle `nonce` üretimi ve doğrulaması tek bir `src/main/order/Nonce.js` modülünde tanımlanır; üç WP de bu modülü kullanır.
- **Tampon:** Faz 1–4’ün her birinin sonunda 1 iş günü regresyon tamponu vardır; toplam 4 gün. Bu tampon, Windows TLS/sertifika ve `schtasks` yerelleştirme sürprizleri içindir. 24 saat soak, sızma testi ve sertifika temini dış takvim bağımlılığıdır; bu süreler 8–10 haftalık üst sınıra dahil değildir.

---

## 4. İş Kırılım Yapısı (WBS)

Her iş paketi şu şablonu izler:

1. Amaç, bağımlılık ve çıktı.
2. Atomik iş kalemleri tablosu.
3. Risklere özgü azaltım ve fallback.
4. Test senaryoları, uygulama adımları ve kabul kriterleri.

“Dosyalar” sütunu hedef dosya/klasörleri belirtir; mevcut satır numaraları denetim raporundaki referanslardır. Yeni dosya adları uygulama sırasında bu plandaki adlarla oluşturulur.

---

### WP-00 — Baseline, Test Altyapısı ve Geri Alma Güvenliği

**Amaç:** Değişikliklerin ölçülebilir, geri alınabilir ve tekrarlanabilir olmasını sağlamak.  
**Bağımlılık:** Yok.  
**Çıktı:** `remediation/2026-10-22` dalı, CI hattı, test fixture’ları, güvenlik kontrol script’i, geri alma runbook’u, spike kanıt raporu.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-00.T1 | Baseline tag ve dal oluştur; mevcut kirli çalışma ağacını ayrı bir commit’e almadan yalnızca yeni dosyaları plan dalına ekle | Git | — | `v1.0.1-audit` tag’i, `remediation/2026-10-22` dalı |
| WP-00.S1 | Spike: `app://` + `protocol.handle` + `net.fetch(pathToFileURL())` + `fs.realpath`, paketli ASAR’da çalışıyor mu? | `spikes/app-protocol/**` | T1 | Go/no-go kararı ve kanıt |
| WP-00.S2 | Spike: `canonicalize@5.1.0` dinamik import’u ASAR içinde yükleniyor mu? | `spikes/canonicalize/**` | T1 | Go/no-go kararı ve kanıt |
| WP-00.S3 | Spike: `better-sqlite3@13.0.3` + `@node-rs/argon2@2.2.2` Electron 43 x64 paketinde yükleniyor mu? | `spikes/native-modules/**` | T1 | Go/no-go kararı ve kanıt |
| WP-00.S4 | Spike: `PowerPilot.exe --headless --user-data-dir` servis hesabında `safeStorage` ve EFS ile çalışıyor mu? | `spikes/headless-service/**` | T1 | Go/no-go kararı ve kanıt |
| WP-00.T2 | CI’ı Windows x64 + Node 24.18.1’e sabitle; Electron içi Node 24.17.0 testini ayrı job yap | `.github/workflows/ci.yml`, `.nvmrc`, `tests/smoke/electron-version.js` | T1 | `test`, `e2e`, `package` job’ları |
| WP-00.T3 | Ortak fixture fabrikası: görev, emir, muafiyet, pencere, eski JSON veri, TLS sertifikaları, sahte `schtasks` | `tests/helpers/fixtures.mjs`, `tests/fixtures/**` | T1 | Deterministik test verisi |
| WP-00.T4 | Build-time özellik sabitleri: `ORDER_PROTOCOL=2`, `STORAGE_ENGINE='sqlite'`, `CONSOLE_STORAGE='sqlite'`, `CSP_MODE='enforce'` | `src/main/config/flags.js` | T1 | Tek kaynaklı sabitler; runtime güvenlik fallback’i yok |
| WP-00.T5 | `security-check.mjs`: `src/**` üzerinde yasaklı desen taraması (`exec(`, `shell: true`, `innerHTML =`, `unsafe-inline`, `nodeIntegration: true`, `http://` istemci URL’si, düz metin sır anahtarları); test/docs hariç | `scripts/security-check.mjs`, `package.json` | T2 | `npm run test:security` |
| WP-00.T6 | Geri alma runbook’u: DB/JSON yedeği, sürüm düşürme, sertifika geri alma, konsol bakım modu | `docs/runbooks/rollback.md` | T3 | Adım adım geri alma prosedürü |
| WP-00.T7 | Test komutlarını tek hedefte topla: `test`, `test:security`, `test:e2e`, `verify:pack` | `package.json` | T2, T5 | CI’da çalışan komut seti |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Mevcut kirli çalışma ağacının yanlışlıkla commit edilmesi | Orta | Yüksek | Yalnızca plan dosyası ve yeni test dosyaları ayrı commit; `git diff --name-only` kontrolü | Dalı sil, baseline tag’den yeniden aç |
| CI’ın Electron içi Node’u test etmemesi | Orta | Yüksek | `electron --version` ve `process.versions.node` assert eden ayrı job | Paketlenmiş ikili üzerinde smoke test |
| Test fixture’larının gerçek veriyi taklit etmemesi | Orta | Orta | Fixture’lar denetimdeki 49 bulgu için en az bir negatif senaryo içerir | Eksik fixture eklenene kadar WP kabul edilmez |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-BASE-01 | `npm ci` → `npm test` → `npm run test:security` | Üç komut da sıfır hata |
| T-BASE-02 | CI’da `electron tests/smoke/electron-version.js` | `process.versions.node` = `24.17.0` |
| T-BASE-03 | `security-check` örnek ihlal dosyasıyla çalıştır | Yasaklı desende exit code 1 |
| T-BASE-04 | Runbook’taki geri alma adımlarını test kopyasında uygula | Veri kaybı yok, uygulama açılıyor |
| T-BASE-05 | Referans donanımda açılış, görev kaydı, 1.000 görev listesi ve boşta RSS baseline’ı al | `baseline.json`; p95 değerleri kayıtlı |
| T-SPIKE-01 | S1 spike’ını paketli ASAR’da çalıştır | `index.html`/`mini.html` yüklenir; traversal reddedilir; karar kayıtlı |
| T-SPIKE-02 | S2 spike’ını ASAR içinde çalıştır | `canonicalize` yüklenir; imza/verify vektörü geçer |
| T-SPIKE-03 | S3 spike’ını Electron 43 x64 paketinde çalıştır | İki native modül yüklenir; sorgu/hash çalışır |
| T-SPIKE-04 | S4 spike’ını servis hesabında çalıştır | `safeStorage` açılır; sır yaz/oku; düz metin yok |

---

### WP-01 — Emir Bütünlüğü, Ajan Kimliği ve Yetkilendirme

**Amaç:** K-01, H-05, H-06 ve M-01’i kapatmak; imzalı emrin değiştirilemez, hedefe bağlı ve rol sınırlı olmasını sağlamak.  
**Bağımlılık:** WP-00.  
**Çıktı:** `OrderV2` şeması, RFC 8785 imza, ajan başına anahtar, açık rol matrisi, timing-safe karşılaştırma, saat kayması politikası.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-01.T1 | `OrderV2` şemasını ve sınır doğrulayıcısını yaz: alanlar, tipler, uzunluk/derinlik, yasak anahtarlar, `targets` tekilliği | `src/main/order/OrderSchema.js` | WP-00.T4 | `validateOrder()` |
| WP-01.T2 | `canonicalize@5.1.0` ESM modülünü `main.js` ve `ConsoleServer.start()` içinde `await import()` ile yükle; tam emir kanonikleştirmesi; Ed25519 `sign()`/`verify()`; `params` imzaya dahil | `src/main/services/SignedOrderService.js`, `main.js`, `ConsoleServer.js` | T1 | `signOrder()`, `verifyOrder()`; `CANONICALIZER_NOT_READY` |
| WP-01.T3 | `verify()` sırası: şema → sürüm → `issuer` → hedef → zaman → nonce → `keyId` → imza → eylem parametreleri; hata kodları | `SignedOrderService.js`, `src/main/services/OrderExecutor.js` | T1, T2 | `BAD_SIGNATURE`, `WRONG_TARGET`, `EXPIRED`, `CLOCK_SKEW`, `INVALID_EXPIRY`, `REPLAY` |
| WP-01.T4 | `SignedOrderService`’a `agentId` enjekte et; `targets` tam olarak `[agentId]` değilse reddet; çoklu hedefi konsolda ajan başına böl | `SignedOrderService.js`, `ConsoleClient.js` | T3 | Hedefe bağlı doğrulama |
| WP-01.T5 | Ajan kaydı: sunucu `agentId` + 32 bayt anahtar üretir; sunucu yalnızca `sha256(key)` + `keyId` saklar; ajan `agentId` + anahtarı ayarlar | `src/console/ConsoleServer.js`, `main.js`, `preload.js` | T4 | Ajan başına kimlik |
| WP-01.T6 | `ROLE_RANK` kaldır; endpoint → izin matrisi; `agent` yalnızca heartbeat/makbuz uçlarına erişir | `ConsoleServer.js` | T5 | Açık yetki matrisi |
| WP-01.T7 | `keyId` tabanlı konsol anahtar rotasyonu; eski açık anahtar `notAfter`’a kadar geçerli | `SignedOrderService.js`, konsol config | T2 | Kesintisiz rotasyon |
| WP-01.T8 | `safeCompare`: iki girdiyi SHA-256 ile 32 bayta normalize et, `crypto.timingSafeEqual` çağır; Buffer/string dönüşüm hatasını yakala; Local API ve konsol anahtar karşılaştırmalarında kullan | `src/main/security/safeCompare.js`, `LocalApiService.js`, `ConsoleServer.js` | T3 | Zamanlama oracle’ı kapalı |
| WP-01.T9 | Regresyon testleri: imza/params, hedef, yayıncı, süre, replay, yanlış anahtar, rol matrisi | `tests/main/order-v2.test.mjs` | T1–T8 | Test paketi |

**Yetki matrisi (varsayılan reddet):**

| Endpoint | agent | viewer | operator | admin |
|---|---|---|---|---|
| `POST /api/v1/heartbeat` | ✅ | — | — | — |
| `POST /api/v1/receipts` | ✅ | — | — | — |
| `GET /api/v1/agents` | — | ✅ | ✅ | ✅ |
| `GET /api/v1/agents/gpo-conflicts` | — | ✅ | ✅ | ✅ |
| `POST /api/v1/agents/:id/orders` | — | — | ✅ | ✅ |
| `POST /api/v1/agents/:id/disable` | — | — | — | ✅ |
| `POST /api/v1/agents/:id/enable` | — | — | — | ✅ |
| `POST /api/v1/orders/:nonce/cancel` | — | — | ✅ | ✅ |
| `GET /api/v1/policies` | — | ✅ | ✅ | ✅ |
| `POST /api/v1/policies` | — | — | ✅ | ✅ |
| `DELETE /api/v1/policies/:id` | — | — | — | ✅ |
| `GET /api/v1/subnets` | — | ✅ | ✅ | ✅ |
| `GET /api/v1/audit` | — | — | — | ✅ |
| `GET /api/v1/console-key` | — | — | — | ✅ |
| `POST /api/v1/keys` | — | — | — | ✅ |
| `GET /api/v1/settings` | — | — | — | ✅ |

`agent` rolü yalnızca kendi kimliğiyle heartbeat ve makbuz gönderir; envanter, politika, audit ve anahtar uçlarına erişemez. Bu matris hedef durumdur; mevcut kodda `GET /api/v1/audit` viewer’a açıktır, WP-01.T6 bunu admin’e daraltır. Yeni uçlar aynı WP’de eklenir.

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Eski ajanlar v2 emri reddeder, operasyon durur | Yüksek | Yüksek | Bakım penceresi; önce ajanlar, sonra konsol güncellenir; eski sürüm v1’de kalır | Konsol emir üretimini durdur, önceki ikiliye dön; kuyruk TTL’si dolana kadar bekle |
| `canonicalize` sürüm farkı imza uyuşmazlığı üretir | Düşük | Yüksek | Tek sürüm `5.1.0`, lockfile, iki taraf aynı test vektörleri | İmza üretimini durdur, sürümü sabitle, emirleri yeniden üret |
| Ajan anahtarının kaybolması | Orta | Orta | Anahtar yalnızca kayıt sırasında bir kez gösterilir; yeniden kayıt prosedürü | Eski anahtarı iptal et, yeni kayıt oluştur |
| Rol matrisinin bir ucu unutması | Orta | Yüksek | Her endpoint için tablo tabanlı test; `default deny` | Eksik endpoint’i kapat, test ekle |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-ORD-01 | Geçerli v2 emir üret; `params.policy.action` değerini `sleep`→`shutdown` değiştir; `verify` çağır | `ok:false`, `BAD_SIGNATURE`; executor çağrılmaz |
| T-ORD-02 | `targets:["agent_A"]` emri `agent_B` doğrulayıcısında çalıştır | `WRONG_TARGET`; kuyruğa girmez |
| T-ORD-03 | `issuedAt` 10 dk geçmiş, `expiresAt` geçmiş, `issuer:"agent"` emirleri | Sırasıyla `EXPIRED`, `EXPIRED`, `BAD_ISSUER` |
| T-ORD-04 | Aynı `nonce` iki kez gönder | İkinci `REPLAY`; yalnızca bir icra |
| T-ORD-05 | A anahtarının `agentId`’si ile B heartbeat’i gönder | `403 IDENTITY_MISMATCH`; B envanteri değişmez |
| T-ORD-06 | `agent`, `viewer`, `operator`, `admin` anahtarlarıyla 16 endpoint çağır | Yalnızca izin matrisindeki hücreler 2xx |
| T-ORD-07 | Aynı ve farklı uzunlukta iki string’i `safeCompare` ile karşılaştır | İkisi de SHA-256 ile normalize edilir; eşitse `true`, değilse `false`; istisna yok |
| T-ORD-08 | `initCanonicalizer()` çağrılmadan `sign()`; sonra çağırıp tekrar dene | İlki `CANONICALIZER_NOT_READY`; ikincisi geçerli imza |
| T-ORD-09 | `issuedAt` 3 dk ileri, `expiresAt` 11 dk, sistem saati 10 dk geri/ileri | İlki `CLOCK_SKEW`; ikincisi `INVALID_EXPIRY`; saat geri alınsa da nonce/imza kabul edilmez |

---

### WP-02 — Taşıma Güvenliği, TLS/mTLS ve Yerel API Sağlamlaştırma

**Amaç:** K-02, H-01, H-03, M-01, M-09, M-10, M-15 ve L-03’ü kapatmak.  
**Bağımlılık:** WP-00, WP-01.T8.  
**Çıktı:** HTTPS konsol, LAN’da zorunlu TLS+mTLS, kısa ömürlü sertifika + parmak izi iptali, yeniden başlatmada port çakışmasız API, istek sınırları, idempotency.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-02.T1 | TLS yapılandırma yükleyicisi: PEM/PFX, CA, parola, `minVersion`, `requestCert`, `rejectUnauthorized`, `sessionTimeout:0` | `src/main/security/TlsConfig.js` | WP-00.T4 | `buildServerOptions()`, `buildClientOptions()` |
| WP-02.T2 | Konsol `https.createServer`; düz HTTP yalnızca loopback + `PP_ALLOW_INSECURE_CONSOLE=1`; `requestTimeout=15000`, `headersTimeout=10000`, `keepAliveTimeout=5000` | `src/console/ConsoleServer.js` | T1 | HTTPS-only konsol |
| WP-02.T3 | `ConsoleClient` HTTPS zorunlu; `https.request` + CA; 30 sn timeout; yönlendirme yok; sertifika hatası kullanıcıya görünür | `src/main/services/ConsoleClient.js` | T1 | Doğrulanmış outbound TLS |
| WP-02.T4 | mTLS doğrulaması: `socket.authorized===true`, `authorizationError` boş, `fingerprint256` allowlist’te; boş sertifika reddi | `LocalApiService.js` | T1 | H-01 kapanışı |
| WP-02.T5 | LAN modu TLS’e bağlanır; TLS yoksa `LAN_REQUIRES_TLS`; sunucu bind öncesi son kontrol; UI LAN adresini `https://` gösterir | `validate.js`, `LocalApiService.js`, `src/index.html` | T4 | LAN’da düz HTTP imkânsız |
| WP-02.T6 | `stop()` async; `close()` + `closeIdleConnections()` + 5 sn sonra `closeAllConnections()`; `start()` başarısızsa eski yapılandırmayı geri yükle | `LocalApiService.js`, `main.js` | T4 | M-09 kapanışı |
| WP-02.T7 | İstek sınırları: 100 KB gövde, `Content-Type: application/json`, 413/415, `requestTimeout`, `headersTimeout`, `maxHeadersCount` | `LocalApiService.js` | T2 | M-15 kapanışı |
| WP-02.T8 | Sunucu tarafı ID üretimi (`crypto.randomUUID`), 201/400/404/409 kodları, iptal sonucu eşleme, `Idempotency-Key` cache | `LocalApiService.js`, `src/main/services/ExemptionService.js` | T7 | M-10 + L-03 kapanışı |
| WP-02.T9 | Konsol anahtar doğrulamasında `keyId` zorunlu; eski anahtar için tüm anahtarları sabit zamanlı tarayan legacy yol | `ConsoleServer.js` | WP-01.T8 | M-01 kapanışı |
| WP-02.T10 | Sertifika üretim/dağıtım script’i ve runbook: CA, 90 günlük sunucu, 30 günlük istemci, parmak izi kaydı/iptali, otomatik yenileme; Windows Firewall’da yalnızca 443/8443 | `scripts/certs/*.ps1`, `docs/runbooks/tls.md`, `scripts/firewall.ps1` | T1 | Operasyonel TLS + iptal |
| WP-02.T11 | Regresyon ve entegrasyon testleri: düz HTTP reddi, self-signed istemci, doğru istemci, port yeniden başlatma, slowloris | `tests/main/tls.test.mjs`, `tests/main/local-api.test.mjs` | T1–T9 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Sertifika dağıtımı yanlış; ajanlar konsola bağlanamaz | Yüksek | Yüksek | CA’yı önce test ajanında doğrula; parmak izi allowlist’ini kademeli aç; eski sertifikayı 24 saat geçerli tut | Konsol loopback’e alınır, uzaktan erişim bakım moduna geçer |
| TLS 1.3 oturum yeniden kullanımı istemci sertifikasını atlar | Orta | Yüksek | `sessionTimeout:0`, her bağlantıda `getPeerCertificate(true)` ve `authorized` kontrolü | TLS 1.2’ye sabitle, oturum yeniden kullanımını kapat |
| `EADDRINUSE` hâlâ oluşur | Orta | Orta | `closeAllConnections`, 5 sn bekleme, 3 deneme; hata kullanıcıya döner | Yeni ayarı geri al; API’yi başlatma ve kullanıcıya port çakışmasını göster |
| 100 KB gövde sınırı meşru isteği reddeder | Düşük | Orta | UI ve API dokümantasyonunda sınır; 413 gövdesinde limit | Sınırı 256 KB’ye çıkar, ayrı ayar yap |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-TLS-01 | Konsolu `0.0.0.0` + HTTP başlat | Başlatma reddedilir, `CONSOLE_TLS_REQUIRED` |
| T-TLS-02 | Loopback + `PP_ALLOW_INSECURE_CONSOLE=1` + HTTP | Yalnızca `127.0.0.1` dinler |
| T-TLS-03 | Konsol istemcisi `http://` URL ile | `TLS_REQUIRED`; istek gitmez |
| T-TLS-04 | Doğru CA ile HTTPS istek | 200; sertifika doğrulanır |
| T-TLS-05 | mTLS açık; sertifikasız, self-signed, yanlış CA, süresi geçmiş istemci | Sırasıyla 401/403; hiçbiri 2xx değil |
| T-TLS-06 | LAN + TLS kapalı ayar kaydı | `LAN_REQUIRES_TLS`; ayar yazılmaz |
| T-TLS-07 | `safeCompare` çağrısını spy ile izle; eşit, farklı ve farklı uzunlukta girdiler | Her çağrıda `timingSafeEqual` bir kez; erken çıkış yok; sonuçlar doğru |
| T-TLS-08 | API’yi 20 eşzamanlı istek altında durdur/başlat | `EADDRINUSE` yok; 20 istekten hiçbiri çökme üretmez |
| T-TLS-09 | Var olmayan görev iptali, geçersiz muafiyet, aynı `Idempotency-Key` | 404/400/409 doğru; ikinci istek aynı yanıtı döner |
| T-TLS-10 | 100 KB üstü gövde, 10 sn yavaş header | 413/408; bağlantı kapanır; süreç ayakta |
| T-TLS-11 | Allowlist’ten istemci parmak izini çıkar; yeni handshake ve mevcut keep-alive bağlantısıyla istek | Yeni handshake 403; keep-alive bağlantısı 5 sn içinde kapanır; 2xx yok |

---

### WP-03 — Konsol Dayanıklılığı, Makbuzlu Teslim ve Ölçeklenebilir Depolama

**Amaç:** H-04, H-07, M-08 ve P-02’yi kapatmak; emir kaybını ve konsol deposunun sessiz sıfırlanmasını bitirmek.  
**Bağımlılık:** WP-00, WP-01.T1, WP-02.T2.  
**Çıktı:** `console.db`, makbuzlu kuyruk, tek-uçuş senkron, 100 ajan için doğrusal yazma, utilityProcess yedek/geri yükleme.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-03.T1 | `ConsoleStore` SQLite katmanı: `agents`, `queues`, `receipts`, `audit`, `keys`, `meta`; WAL PRAGMA’ları | `src/console/ConsoleStore.js` | WP-02.T2 | Şema + migration |
| WP-03.T2 | JSON deposundan atomik migrasyon: yedek, parse, transaction, sayım kontrolü, `quick_check`; bozuk dosyada bakım modu, üzerine yazma yok; `keypair.privateKey` DB’ye yazılmaz, WP-04’e devredilir | `ConsoleStore.js`, `src/console/ConsoleServer.js` | T1 | H-07 kapanışı |
| WP-03.T3 | Kuyruk durum makinesi: `pending → inflight → acked/expired`; heartbeat teslim eder, silmez; `expiresAt`’e kadar yeniden teslim | `ConsoleServer.js`, `ConsoleStore.js` | T1 | H-04 kapanışı |
| WP-03.T4 | `POST /api/v1/receipts`: ajan kimliği doğrulanır; `(nonce, agent_id)` unique; aynı makbuz idempotent; sonuç audit’e yazılır | `ConsoleServer.js`, `ConsoleStore.js` | T3 | Makbuzlu teslim |
| WP-03.T5 | Konsol API/UI: `pending`, `inflight`, `acked`, `expired` sayıları; emir geçmişi; hata nedeni | `src/console/**`, `src/index.html` | T3 | Operasyonel görünürlük |
| WP-03.T6 | `ConsoleClient.sync()` tek-uçuş; aynı anda gelen çağrı aynı Promise’i döner; 30 sn timeout; `main.js` tick ve `console-sync` IPC aynı kilidi kullanır | `ConsoleClient.js`, `main.js` | WP-02.T3 | M-08 kapanışı |
| WP-03.T7 | Heartbeat tek transaction: ajan upsert + due select + `delivered_at` + audit; tam dosya yazımı yok | `ConsoleStore.js`, `ConsoleServer.js` | T1 | P-02 kapanışı |
| WP-03.T8 | Günlük `VACUUM INTO` yedeği; 7 gün saklama; geri yükleme testi; bozuk DB’de bakım modu; yedek ve `VACUUM` ayrı **utilityProcess**’te, yedek AES-256-GCM ile şifreli | `ConsoleStore.js`, `scripts/console-backup.mjs` | T1 | Yedek/geri dönüş |
| WP-03.T9 | Kaos testleri: yanıt öncesi bağlantı kesme, makbuz kaybı, çift makbuz, 100 ajan, 10.000 emir | `tests/main/console-store.test.mjs`, `tests/e2e/console.spec.js` | T1–T8 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Makbuz gelmezse aynı emir sürekli teslim edilir | Orta | Orta | `expiresAt` + deneme sayısı; ajan nonce ile idempotent; operatöre `expired` gösterilir | Emri `expired` işaretle, audit’e yaz, yeniden üret |
| SQLite dosyası bozulur | Düşük | Yüksek | WAL + FULL + günlük yedek + `quick_check` | Son yedeği geri yükle; bozuk dosyayı karantinaya al |
| 100 ajan heartbeat’i yazma kuyruğunu kilitler | Orta | Yüksek | Tek transaction, indeksler, `busy_timeout=5000`, WAL; 100 ajan testi | Heartbeat’i 2 dk’ya yay, batch yaz |
| JSON migrasyonunda alan kaybı | Orta | Yüksek | Sayım + alan checksum; kuru çalıştırma; yedeği sakla | Migrasyonu durdur, JSON’u geri koy |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-CON-01 | Bozuk `console-store.json` ile başlat | Bakım modu; dosya üzerine yazılmaz; yedekten kurtarma çalışır |
| T-CON-02 | Heartbeat yanıtı gönderildikten hemen sonra bağlantıyı kes; tekrar heartbeat | Emir ikinci heartbeatte yeniden gelir; kayıp yok |
| T-CON-03 | Ajan emri icra eder, makbuz kaybolur; tekrar teslim | Ajan ikinci kez icra etmez, aynı makbuzu tekrar gönderir |
| T-CON-04 | 10 eşzamanlı `consoleClient.sync()` | Tek HTTP isteği; diğerleri aynı sonucu alır |
| T-CON-05 | 100 ajan × 10 heartbeat, 10.000 emir | p95 heartbeat < 150 ms; tam dosya yazımı 0; kuyruk tutarlı |
| T-CON-06 | DB’yi kopyala, yedekten geri yükle | Tüm ajan/kuyruk/makbuz sayıları eşleşir |
| T-CON-07 | 100 ajan heartbeat’i sürerken `VACUUM INTO` + yedek al | Heartbeat p95 < 150 ms; event loop lag < 100 ms; yedek şifreli ve `quick_check=ok` |

---

### WP-04 — Sırlar, PIN ve Windows Dosya İzinleri

**Amaç:** H-02’yi kapatmak; düz metin sırları, zayıf PIN KDF’sini ve geniş dosya izinlerini ortadan kaldırmak.  
**Bağımlılık:** WP-00, WP-02.T1.  
**Çıktı:** `SecretStore`, Argon2id PIN, kısıtlı ACL, headless safeStorage.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-04.T1 | `SecretStore`: `isAsyncEncryptionAvailable`, `encryptStringAsync`, `decryptStringAsync` (`{result, shouldReEncrypt}`); ayrı `secrets.v1.json`; atomik yazma; fallback yok. Konsol Ed25519 özel anahtarı `console-signing-key.pem` olarak yalnızca servis hesabı ACL’i ve EFS ile saklanır | `src/main/security/SecretStore.js`, `src/console/ConsoleServer.js` | WP-02.T1 | Şifreli sır dosyası + ACL’li imza anahtarı |
| WP-04.T2 | Migrasyon: düz metin sırları oku → şifrele → `decryptStringAsync().result` ile doğrula → eski alanları null yap → sır içeren eski yedekleri sil; `console-store.json` içindeki `keypair.privateKey`’i çıkar, imza anahtarı dosyasına taşı | `StorageService.js`, `SecretStore.js`, `scripts/migrate-secrets.mjs` | T1 | H-02 veri migrasyonu |
| WP-04.T3 | Windows ACL: `whoami /user` SID’i al; `icacls` ile kalıtımı kaldır, yalnızca kullanıcı + SYSTEM + Administrators ver | `src/main/security/Acl.js`, `scripts/secure-dir.ps1` | T1 | Kısıtlı dizin |
| WP-04.T4 | Argon2id: `m=19456`, `t=2`, `p=1`, 16 bayt salt, 32 bayt çıktı; PHC string; eski PIN hash’i doğrulandıktan sonra Argon2id’e yükselt; 5 deneme/15 dk kilit; başarıda rehash | `src/main/ipc/pinGuard.js`, `src/main/security/Pin.js` | T1 | Güçlü PIN |
| WP-04.T5 | Headless’ı `PowerPilot.exe --headless --user-data-dir=...` olarak çalıştır; `app.whenReady` sonrası SecretStore; Event Log kaynağını installer’da kaydet; servis installer’ı güncelle | `main.js`, `src/agent/headless.js`, `scripts/install-service.ps1` | T1 | Headless safeStorage + Event Log |
| WP-04.T6 | Log/exception redaksiyonu: `key`, `secret`, `token`, `pem`, `pin`, `authorization` alanlarını maskele | `src/main/logger.js`, `AuditLog.js` | T1 | Sır sızıntısı yok |
| WP-04.T7 | Yedek/dışa aktarma: sırlar hariç; geri yüklemede yeniden provisioning; sır içeren eski yedekleri otomatik sil | `scripts/export-data.mjs`, `docs/runbooks/backup.md` | T2 | Güvenli yedek |
| WP-04.T8 | Testler: DPAPI yok, yanlış kullanıcı, bozuk cipher, PIN parametreleri, kilit, ACL, headless safeStorage, log redaksiyonu | `tests/main/secrets.test.mjs` | T1–T7 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Servis hesabında DPAPI kullanılamaz | Orta | Yüksek | Headless’ı Electron ana süreci olarak çalıştır; `isAsyncEncryptionAvailable` testi; kurulumda doğrula | Servisi kullanıcı hesabıyla çalıştır; sırları yeniden provisioning yap |
| Eski yedeklerde düz metin sır kalır | Yüksek | Yüksek | Migrasyon sonrası sır içeren yedekleri tara ve sil; audit’e yaz | Yedekleri karantinaya al, kullanıcıya bildir |
| Argon2 native modülü Electron’da yüklenmez | Düşük | Yüksek | N-API; paketleme smoke testi; `asarUnpack **/*.node` | `crypto.scrypt` fallback (N=2^17, r=8, p=1, keylen=32, `maxmem=256 MiB`) ile geçici sürüm |
| ACL komutu Türkçe Windows’ta farklı çıktı verir | Orta | Orta | SID ile çalış, isimle değil; `icacls` çıkış kodunu kontrol et | PowerShell `Set-Acl` ile aynı DACL |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-SEC-01 | `powerpilot_data.json`, `console-store.json` ve yedeklerde `consoleAgentKey`, `localApiKeyPem`, webhook secret, `privateKey` ara | Düz metin/özel anahtar eşleşmesi yok; konsol anahtarı yalnızca ACL+EFS korumalı dosyada |
| T-SEC-02 | `secrets.v1.json`’ı başka kullanıcı altında çöz | `DPAPI` hatası; içerik okunamaz |
| T-SEC-03 | `icacls` çıktısını incele | `Users`/`Everyone` erişimi yok; yalnızca sahip + SYSTEM + Admins |
| T-SEC-04 | PIN’i 5 kez yanlış gir; hemen 6. kez doğru gir; test saatini 15 dk ileri alıp tekrar dene | İlk 5 ve hemen 6. reddedilir; 15 dk sonra doğru PIN kabul |
| T-SEC-05 | Aynı PIN için iki hash üret | Farklı salt; Argon2id PHC parametreleri doğru |
| T-SEC-06 | Eski sır içeren yedek taraması | Yedek silinir; audit kaydı var |
| T-SEC-07 | `decryptStringAsync` `shouldReEncrypt:true` döndürsün | Yeni cipher atomik yazılır; eski değer okunmaya devam eder |
| T-SEC-08 | `PowerPilot.exe --headless --user-data-dir=<temp>` başlat; sır yaz/oku | `safeStorage` çalışır; dosyada düz metin yok |
| T-SEC-09 | `pin`, `token`, `pem`, `Authorization` içeren log kaydı üret | Değerler maskeli; audit’te sır yok |

---

### WP-05 — Görev Zamanlayıcı ve Süreç Çalıştırma Güvenliği

**Amaç:** K-06’yı kapatmak; `schtasks` komut enjeksiyonunu ve kabuk yorumlamasını tamamen bitirmek.  
**Bağımlılık:** WP-00.  
**Çıktı:** Sunucu tarafı görev kimliği, `execFile` tabanlı zamanlayıcı, güvenli argüman üretimi.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-05.T1 | Görev kimliği yalnızca sunucuda üretilir; `^[A-Za-z0-9_-]{1,64}$`; istemciden gelen `id` reddedilir | `AutomationTask.js`, `validate.js`, `main.js` | WP-00.T3 | K-06 kimlik kapanışı |
| WP-05.T2 | `buildCreateCommand` yerine `buildCreateArgs`; `execFile('schtasks.exe', args)`; `windowsHide`, 15 sn timeout; `/rl LIMITED` | `TaskSchedulerBridge.js` | T1 | Kabuksuz çalıştırma |
| WP-05.T3 | Tarih/saat doğrulaması; `schtasks` çıkış kodları ve yerelleştirilmiş hata metinleri için eşleme; audit | `TaskSchedulerBridge.js` | T2 | Anlaşılır hata |
| WP-05.T4 | `shouldSync` yalnızca koşulsuz `scheduled` görevlerde true; `monitoring` görevler Windows’a yazılmaz | `TaskSchedulerBridge.js` | WP-06.T4 | K-04 ikinci savunma |
| WP-05.T5 | Sahte `schtasks` ile birim testleri: zararlı ID, boşluk, `&`, `"`, dikey çizgi, `>`; argüman dizisi birebir kontrol | `tests/main/task-scheduler-bridge.test.mjs` | T1–T4 | Test paketi |
| WP-05.T6 | Windows CI’da gerçek görev oluştur/sil: `PowerPilotTest_<pid>`; hata varsa test fail | `tests/integration/schtasks.win.test.mjs` | T2 | Gerçek doğrulama |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| `schtasks` hâlâ `/tr` içindeki `&` karakterini yorumlar | Düşük | Yüksek | ID güvenli; exe yolu tırnaklı; `execFile`; gerçek görev testi | XML tabanlı `/create /xml` ile görev oluştur |
| Yerelleştirilmiş Windows’ta çıkış kodu farklı | Orta | Orta | Çıkış kodunu tek ölçüt yap; stdout’u logla, parse etme | Kullanıcıya ham hata + audit |
| Görev oluşturma izni yok | Orta | Orta | `/rl LIMITED`; hata kullanıcıya gösterilir; uygulama çökmez | Zamanlayıcı yedeğini devre dışı bırak, uygulama içi döngü kullan |
| Eski görevler eski ID biçimini kullanır | Orta | Orta | Migrasyonda eski `task_*` ID’lerini koru; yalnızca yeni ID’leri doğrula | Eski görevleri sil, yeniden oluştur |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-SCH-01 | `id = 'x" & calc.exe & "'` ile görev oluştur | `INVALID_TASK_ID`; `calc.exe` çalışmaz; `schtasks` çağrılmaz |
| T-SCH-02 | Geçerli görev oluştur; argümanları yakala | Argümanlar `['/create','/tn',...,'/tr','"exe" --run-task=task_...','/sc','ONCE',...]` |
| T-SCH-03 | `task.id` 65 karakter, boşluk, Unicode | Reddedilir; audit kaydı |
| T-SCH-04 | `monitoring` görev `shouldSync` | `false`; Windows’a yazılmaz |
| T-SCH-05 | Gerçek Windows test görevi oluştur ve sil | Görev oluşur, çalışır, silinir; kalıntı yok |

---

### WP-06 — Parser, Erteleme ve Görev Durum Semantiği

**Amaç:** K-03, K-04, H-10, L-02, L-10 ve L-11’i kapatmak; olumsuz cümleyi ve koşullu ertelemeyi güvenli hale getirmek.  
**Bağımlılık:** WP-00; WP-05.T4 ile birlikte.  
**Çıktı:** Olumsuzluk koruması, `notBefore` durumu, uyarı süresinin taşınması.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-06.T1 | Türkçe olumsuzluk sözlüğü ve `NegationGuard`: `kapatma`, `kapatmayın`, `kapatmam`, `kapatmıyor`, `kapatmayacağım`, `kapanmasın`, `kapanma` | `src/main/services/NegationGuard.js`, `DeterministicParser.js` | WP-00.T3 | K-03 kapanışı |
| WP-06.T2 | AI çıktısına aynı koruma: olumsuz metinde yıkıcı eylem önerisi `NEGATED_INTENT` ile reddedilir; netleştirme istenir | `AiService.js`, `AgentOrchestrator.js` | T1 | AI bypass’i kapalı |
| WP-06.T3 | Saat parser’ı: AM/PM ipucu, 24 saat, geçmiş saat → ertesi gün, “yarın” korunur, “yarım saat” erken dönüşü kaldırılır; `h===24` ölü dalı silinir | `DeterministicParser.js`, `AiService.js` | T1 | L-02/L-11 kapanışı |
| WP-06.T4 | `AutomationTask.trigger.notBefore`; `snoozeTask` koşullu görevde `targetTime` yazmaz, `monitoring` kalır; `allowed`/`maxCount` kontrolü | `AutomationTask.js`, `TaskManager.js` | T1 | K-04 kapanışı |
| WP-06.T5 | `evaluateTasks` koşul kapısı: `notBefore` geçilmeden koşul değerlendirilmez; koşul sağlanmadan `readyToExecute` yok | `TaskManager.js` | T4 | K-04 ikinci savunma |
| WP-06.T6 | Uyarı ertelemesi: `WarningManager.snoozeActiveWarning(minutes)` süreyi saklar; `executeTask` bu süreyi kullanır; limit kontrolü tek yerde | `WarningManager.js`, `TaskManager.js` | T4 | H-10 kapanışı |
| WP-06.T7 | UI: uyarı ekranındaki 10/30/60 dk ve özel süre seçimi main’e iletilir; kalan süre gösterilir; sabit 10 dk kaldırılır | `src/index.html`, `preload.js` | T6 | H-10 UI kapanışı |
| WP-06.T8 | `executeTask` finally sadeleştir; tek `releaseTask` + tek `saveTask`; gereksiz if/else kaldır | `TaskManager.js` | T4 | L-10 kapanışı |
| WP-06.T9 | Regresyon testleri: olumsuz cümleler, saat, erteleme, uyarı süresi, limit | `tests/main/parser.test.mjs`, `task-manager.test.mjs` | T1–T8 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Türkçe morfoloji yeni olumsuz biçim üretir | Yüksek | Yüksek | Sözlük + kelime sınırı + AI post-filter; yeni cümleler test corpus’una eklenir | Eşleşmeyen cümlede eylem önerme, netleştirme sor |
| Koşullu görevde `notBefore` unutulur | Orta | Yüksek | `targetTime` yazımını `scheduled` dışında yasaklayan invariant testi | Görev `monitoring`’e geri alınır, audit |
| Uyarı süresi yine sabit 10 dk kullanır | Orta | Yüksek | `snoozeMinutes` tek kaynak; testte 30 dk doğrulanır | Uyarıyı kapat, kullanıcıya hata göster |
| Geçmiş saat ertesi güne taşınırken “bugün” kastı bozulur | Orta | Orta | Kullanıcıya “yarın 10:00” önerisi göster; onay al | Netleştirme sorusu |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-PAR-01 | “Bilgisayarı kapatma”, “kapatmayın”, “kapatmam lazım değil”, “kapanmasın” | Hepsi `action:null`; yıkıcı öneri yok |
| T-PAR-02 | “Kapat”, “kapatın”, “kapatır mısın”, “sabah 8’de kapat” | Doğru `shutdown` + zaman |
| T-PAR-03 | 11:00’de “10:00’da kapat”, “yarın 10:00”, “akşam 8”, “sabah 8”, “yarım saat sonra” | Geçmiş saat ertesi gün; AM/PM doğru; yarım saat tam süre |
| T-PAR-04 | `monitoring` görevde 30 dk ertele | `targetTime` yok; `notBefore` +30 dk; durum `monitoring` |
| T-PAR-05 | `allowed:false` ve `maxCount` aşımı | `SNOOZE_NOT_ALLOWED` / `SNOOZE_LIMIT`; değişiklik yok |
| T-PAR-06 | Uyarıda 30 dk ertele, `executeTask` çalıştır | Kapanış 30 dk sonra; 10 dk değil |
| T-PAR-07 | Uyarı UI’sinde 10/30/60/özel süre | Main’e giden `minutes` seçilen değer |
| T-PAR-08 | `executeTask` hata ve başarı yolları | Tek `releaseTask`, tek `saveTask`; kilit sızıntısı yok |

---

### WP-07 — Koşul Motoru, Dosya/Klasör Stabilitesi ve İlerleme Mesajı

**Amaç:** K-05 ve L-01’i kapatmak; “indirilenler sabitlenince kapat” şablonunun indirme sürerken tetiklenmesini engellemek.  
**Bağımlılık:** WP-00, WP-06.T4.  
**Çıktı:** `file_stable` (yalnızca dosya), `directory_idle`, güvenli şablon, görünür ilerleme.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-07.T1 | `file_stable` yalnızca düzenli dosyada çalışır; klasör/symlink/reparse reddedilir; `size + mtimeMs` iki örnekte değişmezse sabit; `.crdownload/.part/.tmp/.download` reddi | `SmartFinishEngine.js`, `TemplateService.js` | WP-00.T3 | K-05 dosya tarafı |
| WP-07.T2 | `directory_idle`: recursive tarama (max derinlik 2, 5000 girdi), reparse atla, `latestMtime + totalSize + fileCount` imzası, `stableSeconds` penceresi, partial uzantı reddi | `src/main/services/conditions/DirectoryIdle.js`, `SmartFinishEngine.js` | T1 | K-05 klasör tarafı |
| WP-07.T3 | Built-in şablonu `directory_idle` kullanır (`Downloads`, 300 sn); mevcut `file_stable` klasör görevleri migrasyonda `directory_idle`’a çevrilir; validator klasörü reddeder | `TemplateService.js`, `StorageService.js` | T2 | Şablon migrasyonu |
| WP-07.T4 | `lastProgressMessage` `toJSON()`’a eklenir; aktif görev kartında gösterilir; boşsa gizlenir | `AutomationTask.js`, `src/index.html` | WP-00.T3 | L-01 kapanışı |
| WP-07.T5 | `SmartFinishEngine` async, 3 sn timeout, hata durumunda `satisfied:false` + audit; örnek durumu görev başına bellekte; restart’ta sıfırlanır (erken kapanma yok) | `SmartFinishEngine.js` | T2 | Fail-closed koşul |
| WP-07.T6 | Testler: `.crdownload`, boyut değişimi, yalnızca mtime değişimi, izin hatası, boş klasör, restart, symlink | `tests/main/smart-finish.test.mjs` | T1–T5 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Klasör taraması büyük `Downloads`’ta yavaşlar | Orta | Orta | Derinlik 2, 5000 girdi, 5 sn’de bir; `opendir` streaming | Taramayı 30 sn’ye çıkar, yalnızca kök dizin |
| Ağ paylaşımında `stat` takılır | Orta | Yüksek | 3 sn timeout, hata → `satisfied:false` | Yerel `Downloads` dışındaki yolları reddet |
| Boş klasör “sabit” sayılır ve erken kapanır | Orta | Yüksek | `fileCount > 0` şartı; boşsa false | Şablonu devre dışı bırak, kullanıcıya bildir |
| Restart örnek durumunu sıfırlar, kapanma gecikir | Düşük | Düşük | 300 sn yeniden bekleme; güvenli yön | Kabul edilir; kullanıcıya “yeniden ölçülüyor” göster |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-CND-01 | Klasörde 1 GB `.crdownload` varken `directory_idle` | `satisfied:false` |
| T-CND-02 | `.crdownload` silinip final dosya oluştu; 0/299/300 sn | 299’da false, 300’de true |
| T-CND-03 | `file_stable` yoluna klasör ver | `NOT_A_FILE`; false |
| T-CND-04 | Aktif görevde `lastProgressMessage` üret | JSON’da alan var; UI’da görünür |
| T-CND-05 | Klasöre erişim reddedilir | `satisfied:false`; audit `CONDITION_ERROR`; süreç ayakta |
| T-CND-06 | 1000 dosyalı klasörde tarama süresi | < 100 ms (yerel SSD); timeout yok |

---

### WP-08 — Renderer Sayaç, İptal ve Yükleme Durum Makinesi

**Amaç:** H-08, H-09, M-11, M-12, M-16, L-05, L-06 ve L-12’yi kapatmak; renderer’ı ana süreçteki gerçek görev durumuna bağlamak.  
**Bağımlılık:** WP-00, WP-06.T4, WP-07.T4.  
**Çıktı:** `targetTime` tabanlı sayaç, tek iptal akışı, hata yakalayan yükleyiciler, tüm aktif görevlerin geri yüklenmesi.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-08.T1 | `scheduleAction` çağrısını `await` et; `try/catch`; başarısızsa sayaç başlatma, hata toast’ı göster | `src/index.html`, `src/renderer/views/timer.js` | WP-06.T4 | H-08 birinci kapanış |
| WP-08.T2 | `startTimerTo(targetTime)`: her tick’te `Math.max(0, ceil((targetTime - Date.now())/1000))`; kademeli uyarılar `<=` ve tek seferlik; görünürlük/uyanma olayında yeniden senkron; `backgroundThrottling` varsayılana alınır | `src/renderer/views/timer.js`, `main.js` | T1 | H-08 ikinci kapanış |
| WP-08.T3 | Ana süreç `task-executed` / `task-failed` olayı gönderir; renderer başarı toast’ını yalnızca bu olayla gösterir; 10 sn olay gelmezse “durum kontrol ediliyor” | `main.js`, `preload.js`, `src/renderer/views/timer.js` | T2 | Gerçek sonuç |
| WP-08.T4 | `cancel-action` içinden `timer-cancelled-from-tray` gönderimini kaldır; yalnızca tray iptali gönderir; renderer olayda `btn-cancel.click()` yapmaz, `finishCancelUi()` çağırır; çift listener silinir | `main.js`, `src/index.html` | T1 | H-09 kapanışı |
| WP-08.T5 | İptal durum makinesi: `idle → cancelling → cancelled/failed`; buton anında disable; PIN modal tek örnek; aynı anda ikinci iptal reddedilir | `src/renderer/views/timer.js`, `main.js` | T4 | Yarış kapalı |
| WP-08.T6 | `safeInvoke(channel, args, timeoutMs)`; tüm `loadTemplates`, `loadHistory`, `loadStatistics`, `loadTasks` try/catch/finally + şema kontrolü + boş/hata durumu | `src/renderer/core/ipc.js`, `src/renderer/views/*.js` | WP-00.T3 | M-11 kapanışı |
| WP-08.T7 | Ayar kaydı önce sunucuya; başarılıysa localStorage/tema/dil; hata varsa kontrolleri eski değere döndür; dil anahtarını doğrula | `src/renderer/views/settings.js` | T6 | M-12 kapanışı |
| WP-08.T8 | `window-maximize-toggle` ve diğer pencere IPC’lerinde `!mainWindow \|\| mainWindow.isDestroyed()` koruması | `main.js` | WP-00.T3 | M-16 kapanışı |
| WP-08.T9 | `setPoll`/`setSetPoll` ölü yolunu kaldır; tek `startSettingsPoll/stopSettingsPoll`; görünüm değişiminde temizle | `src/renderer/views/settings.js`, `src/renderer/app.js` | T6 | L-05 kapanışı |
| WP-08.T10 | `updateDisplay` progress hesabında `initialTotalSeconds > 0` koruması; 0’da `pct=0` | `src/renderer/views/timer.js` | T2 | L-06 kapanışı |
| WP-08.T11 | `restoreActiveState` kaynak filtresini kaldır; `scheduled`/`monitoring`/`local_api`/`console` tüm aktif görevleri tek “aktif görev” kartında göster | `src/renderer/views/timer.js` | T6 | L-12 kapanışı |
| WP-08.T12 | E2E: IPC reddi, uyku benzetimi, çift iptal, PIN, yükleme hataları | `tests/e2e/timer.spec.js` | T1–T11 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Ana süreç olayı gelmezse UI “kontrol ediliyor”da kalır | Orta | Orta | 10 sn sonra `getActiveState` ile polling; kalıcı hata göster | Kullanıcıya “görev durumunu yenile” butonu |
| Uyku/uyanma sonrası hedef zaman geçmişse sayaç negatif olur | Yüksek | Orta | `Math.max(0, ...)`; hemen `getActiveState` | “Süre doldu, sonuç bekleniyor” göster |
| Çift iptal yine PIN modalı açar | Düşük | Yüksek | Tek `cancelInFlight`; buton disable; listener tek | Modalı kapat, tek IPC gönder |
| Yükleme hatası boş ekran bırakır | Orta | Orta | Her yükleyicide hata bileşeni; retry butonu | Tam sayfa yenile |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-REN-01 | `schedule-action` IPC’si reddedilsin; kullanıcı süre seçip başlatsın | Sayaç başlamaz; “çalıştırıldı” toast’ı yok; hata görünür |
| T-REN-02 | Görev başlat; `targetTime` 10 dk ileri; sistem saatini/uyku benzetimini 10 dk atlat | Kalan süre hedefe göre; 60/30/10 uyarıları bir kez |
| T-REN-03 | Tray’den iptal; aynı anda butondan iptal | Tek `cancel-action`; tek PIN; tek sonuç |
| T-REN-04 | `getTemplates` `null`, `getHistory` `undefined`, `getStatistics` throw | Boş/hata durumu; unhandled rejection yok |
| T-REN-05 | `saveSettings` reddeder; tema/dil değiştirilir | UI eski değere döner; localStorage yazılmaz |
| T-REN-06 | Pencere kapatılırken maximize IPC | İstisna yok; süreç ayakta |
| T-REN-07 | Ayarlar görünümünden çık | Poll temizlenir; arka planda istek yok |
| T-REN-08 | `initialTotalSeconds=0` ile `updateDisplay` | `NaN` yok; progress 0 |
| T-REN-09 | `monitoring` görev varken pencere yenile | Aktif görev kartı görünür; sayaç/koşul durumu doğru |
| T-REN-10 | Sayaç çalışırken sistem saatini 10 dk ileri ve geri al; uyku/uyanma benzetimi yap | Negatif süre yok; hedef geçmişse “süre doldu” durumu; uyarılar bir kez; monotonik geçen süre sıçramaz |

---

### WP-09 — Güvenlik Motoru Fail-Closed ve Cihaz Sınıflandırması

**Amaç:** H-11 ve L-04’ü kapatmak; ölçüm hatasında güç eylemini engellemek.  
**Bağımlılık:** WP-00, WP-05.T2 (execFile deseni).  
**Çıktı:** `PROCESS_LIST_UNAVAILABLE`, `POWER_REQUESTS_UNAVAILABLE`, `FULLSCREEN_STATE_UNAVAILABLE`; audit; UI gerekçesi.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-09.T1 | `getRunningProcessList` hata fırlatır; `evaluate` bunu yakalar ve `allowed:false` döner; boş liste fallback’i kaldırılır | `SafetyPolicyEngine.js` | WP-00.T3 | Süreç fail-closed |
| WP-09.T2 | `powercfg /requests` `execFile` ile; 3 sn timeout; hata/parse edilemeyen çıktı → `POWER_REQUESTS_UNAVAILABLE`; `.exe` içeren satır aktif istek sayılır | `SafetyPolicyEngine.js` | T1 | Güç isteği fail-closed |
| WP-09.T3 | Tam ekran/display sağlayıcısı hata verirse `FULLSCREEN_STATE_UNAVAILABLE`; `false` varsayımı yok | `SafetyPolicyEngine.js` | T1 | Fullscreen fail-closed |
| WP-09.T4 | `evaluate` sonucu `{allowed, reasonCode, detail}`; her ret audit’e; UI’da “doğrulanamadı” mesajı; normal kullanıcı bypass’ı yok; yalnızca PIN’li yönetici tek seferlik istisnası audit’li | `SafetyPolicyEngine.js`, `TaskManager.js`, `src/renderer/views/timer.js` | T1–T3 | Görünür güvenlik |
| WP-09.T5 | `DeviceProfiler` VM dalını `deviceClass='vm'` yap; başka sınıfları ezme; test | `DeviceProfiler.js` | WP-00.T3 | L-04 kapanışı |
| WP-09.T6 | Enjeksiyon testleri: provider throw, powercfg error, timeout, boş çıktı, protected process, aktif istek | `tests/main/safety.test.mjs` | T1–T4 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Fail-closed, kullanıcının meşru kapanmasını sürekli engeller | Orta | Yüksek | Gerekçe + destek runbook; `powercfg` yerelleştirme testi | Yalnızca belirli hata kodlarında blok; diğerlerinde PIN’li tek seferlik onay |
| `powercfg` çıktısı yerelleştirilmiş ve yanlış negatif | Orta | Yüksek | `.exe` ve kategori satırı sezgisi; bilinmeyen çıktı → blok | `Get-CimInstance`/Windows API yardımcı sağlayıcısı |
| Her tick’te `powercfg` çağrısı CPU tüketir | Orta | Orta | Yalnızca güç eylemi öncesi çağır; 5 sn cache | 30 sn cache |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-SAF-01 | `processProvider` throw | `allowed:false`, `PROCESS_LIST_UNAVAILABLE`; güç eylemi yok |
| T-SAF-02 | `powercfg` exit 1 / timeout / boş çıktı | `allowed:false`, `POWER_REQUESTS_UNAVAILABLE` |
| T-SAF-03 | Fullscreen provider throw | `allowed:false`, `FULLSCREEN_STATE_UNAVAILABLE` |
| T-SAF-04 | VM algılanan cihaz | `deviceClass='vm'`; başka sınıf ezilmez |
| T-SAF-05 | Korunan uygulama çalışırken kapatma | `allowed:false`, gerekçe UI’da |
| T-SAF-06 | Tüm sağlayıcılar başarılı, engel yok | `allowed:true`; audit’te ret yok |

---

### WP-10 — IPC, CSP, Renderer Paketleme ve Girdi Sınırları

**Amaç:** H-13, M-06, M-14 ve P-08’i kapatmak; renderer’ı en az yetkiyle çalıştırmak.  
**Bağımlılık:** WP-00, WP-08.T6, WP-09.T4.  
**Çıktı:** `app://` protokolü, katı CSP, modüler renderer, güvenli IPC, 4000 karakter AI sınırı.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-10.T1 | `app://` protokolü: `registerSchemesAsPrivileged`, `protocol.handle`, `path.resolve` + `fs.realpath` ile path traversal/symlink reddi, MIME; `index.html`/`mini.html` bu URL’den yüklenir | `main.js`, `src/main/protocol/AppProtocol.js` | WP-00.T3 | `app://powerpilot/` |
| WP-10.T2 | CSP meta + `onHeadersReceived` başlığı; `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'none'`; `X-Content-Type-Options`, `Referrer-Policy`, `COOP`, `CORP` | `src/index.html`, `src/mini.html`, `main.js` | T1 | Katı CSP |
| WP-10.T3 | Gömülü script/stil taşıma: Tailwind’i `tailwindcss@3.4.19` ile build-time derle; `styles.css`, `app.js`, `mini.js`; inline `on*=` niteliklerini kaldır; `qrcode-generator`’ı `src/vendor/qrcode.js`’e kopyala | `src/index.html`, `src/mini.html`, `src/renderer/**`, `tailwind.config.js` | T2 | P-08 kapanışı |
| WP-10.T4 | Güvenlik bayraklarını `SETTINGS_SCHEMA`’dan çıkar: `agentDisabled`, `autonomyMode`, `automationPaused`, `localApiEnabled`, `lanModeEnabled`, `localApiTlsEnabled`, `localApiTlsStrict`, `localApiRequireClientCert`, `localApiCertFile`, `localApiKeyFile`, `localApiKeyRole`, `consoleAgentKey`, `consoleUrl`; ayrı PIN’li `security-settings-update` IPC; `generate-api-key` PIN ister; `createTask` modu ayardan türetir | `validate.js`, `main.js`, `TaskManager.js`, `preload.js` | WP-04.T4 | H-13 kapanışı |
| WP-10.T5 | `assertTrustedSender(event)`: `event.senderFrame.url` `app://powerpilot/` ile başlar, `event.sender` güvenli `webContents` kümesinde; tüm `ipcMain.handle/on` sarmalanır | `src/main/ipc/guard.js`, `main.js` | T1 | Sahte IPC reddi |
| WP-10.T6 | Pencere/navigasyon: `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false`, `webviewTag:false`, `devTools:!app.isPackaged`; `setWindowOpenHandler` deny; `will-navigate` yalnızca app://; `setPermissionRequestHandler` yalnızca bildirim; dış bağlantı allowlist’i `electronjs.org`, `fonts.google.com`, `github.com`, `tailwindcss.com`, `vellium.dev` | `main.js`, `src/main/config/externalLinks.js` | T1 | Renderer sertleştirme |
| WP-10.T7 | `ai-parse` 4000 karakter, string kontrolü, kontrol karakteri temizliği, 10 çağrı/dk rate limit; `AgentOrchestrator` aynı sınırı uygular | `main.js`, `AgentOrchestrator.js`, `src/renderer/views/ai.js` | WP-00.T3 | M-06 kapanışı |
| WP-10.T8 | CSP ihlal raporu `securitypolicyviolation` → main log; testte sıfır ihlal | `src/renderer/app.js`, `main.js` | T2 | Görünür ihlal |
| WP-10.T9 | `innerHTML`/`insertAdjacentHTML` lavabolarını DOM API’lerine çevir; `security-check` sıfır sonuç; XSS fixture’ları | `src/renderer/**`, `scripts/security-check.mjs` | T3 | M-14 kapanışı |
| WP-10.T10 | E2E: CSP, path traversal, XSS, sahte IPC, `window.open`, dış bağlantı | `tests/e2e/security.spec.js` | T1–T9 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| `app://` yüklemesi paketli ASAR’da asset bulamaz | Orta | Yüksek | `net.fetch(pathToFileURL())` + paketli smoke test; `src` kökü sabit | Önceki build’e dön; üretimde `file://` kullanılmaz |
| Tailwind build-time derlemesi dinamik sınıfları kaçırır | Yüksek | Orta | `safelist` + tüm `src/**/*.{html,js}` taraması; görsel regresyon | Eksik sınıfları `safelist`’e ekle |
| CSP bir alt kaynağı engeller | Orta | Yüksek | `securitypolicyviolation` logu; E2E’de sıfır ihlal | Yalnızca ilgili direktifi daralt, `unsafe-inline` ekleme |
| `assertTrustedSender` mini pencereyi reddeder | Orta | Orta | Güvenli `webContents` kümesine `miniWindow` ekle | Mini pencereyi aynı origin’e taşı |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-CSP-01 | `app://powerpilot/../../main.js` iste | 400/404; dosya okunmaz |
| T-CSP-02 | Uygulamayı aç; CSP başlığını ve ihlal sayısını kontrol et | Başlık doğru; 0 ihlal; inline script yok |
| T-CSP-03 | `rg "innerHTML\\s*=" src` + `rg "insertAdjacentHTML" src` | 0 eşleşme |
| T-CSP-04 | Görev başlığına `<img src=x onerror="window.__xss=1">` yaz | Metin olarak görünür; `window.__xss` undefined |
| T-CSP-05 | Renderer’dan `save-settings` ile `agentDisabled:false`, `autonomyMode:'full'`, `localApiTlsEnabled:false`, `localApiRequireClientCert:false` gönder; ayrıca PIN’siz `generate-api-key` çağır | `UNKNOWN_SETTING`; TLS/mTLS ayarı değişmez; anahtar üretilmez; audit |
| T-CSP-06 | `ai-parse` 4001 karakter, 20 hızlı çağrı | `INPUT_TOO_LONG`; rate limit; CPU tavanı |
| T-CSP-07 | `window.open('https://evil.example')`, `will-navigate` | Pencere açılmaz; dış URL allowlist dışıysa shell açılmaz |
| T-CSP-08 | `webContents.send` sahte origin’den IPC | `UNTRUSTED_SENDER`; işlem yok |

---

### WP-11 — Uygulama Deposu v3, Veri Bütünlüğü ve Migrasyon

**Amaç:** H-12, M-02, M-03, P-01, P-07, D-01–D-04’ü kapatmak; tek JSON dosyasını SQLite’a taşımak.  
**Bağımlılık:** WP-00, WP-03.T1 (ortak SQLite deseni), WP-07.T3.  
**Çıktı:** `powerpilot.db`, şema v3, atomik migrasyon, HMAC audit + checkpoint, utilityProcess ağır işler, boot/energy/audit düzeltmeleri.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-11.T1 | `Database` modülü: `better-sqlite3@13.0.3`, PRAGMA’lar, `BEGIN IMMEDIATE` yazma transaction’ı, `quick_check`, `close`, hata sınıfları | `src/main/storage/Database.js` | WP-03.T1 | Ortak DB katmanı |
| WP-11.T2 | Şema v3: `meta`, `settings`, `tasks`, `history`, `templates`, `webhooks`, `exemptions`, `maintenance_windows`, `device_profiles`, `orders`, `seen_nonces`, `audit_log`, `boot_history` | `src/main/storage/schema.sql` | T1 | Tablolar + indeksler |
| WP-11.T3 | `StorageService` arayüzünü koru; `getSettings/saveSettings`, `getTasks/saveTask/deleteTask`, `getHistory/addHistory`, `getAudit/appendAudit`, `getOrders/saveOrder` SQL’e bağla | `StorageService.js` | T2 | P-01 kapanışı |
| WP-11.T4 | v2 JSON → v3 SQLite atomik migrasyon: yedek + sha256, temp DB, transaction, sayım/checksum, `quick_check`, rename, eski dosyayı `.migrated` yap | `src/main/storage/MigrateV2.js` | T1, T2 | Geri alınabilir migrasyon |
| WP-11.T5 | Tüm `saveTasks()` çağrılarını `saveTask()`/`deleteTask()` ile değiştir; toplu işlemlerde tek transaction; tam dosya yazımı yok | `TaskManager.js`, `HistoryService.js`, `AuditLog.js`, `OrderQueue.js` | T3 | P-01/P-07 kapanışı |
| WP-11.T6 | Boot: `InventoryService` constructor’ında `bootAt` bir kez; `boot_key = floor(ms/60000)` unique; 365 gün sakla; migrasyonda eski listeyi dedupe et | `InventoryService.js`, `StorageService.js` | T2 | H-12/P-07 kapanışı |
| WP-11.T7 | Audit log HMAC zinciri SQL’de: `seq`, `prev_hmac`, `record_hmac = HMAC-SHA256(auditHmacKey, canonical(record))` (kayıt kendi HMAC alanı hariç); anahtar SecretStore’da; günlük `audit-checkpoints/YYYY-MM-DD.json` + Windows Event Log özeti; açılışta `verify()`; kopukluk/checkpoint eksikliğinde `auditTampered=true` ve yıkıcı eylemler durur | `AuditLog.js`, `schema.sql`, `src/main/security/AuditCheckpoint.js` | T2, WP-04.T1 | Kurcalama tespiti |
| WP-11.T8 | Enerji eşleştirme: boot/down sıralı iki-pointer; aynı boot’a düşen ardışık kapanışlardan yalnızca sonuncusu; 14 gün üst sınır | `EnergyEstimateService.js` | T6 | M-02 kapanışı |
| WP-11.T9 | Muafiyet penceresi: `start<=end` ise `start<=m<end`; değilse `m>=start` veya `m<end`; `start===end` validation’da reddet; eski ölü pencereleri devre dışı bırak + uyarı | `ExemptionService.js`, `validate.js` | T2 | M-03 kapanışı |
| WP-11.T10 | `orders`, `seen_nonces` tabloları; `nonce` PK, `state`, `expires_at`; `INSERT OR IGNORE` ile atomik replay koruması; süresi geçen nonce temizliği | `OrderQueue.js`, `SignedOrderService.js`, `schema.sql` | T2 | Nonce kalıcılığı |
| WP-11.T11 | Yedek/geri yükleme: günlük `VACUUM INTO`, 7 gün, `scripts/restore-db.mjs`; migrasyon öncesi zorunlu yedek; yedek AES-256-GCM (`backupAesKey` SecretStore’da) ve ACL+EFS | `scripts/db-backup.mjs`, `scripts/restore-db.mjs` | T4 | Operasyonel geri dönüş |
| WP-11.T12 | Testler: v2 fixture migrasyonu, bozuk JSON, yarım migrasyon, sayım, rollback, 10k görev, boot dedupe, enerji, pencere, audit checkpoint, yedek şifreleme, utilityProcess event loop | `tests/main/storage-v3.test.mjs`, `tests/main/data-integrity.test.mjs` | T1–T11, T13 | Test paketi |
| WP-11.T13 | Ağır DB işleri (`MigrateV2`, `VACUUM INTO`, 10k dışa aktarma, yedek/restore) ayrı **utilityProcess** bağlantısında; main thread yalnızca kısa sorgu; 50 ms üstü işlemde uyarı | `src/main/storage/DbWorker.js`, `scripts/*.mjs` | T1, T11 | Main thread blokajı yok |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Migrasyon sırasında güç kesintisi veri kaybı üretir | Orta | Yüksek | Temp DB + transaction + yedek + rename; yarım temp silinir | JSON `.migrated` dosyasını geri koy, önceki ikiliyi çalıştır |
| `better-sqlite3` paketlemede yüklenmez | Orta | Yüksek | N-API, `**/*.node` asarUnpack, paketli smoke test | Önceki ikili + JSON; native paketleme düzeltilene kadar WP-15 yayınlanmaz |
| Audit zinciri eski kayıtlarla uyumsuz | Orta | Yüksek | Migrasyonda eski kayıtları sırala, HMAC’i yeniden hesapla, checkpoint yaz; HMAC anahtarı yoksa migrasyon durur | Eski audit’i arşivle, yeni zinciri başlat; anahtarı yeniden provisioning yap |
| Ağır DB işi main thread’i kilitler | Orta | Yüksek | Migrasyon/VACUUM/yedek utilityProcess’te; 50 ms üstü sorgu uyarısı; event loop lag ölçümü | İşlemi iptal et, bakım moduna geç, yedeği geri yükle |
| İki süreç aynı DB’yi açar | Orta | Yüksek | `storage.lock` + PID kontrolü; `requestSingleInstanceLock` | İkinci süreci kapat, kullanıcıya bildir |
| 10k görevde UI yavaşlar | Orta | Orta | İndeksler, sayfalama, delta güncelleme (WP-13.T7) | İlk 500 kayıt + “daha fazla” |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-STO-01 | 1000 görevden birini güncelle | Yalnızca 1 satır yazılır; tam dosya yazımı 0 |
| T-STO-02 | v2 fixture’ı migre et | Tüm koleksiyon sayıları ve ayarlar eşleşir; `quick_check=ok` |
| T-STO-03 | Bozuk JSON ile başlat | Uygulama veri üzerine yazmaz; bakım modu; yedekten kurtarma |
| T-STO-04 | Migrasyonu ortasında kill et, yeniden başlat | Temp temizlenir; JSON korunur; ikinci deneme başarılı |
| T-STO-05 | Migrasyon sonrası eski ikiliye dön | `.migrated` → JSON; tüm veri okunur |
| T-STO-06 | Aynı boot’u 100 kez işle | 1 kayıt; 365 gün sınırı; enerji eşleşmesi tek |
| T-STO-07 | Audit kaydını değiştir | `verify()` başarısız; yıkıcı eylemler bloke; alarm |
| T-STO-08 | 22:00 sleep, 23:00 hibernate, 08:00 boot | Son kapanışa göre tek eşleşme; toplam 9 saat; çift sayım yok |
| T-STO-09 | Pzt 23:00–02:00, Salı 01:00 | `true`; `start===end` kaydı reddedilir |
| T-STO-10 | Aynı nonce iki kez | Tek satır; ikinci `REPLAY` |
| T-STO-11 | Audit satırını değiştir; checkpoint dosyasını sil; Event Log özetini temizle | Her biri `auditTampered=true`; yıkıcı eylem bloke; alarm |
| T-STO-12 | `auditHmacKey` yok/bozuk; uygulamayı aç | Açılış bakım modu; yeni audit yazılmaz; düz metin anahtar üretilmez |
| T-STO-13 | 10k görev migrasyonu + yedek sürerken UI heartbeat ölç | Event loop lag < 100 ms; UI donmaz; işlem utilityProcess’te |
| T-STO-14 | Yedek dosyasını aç ve içeriği tara | AES-256-GCM; düz metin görev/audit yok; yanlış anahtarla açılmaz |

---

### WP-12 — Webhook, Wake-on-LAN ve UPS Ağ Sağlamlaştırma

**Amaç:** M-04, M-13, L-07, L-08 ve D-08’i kapatmak.  
**Bağımlılık:** WP-00, WP-04.T1 (webhook sırrı), WP-02.T1.  
**Çıktı:** SSRF korumalı webhook, doğru payload, güvenli WOL, tek NUT bağlantısı.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-12.T1 | URL doğrulama: yalnızca `https:`, port 443/8443, kullanıcı adı/parola yok, host punycode/IDN normalize | `WebhookService.js` | WP-00.T3 | Şema kapısı |
| WP-12.T2 | DNS çözümleme + `ipaddr.js` allowlist (`unicast`); özel/loopback/link-local/CGNAT/mapped reddi; doğrulanmış IP’yi `lookup` ile pinle; SNI/Host koru | `WebhookService.js`, `src/main/security/SsrfGuard.js` | T1 | SSRF kapalı |
| WP-12.T3 | 15 sn timeout, tek `settled` bayrağı, en fazla 3 deneme, 2s/8s/30s + jitter; yalnızca ağ/5xx/429; `Idempotency-Key` sabit | `WebhookService.js` | T2 | M-04/D-08 kapanışı |
| WP-12.T4 | HMAC: `X-PowerPilot-Timestamp`, `X-PowerPilot-Signature: sha256=<hex>`; sır SecretStore’dan; gönderimde `timingSafeEqual` yok (alıcı doğrular) | `WebhookService.js` | T3, WP-04.T1 | Bütünlük |
| WP-12.T5 | SSRF testleri: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, ::1, fe80::/10, fc00::/7, ::ffff:127.0.0.1, 0.0.0.0, redirect, rebinding | `tests/main/webhook-ssrf.test.mjs` | T1–T4 | Test paketi |
| WP-12.T6 | Payload: `eventId`, `event`, `occurredAt`, `deviceId=agentId\|hostname`, `deviceName=os.hostname()`, `appVersion=package.version`, `data`; yanlış alan yok | `WebhookService.js` | WP-00.T3 | M-13 kapanışı |
| WP-12.T7 | WOL: `bind` callback’inde `setBroadcast`, `error` dinleyicisi, 3 sn timeout, tek `resolve`, `close`; broadcast adresi arayüz netmask’inden | `DeviceProfileService.js` | WP-00.T3 | L-07 kapanışı |
| WP-12.T8 | UPS: tek TCP bağlantısı, `LIST VAR ups`, `END LIST VAR`’a kadar parse, 5 sn timeout, 55 sn cache | `UpsMonitor.js` | WP-00.T3 | L-08 kapanışı |
| WP-12.T9 | Testler: webhook retry/timeout, payload, WOL hata, UPS tek bağlantı | `tests/main/webhook.test.mjs`, `device-profile.test.mjs`, `ups.test.mjs` | T1–T8 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Meşru webhook özel ağda çalışır, bloklanır | Orta | Orta | Dokümantasyon; yalnızca genel HTTPS; özel ağ için ayrı imzalı ajan | Webhook’u devre dışı bırak, yerel audit kullan |
| DNS pinning CDN/SNI uyumsuzluğu | Düşük | Orta | `servername` + `Host` doğru; testlerde sanal host | IP pinlemesini kaldırma; yalnızca allowlist’li host |
| Retry fırtınası | Orta | Orta | Exponential backoff + jitter + max 3; idempotency | Kuyruğu durdur, operatöre bildir |
| UPS `LIST VAR` yanıtı büyük | Düşük | Düşük | 64 KB sınır, 5 sn timeout | UPS izlemeyi kapat; kullanıcıya durum göster |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-NET-01 | `http://127.0.0.1`, `https://169.254.169.254` | `SSRF_BLOCKED`; istek gitmez |
| T-NET-02 | Genel HTTPS host; DNS `10.0.0.5` döndür | `SSRF_BLOCKED`; bağlantı yok |
| T-NET-03 | Timeout + `error` aynı anda | Tek retry; çift POST yok |
| T-NET-04 | 302 → iç adres | Yönlendirme izlenmez; `SSRF_BLOCKED` |
| T-NET-05 | Webhook payload | `agentId` varsa `deviceId=agentId`, yoksa hostname; doğru `appVersion`; yanlış alan yok |
| T-NET-06 | WOL soket bind hatası | Promise reject; süreç çökmez |
| T-NET-07 | UPS mock; 4 değişken | 1 TCP bağlantısı; tüm değerler doğru |

---

### WP-13 — Performans, AI Oturumları ve Kaynak Ömrü

**Amaç:** M-05, M-07, M-18, P-03, P-04, P-05, L-09’u kapatmak.  
**Bağımlılık:** WP-00, WP-10.T3 (renderer modülleri).  
**Çıktı:** Oturum başına sequence, 5 sn metrik, olay tabanlı tray, izlenen timer’lar, delta görev güncellemesi.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-13.T1 | AI oturum havuzu: her oturum için ayrı `getSequence()`; semafor=1; `dispose({disposeSequence:false})` + sequence dispose; hata/iptal/quit’te tek temizlik | `AiBackend.js`, `AiService.js`, `AgentOrchestrator.js` | WP-00.T3 | M-05 kapanışı |
| WP-13.T2 | Testler: iki eşzamanlı `ai-parse`, 50 döngü, iptal, quit | `tests/main/ai-session.test.mjs` | T1 | Sızıntısız |
| WP-13.T3 | `MetricCollector`: 5000 ms tick, `_sampling` kilidi, `Promise.allSettled`, 4 sn timeout; `battery` 30 sn; `disksIO` → `diskIops`; `stale` bayrağı | `MetricCollector.js` | WP-00.T3 | M-07/P-03 kapanışı |
| WP-13.T4 | Testler: yavaş ölçüm, üst üste tick, ilk `null`, birim, stale | `tests/main/metric-collector.test.mjs` | T3 | Doğru metrik |
| WP-13.T5 | Tray: 3 sn interval kaldır; `taskManager`/ayar olaylarında debounce 100 ms; imza değişmezse `setContextMenu` yok; quit’te temizle | `main.js` | WP-00.T3 | M-18/P-04 kapanışı |
| WP-13.T6 | `TimerRegistry`: tüm `setTimeout/setInterval` kayıt; `before-quit`/headless `stop()` hepsini temizler; açık handle yok | `src/main/util/TimerRegistry.js`, `main.js`, `src/agent/headless.js` | T5 | L-09 kapanışı |
| WP-13.T7 | Görev görünümü delta: 5 sn’de yalnızca `[data-task-duration]` `textContent`; görev kümesi değişirse tam render; `requestAnimationFrame` | `src/renderer/views/tasks.js` | WP-10.T3 | P-05 kapanışı |
| WP-13.T8 | Testler: 10 sn boşta tray güncellemesi 0; 100 görevde DOM mutation; timer sızıntısı | `tests/main/performance.test.mjs`, `tests/e2e/perf.spec.js` | T5–T7 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| AI semaforu UI’yı kilitler | Orta | Orta | 30 sn timeout, iptal, “model meşgul” durumu | Kuyruğu 1’e düşür, kullanıcıya bildir |
| Metrik 5 sn’de yetersiz kalır | Düşük | Orta | Güç eylemi öncesi taze ölçüm; `stale` kontrolü | 2 sn’ye düşür (sadece aktif görev) |
| Tray olayı kaçar, menü eski kalır | Orta | Düşük | 100 ms debounce + 30 sn güvenlik yenilemesi | Kullanıcı menüyü açınca güncelle |
| Delta güncelleme yanlış satırı günceller | Orta | Orta | `data-task-id` + `data-role`; test | Tam render’a dön |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-PERF-01 | İki eşzamanlı `ai-parse`; ilk oturumu kapat | İkinci hata almaz; iki sonuç; sequence sızıntısı yok |
| T-PERF-02 | Metrik tick’ini 4 sn geciktir; 5 tick gözle | Üst üste ölçüm yok; `stale` doğru; `diskIops` IOPS |
| T-PERF-03 | 10 sn boşta tray | `setContextMenu` 0; durum değişiminde 1 |
| T-PERF-04 | Uygulamayı kapat | Açık timer/handle yok; test runner uyarısı yok |
| T-PERF-05 | 100 görevle 5 sn delta tick | Yalnızca süre hücreleri değişir; tam DOM yenilenmez |
| T-PERF-06 | 50 AI oturumu aç/kapat | RSS artışı < %5; `COMPLETER_UNSUPPORTED` yok |

---

### WP-14 — i18n, Modül Ayrımı ve Ölü Kod Temizliği

**Amaç:** M-17, P-06, P-08 ve C-01–C-08’i kapatmak.  
**Bağımlılık:** WP-10.T3, WP-08, WP-06, WP-07, WP-09, WP-12.  
**Çıktı:** 17 JSON locale, tek aktif sözlük, `vm` yok, temizlenmiş ölü kod.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-14.T1 | Build-time çıkarım: mevcut `i18n.js` + `generatedTranslations` → `src/renderer/locales/<lang>.json` (17 dil) ve `src/main/locales/<lang>.server.json` | `scripts/build-locales.mjs`, `src/renderer/locales/**`, `src/main/locales/**` | WP-10.T3 | JSON sözlükler |
| WP-14.T2 | Renderer `getLocale(lang)` IPC; yalnızca aktif dil; önceki sözlüğü bırak; `lang`/`dir` (ar=RTL) ayarla; ilk boyama için Türkçe statik metin | `src/renderer/core/i18n.js`, `preload.js`, `main.js` | T1 | Tek aktif locale |
| WP-14.T3 | Ana süreç `i18n.js`: `vm.runInContext` kaldır; yalnızca `<lang>.server.json` oku; eksik anahtar Türkçe fallback + uyarı | `src/main/i18n.js` | T1 | M-17 kapanışı |
| WP-14.T4 | `locales:check`: 17 dil, anahtar eşitliği, duplicate, `{placeholder}` parity, kullanılmayan anahtar raporu; CI’da fail | `scripts/check-i18n.js`, `package.json` | T1 | Kalite kapısı |
| WP-14.T5 | Ölü kod süpürme: L-01–L-05, L-10 ve C-01–C-08’in kapandığını doğrula; kalan `TODO` yok | `src/**` | WP-06, WP-07, WP-08, WP-09, WP-12 | Temiz ağaç |
| WP-14.T6 | Testler: tüm dillerde ana ekran/ayarlar; eksik anahtar; RTL; startup bellek | `tests/e2e/i18n.spec.js`, `tests/main/i18n.test.mjs` | T1–T5 | Test paketi |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| `generatedTranslations` kaybolur | Orta | Yüksek | Çıkarım script’i eski dosyayı okur, merge eder, checksum üretir; çıktı diff’i gözden geçirilir | Eski `i18n.js`’i geri koy |
| Bir dilde eksik anahtar UI’yı bozar | Orta | Orta | `t()` fallback + `locales:check`; eksikse Türkçe | Dil seçimini geçici kapat |
| RTL düzeni bozulur | Orta | Orta | `dir=rtl` ve Arapça görsel test | RTL’de yalnızca metin yönü, layout LTR |
| JSON yükleme ilk boyamayı geciktirir | Düşük | Orta | Statik Türkçe iskelet + spinner; tek dosya | Locale’i HTML’e göm (yalnızca aktif dil) |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-I18N-01 | 17 dili sırayla seç; ana ekran/ayarlar/uyarı metinleri | Eksik anahtar yok; çökme yok |
| T-I18N-02 | Ana süreçte `vm` kullanımını ara | 0 eşleşme |
| T-I18N-03 | Açılışta okunan locale dosyası sayısı | Tam 1 |
| T-I18N-04 | `locales:check` bir anahtarı sil | Exit 1; eksik anahtar raporu |
| T-I18N-05 | Arapça seç | `dir=rtl`; metin taşması yok |
| T-I18N-06 | Startup süresi önce/sonra | JS parse süresi en az %50 azalır; bellek artışı yok |

---

### WP-15 — Paketleme, Fuses, İmza, Yük ve Yayın

**Amaç:** Tüm düzeltmelerin paketlenmiş üründe çalıştığını kanıtlamak; imza ve ASAR bütünlüğünü zorunlu kılmak.  
**Bağımlılık:** WP-01–WP-14.  
**Çıktı:** `1.1.0` NSIS installer, doğrulanmış fuses, RFC 3161 timestamp, CycloneDX SBOM/provenance, yük/soak raporu, yayın kontrol listesi.

| ID | İş kalemi | Dosyalar | Bağımlılık | Çıktı |
|---|---|---|---|---|
| WP-15.T1 | `electronFuses` yapılandırması: `runAsNode:false`, `enableCookieEncryption:true`, `enableNodeOptionsEnvironmentVariable:false`, `enableNodeCliInspectArguments:false`, `enableEmbeddedAsarIntegrityValidation:true`, `onlyLoadAppFromAsar:true`, `grantFileProtocolExtraPrivileges:false`, `wasmTrapHandlers:true` | `package.json` | WP-14 | Sertleştirilmiş ikili |
| WP-15.T2 | Kod imzası: sertifika **HSM/TPM destekli Windows sertifika deposunda**; PFX CI secret olarak kabul edilmez; `rfc3161TimeStampServer: "https://timestamp.digicert.com"`, SHA-256; `signtool verify /pa /all`; zaman damgası kontrolü | `package.json`, `scripts/verify-signature.ps1` | T1 | Geçerli imza + anahtar saklama |
| WP-15.T3 | Paketli E2E: NSIS temiz kurulum, 1.0.1 üzerine yükseltme, kaldırma; `app://` asset, SQLite, native modüller | `tests/e2e/packaged.spec.js`, CI | T1, T2 | Kurulum kanıtı |
| WP-15.T4 | 100 ajan konsol yük testi + 24 saat soak; emir kaybı 0, bellek artışı < %5 | `scripts/load-test.mjs`, `docs/reports/soak.md` | WP-03, WP-11 | Yük raporu |
| WP-15.T5 | Bağımlılık ve lisans taraması: `npm audit --omit=dev --audit-level=high`, `npx --yes license-checker --summary` | CI | WP-00.T2 | Temiz rapor |
| WP-15.T6 | Runbook’lar: TLS yenileme, DB geri yükleme, anahtar rotasyonu, olay müdahale, konsol bakım modu | `docs/runbooks/**` | T3 | Operasyon seti |
| WP-15.T7 | Sürüm ve changelog: `1.1.0`; breaking change notları (order v2, DB v3, TLS zorunlu) | `package.json`, `CHANGELOG.md` | T1–T6 | Yayın notu |
| WP-15.T8 | SBOM/provenance: CycloneDX SBOM, lockfile hash’i, artefakt SHA-256’sı ve imzalı yayın manifesti; SBOM release’e eklenir | `scripts/sbom.mjs`, `docs/release/**` | T2, T5 | İzlenebilir tedarik zinciri |

**Riskler**

| Risk | Olasılık | Etki | Azaltım | Fallback |
|---|---|---|---|---|
| Fuses paketlenmiş uygulamayı açılmaz yapar | Orta | Yüksek | `onlyLoadAppFromAsar` + ASAR integrity testi; `npx @electron/fuses read` | Fuse’ları tek tek kapat, hangi fuse’un kırdığını bul; güvenlik kapısından geçmeden yayınlama |
| İmza sertifikası yok/yanlış | Orta | Yüksek | HSM/TPM destekli sertifika; CI’da PFX yok; `signtool verify`; timestamp | İmzasız yayın yok; sürüm ertelenir |
| İmza anahtarı CI’da sızarsa | Düşük | Yüksek | Anahtar dışa aktarılamaz; HSM/TPM; imzalama adımı ayrı ve audit’li | Sertifikayı iptal et, yeni anahtarla yeniden imzala |
| Yükseltme eski DB’yi bozar | Orta | Yüksek | Migrasyon testi + yedek + geri alma | Önceki installer’a dön, `.migrated` geri yükle |
| 24 saat soak’ta bellek sızıntısı | Orta | Orta | Timer/AI temizliği; RSS eşiği; heap snapshot | Sızıntıyı izole et, sürümü geciktir |

**Test ve kabul**

| Test | Senaryo / uygulama adımları | Kabul |
|---|---|---|
| T-REL-01 | `npm run dist`; `npx @electron/fuses read` | Tüm fuse’lar beklenen değerde |
| T-REL-02 | `signtool verify /pa /all` + timestamp | `Successfully verified`; timestamp var |
| T-REL-03 | Temiz Windows’a kur, aç, görev oluştur, kaldır | Çökme yok; kalıntı yok |
| T-REL-04 | 1.0.1 üzerine 1.1.0 kur | Veri migrasyonu başarılı; ayarlar korunur |
| T-REL-05 | 100 ajan 1 saat + 24 saat soak | Emir kaybı 0; p95 < 150 ms; RSS < %5 |
| T-REL-06 | `npm audit --omit=dev --audit-level=high` + `npx --yes license-checker --summary` | High/critical yok; lisans raporu onaylı ve arşivde |
| T-REL-07 | Geri alma provası | 1.0.1 + eski veri ile açılış |
| T-REL-08 | SBOM/manifest üret; artefakt hash’ini yayın notuyla karşılaştır | CycloneDX SBOM var; hash eşleşir; imzalı manifest doğrulanır |

---

## 5. Bulgu → İş Paketi → Test İzlenebilirlik Matrisi

Bu matris **75 kalemi** kapsar: 49 ana bulgu (6 K + 13 H + 18 M + 12 L), 8 performans (P), 10 veri bütünlüğü (D) ve 8 temizlik (C). Her satır birincil iş paketini ve kabul testini gösterir; ikincil savunma katmanları WP metinlerinde ayrıca belirtilmiştir. “Durum” sütunu uygulama başında `Planlandı`, kabul testi geçince `Kapalı` olarak güncellenir.

### 5.1. Kritik ve Yüksek Bulgular

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| K-01 | `params` imza kapsamı dışında | WP-01 | T2, T3 | T-ORD-01, T-ORD-09 | Planlandı |
| K-02 | Konsol düz HTTP `0.0.0.0` | WP-02 | T2, T3 | T-TLS-01, T-TLS-03 | Planlandı |
| K-03 | “Kapatma/kapatmayın” shutdown | WP-06 | T1, T2 | T-PAR-01 | Planlandı |
| K-04 | Koşullu görevde erteleme koşulu atlıyor | WP-06, WP-05 | T4, T5; WP-05.T4 | T-PAR-04, T-SCH-04 | Planlandı |
| K-05 | İndirilenler şablonu klasör `mtime` izliyor | WP-07 | T1, T2, T3 | T-CND-01, T-CND-02, T-CND-03 | Planlandı |
| K-06 | `schtasks /tr` komut enjeksiyonu | WP-05 | T1, T2, T3 | T-SCH-01, T-SCH-02, T-SCH-03 | Planlandı |
| H-01 | mTLS istemci sertifikası baypası | WP-02 | T4 | T-TLS-05, T-TLS-11 | Planlandı |
| H-02 | Düz metin sırlar, zayıf PIN KDF | WP-04 | T1, T2, T3, T4, T5, T6, T7 | T-SEC-01, T-SEC-02, T-SEC-03, T-SEC-04, T-SEC-05, T-SEC-06, T-SEC-07, T-SEC-08, T-SEC-09 | Planlandı |
| H-03 | LAN’da TLS’siz admin anahtarı | WP-02 | T5 | T-TLS-06 | Planlandı |
| H-04 | Kuyruk makbuzdan önce siliniyor | WP-03 | T3, T4 | T-CON-02, T-CON-03 | Planlandı |
| H-05 | Hedef/yayıncı doğrulaması yok, kimlik bağlı değil | WP-01 | T4, T5 | T-ORD-02, T-ORD-05 | Planlandı |
| H-06 | Ajan anahtarı görüntüleyici uçlarına erişiyor | WP-01 | T6 | T-ORD-06 | Planlandı |
| H-07 | Konsol deposu atomik değil, sessiz sıfırlama | WP-03 | T1, T2 | T-CON-01 | Planlandı |
| H-08 | Renderer sayacı arka uçtan bağımsız | WP-08 | T1, T2, T3 | T-REN-01, T-REN-02, T-REN-10 | Planlandı |
| H-09 | İptal akışı ikinci iptal/PIN üretiyor | WP-08 | T4, T5 | T-REN-03 | Planlandı |
| H-10 | Uyarı erteleme süresi yok sayılıyor | WP-06 | T6, T7 | T-PAR-06, T-PAR-07 | Planlandı |
| H-11 | Güvenlik motoru fail-open | WP-09 | T1, T2, T3, T4 | T-SAF-01, T-SAF-02, T-SAF-03, T-SAF-05 | Planlandı |
| H-12 | Boot geçmişi şişiyor, gerçek kayıtlar siliniyor | WP-11 | T6 | T-STO-06 | Planlandı |
| H-13 | Güvenlik bayrakları renderer IPC’sinden değişiyor | WP-10 | T4, T5 | T-CSP-05, T-CSP-08 | Planlandı |

### 5.2. Orta Öncelikli Bulgular

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| M-01 | Anahtar karşılaştırmaları timing-safe değil | WP-01, WP-02 | T8; WP-02.T9 | T-ORD-07, T-TLS-07 | Planlandı |
| M-02 | Enerji tahmininde çift sayım | WP-11 | T8 | T-STO-08 | Planlandı |
| M-03 | Muafiyet penceresi gece yarısı | WP-11 | T9 | T-STO-09 | Planlandı |
| M-04 | Webhook çift retry + SSRF | WP-12 | T1, T2, T3, T5 | T-NET-01, T-NET-02, T-NET-03, T-NET-04 | Planlandı |
| M-05 | AI oturumları paylaşılan sequence’ı dispose ediyor | WP-13 | T1, T2 | T-PERF-01, T-PERF-06 | Planlandı |
| M-06 | `ai-parse` girdisi sınırsız | WP-10 | T7 | T-CSP-06 | Planlandı |
| M-07 | Metrik 2 sn, üst üste binme, disk birimi | WP-13 | T3, T4 | T-PERF-02 | Planlandı |
| M-08 | Konsol senkronu üst üste biniyor, timeout yok | WP-03 | T6 | T-CON-04 | Planlandı |
| M-09 | Yerel API `EADDRINUSE` | WP-02 | T6 | T-TLS-08 | Planlandı |
| M-10 | ID ezme, yanlış HTTP kodu, sahte iptal | WP-02 | T8 | T-TLS-09 | Planlandı |
| M-11 | Renderer yükleyicilerinde hata yakalama yok | WP-08 | T6 | T-REN-04 | Planlandı |
| M-12 | Ayarlar sunucudan önce localStorage’a yazılıyor | WP-08 | T7 | T-REN-05 | Planlandı |
| M-13 | Webhook alan adları ve sabit sürüm | WP-12 | T6 | T-NET-05 | Planlandı |
| M-14 | CSP yok, 23 `innerHTML` lavabosu | WP-10 | T1, T2, T3, T9 | T-CSP-02, T-CSP-03, T-CSP-04 | Planlandı |
| M-15 | Yerel API timeout/slowloris koruması yok | WP-02 | T7 | T-TLS-10 | Planlandı |
| M-16 | `window-maximize-toggle` null/destroyed | WP-08 | T8 | T-REN-06 | Planlandı |
| M-17 | 749 KB i18n iki kez ayrıştırılıyor | WP-14 | T1, T2, T3 | T-I18N-01, T-I18N-02, T-I18N-03 | Planlandı |
| M-18 | Tray 3 sn’de bir yeniden kuruluyor | WP-13 | T5 | T-PERF-03 | Planlandı |

### 5.3. Düşük Öncelikli Bulgular

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| L-01 | `lastProgressMessage` serileştirilmiyor | WP-07 | T4 | T-CND-04 | Planlandı |
| L-02 | Parser ölü kod / eksik saat mantığı | WP-06 | T3 | T-PAR-03 | Planlandı |
| L-03 | `idempotencyCache` kullanılmıyor | WP-02 | T8 | T-TLS-09 | Planlandı |
| L-04 | DeviceProfiler anlamsız VM dalı | WP-09 | T5 | T-SAF-04 | Planlandı |
| L-05 | `setPoll` / `setSetPoll` ölü yolu | WP-08 | T9 | T-REN-07 | Planlandı |
| L-06 | `updateDisplay` 0/0 → NaN | WP-08 | T10 | T-REN-08 | Planlandı |
| L-07 | WOL soketinde error/broadcast yarışı | WP-12 | T7 | T-NET-06 | Planlandı |
| L-08 | UPS her sorguda 4 TCP bağlantısı | WP-12 | T8 | T-NET-07 | Planlandı |
| L-09 | Takip edilmeyen zamanlayıcılar | WP-13 | T6 | T-PERF-04 | Planlandı |
| L-10 | `executeTask` finally gereksiz if/else | WP-06 | T8 | T-PAR-08 | Planlandı |
| L-11 | Geçmiş saat için “yarın” önerilmiyor | WP-06 | T3 | T-PAR-03 | Planlandı |
| L-12 | `restoreActiveState` yalnızca UI+scheduled | WP-08 | T11 | T-REN-09 | Planlandı |

### 5.4. Performans Bulguları

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| P-01 | Her kayıtta tüm JSON yeniden yazılıyor | WP-11 | T3, T5 | T-STO-01, T-STO-13 | Planlandı |
| P-02 | Her heartbeat’te tüm konsol deposu yazılıyor | WP-03 | T7 | T-CON-05, T-CON-07 | Planlandı |
| P-03 | 2 sn seri metrik, reentrancy yok | WP-13 | T3 | T-PERF-02 | Planlandı |
| P-04 | Tray 3 sn’de bir yeniden kuruluyor | WP-13 | T5 | T-PERF-03 | Planlandı |
| P-05 | Görevler görünümü 5 sn’de tam yenileniyor | WP-13 | T7 | T-PERF-05 | Planlandı |
| P-06 | i18n iki kez ayrıştırılıyor | WP-14 | T1, T2 | T-I18N-01 | Planlandı |
| P-07 | Her envanter turunda boot kaydı | WP-11 | T6 | T-STO-06 | Planlandı |
| P-08 | 288 KB tek gömülü script | WP-10 | T3 | T-CSP-03 | Planlandı |

### 5.5. Veri Bütünlüğü Bulguları

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| D-01 | Bozuk JSON sessiz sıfırlama | WP-03 | T1, T2 | T-CON-01 | Planlandı |
| D-02 | Boot geçmişi kirlenmesi | WP-11 | T6 | T-STO-06 | Planlandı |
| D-03 | Enerji çift sayımı | WP-11 | T8 | T-STO-08 | Planlandı |
| D-04 | Gece yarısı muafiyet penceresi | WP-11 | T9 | T-STO-09 | Planlandı |
| D-05 | `schtasks` kabuk enjeksiyonu | WP-05 | T1, T2 | T-SCH-01 | Planlandı |
| D-06 | İptal sonucu yok sayılıyor | WP-02 | T8 | T-TLS-09 | Planlandı |
| D-07 | Doğrulama hatası 500’e dönüşüyor | WP-02 | T8 | T-TLS-09 | Planlandı |
| D-08 | Webhook çift retry | WP-12 | T3 | T-NET-03 | Planlandı |
| D-09 | Koşullu görevde timer’a dönüşüm | WP-06 | T4, T5 | T-PAR-04 | Planlandı |
| D-10 | Başarısız IPC’de “çalıştı” bildirimi | WP-08 | T1, T3 | T-REN-01 | Planlandı |

### 5.6. Temizlik / Ölü Kod Bulguları

| Bulgu | Kısa başlık | WP | İş kalemi | Kabul testi | Durum |
|---|---|---|---|---|---|
| C-01 | `lastProgressMessage` eksik | WP-07 | T4 | T-CND-04 | Planlandı |
| C-02 | Parser ölü kodu | WP-06 | T3 | T-PAR-03 | Planlandı |
| C-03 | `idempotencyCache` kullanılmıyor | WP-02 | T8 | T-TLS-09 | Planlandı |
| C-04 | DeviceProfiler VM dalı | WP-09 | T5 | T-SAF-04 | Planlandı |
| C-05 | `setSetPoll` ölü | WP-08 | T9 | T-REN-07 | Planlandı |
| C-06 | `executeTask` gereksiz if/else | WP-06 | T8 | T-PAR-08 | Planlandı |
| C-07 | Çift `onTimerCancelled` | WP-08 | T4 | T-REN-03 | Planlandı |
| C-08 | Sabit `appVersion` | WP-12 | T6 | T-NET-05 | Planlandı |

### 5.7. Kapsam sayımı

| Grup | Adet | Kapalı hedef |
|---|---:|---:|
| Kritik | 6 | 6 |
| Yüksek | 13 | 13 |
| Orta | 18 | 18 |
| Düşük | 12 | 12 |
| **Ana bulgu toplamı** | **49** | **49** |
| Performans | 8 | 8 |
| Veri bütünlüğü | 10 | 10 |
| Temizlik | 8 | 8 |
| **Genel toplam** | **75** | **75** |

---

## 6. Test Stratejisi ve Uygulama Adımları

### 6.1. Test piramidi

| Katman | Araç | Kapsam | Zorunlu eşik |
|---|---|---|---|
| Birim | Vitest 3.2.4 | Şema, imza, parser, koşul, enerji, pencere, SSRF, scheduler argümanları | Değişen güvenlik modüllerinde satır %95, dal %90 |
| Entegrasyon | Vitest + gerçek `https`/SQLite/süreç | TLS/mTLS, SQLite migrasyonu, konsol heartbeat, webhook timeout, `schtasks` | Tüm kritik akışlar |
| E2E | Playwright 1.64.1 `_electron.launch` | Timer, iptal, PIN, CSP, XSS, i18n, ayar geri alma, pencere | Her PR’da temel; gecelik tam |
| Kaos | Node script + `taskkill` | Bağlantı kopması, çökme, yarım migrasyon, saat sıçraması | Faz 2/3 kapısı |
| Yük | `scripts/load-test.mjs` | 100 ajan, 10.000 emir, 24 saat soak | G3/G4 |

**Genel kapsam eşiği:** `src/main/**` ve `src/console/**` için satır %85, dal %80. İstisna: `src/main/order/**`, `SignedOrderService.js`, `SsrfGuard.js`, `TaskSchedulerBridge.js`, `Pin.js` için satır %95, dal %90. Kapsam düşerse CI fail eder.

### 6.2. Test komutları

```bash
npm ci
npm test                 # Vitest birim + entegrasyon
npm run test:security    # Yasaklı desen + npm audit
npm run test:e2e         # Playwright Electron
npm run verify:pack      # Paketli smoke + fuses + imza
npm run load:console     # 100 ajan yük testi
```

`package.json`’a eklenecek script’ler:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:security": "node scripts/security-check.mjs && npm audit --omit=dev --audit-level=high",
    "test:e2e": "playwright test",
    "verify:pack": "node scripts/verify-pack.js",
    "load:console": "node scripts/load-test.mjs",
    "migrate:storage": "node scripts/migrate-storage.mjs",
    "migrate:secrets": "node scripts/migrate-secrets.mjs",
    "locales:check": "node scripts/check-i18n.js",
    "build:renderer": "tailwindcss -i src/renderer/styles/tailwind.css -o src/renderer/styles.css --minify && node scripts/vendor-assets.mjs && node scripts/build-locales.mjs"
  }
}
```

### 6.3. Test ortamı ve fixture’ları

- **Referans donanım:** Windows 11 23H2 x64, 4 vCPU, 8 GB RAM, SSD, 1 Gbps ağ; 100 ajan aynı konsol örneğine bağlanır, 10.000 emir ve 10.000 görev verisi kullanılır. Daha düşük donanımda eşikler orantılı düşürülür; eşikler donanımdan bağımsız iddia edilmez.
- **Baseline:** `T-BASE-05` ile açılış, görev kaydı, 1.000 görev listesi ve boşta RSS ölçülür; `baseline.json` sürümle birlikte saklanır. 9.2’deki p95 değerleri bu baseline’a göre yorumlanır.
- **Veri:** Üretim verisi kullanılmaz. `tests/fixtures/v2-data/*.json` sentetik görev, geçmiş, audit, emir ve sır alanları içerir; sırlar açıkça `TEST_` önekli sahte değerlerdir.
- **TLS:** `tests/fixtures/tls/` altında 2035’e kadar geçerli test CA’sı, sunucu sertifikası, doğru istemci, yanlış CA istemcisi ve süresi geçmiş istemci bulunur. Sertifikalar test amaçlıdır, üretimde kullanılmaz.
- **Saat:** Playwright `page.clock.install()` + `fastForward('10:00')`; ana süreç testlerinde `nowFn` enjeksiyonu. Gerçek sistem saati değiştirilmez.
- **Süreç:** `schtasks` için `execFileImpl` dependency injection; gerçek Windows entegrasyon testi yalnızca `windows-latest` runner’da ve `PowerPilotTest_<pid>` adıyla çalışır.
- **AI:** `node-llama-cpp` modeli indirilmez; `AiBackend` fake ile iki eşzamanlı oturum, iptal ve dispose test edilir. Gerçek model smoke testi G4’te manueldir.
- **Ağ:** Webhook testleri gerçek internete çıkmaz; `dns.lookup` ve `https.request` enjekte edilir. SSRF testleri için localhost dinleyicisi kullanılmaz; yalnızca resolver/agent stub’ı.

### 6.4. Güvenlik test matrisi

| Test | Saldırı/başarısızlık | Uygulama adımı | Beklenen |
|---|---|---|---|
| T-ORD-01 | `params` değiştirme | İmzalı emri al, `params` içinde `action` değiştir, `verify` | `BAD_SIGNATURE`, icra yok |
| T-ORD-02 | Emri başka ajana gönderme | `targets:[A]` emri B’de doğrula | `WRONG_TARGET`, kuyruk yok |
| T-ORD-04 | Replay | Aynı nonce iki kez | İkinci `REPLAY` |
| T-ORD-09 | Saat kayması | `issuedAt` 3 dk ileri / 11 dk `expiresAt` | `CLOCK_SKEW` / `INVALID_EXPIRY` |
| T-TLS-05 | mTLS baypas | Sertifikasız/self-signed/yanlış CA istemci | 401/403; 2xx yok |
| T-TLS-11 | Sertifika iptali | Parmak izi allowlist’ten çıkar | Yeni handshake 403; keep-alive kapanır |
| T-TLS-08 | Port çakışması | 20 istek altında stop/start | `EADDRINUSE` yok |
| T-TLS-10 | Slowloris | 10 sn header, 100 KB üstü gövde | 408/413; süreç ayakta |
| T-SCH-01 | Komut enjeksiyonu | `id='x" & calc.exe & "'` | `INVALID_TASK_ID`; `calc` yok |
| T-PAR-01 | Olumsuzluk | “kapatma/kapatmayın/kapanmasın” | `action:null` |
| T-PAR-04 | Koşul atlama | `monitoring` görevde ertele | `notBefore`; `targetTime` yok |
| T-SAF-01 | Fail-open | Process provider throw | `allowed:false` |
| T-NET-01 | SSRF loopback | `https://127.0.0.1` | `SSRF_BLOCKED` |
| T-NET-04 | SSRF redirect | 302 → `169.254.169.254` | Yönlendirme yok |
| T-CSP-02 | CSP | Inline script/attribute | 0 ihlal; çalışmaz |
| T-CSP-04 | Stored XSS | Görev başlığında `onerror` | Metin; kod çalışmaz |
| T-CSP-05 | Yetki yükseltme | `save-settings` ile `autonomyMode` | Reddedilir; audit |

### 6.5. E2E senaryoları

1. **Timer ve uyku:** Görev oluştur → `targetTime` 2 sn ileri → ana süreç `task-executed` gönderene kadar “çalıştı” yazmamalı → olay sonrası başarı. Sayaç/uyku senaryosu ayrıca `page.clock.fastForward('10:00')` ile renderer’da doğrulanır; ana süreç timer’ı `nowFn` enjeksiyonuyla birim testte ilerletilir.
2. **IPC reddi:** `schedule-action` stub’ı `{success:false, code:'SAFETY_BLOCKED'}` döndür → sayaç başlamamalı, hata toast’ı görünmeli.
3. **Çift iptal:** Tray iptali ile buton iptali aynı anda → tek `cancel-action`, tek PIN modalı.
4. **Uyandırma:** `visibilitychange` + saat sıçraması → sayaç `Date.now()`’a göre yeniden hesaplanmalı.
5. **XSS:** Görev adı, muafiyet nedeni, webhook adı ve geçmiş detayına `<img onerror>` yaz → hiçbiri çalışmamalı.
6. **i18n:** 17 dil; Arapça RTL; eksik anahtar fallback; dil değişiminde tek locale dosyası.
7. **Ayar geri alma:** `save-settings` reddi → tema/dil eski değerde; localStorage yazılmamış.
8. **Pencere:** Kapanış sırasında minimize/maximize/restore IPC → istisna yok.

### 6.6. Kaos ve veri testleri

| Test | Yöntem | Kabul |
|---|---|---|
| T-CON-02 | Heartbeat yanıtı yazıldıktan sonra soketi kapat | Emir yeniden teslim; kayıp 0 |
| T-CON-03 | Ajan icra sonrası makbuzu düşür | İkinci icra yok; makbuz tekrar |
| T-STO-03 | Bozuk JSON ile açılış | Üzerine yazma yok; bakım modu |
| T-STO-04 | Migrasyon ortasında `taskkill` | Temp temiz; JSON sağlam; tekrar başarılı |
| T-STO-05 | `.migrated` ile geri dönüş | 1.0.1 tüm veriyi okur |
| T-STO-11 | Audit satırı/checkpoint/Event Log özeti kurcalanır | `auditTampered=true`; yıkıcı eylem bloke |
| T-STO-12 | Audit HMAC anahtarı silinir/bozulur | Bakım modu; yeni audit yok; düz metin anahtar yok |
| T-STO-13 | 10k görev migrasyonu + yedek sürerken UI heartbeat | Event loop lag < 100 ms; işlem utilityProcess’te |
| T-STO-14 | Yedek dosyasını aç, içeriği tara | AES-256-GCM; düz metin yok; yanlış anahtar reddedilir |
| T-CON-07 | 100 ajan heartbeat’i sürerken konsol yedeği al | p95 < 150 ms; event loop lag < 100 ms; yedek `quick_check=ok` |
| T-PERF-04 | Kapanışta açık handle | `process._getActiveHandles()` beklenen set |
| T-REL-03 | NSIS temiz kurulum/kaldırma | Kalıntı yok |
| T-REL-04 | 1.0.1 → 1.1.0 yükseltme | Migrasyon + ayarlar korunur |

### 6.7. Test yürütme sırası

1. WP-00: `npm test`, `test:security`; baseline yeşil.
2. WP-01/WP-02: önce birim (imza/TLS), sonra entegrasyon (gerçek TLS), en son E2E.
3. WP-03/WP-11: önce fixture migrasyonu, sonra kaos, en son 100 ajan yük.
4. WP-04/WP-12/WP-13: hata enjeksiyonu ve kaynak ömrü; ardından 24 saat soak.
5. WP-10/WP-14: CSP/XSS/i18n E2E; görsel regresyon.
6. WP-15: paketli smoke → yükseltme → geri alma → imza/fuses.

---

## 7. Dağıtım, Migrasyon ve Geri Alma

### 7.1. Yayın öncesi zorunlu hazırlık

| Adım | İşlem | Kanıt | Sorumlu |
|---|---|---|---|
| 1 | Konsol emir üretimini dondur; bakım penceresini duyur | `orders_frozen=true` audit kaydı | Operasyon |
| 2 | Uygulama `powerpilot_data.json`, konsol `console-store.json` ve `secrets.v1.json` yedeği al | SHA-256 + kopya yolu | Veri sahibi |
| 3 | 1.0.1 ikilisini ve installer’ı arşivle | `artifacts/1.0.1/` | Release |
| 4 | Test CA/sunucu/istemci sertifikalarını doğrula; süre ve SAN kontrolü | `openssl x509 -noout -dates -subject -ext subjectAltName` | Güvenlik |
| 5 | Disk alanı: DB boyutunun en az 2 katı; günlük yedek yolu | `Get-PSDrive` çıktısı | Operasyon |
| 6 | Geri alma provasını test kopyasında çalıştır | `T-STO-05`, `T-REL-07` yeşil | QA |
| 7 | 100 ajan yük testi ve 1 saatlik ön soak | `load-test` raporu | QA |

### 7.2. Emir protokolü v2 geçişi

Eski ajanlar v2 emri doğrulayamaz; yeni ajanlar v1 emri kabul etmez. Bu nedenle geçiş, emir üretiminin durduğu kısa bir bakım penceresinde yapılır. **v1’e güvenlik fallback’i yoktur.**

| Sıra | İşlem | Doğrulama | Geri alma |
|---|---|---|---|
| 1 | Konsol emir üretimini dondur | Yeni emir yok; kuyruk sabit | Emirleri serbest bırak |
| 2 | Ajanları 1.1.0’a yükselt (5 canary) | Log’da v1 emir `UNSUPPORTED_ORDER_VERSION`; icra yok | Canary’yi 1.0.1’e döndür |
| 3 | Tüm ajanları yükselt | Heartbeat ve envanter çalışır; yıkıcı emir yok | Toplu geri alma paketi |
| 4 | Konsolu 1.1.0’a yükselt | v2 imza; `keyId` doğru | Konsolu 1.0.1’e döndür |
| 5 | Canary ajana kendi MAC/broadcast değeriyle `wake` test emri gönder | `inflight` → `acked`; makbuz | Emri iptal et |
| 6 | Kuyruk ve makbuz oranını 10 dk izle | `acked/expired` oranı; hata yok | Emir üretimini durdur |
| 7 | Bakım penceresini kapat | Operatör onayı | — |

**Kritik kural:** Adım 3–4 arasında yıkıcı emir gönderilmez. Bu pencere 30 dakikayı aşarsa işlem durdurulur; yeni bir bakım penceresi planlanır. Yeni ajanlar **hiçbir v1 emri kabul etmez**; v1 zarfı `UNSUPPORTED_ORDER_VERSION` ile reddedilir. Canary testi, konsol 1.1.0’a yükseltildikten sonra v2 imzalı `wake` emriyle yapılır.

### 7.3. Uygulama deposu v2 → v3 migrasyonu

```text
1. Uygulamayı kapat (GUI + headless).
2. powerpilot_data.json → backups/powerpilot_data.v2.<timestamp>.json
3. SHA-256 hesapla, yedekle birlikte manifest’e yaz.
4. npm run migrate:storage -- --dry-run
   - şema doğrula, sayıları raporla, yazma yapma.
5. npm run migrate:storage
   - powerpilot.db.tmp oluştur, transaction, sayım/checksum, quick_check.
6. Başarılıysa:
   - powerpilot.db.tmp → powerpilot.db (atomic rename)
   - powerpilot_data.json → powerpilot_data.json.migrated
   - manifest’e schema_version=3 yaz.
7. Başarısızsa:
   - tmp sil, JSON yerinde kalır, uygulama bakım modunda açılır.
8. Uygulamayı aç; görev/ayar/audit sayılarını doğrula.
9. 30 gün sonra .migrated dosyasını arşivle.
```

**Migrasyon sayım kontrolü:** `tasks`, `history`, `templates`, `webhooks`, `exemptions`, `maintenance_windows`, `audit_log`, `boot_history` tablolarının satır sayıları JSON kaynak sayılarıyla birebir eşleşir. `audit_log` için kayıtlar sıralanır, HMAC zinciri `auditHmacKey` ile yeniden hesaplanır, günlük checkpoint yazılır ve `verify()` `ok` döner. Fark varsa migrasyon başarısız sayılır; hiçbir tablo yarım bırakılmaz.

### 7.4. Konsol deposu migrasyonu

```text
1. Konsolu durdur; 100 ajan heartbeat’i durur.
2. console-store.json → backups/console-store.v1.<timestamp>.json
3. console.db.tmp oluştur; schema v1; transaction.
4. Ajan, kuyruk, audit ve anahtar sayılarını karşılaştır.
5. quick_check + foreign_key_check.
6. console.db.tmp → console.db; JSON → console-store.json.migrated.
7. Konsolu aç; 5 canary heartbeat; kuyruk/makbuz doğrula.
```

**Bozuk JSON:** Parse hatasında konsol **bakım modu**na geçer; HTTP 503 döner, dosyayı silmez, üzerine yazmaz. Operatör yedeği geri yükler; yedek yoksa yalnızca onaylı onarım script’i çalıştırılır. Otomatik sıfırlama yoktur.

### 7.5. Sır migrasyonu

```text
1. Uygulamayı kapat.
2. `await safeStorage.isAsyncEncryptionAvailable()` doğrula; false ise dur.
3. Düz metin sırları oku; her birini encryptStringAsync ile şifrele.
4. secrets.v1.json.tmp yaz; `decryptStringAsync().result` ile geri oku; eşleşmeyi doğrula; `shouldReEncrypt` ise yeni cipher’ı yaz.
5. Atomic rename; eski alanları null yap; powerpilot_data.json’u yeniden yaz.
6. backups/*.json içinde secret alanı ara; bulunanları sil; audit’e yaz.
7. Audit’e “secrets_migrated” ve “plaintext_backups_purged” yaz.
8. Uygulamayı aç; konsol anahtarı ve webhook sırrı ile smoke test yap.
```

**Fallback yok:** `safeStorage` kullanılamıyorsa uygulama açılmaz. Düz metne geri dönülmez. Sırlar kaybolursa yeniden provisioning yapılır; eski yedekten düz metin geri getirilmez.

### 7.6. TLS ve sertifika dağıtımı

1. **CA:** Kurumsal CA kullanılır; yoksa 10 yıllık özel üretim CA’sı oluşturulur. Yalnızca `basicConstraints=CA:TRUE`, `keyCertSign`.
2. **Sunucu:** `CN=console.<domain>`, SAN `DNS:console.<domain>`, `IP:<LAN IP>`; EKU Server Auth; **90 gün**; yenileme 30 gün önce.
3. **İstemci:** `CN=agent_<id>` veya `CN=admin_<user>`; EKU Client Auth; **30 gün**; yenileme 7 gün önce.
4. **Dağıtım:** CA sertifikası ajanlara; istemci PFX’i yalnızca ilgili ajana; parola SecretStore’da.
5. **Allowlist:** mTLS modunda `localApiAllowedClientFingerprints` en az bir SHA-256 parmak izi içerir; boşsa LAN API başlamaz. İptal, parmak izini listeden çıkarmakla anında etkili olur; kısa ömür bu kontrolü destekler.
6. **Yenileme:** Sunucu bitişten 30 gün, istemci 7 gün önce yenilenir; eski parmak izi 24 saat paralel tutulur, sonra kaldırılır. CRL/OCSP bu dağıtımda zorunlu değildir; kurumsal politika gerektirirse allowlist korunur.
7. **Doğrulama:** `T-TLS-04`, `T-TLS-05`, `T-TLS-06`, `T-TLS-11`; handshake hatası log’u.
8. **Ağ:** Windows Firewall’da yalnızca 443/8443 gelen kuralları; `0.0.0.0` HTTP kuralı yok; kural dağıtımı `scripts/firewall.ps1` ile yapılır.

### 7.7. Renderer `app://` ve CSP geçişi

1. `npm run build:renderer` ile Tailwind CSS, vendor qrcode ve locale JSON üret.
2. `app://powerpilot/index.html` ve `mini.html` yükle; asset 404’lerini kontrol et.
3. CSP başlığını doğrula; `securitypolicyviolation` sayısı 0 olmalı.
4. E2E: timer, iptal, görev, ayar, geçmiş, yasal ekranlar.
5. Paketli ASAR’da aynı testleri çalıştır.
6. Sorun varsa **önceki build’e dön**; üretimde `file://` + `unsafe-inline` kombinasyonuna dönülmez.

### 7.8. Geri alma matrisi

| Arıza | Tespit | Acil işlem | Veri | Sürüm |
|---|---|---|---|---|
| v2 emir doğrulanmıyor | `BAD_SIGNATURE` artışı | Emir üretimini durdur | Kuyruk TTL | Ajan+konsol 1.0.1 |
| TLS handshake başarısız | `TLS_HANDSHAKE_FAILED` | LAN API’yi loopback’e al, bakım modu | Ayarlar korunur | Sertifika geri al |
| DB migrasyonu başarısız | `quick_check`/sayım farkı | Uygulamayı bakım modunda tut | `.migrated` → JSON | 1.0.1 |
| Konsol DB bozuk | `quick_check` fail | 503 bakım modu | JSON yedeği | 1.0.1 konsol |
| Sır çözülemiyor | `DPAPI` hatası | Uygulamayı açma | Yeniden provisioning | 1.1.0 |
| CSP asset kırıyor | 404/CSP ihlali | Önceki build | Veri etkilenmez | 1.0.1 build |
| `schtasks` başarısız | Görev oluşmuyor | Bridge’i kapat, uygulama içi timer | Görevler korunur | 1.1.0 |
| AI oturumu kilitli | `AI_BUSY` | AI’ı kapat, deterministik parser | Görevler korunur | 1.1.0 |
| Webhook SSRF blokları | `SSRF_BLOCKED` artışı | Webhook’u kapat | Kuyruk korunur | 1.1.0 |

### 7.9. PR sırası

| PR | WP | Bağımlılık | Tahmini gün |
|---|---|---|---|
| PR-01 | WP-00 | — | 3 |
| PR-02 | WP-05 | PR-01 | 1,5 |
| PR-03 | WP-06 | PR-01, PR-02 | 2 |
| PR-04 | WP-07 | PR-03 | 2 |
| PR-05 | WP-01 | PR-01 | 4 |
| PR-06 | WP-02 | PR-05 | 4 |
| PR-07 | WP-04 | PR-06 | 2 |
| PR-08 | WP-03 | PR-06 | 3 |
| PR-09 | WP-08 | PR-03, PR-04 | 3 |
| PR-10 | WP-09 | PR-01, PR-02 | 1,5 |
| PR-11 | WP-10 | PR-09, PR-10 | 4 |
| PR-12 | WP-11 | PR-08, PR-04 | 5 |
| PR-13 | WP-12 | PR-06, PR-07 | 2 |
| PR-14 | WP-13 | PR-11 | 2 |
| PR-15 | WP-14 | PR-11, PR-13, PR-14 | 2 |
| PR-16 | WP-15 | Tümü | 2 |

Bu günler iki geliştirici ve paralel PR yürütmesi için alt sınırdır; tek geliştirici 14–16 hafta, iki geliştirici 8–10 hafta varsayımıyla uyumludur. Spike PR-01 içinde 1 günlük alt sınırdır; sertifika temini, 24 saat soak ve sızma testi bu tabloya dahil değildir.

---

## 8. Konsolide Risk Kaydı

WP tablolarındaki risklerin yanında, program seviyesinde izlenen riskler aşağıdadır. Her riskin bir tetikleyicisi, azaltımı ve geri dönüş yolu vardır.

| ID | Risk | O | E | Tetikleyici | Azaltım | Fallback | Sahip |
|---|---|---|---|---|---|---|---|
| R-01 | Migrasyonda veri kaybı | Orta | Yüksek | Sayım/checksum farkı, yarım DB | Yedek + temp DB + transaction + kuru çalıştırma | `.migrated` → JSON, 1.0.1 | Veri sahibi |
| R-02 | v2 geçişinde operasyon durması | Yüksek | Yüksek | Ajan/konsol sürüm uyumsuzluğu | Bakım penceresi, canary, emir dondurma | 1.0.1’e dön, kuyruk TTL | Release |
| R-03 | TLS sertifika kilidi | Yüksek | Yüksek | Yanlış CA/SAN/parmak izi | Canary, 24 saat eski sertifika, loopback acil erişim | LAN API’yi kapat, bakım modu | Güvenlik |
| R-04 | Fail-closed meşru kapanmayı engeller | Orta | Yüksek | `powercfg`/provider hatası | Gerekçe + runbook + yerelleştirme testi | PIN’li tek seferlik istisna (audit’li) | Güvenlik |
| R-05 | Native modül paketlemede yüklenmez | Orta | Yüksek | `better-sqlite3`/Argon2 `.node` eksik | `asarUnpack **/*.node`, paketli smoke | Önceki sürüm; düzeltilmiş paket | Release |
| R-06 | CSP/Tailwind görsel regresyon | Yüksek | Orta | Eksik dinamik sınıf | `safelist`, görsel regresyon, CSP raporu | Eksik sınıfları ekle; önceki build | Frontend |
| R-07 | Aynı kullanıcı zararlı yazılımı sırları okur | Orta | Yüksek | Aynı oturumda malware | DPAPI + ACL + EDR; tehdit modeli dokümanı | OS yeniden kurulum, anahtar rotasyonu | Güvenlik |
| R-08 | DNS rebinding / CDN uyumsuzluğu | Düşük | Yüksek | DNS değişimi, SNI hatası | DNS pinning, `servername`, allowlist | Webhook’u kapat | Backend |
| R-09 | SQLite bozulması | Düşük | Yüksek | Güç kesintisi, disk hatası | WAL+FULL, günlük yedek, `quick_check` | Son yedek, karantina | Veri sahibi |
| R-10 | AI model bellek şişmesi | Orta | Orta | Oturum/sequence sızıntısı | Semafor 1, `finally` dispose, 50 döngü testi | AI’ı kapat, parser | Backend |
| R-11 | Makbuz fırtınası / tekrar teslim | Orta | Orta | Ajan makbuz gönderemiyor | TTL, deneme limiti, idempotent ajan | Emri `expired` işaretle | Operasyon |
| R-12 | Audit zinciri kurcalanması | Düşük | Yüksek | HMAC/checkpoint uyuşmazlığı | HMAC zinciri + günlük checkpoint + Event Log + açılışta verify | Yıkıcı eylemleri durdur, adli inceleme | Güvenlik |

**Artık riskler (kabul edilen):** Aynı kullanıcıda çalışan zararlı süreç, yönetici yetkili yerel saldırgan, işletim sistemi çekirdeği ele geçirilmesi ve tedarik zinciri saldırısı bu planın garanti ettiği kapsam dışındadır. Bu riskler dokümante edilir; ürün “DPAPI aynı kullanıcı malware’ine karşı korur” iddiasında bulunmaz.

---

## 9. Yayın Kabul Kriterleri

### 9.1. Kapı kanıtları

| Kapı | Kanıt | Onay |
|---|---|---|
| G0 | WP-00 testleri, S1–S4 spike kanıtları, baseline tag, geri alma runbook’u; K-03–K-06 ve H-10 regresyonu | QA + Release |
| G1 | WP-01/02/04 testleri; TLS/mTLS entegrasyonu; sızma testi tekrarı | Güvenlik |
| G2 | WP-03/08/09/10 testleri; E2E; CSP 0 ihlal; XSS 0; fail-closed | Güvenlik + QA |
| G3 | WP-11/12/13 testleri; v2→v3 migrasyon, audit checkpoint, utilityProcess, 100 ajan yük, kaos, geri alma | Veri + QA |
| G4 | WP-14/15 testleri; fuses, imza, ASAR, SBOM/provenance, NSIS, 24 saat soak, yükseltme | Release + Ürün |

### 9.2. Ölçülebilir kabul

| Kriter | Hedef | Ölçüm |
|---|---|---|
| Referans donanım | 4 vCPU, 8 GB RAM, SSD, 1 Gbps; 100 ajan | `baseline.json` |
| Kapsam | 75/75 kalem kapalı | İzlenebilirlik matrisi |
| Açık bulgu | 0 K, 0 H, 0 M, 0 L | Denetim kapanış raporu |
| Birim/entegrasyon | %100 geçen test | `npm test` |
| Kapsam eşiği | Genel %85 satır; güvenlik modülleri %95 | Vitest coverage |
| E2E | %100 kritik senaryo | Playwright |
| Uygulama açılışı | p95 < 2 sn (referans donanım) | `performance.now()` |
| Görev kaydı | p95 < 20 ms | SQLite profil |
| Konsol heartbeat | p95 < 150 ms, 100 ajan | `load-test` |
| Ağır DB işi | Event loop lag < 100 ms; işlem utilityProcess’te | `perf_hooks` + `T-STO-13` |
| Emir kaybı | 0 (10.000 emir kaos) | Kuyruk/makbuz sayımı |
| 24 saat soak | RSS artışı < %5 | `soak.md` |
| Audit | HMAC/checkpoint %100 doğrulanır; kurcalamada blok | `T-STO-07`, `T-STO-11`, `T-STO-12` |
| Saat kayması | 120 s tolerans; 10 dk TTL; negatif sayaç yok | `T-ORD-09`, `T-REN-10` |
| Yedek | AES-256-GCM; düz metin yok; `quick_check=ok` | `T-STO-14`, `T-CON-07` |
| CSP | 0 ihlal | Playwright console |
| Düz metin sır | 0 eşleşme | `security-check` + manuel |
| Fuses | Tümü beklenen | `@electron/fuses read` |
| İmza | Geçerli + timestamp; HSM/TPM | `signtool verify` |
| SBOM | CycloneDX + artefakt SHA-256 | `T-REL-08` |
| Migrasyon | %100 sayı/checksum | Migrasyon raporu |
| Geri alma | 1.0.1 + eski veri açılıyor | `T-STO-05` |
| Bağımlılık | High/critical yok | `npm audit` |

### 9.3. İş paketi Definition of Done

Bir WP ancak aşağıdakilerin tamamı sağlandığında kapanır:

1. Kod ve şema değişikliği merge edildi.
2. WP’deki tüm testler yeşil; yeni testler CI’da zorunlu.
3. `security-check` ve `locales:check` temiz.
4. Audit log’a ilgili olaylar eklendi; HMAC/checkpoint doğrulandı; sır/kişisel veri log’a yazılmıyor.
5. Runbook ve geri alma adımı güncellendi.
6. En az bir peer review; güvenlik WP’lerinde güvenlik review’i.
7. Ölçülebilir kabul kriteri kanıtı PR’a eklendi.
8. `TODO/FIXME` veya geçici bayrak kalmadı.

### 9.4. Yayın sonrası izleme (7 gün)

| Metrik | Uyarı eşiği | Aksiyon |
|---|---|---|
| `expired` emir oranı | > %1 | Operatör sayfası; kuyruk incelemesi |
| TLS handshake hatası | > 5/dk | Sertifika/CA kontrolü; loopback |
| `SSRF_BLOCKED` | Artış | Webhook hedefini doğrula; saldırı mı? |
| CSP ihlali | > 0 | UI regression; derhal düzelt |
| DB `busy`/kilit | > 5/dk | Yazma yolunu incele; WAL checkpoint |
| Renderer crash | > 1/saat | Crash dump; sürüm geri alma |
| Emir icra hatası | > %2 | Ajan log’u; emri durdur |
| AI `AI_BUSY` | > %10 | Semafor/timeout; AI’ı kapat |

---

## 10. Kaynaklar

Aşağıdaki birincil kaynaklar 22 Ekim 2026’da doğrulanmıştır.

### Electron

1. Electron — Security Checklist. https://www.electronjs.org/docs/latest/tutorial/security
2. Electron — Context Isolation. https://www.electronjs.org/docs/latest/tutorial/context-isolation
3. Electron — Process Sandboxing. https://www.electronjs.org/docs/latest/tutorial/sandbox
4. Electron — `safeStorage` API. https://www.electronjs.org/docs/latest/api/safe-storage
5. Electron — Fuses. https://www.electronjs.org/docs/latest/tutorial/fuses
6. Electron — ASAR Integrity. https://www.electronjs.org/docs/latest/tutorial/asar-integrity
7. Electron — `protocol` API. https://www.electronjs.org/docs/latest/api/protocol
8. Electron — Releases. https://releases.electronjs.org/
9. Electron — `session` API (permission handlers). https://www.electronjs.org/docs/latest/api/session

### Node.js

10. Node.js 24.17.0 Release. https://nodejs.org/en/blog/release/v24.17.0
11. Node.js — `node:sqlite` (Release Candidate). https://nodejs.org/docs/latest-v24.x/api/sqlite.html
12. Node.js — `tls`. https://nodejs.org/api/tls.html
13. Node.js — `crypto` (`timingSafeEqual`, Ed25519). https://nodejs.org/api/crypto.html
14. Node.js — `child_process`. https://nodejs.org/api/child_process.html
15. Node.js — `dns`. https://nodejs.org/api/dns.html
16. Node.js — `https`. https://nodejs.org/api/https.html
17. Node.js — `http` (`closeAllConnections`). https://nodejs.org/api/http.html

### Güvenlik standartları

18. OWASP — Password Storage Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
19. OWASP — Server-Side Request Forgery Prevention Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
20. RFC 8785 — JSON Canonicalization Scheme (JCS). https://www.rfc-editor.org/rfc/rfc8785.html
21. RFC 3161 — Time-Stamp Protocol (TSP). https://www.rfc-editor.org/rfc/rfc3161.html

### Windows

22. Microsoft Learn — `schtasks create`. https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create
23. Microsoft Learn — `powercfg`. https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/powercfg
24. Microsoft Learn — CNG DPAPI. https://learn.microsoft.com/en-us/windows/win32/seccng/cng-dpapi
25. Microsoft Learn — `icacls`. https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls

### SQLite ve paketler

26. SQLite — Write-Ahead Logging. https://www.sqlite.org/wal.html
27. SQLite — PRAGMA. https://www.sqlite.org/pragma.html
28. better-sqlite3. https://github.com/WiseLibs/better-sqlite3
29. canonicalize (RFC 8785 JavaScript referansı). https://www.npmjs.com/package/canonicalize
30. `@node-rs/argon2`. https://www.npmjs.com/package/@node-rs/argon2
31. node-llama-cpp — Low-level API. https://node-llama-cpp.withcat.ai/guide/low-level-api
32. systeminformation — Stats functions. https://systeminformation.io/statsfunctions.html
33. Playwright — Electron. https://playwright.dev/docs/api/class-electron
34. Tailwind CSS — Installation/CLI. https://tailwindcss.com/docs/installation
35. Electron — `utilityProcess` API. https://www.electronjs.org/docs/latest/api/utility-process
36. Microsoft Learn — `wevtutil`. https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wevtutil
37. Microsoft Learn — `New-NetFirewallRule`. https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule
38. CycloneDX — Specification overview. https://cyclonedx.org/specification/overview/
39. NIST SP 800-57 Part 1 Rev. 5 — Key Management. https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final

---

## 11. Sonuç

Bu plan, denetimdeki 49 bulgunun tamamını ve raporun performans, veri bütünlüğü, temizlik bölümlerini tek bir uygulanabilir programa bağlar. En kritik üç değişiklik şunlardır:

1. **Emir güvenliği:** `params` dahil RFC 8785 imzası, hedefe bağlı ajan kimliği, makbuzlu teslim ve HTTPS/mTLS. Bu dörtlü K-01, K-02, H-04, H-05’i birlikte kapatır.
2. **Kullanıcı niyetinin korunması:** Olumsuzluk koruması, koşullu görevde `notBefore`, `directory_idle` ve fail-closed güvenlik motoru. K-03, K-04, K-05 ve H-11 doğrudan “istenmeyen anda kapanma” riskini kaldırır.
3. **Tek doğruluk kaynağı ve dayanıklı depolama:** Renderer yalnızca ana süreçteki `targetTime`/durumu gösterir; SQLite WAL + atomik migrasyon + HMAC audit zinciri + günlük checkpoint veri kaybını ve sessiz sıfırlamayı bitirir.
4. **Kanıt ve tedarik zinciri:** Kısa ömürlü sertifikalar + parmak izi allowlist’i iptali, HSM/TPM tabanlı kod imzalama, CycloneDX SBOM ve S1–S4 spike kapısı; “çalıştığını varsayma” yerine paketli ortamda kanıt arar.

Plan, güvenlik davranışını geri alınabilir bir bayrak arkasına saklamaz. Geri dönüş yalnızca yedek veri ve önceki ikili ile yapılır; böylece “geçici olarak eski açık davranışa dönme” operasyonel bir seçenek olmaktan çıkar. Kalan tek gerçek belirsizlik, G0’daki spike sonuçları ve dış sertifika/soak takvimidir; ikisi de kapıdan geçmeden sonraki faza ilerlemez.
