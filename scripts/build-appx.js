#!/usr/bin/env node
/**
 * build-appx.js — WP-18/TS-18: APPX üretim kapısı.
 *
 * Kural (Plan v2.0): Varsayılan dağıtım NSIS-only'dir. APPX yalnızca
 *  1. APPX_PUBLISHER ortam değişkeni verilmişse,
 *  2. kod imzalama materyali (CSC_LINK veya mağaza sertifikası) varsa,
 *  3. sertifika Subject'i APPX_PUBLISHER ile eşleşiyorsa
 * üretilir. Aksi halde komut açık hata ile durur; yanlış publisher'lı paket
 * mağazaya gönderilemez.
 */

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function fail(message) {
    console.error(`[build-appx] REDDEDİLDİ: ${message}`);
    process.exit(1);
}

function normalizePublisher(value) {
    return String(value || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .sort()
        .join(',');
}

/**
 * Windows sertifika deposunda Subject'i publisher ile eşleşen sertifika arar.
 * Sertifika yoksa null döner (APPX üretimi reddedilir).
 */
function findPublisherCertificate(publisher) {
    if (process.platform !== 'win32') return null;
    const script = [
        "$ErrorActionPreference='SilentlyContinue';",
        'Get-ChildItem Cert:\\CurrentUser\\My, Cert:\\LocalMachine\\My |',
        'Where-Object { $_.HasPrivateKey } |',
        'Select-Object -ExpandProperty Subject'
    ].join(' ');
    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 20000
    });
    if (res.status !== 0 || !res.stdout) return null;
    const wanted = normalizePublisher(publisher);
    for (const line of res.stdout.split(/\r?\n/)) {
        if (normalizePublisher(line) === wanted) return line.trim();
    }
    return null;
}

function main() {
    const publisher = process.env.APPX_PUBLISHER;
    if (!publisher || !String(publisher).trim()) {
        fail('APPX_PUBLISHER tanımlı değil. Varsayılan dağıtım NSIS-only; APPX için publisher zorunlu.');
    }
    const hasSigningMaterial = !!(process.env.CSC_LINK || process.env.WINDOWS_CERT_SUBJECT);
    if (!hasSigningMaterial) {
        fail('Kod imzalama materyali yok (CSC_LINK veya WINDOWS_CERT_SUBJECT). İmzasız APPX yayınlanamaz.');
    }

    const certSubject = process.env.WINDOWS_CERT_SUBJECT || findPublisherCertificate(publisher);
    if (!certSubject) {
        fail(`Publisher ile eşleşen özel anahtarlı sertifika bulunamadı: ${publisher}`);
    }
    if (normalizePublisher(certSubject) !== normalizePublisher(publisher)) {
        fail(`Sertifika Subject publisher ile eşleşmiyor.\n  Publisher: ${publisher}\n  Sertifika: ${certSubject}`);
    }

    console.log(`[build-appx] Publisher doğrulandı: ${publisher}`);
    console.log('[build-appx] electron-builder --win appx başlatılıyor...');
    execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['electron-builder', '--win', 'appx'],
        { cwd: ROOT, stdio: 'inherit', env: process.env }
    );
}

if (require.main === module) main();

module.exports = { normalizePublisher, findPublisherCertificate };
