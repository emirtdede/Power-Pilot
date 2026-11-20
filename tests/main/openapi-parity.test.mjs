/**
 * openapi-parity.test.mjs — WBS-5.3 / TS-5.3
 * docs/openapi/power-pilot-local-api.yaml ↔ LocalApiService.route() birebirliği.
 * Sapma olursa test kırmızı verir (doküman-kod drift'i CI'da yakalanır).
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import LocalApiService from '../../src/main/services/LocalApiService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const YAML_PATH = path.join(here, '..', '..', 'docs', 'openapi', 'power-pilot-local-api.yaml');

// Bağımlılıksız mini-ayrıştırıcı: paths altındaki `  /x:` + `    get:|post:` satırları.
function parseYamlPaths(text) {
    const routes = [];
    let current = null;
    let inPaths = false;
    for (const line of text.split('\n')) {
        if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
        if (/^[a-z]+:\s*$/.test(line) && !line.startsWith(' ')) { inPaths = false; continue; }
        if (!inPaths) continue;
        const pm = line.match(/^  (\/\S+):\s*$/);
        if (pm) { current = pm[1]; continue; }
        const mm = line.match(/^    (get|post|put|delete):\s*$/);
        if (mm && current) routes.push({ method: mm[1].toUpperCase(), path: current });
    }
    return routes;
}

function makeService() {
    const storage = {
        getSettings: () => ({ localApiKeyHash: 'abc', localApiEnabled: true, localApiPort: 18456 }),
        updateSettings: vi.fn()
    };
    const taskManager = {
        getActiveTasks: () => [],
        pausedAll: false,
        tasks: [],
        createTask: vi.fn((data) => ({ id: 'task_api_1', toJSON: () => ({ id: 'task_api_1', ...data }) })),
        cancelTask: vi.fn()
    };
    return new LocalApiService(storage, taskManager, { execute: vi.fn(async () => ({ success: true })) });
}

function fakeRes() {
    return {
        statusCode: null, body: null,
        writeHead(code) { this.statusCode = code; },
        end(payload) { try { this.body = JSON.parse(payload); } catch { this.body = payload; } }
    };
}

function sampleBody(docPath) {
    if (docPath === '/tasks/timer') return { action: 'shutdown', durationMs: 60000 };
    return {};
}

describe('OpenAPI ↔ kod paritesi (TS-5.3)', () => {
    it('yaml tüm rotaları içerir (çekirdek 10 + FAZ B kurumsal)', () => {
        const routes = parseYamlPaths(fs.readFileSync(YAML_PATH, 'utf8'));
        const keys = routes.map((r) => `${r.method} ${r.path}`).sort();
        expect(keys).toEqual([
            'GET /status',
            'GET /tasks',
            'POST /power/hibernate',
            'POST /power/lock',
            'POST /power/restart',
            'POST /power/shutdown',
            'POST /power/signout',
            'POST /power/sleep',
            'POST /tasks/timer',
            'POST /tasks/{id}/cancel',
            // FAZ B: kurumsal uçlar
            'GET /inventory',
            'POST /orders',
            'GET /orders/pending',
            'GET /exemptions',
            'POST /exemptions',
            'DELETE /exemptions/{id}',
            'GET /maintenance-windows',
            'POST /maintenance-windows',
            'DELETE /maintenance-windows/{id}',
            'GET /audit',
            'GET /audit/verify'
        ].sort());
    });

    it('yaml daki her rota kodda 404 dönmez', () => {
        const svc = makeService();
        const routes = parseYamlPaths(fs.readFileSync(YAML_PATH, 'utf8'));
        expect(routes.length).toBeGreaterThan(0);
        for (const r of routes) {
            const concrete = r.path.replace('{id}', 't1');
            const res = fakeRes();
            svc.route(r.method, `/api/v1${concrete}`, sampleBody(r.path), res);
            expect(`${r.method} ${r.path} → ${res.statusCode}`).not.toContain('404');
        }
    });

    it('6 güç eyleminin tamamı yaml da belgeli', () => {
        const text = fs.readFileSync(YAML_PATH, 'utf8');
        for (const action of ['lock', 'signout', 'restart', 'sleep', 'hibernate', 'shutdown']) {
            expect(text).toContain(`/power/${action}:`);
        }
    });
});
