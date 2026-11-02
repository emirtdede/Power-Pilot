/**
 * acl-secure.test.mjs — Windows ACL sıkılaştırması
 *
 * Yalnızca testin kendi oluşturduğu GEÇİCİ dizin/dosya üzerinde çalışır;
 * sistem dizinlerine dokunulmaz. Windows dışında testler atlanır.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    isWindows,
    currentUserSid,
    securePath,
    secureDirectory,
    secureFile,
    securePathAsync,
    secureDirectoryAsync,
    secureFileAsync,
    listAces,
    encryptFileEfs,
    ensurePrivateDir,
    ensurePrivateFile,
    SYSTEM_SID,
    ADMINS_SID
} from '../../src/main/security/Acl.js';

const isWin = process.platform === 'win32';
let tmpDir = null;
let tmpFile = null;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-acl-'));
    tmpFile = path.join(tmpDir, 'secret.txt');
    fs.writeFileSync(tmpFile, 'x');
});
afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* yut */ }
});

describe('Acl — platform ve SID', () => {
    it('isWindows platformla tutarlı', () => {
        expect(isWindows()).toBe(process.platform === 'win32');
    });

    it('SID sabitleri doğru', () => {
        expect(SYSTEM_SID).toBe('S-1-5-18');
        expect(ADMINS_SID).toBe('S-1-5-32-544');
    });

    it('currentUserSid Windows\'ta S-1-5- deseni döner, aksi halde null', () => {
        const sid = currentUserSid();
        if (!isWin) {
            expect(sid).toBeNull();
        } else {
            expect(sid === null || /^S-1-5-[\d-]+$/.test(sid)).toBe(true);
        }
        // Önbellek: ikinci çağrı aynı değeri verir.
        expect(currentUserSid()).toBe(sid);
    });
});

describe('Acl — geçersiz girdiler (OS çağrısı yok)', () => {
    it('boş/geçersiz yol INVALID_PATH', async () => {
        expect(securePath('')).toMatchObject({ ok: false, code: 'INVALID_PATH' });
        expect(securePath(null)).toMatchObject({ ok: false, code: 'INVALID_PATH' });
        await expect(securePathAsync('')).resolves.toMatchObject({ ok: false, code: 'INVALID_PATH' });
    });

    it('var olmayan yol NOT_FOUND', async () => {
        const missing = path.join(os.tmpdir(), `pp-acl-missing-${Date.now()}`);
        expect(securePath(missing)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
        await expect(securePathAsync(missing)).resolves.toMatchObject({ ok: false, code: 'NOT_FOUND' });
    });

    it('listAces geçersiz yolda ICACLS_FAILED (Windows) veya UNSUPPORTED', () => {
        if (!isWin) {
            expect(listAces('x')).toMatchObject({ ok: false, code: 'UNSUPPORTED_PLATFORM' });
            return;
        }
        const r = listAces(path.join(os.tmpdir(), `pp-acl-404-${Date.now()}`));
        expect(r.ok).toBe(false);
        expect(r.code).toBe('ICACLS_FAILED');
        expect(typeof r.output).toBe('string');
    });

    it('ensurePrivateDir/File apply:false → SKIPPED (OS çağrısı yok)', () => {
        const dir = ensurePrivateDir(tmpDir, { apply: false });
        expect(dir.dir).toBe(path.resolve(tmpDir));
        expect(dir.acl).toEqual({ ok: false, code: 'SKIPPED' });
        const file = ensurePrivateFile(tmpFile, { apply: false });
        expect(file.file).toBe(path.resolve(tmpFile));
        expect(file.acl).toEqual({ ok: false, code: 'SKIPPED' });
        expect(file.encrypted).toEqual({ ok: false, code: 'SKIPPED' });
    });

    it('ensurePrivateDir yeni dizini oluşturur', () => {
        const target = path.join(tmpDir, `nested-${Date.now()}`);
        const out = ensurePrivateDir(target, { apply: false });
        expect(fs.existsSync(out.dir)).toBe(true);
    });
});

describe.skipIf(!isWin)('Acl — Windows üzerinde geçici dizin', () => {
    it('secureDirectory geçici dizinde başarılı olur (sahip+SYSTEM+Administrators)', () => {
        const r = secureDirectory(tmpDir);
        expect(r.ok).toBe(true);
        expect(r.sid).toMatch(/^S-1-5-/);
    });

    it('secureFile geçici dosyada başarılı olur', () => {
        const r = secureFile(tmpFile);
        expect(r.ok).toBe(true);
    });

    it('securePathAsync / secureDirectoryAsync / secureFileAsync başarılı', async () => {
        await expect(secureDirectoryAsync(tmpDir)).resolves.toMatchObject({ ok: true });
        await expect(secureFileAsync(tmpFile)).resolves.toMatchObject({ ok: true });
        await expect(securePathAsync(tmpDir)).resolves.toMatchObject({ ok: true });
    });

    it('listAces icacls çıktısını döner (yol + erişim maskesi)', () => {
        const r = listAces(tmpDir);
        expect(r.ok).toBe(true);
        expect(r.output.toLowerCase()).toContain(path.basename(tmpDir).toLowerCase());
        expect(r.output).toContain('(OI)(CI)');
    });

    it('ensurePrivateDir/File apply:true ACL uygular', () => {
        const d = ensurePrivateDir(tmpDir);
        expect(d.acl.ok).toBe(true);
        const f = ensurePrivateFile(tmpFile);
        expect(f.acl.ok).toBe(true);
        expect(f.encrypted.code).toBe('SKIPPED');
    });

    it('encryptFileEfs sonuç şekli doğru (ok veya EFS_FAILED)', () => {
        const target = path.join(tmpDir, `efs-${Date.now()}.txt`);
        fs.writeFileSync(target, 'x');
        const r = encryptFileEfs(target);
        expect(typeof r.ok).toBe('boolean');
        if (r.ok === false) expect(r.code).toBe('EFS_FAILED');
        try { fs.rmSync(target, { force: true }); } catch (_) { /* yut */ }
    });
});
