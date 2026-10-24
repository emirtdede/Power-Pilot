/**
 * TaskManager.js
 * Central Engine managing multiple concurrent automation tasks, schedule evaluations,
 * conflict resolutions, and application restart recoveries.
 */

const { AutomationTask, TASK_STATUS, TASK_SOURCE, TRIGGER_TYPE, CONDITION_TYPE, EXECUTION_RESULT_CODE, SUPPORTED_CONDITION_TYPES } = require('./models/AutomationTask');
const { PowerService } = require('./PowerService');
const crypto = require('crypto');
const fs = require('fs');
const log = require('../logger');

class TaskManager {
    constructor(storageService, warningManager, safetyPolicyEngine, historyService, webhookService, smartFinishEngine = null, metricCollector = null, powerService = null, timerRegistry = null) {
        this.storage = storageService;
        this.warningManager = warningManager;
        this.safetyPolicyEngine = safetyPolicyEngine;
        this.history = historyService;
        this.webhook = webhookService;
        // WBS-0.1: Smart Finish motoru ve metrik toplayıcı enjekte edilir.
        // Eksik verilirse condition dalı güvenli şekilde atlanır (fail-safe, sessiz geçilmez).
        this.smartFinishEngine = smartFinishEngine;
        this.metricCollector = metricCollector;
        // WBS-4.2: OS çağrıları test edilebilirlik için enjekte edilir.
        // Üretimde varsayılan gerçek PowerService; testlerde sahte nesne verilir.
        // (Doğrudan modül mock'una güvenilmez — çift modül kaydı riski.)
        this.power = powerService || PowerService;

        this.tasks = [];
        // WBS-2.2: Duraklatma kalıcıdır (yeniden başlatmada scheduler yedeği
        // duraklatılmışken tetiklenemez). Depoda yoksa false.
        this.pausedAll = !!(this.storage && typeof this.storage.getSettings === 'function' && this.storage.getSettings().automationPaused);
        // WBS-2.2: Scheduler köprüsü main.js tarafından sonradan takılır
        // (taskManager.schedulerBridge = ...). Takılı değilse yedekleme atlanır.
        this.schedulerBridge = null;
        this.loopInterval = null;
        // WP-02: tek-icra kilidi. Anahtar taskId, değer claim kaydıdır.
        // Claim senkrondur; await içermez. Böylece scheduler + runTaskNow
        // aynı tick'te yarışsa bile yalnızca biri kazanır.
        this.claims = new Map();
        // WP-02: Plan v2.0 sözleşmesindeki ad. Aynı Map'e işaret eder; iki ad
        // arasında durum kopyası oluşmaz (tek doğruluk kaynağı).
        this.executionClaims = this.claims;
        // WP-08.T3: renderer başarı toast'ını yalnızca bu olayla gösterir.
        this.resultListener = null;
        // WP-13.T5: tray/menü değişim sinyali (100 ms debounce main.js'de).
        this.changeListener = null;
        this.timerRegistry = timerRegistry;
        this._evaluating = false;
        // WP-11.T5: yalnızca değişen satırlar; tam liste yazımı yok.
        this._savedTaskState = new Map();

        this.init();
    }

    init() {
        // Load tasks from storage
        const rawTasks = this.storage.getTasks();
        this.tasks = rawTasks.map(t => new AutomationTask(t));
        this._savedTaskState = this._taskSnapshot();

        // Evaluate & Recover tasks after application restart
        this.recoverTasksOnStartup();

        // Start 1-second task evaluation loop
        this.startLoop();
    }

    // --- WP-02: atomik claim / token -------------------------------------

    claimTask(taskId, source = 'scheduler') {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task || task.enabled === false) return { ok: false, code: 'NOT_FOUND' };
        if (this.pausedAll) return { ok: false, code: 'PAUSED' };
        if (this.claims.size > 0) return { ok: false, code: 'ALREADY_RUNNING' };
        const runnable = [TASK_STATUS.SCHEDULED, TASK_STATUS.MONITORING, TASK_STATUS.EXPIRED];
        if (!runnable.includes(task.status)) return { ok: false, code: 'NOT_RUNNABLE' };
        const token = crypto.randomUUID();
        this.claims.set(taskId, {
            token,
            source,
            phase: 'claimed',
            powerStarted: false,
            cancelRequested: false,
            claimedAt: Date.now()
        });
        return { ok: true, token, task };
    }

    isClaimValid(taskId, token) {
        const claim = this.claims.get(taskId);
        return !!(claim && token && claim.token === token && !claim.cancelRequested);
    }

    releaseTask(taskId, token = null) {
        const claim = this.claims.get(taskId);
        if (!claim) return false;
        if (token && claim.token !== token) return false;
        this.claims.delete(taskId);
        return true;
    }

    /** WP-08.T3: main.js bir kez bağlar; olay yalnızca terminal sonuçta yayınlanır. */
    setResultListener(fn) {
        this.resultListener = typeof fn === 'function' ? fn : null;
    }

    setChangeListener(fn) {
        this.changeListener = typeof fn === 'function' ? fn : null;
    }

    setTimerRegistry(registry) {
        this.timerRegistry = registry || null;
    }

    notifyResult(task, success) {
        if (!this.resultListener || !task) return;
        try {
            this.resultListener({
                taskId: task.id,
                name: task.name,
                action: task.action,
                success: success === true,
                status: task.status,
                code: task.lastResult && task.lastResult.code,
                message: task.errorInfo || (task.lastResult && task.lastResult.message) || null
            });
        } catch (err) {
            log.warn('[TaskManager] Sonuç dinleyicisi hata verdi:', err && err.message);
        }
    }

    handleExecutionError(task, err) {
        log.error(`[TaskManager] Görev hatası (${task && task.name}):`, err && err.message);
        if (!task) return;
        task.status = TASK_STATUS.FAILED;
        task.errorInfo = (err && err.message) || 'Beklenmeyen yürütme hatası.';
        task.lastResult = { code: EXECUTION_RESULT_CODE.OS_EXECUTION_FAILED, message: task.errorInfo };
        if (this.history) {
            this.history.record(task, EXECUTION_RESULT_CODE.OS_EXECUTION_FAILED, task.errorInfo);
        }
        this.persistChanges();
        this.notifyResult(task, false);
    }

    recoverTasksOnStartup() {
        const now = Date.now();
        log.info(`[TaskManager] Recovering ${this.tasks.length} tasks on startup...`);

        this.tasks.forEach(task => {
            if (!task.enabled) return;

            // Tasks that were executing when app crashed/closed -> mark interrupted
            if (task.status === TASK_STATUS.EXECUTING || task.status === TASK_STATUS.WARNING) {
                task.status = TASK_STATUS.FAILED;
                task.errorInfo = 'Uygulama beklenmedik şekilde kapandığı için işlem yarıda kaldı.';
                if (this.history) {
                    this.history.record(task, EXECUTION_RESULT_CODE.INTERRUPTED_BY_SHUTDOWN, 'App shutdown/crash');
                }
                return;
            }

            // Duration or Scheduled single-run tasks
            if (task.trigger.type === TRIGGER_TYPE.DURATION || task.trigger.type === TRIGGER_TYPE.SCHEDULED_TIME) {
                const targetTime = task.trigger.targetTime;
                if (targetTime && targetTime < now) {
                    // Time has already passed -> set Expired (Do NOT auto-execute!)
                    task.status = TASK_STATUS.EXPIRED;
                    log.info(`[TaskManager] Task "${task.name}" expired during offline time.`);
                }
            } else if (task.recurrence && task.recurrence.enabled) {
                // Calculate next recurrence time
                this.calculateNextRecurrence(task);
            }
        });

        this.persistChanges();
    }

    calculateNextRecurrence(task) {
        if (!task.recurrence || !task.recurrence.enabled) return;

        const now = new Date();
        const [targetHour, targetMin] = String(task.recurrence.timeOfDay || '00:00')
            .split(':')
            .map((n) => Number(n));
        if (!Number.isInteger(targetHour) || !Number.isInteger(targetMin) ||
            targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) {
            log.warn(`[TaskManager] Geçersiz recurrence.timeOfDay: ${task.recurrence.timeOfDay}`);
            return;
        }

        const nextRun = new Date(now);
        nextRun.setHours(targetHour, targetMin, 0, 0);
        if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

        const days = Array.isArray(task.recurrence.daysOfWeek)
            ? task.recurrence.daysOfWeek.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            : [];
        const frequency = task.recurrence.frequency;
        const dayAllowed = (day) => {
            if (frequency === 'weekdays') return day >= 1 && day <= 5;
            if (frequency === 'weekends') return day === 0 || day === 6;
            if (frequency === 'weekly' || frequency === 'custom') {
                return days.length === 0 || days.includes(day);
            }
            return true;
        };

        // En fazla bir yıl ileri tara; bozuk gün listesi sonsuz döngü yapamaz.
        let guard = 0;
        while (!dayAllowed(nextRun.getDay()) && guard < 370) {
            nextRun.setDate(nextRun.getDate() + 1);
            guard += 1;
        }

        task.trigger.targetTime = nextRun.getTime();
        task.status = TASK_STATUS.SCHEDULED;
    }

    startLoop() {
        if (this.loopInterval) clearInterval(this.loopInterval);

        const schedule = this.timerRegistry
            ? this.timerRegistry.setInterval.bind(this.timerRegistry)
            : setInterval;
        this.loopInterval = schedule(() => {
            this.evaluateTasks();
        }, 1000);
    }

    evaluateTasks() {
        if (this.pausedAll) return;
        // Reentrancy guard: 1sn'lik tick üst üste binerse aynı görev iki kez
        // değerlendirilmez. Bu guard await içermez; scheduler senkron kalır.
        if (this._evaluating) return;
        this._evaluating = true;

        try {
            const now = Date.now();
            const readyToExecute = [];

            this.tasks.forEach(task => {
                if (!task.enabled || task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.CANCELLED || task.status === TASK_STATUS.BLOCKED || task.status === TASK_STATUS.EXPIRED || task.status === TASK_STATUS.FAILED) {
                    return;
                }

                // Time-based trigger check — YALNIZCA koşulsuz görevler.
                // ADR-09/K-04: koşullu görevde targetTime yoktur; erteleme notBefore'tadır.
                const hasConditions = !!(task.conditionGroup && Array.isArray(task.conditionGroup.conditions) && task.conditionGroup.conditions.length > 0);
                if (!hasConditions && task.trigger.targetTime && now >= task.trigger.targetTime && task.status === TASK_STATUS.SCHEDULED) {
                    readyToExecute.push(task);
                    return;
                }

                // WBS-0.1: Condition-based (Smart Finish) trigger check.
                // MONITORING veya koşullu SCHEDULED görevler her döngüde değerlendirilir.
                if (hasConditions && (task.status === TASK_STATUS.MONITORING || task.status === TASK_STATUS.SCHEDULED)) {
                    // WP-06.T5: notBefore geçilmeden koşul değerlendirilmez.
                    const notBefore = Number(task.trigger.notBefore);
                    if (Number.isFinite(notBefore) && notBefore > 0 && now < notBefore) {
                        task.lastProgressMessage = `Erteleme: ${Math.ceil((notBefore - now) / 1000)} sn kaldı`;
                        return;
                    }
                    if (!this.smartFinishEngine) return;
                    // WBS-11.5: Açılış koruması — sessizlik-tipi koşullarda ilk 120sn atlanır.
                    // Tracker'a dokunulmaz, history şişirilmez; yalnızca bu tur pas geçilir.
                    if (this.hasIdleLikeCondition(task) && this.safetyPolicyEngine &&
                        typeof this.safetyPolicyEngine.isBootGuardActive === 'function' &&
                        this.safetyPolicyEngine.isBootGuardActive()) {
                        task.lastProgressMessage = 'Açılış koruması devrede';
                        return;
                    }
                    try {
                        const verdict = this.smartFinishEngine.evaluateTask(task);
                        task.lastProgressMessage = verdict.progressMessage;
                        if (task.status !== TASK_STATUS.MONITORING) {
                            task.status = TASK_STATUS.MONITORING;
                            this.persistChanges();
                        }
                        if (verdict.satisfied) {
                            readyToExecute.push(task);
                        }
                    } catch (err) {
                        task.status = TASK_STATUS.FAILED;
                        task.errorInfo = `Smart Finish değerlendirme hatası: ${err.message}`;
                        if (this.history) {
                            this.history.record(task, EXECUTION_RESULT_CODE.CONDITION_INVALID, task.errorInfo);
                        }
                        this.persistChanges();
                    }
                }
            });

            if (readyToExecute.length > 0) {
                // ÖNEMLİ: await YOK. Bu çağrı senkron claim alır ve promise'i
                // ateşleyip bırakır; scheduler tick'i OS işlemini beklemez.
                this.handleTaskExecution(readyToExecute);
            }
        } finally {
            this._evaluating = false;
        }
    }

    blockTask(task, primaryTask, reason) {
        if (!task) return;
        task.status = TASK_STATUS.BLOCKED;
        task.errorInfo = reason || (primaryTask
            ? `Çakışan görev: "${primaryTask.name}" daha önce çalıştırıldı.`
            : 'Başka bir görev yürütülüyor.');
        if (this.history) {
            this.history.record(task, EXECUTION_RESULT_CODE.BLOCKED_BY_POLICY, task.errorInfo);
        }
        if (this.webhook) this.webhook.triggerEvent('task_blocked', task);
        this.removeScheduler(task.id);

        // Tekrarlayan görev bloklandığı için takvimden düşmez; sonraki
        // uygun vakti hesaplanır. Tek seferlik görev BLOCKED kalır.
        if (task.recurrence && task.recurrence.enabled) {
            this.calculateNextRecurrence(task);
            this.syncScheduler(task);
        }
    }

    handleTaskExecution(taskList) {
        if (!Array.isArray(taskList) || taskList.length === 0) return;

        const ordered = taskList.slice().sort((a, b) => {
            if (a.source === 'user_interface' && b.source !== 'user_interface') return -1;
            if (b.source === 'user_interface' && a.source !== 'user_interface') return 1;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        // Global tek-icra politikası: bir görev çalışıyorsa yeni görev başlatılmaz.
        if (this.claims.size > 0) {
            for (const task of ordered) this.blockTask(task, null, 'Başka bir görev yürütülüyor; bu görev bloklandı.');
            this.persistChanges();
            return;
        }

        let primaryTask = null;
        let claim = null;
        for (const candidate of ordered) {
            const result = this.claimTask(candidate.id, 'scheduler');
            if (result.ok) {
                primaryTask = candidate;
                claim = result;
                break;
            }
        }
        if (!primaryTask || !claim) return;

        // Uzaktan kaynaklı görevlerde uyarı süresi dolarsa devam edilir
        // (kullanıcı başında olmayabilir); klasik UI görevinde durur.
        if ([TASK_SOURCE.LOCAL_API, TASK_SOURCE.N8N, TASK_SOURCE.CONSOLE].includes(primaryTask.source)) {
            primaryTask._schedulerFired = true;
        }

        for (const task of ordered) {
            if (task.id === primaryTask.id) continue;
            this.blockTask(task, primaryTask);
        }
        this.persistChanges();

        //Fire-and-forget: await edilmez; hata executeTask içinde yakalanır.
        Promise.resolve(this.executeTask(primaryTask, claim.token)).catch((err) => {
            this.handleExecutionError(primaryTask, err);
        });
    }

    async executeTask(task, token = null) {
        if (!task) return;

        // Doğrudan çağrı (test/CLI) claim sahibi değilse kendi claim'ini alır.
        // Böylece iki eşzamanlı doğrudan çağrı da çift icra edemez.
        let directClaim = false;
        if (!token) {
            const acquired = this.claimTask(task.id, 'direct');
            if (!acquired.ok) {
                log.info(`[TaskManager] executeTask reddedildi (${acquired.code}): ${task.id}`);
                return;
            }
            token = acquired.token;
            directClaim = true;
        }
        void directClaim;

        const claim = this.claims.get(task.id);
        if (!claim || claim.token !== token) return;

        log.info(`[TaskManager] Initiating task execution: ${task.name} (${task.action})`);

        try {
            // Check Safety Policies
            claim.phase = 'safety';
            if (this.safetyPolicyEngine) {
                const safetyCheck = await this.safetyPolicyEngine.evaluate(task);
                if (!this.isClaimValid(task.id, token)) return;
                if (!safetyCheck.allowed) {
                    task.status = TASK_STATUS.BLOCKED;
                    task.errorInfo = safetyCheck.reason || 'Güvenlik politikası engelledi.';
                    task.lastResult = { code: EXECUTION_RESULT_CODE.BLOCKED_BY_POLICY, message: task.errorInfo };
                    if (this.history) {
                        this.history.record(task, EXECUTION_RESULT_CODE.BLOCKED_BY_POLICY, task.errorInfo);
                    }
                    if (this.webhook) this.webhook.triggerEvent('task_blocked', task);
                    this.removeScheduler(task.id);
                    this.persistChanges();
                    this.notifyResult(task, false);
                    return;
                }
            }

            // Warning Modal / Countdown check
            if (task.warningConfig && task.warningConfig.enabled && this.warningManager) {
                claim.phase = 'warning';
                task.status = TASK_STATUS.WARNING;
                this.persistChanges();

                if (this.webhook) this.webhook.triggerEvent('task_warning_started', task);

                const warningConfirmed = await this.warningManager.showWarning(task);
                // İptal, warning await'i sırasında geldiyse token geçersizdir.
                if (!this.isClaimValid(task.id, token)) return;

                if (!warningConfirmed || !warningConfirmed.proceed) {
                    if (warningConfirmed && warningConfirmed.snoozed) {
                        const applied = this.applySnooze(task, warningConfirmed.minutes);
                        if (applied.ok && this.history) {
                            this.history.record(task, EXECUTION_RESULT_CODE.SNOOZED_BY_USER, `${applied.minutes} dk ertelendi`);
                        }
                        if (applied.ok && this.webhook) this.webhook.triggerEvent('task_snoozed', task);
                        if (!applied.ok) {
                            task.status = TASK_STATUS.CANCELLED;
                            task.errorInfo = applied.message || 'Erteleme reddedildi.';
                            if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.CANCELLED_BY_USER, task.errorInfo);
                        }
                        this.syncScheduler(task);
                    } else {
                        task.status = TASK_STATUS.CANCELLED;
                        if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.CANCELLED_BY_USER, 'Kullanıcı İptal Etti');
                        if (this.webhook) this.webhook.triggerEvent('task_cancelled', task);
                        this.removeScheduler(task.id);
                    }
                    this.persistChanges();
                    return;
                }
            }

            // Final OS Execution
            claim.phase = 'executing';
            claim.powerStarted = true;
            task.status = TASK_STATUS.EXECUTING;
            task.lastRunAt = new Date().toISOString();
            this.persistChanges();

            if (this.webhook) this.webhook.triggerEvent('power_action_started', task);

            let result;
            try {
                result = await this.power.execute(task.action);
            } catch (err) {
                result = { success: false, error: err && err.message ? err.message : 'Güç işlemi hatası.' };
            }

            // OS çağrısı başladıktan sonra iptal "çok geç"tir; sonuç yine yazılır.
            const cancelTooLate = claim.cancelRequested === true;

            if (result && result.success) {
                task.status = TASK_STATUS.COMPLETED;
                task.errorInfo = null;
                task.lastResult = {
                    code: EXECUTION_RESULT_CODE.SUCCESS,
                    message: 'Başarıyla çalıştırıldı',
                    ...(cancelTooLate ? { note: 'CANCEL_TOO_LATE' } : {})
                };
                if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.SUCCESS, 'Başarılı');
                this.notifyResult(task, true);

                if (task.recurrence && task.recurrence.enabled) {
                    this.calculateNextRecurrence(task);
                    this.syncScheduler(task);
                } else {
                    this.removeScheduler(task.id);
                    this.spawnChainLink(task);
                }
            } else {
                task.status = TASK_STATUS.FAILED;
                task.errorInfo = (result && result.error) || 'Güç işlemi çalıştırılamadı.';
                task.lastResult = {
                    code: EXECUTION_RESULT_CODE.OS_EXECUTION_FAILED,
                    message: task.errorInfo,
                    ...(cancelTooLate ? { note: 'CANCEL_TOO_LATE' } : {})
                };
                if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.OS_EXECUTION_FAILED, task.errorInfo);
                this.notifyResult(task, false);
                this.removeScheduler(task.id);
            }
        } catch (err) {
            this.handleExecutionError(task, err);
        } finally {
            // L-10: tek release + tek save; dallanma yok.
            this.releaseTask(task.id, token);
            this.persistChanges();
        }
    }

    // WBS-11.5: Açılışta yanlış tetiklenebilen sessizlik-tipi koşullar.
    hasIdleLikeCondition(task) {
        const conds = (task.conditionGroup && task.conditionGroup.conditions) || [];
        return conds.some(c => c && (c.type === 'user_idle' || c.type === 'network_speed' ||
            c.type === 'disk_activity' || c.type === 'cpu_usage'));
    }

    // WBS-2.2: Scheduler yedeği best-effort'tur; köprü yoksa veya kayıt
    // reddedilirse sessizce atlanır (birincil döngü etkilenmez).
    syncScheduler(task) {
        if (this.schedulerBridge && typeof this.schedulerBridge.syncTask === 'function') {
            Promise.resolve(this.schedulerBridge.syncTask(task)).catch(() => {});
        }
    }

    removeScheduler(taskId) {
        if (this.schedulerBridge && typeof this.schedulerBridge.removeTask === 'function' && taskId) {
            Promise.resolve(this.schedulerBridge.removeTask(taskId)).catch(() => {});
        }
    }

    createTask(taskData) {
        // WBS-1.2: Desteksiz koşul tipi erken reddedilir. Sessiz "Bilinmeyen koşul" akışı yasaktır.
        const conditions = (taskData && taskData.conditionGroup && taskData.conditionGroup.conditions) || [];
        for (const cond of conditions) {
            if (!SUPPORTED_CONDITION_TYPES.has(cond.type)) {
                const err = new Error(`Desteklenmeyen koşul tipi: ${cond.type}`);
                err.code = 'UNSUPPORTED_CONDITION';
                throw err;
            }
        }
        // WP-07.T3: eski `file_stable` klasör görevleri `directory_idle`'a çevrilir.
        // Klasör mtime'ı indirme sırasında sabit kalabildiği için erken kapanma olurdu.
        const normalizedData = taskData && taskData.conditionGroup
            ? {
                ...taskData,
                conditionGroup: {
                    ...taskData.conditionGroup,
                    conditions: conditions.map((cond) => {
                        if (!cond || cond.type !== CONDITION_TYPE.FILE_STABLE || typeof cond.filePath !== 'string') return cond;
                        try {
                            if (fs.statSync(cond.filePath).isDirectory()) {
                                const { filePath, ...rest } = cond;
                                return { ...rest, type: CONDITION_TYPE.DIRECTORY_IDLE, dirPath: filePath };
                            }
                        } catch (_) { /* yol yoksa fail-closed kalır */ }
                        return cond;
                    })
                }
            }
            : taskData;
        const task = new AutomationTask({
            ...normalizedData,
            // ADR-08: gelen `id` ne olursa olsun sunucu yeni kimlik üretir.
            id: AutomationTask.generateId()
        });
        const hasConditions = !!(task.conditionGroup && Array.isArray(task.conditionGroup.conditions) && task.conditionGroup.conditions.length > 0);
        if (hasConditions) {
            // ADR-09 invariant: koşullu görev Windows'a/timer'a çevrilmez.
            // targetTime yalnızca koşulsuz görevlerin alanıdır; yanlışlıkla
            // verilmişse temizlenir ve görev monitoring'de kalır.
            task.trigger.targetTime = null;
            if (task.status === TASK_STATUS.DRAFT || task.status === TASK_STATUS.SCHEDULED) {
                task.status = TASK_STATUS.MONITORING;
            }
        } else if (task.trigger.type === TRIGGER_TYPE.DURATION && task.trigger.durationMs) {
            task.trigger.targetTime = Date.now() + task.trigger.durationMs;
            task.status = TASK_STATUS.SCHEDULED;
        } else if (task.trigger.type === TRIGGER_TYPE.SCHEDULED_TIME && Number.isInteger(task.trigger.targetTime)) {
            // WBS-6.x: Belirli saat görevleri hedef zamanla SCHEDULED başlar.
            // Geçmiş zamanlıysa recovery döngüsü EXPIRED işaretler (otomatik çalışmaz).
            task.status = TASK_STATUS.SCHEDULED;
        }
        this.tasks.push(task);
        this.persistChanges();
        if (this.webhook) this.webhook.triggerEvent('task_created', task);
        this.syncScheduler(task);
        return task;
    }

    /**
     * Kullanıcı iptali. Aktif uyarıyı da çözer; böylece modal açık kalıp
     * arka planda görev çalışmaya devam etmez.
     * @returns {{ok: boolean, code?: string, message?: string}}
     */
    cancelTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return { ok: false, code: 'NOT_FOUND' };
        if (task.status === TASK_STATUS.CANCELLED) return { ok: true, code: 'ALREADY_CANCELLED' };

        const claim = this.claims.get(taskId);
        if (claim) {
            // OS komutu başladıysa geri alınamaz; kullanıcıya açıkça söylenir.
            if (claim.phase === 'executing' && claim.powerStarted) {
                claim.cancelRequested = true;
                if (this.history) {
                    this.history.record(task, EXECUTION_RESULT_CODE.CANCEL_TOO_LATE, 'Güç işlemi başladıktan sonra iptal edilemez');
                }
                if (this.webhook) this.webhook.triggerEvent('task_cancel_too_late', task);
                return { ok: true, code: 'CANCEL_TOO_LATE', message: 'Güç işlemi başladı; iptal uygulanamaz.' };
            }

            claim.cancelRequested = true;
            if (this.warningManager && typeof this.warningManager.cancelActiveWarning === 'function') {
                const active = typeof this.warningManager.getActiveState === 'function'
                    ? this.warningManager.getActiveState()
                    : null;
                if (!active || active.taskId === taskId) {
                    this.warningManager.cancelActiveWarning(taskId);
                }
            }
            this.releaseTask(taskId, claim.token);
        }

        task.status = TASK_STATUS.CANCELLED;
        task.errorInfo = null;
        task.lastResult = { code: EXECUTION_RESULT_CODE.CANCELLED_BY_USER, message: 'Kullanıcı tarafından iptal edildi' };
        if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.CANCELLED_BY_USER, 'Kullanıcı tarafından iptal edildi');
        if (this.webhook) this.webhook.triggerEvent('task_cancelled', task);
        this.removeScheduler(taskId);
        this.persistChanges();
        return { ok: true, code: 'CANCELLED' };
    }

    cancelActiveTask() {
        const active = this.warningManager && typeof this.warningManager.getActiveState === 'function'
            ? this.warningManager.getActiveState()
            : null;
        if (!active || !active.taskId) return { ok: false, code: 'NO_ACTIVE_WARNING' };
        return this.cancelTask(active.taskId);
    }

    /**
     * WP-06.T4 (K-04): erteleme tek yerden uygulanır.
     * - Koşullu görev: targetTime YAZILMAZ; notBefore yazılır, durum monitoring kalır.
     * - Koşulsuz görev: targetTime ileri alınır.
     * - allowed/maxCount sınırları burada uygulanır (H-10 tek kaynak).
     * @returns {{ok: boolean, code?: string, minutes?: number, message?: string}}
     */
    applySnooze(task, minutes = 10) {
        if (!task) return { ok: false, code: 'NOT_FOUND', message: 'Görev bulunamadı.' };
        const cfg = task.snoozeConfig || {};
        if (cfg.allowed === false) {
            return { ok: false, code: 'SNOOZE_NOT_ALLOWED', message: 'Bu görev için erteleme kapalı.' };
        }
        const maxCount = Number.isInteger(cfg.maxCount) ? cfg.maxCount : 3;
        const current = Number(cfg.currentCount) || 0;
        if (current >= maxCount) {
            return { ok: false, code: 'SNOOZE_LIMIT', message: 'Erteleme sınırı aşıldı.' };
        }
        const safeMinutes = Number.isInteger(minutes) ? Math.min(Math.max(minutes, 1), 1440) : 10;
        const conditions = task.conditionGroup && Array.isArray(task.conditionGroup.conditions)
            ? task.conditionGroup.conditions
            : [];
        task.snoozeConfig = { ...cfg, currentCount: current + 1 };
        if (conditions.length > 0) {
            task.trigger.notBefore = Date.now() + safeMinutes * 60000;
            task.trigger.targetTime = null;
            task.status = TASK_STATUS.MONITORING;
        } else {
            const base = Math.max(Number(task.trigger.targetTime) || 0, Date.now());
            task.trigger.targetTime = base + safeMinutes * 60000;
            task.trigger.notBefore = null;
            task.status = TASK_STATUS.SCHEDULED;
        }
        task.updatedAt = new Date().toISOString();
        return { ok: true, minutes: safeMinutes };
    }

    snoozeTask(taskId, minutes = 10) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return { ok: false, code: 'NOT_FOUND' };

        const safeMinutes = Number.isInteger(minutes) ? Math.min(Math.max(minutes, 1), 1440) : 10;
        const claim = this.claims.get(taskId);

        // Sınır kontrolü uyarıyı çözmeden ÖNCE yapılır (T-PAR-05).
        const cfg = task.snoozeConfig || {};
        const conditions = task.conditionGroup && Array.isArray(task.conditionGroup.conditions)
            ? task.conditionGroup.conditions
            : [];
        if (cfg.allowed === false) return { ok: false, code: 'SNOOZE_NOT_ALLOWED', message: 'Erteleme kapalı.' };
        const maxCount = Number.isInteger(cfg.maxCount) ? cfg.maxCount : 3;
        if ((Number(cfg.currentCount) || 0) >= maxCount) {
            return { ok: false, code: 'SNOOZE_LIMIT', message: 'Erteleme sınırı aşıldı.' };
        }

        // Aktif uyarı açıksa önce onu çöz; executeTask sayaç/takvimi işler.
        if (claim && claim.phase === 'warning' && this.warningManager &&
            typeof this.warningManager.snoozeActiveWarning === 'function') {
            this.warningManager.snoozeActiveWarning(safeMinutes, taskId);
            return { ok: true, code: 'SNOOZED_ACTIVE', minutes: safeMinutes };
        }
        if (claim) return { ok: false, code: 'ALREADY_RUNNING' };

        const applied = this.applySnooze(task, safeMinutes);
        if (!applied.ok) return applied;
        if (this.history) this.history.record(task, EXECUTION_RESULT_CODE.SNOOZED_BY_USER, `${applied.minutes} dk ertelendi`);
        if (this.webhook) this.webhook.triggerEvent('task_snoozed', task);
        this.syncScheduler(task);
        this.persistChanges();
        return { ok: true, code: 'SNOOZED', minutes: applied.minutes };
    }

    togglePauseAll() {
        this.pausedAll = !this.pausedAll;
        // WBS-2.2: Kalıcı duraklatma — scheduler yedeği açılışta bunu okur.
        if (this.storage && typeof this.storage.updateSettings === 'function') {
            try { this.storage.updateSettings({ automationPaused: this.pausedAll }); } catch (_) {}
        }
        return this.pausedAll;
    }

    /**
     * WBS-2.2: Scheduler yedeğiyle başlatılan tek-seferlik çalıştırma
     * (uygulama kapalıyken vadesi gelen görev). Normal boru hattından geçer:
     * güvenlik → uyarı → OS. Kalıcı duraklatma açıksa reddedilir.
     * @returns {boolean} çalıştırma başlatıldıysa true
     */
    runTaskNow(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task || task.enabled === false) return false;
        if (this.pausedAll) {
            log.info(`[TaskManager] runTaskNow reddedildi (duraklatılmış): ${taskId}`);
            return false;
        }
        if (task.status === TASK_STATUS.EXPIRED) {
            task.status = TASK_STATUS.SCHEDULED;
            task.trigger.targetTime = Date.now();
            this.persistChanges();
        }
        // Atomik claim: scheduler aynı anda tetiklese bile yalnızca biri kazanır.
        const claim = this.claimTask(taskId, 'scheduler');
        if (!claim.ok) {
            log.info(`[TaskManager] runTaskNow reddedildi (${claim.code}): ${taskId}`);
            return false;
        }
        // WBS-9.4: Scheduler-ateşlemeli görevde uyarı zaman-aşımı devam eder
        // (kullanıcı başında olmayabilir). Geçici bayrak — persist edilmez.
        task._schedulerFired = true;
        Promise.resolve(this.executeTask(task, claim.token)).catch((err) => {
            this.handleExecutionError(task, err);
        });
        return true;
    }

    // WBS-11.1: Zincir — biten görevin sıradaki halkasını süreli görev olarak kurar.
    // Geçersiz halka atlanır (durmaz); kalan zincir yeni göreve taşınır.
    spawnChainLink(task) {
        const remaining = Array.isArray(task.chain) ? task.chain : [];
        if (remaining.length === 0) return null;
        const [next, ...rest] = remaining;
        if (!next || !this.power || typeof this.power.isValidAction !== 'function' || !this.power.isValidAction(next.action)) {
            log.warn(`[TaskManager] zincir halkası atlandı (geçersiz eylem): ${next && next.action}`);
            return null;
        }
        const delayMinutes = Number.isInteger(next.delayMinutes) ? Math.min(Math.max(next.delayMinutes, 1), 43200) : 1;
        try {
            return this.createTask({
                name: `Zincir: ${next.action} (${task.name})`,
                action: next.action,
                source: task.source,
                mode: task.mode,
                safetyPolicy: task.safetyPolicy ? { ...task.safetyPolicy } : undefined,
                warningConfig: task.warningConfig ? { ...task.warningConfig } : undefined,
                snoozeConfig: task.snoozeConfig ? { ...task.snoozeConfig, currentCount: 0 } : undefined,
                trigger: { type: 'duration', durationMs: delayMinutes * 60000 },
                chain: rest
            });
        } catch (err) {
            log.warn(`[TaskManager] zincir kurulamadı: ${err.message}`);
            return null;
        }
    }

    getActiveTasks() {
        return this.tasks.filter(t => t.enabled && (t.status === TASK_STATUS.SCHEDULED || t.status === TASK_STATUS.MONITORING || t.status === TASK_STATUS.WAITING || t.status === TASK_STATUS.WARNING));
    }

    /**
     * WP-04/WP-16: Süreç listesine gerçekten ihtiyaç var mı?
     * MetricCollector bu yüzden yalnızca process_running koşulu varken
     * fastlist/ps-list çağırır; boşta spawn maliyeti sıfırdır.
     */
    hasProcessConditions() {
        return this.tasks.some((task) => {
            if (!task || task.enabled === false) return false;
            const conds = (task.conditionGroup && task.conditionGroup.conditions) || [];
            return conds.some((c) => c && c.type === CONDITION_TYPE.PROCESS_RUNNING);
        });
    }

    /** WP-02: Tanılama/UI için aktif claim özeti (kopya; mutasyon dışarıdan yapılamaz). */
    getClaimState(taskId = null) {
        if (taskId) {
            const c = this.claims.get(taskId);
            return c ? { taskId, ...c } : null;
        }
        return Array.from(this.claims.entries()).map(([id, c]) => ({ taskId: id, ...c }));
    }

    getNextTask() {
        const active = this.getActiveTasks().filter(t => t.trigger.targetTime);
        if (active.length === 0) return null;
        active.sort((a, b) => a.trigger.targetTime - b.trigger.targetTime);
        return active[0];
    }

    _taskSnapshot() {
        const snapshot = new Map();
        for (const task of this.tasks) {
            if (task && task.id) snapshot.set(task.id, JSON.stringify(task.toJSON()));
        }
        return snapshot;
    }

    /**
     * WP-11.T5/P-01: değişen görevleri `saveTask`, silinenleri `deleteTask` ile
     * yazar. Tam liste hiçbir zaman diske yazılmaz.
     */
    persistChanges() {
        const next = this._taskSnapshot();
        const saved = new Map(this._savedTaskState);
        let changed = 0;
        for (const [id, json] of next.entries()) {
            if (saved.get(id) === json) continue;
            const result = this.storage.saveTask(JSON.parse(json));
            if (result !== false) {
                saved.set(id, json);
                changed += 1;
            }
        }
        for (const id of [...saved.keys()]) {
            if (next.has(id)) continue;
            const result = this.storage.deleteTask(id);
            if (result !== false) {
                saved.delete(id);
                changed += 1;
            }
        }
        this._savedTaskState = saved;
        if (changed > 0 && this.changeListener) {
            try { this.changeListener(); } catch (_) { /* dinleyici hatası yutulur */ }
        }
        return changed;
    }
}

module.exports = TaskManager;
