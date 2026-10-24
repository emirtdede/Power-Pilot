/**
 * AutomationTask.js
 * Core Domain Model for Power Pilot Automation Tasks.
 */

const { POWER_ACTIONS } = require('../PowerService');
const crypto = require('crypto');

const TASK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const TASK_STATUS = {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    MONITORING: 'monitoring',
    WAITING: 'waiting',
    WARNING: 'warning',
    SNOOZED: 'snoozed',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    BLOCKED: 'blocked',
    FAILED: 'failed',
    DISABLED: 'disabled',
    EXPIRED: 'expired'
};

const TASK_SOURCE = {
    UI: 'user_interface',
    LOCAL_API: 'local_api',
    N8N: 'n8n',
    CLI: 'cli',
    TEMPLATE: 'imported_template',
    RECURRING: 'recurring_schedule',
    SYSTEM_RECOVERY: 'system_recovery',
    CONSOLE: 'console' // FAZ B: şirket konsolundan gelen politika emri
};

const TRIGGER_TYPE = {
    DURATION: 'duration',                 // After X duration
    SCHEDULED_TIME: 'scheduled_time',     // At specific date and time
    RECURRING: 'recurring',               // Cron / Recurrence rule
    PROCESS_CLOSE: 'process_close',       // Process terminated
    CPU_THRESHOLD: 'cpu_threshold',       // CPU usage below threshold
    NETWORK_THRESHOLD: 'network_threshold', // Net speed below threshold
    DISK_THRESHOLD: 'disk_threshold',     // Disk activity below threshold
    FILE_EVENT: 'file_event',             // File created/deleted/stabilized
    DIRECTORY_EVENT: 'directory_event',   // Directory changed/idle
    USER_IDLE: 'user_idle',               // User input idle
    BATTERY_EVENT: 'battery_event',       // Battery/power source status
    API_CALL: 'api_call',                 // Direct trigger via Local API / Webhook
    COMPOSITE: 'composite'                // Multi-condition AND/OR
};

const CONDITION_TYPE = {
    PROCESS_RUNNING: 'process_running',
    CPU_USAGE: 'cpu_usage',
    NETWORK_SPEED: 'network_speed',
    DISK_ACTIVITY: 'disk_activity',
    FILE_EXISTS: 'file_exists',
    FILE_STABLE: 'file_stable',
    FILE_SIZE: 'file_size',
    DIRECTORY_IDLE: 'directory_idle',
    USER_IDLE: 'user_idle',
    POWER_SOURCE: 'power_source',
    BATTERY_LEVEL: 'battery_level'
};

const LOGIC_OPERATOR = {
    AND: 'AND',
    OR: 'OR'
};

// SmartFinishEngine tarafından gerçekten karşılanan koşul tipleri.
// Desteklenmeyen tipler createTask'ta reddedilir (sessiz geçiş yok).
const SUPPORTED_CONDITION_TYPES = new Set([
    CONDITION_TYPE.PROCESS_RUNNING,
    CONDITION_TYPE.CPU_USAGE,
    CONDITION_TYPE.USER_IDLE,
    CONDITION_TYPE.FILE_STABLE,
    CONDITION_TYPE.DIRECTORY_IDLE,
    CONDITION_TYPE.NETWORK_SPEED,
    CONDITION_TYPE.DISK_ACTIVITY,
    CONDITION_TYPE.BATTERY_LEVEL
]);

const EXECUTION_RESULT_CODE = {
    SUCCESS: 'success',
    CANCELLED_BY_USER: 'cancelled_by_user',
    SNOOZED_BY_USER: 'snoozed_by_user',
    BLOCKED_BY_POLICY: 'blocked_by_policy',
    CONDITION_INVALID: 'condition_invalid',
    OS_EXECUTION_FAILED: 'os_execution_failed',
    AUTHORIZATION_ERROR: 'authorization_error',
    TIMEOUT: 'timeout',
    INTERRUPTED_BY_SHUTDOWN: 'interrupted_by_shutdown',
    // WP-02: OS komutu başladıktan sonra gelen iptal isteği.
    CANCEL_TOO_LATE: 'cancel_too_late'
};

class AutomationTask {
    /** ADR-08: kimlik sunucuda üretilir; istemci girdisi kullanılmaz. */
    static generateId(nowMs = Date.now()) {
        return `task_${nowMs.toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    }

    static isValidId(id) {
        return typeof id === 'string' && TASK_ID_RE.test(id);
    }

    constructor(data = {}) {
        this.id = data.id || AutomationTask.generateId();
        this.name = data.name || 'Yeni Otomasyon';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.status = data.status || TASK_STATUS.DRAFT;
        this.action = data.action || POWER_ACTIONS.SHUTDOWN;
        this.enabled = typeof data.enabled === 'boolean' ? data.enabled : true;

        // Source tracking
        this.source = data.source || TASK_SOURCE.UI;

        // FAZ B: konsol politikası izlenebilirliği (yerel görevlerde null).
        this.policyId = typeof data.policyId === 'string' ? data.policyId.slice(0, 64) : null;
        this.consoleOrderId = typeof data.consoleOrderId === 'string' ? data.consoleOrderId.slice(0, 64) : null;
        // FAZ D: bakım-penceresi gerektiren görev bayrağı (konsol vurur, motor okur).
        this.requiresMaintenanceWindow = data.requiresMaintenanceWindow === true;

        // Autonomy mode stamp (P0-1: kuruluş anında vurulur, executeTask yalnızca okur).
        // 'classic' = onaylı akış, 'full' = tam yetki akışı.
        this.mode = data.mode === 'full' ? 'full' : 'classic';

        // Trigger Configuration
        this.trigger = data.trigger || {
            type: TRIGGER_TYPE.DURATION,
            durationMs: 3600000,
            targetTime: null
        };
        // ADR-09 / K-04: koşullu görevlerde erteleme targetTime'a DEĞİL notBefore'a
        // yazılır. targetTime yalnızca koşulsuz zamanlayıcı görevlerinde kullanılır.
        if (this.trigger && this.trigger.notBefore === undefined) this.trigger.notBefore = null;
        // L-01: koşul motorunun son ilerleme mesajı kalıcıdır (UI'da gösterilir).
        this.lastProgressMessage = typeof data.lastProgressMessage === 'string'
            ? data.lastProgressMessage.slice(0, 240)
            : null;

        // Condition Group (AND/OR)
        this.conditionGroup = data.conditionGroup || {
            operator: LOGIC_OPERATOR.AND,
            conditions: []
        };

        // Safety Policy settings
        this.safetyPolicy = data.safetyPolicy || {
            checkUserActivity: true,
            checkProtectedApps: true,
            checkFullscreen: true,
            checkSystemLoad: true,
            forceCloseApps: false,
            remoteApprovalRequired: false
        };

        // Warning Modal Settings
        this.warningConfig = data.warningConfig || {
            enabled: true,
            durationSeconds: 30, // Default 30s warning
            silentMode: false
        };

        // Snooze Settings
        this.snoozeConfig = data.snoozeConfig || {
            allowed: true,
            maxCount: 3,
            currentCount: 0,
            durationMinutes: 10
        };

        // Recurrence Settings
        this.recurrence = data.recurrence || {
            enabled: false,
            frequency: 'none', // daily, weekly, weekdays, weekends, custom
            daysOfWeek: [], // [1,2,3,4,5]
            timeOfDay: '00:00'
        };

        // WBS-11.1: Zincir — bu görev bitince sırayla kurulacak halkalar.
        // [{action, delayMinutes}] en fazla 5 halka; kalıcıdır (toJSON).
        this.chain = Array.isArray(data.chain)
            ? data.chain.slice(0, 5).map(link => ({
                action: link.action,
                delayMinutes: link.delayMinutes
            }))
            : [];

        // Execution History & Results
        this.lastRunAt = data.lastRunAt || null;
        this.lastResult = data.lastResult || null; // { code, message, timestamp }
        this.errorInfo = data.errorInfo || null;
    }

    /**
     * Converts a simple legacy duration timer into an AutomationTask
     */
    static fromLegacyTimer(action, durationMs) {
        return new AutomationTask({
            name: `Hızlı Zamanlayıcı (${action})`,
            action: action,
            status: TASK_STATUS.SCHEDULED,
            source: TASK_SOURCE.UI,
            trigger: {
                type: TRIGGER_TYPE.DURATION,
                durationMs: durationMs,
                targetTime: Date.now() + durationMs
            },
            warningConfig: {
                enabled: true,
                durationSeconds: 30,
                silentMode: false
            }
        });
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            status: this.status,
            action: this.action,
            enabled: this.enabled,
            source: this.source,
            mode: this.mode,
            policyId: this.policyId,
            consoleOrderId: this.consoleOrderId,
            requiresMaintenanceWindow: this.requiresMaintenanceWindow === true,
            trigger: this.trigger,
            conditionGroup: this.conditionGroup,
            lastProgressMessage: this.lastProgressMessage,
            safetyPolicy: this.safetyPolicy,
            warningConfig: this.warningConfig,
            snoozeConfig: this.snoozeConfig,
            recurrence: this.recurrence,
            chain: this.chain,
            lastRunAt: this.lastRunAt,
            lastResult: this.lastResult,
            errorInfo: this.errorInfo
        };
    }
}

module.exports = {
    AutomationTask,
    TASK_STATUS,
    TASK_SOURCE,
    TRIGGER_TYPE,
    CONDITION_TYPE,
    LOGIC_OPERATOR,
    EXECUTION_RESULT_CODE,
    SUPPORTED_CONDITION_TYPES
};
