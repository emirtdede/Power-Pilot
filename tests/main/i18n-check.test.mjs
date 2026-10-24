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
