# Changelog — Power Pilot (WBS-10.4)

## [Unreleased]

### Dokümantasyon ve Altyapı
- GitHub topluluk dosyaları eklendi: güvenlik politikası, katkı rehberi,
  davranış kuralları, destek rehberi, CODEOWNERS, issue/PR şablonları ve
  sürüm notu kategorileri.
- CI; salt-okunur izinler, eşzamanlılık, zaman aşımı, coverage/Playwright
  artefaktları ve sürümden bağımsız installer yollarıyla güncellendi.
  Haftalık bağımlılık denetimi ve Dependabot yapılandırması eklendi.
- README sürüm rozeti 1.1.0'a güncellendi; dokümantasyon indeksi ve GitHub
  politikaları bağlandı.

### Düzeltmeler
- **Dil sızıntıları giderildi.** Pencere denetimlerinin ve diyalog kapatma
  düğmelerinin erişilebilir adları (`aria-label`) sabit Türkçe/İngilizce
  yerine sözlükten geliyor; sesli komut "dinleniyor" durumu, açılış hata
  penceresi, AI netleştirme soruları/mesajları ve AI durum satırı aktif dile
  çevrildi. AI modeli indirme/yükleme hataları servis içindeki Türkçe metin
  yerine kod → sözlük anahtarı eşlemesiyle gösteriliyor (disk alanı, bağlantı,
  HTTP durumu, bütünlük doğrulaması); teknik ayrıntı log'da kalıyor.
  Statik Türkçe iskelet, sözlük uygulanana kadar `i18n-pending`
  kapısıyla gizlendiği için başka dilde açan kullanıcı yanlış dil görmez.
  Oturum içi dil değişiminde Smart Finish gibi çalışma zamanında üretilen
  etiketler de anahtardan yeniden çevriliyor (eski dilde kalmıyor).
  Yeni regresyon testi (`tests/renderer/i18n-keys.test.mjs`) tüm i18n
  başvurularının sözlükte bulunmasını, 17 dilin anahtar eşitliğini ve
  ikon-only düğmelerin i18n'li erişilebilir adını doğrular. E2E tarafında
  `i18n-all` pencere denetimlerinin 17 dildeki erişilebilir adını, yeni
  `i18n-switch` ise yeniden yükleme olmadan dil değişimini doğrular.
- **Ayarları kaydetmek gereksiz PIN istiyordu.** Dil/tema gibi güvenlik dışı
  ayarlar kaydedilirken değişmemiş `autonomyMode` alanı da patch'e girdiği
  için PIN'siz kurulumda tüm kayıt `PIN_REQUIRED` ile engelleniyordu.
  Güvenlik alanı artık yalnızca gerçekten değiştiğinde gönderiliyor; otorite
  değişimi PIN kapısından geçmeye devam ediyor.
- **P0 — Zamanlanmış güç eylemleri yükseltilmemiş kurulumda hiç çalışmıyordu.**
  Güvenlik motoru, aktif güç isteği kontrolü için `powercfg.exe /requests`
  çalıştırıyor; bu komut yönetici yetkisi ister ve paketlenmiş uygulama
  `asInvoker` çalışır. Sonuç: her görev `POWER_REQUESTS_UNAVAILABLE` ile
  engelleniyordu (fail-closed yanlış yere uygulanıyordu). Motor artık bir
  **yetenek sondası** yapar: yetenek varsa eski fail-closed davranışı aynen
  korunur; yetenek yoksa yalnız bu kapı atlanır ve durum **görünür** olur
  (`loadCheck: "unavailable"`, `audit` kaydı `power_request_check_unavailable`,
  Ayarlar uyarısı). `node scripts/safety-probe.mjs` ile tanı alınabilir.
- Uyarı bannerındaki Durdur/Ertele işlemleri PIN kapısını beklemiyordu; eylemler
  async hale getirildi, TOCTOU koruması eklendi ve banner yalnızca başarılı
  sonuçta kapanıyor.
- Material Symbols ikon fontu yüklenene kadar ligatür adları görünüyordu;
  `fonts-pending` açılış kapısı ile ikonlar font hazır olana kadar gizleniyor.
- Renderer `app://powerpilot` üzerinden yüklendiği için yalnızca `src` dizini
  sunuluyor; `../powerpilot_icon.png` ve `../public/Vellium-logo.svg` yolları
  404 dönüyordu ve arayüzde kırık görsel olarak görünüyordu. Logolar
  `src/assets/` altına alındı ve yollar güncellendi; `src` dışına işaret eden
  varlıkları yakalayan regresyon testi eklendi.
- Yerel REST API kartında not metinleri düğmelere yapışıyordu: 12 px yazı,
  notlar arası ve düğme öncesi düzenli boşluk, dar pencerede sarma eklendi.
  İkincil düğme kontrastı artırıldı.
- Koyu temada yerel form denetimleri (onay kutuları) beyaz çiziliyordu;
  `color-scheme: dark` ile tema uyumlu hale getirildi.
- Türkçe metinler düzeltildi: `Telefon QR'si` → `Telefon QR Kodu`,
  QR notundaki `tuş` → `anahtar`.

## [1.1.0] — Security & Reliability Hardening (2026-10-23)

### Güvenlik
- Emir imzası v2: RFC 8785 kanonik tam nesne imzası, nonce tek kullanım,
  `keyId`/`issuer` doğrulaması, makbuz uçları ve denetim kaydı.
- TLS/mTLS tek kaynak (`TlsConfig`); sessiz HTTP fallback yok. LAN ve konsol
  HTTPS zorunlu; konsol yalnızca loopback + açık `PP_ALLOW_INSECURE_CONSOLE=1`
  ile HTTP'ye izin verir.
- Sırlar Electron `safeStorage`/DPAPI ile `secrets.v1.json`'da; Argon2id PIN,
  deneme kilidi, ACL/EFS, log redaksiyonu ve dışa aktarımda maskeleme.
- `app://powerpilot` protokolü, katı CSP + güvenlik başlıkları, `sandbox:true`,
  IPC gönderen allowlist'i, dış bağlantı host allowlist'i, CSP ihlal logu.
- Güvenlik ayarları PIN'li ayrı IPC'de; API anahtarı üretimi denetlenir.
- Webhook HTTPS-only + SSRF DNS pinning + HMAC; WOL broadcast netmask'tan.
- Yıkıcı eylemler denetim zinciri bozulduğunda (`auditTampered`) durur.

### Veri ve dayanıklılık
- SQLite (`powerpilot.db`) tek gerçek kaynak; v2 JSON atomik migrasyonu,
  `quick_check`, WAL/secure_delete, değişen satır diff-flush.
- Denetim zinciri HMAC-SHA256 + günlük checkpoint + Windows Event Log özeti.
- Şifreli günlük yedekler, geri yükleme ve bakım modu runbook'ları.
- Konsol deposu SQLite/bellek ayrımı, kalıcı kuyruk ve makbuz yaşam döngüsü.

### Güvenilirlik ve performans
- Görev sonuç dinleyicileri, `task-executed`/`task-failed`, sistem uyanma
  yeniden senkronu, monotonik sayaç ve aktif görev geri yükleme.
- Fail-closed güvenlik politikası, güç isteği timeout/cache, gerçek fullscreen
  ve süreç listesi hataları.
- AI oturum serileştirmesi, metrik örnekleme kilidi, tray debounce ve merkezi
  timer kaydı; görev tablosunda delta render.
- Başsız ajan timer/temizlik kapatması.

### i18n ve paketleme
- 17 dil JSON kaynağı; ana süreçte `vm` yok, renderer yalnızca aktif dili yükler.
- Tailwind build-time; inline script/stil yok.
- Electron fuses, SHA-256 + RFC 3161 imza, CycloneDX SBOM + imzalı release
  manifesti, paketli E2E ve 100 ajan yük/soak testi.

## [1.0.1] — Release Hardening (2026-10-22)

### Güvenlik
- LAN API için IP/CIDR allowlist eklendi; hostname reddedilir, IPv4-mapped IPv6
  normalize edilir, zone ID güvenli ayrılır. Allowlist boşsa loopback dışı tüm
  istekler fail-closed reddedilir.
- ACL, rate-limit'ten önce uygulanır; rate-limit anahtar sayısı 1000 ile
  sınırlandırıldı. Yetkisiz IP'ler belleği büyütemez.
- `blockRemoteShutdownWhenActive` (varsayılan `true`) ile kullanıcı aktifken
  uzaktan shutdown/restart engellenir; kural icra anında da uygulanır.
- TLS/mTLS/sıkı TLS kombinasyonları doğrulanır; eksik sertifika materyali
  reddedilir. API çift yığın bind + IPv4 fallback ve güvenlik durum özeti.
- Şema v2: güvenli varsayılanlar, v1→v2 migrasyon, hostname filtreleme,
  migrasyon öncesi yedek ve prototip kirlenmesi koruması.

### Görev yürütme
- Atomik `executionClaims` claim/token durum makinesi: aynı görevin çift
  icrası ve `await` sonrası bayat token kullanımı engellendi.
- `evaluateTasks()` senkron kaldı; `handleTaskExecution` fire-and-forget
  çalışır. Uyarı iptali/ertelemesi aktif uyarıyı ve görevi birlikte çözer.
- Görev erteleme artık hedef zamanı ileri taşır; 1 saatlik bir görev 10 dakika
  ertelendiğinde yanlışlıkla 10 dakika sonraya çekilmez.
- Güç komutu başladıktan sonra iptal `CANCEL_TOO_LATE` döner; IPC bunu
  başarı gibi sunmaz.
- Boş `processName` fail-closed; `chrome` ve `chrome.exe` kanonik eşleşir.
  Bayat/boş süreç listesi tetikleme üretmez.

### Arayüz, görev yönetimi ve i18n
- Yeni **Görevler** ekranı: aktif/tüm filtreleri, otomatik yenileme, tetikleyici,
  sonraki çalışma, durum ve kalan süre; listeden iptal/erteleme ve PIN koruması.
- 17 dilde 595 anahtar: statik `data-i18n`, dinamik `t()` metinleri, placeholder
  ve başlık çevirileri; tray menüsü, balon bildirimleri ve IPC hata mesajları da
  ana süreçte yerelleştirildi.
- Hakkında ekranındaki sürüm artık `package.json`/`app.getVersion()` kaynağından
  okunur.
- Mini widget ve ana pencere için `backgroundThrottling: false`; arka planda
  kalan sayaç/animasyon donması giderildi.
- Gizlilik politikası internet/ağ ifadeleri ve açık kaynak lisans listesi gerçek
  çalışma zamanı bağımlılıklarıyla güncellendi.
- `#setting-language` üzerindeki yinelenen `class` özniteliği düzeltildi.

### Performans ve bütünlük
- 2 saniyelik PowerShell/tasklist yoklaması kaldırıldı; `ps-list@9` dinamik
  import + 5 saniyelik örnekleme + ihtiyaç kapısı kullanılır. ASAR dışı
  fastlist paket spike'ı eklendi.
- Idle ölçümü `powerMonitor.getSystemIdleTime()` üzerinden yapılır.
- Qwen/Whisper model URL'leri 40 karakterli immutable commit'e, tam bayt
  sayısına ve SHA-256'ya pinlendi. HTTP 200/206/416, Content-Range ve yarım
  `.part` finalizasyonu doğrulanır.
- Konsol makbuzları `peek/markSent/markFailed` ile idempotent hale getirildi;
  204/boş gövde 2xx yanıtı tek kez işaretlenir.

### Paketleme ve sürüm
- Sürüm `1.0.1`; Electron `43.4.0`, Node `24.18.1`, Vitest `3.2.4`,
  electron-builder `26.15.3`, Playwright `1.64.1` tam pinlendi.
- Varsayılan dağıtım yalnızca NSIS. `allowToChangeInstallationDirectory`
  için assisted installer (`oneClick=false`) kullanılır.
- APPX yalnızca `APPX_PUBLISHER` ve eşleşen sertifikayla üretilir.
- `release-check`, `verify-pack`, `spike:pslist`, `dist:appx` ve CI kapıları
  eklendi. İmzalama SHA-256 + RFC 3161 zaman damgasına ayarlandı.
- 17 dil / 595 anahtar paritesi, `en` fallback, Arapça RTL, aktif
  görev/uyarı geri yüklemesi ve tüm statik/dinamik UI anahtarlarının kapsamı
  doğrulandı. Çeviriler makine çevirisi temellidir; profesyonel dil incelemesi
  yayın öncesi dış adımdır.

### Test
- 51 test dosyası / 483 test; Playwright Electron açılış smoke testi ve
  i18n/görev görünümü E2E testi (dil değişimi, sürüm, görev oluşturma,
  erteleme, iptal) eklendi.
- `tests/main/i18n-coverage.test.mjs` statik anahtar kapsamını ve 17 dilde
  doluluk/pariteyi korur; `taskmanager.test.mjs` ertelemenin hedefi geri
  çekmediğini doğrular.

### Bilinen dış blocker'lar
- İmzalı RC için OV sertifikası, APPX için eşleşen publisher sertifikası.
- Profesyonel çeviri incelemesi.
- `v1.0.1` tag ve kademeli dağıtım, temiz ağaç ve release onayı bekliyor.

## [2.0.0] — Yayınlanmadı (geliştirme dalı)

### Eklenenler (WBS-E: opsiyonel enerji + otomatik tanıma)
- Watt/fiyat kurulumda ve ayarlarda **opsiyonel** (boş = `null`, uydurma sayı yok)
- Otomatik cihaz tanıma: kasa sınıfı (ChassisTypes), pilde gerçek deşarj ölçümü,
  donanım katman tahmini; ilk pilde-kullanımda sessiz arka-plan kalibrasyonu
- Eksik-veri boş-durumları: "—" kartlar + uyarı çipleri + Ayarlar derin-bağı
- Akıllı fiyat varsayılanı **3,24 TL** (EPDK Nisan 2026 mesken, `EFFECTIVE_FROM`
  damgalı; sürüm öncesi gözden geçirme STORE_CHECKLIST'te)
- Eski `(150, 2.5)` profilleri korunur + `legacy` rozetiyle doğrulamaya davet

### Eklenenler
- Smart Finish: 7 koşul türü, çoklu koşul kurucu (AND/OR, en fazla 3), kararlılık süresi, belirli-saat görevleri, zincir halkaları (F6, F11.1)
- Şablonlar: 10 hazır şablon, sınırsız kullanıcı şablonu (kaydet/kullan/sil, karantina) (F6)
- Entegrasyonlar: API açma/port/LAN arayüzü, webhook yönetim ekranı + secret maskeleme + test-gönderimi, telefon QR eşleşmesi, OpenAPI parite kilidi (F5, F11.4)
- AI Asistan (yerel, çevrimdışı): AiBackend durum makinesi, ModelManager (indir/resume/SHA-manifest), JSON-şemalı komut ayrıştırıcı, Asistan sekmesi, kurulum sihirbazı (F7)
- Sesli komut: whisper.cpp STT (Türkçe sabit dil, enerji kapısı, 15sn tavan), mikrofon akışı, sesli geri bildirim anahtarı (F8)
- Ajan sistemi: deterministik Orkestratör + 4 ajan (komut/teşhis/enerji/önerici), Ajan Kayıtları, susturma kuralları (F9)
- Çift mod: Klasik (varsayılan) / Tam Yetki, kuruluş-anı damgası, uyarı bandı (Durdur/Ertele/Şimdi), tray mod göstergesi (F9)
- Güvenlik: iptal PIN'i (SHA256+salt, 5 yanlışta 60sn kilit), açılış koruması (120sn), güç-istekli tam-ekran koruması (F11.2, F11.5)
- Klavye kısayolları (Alt+S/R/L/H, Esc, Ctrl+T) + kademeli uyarı (5dk/1dk/30sn, gece sessizliği) (F11.3)
- Kalıcılık: Windows Görev Zamanlayıcı yedeği + second-instance iletimi + kalıcı duraklatma (WBS-2.2, P0-2)

### Değişen Davranışlar (dikkat)
- Uyarı zaman-aşımı Klasik modda DURDURUR (eskiden her zaman devam ederdi); scheduler-ateşlemeli görevler etkilenmez.
- `create-task`/`save-settings`/`save-webhooks` IPC dönüş şekilleri `{success, ...}` sarmalayıcısına geçti.
- `powerpilot_data.json` şemasına eklendi: `autonomyMode`, `automationPaused`, `cancelPinHash/Salt`, `bootGuardSeconds`, `templates`, görevlerde `mode` + `chain`.

### Altyapı
- 244 otomatik test, kapsam kapıları (satır %80/fonksiyon %70/dal %65); GitHub Actions CI.
- Electron 40.8 → 43.4.0; `node-llama-cpp@3.20.0`, `@fugood/whisper.node@1.2.0-rc.1`, `qrcode-generator`, `@electron/rebuild`, `systeminformation@5.31.0`, `electron-log`.
- Renderer i18n verisi `src/renderer/i18n.js` dosyasına taşındı (parite testli).

### Bilerek Ertelenenler
- Otomatik güncelleme akışı (feed URL kararı bekleniyor).
- Tam renderer modülerizasyonu (i18n ayrıldı; mantık bölünmesi ayrı faz).
