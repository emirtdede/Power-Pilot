# Power Pilot — Dağıtım Öncesi Kod Denetimi

**Tarih:** 22 Ekim 2026  
**Sürüm:** 1.0.1 (`package.json`)  
**Platform:** Electron 43.4.0 / Windows  
**Kapsam:** `main.js`, `preload.js`, `src/index.html` (gömülü renderer JS), `src/mini.html`, `src/main/**`, `src/console/**`, `src/agent/**`, `src/renderer/i18n.js`  
**Yöntem:** Salt-okunur statik inceleme + çalışma zamanı akış analizi. Dinamik test/penetrasyon çalıştırılmadı. Bu denetimde **hiçbir kaynak dosya değiştirilmedi**.

> **Önemli kapsam notu:** Proje Next.js/React değildir. Electron + vanilla JavaScript (tek büyük gömülü script) kullanılmaktadır. Bu nedenle React Hooks, `useEffect` cleanup, SSR/hydration, Server Components, RSC, Next.js middleware, `getServerSideProps` ve ORM/SQL kaynaklı bulgular **uygulanamaz**. İlgili başlıklar raporun sonunda ayrıca belirtilmiştir. İstenen `src/app` dizini bu projede yoktur; kapsam yukarıdaki gerçek uygulama dizinlerine eşlenmiştir.

---

## 1. Yönetici Özeti

Denetimde **49** bulgu tespit edildi:

| Öncelik | Adet | Ana tema |
|---|---:|---|
| **Kritik** | 6 | İmza bütünlüğü, düz HTTP, yanlış güç eylemi, koşul atlama, komut enjeksiyonu |
| **Yüksek** | 13 | Kimlik doğrulama zayıflıkları, sırların düz metin saklanması, emir kaybı/tekrarı, fail-open güvenlik |
| **Orta** | 18 | Veri bütünlüğü, yarış koşulları, hata yönetimi, performans |
| **Düşük** | 12 | Ölü kod, kozmetik hatalar, bakım borcu |

### En acil 6 madde

1. **K-01:** Ed25519 imzası `order.params` alanını kapsamıyor. Ağdaki bir saldırgan, imzayı bozmadan politika/MAC/bakım-penceresi bayraklarını değiştirebilir.
2. **K-02:** Konsol `http.createServer` ile `0.0.0.0` üzerinde dinliyor; ajan anahtarı ve emirler açık metin gidiyor.
3. **K-03:** “Kapatma” / “kapatmayın” gibi olumsuz cümleler `/kapat/` deseniyle **shutdown** olarak ayrıştırılıyor.
4. **K-04:** Smart Finish (koşullu) görevde “ertele” işlemi `trigger.targetTime` yazıyor; koşul sağlanmasa bile görev zamanı gelince çalışıyor.
5. **K-05:** “İndirilenler Sabitlenince Kapat” şablonu **klasörün** `mtime` değerini izliyor; uzun indirmelerde indirme bitmeden kapatma tetiklenebiliyor.
6. **K-06:** Görev kimliği `schtasks /tr` komutuna ham giriyor; `"` içeren bir kimlik komut enjeksiyonuna yol açıyor.

---

## 2. Kritik Bulgular

### K-01 — İmzalı emirde `params` alanı imza kapsamı dışında (bütünlük ihlali)

**Konum:**
- `src/main/services/SignedOrderService.js:13-22`
- `src/console/ConsoleServer.js:313-322`
- `src/main/services/OrderExecutor.js:26-31, 47-50, 63-72`

**Hatalı kod:**

```js
// SignedOrderService.js:13-22
function canonical(order) {
    const o = order || {};
    const keys = ['action', 'targets', 'nonce', 'issuedAt', 'expiresAt', 'issuer'];
    const slim = {};
    for (const k of keys) {
        if (o[k] !== undefined) slim[k] = o[k];
    }
    return Buffer.from(JSON.stringify(slim), 'utf8');
}
```

Emir `params` ile birlikte taşınıyor ve icra ediliyor:

```js
// ConsoleServer.js:313-321
const order = {
    action,
    params,                 // <-- imzaya girmiyor
    targets: [agentId],
    nonce: ...,
    issuedAt: now,
    expiresAt: now + 10 * 60000,
    issuer: 'console'
};
```

```js
// OrderExecutor.js:28-31
if (action === 'apply-policy') {
    const taskData = materializeToTask(params.policy, { source: 'console' });
    const task = this.tasks.createTask({ ...taskData, consoleOrderId: order.nonce });
```

**Etki:** İmza yalnızca eylem adı, hedefler, nonce ve zamanı koruyor. Araya giren bir saldırgan (K-02 nedeniyle düz HTTP’de mümkün) şunları imzayı bozmadan değiştirebilir:

- `apply-policy` içindeki `params.policy` → farklı saat, farklı eylem (sleep/hibernate), farklı hedefler.
- `requiresMaintenanceWindow` / `policyId` → bakım penceresi ve politika denetiminin atlatılması.
- `wake` emrinde `mac`, `broadcastIp`, `notBefore` → başka cihazın uyandırılması veya geciktirilmesi.

Bu, “imzalı emir” güvenlik modelinin temelini geçersiz kılar.

**Düzeltme:** `params` alanını kanonik serileştirmeye ekleyin ve iç içe nesnelerde anahtar sırasını deterministik yapın. Bilinmeyen üst düzey alanları reddedin.

```js
function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, k) => {
            acc[k] = stable(value[k]);
            return acc;
        }, {});
    }
    return value;
}

function canonical(order) {
    const o = order || {};
    const keys = ['action', 'targets', 'params', 'nonce', 'issuedAt', 'expiresAt', 'issuer'];
    const slim = {};
    for (const k of keys) {
        if (o[k] !== undefined) slim[k] = stable(o[k]);
    }
    return Buffer.from(JSON.stringify(slim), 'utf8');
}
```

Ayrıca `verify()` içinde hedef ve yayıncı doğrulaması yapın (bkz. H-05):

```js
if (order.issuer !== 'console') return { ok: false, code: 'BAD_ISSUER' };
```

---

### K-02 — Konsol düz HTTP üzerinden `0.0.0.0` dinliyor

**Konum:**
- `src/console/ConsoleServer.js:416-421`
- `src/main/services/ConsoleClient.js:58-64`
- `src/main/ipc/validate.js:326-333`

**Hatalı kod:**

```js
// ConsoleServer.js:416-421
start(port = 8443, host = '0.0.0.0') {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(port, host, () => {
        console.log(`[Console] http://${host}:${port} (ajanlar outbound bağlanır; TLS için ters-vekil kullanın)`);
    });
    return this.server;
}
```

```js
// ConsoleClient.js:60-64
res = await this.fetch(`${base}/api/v1/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': s.consoleAgentKey },
    body: JSON.stringify({ agentId: inv && inv.agentId, inventory: inv, receipts })
});
```

**Etki:** Ajan API anahtarı, envanter (kullanıcı adı, makine adı, IP’ler), imzalı emirler ve makbuzlar LAN’da açık metin gider. Ağdaki bir saldırgan:

- Ajan anahtarını ele geçirip sahte heartbeat gönderebilir (H-05 ile birlikte başka ajan gibi davranabilir).
- Emirleri okuyup hangi makinenin ne zaman kapatılacağını öğrenebilir.
- Bağlantıyı keserek emir kaybına yol açabilir (H-04).

**Düzeltme:** Varsayılan olarak TLS zorunlu olsun; `http://` yalnızca açık bir geliştirme bayrağıyla ve yalnızca loopback’te kabul edilsin.

```js
// validate.js
if (parsed.protocol !== 'https:' && !settings.allowInsecureConsole) {
    return fail('Konsol URL’si https:// olmalı.', 'CONSOLE_TLS_REQUIRED');
}
```

Sunucu tarafında ters vekil kullanılacaksa `X-Forwarded-Proto: https` zorunlu tutulmalı ve vekil dışından gelen istekler reddedilmeli. Ideal çözüm: `https.createServer({ key, cert, ca, requestCert: true })`.

---

### K-03 — “Kapatma” / “kapatmayın” olumsuz cümlesi shutdown olarak ayrıştırılıyor

**Konum:**
- `src/main/services/DeterministicParser.js:12-18`
- `src/main/services/DeterministicParser.js:108-112`
- `src/main/services/DeterministicParser.js:152-170`

**Hatalı kod:**

```js
const ACTION_PATTERNS = [
    ...
    { action: 'shutdown', re: /kapat|kapan/i }
];
```

```js
function parse(text) {
    ...
    const action = findAction(t);       // "kapatma" -> shutdown
    if (!action) return null;
    const durationMs = parseDurationMs(t);
    ...
    return { action, kind: 'duration', missing: ['durationMs'] };
}
```

**Etki:** “Bilgisayarı **kapatma**”, “**kapatmayın**”, “kapatmam lazım değil” gibi cümleler `shutdown` eylemi + eksik süre olarak döner. Arayüz “ne kadar süre?” diye sorar; kullanıcı süre girerse **isteseydi kapatmayacağı** makine kapanır. Güvenlik açısından en yüksek riskli hata sınıfıdır.

**Düzeltme:** Olumsuzluk eklerini eylem eşleşmesinden önce reddedin ve kelime sınırı kullanın.

```js
const NEGATION = /(kapatma|kapatmayın|kapatmam|kapatmıyor|kapatmayacağım|kapanmasın)/i;

function findAction(text) {
    if (NEGATION.test(text)) return null;   // LLM'e veya netleştirmeye bırak
    for (const { action, re } of ACTION_PATTERNS) {
        if (re.test(text)) return action;
    }
    return null;
}
```

Alternatif olarak `/(?:^|[^a-zçğıöşü])kapat(?:[^a-zçğıöşü]|$)/i` gibi sınırlı desen kullanın; `kapatma` bu desene takılmaz. Testlere “kapatma”, “kapatmayın”, “kapatmam gerekmiyor” senaryoları eklenmeli.

---

### K-04 — Koşullu görevde “ertele”, görevi zamanlayıcıya dönüştürüp koşulu atlıyor

**Konum:**
- `src/main/services/TaskManager.js:555-581` (özellikle 570-577)
- `src/main/services/TaskManager.js:204-214` (zamanlayıcı / koşul ayrımı)
- `src/main/services/models/AutomationTask.js:150-155`

**Hatalı kod:**

```js
// TaskManager.js:570-577
task.snoozeConfig.currentCount += 1;
const base = Math.max(Number(task.trigger.targetTime) || 0, Date.now());
task.trigger.targetTime = base + (safeMinutes * 60 * 1000);
task.status = TASK_STATUS.SCHEDULED;
```

```js
// evaluateTasks:204-208
if (task.trigger.targetTime && now >= task.trigger.targetTime && task.status === TASK_STATUS.SCHEDULED) {
    readyToExecute.push(task);   // koşullar hiç değerlendirilmiyor
    return;
}
```

**Etki:** Smart Finish görevi (`status === 'monitoring'`, örn. “indirme bitince kapat”) kullanıcı tarafından ertelendiğinde `targetTime` yazılır ve durum `SCHEDULED` olur. Süre dolduğunda koşul **değerlendirilmeden** görev çalışır. Yani indirme hâlâ sürerken makine kapanabilir. Ayrıca:

- `snoozeConfig.allowed === false` (kurumsal idle-lock) kontrol edilmiyor.
- `snoozeConfig.maxCount` hiçbir yerde uygulanmıyor; sınırsız ertelenebiliyor.
- `snoozeConfig.durationMinutes` ile kullanıcının girdiği süre çelişebiliyor (bkz. H-10).
- `TaskSchedulerBridge.shouldSync` (`TaskSchedulerBridge.js:74-82`) `monitoring` + `targetTime` gördüğünde görevi Windows Görev Zamanlayıcı’ya da yazıyor; uygulama kapalıyken bile koşul atlanarak çalışabilir.

**Düzeltme:** Koşullu görevlerde `targetTime` yazmayın; ertelemeyi ayrı bir `notBefore` alanı olarak tutun ve `evaluateTasks` içinde koşul değerlendirmesini atlamayın.

```js
snoozeTask(taskId, minutes = 10) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return { ok: false, code: 'NOT_FOUND' };

    const cfg = task.snoozeConfig || {};
    if (cfg.allowed === false) return { ok: false, code: 'SNOOZE_NOT_ALLOWED' };
    if (Number.isInteger(cfg.maxCount) && cfg.currentCount >= cfg.maxCount) {
        return { ok: false, code: 'SNOOZE_LIMIT' };
    }

    const safeMinutes = Math.min(Math.max(Number(minutes) || 10, 1), 1440);
    const hasConditions = task.conditionGroup &&
        Array.isArray(task.conditionGroup.conditions) &&
        task.conditionGroup.conditions.length > 0;

    if (hasConditions) {
        task.trigger.notBefore = Date.now() + safeMinutes * 60000;
        task.status = TASK_STATUS.MONITORING;
    } else {
        const base = Math.max(Number(task.trigger.targetTime) || 0, Date.now());
        task.trigger.targetTime = base + safeMinutes * 60000;
        task.status = TASK_STATUS.SCHEDULED;
    }
    cfg.currentCount += 1;
    ...
}
```

`evaluateTasks` içinde koşullu dal şu kapıyı da kontrol etmeli:

```js
if (hasConditions && now >= (task.trigger.notBefore || 0)) { ... }
```

---

### K-05 — “İndirilenler Sabitlenince Kapat” şablonu klasörün `mtime` değerini izliyor

**Konum:**
- `src/main/services/TemplateService.js:126-136`
- `src/main/services/SmartFinishEngine.js:118-134`

**Hatalı kod:**

```js
// TemplateService.js:132-135
defaultCondition: {
    type: 'file_stable',
    filePath: path.join(os.homedir(), 'Downloads'),
    stableSeconds: 300
}
```

```js
// SmartFinishEngine.js:124-129
const stats = fs.statSync(filePath);
const lastModifiedAgoSec = Math.floor((now - stats.mtimeMs) / 1000);
const requiredSec = cond.stableSeconds || 60;
return { satisfied: lastModifiedAgoSec >= requiredSec, ... };
```

**Etki:** Bir klasörün `mtime` değeri, içine yeni dosya eklendiğinde/silindiğinde değişir; **var olan bir dosyaya veri yazılırken değişmez**. 30 dakikalık bir indirme, başladıktan sonra klasörün `mtime` değerini güncellemez; 5 dakika sonra koşul “sabitlendi” sayılır ve makine indirme sürerken kapanır. Ayrıca `.crdownload` / `.part` / `.tmp` geçici dosyaları kontrol edilmiyor.

**Düzeltme:** Dosya yerine klasör içeriğini tarayın; en yeni `mtime` ve toplam boyutu örnekler arasında karşılaştırın; geçici indirme uzantılarını özellikle bekleyin.

```js
function isDirectoryStable(dir, stableSeconds) {
    const now = Date.now();
    let newest = 0;
    let total = 0;
    let hasPartial = false;
    for (const name of fs.readdirSync(dir)) {
        if (/\.(crdownload|part|tmp|download)$/i.test(name)) hasPartial = true;
        const st = fs.statSync(path.join(dir, name));
        newest = Math.max(newest, st.mtimeMs);
        total += st.size;
    }
    return !hasPartial && (now - newest) >= stableSeconds * 1000;
}
```

Kısa vadede built-in şablonu `network_speed` koşuluna çevirmek daha güvenlidir; “dosya sabit” koşulu yalnızca kullanıcının açıkça seçtiği tek bir dosya için sunulmalıdır.

---

### K-06 — `schtasks /tr` içinde görev kimliği ile komut enjeksiyonu

**Konum:**
- `src/main/services/TaskSchedulerBridge.js:84-89`
- `src/main/services/TaskSchedulerBridge.js:29-35`
- `src/main/services/models/AutomationTask.js:98`
- `src/main/ipc/validate.js:141-159`
- `main.js:615-622`

**Hatalı kod:**

```js
// TaskSchedulerBridge.js:84-89
buildCreateCommand(task) {
    const name = TaskSchedulerBridge.taskName(task.id);
    const { date, time } = TaskSchedulerBridge.formatTriggerDate(task.trigger.targetTime);
    const runCmd = `"${this.exePath}" --run-task=${task.id}`;   // task.id ham
    return `schtasks /create /tn "${name}" /tr "${runCmd}" /sc ONCE /sd ${date} /st ${time} /f`;
}
```

```js
// AutomationTask.js:98
this.id = data.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

```js
// validate.js:141-146 — yalnızca tip/uzunluk kontrolü
function validateTaskId(taskId) {
    if (typeof taskId !== 'string' || taskId.length === 0 || taskId.length > MAX_TASK_ID_LEN) {
        return fail('Geçersiz taskId.', 'INVALID_TASK_ID');
    }
    return { ok: true };
}
```

**Etki:** `create-task` IPC’si `data.id` değerini olduğu gibi kabul ediyor. `id` içinde `"` ve `&` bulunursa `schtasks` çağrısı kabuk tarafından yorumlanır. Örnek:

```
x" & calc.exe & "
```

oluşan komut:

```
schtasks ... /tr ""C:\...\PowerPilot.exe" --run-task=x" & calc.exe & "" ...
```

Bu, kullanıcı yetkisiyle **keyfi kod çalıştırma** demektir. Giriş vektörü renderer IPC’sidir; CSP olmaması ve `mode`/`agentDisabled` gibi güvenlik bayraklarının renderer’a açık olması (H-13) ile birlikte savunma derinliği zayıftır.

**Düzeltme:** Kimliği istemciden **hiç kabul etmeyin** veya katı biçimde doğrulayın; `exec` yerine argüman dizisi kullanan `execFile`/`spawn` tercih edin.

```js
// AutomationTask.js
const incoming = typeof data.id === 'string' ? data.id : '';
this.id = /^[A-Za-z0-9_-]{1,64}$/.test(incoming)
    ? incoming
    : `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
```

```js
// TaskSchedulerBridge.js
const safeId = TaskSchedulerBridge.sanitizeTaskId(task.id);
const runCmd = `"${this.exePath}" --run-task=${safeId}`;
```

Uzun vadede `schtasks` yerine Görev Zamanlayıcı COM API’si veya en azından `execFile('schtasks.exe', [...args])` kullanılmalı; böylece kabuk yorumlaması tamamen devre dışı kalır.

---

## 3. Yüksek Öncelikli Bulgular

### H-01 — mTLS istemci sertifikası doğrulaması baypas edilebilir

**Konum:** `src/main/services/LocalApiService.js:90-119, 309-311`

**Hatalı kod:**

```js
requestCert: true,
rejectUnauthorized: settings.localApiTlsStrict === true
```

```js
isClientCertOk(req, settings) {
    if (!settings.localApiRequireClientCert) return true;
    try {
        const sock = req.socket || {};
        if (typeof sock.getPeerCertificate === 'function') {
            const peer = sock.getPeerCertificate();
            if (!peer || Object.keys(peer).length === 0) return false;
            return true;   // <-- authorized kontrolü yok
        }
        return false;
    } catch (_) { return false; }
}
```

**Etki:** `localApiRequireClientCert: true` ve `localApiTlsStrict: false` (varsayılan) iken **herhangi bir istemci sertifikası** yeterli sayılır. Saldırgan kendi öz-imzalı sertifikasını üretip mTLS katmanını geçebilir; geriye yalnızca API anahtarı kalır. TLS katmanı da `rejectUnauthorized: false` olduğu için sertifika zinciri doğrulanmaz.

**Düzeltme:** `authorized` ve parmak izi/CA doğrulaması zorunlu olsun; mTLS açıkken `rejectUnauthorized` her zaman `true` olmalı.

```js
isClientCertOk(req, settings) {
    if (!settings.localApiRequireClientCert) return true;
    try {
        if (req.socket.authorized !== true) return false;
        const peer = req.socket.getPeerCertificate(true);
        if (!peer || !peer.fingerprint256) return false;
        // İsteğe bağlı: settings.localApiAllowedClientFingerprints listesi
        return true;
    } catch (_) {
        return false;
    }
}
```

```js
rejectUnauthorized: settings.localApiRequireClientCert === true || settings.localApiTlsStrict === true
```

---

### H-02 — Sırlar diskte düz metin; PIN için zayıf KDF

**Konum:**
- `src/main/services/StorageService.js:49, 55, 58, 81-82, 290`
- `src/main/ipc/pinGuard.js:23-25`
- `src/main/services/LocalApiService.js:276-281`

**Hatalı kod:**

```js
localApiKeyPem: null,      // sunucu özel anahtarı (PEM metni)
consoleAgentKey: null,     // ham sır
cancelPinHash: null,       // SHA256(salt:pin)
```

```js
static hashPin(pin, salt) {
    return crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}
```

Tüm veri tek JSON dosyasına yazılıyor:

```js
this.atomicWrite(this.dataPath, JSON.stringify(this.data, null, 2), durable);
```

**Etki:** Aynı kullanıcı hesabıyla çalışan başka bir süreç, yedekleme aracı, zararlı yazılım veya dosya erişimi olan herkes konsol ajan anahtarını, TLS özel anahtarını, webhook bearer/HMAC sırlarını okuyabilir. 4-8 haneli PIN için tek SHA-256, GPU ile saniyede milyonlarca deneme yapılabilen zayıf bir KDF’dir.

**Düzeltme:**
1. Windows DPAPI (`safeStorage.encryptString`) veya ayrı, ACL kısıtlı bir `secrets.json` kullanın.
2. PIN için `scrypt`/`argon2id` + yüksek maliyet parametreleri kullanın.
3. Veri dosyasına yalnızca geçerli kullanıcı için okuma/yazma izni verin.

```js
const { safeStorage } = require('electron');
function seal(plain) {
    return safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(plain).toString('base64')
        : null; // fallback YOK; açıkça hata ver
}
```

```js
const crypto = require('crypto');
function hashPin(pin, salt) {
    return crypto.scryptSync(pin, salt, 32, { N: 1 << 15, r: 8, p: 1 }).toString('hex');
}
```

> Not: `safeStorage` yalnızca ana süreçte kullanılabilir; headless ajan için DPAPI/PowerShell veya ayrı bir kimlik bilgisi deposu gerekir.

---

### H-03 — Yerel API, LAN modunda TLS olmadan admin anahtarını açık metin taşıyor

**Konum:**
- `src/main/ipc/validate.js:338-350`
- `src/main/services/LocalApiService.js:224-234`
- `src/main/services/LocalApiService.js:314-322`

**Hatalı kod:**

```js
if (effective.lanModeEnabled === true) {
    const list = Array.isArray(effective.lanAllowedIps) ? effective.lanAllowedIps : [];
    if (list.length === 0) return fail(...);
    if (effective.localApiTlsEnabled === true) {
        // yalnızca TLS açıksa sertifika zorunlu
    }
}
```

**Etki:** `lanModeEnabled: true`, `localApiTlsEnabled: false` yapılandırması geçerlidir. Bu durumda `0.0.0.0`/`::` üzerinde HTTP dinlenir ve her istekte `X-API-Key` açık metin gider. LAN’daki bir saldırgan admin anahtarını ele geçirip tüm güç eylemlerini ve muafiyetleri yönetebilir.

**Düzeltme:** LAN modu ile TLS’i birbirine bağlayın; TLS yoksa yalnızca loopback’e izin verin.

```js
if (effective.lanModeEnabled === true && effective.localApiTlsEnabled !== true) {
    return fail('LAN modu için TLS zorunludur.', 'LAN_REQUIRES_TLS');
}
```

Sunucu tarafında da son savunma olarak:

```js
if (lanBound && this.transport !== 'https') {
    throw new Error('LAN modunda HTTP dinlenemez.');
}
```

---

### H-04 — Konsol, emri ajanın aldığını doğrulamadan kuyruktan siliyor (at-most-once kayıp)

**Konum:** `src/console/ConsoleServer.js:100-110`

**Hatalı kod:**

```js
const due = ... ? [] : (this.store.queues[agentId] || []);
if (!((this.store.disabledAgents || []).includes(agentId))) {
    this.store.queues[agentId] = [];   // yanıt gönderilmeden önce siliniyor
}
this.save();
return { serverTime: now, orders: due, ... };
```

**Etki:** Kuyruk, HTTP yanıtı ajanın eline ulaşmadan temizleniyor. Bağlantı kopması, paket kaybı, süreç çökmesi veya ajanın yanıtı işleyememesi durumunda emir **kalıcı olarak kaybolur**. Makine kapatma/yeniden başlatma emri sessizce düşebilir. Ajan tarafındaki idempotent kuyruk bunu telafi etmez çünkü emir ajana hiç ulaşmamıştır.

**Düzeltme:** Teslimi makbuz (receipt) ile onaylayın; kuyruktan yalnızca ajan `nonce` için `acked` bildirdikten sonra düşün.

```js
// heartbeat içinde:
const due = this.store.queues[agentId] || [];
// kuyruğu temizleme; yalnızca teslim edilenleri "in-flight" işaretle
for (const o of due) o.deliveredAt = now;

// ayrı uç: POST /api/v1/receipts
for (const r of receipts) {
    this.store.queues[agentId] = (this.store.queues[agentId] || [])
        .filter(o => o.nonce !== r.nonce);
}
this.save();
```

Makbuz gelmezse emir `expiresAt`’e kadar yeniden gönderilmeli. Ajan tarafı zaten `nonce` ile idempotent olduğu için tekrar teslim güvenlidir.

---

### H-05 — Emirde hedef/yayıncı doğrulaması yok; ajan kimliği anahtara bağlı değil

**Konum:**
- `src/main/services/SignedOrderService.js:93-145`
- `src/main/services/ConsoleClient.js:116-130`
- `src/console/ConsoleServer.js:92-98, 460-474`

**Hatalı kod:**

```js
// ConsoleClient.js:121-130
for (const signed of orders) {
    const v = verifier.verify(signed);
    if (!v.ok) { ... continue; }
    const { duplicate } = this.queue.enqueue(signed);   // hedef kontrolü yok
```

```js
// ConsoleServer.js:92-98
heartbeat(agentId, inventory, receipts = []) {
    ...
    this.store.agents[agentId] = { agentId, inventory: inventory || null, ... };
```

**Etki:** İki ayrı sorun birleşiyor:

1. **Hedef doğrulaması yok:** A ajanına gönderilen imzalı emir, B ajanına tekrar gönderilebilir. B’nin nonce deposunda görülmediği için imza geçerli sayılır; `targets: ['A']` kontrol edilmediğinden B emri icra eder. 10 dakikalık TTL içinde LAN’daki bir saldırgan veya ele geçirilmiş bir ajan bunu yapabilir.
2. **Kimlik bağlama yok:** Heartbeat gövdesindeki `agentId` herhangi bir kimlik bilgisine bağlı değil. Tüm ajanlar aynı `agent` anahtarını paylaşıyorsa, bir ajan başka bir ajanın kimliğiyle heartbeat gönderip onun envanterini ezebilir ve ona ait kuyruğu alabilir.

**Düzeltme:**

```js
// verify() içinde
if (!Array.isArray(order.targets) || !order.targets.includes(this.agentId)) {
    return { ok: false, code: 'WRONG_TARGET' };
}
if (order.issuer !== 'console') {
    return { ok: false, code: 'BAD_ISSUER' };
}
```

`SignedOrderService` constructor’ına `agentId` enjekte edin. Heartbeat için ajan başına ayrı anahtar veya imzalı `agentId` kullanın:

```js
// ConsoleServer: keys.agent yerine keys.agents[agentId] = hash
const boundId = this.agentIdForKey(keyHash);
if (!boundId || boundId !== body.agentId) {
    return this.sendJson(res, 403, { error: 'Agent identity mismatch' });
}
```

---

### H-06 — Ajan anahtarı, görüntüleyici uçlarına erişebiliyor

**Konum:**
- `src/console/ConsoleServer.js:24`
- `src/console/ConsoleServer.js:476-496, 522-533`

**Hatalı kod:**

```js
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3, agent: 1 };
```

```js
if (method === 'GET' && p === '/api/v1/agents') {
    if (!this.needRole(res, role, 'viewer')) return;
    return this.sendJson(res, 200, { agents: this.agents() });
}
```

**Etki:** `agent` rolü `viewer` ile aynı rütbede (1). Ele geçirilmiş bir ajan anahtarı tüm filonun envanterini (kullanıcı adları, IP’ler, işletim sistemi, UPS durumu, uyandırma hazırlığı), politikaları, alt ağları ve denetim günlüğünü okuyabilir. Yatay hareket için keşif bilgisi sağlar.

**Düzeltme:** `agent` rolünü ayrı bir rütbe yapın ve yalnızca heartbeat/makbuz uçlarına izin verin.

```js
const ROLE_RANK = { agent: 1, viewer: 2, operator: 3, admin: 4 };
```

```js
// Agent rolü yalnızca kendi heartbeat'i ve makbuzu:
if (role === 'agent' && !(p === '/api/v1/heartbeat')) {
    return this.sendJson(res, 403, { error: 'Agent role is limited to heartbeat' });
}
```

---

### H-07 — Konsol deposu atomik değil; bozuk JSON sessizce sıfırlanıyor

**Konum:** `src/console/ConsoleServer.js:61-75, 70-76`

**Hatalı kod:**

```js
load() {
    try {
        if (fs.existsSync(this.storePath)) {
            const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
            this.store = Object.assign(this.store, parsed);
        }
    } catch (_) { /* bozuk dosya → temiz başla */ }
}
save() {
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf8');
}
```

**Etki:** Yazma sırasında çökme/elektrik kesintisi dosyayı yarım bırakabilir. Bir sonraki açılışta `JSON.parse` hata verir, catch bloğu **tüm ajanları, politikaları ve denetim kayıtlarını** sessizce siler; ardından `save()` boş dosyayı yazar. Yedek yoktur. Ayrıca her heartbeat’te tüm dosya yeniden yazılır (bkz. performans).

**Düzeltme:** `StorageService.atomicWrite` benzeri tmp + fsync + rename kullanın; bozuk dosyada yazmayı durdurun ve yedekten kurtarın.

```js
save() {
    const tmp = `${this.storePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf8');
    fs.renameSync(tmp, this.storePath);
}
```

```js
load() {
    try { ... } catch (err) {
        const backup = `${this.storePath}.bak`;
        if (fs.existsSync(backup)) { /* backup'tan yükle */ }
        else throw new Error('Konsol deposu bozuk; üzerine yazılmadı.');
    }
}
```

---

### H-08 — Renderer sayacı arka uçtan bağımsız; uyku/başarısızlıkta yanlış “çalıştı” diyor

**Konum:**
- `src/index.html:1401-1414`
- `src/index.html:1535-1559`
- `src/index.html:1583-1595`

**Hatalı kod:**

```js
window.electronAPI.scheduleAction({
    action: selectedAction,
    durationMs: totalSeconds * 1000
}).then(res => {
    if (res && res.success === false) { ... }
});                                   // .catch yok

startTimer(totalSeconds);             // IPC sonucu beklenmeden başlıyor
switchView('nav-active');
```

```js
countdownInterval = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining <= 0) {
        ...
        showToast(translations[currentLang].toastActionExecuted, 'success');
    } else {
        fireStagedMark(secondsRemaining);
        ...
    }
}, 1000);
```

```js
function fireStagedMark(left) {
    if (stagedMarksFired[left]) return;
    if (left === 300) { ... }
    else if (left === 60) { ... }
    else if (left === 30 || left === 10) { ... }
}
```

**Etki:**

- IPC reddedilirse veya fırlatırsa (`.catch` yok) sayaç yine de çalışır ve sonunda “eylem çalıştırıldı” toast’ı gösterir. Kullanıcı kapatıldığını sanır.
- Dizüstü uyku/uyanma veya Chromium zamanlayıcı gecikmesi nedeniyle `secondsRemaining` hedef zamandan sapar; görev arka planda çalışmış olsa bile UI yanlış gösterir.
- Kademeli uyarılar tam eşitlik (`left === 60`) kullandığı için bir tick atlanırsa 60/30/10 uyarıları hiç çalışmaz.

**Düzeltme:** Başarılı yanıttan sonra `targetTime`’ı tek doğruluk kaynağı yapın; kalan süreyi her tick’te hedef zamandan hesaplayın; `.catch` ekleyin; eşikleri `<=` ile kontrol edin.

```js
try {
    const res = await window.electronAPI.scheduleAction({ action: selectedAction, durationMs });
    if (!res || res.success === false) {
        showToast(res?.message || t('errorScheduleFailed'), 'error');
        return;
    }
    const targetTime = res.task?.trigger?.targetTime || (Date.now() + totalSeconds * 1000);
    startTimerTo(targetTime);
    switchView('nav-active');
} catch (err) {
    showToast(t('errorScheduleFailed'), 'error');
}
```

```js
function startTimerTo(targetTime) {
    targetTimeMs = targetTime;
    countdownInterval = setInterval(() => {
        const left = Math.max(0, Math.ceil((targetTimeMs - Date.now()) / 1000));
        secondsRemaining = left;
        if (left <= 0) { ... }
        fireStagedMark(left);
        updateDisplay();
    }, 1000);
}
```

---

### H-09 — İptal akışı kendi IPC olayını tetikleyip ikinci iptal/PIN istemine yol açıyor

**Konum:**
- `main.js:551-575` (özellikle 566)
- `src/index.html:1504-1533`
- `src/index.html:4046-4051`
- `src/index.html:3689-3690`

**Hatalı kod:**

```js
// main.js:562-567
if (mainWindow && !mainWindow.isDestroyed()) {
    ...
    mainWindow.webContents.send('timer-cancelled-from-tray');
}
```

```js
// index.html:4046-4051
window.electronAPI.onTimerCancelled(() => {
    const btnCancel = document.getElementById('btn-cancel');
    if (btnCancel) btnCancel.click();
});
```

`cancel-action` hem buton hem de bu olay tarafından çağrılıyor. Buton tıklaması `cancel-action`’ı tetikler; handler da `timer-cancelled-from-tray` gönderir; renderer bu olayda tekrar `btn-cancel.click()` yapar. PIN varsa ve olay yanıttan önce gelirse ikinci kez PIN sorulur; yoksa gereksiz ikinci `cancel-action` çalışır. Buton `finishCancelUi()` sonrası disable edildiği için çoğu durumda döngü kendiliğinden durur, ancak yarış koşulu PIN modalının yeniden açılmasına yol açabilir.

**Düzeltme:** Olayı yalnızca gerçek tray iptalinde gönderin; `cancel-action` içinden göndermeyin. Renderer’da olayı “başka bir kaynak zaten iptal etti” bilgisi olarak işleyin, butona tıklamayın.

```js
// main.js: cancel-action içinde gönderimi kaldır
// tray menüsünde iptal başarılıysa:
if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer-cancelled-from-tray', { source: 'tray' });
}
```

```js
// index.html
window.electronAPI.onTimerCancelled((_e, data) => {
    if (!data || data.source !== 'tray') return;
    finishCancelUi();          // butona tıklama yok
});
```

---

### H-10 — Uyarı ekranındaki “ertele” süresi yok sayılıyor; kurumsal sınır aşılıyor

**Konum:**
- `src/main/services/TaskManager.js:563-567`
- `src/main/services/TaskManager.js:374-381`
- `src/main/services/EnterprisePolicies.js:129, 148`

**Hatalı kod:**

```js
// snoozeTask:563-567
if (claim && claim.phase === 'warning' && ...) {
    this.warningManager.snoozeActiveWarning(safeMinutes, taskId);
    return { ok: true, code: 'SNOOZED_ACTIVE', minutes: safeMinutes };
}
```

```js
// executeTask:374-381 — kullanıcının girdiği süre değil, sabit ayar kullanılıyor
task.snoozeConfig.currentCount += 1;
task.trigger.targetTime = Date.now() + (task.snoozeConfig.durationMinutes * 60 * 1000);
```

**Etki:** `warning-snooze` IPC’si 1-1440 dk arası süre kabul ediyor, ancak aktif uyarıda `snoozeTask` yalnızca olayı yayınlıyor; gerçek `targetTime` `snoozeConfig.durationMinutes` (varsayılan 10) ile hesaplanıyor. 30 dakika ertelemek isteyen kullanıcı 10 dakika sonra kapanışla karşılaşır. Ek olarak `allowed: false` ve `maxCount` kontrol edilmediği için kurumsal politika sınırsız ertelenebilir.

**Düzeltme:** Süreyi uyarı nesnesine taşıyın ve `executeTask` içinde onu kullanın; sayaç/sınır kontrolünü tek yerde yapın.

```js
// WarningManager.snoozeActiveWarning(minutes, taskId)
this.activeWarning.snoozeMinutes = minutes;

// TaskManager.executeTask
const snoozeMinutes = warningConfirmed.snoozeMinutes ||
    task.snoozeConfig.durationMinutes || 10;
task.trigger.targetTime = Date.now() + snoozeMinutes * 60000;
```

```js
if (task.snoozeConfig.allowed === false ||
    task.snoozeConfig.currentCount >= task.snoozeConfig.maxCount) {
    return { ok: false, code: 'SNOOZE_LIMIT' };
}
```

---

### H-11 — Güvenlik motoru süreç/güç isteği ölçümünde fail-open

**Konum:**
- `src/main/services/SafetyPolicyEngine.js:245-263`
- `src/main/services/SafetyPolicyEngine.js:212-228`
- `src/main/services/SafetyPolicyEngine.js:52-63, 84-105`

**Hatalı kod:**

```js
async getRunningProcessList() {
    if (this.processProvider) {
        try { return SafetyPolicyEngine.rawProcessNames(await this.processProvider()); }
        catch (_) { return []; }     // <-- boş liste = korunan uygulama yok
    }
    try { ... } catch (_) { return []; }
}
```

```js
getPowerRequests() {
    return new Promise((resolve) => {
        this.exec('powercfg /requests', (err, stdout) => {
            if (err || !stdout) return resolve({ hasActiveRequest: false, categories: [] });
            ...
```

**Etki:** `ps-list`/PowerShell hatası, izin sorunu veya zaman aşımı durumunda motor “korunan uygulama çalışmıyor” ve “aktif güç isteği yok” varsayımına düşer. Kullanıcı PowerPoint/Zoom/açık bir render ile çalışırken makine kapanabilir. Bu, güvenlik özelliğinin tam da korumak istediği senaryoda devre dışı kalmasıdır.

**Düzeltme:** Ölçüm yapılamıyorsa güç eylemini **engelleyin** (fail-closed) veya en azından kullanıcıya açık bir “doğrulanamadı” onayı sorun.

```js
async getRunningProcessList() {
    try { ... }
    catch (err) {
        log.warn('[Safety] process list failed:', err.message);
        const e = new Error('PROCESS_LIST_UNAVAILABLE');
        e.code = 'PROCESS_LIST_UNAVAILABLE';
        throw e;
    }
}
```

```js
// evaluate()
try {
    const running = await this.getRunningProcessList();
    ...
} catch (err) {
    return { allowed: false, reason: 'Korunan uygulama listesi doğrulanamadı; güvenli taraf için eylem engellendi.' };
}
```

---

### H-12 — Açılış geçmişi her ölçümde büyüyor; gerçek boot kayıtları siliniyor

**Konum:**
- `src/main/services/InventoryService.js:178-186, 281, 316-318`
- `src/main/services/StorageService.js:514-522`
- `src/main/services/EnergyEstimateService.js:20-39`

**Hatalı kod:**

```js
// InventoryService.getBootAt()
return new Date(Date.now() - Math.floor(up) * 1000).toISOString();
```

```js
// StorageService.appendBoot()
if (list[list.length - 1] === bootAtIso) return;
list.push(bootAtIso);
while (list.length > 200) list.shift();
```

**Etki:** `Date.now()` milisaniye içerdiği ve `os.uptime()` saniye çözünürlüklü olduğu için her `collect()` çağrısında `bootAt` birkaç ms farklılaşır. `appendBoot` yalnızca **tam string eşitliğine** baktığından her 60 saniyede yeni bir kayıt eklenir. Sonuç:

- 200 kayıt ~3,3 saatte dolar; gerçek geçmiş açılışlar listeden düşer.
- Liste kısa sürede yalnızca **mevcut** açılış zamanının kopyalarıyla dolar. Geçmiş bir kapanış kaydı, kendisinden sonraki ilk “boot” olarak mevcut açılışı bulur; bu da günler süren yapay kapalı süreler ve şişirilmiş kWh/TL tasarrufu üretir.
- Her ölçümde tüm `data.json` yeniden yazılır (I/O amplifikasyonu).

> Not: Bu hata rolling-restart’ı doğrudan yanlış tetiklemez; `advanceRolling` `bootAt > awaitingSince` karşılaştırması yaptığı için geçmiş bir boot değeri yeni sayılmaz. Ancak enerji/raporlama ve depolama açısından ciddidir.

**Düzeltme:** `bootAt` değerini yalnızca süreç başlangıcında bir kez hesaplayın; yazmadan önce dakika/saniye toleransıyla karşılaştırın.

```js
// InventoryService constructor
this.bootAt = (() => {
    const up = this.os.uptime();
    return Number.isFinite(up) ? new Date(Date.now() - Math.floor(up) * 1000).toISOString() : null;
})();
```

```js
// StorageService.appendBoot
const last = list[list.length - 1];
if (last) {
    const delta = Math.abs(new Date(bootAtIso).getTime() - new Date(last).getTime());
    if (delta < 60000) return;   // aynı açılış
}
```

---

### H-13 — Güvenlik bayrakları renderer IPC’sinden değiştirilebiliyor

**Konum:**
- `src/main/ipc/validate.js:264, 283`
- `main.js:851-870`
- `src/index.html:2805-2812`
- `main.js:615-622`

**Hatalı kod:**

```js
agentDisabled: 'boolean',            // kill-switch
autonomyMode: ['classic', 'full'],   // tam yetki
```

```js
// Renderer, yeni görevin modunu localStorage'dan seçiyor:
let mode = 'classic';
try { if (localStorage.getItem('autonomyMode') === 'full') mode = 'full'; } catch (_) {}
```

**Etki:** `save-settings` IPC’si `agentDisabled` ve `autonomyMode` alanlarını renderer’dan kabul ediyor. Renderer’da bir XSS veya hatalı bir eklenti, konsol kill-switch’ini kapatabilir (`agentDisabled: false`) veya tüm yeni görevleri `full` moda alabilir. `createTask` ayrıca `data.mode` ile gelen `full` değerini sunucu ayarına bakmadan kabul ediyor; bu, uyarı süresi dolunca otomatik devam etme davranışını açar.

**Düzeltme:** `agentDisabled` yalnızca konsol/iç API tarafından yazılsın; `save-settings` şemasından çıkarın. `autonomyMode` değişikliğini ayrı, PIN/onay gerektiren bir uç yapın. `createTask` içinde modu sunucu ayarından türetin:

```js
// validate.js SETTINGS_SCHEMA'dan çıkar:
// agentDisabled: 'boolean',

// TaskManager.createTask:
const settings = this.storage.getSettings();
const mode = settings.autonomyMode === 'full' ? 'full' : 'classic';
const task = new AutomationTask({ ...taskData, mode });
```

---

## 4. Orta Öncelikli Bulgular

### M-01 — API anahtarı ve konsol anahtarı karşılaştırmaları timing-safe değil

**Konum:** `src/main/services/LocalApiService.js:319-322`, `src/console/ConsoleServer.js:80-87`

**Kod:**

```js
if (providedHash !== settings.localApiKeyHash) { ... }
```

```js
for (const [role, stored] of Object.entries(this.keys)) {
    if (stored && stored === h) return role;
}
```

**Etki:** SHA-256 hash’leri üzerinden erken çıkışlı string karşılaştırması, teorik olarak uzaktan zamanlama oracle’ı oluşturur. Pratikte ağ gürültüsü nedeniyle sömürülmesi zor olsa da düzeltmesi kolaydır.

**Düzeltme:**

```js
const { timingSafeEqual } = require('crypto');
function safeEqualHex(a, b) {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    return ba.length === bb.length && timingSafeEqual(ba, bb);
}
```

---

### M-02 — Enerji tahmininde aynı boot birden fazla kapanışa eşleşiyor (çift sayım)

**Konum:** `src/main/services/EnergyEstimateService.js:20-39`

**Hatalı kod:**

```js
const next = bootMs.find((b) => b > t);
...
const hours = (next - t) / 3600000;
```

**Etki:** Aynı açılıştan önce iki kapanış kaydı varsa (örn. 22:00 sleep, 23:00 hibernate, 08:00 boot), ikisi de aynı `next` değerine eşleşir: 10 saat + 9 saat = 19 saat. Gerçekte kapalı süre 10 saattir. `assumedOffHours` senaryosunda da aynı kapalı aralık iki kez sayılır.

**Düzeltme:** Kapanışları sıralayıp her boot’u yalnızca bir kez tüketin; aynı boot’a düşen ardışık kapanışlardan yalnızca sonuncusunu kullanın.

```js
const downs = [...new Set(powerDowns)]
    .map(t => new Date(t).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

let b = 0;
let measuredHours = 0;
let unmatched = 0;

for (let i = 0; i < downs.length; i++) {
    const t = downs[i];
    while (b < bootMs.length && bootMs[b] <= t) b++;
    if (b >= bootMs.length) { unmatched++; continue; }

    // Aynı boot'tan önce başka bir kapanış daha varsa yalnızca sonuncuyu say.
    if (i + 1 < downs.length && downs[i + 1] < bootMs[b]) continue;

    const hours = (bootMs[b] - t) / 3600000;
    if (hours > 0 && hours <= 24 * 14) measuredHours += hours;
    b++;
}
```

---

### M-03 — Muafiyet penceresi gece yarısını aşınca yanlış güne bakıyor

**Konum:** `src/main/services/ExemptionService.js:51-75`

**Hatalı kod:**

```js
const d = new Date(nowMs);
if (!w.days.includes(d.getDay())) return false;
const cur = d.getHours() * 60 + d.getMinutes();
const s = minutesOf(w.start);
const e = minutesOf(w.end);
if (s <= e) return cur >= s && cur < e;
return cur >= s || cur < e;
```

**Etki:** “Pazartesi 23:00–02:00” penceresi Salı 01:00’de `days.includes(1)` false olduğu için eşleşmez. Bakım penceresi veya muafiyet, gece yarısından sonra etkisiz kalır. `start === end` ise `s <= e` dalında `cur >= s && cur < s` → hiçbir zaman doğru olmaz; pencere sessizce ölü doğar.

**Düzeltme:**

```js
const day = d.getDay();
const s = minutesOf(w.start);
const e = minutesOf(w.end);
if (s === e) return false; // veya validate'te reddet

if (s < e) return w.days.includes(day) && cur >= s && cur < e;
// gece yarısını aşan pencere: bugün başladıysa veya dün başladıysa
return (w.days.includes(day) && cur >= s) ||
       (w.days.includes((day + 6) % 7) && cur < e);
```

`validateWindow` içinde `start === end` reddedilmeli.

---

### M-04 — Webhook zaman aşımı iki kez yeniden deneme başlatıyor; SSRF koruması yok

**Konum:** `src/main/services/WebhookService.js:62-75, 128-137, 143-151`

**Hatalı kod:**

```js
req.on('timeout', () => {
    req.destroy();                    // 'error' olayını da tetikler
    this.handleRetry(hook, payload, attempt);
});
req.on('error', (err) => {
    this.handleRetry(hook, payload, attempt);
});
```

**Etki:** `destroy()` genellikle `ECONNRESET`/`socket hang up` hatası üretir; hem `timeout` hem `error` handler’ı `handleRetry` çağırır. Aynı olay için iki zamanlayıcı kurulur ve webhook’a **çift POST** gidebilir. Ayrıca URL yalnızca şema açısından kontrol ediliyor; `http://127.0.0.1`, `http://169.254.169.254` gibi iç adresler kabul ediliyor.

**Düzeltme:** Tek bir `settled` bayrağı kullanın; iç adresleri engelleyin.

```js
let settled = false;
const finish = (reason) => {
    if (settled) return;
    settled = true;
    this.handleRetry(hook, payload, attempt);
};

req.on('timeout', () => { req.destroy(); finish('timeout'); });
req.on('error', () => finish('error'));
```

```js
const host = parsedUrl.hostname.toLowerCase();
if (host === 'localhost' || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || host === '::1') {
    log.error('[WebhookService] Internal address blocked');
    return;
}
```

---

### M-05 — AI oturumları tek paylaşılan sequence’ı dispose ediyor

**Konum:** `src/main/services/AiBackend.js:163-206`, `src/main/services/AiService.js:95-124`

**Hatalı kod:**

```js
async disposeSession(session) {
    if (session && typeof session.dispose === 'function') {
        await session.dispose({ disposeSequence: true });  // paylaşılan sequence
    }
    this.sequence = null;
}
```

**Etki:** `ensureSequence()` tek bir sequence döndürür. İki AI çağrısı eşzamanlıysa ikincisi aynı sequence’ı kullanır; birincinin `disposeSession` çağrısı sequence’ı serbest bırakır ve ikinci çağrı `COMPLETER_UNSUPPORTED`/native hata ile düşer. `AgentOrchestrator.busy` yalnızca `runCommand`’ı korur; farklı AI uçları aynı anda çağrılabilir.

**Düzeltme:** Her oturum için ayrı sequence alın veya dispose sırasında `disposeSequence: false` kullanıp sequence’ı yaşam döngüsü sonunda tek kez bırakın. Eşzamanlılık için kuyruk/mutex ekleyin.

```js
async createSession(systemPrompt) {
    const sequence = await this.context.getSequence(); // paylaşma
    this.sessions.add(sequence);
    ...
}

async disposeSession(session, sequence) {
    await session.dispose({ disposeSequence: false });
    if (sequence) { await sequence.dispose(); this.sessions.delete(sequence); }
}
```

---

### M-06 — `ai-parse` girdi uzunluğu sınırsız

**Konum:** `main.js:722-728`, `src/main/services/AgentOrchestrator.js:76-90`

**Hata:** `runCommand(text)` doğrudan `String(text)` üzerinde regex ve AI çağrısı yapıyor; üst sınır yok. Çok büyük bir metin regex CPU’sunu ve model bağlamını tüketebilir.

**Düzeltme:** IPC sınırında 2-4 KB’lık bir üst sınır koyun.

```js
ipcMain.handle('ai-parse', (event, text) => {
    if (typeof text !== 'string' || text.length > 4000) {
        return { ok: false, code: 'INVALID_INPUT', message: t('errorInvalidRequest') };
    }
    ...
});
```

---

### M-07 — Metrik toplayıcı 2 saniyede bir çalışıyor, üst üste binebiliyor ve disk birimi tutarsız

**Konum:** `src/main/services/monitors/MetricCollector.js:78-106, 208-246`

**Hatalı kod:**

```js
this.sampleInterval = setInterval(() => {
    this.sampleOnce().catch(() => {});
}, this.sampleIntervalMs);   // 2000 ms
```

```js
this.currentMetrics.diskReadWriteKbps = Math.round((rSec + wSec) / 1024) || ...
```

**Etki:**

- `sampleOnce` yeniden giriş koruması yok; `sampleIdle`/`sampleSystemInformation` yavaşsa 2 saniyelik tick’ler üst üste biner, eski ölçüm yeni ölçümün üzerine yazar.
- `si.disksIO()` ve `si.battery()` her tick’te seri çağrılır; boşta bile CPU/IO maliyeti yaratır.
- `disksIO().rIO_sec` bayt/sn değil I/O işlemi/sn olabilir; `/1024` ile “Kbps” etiketi yanlıştır. Ağ `* 8 / 1000` ile Kbps’e çevrilirken disk farklı ölçektedir; `DISK_ACTIVITY` eşiği anlamsızlaşır.

**Düzeltme:** Yeniden giriş kilidi, daha uzun örnekleme aralığı ve doğru birim dönüşümü ekleyin; disk için `rIO_sec`/`wIO_sec` anlamını belgeleyip bayt cinsinden ölçüm kullanın.

```js
if (this._sampling) return;
this._sampling = true;
try { ... } finally { this._sampling = false; }
```

```js
// systeminformation disksIO: rIO_sec/wIO_sec = I/O işlemi/sn ise
metrics.diskIops = Math.round(rSec + wSec);
// Bayt/sn gerekiyorsa fs stats veya başka API kullanın; Kbps etiketi kullanmayın.
```

---

### M-08 — Konsol senkronizasyonu üst üste binebiliyor; fetch zaman aşımı yok

**Konum:** `main.js:180-199, 902-912`, `src/main/services/ConsoleClient.js:31-72`, `src/agent/headless.js:76-92`

**Hatalı kod:**

```js
const tick = async () => {
    ...
    const res = await consoleClient.sync();
    ...
};
consoleSyncTimer = setInterval(tick, 60000);
setTimeout(tick, 20000);
```

`fetch` çağrısında `AbortSignal.timeout(...)` yok. 60 saniyeden uzun süren bir senkronizasyon (yavaş DNS/TCP, büyük envanter) sırasında bir sonraki tick başlar. `console-sync` IPC’si de aynı anda çağrılabilir. İki `sync()` aynı anda heartbeat gönderir; konsol kuyruğu ilk yanıtta temizlediği için ikinci yanıt boş dönebilir (veya H-04 ile emir kaybı).

**Düzeltme:** Tek-uçuş kilidi ve `AbortSignal.timeout` ekleyin.

```js
let syncing = false;
const tick = async () => {
    if (syncing) return;
    syncing = true;
    try { ... } finally { syncing = false; }
};
```

```js
res = await this.fetch(url, { ..., signal: AbortSignal.timeout(30000) });
```

---

### M-09 — Yerel API yeniden başlatmada `EADDRINUSE` riski

**Konum:** `src/main/services/LocalApiService.js:197-258`, `main.js:860-870`

**Hatalı kod:**

```js
// save-settings
localApiService.stop();
localApiService.start();
```

```js
stop() {
    if (this.server) {
        this.server.close();   // callback beklenmiyor
        this.server = null;
    }
}
```

**Etki:** `server.close()` eski soketi hemen serbest bırakmaz; aynı portta yeni `listen()` çağrısı `EADDRINUSE` alabilir. Ayar kaydetme sonrası API sessizce kapanabilir; kullanıcı “kaydedildi” görür ama API çalışmaz.

**Düzeltme:** `close()` callback’ini bekleyin ve `start()`’ı ondan sonra çağırın.

```js
async stop() {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    await new Promise(resolve => srv.close(() => resolve()));
}
```

```js
await localApiService.stop();
await localApiService.start();
```

`save-settings` handler’ını `async` yapın.

---

### M-10 — Yerel API’de id ezme, yanlış HTTP kodu ve sahte iptal başarısı

**Konum:** `src/main/services/LocalApiService.js:478-481, 601-605, 626-630, 358-361`

**Hatalı kod:**

```js
// POST /exemptions
const check = validateExemption({ id: `ex_${Date.now()}`, ...body });  // body.id ezer
const record = svc.add({ id: `ex_${Date.now()}`, ...body });
```

```js
// POST /maintenance-windows
const record = svc.addWindow({ id: `mw_${Date.now()}`, ...body }); // doğrulama yok
```

```js
// cancel
this.taskManager.cancelTask(taskId);
return this.sendJson(res, 200, { success: true, ... }); // sonuç yok sayılıyor
```

**Etki:**

- Çağıran, `body.id` ile mevcut bir muafiyetin/pencerein kimliğini ezebilir; kayıt çakışması ve yetkisiz değiştirme.
- `addWindow` doğrulama hatası fırlatır; dış `catch` 500 döndürür, doğru yanıt 400 olmalıdır.
- Olmayan veya iptal edilemeyen görev için `success: true` döner; otomasyon istemcileri yanlış yönlendirilir.

**Düzeltme:**

```js
const id = `ex_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const record = svc.add({ ...body, id });   // id en sonda
```

```js
try {
    const record = svc.addWindow({ ...body, id });
    return this.sendJson(res, 201, ...);
} catch (err) {
    return this.sendJson(res, 400, { error: err.message, code: err.code });
}
```

```js
const result = this.taskManager.cancelTask(taskId);
if (!result.ok) {
    return this.sendJson(res, result.code === 'NOT_FOUND' ? 404 : 409, {
        success: false, code: result.code
    });
}
return this.sendJson(res, 200, { success: true, code: result.code });
```

---

### M-11 — Renderer yükleme fonksiyonlarında hata yakalama yok

**Konum:**
- `src/index.html:2353-2355`
- `src/index.html:2411-2413`
- `src/index.html:2465-2468`
- `src/index.html:1284-1295`

**Hatalı kod:**

```js
async function loadTemplates() {
    const tpls = await window.electronAPI.getTemplates();
    grid.innerHTML = tpls.map(...);       // tpls null/nesne ise çöker
}
```

```js
async function loadHistory() {
    const list = await window.electronAPI.getHistory();
    if (list.length === 0) { ... }        // undefined ise TypeError
}
```

```js
async function loadStatistics() {
    const stats = await window.electronAPI.getStatistics();
    if (stats.enabled) { ... }            // undefined ise TypeError
}
```

**Etki:** IPC reddi, bozuk yanıt veya beklenmeyen şema durumunda unhandled promise rejection oluşur; sekme boş kalır ve kullanıcıya hata gösterilmez. `switchView` bu fonksiyonları `await` etmediği için hata yutulur.

**Düzeltme:** Her yükleyiciyi `try/catch/finally` içine alın ve boş durumu gösterin.

```js
async function loadTemplates() {
    try {
        const tpls = await window.electronAPI.getTemplates();
        if (!Array.isArray(tpls)) throw new Error('BAD_TEMPLATES');
        ...
    } catch (err) {
        grid.innerHTML = `<p class="text-xs text-red-500">${escHtml(t('errorLoadFailed'))}</p>`;
    }
}
```

---

### M-12 — Ayarlar, sunucu doğrulamasından önce localStorage’a yazılıyor

**Konum:** `src/index.html:3931-3967`

**Hatalı kod:**

```js
localStorage.setItem('theme', elTheme.value);
localStorage.setItem('language', language);
...
applyTheme(elTheme.value);
applyLanguage(language);

const res = await window.electronAPI.saveSettings(serverPatch);
if (res && res.success === false) { showToast(...); return; }   // geri alma yok
```

**Etki:** Sunucu `saveSettings`’i reddettiğinde (örn. LAN + TLS doğrulaması) UI yine de yeni tema/dil/modda kalır. Bir sonraki açılışta localStorage ile sunucu ayarı çelişir; kullanıcı “kaydedilmedi” uyarısı görse bile oturum boyunca yanlış mod uygulanır. `translations[language]` dil anahtarı yoksa `undefined.toastSettingsSaved` ile çöker.

**Düzeltme:** Önce sunucuya yazın; başarılıysa yerel tercihleri uygulayın. Dil anahtarını doğrulayın.

```js
const res = await window.electronAPI.saveSettings(serverPatch);
if (!res || res.success === false) {
    showToast(res?.message || t('errorSaveFailed'), 'error');
    return;
}
localStorage.setItem('language', language);
applyLanguage(language);
```

---

### M-13 — Webhook yükünde yanlış alan adları ve sabit sürüm

**Konum:** `src/main/services/WebhookService.js:39-58`

**Hatalı kod:**

```js
deviceId: settings.deviceId || 'local_device',
deviceName: settings.deviceName || 'PowerPilot-PC',
...
appVersion: '1.0.0'
```

**Etki:** `deviceId`/`deviceName` ayar şemasında yok (`agentId` var); bu nedenle her zaman fallback değerler gider. `appVersion` 1.0.0’a sabitlenmiş; `package.json` 1.0.1. Alıcı taraf filo envanterini yanlış eşleştirir.

**Düzeltme:**

```js
deviceId: settings.agentId || os.hostname(),
deviceName: os.hostname(),
...
appVersion: require('../../../package.json').version
```

---

### M-14 — CSP yok; renderer’da 23 `innerHTML` lavabosu var

**Konum:** `src/index.html` (CSP meta etiketi yok), `src/index.html:1649, 1660, 1730, 2154, 2358, 2420, ...`

**Durum:** Yapılan incelemede kullanıcı kontrollü alanların çoğu `escHtml` ile kaçırılıyor; **doğrudan sömürülebilir bir stored XSS bulunmadı**. Ancak CSP olmadığı için tek bir kaçırılmamış alan veya gelecekteki bir hata, renderer’a `createTask`, `saveSettings`, `cancelAction` gibi güçlü IPC’leri açık bırakır.

**Düzeltme:** Katı bir CSP ekleyin; `innerHTML` yerine `textContent`/DOM API kullanın.

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'">
```

> Not: Gömülü script nedeniyle `'unsafe-inline'` gerekiyor; orta vadede script’i ayrı dosyaya taşıyıp nonce/hash tabanlı CSP’ye geçin.

---

### M-15 — Yerel API’de istek zaman aşımı / gövde yavaşlatma koruması yok

**Konum:** `src/main/services/LocalApiService.js:286-363`

**Hata:** Sunucu `headersTimeout`/`requestTimeout` ayarlamıyor; gövde 100 KB’ı aşınca `req.destroy()` çağrılıyor ama `end` olayı yine de tetiklenebiliyor. Yavaş gönderen bir istemci bağlantıyı uzun süre açık tutabilir (slowloris).

**Düzeltme:**

```js
this.server.requestTimeout = 15000;
this.server.headersTimeout = 10000;
this.server.keepAliveTimeout = 5000;
```

Ayrıca 100 KB aşımında `res.writeHead(413).end()` ile net yanıt verin.

---

### M-16 — `window-maximize-toggle` null/destroyed koruması yok

**Konum:** `main.js:492-498`

**Hatalı kod:**

```js
ipcMain.on('window-maximize-toggle', () => {
    if (mainWindow.isMaximized()) { ... }
});
```

**Etki:** Pencere kapatıldıktan/quit sırasında `mainWindow` null veya destroyed olabilir; `isMaximized()` çağrısı istisna fırlatır. Diğer handler’larda (`window-minimize`) koruma var; burada yok.

**Düzeltme:**

```js
ipcMain.on('window-maximize-toggle', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    ...
});
```

---

### M-17 — 749 KB i18n dosyası hem renderer’da hem ana süreçte ayrıştırılıyor

**Konum:** `src/main/i18n.js:18-26`, `src/renderer/i18n.js`

**Etki:** Ana süreç, renderer sözlüğünü `vm.runInContext` ile yükleyip tam bir JS nesnesi oluşturuyor. 749 KB’lık dosya açılışta iki kez ayrıştırılıyor; RAM ve açılış süresi maliyeti var. `vm` sandbox’ı güvenlik sınırı değildir (aynı süreç).

**Düzeltme:** Çevirileri JSON’a taşıyın; ana süreç yalnızca ihtiyaç duyduğu anahtarları yüklesin veya derleme sırasında küçük bir alt küme üretsin.

---

### M-18 — Tray menüsü her 3 saniyede yeniden kuruluyor

**Konum:** `main.js:341-404`

**Etki:** `setInterval(updateTrayMenu, 3000)` her 3 saniyede yeni `Menu` nesnesi oluşturup `tray.setContextMenu` çağırıyor. Sürekli GC ve gereksiz yerel UI güncellemesi; ayrıca interval hiç temizlenmiyor.

**Düzeltme:** Yalnızca durum değiştiğinde (aktif görev sayısı, mod, dil) güncelleyin; interval’ı `before-quit`’te temizleyin.

---

## 5. Düşük Öncelikli Bulgular

### L-01 — `lastProgressMessage` serileştirilmiyor, UI’da hiç görünmüyor

**Konum:** `src/main/services/models/AutomationTask.js:202-227`, `TaskManager.js:221, 226`

`toJSON()` bu alanı döndürmüyor; alan yalnızca bellekte yazılıyor. Smart Finish ilerleme mesajı kullanıcıya hiç ulaşmıyor. Ya `toJSON()`’a ekleyin ya da ölü alanı kaldırın.

```js
// toJSON()
lastProgressMessage: this.lastProgressMessage || null,
```

---

### L-02 — DeterministicParser’da ölü kod ve eksik saat mantığı

**Konum:** `src/main/services/DeterministicParser.js:89-105, 152-170`

- `isAmCue` hesaplanıyor ama `void isAmCue;` ile atılıyor; “sabah 8” PM dönüşümü yapmıyor.
- `if (h === 24) h = 0;` satırına hiç ulaşılamaz; `h > 23` zaten `return null` ediyor.
- `parseClockTarget` geçmiş bir saati (örn. 11:00’de “10:00”) bugüne kuruyor; `AiService.buildProposal` bunu `<= Date.now()` diye reddediyor. Kullanıcı “yarın” demediği hâlde bugünü kastettiğinde netleştirme soruluyor.
- “yarım saat” erken dönüşü diğer süreleri yok sayıyor.

**Düzeltme:** Ölü dalı kaldırın; AM/PM ipucunu uygulayın; geçmiş saatte ertesi güne taşıyın.

```js
if (h < 12 && isPmCue) h += 12;
if (isAmCue && h === 12) h = 0;
const d = new Date(nowMs);
d.setHours(h, min, 0, 0);
if (d.getTime() <= nowMs && !/yar[ıi]n/.test(lower)) d.setDate(d.getDate() + 1);
```

---

### L-03 — `idempotencyCache` tanımlı ama hiç kullanılmıyor

**Konum:** `src/main/services/LocalApiService.js:51`

```js
this.idempotencyCache = new Map(); // Key -> response
```

Ne yazılıyor ne okunuyor. Ya `Idempotency-Key` başlığı ile gerçekten uygulayın ya da kaldırın. Kullanılmadığı için API’de tekrar gönderim koruması yok.

---

### L-04 — DeviceProfiler’da anlamsız VM dalı

**Konum:** `src/main/services/DeviceProfiler.js:112-118`

```js
if (vm) deviceClass = deviceClass === 'unknown' ? 'unknown' : deviceClass;
```

Bu satır hiçbir şey yapmıyor. Kaldırın veya VM’leri ayrı sınıflandırın (`deviceClass = 'vm'`).

---

### L-05 — `setPoll` / `setSetPoll` ölü yolu

**Konum:** `src/index.html:1304, 3452-3475`

`setSetPoll` tanımlı ama hiç çağrılmıyor; `switchView` doğrudan `setInterval` kuruyor. `let setPoll` bildirimi 3452’de, kullanımı 1304’te (fonksiyon gövdesi) olduğu için normal akışta TDZ’ye girmez, ancak okunabilirlik ve bakım açısından risklidir. Tek bir `startSettingsPoll/stopSettingsPoll` çifti kullanın.

---

### L-06 — `updateDisplay` başlangıçta `0/0` → NaN

**Konum:** `src/index.html:1670-1671`

```js
const pct = (initialTotalSeconds - secondsRemaining) / initialTotalSeconds;
document.getElementById('progress-circle').style.strokeDashoffset = 289 * pct;
```

`initialTotalSeconds === 0` iken `NaN` üretilir; CSS değeri yok sayılır (çökme yok). Koruma ekleyin:

```js
const pct = initialTotalSeconds > 0
    ? (initialTotalSeconds - secondsRemaining) / initialTotalSeconds
    : 0;
```

---

### L-07 — Wake-on-LAN soketinde `error` dinleyicisi yok; broadcast yarışı

**Konum:** `src/main/services/DeviceProfileService.js:40-53`

`setBroadcast(true)` yalnızca `listening` olayında çağrılıyor; `send()` örtük bind yaptığı için `listening` çoğu zaman `send`’den sonra gelir. Broadcast bayrağı geç kalabilir. Ayrıca `socket.on('error')` yok; bind hatası unhandled `error` olayına ve süreç çökmesine yol açabilir.

**Düzeltme:**

```js
const socket = dgram.createSocket('udp4');
socket.on('error', (err) => { try { socket.close(); } catch (_) {} resolve({ success: false, error: err.message }); });
socket.bind(() => {
    socket.setBroadcast(true);
    socket.send(packet, 0, packet.length, port, broadcastIp, (err) => { ... });
});
```

---

### L-08 — UPS her sorguda 4 ayrı TCP bağlantısı açıyor

**Konum:** `src/main/services/UpsMonitor.js:75-81`

`Promise.all` ile `battery.charge`, `ups.status`, `battery.runtime`, `ups.model` için dört ayrı NUT bağlantısı kuruluyor. 60 saniyede bir 4 bağlantı, çok sayıda ajan için gereksiz yük. Tek bağlantıda çoklu değişken okunabilir veya değerler önbelleklenebilir.

---

### L-09 — Takip edilmeyen zamanlayıcılar

**Konum:** `main.js:199, 404`, `src/agent/headless.js:92`

- `setTimeout(tick, 20000)` dönüş değeri saklanmıyor; kapanışta temizlenemiyor.
- `setInterval(updateTrayMenu, 3000)` temizlenmiyor.
- `headless.js` içindeki `setTimeout(tick, 5000)` `stop()` tarafından iptal edilmiyor.

Kapanışta kısa süreli hayalet işler çalışabilir; testlerde açık handle uyarısı üretir. Timer kimliklerini saklayıp `clearTimeout/clearInterval` yapın.

---

### L-10 — `executeTask` finally bloğunda gereksiz if/else

**Konum:** `src/main/services/TaskManager.js:437-449`

Her iki dalda da `this.saveTasks()` çağrılıyor. Sadeleştirin:

```js
} finally {
    this.releaseTask(task.id, token);
    this.saveTasks();
}
```

---

### L-11 — Geçmiş saat için “yarın” önerilmiyor

**Konum:** `src/main/services/AiService.js:163-166`

```js
if (!Number.isInteger(parsed.targetTime) || parsed.targetTime <= Date.now()) {
    return this.clarify(['targetTime']);
}
```

Kullanıcı 11:00’de “10:00’da kapat” derse parser bugün 10:00 üretir ve öneri reddedilir. Beklenen davranış ertesi gün 10:00’dur. Parser’da düzeltin (L-02) veya burada `targetTime <= now` ise 24 saat ekleyip kullanıcıya açıkça “yarın” olarak gösterin.

---

### L-12 — `restoreActiveState` yalnızca `user_interface` + `scheduled` görevleri geri yüklüyor

**Konum:** `src/index.html:3636-3663`

Koşullu (`monitoring`) veya `local_api`/`console` kaynaklı bir görev devam ederken pencere yenilenirse UI’da sayaç görünmez; kullanıcı görevin iptal olduğunu sanabilir. Uyarı bannerı ayrıca geri yükleniyor, ancak genel “aktif görev” göstergesi eksik. Kaynak filtresini kaldırın; `scheduled`/`monitoring` durumlarını tek bir “aktif görev” kartında gösterin.

---

## 6. Performans Bulguları

| # | Konum | Sorun | Etki | Öneri |
|---|---|---|---|---|
| P-01 | `StorageService.js:281-290` | Her kayıtta tüm `data.json` yeniden yazılıyor | Görev durumu her değiştiğinde ve her envanter turunda O(dosya) I/O | Ayrı koleksiyon dosyaları veya WAL/append-only log |
| P-02 | `ConsoleServer.js:70-76` | Her heartbeat’te tüm konsol deposu senkron yazılıyor | 100 ajan × 1/dk = 100 tam yazma/dk; ölçekte darboğaz | Batch/periodic flush + ajan başına ayrı dosya |
| P-03 | `MetricCollector.js:78-106` | 2 sn’de bir seri `si.*` çağrıları, reentrancy yok | Boşta CPU/IO, tick birikmesi | 5-10 sn, `_sampling` kilidi, paralel ölçüm |
| P-04 | `main.js:404` | Tray menüsü 3 sn’de bir yeniden kuruluyor | Gereksiz GC/UI | Yalnızca değişimde güncelle |
| P-05 | `src/index.html:2256` | Görevler görünümü açıkken 5 sn’de bir tam `loadTasks()` | DOM’un tamamı yeniden çiziliyor | Delta güncelleme / yalnızca süre hücresi |
| P-06 | `src/renderer/i18n.js` (749 KB) + `src/main/i18n.js:18-26` | Aynı sözlük iki kez ayrıştırılıyor | Açılış süresi/RAM | JSON + ana süreçte alt küme |
| P-07 | `StorageService.js:514-522` + `InventoryService.js:316-318` | Her envanter turunda boot kaydı + tam yazma | Gereksiz I/O, 200 kayıt sınırı | H-12 düzeltmesi + yalnızca değişimde yaz |
| P-08 | `src/index.html` (288 KB, 4069 satır) | Tek gömülü script | Parse/compile maliyeti, bakım zorluğu | Modüllere ayırma, lazy load |

---

## 7. Veri Bütünlüğü ve Hata Yönetimi

| # | Konum | Sorun | Öneri |
|---|---|---|---|
| D-01 | `ConsoleServer.js:61-76` | Bozuk JSON → sessiz sıfırlama, atomik olmayan yazma | H-07 |
| D-02 | `InventoryService.js:178-186` + `StorageService.js:514-522` | Boot geçmişi kirleniyor | H-12 |
| D-03 | `EnergyEstimateService.js:20-39` | Çift sayım | M-02 |
| D-04 | `ExemptionService.js:67-75` | Gece yarısı penceresi | M-03 |
| D-05 | `TaskSchedulerBridge.js:84-89` | Kabuk enjeksiyonu | K-06 |
| D-06 | `LocalApiService.js:478-481` | İptal sonucu yok sayılıyor | M-10 |
| D-07 | `LocalApiService.js:626-630` | Doğrulama hatası 500’e dönüşüyor | M-10 |
| D-08 | `WebhookService.js:143-151` | Çift retry | M-04 |
| D-09 | `TaskManager.js:570-577` | Koşullu görevde zamanlayıcıya dönüşüm | K-04 |
| D-10 | `src/index.html:1401-1414` | Başarısız IPC’de “çalıştı” bildirimi | H-08 |

**Genel hata yönetimi değerlendirmesi:** Ana süreçte çoğu IPC handler’ı `try/catch` ile sarılmış ve `validate.js` kapsamlı bir şema doğrulaması sunuyor. En zayıf nokta renderer tarafı: `loadTemplates/loadHistory/loadStatistics`, `scheduleAction` ve bazı `await` çağrılarında hata yolları eksik. Ayrıca `safeStorage`/DPAPI kullanılmadığı için “şifreleme” iddiası yok; sırlar düz metin.

---

## 8. Kod Temizliği / Ölü Kod

| # | Konum | Bulgu |
|---|---|---|
| C-01 | `AutomationTask.js:202-227` | `lastProgressMessage` serileştirilmiyor (L-01) |
| C-02 | `DeterministicParser.js:97-100` | `isAmCue` kullanılmıyor; `h===24` ölü (L-02) |
| C-03 | `LocalApiService.js:51` | `idempotencyCache` kullanılmıyor (L-03) |
| C-04 | `DeviceProfiler.js:117` | Anlamsız `if (vm)` dalı (L-04) |
| C-05 | `src/index.html:1304, 3452` | `setSetPoll` ölü; doğrudan `setInterval` (L-05) |
| C-06 | `TaskManager.js:437-449` | Gereksiz if/else (L-10) |
| C-07 | `src/index.html:4046-4051` | Çift `onTimerCancelled` dinleyicisi (H-09) |
| C-08 | `WebhookService.js:57` | Sabit `appVersion` (M-13) |

Ayrıca `TODO/FIXME/XXX/HACK` işaretleri ve `eval`/`new Function` kullanımı **bulunmadı**; bu açıdan kod tabanı temizdir.

---

## 9. İyileştirme ve Ölçeklenebilirlik Önerileri

1. **Emir hattını uçtan uca dayanıklı yapın:** HTTPS + imzalı `params` + hedef kontrolü + makbuz tabanlı teslim + kalıcı kuyruk. Bu dörtlü, K-01/K-02/H-04/H-05’i birlikte çözer.
2. **Sırları OS kasasına taşıyın:** DPAPI/`safeStorage`, ayrı dosya, kısıtlı ACL, PIN için Argon2id. Yedekleme ve dışa aktarma akışlarında sırları hariç tutun.
3. **Tek doğruluk kaynağı:** Zamanlayıcı/koşul durumunu yalnızca ana süreçte tutun; renderer yalnızca `targetTime` ve `nextEvaluationAt`’i göstersin. Bu, H-08/H-09/L-12’yi kökten çözer.
4. **Güvenlik motorunu fail-closed yapın:** Ölçüm alınamıyorsa eylemi engelleyin; “bilinmiyor” ile “güvenli”yi ayırın.
5. **Konsolu ölçeklendirin:** Ajan başına anahtar, ajan başına kuyruk dosyası, toplu yazma, HTTPS, istek zaman aşımı. 100+ ajan için mevcut “tek JSON + her heartbeat’te tam yazma” modeli uygun değildir.
6. **Depolamayı ayırın:** `settings`, `tasks`, `history`, `audit`, `queue` ayrı dosyalar; her yazmada tüm veriyi yeniden yazmayın. Audit için append-only dosya kullanın.
7. **Test kapsamını genişletin:** Özellikle K-01, K-03, K-04, K-05, H-01, H-05, H-09, M-03 için regresyon testleri ekleyin.
8. **CSP + modül ayrımı:** Gömülü script’i modüllere ayırın, CSP’yi nonce/hash ile sıkılaştırın, `innerHTML` lavabolarını azaltın.

---

## 10. Test Önerileri (Öncelik Sırasıyla)

| Test | Amaç |
|---|---|
| `SignedOrderService` — `params` değiştirilmiş emir reddedilmeli | K-01 regresyonu |
| `ConsoleClient` — `targets: ['A']` emri B ajanında reddedilmeli | H-05 |
| `isClientCertOk` — `authorized: false` + sertifika varsa `false` dönmeli | H-01 |
| `DeterministicParser` — “kapatma/kapatmayın/kapatmam” → `null` | K-03 |
| `TaskManager.snoozeTask` — `monitoring` görevde `targetTime` yazmamalı | K-04 |
| `SmartFinishEngine` — klasörde `.crdownload` varken `file_stable` false | K-05 |
| `TaskSchedulerBridge` — `id` içinde `"`/`&` varsa komut üretilmemeli | K-06 |
| `ExemptionService.isInWindow` — Pzt 23:00–02:00, Salı 01:00 → true | M-03 |
| `EnergyEstimateService.matchOffHours` — iki kapanış, bir boot → tek sayım | M-02 |
| `WebhookService` — timeout’ta tek retry | M-04 |
| E2E: IPC reddi → renderer “çalıştı” toast’ı göstermemeli | H-08 |
| E2E: iptal → tek PIN istemi, tek `cancel-action` | H-09 |

Mevcut test altyapısı (`tests/main/*.test.mjs`, `tests/e2e/*.spec.js`, `vitest.config.js`, `playwright.config.js`) bu senaryoları eklemek için uygundur.

---

## 11. “Sorun Bulunmadı” / Uygulanamaz Kontroller

### React / Next.js özel kontrolleri — **Sorun bulunmadı (uygulanamaz)**
- React Hooks kuralları, `useEffect` cleanup, bağımlılık dizileri: **uygulanamaz** (React yok).
- SSR/SSG, hydration mismatch, Server/Client Components, RSC: **uygulanamaz**.
- Next.js middleware, route handler yetkilendirmesi, `getServerSideProps`: **uygulanamaz**.
- ORM/SQL injection, N+1 sorgu: **uygulanamaz** (SQL/ORM yok; JSON dosya depolama).

### Diğer kontroller
- **`eval` / `new Function`:** `src/` altında **bulunmadı**.
- **TODO/FIXME/XXX/HACK:** **bulunmadı**.
- **React dışı bellek sızıntısı:** Kritik seviyede doğrulanmış bir sızıntı **bulunmadı**; ancak M-18/L-09’daki temizlenmeyen aralıklar ve `disposeSession` sorunu (M-05) kaynak tüketimine yol açabilir.
- **Sonsuz döngü:** Kritik bir sonsuz döngü **bulunmadı**; H-09 yarış koşulu ikinci iptal çağrısına yol açabilir, ancak butonun disable edilmesiyle pratikte sınırlanır.
- **Yapılandırma dosyaları:** İstek üzerine kapsam dışı bırakıldı.

---

## 12. Öncelikli Düzeltme Yol Haritası

### Faz 0 — Yayın öncesi zorunlu (1-2 gün)
- K-01: `params` imzaya dahil et.
- K-02: HTTPS zorunlu kıl veya yayınlama.
- K-03: olumsuzluk filtresi.
- K-04: koşullu görevde ertelemeyi `notBefore` yap.
- K-06: görev kimliği doğrulaması + `execFile`.

### Faz 1 — İlk hafta
- H-01, H-02, H-03, H-04, H-05, H-06, H-07.
- H-08, H-09, H-10, H-11, H-12, H-13.
- K-05 için şablonu güvenli koşula çevir.

### Faz 2 — İkinci hafta
- M-01…M-18; özellikle M-02/M-03/M-04/M-07/M-09.
- Performans: P-01, P-02, P-03.
- Test regresyonları.

### Faz 3 — Sürekli iyileştirme
- Depolama ayrımı, CSP, i18n optimizasyonu, konsol ölçeklendirme.
- `lastProgressMessage` gibi ölü özelliklerin ya tamamlanması ya kaldırılması.

---

**Sonuç:** Power Pilot’un çekirdek mimarisi (görev hattı, güvenlik motoru, imzalı emir, denetim zinciri) iyi düşünülmüş; ancak **imza kapsamı, ulaşım güvenliği ve koşullu görevlerde erteleme** etrafındaki üç hata, dağıtım öncesi mutlaka kapatılmalıdır. Özellikle K-03/K-04/K-05 doğrudan “kullanıcının istemediği anda makine kapanması” sonucunu doğurabildiği için güvenlik açısından kritik kabul edilmelidir.
