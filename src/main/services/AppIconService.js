/**
 * AppIconService.js — Uygulama, görev çubuğu, sistem tepsisi ve masaüstü ikonu yönetimi.
 *
 * 4 kanonik ikon varyantı sunar (varsayılan: `monochrome-dark` / Koyu Monokrom):
 *  - `monochrome-dark`     : Siyah Zemin · Koyu Monokrom
 *  - `monochrome-light`    : Beyaz Zemin · Açık Monokrom
 *  - `monochrome-contrast` : Saf Siyah-Beyaz · Yüksek Kontrast
 *  - `classic-cyan`        : Klasik · Cyan
 *
 * Seçim değiştiğinde tüm yüzeyler eşzamanlı güncellenir:
 *  1. Ana pencere ve mini pencere görev çubuğu/pencere ikonu (`setIcon`).
 *  2. Sistem tepsisi (Tray) ikonu (`setImage`).
 *  3. Windows Masaüstü, Başlat Menüsü, Sabitlenmiş Görev Çubuğu (`User Pinned\TaskBar`,
 *     `ImplicitAppShortcuts`) ve Başlangıç `.lnk` kısayollarının ikonu + `AppUserModelId`.
 *  4. NSIS kurulumunda `HKCU\...\Uninstall` `DisplayIcon` değeri (no-shell `reg.exe`).
 *  5. Windows Explorer simge önbelleği (`ie4uinit.exe -show` + `Shell32::SHChangeNotify`).
 *  6. Portable kullanıcıları için isteğe bağlı tek tıkla dinamik ikonlu Masaüstü `.lnk` kısayolu.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const APP_USER_MODEL_ID = 'Vellium.PowerPilot';

const APP_ICON_IDS = Object.freeze([
    'monochrome-dark',
    'monochrome-light',
    'monochrome-contrast',
    'classic-cyan'
]);

const DEFAULT_APP_ICON = 'monochrome-dark';

function isValidAppIcon(id) {
    return typeof id === 'string' && APP_ICON_IDS.includes(id);
}

function normalizeAppIcon(id) {
    return isValidAppIcon(id) ? id : DEFAULT_APP_ICON;
}

/**
 * Seçili ikon varyantı için disk üzerindeki gerçek `.ico` yolunu çözer.
 */
function resolveIconIcoPath(iconId, {
    rootDir = path.resolve(__dirname, '..', '..', '..'),
    resourcesPath = process.resourcesPath || null,
    isPackaged = false,
    fsImpl = fs
} = {}) {
    const id = normalizeAppIcon(iconId);
    const candidates = [];
    if (isPackaged && resourcesPath) {
        candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'src', 'assets', 'icons', `${id}.ico`));
        candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'powerpilot_icon.ico'));
    }
    candidates.push(path.join(rootDir, 'src', 'assets', 'icons', `${id}.ico`));
    candidates.push(path.join(rootDir, 'powerpilot_icon.ico'));

    for (const candidate of candidates) {
        try {
            if (fsImpl.existsSync(candidate)) return candidate;
        } catch (_) { /* sonraki adaya düş */ }
    }
    return path.join(rootDir, 'powerpilot_icon.ico');
}

/**
 * Seçili ikon varyantı için disk üzerindeki gerçek `.png` (256x256) yolunu çözer.
 */
function resolveIconPngPath(iconId, {
    rootDir = path.resolve(__dirname, '..', '..', '..'),
    resourcesPath = process.resourcesPath || null,
    isPackaged = false,
    fsImpl = fs
} = {}) {
    const id = normalizeAppIcon(iconId);
    const candidates = [];
    if (isPackaged && resourcesPath) {
        candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'src', 'assets', 'icons', `${id}.png`));
    }
    candidates.push(path.join(rootDir, 'src', 'assets', 'icons', `${id}.png`));

    for (const candidate of candidates) {
        try {
            if (fsImpl.existsSync(candidate)) return candidate;
        } catch (_) { /* sonraki adaya düş */ }
    }
    return null;
}

/**
 * Electron `BrowserWindow.setIcon` / `Tray.setImage` için Windows DPI uyumlu
 * `NativeImage` oluşturur. `nativeImage` verilmezse güvenli biçimde `icoPath` döner.
 */
function buildRuntimeIconPayload(iconId, {
    icoPath,
    pngPath = null,
    nativeImage = null,
    targetSize = null
} = {}) {
    if (!nativeImage || typeof nativeImage.createFromPath !== 'function') {
        return icoPath;
    }
    try {
        const srcPath = pngPath || icoPath;
        const img = nativeImage.createFromPath(srcPath);
        if (img && typeof img.isEmpty === 'function' && !img.isEmpty()) {
            if (targetSize && typeof img.resize === 'function') {
                const resized = img.resize({ width: targetSize, height: targetSize, quality: 'best' });
                if (resized && !resized.isEmpty()) return resized;
            }
            return img;
        }
    } catch (_) { /* icoPath fallback */ }
    return icoPath;
}

/**
 * Windows `.lnk` kısayolunun işaret edeceği kalıcı `.ico` yolunu hazırlar.
 * Her varyantın dosya adı farklı olduğu için Windows Explorer simge önbelleği
 * eski ikonu göstermez.
 */
function ensureStableShortcutIco(iconId, {
    sourceIcoPath,
    userDataDir = null,
    isPortable = false,
    isPackaged = false,
    fsImpl = fs
} = {}) {
    const id = normalizeAppIcon(iconId);
    if (!sourceIcoPath) return null;

    const isPermanentUnpacked = isPackaged && !isPortable
        && sourceIcoPath.includes('app.asar.unpacked')
        && !/[\\/]Temp[\\/]/i.test(sourceIcoPath);
    if (isPermanentUnpacked) return sourceIcoPath;

    if (!userDataDir) return sourceIcoPath;
    try {
        const iconStoreDir = path.join(userDataDir, 'icons');
        fsImpl.mkdirSync(iconStoreDir, { recursive: true });
        const target = path.join(iconStoreDir, `powerpilot-${id}.ico`);
        fsImpl.copyFileSync(sourceIcoPath, target);
        return target;
    } catch (_) {
        return sourceIcoPath;
    }
}

function looksLikePowerPilotShortcut(lnkPath, details) {
    const base = path.basename(lnkPath).toLowerCase();
    if (base.includes('power pilot') || base.includes('powerpilot')) return true;
    const target = String((details && details.target) || '').toLowerCase();
    if ((target.includes('power pilot') || target.includes('powerpilot')) && target.endsWith('.exe')) return true;
    return target.endsWith('\\power pilot.exe') || target.endsWith('/power pilot.exe')
        || target.endsWith('\\powerpilot.exe') || target.endsWith('/powerpilot.exe');
}

function collectCandidateLnkFiles(dirs, fsImpl = fs, maxDepth = 2) {
    const found = [];
    const seen = new Set();
    const scan = (dir, depth) => {
        if (!dir || typeof dir !== 'string' || depth > maxDepth) return;
        let entries;
        try {
            if (!fsImpl.existsSync(dir)) return;
            entries = fsImpl.readdirSync(dir, { withFileTypes: true });
        } catch (_) {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (depth < maxDepth) scan(full, depth + 1);
                continue;
            }
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.lnk')) continue;
            const norm = full.toLowerCase();
            if (seen.has(norm)) continue;
            seen.add(norm);
            found.push(full);
        }
    };
    for (const dir of dirs) scan(dir, 0);
    return found;
}

/**
 * Mevcut Power Pilot Masaüstü / Başlat Menüsü / Sabitlenmiş Görev Çubuğu `.lnk`
 * kısayollarının ikonunu ve `appUserModelId` değerini günceller.
 */
function updateWindowsShortcuts(icoPath, {
    shell,
    desktopDirs = [],
    startMenuDirs = [],
    taskbarDirs = [],
    isStoreBuild = false,
    platform = process.platform,
    fsImpl = fs,
    logger = null
} = {}) {
    if (platform !== 'win32' || !icoPath || !shell
        || typeof shell.readShortcutLink !== 'function'
        || typeof shell.writeShortcutLink !== 'function') {
        return { updated: [], skipped: true };
    }

    // Store (MSIX) sürümünde Başlat Menüsü kutucuğu Windows paket manifestiyle
    // yönetilir; yalnızca kullanıcının masaüstü/görev çubuğu kısayolları güncellenir.
    const dirs = isStoreBuild
        ? [...desktopDirs, ...taskbarDirs]
        : [...desktopDirs, ...startMenuDirs, ...taskbarDirs];
    const candidates = collectCandidateLnkFiles(dirs, fsImpl, 2);
    const updated = [];

    for (const lnkPath of candidates) {
        let existing;
        try {
            existing = shell.readShortcutLink(lnkPath);
        } catch (_) {
            continue;
        }
        if (!looksLikePowerPilotShortcut(lnkPath, existing)) continue;
        try {
            const shortcutDetails = {
                target: existing.target,
                cwd: existing.cwd || (existing.target ? path.dirname(existing.target) : undefined),
                args: existing.args || undefined,
                description: existing.description || undefined,
                icon: icoPath,
                iconIndex: 0,
                appUserModelId: existing.appUserModelId || APP_USER_MODEL_ID
            };
            let ok = shell.writeShortcutLink(lnkPath, 'update', shortcutDetails);
            // Windows 11'de NSIS kısayolları 'update' çağrısında mevcut IconLocation'ı
            // korumaya çalışabilir; doğrulama farklı ikon gösterirse 'replace' ile yenile.
            if (ok) {
                try {
                    const verify = shell.readShortcutLink(lnkPath);
                    if (verify && typeof verify.icon === 'string' && verify.icon.length > 0
                        && verify.icon.toLowerCase() !== icoPath.toLowerCase()) {
                        ok = shell.writeShortcutLink(lnkPath, 'replace', shortcutDetails);
                    }
                } catch (_) { /* yut */ }
            } else {
                ok = shell.writeShortcutLink(lnkPath, 'replace', shortcutDetails);
            }
            if (ok) {
                // Explorer'ın değişikliği hemen algılaması için dosya zaman damgasını tazele.
                try {
                    const now = new Date();
                    fsImpl.utimesSync(lnkPath, now, now);
                } catch (_) { /* best-effort */ }
                updated.push(lnkPath);
            }
        } catch (err) {
            if (logger) logger.warn(`[AppIcon] kısayol güncellenemedi (${lnkPath}):`, err && err.message);
        }
    }
    return { updated, skipped: false };
}

/**
 * Masaüstünde (özellikle Portable kullanıcıları için) seçili dinamik ikona sahip
 * bir `.lnk` kısayolu oluşturur / günceller.
 */
function createDesktopShortcut({
    desktopDir,
    targetExePath,
    icoPath,
    shell,
    isPortable = false,
    shortcutName = null,
    platform = process.platform,
    execFileImpl = execFile,
    logger = null
} = {}) {
    if (platform !== 'win32' || !desktopDir || !targetExePath || !icoPath
        || !shell || typeof shell.writeShortcutLink !== 'function') {
        return { ok: false, code: 'UNSUPPORTED' };
    }
    const fileName = shortcutName || (isPortable ? 'Power Pilot Portable.lnk' : 'Power Pilot.lnk');
    const lnkPath = path.join(desktopDir, fileName);
    try {
        const ok = shell.writeShortcutLink(lnkPath, 'replace', {
            target: targetExePath,
            cwd: path.dirname(targetExePath),
            description: isPortable
                ? 'Power Pilot Portable — Smart Power Automation'
                : 'Power Pilot — Smart Power Automation',
            icon: icoPath,
            iconIndex: 0,
            appUserModelId: APP_USER_MODEL_ID
        });
        if (!ok) return { ok: false, code: 'WRITE_FAILED' };
        refreshWindowsIconCache({
            platform,
            execFileImpl,
            updatedPaths: [lnkPath],
            affectedDirs: [desktopDir]
        });
        return { ok: true, shortcutPath: lnkPath, iconPath: icoPath };
    } catch (err) {
        if (logger) logger.warn('[AppIcon] masaüstü kısayolu oluşturulamadı:', err && err.message);
        return { ok: false, code: 'WRITE_ERROR', error: err && err.message };
    }
}

function psSingleQuote(value) {
    return `'${String(value || '').replace(/'/g, "''")}'`;
}

function encodePowerShellUtf16(script) {
    return Buffer.from(String(script || ''), 'utf16le').toString('base64');
}

/**
 * NSIS kurulumunda Windows "Yüklü Uygulamalar" `DisplayIcon` kaydını günceller.
 */
function updateUninstallDisplayIcon(icoPath, {
    platform = process.platform,
    isStoreBuild = false,
    isPortable = false,
    isPackaged = false,
    execFileImpl = execFile
} = {}) {
    if (platform !== 'win32' || !icoPath || isStoreBuild || isPortable || !isPackaged) return;
    const psScript = [
        "$ErrorActionPreference='SilentlyContinue'",
        `$ico = ${psSingleQuote(`${icoPath},0`)}`,
        "$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
        "Get-ItemProperty $roots | Where-Object { $_.DisplayName -eq 'Power Pilot' -and $_.Publisher -eq 'Vellium' } | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name DisplayIcon -Value $ico }"
    ].join('\n');
    try {
        execFileImpl(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encodePowerShellUtf16(psScript)],
            { windowsHide: true, timeout: 15000 },
            () => {}
        );
    } catch (_) { /* best-effort */ }
}

/**
 * Windows Explorer masaüstü ve görev çubuğu simge önbelleğini tazeler (no-shell execFile).
 * Hem `ie4uinit.exe -show` hem de Win32 `Shell32::SHChangeNotify` (UPDATEITEM + UPDATEDIR + ASSOCCHANGED)
 * UTF-16LE `-EncodedCommand` ile tırnak bozulması olmadan tetiklenir.
 */
function refreshWindowsIconCache({
    platform = process.platform,
    execFileImpl = execFile,
    updatedPaths = [],
    affectedDirs = []
} = {}) {
    if (platform !== 'win32') return;
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const ie4uinit = path.join(sysRoot, 'System32', 'ie4uinit.exe');
    try {
        if (fs.existsSync(ie4uinit)) {
            execFileImpl(ie4uinit, ['-show'], { windowsHide: true, timeout: 8000 }, () => {});
        }
    } catch (_) { /* best-effort */ }

    const itemLines = Array.from(new Set((updatedPaths || []).filter(Boolean)))
        .map((p) => `[PPShNotify]::SHChangeNotify(0x00002000, 0x1005, ${psSingleQuote(p)}, $null)`);
    const dirSet = new Set((affectedDirs || []).filter(Boolean));
    for (const p of updatedPaths || []) {
        if (p) dirSet.add(path.dirname(p));
    }
    const dirLines = Array.from(dirSet)
        .map((d) => `[PPShNotify]::SHChangeNotify(0x00001000, 0x1005, ${psSingleQuote(d)}, $null)`);

    const psScript = [
        "$ErrorActionPreference='SilentlyContinue'",
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public static class PPShNotify {',
        '  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]',
        '  public static extern void SHChangeNotify(int wEventId, uint uFlags, string dwItem1, string dwItem2);',
        '  [DllImport("shell32.dll")]',
        '  public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);',
        '}',
        '"@',
        ...itemLines,
        ...dirLines,
        '[PPShNotify]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)'
    ].join('\n');

    try {
        execFileImpl(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encodePowerShellUtf16(psScript)],
            { windowsHide: true, timeout: 15000 },
            () => {}
        );
    } catch (_) { /* best-effort */ }
}

/**
 * Seçilen ikonu çalışma zamanında tüm hedeflere uygular:
 * ana pencere, mini pencere, sistem tepsisi, kısayollar ve önbellek.
 */
function applyAppIcon(iconId, {
    mainWindow = null,
    miniWindow = null,
    tray = null,
    shell = null,
    nativeImage = null,
    rootDir = path.resolve(__dirname, '..', '..', '..'),
    resourcesPath = process.resourcesPath || null,
    userDataDir = null,
    desktopDirs = [],
    startMenuDirs = [],
    taskbarDirs = [],
    isPortable = false,
    isStoreBuild = false,
    isPackaged = false,
    updateShortcuts = true,
    platform = process.platform,
    fsImpl = fs,
    execFileImpl = execFile,
    logger = null
} = {}) {
    const id = normalizeAppIcon(iconId);
    const icoPath = resolveIconIcoPath(id, { rootDir, resourcesPath, isPackaged, fsImpl });
    const pngPath = resolveIconPngPath(id, { rootDir, resourcesPath, isPackaged, fsImpl });

    const windowIcon = buildRuntimeIconPayload(id, { icoPath, pngPath, nativeImage });
    const trayIcon = buildRuntimeIconPayload(id, { icoPath, pngPath, nativeImage, targetSize: 32 });

    if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.setIcon === 'function') {
        try {
            mainWindow.setIcon(windowIcon);
            if (typeof mainWindow.setOverlayIcon === 'function') {
                try { mainWindow.setOverlayIcon(null, ''); } catch (_) { /* yut */ }
            }
        } catch (err) {
            if (logger) logger.warn('[AppIcon] ana pencere ikonu güncellenemedi:', err && err.message);
        }
    }

    if (miniWindow && !miniWindow.isDestroyed() && typeof miniWindow.setIcon === 'function') {
        try {
            miniWindow.setIcon(windowIcon);
        } catch (err) {
            if (logger) logger.warn('[AppIcon] mini pencere ikonu güncellenemedi:', err && err.message);
        }
    }

    if (tray && !tray.isDestroyed() && typeof tray.setImage === 'function') {
        try {
            tray.setImage(trayIcon);
        } catch (err) {
            if (logger) logger.warn('[AppIcon] tepsi ikonu güncellenemedi:', err && err.message);
        }
    }

    let shortcuts = { updated: [], skipped: !updateShortcuts };
    if (updateShortcuts && platform === 'win32') {
        const stableIco = ensureStableShortcutIco(id, {
            sourceIcoPath: icoPath,
            userDataDir,
            isPortable,
            isPackaged,
            fsImpl
        });
        shortcuts = updateWindowsShortcuts(stableIco, {
            shell,
            desktopDirs,
            startMenuDirs,
            taskbarDirs,
            isStoreBuild,
            platform,
            fsImpl,
            logger
        });
        updateUninstallDisplayIcon(stableIco, {
            platform,
            isStoreBuild,
            isPortable,
            isPackaged,
            execFileImpl
        });
        if (shortcuts.updated.length > 0) {
            refreshWindowsIconCache({
                platform,
                execFileImpl,
                updatedPaths: shortcuts.updated,
                affectedDirs: [...desktopDirs, ...startMenuDirs, ...taskbarDirs]
            });
        }
    }

    return {
        ok: true,
        iconId: id,
        icoPath,
        pngPath,
        shortcutsUpdated: shortcuts.updated,
        isPortable: !!isPortable
    };
}

module.exports = {
    APP_USER_MODEL_ID,
    APP_ICON_IDS,
    DEFAULT_APP_ICON,
    isValidAppIcon,
    normalizeAppIcon,
    resolveIconIcoPath,
    resolveIconPngPath,
    buildRuntimeIconPayload,
    ensureStableShortcutIco,
    updateWindowsShortcuts,
    createDesktopShortcut,
    updateUninstallDisplayIcon,
    refreshWindowsIconCache,
    applyAppIcon
};
