/**
 * vitest.config.js — WBS-4.1
 * Multi-project: main (node) + renderer (jsdom).
 * Kapsam kapısı: satır %80 altında CI kırmızı (WBS-4.2 / TS-4.2).
 */
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'main',
                    root: './tests/main',
                    environment: 'node',
                    include: ['**/*.test.mjs'],
                    setupFiles: ['../setup/main-setup.mjs']
                }
            },
            {
                test: {
                    name: 'renderer',
                    root: './tests/renderer',
                    environment: 'jsdom',
                    include: ['**/*.test.mjs'],
                    setupFiles: ['../setup/renderer-setup.mjs']
                }
            }
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/**/*.js'],
            exclude: ['src/main/**/*.test.js'],
            thresholds: {
                lines: 80,
                functions: 70,
                branches: 65,
                statements: 80
            }
        }
    }
});
