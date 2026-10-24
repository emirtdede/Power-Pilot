/**
 * HistoryService.js
 * Manages privacy-focused task execution history and audit logs.
 */

const log = require('../logger');

class HistoryService {
    constructor(storageService) {
        this.storage = storageService;
    }

    /**
     * Records an event in task history.
     * Ensures strict privacy: NO passwords, tokens, API keys, or raw payloads logged.
     */
    record(task, resultCode, detail = '') {
        const record = {
            id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            taskId: task.id,
            taskName: task.name,
            action: task.action,
            source: task.source,
            timestamp: new Date().toISOString(),
            resultCode: resultCode,
            detail: detail,
            snoozeCount: task.snoozeConfig ? task.snoozeConfig.currentCount : 0
        };

        log.info(`[HistoryService] Logged event [${resultCode}] for task "${task.name}"`);
        this.storage.addHistoryRecord(record);
    }

    getHistory(filter = {}) {
        let list = this.storage.getHistory();
        if (filter.resultCode) {
            list = list.filter(r => r.resultCode === filter.resultCode);
        }
        if (filter.source) {
            list = list.filter(r => r.source === filter.source);
        }
        return list;
    }

    /**
     * Ajan çalıştırma kaydı (F9.5: uçuş-kayıt defteri).
     * Gizlilik: ham kullanıcı cümlesi SAKLANMAZ (niyet özeti + sonuç yeterli).
     */
    recordAgentRun({ agentId, intent = '', outcome = '', msDuration = 0 } = {}) {
        const record = {
            id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            kind: 'agent_run',
            agentId: String(agentId || 'unknown'),
            intent: String(intent).slice(0, 80),
            outcome: String(outcome).slice(0, 40),
            msDuration: Number.isFinite(msDuration) ? Math.floor(msDuration) : 0,
            timestamp: new Date().toISOString()
        };
        log.info(`[HistoryService] Ajan olayı [${record.agentId}:${record.outcome}]`);
        this.storage.addHistoryRecord(record);
    }

    clear() {
        this.storage.clearHistory();
    }
}

module.exports = HistoryService;
