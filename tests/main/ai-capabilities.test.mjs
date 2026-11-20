/**
 * ai-capabilities.test.mjs — WP-8: templateAgent, connectionAgent, DocsKnowledgeBase ve docsQaAgent.
 * Tamamen yerel ve deterministik (LLM çağrısı gerektirmez).
 */
import { describe, it, expect } from 'vitest';
import templateAgent from '../../src/main/services/agents/templateAgent.js';
import connectionAgent from '../../src/main/services/agents/connectionAgent.js';
import docsQaAgent from '../../src/main/services/agents/docsQaAgent.js';
import { searchDocs, listAllDocChunks } from '../../src/main/services/DocsKnowledgeBase.js';
import TemplateService from '../../src/main/services/TemplateService.js';

describe('templateAgent (WP-8)', () => {
    it('TR doğal dilinden geçerli koşullu şablon üretir', async () => {
        const res = await templateAgent.execute({
            text: 'Render bitince CPU %10 altına düşünce bilgisayarı kapatan şablon oluştur',
            language: 'tr'
        });
        expect(res.ok).toBe(true);
        expect(res.kind).toBe('template_proposal');
        expect(res.templateProposal.action).toBe('shutdown');
        expect(res.templateProposal.defaultCondition.type).toBe('cpu_usage');
        expect(TemplateService.isValidTemplate({ id: 'user_tpl_test', ...res.templateProposal })).toBe(true);
    });

    it('EN zamanlı şablon ve süreli şablon üretir', async () => {
        const sched = await templateAgent.execute({
            text: 'Create a template to sleep every night at 23:30',
            language: 'en'
        });
        expect(sched.ok).toBe(true);
        expect(sched.templateProposal.schedule).toEqual({ timeOfDay: '23:30', recurrence: 'daily' });

        const dur = await templateAgent.execute({
            text: 'Create a template to lock after 30 minutes',
            language: 'en'
        });
        expect(dur.ok).toBe(true);
        expect(dur.templateProposal.trigger).toEqual({ type: 'duration', durationMs: 30 * 60000 });
    });

    it('olumsuz niyeti reddeder ve eksik bilgide açıklama ister', async () => {
        const neg = await templateAgent.execute({ text: 'bilgisayarı kapatma şablonu', language: 'tr' });
        expect(neg.ok).toBe(false);
        expect(neg.code).toBe('NEGATED_INTENT');

        const clarify = await templateAgent.execute({ text: 'yeni bir şablon oluştur', language: 'tr' });
        expect(clarify.ok).toBe(true);
        expect(clarify.needsClarification).toBeDefined();
    });
});

describe('connectionAgent (WP-8)', () => {
    it('REST API, MCP, HTTPS Webhook, WoL ve UPS önerileri üretir', async () => {
        const api = await connectionAgent.execute({
            text: 'Yerel REST API 19000 portunu aç',
            language: 'tr',
            currentSettings: {}
        });
        expect(api.ok).toBe(true);
        expect(api.connectionProposal.settingsPatch).toMatchObject({ localApiEnabled: true, localApiPort: 19000 });
        expect(api.connectionProposal.requiresPin).toBe(true);

        const mcp = await connectionAgent.execute({
            text: 'Claude Desktop MCP sunucusu yapılandır',
            language: 'tr',
            currentSettings: { localApiEnabled: true, localApiPort: 18456 }
        });
        expect(mcp.ok).toBe(true);
        expect(mcp.connectionProposal.target).toBe('mcp');
        expect(mcp.connectionProposal.snippet).toContain('power-pilot');

        const wh = await connectionAgent.execute({
            text: 'https://n8n.example.com/webhook/pp için webhook ekle',
            language: 'tr',
            currentSettings: {}
        });
        expect(wh.ok).toBe(true);
        expect(wh.connectionProposal.target).toBe('webhook');
        expect(wh.connectionProposal.webhook.url).toBe('https://n8n.example.com/webhook/pp');

        const wol = await connectionAgent.execute({
            text: 'AA:BB:CC:DD:EE:FF cihazını Wake-on-LAN olarak kaydet',
            language: 'tr',
            currentSettings: {}
        });
        expect(wol.ok).toBe(true);
        expect(wol.connectionProposal.target).toBe('wol_device');
        expect(wol.connectionProposal.wolDevice.macAddress).toBe('AA:BB:CC:DD:EE:FF');

        const ups = await connectionAgent.execute({
            text: 'UPS NUT sunucusu 192.168.1.50 etkinleştir',
            language: 'tr',
            currentSettings: {}
        });
        expect(ups.ok).toBe(true);
        expect(ups.connectionProposal.settingsPatch).toMatchObject({ upsEnabled: true, upsHost: '192.168.1.50' });
    });

    it('güvensiz http:// webhook adresini reddedip HTTPS ister', async () => {
        const httpWh = await connectionAgent.execute({
            text: 'Add webhook ' + 'http:' + '//insecure.local/hook',
            language: 'en',
            currentSettings: {}
        });
        expect(httpWh.ok).toBe(true);
        expect(httpWh.needsClarification).toBeDefined();
        expect(httpWh.needsClarification.question).toContain('HTTPS');
    });
});

describe('DocsKnowledgeBase & docsQaAgent (WP-8 Yerel RAG)', () => {
    it('en az 15 doküman parçası barındırır ve TR/EN sorgularda doğru bölümü bulur', () => {
        expect(listAllDocChunks().length).toBeGreaterThanOrEqual(15);
        const mcpHits = searchDocs('MCP sunucusu Claude Desktop nasıl bağlanır', { lang: 'tr' });
        expect(mcpHits.length).toBeGreaterThan(0);
        expect(mcpHits[0].sectionId).toBe('docs-sec-mcp');

        const pinHits = searchDocs('How is the cancel PIN encrypted?', { lang: 'en' });
        expect(pinHits.length).toBeGreaterThan(0);
        expect(pinHits[0].sectionId).toBe('docs-sec-power-safety');
    });

    it('docsQaAgent LLM olmadan yerel kaynaklı yanıt ve derin bağlantı döndürür', async () => {
        const res = await docsQaAgent.execute({
            text: 'Destek paketi ZIP çökme raporu nasıl alınır?',
            language: 'tr',
            aiBackend: null
        });
        expect(res.ok).toBe(true);
        expect(res.kind).toBe('docs_answer');
        expect(res.mode).toBe('rag_local');
        expect(res.citations.length).toBeGreaterThan(0);
        expect(res.docSectionId).toBeTruthy();
    });
});
