/**
 * Windows Görev Zamanlayıcı kayıtlarının sahipsiz kalması (P1).
 *
 * Kayıtlar veri klasörünün dışında yaşar. Veri silindiğinde (veya bozuk DB
 * karantinaya alındığında) temizlenmezlerse tetikleme saatinde Windows
 * uygulamayı `--run-task=<silinmiş id>` ile açar; kullanıcı "verilerimi
 * sildim ama uygulama kendi kendine açıldı" der. Ölçüm:
 * `scratch/probe-wipe-scheduler.cjs` (9/9 PASS).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainSrc = fs.readFileSync(path.join(here, '../../main.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(here, '../../package.json'), 'utf8'));

describe('veri silme → zamanlayıcı temizliği', () => {
    it('delete-all-data kayıtları silmeden ÖNCE temizler', () => {
        const start = mainSrc.indexOf("ipcHandle('delete-all-data'");
        expect(start).toBeGreaterThan(-1);
        const block = mainSrc.slice(start, start + 3500);
        expect(block).toMatch(/removeAllTasks/);
        // Sıra önemli: temizlik performWipe'tan önce.
        expect(block.indexOf('removeAllTasks')).toBeLessThan(block.indexOf('DataWipe.performWipe'));
    });

    it('bozuk DB kurtarmasında sahipsiz kayıtlar silinir', () => {
        expect(mainSrc).toMatch(/storageService\.recoveredFrom[\s\S]{0,400}removeAllTasks/);
    });

    it('silinemeyen temel veri sonraki açılışta tamamlanır (işaret dosyası)', () => {
        expect(mainSrc).toMatch(/writePendingWipe/);
        expect(mainSrc).toMatch(/applyPendingWipe/);
        // İşaret userData DIŞINDA olmalı; aksi hâlde wipe onu da siler.
        expect(mainSrc).toMatch(/pendingWipeMarkerPath[\s\S]{0,200}getPath\('temp'\)/);
        // Depo açılmadan önce uygulanır.
        const applyIdx = mainSrc.indexOf('DataWipe.applyPendingWipe');
        const storageIdx = mainSrc.indexOf('storageService = new StorageService()');
        expect(applyIdx).toBeGreaterThan(-1);
        expect(applyIdx).toBeLessThan(storageIdx);
    });
});

describe('kaldırma (uninstall) temizliği', () => {
    it('NSIS kaldırıcısı \\PowerPilot görevlerini siler', () => {
        const nsh = fs.readFileSync(path.join(here, '../../build/installer.nsh'), 'utf8');
        expect(nsh).toMatch(/!macro customUnInstall/);
        expect(nsh).toMatch(/Unregister-ScheduledTask/);
        expect(nsh).toMatch(/TaskPath \\PowerPilot\*/);
    });

    it('electron-builder include dosyayı kullanıyor', () => {
        expect(pkg.build.nsis.include).toBe('build/installer.nsh');
    });
});
