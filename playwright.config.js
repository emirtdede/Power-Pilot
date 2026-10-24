/**
 * playwright.config.js — WP-15/TS-34: Electron E2E duman testleri.
 * Yalnızca açılış + preload API + güvenli varsayılan doğrulaması.
 * CI'da tek worker (Electron penceresi çakışmasın).
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 90000,
    expect: { timeout: 20000 },
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        trace: 'retain-on-failure'
    }
});
