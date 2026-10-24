#!/usr/bin/env node
/**
 * check-i18n.js — WP-14.T4
 * 17 dil, anahtar eşitliği, duplicate, {placeholder} parity, kullanılmayan rapor.
 * Hata varsa exit 1 (CI kalite kapısı).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'src', 'renderer', 'locales');
const SERVER_DIR = path.join(ROOT, 'src', 'main', 'locales');
const LANGS = [
    'tr', 'en', 'de', 'sv', 'no', 'da', 'fr', 'pl', 'it', 'nl',
    'cs', 'es', 'pt', 'ja', 'zh', 'ko', 'ar'
];

function placeholders(value) {
    return [...String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

function duplicateKeys(text) {
    const seen = new Set();
    const dupes = [];
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^  "([^"]+)":/);
        if (!m) continue;
        if (seen.has(m[1])) dupes.push(m[1]);
        seen.add(m[1]);
    }
    return dupes;
}

function readLang(dir, lang, errors) {
    const file = path.join(dir, `${lang}.json`);
    if (!fs.existsSync(file)) {
        errors.push(`Eksik locale dosyası: ${lang}.json`);
        return null;
    }
    const text = fs.readFileSync(file, 'utf8');
    const dupes = duplicateKeys(text);
    if (dupes.length > 0) errors.push(`${lang}.json duplicate anahtar: ${dupes.join(', ')}`);
    try {
        return JSON.parse(text);
    } catch (err) {
        errors.push(`${lang}.json geçersiz JSON: ${err.message}`);
        return null;
    }
}

function usedKeys() {
    const keys = new Set();
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'locales' || entry.name === 'node_modules') continue;
                walk(full);
            } else if (/\.(js|html)$/.test(entry.name)) {
                files.push(full);
            }
        }
    };
    walk(path.join(ROOT, 'src'));
    walk(ROOT);
    const seen = new Set();
    for (const file of [...new Set(files)]) {
        if (seen.has(file)) continue;
        seen.add(file);
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) keys.add(m[1]);
        for (const m of text.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) keys.add(m[1]);
    }
    return keys;
}

function checkLocales({ dir = DEFAULT_DIR, serverDir = SERVER_DIR, langs = LANGS } = {}) {
    const errors = [];
    const dictionaries = {};
    for (const lang of langs) {
        const dict = readLang(dir, lang, errors);
        if (dict) dictionaries[lang] = dict;
    }
    const base = dictionaries.tr || {};
    const baseKeys = Object.keys(base).sort();
    if (baseKeys.length === 0) errors.push('tr sözlüğü boş.');
    for (const lang of langs) {
        const dict = dictionaries[lang];
        if (!dict) continue;
        const keys = Object.keys(dict).sort();
        const missing = baseKeys.filter((k) => !(k in dict));
        const extra = keys.filter((k) => !(k in base));
        if (missing.length > 0) errors.push(`${lang}: eksik ${missing.length} anahtar (${missing.slice(0, 5).join(', ')})`);
        if (extra.length > 0) errors.push(`${lang}: fazla ${extra.length} anahtar (${extra.slice(0, 5).join(', ')})`);
        if (serverDir && fs.existsSync(serverDir)) {
            const serverFile = path.join(serverDir, `${lang}.server.json`);
            if (!fs.existsSync(serverFile)) {
                errors.push(`${lang}.server.json eksik.`);
            } else {
                const server = JSON.parse(fs.readFileSync(serverFile, 'utf8'));
                if (JSON.stringify(server) !== JSON.stringify(dict)) {
                    errors.push(`${lang}.server.json renderer sözlüğüyle eşleşmiyor (npm run build:locales).`);
                }
            }
        }
    }
    for (const key of baseKeys) {
        const expected = placeholders(base[key]);
        if (expected.length === 0) continue;
        for (const lang of langs) {
            const dict = dictionaries[lang];
            if (!dict || !(key in dict)) continue;
            const actual = placeholders(dict[key]);
            if (actual.join(',') !== expected.join(',')) {
                errors.push(`${lang}.${key}: placeholder farkı (${actual.join(',') || 'yok'} != ${expected.join(',')})`);
            }
        }
    }
    const used = usedKeys();
    const unused = baseKeys.filter((key) => !used.has(key));
    return { errors, unused, languages: langs.length, keys: baseKeys.length };
}

if (require.main === module) {
    const dir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;
    const result = checkLocales({ dir, serverDir: dir === DEFAULT_DIR ? SERVER_DIR : null });
    if (result.unused.length > 0) {
        console.log(`[locales:check] kullanılmayan anahtar: ${result.unused.length} (rapor)`);
        console.log(`  ${result.unused.slice(0, 20).join(', ')}${result.unused.length > 20 ? ', …' : ''}`);
    }
    if (result.errors.length > 0) {
        for (const err of result.errors) console.error(`[locales:check] ${err}`);
        process.exit(1);
    }
    console.log(`[locales:check] temiz: ${result.languages} dil, ${result.keys} anahtar.`);
}

module.exports = { checkLocales, placeholders, duplicateKeys, LANGS };
