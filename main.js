const { app, BrowserWindow, ipcMain, Tray, Menu, screen, shell, powerMonitor, dialog, session } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

// Import modular services
const { PowerService } = require('./src/main/services/PowerService');
const log = require('./src/main/logger');
const {
    validateScheduleAction, validateTaskId, validateTaskData,
    validateSnooze, validateWol, validateSettings, validateWebhooks,
    validateCancelPin, validateSecuritySettings, SECURITY_SETTING_KEYS
} = require('./src/main/ipc/validate');
const { PinGuard } = require('./src/main/ipc/pinGuard');
const Pin = require('./src/main/security/Pin');
const { SecretStore, SECRET_SETTING_FIELDS } = require('./src/main/security/SecretStore');
const { runBackup } = require('./src/main/storage/DbWorker');
const { translate, actionLabel, taskName, loadLocale, normalizeLanguage } = require('./src/main/i18n');
const { registerAppScheme, installAppProtocol, isAllowedAppUrl } = require('./src/main/security/AppProtocol');
const { openExternalSafely } = require('./src/main/config/externalLinks');

// WP-10.T2: meta etiketiyle aynı politika HTTP başlığı olarak da uygulanır.
const APP_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'";
const { guardIpcHandler } = require('./src/main/ipc/SenderGuard');
const { normalizeAiInput } = require('./src/main/ai/input');
const { TimerRegistry } = require('./src/main/util/TimerRegistry');

// WP-10.T1: renderer yalnızca app://powerpilot origin'inden yüklenir.
registerAppScheme();

const ipcHandle = (channel, handler) => ipcMain.handle(channel, guardIpcHandler(handler, {
    onDenied: (url) => log.warn(`[IPC] güvenilmeyen gönderici reddedildi: ${channel} (${url || 'origin-yok'})`)
}));
const ipcOn = (channel, handler) => ipcMain.on(channel, guardIpcHandler(handler, {
    onDenied: (url) => log.warn(`[IPC] güvenilmeyen gönderici reddedildi: ${channel} (${url || 'origin-yok'})`)
}));

// WP-13.T6: tüm uzun ömürlü timer'lar tek kayıt defterinden temizlenir.
const timers = new TimerRegistry();

// WP-04.T5: headless servis modu. `PowerPilot.exe --headless --user-data-dir=<dir>`
// ile UI açılmadan ajan yığını çalışır; SecretStore/DPAPI aynı süreçte kullanılır.
const HEADLESS_MODE = process.argv.includes('--headless');

function parseUserDataDir(argv) {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--user-data-dir') {
            const next = argv[i + 1];
            if (typeof next === 'string' && next.length > 0 && !next.startsWith('--')) return next;
            return null;
        }
        if (arg.startsWith('--user-data-dir=')) {
            const value = arg.slice('--user-data-dir='.length);
            return value.length > 0 ? value : null;
        }
    }
    return null;
}

const userDataDirOverride = parseUserDataDir(process.argv);
if (userDataDirOverride) {
    const resolvedUserData = path.resolve(userDataDirOverride);
    fs.mkdirSync(resolvedUserData, { recursive: true });
    // Chromium anahtarı tek başına app.getPath('userData')'yı değiştirmez;
    // açıkça ayarlanır ki depolama ve sır dosyası aynı dizinde olsun.
    app.setPath('userData', resolvedUserData);
}

function currentLanguage() {
    try {
        return (storageService && storageService.getSettings().language) || 'tr';
    } catch (_) {
        return 'tr';
    }
}

function t(key, vars) {
    return translate(currentLanguage(), key, vars);
}

// WBS-11.2 / WP-04.T4: PIN deneme sayacı (işlem-içi; yeniden başlatmada sıfırlanır, hash diskte kalır).
const pinGuard = new PinGuard();
let secretStore = null;

async function requireCancelPin(providedPin) {
    const s = storageService.getSettings();
    let stored = null;
    if (s.cancelPinHash) {
        stored = Pin.isArgon2Hash(s.cancelPinHash)
            ? s.cancelPinHash
            : { hash: s.cancelPinHash, salt: s.cancelPinSalt };
    }
    const check = await pinGuard.check('cancel', providedPin, stored);
    if (check.ok) {
        // WP-04.T4: eski SHA-256 kaydı doğrulandıktan sonra Argon2id'e yükseltilir.
        if (check.upgrade) {
            try {
                storageService.updateSettings({ cancelPinHash: check.upgrade, cancelPinSalt: null });
            } catch (err) {
                log.warn('[PIN] Argon2id yükseltmesi kaydedilemedi:', err && err.message);
            }
        }
        return null;
    }
    const message = check.code === 'PIN_REQUIRED'
        ? t('pinPromptCancel')
        : (check.message || t('pinVerifyFailed'));
    return { success: false, code: check.code, message, retryAfterSec: check.retryAfterSec, attemptsLeft: check.attemptsLeft };
}

/** WP-10.T4: güvenlik ayarları ve API anahtarı üretimi aynı PIN kapısından geçer. */
async function requireSecurityPin(providedPin) {
    const s = storageService.getSettings();
    let stored = null;
    if (s.cancelPinHash) {
        stored = Pin.isArgon2Hash(s.cancelPinHash)
            ? s.cancelPinHash
            : { hash: s.cancelPinHash, salt: s.cancelPinSalt };
    }
    // Fail-closed: güvenlik ayarı/API anahtarı için PIN yapılandırılmış olmalı.
    if (!stored) {
        return { success: false, code: 'PIN_REQUIRED', message: t('pinPromptCancel') };
    }
    const check = await pinGuard.check('security', providedPin, stored);
    if (check.ok) {
        if (check.upgrade) {
            try {
                storageService.updateSettings({ cancelPinHash: check.upgrade, cancelPinSalt: null });
            } catch (err) {
                log.warn('[PIN] Argon2id yükseltmesi kaydedilemedi:', err && err.message);
            }
        }
        return null;
    }
    return {
        success: false,
        code: check.code,
        message: check.code === 'PIN_REQUIRED' ? t('pinPromptCancel') : (check.message || t('pinVerifyFailed')),
        retryAfterSec: check.retryAfterSec,
        attemptsLeft: check.attemptsLeft
    };
}
const StorageService = require('./src/main/services/StorageService');
const HistoryService = require('./src/main/services/HistoryService');
const WarningManager = require('./src/main/services/WarningManager');
const SafetyPolicyEngine = require('./src/main/services/SafetyPolicyEngine');
const MetricCollector = require('./src/main/services/monitors/MetricCollector');
const SmartFinishEngine = require('./src/main/services/SmartFinishEngine');
const TaskManager = require('./src/main/services/TaskManager');
const WebhookService = require('./src/main/services/WebhookService');
const LocalApiService = require('./src/main/services/LocalApiService');
const TemplateService = require('./src/main/services/TemplateService');
const EnergyEstimateService = require('./src/main/services/EnergyEstimateService');
const DeviceProfileService = require('./src/main/services/DeviceProfileService');
const TaskSchedulerBridge = require('./src/main/services/TaskSchedulerBridge');
const { AiBackend } = require('./src/main/services/AiBackend');
const { ModelManager, STT_MODEL_ID, STT_MODEL_FILE, STT_MODEL_URL } = require('./src/main/services/ModelManager');
const { AiService } = require('./src/main/services/AiService');
const { SttService } = require('./src/main/services/SttService');
const { DeviceProfiler } = require('./src/main/services/DeviceProfiler');
const { AgentOrchestrator } = require('./src/main/services/AgentOrchestrator');
// FAZ B: kurumsal pilot servisleri
const { InventoryService } = require('./src/main/services/InventoryService');
const { ExemptionService } = require('./src/main/services/ExemptionService');
const { OrderQueue } = require('./src/main/services/OrderQueue');
const { AuditLog } = require('./src/main/services/AuditLog');
const { ConsoleClient } = require('./src/main/services/ConsoleClient');
const { OrderExecutor } = require('./src/main/services/OrderExecutor');
const { SignedOrderService } = require('./src/main/services/SignedOrderService');
const { UpsMonitor } = require('./src/main/services/UpsMonitor');

let mainWindow;
let miniWindow = null;
let tray = null;
// WP-13.T5: tray yalnızca 100 ms debounce + imza değişiminde yeniden kurulur.
let trayUpdateTimer = null;
let lastTraySignature = '';
let trayUpdater = null;

function scheduleTrayUpdate () {
    if (!trayUpdater) return;
    if (trayUpdateTimer) clearTimeout(trayUpdateTimer);
    trayUpdateTimer = timers.setTimeout(() => {
        trayUpdateTimer = null;
        try { trayUpdater(); } catch (err) { log.warn('[Tray] güncelleme hatası:', err && err.message); }
    }, 100);
    if (typeof trayUpdateTimer.unref === 'function') trayUpdateTimer.unref();
}
let isQuitting = false;
let isMiniWindowDismissed = false;

// Instantiate Services
let storageService, historyService, warningManager, safetyPolicyEngine, metricCollector, smartFinishEngine, taskManager, webhookService, localApiService, templateService, energyService, deviceService, aiBackend, modelManager, aiService, sttService, agentOrchestrator, deviceProfiler, sttModelManager;
// FAZ B: kurumsal servis örnekleri
let inventoryService, exemptionService, orderQueue, auditLog, consoleClient, orderExecutor;
let consoleSyncTimer = null;
let headlessHandle = null;

async function startHeadless() {
    const { bootAgent } = require('./src/agent/headless');
    let appVersion = '1.1.0';
    try { appVersion = require('./package.json').version || appVersion; } catch (_) {}
    const syncMs = Number(process.env.PP_SYNC_MS) || 60000;
    headlessHandle = await bootAgent({
        userDataPath: app.getPath('userData'),
        appVersion,
        syncIntervalMs: syncMs
    });
    const shutdown = () => app.quit();
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    log.info(`[Headless] ajan hazır (veri: ${headlessHandle.dir})`);
    return headlessHandle;
}

/**
 * WP-04: sır deposu başlatma + düz metin migrasyonu.
 * Backend yoksa ve korunacak sır varsa başlatma reddedilir (düz metin fallback yok).
 */
async function initSecrets() {
    const dir = app.getPath('userData');
    secretStore = new SecretStore({
        filePath: path.join(dir, 'secrets.v1.json'),
        applyAcl: true,
        logger: log
    });
    storageService.setSecretStore(secretStore);

    const available = await secretStore.isAsyncEncryptionAvailable();
    const plaintext = SecretStore.findPlaintextSecrets(storageService.data);
    if (!available) {
        if (plaintext.length > 0 || secretStore.listNames().length > 0) {
            throw Object.assign(
                new Error('safeStorage/DPAPI kullanılamıyor; sırlar korunamaz. Uygulama kullanıcı hesabıyla çalıştırılmalı.'),
                { code: 'SECRET_BACKEND_UNAVAILABLE', plaintext }
            );
        }
        log.warn('[Secrets] safeStorage kullanılamıyor; kayıtlı sır yok, devam ediliyor.');
        return;
    }

    const result = await secretStore.migrateFromData(storageService.data);
    await secretStore.hydrateData(storageService.data);
    // Audit anahtarı, migrasyon denetim kaydından ÖNCE hazır olmalı; aksi
    // halde legacy adaptörü mevcut HMAC zincirini ezebilir.
    await initAuditKey();

    if (result.migrated.length > 0 || plaintext.length > 0) {
        storageService.save();
        storageService.checkpoint();
        const removed = SecretStore.purgeSecretBackups(storageService.backupDir);
        try {
            const audit = new AuditLog(storageService);
            audit.append({
                actor: 'system',
                action: 'secrets_migrated',
                target: null,
                detail: `migrated=${result.migrated.length}; already=${result.alreadyEncrypted.length}; backups_removed=${removed.length}`
            });
        } catch (err) {
            log.warn('[Secrets] migrasyon denetim kaydı yazılamadı:', err && err.message);
        }
        if (removed.length > 0) {
            log.warn(`[Secrets] Düz metin sır içeren ${removed.length} eski yedek silindi.`);
        }
        log.info(`[Secrets] ${result.migrated.length} sır şifrelendi.`);
    }
}

/**
 * WP-11.T7: audit HMAC anahtarı SecretStore'da tutulur. Kayıt varken anahtar
 * yoksa yeni anahtar ÜRETİLMEZ (T-STO-12): bakım modu + auditTampered.
 */
async function initAuditKey() {
    const checkpointDir = path.join(app.getPath('userData'), 'audit-checkpoints');
    let key = null;
    try {
        key = await secretStore.getSecret('auditHmacKey');
    } catch (err) {
        storageService.enterMaintenance(`Audit anahtarı okunamadı: ${err.message}`);
        storageService.auditTampered = true;
        return;
    }
    const records = storageService.getAuditLog();
    const chain = storageService.getMeta('audit_chain');
    if (!key) {
        if (records.length > 0 && chain === 'hmac-v1') {
            storageService.enterMaintenance('Audit HMAC anahtarı kayıp; yeni anahtar üretilmedi.');
            storageService.auditTampered = true;
            return;
        }
        key = crypto.randomBytes(32).toString('hex');
        await secretStore.setSecret('auditHmacKey', key);
        log.info('[Audit] Yeni HMAC anahtarı provisioning edildi.');
    }
    try {
        storageService.setAuditKey(Buffer.from(key, 'hex'), { checkpointDir, eventLog: true });
        const verify = storageService.verifyAuditChain();
        if (!verify.ok) {
            storageService.auditTampered = true;
            log.error('[Audit] Zincir doğrulaması başarısız:', verify.code, verify.error);
        }
    } catch (err) {
        storageService.enterMaintenance(`Audit zinciri kurulamadı: ${err.message}`);
        storageService.auditTampered = true;
    }
}

/**
 * WP-11.T11: yedek anahtarı SecretStore'da; yoksa bir kez üretilir.
 * Anahtar DB/JSON içine asla yazılmaz.
 */
async function ensureBackupKey() {
    let key = null;
    try {
        key = await secretStore.getSecret('backupAesKey');
    } catch (err) {
        log.error('[Backup] Yedek anahtarı okunamadı:', err && err.message);
        return null;
    }
    if (!key) {
        key = crypto.randomBytes(32).toString('hex');
        await secretStore.setSecret('backupAesKey', key);
        log.info('[Backup] Yeni AES-256-GCM yedek anahtarı provisioning edildi.');
    }
    return key;
}

let backupTimer = null;
let initialBackupTimer = null;
let maintenanceTimer = null;

/** Günlük VACUUM INTO + AES-256-GCM yedek (utilityProcess/CLI). */
function startBackupSchedule() {
    const run = async () => {
        if (!storageService || storageService.maintenanceMode) return;
        try {
            const key = await ensureBackupKey();
            if (!key) return;
            const result = await runBackup({
                dbPath: storageService.dbPath,
                backupDir: storageService.backupDir,
                key,
                prefix: 'powerpilot',
                keep: 7,
                keepDays: 7
            });
            log.info(`[Backup] Günlük yedek alındı: ${path.basename(result.path)} (${result.encBytes} bayt).`);
        } catch (err) {
            log.error('[Backup] Günlük yedek başarısız:', err && err.message);
        }
    };
    // Açılıştan 5 dk sonra ilk yedek; ardından 24 saatte bir.
    initialBackupTimer = timers.setTimeout(run, 5 * 60 * 1000);
    initialBackupTimer.unref?.();
    backupTimer = timers.setInterval(run, 24 * 60 * 60 * 1000);
    backupTimer.unref?.();
}

/**
 * WP-04: gelen ayar yamasından sır alanlarını ayırır. Kalan alanlar normal
 * ayar akışına gider; sırlar yalnızca SecretStore'a yazılır.
 */
function splitSecretPatch(patch) {
    const rest = { ...(patch || {}) };
    const secrets = {};
    if (!patch || typeof patch !== 'object') return { rest: patch, secrets };
    for (const field of SECRET_SETTING_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
            secrets[field] = patch[field];
            delete rest[field];
        }
    }
    return { rest, secrets };
}

async function initServices() {
    storageService = new StorageService();
    await initSecrets();
    // WP-11.T7: kurcalanmış audit / bakım modu → yıkıcı eylem yok.
    PowerService.setExecutionGuard(() => {
        if (storageService.maintenanceMode) {
            return { ok: false, code: 'STORAGE_MAINTENANCE', error: storageService.maintenanceReason || 'Depo bakım modunda.' };
        }
        if (storageService.auditTampered) {
            return { ok: false, code: 'AUDIT_TAMPERED', error: 'Denetim zinciri kurcalanmış; yıkıcı eylemler bloke.' };
        }
        return { ok: true };
    });
    historyService = new HistoryService(storageService);
    warningManager = new WarningManager(historyService);
    // WP-04/05: PowerShell/tasklist yok; Electron powerMonitor + ps-list.
    safetyPolicyEngine = new SafetyPolicyEngine(storageService, null, null, { powerMonitor });
    metricCollector = new MetricCollector({
        powerMonitor,
        // WP-16: process_running koşulu yokken fastlist/ps-list spawn edilmez.
        needsProcessList: () => !!(taskManager && typeof taskManager.hasProcessConditions === 'function' && taskManager.hasProcessConditions())
    });
    smartFinishEngine = new SmartFinishEngine(metricCollector);
    webhookService = new WebhookService(storageService);
    // WBS-0.1: Enjeksiyon sırası önemli — MetricCollector -> SmartFinishEngine -> TaskManager.
    // TaskManager condition dalı için ikisine de ihtiyaç duyar.
    taskManager = new TaskManager(storageService, warningManager, safetyPolicyEngine, historyService, webhookService, smartFinishEngine, metricCollector, null, timers);
    // WP-08.T3: renderer yalnızca gerçek terminal sonuçta başarı/hata toast'ı gösterir.
    taskManager.setResultListener((payload) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(payload.success ? 'task-executed' : 'task-failed', payload);
    });
    taskManager.setChangeListener(scheduleTrayUpdate);
    // WBS-2.2: Scheduler yedeği takılır (Store sandbox'unda isSupported()=false → atlanır).
    taskManager.schedulerBridge = new TaskSchedulerBridge({
        exePath: app.getPath('exe'),
        isStoreApp: !!process.windowsStore
    });
    // FAZ B: kurumsal pilot — LocalApiService deps'i için ÖNCE kurulur.
    let appVersion = '1.1.0';
    try { appVersion = require('./package.json').version || appVersion; } catch (_) {}
    // FAZ D: UPS izleyici (ayar kapalıysa sorgulanmaz).
    let upsMonitor = null;
    try {
        const s0 = storageService.getSettings();
        upsMonitor = new UpsMonitor({ host: s0.upsHost || '127.0.0.1', ups: s0.upsName || 'ups' });
    } catch (_) { upsMonitor = null; }
    inventoryService = new InventoryService({ storageService, agentVersion: appVersion, upsMonitor });
    exemptionService = new ExemptionService(storageService);
    orderQueue = new OrderQueue(storageService);
    auditLog = new AuditLog(storageService);
    localApiService = new LocalApiService(storageService, taskManager, PowerService, {
        inventory: inventoryService,
        exemptions: exemptionService,
        queue: orderQueue,
        audit: auditLog,
        powerMonitor
    });
    templateService = new TemplateService(storageService);
    energyService = new EnergyEstimateService(storageService);
    deviceService = new DeviceProfileService(storageService);
    // WBS-7.1: AI arka ucu iskeleti — model yoksa AI_NOT_READY kipinde durur,
    // uygulama AI'sız tam işlevsel açılır (IPC + görünüm WBS-7.4'te).
    aiBackend = new AiBackend({ modelDir: path.join(app.getPath('userData'), 'models') });
    log.info(`[AiBackend] durum: ${JSON.stringify(aiBackend.getStatus())}`);
    // WBS-7.2: Model yöneticisi aynı dizini kullanır (indirme IPC'si WBS-7.4'te).
    modelManager = new ModelManager({ modelDir: path.join(app.getPath('userData'), 'models') });
    // Plan kapanışı: STT modelinin ayrı yöneticisi (ayrı manifest, aynı dizin).
    sttModelManager = new ModelManager({
        modelDir: path.join(app.getPath('userData'), 'models'),
        modelId: STT_MODEL_ID,
        file: STT_MODEL_FILE,
        url: STT_MODEL_URL
    });
    // WBS-7.4: AI servisi (ayrıştırıcı). Model yoksa AI_NOT_READY döner.
    aiService = new AiService({ backend: aiBackend });
    // WBS-8.1: Ses servisi aynı model dizinini kullanır (ggml-base.bin).
    sttService = new SttService({ modelDir: path.join(app.getPath('userData'), 'models') });
    // WBS-E3: Cihaz profilleyici (kasa + watt tahmini/ölçümü).
    deviceProfiler = new DeviceProfiler();
    // WBS-9.1: Ajan orkestratörü (deterministik yönlendirme + kuyruk + denetim).
    agentOrchestrator = new AgentOrchestrator({ aiService, storage: storageService, history: historyService });

    // FAZ B: konsol istemcisi + emir icracısı (deviceService yukarıda kuruldu).
    consoleClient = new ConsoleClient({
        storage: storageService,
        inventoryService,
        orderQueue,
        audit: auditLog
    });
    orderExecutor = new OrderExecutor({ taskManager, deviceService, audit: auditLog });
    startConsoleSync();
    startBackupSchedule();
    // WP-11.T10: süresi geçen nonce'lar periyodik temizlenir.
    maintenanceTimer = timers.setInterval(() => {
        try { storageService.purgeExpiredNonces(); } catch (_) { /* yut */ }
    }, 6 * 60 * 60 * 1000);
    maintenanceTimer.unref?.();

    localApiService.start();

    // Wire up WarningManager events to UI
    const forwardWarning = (channel) => (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };
    warningManager.on('warning-started', forwardWarning('warning-started'));
    warningManager.on('warning-tick', forwardWarning('warning-tick'));
    // WBS-9.4: Banner'ın kapanması için terminal olayları da iletilir.
    warningManager.on('warning-cancelled', forwardWarning('warning-cancelled'));
    warningManager.on('warning-snoozed', forwardWarning('warning-snoozed'));
    warningManager.on('warning-finished', forwardWarning('warning-finished'));
}

// WBS-0.2: Tek doğruluk kaynağı TaskManager'dır. Legacy targetTime/checkInterval
// değişkenleri kaldırıldı; hızlı zamanlayıcının sahip olduğu görev ID'si tutulur.
let quickTimerTaskId = null;

// FAZ B: konsol senkronizasyon döngüsü (60sn). Konsol tanımsızsa sessiz durur;
// hata üretmez, yalnızca loglar. Emirler verify→kuyruk→icra hattından geçer.
function startConsoleSync() {
    if (consoleSyncTimer) clearInterval(consoleSyncTimer);
    const tick = async () => {
        try {
            if (!consoleClient || !consoleClient.isConfigured()) return;
            if (taskManager && taskManager.pausedAll) return;
            const res = await consoleClient.sync();
            if (res && res.disabled) return; // kill-switch: yalnızca heartbeat sürer
            if (res && res.ok && orderQueue) {
                await orderExecutor.drain(orderQueue);
            } else if (res && !res.ok && res.code !== 'CONSOLE_UNREACHABLE') {
                log.warn(`[ConsoleSync] ${res.code}: ${res.error || ''}`);
            }
        } catch (err) {
            log.warn('[ConsoleSync] beklenmeyen hata:', err && err.message);
        }
    };
    consoleSyncTimer = timers.setInterval(tick, 60000);
    // Açılışta 20sn sonra ilk deneme (metrikler otursun).
    timers.setTimeout(tick, 20000);
}

function hardenWebContents (contents) {
    // WP-10.T2: dış gezinme ve yeni pencere yok; yalnızca https dış tarayıcıda açılır.
    contents.on('will-navigate', (event, url) => {
        if (!isAllowedAppUrl(url)) {
            event.preventDefault();
            log.warn(`[Security] Gezinme engellendi: ${url}`);
        }
    });
    contents.on('will-redirect', (event, url) => {
        if (!isAllowedAppUrl(url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
        openExternalSafely(shell, url, log);
        return { action: 'deny' };
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 840,
        minWidth: 1100,
        minHeight: 680,
        resizable: true,
        frame: false,
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, 'powerpilot_icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    hardenWebContents(mainWindow.webContents);
    mainWindow.loadURL('app://powerpilot/index.html');

    mainWindow.on('close', (event) => {
        const hasActive = taskManager && taskManager.getActiveTasks().length > 0;
        if (!isQuitting && hasActive) {
            event.preventDefault();
            mainWindow.hide();
            if (tray) {
                tray.displayBalloon({
                    title: 'Power Pilot',
                    content: t('trayBackgroundRunning')
                });
            }
        }
    });

    const sendState = (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-state-changed', state);
        }
    };

    mainWindow.on('show', () => { sendState('show'); isMiniWindowDismissed = false; updateMiniWindowVisibility(); });
    mainWindow.on('hide', () => { sendState('hide'); updateMiniWindowVisibility(); });
    mainWindow.on('minimize', () => { sendState('minimize'); updateMiniWindowVisibility(); });
    mainWindow.on('restore', () => { sendState('restore'); isMiniWindowDismissed = false; updateMiniWindowVisibility(); });
    mainWindow.on('focus', () => { isMiniWindowDismissed = false; updateMiniWindowVisibility(); });
    mainWindow.on('blur', () => {
        timers.setTimeout(() => {
            updateMiniWindowVisibility();
        }, 100);
    });
}

function updateMiniWindowVisibility() {
    // WBS-0.2: Görünürlük kararı TaskManager aktif görev sayısına bağlıdır.
    const hasActive = taskManager && taskManager.getActiveTasks().length > 0;
    if (!hasActive || isMiniWindowDismissed) {
        if (miniWindow && !miniWindow.isDestroyed()) {
            miniWindow.close();
        }
        miniWindow = null;
        return;
    }

    const isMainVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    const isMainMinimized = mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized();
    const isMainFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();

    const shouldShowMini = !isMainVisible || isMainMinimized || !isMainFocused;

    if (shouldShowMini) {
        if (!miniWindow || miniWindow.isDestroyed()) {
            createMiniWindow();
        } else {
            if (!miniWindow.isVisible()) {
                miniWindow.showInactive();
            }
        }
    } else {
        if (miniWindow && !miniWindow.isDestroyed()) {
            miniWindow.close();
            miniWindow = null;
        }
    }
}

function createMiniWindow() {
    if (miniWindow && !miniWindow.isDestroyed()) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;

    const winWidth = 280;
    const winHeight = 76;
    const posX = x + width - winWidth - 20;
    const posY = y + height - winHeight - 20;

    miniWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        x: posX,
        y: posY,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        icon: path.join(__dirname, 'powerpilot_icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    hardenWebContents(miniWindow.webContents);
    miniWindow.loadURL('app://powerpilot/mini.html');

    miniWindow.once('ready-to-show', () => {
        if (miniWindow && !miniWindow.isDestroyed()) {
            miniWindow.showInactive();
        }
    });

    miniWindow.on('closed', () => {
        miniWindow = null;
    });
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'powerpilot_icon.ico'));

    const updateTrayMenu = (force = false) => {
        const activeCount = taskManager ? taskManager.getActiveTasks().length : 0;
        const nextTask = taskManager ? taskManager.getNextTask() : null;
        const lang = currentLanguage();
        const settings = storageService ? storageService.getSettings() : {};
        const statusLabel = nextTask ? t('trayNext', { name: taskName(lang, nextTask) }) : t('trayActiveCount', { count: activeCount });
        // WBS-9.6: Mod göstergesi + hızlı geçiş (değişim sonraki görevden geçerli).
        const mode = settings.autonomyMode || 'classic';
        const modeLabel = mode === 'full' ? t('trayModeFull') : t('trayModeClassic');
        // WP-13.T5: imza değişmezse menü yeniden kurulmaz.
        const signature = JSON.stringify({
            statusLabel,
            modeLabel,
            paused: settings.automationPaused === true,
            pin: Boolean(settings.cancelPinHash),
            lang,
            nextId: nextTask ? nextTask.id : null,
            nextTime: nextTask && nextTask.trigger ? nextTask.trigger.targetTime || null : null
        });
        if (!force && signature === lastTraySignature) return;
        lastTraySignature = signature;

        const contextMenu = Menu.buildFromTemplate([
            { label: t('trayShow'), click: () => { if (mainWindow) mainWindow.show(); } },
            { label: statusLabel, enabled: false },
            { label: modeLabel, enabled: false },
            { type: 'separator' },
            { label: t('trayTogglePause'), click: () => { if (taskManager) taskManager.togglePauseAll(); scheduleTrayUpdate(); } },
            {
                label: mode === 'full' ? t('traySwitchClassic') : t('traySwitchFull'),
                click: () => {
                    if (storageService) {
                        storageService.updateSettings({ autonomyMode: mode === 'full' ? 'classic' : 'full' });
                        scheduleTrayUpdate();
                    }
                }
            },
            {
                label: t('traySilenceAi'), click: () => {
                    if (storageService) {
                        storageService.updateSettings({ aiSilencedUntil: Date.now() + 86400000 });
                        scheduleTrayUpdate();
                    }
                }
            },
            { label: t('trayCancelNearest'), click: () => {
                if (!nextTask) return;
                // WBS-11.2: PIN kuruluysa tray'den sessiz iptal yok — pencere açılır.
                if (settings.cancelPinHash) {
                    if (mainWindow) {
                        mainWindow.show();
                        if (mainWindow.isMinimized()) mainWindow.restore();
                        mainWindow.focus();
                    }
                    if (tray) {
                        tray.displayBalloon({
                            title: 'Power Pilot',
                            content: t('trayPinProtected')
                        });
                    }
                    return;
                }
                taskManager.cancelTask(nextTask.id);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('timer-cancelled-from-tray');
                }
                scheduleTrayUpdate();
            } },
            { type: 'separator' },
            { label: t('trayQuit'), click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip(t('trayTooltip'));
        tray.setContextMenu(contextMenu);
    };

    tray.setToolTip(t('trayTooltip'));
    trayUpdater = updateTrayMenu;
    updateTrayMenu(true);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// WP-12: SingletonLock dosyası elle SİLİNMEZ. Electron süreç sahipliğini
// kendisi doğrular; elle silme ikinci örneğin veriyi bozmasına yol açar.
// Headless servis, GUI örneğinden bağımsızdır (farklı user-data-dir).
const gotTheLock = HEADLESS_MODE ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    if (!HEADLESS_MODE) app.on('second-instance', (event, commandLine) => {
        // P0-2: Scheduler yedeği uygulama açıkken tetiklenirse argv buraya gelir;
        // kayıt tüketilip görev normal boru hattından çalıştırılır.
        TaskSchedulerBridge.forwardRunTask(commandLine, taskManager);
        if (mainWindow) {
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        // WP-10.T1: file:// yerine app:// — protokol handler'ı pencere açılmadan hazır.
        installAppProtocol(path.join(__dirname, 'src'));
        // WP-10.T2/T6: yalnızca bildirim izni; kamera/mikrofon/konum reddedilir.
        const allowPermission = (permission) => permission === 'notifications';
        session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowPermission(permission)));
        session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowPermission(permission));
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            if (!String(details.url || '').startsWith('app://powerpilot/')) {
                callback({ responseHeaders: details.responseHeaders });
                return;
            }
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [APP_CSP],
                    'X-Content-Type-Options': ['nosniff'],
                    'Referrer-Policy': ['no-referrer'],
                    'Cross-Origin-Opener-Policy': ['same-origin'],
                    'Cross-Origin-Resource-Policy': ['same-origin']
                }
            });
        });
        // WP-01.T2: imza kanonikleştiricisi hazır olmadan emir üretilmez/doğrulanmaz.
        await SignedOrderService.initCanonicalizer();
        if (HEADLESS_MODE) {
            try {
                await startHeadless();
            } catch (err) {
                log.error('[Init] headless ajan başlatılamadı:', err && err.message);
                app.exitCode = 1;
                app.quit();
            }
            return;
        }
        // WP-04: sır deposu/DPAPI hazır değilse uygulama açılmaz (fail-closed).
        try {
            await initServices();
        } catch (err) {
            log.error('[Init] servisler başlatılamadı:', err && err.message);
            dialog.showErrorBox('Power Pilot başlatılamadı', (err && err.message) || 'Bilinmeyen hata');
            app.quit();
            return;
        }
        createWindow();
        createTray();
        // WP-08.T2: uykudan dönüşte sayaç hedef zamandan yeniden senkronlanır.
        powerMonitor.on('resume', () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('system-resumed');
            if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('system-resumed');
        });

        // WBS-2.2: Scheduler yedeğiyle uyandırma (--run-task=<id>).
        // Pencere hazır olduktan sonra normal boru hattından çalıştırılır
        // (uyarı kartı kullanıcıya gösterilebilir), tek-seferlik kayıt tüketilir.
        const runTaskId = TaskSchedulerBridge.parseRunTaskArgv(process.argv);
        if (runTaskId && taskManager) {
            const started = taskManager.runTaskNow(runTaskId);
            log.info(`[SchedulerBridge] --run-task=${runTaskId} başlatıldı: ${started}`);
            if (taskManager.schedulerBridge) {
                taskManager.schedulerBridge.removeTask(runTaskId);
            }
        }

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });

        // WBS-E3: Arka-plan kalibrasyonu — metrikler otursun diye 30sn gecikmeli,
        // tek seferlik; ilk başarıda balon bildirim (sonrakiler sessiz).
        timers.setTimeout(() => {
            try {
                const m = metricCollector ? metricCollector.getMetrics() : {};
                const wasMeasured = storageService.getSettings().wattSource === 'measured';
                deviceProfiler.calibrateIfNeeded(storageService, {
                    hasBattery: m.batterySupported === true,
                    isCharging: typeof m.isCharging === 'boolean' ? m.isCharging : null
                }).then((r) => {
                    if (r.measured && !wasMeasured && tray) {
                        tray.displayBalloon({
                            title: 'Power Pilot',
                            content: t('balloonMeasured', { watt: r.wattW })
                        });
                    }
                }).catch(() => {});
            } catch (_) {}
        }, 30000);
    });
}

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// WP-12: Temiz kapanış — interval/sunucu sızıntısı bırakma. Görev durumu
// değiştirilmez; yarıda kalan işler açılışta recoverTasksOnStartup ile işaretlenir.
app.on('before-quit', () => {
    isQuitting = true;
    try { if (headlessHandle) headlessHandle.stop(); } catch (_) {}
    try { if (consoleSyncTimer) clearInterval(consoleSyncTimer); } catch (_) {}
    try { if (trayUpdateTimer) clearTimeout(trayUpdateTimer); } catch (_) {}
    trayUpdater = null;
    try { if (backupTimer) clearInterval(backupTimer); } catch (_) {}
    try { if (initialBackupTimer) clearTimeout(initialBackupTimer); } catch (_) {}
    try { if (maintenanceTimer) clearInterval(maintenanceTimer); } catch (_) {}
    try { if (taskManager && taskManager.loopInterval) clearInterval(taskManager.loopInterval); } catch (_) {}
    try { if (metricCollector && typeof metricCollector.stopSampling === 'function') metricCollector.stopSampling(); } catch (_) {}
    try { if (aiBackend && typeof aiBackend.close === 'function') aiBackend.close().catch(() => {}); } catch (_) {}
    try { if (localApiService && typeof localApiService.stop === 'function') localApiService.stop().catch(() => {}); } catch (_) {}
    try {
        if (storageService && storageService.auditCheckpoint) {
            storageService.auditCheckpoint.write(storageService.getAuditLog());
        }
    } catch (_) { /* checkpoint best-effort; quit'i engellemez */ }
    try { if (storageService && typeof storageService.close === 'function') storageService.close(); } catch (_) {}
    try { timers.clearAll(); } catch (_) {}
});

// IPC Handlers

ipcOn('window-maximize-toggle', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcOn('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcOn('window-close', () => {
    if (mainWindow) mainWindow.close();
});

// WBS-0.2: Hızlı zamanlayıcı TaskManager üzerinden yönetilir; ayrı saat yok.
// TaskManager 1sn döngüsü hedef zamana ulaşıldığında görevi çalıştırır.
function cancelQuickTimer() {
    isMiniWindowDismissed = false;
    if (quickTimerTaskId && taskManager) {
        try { taskManager.cancelTask(quickTimerTaskId); } catch (_) { /* zaten bitmiş olabilir */ }
    }
    quickTimerTaskId = null;
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.close();
    }
    miniWindow = null;
}

ipcHandle('schedule-action', async (event, args) => {
    // WBS-2.1: Şema doğrulaması — reddet + gerekçe, asla çökme yok.
    const check = validateScheduleAction(args);
    if (!check.ok) {
        log.warn(`[IPC] schedule-action reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    const { action, durationMs } = args;

    cancelQuickTimer();

    // Create tracked AutomationTask — tek doğruluk kaynağı budur.
    let task;
    try {
        task = taskManager.createTask({
            name: `Hızlı Zamanlayıcı (${action})`,
            action: action,
            source: 'user_interface',
            trigger: { type: 'duration', durationMs: durationMs }
        });
    } catch (err) {
        return { success: false, message: err.message || t('errorTaskCreationFailed') };
    }
    quickTimerTaskId = task.id;

    updateMiniWindowVisibility();
    return {
        success: true,
        message: t('toastActionScheduled', { action: actionLabel(currentLanguage(), action) }),
        taskId: task.id,
        targetTime: (task.trigger && task.trigger.targetTime) || (Date.now() + durationMs)
    };
});

ipcHandle('cancel-action', async (event, args) => {
    // WBS-11.2: PIN kuruluysa iptal PIN ister (geriye uyumlu: args opsiyonel).
    const pinCheck = await requireCancelPin(args && args.pin);
    if (pinCheck) return pinCheck;
    // WP-03: Hızlı zamanlayıcıya ek olarak açık uyarı/aktif görev de çözülür.
    // Aksi halde banner açık kalırken görev arka planda çalışmaya devam eder.
    let activeResult = { ok: false, code: 'NO_ACTIVE_WARNING' };
    if (taskManager && typeof taskManager.cancelActiveTask === 'function') {
        activeResult = taskManager.cancelActiveTask();
    }
    cancelQuickTimer();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
    if (activeResult.code === 'CANCEL_TOO_LATE') {
        return {
            success: false,
            code: 'CANCEL_TOO_LATE',
            message: t('errorCancelTooLate')
        };
    }
    return { success: true, code: activeResult.code || 'NO_ACTIVE_WARNING', message: t('toastActionCancelled') };
});

ipcOn('update-mini-timer', (event, data) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send('timer-tick', data);
    }
});

ipcOn('hide-mini-widget', () => {
    isMiniWindowDismissed = true;
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.close();
    }
    miniWindow = null;
});

ipcOn('restore-main-window', () => {
    isMiniWindowDismissed = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// Comprehensive Tasks & Features IPC Handlers
ipcHandle('get-app-version', () => app.getVersion());
// WP-13/WP-15: Pencere yeniden yüklendiğinde aktif uyarı ve zamanlayıcı
// kaybolmaz; renderer bu uçtan durumu geri yükler.
ipcHandle('get-active-state', () => ({
    activeWarning: warningManager && typeof warningManager.getActiveState === 'function'
        ? warningManager.getActiveState()
        : null,
    tasks: taskManager ? taskManager.getActiveTasks().map(t => t.toJSON()) : [],
    claims: taskManager && typeof taskManager.getClaimState === 'function'
        ? taskManager.getClaimState()
        : []
}));
ipcHandle('get-tasks', () => taskManager.tasks.map(t => t.toJSON()));
ipcHandle('create-task', (event, data) => {
    const check = validateTaskData(data);
    if (!check.ok) {
        log.warn(`[IPC] create-task reddedildi: ${check.error}`);
        return { success: false, code: check.code || 'VALIDATION_ERROR', message: t('errorInvalidRequest') };
    }
    try {
        return { success: true, task: taskManager.createTask(data).toJSON() };
    } catch (err) {
        return { success: false, code: err.code || 'TASK_CREATION_FAILED', message: err.message };
    }
});
ipcHandle('cancel-task', async (event, payload) => {
    // WBS-11.2: Geriye uyumlu — string id veya {taskId, pin}.
    const taskId = typeof payload === 'string' ? payload : payload && payload.taskId;
    const pin = payload && typeof payload === 'object' ? payload.pin : undefined;
    const check = validateTaskId(taskId);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    const pinCheck = await requireCancelPin(pin);
    if (pinCheck) return pinCheck;
    const result = taskManager.cancelTask(taskId);
    if (!result.ok) return { success: false, code: result.code || 'CANCEL_FAILED', message: t('taskCancelFailed') };
    return { success: true, code: result.code, message: result.message };
});
ipcHandle('snooze-task', async (event, payload) => {
    const check = validateSnooze(payload);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    const pinCheck = await requireCancelPin(payload && payload.pin);
    if (pinCheck) return pinCheck;
    const result = taskManager.snoozeTask(payload.taskId, check.minutes);
    if (!result.ok) return { success: false, code: result.code || 'SNOOZE_FAILED', message: t('taskSnoozeFailed') };
    return { success: true, code: result.code, minutes: result.minutes };
});
// WBS-11.2: PIN yönetimi.
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
ipcHandle('get-cancel-pin-state', () => {
    return { set: !!storageService.getSettings().cancelPinHash };
});

ipcHandle('get-history', (event, filter) => historyService.getHistory(filter));
ipcHandle('clear-history', () => historyService.clear());
ipcHandle('get-statistics', () => energyService.getStatistics());
ipcHandle('get-templates', () => templateService.getTemplates());
ipcHandle('save-template', (event, tpl) => {
    // WBS-6.4: Kullanıcı şablonu — şema + koşul geçerliliği zorunlu.
    if (!tpl || typeof tpl !== 'object') {
        return { success: false, code: 'INVALID_BODY', message: t('errorInvalidTemplateData') };
    }
    const probe = { action: tpl.action, conditionGroup: tpl.defaultConditionGroup || (tpl.defaultCondition ? { operator: 'AND', conditions: [tpl.defaultCondition] } : undefined) };
    const check = validateTaskData(probe);
    if (!check.ok && !tpl.schedule) {
        log.warn(`[IPC] save-template reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    if (!TemplateService.isValidTemplate(tpl)) {
        return { success: false, code: 'INVALID_TEMPLATE', message: t('errorInvalidTemplate') };
    }
    const record = {
        id: typeof tpl.id === 'string' && tpl.id ? tpl.id : `user_tpl_${Date.now()}`,
        name: String(tpl.name || '').slice(0, 80),
        description: String(tpl.description || '').slice(0, 200),
        action: tpl.action,
        icon: 'bookmark',
        category: 'custom',
        ...(tpl.defaultCondition ? { defaultCondition: tpl.defaultCondition } : {}),
        ...(tpl.defaultConditionGroup ? { defaultConditionGroup: tpl.defaultConditionGroup } : {}),
        ...(tpl.schedule ? { schedule: tpl.schedule } : {})
    };
    const list = storageService.getTemplates().filter(t => t.id !== record.id);
    list.push(record);
    storageService.saveTemplates(list);
    return { success: true, template: record };
});
ipcHandle('delete-template', (event, templateId) => {
    const check = validateTaskId(templateId);
    if (!check.ok) return { success: false, code: check.code, message: t('errorInvalidRequest') };
    // Hazır şablonlar silinemez (id öneki tpl_, kullanıcılarınki user_tpl_).
    if (!String(templateId).startsWith('user_tpl_')) {
        return { success: false, code: 'PROTECTED_TEMPLATE', message: t('errorProtectedTemplate') };
    }
    storageService.saveTemplates(storageService.getTemplates().filter(t => t.id !== templateId));
    return { success: true };
});

// WBS-7.4: AI IPC — durum (RAM kapısı dahil) + komut ayrıştırma.
ipcHandle('ai-status', () => {
    const totalGb = Math.round((os.totalmem() / 1073741824) * 10) / 10;
    return {
        ...aiBackend.getStatus(),
        model: modelManager.status(),
        stt: sttModelManager.status(),
        download: { ...aiDownloadState },
        ramGb: totalGb,
        ramOk: os.totalmem() >= 4294967296
    };
});
ipcHandle('ai-parse', (event, text) => {
    // WBS-9.1 + el-freni: orkestratör kuyruk/susturma/denetim uygular;
    // tümü duraklatılmışken AI komutu reddedilir.
    if (taskManager && taskManager.pausedAll) {
        return { ok: false, code: 'PAUSED', message: t('toastAllPaused') };
    }
    const input = normalizeAiInput(text, { allowEmpty: false });
    if (!input.ok) return { ok: false, code: input.code, message: t('errorInvalidRequest') };
    return agentOrchestrator.runCommand(input.text);
});
ipcHandle('ai-diagnose', (event, reason) => {
    // WP-10.T9: sebep de aynı 4000 karakter sınırına tabidir.
    let detail = '';
    if (reason !== undefined && reason !== null) {
        const input = normalizeAiInput(reason);
        if (!input.ok) return { ok: false, code: input.code, message: t('errorInvalidRequest') };
        detail = input.text;
    }
    if (!detail) {
        const lastBlocked = historyService.getHistory().find(h => h.resultCode === 'blocked_by_policy');
        detail = lastBlocked ? `${lastBlocked.taskName}: ${lastBlocked.detail || ''}`.slice(0, 4000) : '';
    }
    return agentOrchestrator.runDiagnose(detail);
});
ipcHandle('ai-energy', () => agentOrchestrator.runEnergy(energyService.getStatistics()));
ipcHandle('ai-suggest', () => agentOrchestrator.runSuggest(historyService.getHistory()));
ipcHandle('ai-dismiss-suggestion', (event, topic) => {
    if (typeof topic !== 'string' || !topic) return { success: false };
    return { success: agentOrchestrator.dismissTopic(topic) };
});
// WBS-E3/E4: Cihaz tahmini (sihirbaz + Ayarlar "Yeniden ölç" kullanır).
ipcHandle('device-estimate', async () => {
    try {
        const m = metricCollector ? metricCollector.getMetrics() : {};
        const battery = {
            hasBattery: m.batterySupported === true,
            isCharging: typeof m.isCharging === 'boolean' ? m.isCharging : null
        };
        return { ok: true, profile: await deviceProfiler.profile(battery) };
    } catch (err) {
        return { ok: false, code: 'ESTIMATE_FAILED', message: t('errorEstimateFailed') };
    }
});
// WBS-9.4: Uyarı bannerı düğmeleri (Durdur / Ertele / Şimdi Çalıştır).
// WBS-11.2: Durdur/Ertele PIN korumalıdır (geriye uyumlu payload).
ipcHandle('warning-cancel', (event, args) => {
    const pinCheck = requireCancelPin(args && args.pin);
    if (pinCheck) return pinCheck;
    // WP-03: uyarıyı çöz + görevi CANCELLED yap (tek doğruluk kaynağı).
    if (taskManager && typeof taskManager.cancelActiveTask === 'function') {
        const r = taskManager.cancelActiveTask();
        if (r.code === 'CANCEL_TOO_LATE') {
            return {
                success: false,
                code: 'CANCEL_TOO_LATE',
                message: t('errorCancelTooLate')
            };
        }
        if (r.ok) return { success: true, code: r.code };
    }
    const closed = warningManager.cancelActiveWarning();
    return { success: closed === true, code: closed ? 'CANCELLED' : 'NO_ACTIVE_WARNING' };
});
ipcHandle('warning-snooze', (event, payload) => {
    const minutes = payload && typeof payload === 'object' ? payload.minutes : payload;
    const pin = payload && typeof payload === 'object' ? payload.pin : undefined;
    const pinCheck = requireCancelPin(pin);
    if (pinCheck) return pinCheck;
    const m = Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 10;
    if (taskManager && typeof taskManager.snoozeTask === 'function') {
        const active = typeof warningManager.getActiveState === 'function' ? warningManager.getActiveState() : null;
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
ipcHandle('warning-confirm', () => {
    warningManager.finishWarning(true, false);
    return { success: true };
});
// WBS-8.3: STT IPC — örnekler 16kHz mono olmalı (istemci yeniden örnekler).
ipcHandle('stt-status', () => sttService.getStatus());
ipcHandle('stt-transcribe', (event, payload) => {
    const { samples, sampleRate, uiLang } = payload || {};
    if (sampleRate !== 16000) {
        return { ok: false, code: 'INVALID_SAMPLE_RATE', message: t('errorAudioFormat') };
    }
    const len = samples && typeof samples.length === 'number' ? samples.length : 0;
    if (len === 0 || len > 500000) {
        return { ok: false, code: 'INVALID_AUDIO', message: t('errorAudioSize') };
    }
    return sttService.transcribePcm(samples, uiLang);
});
// WBS-7.5: Model indirme/yükleme IPC — indirme arka planda sürer, durum polling ile izlenir.
let aiDownloadState = { state: 'idle', file: null, received: 0, total: null, step: 0, steps: 2, error: null };
ipcHandle('ai-model-download', () => {
    // AI paketi = LLM + STT modeli (sıralı, arka planda; canlı ilerleme ai-status.download ile).
    if (aiDownloadState.state === 'running') {
        return { started: false, code: 'ALREADY_DOWNLOADING', message: t('errorDownloadBusy') };
    }
    aiDownloadState = { state: 'running', file: null, received: 0, total: null, step: 0, steps: 2, error: null };
    const run = async () => {
        try {
            const { ModelManager } = require('./src/main/services/ModelManager');
            const out = await ModelManager.downloadBundle(modelManager, sttModelManager, (ev) => {
                aiDownloadState = { state: 'running', file: ev.file, received: ev.received, total: ev.total, step: ev.step, steps: ev.steps, error: null };
            });
            log.info(`[ModelManager] LLM indirme: ${out.llm.success ? 'ok' : out.llm.error}`);
            if (out.llm.success && out.stt) {
                log.info(`[ModelManager] STT indirme: ${out.stt.success ? 'ok' : out.stt.error}`);
            }
            const failed = !out.llm.success ? out.llm : (out.stt && !out.stt.success ? out.stt : null);
            aiDownloadState = failed
                ? { state: 'failed', file: aiDownloadState.file, received: aiDownloadState.received, total: aiDownloadState.total, step: aiDownloadState.step, steps: 2, error: failed.error || t('errorAiDownloadFailed') }
                : { state: 'done', file: null, received: 0, total: null, step: 2, steps: 2, error: null };
        } catch (err) {
            log.error('[ModelManager] beklenmeyen hata:', err && err.message);
            aiDownloadState = { state: 'failed', file: null, received: 0, total: null, step: 0, steps: 2, error: (err && err.message) || t('unknownError') };
        }
    };
    run();
    return { started: true };
});
ipcHandle('ai-model-load', () => aiBackend.loadModel());
ipcHandle('ai-model-unload', async () => {
    await aiBackend.unload();
    return { success: true, ...aiBackend.getStatus() };
});

ipcHandle('get-settings', () => storageService.getSettings());

// WP-14.T2: renderer yalnızca aktif dil sözlüğünü alır.
ipcHandle('get-locale', (_event, language) => {
    try {
        const lang = normalizeLanguage(typeof language === 'string' ? language.slice(0, 16) : 'tr');
        return { ok: true, lang, rtl: lang === 'ar', dictionary: loadLocale(lang) };
    } catch (err) {
        log.warn('[IPC] locale yüklenemedi:', err && err.message);
        return { ok: false, code: 'LOCALE_LOAD_FAILED' };
    }
});

/** Ortak uygulama yolu: ayarları + sırları atomik-ish uygular, hatada geri alır. */
async function applySettingsPatch(newSettings, current, auditAction) {
    const { rest, secrets } = splitSecretPatch(newSettings);
    const secretFields = Object.keys(secrets);
    const needsRestart = rest.localApiEnabled !== undefined || rest.localApiPort !== undefined || rest.lanModeEnabled !== undefined
        || rest.localApiTlsEnabled !== undefined || rest.localApiRequireClientCert !== undefined
        || rest.localApiTlsStrict !== undefined
        || secretFields.includes('localApiKeyPem') || secretFields.includes('localApiPfxPassphrase');
    const before = { ...current };
    const previousSecrets = {};
    for (const field of secretFields) previousSecrets[field] = current[field] || null;
    try {
        if (Object.keys(rest).length > 0) storageService.updateSettings(rest);
        if (secretFields.length > 0) {
            if (!secretStore) {
                throw Object.assign(new Error('Sır deposu kullanılamıyor.'), { code: 'SECRET_BACKEND_UNAVAILABLE' });
            }
            for (const field of secretFields) {
                const value = secrets[field];
                if (typeof value === 'string' && value.length > 0) {
                    await secretStore.setSecret(field, value);
                    storageService.data.settings[field] = value;
                } else {
                    // null = sırrı temizle (boş dize şemada reddedilir).
                    await secretStore.deleteSecret(field);
                    storageService.data.settings[field] = null;
                }
            }
            await secretStore.hydrateData(storageService.data);
            try {
                auditLog.append({
                    actor: 'user_interface',
                    action: 'settings_secret_updated',
                    target: secretFields.join(','),
                    detail: `fields=${secretFields.length}`
                });
            } catch (auditErr) {
                log.warn('[IPC] sır güncelleme denetim kaydı yazılamadı:', auditErr && auditErr.message);
            }
        }
        // WBS-5.1 + FAZ A: API/TLS'yi etkileyen her değişiklikte sunucu yeniden başlatılır.
        // WP-02.T6: stop() portun boşalmasını bekler; start() başarısızsa ayarlar geri alınır.
        if (needsRestart) {
            const started = await localApiService.restart();
            const effectiveSettings = storageService.getSettings();
            if (effectiveSettings.localApiEnabled && started && started.ok === false) {
                throw Object.assign(new Error(`API yeniden başlatılamadı: ${started.code}`), { code: started.code });
            }
        }
        if (auditAction) {
            try {
                auditLog.append({
                    actor: 'user_interface',
                    action: auditAction,
                    target: Object.keys(rest).join(','),
                    detail: `fields=${Object.keys(rest).length}`
                });
            } catch (auditErr) {
                log.warn('[IPC] ayar denetim kaydı yazılamadı:', auditErr && auditErr.message);
            }
        }
        scheduleTrayUpdate();
        return { success: true, settings: storageService.getSettings() };
    } catch (err) {
        // WP-10: yarım kalmış yapılandırma bırakma; önceki ayarlara dön.
        log.error('[IPC] save-settings uygulanamadı, geri alınıyor:', err && err.message);
        try {
            storageService.updateSettings(before);
            if (secretStore && secretFields.length > 0) {
                for (const field of secretFields) {
                    const prev = previousSecrets[field];
                    if (typeof prev === 'string' && prev.length > 0) await secretStore.setSecret(field, prev);
                    else await secretStore.deleteSecret(field);
                }
                await secretStore.hydrateData(storageService.data);
            }
            if (needsRestart) {
                await localApiService.restart();
            }
        } catch (_) { /* rollback best-effort */ }
        return { success: false, code: err && err.code ? err.code : 'SETTINGS_APPLY_FAILED', message: t('errorSettingsApplyReverted') };
    }
}

ipcHandle('save-settings', async (event, newSettings) => {
    const current = storageService.getSettings();
    // WP-10.T4: güvenlik bayrakları bu yoldan yazılamaz (UNKNOWN_SETTING).
    const check = validateSettings(newSettings, current);
    if (!check.ok) {
        log.warn(`[IPC] save-settings reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    return applySettingsPatch(newSettings, current, null);
});

// WP-10.T4: güvenlik ayarları yalnızca PIN doğrulandıktan sonra yazılır.
ipcHandle('security-settings-update', async (event, payload) => {
    const patch = payload && typeof payload === 'object' ? payload.settings : null;
    const pin = payload && typeof payload === 'object' ? payload.pin : null;
    const current = storageService.getSettings();
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { success: false, code: 'INVALID_REQUEST', message: t('errorInvalidRequest') };
    }
    const unknown = Object.keys(patch).filter((key) => !SECURITY_SETTING_KEYS.includes(key));
    if (unknown.length > 0) {
        log.warn(`[IPC] security-settings-update bilinmeyen alan: ${unknown.join(',')}`);
        return { success: false, code: 'UNKNOWN_SETTING', message: t('errorInvalidRequest') };
    }
    const check = validateSecuritySettings(patch, current);
    if (!check.ok) {
        log.warn(`[IPC] security-settings-update reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    const pinError = await requireSecurityPin(pin);
    if (pinError) return pinError;
    return applySettingsPatch(patch, current, 'settings_security_updated');
});

ipcHandle('generate-api-key', async (event, args) => {
    const pinError = await requireSecurityPin(args && args.pin);
    if (pinError) return pinError;
    const role = args && typeof args.role === 'string' ? args.role : 'admin';
    const safeRole = ['viewer', 'operator', 'admin'].includes(role) ? role : 'admin';
    const rawKey = localApiService.generateApiKey(safeRole);
    auditLog.append({ actor: 'local_user', action: 'api_key_generated', target: 'local-api', detail: safeRole });
    return rawKey;
});
// FAZ B: kurumsal IPC — envanter, konsol senkronu, denetim (tümü salt-okunur + tetikleme;
// muafiyet YAZMA yalnızca LocalAPI admin anahtarıyla, IPC'den değil).
ipcHandle('get-inventory', async () => {
    try {
        return { ok: true, inventory: await inventoryService.collect() };
    } catch (err) {
        return { ok: false, code: 'INVENTORY_FAILED', message: (err && err.message) || t('errorInventoryFailed') };
    }
});
ipcHandle('get-exemptions', () => ({ exemptions: exemptionService.list(), windows: exemptionService.windows() }));
ipcHandle('get-security-status', () => localApiService.getSecurityStatus());
ipcHandle('get-audit', () => ({ audit: auditLog.load(), verify: auditLog.verify() }));
ipcHandle('console-sync', async () => {
    if (!consoleClient.isConfigured()) {
        return { ok: false, code: 'NOT_CONFIGURED', message: t('errorConsoleNotConfigured') };
    }
    const res = await consoleClient.sync();
    if (res.ok) {
        const drained = await orderExecutor.drain(orderQueue);
        return { ...res, drained };
    }
    return res;
});
ipcHandle('get-webhooks', () => WebhookService.redactForUi(storageService.getWebhooks()));
ipcHandle('save-webhooks', async (event, webhooks) => {
    const check = validateWebhooks(webhooks);
    if (!check.ok) {
        log.warn(`[IPC] save-webhooks reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    // WBS-5.2: Boş secret = mevcut korunsun (redacted liste geri kaydedilirken sırlar silinmez).
    const merged = WebhookService.mergeSecrets(webhooks, storageService.getWebhooks());
    const hasSecret = merged.some((hook) => WebhookService.secretFields()
        .some((field) => typeof hook[field] === 'string' && hook[field].length > 0));
    try {
        if (hasSecret && !secretStore) {
            throw Object.assign(new Error('Sır deposu kullanılamıyor.'), { code: 'SECRET_BACKEND_UNAVAILABLE' });
        }
        // WP-04: sırlar ayrı şifreli dosyaya yazılır; diskteki veri dosyasında
        // yalnızca null/alan-yok kalır. Öksüz webhook sırları temizlenir.
        if (secretStore) await secretStore.syncWebhooks(merged);
        storageService.saveWebhooks(merged);
        if (secretStore) await secretStore.hydrateData(storageService.data);
        try {
            auditLog.append({
                actor: 'user_interface',
                action: 'webhooks_updated',
                target: null,
                detail: `count=${merged.length}; secrets=${hasSecret ? 'present' : 'none'}`
            });
        } catch (auditErr) {
            log.warn('[IPC] webhook denetim kaydı yazılamadı:', auditErr && auditErr.message);
        }
        return { success: true };
    } catch (err) {
        log.error('[IPC] save-webhooks uygulanamadı:', err && err.message);
        return {
            success: false,
            code: err && err.code ? err.code : 'WEBHOOKS_APPLY_FAILED',
            message: t('errorSettingsApplyReverted')
        };
    }
});
ipcHandle('test-webhook', (event, hook) => {
    // WBS-5.2: Tek seferlik test gönderimi — kayıt defteri değişmez.
    const check = validateWebhooks([hook]);
    if (!check.ok) {
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    const sample = webhookService.buildPayload('task_created', {
        id: 'test', name: t('toastConsoleTestTitle'), source: 'user_interface', status: 'testing', action: 'lock'
    });
    webhookService.sendPayload(hook, sample);
    return { success: true, message: t('toastConsoleTestSent') };
});
ipcHandle('send-wol', (event, { macAddress, broadcastIp, port }) => {
    const check = validateWol({ macAddress, broadcastIp, port });
    if (!check.ok) {
        log.warn(`[IPC] send-wol reddedildi: ${check.error}`);
        return { success: false, code: check.code, message: t('errorInvalidRequest') };
    }
    return deviceService.sendWakeOnLan(macAddress, broadcastIp, port);
});

ipcOn('setting-autostart', (event, enable) => {
    if (typeof enable !== 'boolean') {
        log.warn('[IPC] setting-autostart reddedildi: boolean bekleniyor.');
        return;
    }
    app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
});

ipcOn('open-external-link', (event, url) => {
    // WP-10.T6: yalnızca allowlist'teki https host'lar dış tarayıcıda açılır.
    if (!openExternalSafely(shell, url, log)) {
        log.warn(`[IPC] open-external-link reddedildi: ${String(url).slice(0, 80)}`);
    }
});

// WP-10.T8: renderer CSP ihlalleri ana süreç loguna düşer (hassas veri yok).
ipcOn('csp-violation', (event, data) => {
    const safe = data && typeof data === 'object' ? data : {};
    const clip = (value) => String(value == null ? '' : value).slice(0, 512);
    log.warn(`[CSP] ihlal: directive=${clip(safe.violatedDirective)} blocked=${clip(safe.blockedURI)} source=${clip(safe.sourceFile)}:${Number(safe.lineNumber) || 0}`);
});
