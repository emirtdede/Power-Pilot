/**
 * power-service.test.mjs — PowerService güvenlik kapısı
 *
 * GÜVENLİK: hiçbir OS güç komutu çalıştırılmaz. `execute()` yalnızca
 * (a) guard reddi, (b) geçersiz eylem dallarında test edilir; bu iki dal
 * `execFile` çağrısından ÖNCE döner.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PowerService, POWER_ACTIONS } from '../../src/main/services/PowerService.js';

afterEach(() => {
    PowerService.setExecutionGuard(null);
});

describe('PowerService', () => {
    it('POWER_ACTIONS altı eylemi tanımlar', () => {
        expect(Object.values(POWER_ACTIONS).sort()).toEqual(['hibernate', 'lock', 'restart', 'shutdown', 'signout', 'sleep']);
    });

    it('isValidAction altı eylemde true, diğerlerinde false', () => {
        for (const action of Object.values(POWER_ACTIONS)) expect(PowerService.isValidAction(action)).toBe(true);
        expect(PowerService.isValidAction('format')).toBe(false);
        expect(PowerService.isValidAction(null)).toBe(false);
        expect(PowerService.isValidAction('SHUTDOWN')).toBe(false);
    });

    it('guard yoksa executionAllowed izin verir', () => {
        expect(PowerService.executionAllowed()).toEqual({ ok: true });
    });

    it('guard reddi eylemi OS çağrısından önce durdurur', async () => {
        PowerService.setExecutionGuard(() => ({ ok: false, code: 'AUDIT_TAMPERED', error: 'Denetim zinciri kurcalanmış.' }));
        expect(PowerService.executionAllowed()).toEqual({ ok: false, code: 'AUDIT_TAMPERED', error: 'Denetim zinciri kurcalanmış.' });
        const res = await PowerService.execute(POWER_ACTIONS.SHUTDOWN);
        expect(res.success).toBe(false);
        expect(res.code).toBe('AUDIT_TAMPERED');
    });

    it('guard kodu yoksa BLOCKED kodu döner', async () => {
        PowerService.setExecutionGuard(() => ({ ok: false }));
        const res = await PowerService.execute(POWER_ACTIONS.RESTART);
        expect(res).toMatchObject({ success: false, code: 'BLOCKED' });
    });

    it('geçersiz eylem exec çağrısı olmadan reddedilir', async () => {
        const res = await PowerService.execute('rm-rf');
        expect(res).toEqual({ success: false, error: 'Invalid power action: rm-rf' });
    });

    it('guard hatası fırlatan fonksiyon çağrıyı engellemez (fail-safe değil, açık hata)', () => {
        // Guard fırlatırsa hata senkron yukarı çıkar; sessizce eylem çalıştırılmaz.
        PowerService.setExecutionGuard(() => { throw new Error('guard patladı'); });
        expect(() => PowerService.execute(POWER_ACTIONS.SLEEP)).toThrow('guard patladı');
    });

    it('setExecutionGuard fonksiyon olmayan değeri temizler', () => {
        PowerService.setExecutionGuard('nope');
        expect(PowerService.executionAllowed()).toEqual({ ok: true });
    });
});
