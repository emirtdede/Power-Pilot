<div align="center">

# ⚡ PowerPilot — Desktop Power Manager

[![](https://img.shields.io/badge/Language-English-blue?style=for-the-badge&logo=google-translate)](#english-version)
&nbsp;&nbsp;&nbsp;&nbsp;
[![](https://img.shields.io/badge/Dil-T%C3%BCrk%C3%A7e-red?style=for-the-badge&logo=google-translate)](#turkish-version)

---

[![Electron](https://img.shields.io/badge/Electron-43.4.0-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.18.1-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/Version-1.0.1-2ea44f?style=flat-square)](./CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://microsoft.com/windows)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg?style=flat-square)](./LICENSE)

</div>

---

<a id="english-version"></a>
# English Version

PowerPilot is a modern, lightweight, and responsive desktop application developed with Electron. It automates system power state transitions (Shutdown, Restart, Sleep, and Hibernate) on Windows using scheduled timers and custom countdown presets.

## 🚀 Key Features

*   **⚡ Automated Power Actions**: 
    *   **Shutdown**: Shuts down the system completely.
    *   **Restart**: Reboots the machine.
    *   **Sleep**: Transitions the PC into low-power sleep state.
    *   **Hibernate**: Suspends session states onto secondary storage.
*   **⏳ Flexible Timer Controls**: 
    *   Pre-configured quick options (15 minutes, 30 minutes, 1 hour, 2 hours).
    *   Custom countdown timer setup supporting durations up to several days.
*   **📋 Task Dashboard**:
    *   Lists scheduled and active automations with trigger, next run and status.
    *   Cancel or snooze tasks directly from the list (PIN-protected when a cancel PIN is configured).
*   **🌎 Multi-Language Interface (17 Languages)**:
    *   Supported locales: Turkish, English, German, Swedish, Norwegian, Danish, French, Polish, Italian, Dutch, Czech, Spanish, Portuguese, Japanese, Chinese, Korean, and Arabic.
    *   Locates and sets the UI language to match the OS display locale on initial launch automatically.
*   **⚙️ Core Settings**:
    *   **System AutoStart**: Option to launch in the background automatically when Windows boots up (Electron `app.setLoginItemSettings`).
    *   **Desktop Toast Notifications**: Displays system-level alerts regarding scheduling states and countdown triggers.
    *   **Custom UI Theme Engine**: Responsive toggle for switching between Light and Dark mode options.

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5, Vanilla CSS3, Javascript (responsive dashboard interface)
*   **Backend**: Node.js & Electron runtime (managing shell integration and native system commands)
*   **Runtime dependencies**: `electron-log`, `ps-list`, `systeminformation`, `qrcode-generator`, `ipaddr.js`, plus the optional on-device AI stack (`node-llama-cpp`, `@fugood/whisper.node`)
*   **Compilation**: `electron-builder` (packages NSIS and APPX production setups)

---

## 📁 Project Structure

```text
Power-Pilot/
├── src/            # Renderer UI, main-process services, IPC and i18n dictionary
├── public/         # Locally bundled fonts and icons
├── scripts/        # Release, packaging, model and i18n verification gates
├── tests/          # Vitest unit tests and Playwright Electron E2E tests
├── docs/           # Architecture, security, integration and store documentation
├── build/          # Installer resources (icons, manifests)
├── main.js         # Main Electron lifecycle, tray and IPC wiring
├── preload.js      # Context-isolated preload bridge
├── package.json    # Scripts, dependencies and electron-builder configuration
└── powerpilot_icon.ico
```

---

## ⚙️ Setup & Compilation Guide

### 1. Run in Development Mode
Make sure you have Node.js installed. Clone the repository and install requirements:
```bash
npm install
npm start
```

### 2. Package standalone installer (.exe)
To compile a production installer for Windows:
```bash
npm run dist:nsis
```
The packaged installer is generated inside `dist/`. Release candidates must pass
the local gates first:
```bash
npm test
npm run coverage
npm run locales:check
npm run models:verify
npm run release:check
npm run test:e2e
```
Signing requires `CSC_LINK` and `CSC_KEY_PASSWORD`; unsigned builds are for
internal testing only. See [docs/RELEASE_SIGNING.md](docs/RELEASE_SIGNING.md)
and [docs/RELEASE_HARDENING_1.0.1.md](docs/RELEASE_HARDENING_1.0.1.md).

---

## ⚖️ License
Proprietary commercial software — see [LICENSE](./LICENSE). Pilot use only under a written pilot agreement with Vellium.

---

<a id="turkish-version"></a>
# Türkçe Versiyon

PowerPilot, Windows işletim sistemlerinde bilgisayarın güç yönetim işlemlerini (Kapatma, Yeniden Başlatma, Uyku Modu ve Hazırda Bekletme) zamanlayıcılar ve özel geri sayımlar aracılığıyla otomatikleştiren, Electron tabanlı modern, hızlı ve duyarlı bir masaüstü uygulamasıdır.

## 🚀 Öne Çıkan Özellikler

*   **⚡ Otomatik Güç Eylemleri**:
    *   **Kapatma**: Bilgisayarı tamamen kapatır.
    *   **Yeniden Başlatma**: Sistemi yeniden başlatır.
    *   **Uyku Modu**: Sistemi düşük güç tüketimli uyku durumuna geçirir.
    *   **Hazırda Bekletme**: Mevcut oturumu diske kaydederek çalışmayı askıya alır.
*   **⏳ Esnek Zamanlayıcı Seçenekleri**:
    *   Hızlı süre seçenekleri (15 dakika, 30 dakika, 1 saat, 2 saat).
    *   Günler öncesinden zamanlama yapmaya olanak tanıyan özel geri sayım aracı.
*   **📋 Görev Panosu**:
    *   Zamanlanmış ve aktif otomasyonları tetikleyici, sonraki çalışma ve durum bilgisiyle listeler.
    *   Görevleri listeden iptal edin veya erteleyin (iptal PIN'i tanımlıysa PIN korumalı).
*   **🌎 Çok Dilli Arayüz (17 Dil Desteği)**:
    *   Türkçe, İngilizce, Almanca, İsveççe, Norveççe, Danca, Fransızca, Lehçe, İtalyanca, Felemenkçe, Çekçe, İspanyolca, Portekizce, Japonca, Çince, Korece ve Arapça.
    *   İlk açılışta Windows sistem dilini otomatik olarak algılar ve arayüzü bu dile ayarlar.
*   **⚙️ Genel Ayarlar**:
    *   **Başlangıçta Çalıştır (AutoStart)**: Windows açıldığında PowerPilot'ın arka planda otomatik başlamasını sağlar.
    *   **Masaüstü Bildirimleri**: Zamanlama durumları ve iptal işlemleri hakkında Windows bildirim ekranları aracılığıyla bilgi verir.
    *   **Gelişmiş Tema Motoru**: Açık (Light) ve Koyu (Dark) temalar arasında anlık geçiş imkanı sunar.

---

## 🛠️ Kullanılan Teknolojiler

*   **Önyüz (Frontend)**: HTML5, CSS3, Javascript (tasarım ve animasyonlar)
*   **Arkayüz (Backend)**: Node.js & Electron runtime (sistem kabuk entegrasyonu ve komutları)
*   **Çalışma zamanı bağımlılıkları**: `electron-log`, `ps-list`, `systeminformation`, `qrcode-generator`, `ipaddr.js` ve isteğe bağlı cihaz üzeri AI yığını (`node-llama-cpp`, `@fugood/whisper.node`)
*   **Derleme**: `electron-builder` (NSIS ve APPX kurulum dosyası üretimi)

---

## 📁 Proje Yapısı

```text
Power-Pilot/
├── src/            # Arayüz, ana süreç servisleri, IPC ve i18n sözlüğü
├── public/         # Yerel olarak paketlenen yazı tipleri ve simgeler
├── scripts/        # Release, paketleme, model ve i18n doğrulama kapıları
├── tests/          # Vitest birim testleri ve Playwright Electron E2E testleri
├── docs/           # Mimari, güvenlik, entegrasyon ve mağaza dokümantasyonu
├── build/          # Kurulum kaynakları (simgeler, manifestler)
├── main.js         # Electron yaşam döngüsü, tray ve IPC bağlantıları
├── preload.js      # Context-isolated preload köprüsü
├── package.json    # Scriptler, bağımlılıklar ve electron-builder yapılandırması
└── powerpilot_icon.ico
```

---

## ⚙️ Kurulum ve Derleme Kılavuzu

### 1. Geliştirici Ortamında Çalıştırma
Bilgisayarınızda Node.js kurulu olduğundan emin olun. Bağımlılıkları yükleyin ve uygulamayı başlatın:
```bash
npm install
npm start
```

### 2. Bağımsız Kurulum Dosyası (.exe) Oluşturma
Windows için kurulum setup dosyası derlemek için:
```bash
npm run dist:nsis
```
Oluşturulan setup dosyası `dist/` klasöründe yer alır. Release adayı öncesinde
yerel kapılar çalıştırılmalıdır:
```bash
npm test
npm run coverage
npm run locales:check
npm run models:verify
npm run release:check
npm run test:e2e
```
İmzalı üretim için `CSC_LINK` ve `CSC_KEY_PASSWORD` gerekir; imzasız build
yalnızca iç test içindir. Ayrıntılar:
[docs/RELEASE_SIGNING.md](docs/RELEASE_SIGNING.md) ve
[docs/RELEASE_HARDENING_1.0.1.md](docs/RELEASE_HARDENING_1.0.1.md).

---

## ⚖️ Lisans
Tescilli ticari yazılım — bkz. [LICENSE](./LICENSE). Pilot kullanımı yalnızca Vellium ile yazılı pilot anlaşması kapsamında.
