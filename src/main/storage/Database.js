/**
 * Database.js — WP-11.T1
 * better-sqlite3 sarmalayıcısı: PRAGMA'lar, IMMEDIATE yazma transaction'ları,
 * quick_check, hata sınıfları ve güvenli kapatma.
 *
 * Tek süreç kuralı: aynı DB dosyasına iki Power Pilot süreci bağlanmaz
 * (requestSingleInstanceLock + storage.lock). WAL yine de çoklu okuyucuya izin verir.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

class StorageError extends Error {
    constructor(message, code, cause = null) {
        super(message);
        this.name = 'StorageError';
        this.code = code;
        if (cause) this.cause = cause;
    }
}

function applyPragmas(db) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('wal_autocheckpoint = 1000');
    db.pragma('temp_store = MEMORY');
    // Silinen satırların eski sürümleri dosyada kalmaz (sır migrasyonu).
    db.pragma('secure_delete = ON');
}

class Db {
    constructor(filePath, { readonly = false, fileMustExist = false } = {}) {
        if (typeof filePath !== 'string' || filePath.length === 0) {
            throw new StorageError('Veritabanı yolu gerekli.', 'INVALID_DB_PATH');
        }
        this.filePath = path.resolve(filePath);
        try {
            this.raw = new Database(this.filePath, { readonly, fileMustExist, timeout: 5000 });
        } catch (err) {
            throw new StorageError(`Veritabanı açılamadı: ${err.message}`, 'DB_OPEN_FAILED', err);
        }
        applyPragmas(this.raw);
        this.closed = false;
    }

    static schemaSql() {
        return fs.readFileSync(SCHEMA_PATH, 'utf8');
    }

    /** Şema/toplu SQL çalıştırır. Kabuk exec ile karışmaması için `sql()` adı. */
    sql(sqlText) {
        return this.raw.exec(sqlText);
    }

    prepare(sql) {
        return this.raw.prepare(sql);
    }

    /** Atomik yazma: BEGIN IMMEDIATE … COMMIT. Hata → ROLLBACK. */
    write(fn) {
        const tx = this.raw.transaction(fn);
        try {
            return tx.immediate();
        } catch (err) {
            throw new StorageError(`Yazma işlemi başarısız: ${err.message}`, 'DB_WRITE_FAILED', err);
        }
    }

    quickCheck() {
        try {
            return this.raw.pragma('quick_check', { simple: true });
        } catch (err) {
            return `error: ${err.message}`;
        }
    }

    integrityCheck() {
        try {
            return this.raw.pragma('integrity_check', { simple: true });
        } catch (err) {
            return `error: ${err.message}`;
        }
    }

    /**
     * WAL'ı ana dosyaya taşır ve sıfırlar. Sır temizliği sonrası eski
     * çerçevelerin diskte kalmaması için kullanılır (WP-04 T-SEC-01).
     */
    checkpoint(mode = 'TRUNCATE') {
        try {
            return this.raw.pragma(`wal_checkpoint(${mode})`);
        } catch (err) {
            return null;
        }
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        try { this.raw.close(); } catch (_) { /* yut */ }
    }

    /** Dosya kilidi: aynı userData dizinine iki süreç bağlanmasın. */
    static acquireLock(dir, pid = process.pid) {
        const lockPath = path.join(dir, 'storage.lock');
        try {
            if (fs.existsSync(lockPath)) {
                const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                if (parsed && Number.isInteger(parsed.pid) && parsed.pid !== pid) {
                    try {
                        process.kill(parsed.pid, 0);
                        throw new StorageError(`Veri dizini başka bir süreç tarafından kullanılıyor (PID ${parsed.pid}).`, 'STORAGE_LOCKED');
                    } catch (err) {
                        if (err && err.code === 'STORAGE_LOCKED') throw err;
                        // Süreç yok: eski kilidi temizle.
                    }
                }
            }
            fs.writeFileSync(lockPath, JSON.stringify({ pid, startedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o600 });
            return () => {
                try {
                    const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                    if (current && current.pid === pid) fs.unlinkSync(lockPath);
                } catch (_) { /* yut */ }
            };
        } catch (err) {
            if (err instanceof StorageError) throw err;
            throw new StorageError(`Kilit alınamadı: ${err.message}`, 'STORAGE_LOCK_FAILED', err);
        }
    }
}

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

module.exports = { Db, StorageError, applyPragmas, sha256, SCHEMA_PATH };
