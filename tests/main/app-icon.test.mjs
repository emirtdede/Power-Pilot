/**
 * app-icon.test.mjs — Çoklu çözünürlüklü marka ikonları, Microsoft Store MSIX
 * varlık bütünlüğü ve 4 seçilebilir masaüstü/uygulama ikonu sözleşmesi.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AppIconService = require('../../src/main/services/AppIconService.js');
const { validateSettings } = require('../../src/main/ipc/validate.js');
const StorageService = require('../../src/main/services/StorageService.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpDirs = [];
function freshDir(prefix = 'pp-icon-test-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
}

afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* yut */ }
    }
});

/** ICO dosyasının başlık dizininden gömülü kare boyutlarını okur. */
function readIcoSizes(filePath) {
    const buf = fs.readFileSync(filePath);
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    const count = buf.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i++) {
        const off = 6 + i * 16;
        const w = buf[off] === 0 ? 256 : buf[off];
        sizes.push(w);
    }
    return sizes.sort((a, b) => a - b);
}

describe('AppIconService — varlık bütünlüğü ve Microsoft Store uyumu', () => {
    it('4 seçilebilir ikonun SVG, PNG ve 7-boyutlu ICO dosyaları mevcut', () => {
        expect(AppIconService.DEFAULT_APP_ICON).toBe('monochrome-dark');
        expect(AppIconService.APP_ICON_IDS).toEqual([
            'monochrome-dark', 'monochrome-light', 'monochrome-contrast', 'classic-cyan'
        ]);
        for (const id of AppIconService.APP_ICON_IDS) {
            for (const ext of ['svg', 'png', 'ico']) {
                const file = path.join(root, 'src', 'assets', 'icons', `${id}.${ext}`);
                expect(fs.existsSync(file), `${id}.${ext} eksik`).toBe(true);
            }
            const ico = path.join(root, 'src', 'assets', 'icons', `${id}.ico`);
            expect(readIcoSizes(ico), `${id}.ico kareleri`).toEqual([16, 24, 32, 48, 64, 128, 256]);
        }
        // Kök dizinde dağınık powerpilot_icon.ico / powerpilot_icon.png bulunmamalı;
        // kanonik ikonlar src/assets/icons/ altında tutulur.
        expect(fs.existsSync(path.join(root, 'powerpilot_icon.ico'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'powerpilot_icon.png'))).toBe(false);
    });

    it('build/appx tam çoklu-DPI (scale-100..400 + targetsize unplated) Store setini içerir', () => {
        const appxDir = path.join(root, 'build', 'appx');
        const files = fs.readdirSync(appxDir);
        const required = [
            'StoreLogo.scale-100.png', 'StoreLogo.scale-200.png', 'StoreLogo.scale-400.png',
            'Square44x44Logo.scale-100.png', 'Square44x44Logo.scale-200.png',
            'Square44x44Logo.targetsize-16_altform-unplated.png',
            'Square44x44Logo.targetsize-32_altform-unplated.png',
            'Square44x44Logo.targetsize-256_altform-unplated.png',
            'Square44x44Logo.targetsize-32_altform-lightunplated.png',
            'SmallTile.scale-100.png', 'SmallTile.scale-400.png',
            'Square150x150Logo.scale-100.png', 'Square150x150Logo.scale-400.png',
            'Wide310x150Logo.scale-100.png', 'Wide310x150Logo.scale-400.png',
            'LargeTile.scale-100.png', 'LargeTile.scale-400.png',
            'SplashScreen.scale-100.png', 'SplashScreen.scale-200.png',
            'BadgeLogo.scale-100.png', 'BadgeLogo.scale-400.png'
        ];
        for (const name of required) {
            expect(files, `Store varlığı eksik: ${name}`).toContain(name);
        }
        // MakePRI çakışması yaratacak çıplak StoreLogo.png / Square44x44Logo.png olmamalı.
        expect(files).not.toContain('StoreLogo.png');
        expect(files).not.toContain('Square44x44Logo.png');
    });

    it('package.json NSIS ikonları ve asarUnpack yapılandırılmış', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        expect(pkg.build.win.icon).toBe('src/assets/icons/monochrome-dark.ico');
        expect(pkg.build.nsis.installerIcon).toBe('src/assets/icons/monochrome-dark.ico');
        expect(pkg.build.nsis.uninstallerIcon).toBe('src/assets/icons/monochrome-dark.ico');
        expect(pkg.build.nsis.installerHeaderIcon).toBe('src/assets/icons/monochrome-dark.ico');
        expect(pkg.build.asarUnpack).toContain('src/assets/icons/*.ico');
        expect(pkg.build.asarUnpack).toContain('src/assets/icons/*.png');
    });
});

describe('AppIconService — ayar doğrulama ve çalışma zamanı uygulaması', () => {
    it('validateSettings 4 geçerli ikonu kabul eder, geçersizi reddeder', () => {
        for (const id of AppIconService.APP_ICON_IDS) {
            expect(validateSettings({ appIcon: id }).ok).toBe(true);
        }
        expect(validateSettings({ appIcon: 'invalid-icon' }).ok).toBe(false);
        expect(validateSettings({ appIcon: '../evil.ico' }).ok).toBe(false);
    });

    it('StorageService varsayılan ayarı monochrome-dark', () => {
        const dir = freshDir();
        const storage = new StorageService(dir);
        try {
            expect(storage.getSettings().appIcon).toBe('monochrome-dark');
        } finally {
            storage.close();
        }
    });

    it('applyAppIcon pencere, mini pencere, tray ve Power Pilot kısayollarını günceller (diğerlerine dokunmaz)', () => {
        const desktop = freshDir('pp-desktop-');
        const startMenu = freshDir('pp-start-');
        const userData = freshDir('pp-ud-');
        const ppDesktopLnk = path.join(desktop, 'Power Pilot.lnk');
        const otherLnk = path.join(desktop, 'NotDefteri.lnk');
        const ppStartLnk = path.join(startMenu, 'Power Pilot.lnk');
        fs.writeFileSync(ppDesktopLnk, '');
        fs.writeFileSync(otherLnk, '');
        fs.writeFileSync(ppStartLnk, '');

        const mainWin = { isDestroyed: () => false, setIcon: vi.fn() };
        const miniWin = { isDestroyed: () => false, setIcon: vi.fn() };
        const tray = { isDestroyed: () => false, setImage: vi.fn() };
        const written = [];
        const fakeShell = {
            readShortcutLink: (p) => (p === otherLnk
                ? { target: 'C:\\Windows\\notepad.exe' }
                : { target: 'C:\\Users\\test\\AppData\\Local\\Programs\\Power Pilot\\Power Pilot.exe' }),
            writeShortcutLink: (p, op, details) => {
                written.push({ p, op, details });
                return true;
            }
        };
        const fakeExecFile = vi.fn();

        const res = AppIconService.applyAppIcon('monochrome-light', {
            mainWindow: mainWin,
            miniWindow: miniWin,
            tray,
            shell: fakeShell,
            rootDir: root,
            userDataDir: userData,
            desktopDirs: [desktop],
            startMenuDirs: [startMenu],
            isPortable: true,
            isStoreBuild: false,
            isPackaged: false,
            platform: 'win32',
            execFileImpl: fakeExecFile
        });

        expect(res.ok).toBe(true);
        expect(res.iconId).toBe('monochrome-light');
        expect(mainWin.setIcon).toHaveBeenCalledWith(res.icoPath);
        expect(miniWin.setIcon).toHaveBeenCalledWith(res.icoPath);
        expect(tray.setImage).toHaveBeenCalledWith(res.icoPath);
        expect(written.map((w) => w.p).sort()).toEqual([ppDesktopLnk, ppStartLnk].sort());
        expect(written.every((w) => w.op === 'update' && w.details.icon.endsWith('powerpilot-monochrome-light.ico'))).toBe(true);
        expect(fs.existsSync(path.join(userData, 'icons', 'powerpilot-monochrome-light.ico'))).toBe(true);
    });

    it('Store (MSIX) modunda Başlat Menüsü kısayollarına dokunmaz', () => {
        const desktop = freshDir('pp-store-desktop-');
        const startMenu = freshDir('pp-store-start-');
        const ppStartLnk = path.join(startMenu, 'Power Pilot.lnk');
        fs.writeFileSync(ppStartLnk, '');

        const written = [];
        const fakeShell = {
            readShortcutLink: () => ({ target: 'C:\\Program Files\\WindowsApps\\Power Pilot.exe' }),
            writeShortcutLink: (p) => { written.push(p); return true; }
        };

        const res = AppIconService.updateWindowsShortcuts(path.join(root, 'src', 'assets', 'icons', 'monochrome-dark.ico'), {
            shell: fakeShell,
            desktopDirs: [desktop],
            startMenuDirs: [startMenu],
            isStoreBuild: true,
            platform: 'win32'
        });

        expect(res.updated).toEqual([]);
        expect(written).toEqual([]);
    });

    it('WP-2: sabitlenmiş görev çubuğu kısayollarını günceller ve appUserModelId yazar', () => {
        const taskbar = freshDir('pp-taskbar-');
        const subDir = path.join(taskbar, 'SubApp');
        fs.mkdirSync(subDir, { recursive: true });
        const pinnedLnk = path.join(subDir, 'Power Pilot.lnk');
        fs.writeFileSync(pinnedLnk, '');

        const written = [];
        const fakeShell = {
            readShortcutLink: () => ({ target: 'C:\\Users\\test\\Power Pilot.exe' }),
            writeShortcutLink: (p, op, details) => { written.push({ p, op, details }); return true; }
        };

        const res = AppIconService.updateWindowsShortcuts(path.join(root, 'src', 'assets', 'icons', 'classic-cyan.ico'), {
            shell: fakeShell,
            desktopDirs: [],
            startMenuDirs: [],
            taskbarDirs: [taskbar],
            isStoreBuild: false,
            platform: 'win32'
        });

        expect(res.updated).toEqual([pinnedLnk]);
        expect(written[0].details.appUserModelId).toBe(AppIconService.APP_USER_MODEL_ID);
    });

    it('WP-2: createDesktopShortcut dinamik ikonlu masaüstü kısayolu oluşturur', () => {
        const desktop = freshDir('pp-create-lnk-');
        const created = [];
        const fakeShell = {
            writeShortcutLink: (p, op, details) => { created.push({ p, op, details }); return true; }
        };
        const r = AppIconService.createDesktopShortcut({
            desktopDir: desktop,
            targetExePath: 'C:\\Tools\\PowerPilot.exe',
            icoPath: path.join(root, 'src', 'assets', 'icons', 'classic-cyan.ico'),
            shell: fakeShell
        });
        expect(r.ok).toBe(true);
        expect(created).toHaveLength(1);
        expect(created[0].op).toBe('replace');
        expect(created[0].details.appUserModelId).toBe(AppIconService.APP_USER_MODEL_ID);
    });

    it('Portable modda ayrı Power Pilot Portable.lnk oluşturur ve SHChangeNotify -EncodedCommand ile tetikler', () => {
        const desktop = freshDir('pp-portable-lnk-');
        const created = [];
        const execCalls = [];
        const fakeShell = {
            writeShortcutLink: (p, op, details) => { created.push({ p, op, details }); return true; }
        };
        const fakeExecFile = (file, args) => { execCalls.push({ file, args }); };
        const r = AppIconService.createDesktopShortcut({
            desktopDir: desktop,
            targetExePath: 'C:\\Users\\test\\Desktop\\Power Pilot Portable 1.0.0.exe',
            icoPath: path.join(root, 'src', 'assets', 'icons', 'classic-cyan.ico'),
            shell: fakeShell,
            isPortable: true,
            execFileImpl: fakeExecFile
        });
        expect(r.ok).toBe(true);
        expect(path.basename(r.shortcutPath)).toBe('Power Pilot Portable.lnk');
        const psCall = execCalls.find((c) => /powershell/i.test(c.file));
        expect(psCall).toBeTruthy();
        expect(psCall.args).toContain('-EncodedCommand');
        const decoded = Buffer.from(psCall.args[psCall.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
        expect(decoded).toContain('SHChangeNotify(0x00002000');
        expect(decoded).toContain('SHChangeNotify(0x00001000');
        expect(decoded).toContain('SHChangeNotify(0x08000000');
    });

    it('paketli yol çözümü, NativeImage ölçekleme, replace fallback ve DisplayIcon dallarını kapsar', () => {
        const fakeResources = freshDir('pp-res-');
        const unpackedIcons = path.join(fakeResources, 'app.asar.unpacked', 'src', 'assets', 'icons');
        fs.mkdirSync(unpackedIcons, { recursive: true });
        const packedIco = path.join(unpackedIcons, 'classic-cyan.ico');
        const packedPng = path.join(unpackedIcons, 'classic-cyan.png');
        fs.copyFileSync(path.join(root, 'src', 'assets', 'icons', 'classic-cyan.ico'), packedIco);
        fs.copyFileSync(path.join(root, 'src', 'assets', 'icons', 'classic-cyan.png'), packedPng);

        expect(AppIconService.resolveIconIcoPath('classic-cyan', {
            rootDir: root,
            resourcesPath: fakeResources,
            isPackaged: true
        })).toBe(packedIco);
        expect(AppIconService.resolveIconPngPath('classic-cyan', {
            rootDir: root,
            resourcesPath: fakeResources,
            isPackaged: true
        })).toBe(packedPng);

        // Kalıcı unpacked kurulumda kopyalama yapmadan doğrudan unpacked yolu döner
        expect(AppIconService.ensureStableShortcutIco('classic-cyan', {
            sourceIcoPath: packedIco,
            isPackaged: true,
            isPortable: false
        })).toBe(packedIco);
        expect(AppIconService.ensureStableShortcutIco('classic-cyan', { sourceIcoPath: null })).toBeNull();

        // NativeImage resize dalı
        const resizedImg = { isEmpty: () => false, resized: true };
        const baseImg = {
            isEmpty: () => false,
            resize: vi.fn(() => resizedImg)
        };
        const payload = AppIconService.buildRuntimeIconPayload('classic-cyan', {
            icoPath: packedIco,
            pngPath: packedPng,
            nativeImage: { createFromPath: () => baseImg },
            targetSize: 32
        });
        expect(payload).toBe(resizedImg);

        // updateWindowsShortcuts: 'update' eski ikonu korursa 'replace' fallback çalışır
        const desktop = freshDir('pp-replace-');
        const lnk = path.join(desktop, 'Power Pilot.lnk');
        fs.writeFileSync(lnk, '');
        const ops = [];
        const shellReplaceFallback = {
            readShortcutLink: () => ({
                target: 'C:\\Program Files\\Power Pilot\\Power Pilot.exe',
                icon: 'C:\\old-icon.ico'
            }),
            writeShortcutLink: (p, op) => {
                ops.push(op);
                return true;
            }
        };
        const upd = AppIconService.updateWindowsShortcuts(packedIco, {
            shell: shellReplaceFallback,
            desktopDirs: [desktop],
            platform: 'win32'
        });
        expect(upd.updated).toEqual([lnk]);
        expect(ops).toEqual(['update', 'replace']);

        // Paketli kurulumda applyAppIcon hem setOverlayIcon hem DisplayIcon tetikler
        const execCalls = [];
        const overlayFn = vi.fn();
        AppIconService.applyAppIcon('classic-cyan', {
            mainWindow: { isDestroyed: () => false, setIcon: vi.fn(), setOverlayIcon: overlayFn },
            miniWindow: { isDestroyed: () => false, setIcon: vi.fn() },
            tray: { isDestroyed: () => false, setImage: vi.fn() },
            shell: shellReplaceFallback,
            rootDir: root,
            resourcesPath: fakeResources,
            desktopDirs: [desktop],
            isPortable: false,
            isStoreBuild: false,
            isPackaged: true,
            platform: 'win32',
            execFileImpl: (file, args) => execCalls.push({ file, args })
        });
        expect(overlayFn).toHaveBeenCalledWith(null, '');
        expect(execCalls.filter((c) => /powershell/i.test(c.file)).length).toBeGreaterThanOrEqual(2);
    });
});
