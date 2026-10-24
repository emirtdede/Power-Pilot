import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import {
    translate, actionLabel, taskName, loadTranslations, loadLocale,
    LANGUAGE_ORDER, resetCache
} from '../../src/main/i18n.js';

afterEach(() => {
    vi.restoreAllMocks();
    resetCache();
});

describe('ana süreç i18n (WP-14.T3)', () => {
    it('17 dil dosyası JSON olarak mevcut', () => {
        expect(LANGUAGE_ORDER).toHaveLength(17);
        for (const lang of LANGUAGE_ORDER) {
            const dict = loadLocale(lang);
            expect(typeof dict.trayShow, lang).toBe('string');
        }
    });

    it('açılışta yalnızca tek locale dosyası okur', () => {
        const spy = vi.spyOn(fs, 'readFileSync');
        resetCache();
        const en = loadTranslations('en');
        expect(en.trayShow).toBe('Show App');
        const localeReads = spy.mock.calls
            .map((c) => String(c[0]))
            .filter((p) => p.includes(`${fsPathSep()}locales${fsPathSep()}`));
        expect(localeReads).toHaveLength(1);
    });

    it('vm kullanımı yok', () => {
        const source = fs.readFileSync(new URL('../../src/main/i18n.js', import.meta.url), 'utf8');
        expect(source).not.toMatch(/require\(['"]vm['"]\)|runInContext/);
    });

    it('placeholder ve dil fallback uygular', () => {
        expect(translate('en', 'balloonMeasured', { watt: 42 })).toContain('42W');
        expect(translate('tr', 'balloonMeasured', { watt: 42 })).toContain('42W');
        expect(translate('xx', 'trayQuit')).toBe('Çıkış Yap');
        expect(translate('en', 'bilinmeyen_anahtar')).toBe('bilinmeyen_anahtar');
    });

    it('güç eylemlerini yerelleştirir', () => {
        expect(actionLabel('en', 'shutdown')).toBe('Shut Down');
        expect(actionLabel('tr', 'shutdown')).toBe('Bilgisayarı Kapat');
        expect(actionLabel('de', 'sleep')).toBe('Energiesparmodus');
    });

    it('tray görev adını tetikleyiciden türetir', () => {
        const quick = taskName('en', {
            name: 'Hızlı Zamanlayıcı (Kapat)',
            action: 'shutdown',
            source: 'user_interface',
            trigger: { type: 'duration' }
        });
        expect(quick).toBe('Quick Timer (Shut Down)');

        const builtin = taskName('en', { name: 'Chrome Kapanınca Kilitle', trigger: { type: 'composite' } });
        expect(builtin).toBe('Lock When Chrome Closes');

        const apiTask = taskName('en', { name: 'My CI task', source: 'local_api', trigger: {} });
        expect(apiTask).toBe('My CI task');
    });
});

function fsPathSep() {
    return process.platform === 'win32' ? '\\' : '/';
}
