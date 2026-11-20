/**
 * Paket hijyeni (P2): kurulum paketi kullanıcıya artık dosya göndermemeli.
 *
 * Ölçülen kusur: `node_modules/electron/dist/debug.log` (38 KB, geliştirme
 * sırasında oluşmuş Chromium hata günlüğü) electron-builder tarafından
 * olduğu gibi `win-unpacked`'a ve dolayısıyla NSIS/MSIX paketine kopyalanıyordu.
 * Kullanıcı kurulumla birlikte eski bir hata günlüğü alıyordu; içinde yerel
 * yollar olabilir.
 *
 * Davranış: `scripts/after-pack.cjs` paketleme sonrası bilinen artıkları siler.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { removePackArtifacts, PACK_ARTIFACTS } = require('../../scripts/after-pack.cjs');

describe('after-pack artık temizliği', () => {
    it('bilinen artıkları siler (debug.log / chrome_debug.log)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-afterpack-'));
        for (const name of PACK_ARTIFACTS) {
            fs.writeFileSync(path.join(dir, name), 'eski log');
        }
        // Uygulamanın kendi dosyaları korunmalı.
        fs.writeFileSync(path.join(dir, 'Power Pilot.exe'), 'exe');
        fs.writeFileSync(path.join(dir, 'keep.txt'), 'x');

        removePackArtifacts(dir);

        for (const name of PACK_ARTIFACTS) {
            expect(fs.existsSync(path.join(dir, name)), `${name} silinmeli`).toBe(false);
        }
        expect(fs.existsSync(path.join(dir, 'Power Pilot.exe'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'keep.txt'))).toBe(true);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('artık dosyası olmayan klasörde hata üretmez', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-afterpack-'));
        expect(() => removePackArtifacts(dir)).not.toThrow();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('debug.log kaynak electron dist içinde yok (bir daha paketlenmesin)', () => {
        const src = path.join(process.cwd(), 'node_modules/electron/dist/debug.log');
        expect(fs.existsSync(src), 'node_modules/electron/dist/debug.log kalmamalı').toBe(false);
    });
});
