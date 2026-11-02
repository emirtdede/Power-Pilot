/**
 * data-integrity.test.mjs — WP-11.T12
 * T-STO-07..14: audit zinciri/checkpoint, enerji eşleştirme, muafiyet
 * penceresi, nonce, yedek şifreleme ve utilityProcess izolasyonu.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import StorageService from '../../src/main/services/StorageService.js';
import EnergyEstimateService from '../../src/main/services/EnergyEstimateService.js';
import { isInWindow, validateWindow } from '../../src/main/services/ExemptionService.js';
import { backupDatabase, decryptFile, quickCheck, restoreDatabase } from '../../src/main/storage/Backup.js';
import { runBackup } from '../../src/main/storage/DbWorker.js';

const dirs = [];
const services = [];

function freshDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-integrity-'));
    dirs.push(dir);
    return dir;
}
function open(dir) {
    const s = new StorageService(dir);
    services.push(s);
    return s;
}
function closeAll() {
    for (const s of services.splice(0)) {
        try { s.close(); } catch (_) { /* yut */ }
    }
}
function auditKey() {
    return crypto.createHash('sha256').update('test-audit-key').digest();
}

afterEach(() => {
    closeAll();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('WP-11 veri bütünlüğü', () => {
    it('T-STO-07: audit satırı değiştirilince verify başarısız + auditTampered', () => {
        const dir = freshDir();
        const s = open(dir);
        s.setAuditKey(auditKey(), { checkpointDir: path.join(dir, 'audit-checkpoints') });
        s.appendAudit({ actor: 'system', action: 'test', target: 'x', detail: 'ilk' });
        s.appendAudit({ actor: 'system', action: 'test', target: 'x', detail: 'ikinci' });
        expect(s.verifyAuditChain().ok).toBe(true);
        s.db.prepare("UPDATE audit_log SET detail = 'degistirildi' WHERE seq = 1").run();
        const res = s.verifyAuditChain();
        expect(res.ok).toBe(false);
        expect(res.code).toBe('TAMPERED');
        expect(s.auditTampered).toBe(true);
    });

    it('O-22: checkpoint dosyası silinince onarılır; HMAC bozulursa tamper', () => {
        const dir = freshDir();
        const s = open(dir);
        s.setAuditKey(auditKey(), { checkpointDir: path.join(dir, 'audit-checkpoints') });
        const rec = s.appendAudit({ actor: 'system', action: 'test', target: null, detail: '' });
        const day = String(rec.ts).slice(0, 10);
        const checkpoint = path.join(dir, 'audit-checkpoints', `${day}.json`);
        expect(fs.existsSync(checkpoint)).toBe(true);
        fs.rmSync(checkpoint, { force: true });
        // O-22: HMAC'li gün satırları varsa eksik checkpoint onarılabilir.
        const repaired = s.verifyAuditChain();
        expect(repaired.ok).toBe(true);
        expect(s.auditTampered).toBe(false);
        expect(fs.existsSync(checkpoint)).toBe(true);
        expect(s.getAuditLog().some((r) => r.action === 'audit_checkpoint_repaired')).toBe(true);
        const rebuilt = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
        expect(rebuilt.lastHmac).toBe(rec.recordHmac);
        // Onarılan checkpoint sonraki doğrulamada da geçerli olmalı.
        expect(s.verifyAuditChain().ok).toBe(true);

        // Onarım sonrası checkpoint HMAC'i kurcalanırsa gerçek tamper sayılır.
        const data = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
        data.lastHmac = 'deadbeef';
        fs.writeFileSync(checkpoint, JSON.stringify(data), 'utf8');
        const res = s.verifyAuditChain();
        expect(res.ok).toBe(false);
        expect(res.code).toBe('CHECKPOINT_TAMPERED');
        expect(s.auditTampered).toBe(true);
    });

    it('T-STO-12: HMAC anahtarı yokken yeni audit yazılmaz, açılış anahtar üretmez', () => {
        const dir = freshDir();
        const s1 = open(dir);
        s1.setAuditKey(auditKey(), { checkpointDir: path.join(dir, 'audit-checkpoints') });
        s1.appendAudit({ actor: 'system', action: 'once', target: null, detail: '' });
        s1.close();

        const s2 = open(dir);
        expect(s2.hasAuditKey()).toBe(false);
        expect(() => s2.appendAudit({ actor: 'system', action: 'olmaz', target: null, detail: '' }))
            .toThrowError(/HMAC anahtarı yok/);
        const verify = s2.verifyAuditChain();
        expect(verify.ok).toBe(false);
        expect(verify.code).toBe('AUDIT_KEY_MISSING');
    });

    it('T-STO-08: 22:00 sleep + 23:00 hibernate + 08:00 boot = 9 saat, çift sayım yok', () => {
        const res = EnergyEstimateService.matchOffHours(
            ['2026-10-19T22:00:00.000Z', '2026-10-19T23:00:00.000Z'],
            ['2026-10-20T08:00:00.000Z']
        );
        expect(res.measuredHours).toBe(9);
        expect(res.unmatched).toBe(0);
        // 14 günü aşan eşleşme sayılmaz.
        const stale = EnergyEstimateService.matchOffHours(
            ['2026-10-01T00:00:00.000Z'],
            ['2026-10-20T00:00:00.000Z']
        );
        expect(stale.measuredHours).toBe(0);
        expect(stale.unmatched).toBe(1);
    });

    it('T-STO-09: gece yarısını aşan pencere Salı 01:00’de eşleşir; start===end reddedilir', () => {
        const monday = new Date(2026, 9, 19, 23, 0, 0, 0);
        expect(monday.getDay()).toBe(1);
        const tuesday = new Date(2026, 9, 20, 1, 0, 0, 0);
        expect(tuesday.getDay()).toBe(2);
        const window = { id: 'm1', days: [1], start: '23:00', end: '02:00' };
        expect(isInWindow(window, monday.getTime())).toBe(true);
        expect(isInWindow(window, tuesday.getTime())).toBe(true);
        expect(isInWindow(window, new Date(2026, 9, 20, 3, 0).getTime())).toBe(false);
        expect(validateWindow({ id: 'bad', days: [1], start: '23:00', end: '23:00' }))
            .toMatchObject({ ok: false, code: 'INVALID_WINDOW' });
    });

    it('T-STO-10: aynı nonce iki kez → tek satır, ikinci REPLAY', () => {
        const s = open(freshDir());
        const exp = Date.now() + 60000;
        expect(s.consumeNonce('nonce-1', exp)).toBe(true);
        expect(s.consumeNonce('nonce-1', exp)).toBe(false);
        expect(s.db.prepare('SELECT COUNT(*) AS n FROM seen_nonces WHERE nonce = ?').get('nonce-1').n).toBe(1);
        expect(s.purgeExpiredNonces(exp + 1)).toBe(1);
        expect(s.consumeNonce('nonce-1', Date.now() + 60000)).toBe(true);
    });

    it('T-STO-13: 10k görev yedeği ayrı süreçte; event loop lag < 100 ms', async () => {
        const dir = freshDir();
        const s = open(dir);
        const tasks = Array.from({ length: 10000 }, (_, i) => ({ id: `t${i}`, name: `gorev-${i}`, cmd: 'shutdown' }));
        expect(s.saveTasks(tasks)).toBe(true);
        s.close();

        let maxLag = 0;
        let last = Date.now();
        const timer = setInterval(() => {
            const now = Date.now();
            maxLag = Math.max(maxLag, now - last - 10);
            last = now;
        }, 10);
        let result;
        try {
            result = await runBackup({
                dbPath: path.join(dir, 'powerpilot.db'),
                backupDir: path.join(dir, 'backups'),
                key: crypto.randomBytes(32),
                forceCli: true,
                timeoutMs: 60000
            });
        } finally {
            clearInterval(timer);
        }
        expect(result.ok).toBe(true);
        expect(result.quickCheck).toBe('ok');
        expect(maxLag).toBeLessThan(100);
        expect(fs.existsSync(result.path)).toBe(true);
    }, 90000);

    it('T-STO-14: yedek AES-256-GCM; düz metin yok; yanlış anahtar açmaz; geri yükleme çalışır', () => {
        const dir = freshDir();
        const s = open(dir);
        s.saveTasks([{ id: 'gizli', name: 'GIZLI-GOREV-ADU-123' }]);
        s.close();
        const dbPath = path.join(dir, 'powerpilot.db');
        const key = crypto.randomBytes(32);
        const backupDir = path.join(dir, 'backups');
        const res = backupDatabase({ dbPath, backupDir, key });
        expect(res.quickCheck).toBe('ok');
        const raw = fs.readFileSync(res.path);
        expect(raw.includes(Buffer.from('GIZLI-GOREV-ADU-123', 'utf8'))).toBe(false);
        expect(raw.includes(Buffer.from('SQLite format 3', 'utf8'))).toBe(false);

        expect(() => decryptFile(res.path, path.join(dir, 'yanlis.db'), crypto.randomBytes(32)))
            .toThrowError(/çözülemedi/);
        expect(fs.existsSync(path.join(dir, 'yanlis.db'))).toBe(false);

        const plain = path.join(dir, 'acik.db');
        decryptFile(res.path, plain, key);
        expect(quickCheck(plain)).toBe('ok');

        // Geri yükleme: mevcut DB karantinaya alınır, yedek yerine geçer.
        fs.writeFileSync(path.join(dir, 'powerpilot.db'), 'bozuk');
        const restored = restoreDatabase({ inputPath: res.path, dbPath, key, quarantineDir: path.join(dir, 'q') });
        expect(restored.ok).toBe(true);
        expect(quickCheck(dbPath)).toBe('ok');
        const s2 = open(dir);
        expect(s2.getTasks()[0].name).toBe('GIZLI-GOREV-ADU-123');
    });

    it('Y-09: yanlış anahtar/bozuk yedek canlı DB’yi değiştirmez', () => {
        const dir = freshDir();
        const s = open(dir);
        s.saveTasks([{ id: 'canli', name: 'CANLI-VERI' }]);
        s.close();
        services.splice(services.indexOf(s), 1);

        const dbPath = path.join(dir, 'powerpilot.db');
        const key = crypto.randomBytes(32);
        const backupDir = path.join(dir, 'backups');
        const res = backupDatabase({ dbPath, backupDir, key });
        const before = fs.readFileSync(dbPath);

        // Yanlış anahtar: çözme aşamasında durur; karantina/rename yapılmaz.
        expect(() => restoreDatabase({
            inputPath: res.path,
            dbPath,
            key: crypto.randomBytes(32),
            quarantineDir: path.join(dir, 'q')
        })).toThrowError(/çözülemedi/);
        expect(fs.existsSync(path.join(dir, 'q'))).toBe(false);
        expect(fs.readFileSync(dbPath).equals(before)).toBe(true);

        // Bozuk yedek: aynı şekilde canlı DB'ye dokunulmaz.
        const corrupt = path.join(dir, 'bozuk.db.enc');
        fs.writeFileSync(corrupt, 'bozuk');
        expect(() => restoreDatabase({
            inputPath: corrupt,
            dbPath,
            key,
            quarantineDir: path.join(dir, 'q')
        })).toThrowError(/çok kısa/);
        expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
        expect(fs.readdirSync(dir).filter((name) => name.includes('.restoring-'))).toHaveLength(0);

        const s2 = open(dir);
        expect(s2.getTasks()[0].name).toBe('CANLI-VERI');
    });
});
