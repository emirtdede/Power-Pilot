/**
 * WP-00.S1 — app:// + protocol.handle + net.fetch(pathToFileURL) + realpath.
 * Çalıştırma: npx electron spikes/app-protocol/spike.js
 */
const { app, protocol, net } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
    { scheme: 'spikeapp', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-spike-app-'));
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>spike</title><p>ok</p>');
const outside = path.join(path.dirname(root), `outside-${process.pid}.txt`);
fs.writeFileSync(outside, 'SECRET-OUTSIDE');

app.whenReady().then(async () => {
    const realRoot = fs.realpathSync(root);
    protocol.handle('spikeapp', async (request) => {
        try {
            const url = new URL(request.url);
            const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
            const target = fs.realpathSync(path.join(realRoot, rel));
            if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
                return new Response('forbidden', { status: 403 });
            }
            return net.fetch(pathToFileURL(target).toString());
        } catch (_) {
            return new Response('not found', { status: 404 });
        }
    });

    try {
        const ok = await net.fetch('spikeapp://powerpilot/index.html');
        const text = await ok.text();
        const traversal = await net.fetch('spikeapp://powerpilot/../outside.txt');
        console.log('[spike:S1] index status:', ok.status, 'contains ok:', text.includes('<p>ok</p>'));
        console.log('[spike:S1] traversal status:', traversal.status);
        if (ok.status !== 200 || !text.includes('<p>ok</p>') || traversal.status === 200) {
            throw new Error('protokol veya path traversal koruması başarısız');
        }
        console.log('[spike:S1] OK: app:// ASAR dışı dosya servisi + realpath koruması.');
    } catch (err) {
        console.error('[spike:S1] FAIL:', err && err.message);
        process.exitCode = 1;
    } finally {
        try { fs.unlinkSync(outside); } catch (_) {}
        try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
        app.quit();
    }
});
