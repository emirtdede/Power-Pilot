/**
 * Acl.js — WP-04.T3
 * Windows ACL sıkılaştırması: kalıtımı kaldırır, yalnızca sahip + SYSTEM +
 * Administrators (SID ile) erişim bırakır. İsim yerine SID kullanılır
 * (Türkçe/yerelleştirilmiş Windows çıktısından etkilenmez).
 * EFS şifreleme (`cipher /E`) opsiyoneldir ve Windows dışında no-op'tur.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SYSTEM_SID = 'S-1-5-18';
const ADMINS_SID = 'S-1-5-32-544';

let cachedSid = null;

function isWindows() {
    return process.platform === 'win32';
}

/**
 * Geçerli kullanıcının SID'i (`whoami /user`). Sonuç önbelleğe alınır.
 */
function currentUserSid() {
    if (!isWindows()) return null;
    if (cachedSid) return cachedSid;
    try {
        const out = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 10000
        });
        const m = out.match(/(S-1-5-[\d-]+)/);
        if (m) cachedSid = m[1];
    } catch (_) {
        cachedSid = null;
    }
    return cachedSid;
}

function aclArgs(target, sid, isDirectory) {
    const perm = isDirectory ? '(OI)(CI)F' : 'F';
    const args = [
        target,
        '/inheritance:r',
        '/grant:r', `*${sid}:${perm}`,
        '/grant:r', `*${SYSTEM_SID}:${perm}`,
        '/grant:r', `*${ADMINS_SID}:${perm}`,
        '/C', '/Q'
    ];
    if (isDirectory) args.push('/T');
    return args;
}

/**
 * Dizini/dosyayı sıkılaştırır.
 * @returns {{ok:boolean, code?:string, error?:string, sid?:string}}
 */
function securePath(target, { isDirectory = null } = {}) {
    if (!isWindows()) return { ok: false, code: 'UNSUPPORTED_PLATFORM' };
    if (typeof target !== 'string' || target.length === 0) {
        return { ok: false, code: 'INVALID_PATH' };
    }
    const resolved = path.resolve(target);
    let dir = isDirectory;
    try {
        if (dir === null) dir = fs.statSync(resolved).isDirectory();
    } catch (err) {
        return { ok: false, code: 'NOT_FOUND', error: err.message };
    }
    const sid = currentUserSid();
    if (!sid) return { ok: false, code: 'SID_UNAVAILABLE' };
    try {
        execFileSync('icacls', aclArgs(resolved, sid, dir), { stdio: 'ignore', windowsHide: true, timeout: 30000 });
        return { ok: true, sid };
    } catch (err) {
        return { ok: false, code: 'ICACLS_FAILED', error: (err && err.message) || 'icacls başarısız', sid };
    }
}

function secureDirectory(dir) {
    return securePath(dir, { isDirectory: true });
}

function secureFile(file) {
    return securePath(file, { isDirectory: false });
}

/**
 * `icacls` çıktısını döner (test/denetim için).
 */
function listAces(target) {
    if (!isWindows()) return { ok: false, code: 'UNSUPPORTED_PLATFORM', output: '' };
    try {
        const output = execFileSync('icacls', [path.resolve(target)], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 10000
        });
        return { ok: true, output };
    } catch (err) {
        return { ok: false, code: 'ICACLS_FAILED', output: String((err && err.stdout) || ''), error: err.message };
    }
}

/**
 * EFS ile dosyayı şifreler (Windows). Desteklenmiyorsa sessizce false.
 */
function encryptFileEfs(file) {
    if (!isWindows()) return { ok: false, code: 'UNSUPPORTED_PLATFORM' };
    try {
        execFileSync('cipher', ['/E', '/A', path.resolve(file)], {
            stdio: 'ignore',
            windowsHide: true,
            timeout: 30000
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, code: 'EFS_FAILED', error: (err && err.message) || 'cipher başarısız' };
    }
}

function ensurePrivateDir(dir, { apply = true } = {}) {
    const resolved = path.resolve(dir);
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    const acl = apply ? secureDirectory(resolved) : { ok: false, code: 'SKIPPED' };
    return { dir: resolved, acl };
}

function ensurePrivateFile(file, { apply = true, efs = false } = {}) {
    const resolved = path.resolve(file);
    const acl = apply ? secureFile(resolved) : { ok: false, code: 'SKIPPED' };
    const encrypted = efs ? encryptFileEfs(resolved) : { ok: false, code: 'SKIPPED' };
    return { file: resolved, acl, encrypted };
}

module.exports = {
    isWindows,
    currentUserSid,
    securePath,
    secureDirectory,
    secureFile,
    listAces,
    encryptFileEfs,
    ensurePrivateDir,
    ensurePrivateFile,
    SYSTEM_SID,
    ADMINS_SID
};
