/**
 * TaskSchedulerBridge.js — WP-05
 * Windows Görev Zamanlayıcı (schtasks.exe) yedeği: uygulama kapalıyken bile
 * koşulsuz zamanlanmış görevlerin kaçmamasını sağlar.
 *
 * İlke:
 * - Birincil tetikleyici her zaman TaskManager 1sn döngüsüdür; bu köprü SADECE
 *   uygulama kapalıysa devreye giren yedektir (fail-safe, best-effort).
 * - Kabuk YOKTUR: yalnızca execFile('schtasks.exe', args, ...) kullanılır.
 *   Kabuk yürütme ve string komut üretimi kaldırılmıştır (K-06).
 * - Görev kimliği istemciden kabul edilmez; sunucu üretir ve doğrular.
 * - Koşullu (monitoring) görevler Windows'a YAZILMAZ (K-04 ikinci savunma, ADR-09).
 * - Kayıt başarısız olursa sessizce atlanır (loglanır), uygulama akışı etkilenmez.
 * - Store (MSIX) sandbox'unda schtasks yasaktır → isStoreApp ise kayıt yapılmaz.
 * - Kayıt tek-seferliktir (ONCE); tüketilince silinir.
 * - 60sn'den yakın hedefler kaydedilmez (anlamsız + yarış riski).
 */

const { execFile } = require('child_process');
const crypto = require('crypto');
const log = require('../logger');
const { FLAGS } = require('../config/flags');

const TASK_NAME_PREFIX = 'PowerPilot';
const MIN_LEAD_TIME_MS = FLAGS.SCHEDULER_MIN_LEAD_MS;
const EXEC_TIMEOUT_MS = FLAGS.SCHEDULER_TIMEOUT_MS;
// Sunucu tarafı kimlik biçimi. İstemciden gelen serbest metin ASLA buraya girmez.
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// schtasks çıkış kodları (yerelleştirilmiş metne güvenilmez; kod tek ölçüt).
const EXIT_CODES = {
    0: { code: 'OK', message: 'Görev işlemi başarılı.' },
    1: { code: 'SCHTASKS_FAILED', message: 'Görev Zamanlayıcı işlemi başarısız.' },
    2: { code: 'SCHTASKS_NOT_FOUND', message: 'Görev bulunamadı.' },
    5: { code: 'ACCESS_DENIED', message: 'Görev oluşturmak için izin yok.' },
    8: { code: 'SCHTASKS_BUSY', message: 'Görev Zamanlayıcı meşgul.' },
    267011: { code: 'SCHTASKS_INVALID_TRIGGER', message: 'Tetikleyici zamanı geçersiz.' }
};

class TaskSchedulerBridge {
    /**
     * @param {object} opts
     * @param {Function} [opts.execFileFn] test enjeksiyonu: (file,args,opts,cb) => ChildProcess
     * @param {string} [opts.exePath]
     * @param {boolean} [opts.isStoreApp]
     * @param {Function} [opts.nowFn]
     */
    constructor({ execFileFn = null, exePath = '', isStoreApp = false, nowFn = null } = {}) {
        this.execFileFn = execFileFn || execFile;
        this.exePath = exePath;
        this.isStoreApp = isStoreApp === true;
        this.nowFn = nowFn || (() => Date.now());
    }

    /** ADR-08: istemci kimliği kabul edilmez; sunucu üretir. */
    static generateTaskId(nowMs = Date.now()) {
        const rand = crypto.randomBytes(6).toString('hex');
        return `task_${nowMs.toString(36)}_${rand}`;
    }

    static isValidTaskId(taskId) {
        return typeof taskId === 'string' && TASK_ID_RE.test(taskId);
    }

    static sanitizeTaskId(taskId) {
        return String(taskId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    }

    static taskName(taskId) {
        return `${TASK_NAME_PREFIX}\\${TaskSchedulerBridge.sanitizeTaskId(taskId)}`;
    }

    // schtasks /sd MM/DD/YYYY + /st HH:mm (yerel saat) biçimine çevirir.
    static formatTriggerDate(targetTime) {
        const d = new Date(targetTime);
        const pad = (n) => String(n).padStart(2, '0');
        return {
            date: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`,
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
        };
    }

    // process.argv içinden --run-task=<id> bayrağını çözer.
    static parseRunTaskArgv(argv) {
        const arg = (argv || []).find((a) => typeof a === 'string' && a.startsWith('--run-task='));
        if (!arg) return null;
        const id = arg.slice('--run-task='.length).trim();
        return TaskSchedulerBridge.isValidTaskId(id) ? id : null;
    }

    // P0-2: İkinci örnek argv'sini birincil örneğe iletme.
    static forwardRunTask(commandLine, taskManager) {
        const taskId = TaskSchedulerBridge.parseRunTaskArgv(commandLine || []);
        if (!taskId || !taskManager || typeof taskManager.runTaskNow !== 'function') return null;
        try {
            taskManager.runTaskNow(taskId);
        } catch (_) { /* çalıştırma hatası pencere odağını engellemez */ }
        if (taskManager.schedulerBridge && typeof taskManager.schedulerBridge.removeTask === 'function') {
            Promise.resolve(taskManager.schedulerBridge.removeTask(taskId)).catch(() => {});
        }
        return taskId;
    }

    isSupported() {
        return !this.isStoreApp && typeof this.exePath === 'string' && this.exePath.length > 0;
    }

    /**
     * ADR-09: yalnızca koşulsuz `scheduled` görevler Windows'a yazılır.
     * `monitoring`, `waiting`, `snoozed` ve koşul grubu olan görevler yazılmaz.
     */
    shouldSync(task) {
        if (!this.isSupported()) return false;
        if (!task || task.enabled === false) return false;
        if (task.status !== 'scheduled') return false;
        if (!TaskSchedulerBridge.isValidTaskId(task.id)) return false;
        const conditions = task.conditionGroup && Array.isArray(task.conditionGroup.conditions)
            ? task.conditionGroup.conditions
            : [];
        if (conditions.length > 0) return false;
        const targetTime = task.trigger && task.trigger.targetTime;
        if (!Number.isInteger(targetTime)) return false;
        if (task.trigger.notBefore && Number.isInteger(task.trigger.notBefore) && this.nowFn() < task.trigger.notBefore) {
            // Erteleme penceresi Windows'a taşınmaz; uygulama döngüsü bekler.
            return false;
        }
        if (targetTime - this.nowFn() < MIN_LEAD_TIME_MS) return false;
        return true;
    }

    /** ADR-08: argüman dizisi — kabuk yorumlaması yok. */
    buildCreateArgs(task) {
        if (!task || !TaskSchedulerBridge.isValidTaskId(task.id)) {
            const err = new Error('Geçersiz görev kimliği.');
            err.code = 'INVALID_TASK_ID';
            throw err;
        }
        const name = TaskSchedulerBridge.taskName(task.id);
        const { date, time } = TaskSchedulerBridge.formatTriggerDate(task.trigger.targetTime);
        const runArg = `"${String(this.exePath).replace(/"/g, '')}" --run-task=${task.id}`;
        return [
            '/create',
            '/tn', name,
            '/tr', runArg,
            '/sc', 'ONCE',
            '/sd', date,
            '/st', time,
            '/rl', 'LIMITED',
            '/f'
        ];
    }

    buildDeleteArgs(taskId) {
        if (!TaskSchedulerBridge.isValidTaskId(taskId)) {
            const err = new Error('Geçersiz görev kimliği.');
            err.code = 'INVALID_TASK_ID';
            throw err;
        }
        return ['/delete', '/tn', TaskSchedulerBridge.taskName(taskId), '/f'];
    }

    parseExit(code) {
        if (code === 0) return { success: true, code: 'OK' };
        const known = EXIT_CODES[code];
        return {
            success: false,
            code: known ? known.code : 'SCHTASKS_FAILED',
            error: known ? known.message : `schtasks çıkış kodu ${code}`
        };
    }

    execSchtasks(args) {
        return new Promise((resolve) => {
            let settled = false;
            const done = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };
            try {
                this.execFileFn('schtasks.exe', args, {
                    windowsHide: true,
                    timeout: EXEC_TIMEOUT_MS
                }, (err, stdout, stderr) => {
                    const code = err && typeof err.code === 'number' ? err.code : (err ? -1 : 0);
                    if (err && err.killed) {
                        return done({ success: false, code: 'SCHTASKS_TIMEOUT', error: 'schtasks zaman aşımı.', stdout, stderr });
                    }
                    const parsed = this.parseExit(code);
                    if (!parsed.success) {
                        log.warn(`[SchedulerBridge] ${parsed.code}: ${String(stderr || parsed.error).slice(0, 200)}`);
                    }
                    done({ ...parsed, stdout, stderr });
                });
            } catch (err) {
                done({ success: false, code: 'SCHTASKS_SPAWN_FAILED', error: err.message });
            }
        });
    }

    async syncTask(task) {
        let args;
        try {
            if (!this.shouldSync(task)) return false;
            args = this.buildCreateArgs(task);
        } catch (err) {
            log.warn(`[SchedulerBridge] görev yazılmadı: ${err.code || err.message}`);
            return false;
        }
        const result = await this.execSchtasks(args);
        if (result.success) {
            log.info(`[SchedulerBridge] yedek kaydedildi: ${task.id}`);
        }
        return result.success;
    }

    async removeTask(taskId) {
        if (!this.isSupported() || !taskId) return false;
        let args;
        try {
            args = this.buildDeleteArgs(taskId);
        } catch (_) {
            return false;
        }
        const result = await this.execSchtasks(args);
        return result.success;
    }
}

TaskSchedulerBridge.TASK_ID_RE = TASK_ID_RE;
TaskSchedulerBridge.EXIT_CODES = EXIT_CODES;

module.exports = TaskSchedulerBridge;
