/**
 * WP-00.S3 — better-sqlite3 + @node-rs/argon2 Electron 43 x64 ABI testi.
 * Çalıştırma: npx electron spikes/native-modules/spike.js
 */
const { app } = require('electron');

async function run() {
    const Database = require('better-sqlite3');
    const argon2 = require('@node-rs/argon2');

    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('ok');
    const row = db.prepare('SELECT v FROM t WHERE id = 1').get();
    db.close();

    const hash = await argon2.hash('1234', {
        algorithm: argon2.Algorithm.Argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32
    });
    const verified = await argon2.verify(hash, '1234');

    console.log('[spike:S3] better-sqlite3 row=', row && row.v);
    console.log('[spike:S3] argon2 PHC:', hash.slice(0, 32) + '...', 'verify=', verified);
    console.log('[spike:S3] ABI:', process.versions.modules, 'Electron:', process.versions.electron);
    if (!row || row.v !== 'ok' || !verified || !hash.startsWith('$argon2id$')) {
        throw new Error('native modül doğrulaması başarısız');
    }
    console.log('[spike:S3] OK: her iki native modül Electron ABI ile yüklendi.');
}

app.whenReady().then(async () => {
    try {
        await run();
        app.quit();
    } catch (err) {
        console.error('[spike:S3] FAIL:', err && err.message);
        process.exitCode = 1;
        app.quit();
    }
});
