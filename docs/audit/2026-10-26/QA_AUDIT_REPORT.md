# Power Pilot — Kapsamlı Kod Denetimi ve Yayın Öncesi QA Raporu

> **Ürün:** Power Pilot  
> **Sürüm:** 1.1.0  
> **Denetim tarihi:** 26 Ekim 2026  
> **Kapsam:** `main.js`, `preload.js`, `src/main/**`, `src/renderer/**`, `src/console/**`, `src/agent/**`, `src/cli/**`  
> **Yöntem:** Statik kod incelemesi, satır-satır akış izleme, güvenlik sınırı analizi. Uygulama çalıştırılmadı; Windows'a özgü OS davranışları ampirik olarak doğrulanmadı. Yapılandırma dosyaları kapsam dışı bırakıldı.  
> **Kaynak değişikliği:** Yapılmadı. Bu rapor salt-okunur denetim çıktısıdır.  
> **Çalışma ağacı durumu:** Denetim sırasında repo kirliydi (değiştirilmiş `main.js`, `src/renderer/app.js`, testler; untracked `src/main/ipc/warningActions.js`). Satır numaraları bu çalışma ağacına göredir.

---

## 1. Yönetici Özeti

### 1.1 Yayın Kararı

**Power Pilot 1.1.0, mevcut haliyle yayına hazır değildir.**

Uygulamanın mimari temelleri büyük ölçüde sağlamdır: Electron `contextIsolation` + `sandbox`, sıkı CSP, `execFile` tabanlı güç komutları, Argon2id PIN türetimi, HMAC'li denetim zinciri, TLS doğrulaması ve `SecretStore.stripForDisk()` ile diskte düz metin sır bırakmama iyi tasarlanmıştır. Ancak bu kontrollerin **etrafındaki iş akışları** tutarlı değildir. Özellikle PIN koruması birden fazla yoldan atlatılabilmekte, görev doğrulaması güvenlik açısından kritik alanları denetlememekte ve bazı güvenlik kontrolleri hata durumunda **fail-open** davranmaktadır.

### 1.2 Öncelik Dağılımı

| Öncelik | Adet | Yayın etkisi |
|---|---:|---|
| **Kritik** | 4 | Doğrudan güvenlik bypass'ı veya beklenmeyen yıkıcı eylem |
| **Yüksek** | 11 | Güvenlik, veri kaybı veya güvenilirlik açısından ciddi risk |
| **Orta** | 13 | Belirli koşullarda hatalı davranış, performans veya veri tutarsızlığı |
| **Düşük** | 8 | Bakım, i18n, sızıntı ve kod kalitesi |
| **Toplam** | **36** | |

### 1.3 En Kritik Blocker'lar

1. **K-01 — PIN sıfırlama/silme mevcut PIN'i doğrulamıyor.** `set-cancel-pin` ve `clear-cancel-pin` herhangi bir kimlik doğrulaması istemiyor. Yerel erişimi olan biri PIN'i sıfırlayıp tüm PIN korumalı işlemleri açabilir.
2. **K-02 — `warning-confirm` görev kimliği taşımıyor.** Kullanıcı A görevinin uyarısını onaylarken uyarı penceresi B görevine geçtiyse, tıklama B'yi onaylayabilir; renderer ayrıca sonuçtan bağımsız olarak banner'ı gizliyor.
3. **K-03 — Görev doğrulaması eksik.** `validateTaskData` `action` alanını zorunlu tutmuyor; `mode`, `source`, `warningConfig.enabled`, `status` gibi alanları denetlemiyor. `{}` gönderimi varsayılan `shutdown` görevine, `warningConfig:{enabled:false}` ise uyarısız kapatmaya dönüşebiliyor.
4. **K-04 — Tray otonomi modu PIN'siz yazılıyor ve mod görev davranışına uygulanmıyor.** Tray menüsü `autonomyMode`'u doğrudan SQLite'a yazıyor; buna karşın görevlerin `mode` değeri başka kaynaklardan (client `data.mode`, `localStorage`) geliyor. "Full" mod gerçekte garanti edilmiyor.

### 1.4 Güçlü Yönler

Aşağıdaki alanlarda sorun bulunmadı; bunlar korunmalıdır:

- **Komut enjeksiyonu:** `PowerService` sabit `execFile` kullanıyor; kullanıcı girdisi argüman olarak geçmiyor (`src/main/services/PowerService.js:44-75`).
- **Renderer izolasyonu:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` (`main.js:550-558`).
- **CSP:** `connect-src 'none'`, `script-src 'self'`; renderer'dan doğrudan dış ağ erişimi kapalı.
- **Sırların diskte korunması:** `SecretStore.stripForDisk()` tüm yazma yollarında kullanılıyor (`StorageService.js:398, 942, 1008`).
- **PIN türetimi:** Argon2id, 16 bayt salt, 32 bayt çıktı, sabit zamanlı karşılaştırma (`Pin.js:57-91`).
- **Denetim zinciri:** SQLite yolunda HMAC zinciri ve checkpoint (`StorageService.js:1301-1328`).
- **TLS:** `minVersion`, `rejectUnauthorized: true`, istemci sertifikası doğrulaması (`TlsConfig.js:35-104`).
- **Yol doğrulama:** `AppPaths.resolveAppPath` ve `isAllowedAppUrl` traversal/protokol kontrolleri.

---

## 2. Öncelik Matrisi

| ID | Öncelik | Kategori | Bulgu | Konum |
|---|---|---|---|---|
| K-01 | Kritik | Güvenlik | PIN değiştirme/silme mevcut PIN istemiyor | `main.js:1068-1079`, `app.js:403-423` |
| K-02 | Kritik | Güvenlik/Mantık | `warning-confirm` TOCTOU ve koşulsuz banner gizleme | `main.js:1206-1209`, `app.js:3000-3003` |
| K-03 | Kritik | Güvenlik/Mantık | Görev doğrulaması eksik; sessiz shutdown/full mode | `validate.js:157-241`, `AutomationTask.js:116-167` |
| K-04 | Kritik | Güvenlik/Mantık | Tray otonomi modu PIN'siz; mod uygulanmıyor | `main.js:686,708-714`, `app.js:2060-2062` |
| Y-01 | Yüksek | Güvenlik | `get-settings` çözülmüş sırları renderer'a veriyor | `main.js:1259,1334`, `SecretStore.js:23-29` |
| Y-02 | Yüksek | Güvenlik | Tray duraklat/çıkış PIN korumalı iptali atlatıyor | `main.js:706,748`, `TaskManager.js:712-718` |
| Y-03 | Yüksek | Mantık | `getActiveTasks()` `executing` durumunu dışlıyor | `TaskManager.js:783-785`, `main.js:565,598,876-877` |
| Y-04 | Yüksek | Mantık | `_schedulerFired` hiç sıfırlanmıyor | `TaskManager.js:355-357,747,480-482` |
| Y-05 | Yüksek | Güvenlik | SafetyPolicyEngine fail-open ve kısmi politika bypass'ı | `SafetyPolicyEngine.js:38-51,126-160` |
| Y-06 | Yüksek | Güvenlik | Local API rolü eksik/geçersizse `admin` | `LocalApiService.js:126,486`, `main.js:1393-1394` |
| Y-07 | Yüksek | Güvenlik | Konsol global ajan anahtarı + kill-switch fail-open | `ConsoleServer.js:803-813`, `ConsoleClient.js:220-231` |
| Y-08 | Yüksek | Veri/Güvenlik | Metrik örnekleme hataları yutuluyor; sahte idle | `MetricCollector.js:123-135,255-267` |
| Y-09 | Yüksek | Veri | Backup restore'da rollback yok | `Backup.js:201-212` |
| Y-10 | Yüksek | Veri | MigrateV2 hedef DB'yi doğrulamadan migrated işaretliyor | `MigrateV2.js:217-230` |
| Y-11 | Yüksek | Performans | 1 sn'lik tick'te senkron FS taraması (3 sn'ye kadar blok) | `TaskManager.js:221-293`, `DirectoryIdle.js:37-95` |
| O-01 | Orta | Mantık | `startTimer` tanımsız; restore hata yutuyor | `app.js:2923-2925`, `app.js:526,545` |
| O-02 | Orta | Mantık | `durationSeconds: 0` → 30 saniye | `WarningManager.js:27`, `validate.js:221-224` |
| O-03 | Orta | Mantık | SmartFinish örnekleri sadece `taskId` ile anahtarlı | `SmartFinishEngine.js:18-19,151-155,187-189` |
| O-04 | Orta | Güvenlik/Mantık | Idempotency anahtarı method/path/body kapsamıyor | `LocalApiService.js:386-395,753-758` |
| O-05 | Orta | Güvenilirlik | Local API `new URL` Host header ile korumasız | `LocalApiService.js:375` |
| O-06 | Orta | Güvenlik | `/api/v1/audit` tam log'u viewer'a veriyor | `LocalApiService.js:742-744`, `ConsoleServer.js:898-900` |
| O-07 | Orta | Performans | `hasProcessConditions` terminal görevleri sayıyor | `TaskManager.js:792-798`, `main.js:400` |
| O-08 | Orta | Performans/Veri | Audit append her yazımda tüm tabloyu okuyor; retention yok | `StorageService.js:1253-1266,1311-1322` |
| O-09 | Orta | Veri | DB kilidi stale-lock TOCTOU | `Database.js:110-125` |
| O-10 | Orta | Veri | `rotatedFrom` hash dışında | `AuditLog.js:18-21,85-90` |
| O-11 | Orta | Veri | PIN iptalinde enerji/dil değişiklikleri sunucuda kalıyor | `app.js:3256-3273` |
| O-12 | Orta | Veri | localStorage/SQLite iki kaynak; autonomy drift | `app.js:4,800-806,2061`, `main.js:686` |
| O-13 | Orta | Veri/Güvenlik | Denetim yazılamazsa güvenlik ayarı yine uygulanıyor | `main.js:1329-1331`, `StorageService.js:1301-1303` |
| D-01 | Düşük | UI/i18n | `timeFormatDays.substring` çökmesi | `app.js:650,711`, `i18n.js:46-49` |
| D-02 | Düşük | Temizlik | Hardcoded 1.28 GB model hedefi | `app.js:2518,2820` |
| D-03 | Düşük | i18n | Mini pencere Türkçe tooltip'ler | `mini.html:22,26,30` |
| D-04 | Düşük | Temizlik | `onWarningEnded` listener temizliği yok | `preload.js:90-95` |
| D-05 | Düşük | Temizlik | `silentMode` ölü alan | `AutomationTask.js:166` |
| D-06 | Düşük | Veri/Temizlik | `getSettings()` mutable iç nesne döndürüyor | `StorageService.js:992-994` |
| D-07 | Düşük | Performans | `loadTasks` 5 sn polling, in-flight guard yok | `app.js:1228,1388-1391` |
| D-08 | Düşük | Temizlik/Veri | Legacy JSON ve SQLite audit yolları farklı garantiler | `AuditLog.js:16,85-90` |

---

## 3. Hatalar, Mantık Kusurları ve Güvenlik Açıkları

### 3.1 Kritik

#### K-01 — İptal PIN'i mevcut PIN doğrulanmadan değiştirilebiliyor ve silinebiliyor

**Konum:** `main.js:1068-1079`, `src/renderer/app.js:403-423`, `src/main/ipc/validate.js:447-453`

**Mevcut kod:**

```js
// main.js:1068
ipcHandle('set-cancel-pin', async (event, args) => {
    const pin = args && args.pin;
    const check = validateCancelPin(pin);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    const hash = await Pin.hashPin(pin);
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: hash });
    return { success: true };
});
ipcHandle('clear-cancel-pin', () => {
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: null });
    return { success: true };
});
```

`validateCancelPin` yalnızca biçim kontrolü yapıyor:

```js
// src/main/ipc/validate.js:447
function validateCancelPin(pin) {
    const { PinGuard } = require('./pinGuard');
    if (!PinGuard.validFormat(pin)) {
        return fail('PIN 4-8 haneli sayı olmalı.', 'INVALID_PIN');
    }
    return { ok: true };
}
```

Renderer da eski PIN'i sormuyor:

```js
// src/renderer/app.js:403
const btnPinSet = document.getElementById('btn-pin-set');
if (btnPinSet) btnPinSet.addEventListener('click', async () => {
    const pin = document.getElementById('pin-input').value;
    const res = await window.electronAPI.setCancelPin(pin);
    ...
});
const btnPinClear = document.getElementById('btn-pin-clear');
if (btnPinClear) btnPinClear.addEventListener('click', async () => {
    await window.electronAPI.clearCancelPin();
    ...
});
```

**Etki:**

PIN, iptal/erteleme ve güvenlik ayarları için bir kapı olarak tasarlanmış. Ancak PIN'i bilmeyen biri:

1. `clear-cancel-pin` ile PIN'i silebilir,
2. ardından istediği yeni PIN'i `set-cancel-pin` ile kurabilir,
3. yeni PIN ile `security-settings-update`, `generate-api-key`, `cancel-task` gibi tüm korumalı işlemleri yapabilir.

Bu, yerel erişimi olan bir saldırgan veya uygulamayı kilitsiz bırakan kullanıcı için **tam PIN bypass'ı**dır. `requireSecurityPin` yalnızca *yeni* PIN'i doğruladığı için eski PIN hiçbir zaman sorulmaz.

**Öneri:**

- `cancelPinHash` doluysa `set-cancel-pin` **mevcut PIN'i** zorunlu tutsun.
- `clear-cancel-pin` her zaman PIN doğrulaması istesin.
- PIN değişimi ve silme için ayrı `PinGuard` scope'u kullanılsın; deneme sayacı ve audit kaydı eklensin.
- UI eski PIN + yeni PIN + yeni PIN tekrarı alsın.

```js
ipcHandle('set-cancel-pin', async (event, args) => {
    const current = storageService.getSettings();
    if (current.cancelPinHash) {
        const err = await requireCancelPin(args && args.currentPin);
        if (err) return err;
    }
    const check = validateCancelPin(args && args.pin);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    const hash = await Pin.hashPin(args.pin);
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: hash });
    auditLog.append({ actor: 'local_user', action: 'cancel_pin_changed', target: 'settings', detail: '' });
    return { success: true };
});

ipcHandle('clear-cancel-pin', async (event, args) => {
    const err = await requireCancelPin(args && args.pin);
    if (err) return err;
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: null });
    auditLog.append({ actor: 'local_user', action: 'cancel_pin_cleared', target: 'settings', detail: '' });
    return { success: true };
});
```

**Regresyon testi:** PIN kurulu → yanlış/boş `currentPin` ile set/clear reddedilmeli; doğru PIN ile kabul edilmeli; deneme sayacı 5'te kilitlemeli.

---

#### K-02 — `warning-confirm` görev kimliği taşımıyor; eski tıklama yeni uyarıyı onaylayabiliyor

**Konum:** `main.js:1206-1209`, `src/renderer/app.js:2999-3003`, `src/main/services/WarningManager.js:116-127`, `src/main/ipc/warningActions.js:33-53`

**Mevcut kod:**

```js
// main.js:1206
ipcHandle('warning-confirm', () => {
    warningManager.finishWarning(true, false);
    return { success: true };
});
```

```js
// src/renderer/app.js:2999
const btnWarnNow = document.getElementById('btn-warn-now');
if (btnWarnNow) btnWarnNow.addEventListener('click', async () => {
    if (window.electronAPI.warningConfirm) await window.electronAPI.warningConfirm();
    hideWarningBanner();
});
```

`finishWarning` aslında görev kimliğiyle korunabilecek şekilde yazılmış:

```js
// WarningManager.js:116
finishWarning(proceed, snoozed, taskId = null) {
    if (!this.activeWarning) return false;
    if (taskId && this.activeWarning.taskId !== taskId) return false;
    ...
}
```

Ancak `warning-confirm` bu parametreyi hiç kullanmıyor.

**Etki:**

- Kullanıcı A görevinin "Şimdi" butonuna tıkladığı anda A uyarısı zaman aşımına uğrayıp B görevinin uyarısı açılırsa, tıklama **B görevini onaylar**.
- Aktif uyarı yokken bile handler `{ success: true }` döndürür; renderer banner'ı gizler ve kullanıcıya işlem onaylanmış gibi görünür.
- `warning-snooze`/`cancel` tarafında `warningActions.js` doğru TOCTOU desenini uyguluyor; `confirm` bu korumadan yoksun.

**Öneri:**

- Renderer, aktif uyarının `taskId`'sini (`getActiveState()` veya banner `dataset`) göndersin.
- Handler, herhangi bir `await` öncesinde aktif uyarının kimliğini yakalasın; `finishWarning(true, false, expectedTaskId)` çağırsın.
- Sonuç `success:false` ise renderer banner'ı gizlemesin.
- `warning-confirm` için de PIN gerekip gerekmediği ürün kararıdır; ancak kimlik/TOCTOU kontrolü zorunludur.

```js
ipcHandle('warning-confirm', (event, payload) => {
    const expectedTaskId = payload && payload.taskId;
    const active = warningManager.getActiveState();
    if (!active) return { success: false, code: 'NO_ACTIVE_WARNING' };
    if (expectedTaskId && active.taskId !== expectedTaskId) {
        return { success: false, code: 'WARNING_CHANGED' };
    }
    const ok = warningManager.finishWarning(true, false, active.taskId);
    return ok
        ? { success: true, taskId: active.taskId }
        : { success: false, code: 'WARNING_CHANGED' };
});
```

```js
// renderer
const state = await window.electronAPI.getActiveState();
const taskId = state && state.activeWarning && state.activeWarning.taskId;
const res = await window.electronAPI.warningConfirm(taskId);
if (res && res.success) hideWarningBanner();
else showToast(t('errorCancelTooLate'), 'error');
```

**Regresyon testi:** A uyarısı açıkken B uyarısı başlat; eski A `taskId`'si ile confirm → `WARNING_CHANGED`, B onaylanmamalı. Aktif uyarı yokken confirm → `NO_ACTIVE_WARNING`.

---

#### K-03 — Görev doğrulaması eksik: `{}` sessiz shutdown'a, `enabled:false` uyarısız kapatmaya dönüşebiliyor

**Konum:** `src/main/ipc/validate.js:157-241`, `src/main/services/models/AutomationTask.js:110-167`, `main.js:1034-1041`, `src/main/services/TaskManager.js:355-357,415`

**Mevcut kod:**

```js
// validate.js:157
function validateTaskData(data) {
    if (!data || typeof data !== 'object') return fail('Geçersiz görev verisi.', 'INVALID_BODY');
    if (data.id !== undefined) { ... }
    if (data.action !== undefined && !Object.values(POWER_ACTIONS).includes(data.action)) {
        return fail(`Geçersiz eylem: ${String(data.action)}.`, 'INVALID_ACTION');
    }
    ...
    const wc = data.warningConfig;
    if (wc !== undefined && wc.durationSeconds !== undefined) {
        if (!Number.isInteger(wc.durationSeconds) || wc.durationSeconds < 0 || wc.durationSeconds > 3600) {
            return fail('warning durationSeconds 0..3600 aralığında olmalı.', 'INVALID_WARNING');
        }
    }
    return { ok: true };
}
```

`AutomationTask` eksik alanları "güvenli" varsayılanlarla dolduruyor, ancak bu varsayılan yıkıcı:

```js
// AutomationTask.js:110
this.action = data.action || POWER_ACTIONS.SHUTDOWN;
this.source = data.source || TASK_SOURCE.UI;
this.mode = data.mode === 'full' ? 'full' : 'classic';
this.safetyPolicy = data.safetyPolicy || { checkUserActivity: true, ... };
this.warningConfig = data.warningConfig || {
    enabled: true,
    durationSeconds: 30,
    silentMode: false
};
```

`warningConfig.enabled` kontrolü:

```js
// TaskManager.js:414
if (task.warningConfig && task.warningConfig.enabled && this.warningManager) {
    ...
}
```

**Etki:**

| Girdi | Sonuç |
|---|---|
| `{}` | `action` yok → varsayılan `shutdown`; 30 sn uyarı |
| `{ action: 'shutdown', warningConfig: { enabled: false } }` | `enabled` doğrulanmıyor; uyarı hiç açılmaz → **anında kapatma** |
| `{ action: 'shutdown', mode: 'full' }` | `mode` doğrulanmıyor; `autoProceed` true → uyarı zaman aşımında onay |
| `{ action: 'shutdown', source: 'local_api' }` | `source` doğrulanmıyor; scheduler `_schedulerFired = true` → uyarı otomatik onay |
| `{ action: 'shutdown', safetyPolicy: {} }` | Kısmi politika; tüm varsayılan kontroller atlanır |
| `{ action: 'shutdown', status: 'executing' }` | Durum enjeksiyonu; görev izlenmez/çalışmaz |

Bu, uygulamanın en tehlikeli doğrulama boşluğudur. Renderer veya AI önerisi hatalı/eksik bir nesne gönderdiğinde kullanıcı farkında olmadan kapatma görevi oluşturabilir.

**Öneri:**

- `action` **zorunlu** olsun; `undefined` reddedilsin.
- IPC `create-task` için istemci alanları beyaz listeye alınsın: `name`, `action`, `trigger`, `conditionGroup`, `warningConfig`, `safetyPolicy`, `snoozeConfig`, `recurrence`, `chain`.
- `source`, `mode`, `status`, `enabled`, `policyId`, `consoleOrderId`, `requiresMaintenanceWindow` istemciden **kabul edilmesin**; sunucu tarafından atansın.
- `warningConfig` tam doğrulansın: `enabled` boolean, `durationSeconds` 0..3600, `silentMode` boolean.
- `safetyPolicy` varsayılanlarla **merge** edilsin; eksik alanlar güvenli varsayılana dönsün.
- `snoozeConfig` ve `recurrence` şemaları doğrulansın.
- `source` yalnızca `user_interface` / `ai` / `template` gibi güvenilir değerler olabilsin; `local_api`/`console` yalnızca ilgili servis tarafından atansın.

```js
const CLIENT_TASK_FIELDS = new Set([
    'name', 'action', 'trigger', 'conditionGroup',
    'warningConfig', 'safetyPolicy', 'snoozeConfig', 'recurrence', 'chain'
]);

function validateTaskData(data) {
    if (!data || typeof data !== 'object') return fail('Geçersiz görev verisi.', 'INVALID_BODY');
    for (const key of Object.keys(data)) {
        if (!CLIENT_TASK_FIELDS.has(key)) {
            return fail(`İstemci bu alanı gönderemez: ${key}`, 'FORBIDDEN_FIELD');
        }
    }
    if (!Object.values(POWER_ACTIONS).includes(data.action)) {
        return fail('action zorunlu ve geçerli olmalı.', 'INVALID_ACTION');
    }
    const wc = data.warningConfig;
    if (wc !== undefined) {
        if (typeof wc !== 'object' || Array.isArray(wc)) return fail('Geçersiz warningConfig.', 'INVALID_WARNING');
        if (wc.enabled !== undefined && typeof wc.enabled !== 'boolean') {
            return fail('warningConfig.enabled boolean olmalı.', 'INVALID_WARNING');
        }
        if (wc.silentMode !== undefined && typeof wc.silentMode !== 'boolean') {
            return fail('warningConfig.silentMode boolean olmalı.', 'INVALID_WARNING');
        }
        if (wc.durationSeconds !== undefined && (!Number.isInteger(wc.durationSeconds) || wc.durationSeconds < 0 || wc.durationSeconds > 3600)) {
            return fail('warning durationSeconds 0..3600 aralığında olmalı.', 'INVALID_WARNING');
        }
    }
    ...
}
```

`AutomationTask` tarafında politika merge:

```js
const SAFE_POLICY_DEFAULTS = Object.freeze({
    checkUserActivity: true,
    checkProtectedApps: true,
    checkFullscreen: true,
    checkSystemLoad: true,
    forceCloseApps: false,
    remoteApprovalRequired: false
});
this.safetyPolicy = { ...SAFE_POLICY_DEFAULTS, ...(data.safetyPolicy || {}) };
```

Ve `TaskManager.createTask` sunucu alanlarını ezsin:

```js
const task = new AutomationTask({
    ...normalizedData,
    source: TASK_SOURCE.UI,           // IPC/AI için
    mode: this.storage.getSettings().autonomyMode === 'full' ? 'full' : 'classic',
    status: TASK_STATUS.DRAFT,
    enabled: true
});
```

**Regresyon testi:** `{}`, `{action:'shutdown', warningConfig:{enabled:false}}`, `{action:'shutdown', mode:'full'}`, `{action:'shutdown', source:'local_api'}`, `{action:'shutdown', safetyPolicy:{}}` → hepsi reddedilmeli veya güvenli varsayılana zorlanmalı.

---

#### K-04 — Tray otonomi modu PIN'siz yazılıyor; `autonomyMode` görev davranışına uygulanmıyor

**Konum:** `main.js:686,708-714,951-956`, `app.js:2060-2062`, `AutomationTask.js:130`, `validate.js:308-322`

**Mevcut kod:**

```js
// main.js:686
const mode = settings.autonomyMode || 'classic';
...
// main.js:708
{
    label: mode === 'full' ? t('traySwitchClassic') : t('traySwitchFull'),
    click: () => {
        if (storageService) {
            storageService.updateSettings({ autonomyMode: mode === 'full' ? 'classic' : 'full' });
            scheduleTrayUpdate();
        }
    }
}
```

`autonomyMode` `SECURITY_SETTINGS_SCHEMA` içinde ve normal `save-settings` yolundan yazılamıyor; yalnızca PIN'li `security-settings-update` ile değişmeli:

```js
// validate.js:308
const SECURITY_SETTINGS_SCHEMA = {
    agentDisabled: 'boolean',
    autonomyMode: ['classic', 'full'],
    automationPaused: 'boolean',
    ...
};
```

Ancak tray doğrudan `storageService.updateSettings` çağırıyor; PIN yok.

Dahası, `autonomyMode` görev oluştururken kullanılmıyor:

```js
// main.js:951 — hızlı zamanlayıcı
task = taskManager.createTask({
    name: `Hızlı Zamanlayıcı (${action})`,
    action: action,
    source: 'user_interface',
    trigger: { type: 'duration', durationMs: durationMs }
}); // mode verilmiyor → AutomationTask varsayılanı 'classic'
```

```js
// app.js:2060 — AI görevi
let mode = 'classic';
try { if (localStorage.getItem('autonomyMode') === 'full') mode = 'full'; } catch (_) {}
const res = await window.electronAPI.createTask({ ...aiProposal.task, mode });
```

```js
// AutomationTask.js:130
this.mode = data.mode === 'full' ? 'full' : 'classic';
```

**Etki:**

- Tray'den "Full" moda geçmek PIN gerektirmiyor; güvenlik ayarı koruması atlatılıyor.
- Tray "Full" yazsa bile hızlı zamanlayıcı `classic` kalıyor; AI görevi `localStorage`'daki (eski) değeri kullanıyor. Kullanıcı "Full" görürken görev `classic` çalışabilir; tersi de olabilir.
- `mode:'full'` istemci tarafından `create-task` ile de gönderilebildiği için (K-03) güvenlik ayarıyla değil, payload ile belirleniyor.

**Öneri:**

- Tray'deki mod değiştirme öğesi ayarlar penceresini açsın; PIN'li `security-settings-update` akışını kullansın. Doğrudan `storageService.updateSettings` çağrısı kaldırılsın.
- `mode` tek kaynaktan (SQLite `settings.autonomyMode`) `TaskManager.createTask` içinde atansın; istemci `mode` göndermesin.
- AI/UI görevleri için `mode` gönderimi kaldırılsın.
- Tray etiketi ile gerçek davranış aynı kaynaktan beslensin; `settings-changed` olayıyla renderer'a yayınlansın.

```js
// main.js — tray
{
    label: mode === 'full' ? t('traySwitchClassic') : t('traySwitchFull'),
    click: () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('request-security-settings', { autonomyMode: mode === 'full' ? 'classic' : 'full' });
        }
    }
}
```

```js
// TaskManager.createTask
const effectiveMode = this.storage.getSettings().autonomyMode === 'full' ? 'full' : 'classic';
const task = new AutomationTask({ ...normalizedData, mode: effectiveMode });
```

**Regresyon testi:** PIN varken tray mod değişimi PIN istemeli; PIN yokken `security-settings-update` fail-closed olmalı; oluşturulan her görevin `mode` değeri SQLite ayarıyla aynı olmalı.

---

### 3.2 Yüksek

#### Y-01 — `get-settings` çözülmüş sırları renderer'a veriyor

**Konum:** `main.js:1259,1334`, `src/main/security/SecretStore.js:23-29,332-343`, `preload.js:60`, `app.js:1736,1783,3089`

**Mevcut kod:**

```js
// main.js:1259
ipcHandle('get-settings', () => storageService.getSettings());

// main.js:1334 — save-settings yanıtı
return { success: true, settings: storageService.getSettings() };
```

`SecretStore.hydrateData` başlangıçta çözülmüş sırları bellekteki `settings` nesnesine geri dolduruyor:

```js
// SecretStore.js:23
const SECRET_SETTING_FIELDS = Object.freeze([
    'consoleAgentKey',
    'localApiKeyPem',
    'localApiPfxPassphrase',
    'consoleClientKeyPem',
    'consoleClientPfxPassphrase'
]);
...
// SecretStore.js:332
async hydrateData(data, { only = SECRET_SETTING_FIELDS } = {}) {
    ...
    settings[field] = value;
}
```

**Etki:**

Renderer `getSettings()` çağırdığında `consoleAgentKey`, `localApiKeyPem`, `localApiPfxPassphrase`, `consoleClientKeyPem`, `consoleClientPfxPassphrase` alanları **düz metin** olarak renderer sürecine geçiyor. Renderer bu alanları kullanmıyor (yalnızca `lanModeEnabled`, `localApiPort`, `deviceWattage` gibi alanları okuyor). Herhangi bir renderer compromise/XSS durumunda bu sırlar `openExternal` gibi bir kanalla dışarı sızdırılabilir; CSP `connect-src 'none'` doğrudan HTTP exfiltration'ı engeller ama tek savunma hattı olmamalı.

**Öneri:**

- `get-settings` ve `save-settings` yanıtları için **public settings** görünümü üretin; `SECRET_SETTING_FIELDS`, `localApiKeyHash`, `cancelPinHash`, `cancelPinSalt` çıkarılsın.
- Yerine yalnızca boolean durum bilgisi verin: `hasConsoleAgentKey`, `hasLocalApiKey`, `hasCancelPin`.
- `preload.getSettings` da bu public görünümü döndürsün.

```js
// main.js
function publicSettings(settings) {
    const {
        consoleAgentKey, localApiKeyPem, localApiPfxPassphrase,
        consoleClientKeyPem, consoleClientPfxPassphrase,
        localApiKeyHash, cancelPinHash, cancelPinSalt,
        ...rest
    } = settings || {};
    return {
        ...rest,
        hasConsoleAgentKey: !!consoleAgentKey,
        hasLocalApiKey: !!localApiKeyHash,
        hasCancelPin: !!cancelPinHash
    };
}
ipcHandle('get-settings', () => publicSettings(storageService.getSettings()));
```

`save-settings` içindeki `return { success: true, settings: ... }` de `publicSettings` kullanmalı.

**Regresyon testi:** `get-settings` yanıtında `consoleAgentKey`, `localApiKeyPem`, `localApiPfxPassphrase` vb. anahtarlar **bulunmamalı**; `has*` boolean'ları bulunmalı.

---

#### Y-02 — Tray "Duraklat" ve "Çıkış" PIN korumalı iptali atlatıyor

**Konum:** `main.js:706,748`, `src/main/services/TaskManager.js:712-718`, `main.js:724-746`

**Mevcut kod:**

```js
// main.js:706
{ label: t('trayTogglePause'), click: () => { if (taskManager) taskManager.togglePauseAll(); scheduleTrayUpdate(); } },

// main.js:748
{ label: t('trayQuit'), click: () => { isQuitting = true; app.quit(); } }
```

`togglePauseAll` doğrudan `automationPaused` yazıyor:

```js
// TaskManager.js:712
togglePauseAll() {
    this.pausedAll = !this.pausedAll;
    if (this.storage && typeof this.storage.updateSettings === 'function') {
        try { this.storage.updateSettings({ automationPaused: this.pausedAll }); } catch (_) {}
    }
    return this.pausedAll;
}
```

Buna karşın tray'deki "en yakın görevi iptal" öğesi PIN'e saygı duyuyor:

```js
// main.js:724
{ label: t('trayCancelNearest'), click: () => {
    if (!nextTask) return;
    if (settings.cancelPinHash) {
        // pencereyi aç, PIN sor
        return;
    }
    taskManager.cancelTask(nextTask.id);
}}
```

**Etki:**

- PIN kurulu olsa bile tray'den "Tümünü Duraklat" yapılabiliyor; `automationPaused` güvenlik ayarı PIN'siz değişiyor.
- Tray'den "Çıkış" yapılabiliyor; `before-quit` scheduler'ı durduruyor ve bekleyen görev çalışmıyor. Bu, PIN korumalı iptalin **arka kapısı**.
- Kullanıcı uygulamayı kapatıp yeniden açtığında görev `EXPIRED`/kesintiye uğramış olarak kalabilir; yani çıkış fiilen iptal işlevi görüyor.

**Öneri:**

- `cancelPinHash` varsa tray pause/quit, PIN penceresini açsın veya doğrudan ana pencereye yönlendirsin.
- Çıkışta aktif görev/uyarı varsa onay isteyin; `isQuitting` yalnızca doğrulama sonrası `true` olsun.
- `automationPaused` yazımı `security-settings-update` yolundan geçsin.

```js
{ label: t('trayTogglePause'), click: () => {
    if (settings.cancelPinHash) return showMainWindowForPin('pause');
    taskManager.togglePauseAll();
    scheduleTrayUpdate();
}}

{ label: t('trayQuit'), click: () => {
    const hasActive = taskManager && taskManager.hasInFlightOrScheduled();
    if (hasActive && settings.cancelPinHash) return showMainWindowForPin('quit');
    isQuitting = true;
    app.quit();
}}
```

**Regresyon testi:** PIN kurulu → tray pause ve quit PIN istemeli; PIN yok → mevcut davranış korunmalı.

---

#### Y-03 — `getActiveTasks()` `executing` durumunu dışlıyor; kapatma guard'ı ve mini pencere kaçırıyor

**Konum:** `src/main/services/TaskManager.js:783-785`, `main.js:564-576,596-604,876-877,1024-1032`

**Mevcut kod:**

```js
// TaskManager.js:783
getActiveTasks() {
    return this.tasks.filter(t => t.enabled && (t.status === TASK_STATUS.SCHEDULED || t.status === TASK_STATUS.MONITORING || t.status === TASK_STATUS.WAITING || t.status === TASK_STATUS.WARNING));
}
```

```js
// main.js:564
mainWindow.on('close', (event) => {
    const hasActive = taskManager && taskManager.getActiveTasks().length > 0;
    if (!isQuitting && hasActive) {
        event.preventDefault();
        mainWindow.hide();
        ...
    }
});
```

```js
// main.js:876
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
```

**Etki:**

- Görev `EXECUTING` durumuna geçtiğinde `getActiveTasks()` 0 döndürür.
- Kullanıcı güç işlemi sürerken pencereyi kapatırsa guard devreye girmez; pencere kapanır, `window-all-closed` `app.quit()` çağırır.
- `before-quit` interval'ları temizler; `power.execute` promise'i ve sonuç/history kaydı yarıda kalabilir.
- Mini pencere ve tray "aktif görev" sayısı da `executing` sırasında 0 gösterir; `get-active-state` renderer'a executing görevini vermez.

**Öneri:**

- `getActiveTasks()`'a `EXECUTING` ekleyin **veya** ayrı bir `hasInFlight()` / `getInFlightTasks()` ekleyin.
- Kapatma guard'ı, mini pencere görünürlüğü, tray sayısı ve `get-active-state` bu metodu kullansın.
- `window-all-closed` içinde in-flight görev varsa çıkışı erteleyin veya kullanıcıya sorun.

```js
getActiveTasks() {
    const activeStatuses = new Set([
        TASK_STATUS.SCHEDULED,
        TASK_STATUS.MONITORING,
        TASK_STATUS.WAITING,
        TASK_STATUS.WARNING,
        TASK_STATUS.EXECUTING
    ]);
    return this.tasks.filter(t => t.enabled && activeStatuses.has(t.status));
}

hasInFlight() {
    return this.tasks.some(t => t.enabled && t.status === TASK_STATUS.EXECUTING);
}
```

**Regresyon testi:** `EXECUTING` durumundaki görev `getActiveTasks()` içinde olmalı; close event `preventDefault` çağırmalı; `get-active-state` executing görevini döndürmeli.

---

#### Y-04 — `_schedulerFired` hiç sıfırlanmıyor; sonraki tekrarlar/uyarılar otomatik onaylanıyor

**Konum:** `src/main/services/TaskManager.js:355-357,480-482,747`, `WarningManager.js:28`

**Mevcut kod:**

```js
// TaskManager.js:355
if ([TASK_SOURCE.LOCAL_API, TASK_SOURCE.N8N, TASK_SOURCE.CONSOLE].includes(primaryTask.source)) {
    primaryTask._schedulerFired = true;
}
...
// TaskManager.js:747 — runTaskNow
task._schedulerFired = true;
```

`calculateNextRecurrence` görevi yeniden `SCHEDULED` yapıyor ama bayrağı temizlemiyor:

```js
// TaskManager.js:480
if (task.recurrence && task.recurrence.enabled) {
    this.calculateNextRecurrence(task);
    this.syncScheduler(task);
}
```

```js
// WarningManager.js:28
const autoProceed = task.mode === 'full' || task._schedulerFired === true;
```

**Etki:**

- `runTaskNow` ile bir kez manuel çalıştırılan `classic` görev, sonraki tekrarlarında `_schedulerFired=true` kaldığı için uyarıyı beklemeden otomatik ilerler.
- Uzak kaynaklı (`local_api`/`n8n`/`console`) bir görev tekrarlıysa, sonraki tüm çalışmalar otomatik onaylanır; kullanıcı uyarı görmez.
- Bayrak "geçici" yorumuyla persist edilmiyor; ama görev nesnesi bellekte kaldığı sürece yaşıyor.

**Öneri:**

- `_schedulerFired` görev özelliği olmaktan çıkarılsın; her execution için `claim` üzerinde tutulsun.
- `showWarning(task, { autoProceed })` şeklinde açık parametre geçilsin.
- `calculateNextRecurrence` içinde bayrak sıfırlansın (geçici çözüm).

```js
// TaskManager.executeTask
const autoProceed = claim.schedulerFired === true;
const warningConfirmed = await this.warningManager.showWarning(task, { autoProceed });
```

```js
// calculateNextRecurrence
task._schedulerFired = false;
task.status = TASK_STATUS.SCHEDULED;
```

**Regresyon testi:** `runTaskNow` sonrası tekrarlı görevde ikinci çalışma uyarı göstermeli; uzak kaynaklı görevde `autoProceed` yalnızca o execution için geçerli olmalı.

---

#### Y-05 — `SafetyPolicyEngine` fail-open ve kısmi politika bypass'ı

**Konum:** `src/main/services/SafetyPolicyEngine.js:38-51,54,84,98,126-128,139-141,158-160`, `AutomationTask.js:153-160`

**Mevcut kod:**

```js
// SafetyPolicyEngine.js:38
const policy = task.safetyPolicy || {};
...
try {
    const settings = this.storage && typeof this.storage.getSettings === 'function'
        ? this.storage.getSettings()
        : {};
    if (settings.agentDisabled === true) { return deny('AGENT_DISABLED', ...); }
} catch (_) { /* ayar okunamazsa diğer kontrollere devam */ }
...
} catch (err) {
    log.warn('[SafetyPolicyEngine] muafiyet kontrolü atlandı:', err && err.message);
}
...
} catch (err) {
    log.warn('[SafetyPolicyEngine] bakım-penceresi kontrolü atlandı:', err && err.message);
}
...
} catch (err) {
    log.warn('[SafetyPolicyEngine] sunucu-profil kontrolü atlandı:', err && err.message);
}
```

**Etki:**

- `task.safetyPolicy` yalnızca `{ checkProtectedApps: true }` ise `checkSystemLoad`, `checkFullscreen`, `checkUserActivity` `undefined` olur ve ilgili kontroller **tamamen atlanır**. Varsayılanlar `AutomationTask` içinde yalnızca `data.safetyPolicy` falsy ise uygulanıyor; kısmi nesne varsayılanları ezmiyor ama eksikleri de doldurmuyor.
- Storage okunamazsa kill-switch, muafiyet, bakım penceresi ve sunucu profili kontrolleri atlanıyor; yıkıcı eylem devam ediyor.
- `task.source` istemci tarafından belirlenebildiği için (K-03) `source:'console'` gibi değerlerle sunucu profili kuralları tetiklenebilir/atlatılabilir.
- `checkUserActivity`, `forceCloseApps`, `remoteApprovalRequired` bayrakları hiç uygulanmıyor (bkz. O-13/C-01).

**Öneri:**

- Politika varsayılanlarını engine içinde merge edin; eksik alan güvenli varsayılana dönsün.
- Yıkıcı eylemlerde (`shutdown`, `restart`, `hibernate`, `sleep`) storage/politika okuma hatası **fail-closed** olsun.
- `source`'u sunucu atassın; engine yalnızca güvenilir `task.source` okusun.
- Uygulanmayan bayrakları ya uygulayın ya da şemadan kaldırın.

```js
const SAFE_POLICY_DEFAULTS = Object.freeze({
    checkUserActivity: true,
    checkProtectedApps: true,
    checkFullscreen: true,
    checkSystemLoad: true
});

async evaluate(task) {
    const policy = { ...SAFE_POLICY_DEFAULTS, ...(task.safetyPolicy || {}) };
    let settings;
    try {
        settings = this.storage.getSettings();
    } catch (err) {
        return deny('POLICY_UNAVAILABLE', 'Güvenlik ayarları okunamadı; eylem engellendi.');
    }
    if (settings.agentDisabled === true) return deny('AGENT_DISABLED', ...);
    ...
}
```

**Regresyon testi:** Kısmi `safetyPolicy` ile protected-app/system-load/fullscreen kontrolleri çalışmalı; `storage.getSettings` throw ettiğinde yıkıcı eylem reddedilmeli.

---

#### Y-06 — Local API rolü eksik/geçersizse `admin`'e düşüyor

**Konum:** `src/main/services/LocalApiService.js:124-127,313-314,485-486`, `main.js:1390-1397`

**Mevcut kod:**

```js
// LocalApiService.js:124
static roleOf(settings) {
    const r = settings && settings.localApiKeyRole;
    return ROLE_RANK[r] ? r : 'admin';
}
...
// LocalApiService.js:485
route(method, path, body, res, ctx = {}) {
    const role = ROLE_RANK[ctx.role] ? ctx.role : 'admin'; // ctx yoksa admin (geriye uyumlu)
```

```js
// main.js:1390
ipcHandle('generate-api-key', async (event, args) => {
    const pinError = await requireSecurityPin(args && args.pin);
    if (pinError) return pinError;
    const role = args && typeof args.role === 'string' ? args.role : 'admin';
    const safeRole = ['viewer', 'operator', 'admin'].includes(role) ? role : 'admin';
    ...
});
```

**Etki:**

- Eski bir ayar kaydında `localApiKeyRole` yoksa veya bozuksa, API anahtarı **admin** yetkisiyle çalışır. Bu, en yüksek yetkiye fail-open yükseltmedir.
- `generate-api-key`'e geçersiz/eksik rol gönderilirse admin anahtarı üretilir; bir yazım hatası yetki yükseltmesine dönüşür.
- Admin, shutdown/restart, muafiyet ve bakım penceresi yazma yetkilerine sahiptir.

**Öneri:**

- `roleOf` bilinmeyen rol için `null` döndürsün; `route` geçersiz rolde 403 versin.
- `generateApiKey` geçersiz rolü reddetsin; varsayılan **viewer** olsun veya açıkça rol zorunlu olsun.
- Migrasyonla mevcut anahtarlara açık rol atansın; rolsüz anahtar kabul edilmesin.

```js
static roleOf(settings) {
    const r = settings && settings.localApiKeyRole;
    return ROLE_RANK[r] ? r : null;
}
route(method, path, body, res, ctx = {}) {
    const role = ROLE_RANK[ctx.role] ? ctx.role : null;
    if (!role) return this.sendJson(res, 403, { error: 'Invalid API role', code: 'FORBIDDEN' });
    ...
}
```

**Regresyon testi:** `localApiKeyRole` silinmiş/bozuk → API 403; `generate-api-key` geçersiz rol → hata; admin anahtarı yalnızca açıkça `admin` seçilince üretilmeli.

---

#### Y-07 — Konsol global ajan anahtarı kimlik taklidine, kill-switch fail-open'a ve pause senkron kilidine yol açıyor

**Konum:** `src/console/run.js:26`, `src/console/ConsoleServer.js:801-819`, `src/main/services/ConsoleClient.js:220-231`, `src/agent/headless.js:164-173`, `main.js:501-508`

**Mevcut kod:**

```js
// run.js:26
const keys = { admin: hashKey(need('CONSOLE_ADMIN_KEY')), agent: hashKey(need('CONSOLE_AGENT_KEY')) };
```

Global agent anahtarı düz string olduğu için `keyRecord` içinde `agentId: null` olur:

```js
// ConsoleServer.js:230
if (typeof value === 'string') return { role, hash: value, keyId: null, agentId: null, notAfter: null };
```

Heartbeat ve receipts bu durumda body'deki `agentId`'yi kabul ediyor:

```js
// ConsoleServer.js:801
if (method === 'POST' && p === '/api/v1/heartbeat') {
    if (!this.needPermission(res, role, 'heartbeat')) return;
    if (identity && identity.agentId && body.agentId !== identity.agentId) {
        return this.sendJson(res, 403, { error: 'Kimlik uyuşmazlığı.', code: 'IDENTITY_MISMATCH' });
    }
    const out = this.heartbeat(body.agentId, body.inventory, body.receipts);
    return this.sendJson(res, 200, out);
}
if (method === 'POST' && p === '/api/v1/receipts') {
    if (!this.needPermission(res, role, 'receipts')) return;
    const agentId = (identity && identity.agentId) || body.agentId;
    ...
}
```

Kill-switch yazımı hata yutuyor:

```js
// ConsoleClient.js:220
try {
    const wantDisabled = payload.disabled === true;
    if (wantDisabled !== !!s.agentDisabled && this.storage && typeof this.storage.updateSettings === 'function') {
        this.storage.updateSettings({ agentDisabled: wantDisabled });
        ...
    }
    if (wantDisabled) {
        return { ok: true, accepted: 0, rejected: 0, details: [], disabled: true, ... };
    }
} catch (_) { /* bayrak yazılamazsa senkron sürer */ }
```

Pause ise senkronu tamamen durduruyor:

```js
// headless.js:168
if (tasks.pausedAll) return;
const s = storage.getSettings();
if (s.agentDisabled === true) return;
const res = await consoleClient.sync();
```

```js
// main.js:506
if (taskManager && taskManager.pausedAll) return;
const res = await consoleClient.sync();
```

**Etki:**

- Global agent anahtarına sahip herkes herhangi bir `agentId` adına heartbeat/receipt gönderebilir; envanter ve teslim kayıtları taklit edilebilir.
- `storage.updateSettings({ agentDisabled: true })` başarısız olursa istisna yutulur ve siparişler işlenmeye devam eder; konsolun kill-switch'i etkisiz kalır.
- `pausedAll` true iken senkron hiç çalışmaz; konsolun "agentDisabled" emri **hiç teslim edilemez**. Yerel duraklatma, uzaktan kill-switch'i bloke eder.
- `agentDisabled` true iken de senkron erken dönüyor; ancak bu durumda heartbeat'in sürmesi gerekir (konsol yeniden açabilsin). Kod yorumu "yalnızca heartbeat sürer" diyor ama gerçekte hiç senkron yok.

**Öneri:**

- Her ajana ayrı anahtar (`agentId` bound) verin; global `CONSOLE_AGENT_KEY`'i kaldırın veya yalnızca kayıt için kullanın.
- `identity.agentId` yoksa heartbeat/receipt isteklerini reddedin; body `agentId`'yi kimlik kaynağı olarak kabul etmeyin.
- Kill-switch yazımı başarısızsa fail-closed dönün ve sipariş işlemeyin.
- `pausedAll` yalnızca **icrayı** durdursun; heartbeat/senkron her zaman çalışsın. `agentDisabled` de heartbeat'i engellemesin.

```js
// ConsoleServer
if (!identity || !identity.agentId) {
    return this.sendJson(res, 403, { error: 'Agent identity required', code: 'IDENTITY_REQUIRED' });
}
const agentId = identity.agentId;
```

```js
// ConsoleClient
try {
    if (wantDisabled !== !!s.agentDisabled) {
        this.storage.updateSettings({ agentDisabled: wantDisabled });
    }
} catch (err) {
    return { ok: false, code: 'KILL_SWITCH_PERSIST_FAILED', error: err.message, disabled: true };
}
```

```js
// headless/main sync
const res = await consoleClient.sync();   // her zaman
if (res && res.disabled) return;          // siparişleri işleme
if (tasks.pausedAll) return;              // yalnızca icrayı durdur
await executor.drain(queue);
```

**Regresyon testi:** Global agent anahtarı ile farklı `agentId` → 403; kill-switch storage hatası → sipariş kabul edilmemeli; `pausedAll` iken heartbeat alınmalı ve `agentDisabled` uygulanmalı.

---

#### Y-08 — Metrik örnekleme hataları yutuluyor; `stale=false` ile sahte idle tetiklemesi

**Konum:** `src/main/services/monitors/MetricCollector.js:123-135,242-267`

**Mevcut kod:**

```js
// MetricCollector.js:123
const results = await Promise.allSettled([
    this.withTimeout(processTask),
    this.withTimeout(this.sampleIdle()),
    this.withTimeout(this.sampleNetwork()),
    this.withTimeout(this.sampleDisks()),
    this.withTimeout(this.sampleBattery())
]);
failed = results.some((r) => r.status === 'rejected');
...
this.currentMetrics.stale = this.sampleCount < 3 || failed || elapsed >= this.sampleTimeoutMs;
```

Ancak `sampleNetwork` ve `sampleDisks` hataları **kendi içinde** yutuyor:

```js
// MetricCollector.js:242
async sampleNetwork() {
    try {
        const netStats = await si.networkStats('*');
        ...
    } catch (_) {
        // Ölçüm yoksa önceki değer korunur; sıfırlanmaz (yanlış tetikleme önlenir).
    }
}

async sampleDisks() {
    try {
        const disks = await si.disksIO();
        ...
    } catch (_) { /* önceki değer korunur */ }
}
```

**Etki:**

- `sampleNetwork`/`sampleDisks` hiç reject etmediği için `results` içinde `rejected` oluşmaz; `failed` false kalır.
- İlk 3 örnekten sonra `stale=false` olur; ağ/disk değerleri 0 veya eski değerde kalır.
- `network_speed` "düşük hız" veya `disk_activity` "düşük IO" koşulu, ağ/disk gerçekte aktifken **yanlışlıkla sağlanabilir**; bu da beklenmedik kapatma/uyku demektir.

**Öneri:**

- Her sampler `{ ok, value }` döndürsün veya hata durumunda throw etsin; `stale` bayrağı sampler bazında tutulsun.
- `networkStale`/`diskStale` true iken ilgili koşullar değerlendirilmesin (fail-closed).
- `getMetrics()` bu bayrakları tüketicilere taşısın; `SmartFinishEngine` stale metrikle karar vermesin.

```js
async sampleNetwork() {
    try {
        ...
        this.currentMetrics.networkStale = false;
    } catch (err) {
        this.currentMetrics.networkStale = true;
        throw err;
    }
}
```

```js
this.currentMetrics.stale =
    this.sampleCount < 3 ||
    failed ||
    this.currentMetrics.networkStale === true ||
    this.currentMetrics.diskStale === true ||
    elapsed >= this.sampleTimeoutMs;
```

**Regresyon testi:** `si.networkStats` throw → `networkStale=true`, `network_speed` koşulu değerlendirilmemeli; `si.disksIO` throw → aynı davranış.

---

#### Y-09 — Backup restore'da rollback yok: canlı DB karantinaya taşınıp geri getirilemeyebilir

**Konum:** `src/main/storage/Backup.js:192-216`

**Mevcut kod:**

```js
// Backup.js:201
const qDir = quarantineDir || path.join(path.dirname(dbPath), 'quarantine');
fs.mkdirSync(qDir, { recursive: true });
let quarantined = null;
if (fs.existsSync(dbPath)) {
    quarantined = path.join(qDir, `powerpilot_${timestamp()}.db`);
    fs.renameSync(dbPath, quarantined);
}
for (const suffix of ['-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch (_) { /* yut */ }
}
fs.renameSync(tmp, dbPath);
```

**Etki:**

- Canlı DB karantinaya taşındıktan sonra `fs.renameSync(tmp, dbPath)` başarısız olursa (disk dolu, AV kilidi, izin hatası), `dbPath` **yok** olur ve canlı DB karantinada kalır.
- `finally` yalnızca `tmp`'yi siler; karantinadaki DB'yi geri taşımaz.
- Uygulama bir sonraki açılışta veri bulamaz; kullanıcı manuel kurtarma yapmak zorunda kalır.

**Öneri:**

- Rename'i try/catch'e alın; hata durumunda karantinadaki DB'yi geri taşıyın.
- Yeni DB'yi rename sonrası `quickCheck` ile doğrulayın; başarısızsa rollback yapın.
- Mümkünse `rename` yerine kopyala-doğrula-değiştir akışı kullanın; karantinayı başarılı açılışa kadar saklayın.

```js
try {
    fs.renameSync(tmp, dbPath);
    if (quickCheck(dbPath) !== 'ok') throw new Error('Restored DB quick_check failed');
} catch (err) {
    try { fs.rmSync(dbPath, { force: true }); } catch (_) {}
    if (quarantined) {
        try { fs.renameSync(quarantined, dbPath); } catch (_) {}
    }
    throw err;
}
```

**Regresyon testi:** `fs.renameSync(tmp, dbPath)` throw edecek şekilde mock'la; eski DB `dbPath`'te geri gelmeli; `quickCheck` fail → rollback.

---

#### Y-10 — MigrateV2 hedef DB varsa içeriğini doğrulamadan JSON'u "migrated" işaretliyor

**Konum:** `src/main/storage/MigrateV2.js:208-230`

**Mevcut kod:**

```js
// MigrateV2.js:208
if (!storedChecksum || storedChecksum.value !== contentChecksum(data)) {
    throw new StorageError('Migrasyon içerik checksum doğrulaması başarısız.', 'MIGRATION_CHECKSUM_MISMATCH');
}
if (tmpDb.quickCheck() !== 'ok') {
    throw new StorageError('Migrasyon sonrası quick_check başarısız.', 'MIGRATION_DB_CORRUPT');
}
tmpDb.close();
tmpDb = null;

// 4) Hedef yoksa rename. Varsa (yarım kalmış önceki deneme) doğrula ve koru.
if (fs.existsSync(target)) {
    // Önceki çalışma DB'yi yazmış olabilir; geçici kopyayı at, JSON'u işaretle.
    try { fs.rmSync(tmpPath, { force: true }); } catch (_) { /* yut */ }
} else {
    fs.renameSync(tmpPath, target);
}
...
const migratedPath = `${source}${MIGRATION_MARK}`;
const sanitized = sanitizeLegacyData(parsed);
fs.writeFileSync(migratedPath, JSON.stringify(sanitized, null, 2), ...);
fs.unlinkSync(source);
```

**Etki:**

- Hedef DB varsa (önceki yarım deneme, boş dosya, farklı bir DB) **hiç doğrulanmıyor**.
- Geçici, doğrulanmış DB siliniyor; JSON `.migrated` olarak işaretleniyor ve kaynak siliniyor.
- Hedef bozuksa/eksikse veri kaybı kalıcı olur; kaynak JSON da silindiği için geri dönüş yok.

**Öneri:**

- Hedef varsa `quickCheck(target)` çalıştırın; tablo sayıları/checksum'ı beklenenle karşılaştırın.
- Eşleşmiyorsa migrasyonu durdurun; JSON'u ve yedeği koruyun; `.migrated` yazmayın.
- Geçici DB'yi hedef doğrulanana kadar silmeyin.
- `.migrated` işaretini atomik yazın (temp + rename).

```js
if (fs.existsSync(target)) {
    const check = quickCheck(target);
    const targetCounts = readCounts(target);
    if (check !== 'ok' || !sameCounts(targetCounts, counts)) {
        throw new StorageError('Mevcut hedef DB migrasyonla uyuşmuyor.', 'MIGRATION_TARGET_MISMATCH');
    }
    fs.rmSync(tmpPath, { force: true });
} else {
    fs.renameSync(tmpPath, target);
}
```

**Regresyon testi:** Hedef boş/bozuk DB ile migrasyon → hata, kaynak JSON korunmalı, `.migrated` oluşmamalı.

---

#### Y-11 — 1 saniyelik scheduler tick'inde senkron dosya sistemi taraması

**Konum:** `src/main/services/TaskManager.js:221-229,243-293`, `src/main/services/SmartFinishEngine.js:166-189`, `src/main/services/conditions/DirectoryIdle.js:37-95`

**Mevcut kod:**

```js
// TaskManager.js:221
this.loopInterval = schedule(() => {
    this.evaluateTasks();
}, 1000);
```

```js
// TaskManager.js:275
const verdict = this.smartFinishEngine.evaluateTask(task);
```

`SmartFinishEngine` `DIRECTORY_IDLE` için senkron tarama yapıyor:

```js
// SmartFinishEngine.js:169
const scan = scanDirectory(dirPath, {
    maxDepth: Number.isInteger(cond.maxDepth) ? cond.maxDepth : 2,
    maxEntries: Number.isInteger(cond.maxEntries) ? cond.maxEntries : 5000
});
```

```js
// DirectoryIdle.js:45
rootStat = fs.lstatSync(dirPath);
...
entries = fs.readdirSync(dir, { withFileTypes: true });
...
st = fs.lstatSync(full);
```

**Etki:**

- Her saniye, izlenen her klasör için ana süreçte senkron `lstatSync`/`readdirSync` çalışır.
- 5000 girdiye kadar, 3 saniye timeout'a kadar sürebilir; bu süre boyunca Electron main thread bloke olur.
- UI donar, IPC gecikir, zamanlayıcı tick'leri kaçar, tray güncellenmez.
- `persistChanges()` de aynı tick içinde senkron SQLite yazımı yapabilir; etki katlanır.

**Öneri:**

- Dosya/klasör taramalarını worker thread'e veya `fs.promises` tabanlı asenkron taramaya taşıyın.
- Görev başına minimum tarama aralığı (örn. 5-10 sn) ve tek-uçuş (in-flight) koruması ekleyin.
- `evaluateTasks` asenkron olsun; uzun tarama scheduler tick'ini bloke etmesin.
- `persistChanges()` yalnızca gerçekten değişen alanlar için çağrılsın; progress mesajı her tick yazılmasın.

```js
// worker veya async
const scan = await scanDirectoryAsync(dirPath, { maxDepth, maxEntries, timeoutMs });
```

```js
// throttle
if (task._lastDirScanAt && Date.now() - task._lastDirScanAt < 5000) return;
task._lastDirScanAt = Date.now();
```

**Regresyon testi:** 5000 dosyalı klasörde UI yanıt verebilir kalmalı; scheduler tick'leri kaçmamalı; aynı klasör için eşzamanlı tarama olmamalı.

---

### 3.3 Orta

#### O-01 — `startTimer` tanımsız; `restoreActiveState` her zaman hata yutuyor

**Konum:** `src/renderer/app.js:2893-2927`, `app.js:526-560`, `app.js:3411`

**Mevcut kod:**

```js
// app.js:2920
const remaining = Math.max(1, Math.round((timer.trigger.targetTime - Date.now()) / 1000));
selectedAction = timer.action;
currentActionString = getActionString(timer.action);
startTimer(remaining);          // ← tanımlı değil
switchView('nav-active');       // ← exception nedeniyle çalışmaz
} catch (_) { /* geri yükleme başarısızsa boş durum gösterilir */ }
```

Dosyada yalnızca `startTimerTo` var:

```js
// app.js:526
function startTimerTo(targetTime, totalSeconds) { ... }
```

Ayrıca aynı işi yapan ikinci bir restore yolu var:

```js
// app.js:545
async function restoreActiveTimer() { ... startTimerTo(next.trigger.targetTime, total); }
// app.js:3411
restoreActiveTimer();
```

**Etki:**

- Pencere yenilendiğinde aktif zamanlayıcı varsa `restoreActiveState` `ReferenceError` fırlatır; `catch` yutar.
- `switchView('nav-active')` çalışmaz; kullanıcı aktif sayaç yerine varsayılan görünümde kalır.
- `restoreActiveTimer()` daha sonra sayacı kısmen geri yükler; bu yüzden hata bazen maskelenir, bazen görünür.
- Boş `catch` tanılama bilgisini yok eder.

**Öneri:**

- `startTimer(remaining)` yerine `startTimerTo(timer.trigger.targetTime, remaining)` kullanın.
- `switchView` çağrısını `try` dışına alın veya hata durumunda da çalıştırın.
- İki restore yolunu tek fonksiyonda birleştirin; `restoreActiveState` yalnızca uyarı/claim durumunu, `restoreActiveTimer` yalnızca sayacı yönetsin.
- `catch` içinde `console.error`/IPC log kullanın.

```js
startTimerTo(timer.trigger.targetTime, remaining);
switchView('nav-active');
...
} catch (err) {
    console.error('[restoreActiveState]', err);
}
```

**Regresyon testi:** Aktif timer varken renderer reload → `nav-active` görünümü açılmalı, sayaç doğru saniyeden devam etmeli; konsolda `ReferenceError` olmamalı.

---

#### O-02 — `warningConfig.durationSeconds: 0` 30 saniyeye dönüşüyor

**Konum:** `src/main/services/WarningManager.js:27`, `src/main/ipc/validate.js:221-224`

**Mevcut kod:**

```js
// WarningManager.js:27
const warningSec = (task.warningConfig && task.warningConfig.durationSeconds) || 30;
```

Şema 0'a izin veriyor:

```js
// validate.js:221
if (wc !== undefined && wc.durationSeconds !== undefined) {
    if (!Number.isInteger(wc.durationSeconds) || wc.durationSeconds < 0 || wc.durationSeconds > 3600) {
        return fail('warning durationSeconds 0..3600 aralığında olmalı.', 'INVALID_WARNING');
    }
}
```

**Etki:**

- Kullanıcı 0 girerek "uyarısız/hemen" beklerken 30 saniye bekler.
- `enabled:false` ise uyarı hiç açılmaz; iki ayar arasında tutarsız semantik oluşur.
- Testlerde 0 değeri yanlış beklentiye yol açar.

**Öneri:**

- `||` yerine açık `Number.isInteger` kontrolü kullanın.
- 0'ı "hemen icra" olarak destekleyin veya şemada minimum 1 yapın; ürün kararını netleştirin.

```js
const raw = task.warningConfig && task.warningConfig.durationSeconds;
const warningSec = Number.isInteger(raw) ? Math.min(Math.max(raw, 0), 3600) : 30;
```

**Regresyon testi:** `durationSeconds:0` → 0 saniye (veya şema reddi); `undefined` → 30; `3601` → red.

---

#### O-03 — SmartFinish dosya/klasör örnekleri yalnızca `taskId` ile anahtarlı

**Konum:** `src/main/services/SmartFinishEngine.js:18-19,151-155,187-189`

**Mevcut kod:**

```js
// SmartFinishEngine.js:18
this.fileSamples = new Map();       // taskId -> { signature, since }
this.directorySamples = new Map();  // taskId -> { signature, since }
...
// SmartFinishEngine.js:151
const sample = this.fileSamples.get(taskId);
if (!sample || sample.signature !== signature) {
    this.fileSamples.set(taskId, { signature, since: now });
    return { satisfied: false, message: `Dosya izleniyor (0/${requiredSec} sn)` };
}
...
// SmartFinishEngine.js:187
const sample = this.directorySamples.get(taskId);
```

**Etki:**

- Bir görevde iki `file_stable` koşulu varsa (AND), iki farklı dosyanın imzası aynı `taskId` anahtarını paylaşır.
- Koşul A örneği yazar; koşul B farklı imza gördüğü için sıfırlar; hiçbiri `stableSeconds` boyunca sabit kalamaz.
- Aynı durum birden fazla `directory_idle` koşulu için geçerlidir.
- İptal/tamamlanan görevlerin anahtarları temizlenmez; uzun oturumda map büyür.

**Öneri:**

- Anahtarı `taskId + condition index/path` yapın.
- Görev iptal/tamamlandığında `clearTask(taskId)` çağırın.

```js
const sampleKey = `${task.id}:${cond.filePath || cond.dirPath || index}`;
const sample = this.fileSamples.get(sampleKey);
...
clearTask(taskId) {
    for (const key of this.fileSamples.keys()) if (key.startsWith(`${taskId}:`)) this.fileSamples.delete(key);
    ...
}
```

**Regresyon testi:** Aynı görevde iki farklı dosya koşulu → ikisi de kendi `stableSeconds`'ında sağlanmalı; görev iptalinde map temizlenmeli.

---

#### O-04 — Idempotency anahtarı method/path/body kapsamıyor; uçlar arası replay

**Konum:** `src/main/services/LocalApiService.js:386-395,750-758`

**Mevcut kod:**

```js
// LocalApiService.js:386
const idemKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
if (idemKey) {
    this.pruneIdempotency();
    const cached = this.idempotencyCache.get(idemKey);
    if (cached) return this.sendJson(res, cached.status, cached.body);
    ...
    res.__ppIdempotencyKey = idemKey;
}
```

```js
// LocalApiService.js:750
sendJson(res, statusCode, data) {
    if (res && res.__ppIdempotencyKey && statusCode < 500) {
        this.idempotencyCache.set(res.__ppIdempotencyKey, {
            status: statusCode,
            body: data,
            expiresAt: Date.now() + IDEMPOTENCY_TTL_MS
        });
    }
    ...
}
```

**Etki:**

- Aynı `Idempotency-Key` farklı endpoint'lerde kullanılırsa önceki yanıt döner. Örneğin `POST /power/lock` yanıtı, `POST /power/shutdown` isteğine dönebilir; shutdown hiç çalışmaz ama istemci başarılı sanır.
- 4xx yanıtları da cache'lenir; istemci gövdeyi düzeltip aynı anahtarla tekrar denerse eski hatayı alır.
- Farklı gövdeyle aynı anahtar, yanlış görevin sonucunu döndürebilir.

**Öneri:**

- Cache anahtarını `${method}:${path}:${bodyHash}:${idemKey}` yapın.
- Aynı anahtar farklı fingerprint ile gelirse `409 IDEMPOTENCY_CONFLICT` dönün.
- Yalnızca başarılı (2xx) veya kalıcı iş kararlarını cache'leyin; 4xx'leri cache'lemeyin.

```js
const bodyHash = crypto.createHash('sha256').update(bodyRaw).digest('hex');
const cacheKey = `${method}:${pathname}:${bodyHash}:${idemKey}`;
```

**Regresyon testi:** Aynı anahtar farklı endpoint → çakışma/ayrı sonuç; aynı endpoint farklı gövde → 409; 400 yanıtı cache'lenmemeli.

---

#### O-05 — Local API `new URL` Host header ile korumasız

**Konum:** `src/main/services/LocalApiService.js:375`

**Mevcut kod:**

```js
// LocalApiService.js:375
const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
const pathname = parsedUrl.pathname;
const method = req.method.toUpperCase();
```

**Etki:**

- `Host` başlığı bozuk/geçersizse (`[`, boşluk, kontrol karakteri) `new URL` `TypeError` fırlatır.
- Bu satır `route()` try/catch'inin dışında; `handleRequest` içinde de dış try yok. Node HTTP server'ında uncaught exception → istek yanıtsız kalır veya Electron sürecinde hata üretir.
- Kimliği doğrulanmış bir istemci basit bir Host header ile hizmeti bozabilir.

**Öneri:**

- Sabit bir base kullanın: `new URL(req.url, 'http://127.0.0.1')`; Host header'ı URL oluşturmada kullanmayın.
- Yine de try/catch ile 400 dönün.
- Host header'ı ayrıca doğrulayın (beklenen host/port).

```js
let parsedUrl;
try {
    parsedUrl = new URL(req.url, 'http://127.0.0.1');
} catch (_) {
    return this.sendJson(res, 400, { error: 'Invalid request URL', code: 'INVALID_URL' });
}
```

**Regresyon testi:** `Host: [` ile istek → 400, süreç çökmemeli, istek asılı kalmamalı.

---

#### O-06 — `/api/v1/audit` tam denetim günlüğünü viewer rolüne veriyor

**Konum:** `src/main/services/LocalApiService.js:741-745`, `src/console/ConsoleServer.js:898-900`

**Mevcut kod:**

```js
// LocalApiService.js:741
// GET /api/v1/audit — denetim günlüğü + zincir doğrulama (viewer+).
if (method === 'GET' && path === '/api/v1/audit') {
    const audit = this.deps.audit || new AuditLog(this.storage);
    return this.sendJson(res, 200, { audit: audit.load(), verify: audit.verify() });
}
```

```js
// ConsoleServer.js:898
if (method === 'GET' && p === '/api/v1/audit') {
    if (!this.needPermission(res, role, 'audit.read')) return;
    return this.sendJson(res, 200, { audit: this.audit.load(), verify: this.audit.verify() });
}
```

**Etki:**

- Local API'de `requiredRole(GET) = viewer`; viewer anahtarı tüm audit kayıtlarını (actor, action, target, detail) okuyabilir.
- Kayıtlar görev adları, dosya yolları, kullanıcı adları gibi hassas bilgiler içerebilir.
- Büyük log tek yanıtta dönülür; bellek/yanıt boyutu sorunu.
- Console tarafında `audit.read` izni varsa viewer okuyabilir; izin matrisi ayrıca incelenmeli.

**Öneri:**

- Audit okumayı admin veya ayrı `audit.read` yetkisine bağlayın; viewer'a yalnızca özet/doğrulama sonucu verin.
- `limit`/`offset`/`since` ile sayfalayın; tam log için ayrı export yetkisi tanımlayın.
- `detail` alanını role göre redakte edin.

```js
if (role !== 'admin') {
    return this.sendJson(res, 403, { error: 'Audit access requires admin', code: 'FORBIDDEN' });
}
const { limit = 100, offset = 0 } = parsePagination(...);
return this.sendJson(res, 200, { audit: audit.load({ limit, offset }), verify: audit.verify() });
```

**Regresyon testi:** viewer anahtarı `/audit` → 403; admin → sayfalı sonuç; `verify` ayrı ve hafif endpoint.

---

#### O-07 — `hasProcessConditions` terminal görevleri de sayıyor; süreç polling'i sonsuza kadar sürüyor

**Konum:** `src/main/services/TaskManager.js:792-798`, `main.js:400`

**Mevcut kod:**

```js
// TaskManager.js:792
hasProcessConditions() {
    return this.tasks.some((task) => {
        if (!task || task.enabled === false) return false;
        const conds = (task.conditionGroup && task.conditionGroup.conditions) || [];
        return conds.some((c) => c && c.type === CONDITION_TYPE.PROCESS_RUNNING);
    });
}
```

```js
// main.js:400
needsProcessList: () => !!(taskManager && taskManager.hasProcessConditions())
```

**Etki:**

- Tamamlanan/iptal edilen/başarısız görevler `enabled:true` kaldığı için `hasProcessConditions()` true döner.
- `MetricCollector` sonsuza kadar `ps-list`/`fastlist` çalıştırır; CPU, bellek ve pil tüketimi artar.
- Görev listesi büyüdükçe bu maliyet kalıcılaşır.

**Öneri:**

- Yalnızca aktif durumları sayın: `SCHEDULED`, `MONITORING`, `WAITING`, `WARNING`.
- Tamamlanan görevleri `enabled:false` yapın veya `this.tasks`'tan çıkarın.
- Testte terminal görev sonrası `hasProcessConditions()` false olmalı.

```js
hasProcessConditions() {
    const active = new Set([
        TASK_STATUS.SCHEDULED,
        TASK_STATUS.MONITORING,
        TASK_STATUS.WAITING,
        TASK_STATUS.WARNING
    ]);
    return this.tasks.some((task) => {
        if (!task || task.enabled === false || !active.has(task.status)) return false;
        const conds = (task.conditionGroup && task.conditionGroup.conditions) || [];
        return conds.some((c) => c && c.type === CONDITION_TYPE.PROCESS_RUNNING);
    });
}
```

**Regresyon testi:** PROCESS_RUNNING koşullu görev tamamlandıktan sonra `hasProcessConditions()` false; `ps-list` çağrısı durmalı.

---

#### O-08 — Audit append her yazımda tüm tabloyu okuyor; retention yok

**Konum:** `src/main/services/StorageService.js:1253-1266,1311-1322`, `src/main/services/AuditLog.js:16,85-90`

**Mevcut kod:**

```js
// StorageService.js:1311
this.db.write(() => {
    const last = this.db.prepare('SELECT seq, record_hmac FROM audit_log ORDER BY seq DESC LIMIT 1').get();
    ...
    this.db.prepare('INSERT INTO audit_log(...) VALUES (...)').run(...);
    ...
});
this.data.auditLog = this.getAuditLog();   // ← tüm tablo
```

```js
// StorageService.js:1253
getAuditLog() {
    if (!this.db) return Array.isArray(this.data.auditLog) ? this.data.auditLog : [];
    return this.db.prepare('SELECT * FROM audit_log ORDER BY seq ASC').all().map(...);
}
```

**Etki:**

- Her audit kaydında O(n) okuma ve nesne dönüşümü yapılır; log büyüdükçe append maliyeti artar.
- SQLite yolunda satır sınırı/retention yok; DB süresiz büyür.
- `getAuditLog()` tüm kayıtları belleğe alır; `/audit` ve startup doğrulaması yavaşlar.
- `AuditLog.MAX_RECORDS` yalnızca legacy JSON yolunda uygulanır.

**Öneri:**

- Append sonrası yalnızca yeni kaydı bellekteki tampona ekleyin; tüm tabloyu yeniden okumayın.
- Periyodik retention uygulayın (örn. 90 gün / 100k satır); eski kayıtları arşiv checkpoint'ine taşıyın.
- `getAuditLog({ limit, offset })` ile sayfalama yapın.
- `MAX_RECORDS`'u SQLite yolunda da uygulayın.

```js
this.data.auditLog.push(rec);
const MAX = 100000;
if (this.data.auditLog.length > MAX) {
    this.data.auditLog.splice(0, this.data.auditLog.length - MAX);
}
```

**Regresyon testi:** 10k kayıt sonrası append süresi sabit kalmalı; retention eski kayıtları silmeli; `/audit` sayfalı dönmeli.

---

#### O-09 — Veritabanı kilidi stale-lock TOCTOU

**Konum:** `src/main/storage/Database.js:110-125`

**Mevcut kod:**

```js
// Database.js:110
static acquireLock(dir, pid = process.pid) {
    const lockPath = path.join(dir, 'storage.lock');
    try {
        if (fs.existsSync(lockPath)) {
            const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            if (parsed && Number.isInteger(parsed.pid) && parsed.pid !== pid) {
                try {
                    process.kill(parsed.pid, 0);
                    throw new StorageError(...);
                } catch (err) {
                    if (err && err.code === 'STORAGE_LOCKED') throw err;
                    // Süreç yok: eski kilidi temizle.
                }
            }
        }
        fs.writeFileSync(lockPath, JSON.stringify({ pid, startedAt: ... }), { encoding: 'utf8', mode: 0o600 });
```

**Etki:**

- İki süreç aynı anda `existsSync` false görüp `writeFileSync` ile kilidi yazabilir; son yazan kazanır.
- Stale lock temizliği ile yazma arasında atomiklik yok; iki süreç aynı eski kilidi temizleyip ikisi de sahip olabilir.
- Aynı userData dizinine iki uygulama örneği bağlanırsa DB yazımları çakışabilir.

**Öneri:**

- `fs.openSync(lockPath, 'wx')` ile atomik oluşturma kullanın.
- Stale lock'u silmeden önce PID'in ölü olduğunu doğrulayın; lock dosyasını tombstone'a rename ederek compare-and-swap yapın.
- Kilit alınamazsa kısa retry + net hata verin.

```js
try {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeSync(fd, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
    fs.closeSync(fd);
} catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // mevcut kilidi oku, PID ölüyse atomik olarak devral
}
```

**Regresyon testi:** İki eşzamanlı `acquireLock` → yalnızca biri başarılı; stale PID → devralma; canlı PID → `STORAGE_LOCKED`.

---

#### O-10 — `rotatedFrom` hash'e dahil edilmiyor; doğrulama dışı

**Konum:** `src/main/services/AuditLog.js:18-21,85-90,98-118`

**Mevcut kod:**

```js
// AuditLog.js:18
function hashOf(rec) {
    const slim = { seq: rec.seq, ts: rec.ts, actor: rec.actor, action: rec.action, target: rec.target, detail: rec.detail, prevHash: rec.prevHash };
    return crypto.createHash('sha256').update(JSON.stringify(slim), 'utf8').digest('hex');
}
...
// AuditLog.js:85
let rotatedFrom = null;
while (list.length > MAX_RECORDS) {
    const dropped = list.shift();
    rotatedFrom = dropped.hash;
}
if (rotatedFrom) list[0].rotatedFrom = rotatedFrom;
```

**Etki:**

- `rotatedFrom` hash hesaplandıktan sonra ekleniyor; hash kapsamı dışında.
- `verify()` yalnızca `rotatedFrom`'un varlığına bakıyor; değerini doğrulamıyor.
- Bir saldırgan `rotatedFrom`'u değiştirse zincir doğrulaması yine geçer; rotasyon geçmişi güvenilmez.

**Öneri:**

- `rotatedFrom`'u hash girdisine ekleyin; alanı hash'ten önce set edin.
- `verify()` içinde `rotatedFrom`'un beklenen kayıtla eşleştiğini kontrol edin.
- Mümkünse rotasyon metadata'sını ayrı HMAC'li checkpoint'e yazın.

```js
function hashOf(rec) {
    const slim = {
        seq: rec.seq, ts: rec.ts, actor: rec.actor, action: rec.action,
        target: rec.target, detail: rec.detail, prevHash: rec.prevHash,
        rotatedFrom: rec.rotatedFrom || null
    };
    return crypto.createHash('sha256').update(JSON.stringify(slim), 'utf8').digest('hex');
}
```

**Regresyon testi:** `rotatedFrom` değiştirildiğinde `verify()` `TAMPERED` dönmeli.

---

#### O-11 — PIN iptalinde enerji/dil değişiklikleri sunucuda kalıyor

**Konum:** `src/renderer/app.js:3256-3273`

**Mevcut kod:**

```js
// app.js:3256
const res = await window.electronAPI.saveSettings({ language, ...energy.patch });
if (res && res.success === false) {
    await restoreForm();
    showToast(res.message || t('errorModeSave'), 'error');
    return;
}
if (typeof loadEnergyCard === 'function') loadEnergyCard();

// WP-10.T4: otonomi modu güvenlik bayrağıdır; PIN'li yoldan yazılır.
const sec = await saveSecuritySettings({ autonomyMode }, commit, {
    quiet: true,
    onCancel: restoreForm
});
if (sec && sec.success === false && !sec.pendingPin) { ... }
if (sec && sec.pendingPin) return;
```

**Etki:**

- Dil ve enerji ayarları PIN'li otonomi ayarından **önce** kaydediliyor.
- Kullanıcı PIN istemini iptal ederse form eski değerlere dönüyor (`restoreForm`), ancak `saveSettings` ile yazılan dil/enerji değişiklikleri sunucuda kalıyor.
- UI ile SQLite arasında split-brain oluşur; bir sonraki açılışta kullanıcı beklemediği ayarları görür.

**Öneri:**

- Tüm ayarları tek atomik işlemde, PIN doğrulamasından **sonra** kaydedin.
- `saveSecuritySettings` başarılı olmadan `saveSettings` çağırmayın.
- İptal durumunda sunucu tarafını da geri alın (rollback IPC'si veya tek transaction).

```js
const sec = await saveSecuritySettings({ autonomyMode }, null, { quiet: true, onCancel: restoreForm });
if (!sec || sec.success === false || sec.pendingPin) return;
const res = await window.electronAPI.saveSettings({ language, ...energy.patch });
...
```

**Regresyon testi:** PIN iptal → dil/enerji SQLite'ta değişmemeli; UI eski değerde kalmalı.

---

#### O-12 — localStorage ve SQLite iki ayrı doğruluk kaynağı; autonomy/language drift

**Konum:** `src/renderer/app.js:3-10,74,800-806,2060-2062,3212-3217,3243-3248`, `main.js:72-74,686`

**Mevcut kod:**

```js
// app.js:4
let lang = localStorage.getItem('language');
...
// app.js:800
const autostart = localStorage.getItem('autostart') === 'true';
const voice = localStorage.getItem('voice') === 'true';
const theme = localStorage.getItem('theme') || 'dark';
const notifications = localStorage.getItem('notifications') !== 'false';
const autonomyMode = localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic';
```

```js
// app.js:2061
try { if (localStorage.getItem('autonomyMode') === 'full') mode = 'full'; } catch (_) {}
```

```js
// main.js:72
function currentLanguage() {
    return (storageService && storageService.getSettings().language) || 'tr';
}
```

**Etki:**

- `autonomyMode` hem SQLite'ta hem localStorage'da; tray SQLite'ı, AI görevi localStorage'ı okuyor.
- Tray'den mod değiştirilirse renderer'ın localStorage'ı güncellenmiyor; AI görevi eski modu damgalıyor.
- Dil değişikliği iki yerde tutuluyor; biri başarısız olursa tray dili ile UI dili ayrışıyor.
- `theme`, `autostart`, `voice`, `notifications` yalnızca localStorage'da; başka bir profil/cihazda taşınmıyor.

**Öneri:**

- Güvenlikle ilgili (`autonomyMode`, `language`) ve kalıcı olması gereken ayarlar için **tek kaynak** SQLite olsun.
- Renderer `getSettings()` ile okusun; `saveSettings()` ile yazsın; `settings-changed` olayıyla canlı güncellensin.
- localStorage'ı yalnızca UI tercihleri (tema gibi) için kullanın veya tamamen kaldırın.
- Mevcut localStorage değerlerini tek seferlik migrasyonla SQLite'a taşıyın.

```js
const settings = await window.electronAPI.getSettings();
const autonomyMode = settings.autonomyMode === 'full' ? 'full' : 'classic';
```

**Regresyon testi:** Tray'den mod değiştir → renderer ve AI görevi aynı modu görmeli; dil değiştir → tray ve UI aynı dili kullanmalı.

---

#### O-13 — Denetim kaydı yazılamazsa güvenlik ayarı yine de uygulanıyor

**Konum:** `main.js:1329-1331`, `src/main/services/StorageService.js:1301-1303`

**Mevcut kod:**

```js
// main.js:1329
} catch (auditErr) {
    log.warn('[IPC] ayar denetim kaydı yazılamadı:', auditErr && auditErr.message);
}
```

`StorageService.appendAudit` anahtar yoksa throw ediyor:

```js
// StorageService.js:1301
if (!this.hasAuditKey()) {
    throw Object.assign(new Error('Audit HMAC anahtarı yok; yeni audit yazılmadı.'), { code: 'AUDIT_KEY_MISSING' });
}
```

**Etki:**

- Güvenlik ayarı değişikliği (ör. `autonomyMode`, `localApiEnabled`) audit yazılamasa bile uygulanıyor.
- Denetim zinciri eksik kalıyor; sonradan "kim neyi değiştirdi" sorusu yanıtlanamıyor.
- Özellikle `security-settings-update` ve `generate-api-key` gibi kritik işlemlerde fail-open davranış.

**Öneri:**

- Güvenlikle ilgili mutasyonlarda audit yazımı başarısızsa işlemi geri alın ve hata dönün.
- Audit'i ayrı, dayanıklı bir kuyruğa yazın; anahtar yoksa işlemi reddedin.
- En azından `security-settings-update` için audit'i zorunlu kılın.

```js
try {
    auditLog.append({ actor: 'local_user', action: 'settings_security_updated', ... });
} catch (err) {
    storageService.updateSettings(before);
    return { success: false, code: 'AUDIT_WRITE_FAILED', message: t('errorSettingsApplyReverted') };
}
```

**Regresyon testi:** Audit anahtarı yokken `security-settings-update` → işlem reddedilmeli, ayar değişmemeli.

---

### 3.4 Düşük

#### D-01 — i18n sözlüğü yüklenemezse `timeFormatDays.substring` çöküyor

**Konum:** `src/renderer/app.js:650,711`, `src/renderer/i18n.js:46-49`

**Mevcut kod:**

```js
// app.js:650
days.textContent = `${d}${dict.timeFormatDays.substring(0, 1)}`;
...
// app.js:711
if (d > 0) formattedCountdown += `${d}${dict.timeFormatDays.substring(0,1)} `;
```

`i18n.js` hata durumunda boş sözlük bırakıyor:

```js
// i18n.js:46
const ready = load(currentLanguage).catch((err) => {
    console.error('[i18n] locale yüklenemedi:', err && err.message);
    translations = {};
    return null;
});
```

**Etki:**

- Locale dosyası yüklenemezse `dict.timeFormatDays` `undefined` olur; gün > 0 olduğunda `substring` `TypeError` fırlatır.
- `timerTick` her saniye hata verir; sayaç görünümü bozulur.
- Hata `setInterval` içinde yakalanmadığı için konsol kirlenir.

**Öneri:**

- Güvenli fallback kullanın: `const daysLabel = typeof dict.timeFormatDays === 'string' ? dict.timeFormatDays : 'd';`
- `t('timeFormatDays')` zaten fallback olarak key döndürüyor; doğrudan `dict` erişimi yerine `t()` kullanın.
- Locale yükleme hatasında kullanıcıya görünür bir uyarı gösterin.

```js
const daysLabel = typeof dict.timeFormatDays === 'string' ? dict.timeFormatDays : 'd';
days.textContent = `${d}${daysLabel.substring(0, 1)}`;
```

**Regresyon testi:** `translations={}` iken 1 günlük timer render edilmeli; hata fırlatmamalı.

---

#### D-02 — Hardcoded 1.28 GB model hedefi

**Konum:** `src/renderer/app.js:2518,2820`

**Mevcut kod:**

```js
// app.js:2518
const total = 1374389534; // ~1.28GB hedef (bilgi amaçlı)
...
// app.js:2820
const total = 1374389534;
```

**Etki:**

- Model boyutu/indirme hedefi modele göre değişir; sabit değer yanlış ilerleme/yüzde gösterir.
- Sihirli sayı bakımı zorlaştırır; model değişince unutulur.

**Öneri:**

- Boyutu model metadata'sından (`ai-status`, model manifest) alın.
- Sabiti adlandırın ve tek yerden yönetin; yoksa `0`/bilinmiyor gösterin.

```js
const total = Number(model && model.sizeBytes) || 0;
```

**Regresyon testi:** Farklı model boyutlarında ilerleme yüzdesi doğru olmalı; bilinmeyen boyutta çökme olmamalı.

---

#### D-03 — Mini pencere tooltip'leri hardcoded Türkçe

**Konum:** `src/mini.html:22,26,30`

**Mevcut kod:**

```html
<button id="btn-hide" title="Arka Plana Gönder" ...>
<button id="btn-restore" title="Uygulamayı Aç" ...>
<button id="btn-cancel" title="Zamanlayıcıyı İptal Et" ...>
```

**Etki:**

- Uygulama 17 dili destekliyor; mini pencere tooltip'leri yalnızca Türkçe.
- Ekran okuyucu/erişilebilirlik metinleri yanlış dilde.
- `mini.js` i18n desteği varsa bile bu başlıklar güncellenmiyor.

**Öneri:**

- `data-i18n-title` anahtarları ekleyin; `applyLanguage` içinde `title` özniteliğini güncelleyin.
- Çeviri anahtarlarını locale dosyalarına ekleyin.
- Alternatif olarak `aria-label` + görünür metin kullanın.

```html
<button id="btn-hide" data-i18n-title="miniHide" title="...">
```

```js
document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key]) el.title = dict[key];
});
```

**Regresyon testi:** Dil değişince mini pencere tooltip'leri güncellenmeli.

---

#### D-04 — `onWarningEnded` listener'ları temizlenmiyor

**Konum:** `preload.js:90-95`

**Mevcut kod:**

```js
onWarningEnded: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('warning-cancelled', h);
    ipcRenderer.on('warning-snoozed', h);
    ipcRenderer.on('warning-finished', h);
},
```

**Etki:**

- Her çağrıda 3 listener eklenir; geri dönüş fonksiyonu yok.
- Test/HMR veya yeniden başlatma akışında callback'ler birikir; aynı olay birden fazla kez işlenir.
- Renderer yeniden yüklenirse eski listener'lar sızabilir.

**Öneri:**

- Abonelikten çıkma fonksiyonu döndürün.
- `ipcRenderer.removeListener` ile üç kanalı da temizleyin.
- `once` semantiği gerekiyorsa ayrı API sunun.

```js
onWarningEnded: (callback) => {
    const h = (_, data) => callback(data);
    const channels = ['warning-cancelled', 'warning-snoozed', 'warning-finished'];
    channels.forEach((c) => ipcRenderer.on(c, h));
    return () => channels.forEach((c) => ipcRenderer.removeListener(c, h));
},
```

**Regresyon testi:** Aboneliği iptal ettikten sonra olay callback'i çağırmamalı.

---

#### D-05 — `silentMode` ayarı ölü; hiçbir tüketici okumuyor

**Konum:** `src/main/services/models/AutomationTask.js:166`, `AutomationTask.js:217`, `OrderExecutor.js:73`

**Mevcut kod:**

```js
// AutomationTask.js:163
this.warningConfig = data.warningConfig || {
    enabled: true,
    durationSeconds: 30,
    silentMode: false
};
```

Kod tabanında `silentMode` yalnızca model/şema tanımlarında geçiyor; `WarningManager` veya renderer bu alanı okumuyor.

**Etki:**

- Kullanıcıya "sessiz mod" sunuluyorsa da hiçbir etkisi yok.
- API/şema sözleşmesinde ölü alan; yanlış beklenti oluşturuyor.
- Testlerde anlamsız kapsam.

**Öneri:**

- Sessiz modu uygulayın (ses/bildirim bastırma, banner korunur) veya alanı şema/model/UI'dan kaldırın.
- Kaldırıyorsanız geriye dönük uyumluluk için migrasyonda yok sayın.

```js
// WarningManager veya renderer
if (!task.warningConfig.silentMode) uiBeep();
```

**Regresyon testi:** `silentMode:true` → ses çıkmamalı, banner görünmeli; kaldırıldıysa alan yok sayılmalı.

---

#### D-06 — `StorageService.getSettings()` mutable iç nesne döndürüyor

**Konum:** `src/main/services/StorageService.js:992-994`

**Mevcut kod:**

```js
getSettings() {
    return this.data.settings;
}
```

**Etki:**

- Çağıranlar dönen nesneyi değiştirirse `data.settings` de değişir; `_persist` çağrılmadığı için disk ile bellek ayrışır.
- `main.js` ve servisler bu nesneyi paylaşıyor; yan etkili mutasyon riski.
- Testlerde izole state zorlaşır.

**Öneri:**

- Shallow/deep clone döndürün; iç içe diziler için `structuredClone` kullanın.
- Tercihen `getSetting(key)` ve `getSettingsSnapshot()` gibi açık API'ler sunun.

```js
getSettings() {
    return structuredClone(this.data.settings);
}
```

**Regresyon testi:** Dönen nesne mutate edildiğinde `storageService.getSettings()` değişmemeli; disk persist tetiklenmemeli.

---

#### D-07 — Görev listesi 5 saniyede bir, in-flight guard olmadan yenileniyor

**Konum:** `src/renderer/app.js:1228-1245,1388-1391`

**Mevcut kod:**

```js
// app.js:1388
tasksRefreshTimer = setInterval(() => {
    const view = document.getElementById('view-tasks');
    if (view && !view.classList.contains('hidden')) loadTasks();
}, 5000);
```

`loadTasks` içinde eşzamanlılık kontrolü yok:

```js
// app.js:1228
async function loadTasks() {
    ...
    const all = await window.electronAPI.getTasks();
    ...
}
```

**Etki:**

- IPC yavaşsa veya çok görev varsa istekler üst üste binabilir; eski yanıt yeni yanıtı ezebilir.
- Her 5 saniyede DOM yeniden çizilir; gereksiz CPU.
- Sekme gizliyken de interval çalışır (view hidden kontrolü var ama görünür olduğunda yoğun).

**Öneri:**

- `tasksLoading` bayrağı ekleyin.
- Sonuç hash'i değişmediyse render etmeyin.
- Görünürlük API'si ile gizliyken durdurun; 10 saniyeye çıkarın.

```js
let tasksLoading = false;
async function loadTasks() {
    if (tasksLoading) return;
    tasksLoading = true;
    try { ... } finally { tasksLoading = false; }
}
```

**Regresyon testi:** Yavaş `getTasks` mock'unda aynı anda tek istek olmalı; gizli görünümde polling durmalı.

---

#### D-08 — Legacy JSON ve SQLite audit yolları farklı garantiler sunuyor

**Konum:** `src/main/services/AuditLog.js:16,85-90,98-118`, `src/main/services/StorageService.js:1253-1328`

**Mevcut kod:**

```js
// AuditLog.js:16
const MAX_RECORDS = 5000;
...
// AuditLog.js:85
while (list.length > MAX_RECORDS) { ... }
```

SQLite yolunda `MAX_RECORDS` uygulanmıyor; `StorageService.appendAudit` sınırsız büyüyor.

**Etki:**

- HMAC anahtarı varsa SQLite, yoksa legacy JSON yolu kullanılıyor; iki farklı doğrulama/retention davranışı.
- Legacy yolda `rotatedFrom` hash dışı; SQLite yolunda retention yok.
- Bakım ve test yükü ikiye katlanıyor.

**Öneri:**

- Tek bir audit implementasyonunda birleşin (tercihen SQLite + HMAC).
- Legacy yolu yalnızca migrasyon için tutun; yeni yazımları SQLite'a yönlendirin.
- Retention ve doğrulama politikasını tek yerde tanımlayın.

```js
// Tek yol: storage.appendAudit(...) + storage.verifyAuditChain()
```

**Regresyon testi:** Her iki yolda da aynı retention/verify davranışı; legacy veri migrasyonu kayıpsız.

---

## 4. Performans

### 4.1 Özet

Performans bulgularının çoğu **main thread blokajı** ve **gereksiz tekrar** kaynaklı. En kritik olan Y-11: 1 saniyelik scheduler tick'i içinde senkron dosya sistemi taraması. Bu, UI donmasına ve zamanlayıcı kaçırmasına yol açar.

| ID | Öncelik | Bulgu | Etki |
|---|---|---|---|
| Y-11 | Yüksek | 1 sn tick'te senkron `readdirSync`/`lstatSync` | 3 sn'ye kadar main thread blokajı |
| O-07 | Orta | Terminal görevler için sürekli `ps-list` polling | Kalıcı CPU/pil tüketimi |
| O-08 | Orta | Her audit append'te tüm tabloyu okuma | O(n) yazma maliyeti, sınırsız büyüme |
| D-07 | Düşük | 5 sn'lik görev listesi polling'i | Gereksiz IPC/DOM churn |

### 4.2 Ek Gözlemler

- `TaskManager.evaluateTasks()` her tick'te `task.status` değiştiğinde `persistChanges()` çağırıyor (`TaskManager.js:277-280`). Bu, senkron `better-sqlite3` yazımıdır; progress mesajı gibi geçici alanlar için yazım yapılmamalı.
- `SmartFinishEngine` her koşul için ayrı örnek map'i tutuyor; klasör taraması 3 sn timeout'a kadar sürebiliyor. Tarama sonucu 5-10 sn cache'lenmeli.
- `StorageService.getAuditLog()` tüm kayıtları döndürüyor; `/api/v1/audit` ve startup doğrulaması büyük loglarda yavaşlar. Sayfalama ve retention şart.
- `main.js` tray güncellemesi 5 sn'de bir menü imzası hesaplıyor; `JSON.stringify` küçük ama `getActiveTasks()` + `getNextTask()` her seferinde tüm görevleri tarıyor. Görev sayısı büyükse indeksli yapı düşünülmeli.
- `MetricCollector.sampleCpu()` ve `sampleIdle()` hafif; asıl maliyet `sampleProcesses()` ve dosya taramaları. `needsProcessList` doğru çalışırsa boşta maliyet düşük kalır (O-07 düzeltilirse).

### 4.3 Öneri

1. Koşul değerlendirmesini async hale getirin; FS taramalarını worker'a taşıyın.
2. Görev başına tarama throttle'ı ve tek-uçuş koruması ekleyin.
3. `persistChanges()`'i yalnızca kalıcı alanlar değiştiğinde çağırın; progress mesajını bellekte tutun.
4. Audit için ring buffer + periyodik retention kullanın.
5. Renderer polling'ini görünürlük ve in-flight guard ile sınırlayın.

---

## 5. Kod Temizliği

### 5.1 Ölü ve Yanıltıcı Politikalar

`src/main/services/EnterprisePolicies.js:108-115` içinde tanımlanan bazı politika bayrakları hiç uygulanmıyor:

```js
// EnterprisePolicies.js:108
mode: 'classic',
safetyPolicy: {
    checkUserActivity: true,
    checkProtectedApps: true,
    checkFullscreen: true,
    checkSystemLoad: true,
    forceCloseApps: false,
    remoteApprovalRequired: false
}
```

`SafetyPolicyEngine` yalnızca `checkProtectedApps`, `checkSystemLoad`, `checkFullscreen` okuyor. `checkUserActivity`, `forceCloseApps`, `remoteApprovalRequired` **ölü**. Bu, kurumsal politika yapılandırmasında yanlış güvenlik beklentisi oluşturur. Ya uygulanmalı ya da şemadan kaldırılmalı.

### 5.2 Duplike Zamanlayıcı Geri Yükleme

`app.js:2893-2927` (`restoreActiveState`) ve `app.js:545-560` (`restoreActiveTimer`) aynı işi iki farklı yoldan yapıyor; biri tanımsız `startTimer` çağırıyor (O-01). Tek bir fonksiyon, tek bir kaynak.

### 5.3 Sihirli Sayılar ve Hardcoded Metinler

- `1374389534` iki yerde (`app.js:2518,2820`) — D-02.
- Mini pencere Türkçe tooltip'leri (`mini.html:22,26,30`) — D-03.
- Tray/menü metinleri `t()` ile çevriliyor; iyi. Ancak bazı hata mesajları doğrudan Türkçe (ör. `main.js:237`, `main.js:691`). Bunlar kullanıcıya görünmüyorsa kabul edilebilir; görünüyorsa i18n'e taşınmalı.

### 5.4 Ölü `silentMode`

`AutomationTask.js:166` ve `OrderExecutor.js:73`'te tanımlı; hiçbir tüketici yok — D-05.

### 5.5 Mutable Settings

`StorageService.getSettings()` iç nesneyi döndürüyor — D-06. Savunmacı kopya, beklenmeyen mutasyonları engeller.

### 5.6 Preload Listener Temizliği

`preload.js:90-95` üç listener ekliyor, temizleme API'si yok — D-04.

### 5.7 İki Audit Implementasyonu

Legacy `AuditLog` (JSON, `MAX_RECORDS`) ve `StorageService` (SQLite, HMAC) paralel yaşıyor — D-08. Yeni özellikler SQLite'a yazılmalı; legacy yalnızca migrasyon için kalmalı.

### 5.8 "Geriye Uyumlu Admin" Yorumu

`LocalApiService.js:486` yorumu (`ctx yoksa admin (geriye uyumlu)`) güvenlik açısından kaldırılmalı. Bilinmeyen bağlam admin değil, **red** olmalı (Y-06).

---

## 6. Veri Bütünlüğü ve Hata Yönetimi

### 6.1 Özet

| ID | Öncelik | Bulgu | Veri etkisi |
|---|---|---|---|
| Y-08 | Yüksek | Metrik hataları yutuluyor | Sahte idle → yanlış kapatma |
| Y-09 | Yüksek | Backup restore rollback yok | Canlı DB kaybı |
| Y-10 | Yüksek | MigrateV2 hedef doğrulaması yok | JSON + DB veri kaybı |
| O-08 | Orta | Audit retention yok | Sınırsız büyüme, yavaşlama |
| O-09 | Orta | DB kilidi TOCTOU | Eşzamanlı yazım/bozulma |
| O-10 | Orta | `rotatedFrom` doğrulanmıyor | Audit geçmişi güvenilmez |
| O-11 | Orta | PIN iptalinde kısmi commit | UI/DB split-brain |
| O-12 | Orta | localStorage/SQLite ayrımı | Ayar drift'i |
| O-13 | Orta | Audit yazımı fail-open | Denetim boşluğu |

### 6.2 Hata Yönetimi Deseni

Kod tabanında iki tutarsız desen var:

1. **Fail-closed (doğru):** `SafetyPolicyEngine` protected apps ve power requests kontrolleri hata durumunda `deny` dönüyor (`SafetyPolicyEngine.js:54-68,84-93`).
2. **Fail-open (riskli):** Aynı dosyada kill-switch, muafiyet, bakım penceresi ve sunucu profili hataları yutuluyor (`43-51,126-128,139-141,158-160`); `ConsoleClient` kill-switch yazım hatası yutuluyor (`220-231`); audit yazım hataları yalnızca loglanıyor (`main.js:1329-1331`).

Yıkıcı güç eylemleri için **tüm güvenlik kontrolleri fail-closed** olmalı. "Ayar okunamadı" bir güvenlik olayıdır; eylemi durdurmalıdır. Yalnızca kullanıcıya zarar vermeyen tanılama/telemetri yolları fail-open kalabilir.

### 6.3 Rollback ve Atomiklik

- `applySettingsPatch` rollback'i `catch (_) {}` ile best-effort (`main.js:1351`). Rollback başarısız olursa kısmi ayar kalır. Kritik ayarlarda rollback sonucu kontrol edilmeli ve hata kullanıcıya bildirilmeli.
- `Backup.restoreDatabase` ve `MigrateV2` için "önce doğrula, sonra değiştir, hata varsa geri al" akışı uygulanmalı.
- `StorageService.appendAudit` ile ayar güncellemesi tek transaction'da değil; audit başarısızsa ayar geri alınmalı (O-13).

### 6.4 Öneri

1. Yıkıcı eylemlerde güvenlik okumalarını fail-closed yapın.
2. Backup/migration için rollback + post-check zorunlu kılın.
3. Ayar + audit yazımını tek transaction'a alın.
4. Audit retention ve sayfalamayı standartlaştırın.
5. DB kilidini atomik `wx` ile alın.
6. Tek ayar kaynağı kullanın; localStorage'ı güvenlik ayarlarından çıkarın.

---

## 7. İyileştirmeler

### E-01 — Merkezi Güvenlik Middleware'i

Tüm mutasyon IPC'leri (`create-task`, `cancel-task`, `snooze-task`, `set-cancel-pin`, `clear-cancel-pin`, `security-settings-update`, `generate-api-key`, `save-template`, `warning-confirm`) tek bir `requireAuth(action, payload)` katmanından geçsin. Bu katman:

- PIN gereksinimini,
- TOCTOU/expected taskId kontrolünü,
- audit zorunluluğunu,
- rate limit'i

tek yerde uygular. Tray gibi alternatif giriş noktaları da aynı katmanı çağırır.

### E-02 — Katı Görev Şeması

`validateTaskData` için JSON Schema benzeri beyaz liste tanımlayın:

- Zorunlu: `action`.
- İstemci tarafından yazılabilir: `name`, `trigger`, `conditionGroup`, `warningConfig`, `safetyPolicy`, `snoozeConfig`, `recurrence`, `chain`.
- Sunucu tarafından atanan: `id`, `source`, `mode`, `status`, `enabled`, `createdAt`, `policyId`, `consoleOrderId`, `requiresMaintenanceWindow`.
- `warningConfig` ve `safetyPolicy` için iç içe şema + varsayılan merge.
- `action` yoksa **red**, varsayılan shutdown yok.

### E-03 — Uyarı Durum Makinesi

`WarningManager` için açık bir durum makinesi:

- `idle → warning(taskId, epoch) → confirmed/cancelled/snoozed/expired`.
- Her uyarıya monoton `epoch` verin; confirm/cancel/snooze yalnızca eşleşen `taskId+epoch` ile uygulanır.
- Renderer her olayda `taskId+epoch` taşır; eski tıklamalar `WARNING_CHANGED` alır.
- `warning-confirm` sonucu `success:false` ise banner gizlenmez.

### E-04 — Fail-Closed Politika ve Metrik Sağlığı

- `SafetyPolicyEngine` storage/politika okuma hatasında yıkıcı eylemleri reddetsin.
- `MetricCollector` her sampler için `ok/stale/error` taşısın; stale metrikle koşul değerlendirilmesin.
- `SmartFinishEngine` "bilinmiyor" durumunu `satisfied:false` olarak ele alsın.
- Sağlık durumu UI'da gösterilsin ("ağ ölçülemiyor" gibi).

### E-05 — Tek Ayar Kaynağı

- SQLite `settings` tek doğruluk kaynağı olsun.
- Renderer `getSettings`/`saveSettings` + `settings-changed` event'i kullansın.
- localStorage yalnızca UI tercihleri (tema) için kalsın veya kaldırılsın.
- `autonomyMode`, `language`, `autostart` gibi alanlar için tek seferlik migrasyon yazın.

### E-06 — Audit Retention, Sayfalama ve Export

- Varsayılan retention: 90 gün veya 100k kayıt.
- Günlük/aylık checkpoint dosyaları; HMAC zinciri korunur.
- `/api/v1/audit?limit=&offset=&since=` ile sayfalama.
- Admin-only export; viewer'a yalnızca özet.
- `rotatedFrom` hash kapsamına alınsın.

### E-07 — Asenkron Koşul Motoru

- FS taramalarını worker thread'e taşıyın.
- Görev başına `lastScanAt` ve `scanInFlight` ile throttle.
- Scheduler tick'ini 1 sn'de tutun ama ağır işleri kuyruğa alın.
- `persistChanges` için debounce/batch.

### E-08 — Konsol Ajan Kimliği

- Her ajan için ayrı anahtar + `agentId` bağı.
- Global `CONSOLE_AGENT_KEY` kaldırılsın veya yalnızca kayıt için kullanılsın.
- Heartbeat/receipt'te kimlik yalnızca anahtardan gelsin; body `agentId` yalnızca doğrulama için kullanılsın.
- Kill-switch heartbeat'i pause'dan bağımsız çalışsın.

### E-09 — Test Matrisi

Aşağıdaki senaryolar otomatik testlere eklenmeli:

- PIN set/clear/change: eski PIN olmadan red.
- `warning-confirm` stale `taskId` → `WARNING_CHANGED`.
- `create-task` `{}`, `enabled:false`, `mode:'full'`, `source:'local_api'`, kısmi `safetyPolicy` → red/güvenli varsayılan.
- `getActiveTasks` `EXECUTING` içerir; close guard çalışır.
- `_schedulerFired` sonraki recurrence'da temiz.
- `SafetyPolicyEngine` storage throw → deny.
- `MetricCollector` network/disk throw → stale.
- `Backup.restoreDatabase` rename fail → rollback.
- `MigrateV2` target exists/bozuk → hata, kaynak korunur.
- `LocalApiService` role missing → 403; idempotency cross-endpoint → conflict.
- `ConsoleServer` global agent key → 403; kill-switch persist fail → orders red.
- i18n locale missing → timer render çökmez.

### E-10 — Yayın Kapıları

- `npm test`
- `npm run test:security`
- `npm run test:smoke`
- `npm run test:e2e`
- `npm run release:check`
- Yeni güvenlik regresyon testleri CI'da zorunlu.
- `npm run locales:check` ve `npm run models:verify` de pipeline'da çalışmalı.

---

## 8. Test Boşlukları ve Yayın Kontrol Listesi

> Bu bölümdeki testler bu denetim sırasında **çalıştırılmamıştır**; denetim statik kod incelemesidir. Aşağıdaki maddeler, bulguların regresyona dönüşmemesi için zorunlu kabul kriterleridir.

### 8.1 Mevcut Test Altyapısı

| Komut | Kapsam | Değerlendirme |
|---|---|---|
| `npm test` | Vitest; `tests/main`, `tests/renderer` birim ve sözleşme testleri | Geniş yüzey var; kritik iş akışlarında boşluklar mevcut |
| `npm run test:security` | Statik güvenlik kontrolleri | PIN/TOCTOU/fail-open davranışını çalıştırmıyor |
| `npm run test:smoke` | Electron sürüm/başlatma duman testi | Yalnızca temel çalışabilirlik |
| `npm run test:e2e` | Playwright; i18n, güvenlik, zamanlayıcı, paketlenmiş uygulama | Gerçek IPC/OS senaryoları sınırlı |
| `npm run release:check` | Sürüm ve paketleme ön kontrolleri | `--strict-git` ile temiz ağaç doğrulanabilir |
| `npm run locales:check` | Çeviri anahtarı parity | Eksik interpolasyon/çalışma zamanı hatalarını yakalamaz |
| `npm run models:verify` | Model bütünlüğü | Kapsam dışı |

Mevcut `tests/main/warning-pin.test.mjs` yalnızca `warning-cancel` ve `warning-snooze` için PIN/TOCTOU sözleşmesini doğruluyor. **`warning-confirm`, PIN değiştirme/silme ve tray otonomi yolları test edilmiyor.**

### 8.2 Kritik ve Yüksek Bulgular İçin Zorunlu Regresyon Testleri

| ID | Test senaryosu | Beklenen sonuç |
|---|---|---|
| K-01 | PIN varken `set-cancel-pin` eski PIN olmadan; `clear-cancel-pin` PIN olmadan | `PIN_REQUIRED` / `PIN_WRONG`; PIN ve korumalı işlemler değişmez |
| K-01 | Doğru eski PIN ile değiştirme; ilk PIN belirleme | Atomik güncelleme, audit kaydı, eski PIN geçersiz |
| K-02 | `warning-confirm` eski/eksik `taskId` ile; PIN beklerken uyarı değişir | `WARNING_CHANGED`; yeni görev onaylanmaz |
| K-02 | `success:false` yanıtı; çift tıklama | Banner gizlenmez; ikinci istek idempotent |
| K-03 | `{}`, `action` yok, `mode:'full'`, `source:'local_api'`, `warningConfig:{enabled:false}`, `status:'completed'` | Şema reddi veya güvenli varsayılan; sessiz `shutdown` yok |
| K-03 | Kısmi `safetyPolicy` ve bilinmeyen alanlar | Eksik politikalar güvenli varsayılanla tamamlanır; bilinmeyen alan reddedilir |
| K-04 | Tray'den otonomi modu değişimi; PIN yok/yanlış | Yazma reddedilir; mod değişmez |
| K-04 | `autonomyMode` ile görev `mode` etkileşimi | Mod görev davranışına uygulanır; çelişki reddedilir |
| Y-01 | `get-settings` çağrısı | API anahtarları, webhook secret, parola alanları maskeli/çıkarılmış |
| Y-02 | Tray "Duraklat"/"Çıkış" PIN'siz; PIN beklerken görev değişir | İşlem reddedilir; TOCTOU'da yeni görev etkilenmez |
| Y-03 | `executing` durumundaki görevle pencere kapatma/çıkış | Kapatma engellenir veya kullanıcıya açık onay sorulur |
| Y-04 | Aynı görev iki recurrence; uyarı sonrası tekrar | `_schedulerFired` temizlenir; sonraki tetikleme çalışır |
| Y-05 | Storage/DB okuma ve yazma hataları enjekte edilir | Yıkıcı eylem `deny`; fail-open yok |
| Y-05 | Kısmi `safetyPolicy` | Eksik kontrol `deny` kabul edilir |
| Y-06 | Local API'de rol yok/geçersiz | `403`; `admin` varsayılmaz |
| Y-07 | Konsol global anahtarıyla farklı `agentId`; kill-switch yazma hatası | Kimlik taklidi `403`; kill-switch hatasında siparişler reddedilir |
| Y-08 | CPU/disk/ağ örnekleme hatası | Metrik `stale`; idle kararı verilmez |
| Y-09 | Restore sırasında rename/kopyalama hatası | Canlı DB geri yüklenir; kısmi dosya kalmaz |
| Y-10 | Hedef DB mevcut/bozuk; migration yarıda kesilir | Migration durur; kaynak JSON korunur; "migrated" işaretlenmez |
| Y-11 | 1.000 klasörlü koşul ile tick süresi | Tick bütçesi aşılmaz; UI yanıt verir |

### 8.3 Kapsam ve Altyapı Boşlukları

1. **Kaynak-metin sözleşme testleri yetersiz.** `warning-pin.test.mjs` gibi testler `main.js` metnini okuyup `await` arıyor; handler'ın gerçek Electron IPC üzerinden çalıştığını doğrulamıyor. Handler'lar ayrı modüllere çıkarılıp doğrudan çağrılmalı.
2. **Hata enjeksiyonu yok.** `fs.rename`, SQLite `busy`, ağ timeout ve şifre çözme hataları için ortak fault-injection yardımcıları yok; Y-05, Y-08, Y-09, Y-10 bu yüzden görünmez.
3. **TOCTOU testleri tek pencereyle sınırlı.** PIN prompt'u açıkken uyarı/görev değişimi, ikinci renderer veya tray eylemiyle birlikte test edilmiyor.
4. **Migration matrisi eksik.** Legacy fixture'lar var, ancak "hedef zaten var", "hedef bozuk", "disk dolu" ve "yarıda kesilme" senaryoları yok.
5. **API sözleşmesi testleri dar.** Idempotency'nin uçlar arası replay'i, eksik rol, `Host` header manipülasyonu ve audit sayfalaması kapsanmıyor.
6. **Windows entegrasyon matrisi sınırlı.** Uyku/hazırda bekleme, pil azalması, tam ekran, oturum kilidi ve UPS senaryoları gerçek donanım/OS oturumunda doğrulanmalı.
7. **Paketleme doğrulaması genişletilmeli.** `test:e2e/packaged` var; buna ASAR bütünlüğü, imza, CSP'nin paketli sürümde etkinliği ve `contextIsolation` kontrolü eklenmeli.
8. **Kapsam eşiği yok.** Kritik modüller (`validate.js`, `TaskManager.js`, `SafetyPolicyEngine.js`, `Backup.js`) için satır/dal kapsamı eşiği tanımlanmalı; aksi halde yeni dallar testsiz kalır.

### 8.4 Yayın Kontrol Listesi

#### A. Blocker'lar (yayın öncesi zorunlu)

- [ ] **K-01:** Eski PIN doğrulaması `set-cancel-pin` ve `clear-cancel-pin`'e eklendi; audit kaydı üretiliyor.
- [ ] **K-02:** `warning-confirm` `taskId` taşıyor; PIN/await sonrası uyarı kimliği yeniden doğrulanıyor; renderer yalnızca `success:true` üzerine banner'ı gizliyor.
- [ ] **K-03:** `validateTaskData` `action`, `mode`, `source`, `warningConfig`, `status` ve tüm `safetyPolicy` alanlarını whitelist ile doğruluyor; eksik alanlar güvenli varsayılana düşüyor.
- [ ] **K-04:** Tray otonomi yazımı PIN kapısından geçiyor; `autonomyMode` görev davranışına tek kaynaktan uygulanıyor; çelişkili `mode` reddediliyor.

#### B. Güvenlik ve Yetkilendirme

- [ ] **Y-01:** `get-settings` ve tüm renderer yanıtları `SecretStore` tarafından maskeleniyor; sırlar yalnızca main process'te kalıyor.
- [ ] **Y-02:** Tray duraklat/çıkış ve mini pencere eylemleri PIN korumalı iptal akışını kullanıyor.
- [ ] **Y-05:** Yıkıcı eylem yollarında tüm güvenlik okumaları fail-closed; hata durumunda `deny`.
- [ ] **Y-06:** Local API'de rol yok/geçersizse `403`; "geriye uyumlu admin" kaldırıldı.
- [ ] **Y-07:** Konsol ajanları ayrı anahtar/kimlikle doğrulanıyor; kill-switch hatasında siparişler reddediliyor; pause senkronizasyonu kilitlenmiyor.
- [ ] **O-13:** Ayar değişikliği ile audit yazımı tek transaction'da; audit başarısızsa ayar geri alınıyor.

#### C. Veri Bütünlüğü

- [ ] **Y-08:** Metrik örnekleme hataları `stale` olarak işaretleniyor; sahte idle ile kapatma engelleniyor.
- [ ] **Y-09:** Backup restore öncesi doğrulama, hata durumunda rollback ve post-check uygulanıyor.
- [ ] **Y-10:** Migration hedef DB'yi doğruluyor; hata durumunda kaynak korunuyor ve "migrated" yazılmıyor.
- [ ] **O-08:** Audit retention ve sayfalama etkin; sınırsız büyüme yok.
- [ ] **O-09:** DB kilidi atomik `wx` ile alınıyor; stale-lock TOCTOU kaldırıldı.
- [ ] **O-10:** `rotatedFrom` hash zincirine dahil; eski kayıtlar doğrulanabiliyor.
- [ ] **O-11:** PIN iptalinde enerji/dil değişiklikleri tek işlemde geri alınıyor veya hiç uygulanmıyor.
- [ ] **O-12:** Ayar kaynağı tek; localStorage güvenlik ayarlarından çıkarıldı.

#### D. Güvenilirlik ve Performans

- [ ] **Y-03:** `getActiveTasks()` `executing` durumunu içeriyor; kapatma/çıkış guard'ı in-flight eylemi koruyor.
- [ ] **Y-04:** `_schedulerFired` her tetikleme sonrası ve recurrence geçişinde sıfırlanıyor.
- [ ] **Y-11:** FS taramaları worker/async kuyruğa taşındı; tick başına bütçe ve throttle var.
- [ ] **O-07:** `hasProcessConditions` yalnızca terminal olmayan görevleri sayıyor; süreç polling'i sonlanıyor.
- [ ] **O-01:** `startTimer` tanımı tek; restore yolu gerçek hata durumunda logluyor ve kullanıcıya bildiriyor.
- [ ] **O-02:** `durationSeconds: 0` sıfır olarak korunuyor veya şema tarafından reddediliyor; sessiz 30 sn yok.
- [ ] **O-03:** SmartFinish örnekleri `taskId + kaynak kimliği` ile anahtarlanıyor.
- [ ] **O-04:** Idempotency anahtarı method + path + gövde hash'ini kapsıyor; uçlar arası replay reddediliyor.
- [ ] **O-05:** Local API `Host`/`Origin` doğrulaması `new URL` öncesi yapılıyor.
- [ ] **O-06:** `/api/v1/audit` viewer için özet/sayfalı; tam log yalnızca admin.

#### E. Test, CI ve Paketleme

- [ ] `npm test` temiz geçiyor; yeni regresyon testleri eklendi.
- [ ] `npm run test:security` ve `npm run test:e2e` temiz.
- [ ] `npm run release:check` (ve yayın dalında `release:rc`) temiz ağaçla geçiyor.
- [ ] `npm run locales:check` ve `npm run models:verify` pipeline'da zorunlu.
- [ ] Windows 10/11, uyku/hazırda bekleme, pil, tam ekran ve UPS senaryoları elle doğrulandı.
- [ ] Paketlenmiş uygulamada imza, ASAR bütünlüğü, CSP ve `contextIsolation` doğrulandı.
- [ ] SBOM ve lisans denetimi (`npm run sbom`, `npm run audit:licenses`) tamamlandı.
- [ ] Sürüm notlarında güvenlik düzeltmeleri ve bilinen sınırlamalar yer alıyor.

### 8.5 Önerilen Düzeltme Sırası ve Kaba Efor

| Aşama | Kapsam | Tahmini efor (1 geliştirici) | Çıkış kriteri |
|---|---|---|---|
| **P0** | K-01, K-02, K-03, K-04 + regresyon testleri | 2–4 gün | Dört blocker kapalı; testler yeşil |
| **P1** | Y-01, Y-02, Y-05, Y-06, Y-07; O-13 | 3–5 gün | Yetkilendirme ve fail-closed matrisi tamam |
| **P2** | Y-03, Y-04, Y-08, Y-09, Y-10 | 3–5 gün | Veri bütünlüğü ve kapatma güvenliği |
| **P3** | Y-11, O-07, O-08, O-09 | 3–5 gün | Performans bütçesi ve DB dayanıklılığı |
| **P4** | Kalan Orta/Düşük bulgular | 2–4 gün | Temizlik, i18n ve gözlemlenebilirlik |

> Süreler kaba planlama tahminidir; kod incelemesine dayanır, geliştirme ve doğrulama süresini içerir. Paralel çalışma ile kısaltılabilir.

### 8.6 Yeniden Denetim Kabul Kriterleri

1. Dört Kritik ve on bir Yüksek bulgunun tamamı kapalı; her biri için otomatik regresyon testi mevcut.
2. Yıkıcı güç eylemlerinde fail-open kalmadı; hata enjeksiyonu testleri bunu kanıtlıyor.
3. PIN korumalı tüm yollar (set/clear/change, cancel, snooze, confirm, tray, mini pencere) tek bir test matrisinden geçiyor.
4. Backup/migration için rollback ve post-check testleri yeşil; felaket senaryosu tatbikatı yapıldı.
5. `npm test`, `test:security`, `test:e2e`, `release:check`, `locales:check`, `models:verify` temiz.
6. Paketlenmiş Windows sürümünde imza, CSP, `contextIsolation` ve ASAR doğrulandı.
7. Çalışma ağacı temiz; sürüm etiketi ve değişiklik günlüğü yayınla uyumlu.

---

## 9. Sonuç

Power Pilot 1.1.0'ın mimari temelleri iyi tasarlanmış: renderer izolasyonu, CSP, `execFile` tabanlı güç komutları, Argon2id PIN türetimi, HMAC'li audit zinciri ve TLS doğrulaması korunmaya değer. Ancak bu kontrollerin **iş akışlarına bağlanması** tutarlı değil. PIN koruması birden fazla yoldan atlatılabiliyor, görev doğrulaması güvenlik açısından kritik alanları denetlemiyor ve bazı güvenlik kararları hata durumunda açık kalıyor.

**Yayın kararı: RED (yayın engeli).** Dört Kritik bulgu tek başına yayın engelidir:

- **K-01** en düşük eforla en yüksek etkiyi veren düzeltmedir: mevcut PIN doğrulaması olmadan PIN sıfırlanabiliyor.
- **K-02** kullanıcının onayladığını sandığı görev ile gerçekte onaylanan görevin farklı olmasına yol açabilir.
- **K-03** `{}` gibi bir çağrının sessizce `shutdown` görevine dönüşmesi, en tehlikeli senaryodur.
- **K-04** otonomi modunun PIN'siz değiştirilmesi ve görev davranışına uygulanmaması, güvenlik beklentisi ile gerçek davranış arasında fark yaratıyor.

P0 ve P1 tamamlanmadan sürüm adayı üretilmemelidir. P0 sonrası yeniden denetimde yalnızca Kritiklerin kapandığı doğrulanabilir; Yüksek bulgular (özellikle Y-01, Y-02, Y-05, Y-06, Y-07) kapatılmadan geniş kullanıma açılmamalıdır. Tüm kabul kriterleri sağlandığında Power Pilot 1.1.0, güvenlik ve veri bütünlüğü açısından yayınlanabilir seviyeye gelebilir.

> **Denetim yöntemi notu:** Bu rapor statik kod incelemesine dayanır; uygulama çalıştırılmamış, testler yürütülmemiş ve Windows'a özgü OS davranışları ampirik olarak doğrulanmamıştır. Dinamik doğrulama, yukarıdaki test matrisi ve yayın kontrol listesiyle yapılmalıdır.
