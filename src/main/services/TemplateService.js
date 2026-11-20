/**
 * TemplateService.js
 * Preset automation templates for non-technical users (WBS-6.3: 10 hazır şablon)
 * + user templates merged from StorageService (WBS-6.4).
 * Kural: her şablon ya desteklenen bir defaultCondition ya da schedule.timeOfDay
 * içermek zorundadır (ölü şablon yasaktır — templates.test.mjs ile korunur).
 */

const os = require('os');
const path = require('path');
const { canonicalProcessName } = require('./processNames');
const { PowerService } = require('./PowerService');

const SUPPORTED_TEMPLATE_CONDITIONS = new Set([
    'process_running', 'cpu_usage', 'user_idle', 'file_stable',
    'directory_idle', 'network_speed', 'disk_activity', 'battery_level'
]);

class TemplateService {
    constructor(storageService = null) {
        this.storage = storageService;
        this.templates = [
            {
                id: 'tpl_download_shutdown',
                name: 'İndirme Bitince Kapat',
                description: 'Ağ indirme hızı belirlediğiniz eşiğin altına düştüğünde bilgisayarı güvenle kapatır.',
                action: 'shutdown',
                icon: 'download_done',
                category: 'download',
                defaultCondition: {
                    type: 'network_speed',
                    thresholdKbps: 50,
                    stabilitySeconds: 60
                }
            },
            {
                id: 'tpl_render_shutdown',
                name: 'Render Bitince Kapat',
                description: 'HandBrake, Premiere veya Blender gibi render yazılımınız kapandığında veya CPU kullanımı %10 altına düştüğünde kapatır.',
                action: 'shutdown',
                icon: 'video_settings',
                category: 'render',
                defaultCondition: {
                    type: 'cpu_usage',
                    thresholdPercent: 10,
                    stabilitySeconds: 120
                }
            },
            {
                id: 'tpl_idle_sleep',
                name: 'Gece Boşta Kalırsa Uyut',
                description: 'Klavye ve fare 15 dakika boyunca kullanılmazsa bilgisayarı uyku moduna alır.',
                action: 'sleep',
                icon: 'bedtime',
                category: 'idle',
                defaultCondition: {
                    type: 'user_idle',
                    idleSeconds: 900,
                    stabilitySeconds: 10
                }
            },
            {
                id: 'tpl_process_lock',
                name: 'Chrome Kapanınca Kilitle',
                description: 'Chrome tarayıcısı kapandığında ekranı otomatik kilitler. Farklı bir uygulama için şablonu düzenleyin.',
                action: 'lock',
                icon: 'lock',
                category: 'security',
                defaultCondition: {
                    type: 'process_running',
                    triggerOnClose: true,
                    processName: 'chrome.exe'
                }
            },
            {
                id: 'tpl_steam_download',
                name: 'Steam İndirmesi Bitince Kapat',
                description: 'Steam çalışırken ağ durulursa (indirme bittiyse) bilgisayarı kapatır.',
                action: 'shutdown',
                icon: 'sports_esports',
                category: 'download',
                defaultConditionGroup: {
                    operator: 'AND',
                    stabilitySeconds: 60,
                    conditions: [
                        { type: 'process_running', processName: 'steam.exe', triggerOnClose: false },
                        { type: 'network_speed', thresholdKbps: 50 }
                    ]
                }
            },
            {
                id: 'tpl_meeting_lock',
                name: 'Toplantı Bitince Kilitle',
                description: 'Zoom veya Teams kapandığında ekranı otomatik kilitler.',
                action: 'lock',
                icon: 'video_call',
                category: 'security',
                defaultCondition: {
                    type: 'process_running',
                    triggerOnClose: true,
                    processName: 'zoom.exe'
                }
            },
            {
                id: 'tpl_nightly_sleep',
                name: 'Her Gece 01:00 Uyut',
                description: 'Her gece saat 01:00\u2019de bilgisayarı uyku moduna alır.',
                action: 'sleep',
                icon: 'nightlight',
                category: 'schedule',
                schedule: { timeOfDay: '01:00' }
            },
            {
                id: 'tpl_battery_hibernate',
                name: 'Pil Azalınca Hazırda Beklet',
                description: 'Batarya %20\u2019nin altına düşünce oturumu diske kaydedip bekletir.',
                action: 'hibernate',
                icon: 'battery_alert',
                category: 'power',
                defaultCondition: {
                    type: 'battery_level',
                    belowPercent: 20,
                    stabilitySeconds: 30
                }
            },
            {
                id: 'tpl_backup_stable',
                name: 'İndirilenler Sabitlenince Kapat',
                description: 'İndirilenler klasörü 5 dakika değişmezse (indirme bittiyse) kapatır. Farklı klasör için şablonu düzenleyin.',
                action: 'shutdown',
                icon: 'folder_copy',
                category: 'download',
                defaultCondition: {
                    // K-05: klasör mtime'ı yerine içerik imzası izlenir.
                    type: 'directory_idle',
                    dirPath: path.join(os.homedir(), 'Downloads'),
                    stableSeconds: 300
                }
            },
            {
                id: 'tpl_presentation_lock',
                name: 'Sunum Kapanınca Kilitle',
                description: 'PowerPoint kapandığında (sunum bittiyse) ekranı kilitler.',
                action: 'lock',
                icon: 'present_to_all',
                category: 'security',
                defaultCondition: {
                    type: 'process_running',
                    triggerOnClose: true,
                    processName: 'powerpnt.exe'
                }
            }
        ];
    }

    static isSupportedCondition(type) {
        return SUPPORTED_TEMPLATE_CONDITIONS.has(type);
    }

    // WP-03: Şablonun koşulu yalnızca tip olarak değil, çalıştırılabilir
    // alanlarıyla da geçerli olmalı. Boş processName "kapandı" sayılıp
    // yanlış otomatik kilitlemeye yol açamaz.
    static isRunnableCondition(cond) {
        if (!cond || typeof cond !== 'object' || !TemplateService.isSupportedCondition(cond.type)) return false;
        if (cond.type === 'process_running') return canonicalProcessName(cond.processName).length > 0;
        if (cond.type === 'file_stable') return typeof cond.filePath === 'string' && cond.filePath.trim().length > 0;
        if (cond.type === 'directory_idle') return typeof (cond.dirPath || cond.filePath) === 'string' && String(cond.dirPath || cond.filePath).trim().length > 0;
        if (cond.type === 'cpu_usage') {
            return cond.thresholdPercent == null || (typeof cond.thresholdPercent === 'number' && cond.thresholdPercent >= 0 && cond.thresholdPercent <= 100);
        }
        if (cond.type === 'user_idle') {
            return cond.idleSeconds == null || (Number.isInteger(cond.idleSeconds) && cond.idleSeconds >= 1);
        }
        if (cond.type === 'network_speed' || cond.type === 'disk_activity') {
            return cond.thresholdKbps == null || (typeof cond.thresholdKbps === 'number' && cond.thresholdKbps >= 0);
        }
        if (cond.type === 'battery_level') {
            return cond.belowPercent != null || cond.abovePercent != null;
        }
        return true;
    }

    // Şablon geçerliliği: koşul destekli olmalı YA DA zamanlamalı olmalı.
    static isValidTemplate(tpl) {
        if (!tpl || typeof tpl !== 'object') return false;
        if (typeof tpl.id !== 'string' || typeof tpl.name !== 'string' || typeof tpl.action !== 'string') return false;
        if (!PowerService.isValidAction(tpl.action)) return false;
        if (tpl.name.length === 0 || tpl.name.length > 80) return false;
        const cond = tpl.defaultCondition;
        const group = tpl.defaultConditionGroup;
        const sched = tpl.schedule;
        if (cond && TemplateService.isRunnableCondition(cond)) return true;
        if (group && Array.isArray(group.conditions) && group.conditions.length > 0 &&
            group.conditions.every((c) => TemplateService.isRunnableCondition(c))) return true;
        if (sched && typeof sched.timeOfDay === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(sched.timeOfDay)) return true;
        return false;
    }

    getTemplates() {
        const customs = this.storage && typeof this.storage.getTemplates === 'function'
            ? this.storage.getTemplates()
            : [];
        // Bozuk kullanıcı kayıtları sessizce değil, disabled karantinayla listelenir.
        const quarantined = (customs || []).map((tpl) => {
            if (TemplateService.isValidTemplate(tpl)) return { ...tpl, custom: true };
            return { ...tpl, custom: true, disabled: true, disabledReason: 'Geçersiz şablon kaydı (karantina)' };
        });
        return [...this.templates, ...quarantined];
    }
}

module.exports = TemplateService;
