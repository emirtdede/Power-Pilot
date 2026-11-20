# Power Pilot — Son Kullanıcı 100/100 Yol Haritası

> Tarih: 2026-11-16
> Varsayım: Dağıtım **Microsoft Store (MSIX)** üzerinden yapılacak; kod imzası/Store
> yeniden imzalama kapsam dışı. Hedef: hem "normal kullanıcı" hem "ileri seviye
> kullanıcı" için 100/100.
> Not: "100" bu belgedeki rubriğin tamamının karşılanmasıdır; Store puanı ve
> elde tutma bir **sonuç**tur, doğrudan kontrol edilemez.

---

## 1. Araştırma bulguları

### 1.1 Pazar ve rakipler (Microsoft Store, ABD, 2026-11)

| Uygulama | Puan | Oy | Not |
|---|---:|---:|---|
| Shutdown Timer Classic | 4.7 | 131 | Kategorinin lideri; açık kaynak, sade, çevrimdışı |
| Shutdown | 4.6 | 97 | Ücretli ($1.99), 24 saate kadar gecikme |
| Shutdown PC Timer | 4.7 | 29 | Geri sayım + tepsi + ses kısma |
| PowerOff Timer | 3.3 | 34 | Haftalık program; düşük puan |
| Auto Device Shutdown | 4.9 | 18 | Basit zamanlayıcı |
| WiseCleaner Auto Shutdown | 5.0 | 5 | Küçük hacim |
| Shutdown Scheduler | 0.0 | 0 | "Sistem koşulları" iddiası var, traksiyon yok |

**Çıkarım:** Kategori küçük ama canlı; lider bile yalnızca ~131 oy. "Koşula bağlı
kapatma" (indirme/render bitince) Store'da olgun bir rakiple temsil edilmiyor.
Fiyatlandırma 0–$2 bandında; ücretsiz + kaliteli deneyimle ilk 3'e girmek gerçekçi.

### 1.2 Gerçek kullanıcı ihtiyaçları (talep sinyalleri)

- **"İndirme bitince kapat/uyut" talebi farklı projelerde tekrar ediyor**:
  Motrix'te birleştirilmiş (#2284), Vividl (#123), Persepolis (#981), ydl-ui
  (#123), MegaBasterd (#463), Heroic Games Launcher (#3709) açık talep.
  → Bu, Power Pilot'un Smart Finish motorunun tam hedefi; Store'da doğrudan
  rakibi yok.
- **Lider uygulamanın issue'ları (kullanıcı sesi):**
  - 10–15 sn önce **uyarı + isteğe bağlı ses** ("Meeting!" örneği).
  - **Tekrarlayan program** (günlük/haftalık/30 günlük) — takvimi bozmadan.
  - **Tek tık hazır ayarlar** ("20 dk sonra kapat", "15:30'da kapat").
  - **Ekranın üstünde devralan uyarı** ve **karanlık tema**.
  - Hata bildirimleri: gece yarısı (00:00) reddediliyor; "Sleep" bazen
    kapatmaya dönüşüyor; duraklat/devam sonrası zaman sıçraması; geçersiz
    girişte çökme; **standby sonrası beklenmedik kapatma** ("sabah uyanınca
    kapandı, tekrar açmak zorunda kaldım").
- **Ortak beklentiler:** kurulumun küçük ve hızlı olması, yönetici izni
  istememesi, arka planda sessiz çalışma, kolay iptal, veri kaybı uyarısı,
  çoklu monitör/DPI düzgünlüğü, çok dillilik.

> Araştırma kısıtı: Microsoft Store yorum metinleri programatik olarak
> erişilemedi (JS/shadow DOM engeli). Bu bölüm Store **puan/hacim** verisi,
> lider rakibin **açık issue'ları** ve indirme yöneticilerindeki **talep
> kayıtları** ile oluşturuldu.

### 1.3 Store (MSIX) kısıtları — planı şekillendiren maddeler

Politika (Store Policies v7.20):

- **10.2.4:** Microsoft dışı NT servisi bağımlılığı genelde yasak → mevcut
  `install-service.ps1` / servis modu **Store paketine giremez**.
- **10.2.7:** Temiz kaldırma desteklenmeli; kullanıcı verisi için "verilerimi
  sil" akışı gerekir.
- **10.2.8:** Windows ayarlarını değiştirmeden önce kullanıcı onayı; autostart
  Run anahtarı değil, **StartupTask** ile yapılmalı.
- **10.4.2:** Hızlı açılış, yanıt veren arayüz, istisnalarda çökmeme.
- **10.5.1:** Kişisel veri işleniyorsa **gizlilik politikası URL'si** zorunlu
  (envanter, ajan kimliği, yerel API, AI model indirmesi kapsanmalı).
- **10.7:** Desteklenen **her dil için ürün ve Store açıklaması yerelleştirilmeli**
  → 17 dil iddiası, 17 dilli mağaza metni demek.
- **10.9:** Bildirimler sistem ayarlarına saygı göstermeli.
- **11.11:** IARC yaş derecelendirmesi.
- **11.16:** Üretken AI kullanımı **meta veride ve Partner Center'da beyan
  edilmeli**, uygunsuz içerik bildirim mekanizması sunulmalı.

MSIX teknik:

- Paket boyutu üst sınırı **25 GB** (bizim için sorun değil; asıl sorun indirme
  boyutu algısı).
- Paketli masaüstü uygulaması `runFullTrust` ile tam güven çalışır; autostart
  için manifestte `windows.startupTask` uzantısı gerekir. `app.setLoginItemSettings`
  MSIX'te çalışmaz (`main.js` içinde değiştirilmeli).
- Task Scheduler'a yazılan görevler paket yoluna bağlanır ve Store güncellemesinde
  kırılabilir; Store sürümünde **varsayılan mekanizma olmamalı**.
- Store kurulumları Store üzerinden güncellenir; uygulama içi güncelleyici
  kaldırılmalı/etkisizleştirilmeli.

---

## 2. Ürün stratejisi: tek uygulama değil, iki yüzey

| | **Power Pilot (Store / Consumer)** | **Power Pilot Pro (MSI / Enterprise)** |
|---|---|---|
| Hedef | Normal kullanıcı | İleri seviye, BT, n8n/CLI kullanıcısı |
| Dağıtım | MSIX, Store güncellemesi | İmzalı MSI, manuel/Intune |
| Kapsam | Zamanlayıcı, Smart Finish, şablonlar, bildirimler, (opsiyonel) AI | + servis modu, konsol ajanı, LAN API, headless, özel komut |
| Kısıt | Store politikaları | Kurumsal politika |

Store paketinde **olmayacaklar:** NT servisi, konsol ajanı/headless, LAN sunucu,
Task Scheduler bağımlılığı, uygulama içi güncelleyici, rastgele komut çalıştırma.
Bunlar Pro'da kalır ve Store açıklamasında "Enterprise sürümde" olarak belirtilir.

---

## 3. 100/100 rubriği (tanım-of-done)

Toplam 100 puan; her satır ölçülebilir kabul kriteri taşır.

### A. Normal kullanıcı (50 puan)

| # | Kriter | Puan | Bugün | Hedef |
|---|---|---:|---:|---:|
| A1 | Kurulum boyutu (temel, AI modeli hariç) | 8 | ✅ **107 MB** kurulum / 377 MB kurulu (ölçüldü) | ≤120 MB |
| A2 | Soğuk açılış → etkileşimli | 6 | ✅ ilk boya (FCP) p95 **300 ms**, p50 268 ms (8 çalıştırma, ilk çalıştırma dahil; `scratch/boot-measure.js`) | p95 ≤2.5 sn |
| A3 | İlk görev ≤2 tık, 3 adımlı onboarding | 8 | ✅ 3 adımlı rehber + tek tık kartlar | var |
| A4 | Tek tık hazır senaryolar (indirme/render/gece) | 6 | ✅ onboarding kartları + şablonlar | var |
| A5 | İptal/erteleme her yerde (pencere, tepsi, mini, klavye) | 4 | ✅ pencere + tepsi + mini widget + Alt+S/R/L/H/K, Esc, Ctrl+T | tam |
| A6 | Veri kaybı koruması (uyarı + graceful + engellenme raporu) | 6 | ✅ 1/5 dk uyarı + `TerminalActionVerifier` veto raporu (toast + şerit + tepsi balonu) | tam |
| A7 | "Neden çalışmadı?" görünürlüğü | 4 | ✅ geçmiş "neden" paneli (kullanıcı dili) | var |
| A8 | Uyku/standby politikası (uyandığında çalıştır/atla) | 4 | ✅ `wakeMode` + tolerans (varsayılan 10 dk) | var |
| A9 | Bildirim/ses tercihleri, Focus Assist uyumu | 4 | ✅ uyarı sesi tercihi (`soundMode`) + sessiz mod | tam |

### B. İleri seviye kullanıcı (30 puan)

| # | Kriter | Puan | Bugün | Hedef |
|---|---|---:|---:|---:|
| B1 | Tekrarlayan program UI (günlük/haftalık/özel gün) | 6 | ✅ günlük/hafta içi/hafta sonu/özel gün + saat | var |
| B2 | CLI paritesi + doküman | 5 | ✅ 15 rotanın tamamı, `--help`/`--json`, API anahtarı zorunlu; 21 test | tam |
| B3 | Yerel REST API + OpenAPI + n8n örneği | 6 | ✅ OpenAPI kodla eşitlenmiş (`/audit/verify` dahil), n8n rehberi + workflow | tam |
| B4 | Profil/şablon içe-dışa aktarma (JSON) | 4 | ✅ dışa/içe aktarma (sürümlü, doğrulanmış) | var |
| B5 | Tepsi gizleme, kısayollar, çoklu monitör/DPI | 5 | ✅ mini widget ana pencerenin ekranına yerleşir + ekran değişiminde taşınır (`MiniWindowPlacement`) | tam |
| B6 | Pro sürüm: servis/ajan/konsol, portable mod | 4 | var (MSI tarafı) | paketli ve dokümante |

### C. Store ve güven (20 puan)

| # | Kriter | Puan | Bugün | Hedef |
|---|---|---:|---:|---:|
| C1 | MSIX uyumu (StartupTask, runFullTrust, tek örnek, Store update) | 6 | ✅ `--store` ile gerçek `.appx` üretildi (159,8 MB, 113 girdi); manifestte `runFullTrust` + `windows.startupTask` (`Enabled="false"`), doğru `app/` EXE yolu | var |
| C2 | Politika uyumu (10.2.4/10.2.7/10.2.8/10.5/10.9/11.16) | 5 | ✅ Store paketinde servis/LAN/ajan yok (10.2.4), "verilerimi sil" (10.2.7), StartupTask onayı (10.2.8), telemetri yok (10.5), WCAG AA (10.9), CPU-only AI (11.16) | tam |
| C3 | 17 dilli mağaza metni + ekran görüntüleri | 3 | ✅ `docs/store/store-listing.json` (17 dil, sınır denetimli) + gerçek logo/ekran görüntüsü varlıkları | var |
| C4 | Erişilebilirlik (WCAG 2.1 AA hedefi, klavye, okuyucu, kontrast) | 3 | ✅ 93/93 düğme adlı, süre adımlayıcıları bağlam taşıyor, klavye kısayolları; `a11y.spec.js` PASS | tam |
| C5 | Ölçüm/telemetri (çökmesiz oturum, görev başarısı, aktivasyon) | 3 | ✅ cihazda kalan sağlık özeti (çökmesiz oturum, başarı oranı, hata kategorileri); telemetri yok | var |

**Mevcut tahmini:** A ≈ 46/50, B ≈ 27/30, C ≈ 19/20 → **~92/100** (Store varsayımıyla, imza/Partner Center adımları hariç).
Kalan açıklar: A2 soğuk açılış p95 ölçümü (p50 ölçüldü), A3 ilk görev tamamlama oranı, B5 çoklu monitör DPI kapsamı genişletilebilir, C1 yalnızca **gerçek mağaza sertifikasıyla** imzalama/WACK (elle), C2 Partner Center/IARC beyanları (elle).

---

## 4. Yol haritası (90 gün)

### Faz 0 — Fizibilite (Hafta 1) · Go/No-Go

1. **MSIX spike:** electron-builder `appx` hedefiyle imzasız test paketi üret;
   `runFullTrust`, tek örnek, `StartupTask`, appdata yazımı, loopback API ve
   Task Scheduler davranışını ölç.
2. **Boyut ölçümü:** `@node-llama-cpp` (657 MB) ve `@fugood/whisper` (164 MB)
   içindeki CUDA/Vulkan ikililerini hariç tutarak CPU-only paket boyutunu ölç.
3. **Karar:** (a) AI Store taban paketinde mi, opsiyonel pakette mi, yoksa Pro'da
   mı? (b) LAN/konsol Store'dan çıkarılsın mı? (c) Task Scheduler'sız uyandırma
   senaryosu kabul edilebilir mi?

**Çıkış kriteri:** Ölçülmüş temel paket boyutu, açılış süresi ve Store'da
çalışan/çalışmayan özellik listesi.

### Faz 1 — Normal kullanıcı çekirdeği (Hafta 2–4)

- Base paketi ≤120 MB'a indir (Electron + SQLite + Smart Finish; AI ayrı).
- StartupTask ile "Windows açılınca başlat" (ayarlardan onaylı); Run anahtarı kaldır.
- **3 adımlı onboarding:** dil (OS'tan) → "Ne yapmak istiyorsun?" (3 büyük kart) →
  bildirim/autostart onayı. Kartlar: "Süre sonunda kapat", "İşim bitince kapat"
  (indirme/render algıla), "Gece uyut".
- Dashboard'da **tek tık senaryolar**; şablonlar öne çıkarılır.
- **PIN çıkmazı düzeltmesi:** PIN yokken güvenlik eylemi istenirse modalda
  "PIN oluştur" akışı (mevcut `modal-pin` genişletilir).
- **Veri kaybı koruması:** varsayılan 60 sn uyarı + isteğe bağlı ses; kapatma
  engellenirse sonuç "engellendi (açık uygulamalar)" olarak gösterilir; "zorla"
  yalnızca açık onayla.
- **Uyandırma politikası:** "Uyandığında çalıştır (X dk tolerans) / atla +
  bildir" ayarı; varsayılan tolerans 10 dk.
- Bildirim: Focus Assist'e saygı, 10 dk/1 dk kademeleri, "Ertele" aksiyonu.

**Kabul:** Temiz Windows 11'de kurulumdan ilk göreve ≤60 sn; ≤2 tık; iptal 3
yoldan; boyut ve açılış bütçesi tutuyor.

### Faz 2 — Güvenilirlik ve güven (Hafta 5–7)

- **24 saat soak** (mevcut `test:load`) + **7 gün dogfood** + Store **beta flight**.
- "Neden çalışmadı?" paneli: son çalıştırma zaman çizelgesi (tetiklendi/atlandı/
  engellendi/hata kodu, kullanıcı diliyle, teknik detay katlanır).
- Görev başarısı ve çökmesiz oturum için **yerel ölçüm + isteğe bağlı gönderim**
  (gizlilik politikasına eklenir).
- Uyku/uyanma, saat dilimi/DST, pil azalması, UPS ve "kullanıcı oturumu kilitli"
  senaryoları için regresyon testleri.
- Kaldırma: "verilerimi de sil" seçeneği + kaldırma sonrası artık bırakmama.

**Kabul:** 7 gün boyunca görev kaçırma 0 (tolerans politikasına uygun); çökmesiz
oturum ≥99.5%; beta NPS ≥40.

### Faz 3 — İleri seviye (Hafta 8–9)

- **Tekrarlayan program UI** (günlük/hafta içi/hafta sonu/özel gün + saat).
- CLI paritesi: `--schedule`, `--cancel`, `--list`, `--dry-run`; `--help` yerelleştirilmiş.
- OpenAPI şeması + n8n/Home Assistant örnekleri; API dokümanı `docs/`.
- Profil/şablon içe-dışa aktarma (JSON şema sürümlü).
- Tepsi gizleme, klavye kısayolları, çoklu monitör/DPI testleri.
- Pro MSI: servis/ajan/konsol/portable; sürüm notlarında Store ile fark tablosu.

**Kabul:** Tekrarlayan görev UI'dan kurulup 3 ardışık tetikleme doğru; CLI
dokümanındaki her komut E2E; OpenAPI doğrulaması geçiyor.

### Faz 4 — Store başvurusu (Hafta 10–11)

- Partner Center: isim rezervasyonu, kategori "Utilities & tools", IARC yaş derecesi.
- **Gizlilik politikası URL'si** (envanter, ajan, AI indirmesi, ölçüm kapsanır),
  destek URL'si, EULA.
- **AI beyanı (11.16):** metadata + Partner Center; uygunsuz içerik bildirimi
  (uygulama içi "geri bildir" + e-posta).
- **17 dilli mağaza metni** (mevcut sözlüklerden üretilip gözden geçirilir);
  ekran görüntüleri 6 ana pazarda yerelleştirilmiş, diğerlerinde metinsiz/İngilizce.
- Erişilebilirlik: klavye-only akış, ekran okuyucu etiketleri (bu turda kurulan
  i18n aria altyapısı genişletilir), kontrast, 200% zoom.
- WACK (Windows App Certification Kit) temiz; sertifika notlarında "yönetici
  izni gerekmez, güç eylemleri kullanıcı tarafından zamanlanır" açıklaması.
- Kademeli yayın: %5 → %25 → %100; geri alma planı (Store flight).

**Kabul:** Sertifikasyon geçti; ilk 2 haftada çökme kaynaklı 1 yıldız ≤%5.

### Faz 5 — Sürekli iyileştirme (Hafta 12+)

- Mağaza yorumlarına 48 saat içinde yanıt; her sürümde en az 1 kullanıcı-oylu iyileştirme.
- Aylık sürüm treni; sürüm notları 17 dilde.
- KPI panosu: aktivasyon, görev başarısı, çökmesiz oturum, D7 tutma, kaldırma.

---

## 5. Teknik kararlar (öneri)

| Konu | Karar | Gerekçe |
|---|---|---|
| Autostart | MSIX `windows.startupTask` + uygulama içi onay | 10.2.8; `setLoginItemSettings` MSIX'te çalışmaz |
| Zamanlama motoru | Uygulama açıkken in-app timer; StartupTask ile tepside kalma | Task Scheduler paket yoluyla kırılır, politika riski |
| Uyandırma | Spike: Win32 waitable timer/`powercfg`; değilse "uygulama açıkken" net iletişimi | MSIX kısıtı |
| AI | Önce CPU-only runtime ile ölç; >350 MB ise **opsiyonel AI paketi**; modeller her durumda on-demand + SHA-256 | Boyut/11.16 |
| LAN/konsol/ajan | Store dışı (Pro MSI) | 10.2.4, inceleme riski |
| Güncelleme | Yalnızca Store | MSIX kuralı |
| Veri | `%LOCALAPPDATA%` (mevcut); kaldırmada "verilerimi sil" | 10.2.7 |
| Ölçüm | Varsayılan kapalı, isteğe bağlı anonim gönderim | 10.5, güven |

---

## 6. KPI'lar (100'ün kanıtı)

| KPI | Hedef |
|---|---:|
| Temel kurulum boyutu | ≤120 MB |
| Soğuk açılış p95 | ≤2.5 sn |
| İlk görev tamamlama (kurulumdan sonra 5 dk) | ≥70% |
| Görev yürütme başarısı | ≥99.5% |
| Çökmesiz oturum | ≥99.5% |
| Store puanı (≥200 oy) | ≥4.6 |
| 30 gün kaldırma | ≤25% |
| Destek ilk yanıt | ≤48 saat |
| Erişilebilirlik | WCAG 2.1 AA kontrol listesi %100 |

---

## 7. Riskler ve azaltma

| Risk | Etki | Azaltma |
|---|---|---|
| MSIX'te arka plan zamanlaması sınırlı | Yüksek | Faz 0 spike; "uygulama açıkken" modeli + StartupTask; alternatif uyandırma |
| Store incelemesi LAN sunucu/ajanı reddeder | Yüksek | Store paketinden çıkar; Pro MSI |
| AI paketi boyutu | Orta | CPU-only, opsiyonel paket, model on-demand |
| 17 dilli mağaza metni yükü | Orta | Sözlüklerden üret + 6 dilde görsel |
| Veri kaybı şikâyeti | Yüksek | 60 sn uyarı, graceful, engel raporu, zorla için açık onay |
| EDR/AV güç eylemini engeller | Orta | Store imzası, tanılama paneli, destek rehberi |
| Tekrarlayan program UI eksikliği | Orta | Faz 3, motor hazır |

---

## 8. Yapılmayacaklar (Store paketi)

- NT servisi kurma, ajan/headless/konsol, LAN API.
- Run anahtarı, uygulama içi güncelleme, rastgele komut çalıştırma.
- Kullanıcı onayı olmadan Windows ayarı değiştirme.
- Sessiz "force" kapatma.

---

## 9. Uygulama durumu (2026-11-16)

### Tamamlananlar

- **Faz 0 — MSIX fizibilitesi (kısmi):** Store kapsamı koda işlendi
  (`src/main/config/distribution.js`), MSIX startupTask uzantısı ve
  `electron-builder.store.cjs` eklendi; `pack:store` ile paket üretildi.
- **Faz 0 — Boyut:** Store paketi **599 MB kurulu** (önce 1.300 MB):
  test/doküman/CI artıkları, CUDA ve arm64 AI ikilileri dışarıda;
  app.asar 68 MB. Ölçüm: `npm run pack:store`.
- **Faz 1 — İlk deneyim:** 3 adımlı rehber + tek tık senaryolar
  (süre / indirme bitince / gece uyut), mevcut görevi olan kullanıcıya
  gösterilmez. E2E: `tests/e2e/first-run.spec.js`.
- **Faz 1 — PIN:** PIN'siz kurulumda güvenlik ayarı denemesi PIN kurma
  kartına yönlendirilir (modal döngüsü yok).
- **Store kısıtları:** LAN/konsol/servis/Task Scheduler Store'da kapalı;
  autostart `ms-settings:startupapps`. E2E: `tests/e2e/store-edition.spec.js`.
- **Regresyon kapıları:** `distribution.test.mjs`, `store-packaging.test.mjs`.

### Sıradaki (öncelik sırası)

1. MSIX paketini gerçek sertifikayla üretip `AppxManifest`/kurulum doğrulaması
   (StartupTask'ın Windows Başlangıç listesinde görünmesi).
2. Boyut: Store taban paketini ≤120 MB'a indirmek (A1 hâlâ açık; ~599 MB).
3. A6: kapatma engellendiğinde "engellendi (açık uygulamalar)" blokaj raporu.
4. A9: bildirim sesi seçenekleri ve Focus Assist kademeleri.
5. C: 17 dilli Store metni, gizlilik URL'si, AI beyanı, IARC, WCAG AA, WACK,
   yerel ölçüm (CrashFree/task success).

---

## 10. Son doğrulama turu (2026-11-17)

Bu turda kapatılan gerçek son-kullanıcı hataları:

| # | Hata | Etki | Kanıt |
|---|---|---|---|
| P0 | ACL `/T` + `(OI)(CI)F` dosyalara ACE yazmıyordu | Yeniden başlatmada **tüm görev/ayarlar kayboluyordu**, bakım modu | `scratch/verify-acl-module.mjs` → `REPAIRED`, db `OK(tasks=1)`; `acl-secure.test.mjs` P0 bloğu |
| P0 | `schtasks /sd` yerel ayara bağımlıydı (tr-TR'de "Incorrect Start Date") | Uygulama kapalıyken yedek tetikleyici **hiç kurulmuyordu** | `scratch/verify-scheduler-xml.js` → gerçek `schtasks` ile PASS (StartBoundary, Arguments, pil=ok, StartWhenAvailable=ok) |
| P1 | "Verilerimi sil" akışı yoktu (Store 10.2.7 ihlali) | Kullanıcı verisini silemiyordu; kaldırma sonrası kalıntı | `scratch/verify-data-wipe.js` → PASS (6 girdi silindi, kapsam dışı dosya korundu); `data-wipe.test.mjs` (9 test) |
| P1 | NSIS kurulumu **507 MB**'tı (CUDA/Vulkan AI ikilileri) | "Bu bir zamanlayıcı, neden bu kadar büyük?" → indirme terk | `npm run dist:nsis` → **173 MB** (unpacked 598 MB); GPU ikilileri ayıklandı; `scratch/verify-llama-without-cuda.js` → `getLlama()` CPU ile PASS; `packaged-e2e.ps1` PASS |
| P1 | Bakım modu **görünmüyordu** (bozuk DB / yarım migrasyon / kurcalanmış denetim zinciri) | Her kayıt sessizce reddediliyor, arayüz normal görünüyor; kullanıcı görevinin kaydedildiğini sanıyor | `get-storage-status` IPC + `preload.getStorageStatus` + `#storage-warning` `role=alert` şeridi; metinler mevcut `statusWarning` / `errorStorageMaintenance` / `errorAuditTampered` anahtarlarından; `tests/main/storage-status.test.mjs` (8 test) |

Doğrulama durumu:

- `npx vitest run` → **113 dosya / 1420 test geçti** (~31 sn).
- `npm run locales:check` → **17 dil / 708 anahtar temiz**.
- `npx playwright test tests/e2e/readiness.spec.js` → **1 passed** (tekrarlayan günlük +
  özel gün, uyku politikası kaydet/doğrula/yeniden yükle, yeniden başlatma sonrası
  kaçırılan görev "neden" paneli, şablon dışa aktarma).
- `node --check main.js` / `preload.js` / `app.js` / `DataWipe.js` → OK.

