/**
 * LocalApiService.js
 * Embedded REST API Server for local n8n, CLI, and custom scripts.
 * Listens on 127.0.0.1 by default with API key authentication, permission scopes,
 * rate limiting, and strict request validation.
 *
 * FAZ A (tek-şirket pilotu):
 * - TLS: localApiTlsEnabled + sertifika materyali varsa https; yoksa http fallback
 *   (mevcut tek-PC davranışı bozulmaz).
 * - mTLS: localApiRequireClientCert=true ise istemci sertifikası ister; uygulama
 *   katmanında 401 döner (FAZ B'de rejectUnauthorized:true'ya sıkılaştırılacak).
 * - Rol-bazlı anahtar: viewer (salt-okunur) | operator (yıkıcı olmayan güç) | admin (tümü).
 *   Kayıtlı rol yoksa geriye uyumlu olarak admin sayılır.
 * - Rotasyon: anahtar yaşı 90 günü geçerse getSecurityStatus().rotationDue=true.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');
const log = require('../logger');
const { POWER_ACTIONS } = require('./PowerService');
const POWER_ACTIONS_LIST = Object.values(POWER_ACTIONS);
const { SignedOrderService } = require('./SignedOrderService');
const { ExemptionService, validateExemption, validateWindow } = require('./ExemptionService');
const { AuditLog } = require('./AuditLog');
const ipAcl = require('./net/ipAcl');
const TlsConfig = require('../security/TlsConfig');
const { safeCompare } = require('../security/safeCompare');
const { version: APP_VERSION } = require('../../../package.json');

const MAX_BODY_BYTES = 100 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const HEADERS_TIMEOUT_MS = 10000;
const KEEP_ALIVE_TIMEOUT_MS = 5000;
const MAX_HEADERS = 100;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 500;

// FAZ A: rol hiyerarşisi + uç başına asgari rol.
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };
const API_KEY_ROTATION_DAYS = 90;
// WBS-0.4 / WP-01: rate-limit belleği sınırsız büyümez.
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_MAX_KEYS = 1000;

class LocalApiService {
    constructor(storageService, taskManager, powerService, deps = {}) {
        this.storage = storageService;
        this.taskManager = taskManager;
        this.powerService = powerService;
        // FAZ B: kurumsal servisler (yoksa uçlar 503 döner, çekirdek etkilenmez).
        this.deps = deps || {};

        this.server = null;
        this.transport = 'disabled'; // disabled|http|https (getSecurityStatus için)
        this.boundHost = null;
        this.requestCounts = new Map(); // Rate limiting: IP -> timestamp list
        this.idempotencyCache = new Map(); // Key -> response
        this.diagnostics = {
            aclAllowed: 0,
            aclDenied: 0,
            rateLimited: 0
        };
    }

    // --- FAZ A: TLS / mTLS -------------------------------------------------

    /**
     * Ayarlardan TLS materyali çözer (PEM/PFX). Eksik materyalde null.
     */
    resolveTlsMaterial(settings) {
        const opts = TlsConfig.buildServerOptions(settings);
        if (!opts) return null;
        const mat = { ca: opts.ca || null };
        if (opts.pfx) {
            mat.pfx = opts.pfx;
            mat.passphrase = opts.passphrase || null;
        } else {
            mat.cert = opts.cert;
            mat.key = opts.key;
        }
        return mat;
    }

    getServerOptions(settings) {
        return TlsConfig.buildServerOptions(settings);
    }

    /**
     * WP-02.T4: mTLS istemci sertifikası.
     * - socket.authorized === true olmalı
     * - authorizationError boş olmalı
     * - parmak izi allowlist'i tanımlıysa fingerprint256 içinde olmalı
     * Zorunlu değilse true.
     */
    isClientCertOk(req, settings) {
        if (!settings.localApiRequireClientCert) return true;
        const sock = req.socket || {};
        if (sock.authorized !== true) return false;
        if (sock.authorizationError) return false;
        if (typeof sock.getPeerCertificate !== 'function') return false;
        let peer;
        try {
            peer = sock.getPeerCertificate(true);
        } catch (_) {
            return false;
        }
        if (!peer || Object.keys(peer).length === 0) return false;
        const allow = Array.isArray(settings.localApiClientFingerprints)
            ? settings.localApiClientFingerprints.map((f) => String(f).replace(/:/g, '').toLowerCase()).filter(Boolean)
            : [];
        if (allow.length > 0) {
            const fp = String(peer.fingerprint256 || '').replace(/:/g, '').toLowerCase();
            if (!fp || !allow.includes(fp)) return false;
        }
        return true;
    }

    // --- FAZ A: rol + rotasyon ----------------------------------------------

    static roleOf(settings) {
        const r = settings && settings.localApiKeyRole;
        return ROLE_RANK[r] ? r : 'admin';
    }

    static requiredRole(method, path) {
        if (method === 'GET') return 'viewer';
        // FAZ B: muafiyet/pencere yönetimi yalnızca admin (operator veremez/silemez).
        if (path === '/api/v1/exemptions' || path === '/api/v1/maintenance-windows') return 'admin';
        if (path.match(/^\/api\/v1\/(exemptions|maintenance-windows)\/[^\/]+$/)) return 'admin';
        // Yıkıcı güç eylemleri yalnızca admin.
        if (path === '/api/v1/power/shutdown' || path === '/api/v1/power/restart') return 'admin';
        if (path.match(/^\/api\/v1\/tasks\/[^\/]+\/cancel$/)) return 'operator';
        return 'operator';
    }

    static isApiKeyRotationDue(settings, now = Date.now()) {
        const created = settings && settings.localApiKeyCreatedAt;
        if (!created) return false;
        return (now - created) > API_KEY_ROTATION_DAYS * 86400000;
    }

    /**
     * Konsol/UI için güvenlik özeti (saf, test edilebilir — sunucuya dokunmaz).
     */
    /**
     * WP-08: Uzaktan kapatma, kullanıcı aktifken (idle < 60sn) engellenir.
     * Sağlayıcı yoksa 0 = aktif kabul edilir (fail-closed).
     */
    isRemoteShutdownBlocked(settings, action) {
        if (!settings || settings.blockRemoteShutdownWhenActive !== true) return false;
        if (action !== 'shutdown' && action !== 'restart') return false;
        try {
            if (typeof this.deps.idleProvider === 'function') {
                const secs = Number(this.deps.idleProvider());
                return !(Number.isFinite(secs) && secs >= 60);
            }
            if (this.deps.powerMonitor && typeof this.deps.powerMonitor.getSystemIdleTime === 'function') {
                const secs = Number(this.deps.powerMonitor.getSystemIdleTime());
                return !(Number.isFinite(secs) && secs >= 60);
            }
        } catch (_) { /* fail-closed */ }
        return true;
    }

    getSecurityStatus() {
        const settings = this.storage.getSettings();
        const tlsEnabled = !!settings.localApiTlsEnabled;
        const hasCertMaterial = !!this.resolveTlsMaterial(settings);
        return {
            transport: this.transport,
            tlsEnabled,
            tlsStrict: settings.localApiTlsStrict === true,
            hasCertMaterial,
            httpsActive: this.transport === 'https',
            mtlsRequired: !!settings.localApiRequireClientCert,
            apiKeySet: !!settings.localApiKeyHash,
            keyRole: LocalApiService.roleOf(settings),
            rotationDue: LocalApiService.isApiKeyRotationDue(settings),
            lanMode: !!settings.lanModeEnabled,
            boundHost: this.boundHost,
            diagnostics: this.getDiagnostics()
        };
    }

    getDiagnostics() {
        return {
            aclAllowed: this.diagnostics.aclAllowed,
            aclDenied: this.diagnostics.aclDenied,
            rateLimited: this.diagnostics.rateLimited,
            rateLimitKeys: this.requestCounts.size
        };
    }

    start() {
        const settings = this.storage.getSettings();
        if (!settings.localApiEnabled) {
            log.info('[LocalApiService] API is disabled in settings.');
            return { ok: false, code: 'API_DISABLED' };
        }

        const port = settings.localApiPort || 18456;
        const allowlist = Array.isArray(settings.lanAllowedIps) ? settings.lanAllowedIps : [];
        const lanRequested = settings.lanModeEnabled === true;
        const lanBound = lanRequested && allowlist.length > 0;
        const tlsOpts = this.getServerOptions(settings);

        // WP-02.T5: LAN modunda TLS zorunlu; bind öncesi son kontrol.
        if (lanBound && !tlsOpts) {
            log.error('[LocalApiService] LAN modu TLS olmadan başlatılamaz (LAN_REQUIRES_TLS).');
            return { ok: false, code: 'LAN_REQUIRES_TLS' };
        }
        // TLS açıkça istendiyse materyal yoksa sessiz HTTP fallback YOK.
        if (settings.localApiTlsEnabled === true && !tlsOpts) {
            log.error('[LocalApiService] TLS açık ama sertifika/anahtar yok (TLS_MATERIAL_MISSING).');
            return { ok: false, code: 'TLS_MATERIAL_MISSING' };
        }
        if (lanRequested && !lanBound) {
            log.warn('[LocalApiService] LAN modu açık ama allowlist boş — yalnızca loopback dinleniyor.');
        }
        const host = lanBound ? '::' : '127.0.0.1';

        // WP-02.T6: çalışan sunucu üzerine ikinci kez bind etme (EADDRINUSE yok).
        if (this.server) {
            log.warn('[LocalApiService] Sunucu zaten çalışıyor; yeniden başlatma için restart() kullanın.');
            return { ok: false, code: 'ALREADY_RUNNING' };
        }

        const handler = (req, res) => this.handleRequest(req, res);
        if (tlsOpts) {
            this.server = https.createServer(tlsOpts, handler);
            this.transport = 'https';
        } else {
            this.server = http.createServer(handler);
            this.transport = 'http';
        }
        // WP-02.T7: slowloris ve başlık taşması koruması.
        this.server.requestTimeout = REQUEST_TIMEOUT_MS;
        this.server.headersTimeout = HEADERS_TIMEOUT_MS;
        this.server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
        this.server.maxHeadersCount = MAX_HEADERS;

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
            if (!fallbackTried && host === '::' && noIpv6) {
                fallbackTried = true;
                try {
                    this.server.close(() => bind('0.0.0.0'));
                } catch (_) {
                    bind('0.0.0.0');
                }
            }
        });

        bind(host);
        return { ok: true, transport: this.transport, host };
    }

    /**
     * WP-02.T6: async durdurma — idle bağlantılar hemen, aktifler 5 sn sonra.
     */
    async stop() {
        const server = this.server;
        if (!server) {
            this.transport = 'disabled';
            this.boundHost = null;
            return { ok: true };
        }
        this.server = null;
        this.transport = 'disabled';
        this.boundHost = null;
        await new Promise((resolve) => {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            try {
                if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
                server.close(done);
                setTimeout(() => {
                    try {
                        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
                    } catch (_) { /* yut */ }
                    done();
                }, 5000).unref?.();
            } catch (_) {
                done();
            }
        });
        log.info('[LocalApiService] Server stopped.');
        return { ok: true };
    }

    /**
     * WP-02.T6: ayar değişiminde güvenli yeniden başlatma. `stop()` portun
     * gerçekten boşalmasını bekler; ardışık çağrılar EADDRINUSE üretmez.
     */
    async restart() {
        await this.stop();
        return this.start();
    }

    generateApiKey(role = 'admin') {
        const safeRole = ROLE_RANK[role] ? role : 'admin';
        const rawKey = `pp_key_${crypto.randomBytes(24).toString('hex')}`;
        const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const masked = `${rawKey.substr(0, 10)}...${rawKey.substr(-4)}`;

        this.storage.updateSettings({
            localApiKeyHash: hash,
            localApiKeyMasked: masked,
            localApiKeyCreatedAt: Date.now(), // Plan kapanışı: 90-gün rotasyon hatırlatması için
            localApiKeyRole: safeRole
        });

        return rawKey; // Return once to user for display
    }

    handleRequest(req, res) {
        const rawIp = req.socket.remoteAddress || '127.0.0.1';
        const remoteAddr = ipAcl.normalizeAddress(rawIp);
        const remoteIp = remoteAddr ? remoteAddr.toString() : '';
        const settings = this.storage.getSettings();

        // WP-01: ACL her zaman uygulanır (LAN kapalıyken yalnızca loopback).
        // Loopback daima açıktır; boş allowlist non-loopback'i reddeder.
        if (!ipAcl.isAllowed(rawIp, settings.lanAllowedIps)) {
            this.diagnostics.aclDenied += 1;
            return this.sendJson(res, 403, { error: 'IP address not allowed', code: 'IP_NOT_ALLOWED' });
        }
        this.diagnostics.aclAllowed += 1;

        // Rate limiting: max 60 requests per minute per IP (WBS-0.4: kod+ doküman eşit).
        // 60 = CLI 5sn polling + n8n burst toleransı. ACL'den SONRA çalışır;
        // yetkisiz IP'ler rate-limit map'ini büyütemez.
        if (this.isRateLimited(remoteIp)) {
            this.diagnostics.rateLimited += 1;
            return this.sendJson(res, 429, { error: 'Rate limit exceeded. Try again later.' });
        }

        // FAZ A: mTLS istemci sertifikası (gerekiyorsa API anahtarından ÖNCE bakılır).
        if (!this.isClientCertOk(req, settings)) {
            // WP-02.T11: iptal edilen istemcinin keep-alive bağlantısı da kapanır.
            try { if (res && typeof res.setHeader === 'function') res.setHeader('Connection', 'close'); } catch (_) { /* yut */ }
            const out = this.sendJson(res, 401, { error: 'Client certificate required', code: 'MTLS_REQUIRED' });
            try { if (req.socket && typeof req.socket.end === 'function') req.socket.end(); } catch (_) { /* yut */ }
            return out;
        }

        // Authentication Check
        const apiKeyHeader = req.headers['x-api-key'] || this.extractBearerToken(req.headers['authorization']);
        if (!apiKeyHeader) {
            return this.sendJson(res, 401, { error: 'Missing API key header (X-API-Key or Authorization Bearer)' });
        }

        const providedHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
        // WP-01.T8 / M-01: sabit zamanlı karşılaştırma (uzunluk sızıntısı yok).
        if (!safeCompare(providedHash, settings.localApiKeyHash || '')) {
            return this.sendJson(res, 401, { error: 'Invalid API key' });
        }

        const role = LocalApiService.roleOf(settings);

        // Parse URL & Body
        const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const pathname = parsedUrl.pathname;
        const method = req.method.toUpperCase();

        // WP-02.T7: gövde taşıyan metotlarda JSON içerik tipi zorunlu.
        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (['POST', 'PUT', 'PATCH'].includes(method) && contentType !== 'application/json') {
            return this.sendJson(res, 415, { error: 'Content-Type must be application/json', code: 'UNSUPPORTED_MEDIA_TYPE' });
        }

        // WP-02.T8 / L-03: Idempotency-Key aynı yanıtı döndürür.
        const idemKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
        if (idemKey) {
            this.pruneIdempotency();
            const cached = this.idempotencyCache.get(idemKey);
            if (cached) return this.sendJson(res, cached.status, cached.body);
            if (this.idempotencyCache.size >= IDEMPOTENCY_MAX_ENTRIES) {
                const oldest = this.idempotencyCache.keys().next().value;
                if (oldest !== undefined) this.idempotencyCache.delete(oldest);
            }
            res.__ppIdempotencyKey = idemKey;
        }

        let bodyRaw = '';
        let bodyBytes = 0;
        let tooLarge = false;
        req.on('data', chunk => {
            if (tooLarge) return;
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_BODY_BYTES) {
                tooLarge = true;
                this.sendJson(res, 413, { error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE', limit: MAX_BODY_BYTES });
                try { if (typeof req.destroy === 'function') req.destroy(); } catch (_) { /* yut */ }
                return;
            }
            bodyRaw += chunk;
        });

        req.on('end', () => {
            if (tooLarge) return;
            let body = {};
            if (bodyRaw) {
                try {
                    body = JSON.parse(bodyRaw);
                } catch (e) {
                    return this.sendJson(res, 400, { error: 'Invalid JSON payload' });
                }
            }

            // Denetim: yönlendirici istisnası süreci ÖLDÜRMEZ (500 + log).
            try {
                const out = this.route(method, pathname, body, res, { role });
                if (out && typeof out.catch === 'function') {
                    out.catch((err) => {
                        log.error('[LocalApiService] asenkron uç hatası:', err && err.message);
                        try { this.sendJson(res, 500, { error: 'Endpoint failed' }); } catch (_) {}
                    });
                }
            } catch (err) {
                log.error('[LocalApiService] yönlendirici hatası:', err && err.message);
                try { this.sendJson(res, 500, { error: 'Internal error' }); } catch (_) {}
            }
        });
    }

    extractBearerToken(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
        return authHeader.split(' ')[1];
    }

    pruneRateLimit(now = Date.now()) {
        for (const [ip, timestamps] of this.requestCounts.entries()) {
            const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
            if (valid.length === 0) this.requestCounts.delete(ip);
            else this.requestCounts.set(ip, valid);
        }
        // Map insertion order: en eski anahtarlar önce silinir.
        while (this.requestCounts.size > RATE_LIMIT_MAX_KEYS) {
            const oldest = this.requestCounts.keys().next().value;
            if (oldest === undefined) break;
            this.requestCounts.delete(oldest);
        }
    }

    isRateLimited(ip) {
        const now = Date.now();
        // Periyodik budama: yalnızca boyut sınırı aşıldığında değil, map
        // büyüdükçe eski anahtarlar temizlenir (bellek sınırı korunur).
        if (this.requestCounts.size > 100) this.pruneRateLimit(now);
        if (this.requestCounts.size > RATE_LIMIT_MAX_KEYS) this.pruneRateLimit(now);
        const timestamps = this.requestCounts.get(ip) || [];
        const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

        if (validTimestamps.length >= RATE_LIMIT_MAX) {
            return true;
        }

        validTimestamps.push(now);
        this.requestCounts.set(ip, validTimestamps);
        return false;
    }

    pruneIdempotency(now = Date.now()) {
        for (const [key, entry] of this.idempotencyCache.entries()) {
            if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
                this.idempotencyCache.delete(key);
            }
        }
    }

    route(method, path, body, res, ctx = {}) {
        const role = ROLE_RANK[ctx.role] ? ctx.role : 'admin'; // ctx yoksa admin (geriye uyumlu)
        const settings = this.storage.getSettings();

        // FAZ A: rol kapısı — bilinmeyen yola 404 (yetki sızıntısı yok).
        const KNOWN = path === '/api/v1/status'
            || path === '/api/v1/tasks'
            || path === '/api/v1/tasks/timer'
            || path === '/api/v1/inventory'
            || path === '/api/v1/orders'
            || path === '/api/v1/orders/pending'
            || path === '/api/v1/exemptions'
            || path === '/api/v1/maintenance-windows'
            || path === '/api/v1/audit'
            || (typeof path === 'string' && path.match(/^\/api\/v1\/(tasks\/[^\/]+\/cancel|exemptions\/[^\/]+|maintenance-windows\/[^\/]+)$/))
            || (typeof path === 'string' && path.startsWith('/api/v1/power/'));
        if (KNOWN) {
            const need = LocalApiService.requiredRole(method, path);
            if (ROLE_RANK[role] < ROLE_RANK[need]) {
                return this.sendJson(res, 403, { error: `Role '${role}' insufficient (requires '${need}')`, code: 'FORBIDDEN' });
            }
        }

        // System & Info
        if (method === 'GET' && path === '/api/v1/status') {
            return this.sendJson(res, 200, {
                status: 'online',
                app: 'Power Pilot',
                version: APP_VERSION,
                activeTasksCount: this.taskManager.getActiveTasks().length,
                pausedAll: this.taskManager.pausedAll,
                transport: this.transport,
                boundHost: this.boundHost,
                keyRole: role,
                diagnostics: this.getDiagnostics()
            });
        }

        // Tasks API
        if (method === 'GET' && path === '/api/v1/tasks') {
            const tasks = this.taskManager.tasks.map(t => t.toJSON());
            return this.sendJson(res, 200, { tasks });
        }

        if (method === 'POST' && path === '/api/v1/tasks/timer') {
            // Takip-1: fail-fast — geçersiz eylem/süre 400 döner, bozuk görev kurulmaz.
            if (!body.action || !body.durationMs) {
                return this.sendJson(res, 400, { error: 'Missing action or durationMs' });
            }
            if (!POWER_ACTIONS_LIST.includes(body.action)) {
                return this.sendJson(res, 400, { error: `Invalid action: ${body.action}` });
            }
            if (!Number.isInteger(body.durationMs) || body.durationMs <= 0 || body.durationMs > 2500000000) {
                return this.sendJson(res, 400, { error: 'durationMs must be an integer in 1..2500000000' });
            }
            // K2: ad doğrulaması (uzunluk + HTML karakterleri) — geçmiş tablosu lavabosu.
            if (body.name !== undefined) {
                if (typeof body.name !== 'string' || body.name.length > 120) {
                    return this.sendJson(res, 400, { error: 'name must be a string up to 120 chars' });
                }
                if (/[<>]/.test(body.name)) {
                    return this.sendJson(res, 400, { error: 'name must not contain < or >' });
                }
            }
            const task = this.taskManager.createTask({
                name: body.name || `API Timer (${body.action})`,
                action: body.action,
                source: 'local_api',
                trigger: {
                    type: 'duration',
                    durationMs: body.durationMs
                }
            });
            return this.sendJson(res, 201, { success: true, task: task.toJSON() });
        }

        if (method === 'POST' && path.match(/^\/api\/v1\/tasks\/[^\/]+\/cancel$/)) {
            const taskId = path.split('/')[4];
            // WP-02.T8 / D-06: iptal sonucu yok sayılmaz; gerçek sonuç eşlenir.
            const result = this.taskManager.cancelTask(taskId);
            if (!result || result.ok === false) {
                if (result && result.code === 'NOT_FOUND') {
                    return this.sendJson(res, 404, { success: false, code: 'TASK_NOT_FOUND', error: `Task ${taskId} not found` });
                }
                return this.sendJson(res, 400, {
                    success: false,
                    code: (result && result.code) || 'CANCEL_FAILED',
                    error: (result && result.message) || `Task ${taskId} could not be cancelled`
                });
            }
            if (result.code === 'CANCEL_TOO_LATE') {
                return this.sendJson(res, 409, { success: false, code: 'CANCEL_TOO_LATE', error: result.message || 'Cancel too late' });
            }
            if (result.code === 'ALREADY_CANCELLED') {
                return this.sendJson(res, 409, { success: false, code: 'ALREADY_CANCELLED', error: `Task ${taskId} is already cancelled` });
            }
            return this.sendJson(res, 200, { success: true, message: `Task ${taskId} cancelled` });
        }

        // Power Actions API — K3: TÜM güç eylemleri görev hattından geçer
        // (güvenlik motoru + uyarı + geçmiş/denetim). shutdown deseni genelleştirildi:
        // 5sn gecikmeli görev + 15sn uyarı; anında `execute()` çağrısı YOKTUR.
        // Gerekçe: uzaktan-emir koruması (blockRemoteShutdownWhenActive), muafiyet,
        // sunucu profili ve kill-switch yalnızca boru hattında çalışır.
        const POWER_ROUTES = {
            '/api/v1/power/lock': 'lock',
            '/api/v1/power/signout': 'signout',
            '/api/v1/power/restart': 'restart',
            '/api/v1/power/sleep': 'sleep',
            '/api/v1/power/hibernate': 'hibernate'
        };
        if (method === 'POST' && POWER_ROUTES[path]) {
            const action = POWER_ROUTES[path];
            if (this.isRemoteShutdownBlocked(settings, action)) {
                return this.sendJson(res, 403, {
                    error: 'Kullanıcı aktifken uzaktan kapatma/yeniden başlatma engellendi.',
                    code: 'REMOTE_SHUTDOWN_BLOCKED'
                });
            }
            const task = this.taskManager.createTask({
                name: `API Immediate ${action}`,
                action,
                source: 'local_api',
                warningConfig: { enabled: true, durationSeconds: 15, silentMode: false },
                trigger: { type: 'duration', durationMs: 5000 }
            });
            return this.sendJson(res, 200, { success: true, message: `${action} scheduled via API`, taskId: task.id });
        }

        if (method === 'POST' && path === '/api/v1/power/shutdown') {
            if (this.isRemoteShutdownBlocked(settings, 'shutdown')) {
                return this.sendJson(res, 403, {
                    error: 'Kullanıcı aktifken uzaktan kapatma engellendi.',
                    code: 'REMOTE_SHUTDOWN_BLOCKED'
                });
            }
            const task = this.taskManager.createTask({
                name: 'API Immediate Shutdown',
                action: 'shutdown',
                source: 'local_api',
                trigger: { type: 'duration', durationMs: 5000 }
            });
            return this.sendJson(res, 200, { success: true, message: 'Shutdown scheduled via API', taskId: task.id });
        }

        // FAZ B: kurumsal uçlar (servis yoksa 503, çekirdek etkilenmez).
        try {
            const enterprise = this.routeEnterprise(method, path, body, res);
            if (enterprise !== null) return enterprise;
        } catch (err) {
            log.warn('[LocalApiService] kurumsal uç hatası:', err && err.message);
            return this.sendJson(res, 500, { error: 'Enterprise endpoint failed', code: (err && err.code) || 'ENDPOINT_FAILED' });
        }

        return this.sendJson(res, 404, { error: 'Endpoint not found' });
    }

    unavailable(res, what) {
        return this.sendJson(res, 503, { error: `${what} kullanılamıyor`, code: 'UNAVAILABLE' });
    }

    routeEnterprise(method, path, body, res) {
        // GET /api/v1/inventory — cihaz envanteri (viewer+).
        if (method === 'GET' && path === '/api/v1/inventory') {
            if (!this.deps.inventory || typeof this.deps.inventory.collect !== 'function') {
                return this.unavailable(res, 'Envanter servisi');
            }
            this.deps.inventory.collect()
                .then((inv) => this.sendJson(res, 200, { inventory: inv }))
                .catch((err) => this.sendJson(res, 500, { error: 'Envanter alınamadı', code: 'INVENTORY_FAILED' }));
            return true; // asenkron yanıt
        }

        // POST /api/v1/orders — imzalı konsol emri alımı (operator+).
        if (method === 'POST' && path === '/api/v1/orders') {
            if (!this.deps.queue || typeof this.deps.queue.enqueue !== 'function') {
                return this.unavailable(res, 'Emir kuyruğu');
            }
            const settings = this.storage.getSettings();
            const verifier = new SignedOrderService({ publicKeyPem: settings.consolePublicKeyPem || null, storage: this.storage });
            const v = verifier.verify(body);
            if (!v.ok) {
                const authLike = v.code === 'BAD_SIGNATURE' || v.code === 'NO_TRUST_ANCHOR';
                return this.sendJson(res, authLike ? 401 : 400, { error: v.error, code: v.code });
            }
            let record;
            let duplicate = false;
            try {
                const enq = this.deps.queue.enqueue(body, { idempotencyKey: body.idempotencyKey || null });
                record = enq.record;
                duplicate = enq.duplicate;
            } catch (err) {
                if (err && err.code === 'QUEUE_FULL') {
                    return this.sendJson(res, 429, { error: err.message, code: 'QUEUE_FULL' });
                }
                throw err;
            }
            if (this.deps.audit) {
                this.deps.audit.append({ actor: 'console', action: duplicate ? 'order_duplicate' : 'order_queued', target: v.order.action, detail: v.order.nonce });
            }
            return this.sendJson(res, 201, { success: true, key: record.key, duplicate });
        }

        // GET /api/v1/orders/pending — bekleyen emirler (viewer+).
        if (method === 'GET' && path === '/api/v1/orders/pending') {
            if (!this.deps.queue || typeof this.deps.queue.pending !== 'function') {
                return this.unavailable(res, 'Emir kuyruğu');
            }
            return this.sendJson(res, 200, { orders: this.deps.queue.pending() });
        }

        // Muafiyetler (okuma viewer+, yazma admin — rol kapısı yukarıda).
        if (method === 'GET' && path === '/api/v1/exemptions') {
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            return this.sendJson(res, 200, { exemptions: svc.list() });
        }
        if (method === 'POST' && path === '/api/v1/exemptions') {
            const check = validateExemption({ id: `ex_${Date.now()}`, ...body });
            if (!check.ok) return this.sendJson(res, 400, { error: check.error, code: check.code });
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            const record = svc.add({ id: `ex_${Date.now()}`, ...body });
            if (this.deps.audit) {
                this.deps.audit.append({ actor: 'api', action: 'exemption_granted', target: record.id, detail: record.reason });
            }
            return this.sendJson(res, 201, { success: true, exemption: record });
        }
        const exDel = typeof path === 'string' && path.match(/^\/api\/v1\/exemptions\/([^\/]+)$/);
        if (method === 'DELETE' && exDel) {
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            svc.remove(decodeURIComponent(exDel[1]));
            if (this.deps.audit) {
                this.deps.audit.append({ actor: 'api', action: 'exemption_revoked', target: decodeURIComponent(exDel[1]), detail: '' });
            }
            return this.sendJson(res, 200, { success: true });
        }

        // Bakım pencereleri (okuma viewer+, yazma admin).
        if (method === 'GET' && path === '/api/v1/maintenance-windows') {
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            return this.sendJson(res, 200, { windows: svc.windows() });
        }
        if (method === 'POST' && path === '/api/v1/maintenance-windows') {
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            const candidate = { id: `mw_${Date.now()}`, ...body };
            const check = validateWindow(candidate);
            if (!check.ok) return this.sendJson(res, 400, { error: check.error, code: check.code });
            const record = svc.addWindow(candidate);
            return this.sendJson(res, 201, { success: true, window: record });
        }
        const mwDel = typeof path === 'string' && path.match(/^\/api\/v1\/maintenance-windows\/([^\/]+)$/);
        if (method === 'DELETE' && mwDel) {
            const svc = this.deps.exemptions || new ExemptionService(this.storage);
            svc.removeWindow(decodeURIComponent(mwDel[1]));
            return this.sendJson(res, 200, { success: true });
        }

        // GET /api/v1/audit — denetim günlüğü + zincir doğrulama (viewer+).
        if (method === 'GET' && path === '/api/v1/audit') {
            const audit = this.deps.audit || new AuditLog(this.storage);
            return this.sendJson(res, 200, { audit: audit.load(), verify: audit.verify() });
        }

        return null; // kurumsal uç değil
    }

    sendJson(res, statusCode, data) {
        // WP-02.T8 / L-03: Idempotency-Key yanıtı saklanır; aynı anahtar aynı
        // gövdeyi döner. 5xx saklanmaz (geçici hata kalıcılaşmasın).
        if (res && res.__ppIdempotencyKey && statusCode < 500) {
            this.idempotencyCache.set(res.__ppIdempotencyKey, {
                status: statusCode,
                body: data,
                expiresAt: Date.now() + IDEMPOTENCY_TTL_MS
            });
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify(data));
    }
}

module.exports = LocalApiService;
