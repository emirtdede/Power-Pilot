# Power Pilot — Kapsamlı QA ve Mimari Denetim Raporu

**Proje:** Power Pilot (`Vellium.PowerPilot`)  
**Sürüm:** 1.1.0  
**Denetim tarihi:** 28 Ekim 2026  
**Kapsam:** `main.js`, `preload.js`, `src/main/**`, `src/renderer/**`, `src/console/**`, `src/agent/**`  
**Yöntem:** Statik kod incelemesi, çapraz dosya veri akışı analizi, IPC/HTTP sınırları, hata yolları ve kaynak yaşam döngüsü denetimi. Uygulama kodu değiştirilmedi; yalnızca bu rapor oluşturuldu.  
**Kapsam dışı:** Yapılandırma dosyaları, üçüncü taraf bağımlılıkların kaynak kodu, paketleme/imzalama altyapısı. `package.json` yalnızca teknoloji yığınını doğrulamak için okundu.

> **Önemli teknoloji uyumsuzluğu notu:** Proje **Next.js/React değildir**. `package.json` içinde `react`, `react-dom`, `next` bağımlılığı yoktur; renderer **vanilla JavaScript + DOM** ile yazılmıştır. Uygulama **Electron 43** ana süreç + sandboxed renderer (`app://powerpilot`) mimarisidir. Bu nedenle React Hooks kuralları, `useEffect` bağımlılık dizileri, hydration, Server/Client Component sınırları, RSC ve Next.js cache semantiği bu kod tabanında **uygulanamaz (N/A)**. Rapor, bu kategorilerin vanilla karşılıklarını — `setInterval`/`setTimeout`, DOM listener'ları, IPC listener'ları, EventEmitter abonelikleri ve native kaynaklar — denetler.

---

## 1. Yönetici Özeti

Toplam **50** doğrulanmış bulgu raporlanmıştır:

| Önem | Adet | Ana tema |
|---|---:|---|
| **Kritik** | 2 | Çözülmüş sırların renderer'a sızması; paylaşılan ajan anahtarıyla ajanlar arası kimlik taklidi |
| **Yüksek** | 10 | Aktif sayaç geri yükleme hatası; tekrarlayan görevlerin süresi dolması; kill-switch'in heartbeat'i durdurması; PIN bypass; sessiz kalıcılaştırma hataları; audit checkpoint'in ana thread'i kilitlemesi; konsol çökmeleri; audit O(n²) hot path; sipariş idempotency açığı |
| **Orta** | 22 | Local API başlatma/limit/kimlik doğrulama sorunları; sınırsız audit/kuyruk tabloları; Smart Finish örnek çakışmaları; metrik/webhook/safety gecikmeleri; envanter ve cihaz profilleyicinin ağır alt süreç yükü; i18n ve ayar kaydetme hataları |
| **Düşük** | 16 | UI/localStorage ayrışması; toast birikmesi; mini pencere korumaları; kullanılmayan 419 KB vendor dosyası; log/ayar sabitleri; eski audit rotasyonu; kapanış yaşam döngüsü; model indirme kenar durumları |

### En kritik 5 risk

1. **K-01:** `get-settings` IPC'si renderer'a çözülmüş `consoleAgentKey`, TLS özel anahtarları, PFX parolaları ve `cancelPinHash`/`cancelPinSalt` veriyor. Renderer yalnızca `localApiKeyMasked` alanına ihtiyaç duyuyor.
2. **K-02:** `CONSOLE_AGENT_KEY` tüm ajanlar için ortak; `identity.agentId` boş olduğunda heartbeat ve receipt uçları `body.agentId`'ye güveniyor. Bir ajan anahtarıyla başka ajan adına heartbeat/receipt üretilebilir.
3. **Y-03 + Y-04:** Headless kill-switch heartbeat'i durduruyor; manuel `console-sync` ise `disabled` yanıtına rağmen kuyruğu boşaltıyor. Uzaktan yeniden açma ve durdurma semantiği çelişiyor.
4. **Y-06:** Ayar/görev kalıcılaştırma hataları yutuluyor; arayüz `success:true` dönerken veri diskte olmayabiliyor.
5. **Y-07 + Y-09:** Audit checkpoint her 60 saniyede senkron PowerShell çalıştırıyor; her audit yazımı tüm audit tablosunu yeniden okuyor. Uzun ömürlü kurumsal kurulumda ana thread kilitlenir.

### Öncelik sırası

1. K-01, K-02 (hemen; sürüm blokajı)
2. Y-01, Y-02, Y-03, Y-04, Y-05 (güvenlik/güvenilirlik)
3. Y-06, Y-07, Y-08, Y-09, Y-10 (veri bütünlüğü, çökme, ölçeklenebilirlik)
4. Orta bulgular; özellikle O-01, O-04, O-07, O-08, O-19, O-20
5. Düşük bulgular ve bakım temizliği

---

## 2. Kritik Bulgular

### K-01 — `get-settings` çözülmüş sırları ve PIN özetini renderer'a veriyor

**Konum:** `main.js:1259`, `src/main/services/StorageService.js:992-994`, `src/main/security/SecretStore.js:332-344`  
**Önem:** Kritik (güvenlik)

`get-settings` doğrudan `storageService.getSettings()` döndürüyor. SecretStore, açılışta `consoleAgentKey`, `localApiKeyPem`, `localApiPfxPassphrase`, `consoleClientKeyPem`, `consoleClientPfxPassphrase` alanlarını **çözülmüş düz metin** olarak `data.settings` içine hydrate ediyor. Aynı nesnede `cancelPinHash` ve `cancelPinSalt` da bulunuyor. Renderer'ın bu alanlara ihtiyacı yok; `app.js:1796-1797` yalnızca `localApiKeyMasked` kullanıyor.

**Etki:**
- Renderer'da herhangi bir XSS/compromize bağımlılık/devtools erişimi tüm kurumsal ajan anahtarını, TLS özel anahtarını ve PFX parolasını ele geçirir.
- `cancelPinHash`/`cancelPinSalt` sızarsa PIN çevrimdışı kırılabilir; PIN, iptal ve güvenlik ayarları kapısını koruyor.
- Sırlar her `getSettings()` çağrısında IPC üzerinden kopyalanır; gereksiz veri minimizasyonu ihlali.

**Düzeltme:** Renderer'a yalnızca whitelist edilmiş, redakte edilmiş DTO verin. `preload.js:60` da ham `getSettings` yerine `getPublicSettings` sunmalı.

```js
// main.js
const RENDERER_SECRET_FIELDS = new Set([
    'consoleAgentKey', 'localApiKeyPem', 'localApiPfxPassphrase',
    'consoleClientKeyPem', 'consoleClientPfxPassphrase',
    'cancelPinHash', 'cancelPinSalt'
]);

function toRendererSettings(settings) {
    const out = {};
    for (const [key, value] of Object.entries(settings || {})) {
        if (RENDERER_SECRET_FIELDS.has(key)) continue;
        out[key] = value;
    }
    out.secretPresence = {};
    for (const key of RENDERER_SECRET_FIELDS) {
        out.secretPresence[key] = typeof settings[key] === 'string' && settings[key].length > 0;
    }
    return out;
}

ipcHandle('get-settings', () => toRendererSettings(storageService.getSettings()));
```

```js
// preload.js
getSettings: () => ipcRenderer.invoke('get-settings'), // artık redakte DTO döner
```

Ek olarak `SecretStore.hydrateData` sonrası `storageService.data.settings` içinde düz metin sır tutulması yerine, yalnızca ihtiyaç anında `secretStore.getSecret()` kullanılması hedeflenmeli. En azından renderer sınırında redaksiyon zorunlu.

---

### K-02 — Paylaşılan ajan anahtarı ajanlar arası kimlik taklidini mümkün kılıyor

**Konum:** `src/console/run.js:26`, `src/console/ConsoleServer.js:254-268`, `src/console/ConsoleServer.js:801-814`  
**Önem:** Kritik (kurumsal güvenlik / çok kiracılılık)

`run.js` tek bir `CONSOLE_AGENT_KEY` değerini hash'leyip `keys.agent` olarak kaydediyor. Bu kayıt `{ hash, keyId: null, agentId: null }` şeklinde oluşuyor. `identityOf` eşleşen kaydı döndürüyor; `identity.agentId` boş olduğu için:

- `POST /api/v1/heartbeat` yalnızca `identity.agentId` **varsa** `body.agentId` ile karşılaştırıyor (`803`). Paylaşılan anahtarda bu kontrol atlanıyor; saldırgan istediği `agentId` ile heartbeat atabiliyor.
- `POST /api/v1/receipts` `agentId` olarak `identity.agentId || body.agentId` kullanıyor (`811`); saldırgan başka ajanın siparişlerini `acked` işaretleyebiliyor.
- Heartbeat yanıtı, `body.agentId` için kuyruktaki imzalı emirleri döndürüyor. Saldırgan başka ajanın kapatma/yeniden başlatma emirlerini çalabilir veya sahte makbuzla sonuçlandırabilir.

**Etki:** Ajanlar arası yatay hareket, emir hırsızlığı, sahte denetim kaydı, hedef cihazlarda yanlış/engellenmiş güç eylemleri. Tek bir ajan anahtarı tüm filo için geçerli olduğundan ihlal tüm kurulumu etkiler.

**Düzeltme:** Ortak anahtarı kaldırın; her ajan için `{ hash, keyId, agentId, notAfter }` kaydı üretin. Ajan uçlarında `agentId` bağlaması zorunlu olsun; `body.agentId` asla kimlik kaynağı olmasın.

```js
// run.js — ortak anahtar yerine ajan kayıt defteri
const keys = {
    admin: hashKey(need('CONSOLE_ADMIN_KEY'))
    // agent anahtarı yok: ajanlar ConsoleStore.agentKeys üzerinden yönetilir
};
```

```js
// ConsoleServer.js
identityOf(req) {
    // ... mevcut sabit zamanlı tarama ...
    return found; // found.agentId zorunlu olmalı
}

// heartbeat
if (!identity || !identity.agentId) {
    return this.sendJson(res, 403, { error: 'Ajan anahtarı bir agentId ile bağlı değil.', code: 'AGENT_KEY_UNBOUND' });
}
if (body.agentId !== identity.agentId) {
    return this.sendJson(res, 403, { error: 'Kimlik uyuşmazlığı.', code: 'IDENTITY_MISMATCH' });
}
const out = this.heartbeat(identity.agentId, body.inventory, body.receipts);

// receipts
const agentId = identity.agentId;
if (!agentId) return this.sendJson(res, 403, { error: 'Ajan kimliği yok.', code: 'AGENT_KEY_UNBOUND' });
```

Geçiş dönemi için ortak anahtar kullanılacaksa `CONSOLE_AGENT_ID` ile açıkça bağlanmalı ve bu anahtar yalnızca o ajan için kabul edilmeli; ayrıca anahtar rotasyonu ve `notAfter` zorunlu tutulmalı.

---

## 3. Yüksek Bulgular

### Y-01 — Aktif sayaç geri yüklemede tanımsız `startTimer` çağrısı

**Konum:** `src/renderer/app.js:2923`, `src/renderer/app.js:2925`, `src/renderer/app.js:526`, `src/renderer/app.js:545-560`, `src/renderer/app.js:3411`  
**Önem:** Yüksek (güvenlik görünürlüğü / kullanıcı hatası)

`restoreActiveState`, aktif bir zamanlayıcı bulduğunda `startTimer(remaining)` çağırıyor; ancak kod tabanında yalnızca `startTimerTo(targetTime, totalSeconds)` var (`526`). Hata, boş `catch` (`2925`) tarafından yutuluyor. Sonuç: pencere yenilendiğinde sayaç geri yüklenmiyor ve `switchView('nav-active')` satırına hiç ulaşılmıyor. Ayrıca `545-560`'ta benzer bir `restoreActiveTimer` var; `3411`'de çağrılıyor ve yalnızca sayacı geri yüklüyor, görünümü değiştirmiyor. İki ayrı geri yükleme yolu bakım açısından da riskli.

**Etki:** Arka planda kapatma/yeniden başlatma görevi çalışırken kullanıcı ana ekranda kalır; geri sayımı, uyarıyı ve iptal penceresini göremez. Güvenlik açısından kritik bir güç eyleminin görünürlüğü kaybolur.

**Düzeltme:** Tek bir geri yükleme yolu kullanın; doğru fonksiyonu çağırın ve hatayı sessizce yutmayın.

```js
// app.js: restoreActiveState içinde
const remaining = Math.max(1, Math.round((timer.trigger.targetTime - Date.now()) / 1000));
selectedAction = timer.action;
currentActionString = getActionString(timer.action);
startTimerTo(timer.trigger.targetTime, remaining); // startTimer değil
switchView('nav-active');
return;
```

```js
// app.js: restoreActiveState catch
} catch (err) {
    console.warn('[UI] Aktif durum geri yüklenemedi:', err && err.message);
    showToast(t('unknownError'), 'error');
}
```

`restoreActiveTimer` ile `restoreActiveState` birleştirilmeli; `3411`'deki ikinci çağrı kaldırılmalı veya tek bir `restoreSession()` fonksiyonuna devredilmeli.

---

### Y-02 — Tekrarlayan `scheduled_time` görevleri çevrimdışı kalınca `EXPIRED` oluyor

**Konum:** `src/main/services/TaskManager.js:164-174`, `src/main/services/EnterprisePolicies.js:118-130`  
**Önem:** Yüksek (kurumsal politika durması)

`recoverTasksOnStartup`, `DURATION` veya `SCHEDULED_TIME` türündeki her görev için hedef zaman geçmişse `EXPIRED` yapıyor. `else if (task.recurrence && task.recurrence.enabled)` dalı yalnızca bu iki tür **dışındaki** görevlerde çalışıyor. Kurumsal "gece kapat" politikası `scheduled_time` + `recurrence` olarak üretildiği için (`EnterprisePolicies.js:126-127`), cihaz gece kapalıysa/açılışta hedef saat geçmişse görev bir daha tekrarlanmıyor; politika sessizce ölüyor.

**Etki:** Kurumsal gece kapatma, haftalık yeniden başlatma gibi politikalar bir kez kaçırıldıktan sonra süresiz durur. Yönetici bunu ancak konsolda fark eder; denetim kaydında "expired" görünür.

**Düzeltme:** Önce tekrarlama varsa bir sonraki occurrence'ı hesaplayın; yalnızca tekrarlamayan görevlerde süre dolumunu uygulayın.

```js
// TaskManager.recoverTasksOnStartup
const targetTime = task.trigger && task.trigger.targetTime;
const timed = task.trigger && (task.trigger.type === TRIGGER_TYPE.DURATION ||
    task.trigger.type === TRIGGER_TYPE.SCHEDULED_TIME);

if (task.recurrence && task.recurrence.enabled) {
    this.calculateNextRecurrence(task);
    if (task.status === TASK_STATUS.EXPIRED) task.status = TASK_STATUS.SCHEDULED;
} else if (timed && targetTime && targetTime < now) {
    task.status = TASK_STATUS.EXPIRED;
    log.info(`[TaskManager] Task "${task.name}" expired during offline time.`);
}
```

`calculateNextRecurrence` sonrası `targetTime`'ın gerçekten gelecekte olduğunu doğrulayan bir test ekleyin (cihaz 3 gün kapalı senaryosu).

---

### Y-03 — Headless kill-switch heartbeat'i durduruyor; uzaktan yeniden açma imkânsız

**Konum:** `src/agent/headless.js:169-172`, `src/main/services/ConsoleClient.js:218-230`  
**Önem:** Yüksek (operasyonel kilitlenme)

Headless döngüde:

```js
const s = storage.getSettings();
if (s.agentDisabled === true) return; // kill-switch: yalnızca heartbeat sürer
const res = await consoleClient.sync();
```

Yorum "yalnızca heartbeat sürer" diyor, ancak `return` `consoleClient.sync()`'ten **önce** çalışıyor. Yani heartbeat de duruyor. Konsol ajanı çevrimdışı görür ve `disabled` bayrağını kaldırsa bile ajan bunu öğrenemez; uzaktan yeniden etkinleştirme mümkün olmaz. `ConsoleClient` tarafındaki yorum (`218-219`) ise heartbeat'in sürmesini bekliyor.

**Etki:** Yanlışlıkla veya saldırgan tarafından devre dışı bırakılan ajan, konsoldan tekrar açılamaz; saha müdahalesi gerekir.

**Düzeltme:** Her tick'te sync çağırın; yalnızca icra hattını durdurun.

```js
const res = await consoleClient.sync();
if (res && res.disabled) {
    // Heartbeat gönderildi; konsol yeniden açana kadar icra yok.
    return;
}
if (res && res.ok) await executor.drain(queue);
```

`agentDisabled` yalnızca UI'da "devre dışı" göstergesi ve yerel icra engeli olarak kullanılmalı; sync engeli olmamalı. Bu davranış için entegrasyon testi ekleyin: `agentDisabled=true` iken heartbeat atılmalı ve konsol `disabled=false` döndüğünde ajan tekrar icra etmeli.

---

### Y-04 — Manuel `console-sync` kill-switch'i bypass ediyor

**Konum:** `main.js:1415-1418`, `src/main/services/ConsoleClient.js:228-230`  
**Önem:** Yüksek (güvenlik kontrolü bypass)

`console-sync` IPC'si:

```js
const res = await consoleClient.sync();
if (res.ok) {
    const drained = await orderExecutor.drain(orderQueue);
    return { ...res, drained };
}
```

`ConsoleClient.sync()`, konsol `disabled:true` döndüğünde `{ ok:true, disabled:true }` üretiyor (`228-230`). Manuel IPC yalnızca `res.ok` kontrol ettiği için kuyruğu yine de boşaltıyor. Otomatik döngü (`main.js:508`) `res.disabled` kontrolünü doğru yapıyor; manuel yol atlıyor.

**Etki:** Konsol tarafından durdurulmuş bir ajan, kullanıcı "Senkronize et" dediğinde bekleyen kapatma/yeniden başlatma emirlerini çalıştırabilir. Kill-switch güvencesi ihlal edilir.

**Düzeltme:** Aynı kontrolü manuel yola da uygulayın.

```js
const res = await consoleClient.sync();
if (res && res.ok && !res.disabled) {
    const drained = await orderExecutor.drain(orderQueue);
    return { ...res, drained };
}
return res;
```

`res.disabled` durumunda audit kaydı (`agent_disabled_sync_skipped`) ve kullanıcıya bilgi toast'ı ekleyin.

---

### Y-05 — Tepsi menüsünden otonomi modu PIN'siz değiştiriliyor

**Konum:** `main.js:707-714`, `main.js:1368-1387`  
**Önem:** Yüksek (güvenlik kontrolü bypass)

Renderer'daki otonomi modu değişikliği `security-settings-update` üzerinden PIN doğrulamasıyla yapılıyor (`1368-1387`). Tepsi menüsü ise doğrudan:

```js
storageService.updateSettings({ autonomyMode: mode === 'full' ? 'classic' : 'full' });
```

çağırıyor. `updateSettings` herhangi bir PIN/şema kontrolü yapmıyor. Bu, fiziksel erişimi olan veya tepsi menüsüne erişebilen birinin PIN bilmeden "full autonomy" moduna geçmesine izin verir.

**Etki:** PIN ile korunan güvenlik ayarı atlanır; tam otonomi, uyarı/onay olmadan güç eylemlerine izin verebilir.

**Düzeltme:** Tepsi tıklaması doğrudan yazmasın; ana pencereyi açıp PIN'li akışı başlatsın.

```js
{
    label: mode === 'full' ? t('traySwitchClassic') : t('traySwitchFull'),
    click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('request-autonomy-change',
            mode === 'full' ? 'classic' : 'full');
    }
}
```

Renderer tarafında `request-autonomy-change` dinleyicisi, mevcut `saveSecuritySettings({ autonomyMode })` akışını çağırmalı. Tepsiye PIN girişi eklemek yerine mevcut PIN modalını kullanmak en az kod değişikliğiyle doğru davranışı sağlar.

---

### Y-06 — Kalıcılaştırma hataları yutuluyor; başarı raporlanıyor

**Konum:** `src/main/services/StorageService.js:946-957`, `996-1005`; `src/main/services/TaskManager.js:581-585`, `828-852`; `main.js:1284`, `1334`  
**Önem:** Yüksek (veri kaybı / yanlış başarı)

`_persist` hata durumunda `false` döndürüyor. Ancak:

- `updateSettings` dönüş değerini yok sayıyor (`1004`).
- `TaskManager.createTask` `persistChanges()` sonucunu yok sayıp görevi başarıyla döndürüyor (`581-585`).
- `persistChanges` yalnızca değişen sayısını döndürüyor; `saveTask` başarısız olduğunda görev bellekte kalıyor, diskte yok.
- `applySettingsPatch` `storageService.updateSettings(rest)` sonucunu yok sayıyor (`1284`) ve hata olsa bile `{ success: true }` dönebiliyor (`1334`).

**Etki:** Kullanıcı "kaydedildi" görür; uygulama yeniden başlatıldığında görev/ayar kaybolur. Disk dolu, DB kilitli veya bakım modu senaryolarında sessiz veri kaybı.

**Düzeltme:** Kalıcılaştırmayı başarısız olduğunda çağırana taşıyın; bellek durumunu geri alın.

```js
// StorageService.updateSettings
updateSettings(newSettings) {
    // ... doğrulama ...
    const previous = this.data.settings;
    this.data.settings = Object.assign({}, previous, safe);
    const ok = this._persist(() => this._flushSettings(this._settingsForDisk()));
    if (!ok) {
        this.data.settings = previous;
        throw Object.assign(new Error('Ayarlar kalıcılaştırılamadı.'), { code: 'SETTINGS_PERSIST_FAILED' });
    }
    return true;
}
```

```js
// TaskManager.createTask
this.tasks.push(task);
try {
    // persistChanges, saveTask/deleteTask başarısızsa throw etmeli.
    this.persistChanges();
} catch (err) {
    this.tasks.pop();
    throw Object.assign(new Error('Görev kalıcılaştırılamadı.'), { code: 'TASK_PERSIST_FAILED', cause: err });
}
```

`persistChanges` içinde `saveTask`/`deleteTask` `false` döndürdüğünde `throw Object.assign(new Error('TASK_PERSIST_FAILED'), { code: 'TASK_PERSIST_FAILED' })` yapılmalı; böylece create/update/cancel yolları aynı sözleşmeyi kullanır.

```js
// main.js applySettingsPatch
const persisted = storageService.updateSettings(rest);
if (persisted === false) {
    throw Object.assign(new Error('Ayarlar diske yazılamadı.'), { code: 'SETTINGS_PERSIST_FAILED' });
}
```

`persistChanges`'ı `{ ok, changed }` döndürecek şekilde değiştirmek veya hata fırlatmak, tüm çağıranların (create/update/cancel) aynı sözleşmeyi kullanmasını sağlar.

---

### Y-07 — Audit checkpoint her 60 saniyede senkron PowerShell çalıştırıyor

**Konum:** `src/main/security/AuditCheckpoint.js:57-66`, `69-95`, `169-177`; `src/main/services/StorageService.js:1322-1327`; `main.js:895-899`  
**Önem:** Yüksek (ana thread kilitlenmesi / kapanış gecikmesi)

`appendAudit` her yazımdan sonra `ensureToday` çağırıyor. `ensureToday` 60 saniyede bir `writeDay`'e geçiyor; `writeDay` de `defaultEventLogWrite` ile **senkron** `execFileSync('powershell.exe', ...)` çalıştırıyor (5 saniye timeout). Bu, Electron ana sürecini ve dolayısıyla tüm IPC/UI'yi 5 saniye bloke edebilir. Kapanışta `write()` tüm günleri dolaşıp her gün için aynı senkron çağrıyı yapıyor; 30 günlük audit geçmişi dakikalarca kapanış gecikmesi üretebilir.

**Etki:** Periyodik UI donmaları, watchdog/timeout, yavaş kapanış, kullanıcıların uygulamayı zorla sonlandırması. Audit yazımı güvenlik açısından kritik olduğu için tamamen kaldırılamaz; asenkronize edilmelidir.

**Düzeltme:** Event Log yazımını worker/kuyruk üzerinden asenkron yapın; kapanışta Event Log'u atlayın veya kısa timeout'lu async çağrı kullanın.

```js
// AuditCheckpoint.js
const { execFile } = require('child_process');

defaultEventLogWrite(day, lastSeq, lastHmac) {
    const message = `PPAUDIT:${day}:${lastHmac}`;
    const script = `try { Write-EventLog -LogName Application -Source 'PowerPilot' -EventId 1100 -EntryType Information -Message '${message}' -ErrorAction Stop } catch { exit 1 }`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeout: 5000,
        windowsHide: true
    }, (err) => {
        if (err) log.warn('[AuditCheckpoint] Event Log yazılamadı:', err.message);
    });
}
```

Daha sağlamı: `worker_threads` ile ayrı bir audit writer; `writeDay` yalnızca JSON checkpoint'i senkron yazsın, Event Log kuyruğa atılsın. Kapanışta `write(records, { eventLog: false })` kullanın; Event Log özeti bir sonraki açılışta telafi edilebilir.

---

### Y-08 — ConsoleServer'da işlenmeyen server/dgram/request hataları süreci çökertiyor

**Konum:** `src/console/ConsoleServer.js:528-548`, `674-710`, `742-745`, `760-788`  
**Önem:** Yüksek (konsol çökmesi / tüm filo görünürlüğü)

- `sendWolDirect` `dgram.createSocket` sonrası `sock.on('error')` eklemiyor. `setBroadcast`/`send` sırasında oluşan bazı hatalar callback yerine `error` event'i olarak gelir; dinleyici yoksa Node süreci çöker.
- `start` içinde `server.on('error')` yok. `EADDRINUSE`, `EACCES` gibi hatalar `error` event'i olarak yayılır ve yakalanmazsa süreç kapanır.
- `handleRequest` içinde `new URL(req.url, ...)` try/catch dışında; bozuk `req.url` senkron exception fırlatır.
- `req.on('error')` yok; istemci bağlantısı aniden kapanırsa hata işlenmez.
- `sendJson` `res.headersSent`/`res.writableEnded` kontrolü yapmıyor; 413 sonrası ikinci yanıt denemesi `ERR_HTTP_HEADERS_SENT` fırlatabilir.

**Etki:** Tek bir kötü istek veya port çakışması tüm konsolu düşürür; ajanlar heartbeat atamaz, operatör filoyu yönetemez.

**Düzeltme:**

```js
sendWolDirect(mac, broadcastIp = '255.255.255.255', port = 9) {
    return new Promise((resolve) => {
        let sock;
        const done = (result) => {
            try { if (sock) sock.close(); } catch (_) {}
            resolve(result);
        };
        try {
            const cleanMac = String(mac).replace(/[^a-fA-F0-9]/g, '');
            if (cleanMac.length !== 12) return resolve({ success: false, error: 'MAC geçersiz.' });
            // ... paket ...
            sock = dgram.createSocket('udp4');
            sock.once('error', (err) => done({ success: false, error: err.message }));
            sock.once('listening', () => { try { sock.setBroadcast(true); } catch (_) {} });
            sock.send(pkt, 0, pkt.length, port, broadcastIp, (err) => {
                done(err ? { success: false, error: err.message } : { success: true });
            });
        } catch (err) {
            done({ success: false, error: (err && err.message) || 'WoL hatası.' });
        }
    });
}
```

```js
start(port = 8443, host = '0.0.0.0', tlsSettings = {}) {
    // ...
    this.server.on('error', (err) => {
        log.error('[Console] Sunucu hatası:', err && err.message);
        this.server = null;
        this.transport = 'disabled';
    });
    // ...
}

handleRequest(req, res) {
    req.on('error', () => { try { res.destroy(); } catch (_) {} });
    let parsed;
    try {
        parsed = new URL(req.url, 'http://x');
    } catch (_) {
        return this.sendJson(res, 400, { error: 'Geçersiz URL.', code: 'BAD_URL' });
    }
    // ...
}

sendJson(res, code, data) {
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
```

---

### Y-09 — Audit yazımı O(n²), konsol snapshot'ı her heartbeat'te tüm audit'i okuyor

**Konum:** `src/main/services/StorageService.js:302-313`, `1253-1266`, `1297-1328`; `src/console/ConsoleStore.js:700-726`; `src/console/ConsoleServer.js:123-126`, `326`  
**Önem:** Yüksek (ölçeklenebilirlik / performans)

`appendAudit` her kayıttan sonra `this.data.auditLog = this.getAuditLog()` yapıyor; `getAuditLog` tüm `audit_log` tablosunu `SELECT * ... ORDER BY seq` ile okuyor. Bu, her audit yazımında O(n) okuma ve toplamda O(n²) davranış demek. Açılışta da tüm audit belleğe alınıyor (`302-313`). Konsol tarafında `ConsoleStore.snapshot()` her çağrıda `audit: this.listAudit()` ekliyor; `ConsoleServer.refresh()` heartbeat dahil birçok yerde snapshot'ı yeniliyor (`326`, `832`, sipariş/politika işlemleri). Yani her heartbeat tüm audit geçmişini DB'den okuyup belleğe alıyor.

**Etki:** Audit 10 binlerce kayda ulaştığında her görev olayı ve her heartbeat yavaşlar; CPU/disk I/O artar; konsol gecikmeleri ve UI donmaları görülür.

**Düzeltme:** Audit'i append-only tutun; her yazımda tam tabloyu okumayın. Konsol snapshot'ından audit'i çıkarın; ayrı ve sayfalı endpoint kullanın.

```js
// StorageService.appendAudit — tam reload yok
appendAudit({ actor = 'system', action = 'unknown', target = null, detail = '' } = {}) {
    // ... insert ...
    const rec = { ...base, hash: mac, prevHash: prev, recordHmac: mac, prevHmac: prev };
    // İsteğe bağlı: yalnızca son N kaydı bellekte tut
    if (Array.isArray(this.data.auditLog)) {
        this.data.auditLog.push(rec);
        if (this.data.auditLog.length > 5000) this.data.auditLog.shift();
    }
    return rec;
}
```

```js
// ConsoleStore.snapshot
snapshot({ includeAudit = false } = {}) {
    // ...
    return {
        agents, queues, policies: this.listPolicies(),
        ...(includeAudit ? { audit: this.listAudit({ limit: 200 }) } : {}),
        keypair, disabledAgents, agentKeys
    };
}
```

```js
// ConsoleServer.refresh
refresh() {
    if (!this.consoleStore.enabled) return this.store;
    this.store = this.consoleStore.snapshot({ includeAudit: false });
    // ...
}
```

`getAuditLog({ limit = 200, beforeSeq = null })` ve `/api/v1/audit?limit=&beforeSeq=` ekleyin. Uzun vadede audit için ayrı arşiv/retention politikası uygulayın.

---

### Y-10 — Sipariş icrasında `consoleOrderId` idempotency açığı

**Konum:** `src/main/services/OrderExecutor.js:28-32`, `63-76`, `88-97`; `src/main/services/TaskManager.js:529-585`  
**Önem:** Yüksek (mükerrer güç eylemi / politika çoğalması)

`OrderExecutor.executeRecord`, `apply-policy` ve güç eylemleri için `consoleOrderId: order.nonce` ile görev oluşturuyor. `drain` ise ancak `executeRecord` döndükten sonra `queue.ack(record.key, r)` yapıyor. Süreç, görev oluşturulduktan sonra ama `ack`'ten önce çökerse, yeniden başlatmada aynı sipariş tekrar işlenir ve **aynı nonce ile ikinci bir görev** oluşturulur. `TaskManager.createTask` `consoleOrderId` için dedupe yapmıyor.

**Etki:** Özellikle `apply-policy` tekrarlarında aynı politika için çok sayıda görev; güç eylemlerinde mükerrer kapatma/yeniden başlatma denemeleri. Kullanıcıya mükerrer uyarılar, denetim kirliliği.

**Düzeltme:** `createTask` içinde `consoleOrderId` ile idempotent davranın; `OrderExecutor` de mevcut görevi kontrol etsin.

```js
// TaskManager.createTask başında
if (taskData && typeof taskData.consoleOrderId === 'string' && taskData.consoleOrderId) {
    const existing = this.tasks.find((t) => t.consoleOrderId === taskData.consoleOrderId);
    if (existing) return existing;
}
```

```js
// OrderExecutor.executeRecord
if (order.nonce) {
    const existing = (this.tasks.tasks || []).find((t) => t.consoleOrderId === order.nonce);
    if (existing) {
        return { ok: true, code: 'duplicate', message: `Sipariş zaten işlendi: ${existing.id}` };
    }
}
```

Daha güçlü çözüm: görev oluşturma + `queue.ack` işlemini tek bir outbox/transaction içinde yapın veya `consoleOrderId` için DB'de unique constraint ekleyin.

---

## 4. Orta Bulgular

### O-01 — `LocalApiService.start()` bind hatasını yutmuyor, başarı dönüyor

**Konum:** `src/main/services/LocalApiService.js:198-269`, `308-311`  
**Önem:** Orta (yanlış başarı / sessiz API kesintisi)

`start()` `server.listen()` çağrısından hemen sonra `{ ok: true }` döndürüyor. `EADDRINUSE`/`EACCES` gibi hatalar yalnızca `server.on('error')` içinde loglanıyor; çağıran `applySettingsPatch` `started.ok === false` görmediği için ayarları başarıyla kaydediyor. `restart()` de aynı nedenle bind hatasını tespit edemiyor.

**Etki:** Kullanıcı "API etkin" görür; port başka süreç tarafından kullanıldığı için API aslında dinlemiyordur. Ayarlar geri alınmaz.

**Düzeltme:** `start()`'ı async yapın ve `listen` callback'ini bekleyin; hata durumunda reddedin.

```js
async start() {
    // ... mevcut kontroller ...
    await new Promise((resolve, reject) => {
        const onError = (err) => { cleanup(); reject(err); };
        const onListening = () => { cleanup(); resolve(); };
        const cleanup = () => {
            this.server.off('error', onError);
            this.server.off('listening', onListening);
        };
        this.server.once('error', onError);
        this.server.once('listening', onListening);
        this.server.listen({ port, host, ipv6Only: false });
    });
    return { ok: true, transport: this.transport, host };
}
```

`applySettingsPatch` ve `headless.js:161` `await localApiService.start()` kullanmalı. IPv6 fallback gerekiyorsa aynı Promise içinde yönetin.

---

### O-02 — Local API rate limit kimlik doğrulamadan önce çalışıyor

**Konum:** `src/main/services/LocalApiService.js:346-370`  
**Önem:** Orta (DoS / kullanılabilirlik)

`isRateLimited(remoteIp)` API anahtarı doğrulanmadan önce çalışıyor. Allowlist'teki bir IP, geçersiz anahtarla 60 istek/dk sınırını doldurup aynı IP'deki meşru istemciyi 429'a düşürebilir. Yorumda "yetkisiz IP'ler map'i büyütemez" denmiş; ancak yetkili IP'den gelen kimliksiz trafik de limiti tüketebilir.

**Etki:** Aynı NAT/IP arkasındaki konsol/otomasyon istemcileri birbirini kilitler; brute-force denemeleri meşru trafiği bloke eder.

**Düzeltme:** Kimlik doğrulamadan sonra anahtar+IP bazlı limit uygulayın; kimlik doğrulama başarısızlıkları için ayrı, daha küçük bir sayaç tutun.

```js
// Önce API key doğrula, sonra:
const rateKey = `${remoteIp}:${providedHash.slice(0, 16)}`;
if (this.isRateLimited(rateKey)) {
    this.diagnostics.rateLimited += 1;
    return this.sendJson(res, 429, { error: 'Rate limit exceeded. Try again later.' });
}
```

Başarısız auth denemeleri için `authFailures` map'i (IP başına 10/dk) ayrı tutulmalı; başarılı istekler bu sayacı sıfırlamalı.

---

### O-03 — Idempotency anahtarı yalnızca header'a göre; metot/yol/gövde/kimlik kapsamı yok

**Konum:** `src/main/services/LocalApiService.js:386-395`, `750-758`  
**Önem:** Orta (yanlış yanıt / veri sızıntısı)

`Idempotency-Key` yalnızca header değeriyle cache'leniyor. Aynı anahtar farklı endpoint, metot veya gövdeyle tekrar kullanılırsa önceki yanıt dönüyor. Farklı API anahtarları/rolleri de aynı cache girdisini paylaşabilir.

**Etki:** İstemci yanlış sonuç alır; bir kullanıcının yanıtı başka bir kimliğe dönebilir; idempotency güvenliği zayıflar.

**Düzeltme:** Cache anahtarını istek parmak iziyle birleştirin.

```js
const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
const cacheKey = [
    method,
    pathname,
    bodyHash,
    providedHash.slice(0, 16),
    idemKey
].join(':');
```

`sendJson` içinde `res.__ppIdempotencyKey` yerine bu `cacheKey` saklanmalı. TTL ve maksimum girdi sayısı korunmalı.

---

### O-04 — İstemci verdiği muafiyet/pencere ID'si sunucu ID'sini eziyor; null policy eşleşmesi fazla geniş

**Konum:** `src/main/services/LocalApiService.js:702-705`, `728`; `src/main/services/ExemptionService.js:99-117`, `143-151`  
**Önem:** Orta (yetkisiz kayıt değiştirme / yanlış muafiyet)

`{ id: \`ex_${Date.now()}\`, ...body }` sırası nedeniyle `body.id` sunucunun ürettiği ID'yi eziyor. `ExemptionService.add` aynı ID'yi filtreleyip yeniden eklediği için mevcut bir muafiyet istemci tarafından üzerine yazılabilir. Aynı durum `maintenance-windows` için de var.

`findExemption` içinde `if (e.policyId !== null && ... && policyId && e.policyId !== policyId)` koşulu, çağıran `policyId:null` verdiğinde belirli bir politikaya bağlı muafiyetin eşleşmesine izin veriyor. "null = hepsi" semantiği ile çelişiyor.

**Etki:** Admin anahtarına sahip bir istemci mevcut kayıtları ezebilir; politikaya özel muafiyet beklenmedik şekilde tüm politikalara uygulanabilir.

**Düzeltme:** Sunucu ID'sini son yazın; istemci ID'sini reddedin. `findExemption`'da policy kontrolünü sıkılaştırın.

```js
const candidate = { ...body, id: `ex_${crypto.randomUUID()}` };
if (body.id) return this.sendJson(res, 400, { error: 'id sunucu tarafından üretilir.', code: 'CLIENT_ID_FORBIDDEN' });
```

```js
// ExemptionService.findExemption
if (e.policyId !== null && e.policyId !== undefined) {
    if (!policyId || e.policyId !== policyId) return false;
}
```

`policyId:null` çağrısı yalnızca `policyId` alanı boş olan genel muafiyetlerle eşleşmeli.

---

### O-05 — Uzak kapatma koruması yalnızca shutdown/restart için; lock/signout/sleep/hibernate bypass

**Konum:** `src/main/services/LocalApiService.js:153-155`  
**Önem:** Orta (güvenlik politikası boşluğu)

`isRemoteShutdownBlocked` yalnızca `action === 'shutdown' || action === 'restart'` kontrolü yapıyor. `blockRemoteShutdownWhenActive` ayarı, kullanıcı aktifken uzaktan `lock`, `signout`, `sleep`, `hibernate` eylemlerini engellemiyor. Bu eylemler de kullanıcı oturumunu/çalışmasını kesintiye uğratır.

**Etki:** Ayarın adı ve amacı "aktifken uzaktan güç eylemi engelle" iken diğer yıkıcı eylemlerle bu koruma atlanır.

**Düzeltme:** Korunan eylem setini genişletin; ürün kararı farklıysa ayarı yeniden adlandırıp dokümante edin.

```js
const REMOTE_BLOCKED_ACTIONS = new Set([
    'shutdown', 'restart', 'sleep', 'hibernate', 'signout', 'lock'
]);

isRemoteShutdownBlocked(settings, action) {
    if (!settings || settings.blockRemoteShutdownWhenActive !== true) return false;
    if (!REMOTE_BLOCKED_ACTIONS.has(action)) return false;
    // ... idle kontrolü ...
}
```

---

### O-06 — `/audit` ve `/tasks` sayfalanmıyor; tüm geçmiş tek yanıtta

**Konum:** `src/main/services/LocalApiService.js:524-527`, `742-744`; `main.js:1410`  
**Önem:** Orta (bellek/CPU / büyük yanıt)

`GET /api/v1/tasks` tüm görevleri, `GET /api/v1/audit` tüm audit'i + `verify()` sonucunu döndürüyor. `get-audit` IPC'si de aynı şekilde tam listeyi ve doğrulamayı döndürüyor. Görev/audit sayısı arttıkça yanıt boyutu ve doğrulama maliyeti doğrusal büyür.

**Etki:** Konsol/CLI istemcileri büyük JSON'ları işlerken bellek şişer; audit doğrulaması her istekte tüm zinciri tarar; UI donar.

**Düzeltme:** `limit`/`offset` (veya `beforeSeq`) parametreleri ekleyin; varsayılan limit 100-200 olsun; `verify` ayrı bir endpoint olsun.

```js
if (method === 'GET' && path === '/api/v1/audit') {
    const limit = Math.min(500, Math.max(1, Number(parsedUrl.searchParams.get('limit')) || 100));
    const beforeSeq = Number(parsedUrl.searchParams.get('beforeSeq')) || null;
    return this.sendJson(res, 200, { audit: audit.load({ limit, beforeSeq }) });
}
```

`get-audit` IPC'si de `{ limit, beforeSeq }` almalı; UI yalnızca görünen sayfayı istemeli.

---

### O-07 — Konsol receipt ucu sınırsız dizi kabul ediyor; rate limit yok

**Konum:** `src/console/ConsoleServer.js:809-834`; genel olarak `674-788`  
**Önem:** Orta (DoS / DB şişmesi)

`body.receipts` 1 MB gövde sınırına kadar binlerce kayıt içerebilir. Her kayıt `ackReceipt` ile DB yazımı ve audit kaydı üretiyor. Konsol sunucusunda ayrıca genel bir rate limit yok; bir ajan/istemci heartbeat/receipt uçlarını sürekli çağırabilir.

**Etki:** Tek bir kötü niyetli/hatalı ajan konsol DB'sini ve audit'ini şişirir; diğer ajanların heartbeat'i gecikir.

**Düzeltme:** Receipt sayısını sınırlayın; toplu işlemi tek transaction'da yapın; IP/anahtar bazlı token bucket ekleyin.

```js
const MAX_RECEIPTS_PER_REQUEST = 100;
const receipts = Array.isArray(body.receipts) ? body.receipts : [body];
if (receipts.length > MAX_RECEIPTS_PER_REQUEST) {
    return this.sendJson(res, 413, {
        error: `En fazla ${MAX_RECEIPTS_PER_REQUEST} receipt gönderilebilir.`,
        code: 'TOO_MANY_RECEIPTS'
    });
}
```

Rate limit için `Map<keyId, {tokens, last}>` ile dakikada örn. 120 istek; 429 + `Retry-After` dönün.

---

### O-08 — Konsol kuyruk/audit tabloları sınırsız büyüyor; ack edilen satırlar silinmiyor

**Konum:** `src/console/ConsoleStore.js:403-429`, `700-726`  
**Önem:** Orta (ölçeklenebilirlik / DB büyümesi)

`ackReceipt` kuyruk satırını `state='acked'` yapıyor ama silmiyor; `receipts` tablosuna da kalıcı kayıt ekliyor. `queues`, `receipts` ve `audit` için retention/purge job'u yok. `snapshot` her seferinde audit'i de yüklüyor (Y-09).

**Etki:** Yıllar içinde DB ve sorgu süreleri büyür; yedekleme süreleri uzar; konsol açılışı yavaşlar.

**Düzeltme:** Retention job ekleyin; audit'i silmeden önce checkpoint/arşivleyin.

```sql
-- Örnek retention (audit arşivlendikten sonra)
DELETE FROM queues WHERE state = 'acked' AND acked_at < ?;
DELETE FROM receipts WHERE received_at < ?;
```

`queues(state, created_at)`, `receipts(received_at)`, `audit(ts)` için indeks ekleyin. Audit için "silme" yerine ayrı arşiv tablosu/dosyası ve periyodik `VACUUM` önerilir.

---

### O-09 — Smart Finish örnekleri yalnızca `task.id` ile anahtarlanıyor; çoklu koşullar birbirini eziyor

**Konum:** `src/main/services/SmartFinishEngine.js:16-19`, `39`, `105`, `114`, `148-189`  
**Önem:** Orta (yanlış tetikleme / yanlış bekletme)

`evaluateTask`, tüm koşulları `this.evaluateSingleCondition(cond, metrics, task.id)` ile değerlendiriyor. `fileSamples`/`directorySamples` map'leri `taskId` anahtarı kullanıyor. Bir görevde iki farklı `file_stable` veya `directory_idle` koşulu varsa ikinci koşu birincinin örneğini ezer; sabitlik süresi yanlış hesaplanır. Map'ler görev silindiğinde temizlenmiyor.

Ayrıca `cond.thresholdPercent || 10` ve `cond.idleSeconds || 300` ifadeleri `0` değerini varsayılana çeviriyor; `0` geçerli bir eşik olabilir.

**Etki:** Çoklu dosya/klasör koşullu görevlerde yanlış "hazır" veya sonsuz "izleniyor" durumu; bellek sızıntısı; `0` eşiği kullanılamaz.

**Düzeltme:** Koşul başına benzersiz anahtar kullanın; `??` ve aralık doğrulaması uygulayın; görev silinince prune edin.

```js
const results = group.conditions.map((cond, index) =>
    this.evaluateSingleCondition(cond, metrics, `${task.id}:${index}`)
);

const threshold = Number.isFinite(cond.thresholdPercent) ? cond.thresholdPercent : 10;
const requiredIdleSec = Number.isFinite(cond.idleSeconds) ? cond.idleSeconds : 300;
```

```js
prune(taskIds) {
    for (const key of this.fileSamples.keys()) {
        if (!taskIds.has(key.split(':')[0])) this.fileSamples.delete(key);
    }
    // directorySamples ve stabilityTrackers için aynı mantık
}
```

---

### O-10 — `MetricCollector.withTimeout` alttaki işi iptal etmiyor; örnekler üst üste binebilir

**Konum:** `src/main/services/monitors/MetricCollector.js:97-139`  
**Önem:** Orta (CPU/memory spike, stale metrik)

`withTimeout` yalnızca Promise'i reddediyor; `systeminformation`/WMI çağrısı arka planda devam ediyor. `sampleOnce` timeout sonrası `finally` ile `_sampling=false` yapıyor; bir sonraki tick yeni bir WMI çağrısı başlatabiliyor. Yavaş disk/WMI sistemlerinde aynı anda birden çok örnekleme çalışır.

**Etki:** CPU/disk kullanımı artar; metrikler stale kalır; güvenlik kontrolleri yanlış sonuç üretebilir.

**Düzeltme:** Alt iş bitene kadar yeni tick'i engelleyin; mümkünse `AbortController`/native iptal kullanın.

```js
async sampleOnce() {
    if (this._sampling) return false;
    this._sampling = true;

    // Alt işleri ayrı tut: timeout sonrası da bitmelerini bekleyeceğiz.
    const underlying = Promise.allSettled([
        this.sampleProcesses(),
        this.sampleIdle(),
        this.sampleNetwork(),
        this.sampleDisks(),
        this.sampleBattery()
    ]);

    try {
        const results = await Promise.race([
            underlying,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SAMPLE_TIMEOUT')), this.sampleTimeoutMs))
        ]);
        // ... sonuçları işle ...
    } finally {
        await underlying.catch(() => {}); // alt WMI çağrıları bitmeden yeni tick başlamasın
        this._sampling = false;
    }
}
```

Alternatif ve daha güvenilir: `systeminformation` çağrılarını worker thread'e alıp timeout'ta worker'ı terminate edin; böylece alt iş gerçekten iptal edilir.

---

### O-11 — Webhook retry zincirinde `.catch` yok; Promise askıda kalabilir

**Konum:** `src/main/services/WebhookService.js:116-121`  
**Önem:** Orta (asılı Promise / sessiz teslimat kaybı)

```js
this.setTimeoutFn(() => {
    this.sendPayload(hook, payload, attempt + 1).then(resolve);
}, delay);
```

Retry çağrısı reject ederse (SSRF guard throw, geçersiz URL, ağ hatası) `resolve` hiç çağrılmaz; dış Promise sonsuza kadar pending kalır. `triggerEvent` tarafında `.catch` olsa da doğrudan `sendPayload` bekleyen çağıranlar askıda kalır. Ayrıca `triggerEvent` her webhook için sınırsız eşzamanlı `setImmediate` başlatıyor.

**Etki:** Webhook teslimatı sessizce kaybolur; kuyruk/retry sayaçları yanlış kalır; çok sayıda webhook'ta bağlantı patlaması.

**Düzeltme:** Retry promise'ine rejection handler ekleyin; eşzamanlılığı sınırlayın.

```js
this.sendPayload(hook, payload, attempt + 1).then(
    (result) => resolve(result),
    (err) => resolve({ ok: false, code: 'RETRY_FAILED', error: err && err.message })
);
```

`triggerEvent` için küçük bir concurrency limiter (örn. 5) kullanın; her hook'u sıraya alın.

---

### O-12 — SafetyPolicyEngine her icrada ağır alt süreç kontrolleri çalıştırıyor

**Konum:** `src/main/services/SafetyPolicyEngine.js:84-110`  
**Önem:** Orta (gecikme / kullanıcı deneyimi)

Her güç eylemi öncesinde `powercfg /requests`, tam ekran PowerShell kontrolü ve gerekiyorsa `ps-list` çalışıyor. `getPowerRequests` 5 sn, fullscreen 15 sn cache kullanıyor; yine de ilk çağrı ve cache yenilemeleri eylem yolunu geciktiriyor. Tüm kontroller fail-closed olduğu için alt süreç yavaşsa kapatma/ yeniden başlatma gecikir veya bloke olur.

**Etki:** Kullanıcı "Kapat" dedikten sonra 5-15 sn gecikme; zaman aşımında gereksiz `POWER_REQUESTS_UNAVAILABLE` bloğu.

**Düzeltme:** Kontrolleri paralel ve bütçeli çalıştırın; sonuçları önceden ısıtın; kritik olmayan kontrolleri eylemden bağımsız periyodik tazeleyin.

```js
const [requests, fullscreen, processes] = await Promise.all([
    this.getPowerRequests(),
    policy.checkFullscreen ? this.getFullscreenState() : Promise.resolve({ ok: true }),
    policy.checkProtectedApps ? this.getProcessList() : Promise.resolve({ ok: true })
]);
```

Her çağrıya toplam 2-3 sn bütçe koyun; süre aşımında politikaya göre fail-open/fail-closed kararını açıkça dokümante edin.

---

### O-13 — Task Scheduler fallback'i saniyeleri kırpıyor; senkronizasyon hataları görünmüyor

**Konum:** `src/main/services/TaskSchedulerBridge.js:74-81`, `127`, `201-215`; `src/main/services/TaskManager.js:517-521`  
**Önem:** Orta (erken tetikleme / sessiz fallback kaybı)

`formatTriggerDate` `schtasks /st HH:mm` biçimine saniyeleri kırparak çeviriyor. `shouldSync` yalnızca minimum lead time kontrolü yapıyor; hedef 10:00:45 ise fallback 10:00'da, yani 45 sn erken tetiklenebilir. `syncScheduler` `syncTask` promise'ini `.catch(() => {})` ile yutuyor; schtasks başarısızlığı loglanmıyor.

**Etki:** Uygulama kapalıyken Windows görevi erken kapatma başlatabilir; fallback yazılamazsa cihaz kapalı kalır ve kimse fark etmez.

**Düzeltme:** Hedefi bir sonraki dakikaya yukarı yuvarlayın (erken değil, geç tetikleme güvenli taraftır) veya Task Scheduler XML'i ile saniye hassasiyeti kullanın. Senkronizasyon hatalarını loglayın/audit'e yazın.

```js
static formatTriggerDate(targetTime) {
    const d = new Date(targetTime);
    if (d.getSeconds() > 0 || d.getMilliseconds() > 0) {
        d.setMinutes(d.getMinutes() + 1, 0, 0);
    }
    // ...
}
```

```js
syncScheduler(task) {
    if (!this.schedulerBridge?.syncTask) return;
    Promise.resolve(this.schedulerBridge.syncTask(task))
        .then((ok) => { if (!ok) log.warn(`[TaskManager] Scheduler fallback yazılamadı: ${task.id}`); })
        .catch((err) => log.warn(`[TaskManager] Scheduler hatası: ${err.message}`));
}
```

---

### O-14 — Envanter toplama her heartbeat'te ağır alt süreçleri çalıştırıyor

**Konum:** `src/main/services/InventoryService.js:259-325`, `276-280`; `src/main/services/ConsoleClient.js:143-148`  
**Önem:** Orta (filo CPU yükü / heartbeat gecikmesi)

`InventoryService.collect()` her çağrıda `powercfg -a`, PowerShell `Get-NetAdapterPowerManagement`, `powercfg /devicequery`, iki `reg query` ve olası UPS sorgusu çalıştırıyor. `ConsoleClient._syncOnce` her heartbeat'te `inventory.collect()` çağırıyor; varsayılan 60 sn'de bir, yüzlerce ajan için ciddi süreç yükü.

**Etki:** Ajan makinelerinde sürekli PowerShell/powercfg spawn; CPU ve disk I/O artışı; heartbeat gecikmesi ve konsolda çevrimdışı görünme.

**Düzeltme:** Donanım detaylarını boot/5-15 dakikada bir toplayın; heartbeat'te cache'lenmiş envanteri gönderin; yalnızca değişen alanları delta olarak iletin.

```js
async collect({ force = false } = {}) {
    const now = Date.now();
    if (!force && this._cache && now - this._cache.at < 5 * 60_000) {
        return this._cache.value;
    }
    // ... ağır toplama ...
    this._cache = { at: now, value: inv };
    return inv;
}
```

`ConsoleClient` varsayılan olarak cache'li `collect()` kullanmalı; konsol "envanteri yenile" dediğinde `force:true` gönderilmeli.

---

### O-15 — DeviceProfiler deşarj ölçümü 3 sıralı PowerShell çağrısıyla 45 saniyeye kadar sürebiliyor

**Konum:** `src/main/services/DeviceProfiler.js:91-107`  
**Önem:** Orta (UI donması / zaman aşımı)

`measureDischargeMw` üç örnek için sırayla `runPowerShell` çağırıyor. Her çağrı 15 sn timeout'a sahipse toplam 45 sn'ye kadar bloklanabilir. Bu işlem kullanıcı tetiklemeli profil akışında UI'yı bekletir.

**Etki:** "Cihazı profille" işlemi uzun süre yanıt vermez; kullanıcı iptal eder; ölçüm yarım kalır.

**Düzeltme:** Örnekleri tek PowerShell çağrısında toplayın veya paralel çalıştırın; toplam bütçeyi 5-8 sn ile sınırlayın; sonucu cache'leyin.

```js
const out = await this.runPowerShell(`
  $s = Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus |
       Measure-Object -Property DischargeRate -Sum
  $s.Sum
`);
```

Paralel örnekleme gerekiyorsa `Promise.all` kullanın; her çağrıya ayrı 5 sn timeout verin.

---

### O-16 — UPS komutunda `upsName` satır enjeksiyonu; monitor ayar değişiminde yenilenmiyor

**Konum:** `src/main/services/UpsMonitor.js:198-201`; `src/main/ipc/validate.js:290-291`; `main.js:425`  
**Önem:** Orta (protokol enjeksiyonu / yanlış yapılandırma)

`upsName` doğrudan NUT komutuna interpolate ediliyor:

```js
cmd += `LIST VAR ${this.ups}\n`;
```

`validate.js` yalnızca uzunluk kontrolü yapıyor; `\r`/`\n` kabul ediliyor. Ayrıca `UpsMonitor` yalnızca açılışta bir kez oluşturuluyor; ayarlar değişince yeniden başlatma gerekene kadar eski host/ups adı kullanılıyor.

**Etki:** Kötü niyetli/hatalı yapılandırma NUT protokolüne ek komut satırları enjekte edebilir; ayar değişikliği sessizce uygulanmaz.

**Düzeltme:** `upsName`/`upsHost` için katı regex ve CR/LF reddi; ayar değişiminde monitor'ü yeniden oluşturun.

```js
// validate.js
upsName: { str: [1, 64], pattern: /^[A-Za-z0-9._-]+$/ },
upsHost: { str: [1, 128], pattern: /^[A-Za-z0-9.:[\]_-]+$/ },
```

```js
// main.js — ayar kaydı sonrası
if (upsMonitor) { try { upsMonitor.close(); } catch (_) {} }
upsMonitor = new UpsMonitor({ host: s.upsHost || '127.0.0.1', ups: s.upsName || 'ups' });
```

---

### O-17 — AiBackend model yükleme hatasında native model/context sızıntısı

**Konum:** `src/main/services/AiBackend.js:130-145`  
**Önem:** Orta (native bellek/GPU sızıntısı)

`loadModel` önce `this.model`'i yüklüyor, sonra `createContext` çağırıyor. `createContext` hata verirse `catch` yalnızca `this.model = null; this.context = null` yapıyor; yüklenmiş native model dispose edilmiyor. Tekrarlanan başarısız denemeler bellek/GPU sızıntısına yol açar.

**Etki:** Uzun oturumda OOM/GPU hatası; model yükleme kalıcı olarak başarısız olabilir.

**Düzeltme:** Yerel değişkenlerle yükleyin; hata durumunda context/model dispose edin.

```js
let model = null;
let context = null;
try {
    await this.unload();
    const llama = await this.ensureLlama();
    model = await llama.loadModel({ modelPath });
    context = await model.createContext(ASSISTANT_CONTEXT_OPTIONS);
    this.model = model;
    this.context = context;
    // ...
} catch (err) {
    try { if (context?.dispose) await context.dispose(); } catch (_) {}
    try { if (model?.dispose) await model.dispose(); } catch (_) {}
    this.model = null;
    this.context = null;
    // ...
}
```

---

### O-18 — `SecretStore.syncWebhooks` önce eski sırları siliyor; hata durumunda kimlik bilgisi kaybı

**Konum:** `src/main/security/SecretStore.js:256-277`  
**Önem:** Orta (veri kaybı / webhook kesintisi)

`syncWebhooks` önce mevcut `webhook:*` kayıtlarından yeni listede olmayanları siliyor, sonra yeni sırları yazıyor. Yeni sır yazımı başarısız olursa eski sırlar çoktan silinmiş olur; webhook kimlik doğrulaması bozulur.

**Etki:** Ayar kaydetme hatası sonrası webhook'lar 401 alır; geri dönüş yok.

**Düzeltme:** Önce yeni/mevcut sırları yazın, başarılıysa stale kayıtları silin; işlemi journal/transaction benzeri yapın.

```js
async syncWebhooks(webhooks) {
    // 1) Yeni sırları yaz
    for (const hook of list) {
        // ... setSecret ...
    }
    // 2) Ancak tümü başarılıysa stale kayıtları sil
    for (const name of Object.keys(this.data.entries || {})) {
        if (name.startsWith('webhook:') && !keep.has(name)) {
            await this.deleteSecret(name);
        }
    }
}
```

Hata durumunda yazılan yeni sırları geri alacak bir `rollback` listesi tutun.

---

### O-19 — i18n yükleme hatası boş sözlük bırakıyor; sayaç çizimi `substring` ile çöküyor

**Konum:** `src/renderer/i18n.js:46-50`; `src/renderer/app.js:643-650`  
**Önem:** Orta (UI çökmesi)

`load()` başarısız olduğunda `translations = {}` yapılıyor. `updateDisplay` içinde `dict = translations[currentLang] || {}` ve ardından `dict.timeFormatDays.substring(0, 1)` çağrılıyor. `timeFormatDays` yoksa `TypeError` fırlar; sayaç render edilemez. Hata, timer tick zincirini bozabilir.

**Etki:** Dil dosyası bozuksa/eksikse geri sayım ekranı çöker; kullanıcı aktif görevi göremez.

**Düzeltme:** Güvenli fallback sözlük ve opsiyonel erişim kullanın; i18n hatasını görünür bir uyarıya dönüştürün.

```js
const dict = translations[currentLang] || {};
const daySuffix = String(dict.timeFormatDays || 'g').substring(0, 1);
```

```js
// i18n.js
const FALLBACK = { timeFormatDays: 'gün', /* kritik anahtarlar */ };
const ready = load(currentLanguage).catch((err) => {
    console.error('[i18n] locale yüklenemedi:', err && err.message);
    translations = { [currentLanguage]: FALLBACK };
    return FALLBACK;
});
```

---

### O-20 — Ayar kaydetme PIN'li otonomi kaydından önce kısmi sunucu değişikliği yapıyor

**Konum:** `src/renderer/app.js:3256-3273`  
**Önem:** Orta (kısmi kayıt / UI-server ayrışması)

Akış önce `saveSettings({ language, ...energy.patch })` ile dil/enerji ayarlarını sunucuya yazıyor; sonra otonomi modu için PIN'li `saveSecuritySettings` çağırıyor. Kullanıcı PIN modalını iptal ederse dil/enerji sunucuda değişmiş, localStorage ve form ise eski değerde kalıyor. `restoreForm` yalnızca formu geri alıyor; sunucu ayarları geri alınmıyor.

**Etki:** Kullanıcı "iptal" ettiğini sanırken dil/enerji kalıcı değişir; sonraki açılışta sürpriz davranış.

**Düzeltme:** Tüm ayarları tek atomik IPC'de, PIN doğrulamasından sonra uygulayın; PIN iptalinde hiçbir sunucu değişikliği yapılmasın.

```js
// Tek çağrı: PIN varsa doğrula, sonra tüm patch'i uygula
const res = await window.electronAPI.saveSettingsAtomic({
    settings: { language, ...energy.patch, autonomyMode },
    pin
});
```

Alternatif olarak otonomi PIN'i alınmadan `saveSettings` çağrısını yapmayın; PIN başarılı olduktan sonra tek patch gönderin.

---

### O-21 — Headless API başlatma hatasını yutuyor; stop beklemiyor; sync aralığı sınırsız

**Konum:** `src/agent/headless.js:161`, `186-194`, `200`; `main.js:206`  
**Önem:** Orta (sessiz API kesintisi / CPU storm)

- `api.start()` dönüşü kontrol edilmiyor; `EADDRINUSE`/TLS hatasında headless ajan Local API'siz çalışır, kimse fark etmez.
- `stop()` içinde `api.stop()` await edilmiyor; `storage.close()` port kapanmadan çalışabilir; yeniden başlatmada `EADDRINUSE`.
- `Number(process.env.PP_SYNC_MS) || 60000` negatif veya çok küçük değerleri kabul ediyor; `-1` setInterval'da ~1 ms tick'e, yani sürekli envanter/heartbeat'e yol açar.

**Etki:** Sessiz API kaybı, port sızıntısı, aşırı CPU.

**Düzeltme:**

```js
const started = api.start();
if (!started || started.ok === false) {
    log.error('[Headless] Local API başlatılamadı:', started && started.code);
}

const raw = Number(process.env.PP_SYNC_MS);
const syncIntervalMs = Number.isFinite(raw) ? Math.min(3_600_000, Math.max(5_000, raw)) : 60_000;
```

```js
async stop() {
    stopped = true;
    try { timers.clearAll(); } catch (_) {}
    try { await api.stop(); } catch (_) {}
    try { storage.close(); } catch (_) {}
}
```

`start()`'ı async yapıp `await api.start()` kullanın (O-01 ile birlikte).

---

### O-22 — Audit checkpoint eksikse yıkıcı eylemler kalıcı olarak bloke oluyor

**Konum:** `src/main/security/AuditCheckpoint.js:121-167`; `src/main/services/StorageService.js:1364-1369`; `main.js:388-390`  
**Önem:** Orta (kullanılabilirlik / yanlış pozitif)

`verify`, audit satırı olan her gün için checkpoint dosyası arıyor. Dosya yoksa `CHECKPOINT_MISSING` dönüyor; `verifyAuditChain` `auditTampered=true` yapıyor; `PowerService` execution guard tüm yıkıcı eylemleri bloke ediyor. Checkpoint dizini silinirse, disk temizliği yapılırsa veya ilk checkpoint yazılamazsa cihaz bir daha kapanmaz/ yeniden başlamaz.

**Etki:** Bakım/cleanup sonrası cihazlar kilitlenir; uzaktan müdahale zor.

**Düzeltme:** Eksik checkpoint'i "tamper" ile eşitlemeyin; yeniden üretilebilir/onarılabilir bir durum olarak ele alın. Yalnızca HMAC uyuşmazlığı/rollback'i tamper sayın; eksik dosyayı uyarı + otomatik yeniden yazma ile onarın.

```js
if (!fs.existsSync(file)) {
    if (this.canRebuild(day, dayRows)) {
        this.writeDay(day, dayRows, { eventLog: false });
        continue;
    }
    return { ok: false, code: 'CHECKPOINT_MISSING', day, error: `${day} checkpoint yok.` };
}
```

Onarımın denetim kaydı üretmesini sağlayın; sessizce yok saymayın. Yıkıcı eylemleri bloke etmeden önce "onarılabilir eksik" ile "gerçek tamper" ayrımını yapın.

---

## 5. Düşük Bulgular

### L-01 — localStorage ile sunucu ayarları ayrı kaynaklar; dil/otonomi ayrışabiliyor

**Konum:** `src/renderer/app.js:799-828`, `3242-3251`  
**Önem:** Düşük (UI tutarsızlığı)

`loadSettings` autostart/voice/theme/notifications/autonomy/language değerlerini localStorage'dan okuyor; sunucu ayarları ayrı bir kaynak. Özellikle dil ilk açılışta localStorage'a, sonra `saveSettings` ile sunucuya yazılıyor; iki kaynak ayrışabilir. Tema/voice gibi tercihler sunucuda yok; çoklu cihazda tutarsız.

**Düzeltme:** Dil ve otonomi için tek doğruluk kaynağı sunucu ayarları olsun; localStorage yalnızca tema gibi cihaza özel tercihler için kullanılsın. `loadSettings` `getPublicSettings()` ile senkronize edilsin.

```js
// app.js loadSettings
const s = await window.electronAPI.getPublicSettings();
const language = s.language || localStorage.getItem('language') || 'tr';
const autonomyMode = s.autonomyMode === 'full' ? 'full' : 'classic';
// theme/voice/notifications cihaza özel olduğu için localStorage'da kalabilir.
```

---

### L-02 — `showToast` sınırsız toast biriktirebiliyor

**Konum:** `src/renderer/app.js:741-790`  
**Önem:** Düşük (UI kalabalığı)

Her çağrı yeni bir DOM düğümü ekliyor; 4 saniye sonra kaldırılıyor. Yoğun hata/olay akışında onlarca toast üst üste binip ekranı kaplayabilir; `container` yoksa `appendChild` hata fırlatır.

**Düzeltme:** En fazla 3-5 toast tutun; yeni toast geldiğinde en eskiyi kaldırın veya aynı mesajı birleştirin. `container` için null kontrolü ekleyin.

```js
const MAX_TOASTS = 4;
while (container.children.length >= MAX_TOASTS) {
    container.firstElementChild?.remove();
}
```

---

### L-03 — `mini.js` DOM null kontrolleri ve async hata yakalama eksik

**Konum:** `src/renderer/mini.js:17-38`  
**Önem:** Düşük (mini pencere çökmesi)

`document.getElementById('btn-hide')`, `btn-restore`, `btn-cancel` doğrudan `.addEventListener` alıyor; HTML değişirse veya eleman yoksa `TypeError` oluşur. `cancelAction()` await'i try/catch içinde değil; IPC reddederse unhandled rejection oluşur.

**Düzeltme:**

```js
const btnCancel = document.getElementById('btn-cancel');
if (btnCancel) {
    btnCancel.addEventListener('click', async () => {
        try {
            const res = await window.electronAPI?.cancelAction?.();
            if (res && res.success === false) window.electronAPI?.restoreMainWindow?.();
        } catch (err) {
            console.warn('[Mini] iptal başarısız:', err && err.message);
        }
    });
}
```

Aynı null guard'ı `btn-hide` ve `btn-restore` için uygulayın.

---

### L-04 — Kullanılmayan 419 KB vendor dosyası ve sabit model boyutu

**Konum:** `src/vendor/tailwind.js` (418.973 bayt), `scripts/build-renderer.mjs:4`, `src/renderer/app.js:2820`  
**Önem:** Düşük (dead code / yanlış ilerleme)

`src/vendor/tailwind.js` hiçbir yerden import edilmiyor; build script'i runtime vendor'ın olmadığını açıkça söylüyor. Paket boyutunu ve saldırı yüzeyini gereksiz büyütüyor. `app.js:2820`'de model ilerlemesi için `const total = 1374389534` sabiti kullanılıyor; model boyutu değişirse yüzde yanlış olur.

**Düzeltme:** Vendor dosyasını silin. Model boyutunu `aiStatus` yanıtındaki `total`/`expectedBytes` alanından alın; yoksa bilinmeyen gösterin.

```js
const total = Number(st.model?.totalBytes) || 0;
const pct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
```

---

### L-05 — ConsoleServer küçük sertleştirmeler: `console.log`, sabit heartbeat, ham hata mesajı

**Konum:** `src/console/ConsoleServer.js:707`, `785`, `918-926`  
**Önem:** Düşük (log hijyeni / bilgi sızıntısı)

- `console.log` yerine proje logger'ı kullanılmalı.
- `publicSettings().heartbeatSeconds` 60 olarak sabit; gerçek yapılandırma değişirse istemciler yanlış bilgilendirilir.
- `handleRequest` catch'i `err.message` ve `err.code`'u doğrudan istemciye döndürüyor; iç hata ayrıntıları sızabilir.

**Düzeltme:** `log.info` kullanın; heartbeat değerini config'den türetin; istemciye genel mesaj + `requestId` dönün, ayrıntıyı sunucu logunda tutun.

```js
this.sendJson(res, 400, { error: 'İstek işlenemedi.', code: 'BAD_REQUEST', requestId });
```

---

### L-06 — Local API küçük kimlik doğrulama sertleştirmeleri

**Konum:** `src/main/services/LocalApiService.js:124-127`, `440-443`  
**Önem:** Düşük (savunma derinliği)

`extractBearerToken` yalnızca tam `Bearer ` (büyük B) kabul ediyor ve token'ı trim etmiyor; `bearer`/fazla boşluk reddediliyor. `roleOf` bilinmeyen/boş rolü `admin`'e düşürüyor; ayar bozulursa en yüksek yetki verilir.

**Düzeltme:**

```js
extractBearerToken(authHeader) {
    const m = typeof authHeader === 'string' && authHeader.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
}
```

```js
static roleOf(settings) {
    const r = settings && settings.localApiKeyRole;
    return ROLE_RANK[r] ? r : 'viewer'; // fail-closed / en az yetki
}
```

Mevcut kurulumlarla uyumluluk için geçiş planı ve test ekleyin.

---

### L-07 — Legacy audit rotasyonunda `rotatedFrom` hash kapsamı dışında

**Konum:** `src/main/services/AuditLog.js:18-20`, `85-90`  
**Önem:** Düşük (legacy mod bütünlüğü)

`hashOf` yalnızca `seq, ts, actor, action, target, detail, prevHash` alanlarını kapsıyor. Rotasyon sırasında `list[0].rotatedFrom` sonradan ekleniyor; bu alan hash'e dahil değil. Legacy modda rotasyon meta verisi değiştirilebilir.

**Düzeltme:** `rotatedFrom`'u hash'e dahil edin veya rotasyonu ayrı imzalı bir meta kaydı olarak tutun. HMAC üretim modu zaten DB zinciri kullanıyor; legacy yalnızca migrasyon/test için kalmalı.

```js
function hashOf(rec) {
    const slim = {
        seq: rec.seq, ts: rec.ts, actor: rec.actor, action: rec.action,
        target: rec.target, detail: rec.detail, prevHash: rec.prevHash,
        rotatedFrom: rec.rotatedFrom || null
    };
    return crypto.createHash('sha256').update(JSON.stringify(slim), 'utf8').digest('hex');
}

// append içinde:
if (rotatedFrom) {
    list[0].rotatedFrom = rotatedFrom;
    list[0].hash = hashOf(list[0]); // rotasyon meta verisi de zincire girer
}
```

---

### L-08 — `Acl.secureDirectory` başlangıç/kapanışta senkron ve özyinelemeli `icacls` çalıştırıyor

**Konum:** `src/main/security/Acl.js:42-84`  
**Önem:** Düşük (başlangıç gecikmesi)

`securePath`, `execFileSync('icacls', ... '/T')` ile tüm dizin ağacını senkron tarıyor; timeout 30 sn. Uygulama açılışında veya kapanışında büyük veri dizininde UI gecikebilir.

**Düzeltme:** `execFile` async kullanın; ACL'yi yalnızca kurulum/migrasyon veya izin değişikliğinde uygulayın; `/T` yerine kök dizin + yeni dosyalar için inheritance yeterli olabilir.

```js
const { execFile } = require('child_process');

function securePathAsync(target, { isDirectory = null } = {}) {
    return new Promise((resolve) => {
        // ... sid ve dir tespiti ...
        execFile('icacls', aclArgs(resolved, sid, dir), {
            timeout: 30000, windowsHide: true
        }, (err) => resolve(err
            ? { ok: false, code: 'ICACLS_FAILED', error: err.message, sid }
            : { ok: true, sid }));
    });
}
```

---

### L-09 — `PowerService` uyku eylemi `rundll32 powrprof.dll,SetSuspendState` ile ortamdan bağımsız değil

**Konum:** `src/main/services/PowerService.js:65-68`  
**Önem:** Düşük (davranış farkı)

`rundll32 powrprof.dll,SetSuspendState 0,1,0` bazı sistemlerde hibernation ayarına bağlı olarak uyku yerine hazırda bekletme yapabilir; `0,1,0` parametrelerinin yorumu Windows sürümüne göre değişebilir. Ürün "sleep" derken kullanıcı farklı davranış görebilir.

**Düzeltme:** Windows API'sini (`SetSuspendState(FALSE, TRUE, FALSE)`) native addon ile çağırın veya en azından hibernation durumunu kontrol edip kullanıcıya bilgi verin; uyku/hibernate ayrımını test matrisine ekleyin.

```js
// Önerilen: native addon (SetSuspendState FALSE, TRUE, FALSE)
const { setSuspendState } = require('./native/power');
await setSuspendState({ hibernate: false, force: true, disableWakeEvent: false });
```

Geçici çözüm olarak `powercfg /a` ile hibernation durumunu kontrol edin ve kullanıcıya "bu sistemde uyku yerine hazırda bekletme etkin" uyarısı gösterin.

---

### L-10 — Kapanış yaşam döngüsü: API stop await edilmiyor; ConsoleServer `server`'ı erken null'lıyor

**Konum:** `main.js:894`; `src/console/ConsoleServer.js:715-739`  
**Önem:** Düşük (port sızıntısı / yeniden başlatma)

`before-quit` içinde `localApiService.stop()` çağrısı await edilmiyor; süreç kapanırken port serbest kalmayabilir. `ConsoleServer.stop` `this.server = null` yapıp sonra `server.close` çağırıyor; close başarısız olursa tekrar deneme yapılamaz.

**Düzeltme:** Kapanışta `await` edilebilen bir `shutdown()` akışı kullanın (timeout'lu); `this.server`'ı close callback'inde null'layın, hata durumunda saklayın.

```js
let shuttingDown = false;
app.on('before-quit', async (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    await Promise.race([
        Promise.resolve(localApiService?.stop?.()).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
    app.quit();
});
```

```js
// ConsoleServer.stop
const server = this.server;
if (!server) return { ok: true };
await new Promise((resolve) => {
    server.close(() => {
        this.server = null;
        this.transport = 'disabled';
        resolve();
    });
});
```

---

### L-11 — Tepsi "AI'yi sustur" doğrudan `updateSettings` yazıyor; şema dışı

**Konum:** `main.js:717-721`  
**Önem:** Düşük (doğrulama bypass)

`aiSilencedUntil` doğrudan `storageService.updateSettings` ile yazılıyor; `validateSettings` şemasında yok. Geçersiz tip/süre yazılabilir; ayarın kalıcılığı ve UI ile senkronu belirsiz.

**Düzeltme:** Alanı şemaya ekleyin, aralık doğrulayın ve `save-settings` yolundan geçirin. Tepsi tıklaması renderer'daki doğrulanmış akışı tetiklesin.

```js
// validate.js
aiSilencedUntil: { int: [0, 9999999999999], nullable: true },

// main.js
const MAX_SILENCE_MS = 7 * 86400000;
if (!Number.isFinite(until) || until < Date.now() || until > Date.now() + MAX_SILENCE_MS) {
    return { success: false, code: 'INVALID_SILENCE_WINDOW' };
}
return applySettingsPatch({ aiSilencedUntil: until }, storageService.getSettings(), 'ai_silenced');
```

---

### L-12 — AI indirme/ilerleme kodu sihirbaz ve ayarlar kartında tekrarlanıyor

**Konum:** `src/renderer/app.js:2350-2705`, `2707-2854`  
**Önem:** Düşük (DRY / bakım)

İki ayrı poll, hız hesaplama, ETA, buton durumu ve hata gösterimi kopyalanmış. Biri değişince diğeri sürükleniyor; `setDlActive`/`wzDlActive` gibi ayrı durumlar tutarsız kalabilir.

**Düzeltme:** Ortak `AiDownloadController`/`useAiDownload` benzeri bir modül çıkarın; iki görünüm aynı durum makinesini ve `aiStatus` poll'unu paylaşsın.

```js
class AiDownloadController {
    constructor(api) { this.api = api; this.state = 'idle'; this.sample = null; }
    async refresh() {
        const st = await this.api.aiStatus();
        // hız/ETA/buton durumunu tek yerde hesapla
        this.state = st.download?.state || 'idle';
        return st;
    }
    async start() {
        if (this.state === 'running') return { started: false };
        this.state = 'running';
        return this.api.aiModelDownload();
    }
}
```

Sihirbaz ve ayarlar kartı aynı controller örneğini kullanmalı; yalnızca DOM render kısmı farklı olmalı.

---

### L-13 — `powerStarted` OS çağrısından önce işaretleniyor; iptal erken "çok geç" dönüyor

**Konum:** `src/main/services/TaskManager.js:451-461`  
**Önem:** Düşük (iptal penceresi)

`claim.powerStarted = true` ve `task.status = EXECUTING`, `power.execute` çağrılmadan önce yapılıyor. Kullanıcı bu kısa aralıkta iptal ederse `CANCEL_TOO_LATE` alır; oysa OS eylemi henüz başlamamıştır.

**Düzeltme:** `powerStarted`'ı gerçek `power.execute` çağrısından hemen önce işaretleyin; iptal kontrolünü bu noktaya kadar açık tutun.

```js
claim.powerStarted = true; // tam burada, execute'tan hemen önce
result = await this.power.execute(task.action);
```

---

### L-14 — `dispatchNextRolling` içinde `queueOrder` hatası yakalanmıyor

**Konum:** `src/console/ConsoleServer.js:420-425`  
**Önem:** Düşük (rolling restart stall)

`queueOrder` geçersiz eylem, dolu kuyruk veya DB hatasında throw edebilir. `dispatchNextRolling` bunu yakalamıyor; heartbeat route'unda 400'e dönüşür, `prog.awaiting` set edilmiş kalır ve rolling restart ilerlemez.

**Düzeltme:** `try/catch` ile `prog.awaiting`'i geri alın, hatayı audit'e yazın ve bir sonraki denemede tekrar seçin.

```js
try {
    this.queueOrder(next, 'restart', { requiresMaintenanceWindow: true, policyId: pol.id });
} catch (err) {
    prog.awaiting = null;
    this.consoleStore.savePolicy(pol);
    this.audit.append({ actor: 'console', action: 'rolling_dispatch_failed', target: pol.id, detail: err.message });
    return null;
}
```

---

### L-15 — Varsayılan WoL broadcast adresi VPN/Hyper-V arayüzünü seçebiliyor

**Konum:** `src/main/services/DeviceProfileService.js:27-37`  
**Önem:** Düşük (WoL başarısızlığı)

`defaultBroadcastAddress` ilk non-internal IPv4 arayüzünü alıyor. VPN, Hyper-V veya sanal adaptör varsa broadcast yanlış ağa gider; hedef cihaz uyanmaz.

**Düzeltme:** Varsayılan route'a sahip arayüzü tercih edin; kullanıcıya broadcast adresi seçtirin; sanal adaptörleri (Hyper-V, VPN, loopback) filtreleyin. `os.networkInterfaces()` sırasına güvenmeyin.

```js
function defaultBroadcastAddress(interfaces = os.networkInterfaces()) {
    const candidates = Object.entries(interfaces)
        .filter(([name]) => !/vEthernet|Hyper-V|VPN|Loopback|VirtualBox/i.test(name))
        .flatMap(([, list]) => list || [])
        .filter((i) => i && i.family === 'IPv4' && !i.internal);
    for (const info of candidates) {
        const broadcast = broadcastFromNetmask(info.address, info.netmask);
        if (broadcast && broadcast !== '0.0.0.0') return broadcast;
    }
    return '255.255.255.255';
}
```

Mümkünse Windows route tablosundan varsayılan arayüzü seçin; kullanıcıya manuel broadcast adresi alanı sunun.

---

### L-16 — Model indirmede `resumed` bayrağı ve disk alanı ön kontrolü hatalı/eksik

**Konum:** `src/main/services/ModelManager.js:284-295`  
**Önem:** Düşük (yanlış durum / disk dolması)

`resumed: actualBytes !== received ? false : received > 0` ifadesi taze indirmede de `received > 0` ise `true` dönebilir; anlamı belirsiz. Ayrıca indirme öncesi boş disk alanı kontrolü yok; büyük model indirmesi disk dolunca yarıda kalır.

**Düzeltme:** `resumed` değerini gerçekten önceki `.part` boyutuna göre hesaplayın; indirme öncesi `fs.statfs` ile `expectedBytes * 1.1` boş alan kontrolü yapın ve yetersizse erken hata döndürün.

```js
const stat = await fs.promises.statfs(path.dirname(full));
const free = stat.bavail * stat.bsize;
if (this.expectedBytes && free < this.expectedBytes * 1.1) {
    return { success: false, code: 'DISK_FULL', error: 'Yeterli disk alanı yok.' };
}
```

---

## 6. Kategori Bazlı Kontrol Matrisi

| Kategori | Sonuç | İlgili bulgular |
|---|---|---|
| Kritik çökme / veri kaybı | **Bulgu var** | K-01, K-02, Y-06, Y-08 |
| React Hooks / `useEffect` / dependency array | **N/A — React/Next.js yok** | — |
| Sonsuz döngü | **Sorun bulunmadı** | Denetlenen `setInterval`/`setTimeout` ve döngülerde sonsuz döngü tespit edilmedi. |
| Memory leak / kaynak sızıntısı | **Bulgu var** | O-09 (map büyümesi), O-10 (üst üste örnekleme), O-17 (native model), L-03 (listener/async) |
| Async race condition | **Bulgu var** | K-02, Y-03, Y-10, O-03, O-10, O-17, O-18 |
| Performance / re-render | **Bulgu var** | Y-07, Y-09, O-08, O-12, O-14, O-15; React render yok, DOM güncellemeleri hedefli. |
| Client/Server boundary | **Bulgu var** | K-01, K-02, O-02, O-03, O-06, O-07 |
| Caching | **Bulgu var** | O-03 (idempotency), O-14 (inventory cache eksik), Y-09 (audit cache yok) |
| Dead code | **Bulgu var** | L-04 (kullanılmayan vendor), L-12 (tekrarlanan AI kodu) |
| Geçici hack / TODO | **Sorun bulunmadı** | Denetlenen üretim yollarında geçici hack veya TODO bulunmadı. |
| `console.log` | **Bulgu var** | L-05 (`ConsoleServer.js:707`) |
| Yorum satırına alınmış bloklar | **Sorun bulunmadı** | Büyük commented-out blok bulunmadı; yalnızca tek satırlık "removed" notları var. |
| Mock / statik veri | **Bulgu var** | L-04 (sabit model boyutu); üretim iş mantığında mock veri yok. |
| DRY / refactor | **Bulgu var** | Y-01 (çift restore), L-12 (çift AI akışı) |
| Hardcoded config / endpoint | **Bulgu var** | L-05 (heartbeat 60), O-21 (sync aralığı), L-04 (model boyutu) |
| Hardcoded secret | **Sorun bulunmadı** | Kaynakta düz metin özel anahtar/API anahtarı bulunmadı; sırlar SecretStore/env üzerinden. |
| Input validation | **Bulgu var** | O-04, O-16, L-06 |
| Error handling / iç bilgi sızıntısı | **Bulgu var** | Y-08, L-05, O-01, O-21 |
| Scalability | **Bulgu var** | Y-09, O-08, O-14, O-15 |
| Maintainability | **Bulgu var** | L-04, L-12, Y-01, O-19 |

### 6.1. “Sorun bulunmadı” kategorileri

- **React/Next.js Hooks, `useEffect`, `useMemo`, `useCallback`, dependency array, hydration, Server/Client Component, RSC, Next.js cache:** Bu proje React/Next.js değildir; kategori **uygulanamaz (N/A)**. Renderer vanilla DOM'dur. React'e özgü bir hata raporlanamaz.
- **Sonsuz döngü:** Denetlenen timer, interval ve recursive çağrılarda koşulsuz sonsuz döngü bulunmadı. `TimerRegistry` ve `clearInterval` kullanımı genel olarak doğru.
- **Yorum satırına alınmış büyük kod blokları:** Üretim dosyalarında büyük commented-out blok bulunmadı.
- **Hardcoded production secret:** `src` altında düz metin özel anahtar, API anahtarı veya parola bulunmadı; sırlar `SecretStore`/DPAPI ve ortam değişkenleri üzerinden yönetiliyor.
- **Mock veri:** Üretim iş mantığında mock servis/veri yolu bulunmadı; yalnızca UI'da sabit model boyutu (L-04) ve sabit heartbeat (L-05) gibi statik değerler var.

---

## 7. Olumlu Kontroller

Aşağıdaki kontroller denetimde olumlu değerlendirildi; bunların korunması önerilir:

1. **Güçlü CSP:** `main.js:25` — `default-src 'none'; script-src 'self'; connect-src 'none'`; inline script/eval yok.
2. **Sandboxed renderer:** `main.js:553-555`, `654-656` — `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`.
3. **XSS yüzeyi düşük:** `src/renderer` içinde `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` kullanımı yok; DOM `textContent`/`replaceChildren` ile kuruluyor.
4. **Özel protokol:** `app://powerpilot` ve `isAllowedAppUrl` ile dış gezinme kısıtlı (`main.js:31`).
5. **İmzalı siparişler:** `SignedOrderService.js:237` hedef bağlaması (`targets === [agentId]`), `254-309` nonce/replay koruması; imza doğrulanmadan nonce işaretlenmiyor.
6. **SSRF koruması:** `WebhookService.js:94-98` — DNS çözümlemesi ve özel IP reddi.
7. **HMAC audit zinciri:** `StorageService.js:1297-1328` — her kayıt önceki HMAC'e bağlı; checkpoint doğrulaması var.
8. **Argon2id PIN:** `Pin.js:3-13` — Argon2id, 16 bayt salt; scrypt fallback yok.
9. **DPAPI/SecretStore:** `SecretStore.js:1-10` — düz metin fallback yok; atomik yazma ve ACL.
10. **LAN TLS zorunluluğu:** `LocalApiService.js:211-220` — LAN modunda TLS yoksa başlatma reddediliyor.
11. **Yerel API ACL:** `LocalApiService.js:335-341` — loopback + allowlist; yetkisiz IP reddi.
12. **Test altyapısı:** `npm test`, `test:security`, `release:check`, `locales:check`, `models:verify`, `verify:pack` gibi kapsamlı script'ler mevcut.

---

## 8. Ölçeklenebilirlik ve Bakım Önerileri

### 8.1. Audit ve konsol depolama

1. **Append-only audit:** Her yazımda tam tabloyu okumayın; son kaydı `ORDER BY seq DESC LIMIT 1` ile alın, yeni kaydı ekleyin. Bellekte yalnızca son N kaydı tutun.
2. **Sayfalama:** `/api/v1/audit`, `/api/v1/tasks` ve `get-audit` için `limit`/`beforeSeq`/`offset` ekleyin; varsayılan 100-200.
3. **Retention/arşiv:** Audit'i silmeden önce checkpoint alın; ayrı arşiv tablosu/dosyası oluşturun; `queues`/`receipts` için acked/expired temizliği yapın.
4. **İndeksler:** `audit(ts)`, `queues(state, created_at)`, `receipts(received_at)`, `orders(agent_id, state)`.
5. **Snapshot ayrıştırma:** `ConsoleStore.snapshot()` audit içermesin; audit ayrı ve sayfalı endpoint'ten okunsun.

### 8.2. Ana thread ve alt süreçler

1. **Audit Event Log yazımını worker thread'e** taşıyın; `execFileSync` kullanmayın.
2. **Envanter toplamayı cache'leyin:** Donanım detayları boot/5-15 dakika; heartbeat'te delta.
3. **DeviceProfiler ölçümlerini** tek PowerShell çağrısında toplayın veya paralel yapın; toplam bütçe 5-8 sn.
4. **SafetyPolicyEngine kontrollerini** paralel ve bütçeli çalıştırın; sonuçları önceden ısıtın.
5. **MetricCollector** için worker/AbortController ile gerçek iptal sağlayın; timeout sonrası yeni tick'i alt iş bitene kadar başlatmayın.

### 8.3. Güvenlik ve kimlik

1. **Ajan başına anahtar:** Ortak `CONSOLE_AGENT_KEY` kaldırılsın; her ajan için `agentId` bağlı, rotasyonlu anahtar.
2. **Renderer DTO:** `get-settings` redakte edilmiş whitelist döndürsün; sırlar renderer'a hiç gitmesin.
3. **PIN'li tüm güvenlik ayarları:** Tepsi dahil her yol `security-settings-update`/PIN akışına bağlansın.
4. **Kill-switch semantiği:** Heartbeat her zaman sürsün; yalnızca icra dursun. Manuel sync de aynı kurala uysun.
5. **Idempotency:** `consoleOrderId` için DB unique constraint + `createTask` dedupe; görev oluşturma/ack outbox transaction'ı.
6. **Rate limit:** Konsol ve Local API'de auth sonrası anahtar+IP bazlı limit; auth failure için ayrı sayaç.

### 8.4. Bakım ve test

1. **Tek restore yolu:** `restoreActiveState`/`restoreActiveTimer` birleştirilsin; aktif sayaç görünümü için UI testi.
2. **Tek AI indirme denetleyicisi:** Sihirbaz ve ayarlar aynı durum makinesini kullansın.
3. **Kullanılmayan vendor'ı silin:** `src/vendor/tailwind.js`; paket boyutu ve SBOM temizliği.
4. **Regresyon testleri:** Aşağıdaki senaryolar için entegrasyon testi ekleyin:
   - Cihaz 3 gün kapalıyken tekrarlayan görev sonraki occurrence'ı almalı.
   - `agentDisabled=true` iken heartbeat atılmalı; konsol `disabled=false` dönünce icra tekrar başlamalı.
   - `console-sync` `disabled:true` yanıtında kuyruğu boşaltmamalı.
   - Ayar/görev persist hatasında IPC `success:false` dönmeli.
   - Audit checkpoint eksikken yıkıcı eylem bloke olmamalı (onarım akışı).
   - Aynı `consoleOrderId` iki kez işlendiğinde tek görev oluşmalı.
5. **Operasyonel runbook:** Checkpoint onarımı, ajan anahtarı rotasyonu, audit arşivleme, konsol port çakışması ve TLS sertifika yenileme adımlarını dokümante edin.
6. **Dağıtım öncesi komutlar:** `npm test`, `npm run test:security`, `npm run locales:check`, `npm run models:verify`, `npm run release:check`, `npm run verify:pack`, `npm run sbom`, `npm run audit:licenses`.

---

## 9. Öncelikli Düzeltme Yol Haritası

| Aşama | İşler | Tahmini etki |
|---|---|---|
| **P0 — Yayın blokajı** | K-01, K-02, Y-05, Y-06 | Sır sızıntısı, ajan kimlik taklidi, PIN bypass, veri kaybı |
| **P1 — Güvenilirlik** | Y-01, Y-02, Y-03, Y-04, Y-10 | Aktif görev görünürlüğü, tekrarlayan politikalar, kill-switch, mükerrer icra |
| **P2 — Çökme/performans** | Y-07, Y-08, Y-09, O-08, O-14, O-15 | Ana thread kilitlenmesi, konsol çökmesi, audit/DB büyümesi |
| **P3 — API sertleştirme** | O-01..O-07, O-16, O-22 | Bind hataları, rate limit, idempotency, input validation, checkpoint onarımı |
| **P4 — Bakım** | O-09..O-21, L-01..L-16 | Smart Finish, metrik, webhook, i18n, UI tutarlılığı, dead code |

---

## 10. Ek: İncelenen Ana Dosyalar

- `main.js` — Electron ana süreç, IPC, tepsi, ayarlar, kapanış.
- `preload.js` — renderer IPC köprüsü.
- `src/main/services/` — `TaskManager`, `StorageService`, `LocalApiService`, `ConsoleClient`, `OrderExecutor`, `OrderQueue`, `SignedOrderService`, `EnterprisePolicies`, `SmartFinishEngine`, `MetricCollector`, `SafetyPolicyEngine`, `InventoryService`, `DeviceProfiler`, `DeviceProfileService`, `UpsMonitor`, `WebhookService`, `TaskSchedulerBridge`, `AiBackend`, `SttService`, `ModelManager`, `SecretStore`, `AuditLog`, `PowerService`.
- `src/main/security/` — `AuditCheckpoint`, `SecretStore`, `Pin`, `Acl`, `TlsConfig`, `safeCompare`, `Redact`.
- `src/main/storage/` — `Database`, `DbWorker`, `Backup`.
- `src/main/ipc/` — `validate`, `pinGuard`, `SenderGuard`, `warningActions`.
- `src/renderer/` — `app.js`, `mini.js`, `i18n.js`, `font-ready.js`.
- `src/console/` — `ConsoleServer`, `ConsoleStore`, `run.js`.
- `src/agent/` — `headless.js`.
- `src/vendor/tailwind.js` — kullanılmadığı doğrulandı (L-04).

> **Not:** Satır numaraları bu denetimdeki sürüme (1.1.0) aittir; kod değiştikçe kayabilir. Düzeltmeler uygulanmadan önce ilgili testler ve `release:check` çalıştırılmalıdır.

---

**Denetim sonucu:** Uygulama güçlü bir güvenlik temeline (CSP, sandbox, imzalı sipariş, HMAC audit, Argon2id PIN) sahip; ancak yayın öncesi **K-01 ve K-02** mutlaka kapatılmalı, ardından **Y-01..Y-10** ve **O-01..O-22** için planlı düzeltme yapılmalıdır. Bu rapor uygulama kaynak kodunu değiştirmez; yalnızca denetim ve öneri niteliğindedir.

