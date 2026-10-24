/**
 * i18n-all.spec.js — WP-14.T6
 * 17 dilin tamamı ana ekran + ayarlar görünümünde eksik anahtar/undefined
 * üretmeden açılır; Arapça RTL yönünü uygular.
 */
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/renderer/locales/manifest.json'), 'utf8'));
const languages = Object.keys(manifest.languages);

test('17 dilde ana ekran ve ayarlar eksiksiz', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerpilot-i18n-all-'));
    let app = null;
    try {
        app = await electron.launch({
            args: ['.', `--user-data-dir=${userDataDir}`, '--disable-gpu'],
            env: {
                ...process.env,
                NODE_ENV: 'production',
                ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
                POWERPILOT_E2E: '1'
            }
        });
        const window = await app.firstWindow();
        const errors = [];
        window.on('pageerror', (error) => errors.push(String(error && error.message || error)));
        await window.waitForLoadState('domcontentloaded');
        await window.waitForFunction(() => /^v\d+\.\d+\.\d+/.test(document.getElementById('app-version')?.innerText || ''));

        for (const lang of languages) {
            await window.evaluate((value) => localStorage.setItem('language', value), lang);
            await window.reload();
            await window.waitForLoadState('domcontentloaded');
            await window.waitForFunction(() => /^v\d+\.\d+\.\d+/.test(document.getElementById('app-version')?.innerText || ''));

            await window.locator('#nav-settings').click();
            await window.waitForTimeout(250);
            const state = await window.evaluate(() => ({
                dir: document.documentElement.getAttribute('dir'),
                text: document.querySelector('main')?.innerText || ''
            }));
            expect(state.dir, `${lang} dir`).toBe(lang === 'ar' ? 'rtl' : 'ltr');
            expect(state.text, `${lang} literal`).not.toContain("t('");
            expect(state.text, `${lang} undefined`).not.toContain('undefined');
            expect(state.text.trim().length, `${lang} boş`).toBeGreaterThan(20);
        }
        expect(errors).toEqual([]);
    } finally {
        if (app) {
            try { await app.close(); } catch (_) { /* yut */ }
        }
        try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (_) { /* Windows kilidi: geçici dizin */ }
    }
});
