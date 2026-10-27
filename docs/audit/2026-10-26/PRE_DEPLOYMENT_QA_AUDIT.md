# Power_Pilot — Yayın Öncesi QA & Mimari Denetim Raporu

**Proje:** Power_Pilot (Electron + vanilla JS)
**Sürüm bağlamı:** `package.json` → Electron 43.4.0, `better-sqlite3`
**Son commit:** `77a40a5` (çalışma ağacı temiz)
**Denetim tarihi:** 2026-10-24
**Kapsam:** `main.js`, `preload.js`, `src/renderer/`, `src/main/`, `src/console/`, `src/agent/`
**Kapsam dışı:** Yapılandırma dosyaları (`package.json`, `electron-builder` config, `.eslintrc`, CI tanımları), `node_modules`, build çıktıları.
**Ek ölçüm (26.10.2026):** Ürün kodunun dışında kalan **sürüm kapıları** da ölçüldü; sonuçlar `tests/BASELINE.md`'de. Bu ölçüm iki kapı kusuru üretti: kapsam kapısı bugün kırmızı ve `main.js`/renderer'ı ölçmüyor (**M-12**) ve `npm run pack` CWD gölgelemesi yüzünden sessizce hiç derleme yapmıyordu (düzeltildi: `electron-builder.config.cjs` + `--publish never`).

---

## 0. Kapsam Notu ve Yöntem

Bu proje **Next.js/React değil**; Electron ana süreç + vanilla JS renderer mimarisi kullanıyor. `src/app/` dizini **mevcut değil** — renderer giriş noktası `src/renderer/app.js` (3.207 satır, tek dosya). React'e özgü kavramlar (state, `useEffect` cleanup, memoization) bu raporda **DOM/JS karşılıklarıyla** ele alınmıştır:

| React kavramı | Bu projedeki karşılığı |
|---|---|
| `useEffect` cleanup | `setInterval` / `addEventListener` / IPC listener temizliği |
| Re-render maliyeti | `innerHTML` / `textContent` güncellemeleri, DOM yeniden çizimi |
| `useMemo` | Tekrarlanan `getActiveState()` / `loadTasks()` çağrılarının önlenmesi |
| Prop drilling | Global `window.electronAPI` üzerinden IPC çağrıları |

**Yöntem:** Dosya-dosya tam okuma + hedefli `grep` taramaları (`console.*`, `setInterval`/`setTimeout`, `innerHTML`/`eval`, PIN `await` zincirleri, ayar kaydetme akışları). Her bulgu **mevcut kod** üzerinden doğrulanmış, satır numaraları yazım anında yeniden kontrol edilmiştir.

**Bulgu dağılımı:**

| Öncelik | Adet |
|---|---|
| Kritik | 4 |
| Yüksek | 6 |
| Orta | 12 |
| Düşük | 13 |
| **Toplam** | **35** |

> **Not:** Beş zorunlu kategori (Hata & Mantık, Performans, Kod Temizliği, Veri Bütünlüğü & Hata Yönetimi, İyileştirme Önerileri) için de en az bir bulgu tespit edilmiştir. Bu nedenle raporda "Sorun bulunmadı" ifadesi kullanılmamıştır. Kategori bazlı çapraz indeks Bölüm 5'tedir.

**Genel değerlendirme:** Güvenlik duruşu güçlü (CSP meta + header, `app://` protokolü, `SenderGuard`, `sandbox`/`contextIsolation`, SSRF guard, Argon2id PIN, HMAC denetim zinciri, Electron fuses). **Kritik** bölümdeki iki `await` eksikliği (C-01/C-02) bu turda düzeltildi ve regresyon testiyle kilitlendi; ancak **C-03 (`startTimer`) ve C-04 (PIN değiştirme mevcut PIN'i doğrulamıyor) açık** — bu haliyle yayına çıkılmamalıdır.

---

## 1. KRİTİK

### C-01 — `warning-cancel` async PIN kontrolünü `await` etmiyor; iptal mantığı ölü kod

**Kategori:** Hata & Mantık (Güvenlik)
**Dosya:** `main.js:1185-1201`
**Durum (26.10.2026):** **düzeltildi** — `src/main/ipc/warningActions.js` + `await`, 9 regresyon testi (`tests/main/warning-pin.test.mjs`), renderer başarı kapısı. Ayrıntı: `docs/planning/archive/REMEDIATION_PLAN_WBS.md` §0.3 (F1–F3).

**Sorunlu kod:**
```js
ipcHandle('warning-cancel', (event, args) => {
    const pinCheck = requireCancelPin(args && args.pin);   // ← Promise döner
    if (pinCheck) return pinCheck;                          // ← her zaman truthy
    // ... aşağısı ASLA çalışmaz
    if (taskManager && typeof taskManager.cancelActiveTask === 'function') {
        const r = taskManager.cancelActiveTask();
        ...
```

`requireCancelPin` `async` (`main.js:87`) ve başarıda `null`, başarısızlıkta nesne döndürüyor. `await` olmadığı için `pinCheck` bir **Promise**'tir; `if (pinCheck)` her zaman `true` olur. Handler, `cancelActiveTask()` / `cancelActiveWarning()` çağrılarına hiç ulaşmadan Promise'i döndürür.

**Etki:**
- Kullanıcı uyarı banner'ındaki **Durdur**'a bastığında görev **iptal edilmez**; yalnızca PIN doğrulanmış olur.
- Renderer tarafı sonucu `isPinChallenge(res)` ile kontrol eder (`app.js:2963`); dönen değer `null` olduğu için bu kontrol `false` çıkar ve `hideWarningBanner()` **koşulsuz** çalışır (`app.js:2971`).
- Sonuç: kullanıcı görevi iptal ettiğini sanır, banner kaybolur, **güç eylemi planlandığı gibi çalışır**. Bu, ürünün en kritik güvenlik vaadinin (son anda durdurma) sessizce çökmesidir.

**Düzeltme:**
```js
ipcHandle('warning-cancel', async (event, args) => {
    const pinCheck = await requireCancelPin(args && args.pin);   // await eklendi
    if (pinCheck) return pinCheck;

    if (taskManager && typeof taskManager.cancelActiveTask === 'function') {
        const r = taskManager.cancelActiveTask();
        if (r.code === 'CANCEL_TOO_LATE') {
            return { success: false, code: 'CANCEL_TOO_LATE', message: t('errorCancelTooLate') };
        }
        if (r.ok) return { success: true, code: r.code };
    }
    const closed = warningManager.cancelActiveWarning();
    return { success: closed === true, code: closed ? 'CANCELLED' : 'NO_ACTIVE_WARNING' };
});
```

**Ek savunma (renderer):** sonuç ne olursa olsun banner'ı gizlemek yerine başarıyı doğrulayın:
```js
const res = await window.electronAPI.warningCancel();
if (isPinChallenge(res)) { /* ... */ return; }
if (!res || res.success !== true) {
    showToast((res && res.message) || t('errorCancelTooLate'), 'error');
    return;                       // banner açık kalsın
}
hideWarningBanner();
```

---

### C-02 — `warning-snooze` aynı `await` hatasını taşıyor; erteleme hiç uygulanmıyor

**Kategori:** Hata & Mantık (Güvenlik)
**Dosya:** `main.js:1203-1207`
**Durum (26.10.2026):** **düzeltildi** — C-01 ile aynı paket (`warningActions.js`, `await`, renderer başarı kapısı).

**Sorunlu kod:**
```js
ipcHandle('warning-snooze', (event, payload) => {
    const minutes = payload && typeof payload === 'object' ? payload.minutes : payload;
    const pin = payload && typeof payload === 'object' ? payload.pin : undefined;
    const pinCheck = requireCancelPin(pin);   // ← await yok
    if (pinCheck) return pinCheck;            // ← her zaman truthy
```

**Etki:** C-01 ile aynı sınıf hata. **Ertele**'ye basan kullanıcı için:
- `taskManager.snoozeTask(...)` ve `warningManager.snoozeActiveWarning(m)` **hiç çağrılmaz**.
- Renderer `hideWarningBanner()` çağırır (`app.js:2985`) → banner kaybolur, görev ertelenmez, **orijinal zamanında çalışır**.
- Kullanıcı "10 dakika erteledim" sanırken cihaz kapanır. Veri kaybı riski yüksek senaryo.

**Düzeltme:**
```js
ipcHandle('warning-snooze', async (event, payload) => {
    const minutes = payload && typeof payload === 'object' ? payload.minutes : payload;
    const pin = payload && typeof payload === 'object' ? payload.pin : undefined;

    const pinCheck = await requireCancelPin(pin);   // await eklendi
    if (pinCheck) return pinCheck;

    const m = Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 10;
    if (taskManager && typeof taskManager.snoozeTask === 'function') {
        const active = typeof warningManager.getActiveState === 'function'
            ? warningManager.getActiveState() : null;
        if (active && active.taskId) {
            const r = taskManager.snoozeTask(active.taskId, m);
            if (r.ok) return { success: true, code: r.code, minutes: m };
            if (r.code === 'ALREADY_RUNNING' || r.code === 'CANCEL_TOO_LATE') {
                return { success: false, code: r.code, message: t('taskSnoozeFailed') };
            }
        }
    }
    const snoozed = warningManager.snoozeActiveWarning(m);
    return { success: snoozed === true, code: snoozed ? 'SNOOZED' : 'NO_ACTIVE_WARNING' };
});
```

**Regresyon testi (zorunlu):** `warning-cancel`/`warning-snooze` için "PIN doğru → görev CANCELLED/SNOOZED", "PIN yanlış → görev durumu değişmedi", "PIN yok → `PIN_REQUIRED`" olmak üzere üç birim testi eklenmeli. Mevcut test setinde bu üç durum yok — hata bu yüzden fark edilmemiş.

---

### C-03 — `restoreActiveState()` var olmayan `startTimer()` fonksiyonunu çağırıyor; sayaç geri yüklenmiyor

**Kategori:** Hata & Mantık
**Dosya:** `src/renderer/app.js:2923` (tanım: `app.js:526`)

**Sorunlu kod:**
```js
// app.js:2920-2924
const remaining = Math.max(1, Math.round((timer.trigger.targetTime - Date.now()) / 1000));
selectedAction = timer.action;
currentActionString = getActionString(timer.action);
startTimer(remaining);            // ← böyle bir fonksiyon YOK
switchView('nav-active');
```

Dosyada yalnızca `startTimerTo(targetTime, totalSeconds)` tanımlı (`app.js:526`). `startTimer` hiçbir yerde tanımlanmamış (`grep` ile doğrulandı: tek eşleşme bu çağrı).

**Etki:**
- Çağrı `ReferenceError` fırlatır; çevreleyen `try/catch (_)` bloğu (`app.js:2925`) hatayı **sessizce yutar**.
- Pencere yenilendiğinde (veya renderer reload) **aktif geri sayım görsel olarak geri gelmez**; kullanıcı sayaç olmadığını görür ama görev arka planda çalışmaya devam eder.
- `switchView('nav-active')` de çalışmadığı için kullanıcı yanlış ekranda kalır → "görev kayboldu" algısı ve yanlış güvenlik varsayımı.

**Düzeltme (tek ve doğru geri yükleme yolu):**
```js
const timer = tasks.find((t) => t && t.status === 'scheduled'
    && t.source === 'user_interface'
    && t.trigger && Number.isFinite(t.trigger.targetTime)
    && t.trigger.targetTime > Date.now());

if (!timer) {
    const monitoring = tasks.some((t) => t
        && ['monitoring', 'waiting', 'warning', 'executing'].includes(t.status));
    if (monitoring || st.activeWarning) switchView('nav-active');
    return;
}

const created = timer.createdAt ? Date.parse(timer.createdAt) : Date.now();
const total = Math.max(1, Math.ceil((timer.trigger.targetTime - created) / 1000));

selectedAction = timer.action;
currentActionString = getActionString(timer.action);
timerExecutionTaskId = timer.id;
startTimerTo(timer.trigger.targetTime, total);   // ← doğru fonksiyon + doğru total
switchView('nav-active');
```

> `totalSeconds` progress bar'ın paydası olduğu için **kalan süre değil**, görevin toplam süresi verilmelidir (`app.js:700-704`).

**Ek:** `catch (_)` bloğunu tamamen sessiz bırakmak yerine `console.warn('[restore] ...', err)` ile loglayın; bu hata sınıfı aylarca görünmez kalmasının nedeni tam olarak bu.

---

### C-04 — `set-cancel-pin` / `clear-cancel-pin` mevcut PIN'i doğrulamıyor; PIN kapısı tek adımda kaldırılabiliyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi (Güvenlik)
**Dosya:** `main.js:1067-1078`

**Sorunlu kod:**
```js
ipcHandle('set-cancel-pin', async (event, args) => {
    const pin = args && args.pin;
    const check = validateCancelPin(pin);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    const hash = await Pin.hashPin(pin);
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: hash });  // ← mevcut PIN sorulmuyor
    return { success: true };
});
ipcHandle('clear-cancel-pin', () => {
    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: null });  // ← hiç doğrulama yok
    return { success: true };
});
```

**Etki:** PIN'in tüm amacı, fiziksel erişimi olan birinin güç eylemini durdurmasını engellemektir. Ama:
1. Saldırgan `clear-cancel-pin` çağırır → PIN kalkar.
2. Ardından `warning-cancel` (C-01 düzeltildikten sonra bile) PIN istemez → görev iptal edilir.
3. `set-cancel-pin` ile kendi PIN'ini koyup meşru kullanıcıyı kilitleyebilir.

Yani C-01/C-02 düzeltilse dahi **PIN kapısı tek IPC çağrısıyla atlatılabilir**. Renderer'da PIN sorulması güvenlik sınırı değildir; sınır ana süreçtir.

**Düzeltme:**
```js
ipcHandle('set-cancel-pin', async (event, args) => {
    const { pin, currentPin } = args || {};
    const hasExisting = !!storageService.getSettings().cancelPinHash;

    if (hasExisting) {
        const gate = await requireSecurityPin(currentPin);
        if (gate) return gate;              // PIN_REQUIRED / PIN_INVALID / RATE_LIMITED
    }
    const check = validateCancelPin(pin);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };

    const hash = await Pin.hashPin(pin);
    const persisted = storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: hash });
    if (persisted === false) return { success: false, code: 'SAVE_FAILED', message: t('errorSaveFailed') };

    auditLog.append({ actor: 'user_interface', action: 'cancel_pin_set', target: 'settings' });
    return { success: true };
});

ipcHandle('clear-cancel-pin', async (event, args) => {
    const gate = await requireSecurityPin(args && args.pin);
    if (gate) return gate;

    storageService.updateSettings({ cancelPinSalt: null, cancelPinHash: null });
    auditLog.append({ actor: 'user_interface', action: 'cancel_pin_cleared', target: 'settings' });
    return { success: true };
});
```

**Not:** `requireSecurityPin` (`main.js:114`) zaten aynı `pinGuard` sayacını kullanıyor; yeniden kullanmak deneme sınırlamasını da korur.

---

## 2. YÜKSEK

### H-01 — `LocalApiService.start()` bind hatasını yutmuyor ama başarıyı da beklemiyor; `{ ok: true }` yanlış

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/main/services/LocalApiService.js:246-268` · tüketici: `main.js:1330-1335`

**Sorunlu kod:**
```js
let fallbackTried = false;
const bind = (bindHost) => {
    this.boundHost = bindHost;
    this.server.listen({ port, host: bindHost, ipv6Only: false }, () => {
        log.info(`[LocalApiService] Running (${this.transport}) on ${bindHost}:${port}`);
    });
};

this.server.on('error', (err) => {
    log.error('[LocalApiService] Server error:', err.message);
    const noIpv6 = err && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL');
    if (!fallbackTried && host === '::' && noIpv6) { /* ... */ }
});                     // ← EADDRINUSE vb. sadece loglanıyor

bind(host);
return { ok: true, transport: this.transport, host };   // ← bind sonucu bilinmeden dönüyor
```

**Etki:**
- `EADDRINUSE`, `EACCES`, `EADDRNOTAVAIL` durumlarında `start()` yine `{ ok: true }` döner.
- `main.js:1333`'teki geri alma kontrolü (`started.ok === false`) **hiçbir zaman** tetiklenmez → kullanıcıya "Ayarlar kaydedildi" denir, API çalışmıyordur.
- `this.server` **dinlemeyen** bir sunucuya işaret eder; bir sonraki `start()` `ALREADY_RUNNING` döner (`:227-230`) ve kullanıcı yeniden başlatana kadar API ölü kalır.
- LAN modunda ajanlar bağlanamaz; saha ekibi sebebi göremez (log yalnızca yerel).

**Düzeltme — `start()`'ı `Promise` döndürecek şekilde yeniden yazın:**
```js
start() {
    // ... mevcut ön kontroller (API_DISABLED, LAN_REQUIRES_TLS, TLS_MATERIAL_MISSING) ...
    if (this.server) return Promise.resolve({ ok: false, code: 'ALREADY_RUNNING' });

    // ... createServer / timeout ayarları ...

    return new Promise((resolve) => {
        const server = this.server;

        const cleanup = () => {
            server.removeListener('error', onError);
            server.removeListener('listening', onListening);
        };
        const fail = (code) => {
            cleanup();
            this.server = null;
            this.transport = 'disabled';
            resolve({ ok: false, code });
        };
        const onError = (err) => fail(err && err.code ? err.code : 'BIND_FAILED');
        const onListening = () => {
            cleanup();
            resolve({ ok: true, transport: this.transport, host: this.boundHost });
        };

        server.once('error', onError);
        server.once('listening', onListening);
        this.boundHost = host;
        server.listen({ port, host, ipv6Only: false });
    });
}
```

**Çağıranların güncellenmesi:**
```js
// main.js:1331
const started = await localApiService.restart();
if (started && started.ok === false) {
    // ayarları geri al + kullanıcıya code'lu mesaj göster
    throw Object.assign(new Error(`API yeniden başlatılamadı: ${started.code}`), { code: started.code });
}
```
`restart()` ve `src/agent/headless.js:161` de `await` etmelidir (bkz. M-08).

---

### H-02 — Idempotency önbelleği yalnızca `Idempotency-Key` ile anahtarlanıyor ve 4xx yanıtları da önbelleğe alıyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/main/services/LocalApiService.js:385-396`, `:750-759`

**Sorunlu kod:**
```js
// :385-396
const idemKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
if (idemKey) {
    this.pruneIdempotency();
    const cached = this.idempotencyCache.get(idemKey);
    if (cached) return this.sendJson(res, cached.status, cached.body);   // ← endpoint/aktör ayrımı yok
    ...
    res.__ppIdempotencyKey = idemKey;
}

// :750-759
sendJson(res, statusCode, data) {
    if (res && res.__ppIdempotencyKey && statusCode < 500) {             // ← 400/401/403/404/409/413/429 da cache'lenir
        this.idempotencyCache.set(res.__ppIdempotencyKey, { status: statusCode, body: data, expiresAt: ... });
    }
    ...
}
```

**Etki:**
1. **Çapraz uç nokta sızıntısı:** Ajan `POST /api/v1/orders` için `Key: k1` kullanıp sonra `GET /api/v1/inventory` için aynı `k1`'i gönderirse, **sipariş yanıtını** envanter yanıtı sanır.
2. **4xx kalıcılaşması:** Bir kez `429` (rate limit) alan istemci, 10 dakika boyunca aynı anahtarla **her zaman 429** alır — kendini kilitlemiş olur. Aynı şey `409 CONFLICT` ve `401` için de geçerli; token yenilendikten sonra bile eski `401` döner.
3. **Aktörler arası sızıntı:** İki farklı ajan aynı anahtarı kullanırsa biri diğerinin yanıtını (potansiyel olarak sipariş detayı) görür.

**Düzeltme:**
```js
// Anahtar: yöntem + yol + rol + istemci anahtarı
const cacheKey = `${method} ${pathname} ${role || '-'} ${idemKey}`;
const cached = this.idempotencyCache.get(cacheKey);
if (cached) {
    res.setHeader('Idempotent-Replay', 'true');
    return this.sendJson(res, cached.status, cached.body, { skipCache: true });
}
res.__ppIdemCacheKey = cacheKey;
```
```js
sendJson(res, statusCode, data, opts = {}) {
    const cacheable = !opts.skipCache && res.__ppIdemCacheKey
        && (statusCode < 300 || statusCode === 409);   // yalnızca başarı + çakışma
    if (cacheable) {
        this.idempotencyCache.set(res.__ppIdemCacheKey, {
            status: statusCode, body: data, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS
        });
    }
    if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
    }
    res.end(JSON.stringify(data));
}
```

**Ek:** `401`/`403`/`429` için `Retry-After` başlığı döndürün ve bu yanıtları asla önbelleğe almayın.

---

### H-03 — `ConsoleServer.start()` bind hatasını ele almıyor; `handleRequest` ham hata mesajı sızdırıyor

**Kategori:** Hata & Mantık + Veri Bütünlüğü
**Dosya:** `src/console/ConsoleServer.js:705-709`, `:760-788`

**Sorunlu kod:**
```js
// :705-709
this.server.listen(port, host, () => {
    console.log(`[Console] ${this.transport}://${host}:${port} (ajanlar outbound bağlanır)`);
});
return this.server;                 // ← 'error' dinleyicisi yok
```
```js
// :763 — try/catch DIŞINDA
const parsed = new URL(req.url, 'http://x');
```
```js
// :784-786
Promise.resolve(this.route(...)).catch((err) => {
    try { this.sendJson(res, 400, { error: (err && err.message) || 'İstek hatası.', ... }); } catch (_) {}
});
```

**Etki:**
1. **Süreç çökmesi:** Node'da dinleyicisiz `'error'` olayı **yakalanmamış istisna** demektir. Port 8443 doluysa (başka bir örnek, başka bir servis) konsol süreci tamamen kapanır. `start()` `server` döndürdüğü için çağıran taraf da bunu fark etmez.
2. **Bilgi sızıntısı:** `err.message` doğrudan HTTP yanıtına yazılıyor. `ENOENT: no such file or directory, open 'C:\Users\...\secrets.bin'` gibi mesajlar ağ üzerinden okunabilir hale gelir.
3. **Yanlış durum kodu:** Sunucu kaynaklı hatalar `400 Bad Request` olarak dönüyor; ajanlar bunu "benim isteğim bozuk" sanıp gereksiz yeniden deneme/backoff uygular.
4. `new URL(req.url, ...)` try/catch dışında; bozuk bir request-target (`//[`) süreç düzeyinde hata üretir.

**Düzeltme:**
```js
start(port = 8443, host = '0.0.0.0', tlsSettings = {}) {
    // ... mevcut kontroller ...
    this.server.on('error', (err) => {
        const code = (err && err.code) || 'CONSOLE_SERVER_ERROR';
        // eslint-disable-next-line no-console
        console.error(`[Console] Sunucu hatası (${code}):`, err && err.message);
        try { this.server.close(); } catch (_) { /* yut */ }
        this.server = null;
        this.transport = 'disabled';
    });
    this.server.listen(port, host, () => { /* log */ });
    return this.server;
}
```
```js
handleRequest(req, res) {
    let parsed;
    try {
        parsed = new URL(req.url, 'http://x');
    } catch (_) {
        return this.sendJson(res, 400, { error: 'Geçersiz istek yolu.', code: 'BAD_REQUEST_TARGET' });
    }
    // ...
}
```
```js
Promise.resolve(this.route(...)).catch((err) => {
    const status = err && err.statusCode ? err.statusCode : 500;
    const isServerError = status >= 500;
    if (isServerError) console.error('[Console] route hatası:', err && err.stack);
    try {
        this.sendJson(res, status, {
            error: isServerError ? 'Sunucu hatası.' : ((err && err.message) || 'İstek hatası.'),
            code: (err && err.code) || (isServerError ? 'INTERNAL_ERROR' : 'BAD_REQUEST')
        });
    } catch (_) { /* istemci koptu */ }
});
```

---

### H-04 — API ayarları iki ayrı, atomik olmayan IPC çağrısıyla kaydediliyor; PIN iptalinde yarım durum kalıyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/renderer/app.js:1839-1868`

**Sorunlu kod:**
```js
if (window.electronAPI && window.electronAPI.saveSettings) {
    const res = await window.electronAPI.saveSettings({          // 1. adım — PIN'siz
        localApiPort: port,
        lanAllowedIps: ips,
        blockRemoteShutdownWhenActive: blockRemote
    });
    if (res && res.success === false) { /* ... */ return; }
    paintApiBadge(enabled, port);

    const sec = await saveSecuritySettings({                     // 2. adım — PIN'li
        localApiEnabled: enabled,
        lanModeEnabled: lan,
        localApiTlsEnabled: tls,
        /* ... */
    }, () => { /* ... */ });

    if (sec && sec.success === false && !sec.pendingPin) { /* ... */ return; }
}
```

**Etki:** Kullanıcı **Kaydet**'e basar, PIN modalı açılır, kullanıcı **Vazgeç**'e basar:
- `localApiPort`, `lanAllowedIps`, `blockRemoteShutdownWhenActive` **diske yazılmıştır**.
- `localApiEnabled`, `lanModeEnabled`, TLS ayarları **eski değerinde kalır**.
- Sonuç: kullanıcının onaylamadığı bir port/allowlist değişikliği, onayladığını sandığı bir bütünlük içinde yürürlükte kalır. Örn. allowlist daraltılmışsa ve PIN iptal edilmişse, eski (geniş) allowlist ile yeni port birleşimi hiçbir ekranda görünmez.

Ayrıca iki ayrı `updateSettings` → iki ayrı SQLite transaction + iki ayrı `localApiService.restart()` (`main.js:1330`). Sunucu iki kez yeniden başlar; arada kısa bir "hiç dinlemiyor" penceresi oluşur.

**Düzeltme — tek IPC, tek transaction:**
```js
// renderer
const payload = {
    localApiPort: port,
    lanAllowedIps: ips,
    blockRemoteShutdownWhenActive: blockRemote,
    localApiEnabled: enabled,
    lanModeEnabled: lan,
    localApiTlsEnabled: tls,
    localApiTlsStrict: tlsStrict,
    localApiRequireClientCert: requireClientCert,
    localApiCertFile: certFile,
    localApiKeyFile: keyFile,
    localApiClientFingerprints: fingerprints
};

const sec = await saveSecuritySettings(payload, () => {
    paintApiBadge(enabled, port);
    showToast(t('toastApiSaved'), 'success');
});
if (sec && sec.success === false && !sec.pendingPin) {
    showToast(sec.message || t('errorSaveFailed'), 'error');
    return;
}
if (sec && sec.pendingPin) return;      // PIN bekleniyor — hiçbir şey yazılmadı
```
```js
// main.js — ayar handler'ı: PIN kapısı ÖNCE, yazma SONRA
const gate = await requireSecurityPin(args.pin);
if (gate) return gate;

const prev = { ...storageService.getSettings() };
const persisted = storageService.updateSettings(rest);      // tek çağrı
if (persisted === false) return { success: false, code: 'SAVE_FAILED', message: t('errorSaveFailed') };

if (needsRestart) {
    const started = await localApiService.restart();
    if (started && started.ok === false) {
        storageService.updateSettings(prev);                 // tam geri alma
        return { success: false, code: started.code, message: t('errorApiRestartFailed') };
    }
}
```

---

### H-05 — İki ayrı "aktif durumu geri yükle" yolu çalışıyor; `getActiveState()` çift çağrılıyor ve yarış oluşuyor

**Kategori:** Performans + Hata & Mantık
**Dosya:** `src/renderer/app.js:2927` ve `app.js:3399` (gövdeler: `:2893-2926`, `:545-560`)

**Sorunlu kod:**
```js
// app.js:2893
async function restoreActiveState() { const st = await window.electronAPI.getActiveState(); /* ... */ }
restoreActiveState();            // :2927 — startup'ta

// app.js:545
async function restoreActiveTimer() { const state = await window.electronAPI.getActiveState(); /* ... */ }

// app.js:3399 — startup'ta İKİNCİ kez
restoreActiveTimer();
```

**Etki:**
- Açılışta `getActiveState()` **iki kez** IPC'ye gider; her çağrı ana süreçte `taskManager.getActiveState()` + tüm görev listesinin serileştirilmesi demektir (görev sayısıyla doğrusal).
- İki fonksiyon da `startTimerTo()` çağırır (`app.js:300` ve `:558`). C-03 düzeltildiğinde **iki sayaç** başlar: `countdownInterval` global'i ikinci çağrıda üzerine yazılır, birinci `setInterval` **sahipsiz kalır** ve asla `clearInterval` edilmez → saniyede iki `timerTick`, kalıcı CPU + yanlış süre gösterimi.
- `restoreActiveTimer` içindeki `if (timerTargetTime && Date.now() < timerTargetTime) return;` (`:547`) koruması yalnızca bu fonksiyona ait; `restoreActiveState` bu korumayı bilmiyor.

**Düzeltme — tek giriş noktası:**
```js
// app.js:2893 — restoreActiveState'ten timer dalını ÇIKAR, sadece banner + görünüm kalsın
async function restoreActiveState() {
    if (!window.electronAPI || !window.electronAPI.getActiveState) return;
    try {
        const st = await window.electronAPI.getActiveState();
        if (!st) return;
        if (st.activeWarning) { /* banner'ı doldur */ }
        const tasks = Array.isArray(st.tasks) ? st.tasks : [];
        renderMonitoringTasks(tasks);
        applyRestoredTimer(tasks);          // tek yerden
    } catch (err) {
        console.warn('[restore] aktif durum okunamadı:', err && err.message);
    }
}

function applyRestoredTimer(tasks) {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }  // idempotent
    const now = Date.now();
    const timer = tasks
        .filter((t) => t && t.status === 'scheduled' && t.source === 'user_interface'
            && t.trigger && Number.isFinite(t.trigger.targetTime) && t.trigger.targetTime > now)
        .sort((a, b) => a.trigger.targetTime - b.trigger.targetTime)[0];

    if (!timer) {
        const monitoring = tasks.some((t) => t && ['monitoring','waiting','warning','executing'].includes(t.status));
        if (monitoring) switchView('nav-active');
        return;
    }
    const created = timer.createdAt ? Date.parse(timer.createdAt) : now;
    const total = Math.max(1, Math.ceil((timer.trigger.targetTime - created) / 1000));
    selectedAction = timer.action;
    currentActionString = getActionString(timer.action);
    timerExecutionTaskId = timer.id;
    startTimerTo(timer.trigger.targetTime, total);
    switchView('nav-active');
}
```
Ardından `app.js:3399`'daki `restoreActiveTimer()` çağrısını ve `restoreActiveTimer` fonksiyonunu **silin** (ölü kod).

---

### H-06 — Webhook dağıtımı sınırsız eşzamanlılıkla çalışıyor ve yeniden deneme zamanlayıcıları `TimerRegistry` dışında

**Kategori:** Performans + Veri Bütünlüğü
**Dosya:** `src/main/services/WebhookService.js:42-55`, `:118`, `:171`

**Sorunlu kod:**
```js
triggerEvent (eventType, taskOrData = {}) {
    // ...
    for (const hook of hooks) {
        setImmediate(() => {                 // ← hook başına bir makro-görev, sınır yok
            this.deliver(hook, eventType, taskOrData);
        });
    }
}
```
```js
// :118 — retry
this.setTimeoutFn(() => { /* yeniden dene */ }, backoffMs);
// :171 — hardTimer
hardTimer = this.setTimeoutFn(() => { /* ... */ }, timeoutMs);
```

**Etki:**
1. **Fan-out patlaması:** 20 webhook × saniyede birkaç olay = yüzlerce eşzamanlı `https.request`. TLS el sıkışmaları ana süreçte (Electron main) CPU'yu yer; UI donar. `setImmediate` kuyruğu olay döngüsünü doldurduğunda IPC yanıtları gecikir.
2. **Kapanışta sızıntı:** `setTimeoutFn` doğrudan global `setTimeout`'a bağlı (`:31`) ve `TimerRegistry`'ye kaydedilmiyor. Uygulama kapanırken bekleyen retry'lar **çalışmaya devam eder**; `app.quit()` sonrası ağ isteği atılır, `storageService.close()` sonrası yazma denemesi yapılırsa hata üretir.
3. `hardTimer` de aynı şekilde takip edilmiyor → `stop()`/`dispose()` sonrası "zombi" zamanlayıcı.

**Düzeltme — eşzamanlılık sınırı + registry entegrasyonu:**
```js
constructor(options = {}) {
    // ...
    this.timers = options.timerRegistry || null;     // TimerRegistry enjekte edilir
    this.setTimeoutFn = (fn, ms) => (this.timers
        ? this.timers.setTimeout(fn, ms)
        : setTimeout(fn, ms));
    this.maxConcurrent = options.maxConcurrent || 4;
    this._active = 0;
    this._queue = [];
}

triggerEvent(eventType, taskOrData = {}) {
    const hooks = this.getHooksFor(eventType);
    for (const hook of hooks) this._enqueue(hook, eventType, taskOrData);
}

_enqueue(hook, eventType, data) {
    this._queue.push({ hook, eventType, data });
    this._drain();
}

_drain() {
    while (this._active < this.maxConcurrent && this._queue.length > 0) {
        const job = this._queue.shift();
        this._active += 1;
        setImmediate(async () => {
            try { await this.deliver(job.hook, job.eventType, job.data); }
            catch (err) { log.warn('[Webhook] teslim hatası:', err && err.message); }
            finally { this._active -= 1; this._drain(); }
        });
    }
}

dispose() {
    this._queue.length = 0;
    if (this.timers) this.timers.clearAll();
}
```
`main.js`'te `app.on('before-quit')` içinde `webhookService.dispose()` çağırın.

---

## 3. ORTA

### M-01 — `validateTaskData` beş kritik alanı hiç doğrulamıyor (`source`, `recurrence`, `safetyPolicy`, `snoozeConfig`, `mode`)

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/main/ipc/validate.js:157-241`

**Sorunlu kod:** Fonksiyon `action`, `name`, `trigger`, `conditionGroup`, `warningConfig`, `chain` alanlarını doğruluyor; `source`, `recurrence`, `safetyPolicy`, `snoozeConfig`, `mode` için **hiçbir kontrol yok** ve fonksiyon `{ ok: true }` dönüyor.

**Etki:**
- **`source` sahtelemesi:** `TaskManager.js:355-357` ve `SafetyPolicyEngine.js:71-80` davranışı `source`'a göre değiştiriyor. Renderer `source: 'user_interface'` göndererek uzak/ajan kaynaklı görevlere uygulanan ek güvenlik kurallarını atlatabilir; ya da `'remote'` göndererek uyarı süresini kısaltabilir.
- **`recurrence`:** Doğrulanmamış `intervalMinutes`/`count` ile **sonsuz döngü** veya saniyede bir tetiklenen görev üretilebilir → CPU/timer seli.
- **`safetyPolicy` / `snoozeConfig`:** `Object.assign` ile serbest şekilde görev nesnesine giriyor; `SafetyPolicyEngine` beklenmeyen tipleri (`null`, `"yes"`) sessizce "izin ver" olarak yorumlayabilir.
- **`mode`:** Tanımsız değerler `switch` fall-through ile en gevşek dala düşebilir.

**Düzeltme:**
```js
const SOURCES = new Set(['user_interface', 'remote', 'agent', 'system', 'recurrence']);
if (data.source !== undefined && !SOURCES.has(data.source)) {
    return fail('Geçersiz görev kaynağı.', 'INVALID_SOURCE');
}
if (data.mode !== undefined && !['classic', 'assisted', 'autonomous'].includes(data.mode)) {
    return fail('Geçersiz mod.', 'INVALID_MODE');
}

const rec = data.recurrence;
if (rec !== undefined && rec !== null) {
    if (typeof rec !== 'object' || Array.isArray(rec)) return fail('Geçersiz recurrence.', 'INVALID_RECURRENCE');
    if (!Number.isInteger(rec.intervalMinutes) || rec.intervalMinutes < 1 || rec.intervalMinutes > 10080) {
        return fail('recurrence.intervalMinutes 1..10080 olmalı.', 'INVALID_RECURRENCE');
    }
    if (rec.count !== undefined && (!Number.isInteger(rec.count) || rec.count < 1 || rec.count > 1000)) {
        return fail('recurrence.count 1..1000 olmalı.', 'INVALID_RECURRENCE');
    }
}

const sp = data.safetyPolicy;
if (sp !== undefined && sp !== null) {
    if (typeof sp !== 'object' || Array.isArray(sp)) return fail('Geçersiz safetyPolicy.', 'INVALID_SAFETY');
    for (const [k, v] of Object.entries(sp)) {
        if (typeof v !== 'boolean' && typeof v !== 'number') {
            return fail(`safetyPolicy.${k} geçersiz tipte.`, 'INVALID_SAFETY');
        }
    }
}

const sc = data.snoozeConfig;
if (sc !== undefined && sc !== null) {
    if (typeof sc !== 'object' || Array.isArray(sc)) return fail('Geçersiz snoozeConfig.', 'INVALID_SNOOZE');
    if (sc.defaultMinutes !== undefined
        && (!Number.isInteger(sc.defaultMinutes) || sc.defaultMinutes < 1 || sc.defaultMinutes > 1440)) {
        return fail('snoozeConfig.defaultMinutes 1..1440 olmalı.', 'INVALID_SNOOZE');
    }
}
```
> `source` **istemciden hiç alınmamalı**: `main.js` içindeki `create-task` handler'ında `data.source = 'user_interface'` olarak sunucu tarafında atanmalı (mevcut `id` politikasıyla aynı yaklaşım, `validate.js:159-162`).

---

### M-02 — Süre limitleri üç yerde farklı: backend 28,9 gün, renderer 24 gün, gün girişi 3650 gün

**Kategori:** Hata & Mantık
**Dosya:** `src/main/ipc/validate.js:11` · `src/renderer/app.js:250`, `:282`

**Sorunlu kod:**
```js
// validate.js:11
const MAX_DURATION_MS = 2500000000;      // 2.500.000 sn ≈ 28,9 gün

// app.js:250
clampInput(dInput, 3650);                // 3.650 gün ≈ 10 yıl

// app.js:282
if (totalSeconds <= 0 || totalSeconds > 2073600) {   // 24 gün
```

**Etki:**
- Kullanıcı 25 gün girer → renderer **reddeder**, backend kabul ederdi.
- Kullanıcı 3650 gün girer → input kabul eder, submit reddeder, kullanıcı hangi sınırın geçerli olduğunu anlamaz.
- API üzerinden (renderer'ı atlayarak) 28 günlük görev oluşturulabilir; renderer bunu **gösteremez** (geri yükleme `remaining` hesaplar ama progress bar paydası taşabilir).
- Aynı limit `validateScheduleAction` (`:144`) ve `validateTaskData` (`:177`) için tutarlı; sorun yalnızca renderer ile backend arasında.

**Düzeltme — tek doğruluk kaynağı:**
```js
// src/shared/limits.js (yeni, hem main hem renderer tarafından import edilir)
const MAX_DURATION_MS = 2500000000;
const MAX_DURATION_SECONDS = Math.floor(MAX_DURATION_MS / 1000);   // 2_500_000
const MAX_DURATION_DAYS = Math.floor(MAX_DURATION_SECONDS / 86400); // 28
module.exports = { MAX_DURATION_MS, MAX_DURATION_SECONDS, MAX_DURATION_DAYS };
```
```js
// app.js
const { MAX_DURATION_SECONDS, MAX_DURATION_DAYS } = window.PPLimits;
clampInput(dInput, MAX_DURATION_DAYS);
if (totalSeconds <= 0 || totalSeconds > MAX_DURATION_SECONDS) { /* ... */ }
```
> Renderer `nodeIntegration` kapalı olduğu için limitler `preload.js` üzerinden `contextBridge` ile açılmalı (`window.PPLimits`).

---

### M-03 — `StorageService` yazma hatasını `false` ile döndürüyor ama çağıranlar başarı raporluyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/main/services/StorageService.js:928-958` · `src/main/services/TaskManager.js:529-582`, `:828-849`

**Sorunlu kod:**
```js
// StorageService.js:946-958
_persist(fn) {
    if (this.maintenanceMode || !this.db) return false;      // ← sessiz
    try {
        this.db.write(() => { this._setMeta('updated_at', nowIso()); fn(); });
        return true;
    } catch (err) {
        log.error('[StorageService] Kalıcılaştırma hatası:', err);
        return false;                                        // ← çağıran çoğu yerde yok sayıyor
    }
}
```
```js
// TaskManager.js:529-582
createTask(taskData) {
    // ... görev oluşturulur ...
    this.persistChanges();          // ← dönüş değeri yok, hata yutuluyor
    return { ok: true, task };      // ← UI'ya "oluştu" denir
}
```

**Etki:**
- Disk dolu, DB kilitli (`SQLITE_BUSY`), bakım modu veya `better-sqlite3` hatası durumunda görev **bellekte var, diskte yok**.
- UI görevi listeler; uygulama yeniden başladığında görev **kaybolur**. Kullanıcı "oluşturdum" der, kanıt yoktur.
- `persistChanges` (`:828-849`) `saveTask` sonucunu kontrol ediyor (iyi) ama `createTask` bu sonucu **hiç görmüyor**; ayrıca `persistChanges` `void` döndürdüğü için çağıranları bilgilendiremiyor.

**Düzeltme:**
```js
// TaskManager.persistChanges → sonuç döndür
persistChanges() {
    const next = this._taskSnapshot();
    const saved = new Map(this._savedTaskState);
    let changed = 0;
    let failed = 0;

    for (const [id, json] of next.entries()) {
        if (saved.get(id) === json) continue;
        if (this.storage.saveTask(JSON.parse(json)) === false) { failed += 1; continue; }
        saved.set(id, json); changed += 1;
    }
    for (const id of [...saved.keys()]) {
        if (next.has(id)) continue;
        if (this.storage.deleteTask(id) === false) { failed += 1; continue; }
        saved.delete(id); changed += 1;
    }
    this._savedTaskState = saved;
    if (changed > 0 && this.changeListener) this.changeListener();
    return { ok: failed === 0, changed, failed };
}
```
```js
// createTask
const persisted = this.persistChanges();
if (!persisted.ok) {
    // bellekten geri al
    this.tasks = this.tasks.filter((t) => t.id !== task.id);
    this._savedTaskState.delete(task.id);
    return { ok: false, code: 'PERSIST_FAILED', message: t('errorSaveFailed') };
}
return { ok: true, task };
```
**Ek:** `_persist` bakım modunda `false` dönerken **hangi nedenle** başarısız olduğunu ayırt edin (`{ ok: false, code: 'MAINTENANCE' | 'NO_DB' | 'WRITE_FAILED' }`), aksi halde kullanıcıya anlamlı mesaj verilemez.

---

### M-04 — `getSettings()` canlı, değiştirilebilir nesneyi döndürüyor

**Kategori:** Veri Bütünlüğü
**Dosya:** `src/main/services/StorageService.js:992-994` (mutasyon: `:996-1004`)

**Sorunlu kod:**
```js
getSettings() {
    return this.data.settings;      // ← referans sızıyor
}

updateSettings(newSettings) {
    // ...
    this.data.settings = Object.assign({}, this.data.settings, safe);   // ← nesne DEĞİŞTİRİLİYOR
    // ...
}
```

**Etki:**
- Çağıran `const s = storage.getSettings(); s.localApiPort = 9999;` yaparsa **bellekte** değişir, **diske yazılmaz** → aynı süreçte tutarsız davranış (API 9999'da dinler, ayar ekranı 18456 gösterir).
- `updateSettings` yeni nesne atadığı için daha önce alınmış referanslar **bayatlar**. `main.js:1332`'deki `const effectiveSettings = storageService.getSettings()` bu tuzağa yakın: yeniden okuma doğru, ama başka yerlerde tutulan referanslar sessizce eski değeri gösterir.
- `requireCancelPin` (`main.js:88`) her çağrıda yeniden okuyor (doğru), ancak `WebhookService`/`SecretStore` gibi servisler kurulum anında referans tutuyorsa güncellemeleri görmez.

**Düzeltme:**
```js
getSettings() {
    return { ...this.data.settings };        // sığ kopya
}

// İç kullanım için (performans kritik yerlerde) ayrı ve açıkça adlandırılmış erişim:
_getSettingsRef() {
    return this.data.settings;               // yalnızca StorageService içi
}
```
> `lanAllowedIps` / `localApiClientFingerprints` gibi dizi alanları için `structuredClone` veya en azından dizi kopyası gerekir:
> ```js
> getSettings() {
>     const s = this.data.settings || {};
>     return {
>         ...s,
>         lanAllowedIps: Array.isArray(s.lanAllowedIps) ? [...s.lanAllowedIps] : [],
>         localApiClientFingerprints: Array.isArray(s.localApiClientFingerprints)
>             ? [...s.localApiClientFingerprints] : []
>     };
> }
> ```

---

### M-05 — Toplu görev değişikliklerinde O(n²) yazma ve satır başına çift `JSON.stringify`

**Kategori:** Performans
**Dosya:** `src/main/services/StorageService.js:439-464`, `:928-934` · `src/main/services/TaskManager.js:828-839`

**Sorunlu kod:**
```js
// StorageService.js:456-462 — aynı satır iki kez stringify ediliyor
for (const [key, item] of next) {
    const json = JSON.stringify(item);
    if (prev.get(key) === json) continue;
    upsert.run(...rowOf(key, item, json));
    changed += 1;
}
this._snapshots[snapshotKey] = new Map([...next.entries()].map(([k, v]) => [k, JSON.stringify(v)]));  // ← 2. kez
```
```js
// StorageService.js:928-934 — her saveTask TÜM listeyi flush ediyor
saveTask(task) {
    // ...
    return this._persist(() => this._flushTasks(this._diskTasks()));   // ← tüm görevler
}
```
```js
// TaskManager.js:832-839 — değişen her görev için ayrı saveTask
for (const [id, json] of next.entries()) {
    if (saved.get(id) === json) continue;
    const result = this.storage.saveTask(JSON.parse(json));   // ← her biri O(n)
}
```

**Etki:** `n` değişen görev için `n × O(n)` = **O(n²)** iş. 500 görevli bir kurulumda toplu "tümünü duraklat" işlemi 250.000 satır karşılaştırması + 500 tam tablo flush'ı yapar. Her flush bir SQLite transaction'ı → disk fsync sayısı 500'e çıkar, ana süreç saniyelerce bloke olur (Electron main thread → UI donması).

**Düzeltme — tek geçiş, tek transaction:**
```js
_flushRows(table, list, keyOf, keyCol, upsertSql, rowOf, snapshotKey = table) {
    const prev = this._snapshots[snapshotKey] || new Map();
    const next = new Map();
    const nextJson = new Map();

    list.forEach((item, index) => {
        const key = keyOf(item, index);
        if (key === null || key === undefined) return;
        const k = String(key);
        next.set(k, item);
        nextJson.set(k, JSON.stringify(item));       // ← yalnızca BİR kez
    });

    const del = this._prepare(`DELETE FROM ${table} WHERE ${keyCol} = ?`);
    const upsert = this._prepare(upsertSql);
    let changed = 0;

    for (const key of prev.keys()) {
        if (!nextJson.has(key)) { del.run(key); changed += 1; }
    }
    for (const [key, json] of nextJson) {
        if (prev.get(key) === json) continue;
        upsert.run(...rowOf(key, next.get(key), json));
        changed += 1;
    }
    this._snapshots[snapshotKey] = nextJson;
    return changed;
}
```
```js
// StorageService — toplu API
saveTasksBulk(tasks) {
    if (!Array.isArray(tasks)) return false;
    const byId = new Map(this.data.tasks.map((t) => [t && t.id, t]));
    for (const t of tasks) if (t && t.id) byId.set(t.id, t);
    this.data.tasks = [...byId.values()];
    return this._persist(() => this._flushTasks(this._diskTasks()));   // tek transaction
}
```
```js
// TaskManager.persistChanges — tek çağrı
const dirty = [];
for (const [id, json] of next.entries()) {
    if (saved.get(id) === json) continue;
    dirty.push(JSON.parse(json));
}
if (dirty.length > 0 && this.storage.saveTasksBulk(dirty) === false) { /* hata yolu */ }
```

---

### M-06 — `loadTasks()` 5 saniyede bir ve her görünüm geçişinde korumasız çalışıyor

**Kategori:** Performans
**Dosya:** `src/renderer/app.js:1388-1391`, `:164-165`, `:1228`

**Sorunlu kod:**
```js
// :1388-1391
tasksRefreshTimer = setInterval(() => {
    const view = document.getElementById('view-tasks');
    if (view && !view.classList.contains('hidden')) loadTasks();
}, 5000);
```
```js
// :164-165 — her görünüm geçişinde
if (viewId === 'view-tasks') loadTasks();
```

**Etki:**
- Uçuşta olan istek koruması (`inFlight`) yok: yavaş bir IPC yanıtı 5 sn'yi aşarsa istekler **birikir**.
- Sıra koruması (`sequence token`) yok: eski yanıt yeni yanıttan **sonra** dönerse eski liste ekrana yazılır → görev "geri gelir", silinen görev yeniden görünür.
- `loadTasks` içinde `innerHTML` ile tam liste yeniden çiziliyor; her 5 saniyede DOM tamamen yıkılıp kuruluyor → kullanıcı listede kaydırma yaparken zıplama, odak kaybı, hover durumu kaybı.
- Görünüm geçişi + interval aynı anda tetiklenirse iki paralel `getTasks` → ana süreçte çift serileştirme.

**Düzeltme:**
```js
let tasksLoadSeq = 0;
let tasksLoadInFlight = false;

async function loadTasks() {
    if (tasksLoadInFlight) return;                 // eşzamanlı isteği engelle
    tasksLoadInFlight = true;
    const seq = ++tasksLoadSeq;
    try {
        const tasks = await window.electronAPI.getTasks();
        if (seq !== tasksLoadSeq) return;          // bayat yanıtı at
        if (!isVisible('view-tasks')) return;      // kullanıcı başka ekranda
        renderTasks(tasks);
    } catch (err) {
        console.warn('[tasks] yükleme hatası:', err && err.message);
    } finally {
        tasksLoadInFlight = false;
    }
}
```
```js
// interval: yalnızca görünürken ve sekme aktifken
tasksRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (isVisible('view-tasks')) loadTasks();
}, 5000);
```
**Ek:** Tam yeniden çizim yerine anahtar bazlı diff (`data-task-id` ile mevcut satırları güncelle) yapın; 500 görevde bu, `innerHTML`'e kıyasla 10-50× daha az layout tetikler.

---

### M-07 — `OrderQueue.persist` depolama hatasını yok sayıyor; API kalıcı olmayan sipariş için `201` dönebilir

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/main/services/OrderQueue.js:25-31`

**Sorunlu kod:**
```js
persist(list) {
    if (this.storage && typeof this.storage.saveOrders === 'function') {
        this.storage.saveOrders(list);        // ← dönüş değeri yok sayılıyor
    } else {
        this.memory = list;
    }
}
```

**Etki:** `saveOrders` `false` dönerse (disk dolu, DB bakımda, kilitli) sipariş **yalnızca bellekte** kalır. `LocalApiService` bunu göremediği için ajana `201 Created` döner. Ajan siparişi "alındı" sayar, `acked` işaretler; uygulama yeniden başladığında sipariş **hiç var olmamıştır** → sessiz iş kaybı. Güç eylemi hiç çalışmaz, kimse fark etmez.

**Düzeltme:**
```js
persist(list) {
    if (this.storage && typeof this.storage.saveOrders === 'function') {
        const ok = this.storage.saveOrders(list);
        if (ok === false) {
            log.error('[OrderQueue] Sipariş kuyruğu kalıcılaştırılamadı.');
            return false;
        }
        return true;
    }
    this.memory = list;
    return true;
}
```
```js
// LocalApiService — sipariş oluşturma yolunda
const persisted = this.deps.queue.persist(nextList);
if (persisted === false) {
    return this.sendJson(res, 503, {
        error: 'Sipariş kalıcı olarak kaydedilemedi; yeniden deneyin.',
        code: 'ORDER_PERSIST_FAILED'
    });
}
return this.sendJson(res, 201, { order: signed });
```
> `503` + `Retry-After` dönmek, `201` dönüp veriyi kaybetmekten her zaman daha iyidir; ajan `503`'ü idempotent şekilde yeniden dener.

---

### M-08 — `headless.js` `api.start()`'i beklemiyor ve `stop()` uçuştaki yazmaları kesiyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/agent/headless.js:161`, `:186-194`

**Sorunlu kod:**
```js
api.start();          // :161 — dönüş değeri yok sayılıyor

// :186-194
stop() {
    stopped = true;
    try { timers.clearAll(); } catch (_) {}
    try { metrics.stopSampling(); } catch (_) {}
    try { if (upsMonitor) upsMonitor.close(); } catch (_) {}
    try { api.stop(); } catch (_) {}                    // ← async, await YOK
    try { if (storage.auditCheckpoint) storage.auditCheckpoint.write(storage.getAuditLog()); } catch (_) {}
    try { storage.close(); } catch (_) {}               // ← hemen kapanıyor
}
```

**Etki:**
1. `start()` başarısız olsa bile ajan "başladı" logu atar (`:181`); servis yöneticisi (systemd/Windows Service) süreci sağlıklı sanar. H-01 düzeltildikten sonra `start()` `Promise` döneceği için bu satır **tamamen sessiz** kalır.
2. `stop()` senkron; `api.stop()` içindeki `server.close()` beklenmeden `storage.close()` çağrılır. O anda uçuşta olan `consoleClient.sync()` (`:171`) veya `executor.drain(queue)` (`:173`) yazma denerse **kapalı DB'ye** yazar → `SQLITE_MISUSE` veya sessiz kayıp.
3. `storage.auditCheckpoint.write(...)` ile `storage.close()` arasında da yarış var.

**Düzeltme:**
```js
const started = await api.start();
if (started && started.ok === false) {
    log.error(`[Headless] API başlatılamadı: ${started.code}`);
    // Politikaya göre: ya süreçten çık (exit 1) ya da degraded modda devam et.
}
```
```js
async stop() {
    if (stopped) return;
    stopped = true;

    try { timers.clearAll(); } catch (_) {}
    try { metrics.stopSampling(); } catch (_) {}
    try { if (upsMonitor) upsMonitor.close(); } catch (_) {}

    // Uçuştaki işi bitir (en fazla 10 sn)
    await Promise.race([
        inFlightWork,                       // tick()'in döndürdüğü Promise
        new Promise((r) => setTimeout(r, 10000))
    ]).catch(() => {});

    try { await api.stop(); } catch (_) {}
    try { if (storage.auditCheckpoint) storage.auditCheckpoint.write(storage.getAuditLog()); } catch (_) {}
    try { storage.close(); } catch (_) {}
}
```
```js
// tick'i izlenebilir yap
let inFlightWork = Promise.resolve();
const tick = () => {
    inFlightWork = (async () => { /* mevcut gövde */ })();
    return inFlightWork;
};
```
> `stop()` artık `async` olduğu için `process.on('SIGTERM', ...)` ve `require.main` bloğundaki kapanış yolu da `await handle.stop()` yapmalı (`headless.js:204+`).

---

### M-09 — `ConsoleStore.snapshot()` bozuk JSON'da çöküyor; `init()` şema sürümü doğrulamıyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/console/ConsoleStore.js:700-715`, `:93`

**Sorunlu kod:**
```js
snapshot() {
    if (!this.db) return this.memory;
    const agents = {};
    for (const agent of this.listAgents()) agents[agent.agentId] = agent;
    const queues = {};
    const rows = this._prepare("SELECT * FROM queues WHERE state IN ('pending','inflight') ...").all();
    for (const row of rows) {
        const signed = safeParse(row.signed);      // ← null dönebilir
        signed._state = row.state;                 // ← TypeError
        ...
    }
```
```js
// :93 — yalnızca bütünlük kontrolü
if (this.db.quickCheck() !== 'ok') { /* ... */ }
```

**Etki:**
- Tek bir bozuk `signed` kaydı (yarım yazma, disk bozulması, eski şema) **tüm snapshot'ı** çökertir. `snapshot()` konsol UI'ının ana veri kaynağıysa panel tamamen açılmaz.
- `quickCheck()` fiziksel bütünlüğü doğrular, **şema sürümünü** doğrulamaz. Eski sürümden yükseltilen DB'de kolon eksikse (`row.delivered_at` undefined) sessizce `undefined` yayılır; `NOT NULL` ihlali ancak yazma anında patlar.

**Düzeltme:**
```js
snapshot() {
    if (!this.db) return this.memory;
    const agents = {};
    for (const agent of this.listAgents()) agents[agent.agentId] = agent;

    const queues = {};
    const rows = this._prepare(
        "SELECT * FROM queues WHERE state IN ('pending','inflight') ORDER BY created_at ASC, rowid ASC"
    ).all();

    for (const row of rows) {
        const signed = safeParse(row.signed);
        if (!signed || typeof signed !== 'object') {
            log.warn(`[ConsoleStore] Bozuk kuyruk kaydı atlandı (id=${row.id}).`);
            this._quarantine(row.id);          // state='corrupt' olarak işaretle
            continue;
        }
        signed._state = row.state;
        signed._deliveredAt = row.delivered_at;
        signed._attempts = row.attempts;
        signed._queuedAt = row.created_at;
        signed._expiresAt = row.expires_at;
        (queues[row.agent_id] ||= []).push(signed);
    }
    // ...
}
```
```js
// init() içinde şema sürümü kapısı
const SCHEMA_VERSION = 3;
const current = Number(this.getMeta('schema_version') || 0);
if (current > SCHEMA_VERSION) {
    throw new StorageError('Konsol DB şeması uygulamadan yeni.', 'SCHEMA_TOO_NEW');
}
if (current < SCHEMA_VERSION) this.migrate(current, SCHEMA_VERSION);
```

---

### M-10 — Dil ve enerji ayarları PIN kapısından **önce** diske yazılıyor; iptal yarım durum bırakıyor

**Kategori:** Veri Bütünlüğü & Hata Yönetimi
**Dosya:** `src/renderer/app.js:3244-3255`

**Sorunlu kod:**
```js
// T-REN-05: sunucu reddederse localStorage ve form eski değerde kalır.
const res = await window.electronAPI.saveSettings({ language, ...energy.patch });   // ← PIN'siz yazma
if (res && res.success === false) { await restoreForm(); /* ... */ return; }

if (typeof loadEnergyCard === 'function') loadEnergyCard();

// WP-10.T4: otonomi modu güvenlik bayrağıdır; PIN'li yoldan yazılır.
const sec = await saveSecuritySettings({ autonomyMode }, commit, { quiet: true, onCancel: restoreForm });
if (sec && sec.success === false && !sec.pendingPin) { await restoreForm(); /* ... */ return; }
if (sec && sec.pendingPin) return;      // ← kullanıcı PIN'i iptal etti: dil/enerji ÇOKTAN yazıldı
```

**Etki:** Kullanıcı dil + otonomi modunu birlikte değiştirir, PIN modalında **Vazgeç**'e basar:
- `restoreForm()` yalnızca **formu ve localStorage'ı** eski değere döndürür (`:3246`, `:3254`).
- `language` ve `energy.patch` **ana süreçte kalıcı olarak** değişmiş kalır.
- Kullanıcı arayüzde eski dili görür ama uygulama yeniden başlatıldığında yeni dil yüklenir → "ayarlarım kendi kendine değişiyor" şikâyeti.
- Enerji tarifesi değişmişse istatistikler/hesaplamalar sessizce farklı sonuç verir.

**Düzeltme — PIN kapısını en başa al:**
```js
btnSave.addEventListener('click', async () => {
    const language = ...;
    const energy = ...;
    const autonomyMode = ...;

    // 1) Önce yetki: hiçbir şey yazılmadan PIN doğrulanır
    const gate = await requireSecurityPinUi(t('autonomyPinPrompt'));
    if (!gate.ok) return;                     // iptal → hiçbir yazma yok

    // 2) Tek atomik yazma
    const res = await window.electronAPI.saveSettings({
        language,
        ...energy.patch,
        autonomyMode,
        __pin: gate.pin                     // ana süreçte tekrar doğrulanır
    });
    if (!res || res.success === false) {
        await restoreForm();
        showToast((res && res.message) || t('errorModeSave'), 'error');
        return;
    }

    await applyLanguage(language);
    if (typeof loadEnergyCard === 'function') loadEnergyCard();
    showToast(t('toastSettingsSaved'), 'success');
});
```
> PIN'i renderer'da bir kez sorup ana süreçte **tekrar** doğrulamak doğru yaklaşımdır; renderer'daki kontrol kullanıcı deneyimi, ana süreçteki kontrol güvenlik sınırıdır.

---

### M-11 — Webhook arayüzü `http://` kabul ediyor, `SsrfGuard` yalnızca `https://` ve 443/8443'e izin veriyor

**Kategori:** Hata & Mantık (kullanılabilirlik)
**Dosya:** `src/renderer/app.js:1965-1969` · `src/main/security/SsrfGuard.js:51-64`

**Sorunlu kod:**
```js
// app.js:1969
if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) {
    showToast(t('errorInvalidUrl'), 'error');
    return;
}
```
```js
// SsrfGuard.js:51-64
if (url.protocol !== 'https:') {
    return { ok: false, code: 'SSRF_BLOCKED', reason: 'HTTPS_REQUIRED' };
}
// ...
const port = url.port || '443';
if (!ALLOWED_PORTS.has(port)) {          // 443 | 8443
    return { ok: false, code: 'SSRF_BLOCKED', reason: 'PORT_FORBIDDEN' };
}
```

**Etki:**
- Kullanıcı `http://internal.example/hook` veya `https://example.com:9000/hook` kaydeder → UI **kabul eder**, kayıt başarılı görünür.
- Her olayda `SsrfGuard` reddeder; `WebhookService` genel bir hata döndürür. Kullanıcı **neden** çalışmadığını asla öğrenemez (retry döngüsü de sessiz).
- Destek yükü + "webhook çalışmıyor" şikâyetleri; güvenlik kontrolü doğru ama kullanıcıya hiç yansıtılmıyor.

**Düzeltme — arayüzde aynı kuralları uygula ve nedeni söyle:**
```js
const ALLOWED_WEBHOOK_PORTS = new Set(['', '443', '8443']);

function validateWebhookUrl(raw) {
    let u;
    try { u = new URL(raw); } catch (_) {
        return { ok: false, message: t('errorInvalidUrl') };
    }
    if (u.protocol !== 'https:') {
        return { ok: false, message: t('errorWebhookHttpsRequired') };   // "Yalnızca https:// kullanılabilir."
    }
    if (u.username || u.password) {
        return { ok: false, message: t('errorWebhookUserInfo') };
    }
    if (!ALLOWED_WEBHOOK_PORTS.has(u.port)) {
        return { ok: false, message: t('errorWebhookPortForbidden', { ports: '443, 8443' }) };
    }
    return { ok: true };
}
```
**Ek (öneri):** Kaydettikten sonra "Test et" düğmesi ekleyin; `SsrfGuard` sonucunu (`reason`) kullanıcıya çevirin. Sessiz retry yerine son hata nedeni ayarlar ekranında görünsün.

---

### M-12 — Kapsam kapısı bugün kırmızı ve ürünün en riskli iki katmanını ölçmüyor

**Kategori:** Kod Temizliği (test altyapısı / sürüm kapısı)
**Dosya:** `vitest.config.js:30-41` · `package.json:23` (`coverage` script'i)

**Sorunlu kod:**
```js
// vitest.config.js:33-40
include: ['src/main/**/*.js'],
thresholds: { lines: 80, functions: 70, branches: 65, statements: 80 }
```

**Ölçüm (26.10.2026, `npm run coverage`):**

| Metrik | Ölçülen | Eşik | Sonuç |
|---|---|---|---|
| Satır | %78.41 | %80 | altında |
| İfade | %78.41 | %80 | altında |
| Dal | %64.84 | %65 | altında |
| Fonksiyon | %72.71 | %70 | geçti |

Komut **çıkış kodu 1** ile bitiyor; CI'da `npm run coverage` adımı kırmızı. Yani "kapsam kapısı yeşil" iddiası bugün doğru değil.

**İkinci kusur — kapsam yanlış:** `include` yalnızca `src/main/**` ile sınırlı. Ölçüm dışında kalanlar:
- `main.js` (depo kökü) — **C-01 ve C-02 tam olarak burada**;
- `src/renderer/**` — C-01'in kullanıcıya görünen yarısı (`hideWarningBanner`);
- `src/console/**`, `src/agent/**`, `src/cli/**`.

`coverage-summary.json` 66 dosya anahtarı içeriyor; `main.js` ve hiçbir renderer dosyası yok. Kapı, ürünün en kritik iki katmanını ölçmeden "yeşil" diyebilecek şekilde yapılandırılmış.

**Etki:**
- Sürüm kapısı bugün fiilen kırmızı; "testler geçiyor" ile "kapsam geçiyor" karıştırılıyor.
- Gelecekteki regresyonlar `main.js`/renderer'da testsiz kalabilir; C-01/C-02'nin 639 yeşil testle yayına kadar gelmesinin nedeni tam olarak bu kör nokta.

**Düzeltme — eşiği düşürme, kapsamı genişlet:**
```js
// vitest.config.js — glob bazlı eşik: her desen kendi sorumluluğunu taşır
include: ['main.js', 'src/main/**/*.js', 'src/renderer/**/*.js', 'src/console/**/*.js', 'src/agent/**/*.js'],
thresholds: {
    // küresel taban: asla düşürülmez
    lines: 80, statements: 80, branches: 65, functions: 70,
    // yeni ölçülen katmanlar için gerçekçi başlangıç (ölçümden sonra yükseltilir)
    'main.js': { lines: 0, statements: 0, branches: 0, functions: 0 },
    'src/renderer/**': { lines: 0, statements: 0, branches: 0, functions: 0 }
}
```
Adımlar: (1) `main.js`/renderer'ı ölçüme al, (2) gerçek sayıları `tests/BASELINE.md`'ye yaz, (3) her modül için taban çizgisini kaydet, (4) yeni kodda taban altına düşmeyi engelleyen "ratchet" kuralı koy. Eşiği %78'e çekmek **yasak** — kapıyı yeşile boyamak, körlüğü kalıcılaştırır.

**Kanıt:** `tests/BASELINE.md` §1 (G6) ve §2.

---

## 4. DÜŞÜK

### L-01 — `SecretStore.syncWebhooks` sır başına ayrı atomik dosya yazımı yapıyor

**Kategori:** Performans
**Dosya:** `src/main/security/SecretStore.js:256-277` (`writeAtomic`: `:180-227`)

**Sorunlu kod:**
```js
for (const name of Object.keys(this.data.entries || {})) {
    if (name.startsWith('webhook:') && !keep.has(name)) {
        await this.deleteSecret(name);      // ← her biri writeAtomic
    }
}
for (const hook of list) {
    for (const field of WEBHOOK_SECRET_FIELDS) {
        if (isNonEmptyString(hook[field])) {
            await this.setSecret(webhookKey(hook.url, field), hook[field]);   // ← her biri writeAtomic
        }
    }
}
```

**Etki:** 5 webhook × 3 alan = 15 sır → 15 ayrı `writeFileSync` + `rename` + DPAPI şifreleme. Her `rename` bir fsync; HDD'de 15 × ~5-10 ms = 75-150 ms ana süreç blokajı. Ayarlar ekranı kaydetme sırasında UI donar.

**Düzeltme — tek yazma:**
```js
async syncWebhooks(webhooks) {
    this.ensureLoaded();
    const list = Array.isArray(webhooks) ? webhooks : [];
    const keep = new Set();
    for (const hook of list) {
        if (!hook || typeof hook !== 'object' || !isNonEmptyString(hook.url)) continue;
        for (const field of WEBHOOK_SECRET_FIELDS) keep.add(webhookKey(hook.url, field));
    }

    let dirty = false;
    for (const name of Object.keys(this.data.entries || {})) {
        if (name.startsWith('webhook:') && !keep.has(name)) {
            delete this.data.entries[name];       // bellekte sil
            dirty = true;
        }
    }
    for (const hook of list) {
        if (!hook || typeof hook !== 'object' || !isNonEmptyString(hook.url)) continue;
        for (const field of WEBHOOK_SECRET_FIELDS) {
            if (!isNonEmptyString(hook[field])) continue;
            const name = webhookKey(hook.url, field);
            const enc = this.encrypt(hook[field]);            // mevcut şifreleme yolu
            if (this.data.entries[name] === enc) continue;
            this.data.entries[name] = enc;
            dirty = true;
        }
    }
    if (dirty) this.writeAtomic();                 // ← TEK yazma
}
```

---

### L-02 — `SmartFinishEngine` silinen görevlerin izleyicilerini bellekte tutuyor

**Kategori:** Performans (bellek sızıntısı)
**Dosya:** `src/main/services/SmartFinishEngine.js` (`stabilityTrackers`, `fileSamples`, `directorySamples`)

**Etki:** Görev silindiğinde/iptal edildiğinde ilgili anahtarlar temizlenmiyor. Uzun süre çalışan bir kurulumda (haftalarca, yüzlerce görev) map'ler büyümeye devam eder. Her örnekleme turunda bu map'ler üzerinde döngü yapıldığı için CPU maliyeti de artar.

**Düzeltme:**
```js
// TaskManager'da görev silindiğinde/iptal edildiğinde:
onTaskRemoved(taskId) {
    this.stabilityTrackers.delete(taskId);
    this.fileSamples.delete(taskId);
    this.directorySamples.delete(taskId);
    for (const key of this._sampleKeysByTask.get(taskId) || []) {
        this.fileSamples.delete(key);
        this.directorySamples.delete(key);
    }
    this._sampleKeysByTask.delete(taskId);
}
```
**Ek:** Savunma olarak periyodik süpürme (5 dakikada bir, `TimerRegistry` üzerinden):
```js
this.timers.setInterval(() => {
    const live = new Set(this.taskManager.getTasks().map((t) => t.id));
    for (const id of this.stabilityTrackers.keys()) if (!live.has(id)) this.stabilityTrackers.delete(id);
}, 300000);
```

---

### L-03 — `seenNonces` üst sınırsız büyüyor; temizlik 6 saatte bir

**Kategori:** Veri Bütünlüğü / Bellek
**Dosya:** `src/main/services/StorageService.js` (`consumeNonce`, `purgeExpiredNonces`)

**Sorunlu kod:** `consumeNonce` her nonce'u `data.seenNonces` dizisine ekliyor; `purgeExpiredNonces` yalnızca 6 saatte bir çağrılıyor ve bir üst sınır yok.

**Etki:** Ajan modunda dakikada onlarca imzalı sipariş → 6 saatte binlerce kayıt. Dizi hem bellekte hem `_persist` sırasında JSON olarak diske yazılır → her siparişte artan yazma maliyeti (O(n) serileştirme). Replay koruması **doğru** ama maliyeti zamanla artıyor.

**Düzeltme:**
```js
consumeNonce(nonce, ttlMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const entry = { n: nonce, exp: now + ttlMs };

    // Sabit üst sınır: en eski kayıtları düşür
    const MAX = 1000;
    this.data.seenNonces.push(entry);
    if (this.data.seenNonces.length > MAX) {
        this.data.seenNonces.splice(0, this.data.seenNonces.length - MAX);
    }
    // Süresi dolmuşları hemen temizle (ucuz, sınırlı iş)
    if (this.data.seenNonces.length % 50 === 0) {
        this.data.seenNonces = this.data.seenNonces.filter((e) => e.exp > now);
    }
    return this._persist(() => this._flushNonces(this.data.seenNonces));
}
```
> **Dikkat:** `MAX` düşürme, TTL'den kısa ömürlü nonce'ları unutmanıza yol açabilir. Replay penceresi ile `MAX` uyumlu olmalı: `MAX >= (saniyedeki maksimum sipariş × TTL_saniye)`. Aksi halde koruma zayıflar; bu yüzden TTL'i 1 saat gibi daha kısa bir değere çekip `MAX`'i buna göre boyutlandırın.

---

### L-04 — Kullanılmayan fonksiyon ve ölü atamalar

**Kategori:** Kod Temizliği
**Dosya:** `src/renderer/app.js:1094` (`escHtml`), `:198`, `:229`, `:2922` (`currentActionString`)

**Sorun:** `escHtml` tanımlanmış ama hiçbir yerden çağrılmıyor (`grep` ile doğrulandı). `currentActionString` üç yerde atanıyor; okunduğu tek yer yok.

**Etki:** Ölü kod, okuyucuya "XSS koruması var" izlenimi veriyor ama aslında kullanılmıyor — **tehlikeli yanlış güven**. `currentActionString` ise yanlışlıkla kaldırılması gereken bir durumu varmış gibi gösteriyor.

**Düzeltme:** `escHtml`'i silin **veya** gerçekten kullanın:
```js
// Kullanılacaksa: tüm innerHTML lavabolarında zorunlu hale getirin
el.innerHTML = `<span class="task-name">${escHtml(task.name)}</span>`;
```
`currentActionString` atamalarını silin.

> Not: `validate.js:170` zaten `<`/`>` yasaklıyor, yani depolanmış XSS kapısı mevcut. `escHtml`'i silmek güvenlik açığı **oluşturmaz**; aksine yanlış güveni kaldırır.

---

### L-05 — Renderer'da `console.error` kullanımı

**Kategori:** Kod Temizliği
**Dosya:** `src/renderer/app.js:68`, `src/main/i18n.js:47` (ve benzerleri)

**Sorun:** Üretim yapısında hata ayrıntıları DevTools konsoluna yazılıyor. Electron'da bu, paketlenmiş uygulamada da erişilebilir (DevTools açılabiliyorsa).

**Etki:** Düşük — bilgi sızıntısı sınırlı. Ancak log gürültüsü ve tutarsız hata yönetimi.

**Düzeltme:** Merkezi bir logger kullanın ve üretimde seviyeyi kısın:
```js
// src/renderer/logger.js
const isDev = !window.electronAPI?.isPackaged;
export const log = {
    warn: (...a) => { if (isDev) console.warn(...a); },
    error: (...a) => { if (isDev) console.error(...a); }
};
```

---

### L-06 — `directClaim` ve `void directClaim` gereksiz

**Kategori:** Kod Temizliği
**Dosya:** `src/main/services/TaskManager.js:376`, `:386`

**Sorun:** `const directClaim = ...; void directClaim;` deseni, bir değerin kasıtlı olarak kullanılmadığını susturmak için kullanılmış; ancak değişken hiçbir işe yaramıyor.

**Düzeltme:** Atamayı kaldırın, yan etki gerekiyorsa doğrudan çağırın:
```js
this._claimForExecution(task);       // yan etki açık
```
veya değer gerekiyorsa gerçekten kullanın.

---

### L-07 — Kullanılmayan `err` parametreleri

**Kategori:** Kod Temizliği
**Dosya:** `main.js:1179` ve benzeri `catch (err) { /* err kullanılmıyor */ }` blokları

**Sorun:** Sessiz yutma (`catch (_)`) ile "hatayı logla" arasındaki ayrım kayboluyor.

**Düzeltme:** Kullanılmayacaksa `catch { }` (opsiyonel binding) veya `catch (_)` yazın; kullanılacaksa loglayın. Tutarlılık için proje genelinde tek stil seçin.

---

### L-08 — Model indirme toplam boyutu iki yerde sabit kodlanmış

**Kategori:** Kod Temizliği / Bakım
**Dosya:** `src/renderer/app.js:2518`, `:2820`

**Sorunlu kod:**
```js
const total = 1374389534; // ~1.28GB hedef (bilgi amaçlı)
```

**Etki:** Model güncellendiğinde (boyut değiştiğinde) ilerleme çubuğu **%100'ü aşar** veya **hiç dolmaz**. İki kopya olduğu için biri güncellenip diğeri unutulur.

**Düzeltme:** Boyutu ana süreçten bildirin:
```js
// ModelManager → getStatus() içinde
return { model: { present, bytes, partialBytes, expectedBytes: MODEL_EXPECTED_BYTES }, ... };
```
```js
// renderer
const total = (st.model && st.model.expectedBytes) || 1374389534;
```
ve tek bir sabit tanımlayın (`src/main/services/ModelManager.js`).

---

### L-09 — `appVersion` için sabit `'1.1.0'` yedeği iki yerde

**Kategori:** Kod Temizliği
**Dosya:** `main.js:203`, `main.js:418`

**Sorunlu kod:**
```js
let appVersion = '1.1.0';
```

**Etki:** `app.getVersion()` başarısız olursa (paketlenmemiş çalıştırma, bozuk `package.json`) yanlış sürüm gösterilir. İki kopya → güncellemede biri kalır.

**Düzeltme:**
```js
let appVersion = '0.0.0-dev';
try { appVersion = app.getVersion() || appVersion; } catch (_) { /* varsayılan kalsın */ }
```
Tek bir yardımcıya taşıyın (`getAppVersion()`), iki yerde tekrar etmeyin.

---

### L-10 — `new URL(req.url, ...)` try/catch dışında (LocalApiService)

**Kategori:** Hata & Mantık
**Dosya:** `src/main/services/LocalApiService.js:375`

**Sorunlu kod:**
```js
const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
```
`req.headers.host` istemci kontrollü. `Host: [` gibi bozuk bir değer `TypeError: Invalid URL` fırlatır ve `handleRequest` içinde yakalanmaz.

**Etki:** İstek başına yakalanmamış istisna; Node sürümüne göre süreç uyarısı veya bağlantı sızıntısı. Ayrıca `Host` başlığı üzerinden yönlendirme/parsing manipülasyonu.

**Düzeltme:**
```js
let parsedUrl;
try {
    const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : '127.0.0.1';
    parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);
} catch (_) {
    return this.sendJson(res, 400, { error: 'Geçersiz istek.', code: 'BAD_REQUEST_TARGET' });
}
```
> Daha iyisi: `Host` başlığını hiç kullanmayın; sabit bir taban (`http://localhost`) ile parse edin, çünkü yalnızca `pathname` ve `query` kullanılıyor.

---

### L-11 — `sendJson` `headersSent` koruması taşımıyor

**Kategori:** Hata & Mantık
**Dosya:** `src/main/services/LocalApiService.js:750-762` · `src/console/ConsoleServer.js:742-745`

**Sorunlu kod:**
```js
sendJson(res, statusCode, data) {
    // ...
    res.writeHead(statusCode, { ... });   // ← ikinci kez çağrılırsa ERR_HTTP_HEADERS_SENT
    res.end(JSON.stringify(data));
}
```

**Etki:** İstemci isteği iptal ederse veya iki hata yolu art arda `sendJson` çağırırsa (`413` sonrası `route` hatası gibi) `ERR_HTTP_HEADERS_SENT` fırlar; bazı yerlerde `try/catch` var, bazılarında yok → gürültülü log ve olası süreç istikrarsızlığı.

**Düzeltme:**
```js
sendJson(res, statusCode, data) {
    if (!res || res.writableEnded || res.headersSent) return;
    // ... cache mantığı ...
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
}
```

---

### L-12 — `preload.js` listener kaldırma API'si sunmuyor

**Kategori:** Hata & Mantık / Kod Temizliği
**Dosya:** `preload.js`

**Sorun:** `onWarningStarted`, `onTimerCancelled` vb. `ipcRenderer.on(...)` kaydediyor ancak renderer'a bir `off`/`unsubscribe` döndürmüyor.

**Etki:** Renderer yeniden yüklendiğinde (veya HMR benzeri bir yeniden başlatmada) aynı kanal için **ikinci** listener eklenir. Tek bir olay iki kez işlenir: çift toast, çift `hideWarningBanner`, çift `switchView`.

**Düzeltme:**
```js
// preload.js
function subscribe(channel, callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);   // unsubscribe
}

contextBridge.exposeInMainWorld('electronAPI', {
    // ...
    onWarningStarted: (cb) => subscribe('warning-started', cb),
    onTimerCancelled: (cb) => subscribe('timer-cancelled', cb)
});
```
```js
// renderer
const unsub = window.electronAPI.onWarningStarted(showWarning);
window.addEventListener('beforeunload', unsub, { once: true });
```

---

### L-13 — `WarningManager` geri sayım interval'ı `TimerRegistry` dışında ve `unref` edilmemiş

**Kategori:** Performans / Hata & Mantık
**Dosya:** `src/main/services/WarningManager.js:51`

**Sorunlu kod:**
```js
timerInterval = setInterval(() => {
    secondsLeft--;
    // ...
}, 1000);
```

**Etki:**
- `TimerRegistry` üzerinden yönetilmediği için `timers.clearAll()` (kapanış yolu, `headless.js:188`) bu interval'ı **durdurmaz**.
- `unref()` yok → uyarı aktifken uygulama kapanmak isterse olay döngüsü canlı kalır; `app.quit()` gecikir veya servis modunda süreç sonlanmaz.
- `clearInterval(timerInterval)` yalnızca `secondsLeft <= 0` dalında (`:63`) ve `cancelActiveWarning` içinde çağrılıyor; bir istisna arada fırlarsa interval sahipsiz kalır.

**Düzeltme:**
```js
constructor(options = {}) {
    // ...
    this.timers = options.timerRegistry || null;
}

startWarning(task, durationSeconds) {
    // ...
    this._clearTick();
    const tick = () => { /* mevcut gövde */ };
    this.timerInterval = this.timers
        ? this.timers.setInterval(tick, 1000)
        : setInterval(tick, 1000);
    if (this.timerInterval && typeof this.timerInterval.unref === 'function') {
        this.timerInterval.unref();
    }
}

_clearTick() {
    if (!this.timerInterval) return;
    if (this.timers) this.timers.clear(this.timerInterval);
    else clearInterval(this.timerInterval);
    this.timerInterval = null;
}
```
> `finishWarning`, `cancelActiveWarning` ve `snoozeActiveWarning` yollarının **hepsinde** `_clearTick()` çağırın; `try/finally` ile sarın.

---

## 5. Kategori Bazlı Çapraz İndeks

### 5.1 Hata & Mantık Hataları
| ID | Başlık | Öncelik |
|---|---|---|
| C-01 | `warning-cancel` async PIN `await` eksik | Kritik |
| C-02 | `warning-snooze` async PIN `await` eksik | Kritik |
| C-03 | Tanımsız `startTimer()` çağrısı | Kritik |
| H-03 | `ConsoleServer` bind hatası + ham hata sızıntısı | Yüksek |
| M-02 | Süre limiti tutarsızlığı (3 farklı değer) | Orta |
| M-11 | Webhook `http://` kabul / `https://` zorunlu | Orta |
| L-10 | `new URL()` try/catch dışında | Düşük |
| L-11 | `sendJson` `headersSent` koruması yok | Düşük |
| L-12 | Preload listener kaldırma API'si yok | Düşük |

### 5.2 Performans & Optimizasyon
| ID | Başlık | Öncelik |
|---|---|---|
| H-05 | Çift `getActiveState()` + çift sayaç riski | Yüksek |
| H-06 | Webhook sınırsız fan-out + takipsiz retry | Yüksek |
| M-05 | O(n²) toplu yazma + çift `stringify` | Orta |
| M-06 | `loadTasks` 5 sn polling, guard yok | Orta |
| L-01 | Sır başına ayrı fsync | Düşük |
| L-02 | `SmartFinishEngine` sınırsız map büyümesi | Düşük |
| L-13 | `WarningManager` interval takipsiz | Düşük |

### 5.3 Kod Temizliği
| ID | Başlık | Öncelik |
|---|---|---|
| L-04 | Kullanılmayan `escHtml` / `currentActionString` | Düşük |
| L-05 | Renderer `console.error` | Düşük |
| L-06 | `directClaim` / `void directClaim` | Düşük |
| L-07 | Kullanılmayan `err` parametreleri | Düşük |
| L-08 | Sabit kodlanmış model boyutu (2 kopya) | Düşük |
| L-09 | Sabit `'1.1.0'` sürüm yedeği (2 kopya) | Düşük |
| M-12 | Kapsam kapısı kırmızı + yanlış kapsam | Orta |

### 5.4 Veri Bütünlüğü & Hata Yönetimi
| ID | Başlık | Öncelik |
|---|---|---|
| C-04 | PIN değiştirme/silme mevcut PIN'i doğrulamıyor | Kritik |
| H-01 | `start()` bind hatasını yutmuyor, `ok:true` yanlış | Yüksek |
| H-02 | Idempotency anahtarı kapsamsız + 4xx cache | Yüksek |
| H-04 | Ayarlar iki adımlı, atomik değil | Yüksek |
| M-01 | `validateTaskData` 5 alanı doğrulamıyor | Orta |
| M-03 | `_persist` `false` dönüşü yok sayılıyor | Orta |
| M-04 | `getSettings()` canlı referans sızdırıyor | Orta |
| M-07 | `OrderQueue.persist` hatası yutuluyor | Orta |
| M-08 | `headless` `start`/`stop` await edilmiyor | Orta |
| M-09 | `ConsoleStore.snapshot` null deref + şema kontrolü yok | Orta |
| M-10 | Dil/enerji PIN'den önce yazılıyor | Orta |
| L-03 | `seenNonces` üst sınırsız | Düşük |

### 5.5 İyileştirme Önerileri (yeni iş, hata değil)

1. **Tek doğruluk kaynağı limitler:** `src/shared/limits.js` + `preload` ile renderer'a aktarım (M-02).
2. **Ortak hata zarfı:** Tüm IPC ve HTTP yanıtlarında `{ ok, code, message, retryAfterSec }` standardı. `main.js`'te `ipcHandle` zaten sarmalıyor; `code` alanını zorunlu hale getirin.
3. **Yapısal loglama:** `console.*` yerine seviyeli logger (`debug/info/warn/error`) + üretimde `debug` kapalı. Denetim kaydı (audit) ile uygulama logunu ayırın.
4. **Renderer'ı modüllere ayırma:** 3.207 satırlık `app.js` tek dosya; en az `tasks/`, `settings/`, `wizard/`, `timer/` modüllerine bölün. Mevcut `try/catch` ile yutulan hatalar (C-03 gibi) bu yapıda statik analizle yakalanabilir hale gelir.
5. **Test kapsamı:** PIN akışları (C-01/C-02/C-04), `validateTaskData` sınır durumları (M-01), `StorageService` yazma hatası yolları (M-03) için birim testi yok. Bu üç alan, bulunan kritik hataların tamamını kapsıyor.
6. **`eslint` kuralı:** `require-await` ve `@typescript-eslint/no-floating-promises` benzeri kurallar (veya `no-floating-promises` muadili) C-01/C-02/H-01/M-08 sınıfı hataları derleme zamanında yakalar.
7. **Kapanış protokolü:** `app.on('before-quit')` içinde tek bir `shutdown()` orkestrasyonu: `timers.clearAll()` → `webhookService.dispose()` → `await localApiService.stop()` → `storage.close()`. Şu anda bu sıra üç ayrı yerde dağınık.
8. **Webhook "Test et" düğmesi + son hata görünürlüğü** (M-11 ile birlikte).
9. **Görev listesinde anahtar bazlı diff** (M-06 ek notu) — 500+ görevde algılanabilir kazanç.
10. **Sürüm/şema meta kapısı:** `ConsoleStore` ve `StorageService` için `schema_version` + `migrate()` deseni (M-09).

---

## 6. Yayın Öncesi Düzeltme Sırası (önerilen)

| Sıra | ID | Gerekçe | Tahmini efor |
|---|---|---|---|
| 1 | C-01, C-02 | Ürünün temel güvenlik vaadi çalışmıyor | ~15 dk + test |
| 2 | C-04 | PIN kapısı tek çağrıyla atlatılabiliyor | ~30 dk |
| 3 | C-03 | Aktif sayaç geri yüklenmiyor | ~20 dk |
| 4 | H-01 | API sessizce ölü kalabiliyor | ~1 saat |
| 5 | H-04 | Yarım kalan ayar durumu | ~1 saat |
| 6 | H-02 | Idempotency çapraz sızıntı | ~45 dk |
| 7 | H-03 | Konsol süreci çökebiliyor | ~45 dk |
| 8 | H-05, H-06 | Çift sayaç + webhook seli | ~1,5 saat |
| 9 | M-01, M-03, M-07 | Veri bütünlüğü zinciri | ~2 saat |
| 10 | M-05, M-06 | Performans | ~2 saat |
| 11 | M-02, M-04, M-08, M-09, M-10, M-11 | Tutarlılık | ~3 saat |
| 12 | L-* | Temizlik | ~2 saat |

**Toplam tahmini:** ~1,5 iş günü (test yazımı hariç).

**Yayın kapısı (gate):** En az C-01…C-04 kapatılmadan ve her biri için regresyon testi eklenmeden sürüm çıkarılmamalıdır.

---

## 7. Doğrulanan Güçlü Yönler (değişiklik gerekmiyor)

Denetim yalnızca eksikleri değil, doğru kurulmuş savunmaları da doğruladı:

- **CSP** hem `<meta>` hem HTTP header olarak tanımlı; `unsafe-eval` yok.
- **`app://` özel protokolü** ile `file://` yükleme riski ortadan kaldırılmış.
- **`SenderGuard`** ile IPC çağrılarının kaynağı doğrulanıyor.
- **`sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`** doğru yapılandırılmış; `preload` yalnızca dar bir API yüzeyi açıyor.
- **SSRF guard** protokol + port + public IP kontrolünü birlikte yapıyor (M-11'deki sorun guard'ın kendisi değil, UI'ın ondan habersiz olması).
- **Argon2id PIN** + `pinGuard` deneme sayacı + SHA-256'dan Argon2id'e şeffaf yükseltme (`main.js:97-104`).
- **HMAC denetim zinciri** ve `audit.verify()` uç noktası.
- **Electron fuses** ve `nodeIntegration` kapatma.
- **`_flushRows` snapshot diffing** yaklaşımı doğru fikir (yalnızca uygulaması M-05'te optimize edilmeli).
- **`TaskManager.persistChanges`** tam liste yerine yalnızca değişenleri yazma politikası doğru (M-03/M-05 bunun tamamlanması).

---

*Rapor sonu. Toplam 34 bulgu: 4 Kritik, 6 Yüksek, 11 Orta, 13 Düşük.*
