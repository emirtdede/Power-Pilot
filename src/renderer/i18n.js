/**
 * i18n.js — WP-14.T2
 * Yalnızca aktif dil sözlüğü IPC ile yüklenir. Tüm dilleri önceden parse
 * etmek yok; dil değişiminde önceki sözlük bırakılır.
 */
let translations = {};

(function () {
    'use strict';

    // O-19: locale dosyası bozuk/eksikse sayaç çizimi çökmesin.
    const FALLBACK_DICTIONARY = {
        timeFormatDays: 'gün',
        timeFormatHours: 'sa',
        timeFormatMinutes: 'dk',
        timeFormatSeconds: 'sn',
        activeTimerText: 'Bilgisayar {time} sonra {action}.',
        activeTimerCancelledText: 'Zamanlayıcı iptal edildi.',
        unknownError: 'Bilinmeyen hata'
    };

    const SUPPORTED = [
        'tr', 'en', 'de', 'sv', 'no', 'da', 'fr', 'pl', 'it', 'nl',
        'cs', 'es', 'pt', 'ja', 'zh', 'ko', 'ar'
    ];

    function detectInitialLanguage() {
        let lang = null;
        try { lang = localStorage.getItem('language'); } catch (_) {}
        if (!lang) {
            const sys = String(navigator.language || 'tr').split('-')[0].toLowerCase();
            return SUPPORTED.includes(sys) ? sys : 'tr';
        }
        return SUPPORTED.includes(lang) ? lang : 'tr';
    }

    let currentLanguage = detectInitialLanguage();

    async function load(lang) {
        if (!window.electronAPI || typeof window.electronAPI.getLocale !== 'function') {
            throw new Error('LOCALE_IPC_UNAVAILABLE');
        }
        const requested = SUPPORTED.includes(lang) ? lang : 'tr';
        const res = await window.electronAPI.getLocale(requested);
        if (!res || res.ok !== true || !res.dictionary) {
            throw new Error((res && res.code) || 'LOCALE_LOAD_FAILED');
        }
        const actual = SUPPORTED.includes(res.lang) ? res.lang : requested;
        // Tek aktif sözlük: önceki dil nesnesi tutulmaz.
        translations = { [actual]: res.dictionary };
        currentLanguage = actual;
        document.documentElement.setAttribute('lang', actual);
        document.documentElement.setAttribute('dir', res.rtl === true ? 'rtl' : 'ltr');
        return res.dictionary;
    }

    const ready = load(currentLanguage).catch((err) => {
        console.error('[i18n] locale yüklenemedi:', err && err.message);
        translations = { [currentLanguage]: FALLBACK_DICTIONARY };
        return FALLBACK_DICTIONARY;
    });

    // Güvenlik ağı: sözlük yüklenemese veya app.js erken çökse bile statik
    // iskelet gizli kalmasın (i18n-pending CSS kapısı).
    const revealSkeleton = () => {
        try {
            const root = document.documentElement;
            if (root && root.classList && typeof root.classList.remove === 'function') {
                root.classList.remove('i18n-pending');
            }
        } catch (_) { /* sınırlı DOM (test/VM) — kapı yoksa yapılacak iş yok */ }
    };
    if (typeof setTimeout === 'function') setTimeout(revealSkeleton, 2000);

    window.PPLocale = {
        ready,
        load,
        get language() { return currentLanguage; },
        get supported() { return SUPPORTED.slice(); }
    };
})();
