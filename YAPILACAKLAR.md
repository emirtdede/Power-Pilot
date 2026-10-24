# Power Pilot 1.1.0 — Yayın Öncesi Yapılacaklar

> Son güncelleme: 2026-10-24
> Amaç: sıfır bütçe ile yayına hazır hale gelmek.
> Durum: **kod, imza ve paket tarafı yeşil**; kalan maddeler aşağıda.

---

## Tamamlananlar

- [x] **Kod imzası (yerel/ücretsiz)** — `CN=Vellium` kendinden imzalı sertifika ile
      NSIS kurulumu imzalandı; RFC 3161 zaman damgası mevcut.
      `npm run verify:signature` → `0 warning, 0 error`.
- [x] **SBOM imzası (ücretsiz)** — Ed25519 anahtarı üretildi, manifest imzalandı.
      Açık anahtar: `docs/release/release-ed25519.pub.pem`.
      Doğrulama: `dist/release-manifest.json` → `signature` dolu, Ed25519 doğrulaması `true`.
- [x] **ASAR integrity regresyonu düzeltildi** — derleme/test çıktıları artık
      `app.asar` içine girmiyor (`build.files`). Ayrıntı: `docs/release/ASAR-INTEGRITY.md`.
- [x] **`verify-signature.ps1`** — Windows SDK yoksa electron-builder önbelleğindeki
      `signtool.exe` kullanılıyor; dosya UTF-8 BOM ile kaydedildi (PowerShell 5.1 parse hatası giderildi).
- [x] **`electron-builder.js`** — `WIN_CERT_SHA1` (parmak iziyle sertifika seçimi) ve
      `WIN_TIMESTAMP_URL` (eski signtool için HTTP timestamp) desteği.
- [x] **Paketli E2E** — temiz kurulum, `1.0.1 → 1.1.0` yükseltme, açılış, kaldırma: PASS.
- [x] **Fuses** — paketlenmiş EXE'de 9/9 doğru.
- [x] **Testler** — 66 dosya / 638 test PASS (2 ardışık tur), 11 E2E PASS.
- [x] **Diğer kapılar** — `test:security` (141 dosya), `release:check`, `locales:check`
      (17 dil/606 anahtar), `models:verify`, `audit:licenses` (181 paket), `npm audit` (0 açık).
- [x] **Eski artefaktlar arşivlendi** —
      `D:\SOFTWARE DEVELOPMENT\Tools\_PowerPilot-arsiv\` (1.0.1 kurulumu, eski `Setup.exe`, eski `.appx`).
- [x] **Kararsız test sağlamlaştırıldı** — `metric.test.mjs` yüklü makinede
      `sampleTimeoutMs` yüzünden kırılabiliyordu; testte 60 sn'ye çekildi.

---

## Bekleyen maddeler

### 1) Microsoft Store imzası ve yayını  ⏸ ERTELENDİ (bilinçli karar)

**Neden önemli:** Store'a yüklenen paketi Microsoft kendi imzasıyla yeniden imzalar.
Son kullanıcı "bilinmeyen yayıncı" uyarısı görmez; ticari sertifika gerekmez.

**Maliyet:** 0 TL — 2026 itibarıyla bireysel ve şirket geliştirici hesapları ücretsiz.

**Adımlar (hazır olduğunda):**

- [ ] Partner Center'da ücretsiz geliştirici hesabı aç (bireysel veya şirket).
- [ ] Partner Center'dan **Publisher identity** değerini al (genelde `CN=<GUID>`).
- [ ] `APPX_PUBLISHER` ortam değişkenini bu değere ayarla.
- [ ] Aynı Publisher ile **kendinden imzalı** paketleme sertifikası oluştur
      (Store yeniden imzalayacağı için ticari sertifika gerekmez).
- [ ] `npm run dist:appx` ile MSIX/APPX üret (script publisher eşleşmesini zorunlu tutar).
- [ ] Store gönderiminde yaş, kategori, gizlilik politikası ve ekran görüntülerini doldur
      (`docs/store/` altındaki görseller kullanılabilir).
- [ ] İnceleme sonrası yayınla; Store imzası sayesinde SmartScreen uyarısı kalkar.
- [ ] Store sürümü yayınlandıktan sonra NSIS dağıtımını "manuel kurulum" olarak koru.

**Not:** Bu madde tamamlanana kadar halka açık indirmelerde SmartScreen uyarısı
görülebilir. Şirket içi dağıtımda uyarı, kök sertifikanın GPO/Intune ile
Güvenilen Kök Sertifikalar deposuna eklenmesiyle kalkar.

---

### 2) 24 saatlik soak testi

**Yeniden başlatma uyarısı:** Test düz bir Node sürecidir. Bilgisayarı yeniden
başlatırsan, uyutursan veya süreci kapatırsan test **kesilir** ve rapor yazılmaz
(devam etme/resume yoktur). Veri bozulmaz, sadece baştan başlamak gerekir.
Bu yüzden **önce yeniden başlat, sonra testi başlat.**

- [ ] Bilgisayarı yeniden başlat.
- [ ] Uykuyu kapat ve testi başlat:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 10
npm run test:load -- --agents 100 --soak-hours 24 --interval-ms 5000
```

- [ ] Sabah `docs/reports/soak.md` kontrolü: emir kaybı **0**, p95 **< 150 ms**, RSS artışı **<%5**.

---

### 3) Sürüm kontrolü ve commit

- [ ] `Dokümantasyonlar/**` silinmeleri bilinçli mi? Değilse: `git restore -- Dokümantasyonlar`.
- [ ] Commit (dokümantasyon silmeleri hariç):

```powershell
git add -A -- . ":(exclude)Dokümantasyonlar"
git commit -m "release: 1.1.0 imzalama, SBOM, paket hijyeni ve sertleştirme"
```

- [ ] `npm run release:rc` (temiz ağaç + sürüm + fuses) → PASS.
- [ ] `git tag -s v1.1.0`.

---

### 4) CI ortam değişkenleri (ücretsiz)

- [ ] `PP_SBOM_SIGNING_KEY`: Ed25519 özel anahtarını GitHub Actions secret olarak ekle.
      Anahtar konumu (yerel): `%USERPROFILE%\.powerpilot\keys\release-ed25519.pem`.
- [ ] Kod imzası: üretimde HSM/TPM zorunlu. Bütçe yoksa CI'da imzasız `pack` üretilir,
      imzalı kurulum yerel makinede atılır (`docs/RELEASE_SIGNING.md` §2.1).
- [ ] `npm audit`, `audit:licenses`, `test:security`, `release:check` zaten CI'da zorunlu.

---

### 5) Periyodik bakım

- [ ] **2027-09-25**: `CN=Vellium` ve `CN=Ornare` kendinden imzalı sertifikaların süresi doluyor.
      Store yolu seçilirse yenilemeye gerek yok; yerel dağıtım sürüyorsa yeni sertifika üret
      ve kök sertifikayı yeniden dağıt.
- [ ] Ed25519 özel anahtarının şifreli yedeği alındı mı? (Kaybı, eski SBOM imzalarının
      doğrulanamaması demek.)
- [ ] 72 kullanılmayan i18n anahtarı temizliği (acil değil, yalnızca rapor).
- [ ] Otomatik güncelleme eklenirse: `latest.yml` içindeki ad
      (`Power-Pilot-Setup-1.1.0.exe`) ile gerçek artefakt adı
      (`Power Pilot Setup 1.1.0.exe`) uyumlu hale getirilmeli (şu an güncelleyici yok).

---

## Hızlı komut özeti

```powershell
# İmzalı kurulum (yerel, ücretsiz)
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object Subject -eq 'CN=Vellium'
$env:WIN_CERT_SHA1 = $cert.Thumbprint
$env:WIN_TIMESTAMP_URL = "http://timestamp.digicert.com"
npm run dist:nsis
npm run verify:signature

# İmzalı SBOM + manifest
$env:PP_SBOM_SIGNING_KEY = "$env:USERPROFILE\.powerpilot\keys\release-ed25519.pem"
npm run sbom -- --require-signature

# Paketli kurulum/yükseltme/kaldırma testi (1.0.1 arşivde)
powershell -File scripts/packaged-e2e.ps1 `
  -Installer "dist\Power Pilot Setup 1.1.0.exe" `
  -OldInstaller "D:\SOFTWARE DEVELOPMENT\Tools\_PowerPilot-arsiv\Power Pilot Setup 1.0.1.exe"

# Kontroller
npm run test:security
npm run release:check
npm run audit:licenses
```

## Bütçe

| Kalem | Tutar |
|---|---|
| Kod imzalama (yerel, kendinden imzalı) | 0 TL |
| SBOM imzası (Ed25519) | 0 TL |
| Microsoft Store hesabı ve yayın | 0 TL |
| Soak testi | 0 TL (elektrik) |
| **Toplam** | **0 TL** |
