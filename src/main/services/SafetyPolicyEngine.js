/**
 * SafetyPolicyEngine.js
 * Validates safety rules (protected apps, user activity, fullscreen mode, remote command security)
 * before any power action is executed.
 */

const { execFile } = require('child_process');
const os = require('os');
const log = require('../logger');
const { ExemptionService } = require('./ExemptionService');
const { canonicalProcessName } = require('./processNames');

class SafetyPolicyEngine {
    // execFn/uptimeFn: yalnızca test izolasyonu için. Açık DI.
    // options: processProvider/idleProvider/powerMonitor (WP-04/WP-05).
    constructor(storageService, execFn = null, uptimeFn = null, options = {}) {
        this.storage = storageService;
        this.execFile = execFn || execFile;
        this.uptimeFn = uptimeFn || (() => os.uptime());
        this.processProvider = typeof options.processProvider === 'function' ? options.processProvider : null;
        this.idleProvider = typeof options.idleProvider === 'function' ? options.idleProvider : null;
        this.powerMonitor = options.powerMonitor || null;
        this.protectedApps = [
            'code.exe', 'devenv.exe', 'idea64.exe', 'photoshop.exe',
            'premiere.exe', 'afterfx.exe', 'handbrake.exe', 'obs64.exe',
            'blender.exe', 'steam.exe', 'epicgameslauncher.exe', 'discord.exe',
            'zoom.exe', 'teams.exe', 'powerpnt.exe'
        ];
        this.protectedAppSet = new Set(this.protectedApps.map(canonicalProcessName));
    }

    /**
     * Evaluates whether a power action is safe to execute for the given task.
     * @param {AutomationTask} task
     * @returns {Promise<{ allowed: boolean, reason?: string }>}
     */
    async evaluate(task) {
        const policy = task.safetyPolicy || {};
        const deny = (reasonCode, detail) => ({ allowed: false, reasonCode, detail, reason: detail });

        // 0. Denetim (kill-switch): konsol ajanı devre-dışı bıraktıysa TÜM güç
        // eylemleri durur (kaynak fark etmez). İptal/izleme etkilenmez.
        try {
            const settings = this.storage && typeof this.storage.getSettings === 'function'
                ? this.storage.getSettings()
                : {};
            if (settings.agentDisabled === true) {
                log.warn('[SafetyPolicyEngine] Kill-switch devrede; eylem engellendi.');
                return deny('AGENT_DISABLED', 'Konsol kill-switch devrede; ajan devre-dışı.');
            }
        } catch (_) { /* ayar okunamazsa diğer kontrollere devam */ }

        // 1. Protected Applications Check — ölçüm hatası fail-closed.
        if (policy.checkProtectedApps) {
            let runningProcs;
            try {
                runningProcs = await this.getRunningProcessList();
            } catch (err) {
                log.error('[SafetyPolicyEngine] Süreç listesi alınamadı:', err && err.message);
                return deny('PROCESS_LIST_UNAVAILABLE', 'Çalışan süreçler doğrulanamadı; güç eylemi engellendi.');
            }
            const foundProtected = (runningProcs || []).filter(p => this.protectedAppSet.has(canonicalProcessName(p)));

            if (foundProtected.length > 0) {
                log.info(`[SafetyPolicyEngine] Action blocked due to protected apps: ${foundProtected.join(', ')}`);
                return deny('PROTECTED_APP_RUNNING', `Korunan uygulama(lar) çalışıyor: ${foundProtected.join(', ')}`);
            }
        }

        // 2. Remote Command Security Rules
        if (task.source === 'local_api' || task.source === 'n8n' || task.source === 'console') {
            const settings = this.storage ? this.storage.getSettings() : {};
            if (settings.blockRemoteShutdownWhenActive) {
                // If user idle time is less than 60 seconds, block remote shutdown
                const idleSec = await this.getUserIdleSeconds();
                if (idleSec < 60 && (task.action === 'shutdown' || task.action === 'restart')) {
                    return deny('USER_ACTIVE', 'Kullanıcı aktif olduğu için uzaktan kapatma engellendi.');
                }
            }
        }

        // 3. WBS-11.5: Aktif güç isteği (indirme/sunum/yazdırma sürerken kapatmayı engelle).
        // WP-09.T2: ölçüm hatası fail-closed.
        if (policy.checkSystemLoad) {
            const requests = await this.getPowerRequests();
            if (!requests.ok) {
                log.error('[SafetyPolicyEngine] Güç istekleri doğrulanamadı:', requests.code);
                return deny('POWER_REQUESTS_UNAVAILABLE', 'Aktif güç istekleri doğrulanamadı; güç eylemi engellendi.');
            }
            if (requests.hasActiveRequest) {
                log.info(`[SafetyPolicyEngine] Action blocked due to power requests: ${requests.categories.join(', ')}`);
                return deny('POWER_REQUEST_ACTIVE', `Aktif güç isteği var (${requests.categories.join(', ')}); işlem sürüyor olabilir.`);
            }
        }

        // 4. WBS-11.5: Tam ekran + aktif güç isteği BİRLİKTE ise engelle
        // (örn. sunum/izleme sırasında). Tek başına tam ekran engellemez.
        if (policy.checkFullscreen) {
            const [fullscreen, requests] = await Promise.all([this.getFullscreenState(), this.getPowerRequests()]);
            if (!fullscreen.ok) {
                log.error('[SafetyPolicyEngine] Tam ekran durumu doğrulanamadı:', fullscreen.code);
                return deny('FULLSCREEN_STATE_UNAVAILABLE', 'Tam ekran durumu doğrulanamadı; güç eylemi engellendi.');
            }
            if (!requests.ok) {
                return deny('POWER_REQUESTS_UNAVAILABLE', 'Aktif güç istekleri doğrulanamadı; güç eylemi engellendi.');
            }
            if (fullscreen.fullscreen && requests.hasActiveRequest) {
                return deny('FULLSCREEN_POWER_ACTIVE', 'Tam ekran uygulama + aktif güç isteği var; işlem bitene kadar bekleniyor.');
            }
        }

        // 5. FAZ B: Kurumsal muafiyet — YALNIZCA konsol görevleri (yerel görevler etkilenmez).
        if ((task.source === 'console' || task.policyId) && this.storage) {
            try {
                const svc = new ExemptionService(this.storage);
                const settings = typeof this.storage.getSettings === 'function' ? this.storage.getSettings() : {};
                const hit = svc.findExemption({
                    deviceId: settings.agentId || null,
                    user: this.getCurrentUser(),
                    policyId: task.policyId || null
                });
                if (hit) {
                    log.info(`[SafetyPolicyEngine] Konsol görevi muafiyetle engellendi: ${hit.id}`);
                    return deny('EXEMPTION_ACTIVE', `Muafiyet devrede (${hit.reason} — onay: ${hit.approvedBy}).`);
                }
            } catch (err) {
                log.warn('[SafetyPolicyEngine] muafiyet kontrolü atlandı:', err && err.message);
            }
        }

        // 6. FAZ B: Bakım-penceresi gerektiren görev (örn. yama-yeniden-başlatma)
        // pencere dışında çalışmaz. Bayrak konsol tarafından vurulur.
        if (task.requiresMaintenanceWindow && this.storage) {
            try {
                const svc = new ExemptionService(this.storage);
                if (!svc.inMaintenanceWindow()) {
                    return deny('OUTSIDE_MAINTENANCE_WINDOW', 'Bakım penceresi dışında; yama penceresi bekleniyor.');
                }
            } catch (err) {
                log.warn('[SafetyPolicyEngine] bakım-penceresi kontrolü atlandı:', err && err.message);
            }
        }

        // 7. FAZ D: Sunucu profili — konsoldan uyku/hazırda-beklet/kapatma YASAK.
        // Yeniden başlatma yalnızca bakım-penceresi bayrağıyla + pencere içinde.
        if (task.source === 'console' && this.storage && typeof this.storage.getSettings === 'function') {
            try {
                const settings = this.storage.getSettings();
                if (settings.deviceRole === 'server') {
                    if (['sleep', 'hibernate', 'shutdown'].includes(task.action)) {
                        log.info(`[SafetyPolicyEngine] Sunucu profilinde yasak eylem engellendi: ${task.action}`);
                        return deny('SERVER_PROFILE_FORBIDDEN', 'Sunucu profili: uyku/hazırda-beklet/kapatma yasak eylemler.');
                    }
                    if (task.action === 'restart' && (!task.requiresMaintenanceWindow || !new ExemptionService(this.storage).inMaintenanceWindow())) {
                        return deny('SERVER_RESTART_OUTSIDE_WINDOW', 'Sunucu yeniden başlatması yalnızca bakım penceresinde.');
                    }
                }
            } catch (err) {
                log.warn('[SafetyPolicyEngine] sunucu-profil kontrolü atlandı:', err && err.message);
            }
        }

        return { allowed: true };
    }

    // WBS-11.5: Açılış koruması — uptime eşik altındaysa idle-tetikleme atlanır.
    isBootGuardActive() {
        let guardSec = 120;
        try {
            const s = this.storage ? this.storage.getSettings() : {};
            if (Number.isInteger(s.bootGuardSeconds)) guardSec = s.bootGuardSeconds;
        } catch (_) {}
        if (guardSec <= 0) return false;
        try {
            return this.uptimeFn() < guardSec;
        } catch (_) {
            return false;
        }
    }

    // FAZ D (KVKK): konsola giden gerekçelerde ham işlem adı taşınmaz.
    // Yerel logda tam ad durur; konsol makbuzunda kategori yazılır.
    static sanitizeForConsole(reason) {
        return String(reason || '').replace(/\b[\w.-]+\.exe\b/gi, 'korunan-uygulama');
    }

    // Saf ayrıştırıcı: `powercfg /requests` çıktısı → aktif kategori listesi.
    // WP-09.T2: tanınmayan ama `.exe` içeren satır da aktif istek sayılır
    // (yerelleştirilmiş Windows çıktısı için güvenli taraf).
    static parsePowerRequests(stdout) {
        const categories = [];
        let current = null;
        for (const rawLine of String(stdout || '').split('\n')) {
            const line = rawLine.trim().replace(/\r$/, '');
            const section = line.match(/^(DISPLAY|SYSTEM|AWAYMODE|PERFBOOST|ACTIVELOCKSCREEN):\s*$/i);
            if (section) {
                current = section[1].toUpperCase();
                continue;
            }
            if (line === '') continue;
            if (/^none\.?$/i.test(line)) continue;
            const category = current || (/\.exe\b/i.test(line) ? 'UNKNOWN' : null);
            if (!category) continue;
            if (!categories.includes(category)) categories.push(category);
        }
        return { hasActiveRequest: categories.length > 0, categories };
    }

    /** WP-09.T2: 3 sn timeout, 5 sn cache; hata/boş/çözülemeyen çıktı fail-closed. */
    getPowerRequests() {
        const now = Date.now();
        if (this._powerCache && now - this._powerCache.at < 5000) return Promise.resolve(this._powerCache.value);
        return new Promise((resolve) => {
            this.execFile('powercfg.exe', ['/requests'], { windowsHide: true, timeout: 3000 }, (err, stdout) => {
                if (err || !stdout || !String(stdout).trim()) {
                    return resolve({ ok: false, code: 'POWER_REQUESTS_UNAVAILABLE', hasActiveRequest: false, categories: [] });
                }
                const text = String(stdout);
                const recognized = /^(DISPLAY|SYSTEM|AWAYMODE|PERFBOOST|ACTIVELOCKSCREEN):\s*$/im.test(text);
                const parsed = SafetyPolicyEngine.parsePowerRequests(text);
                if (!recognized && !parsed.hasActiveRequest) {
                    return resolve({ ok: false, code: 'POWER_REQUESTS_UNAVAILABLE', hasActiveRequest: false, categories: [] });
                }
                const value = { ok: true, hasActiveRequest: parsed.hasActiveRequest, categories: parsed.categories };
                this._powerCache = { at: now, value };
                resolve(value);
            });
        });
    }

    /** WP-09.T3: false varsayımı yok; hata ayrı `ok:false` olarak döner. */
    getFullscreenState() {
        return new Promise((resolve) => {
            const psCmd = "Add-Type -AssemblyName System.Windows.Forms; Add-Type -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\")] public static extern bool GetWindowRect(System.IntPtr h, ref RECT r); public struct RECT { public int L; public int T; public int R; public int B; }' -Name 'FgWin' -Namespace FgWinNS; $h=[FgWinNS.FgWin]::GetForegroundWindow(); $r=New-Object FgWinNS.FgWin+RECT; [void][FgWinNS.FgWin]::GetWindowRect($h, [ref]$r); $s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; if (($r.R-$r.L) -ge $s.Width -and ($r.B-$r.T) -ge $s.Height) {'FULLSCREEN'} else {'windowed'}";
            this.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
                if (err || !stdout || !String(stdout).trim()) {
                    return resolve({ ok: false, code: 'FULLSCREEN_STATE_UNAVAILABLE', fullscreen: false });
                }
                const text = String(stdout).trim();
                if (text !== 'FULLSCREEN' && text !== 'windowed') {
                    return resolve({ ok: false, code: 'FULLSCREEN_STATE_UNAVAILABLE', fullscreen: false });
                }
                resolve({ ok: true, fullscreen: text === 'FULLSCREEN' });
            });
        });
    }

    static rawProcessNames(list) {
        const out = [];
        for (const item of (Array.isArray(list) ? list : [])) {
            let name = typeof item === 'string' ? item : (item && (item.name || item.processName));
            if (typeof name !== 'string') continue;
            name = name.trim().toLowerCase();
            if (!name) continue;
            const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
            if (slash >= 0) name = name.slice(slash + 1);
            out.push(name);
        }
        return out;
    }

    async getRunningProcessList() {
        // WP-09.T1: ölçüm hatası boş liste değildir; çağıran fail-closed uygular.
        if (this.processProvider) {
            const list = await this.processProvider();
            if (!Array.isArray(list)) throw Object.assign(new Error('Süreç sağlayıcısı dizi döndürmedi.'), { code: 'PROCESS_LIST_UNAVAILABLE' });
            return SafetyPolicyEngine.rawProcessNames(list);
        }
        const mod = await import('ps-list');
        const list = await (mod.default || mod.psList)({ all: true });
        if (!Array.isArray(list)) throw Object.assign(new Error('ps-list dizi döndürmedi.'), { code: 'PROCESS_LIST_UNAVAILABLE' });
        return SafetyPolicyEngine.rawProcessNames(list);
    }

    getCurrentUser() {
        try {
            const info = os.userInfo();
            return (info && info.username) || null;
        } catch (_) {
            return null;
        }
    }

    async getUserIdleSeconds() {
        // WP-05: PowerShell GetLastInputInfo yerine Electron powerMonitor.
        // Sağlayıcı yoksa 0 döner = "kullanıcı aktif"; uzaktan kapatma fail-closed.
        try {
            if (this.idleProvider) {
                const secs = Number(await this.idleProvider());
                return Number.isFinite(secs) && secs >= 0 ? Math.floor(secs) : 0;
            }
            if (this.powerMonitor && typeof this.powerMonitor.getSystemIdleTime === 'function') {
                const secs = Number(this.powerMonitor.getSystemIdleTime());
                return Number.isFinite(secs) && secs >= 0 ? Math.floor(secs) : 0;
            }
        } catch (_) { /* fail-closed */ }
        return 0;
    }
}

module.exports = SafetyPolicyEngine;
