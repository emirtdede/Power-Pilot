/**
 * metric.test.mjs — MetricCollector: metrik zarfı, stale ısınma kuralı, gerçek si ölçümü.
 * Uzun aralıklı örnekleyici (60sn) + stopSampling ile test izolasyonu.
 */
import { describe, it, expect, afterEach } from 'vitest';
import MetricCollector from '../../src/main/services/monitors/MetricCollector.js';

const live = [];
afterEach(() => { for (const mc of live.splice(0)) mc.stopSampling(); });

describe('MetricCollector', () => {
    it('ilk zarf stale:true ile başlar', () => {
        const mc = new MetricCollector({ sampleIntervalMs: 60000 });
        live.push(mc);
        const m = mc.getMetrics();
        expect(m.stale).toBe(true);
        for (const k of ['cpuUsagePercent', 'networkDownloadKbps', 'networkUploadKbps', 'diskIops', 'userIdleSeconds', 'runningProcesses', 'sampledAt']) {
            expect(m).toHaveProperty(k);
        }
    });

    it('3. örnekten sonra stale:false olur', async () => {
        // sampleTimeoutMs testte yüksek tutulur: yüklü CI makinesinde yavaş örnek
        // "geciken örnek" sayılıp stale kalır (fail-closed) ve test nedensiz kırılır.
        const mc = new MetricCollector({ sampleIntervalMs: 60000, sampleTimeoutMs: 60000 });
        live.push(mc);
        await mc.sampleOnce();
        expect(mc.getMetrics().stale).toBe(true);
        await mc.sampleOnce();
        expect(mc.getMetrics().stale).toBe(true);
        await mc.sampleOnce();
        expect(mc.getMetrics().stale).toBe(false);
    }, 60000);

    it('ölçümler sayı aralığındadır (negatif ağ yok)', async () => {
        const mc = new MetricCollector({ sampleIntervalMs: 60000, sampleTimeoutMs: 60000 });
        live.push(mc);
        await mc.sampleOnce();
        const m = mc.getMetrics();
        expect(m.cpuUsagePercent).toBeGreaterThanOrEqual(0);
        expect(m.cpuUsagePercent).toBeLessThanOrEqual(100);
        expect(m.networkDownloadKbps).toBeGreaterThanOrEqual(0);
        expect(m.networkUploadKbps).toBeGreaterThanOrEqual(0);
        expect(m.diskIops).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('stopSampling döngüyü durdurur (idempotent)', () => {
        const mc = new MetricCollector({ sampleIntervalMs: 60000 });
        expect(mc.sampleInterval).not.toBeNull();
        mc.stopSampling();
        mc.stopSampling();
        expect(mc.sampleInterval).toBeNull();
    });
});
