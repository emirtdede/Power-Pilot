/**
 * metric-collector-wp13.test.mjs — WP-13.T3/T4
 * 5 sn tick, _sampling kilidi, allSettled + 4 sn timeout, stale, diskIops.
 */
import { describe, it, expect } from 'vitest';
import MetricCollector from '../../src/main/services/monitors/MetricCollector.js';

function makeCollector(overrides = {}) {
    const mc = new MetricCollector({
        sampleIntervalMs: 600000,
        sampleTimeoutMs: 4000,
        needsProcessList: () => false,
        ...overrides
    });
    mc.stopSampling();
    mc.sampleNetwork = async () => {};
    mc.sampleDisks = async () => { mc.currentMetrics.diskIops = 17; };
    mc.sampleBattery = async () => {};
    mc.sampleIdle = async () => { mc.currentMetrics.userIdleSeconds = 3; };
    mc.sampleProcesses = async () => {};
    return mc;
}

const tick = () => new Promise((r) => setImmediate(r));

describe('MetricCollector WP-13', () => {
    it('yavaş ölçümde üst üste tick çalışmaz', async () => {
        const mc = makeCollector({ sampleTimeoutMs: 40 });
        mc.sampleNetwork = () => new Promise((r) => setTimeout(r, 120));
        const first = mc.sampleOnce();
        const second = await mc.sampleOnce();
        expect(second).toBe(false);
        const firstResult = await first;
        expect(firstResult).toBe(true);
        expect(mc._sampling).toBe(false);
        expect(mc.currentMetrics.stale).toBe(true); // timeout → stale
    });

    it('Promise.allSettled bir alt ölçüm patlasa da tick’i tamamlar', async () => {
        const mc = makeCollector();
        mc.sampleDisks = async () => { throw new Error('disk yok'); };
        await mc.sampleOnce();
        expect(mc._sampling).toBe(false);
        expect(mc.currentMetrics.stale).toBe(true);
    });

    it('ilk iki örnek stale, üçüncü taze; diskIops korunur', async () => {
        const mc = makeCollector();
        await mc.sampleOnce();
        expect(mc.currentMetrics.stale).toBe(true);
        await mc.sampleOnce();
        expect(mc.currentMetrics.stale).toBe(true);
        await mc.sampleOnce();
        expect(mc.currentMetrics.stale).toBe(false);
        expect(mc.currentMetrics.diskIops).toBe(17);
        expect(mc.currentMetrics).not.toHaveProperty('diskReadWriteKbps');
    });

    it('4 sn timeout sonrası kilit açılır', async () => {
        const mc = makeCollector({ sampleTimeoutMs: 20 });
        mc.sampleNetwork = () => new Promise(() => {});
        const started = Date.now();
        await mc.sampleOnce();
        expect(Date.now() - started).toBeLessThan(2000);
        expect(mc._sampling).toBe(false);
        expect(mc.currentMetrics.stale).toBe(true);
    });

    it('varsayılan tick 5000 ms', () => {
        const mc = new MetricCollector({ needsProcessList: () => false });
        mc.stopSampling();
        expect(mc.sampleIntervalMs).toBe(5000);
        expect(mc.batteryIntervalMs).toBe(30000);
    });
});
