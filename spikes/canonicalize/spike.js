/**
 * WP-00.S2 — canonicalize@5.1.0 RFC 8785 uyumu.
 * Çalıştırma: node spikes/canonicalize/spike.js
 */
const mod = require('canonicalize');
const canonicalize = typeof mod === 'function' ? mod : mod.default;
const path = require('node:path');
const pkg = JSON.parse(require('node:fs').readFileSync(
    path.join(path.dirname(require.resolve('canonicalize')), '..', 'package.json'),
    'utf8'
));

const input = { b: 2, a: 1, nested: { z: null, y: [3, 2, 1] }, unicode: 'ğüşiöç' };
const out = canonicalize(input);
const expected = '{"a":1,"b":2,"nested":{"y":[3,2,1],"z":null},"unicode":"ğüşiöç"}';

console.log('[spike:S2] canonicalize sürümü:', pkg.version);
console.log('[spike:S2] çıktı:', out);
if (out !== expected) {
    console.error('[spike:S2] FAIL: RFC 8785 sıralaması beklenenden farklı.');
    process.exit(1);
}
console.log('[spike:S2] OK: anahtar sıralaması deterministik.');
