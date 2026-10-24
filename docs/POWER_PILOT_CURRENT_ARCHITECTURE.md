# Power Pilot — Mevcut Mimari Analizi Belgesi (Aşama 0)

> **Tarihsel not:** Bu belge geliştirme öncesi Aşama 0 envanteridir. `1.0.1`
> itibarıyla güncel davranış için `docs/RELEASE_HARDENING_1.0.1.md`,
> `docs/LOCAL_API_SECURITY.md` ve kaynak kod esas alınır.

Bu belge, **Power Pilot** uygulamasının mevcut teknik mimarisini, veri akışını, IPC sınırlarını ve geliştirme öncesi durumunu belgelemektedir.

---

## 1. Klasör Yapısı

```text
Power-Pilot/
├── build/                      # Paketleme ve derleme kaynakları
├── dist/                       # Derlenmiş paket çıktıları (exe, nsis, appx)
├── docs/                       # Mimari, entegrasyon ve API dokümantasyonu
├── main.js                     # Electron Main Process (Ana Süreç)
├── preload.js                  # Preload Script (ContextBridge IPC köprüsü)
├── package.json                # Bağımlılıklar, scriptler ve build konfigürasyonu
├── powerpilot_icon.ico         # Uygulama simgesi (Windows ICO)
├── powerpilot_icon.png         # Uygulama simgesi (PNG)
├── public/                     # Statik kaynaklar
└── src/                        # Renderer UI (Arayüz)
    ├── index.html              # Ana pencere (Dashboard, Aktif Görev, Ayarlar, Hakkında, Modallar)
    ├── mini.html               # Mini widget penceresi (Masaüstü yüzen sayaç)
    └── vendor/                 # Statik kütüphaneler (Tailwind JS, Public Sans, Material Symbols)
```

---

## 2. Ana Modüller

1. **Main Process (`main.js`)**:
   - `BrowserWindow` yönetimi (Ana Pencere `mainWindow` + Yüzen `miniWindow`).
   - Sistem Tepsisi (System Tray) menüsü ve ikonu.
   - Singleton Instance Lock (`app.requestSingleInstanceLock()`).
   - Zamanlayıcı Döngüsü (`setInterval`, `cancelTimer`, `executeAction`).
   - İşletim Sistemi Güç Komutları (`exec('shutdown /s /t 0')`, `restart`, `sleep`, `hibernate`).
   - Otomatik Başlatma (`app.setLoginItemSettings`).
   - IPC dinleyicileri (`schedule-action`, `cancel-action`, `window-*`, `update-mini-timer`, vb.).

2. **Preload Script (`preload.js`)**:
   - `contextIsolation: true` ve `nodeIntegration: false` mantığıyla güvenli IPC köprüsü.
   - `window.electronAPI` nesnesi üzerinden renderer tarafına kontrollü API sunumu (`scheduleAction`, `cancelAction`, `setAutostart`, `openExternal`, vb.).

3. **Renderer Process (`src/index.html` ve `src/mini.html`)**:
   - Tailwind CSS ve Material Symbols tabanlı dinamik arayüz.
   - Sekme/Görünüm yönetimi (`dashboard`, `activeTask`, `settings`, `about`).
   - 17 Dil desteği (TR, EN, DE, FR, ES, IT, NL, CS, PL, SV, NB, DA, PT, JA, ZH, KO, AR) — `localStorage` üzerinden saklanan çeviriler.
   - Geri sayım sayacı hesaplamaları ve `electronAPI.updateMiniTimer` güncellemesi.

---

## 3. Akışlar

### 3.1. Uygulama Başlangıç Akışı
1. `main.js` çalışır, Singleton lock kontrol edilir.
2. `app.whenReady()` ile `createWindow()` ve `createTray()` tetiklenir.
3. Ana pencere (`mainWindow`) oluşturulur ve `src/index.html` yüklenir.
4. Renderer tarafında `DOMContentLoaded` ile `localStorage`'dan ayarlar (dil, tema, bildirim, autostart) yüklenir.

### 3.2. Zamanlayıcı Çalışma Akışı
1. Kullanıcı Dashboard üzerinden işlem (shutdown/restart/sleep/hibernate) ve süre seçip "Başlat" butonuna basar.
2. Renderer `window.electronAPI.scheduleAction({ action, durationMs })` IPC metodunu çağırır.
3. Main process'te `targetTime = Date.now() + durationMs` hesaplanır ve 1 saniyelik `checkInterval` başlatılır.
4. Main process, pencere durumuna göre mini widget penceresini (`miniWindow`) gösterir/gizler.
5. Sayaç sıfırlandığında `executeAction(action)` çağrılır.

### 3.3. Güç İşlemi Çalışma Akışı
`main.js` içerisindeki `executeAction(action)` fonksiyonu Windows komut satırını çalıştırır:
- **Shutdown**: `shutdown /s /t 0`
- **Restart**: `shutdown /r /t 0`
- **Sleep**: `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`
- **Hibernate**: `shutdown /h`
Ardından `app.quit()` çağrılarak uygulama kapatılır.

---

## 4. Veri Saklama ve Güvenlik Sınırları

- **Veri Saklama**: `localStorage` (theme, language, notifications, autostart).
- **IPC Sınırları**: Renderer tarafında Node.js modülleri veya `child_process` erişimi YOKTUR. Tüm iletişim `preload.js` `contextBridge` üzerinden gerçekleştirilir.

---

## 5. Yeni Özelliklerin Ekleneceği Modüller

- **Güç İşlemleri & Güvenlik**: `src/main/services/PowerService.js` (Merkezi güç servisi, Lock & SignOut desteği ile).
- **Otomasyon Motoru & Zamanlayıcı**: `src/main/services/AutomationEngine.js` & `TaskManager.js`.
- **Smart Finish İzleyicileri**: `src/main/services/monitors/` (Process, CPU, Network, Disk, File, Directory, Idle, Battery).
- **Kalıcı Depolama & Migration**: `src/main/services/StorageService.js` (JSON / electron-store mantığında schema versioned storage).
- **Yerel API & Webhook**: `src/main/services/LocalApiService.js` & `WebhookService.js`.
- **CLI & n8n Entegrasyonları**: `src/cli/` & `integrations/n8n/`.
- **Arayüz (Renderer)**: `src/index.html` genişletilecek (Modüler tab/view yapısıyla Smart Finish, Şablonlar, Geçmiş, İstatistikler ve Entegrasyonlar sekmeleri).

---

## 6. Geriye Dönük Uyumluluk Kuralları

1. Mevcut `scheduleAction` ve `cancelAction` IPC kanalları kırılmayacak.
2. `localStorage` üzerindeki mevcut kullanıcı ayarları silinmeyecek/bozulmayacak.
3. Mevcut tasarım dili, renkler (`primary: #0067c2`), tipografi (`Public Sans`) ve arayüz yapısı korunacak.
4. Çekirdek sayaç akışı karmaşıklaştırılmayacak.
