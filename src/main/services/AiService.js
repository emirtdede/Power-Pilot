/**
 * AiService.js — WBS-7.3
 * Doğal dil → görev önerisi ayrıştırıcısı (deterministik parametrelerle).
 *
 * Güvenlik modeli:
 * - Model SADECE JSON öneri üretir; OS çağrısı yapamaz, görev kuramaz.
 * - Çıktı önce JSON-şema dayatmasıyla (grammar), sonra validateTaskData ile
 *   çift kapıdan geçer. Geçemeyen çıktı kullanıcıya gösterilmez.
 * - Ayrıştırma deterministik parametrelerle yapılır (temperature 0,
 *   max-tokens 256) — küçük-model varyansı ana hata kaynağı olduğundan.
 * - Eksik/bozuk her durumda needsClarification döner (tek net soru);
 *   asla fırlatmaz, asla tahmin yürütmez.
 */

const log = require('../logger');
const { POWER_ACTIONS } = require('./PowerService');
const { SUPPORTED_CONDITION_TYPES } = require('./models/AutomationTask');
const { validateTaskData } = require('../ipc/validate');
const DeterministicParser = require('./DeterministicParser');
const { guardProposal } = require('./NegationGuard');

const PARSE_TEMPERATURE = 0;
const PARSE_MAX_TOKENS = 256;

const PARSE_SCHEMA = {
    type: 'object',
    properties: {
        action: { enum: ['shutdown', 'restart', 'sleep', 'hibernate', 'lock', 'signout'] },
        kind: { enum: ['duration', 'scheduled_time', 'condition'] },
        durationMs: { type: 'integer' },
        targetTime: { type: 'integer' },
        // K1b: koşul nesnesi şemalı — boş `{}` üretimini kapatır (canlı kanıtlı
        // model zaafı). Desteklenen türler motorun kabul listesiyle birebirdir.
        condition: {
            type: 'object',
            properties: {
                type: { enum: ['process_running', 'cpu_usage', 'user_idle', 'file_stable', 'network_speed', 'disk_activity', 'battery_level'] },
                processName: { type: 'string' },
                triggerOnClose: { type: 'boolean' },
                thresholdKbps: { type: 'integer' },
                thresholdPercent: { type: 'integer' },
                belowPercent: { type: 'integer' },
                idleSeconds: { type: 'integer' },
                filePath: { type: 'string' },
                stableSeconds: { type: 'integer' }
            },
            required: ['type'],
            additionalProperties: false
        },
        missing: { type: 'array', items: { type: 'string' } },
        question: { type: 'string' }
    },
    required: ['action', 'kind'],
    additionalProperties: false
};

// K1b: Gramer DARALTILMIŞ şemadan üretilir — model taahhüt etmek zorundadır
// (missing/question kaçış kapısı gramerde YOK). Gerekçe: küçük model kaçış
// yolunu kötüye kullanıyordu (canlı kanıt). Yanlış taahhüt riski, öneri
// kartındaki Kur/Düzenle/Vazgeç insan onayıyla karşılanır; buildProposal'daki
// missing dalı deterministik yol + geriye uyumluluk için korunur.
const GRAMMAR_SCHEMA = (() => {
    const { missing: _m, question: _q, ...rest } = PARSE_SCHEMA.properties;
    void _m; void _q;
    return { ...PARSE_SCHEMA, properties: rest };
})();

const SYSTEM_PROMPT = [
    'Sen Power Pilot görev ayrıştırıcısısın. SADECE JSON üret, başka metin yazma, açıklama ekleme.',
    'Geçerli eylemler: shutdown, restart, sleep, hibernate, lock, signout.',
    'kind alanına göre gerekli alan: duration→durationMs (milisaniye tamsayı),',
    'scheduled_time→targetTime (epoch ms tamsayı, geçmiş olmamalı),',
    'condition→condition nesnesi {type, ...}.',
    'Süre hesabı: "10 dakika" = 600000, "2 saat" = 7200000, "yarım saat" = 1800000.',
    'Her zaman EN OLASI yorumu seç ve eksiksiz üret; kullanıcı öneri kartında onaylar/düzeltir.',
    'Örnek 1: "2 saat sonra kapat" → {"action":"shutdown","kind":"duration","durationMs":7200000}.',
    'Örnek 2: "10 dakika sonra kilitle" → {"action":"lock","kind":"duration","durationMs":600000}.',
    'Örnek 3: "indirme bitince kapat" → {"action":"shutdown","kind":"condition","condition":{"type":"network_speed","thresholdKbps":50}}.',
    'Örnek 4: "süre yok" → {"action":"shutdown","kind":"duration","missing":["durationMs"],"question":"Süre ne kadar olsun? (örn. 2 saat)"}.'
].join(' ');

const CLARIFY_QUESTIONS = {
    durationMs: 'Süre ne kadar olsun? (örn. 2 saat)',
    targetTime: 'Saat kaçta çalışsın? (örn. 23:00)',
    condition: 'Hangi koşulda çalışsın? (örn. indirme bitince)'
};

class AiService {
    // completer(prompt, {schema, temperature, maxTokens}) → string.
    // Üretimde varsayılan; testlerde sahte verilir.
    constructor({ backend, completer = null } = {}) {
        this.backend = backend;
        this.completer = completer || this.defaultCompleter.bind(this);
    }

    async defaultCompleter(prompt, { schema, temperature, maxTokens }) {
        const status = this.backend.getStatus();
        if (!status.loaded) throw new Error('AI_NOT_READY');
        // K1: v3 API'sinde ham sequence'te prompt()/completion() yoktur.
        // Tek desteklenen yol: LlamaChatSession.completePrompt (şema grameri dahil).
        if (typeof this.backend.createSession !== 'function') {
            throw new Error('COMPLETER_UNSUPPORTED');
        }
        const session = await this.backend.createSession(SYSTEM_PROMPT);
        try {
            const llama = await this.backend.ensureLlama();
            let grammar = undefined;
            try {
                if (llama && typeof llama.createGrammarForJsonSchema === 'function') {
                    grammar = await llama.createGrammarForJsonSchema(schema);
                }
            } catch (_) {
                grammar = undefined; // Şema-sonrası doğrulama zaten var (çift kapı).
            }
            if (!session || typeof session.completePrompt !== 'function') {
                throw new Error('COMPLETER_UNSUPPORTED');
            }
            const res = await session.completePrompt(prompt, { grammar, temperature, maxTokens });
            return typeof res === 'string' ? res : String(res && res.text !== undefined ? res.text : res);
        } finally {
            if (typeof this.backend.disposeSession === 'function') {
                try { await this.backend.disposeSession(session); } catch (_) {}
            }
        }
    }

    clarify(missingFields) {
        const fields = (missingFields || []).filter(Boolean);
        const first = fields[0];
        return {
            ok: true,
            needsClarification: {
                missingFields: fields.length > 0 ? fields : ['unknown'],
                question: (first && CLARIFY_QUESTIONS[first]) || 'Biraz daha ayrıntı verir misiniz? (eylem + süre/koşul)'
            }
        };
    }

    // Saf eşleme: ayrıştırılmış nesne → öneri veya netleştirme. Test edilebilir çekirdek.
    buildProposal(parsed) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return this.clarify([]);
        }
        const actions = Object.values(POWER_ACTIONS);
        if (!actions.includes(parsed.action)) {
            return this.clarify([]);
        }
        if (Array.isArray(parsed.missing) && parsed.missing.length > 0) {
            return {
                ok: true,
                needsClarification: {
                    missingFields: parsed.missing,
                    question: parsed.question || 'Eksik bilgiyi tamamlar mısınız?'
                }
            };
        }
        const base = { name: '', action: parsed.action, source: 'ai_assistant' };
        if (parsed.kind === 'duration') {
            if (!Number.isInteger(parsed.durationMs) || parsed.durationMs <= 0 || parsed.durationMs > 2500000000) {
                return this.clarify(['durationMs']);
            }
            base.name = `AI: ${parsed.action} (${Math.round(parsed.durationMs / 60000)} dk)`;
            base.trigger = { type: 'duration', durationMs: parsed.durationMs };
        } else if (parsed.kind === 'scheduled_time') {
            if (!Number.isInteger(parsed.targetTime) || parsed.targetTime <= Date.now()) {
                return this.clarify(['targetTime']);
            }
            base.name = `AI: ${parsed.action} @ ${new Date(parsed.targetTime).toLocaleTimeString()}`;
            base.trigger = { type: 'scheduled_time', targetTime: parsed.targetTime };
        } else if (parsed.kind === 'condition') {
            if (!parsed.condition || typeof parsed.condition !== 'object') {
                return this.clarify(['condition']);
            }
            // Desteklenmeyen koşul en başta elenir (createTask'a bırakılmaz).
            if (!SUPPORTED_CONDITION_TYPES.has(parsed.condition.type)) {
                return this.clarify(['condition']);
            }
            base.name = `AI Smart Finish (${parsed.action})`;
            base.conditionGroup = { operator: 'AND', stabilitySeconds: 15, conditions: [parsed.condition] };
        } else {
            return this.clarify([]);
        }

        // İkinci kapı: mevcut görev doğrulaması.
        const check = validateTaskData(base);
        if (!check.ok) {
            log.warn(`[AiService] öneri doğrulamadan geçemedi: ${check.error}`);
            return this.clarify([]);
        }
        return { ok: true, proposal: base };
    }

    async parseCommand(text) {
        const input = String(text == null ? '' : text).trim();
        if (!input) {
            return { ok: false, code: 'EMPTY', message: 'Boş komut.' };
        }
        // WP-06.T2 (K-03): olumsuz cümlede yıkıcı eylem önerilmez. Bu kapı
        // deterministik yol ve LLM yolu için ortaktır (AI bypass'i kapalı).
        const negated = guardProposal(input, { action: 'shutdown' });
        if (!negated.ok) {
            return {
                ok: false,
                code: 'NEGATED_INTENT',
                message: 'Cümlede olumsuzluk var; kapatma/uyutma önerilmedi. Kapatmayı mı istiyorsunuz?',
                needsClarification: {
                    missingFields: ['action'],
                    question: 'Kapatmayı mı istiyorsunuz, kapatmamayı mı? Lütfen netleştirin.'
                }
            };
        }
        // K1b: Önce deterministik çözümleyici (LLM'siz, modelsiz çalışır).
        // Küçük model milisaniye hesabını tutturamıyor; kurallar kesin sonuç verir.
        // Koşul cümleleri null döner → LLM yoluna düşer.
        let det = null;
        try {
            det = DeterministicParser.parse(input);
        } catch (_) {
            det = null;
        }
        if (det) {
            // Eksik-alan cetveli doğru Türkçe soruyla sorulur (model sorusu beklenmez).
            if (Array.isArray(det.missing) && det.missing.length > 0 && !det.question) {
                return this.clarify(det.missing);
            }
            return this.buildProposal(det);
        }
        const status = this.backend.getStatus();
        if (!status.loaded) {
            return { ok: false, code: 'AI_NOT_READY', message: status.message || 'AI hazır değil.', status };
        }
        let raw;
        try {
            raw = await this.completer(`Kullanıcı: ${input}\nJSON:`, {
                schema: GRAMMAR_SCHEMA,
                temperature: PARSE_TEMPERATURE,
                maxTokens: PARSE_MAX_TOKENS
            });
        } catch (err) {
            log.warn(`[AiService] çıkarım hatası: ${err && err.message}`);
            return { ok: false, code: 'AI_ERROR', message: 'AI yanıt veremedi.' };
        }
        let parsed = null;
        try {
            const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (_) {
            parsed = null;
        }
        return this.buildProposal(parsed);
    }
}

module.exports = { AiService, PARSE_SCHEMA, GRAMMAR_SCHEMA, SYSTEM_PROMPT, PARSE_TEMPERATURE, PARSE_MAX_TOKENS };
