/**
 * AgentOrchestrator.js — F9.1
 * Deterministik yönlendirici + tek-uçuş kuyruğu + susturma + denetim.
 *
 * Tasarım notu (kanıta dayalı): kural-öncelikli yönlendirme kullanılır;
 * eşleşme yoksa güvenli varsayılan `command` ajanına düşülür (ayrıştırıcı
 * zaten netleştirme sorar). LLM-tabanlı yönlendirici bilerek YOKTUR —
 * küçük modelde yönlendirme hatası sessiz yanlış-ajana gider ve test
 * edilemez; kurallar %100 deterministiktir.
 */

const commandAgent = require('./agents/commandAgent');
const diagnoseAgent = require('./agents/diagnoseAgent');
const energyAgent = require('./agents/energyAgent');
const recommenderAgent = require('./agents/recommenderAgent');
const { guardProposal } = require('./NegationGuard');

const AGENT_MANIFESTS = [
    { id: 'command', version: '1.0.0', cost: 'llm' },
    { id: 'diagnose', version: '1.0.0', cost: 'free' },
    { id: 'energy', version: '1.0.0', cost: 'free' },
    { id: 'recommender', version: '1.0.0', cost: 'free' }
];

const AGENTS = { command: commandAgent, diagnose: diagnoseAgent, energy: energyAgent, recommender: recommenderAgent };

// WP-10.T7 / T-CSP-06: AI komutları dakikada en fazla 10 kez çalıştırılır.
const AI_RATE_WINDOW_MS = 60000;
const AI_RATE_MAX = 10;

const ROUTE_RULES = [
    { agentId: 'diagnose', re: /neden|niçin|nedir.*olmad|açıkla|sebep/i },
    { agentId: 'energy', re: /tasarruf|enerji|fatura|kwh|tüketim|ne kadar/i },
    { agentId: 'recommender', re: /öner|tavsiye|kural önersene|ne yapsam/i }
];

class AgentOrchestrator {
    constructor({ aiService = null, storage = null, history = null } = {}) {
        this.aiService = aiService;
        this.storage = storage;
        this.history = history;
        this.busy = false;
        this.commandStarts = [];
    }

    static manifests() {
        return AGENT_MANIFESTS.map((m) => ({ ...m }));
    }

    // Saf yönlendirme: metin → ajan id (kural, yoksa güvenli varsayılan).
    static route(text) {
        const input = String(text || '');
        for (const rule of ROUTE_RULES) {
            if (rule.re.test(input)) return { agentId: rule.agentId, confidence: 1 };
        }
        return { agentId: 'command', confidence: 1 };
    }

    getSettings() {
        try {
            return (this.storage && typeof this.storage.getSettings === 'function')
                ? this.storage.getSettings() || {}
                : {};
        } catch (_) {
            return {};
        }
    }

    isSilenced() {
        const s = this.getSettings();
        return typeof s.aiSilencedUntil === 'number' && s.aiSilencedUntil > Date.now();
    }

    audit(agentId, intent, outcome, msDuration) {
        if (this.history && typeof this.history.recordAgentRun === 'function') {
            try {
                this.history.recordAgentRun({ agentId, intent, outcome, msDuration });
            } catch (_) {}
        }
    }

    async runCommand(text) {
        if (this.isSilenced()) {
            return { ok: false, code: 'AI_SILENCED', message: 'AI susturuldu.' };
        }
        if (this.busy) {
            return { ok: false, code: 'BUSY', message: 'AI meşgul, birazdan tekrar deneyin.' };
        }
        const now = Date.now();
        this.commandStarts = this.commandStarts.filter((startedAt) => now - startedAt < AI_RATE_WINDOW_MS);
        if (this.commandStarts.length >= AI_RATE_MAX) {
            this.audit('command', String(text).slice(0, 80), 'rate_limited', 0);
            return { ok: false, code: 'RATE_LIMITED', message: 'AI komut sınırı aşıldı, bir dakika sonra tekrar deneyin.' };
        }
        this.commandStarts.push(now);
        this.busy = true;
        const started = Date.now();
        try {
            const res = await AGENTS.command.execute({ text, aiService: this.aiService });
            // WP-06.T2: AI çıktısı da olumsuzluk kapısından geçer.
            const proposal = res && (res.proposal || (res.action ? res : null));
            const guard = guardProposal(text, proposal);
            if (!guard.ok) {
                this.audit('command', String(text).slice(0, 80), guard.code, Date.now() - started);
                return { ok: false, code: guard.code, message: guard.error };
            }
            this.audit('command', String(text).slice(0, 80), res.ok ? 'ok' : (res.code || 'fail'), Date.now() - started);
            return res;
        } finally {
            this.busy = false;
        }
    }

    async runDiagnose(reason) {
        const started = Date.now();
        const res = await AGENTS.diagnose.execute({ reason });
        this.audit('diagnose', String(reason || '').slice(0, 80), 'ok', Date.now() - started);
        return res;
    }

    async runEnergy(stats) {
        const started = Date.now();
        const res = await AGENTS.energy.execute({ stats });
        this.audit('energy', 'stats-summary', 'ok', Date.now() - started);
        return res;
    }

    async runSuggest(historyList) {
        if (this.isSilenced()) {
            return { ok: true, suggestion: null, reason: 'SILENCED' };
        }
        const started = Date.now();
        const res = await AGENTS.recommender.execute({
            history: historyList,
            settings: this.getSettings(),
            now: Date.now()
        });
        // WBS-9.3: Haftalık tavan teklif ANINDA işler (görüntülenmese bile hak yenilenmez).
        if (res.suggestion && this.storage && typeof this.storage.updateSettings === 'function') {
            try { this.storage.updateSettings({ aiAdvisorLastAt: Date.now() }); } catch (_) {}
        }
        this.audit('recommender', 'weekly-scan', res.suggestion ? 'suggested' : (res.reason || 'none'), Date.now() - started);
        return res;
    }

    // WBS-9.3: Reddedilen konu 30 gün susturulur.
    dismissTopic(topic) {
        if (!topic || !this.storage || typeof this.storage.updateSettings !== 'function') return false;
        try {
            const current = this.getSettings().aiDismissed || {};
            current[String(topic).slice(0, 40)] = Date.now();
            this.storage.updateSettings({ aiDismissed: current });
            return true;
        } catch (_) {
            return false;
        }
    }
}

module.exports = { AgentOrchestrator, AGENTS, AGENT_MANIFESTS };
