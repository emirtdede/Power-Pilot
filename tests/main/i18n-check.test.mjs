/**
 * i18n-check.test.mjs — WP-14.T4
 * locales:check kalite kapısı: eksik anahtar exit 1, duplicate ve placeholder.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLocales, duplicateKeys } from '../../scripts/check-i18n.js';

const sourceDir = path.resolve(__dirname, '../../src/renderer/locales');
const dirs = [];

function copyLocales() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-locales-'));
    dirs.push(dir);
    for (const name of fs.readdirSync(sourceDir)) {
        if (name.endsWith('.json') && name !== 'manifest.json') {
            fs.copyFileSync(path.join(sourceDir, name), path.join(dir, name));
        }
    }
    return dir;
}

afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('locales:check (T-I18N-04)', () => {
    it('mevcut sözlükler temiz', () => {
        const result = checkLocales({ dir: sourceDir, serverDir: null });
        expect(result.errors).toEqual([]);
        expect(result.languages).toBe(17);
        expect(result.keys).toBeGreaterThan(500);
    });

    it('eksik anahtar hata üretir', () => {
        const dir = copyLocales();
        const file = path.join(dir, 'de.json');
        const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete dict.trayShow;
        fs.writeFileSync(file, JSON.stringify(dict, null, 2));
        const result = checkLocales({ dir, serverDir: null });
        expect(result.errors.some((e) => e.includes('de: eksik'))).toBe(true);
    });

    it('placeholder farkı hata üretir', () => {
        const dir = copyLocales();
        const file = path.join(dir, 'fr.json');
        const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
        dict.balloonMeasured = 'Mesure {watt}W {extra}';
        fs.writeFileSync(file, JSON.stringify(dict, null, 2));
        const result = checkLocales({ dir, serverDir: null });
        expect(result.errors.some((e) => e.includes('fr.balloonMeasured'))).toBe(true);
    });

    it('duplicate JSON anahtarını yakalar', () => {
        expect(duplicateKeys('{\n  "a": "1",\n  "a": "2"\n}')).toEqual(['a']);
    });
});

/**
 * Regresyon: dedektör 86 anahtarı yanlışlıkla "kullanılmayan" bildiriyordu
 * (gerçek ölü sayısı 0). Naif düzeltme tehlikelidir: her şeyi "kullanılıyor"
 * sayan bir dedektör sessizce hiçbir şey yakalamaz. Bu testler iki yönü de
 * kilitler — yanlış pozitif yok VE yanlış negatif yok.
 */
describe('locales:check — kullanılmayan anahtar dedektörü', () => {
    it('gerçekten ölü anahtarı hâlâ yakalar (yanlış negatif yok)', () => {
        const dir = copyLocales();
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.json')) continue;
            const file = path.join(dir, name);
            const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
            dict.__qaTotallyUnusedKey__ = 'x';
            fs.writeFileSync(file, JSON.stringify(dict, null, 2));
        }
        const result = checkLocales({ dir, serverDir: null });
        expect(result.errors).toEqual([]);
        expect(result.unused).toContain('__qaTotallyUnusedKey__');
        expect(result.unused.length).toBe(1);
    });

    it('harita değeri / nesne özelliği / translate() kullanımları tanınır', () => {
        const result = checkLocales({ dir: sourceDir, serverDir: null });
        // Her biri farklı bir kullanım biçimini temsil eder:
        //  - aiBusy              → harita değeri      (main.js:106)
        //  - timeFormatDays      → nesne özelliği     (app.js:775)
        //  - aiNegatedIntent     → this.translate()   (AiService.js:227)
        //  - energySourceDefault → harita değeri      (app.js:3493)
        //  - event_task_created  → dinamik önek       (app.js:2386)
        for (const key of ['aiBusy', 'timeFormatDays', 'aiNegatedIntent', 'energySourceDefault', 'event_task_created']) {
            expect(result.unused, `${key} kullanılıyor olarak tanınmalı`).not.toContain(key);
        }
    });

    it('dinamik önek genişletmesi tüm event_* anahtarlarını kapsar', () => {
        const result = checkLocales({ dir: sourceDir, serverDir: null });
        const events = result.unused.filter((k) => k.startsWith('event_'));
        expect(events).toEqual([]);
    });

    it('test dosyalarındaki anmalar "kullanım" sayılmaz', () => {
        // i18n-coverage.test.mjs bu anahtarları açıkça listeler; buna rağmen
        // üretim kodunda geçmiyorlarsa ölü sayılmalıdırlar.
        const result = checkLocales({ dir: sourceDir, serverDir: null });
        expect(result.unused).not.toContain('statusDraft'); // app.js'te gerçekten var
    });
});
