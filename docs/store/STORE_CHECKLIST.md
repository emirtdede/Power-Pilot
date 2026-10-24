# Power Pilot — Mağaza Yayın Kontrol Listesi (WBS-10.2/10.3)

## Otomatik (CI/kod ile doğrulananlar)

- [ ] `npm run coverage` kapıları yeşil (satır %80, fonksiyon %70, dal %65)
- [ ] `npm run pack` NSIS artifaktı üretir; APPX yalnızca `APPX_PUBLISHER` ile `npm run dist:appx`
- [ ] OpenAPI parite testi yeşil (`openapi-parity.test.mjs`)
- [ ] `asarUnpack: **/*.node` kayıtlı (`build-config.test.mjs`)
- [ ] AI kapalıyken beyan metni gizli (uygulama-içi mantık; TS-10.1)

## Manuel (bu makinede/Partner Center'da yapılır)

- [ ] **WACK:** Windows App Certification Kit ile MSIX test edilir, 0 hata.
  Komut: WACK GUI → paket seç → tüm testler. (CI'da koşmaz: Store
  ilişkilendirmesi + SDK gerektirir.)
- [ ] **Mikrofon yetkisi:** appx manifestine `microphone` DeviceCapability
  eklendiği doğrulanır (electron-builder çıktısı elle denetlenir; yetki
  reddinde uygulama metin girişine düşer — TS-10.2).
- [ ] **11.16 beyanları:** `AI_DISCLOSURE.md` metinleri açıklamaya + Partner
  Center notuna yapıştırıldı; uygulama-içi Bildir düğmesi test edildi.
- [ ] **İmza:** NSIS için Azure Trusted Signing; Store içi Microsoft imzası
  (MSIX Store'a imzasız verilebilir, Microsoft yeniden imzalar).
- [ ] **Sürüm:** `1.1.0`, CHANGELOG, 17 dilde Store açıklaması,
  PIN'siz demo modu notu (sertifikasyon 10.3.1).

## Bilerek Ertelenenler (gerekçeli)

- **Otomatik güncelleme (electron-updater):** Yayın akışı (feed URL)
  kararı olmadan bağlanmadı — feedsiz bağlamak ölü kod olurdu.
  Karar verilince tek adım: `repository.url` + `publish` yapılandırması
  ve `autoUpdater.checkForUpdatesAndNotify()` bağlantısı.
- **Renderer bölme + Electron 43:** Bkz. F11.6 (aşağıda, ayrı faz).
