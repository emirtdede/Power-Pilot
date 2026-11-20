/**
 * Çekirdek vaat: "Uygulama kapalıyken bile görev çalışır" (P0, ürün değeri).
 *
 * Kullanıcı bilgisayarını kapatmadan önce uygulamayı kapatır. Beklentisi
 * görevin yine de çalışmasıdır. Zincir:
 *   1) `scheduled` görev → Windows Görev Zamanlayıcı kaydı
 *   2) Uygulama kapalı
 *   3) Windows `Power Pilot.exe --run-task=<id>` çalıştırır
 *   4) Açılışta görev normal boru hattından çalışır, kayıt tüketilir
 *
 * Davranış ölçümü: `scratch/probe-run-task-closed.cjs` (5/5 PASS).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TaskSchedulerBridge = require('../../src/main/services/TaskSchedulerBridge.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const mainSrc = fs.readFileSync(path.join(here, '../../main.js'), 'utf8');

describe('--run-task açılış yolu', () => {
    it('argv doğru ayrıştırılır, geçersiz kimlik yok sayılır', () => {
        expect(TaskSchedulerBridge.parseRunTaskArgv(['--run-task=task_abc123_ffffffff']))
            .toBe('task_abc123_ffffffff');
        expect(TaskSchedulerBridge.parseRunTaskArgv(['--other'])).toBe(null);
        // Yol enjeksiyonu / boş kimlik kabul edilmez.
        expect(TaskSchedulerBridge.parseRunTaskArgv(['--run-task=../../evil'])).toBe(null);
        expect(TaskSchedulerBridge.parseRunTaskArgv(['--run-task='])).toBe(null);
    });

    it('main.js açılışta run-task bayrağını çalıştırır ve kaydı tüketir', () => {
        const idx = mainSrc.indexOf('TaskSchedulerBridge.parseRunTaskArgv(process.argv)');
        expect(idx).toBeGreaterThan(-1);
        const block = mainSrc.slice(idx, idx + 700);
        expect(block).toMatch(/runTaskNow/);
        // Tek seferlik kayıt silinmeli; aksi hâlde her açılışta yeniden tetiklenir.
        expect(block).toMatch(/removeTask/);
        // Pencere hazır olduktan sonra (uyarı kartı gösterilebilsin).
        const appReady = mainSrc.indexOf("app.whenReady()");
        expect(appReady).toBeGreaterThan(-1);
        expect(idx).toBeGreaterThan(appReady);
    });

    it('XML tanımı yerel ayardan bağımsız ve uykuda kaçırmıyor', () => {
        const task = {
            id: 'task_abc123_deadbeef',
            trigger: { type: 'absolute', targetTime: Date.UTC(2026, 10, 19, 12, 0, 0) },
            action: 'lock'
        };
        const xml = TaskSchedulerBridge.buildXml(task, 'C:\\App\\Power Pilot.exe');
        // ISO 8601 StartBoundary (yerel ayar bağımlı /sd biçimi değil).
        expect(xml).toMatch(/<StartBoundary>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/StartBoundary>/);
        // Uyku/kapalıyken kaçırılan tetikleme açılınca çalışmalı.
        expect(xml).toContain('<StartWhenAvailable>true</StartWhenAvailable>');
        // Dizüstü pille çalışırken sessizce atlanmamalı.
        expect(xml).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
        // Çift tetikleme güvenli.
        expect(xml).toContain('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>');
    });

    it('uygulama kapalıyken yazılan kayıt yalnızca koşulsuz scheduled görevlerdir', () => {
        const bridge = new TaskSchedulerBridge({
            exePath: 'C:\\App\\Power Pilot.exe',
            isStoreApp: false,
            nowFn: () => Date.UTC(2026, 10, 19, 10, 0, 0)
        });
        const future = Date.UTC(2026, 10, 19, 12, 0, 0);
        expect(bridge.shouldSync({ id: 'task_a_1', status: 'scheduled', enabled: true, trigger: { targetTime: future } }))
            .toBe(true);
        // Koşullu görev Windows'a yazılmaz (Smart Finish uygulama açıkken izler).
        expect(bridge.shouldSync({
            id: 'task_a_2', status: 'scheduled', enabled: true,
            trigger: { targetTime: future },
            conditionGroup: { conditions: [{ type: 'idle' }] }
        })).toBe(false);
        // Store sürümünde schtasks kullanılmaz.
        const store = new TaskSchedulerBridge({ exePath: 'x', isStoreApp: true });
        expect(store.shouldSync({ id: 'task_a_3', status: 'scheduled', enabled: true, trigger: { targetTime: future } }))
            .toBe(false);
    });
});
