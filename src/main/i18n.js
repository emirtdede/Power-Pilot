'use strict';

/**
 * Main-process i18n loader — WP-14.T3.
 *
 * Yalnızca aktif dilin `<lang>.server.json` dosyası okunur (vm yok).
 * Eksik anahtar önce Türkçe sözlükten (tembel, tek seferlik) tamamlanır;
 * o da yoksa anahtarın kendisi döner ve uyarı yazılır.
 */

const fs = require('fs');
const path = require('path');
const log = require('./logger');

const LOCALE_DIR = path.join(__dirname, 'locales');
const LANGUAGE_ORDER = Object.freeze([
    'tr', 'en', 'de', 'sv', 'no', 'da', 'fr', 'pl', 'it', 'nl',
    'cs', 'es', 'pt', 'ja', 'zh', 'ko', 'ar'
]);
const LANGUAGE_ALIASES = Object.freeze({ nb: 'no', nbNo: 'no', 'nb-no': 'no', zhCn: 'zh', 'zh-cn': 'zh', ptPt: 'pt', 'pt-pt': 'pt' });
const cache = new Map();
let turkish = null;
const warned = new Set();

function normalizeLanguage(language) {
    const raw = String(language || '').trim();
    if (!raw) return 'tr';
    const lower = raw.toLowerCase();
    const alias = LANGUAGE_ALIASES[lower] || LANGUAGE_ALIASES[raw];
    if (alias) return alias;
    const base = lower.split('-')[0];
    return LANGUAGE_ORDER.includes(base) ? base : 'tr';
}

function readLocaleFile(lang) {
    const file = path.join(LOCALE_DIR, `${lang}.server.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadLocale(language) {
    const lang = normalizeLanguage(language);
    if (cache.has(lang)) return cache.get(lang);
    let dict;
    try {
        dict = readLocaleFile(lang);
    } catch (err) {
        log.warn(`[i18n] ${lang}.server.json okunamadı; Türkçe fallback:`, err && err.message);
        dict = loadTurkish();
    }
    cache.set(lang, dict);
    return dict;
}

function loadTurkish() {
    if (turkish) return turkish;
    try {
        turkish = readLocaleFile('tr');
    } catch (err) {
        log.error('[i18n] tr.server.json okunamadı:', err && err.message);
        turkish = {};
    }
    return turkish;
}

/** Geriye uyum: verilen dilin sözlüğünü döndürür (varsayılan tr). */
function loadTranslations(language = 'tr') {
    return loadLocale(language);
}

function interpolate(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    ));
}

function translate(language, key, vars) {
    const lang = normalizeLanguage(language);
    const dict = loadLocale(lang);
    let value = dict[key];
    if (typeof value !== 'string') {
        const fallback = loadTurkish();
        value = fallback[key];
        if (typeof value === 'string' && lang !== 'tr' && !warned.has(`${lang}:${key}`)) {
            warned.add(`${lang}:${key}`);
            log.warn(`[i18n] ${lang} için eksik anahtar: ${key} (tr fallback).`);
        }
    }
    if (typeof value !== 'string') {
        if (!warned.has(`missing:${key}`)) {
            warned.add(`missing:${key}`);
            log.warn(`[i18n] bilinmeyen anahtar: ${key}`);
        }
        value = String(key);
    }
    return interpolate(value, vars);
}

function actionLabel(language, action) {
    const key = action === 'shutdown' ? 'actionShutdown'
        : action === 'sleep' ? 'actionSleep'
            : action === 'hibernate' ? 'actionHibernate'
                : action === 'restart' ? 'actionRestart'
                    : action === 'lock' ? 'actionLock'
                        : action === 'signout' ? 'actionSignout'
                            : null;
    return key ? translate(language, key) : String(action || '');
}

// Stored built-in templates use Turkish names. Map them to the same i18n keys
// the renderer uses so tray labels follow the active language.
const BUILTIN_TEMPLATE_KEYS = {
    'İndirme Bitince Kapat': 'tplDownloadShutdown',
    'Render Bitince Kapat': 'tplRenderShutdown',
    'Gece Boşta Kalırsa Uyut': 'tplIdleSleep',
    'Chrome Kapanınca Kilitle': 'tplProcessLock',
    'Steam İndirmesi Bitince Kapat': 'tplSteamDownload',
    'Toplantı Bitince Kilitle': 'tplMeetingLock',
    'Her Gece 01:00 Uyut': 'tplNightlySleep',
    'Pil Azalınca Hazırda Beklet': 'tplBatteryHibernate',
    'İndirilenler Sabitlenince Kapat': 'tplBackupStable',
    'Sunum Kapanınca Kilitle': 'tplPresentationLock'
};

function taskName(language, task) {
    if (!task) return '';
    const name = String(task.name || '');
    const trig = task.trigger || {};
    const lang = normalizeLanguage(language);
    const locale = { no: 'nb-NO', zh: 'zh-CN', pt: 'pt-PT' }[lang] || lang;
    if (task.source === 'user_interface') {
        if (trig.type === 'duration') {
            return translate(lang, 'quickTimerName', { action: actionLabel(lang, task.action) });
        }
        if ((trig.type === 'scheduled_time' || trig.targetTime) && trig.targetTime) {
            return translate(lang, 'scheduledTaskName', {
                action: actionLabel(lang, task.action),
                time: new Date(trig.targetTime).toLocaleTimeString(locale)
            });
        }
        if (task.conditionGroup) return translate(lang, 'smartFinishTaskName');
    }
    if (name.startsWith('Hızlı Zamanlayıcı') || name.startsWith('Quick Timer')) {
        return translate(lang, 'quickTimerName', { action: actionLabel(lang, task.action) });
    }
    if (BUILTIN_TEMPLATE_KEYS[name]) return translate(lang, BUILTIN_TEMPLATE_KEYS[name]);
    return name;
}

function resetCache() {
    cache.clear();
    turkish = null;
    warned.clear();
}

module.exports = {
    LANGUAGE_ORDER,
    normalizeLanguage,
    loadTranslations,
    loadLocale,
    translate,
    actionLabel,
    taskName,
    resetCache
};
