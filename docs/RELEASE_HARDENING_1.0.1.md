# Power Pilot 1.0.1 — Release Hardening Planı v2.0 ve Uygulama Kaydı

| Alan | Değer |
| --- | --- |
| Belge sürümü | 2.0 |
| Hedef sürüm | `1.0.1` |
| Belge tarihi | 2026-10-22 |
| Durum | Kod ve yerel doğrulamalar tamam; imzalı RC, etiket ve dağıtım dış girdi bekliyor |
| Tek doğruluk kaynağı | Bu belge + `package.json` + `package-lock.json` + CI |
| Kapsam | Release blocker kapatma, güvenlik sertleştirme, paketleme ve kabul |

## 0. Revizyon Geçmişi

| Sürüm | Tarih | Değişiklik |
| --- | --- | --- |
| 1.0 | 2026-10-19 | İlk denetim; 84/100 olgunluk, altı P0 blocker |
| 2.0 | 2026-10-22 | Atomik WBS, WP-21/WP-22, RACI, DoD, kanıt kaydı ve kabul kapıları eklendi |
| 2.1 | 2026-10-22 | Release denetimi: görev ekranı, tam i18n kapsamı, tray yerelleştirmesi, erteleme düzeltmesi ve test kanıtları güncellendi |

> v2.0'ın amacı 95+ olgunluk puanına ulaşmaktır. Bu belge, kodun "bitti"
> sayılması için değil, **release'in kanıtla kapanması** için kullanılır.
> İmzalı RC ve etiket, aşağıdaki dış girdiler tamamlanmadan üretilmez.

## 1. Yönetici Özeti

`1.0.1`, `1.0.0` üzerine release blocker, sertleştirme ve mevcut görev
API'sini kullanan arayüz düzeltmelerini taşır. Kapsam bilerek dardır: yeni güç
yeteneği eklenmez; Görevler ekranı, tam i18n kapsamı ve hata düzeltmeleri
eklenir, kurumsal/konsol genişlemesi `1.1.0`'a ertelenir.

Kapanan altı P0 blocker:

1. LAN API'de loopback dışı erişimin allowlist'i atlaması.
2. Aynı görevin eşzamanlı iki kez icra edilmesi.
3. Uyarı modalı iptal edilirken görevin arka planda çalışmaya devam etmesi.
4. Boş `processName` nedeniyle süreç koşulunun yanlış tetiklenmesi.
5. Her 2 saniyede PowerShell/tasklist çalıştırılması.
6. Sürüm, hedef, model ve i18n pinlerinin release kapısından geçmemesi.

Kod tarafı tamamlandı. Yerel kanıt: 51 test dosyası / 483 test, kapsam
eşikleri, 17 dil / 595 anahtar paritesi ve kapsam testi, model pinleri,
`release:check`, NSIS paketleme, paketli `ps-list` spike'ı ve 2 Playwright E2E
testi. İmzalı RC, `v1.0.1` etiketi ve kademeli dağıtım; kod imzalama
sertifikası, temiz çalışma ağacı ve insan onaylı çeviri girdilerine bağlıdır.

## 2. Kapsam ve Kapsam Dışı

### 2.1 Kapsam

- LAN IP/CIDR allowlist, rate-limit bellek sınırı ve fail-closed davranış.
- Görev icrasında atomik claim/token ve iptal/erteleme yarış koşulları.
- Süreç listesi ve idle ölçümünde güvenli, düşük maliyetli kaynaklar.
- Model indirmede immutable commit, boyut ve SHA-256 doğrulaması.
- Konsol makbuzlarında idempotent `peek/markSent/markFailed` akışı.
- Şema v2, güvenli migrasyon, ayarlarda yarı-çapraz doğrulama.
- NSIS-only paketleme; APPX yalnızca eşleşen publisher ile.
- 17 dil, `en` fallback, Arapça RTL, statik/dinamik UI kapsamı ve tray/menü
  yerelleştirmesi.
- Görev panosu: listeleme, filtreleme, iptal, PIN korumalı erteleme.
- Test, kapsam, i18n, model, paket ve E2E release kapıları.

### 2.2 Kapsam Dışı

- Otomatik güncelleme akışı (v1.1).
- Yeni güç yetenekleri ve büyük UI yeniden yazımı.
- Microsoft Store dışı mağaza dağıtımı.
- İmzasız build'in son kullanıcıya dağıtılması.
- Sertifika satın alma ve profesyonel çeviri hizmeti (dış girdi).

## 3. Sürüm Hattı ve Değişmezler

| Bileşen | Pin | Kural |
| --- | --- | --- |
| Electron | `43.4.0` | Tam pin; caret/tilde yasak |
| Node.js | `24.18.1` | `.nvmrc` ve CI aynı olmalı |
| Vitest | `3.2.4` | Test ve kapsam aynı sürüm |
| `@playwright/test` | `1.64.1` | E2E sürümü |
| `electron-builder` | `26.15.3` | Paketleme sürümü |
| `ipaddr.js` | `2.5.0` | Üretim bağımlılığı |
| `ps-list` | `9.0.0` | ESM; paketli spike zorunlu |
| Idle kaynağı | `powerMonitor.getSystemIdleTime()` | PowerShell yasak |
| Dağıtım hedefi | NSIS | Varsayılan ve tek hedef |
| APPX | Koşullu | `APPX_PUBLISHER` + eşleşen sertifika |
| İmzalama | OV, SHA-256 | İmzasız build yalnızca iç kullanım |

Değişmezler:

- `evaluateTasks()` senkron ve fire-and-forget kalır; `handleTaskExecution`
  asla `await` edilmez.
- `executionClaims` senkron `Map`'tir; her `await` sonrası token doğrulanır.
- Boş veya bayat süreç listesi **fail-closed**'dur.
- LAN allowlist boşsa loopback dışı erişim reddedilir.
- `lanModeEnabled=false` acil durum anahtarıdır.
- Şema v2 eklemelidir; v1 verisi kayıpsız okunur.
- Model URL'si 40 karakterli commit içermeden indirme başlamaz.

## 4. İş Kırılımı (WBS) Özeti

Toplam efor: **38,5 mühendis-günü**. Durumlar: `Tamam`, `Kısmi`, `Bekliyor`.

| WP | Başlık | Öncelik | Efor | Bağımlılık | Somut Çıktı | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| WP-00 | Baseline ve denetim | P0 | 0,5 | — | Denetim raporu, yeşil test tabanı | Tamam |
| WP-01 | LAN IP/CIDR ACL | P0 | 2,0 | WP-00 | `net/ipAcl.js`, ACL→rate-limit sırası | Tamam |
| WP-02 | Atomik icra claim'i | P0 | 3,0 | WP-00 | `TaskManager` claim/token durumu | Tamam |
| WP-03 | Uyarı iptal/erteleme | P0 | 2,0 | WP-02 | Aktif uyarı çözümü, `CANCEL_TOO_LATE` | Tamam |
| WP-04 | Süreç listesi fail-closed | P0 | 2,5 | WP-00 | `ps-list`, `processNames.js`, stale flag | Tamam |
| WP-05 | Idle ölçümü | P0 | 1,0 | WP-00 | `powerMonitor` enjeksiyonu | Tamam |
| WP-06 | Model bütünlüğü | P0 | 2,5 | WP-00 | Immutable URL + boyut + SHA-256 | Tamam |
| WP-07 | Makbuz idempotency | P1 | 1,5 | WP-00 | `peek/markSent/markFailed` | Tamam |
| WP-08 | Uzaktan kapatma koruması | P0 | 1,0 | WP-00 | `blockRemoteShutdownWhenActive` | Tamam |
| WP-09 | Şema v2 + migrasyon | P0 | 2,0 | WP-00 | Sürüm 2, hostname filtresi, backup | Tamam |
| WP-10 | Ayarlar çapraz doğrulama | P0 | 1,5 | WP-09 | `validateSettings(patch, current)` | Tamam |
| WP-11 | API/TLS yaşam döngüsü | P1 | 2,0 | WP-01 | Çift yığın bind, IPv4 fallback, durum | Tamam |
| WP-12 | Release hijyeni | P0 | 1,5 | WP-00 | Sürüm/pin/hedef/CI kapıları | Tamam |
| WP-13 | i18n paritesi | P1 | 3,5 | WP-00 | 17 dil, 595 anahtar, placeholder | Tamam |
| WP-14 | Dokümantasyon | P1 | 2,0 | WP-00 | Plan, API güvenliği, imzalama | Tamam |
| WP-15 | E2E duman testi | P1 | 1,5 | WP-12 | Playwright Electron smoke | Tamam |
| WP-16 | Performans/sessizlik | P0 | 1,5 | WP-04 | 5 sn örnekleme, ihtiyaç kapısı | Tamam |
| WP-17 | Gözlemlenebilirlik | P1 | 1,0 | WP-01 | ACL/rate-limit sayaçları | Tamam |
| WP-18 | İmzalama (OV) | P0 | 1,5 | WP-12 | CI/yerel OV prosedürü | Kısmi |
| WP-19 | RC ve kabul | P0 | 1,0 | WP-18 | Kabul listesi ve kanıt | Bekliyor |
| WP-20 | NSIS artefaktı | P0 | 1,0 | WP-12 | Kurulum EXE + SHA-256 | Tamam (imzasız) |
| WP-21 | İmzalı RC ve etiket | P0 | 1,5 | WP-18/19/20 | Authenticode `Valid`, `v1.0.1` tag | Bekliyor |
| WP-22 | Kademeli dağıtım ve gözlem | P0 | 1,0 | WP-21 | 7 günlük dağıtım raporu | Bekliyor |

\* WP-20 kapsamında imzasız iç NSIS artefaktı üretildi ve SHA-256 kaydedildi;
dağıtılabilir artefakt için WP-21'de imza zorunludur.

## 5. Atomik Görev Sırası

| ID | WP | Atomik Görev | Bağımlılık | Somut Çıktı | Durum |
| --- | --- | --- | --- | --- | --- |
| T-001 | WP-00 | Baseline test ve denetim | — | 47 dosya / 436 test tabanı | Tamam |
| T-002 | WP-00 | Sürüm hattını dondur | T-001 | Tam pinli `package.json` | Tamam |
| T-003 | WP-00 | Release yapılandırmasını envanterle | T-001 | Hedef/script listesi | Tamam |
| T-004 | WP-01 | IP/CIDR ayrıştırıcısı yaz | T-003 | `ipAcl.js` | Tamam |
| T-005 | WP-01 | IPv4-mapped ve zone-ID normalize et | T-004 | Normalize fonksiyonları | Tamam |
| T-006 | WP-01 | ACL'yi rate-limit'ten önce uygula | T-005 | `LocalApiService` sırası | Tamam |
| T-007 | WP-01 | Rate-limit anahtarını sınırla | T-006 | 1000 kayıt tavanı | Tamam |
| T-008 | WP-01 | Boş allowlist'i fail-closed yap | T-006 | LAN bind guard | Tamam |
| T-009 | WP-02 | Claim map ve token üret | T-002 | `executionClaims` | Tamam |
| T-010 | WP-02 | Her await sonrası token doğrula | T-009 | Token kontrolleri | Tamam |
| T-011 | WP-02 | Tick'i senkron, icrayı fire-and-forget yap | T-010 | `evaluateTasks()` | Tamam |
| T-012 | WP-02 | Eşzamanlı ikinci icrayı reddet | T-011 | `ALREADY_RUNNING` | Tamam |
| T-013 | WP-03 | İptalde aktif uyarıyı çöz | T-012 | `cancelTask` bağlantısı | Tamam |
| T-014 | WP-03 | Ertelemede aktif uyarıyı çöz | T-012 | `SNOOZED_ACTIVE` | Tamam |
| T-015 | WP-03 | `CANCEL_TOO_LATE` IPC anlamını düzelt | T-013 | `success:false` yanıtı | Tamam |
| T-016 | WP-04 | `ps-list` dinamik import | T-003 | ESM yükleme | Tamam |
| T-017 | WP-04 | Süreç adlarını kanonikleştir | T-016 | `chrome` ≡ `chrome.exe` | Tamam |
| T-018 | WP-04 | Bayat/boş listeyi fail-closed yap | T-017 | `processListStale` | Tamam |
| T-019 | WP-04 | Örnekleme bütçesi ekle | T-018 | `needsProcessList` kapısı | Tamam |
| T-020 | WP-05 | `powerMonitor` idle kaynağını bağla | T-003 | `getSystemIdleTime()` | Tamam |
| T-021 | WP-06 | Model spec'lerini pinle | T-003 | Qwen/Whisper meta | Tamam |
| T-022 | WP-06 | HTTP 200/206/416 doğrula | T-021 | Range kontrolü | Tamam |
| T-023 | WP-06 | `.part` + SHA finalizasyonu | T-022 | Atomik model dosyası | Tamam |
| T-024 | WP-07 | Makbuz `peek` ekle | T-003 | İşaretsiz okuma | Tamam |
| T-025 | WP-07 | `markSent/markFailed` ekle | T-024 | Makbuz durumu | Tamam |
| T-026 | WP-08 | Ayar doğrulaması ekle | T-009 | `blockRemoteShutdownWhenActive` | Tamam |
| T-027 | WP-08 | İcra anında korumayı uygula | T-026 | Politikaya bağlama | Tamam |
| T-028 | WP-09 | Şema v2 varsayılanları | T-002 | `SCHEMA_VERSION=2` | Tamam |
| T-029 | WP-09 | v1→v2 migrasyon + backup | T-028 | Hostname filtresi | Tamam |
| T-030 | WP-09 | Prototip kirlenmesini engelle | T-028 | Anahtar filtresi | Tamam |
| T-031 | WP-10 | Yarı-çapraz doğrulama | T-026 | `validateSettings` | Tamam |
| T-032 | WP-10 | Rollback semantiği | T-031 | Reddedilen patch | Tamam |
| T-033 | WP-11 | Çift yığın bind + IPv4 fallback | T-006 | Bind stratejisi | Tamam |
| T-034 | WP-11 | TLS/mTLS doğrulaması | T-031 | `TLS_*` kodları | Tamam |
| T-035 | WP-12 | Sürüm ve scriptleri güncelle | T-002 | `1.0.1`, `dist:nsis` | Tamam |
| T-036 | WP-12 | CI kapılarını ekle | T-035 | `.github/workflows/ci.yml` | Tamam |
| T-037 | WP-13 | 17 dil anahtar paritesi | T-003 | `check-i18n.js` | Tamam |
| T-038 | WP-13 | Placeholder paritesi | T-037 | Aynı script | Tamam |
| T-039 | WP-13 | Arapça RTL | T-037 | `dir=rtl` | Tamam |
| T-040 | WP-14 | Güvenlik/imzalama dokümanları | T-006 | `LOCAL_API_SECURITY`, `RELEASE_SIGNING` | Tamam |
| T-041 | WP-15 | Playwright smoke | T-035 | `tests/e2e/smoke.spec.js` | Tamam |
| T-042 | WP-15 | Aktif durum geri yükleme | T-041 | `getActiveState` | Tamam |
| T-043 | WP-16 | Süreç örnekleme aralığı | T-019 | 5 sn + ihtiyaç kapısı | Tamam |
| T-044 | WP-16 | Paketli `ps-list` spike'ı | T-043 | `verify-pack.js` | Tamam |
| T-045 | WP-17 | ACL/rate-limit sayaçları | T-008 | `getDiagnostics()` | Tamam |
| T-046 | WP-18 | OV imzalama prosedürü | T-035 | `RELEASE_SIGNING.md` | Kısmi |
| T-047 | WP-18 | APPX publisher kapısı | T-035 | `build-appx.js` | Tamam |
| T-048 | WP-19 | RC kabul listesi | T-046 | Bu belge §12 | Bekliyor |
| T-049 | WP-20 | NSIS iç artefaktı üret | T-035 | Setup EXE | Tamam (imzasız) |
| T-050 | WP-20 | SHA-256 kaydı | T-049 | 64 hex özet | Tamam (imzasız) |
| T-051 | WP-21 | İmzalı RC + `Valid` doğrulama | T-046/48/50 | İmzalı EXE | Bekliyor |
| T-052 | WP-21 | Temiz ağaç + `v1.0.1` tag | T-051 | Tag | Bekliyor |
| T-053 | WP-22 | %5 → %25 → %100 dağıtım | T-052 | Dağıtım kaydı | Bekliyor |
| T-054 | WP-22 | 7 günlük gözlem + rollback kararı | T-053 | Kapanış raporu | Bekliyor |

## 6. Kritik Yol ve Sıralama

### 6.1 Kod kritik yolu

`WP-00 → WP-08 → WP-01 → WP-02 → WP-03 → WP-09 → WP-13 → WP-20 → WP-21 → WP-22`

Bu yolun kod kısmı tamamlandı. WP-20'de imzasız iç artefakt üretildi; WP-21
ve WP-22 dış girdi ve insan kararına bağlıdır.

### 6.2 Yayın kritik yolu

`WP-18 (sertifika) → WP-19 (kabul) → WP-20 (artefakt) → WP-21 (imza + tag) → WP-22 (dağıtım)`

### 6.3 Paralel izler

| İz | İşler | Kural |
| --- | --- | --- |
| Güvenlik | WP-01, WP-02, WP-03, WP-08, WP-09, WP-10, WP-11 | P0 bitmeden RC yok |
| Performans | WP-04, WP-05, WP-16 | Paketli spike zorunlu |
| İçerik | WP-13, WP-14 | `en` fallback her zaman hazır |
| Release | WP-12, WP-15, WP-17, WP-18, WP-19 | Kapılar sırayla |
| Dağıtım | WP-20, WP-21, WP-22 | İmza olmadan dağıtım yok |

## 7. İş Paketi Riskleri, Testleri ve Kabul Kriterleri

| WP | Risk | Azaltma | Fallback | Test | Kabul |
| --- | --- | --- | --- | --- | --- |
| WP-00 | Baseline kayması | Test sayısı ve commit kaydı | Bilinen iyi commit'e dön | `npm test` | Taban yeşil |
| WP-01 | DNS rebinding / ACL bypass | Yalnızca IP/CIDR, ACL önce | LAN modunu kapat | T-01…T-05, T-21, T-23 | Yetkisiz IP 403 |
| WP-02 | Çift güç icrası | Senkron claim + token | İkinci istek `ALREADY_RUNNING` | T-06 | Tek icra |
| WP-03 | Modal kapanır, görev sürer | İptal/erteleme görevi çözer | `CANCEL_TOO_LATE` açık mesaj | T-07, T-08, T-28 | Aktif uyarı kalmaz |
| WP-04 | Yanlış "süreç kapandı" | Boş/bayat liste fail-closed | Koşul değerlendirilemez | T-09…T-13 | Tetikleme yok |
| WP-05 | `powerMonitor` yok | `whenReady` sonrası enjeksiyon | Idle 0 = aktif | T-14 | Güvenli varsayılan |
| WP-06 | Bozuk/yarım model | Commit + boyut + SHA | İndirmeyi reddet | T-15…T-17 | Manifest yoksa yükleme yok |
| WP-07 | Kayıp/çift makbuz | `peek` + `markSent` | 2xx'te bir kez işaretle | T-18…T-20 | Idempotent |
| WP-08 | Aktifken uzaktan kapatma | Ayar + icra guard'ı | `REMOTE_SHUTDOWN_BLOCKED` | T-26, T-27 | Idle<60 red |
| WP-09 | Şema bozulması | v2 eklemeli + backup | Yedekten geri yükle | T-24, T-25 | v1 verisi korunur |
| WP-10 | Geçersiz ayar kombinasyonu | Yarı-çapraz doğrulama | Patch'in tamamını reddet | T-22, T-23 | Atomik ayar |
| WP-11 | Bind/TLS hatası | Çift yığın + IPv4 fallback | HTTP/loopback | Local API testleri | Durum görünür |
| WP-12 | Config drift | Tam pin + `release:check` | CI kırmızı | T-33 | Kapı yeşil |
| WP-13 | Eksik çeviri | Parite + `en` fallback | `en` göster | T-30, T-31 | 17 dil / 595 anahtar |
| WP-14 | Doküman kayması | Bu belge tek kaynak | Plan revizyonu | Gözden geçirme | Doküman güncel |
| WP-15 | E2E kırılganlığı | Tek, deterministik smoke | Manuel smoke | T-34 | Açılış + preload |
| WP-16 | Süreç tarama maliyeti | 5 sn + ihtiyaç kapısı | Koşulsuz tarama yok | T-10, TS-16 | Sabit maliyet |
| WP-17 | Kör nokta | Sayaçlar + durum özeti | Log incelemesi | WP-17 testi | Sayaçlar doğru |
| WP-18 | Sertifika yok | OV prosedürü | İmzasız iç build | Authenticode | `Valid` |
| WP-19 | Eksik kabul kanıtı | Checklist + imza | RC yayınlanmaz | §12 | Tüm kutular |
| WP-20 | Artefakt uyuşmazlığı | SHA-256 + boyut | Yeniden üret | `dist:nsis` | EXE + hash |
| WP-21 | Yanlış imza/tag | Temiz ağaç + doğrulama | Tag atılmaz | `Get-AuthenticodeSignature` | `Valid` + tag |
| WP-22 | Dağıtım regresyonu | Kademeli rollout | 1.0.0'a dön | 7 gün gözlem | Geri dönüş yok |

## 8. Test Senaryoları, Adımlar ve Kabul Kriterleri

| ID | Senaryo | Adım | Kabul |
| --- | --- | --- | --- |
| T-01 | IPv4-mapped IPv6 normalize | `::ffff:192.168.1.10` ile ACL çağır | IPv4 kuralı eşleşir |
| T-02 | Hostname allowlist reddi | `eski-host.local` ekle | `INVALID_SETTING` |
| T-03 | Boş allowlist fail-closed | LAN açık, liste boş | Loopback dışı 403 |
| T-04 | CIDR eşleşmesi | `10.0.0.0/8` ile `10.1.2.3` | İzin verilir |
| T-05 | Zone ID ayrıştırma | `fe80::1%eth0` | Zone güvenli ayrılır |
| T-06 | Aynı görev çift tetikleme | İki kez `executeTask` | Tek güç çağrısı |
| T-07 | Uyarı sırasında iptal | Uyarı aç, `cancelTask` | Görev `CANCELLED` |
| T-08 | İcra sonrası iptal | `powerStarted=true`, iptal | `CANCEL_TOO_LATE` |
| T-09 | Boş `processName` | Boş adla koşul | Fail-closed |
| T-10 | Bayat süreç listesi | stale flag | Tetikleme yok |
| T-11 | `chrome` ≡ `chrome.exe` | İki adla eşleştir | Aynı sonuç |
| T-12 | Bayat metrikte tetikleme | Eski metrikle değerlendir | Tetikleme yok |
| T-13 | Süreç sağlayıcı hatası | Provider throw | Fail-closed |
| T-14 | Idle sağlayıcı yok | Sağlayıcıyı kaldır | Idle 0 (aktif) |
| T-15 | Model SHA uyuşmazlığı | Bozuk dosya | Reddet |
| T-16 | Range yok sayılırsa | 200 + tam gövde | Baştan indir |
| T-17 | 416 + tam `.part` | 416, dosya tam | Finalize et |
| T-18 | Makbuz `peek` işaretsiz | `peek` çağır | Durum değişmez |
| T-19 | Gönderim hatası | `markFailed` | Tekrar denenebilir |
| T-20 | 204 boş gövde | 2xx, gövde yok | `markSent` |
| T-21 | LAN allowlist zorunlu | LAN aç, liste boş | Doğrulama reddi |
| T-22 | LAN+TLS materyali | TLS aç, sertifika yok | `TLS_MATERIAL_REQUIRED` |
| T-23 | Yinelenen IP | IPv4 + mapped IPv6 | `INVALID_SETTING` |
| T-24 | v1→v2 migrasyon | Hostname'li v1 dosyası | Temizlenir, yedek alınır |
| T-25 | Hostname-only LAN | Sadece hostname | LAN kapanır + uyarı |
| T-26 | Uzaktan kapatma ayarı | Ayarı kapat/aç | Doğru politika |
| T-27 | Idle<60 shutdown | API shutdown | `REMOTE_SHUTDOWN_BLOCKED` |
| T-28 | Uyarı erteleme | `snoozeTask` | `SNOOZED_ACTIVE` |
| T-29 | Tekrarlayan görev | Sonraki vakit | Doğru takvim |
| T-30 | i18n anahtar paritesi | `locales:check` | 17 dil, 595 anahtar |
| T-31 | Placeholder paritesi | `{count}` vb. | Tüm dillerde aynı |
| T-32 | Model pin meta | `models:verify` | Immutable + SHA |
| T-33 | Release hijyeni | `release:check` | Yeşil |
| T-34 | E2E açılış smoke | Playwright | Pencere + preload |

Ek paketleme senaryoları:

| ID | Senaryo | Adım | Kabul |
| --- | --- | --- | --- |
| T-35 | NSIS üretimi | `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:nsis` | Setup EXE oluşur |
| T-36 | Paketli `ps-list` | `npm run verify:pack` | Boş olmayan süreç listesi |
| T-37 | ASAR dışı fastlist | `verify:pack` vendor kontrolü | İki EXE ASAR dışında |
| T-38 | İmza doğrulama | `Get-AuthenticodeSignature` | `Valid` (signed RC) |
| T-39 | APPX publisher | Eşleşmeyen sertifika | Build reddedilir |
| T-40 | Temiz ağaç | `release:check --strict-git` | Kirli ağaçta kırmızı |

## 9. Release Kapıları

| Kapı | Kriter | Komut | Kanıt |
| --- | --- | --- | --- |
| G0 | Baseline yeşil | `npm test` | 51 dosya / 483 test |
| G1 | Kapsam eşiği | `npm run coverage` | Satır ≥80, fonksiyon ≥70, dal ≥65 |
| G2 | i18n paritesi ve kapsamı | `npm run locales:check` + `i18n-coverage.test.mjs` | 17 dil / 595 anahtar |
| G3 | Model pinleri | `npm run models:verify` | Immutable + boyut + SHA |
| G4 | Release hijyeni + üretim audit | `npm run release:check && npm audit --omit=dev --audit-level=high` | Sürüm/pin/hedef + 0 üretim açığı |
| G5 | Paketlenebilirlik | `npm run pack && npm run verify:pack && npm run spike:pslist` | ASAR + fastlist |
| G6 | E2E smoke + i18n/görev akışı | `npm run test:e2e` | 2 passed |
| G7 | RC temiz ağaç | `npm run release:check -- --strict-git` | Boş `git status` |
| G8 | İmzalı artefakt | `Get-AuthenticodeSignature` | `Valid` |
| G9 | Etiket | `git tag -s v1.0.1` | İmzalı tag |

G0–G7 kod/yerel kapılardır. G8–G9 dış girdi olmadan kapanmaz.

## 10. RACI

| Rol | Sorumluluk | R | A | C | I |
| --- | --- | --- | --- | --- | --- |
| Release Owner | Kapsam, kapılar, tag, dağıtım kararı | WP-19…22 | Tüm kapılar | — | — |
| Engineering Lead | Kod, test, paketleme | WP-00…17 | Teknik kabul | Güvenlik | Ürün |
| QA | Test senaryoları, E2E, kabul | WP-15, WP-19 | Test kanıtı | Engineering | Release Owner |
| Security | LAN/ACL, TLS, model bütünlüğü | WP-01, WP-06, WP-11 | Güvenlik kabul | Engineering | Release Owner |
| Localization | 17 dil, RTL, çeviri onayı | WP-13 | Çeviri kabul | Ürün | Release Owner |
| Release Engineering | İmza, artefakt, checksum | WP-18, WP-20, WP-21 | İmza/artefakt | Security | Release Owner |
| Product | Kapsam, kullanıcı iletişimi, rollout | WP-22 | Ürün kabul | Release Owner | Destek |

## 11. Definition of Done (DoD)

Bir WP ancak aşağıdakilerin tamamıyla `Tamam` olur:

- [ ] Kod ve doküman aynı davranışı anlatıyor.
- [ ] Yeni davranış için regresyon testi var.
- [ ] `npm test` yeşil.
- [ ] Kapsam eşiği düşmüyor.
- [ ] Hata kodları kullanıcıya yanlış başarı izlenimi vermiyor.
- [ ] Güvenlik varsayılanı fail-closed.
- [ ] Release kapılarından ilgili olan yeşil.
- [ ] Risk, azaltma ve fallback bu belgede kayıtlı.
- [ ] Değişiklik `CHANGELOG.md`'de görünür.
- [ ] Dış girdi gerekiyorsa açıkça "Bekliyor" işaretli.

## 12. Release-Ready Kontrol Listesi

### 12.1 Kod ve Test

- [x] Altı P0 blocker kapatıldı.
- [x] `npm test` — 51 dosya / 483 test.
- [x] `npm run coverage` — eşiklerin üzerinde.
- [x] `npm run locales:check` — 17 dil / 595 anahtar.
- [x] Statik/dinamik i18n kapsam testi — eksik anahtar yok.
- [x] Görev panosu — listeleme, filtre, iptal, PIN korumalı erteleme.
- [x] Hakkında sürümü `app.getVersion()` ile dolu.
- [x] Mini widget arka plan throttling kapatıldı.
- [x] `npm run models:verify` — pin meta OK.
- [x] `npm run release:check` — OK.
- [x] `npm run pack` — OK.
- [x] `npm run verify:pack` — paketli `ps-list` OK.
- [x] `npm run spike:pslist` — OK.
- [x] `npm run test:e2e` — 2 passed.
- [x] NSIS imzasız iç artefakt — üretildi.
- [x] İç artefakt SHA-256 — kaydedildi.

### 12.2 Dış Girdiler

- [ ] OV kod imzalama sertifikası (`CSC_LINK`, `CSC_KEY_PASSWORD`).
- [ ] APPX publisher sertifikası (`APPX_PUBLISHER` eşleşmesi).
- [ ] İnsan onaylı 17 dil çevirisi (3 hafta lead).
- [ ] Temiz çalışma ağacı ve commit.
- [ ] `release:check --strict-git` yeşil.

### 12.3 Yayın

- [ ] İmzalı NSIS RC üretildi.
- [ ] `Get-AuthenticodeSignature` → `Valid`.
- [ ] SHA-256 manifesti yayınlandı.
- [ ] `v1.0.1` tag atıldı.
- [ ] %5 → %25 → %100 kademeli dağıtım.
- [ ] 7 günlük gözlem raporu kapandı.

## 13. WP-21 — İmzalı RC ve Etiket (Tam Tanım)

**Amaç:** İmzalı, tekrar üretilebilir ve doğrulanmış `1.0.1` RC'sini
etiketlemek.

**Girdiler:** Temiz ağaç, `CSC_LINK`, `CSC_KEY_PASSWORD`, geçmiş G0–G7
kanıtları, WP-20 artefaktı.

**Adımlar:**

1. `git status --porcelain` boş olmalı.
2. `npm ci` ile kilitli bağımlılıkları kur.
3. G0–G7 kapılarını sırayla çalıştır.
4. `npm run dist:nsis` ile imzalı artefaktı üret.
5. `Get-AuthenticodeSignature` ile `Status=Valid` doğrula.
6. SHA-256 ve boyutu yayın manifestine yaz.
7. `git tag -s v1.0.1 -m "Power Pilot 1.0.1"` ile imzalı tag at.
8. Tag'i ve artefaktı arşivle.

**Kabul:** İmza `Valid`, SHA-256 manifestle eşleşir, tag imzalı ve temiz
ağaçtadır.

**Risk/Fallback:** Sertifika yoksa veya imza geçersizse tag atılmaz; imzasız
build yalnızca iç artefakt olarak kalır.

## 14. WP-22 — Kademeli Dağıtım ve Gözlem (Tam Tanım)

**Amaç:** Regresyonu erken yakalamak ve gerekirse `1.0.0`'a dönmek.

**Adımlar:**

1. %5 kohort; 24 saat gözlem.
2. %25 kohort; 48 saat gözlem.
3. %100 dağıtım; 7 gün gözlem.
4. Metrikler: kurulum başarısı, açılış hatası, LAN/API 403-429 oranı,
   görev iptal/erteleme hataları, model indirme hatası, çökme.
5. Durdurma koşulu: açılışta çökme, veri kaybı, yetkisiz erişim veya
   yanlış güç eylemi.
6. Durdurma halinde `1.0.0` kurulumuna dön ve olay kaydı aç.

**Kabul:** 7 gün boyunca P0/P1 olay yok; destek yükü baseline'da.

## 15. Geri Alma (Rollback)

| Senaryo | Adım | Veri Etkisi |
| --- | --- | --- |
| NSIS kurulum sorunu | `1.0.0` kurulumunu yeniden çalıştır | Kullanıcı verisi korunur |
| Şema v2 migrasyon hatası | `backups/pre_migration_v1_*.json` kopyala | v1 verisi geri gelir |
| API açılış hatası | `lanModeEnabled=false` / `localApiEnabled=false` | Ayar korunur |
| Model bütünlük hatası | `.part` sil, `models:verify` çalıştır | Model yeniden indirilir |
| İmzalama hatası | `CSC_IDENTITY_AUTO_DISCOVERY=false` | İmzasız iç build |
| Dağıtım regresyonu | %5/%25 kohortu durdur, `1.0.0`'a dön | Veri korunur |

Acil anahtar: `lanModeEnabled=false`. Bu anahtar LAN API'yi kapatır; yerel
loopback davranışını bozmaz.

## 16. Gözlemlenebilirlik

- `LocalApiService.diagnostics`: `aclAllowed`, `aclDenied`, `rateLimited`,
  `rateLimitKeys`.
- `getSecurityStatus()`: `transport`, `tlsEnabled`, `mtlsRequired`,
  `rotationDue`, `lanMode`.
- Görev geçmişi: `cancel_too_late`, `cancelled_by_user`, `snoozed_by_user`,
  `blocked_by_policy`.
- Model: manifest (boyut, SHA, URL) + `verify()` sonucu.
- Release: `release:check`, `verify:pack`, `spike:pslist`, E2E çıktıları.
- Dağıtım: kohort, kurulum başarısı, açılış çökmesi, API hata oranı.

## 17. Dış Önkoşullar ve Açık Blocker'lar

| Önkoşul | Sorumlu | Durum | Etki |
| --- | --- | --- | --- |
| OV kod imzalama sertifikası | Sürüm sahibi | Bekliyor | WP-21 kapanmaz |
| APPX publisher sertifikası | Sürüm sahibi | Bekliyor | APPX üretilmez |
| Profesyonel çeviri incelemesi | Ürün/yerelleştirme | Bekliyor | Dil kalitesi riski |
| Temiz çalışma ağacı / commit | Engineering | Bekliyor | G7 kapanmaz |
| İmzalı tag yetkisi | Release Owner | Bekliyor | WP-21/22 |

Bu blocker'lar kod hatası değildir; release kararını ve dış girdiyi gerektirir.

## 18. Yerel Kanıt Kaydı (2026-10-22)

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | 51 dosya / 483 test passed |
| `npm run coverage` | Satır %81,50 / dal %68,54 / fonksiyon %73,37 |
| `npm run locales:check` | 17 dil, 595 anahtar, placeholder OK |
| `npm run models:verify` | Pin meta OK |
| `npm run release:check` | OK |
| `npm run pack` | OK (Electron 43.4.0, electron-builder 26.15.3) |
| `npm run verify:pack` | OK — paketli `ps-list` süreç listeledi |
| `npm run spike:pslist` | OK |
| `npm run test:e2e` | 2 passed (smoke + i18n/görev akışı) |
| `npm audit --omit=dev` | 0 üretim bağımlılığı açığı |
| `npm run dist:nsis` | `dist/Power Pilot Setup 1.0.1.exe` üretildi |
| Authenticode | `NotSigned` (beklenen; iç artefakt) |
| SHA-256 | `4D0ED5667380B5D5C6DE060B0008F5D5759C948BCF311ADAFD6166B9F9362A73` |

Not: SHA-256 yalnızca bu yerel, imzasız artefakt içindir. İmzalı RC yeniden
üretildiğinde hash değişir; yayın manifesti WP-21'de güncellenir.

## 19. Değişiklik Kontrolü

- Bu belge onaylı planın tek kaynağıdır.
- Kapsam değişikliği yeni bir WP veya açıkça "v1.1" olarak eklenir.
- P0 kuralı: güvenlik fail-closed varsayılanı zayıflatılamaz.
- Her release adayı için G0–G7 kanıtı arşivlenir.
- İmzasız artefakt hiçbir zaman "yayınlandı" olarak işaretlenmez.
