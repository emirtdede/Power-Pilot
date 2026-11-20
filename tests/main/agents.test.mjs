/**
 * agents.test.mjs — F9.1 / TS-9.1
 * Orkestratör yönlendirme + 4 ajan + susturma + kuyruk + denetim.
 * LLM teması yok (sahte AiService) — tam deterministik.
 */
import { describe, it, expect, vi } from 'vitest';
import { AgentOrchestrator, AGENT_MANIFESTS } from '../../src/main/services/AgentOrchestrator.js';

function makeOrchestrator(overrides = {}) {
    const storage = {
        getSettings: () => ({}),
        ...(overrides.storage || {})
    };
    const history = {
        recordAgentRun: vi.fn(),
        ...(overrides.history || {})
    };
    const aiService = {
        parseCommand: vi.fn(async (text) => ({ ok: true, proposal: { action: 'sleep', text } })),
        ...(overrides.aiService || {})
    };
    return { orch: new AgentOrchestrator({ aiService, storage, history }), storage, history, aiService };
}

describe('AgentOrchestrator yönlendirme (TS-9.1 + WP-8)', () => {
    it('manifest 7 ajanı listeler', () => {
        const ids = AgentOrchestrator.manifests().map((m) => m.id).sort();
        expect(ids).toEqual(['command', 'connection', 'diagnose', 'docs_qa', 'energy', 'recommender', 'template']);
        expect(AGENT_MANIFESTS).toHaveLength(7);
    });

    it('niyetler doğru ajana gider', () => {
        expect(AgentOrchestrator.route('neden kapanmadı?').agentId).toBe('diagnose');
        expect(AgentOrchestrator.route('bu ay ne kadar tasarruf ettim').agentId).toBe('energy');
        expect(AgentOrchestrator.route('bana kural öner').agentId).toBe('recommender');
        expect(AgentOrchestrator.route('render bitince kapatan şablon oluştur').agentId).toBe('template');
        expect(AgentOrchestrator.route('REST API 18456 portunu aç').agentId).toBe('connection');
        expect(AgentOrchestrator.route('Smart Finish koşulları nasıl çalışır?').agentId).toBe('docs_qa');
    });

    it('runAssistant LLM yokken doküman sorusunu yerel Docs RAG ile yanıtlar', async () => {
        const { orch } = makeOrchestrator({
            aiService: { parseCommand: vi.fn(async () => ({ ok: false, code: 'AI_NOT_READY' })) }
        });
        const res = await orch.runAssistant('MCP sunucusu nasıl bağlanır?', { language: 'tr' });
        expect(res.ok).toBe(true);
        expect(res.kind).toBe('docs_answer');
        expect(res.citations.length).toBeGreaterThan(0);
    });

    it('eşleşme yoksa güvenli varsayılan command', () => {
        expect(AgentOrchestrator.route('2 saat sonra kapat').agentId).toBe('command');
        expect(AgentOrchestrator.route('').agentId).toBe('command');
        expect(AgentOrchestrator.route(null).agentId).toBe('command');
    });
});

describe('AgentOrchestrator çalıştırma (TS-9.1)', () => {
    it('runCommand ayrıştırıcıya devreder + denetim kaydı düşer', async () => {
        const { orch, history, aiService } = makeOrchestrator();
        const r = await orch.runCommand('2 saat sonra kapat');
        expect(r.ok).toBe(true);
        expect(aiService.parseCommand).toHaveBeenCalledWith('2 saat sonra kapat');
        expect(history.recordAgentRun).toHaveBeenCalledTimes(1);
        const rec = history.recordAgentRun.mock.calls[0][0];
        expect(rec.agentId).toBe('command');
        expect(rec.intent.length).toBeLessThanOrEqual(80);
    });

    it('meşgulken ikinci komut BUSY döner', async () => {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const { orch } = makeOrchestrator({
            aiService: { parseCommand: vi.fn(() => gate) }
        });
        const first = orch.runCommand('kapat');
        const second = await orch.runCommand('uyut');
        expect(second).toMatchObject({ ok: false, code: 'BUSY' });
        release({ ok: true });
        await first;
    });

    it('susturulmuşken komut çalışmaz (AI_SILENCED)', async () => {
        const { orch, aiService } = makeOrchestrator({
            storage: { getSettings: () => ({ aiSilencedUntil: Date.now() + 3600000 }) }
        });
        expect(await orch.runCommand('kapat')).toMatchObject({ ok: false, code: 'AI_SILENCED' });
        expect(aiService.parseCommand).not.toHaveBeenCalled();
    });

    it('T-CSP-06: dakikada 10 AI komutundan sonra RATE_LIMITED, pencere dolunca tekrar çalışır', async () => {
        let now = 1_700_000_000_000;
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
        try {
            const { orch, aiService } = makeOrchestrator();
            for (let i = 0; i < 10; i += 1) {
                expect(await orch.runCommand(`kapat ${i}`)).toMatchObject({ ok: true });
            }
            expect(await orch.runCommand('kapat 11')).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
            expect(aiService.parseCommand).toHaveBeenCalledTimes(10);

            now += 60001;
            expect(await orch.runCommand('kapat 12')).toMatchObject({ ok: true });
        } finally {
            clock.mockRestore();
        }
    });

    it('runDiagnose korunan-uygulama gerekçesini çevirir', async () => {
        const { orch } = makeOrchestrator();
        const r = await orch.runDiagnose('Korunan uygulama(lar) çalışıyor: code.exe');
        expect(r.ok).toBe(true);
        expect(r.explanation).toMatch(/code\.exe/);
        expect(r.whatToDo).toBeDefined();
    });

    it('runEnergy sayıları cümleye döker + eşik üstü önerir', async () => {
        const { orch } = makeOrchestrator();
        const r = await orch.runEnergy({
            enabled: true, preventedUptimeHours: '6.0', costSavedFormatted: '2.25 TL'
        });
        expect(r.summary).toContain('6.0');
        expect(r.summary).toContain('2.25 TL');
        expect(r.suggestion.templateId).toBe('tpl_nightly_sleep');
    });

    it('runEnergy düşük tasarrufta önermez', async () => {
        const { orch } = makeOrchestrator();
        const r = await orch.runEnergy({ enabled: true, preventedUptimeHours: '1.0', costSavedFormatted: '0.38 TL' });
        expect(r.suggestion).toBeNull();
    });
    it('runEnergy istatistik kapalıyken kısa devre', async () => {
        const { orch } = makeOrchestrator();
        const r = await orch.runEnergy({ enabled: false });
        expect(r.suggestion).toBeNull();
    });

    it('runEnergy eksik veride sayı uydurmaz (WBS-E7)', async () => {
        const { orch } = makeOrchestrator();
        const r = await orch.runEnergy({ enabled: true, preventedUptimeHours: '5.0', kwhSaved: null, costSavedFormatted: null });
        expect(r.summary).toContain('5.0');
        expect(r.summary).not.toContain('kWh');
        expect(r.summary).not.toContain('null');
        expect(r.suggestion.templateId).toBe('tpl_nightly_sleep');
        const r2 = await orch.runEnergy({ enabled: true, preventedUptimeHours: '5.0', kwhSaved: '1.88', costSavedFormatted: null });
        expect(r2.summary).toContain('1.88');
    });
});

function freezeTime(ts) {
    const RealDate = globalThis.Date;
    const mockDate = function (...args) {
        return args.length === 0 ? new RealDate(ts) : new RealDate(...args);
    };
    mockDate.now = () => ts;
    mockDate.parse = RealDate.parse;
    mockDate.UTC = RealDate.UTC;
    vi.stubGlobal('Date', mockDate);
}

describe('recommender sessizlik kuralları (TS-9.1)', () => {
    function nightlies(n, baseTs) {
        const list = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(baseTs - i * 86400000);
            d.setHours(2, 10, 0, 0);
            list.push({ resultCode: 'success', action: 'shutdown', timestamp: d.toISOString() });
        }
        return list;
    }

    it('7 günde 3+ gece kapatması → teklif', async () => {
        // Salı öğlen dondurulur (sessiz saat + tavan dışı, flake yok).
        const tuesdayNoon = new Date(2026, 9, 13, 12, 0).getTime();
        freezeTime(tuesdayNoon);
        try {
            const { orch } = makeOrchestrator();
            const r = await orch.runSuggest(nightlies(3, tuesdayNoon));
            expect(r.suggestion).not.toBeNull();
            expect(r.suggestion.topic).toBe('nightly');
            expect(r.suggestion.text).toContain('3');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('desen yoksa teklif yok (NO_PATTERN)', async () => {
        const tuesdayNoon = new Date(2026, 9, 13, 12, 0).getTime();
        freezeTime(tuesdayNoon);
        try {
            const { orch } = makeOrchestrator();
            const r = await orch.runSuggest([{ resultCode: 'success', action: 'lock', timestamp: new Date(tuesdayNoon).toISOString() }]);
            expect(r.suggestion).toBeNull();
            expect(r.reason).toBe('NO_PATTERN');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('gece 23:00 teklif üretilmez (QUIET_HOURS)', async () => {
        const night = new Date(2026, 9, 13, 23, 0).getTime();
        freezeTime(night);
        try {
            const { orch } = makeOrchestrator();
            const r = await orch.runSuggest(nightlies(5, night));
            expect(r.suggestion).toBeNull();
            expect(r.reason).toBe('QUIET_HOURS');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('haftalık tavan: 7 gün içinde teklif edildiyse susar', async () => {
        const tuesdayNoon = new Date(2026, 9, 13, 12, 0).getTime();
        freezeTime(tuesdayNoon);
        try {
            const { orch } = makeOrchestrator({
                storage: { getSettings: () => ({ aiAdvisorLastAt: tuesdayNoon - 86400000 }) }
            });
            const r = await orch.runSuggest(nightlies(5, tuesdayNoon));
            expect(r.suggestion).toBeNull();
            expect(r.reason).toBe('WEEKLY_CAP');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reddedilen konuda 30 gün susar', async () => {
        const tuesdayNoon = new Date(2026, 9, 13, 12, 0).getTime();
        freezeTime(tuesdayNoon);
        try {
            const { orch } = makeOrchestrator({
                storage: { getSettings: () => ({ aiDismissed: { nightly: tuesdayNoon - 5 * 86400000 } }) }
            });
            const r = await orch.runSuggest(nightlies(5, tuesdayNoon));
            expect(r.suggestion).toBeNull();
            expect(r.reason).toBe('DISMISSED_30D');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('susturulmuşken öneri üretilmez', async () => {
        const { orch } = makeOrchestrator({
            storage: { getSettings: () => ({ aiSilencedUntil: Date.now() + 3600000 }) }
        });
        const r = await orch.runSuggest([]);
        expect(r.suggestion).toBeNull();
        expect(r.reason).toBe('SILENCED');
    });

    it('teklif anında haftalık sayaç işlenir (WBS-9.3)', async () => {
        const tuesdayNoon = new Date(2026, 9, 13, 12, 0).getTime();
        freezeTime(tuesdayNoon);
        try {
            const updateSettings = vi.fn();
            const { orch } = makeOrchestrator({
                storage: { getSettings: () => ({}), updateSettings }
            });
            const r = await orch.runSuggest(nightlies(3, tuesdayNoon));
            expect(r.suggestion).not.toBeNull();
            expect(updateSettings).toHaveBeenCalledWith({ aiAdvisorLastAt: tuesdayNoon });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('dismissTopic reddi 30 güne yazar', () => {
        const updateSettings = vi.fn();
        const { orch } = makeOrchestrator({
            storage: { getSettings: () => ({}), updateSettings }
        });
        expect(orch.dismissTopic('nightly')).toBe(true);
        const arg = updateSettings.mock.calls[0][0];
        expect(typeof arg.aiDismissed.nightly).toBe('number');
        expect(orch.dismissTopic('')).toBe(false);
    });
});

describe('HistoryService.recordAgentRun (F9.5)', () => {
    it('ham metin saklanmaz, şekil sabittir', async () => {
        const { default: HistoryService } = await import('../../src/main/services/HistoryService.js');
        const added = [];
        const svc = new HistoryService({ addHistoryRecord: (r) => added.push(r) });
        svc.recordAgentRun({ agentId: 'command', intent: 'x'.repeat(200), outcome: 'ok', msDuration: 12.7 });
        expect(added).toHaveLength(1);
        const rec = added[0];
        expect(rec.kind).toBe('agent_run');
        expect(rec.intent.length).toBeLessThanOrEqual(80);
        expect(rec.msDuration).toBe(12);
        expect(rec.timestamp).toBeDefined();
    });
});
