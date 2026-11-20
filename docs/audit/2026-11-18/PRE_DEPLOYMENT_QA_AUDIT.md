# Pre-Deployment QA & Architecture Audit — Power Pilot

**Sürüm:** 1.1.0 · **Tarih:** 2026-11-18 (son doğrulama 2026-11-19) · **Kapsam:** `src/`, `main.js`, `preload.js`, `scripts/`
**Yöntem:** dosya dosya statik tarama + gerçek uygulamada çalışma zamanı ölçümü + 1679 birim / 32 E2E testi + paketlenmiş kurulum E2E

> **Mimari not:** Bu proje **Electron 43 + vanilla JS** (React/Next.js değil). İstenen
> React/`useEffect`/Server-Component başlıkları bu kod tabanında karşılığı olmadığı için
> "Sorun bulunmadı — kapsam dışı (React yok)" olarak işaretlendi; yerine eşdeğer risk
> sınıfları (renderer state, DOM yeniden çizimi, IPC yarışları) denetlendi.

---

## 1. Kritik Hatalar ve Buglar

### 1.1 ✅ DÜZELTİLDİ — Mağaza gizlilik/destek URL'leri 404 dönüyordu (P0)

| | |
|---|---|
| **Dosya** | `docs/store/store-listing.json` |
| **Etki** | Microsoft Store başvurusunda tıklanan gizlilik politikası bağlantısı **"Bu sayfa burada değil."** sayfasını açıyordu. Store, geçerli gizlilik URL'si olmadan başvuruyu reddeder. |
| **Kanıt (öncesi)** | Canlı tarayıcı: `https://vellium.dev/power-pilot/privacy` → HTTP 200 ama `<title>Bu sayfa burada değil. \| Vellium</title>` (SPA 404). Aynısı `/power-pilot/support`. |

**Hatalı kod:**
```json
"privacyPolicyUrl": "https://vellium.dev/power-pilot/privacy",
"supportUrl": "https://vellium.dev/power-pilot/support",
```

**Düzeltme** — canlı doğrulanmış (200 + gerçek içerik) sayfalar:
```json
"privacyPolicyUrl": "https://vellium.dev/en/legal/privacy",
"supportUrl": "https://vellium.dev/en/legal/support",
"eulaUrl": "https://vellium.dev/en/legal/products/power-pilot",
"contactUrl": "https://vellium.dev/en/contact",
```

**Kanıt (sonrası):**

| URL | Durum | Başlık | Uzunluk |
|---|---|---|---|
| `/en/legal/privacy` | 200 | Vellium Privacy Policy | 4 617 krkt |
| `/en/legal/support` | 200 | Support Policy | 2 180 krkt |
| `/en/legal/products/power-pilot` | 200 | Power Pilot Legal Documents | 2 200 krkt |
| `/en/contact` | 200 | Contact | 1 793 krkt |

**Regresyon:** `tests/main/store-listing.test.mjs` → *"URL'ler allowlist'teki gerçek sayfalara işaret eder (404 dead-link yok)"* — `/power-pilot/*` deseninin geri gelmesini engeller.

---

### 1.2 ✅ DÜZELTİLDİ — Ana süreçte çökme koruması yoktu (P1)

| | |
|---|---|
| **Dosya** | `main.js` |
| **Etki** | `uncaughtException` / `unhandledRejection` kancası yoktu. Yakalanmamış tek bir hata uygulamayı **sessizce** kapatıyor, log bırakmıyor, kullanıcı ne olduğunu anlamıyordu (zamanlanmış görev kaybı riski). |

**Hatalı durum:** `process.on` yalnızca `SIGINT`/`SIGTERM` için vardı (`main.js:279-280`).

**Düzeltme** — yeni saf modül `src/main/util/CrashGuard.js`:
```js
function installCrashGuard({ processRef, logger, onCrash } = {}) {
    const onUncaught = (err) => {
        const info = describeError(err);
        logger.error(`[CrashGuard] Yakalanmamış istisna: ${info.message}`, info.stack);
        notify('uncaughtException', info.message);
    };
    const onRejection = (reason) => { /* aynı desen */ };
    processRef.on('uncaughtException', onUncaught);
    processRef.on('unhandledRejection', onRejection);
    return function uninstallCrashGuard() { /* removeListener */ };
}
```
`main.js:39`:
```js
installCrashGuard({ processRef: process, logger: log });
```

**Tasarım kararları:**
- Süreç **sonlandırılmaz** (Electron'da `uncaughtException` sonrası devam etmek, zamanlanmış görevlerin kaybolmasından daha güvenli).
- Yığın ilk **5 satırla** sınırlanır → 5 MB log rotasyonu şişmez.
- Logger `electron-log` üzerinden geçer ve **redakte** eder (PIN/token/PEM sızmaz).

**Test:** `tests/main/crash-guard.test.mjs` — **7/7 PASS** (log içeriği, string/nesne reddi, `onCrash` kancasının kendi hatasının yutulması, uninstall, eksik bağımlılık, yığın kırpma).

---

### 1.3 ✅ DÜZELTİLDİ — Kullanıcıya ham hata metni sızması (P1)

| | |
|---|---|
| **Dosya** | `main.js:1259`, `main.js:1351` |
| **Etki** | İki IPC yolu `err.message` döndürüyordu. `TaskManager` bu mesajları **Türkçe** üretiyor (`'Görev kalıcılaştırılamadı.'`). Sonuç: İngilizce/Japonca arayüzde Türkçe teknik metin + iç hata ayrıntısı. |

**Hatalı kod:**
```js
return { success: false, message: err.message || t('errorTaskCreationFailed') };
return { success: false, code: err.code || 'TASK_CREATION_FAILED', message: err.message };
```

**Düzeltme:**
```js
} catch (err) {
    log.warn('[IPC] schedule-action görev oluşturamadı:', err && err.message);
    return { success: false, message: t('errorTaskCreationFailed') };
}
```

**Test:** `tests/main/ipc-error-leak.test.mjs` — **3/3 PASS**. Tüm `main.js` taranır; `message: err.message` deseni bir daha giremez.

---

### 1.4 ✅ DÜZELTİLDİ — "Uygunsuz içeriği bildir" çıkmazı (P2)

**Dosya:** `src/renderer/app.js:3860` — Store Politikası 11.16 için var olan düğme ana sayfayı açıyordu (bildirim kanalı değil).
```js
// önce
window.electronAPI.openExternal('https://vellium.dev');
// sonra
window.electronAPI.openExternal('https://vellium.dev/en/contact');
```

---

### 1.5 ✅ DÜZELTİLDİ — Her açılışta CSP konsol hatası (P3)

**Dosya:** `src/index.html:6` — `<meta>` içindeki `frame-ancestors 'none'` tarayıcı tarafından yok sayılır ve hata basar. Direktif meta'dan kaldırıldı; **HTTP başlığında (`APP_CSP`, `main.js:31`) yürürlükte kalmaya devam ediyor**.

**Ölçüm:** `scratch/runtime-health.cjs` → önce `console.error: 1`, sonra `console.error: 0`. `security.spec.js` 7/7 PASS.

---

### 1.6 ✅ DÜZELTİLDİ — Metin kontrastı WCAG AA'yı geçmiyordu (P0, erişilebilirlik)

| | |
|---|---|
| **Dosyalar** | `src/index.html` (97), `src/renderer/app.js` (13), `tailwind.config.js` |
| **Etki** | Açık temaya geçen kullanıcı **ikincil metni okuyamıyordu**; koyu temada ise primary vurgulu düğmeler (menü, "Kullan", sesli komut) kayboluyordu. Bu bir "görsel tercih" değil, ölçülebilir okunabilirlik kusuru — WCAG AA ihlali. |
| **Yöntem** | 10 görünümün **tamamı** gerçek uygulamada tarandı; her metin düğümünün etkin arka planı atasal zincirden birleştirilerek (alpha compositing) hesaplandı. Dekoratif ikon fontları (ligature adları) hariç tutuldu. |

**Ölçülen kusurlar (öncesi):**

| Tema | Sınıf | Etkin zemin | Kontrast | Gerekli |
|---|---|---|---|---|
| Açık | `text-slate-400` | `#fff` | **2.56** | 4.5 |
| Açık | `text-slate-500` | `#f1f5f9` | **4.34** | 4.5 |
| Açık | `text-amber-500` (uyarı) | `#fff` | **2.10** | 4.5 |
| Açık | `text-red-500` (hata) | `#fef2f2` | **3.23** | 4.5 |
| Açık | `text-primary` | `bg-primary/20` | **4.19** | 4.5 |
| Koyu | `text-primary` (#0067c2) | koyu zeminler | **2.40–3.16** | 4.5 |
| Koyu | `dark:text-slate-500` | `slate-800` | **3.07** | 4.5 |

**Düzeltme:**
```diff
- <span class="text-slate-400">
+ <span class="text-slate-600 dark:text-slate-400">
- <span class="text-amber-500">
+ <span class="text-amber-700 dark:text-amber-400">
- <span class="text-red-500">
+ <span class="text-red-700 dark:text-red-400">
- bg-primary/20
+ bg-primary/10
```
```js
// tailwind.config.js — koyu temada okunur primary
colors: {
    primary: '#0067c2',
    'primary-light': '#60a5fa',   // tüm koyu zeminlerde ≥5.33:1 (ölçüldü)
}
```
```diff
- <button class="text-primary">
+ <button class="text-primary dark:text-primary-light">
```

**Kanıt (sonrası):** `scratch/sweep-contrast.cjs light` → **0 kusur**, `scratch/sweep-contrast.cjs dark` → **0 kusur** (10/10 görünüm temiz). Paketlenmiş `app.asar` doğrulandı: `scratch/verify-shipped-contrast.cjs` **15/15 PASS**.

**Regresyon:** `tests/main/contrast-a11y.test.mjs` (10 test) — çıplak `text-slate-400/500`, `dark:text-slate-500/600`, `text-amber-500`, `text-red-500`, koyu eşsiz `text-primary`, `bg-primary/20` desenlerini yasaklar.

---

### 1.7 ✅ DÜZELTİLDİ — `classList`'e boşluklu token verilmesi seçili durumu bozuyordu (P0)

| | |
|---|---|
| **Dosya** | `src/renderer/app.js` — 9 çağrı (satır 176, 179, 282, 289, 321, 325, 1700, 2902, 2908) |
| **Etki** | Görev filtresinde **"Tümü/Aktif" seçimi görsel olarak taşınmıyordu**; aktif menü ve zaman aralığı (5dk/30dk/…) vurgusu kayboluyordu. Kullanıcı hangi filtrenin seçili olduğunu göremiyordu. |

**Kök neden:** Kontrast düzeltmesi sırasında iki sınıf **tek string** olarak yazıldı. `DOMTokenList` boşluk kabul etmez ve geçersiz token'ı **sessizce** yok sayar (hata fırlatmaz):

```js
// HATALI — hiçbir şey yapmaz, hata vermez
btn.classList.remove('text-primary dark:text-primary-light');

// HATALI — 'dark:text-slate-400' force argümanı sanılır (truthy) → toggle hep açar
b.classList.toggle('text-slate-600', 'dark:text-slate-400', !on);
```

**Düzeltme:**
```js
btn.classList.remove('text-primary', 'dark:text-primary-light');
b.classList.toggle('text-slate-600', !on);
b.classList.toggle('dark:text-slate-400', !on);
```

**Kanıt (gerçek uygulama, `scratch/probe-task-filter.cjs`):** seçim `active → all` taşınıyor, `bg-primary` yeni düğmeye geçiyor, eski düğme beyaz metni bırakıp okunur renge dönüyor, seçili olmayan metin **5.71:1** kontrast — **8/8 PASS**.

**Regresyon:** `tests/main/dom-token-safety.test.mjs` (2 test) — `classList` çağrılarında boşluklu token ve bozuk `toggle(token, force)` imzasını yasaklar.

---

### 1.8 ✅ DÜZELTİLDİ — Ana sayfa birincil eylemi dar ekranda kesiliyordu (P1)

| | |
|---|---|
| **Dosya** | `src/index.html` (`#view-dashboard`, satır ~169; CTA kapsayıcısı ~350) |
| **Etki** | Dizüstü çözünürlüklerinde **"Zamanlayıcıyı Başlat"** düğmesi ekranın altında kalıyordu ve görünürde kaydırma çubuğu yoktu — kullanıcı ana eylemi bulamıyordu. |

**Kök neden:** `#view-dashboard` diğer tüm görünümlerin aksine `overflow-y-auto` içermiyordu; ata `#main-content` ise `overflow-hidden`.

**Ölçüm (öncesi):**

| Çözünürlük | CTA alt kenarı | Pencere | Durum |
|---|---|---|---|
| 1366×768 | 735 | 728 | 7 px taşma |
| 1280×720 | — | — | 65 px kesik |
| 1024×768 | — | — | **163 px** kesik |

**Düzeltme:**
```diff
- <main id="view-dashboard" ...>
+ <main id="view-dashboard" class="... overflow-y-auto">
- <div class="border-t ...">
+ <div class="sticky bottom-0 z-10 border-t ... bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
```

**Kanıt (sonrası, `scratch/probe-dashboard-overflow.cjs`):** 1366×768 / 1280×720 / 1024×768 / 1536×864 / 1920×1080 boyutlarının **tamamında** `TAM GÖRÜNÜR: true`, `ERİŞİLEBİLİR: EVET`.

**Regresyon:** `tests/e2e/dashboard-layout.spec.js` — yaygın dizüstü boyutlarında CTA'nın pencereyi aşmamasını kilitler.

---

### 1.9 ✅ DÜZELTİLDİ — "Şablonu Kaydet" düğmesi hiç çalışmıyordu (P1)

| | |
|---|---|
| **Dosyalar** | `main.js` (`save-template` handler), `src/main/services/TemplateService.js:185`, `src/renderer/app.js:1373` |
| **Etki** | Smart Finish görünümünde kullanıcı şablon kaydettiğinde **hiçbir zaman** kaydolmuyordu. Her denemede "Şablon koşulu veya zamanlaması geçersiz." hatası çıkıyordu — kullanıcı için "kaydet çalışmıyor" demek. |

**Kök neden — doğrulama sırası hatası:**
```js
// renderer (app.js:1373) — id GÖNDERMEZ
const tpl = { name, action, description: '' };

// main.js — HAM payload doğrulanıyor
if (!TemplateService.isValidTemplate(tpl)) return { success: false, code: 'INVALID_TEMPLATE' };

// TemplateService.js:185 — id ZORUNLU
if (typeof tpl.id !== 'string') return false;

// main.js — id ancak BURADA üretiliyor (çok geç)
id: typeof tpl.id === 'string' ? tpl.id : `user_tpl_${Date.now()}`
```

**Ölçüm (öncesi, gerçek UI):** `getTemplates()` → 10 → formu doldur → kaydet → **10** (artış yok), `INVALID_TEMPLATE`.

**Düzeltme** — önce normalleştir, sonra doğrula:
```js
const record = {
    id: typeof tpl.id === 'string' && tpl.id ? tpl.id : `user_tpl_${Date.now()}`,
    name: String(tpl.name || '').slice(0, 80),
    /* ... */
};
if (!TemplateService.isValidTemplate(record)) {
    return { success: false, code: 'INVALID_TEMPLATE', message: t('errorInvalidTemplate') };
}
```

**Ölçüm (sonrası):** 10 → **11**; ad korunuyor; yeniden açılışta **kalıcı**. Regresyon: `tests/main/template-save.test.mjs` (5) — id üretiminin doğrulamadan **önce** olduğunu ve doğrulamanın `record` üzerinde yapıldığını kilitler.

---

### 1.10 ✅ DÜZELTİLDİ — Görev adı olarak yalnızca boşluk kabul ediliyordu (P2)

| | |
|---|---|
| **Dosya** | `src/main/ipc/validate.js:186-192` |
| **Etki** | `"   "` (yalnızca boşluk) adıyla görev oluşturulabiliyor ve görev listesinde **adsız bir satır** olarak görünüyordu. |

**Hatalı kod:**
```js
if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 120)) {
    return fail('Görev adı en fazla 120 karakter olmalı.', 'INVALID_NAME');
}
// trim() sonrası boşluk kontrolü YOK
```

**Düzeltme:**
```js
if (typeof data.name === 'string' && data.name.trim().length === 0) {
    return fail('Görev adı boşluktan oluşamaz.', 'INVALID_NAME');
}
```

**Doğrulama:** `'   '`, `'\t\n '`, `''` → `INVALID_NAME`; `'  Gece kapatma  '` → kabul (gerçek ad korunur). Regresyon: `tests/main/validate-schema.test.mjs` → *"boşluktan ibaret ad reddedilir"*.

---

### 1.11 ✅ DÜZELTİLDİ — Biten görevler listeden kaldırılamıyordu (P1)

| | |
|---|---|
| **Dosyalar** | `src/main/services/TaskManager.js`, `main.js`, `preload.js`, `src/renderer/app.js`, `src/index.html` |
| **Etki** | İptal edilen / tamamlanan / süresi geçen görevler diskte kalıcı olarak kalıyor ve "Tüm" filtresinde **eylem düğmesi olmayan** satırlar olarak sonsuza kadar birikiyordu. Kullanıcının bunları temizlemesinin hiçbir yolu yoktu. |

**Ölçüm (öncesi):** 15 görev oluştur → 15'i iptal → "Tüm" filtresi → **15 satır**, her satırda **0 eylem düğmesi**; yeniden başlatmada 15 satır hâlâ orada.

**Kök neden:** `cancelTask` görevi `CANCELLED` durumuna geçiriyor ve öyle bırakıyordu. Satır render'ı yalnızca **aktif** görevlere düğme ekliyordu (`app.js:1611`), terminal görevler için `else` dalı yoktu. `preload.js`'te `deleteTask`/`removeTask` hiç yoktu — yani IPC yüzeyi de eksikti.

**Düzeltme — sunucu:**
```js
removeTask(taskId) {
    const index = this.tasks.findIndex((t) => t && t.id === taskId);
    if (index < 0) return { ok: false, code: 'NOT_FOUND' };
    const task = this.tasks[index];
    // Güvenlik: yalnızca terminal durumdakiler silinebilir.
    if (!TaskManager.isTerminalStatus(task.status)) {
        return { ok: false, code: 'TASK_NOT_TERMINAL' };
    }
    if (this.claims && this.claims.has(taskId)) return { ok: false, code: 'TASK_RUNNING' };
    this.tasks.splice(index, 1);
    try { this.persistChanges({ throwOnError: true }); }
    catch (err) { this.tasks.splice(index, 0, task); return { ok: false, code: 'TASK_PERSIST_FAILED' }; }
    this.removeScheduler(taskId);
    return { ok: true, code: 'REMOVED' };
}
```

**Düzeltme — UI:** terminal satırda `Kaldır` düğmesi (`btn-task-remove`), tablo başlığında `Bitenleri temizle` (`btn-clear-finished`, yalnızca kaldırılabilir görev varsa görünür).

**Ölçüm (sonrası):** 15 satır → `Kaldır` → **0**; toplu temizleme **8 → 0**; yeniden başlatmada silinen **dönmüyor**. Çalışan görev silme denemesi → `TASK_NOT_TERMINAL` (görev listede kalıyor).

Regresyon: `tests/main/task-remove.test.mjs` (8) — terminal/aktif durum ayrımı, bellek+disk silme, toplu temizleme, IPC/preload yüzeyi, 17 dilde anahtar eşitliği.

---

### 1.12 ✅ DÜZELTİLDİ — Enerji kısayolu giriş alanına odaklanmıyordu (P3, kullanılabilirlik)

| | |
|---|---|
| **Dosya** | `src/renderer/app.js` — `gotoEnergySettings()` |
| **Etki** | İstatistik görünümündeki **"kWh için watt girin →"** düğmesi Ayarlar > Enerji kartına götürüp doğru yere kaydırıyordu, ama giriş alanına **odaklanmıyordu** (`document.activeElement` → `BODY`). Düğme "girin" diyor; kullanıcının yazmaya hemen başlayabilmesi gerekir. |

**Ölçüm (öncesi):** kısayola tıkla → `view-settings` açık ✔, `scrollIntoView` ✔, `activeElement === BODY` ✘.
**Ölçüm (sonrası):** `activeElement.id === 'nrg-watt'` ✔.

```js
setTimeout(() => {
    const card = document.getElementById('settings-energy');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Düğme "girin" diyor: yazmaya hemen başlanabilsin.
    const watt = document.getElementById('nrg-watt');
    if (watt) {
        try { watt.focus({ preventScroll: true }); } catch (_) { try { watt.focus(); } catch (_2) {} }
    }
}, 60);
```

Regresyon: `tests/main/energy-chip-focus.test.mjs` (4).

---

### 1.13 ✅ DÜZELTİLDİ — Mini pencere normal görevlerde boş görünüyordu (P1)

| | |
|---|---|
| **Dosyalar** | `main.js`, `src/renderer/mini.js`, `src/main/services/MiniWidgetState.js` (yeni) |
| **Etki** | Görev çubuğunda duran **mini pencere** (Power Pilot küçük sayaç widget'ı) yalnızca *Hızlı Zamanlayıcı* ile çalışıyordu. Diğer tüm görev türlerinde (Smart Finish, şablon, zamanlanmış görev, zincir, konsoldan gelen görev) pencere **açılıyor ama içi boş** kalıyordu: `--` ve `00:00`. Kullanıcı sayaç sanıp bakıyor, hiçbir bilgi göremiyordu. |

**Kök neden:** Mini pencere görünürlüğü `taskManager.getActiveTasks().length > 0` koşuluna bağlıydı (`main.js:778`), yani **her** aktif görevde açılıyordu. Ama `timer-tick` verisini **yalnızca ana pencerenin renderer'ı** gönderiyordu (`app.js:821-838`, `updateDisplay()` → `updateMiniTimer`). O kod hızlı zamanlayıcı durumuna bağlıdır; başka hiçbir görev yolu bu kanalı beslemiyordu.

**Ölçüm (öncesi):**
```
createTask({trigger:{type:'duration',durationMs:3600000}})  → pencereyi gizle
mini: {"action":"--","countdown":"00:00"}
```
**Ölçüm (sonrası):**
```
mini: {"action":"Bilgisayarı Kapat","countdown":"59:57"}
```

**Düzeltme — tek doğruluk kaynağı:** Sayaç artık ana süreçte, `TaskManager`'dan hesaplanır ve mini pencereye 1 sn'de bir itilir. Hesap saf bir modülde (`MiniWidgetState.computeState`) toplandı; Electron olmadan test edilebilir.

```js
function pushMiniTimerState() {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    if (!taskManager) return;
    const state = miniWidgetState.computeState({
        tasks: taskManager.getActiveTasks().map((t) => t.toJSON()),
        now: Date.now(),
        t: (key) => t(key),
        actionLabel: (action) => actionLabel(currentLanguage(), action),
        taskDisplayName: (task) => taskName(currentLanguage(), task),
        daySuffix: translate(currentLanguage(), 'timeFormatDays')
    });
    if (!state) return;
    miniWidgetTaskId = state.taskId || null;
    miniWindow.webContents.send('timer-tick', state);
}
```

Ek düzeltmeler:
- **Koşullu görevlerde sahte geri sayım yok.** Smart Finish görevlerinde hedef zaman yoktur; widget artık `00:00` uydurmak yerine **"İzleniyor"** + `lastProgressMessage` (ör. "chrome.exe hâlâ çalışıyor") gösterir.
- **"X" düğmesi gerçekten iptal eder.** Önceden yalnızca `cancelActiveTask()` (uyarı penceresi) ve hızlı zamanlayıcı iptal ediliyordu; mini widget'ta dolu sayaç varken "X" hiçbir şey yapmıyordu. Artık gösterilen görev `miniWidgetTaskId` üzerinden iptal edilir; `CANCEL_TOO_LATE` durumu korunur.
- **Sızıntı yok.** Pencere kapanınca `stopMiniSync()` intervali temizler.

Regresyon: `tests/main/mini-widget-state.test.mjs` (15) — biçimlendirme (saat/gün/negatif), en yakın görevin seçimi, koşullu görevde uydurma sayı olmaması, boş liste, ana süreç bağlantısı ve iptal yolu.

---

### 1.14 Sonsuz döngü / bellek sızıntısı → **Sorun bulunmadı**

Denetlenen ve temiz çıkan noktalar:

| Risk | Sonuç |
|---|---|
| `setInterval` sızıntısı | `app.js`'te 8 interval, **tamamı** `clearInterval` ile eşleşiyor (`countdownInterval`, `tasksRefreshTimer`, `micWatch`, `wzPoll`, `wzClock`, `setPoll`) + `beforeunload` temizliği |
| `AudioContext` sızıntısı | `uiBeep()` her çağrıda `new AC()` → `o.onended` içinde `ctx.close()` |
| `createObjectURL` sızıntısı | Kullanım yok (0 adet) |
| `innerHTML` XSS | `app.js`/`mini.js`/`tasksView.js` içinde **hiç `innerHTML` ataması yok**; tümü `createElement` + `textContent` |
| Reentrancy (çift çalışma) | `TaskManager` claim tabanlı: `claims.size > 0 → ALREADY_RUNNING` (satır 82), `claim.phase='executing'` + `powerStarted` (satır 548, 793) |
| DOM düğüm sızıntısı | 7 görünüm gezildikten sonra **922 → 1026** düğüm (görünüm başına sabit; her geçişte artmıyor) |

### 1.15 React/`useEffect` bağımlılık hataları → **Kapsam dışı**
React yok (vanilla JS + `DOMContentLoaded` tek seferlik init, `app.js:135`). Eşdeğer risk olarak renderer state senkronizasyonu denetlendi: `currentLanguage` tek kaynak, `applyLanguage` sonrası `afterLanguageChange` ile görünümler tazeleniyor.

### 1.16 Asenkron yarış (race) → **Sorun bulunmadı**
`loadTasks()` tek uçuş kilidi kullanıyor (`if (tasksLoading) return;` satır 1541) → 5 sn'lik poll ile kullanıcı tıklaması çakışıp çift render üretmiyor. `startTimerTo` monotonik hedef kullanıyor (`Date.now()` tabanlı, `app.js:641`) → uyku/gizli sekme sonrası sayaç kaymıyor.

---

### 1.17 ✅ DÜZELTİLDİ — PIN'i unutan kullanıcıya hiçbir kurtarma yolu gösterilmiyordu (P1)

| | |
|---|---|
| **Dosyalar** | `src/index.html`, `src/renderer/app.js`, `main.js`, `preload.js`, `src/renderer/locales/*.json` (17) |
| **Etki** | Kullanıcı **İptal PIN'i** kurduktan sonra PIN'i unutursa, arayüzde ne olduğunu anlatan **tek bir cümle bile yoktu**. Ölçüm: `mentionsForgot: false`, `mentionsReset: false`. Kullanıcı kendi kurduğu ayarla, kendini kalıcı olarak iptal korumasından mahrum bırakıyordu. |

**Neden bir "sıfırla" düğmesi eklenmedi:** `REMEDIATION_PLAN_WBS_V3.md` §2.2 kurtarma anahtarını/arka kapıyı **açıkça yasaklıyor** (PIN'in varlık nedeni fiziksel erişimi olan kişiyi engellemektir). Bu yüzden güvenlik kapısı zayıflatılmadı; onun yerine kullanıcıya **gerçek yol** gösterildi.

**Ölçüm (öncesi — `scratch/probe-pin.cjs`, `probe-pin-state-ui.cjs`):**
```
kart metni: "İptal PIN'i ... Ayarlı ✔ Kur Temizle"
mentionsForgot: false   mentionsReset: false
```

**Ölçüm (sonrası — `scratch/probe-pin-recovery-ui.cjs`, 16/16 PASS):**
```
hintText: "PIN'i unuttuysanız kurtarma anahtarı yoktur; iptal korumasını
           kaldırmanın tek yolu verileri sıfırlamaktır (görevler ve ayarlar silinir)."
btnText:  "Veri klasörünü aç"
openDataFolder → { success: true, path: "...\\userData" }
istemciden gelen 'C:\\Windows\\System32' YOK SAYILDI ✔
kontrast: uyarı metni 12.21:1 · düğme 6.93:1 (WCAG AA ≥ 4.5:1)
```

**Düzeltme 1 — yol sabit metin değil, gerçek klasör:** Metne `%APPDATA%\powerpilot` yazmak cazipti ama **MSIX (Store) sürümünde paket verisi sanallaştırılır**, orada bu yol yanıltıcı olurdu. Bu yüzden platforma sorulur:

```js
// main.js — yol istemciden GELMEZ (path traversal savunması)
ipcHandle('open-data-folder', async () => {
    try {
        const dir = app.getPath('userData');
        const err = await shell.openPath(dir);
        if (err) {
            log.warn(`[DataFolder] açılamadı: ${err}`);
            return { success: false, code: 'OPEN_FAILED', message: t('errorInvalidRequest') };
        }
        return { success: true, path: dir };
    } catch (err) {
        log.warn('[DataFolder] beklenmeyen hata:', err && err.message);
        return { success: false, code: 'OPEN_FAILED', message: t('errorInvalidRequest') };
    }
});
```

**Düzeltme 2 — arayüz:** uyarı metni + "Veri klasörünü aç" düğmesi (`src/index.html:628-629`), renderer bağlantısı `app.js` (`btn-open-data-folder` → `openDataFolder()` → hata varsa `errorOpenFolder` toast'ı).

**Düzeltme 3 — 17 dil:** `cancelPinForgotHint`, `openDataFolder`, `errorOpenFolder` (17 dil / **724 anahtar**; `locales:check` temiz). Sabit yol metinden çıkarıldığı için MSIX'te de doğru.

**Not — uygulama kilitlenmiyor:** PIN yalnızca *iptali* korur. Ölçüldü: tüm görünümler erişilebilir (6/6), yeni görev oluşturulabiliyor (`canCreate: true`). Yani PIN unutulsa bile uygulama kullanılamaz hale gelmiyor; yalnızca sıfırlama gerekiyor.

Regresyon: `tests/main/pin-recovery.test.mjs` (10) — istemci argümanının yok sayılması, ham hata sızıntısı olmaması, preload yüzeyi, HTML/renderer bağlantısı, `%APPDATA%` gömülü olmaması, 17 dil paritesi.

---

### 1.18 ✅ DÜZELTİLDİ — Dekoratif ikonlar ekran okuyucuya okunuyordu (P1, WCAG 4.1.2)

| | |
|---|---|
| **Dosyalar** | `src/index.html` (52), `src/mini.html` (3), `src/renderer/app.js` (2) |
| **Etki** | Material Symbols ikon fontu **ligatürle** çalışır: `<span>power_settings_new</span>` ekranda ikon çizer ama **DOM metni anlamsız bir kelimedir**. Hiçbir ikonda `aria-hidden` yoktu, bu yüzden ekran okuyucu kullanıcısı şunları duyuyordu: düğme adı **"power_settings_new Bilgisayarı Kapat Gücü tamamen kapatır"**, toast **"error Klasör açılamadı."** |
| **Ölçüm (öncesi)** | `28/28 ikon açık`, `29 düğme` ligatür adıyla kirlenmiş |
| **Ölçüm (sonrası)** | `0/28 açık`, `0 düğme`; toast okunan metin: **"Klasör açılamadı."** |

**Düzeltme — 57 ikon gizlendi:** dekoratif ikonlar `aria-hidden="true"` taşır. Yalnızca ikon taşıyan düğmeler (pencere kontrolleri, mini widget) zaten `aria-label`/`title` sahipti; onların etiketi korunur.

**Ek bulgu — toast canlı bölge yoktu:** toast `role`/`aria-live` taşımadığı için ekran okuyucu yeni bildirimi **kendiliğinden duyurmuyordu** (kullanıcı yalnızca ekrana bakarsa fark ediyordu). Eklendi:

```js
// Ekran okuyucu yeni bildirimi kendiliğinden duyursun:
// hata = kesintiye uğratan uyarı, diğerleri = kibar duyuru.
toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
toast.setAttribute('aria-atomic', 'true');
```

**Not — mevcut a11y taraması bunu yakalamıyordu:** `audit-a11y.mjs` yalnızca "erişilebilir adı olmayan düğme" sayıyordu (0 buluyordu, çünkü ad *vardı* — sadece yanlış addı). Bu yüzden ölçüm erişilebilirlik ağacındaki **gerçek metne** göre yeniden yazıldı.

Regresyon: `tests/main/icon-a11y.test.mjs` (7) — tüm HTML ikonlarında `aria-hidden`, programatik ikonlar, toast canlı bölgesi, ikon-only düğmelerde ad.

---

### 1.19 ✅ DÜZELTİLDİ — Bildirimler kapalıyken hata mesajları da kayboluyordu (P1)

| | |
|---|---|
| **Dosya** | `src/renderer/app.js` — `showToast()` |
| **Etki** | Ayarlar > **"Bildirimleri Göster"** kapatıldığında `showToast` **her türde** erken dönüyordu (`if (!showNotifs) return;`). Yani kullanıcı bildirimleri kapattığında **hata mesajları da** sessizce yutuluyordu: "PIN kurulamadı", "görev oluşturulamadı", "klasör açılamadı", "kaydetme başarısız"… Uygulamada bu yoldan geçen **79 hata çağrısı** var. Kullanıcı bir işlemin başarısız olduğunu **hiç öğrenmiyordu** — sessiz başarısızlık. |

**Ölçüm (öncesi — `scratch/probe-notif-errors.cjs`):**
```
bildirimler kapalı + geçersiz PIN → {"count":0,"text":null,"role":null}
```

**Ölçüm (sonrası):**
```
{"count":1,"text":"Geçersiz istek.","role":"alert"}   ← hata görünür
başarı toast'ı: {"count":0}                            ← ayar amacına uygun
```

**Düzeltme:** ayar yalnızca **bilgilendirme** amaçlı geri bildirimi kapatır; hata her zaman görünür.

```js
// "Bildirimleri Göster" yalnızca BİLGİLENDİRME amaçlı geri bildirimi
// kapatır. Hata mesajları her zaman görünür: aksi hâlde kullanıcı işlemin
// başarısız olduğunu hiç öğrenmez (PIN kurulamadı, görev oluşturulamadı...).
const showNotifs = localStorage.getItem('notifications') !== 'false';
if (!showNotifs && type !== 'error') return;
```

Regresyon: `tests/main/toast-error-visibility.test.mjs` (4).

---

### 1.20 ✅ DÜZELTİLDİ — Modal pencereler klavye/ekran okuyucu için kapalıydı (P1, WCAG 2.4.3 / 4.1.2)

| | |
|---|---|
| **Dosyalar** | `src/renderer/app.js` (`openModal`/`closeModal` + yeni merkezi katman), `src/index.html` (6 modal) |
| **Etki** | Altı modalın **hiçbirinde** `role="dialog"`, `aria-modal`, erişilebilir ad, odak tuzağı, Escape ve odak geri dönüşü yoktu. Ölçüm: PIN modalinde **ilk Tab basışı** odağı `btn-minimize`'a kaçırdı; **Escape modalı kapatmadı**; ekran okuyucu modal başlığını duyurmadı (ad `null`). |

**Ölçüm (öncesi — `scratch/probe-modal-a11y.cjs`):**
```
role=null  aria-modal=null  label=null
Tab → dışarı kaçtı → btn-minimize
Escape → modal açık kaldı
```

**Ölçüm (sonrası):**
```
role=dialog  aria-modal=true  aria-labelledby=modal-pin-title
12 Tab → içeride kaldı
Escape → kapandı
kapanış → odak tetikleyiciye döndü (btn-pin-clear)
```

**Düzeltme — tek merkezi katman** (`openModal`/`closeModal` tüm modalleri kapsar):

```js
const MODAL_DISMISS_MAP = {
    'modal-pin': 'pin-modal-cancel',
    'modal-confirm-link': 'modal-confirm-link-cancel',
    'modal-delete-data': 'modal-delete-data-cancel',
    'modal-eula': 'modal-eula-close',
    'modal-privacy': 'modal-privacy-close',
    'modal-oss': 'modal-oss-close'
};

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!openModalEl) modalReturnFocus = document.activeElement;
    openModalEl = el;
    el.classList.remove('hidden');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    ensureModalLabel(el);                 // başlığı aria-labelledby ile bağlar
    const first = modalFocusables(el)[0];
    if (first) first.focus();             // odak modala taşınır
}
```

**Escape uygulamanın kendi iptal yolunu kullanır** — `pendingPinAction` gibi
renderer durumu `closeModal` ile değil, gerçek "Vazgeç" düğmesine tıklanarak
temizlenir; aksi hâlde bekleyen işlem asılı kalırdı:

```js
if (e.key === 'Escape') {
    e.preventDefault();
    const btn = document.getElementById(MODAL_DISMISS_MAP[openModalEl.id]);
    if (btn) btn.click(); else closeModal(openModalEl.id);
    return;
}
```

**Tab tuzağı** capture aşamasında çalışır (diğer işleyicilerden önce), dışarı
kaçan odağı geri alır ve Shift+Tab ile döngüyü kapatır.

Regresyon: `tests/main/modal-a11y.test.mjs` (7) — role/aria-modal/ad, açılış
odağı, kapanış dönüşü, Tab tuzağı, Escape eşlemesi, tüm modal kökleri.

---

### 1.21 ✅ DÜZELTİLDİ — 7 düğme 24px dokunma hedefinin altındaydı (P2, WCAG 2.5.8)

| | |
|---|---|
| **Dosya** | `src/index.html` — 6 adım düğmesi (`data-pp-step`) + `#btn-open-data-folder` |
| **Etki** | Zamanlayıcı +/- düğmeleri **24×21px**, "Veri klasörünü aç" düğmesi **99×16px** idi. 16px yükseklik touchpad / titrek elle / yüksek DPI ekranda ıskalanır. |

**Ölçüm (öncesi — `scratch/probe-zoom-reflow.cjs`):**
```
görünür düğmeler ≥24px → 7 ihlal
  expand_less 24x21 · expand_more 24x21 (×3 çift)
  btn-open-data-folder 99x16
```

**Ölçüm (sonrası):**
```
görünür düğmeler ≥24px → 0 ihlal  ([])
```

**Düzeltme:** adım düğmelerine `min-h-[24px]`, kapsayıcıdan kırpan `py-1`
kaldırıldı; veri klasörü düğmesi `inline-flex items-center min-h-[24px]`
aldı.

**Aynı probe — metin ölçekleme (WCAG 1.4.4):** 1440/1024/800 genişlik ve
zoom 1.0/1.5/2.0'da 6 görünümde **yatay taşma 0, kırpılan metin 0** →
10/10 PASS. Bu, sonradan regresyona karşı kilitlendi.

Regresyon: `tests/main/touch-target.test.mjs` (5).

---

### 1.22 ✅ DÜZELTİLDİ — Zaman kritik kapatma uyarısı ekran okuyucuya hiç duyurulmuyordu (P0, WCAG 4.1.3)

| | |
|---|---|
| **Dosya** | `src/index.html` — `#warning-banner` |
| **Etki** | Kapatma öncesi 30 saniyelik son çıkış uyarısı `role`/`aria-live` taşımıyordu (`role=null, live=null`). Ekran okuyucu kullanıcısı uyarıyı **hiç duymuyordu** → kaydedilmemiş işiyle bilgisayar kapanıyordu. Bu, uygulamanın en yüksek bedelli sessiz başarısızlığıdır. |

**Akış doğrulaması (`scratch/probe-warning-cancel.cjs`, 12/12 PASS):** gerçek görev (1,2 sn) → uyarı banner'ı **30s** geri sayımla göründü, Durdur/Ertele/Şimdi Çalıştır düğmeleri mevcut, metin çevrilmiş (`"Uyarı iptal testi — Bilgisayarı Kapat"`), ham anahtar yok.

```
Durdur  → status=cancelled, lastResult=cancelled_by_user   (kapatma YOK)
Ertele  → status=scheduled, lastResult=null                (kapatma YOK)
```

Makine hiçbir adımda kapatılmadı; renderer yanıt vermeye devam etti.

**Düzeltme:** banner `role="alert"` + `aria-live="assertive"`; geri sayım sayacı `aria-live="off"` (her saniye duyuru spam'i olmasın, değer yine okunabilir).

```html
<div id="warning-banner" role="alert" aria-live="assertive" ...>
    ...
    <p id="warning-banner-count" aria-live="off" ...></p>
```

Regresyon: `tests/main/warning-banner-a11y.test.mjs` (8) — canlı bölge, sayaç, dekoratif ikon, üç düğme, Durdur/Ertele gerçek API bağlantısı, çeviri yolu.

---

### 1.23 ✅ DÜZELTİLDİ — Bozuk veri dosyası uygulamayı kalıcı olarak kilitleyordu (P0)

| | |
|---|---|
| **Dosya** | `src/main/services/StorageService.js` — `init()`, `openExisting()`, `migrateLegacy()` |
| **Yeni modül** | `src/main/services/StorageRecovery.js` |
| **Etki** | Yazma sırasında elektrik kesintisi, antivirüs kilidi veya disk hatası `powerpilot.db`'yi bozduğunda uygulama açılıyor ama **hiçbir görev oluşturulamıyordu**. Kullanıcı yalnızca `"Task could not be created."` görüyordu. Kurtarma yolu, yedek listesi veya karantina yoktu — tek çıkış `%APPDATA%` altındaki klasörü elle silmekti. Son kullanıcı için bu "program bozuk, kaldıracağım" demektir. |

**Ölçüm (öncesi — `scratch/probe-corrupt-data.cjs`):**

```
bozuk powerpilot.db   → uygulama açıldı, createTask=false, karantina yok
bozuk powerpilot_data.json → uygulama açıldı ama kullanılamaz, yedek yok
```

**Ölçüm (sonrası — 15/15 PASS):**

```
bozuk powerpilot.db  → karantina/quarantine/powerpilot_corrupt_2026-…db
                       createTask=true, görev sayısı 1
                       bildirim: "Veri dosyanız bozuldu ve karantinaya taşındı…
                                  Özgün dosya: …\quarantine\powerpilot_corrupt_…db"
bozuk eski JSON      → T-STO-03 sözleşmesi KORUNUR: kaynak dosya bayt bayt aynı,
                       backups/powerpilot_data_corrupted_…json alınır,
                       bakım şeridi + "Veri klasörünü aç" çıkışı gösterilir
salt okunur klasör   → çökme yok, kullanıcıya mesaj
```

**Kök nedenler (üç ayrı kapı):**

1. `new Db()` bozuk dosyada `quickCheck`'e varmadan istisna fırlatıyordu → `init()` catch'i doğrudan bakım moduna düşüyordu.
2. `quickCheck() !== 'ok'` yolu yalnızca `enterMaintenance()` çağırıyordu; kurtarma yoktu.
3. Bakım modu **çıkışsızdı**: kullanıcı ne olduğunu göremiyor, yedeğe ulaşamıyordu.

**Düzeltme (DB):** SQLite bozulması geri döndürülemez bir durumdur ve DB türetilmiş veridir; burada karantina + temiz depo doğru davranıştır.

```js
// 1) Açılış hatası da kurtarma yoluna gider
try { this.db = new Db(this.dbPath, { fileMustExist: true }); }
catch (err) { this.db = null; this.recoverCorruptDatabase(err.code || 'DB_OPEN_FAILED'); return; }

// 2) quick_check başarısız → karantina + temiz depo
if (check !== 'ok') { this.db.close(); this.db = null; this.recoverCorruptDatabase(check); return; }
```

```js
// src/main/services/StorageRecovery.js — bozuk dosya SİLİNMEZ
const target = path.join(dir, `powerpilot_corrupt_${timestamp()}.db`);
fs.renameSync(dbPath, finalTarget);
// WAL/SHM artıkları temizlenir; taşıma başarısızsa bakım modu (sessiz veri kaybı yok)
```

**Düzeltme (eski JSON — sözleşme korunarak):** `T-STO-03` bozuk eski JSON'un **taşınmasını/silinmesini yasaklar**; 4 mevcut test bunu kilitliyor. Bu yüzden kaynak korunur ve kullanıcıya çıkış yolu verilir:

```html
<!-- src/index.html — bakım şeridi -->
<button id="btn-storage-open-folder" type="button" ...>
    <span class="material-symbols-outlined" aria-hidden="true">folder_open</span>
    <span data-i18n="openDataFolder">Veri klasörünü aç</span>
</button>
```

```js
// src/renderer/app.js — çıkış düğmesi gerçek IPC'yi çağırır
openBtn.addEventListener('click', async () => {
    const r = await window.electronAPI.openDataFolder();
    if (!r || !r.success) showToast(t('errorOpenFolder'), 'error');
});
```

Bakım açıklaması `errorStorageMaintenance` + `storageMaintenanceHint` (17 dil) olarak dinamik çizilir (`renderStorageWarning()`) ve dil değişiminde yenilenir; `data-i18n` statik metni ipucunu ezerdi.

**Sessiz sıfırlama yok:** `get-storage-status` artık `recoveredFrom` döndürür; arayüz `role="status"` canlı bölgeyle çevrilmiş bildirim + özgün dosya yolunu gösterir (17 dilde `storageRecoveredTitle/Detail/Path`). Bildirim metni dinamik yol içerdiği için `data-i18n` yerine `renderStorageRecovery()` ile çizilir ve dil değişiminde yenilenir.

**Yol işe yaramalı, bilgi kapatılabilmeli:** metin olarak verilen dosya yolu tek başına çıkmaz sokaktır. Bildirime `#btn-storage-recovered-folder` (gerçek `openDataFolder` IPC'si) ve `#btn-storage-recovered-close` eklendi. Kapatma kararı `storageRecoveryDismissed` ile tutulur; dil değişiminde yeniden çizim bildirimi **geri getirmez**. Her iki düğme ≥24px, erişilebilir adları temiz (Playwright aria snapshot: `button "Veri klasörünü aç"`, `button "Kapat"` — ligatür sızıntısı yok).

Regresyon: `tests/main/storage-recovery.test.mjs` (15) — dosya silinmez, içerik korunur, WAL/SHM temizliği, ad çakışması, yedek listesi sıralaması, servis kurtarma bağlantıları, `T-STO-03` sözleşmesi, bakım çıkışı, bildirim eylemleri.

---

### 1.24 ✅ DÜZELTİLDİ — Pencere kapatılınca kullanıcı uygulamaya nasıl döneceğini bilmiyordu (P1, kullanılabilirlik/veri kaybı algısı)

**Dosya:** `main.js:745-757`, `src/renderer/locales/*.json` (`trayBackgroundRunning`)

**Kusur (ölçüldü):** aktif görev varken pencere kapatıldığında uygulama doğru davranıyor (gizleniyor, görev `scheduled` kalıyor, mini widget görünüyor — `scratch/probe-background-run.cjs` **5/5 PASS**), ancak kullanıcıya gösterilen tek bilgi şuydu:

```js
// main.js:751-754 — önce
tray.displayBalloon({ title: 'Power Pilot', content: t('trayBackgroundRunning') });
// "Uygulama arka planda çalışmaya devam ediyor. Aktif otomasyonlar takip ediliyor."
```

Cümle *ne olduğunu* söylüyor, *nasıl geri dönüleceğini* söylemiyordu. Geri dönüş yolu kodda vardı (`main.js:1066` tepsiye çift tıklama, menüde "Göster") ama hiçbir yerde yazmıyordu. Kullanıcı için bu, "program kapandı ama Görev Yöneticisi'nde duruyor" izlenimidir; tipik tepki süreci zorla öldürmek — yani **zamanlanmış görevin sessizce iptal edilmesi**. "1 saat sonra kapat" diyen kullanıcı bilgisayarının kapanmadığını saatler sonra fark eder.

**Düzeltme:** balon metni 17 dilde yönergeyle genişletildi (kaynak: `src/renderer/locales/*.json`, `npm run build:locales` ile sunucu kopyaları üretildi):

```json
// src/renderer/locales/tr.json
"trayBackgroundRunning": "Uygulama arka planda çalışmaya devam ediyor. Aktif otomasyonlar takip ediliyor. Yeniden açmak için tepsi simgesine çift tıklayın."
// en: "... Double-click the tray icon to reopen."
// ja: "…再度開くにはタスクトレイのアイコンをダブルクリックしてください。"  (CJK: bitişik yazım)
```

**Regresyon:** `tests/main/background-run.test.mjs` (7) — kapatma engeli + gizleme, tepsi balonu, `isQuitting` kaçış kapısı, görev döngüsünün görünürlükten bağımsızlığı, mini widget koşulu, **17 dilde ipucu varlığı** (çevrilmemiş İngilizce sızıntısı yok).

---

### 1.25 ✅ DÜZELTİLDİ — Windows Görev Zamanlayıcı kayıtları sahipsiz kalıyordu (P1, veri/gizlilik + kaldırma)

**Dosyalar:** `main.js` (`delete-all-data`, açılış init), `src/main/services/DataWipe.js`, `src/main/services/TaskSchedulerBridge.js` (`removeAllTasks`), `build/installer.nsh`, `package.json` (`nsis.include`), `scripts/packaged-e2e.ps1`

**Kusur (ölçüldü):** uygulama "pencere kapalıyken de çalışsın" diye her koşulsuz `scheduled` görevi Windows Görev Zamanlayıcı'ya da yazıyor (`\PowerPilot\task_<id>`). Bu kayıtlar **userData klasörünün dışında** yaşar ve hiçbir temizlik yolu yoktu:

- "Tüm verileri sil" yalnızca dosya siliyordu → kayıt kalıyor, tetikleme saatinde Windows uygulamayı `--run-task=<silinmiş id>` ile açıyor. Kullanıcı için: *"verilerimi sildim ama uygulama kendi kendine açıldı."*
- Bozuk DB karantinaya alınıp temiz depoyla başlanınca da eski kayıtlar kalıyordu.
- Kaldırma (uninstall) sonrası kayıtlar kalıyordu → Görev Zamanlayıcı silinmiş bir exe'yi çalıştırmaya çalışır.

Ölçüm (`scratch/probe-wipe-scheduler.cjs`): "tüm verileri sil" sonrası kayıt **hayatta kalıyordu** (FAIL), kaldırma sonrası da.

**Düzeltmeler:**

```js
// src/main/services/TaskSchedulerBridge.js — klasör silinemez (ERROR: Dizin boş değil.),
// bu yüzden tek tek listelenip silinir; yalnızca kendi klasörümüze dokunulur.
async removeAllTasks() {
    if (!this.isSupported()) return { removed: 0, failed: 0 };
    const list = await this.execSchtasks(['/query', '/fo', 'CSV', '/nh']);
    const rootName = `\\${TASK_NAME_PREFIX}`;
    // schtasks adları kök ters bölü ile döndürür: \PowerPilot\task_x
    ...
}
```

```js
// main.js — delete-all-data: veri silinmeden ÖNCE
const cleaned = await taskManager.schedulerBridge.removeAllTasks();
// main.js — açılış: storageService.recoveredFrom varsa eski kayıtlar temizlenir
```

```nsis
; build/installer.nsh (package.json → build.nsis.include)
!macro customUnInstall
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ScheduledTask -TaskPath \PowerPilot* -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$$false -ErrorAction SilentlyContinue"'
!macroend
```

**Yan bulgu — "tüm veriler silindi" yalanı:** wipe sabit bir dosya listesine bağlıydı ve Chromium sürümle klasör adı değiştiriyor (`DawnGraphiteCache`, `DIPS`, `Network`, `Local State`…). Artık `readdir` ile kökteki **her** girdi hedeflenir. Ayrıca Chromium çalışırken `Local Storage`/`GPUCache` kilitli kalıp wipe'ı `WIPE_PARTIAL` ile düşürüyordu (ölçüldü: 20 kalıntı, kullanıcıya "silinemedi" hatası). Ayrım eklendi: **temel veri** (DB, anahtarlar, yedekler, loglar, modeller, audit) silinemezse gerçek hatadır ve `userData` dışındaki bir işaret dosyasıyla sonraki açılışta (depo açılmadan önce) tamamlanır; **Chromium önbellek klasörleri** `optionalFailed` sayılır (içerikleri `session.clearStorageData()` ile boşaltılır), kullanıcıya hata gösterilmez.

**Ölçüm:** `scratch/probe-wipe-scheduler.cjs` **9/9 PASS** — wipe → zamanlayıcı kaydı 0, yeniden açılışta görev 0, işaret tüketildi; bozuk DB kurtarma → sahipsiz kayıtlar 0.

**Regresyon:** `tests/main/scheduler.test.mjs` (35, +3 `removeAllTasks`), `tests/main/data-wipe.test.mjs` (15, +6 readdir/optional/pending), `tests/main/scheduler-cleanup-wiring.test.mjs` (5, kablolama + NSIS include). `scripts/packaged-e2e.ps1` artık kaldırma sonrası `\PowerPilot\` kaydı kalmadığını da doğruluyor.

---

### 1.26 ✅ DÜZELTİLDİ — Kapatma uyarısı penceresi gizliyken kullanıcıya görünmüyordu (P0, veri kaybı)

**Dosya:** `main.js:696` (`warningManager.on('warning-started', …)`)

**Kusur (ölçüldü):** Kullanıcı "1 saat sonra kapat" der ve pencereyi kapatır — uygulama tepside çalışmaya devam eder (`mainWindow.on('close')` → `hide()`). Süre dolunca uyarı yalnızca `mainWindow.webContents.send('warning-started')` ile **gizli pencerenin DOM'una** yazılıyordu. Sonuç:

```js
// önceki hâli — pencere gizliyse hiçbir şey olmuyordu
const forwardWarning = (channel) => (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data); // gizli pencere: kullanıcı göremez
    }
};
```

`full` modda süre dolunca `WarningManager` `proceed:true` döner (`WarningManager.js:30`), yani **makine kullanıcı hiçbir şey görmeden kapanır** — kaydedilmemiş iş kaybı. Ölçüm: `scratch/probe-warning-hidden-window.cjs` ilk turda `visible=false` + "uyarı bannerı DOM'da görünür oldu" FAIL verdi (banner DOM'da vardı, pencere gizliydi).

**Düzeltme:**

```js
warningManager.on('warning-started', (data) => {
    forwardWarning('warning-started')(data);
    if (mainWindow && !mainWindow.isDestroyed() && !isQuitting) {
        if (!mainWindow.isVisible()) mainWindow.show();       // gizli → göster
        if (mainWindow.isMinimized()) mainWindow.restore();   // simge durumu → geri al
        mainWindow.setAlwaysOnTop(true);                      // diğer pencerelerin altında kalmasın
        mainWindow.focus();
        // Uyarı bitince üstte kalma bırakılır (kalıcı always-on-top kullanıcıyı hapsederdi)
        const release = () => { /* setAlwaysOnTop(false) */ };
        warningManager.once('warning-finished', release);
        warningManager.once('warning-cancelled', release);
        warningManager.once('warning-snoozed', release);
    }
    // Tepsi balonu: eylem çalışmak üzere (17 dilde trayWarningRunning)
    if (tray) tray.displayBalloon({ title: 'Power Pilot', content: t('trayWarningRunning') });
});
```

**Ölçüm:** `scratch/probe-warning-hidden-window.cjs` **5/5 PASS** — pencere gizliyken uyarı başladığında `visible=true, focused=true`, banner okunabilir ("Gizli pencere uyarı testi — Kilitle 30s Durdur Ertele Şimdi Çalıştır"), "Durdur" sonrası görev `cancelled` (kapatma yok).

**Regresyon:** `tests/main/warning-visibility.test.mjs` (6) — gizli→göster, minimize→restore, `isQuitting` kapısı, always-on-top bırakma (3 terminal olay), tepsi balonu, `trayWarningRunning` 17 dilde dolu.

> Probe notu: ölçüm ortamında Discord/VS Code açık olduğu için korunan-uygulama kapısı görevi uyarıya gelmeden blokladı (doğru davranış). Probe bu yüzden yalnızca kendi görevinde `safetyPolicy` kapılarını kapatır ve yıkıcı olmayan `lock` eylemi kullanır.

---

### 1.27 ✅ DÜZELTİLDİ — Kurulum paketi geliştirme artığı taşıyordu (P2, paket hijyeni)

**Dosya:** `scripts/after-pack.cjs`

**Kusur (ölçüldü):** `node_modules/electron/dist/debug.log` — geliştirme sırasında oluşmuş 38 KB'lık Chromium hata günlüğü — electron-builder tarafından olduğu gibi `dist/win-unpacked/` altına ve dolayısıyla **NSIS kurulumuna da MSIX paketine de** kopyalanıyordu:

```
dist\win-unpacked\debug.log   38556 bayt   (1117/074542 … tarihli Chromium CreateFile hataları)
```

Kullanıcı kurulumla birlikte ne işe yaradığı belirsiz, tarihi geçmiş bir hata günlüğü alıyordu; içeriği yerel yol/ortam bilgisi sızdırabilir.

**Düzeltme** (mevcut `afterPack` kancasına eklendi — imzalamadan önce çalışır):

```js
const PACK_ARTIFACTS = ['debug.log', 'chrome_debug.log'];
function removePackArtifacts(appOutDir) {
    for (const name of PACK_ARTIFACTS) {
        const target = path.join(appOutDir, name);
        if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    }
}
// afterPack(): removePackArtifacts(context.appOutDir) → sonra fuses
```

Yalnızca **bilinen artık adları** silinir; uygulamanın kendi logları (`userData/logs`) etkilenmez.

**Ölçüm:** yeni pakette `dist\win-unpacked\debug.log` **yok** (`Test-Path` → False), `win-unpacked` altında hiç `.log` kalmadı. Paket boyutu 112 314 005 → **112 312 484** bayt.

**Regresyon:** `tests/main/pack-artifacts.test.mjs` (3) — artıklar silinir, uygulama dosyaları korunur, artık yoksa hata vermez, kaynakta `debug.log` kalmamış.

---

### 1.28 ✅ DOĞRULANDI — Mağaza (MSIX) hattı geçerli paket üretiyor

**Dosyalar:** `electron-builder.store.cjs`, `build/appx-extensions.xml`, `scripts/build-appx.js`

Store dağıtımı için paket üretimi kod imzalama materyali olmadan **kasıtlı olarak** reddedilir (`build-appx.js`: publisher + sertifika zorunlu). Bu, gerçek Store sertifikası bu makinede olmadığı için yayın adımını bloke eder; ancak **hattın doğruluğu** imzasız üretimle kanıtlanabilir:

```powershell
$env:APPX_PUBLISHER='CN=Vellium Test'
npx electron-builder --win appx --config electron-builder.store.cjs --publish never
```

**Sonuç:** `dist/PowerPilot_1.1.0_x64.appx` — 167 537 159 bayt, `AppX is not signed (Windows Store only build)`.

**Manifest doğrulaması** (`makeappx unpack` → *Package extraction succeeded*, 112 dosya):

| Alan | Değer |
|---|---|
| Identity | `Vellium.PowerPilot` · `x64` · `1.1.0.0` |
| Capabilities | `rescap:runFullTrust` + `DeviceCapability microphone` (sesli komut için şart) |
| Application | `PowerPilot` → `app\Power Pilot.exe`, `Windows.FullTrustApplication` |
| startupTask | `PowerPilotStartup`, `Enabled="false"` (kullanıcı Windows Ayarlar'dan açar — Store 10.2.8) |
| Diller | 17 (`TR-TR … AR-SA`) |

`resources.pri` üretilmemesi kusur değil: electron-builder yalnızca ölçekli (scale-qualified) görsel verildiğinde üretir; MakeAppx paketi bu hâliyle kabul etti.

**Kalan (kapsam dışı, belgelenmiş):** gerçek Store sertifikasıyla imzalama, WACK, Partner Center/IARC beyanları.

---

### 1.29 ✅ DÜZELTİLDİ — Şifreli yedek testi rastgele yanlış alarm veriyordu (P2, kapı güvenilirliği)

| | |
|---|---|
| **Dosya** | `tests/main/console-store.test.mjs` — `T-CON-07` |
| **Etki** | Yedek şifrelemesinin düz metin sızdırmadığını doğrulayan test, şifreli dosyada **3 baytlık `pc0`** dizisini arıyordu. AES-GCM çıktısı rastgele olduğu için bu kısa dizi yaklaşık her 20 koşuda bir kendiliğinden bulunuyor ve **temiz kodla kırmızı kapı** üretiyordu. CI'da "güvenlik testi düştü" yanlış sinyali, gerçek sızıntıları gürültü içinde gizler. |
| **Ölçüm (öncesi)** | Tam koşu: `1 failed | 1675 passed` → tek kırmızı bu test. Aynı test tek başına 3/3 **PASS** (rastgelelik kanıtı). |
| **Kök neden** | İğne uzunluğu (3 bayt) şifreli metnin entropisiyle kıyaslanabilir; test "şifreli dosyada düz metin yok" iddiasını istatistiksel olarak yanlış kurmuştu. |

**Düzeltme — uzun ve benzersiz işaret + biçim doğrulaması:**
```js
// 3 baytlık 'pc0' rastgele şifreli metinde kendiliğinden bulunabilir.
const plaintextMarker = `DUZMETIN-${crypto.randomBytes(24).toString('hex')}`;
cs.upsertAgent(agentId, { hostname: a === 0 ? plaintextMarker : `pc${a}` });

const raw = fs.readFileSync(backup.path);
expect(raw.subarray(0, 5).toString('utf8')).toBe('PPBK1');
expect(raw.includes(Buffer.from('SQLite format 3\u0000', 'utf8'))).toBe(false);
expect(raw.includes(Buffer.from(plaintextMarker, 'utf8'))).toBe(false);
```

**Kanıt (sonrası):** `T-CON-07` tek başına **4/4 PASS**; tam koşu **145 dosya / 1679 test PASS** (aşağıda §6). Test artık hem şifreli kap zarfını (`PPBK1`) hem SQLite başlığının yokluğunu hem de 57 baytlık düz metin işaretinin yokluğunu doğruluyor.

---

### 1.30 ✅ DÜZELTİLDİ — Paket E2E "PASS" yazıp exit code 1 dönüyordu (P2, kurulum kapısı)

| | |
|---|---|
| **Dosya** | `scripts/packaged-e2e.ps1` — `finally` temizliği |
| **Etki** | Kurulum → yükseltme → kaldırma zinciri **gerçekten geçtiği hâlde** betik `exit 1` ile bitiyordu. `finally` içindeki `schtasks /Delete`, kaldırma adımında zaten silinmiş görevi tekrar silmeye çalışıyor; `schtasks` yerelleştirilmiş "sistem belirtilen dosyayı bulamıyor" mesajını **stderr**'e yazıyor ve `$ErrorActionPreference = "Stop"` bunu yerel komut hatası sayıyordu. CI'da başarılı sürüm "kırmızı" görünür, ekip kanıta güvenemez. |
| **Ölçüm (öncesi)** | `[packaged-e2e] PASS ...` satırından hemen sonra `ERROR: Sistem belirtilen dosyayı bulamıyor.` → `Exit code: 1`. |
| **Düzeltme** | Temizlik komutunun stderr'i yutulur; PASS sonucunu yalnızca gerçek adım hataları düşürür. |
```powershell
} finally {
    try { schtasks /Delete /TN "\PowerPilot\task_e2euninstall" /F 2>$null | Out-Null } catch { }
    ...
}
```
**Kanıt (sonrası):** Aynı komut (temiz kurulum → `1.0.9` üzerine `1.1.0` yükseltme → kaldırma + zamanlayıcı temizliği) → `PASS` ve **`SCRIPT_EXIT=0`**.

> Not — yükseltme artefaktı: depoda yayınlanmış eski NSIS kurulumu bulunmadığından, yükseltme yolu aynı ağaçtan `--config.extraMetadata.version=1.0.9` ile üretilen **112 312 564 baytlık** kurulumla ölçüldü; ardından gerçek `1.1.0` kurulumu üzerine kuruldu. Kanıtlanan şey NSIS yükseltme/kaldırma davranışıdır, eski sürümün iş mantığı değil.

---

### 1.31 ✅ DÜZELTİLDİ — Taşınabilir sürüm yoktu; olsaydı vaadi iki yerde çökerdi (P1, dağıtım)

| | |
|---|---|
| **Dosyalar** | `package.json` (`portable` hedefi + `dist:portable`), `src/main/util/Portable.js` (yeni), `main.js`, `README.md`, `tests/main/portable-mode.test.mjs` (10) |
| **Etki** | Kullanıcı "kurulum istemiyorum, USB'den çalıştırayım" diyemediği gibi, naif bir `portable` hedefi iki sessiz arıza üretirdi: (a) veri `%APPDATA%` altında kalır → USB'de taşınan uygulama başka makinede boş açılır, geride kalıntı bırakır; (b) Windows Görev Zamanlayıcı kaydı **geçici çıkarma dizinini** gösterir → "uygulama kapalıyken de çalışır" vaadi sessizce çöker, çünkü SFX çıkardığı klasör bir sonraki temizlikte silinir. |

**Ölçüm (öncesi):** `dist/` içinde yalnızca `Power Pilot Setup 1.1.0.exe` vardı; `package.json` içinde `portable` hedefi ve betiği yoktu (`grep portable package.json` → 0 eşleşme).

**Düzeltme — tek modül, iki karar:**
```js
// src/main/util/Portable.js
function portableDataDir(env) {          // <SFX klasörü>\PowerPilotData
    const root = resolveRoot(env);
    return root ? path.join(root, PORTABLE_DATA_DIR) : null;
}
function portableExePath(env, existsSync) { // SFX'in kendisi (geçici dizin değil)
    const resolved = path.resolve(env.PORTABLE_EXECUTABLE_FILE);
    return existsSync && !existsSync(resolved) ? null : resolved;
}
```
```js
// main.js — açık --user-data-dir her zaman kazanır; salt okunur medyada çökmek yok
} else {
    const portableDir = Portable.portableDataDir(process.env);
    if (portableDir) {
        try { fs.mkdirSync(portableDir, { recursive: true }); app.setPath('userData', portableDir); }
        catch (err) { log.warn('[Portable] veri klasörü kullanılamadı; varsayılan kullanılacak.'); }
    }
}
// schedulerBridge
exePath: Portable.portableExePath(process.env, fs.existsSync) || app.getPath('exe')
```

**Kanıt (sonrası):**
- `npm run dist:portable` → `dist/Power Pilot Portable 1.1.0.exe` **112 079 094 bayt**.
- SFX gerçekten çalıştırıldı: `PowerPilotData\powerpilot.db` + `secrets.v1.json` oluştu; `logs\main.log` → `[Portable] veri klasörü: …\pp-portable-verify\PowerPilotData`.
- `scratch/probe-portable-scheduler.cjs` → **5/5 PASS**: gerçek görev kaydı `{"command":"…\Power Pilot Portable 1.1.0.exe","arguments":"--run-task=task_…"}`, `\Temp\` içermiyor.
- `tests/main/portable-mode.test.mjs` → **10/10 PASS** (env ayrıştırma, var olmayan SFX reddi, `--user-data-dir` önceliği, artefakt adı çakışmaması, `win.target` hâlâ `["nsis"]`).

**Regresyon riski kapatıldı:** `release-check.js` "varsayılan hedef yalnızca nsis" kuralını zorunlu tutuyor; portable hedefi CLI ile seçilir (`--win portable`), varsayılan derlemeyi değiştirmez → `npm run release:check` **OK**.

---

## 2. Performans ve Optimizasyon

### 2.1 Ölçülen değerler (gerçek uygulama, `scratch/runtime-health.cjs`)

| Görünüm | Geçiş süresi | DOM düğümü |
|---|---|---|
| Dashboard | 9.2 ms | 922 |
| Tasks | 28.3 ms | 922 |
| Templates | 28.1 ms | 1002 |
| History | 28.2 ms | 1026 |
| Stats | 27.8 ms | 1026 |
| Settings | 42.1 ms | 1026 |
| About | 14.6 ms | 1026 |

**Değerlendirme:** En yavaş görünüm 42 ms — 60 fps bütçesinin (16.7 ms) üzerinde ama algı eşiğinin (100 ms) çok altında; kullanıcı "takılma" hissetmez. İlk boyama p95 **300 ms** (önceki turda ölçüldü).

### 2.2 İyi uygulamalar (doğrulandı, değişiklik gerekmedi)
- **Tek dil sözlüğü:** `src/renderer/i18n.js` yalnızca aktif dili IPC ile yükler; 17 dil önceden parse edilmez. Dil değişiminde eski sözlük bırakılır (`translations = { [actual]: dict }`).
- **Kısmi render:** `taskRenderSignature` + `needsFullRender` → aynı görev kümesinde yalnızca süre hücreleri güncellenir (`app.js:1567`).
- **`requestAnimationFrame` ile toplu DOM yazımı:** satır 1621.
- **Monotonik sayaç:** `setInterval(timerTick, 1000)` + `Date.now()` farkı; gizli sekmede kayma yok.

### 2.3 Fırsat (düşük öncelik, ölçülmüş gerekçe)
Settings görünümü 42 ms — 4 ayrı poll başlatıyor (`micWatch`, `wzPoll`, `wzClock`, `setPoll`). Görünüm görünür değilken poll'ları durdurmak ~10 ms kazandırır, ancak mevcut değer bütçe içinde olduğu için **değişiklik yapılmadı** (spekülatif optimizasyon riski).

### 2.4 React Client/Server Component sınırları → **Kapsam dışı**
Next.js yok. Eşdeğeri: renderer `contextIsolation: true` + `sandbox` + `nodeIntegration: false` ile izole; tüm veri erişimi 57 allowlist IPC kanalından geçiyor (preload ↔ main **birebir 57 = 57** doğrulandı).

---

## 3. Temizlik ve Teknik Borç

### 3.1 ✅ DÜZELTİLDİ — Ölü i18n anahtarları (10 adet × 17 dil)

**Kanıt:** Repo genelinde (kaynak + test + doküman) her anahtar için **0 referans**; dinamik önek taraması (`willBe` + `...`) da 0.

| Kaldırılan | Kaldırılan |
|---|---|
| `aboutTitle` | `willBeShutdown` |
| `aboutSub` | `willBeRestarted` |
| `okText` | `willBeHibernated` |
| `socialHeader` | `willBePutToSleep` |
| `timerText` | `willBeExecutedIn` |

**Sonuç:** 723 → **713 anahtar**, 17 dilde parite korundu.

> **Önemli ayrım:** `event_*` anahtarları **korundu** — `app.js:2386` bunları dinamik kuruyor: `t('event_' + ev)`. Naif bir "kullanılmayan anahtar" temizliği bunları silip etkinlik panelini bozardı.

### 3.2 ✅ DÜZELTİLDİ — DRY ihlali: `stableStringify` iki kopya

**Dosyalar:** `src/console/ConsoleStore.js:30`, `src/main/storage/MigrateV2.js:54` (birebir aynı 6 satır)

**Risk:** Fonksiyon **HMAC imza** ve **migrasyon checksum'ı** için kullanılıyor. Kopyalardan biri değişirse imzalar sessizce uyuşmaz hale gelir — hata vermez, sadece doğrulama başarısız olur.

**Düzeltme:** `src/main/util/stableStringify.js` (tek kaynak), iki dosya da `require` ediyor.
**Test:** `tests/main/stable-stringify.test.mjs` — **6/6 PASS** (determinizm, dizi sırası korunur, ilkel değerler, iç içe yapı, kopya kalmadığının doğrulanması).

### 3.3 ✅ DÜZELTİLDİ — Kullanılmayan değişkenler

`src/renderer/app.js` hızlı zamanlayıcı handler'ında:
```js
// önce — ikisi de hiç okunmuyor
const currentLang = localStorage.getItem('language') || 'tr';
const lang = localStorage.getItem('language') || 'tr';
// sonra — ikisi de silindi
```
Ayrıca `parseInt(minVal)` → `parseInt(minVal, 10)` (radix eksikliği; `"0x10"` gibi girdide sürpriz önlenir).

### 3.4 `console.log` / mock veri → **Sorun bulunmadı**
- Renderer ve ana süreçte **hiç** `console.log` yok.
- Bulunanların tamamı CLI/build betiklerinde (`scripts/build-appx.js`, `scripts/release-check.js`, …) — orada **beklenen** çıktı.
- `console.error`/`warn` yalnızca gerçek hata yollarında ve `t()` anahtarlarıyla kullanıcıya çevrilmiş metin üretiyor.

### 3.5 TODO/FIXME/HACK → **Sorun bulunmadı**
Tarama sonucu: **0 adet**. (Eşleşen tek şey `whatToDo` adlı meşru alan adı.)

### 3.6 Ölü kod
`spikes/` ve `scripts/spike-pslist.js` geliştirme artefaktları; **paketleme dışında** (`electron-builder.config.cjs` → `"!spikes/**"`). Doğrulandı: shipped `app.asar` içinde yok.

### 3.7 Parametre sırası hatası (bu turda yakalandı ve düzeltildi)
DRY refactor sırasında `edit` çağrılarında `oldString`/`newString` yer değiştirdi; `ConsoleStore.js`'te fonksiyon **iki kez** kaldı. `node --check` + dosya okumasıyla tespit edilip düzeltildi, ardından `stableStringify` kopya testi kalıcı koruma olarak eklendi.

---

## 4. Veri Bütünlüğü ve Hata Yönetimi

### 4.1 Hardcoded sır / env sızıntısı → **Sorun bulunmadı**

| Kontrol | Sonuç |
|---|---|
| Kaynakta sabit API key/token/şifre | **0 eşleşme** (regex: `api_key\|secret\|token\|password = "…16+ karakter"`) |
| `.env` / `.pem` / `.pfx` commit'li mi | Yalnızca `docs/release/release-ed25519.pub.pem` — bu **public key**, sır değil |
| Sırlar nerede | `SecretStore` + Electron `safeStorage` (DPAPI); düz metin fallback **reddediliyor** (`SECRET_BACKEND_UNAVAILABLE`) |
| Log redaksiyonu | `src/main/logger.js` → `redact()` tüm argümanlara uygulanıyor |

### 4.2 Girdi doğrulama → **Büyük ölçüde sağlam**

57 IPC kanalının tamamı `guardIpcHandler` (origin doğrulama) arkasında. Mutasyon yapan kanallar tek tek denetlendi:

| Kanal | Doğrulama |
|---|---|
| `create-task` | `validateTaskData` ✓ |
| `save-settings` / `-atomic` | `validateSettings` ✓ |
| `save-webhooks` | `validateWebhooks` ✓ |
| `send-wol` | `validateWol` ✓ |
| `cancel-task` / `cancel-action` | `validateCancelPin` ✓ |
| `security-settings-update` | `validateSecuritySettings` + anahtar allowlist ✓ |
| `import-templates` | `TemplateTransfer.parseImportPayload` (boyut + şema) ✓ |
| `export-templates` | Argüman almıyor (dosya diyaloğu main'de) ✓ |
| `delete-all-data` | PIN + onay ✓ |
| `ai-model-download` | Argüman almıyor ✓ |

**Path traversal:** `get-locale` → `normalizeLanguage` **katı allowlist** (`LANGUAGE_ORDER.includes(base)`), ardından `path.join`; `../../` imkânsız. Doğrulandı.

### 4.3 Veri kalıcılığı (atomiklik) → **Sorun bulunmadı**
`StorageService._persist` → SQLite transaction; `_writeAll` tüm satırları **tek transaction**'da yazar. JSON yolu: `tmp` → `fsync` → `renameWithRetry` (retry + `cleanStaleTmps`). Bozuk profil → **bakım modu** (kullanıcıya `#storage-warning` şeridi, sessiz veri kaybı yok).

### 4.4 Hata mesajlarında iç detay sızması → **Düzeltildi** (bkz. 1.3)
Kalan `err.message` kullanımları yalnızca **log** tarafında; kullanıcıya giden tüm metinler `t(...)` anahtarlarından geliyor. Yerel API tarafı da temiz: `{ error: 'Endpoint failed' }` / `{ error: 'Internal error' }` — stack/DB yolu sızmıyor (`LocalApiService.js:479,484`).

---

## 5. Geliştirme ve Ekleme Önerileri

| # | Öneri | Gerekçe (ölçülmüş) | Öncelik |
|---|---|---|---|
| E1 | **Linter ekle** (`eslint` + `no-unused-vars`, `no-undef`) | Ölü değişkenler ve DRY kopyaları yalnızca elle taramayla bulundu; CI'da otomatik yakalanmalı | Orta |
| E2 | `app.js` (3 929 satır) modüllere böl | Tek dosya; `tasksView.js` ayrımı doğru yönde, aynısı history/settings için yapılmalı | Orta |
| E3 | `check-i18n.js`'e dinamik anahtar farkındalığı | Araç 86 "kullanılmayan" bildiriyor, gerçek ölü sayısı **0**; yanlış pozitif gürültüsü gerçek sorunları gizliyor | Orta |
| E4 | Görünüm görünmezken poll'ları durdur | Settings 42 ms → ~30 ms beklenir | Düşük |
| E5 | `loadTasks` için `AbortController` | Şu an `tasksLoading` kilidi yeterli; ileride paralel görünüm açılırsa gerekir | Düşük |

---

## 6. Doğrulama Özeti

| Kapı | Sonuç |
|---|---|
| `npx vitest run` | **146 dosya / 1689 test PASS** |
| `npx playwright test --grep-invert packaged` | **32/32 PASS** |
| Paketlenmiş E2E (`packaged-e2e.ps1`) | **PASS · exit 0** — temiz kurulum → `1.0.9` üzerine `1.1.0` yükseltme → kaldırma → **zamanlayıcı kaydı temizliği** (komut: `-Installer "dist\Power Pilot Setup 1.1.0.exe" -OldInstaller "dist\Power Pilot Setup 1.0.9.exe"`) |
| `security.spec.js` | **7/7 PASS** |
| `npm run locales:check` | 17 dil / **729 anahtar** temiz (kullanılmayan 0) |
| `node scripts/security-check.mjs` | temiz (157 dosya) |
| Kontrast taraması (`sweep-contrast.cjs`, 10 görünüm) | açık tema **0** kusur · koyu tema **0** kusur |
| Mini pencere kontrastı (`probe-mini-contrast.cjs`) | **5/5 PASS** — sayaç 14.63:1, eylem/ikonlar 5.71:1 |
| PIN kurtarma yüzeyi (`probe-pin-recovery-ui.cjs`, `probe-pin-btn-click2.cjs`) | **16/16 + 9/9 PASS** — düğme gerçekten klasör açıyor, yol enjeksiyonu yok sayılıyor, dil kalıcı |
| PIN kurtarma kontrastı (`probe-pin-light-theme.cjs`) | açık tema **4/4 PASS** — metin 5.02:1, düğme 5.65:1 (koyu tema: 12.21:1 / 6.93:1) |
| Dekoratif ikon erişilebilirliği (`probe-icon-a11y.cjs`) | **28/28 → 0 açık** · etkilenen düğme **29 → 0** |
| Kapatma uyarısı akışı (`probe-warning-cancel.cjs`) | **12/12 PASS** — 30s geri sayım, Durdur → `cancelled_by_user`, Ertele → `scheduled`, kapatma yok |
| Bozuk veri kurtarma (`probe-corrupt-data.cjs`) | **25/25 PASS** — karantina + temiz depo, `T-STO-03` kaynağı korunur, bakım çıkışı, bildirim eylemleri |
| Şifreli yedek sızıntı testi (`T-CON-07`) | **4/4 PASS** (tekrarlı koşu) — `PPBK1` zarfı, SQLite başlığı yok, 57 baytlık düz metin işareti yok |
| İlk açılış deneyimi (`probe-firstrun-real.cjs`, `probe-firstrun-overlays.cjs`) | **10/10 PASS** — DOM 869 ms, kullanılabilir 3 372 ms, sihirbaz görünür ve atlanabilir, ardından rehber devreye giriyor, konsol hatası 0 |
| Arka planda çalışma (`probe-background-run.cjs`) | **5/5 PASS** — aktif görevde pencere kapatılınca ana pencere gizleniyor, süreç ayakta, görev `scheduled`, mini widget aktif |
| Çeviri sızıntısı (`probe-i18n-leak.cjs`) | **0 sızıntı** — İngilizce arayüzde 11 görünüm + 4 modal taramasında Türkçe metin kalmıyor |
| Zamanlayıcı yedeği (`probe-scheduler-backup.cjs`) | **4/4 PASS** — görev Windows Görev Zamanlayıcı'ya yazılıyor, iptal edilince kayıt kalkıyor |
| Veri silme / kurtarma → zamanlayıcı temizliği (`probe-wipe-scheduler.cjs`) | **9/9 PASS** — wipe sonrası kayıt 0, bozuk DB kurtarmada sahipsiz kayıt 0, yeniden açılış temiz |
| Tek örnek kilidi (`probe-second-instance.cjs`) | **8/8 PASS** — ikinci başlatma kendini kapatıyor, DB bozulmuyor, tepside gizliyken tekrar açınca pencere geri geliyor |
| **Uygulama kapalıyken görev çalışıyor mu** (`probe-run-task-closed.cjs`) | **5/5 PASS** — `scheduled` → Windows kaydı yazıldı → uygulama tamamen kapatıldı → `--run-task=<id>` ile açıldığında görev gerçekten tetiklendi (`warning`), tek seferlik kayıt tüketildi |
| Dış bağlantılar (`probe-links-render.cjs`) | **4/4 PASS** — gizlilik 4 617 krkt, destek 2 180, EULA 2 200 ("Power Pilot – End User Licen…"), iletişim 1 793; hepsi gerçek Chromium'da render edildi, 404 yok |
| Gizli pencere + kapatma uyarısı (`probe-warning-hidden-window.cjs`) | **5/5 PASS** — uyarı başlarken pencere kendiliğinden öne geliyor (`visible=true, focused=true`), Durdur → `cancelled` |
| Yeni düğme kontrastı (`probe-remove-btn-contrast.cjs`) | açık **6.92:1** · koyu **5.71–6.97:1** |
| Paketlenmiş asar içerik doğrulaması | **58/58 PASS** (tüm düzeltmeler pakette) |
| Kurulum paketi (NSIS) | `dist/Power Pilot Setup 1.1.0.exe` — **112 313 702 bayt**, SHA256 `FCD0408589703104B2C57672174A7C8487C97B4FE22761277FBA5CB22BFDC614` · **imzasız** (`Get-AuthenticodeSignature` = NotSigned) |
| Taşınabilir sürüm | `dist/Power Pilot Portable 1.1.0.exe` — **112 079 094 bayt**, SHA256 `91A332BD68490513481DEC265B63AAFD89C248B84C0B98E585FCDB95DA90E912` · veri `PowerPilotData/` · imzasız |
| Taşınabilir mod kanıtı (`probe-portable-scheduler.cjs`) | **5/5 PASS** — kayıt SFX'i gösteriyor (`--run-task=task_…`), geçici `\Temp\` yolu yok |
| Mağaza paketi (MSIX) | `dist/PowerPilot_1.1.0_x64.appx` — 167 534 264 bayt · `makeappx unpack` **başarılı** (111 dosya, `debug.log` yok) · `AppX is not signed (Windows Store only build)` |
| `node --check` (main.js, preload.js, app.js, TaskManager.js, validate.js, StorageService.js) | OK |

> Kurulum boyutu/SHA256 ve paket E2E komutunun tam kaydı: [`INSTALLER_EVIDENCE.md`](INSTALLER_EVIDENCE.md).

### Bu turda eklenen testler
`crash-guard.test.mjs` (7) · `ipc-error-leak.test.mjs` (3) · `stable-stringify.test.mjs` (6) · `store-listing.test.mjs` (+1) · `contrast-a11y.test.mjs` (10) · `dom-token-safety.test.mjs` (2) · `template-save.test.mjs` (5) · `task-remove.test.mjs` (8) · `energy-chip-focus.test.mjs` (4) · `mini-widget-state.test.mjs` (15) · `dashboard-layout.spec.js` (1 E2E) · `lang-fallback.spec.js` (4 E2E) · `packaged-hygiene.test.mjs` (4) · `main-i18n.test.mjs` (+5) · `modal-a11y.test.mjs` (7) · `icon-a11y.test.mjs` (7) · `toast-error-visibility.test.mjs` (4) · `touch-target.test.mjs` (5) · `warning-banner-a11y.test.mjs` (8) · `storage-recovery.test.mjs` (15) · `background-run.test.mjs` (7) · `scheduler-cleanup-wiring.test.mjs` (5) · `warning-visibility.test.mjs` (6) · `scheduler.test.mjs` (+3) · `data-wipe.test.mjs` (+6) · `run-task-closed.test.mjs` (4) · `pack-artifacts.test.mjs` (3) · `portable-mode.test.mjs` (10)

---

## 7. Kapatılamayan (insan/hesap gerektiren) maddeler

Bu maddeler kod ile çözülemez; **karar veya kimlik bilgisi** gerektirir:

1. **Mağaza sertifikası ile imzalama** — bu makinedeki `signtool.exe` HTTPS zaman damgasını desteklemiyor ("A required function is not present"). Paket üretimi ve manifest doğrulaması başarılı.
2. **WACK** (Windows App Certification Kit) — SDK + Store ilişkilendirmesi gerektirir.
3. **Partner Center / IARC beyanları** — hesap erişimi gerektirir.
4. **`vellium.dev` sitesine Power Pilot'a özel gizlilik sayfası** — site kaynağı (`C:\Users\emir\Desktop\Vellium`) mevcut ancak bu makineden Vercel'e deploy yetkisi **yok** (`vercel whoami` → "Not authorized"; yalnızca `Banyan` takımı görünüyor). Şu an jenerik `/en/legal/privacy` kullanılıyor ve bu sayfa geçerli bir gizlilik politikasıdır; ürüne özel sayfa yayınlandığında `store-listing.json` içindeki tek satır güncellenir.
