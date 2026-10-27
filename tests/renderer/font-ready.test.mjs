/**
 * Material Symbols ligature guard.
 *
 * Regression: `font-display: swap` showed raw ligature names (for example
 * "power_settings_new") until the bundled icon font finished loading. The
 * boot gate hides the glyphs while the font is pending so users never see
 * implementation names.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Material Symbols font boot gate', () => {
    it('keeps font-display block and hides icons while the font is pending', () => {
        const css = read('src/vendor/fonts/material-symbols.css');
        expect(css).toContain('font-display: block');
        expect(css).toMatch(/html\.fonts-pending\s+\.material-symbols-outlined\s*\{[^}]*visibility:\s*hidden/s);
    });

    it.each(['src/index.html', 'src/mini.html'])('%s loads the boot gate in <head>', (file) => {
        const html = read(file);
        const headEnd = html.indexOf('</head>');
        expect(headEnd).toBeGreaterThan(-1);
        expect(html.slice(0, headEnd)).toContain('<script src="renderer/font-ready.js"></script>');
        expect(html).toContain('fonts-pending');
    });

    it('reveals icons only after the icon font (or the safety timeout) resolves', () => {
        const js = read('src/renderer/font-ready.js');
        expect(js).toContain('document.fonts.load(\'24px "Material Symbols Outlined"\')');
        expect(js).toContain('document.fonts.ready');
        expect(js).toContain("classList.remove('fonts-pending')");
        expect(js).toContain('setTimeout(reveal, 8000)');
    });
});
