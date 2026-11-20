

// Desteklenmeyen sistem dili → 'en' (nötr/uluslararası varsayılan).
// Eskiden 'tr' idi: Rusça/Hintçe bir Windows'ta uygulama Türkçe açılıyordu.
const UI_FALLBACK_LANG = 'en';

let currentLanguage = (() => {
    let lang = localStorage.getItem('language');
    if (!lang) {
        const sysLang = navigator.language.split('-')[0].toLowerCase();
        const translated = (window.PPLocale && window.PPLocale.translated) || [];
        lang = translated.includes(sysLang) ? sysLang : UI_FALLBACK_LANG;
    }
    return (window.PPLocale && window.PPLocale.supported.includes(lang)) ? lang : UI_FALLBACK_LANG;
})();

// Set inside DOMContentLoaded once the view-specific refresh helpers are
// in scope; applyLanguage() runs before that on some code paths.
let afterLanguageChange = null;

// Bozuk veri kurtarma bilgisi (ana süreçten). Dil değişince metin
// yeniden çizilir; `data-i18n` kullanılmaz çünkü karantina yolu dinamik.
let storageRecoveryInfo = null;
// Kullanıcı bildirimi kapattıysa yeniden çizimde geri getirilmez.
let storageRecoveryDismissed = false;

function renderStorageRecovery() {
    const box = document.getElementById('storage-recovered');
    if (!box) return;
    const rec = storageRecoveryInfo;
    if (!rec || storageRecoveryDismissed) {
        box.classList.add('hidden');
        return;
    }
    const detail = document.getElementById('storage-recovered-detail');
    if (detail) {
        const base = t('storageRecoveredDetail');
        detail.textContent = rec.quarantinePath
            ? `${base} ${t('storageRecoveredPath', { path: rec.quarantinePath })}`
            : base;
    }
    box.classList.remove('hidden');
}

// Bakım modu / kurcalanmış denetim durumu (ana süreçten). Gerekçe
// dinamik olduğu için `data-i18n` değil, bu çizici kullanılır.
let storageStatusInfo = null;

function renderStorageWarning() {
    const box = document.getElementById('storage-warning');
    if (!box) return;
    const st = storageStatusInfo;
    const maintenance = !!(st && st.maintenanceMode);
    const tampered = !!(st && st.auditTampered);
    const broken = maintenance || tampered;
    box.classList.toggle('hidden', !broken);
    if (!broken) return;
    const detail = document.getElementById('storage-warning-detail');
    if (detail) {
        const base = t(tampered && !maintenance ? 'errorAuditTampered' : 'errorStorageMaintenance');
        // Kilitli bırakma yok: ne yapacağını söyle. Uygulama içi veri
        // sıfırlama yok (T-STO-03: kaynak dosya korunur).
        detail.textContent = maintenance ? `${base} ${t('storageMaintenanceHint')}` : base;
    }
}

function getCurrentLanguage() {
    return currentLanguage;
}

// WP-10.T8: CSP ihlali sessizce yutulmaz; ana süreç loglar.
document.addEventListener('securitypolicyviolation', (event) => {
    if (window.electronAPI && typeof window.electronAPI.reportCspViolation === 'function') {
        window.electronAPI.reportCspViolation({
            violatedDirective: event.violatedDirective,
            blockedURI: event.blockedURI,
            sourceFile: event.sourceFile,
            lineNumber: event.lineNumber
        });
    }
});

function getActionString(action) {
    const keys = {
        shutdown: 'actionShutdown',
        restart: 'actionRestart',
        sleep: 'actionSleep',
        hibernate: 'actionHibernate',
        lock: 'actionLock',
        signout: 'actionSignout'
    };
    const key = keys[action];
    return key ? t(key) : String(action || '');
}

/**
 * Translate a key for the active language. Falls back to English, then
 * to the key itself so a missing entry is never rendered as "undefined".
 */
function t(key, vars) {
    const lang = getCurrentLanguage();
    const dict = translations[lang] || {};
    let value = dict[key];
    if (typeof value !== 'string') value = key;
    if (vars && typeof vars === 'object') {
        for (const name of Object.keys(vars)) {
            value = value.split(`{${name}}`).join(String(vars[name]));
        }
    }
    return value;
}

async function applyLanguage(lang) {
    const supported = (window.PPLocale && window.PPLocale.supported) || [];
    if (!lang || !supported.includes(lang)) lang = getCurrentLanguage();
    try {
        if (window.PPLocale && window.PPLocale.load) await window.PPLocale.load(lang);
    } catch (err) {
        console.error('[i18n] dil yüklenemedi:', err && err.message);
        return;
    }
    currentLanguage = (window.PPLocale && window.PPLocale.language) || lang;
    lang = currentLanguage;
    try {
        localStorage.setItem('language', lang);
    } catch (e) { }
    const dict = translations[lang] || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = dict[key];
            } else {
                el.innerText = dict[key];
            }
        }
    });
    // data-i18n-placeholder keeps input hints in sync without touching values.
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const value = dict[key];
        if (value) el.placeholder = value;
    });
    // data-i18n-title localizes tooltips and accessible titles.
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const value = dict[key];
        if (value) el.title = value;
    });
    // data-i18n-aria-label keeps icon-only buttons screen-reader friendly
    // in the active language (window controls, dialog close buttons).
    // data-i18n-aria-context (opsiyonel) ek bağlam verir: "Gün: Değeri artır".
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        const base = dict[key];
        if (!base) return;
        const ctxKey = el.getAttribute('data-i18n-aria-context');
        const ctx = ctxKey ? dict[ctxKey] : '';
        el.setAttribute('aria-label', ctx ? `${ctx}: ${base}` : base);
    });
    // Rail modunda nav etiketleri gizlenir; ipucu + erişilebilir ad aynı
    // sözlükten gelir (data-nav-key → data-tip / aria-label).
    document.querySelectorAll('[data-nav-key]').forEach(el => {
        const key = el.getAttribute('data-nav-key');
        const value = key ? dict[key] : '';
        if (!value) return;
        el.setAttribute('data-tip', value);
        el.setAttribute('aria-label', value);
        // Rail modunda etiket gizlenir; fare kullanıcısı için yerel ipucu.
        el.title = value;
    });
    // Update the HTML class lang attribute
    document.documentElement.setAttribute('lang', lang);
    // WP-14 + 73 dil: RTL diller (ar, he, fa, ur) sağdan-sola.
    const isRtl = window.PPLocale && typeof window.PPLocale.isRtl === 'function'
        ? window.PPLocale.isRtl(lang)
        : (lang === 'ar' || lang === 'he' || lang === 'fa' || lang === 'ur');
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    // Statik Türkçe iskelet artık aktif dille değiştirildi; kapıyı aç.
    document.documentElement.classList.remove('i18n-pending');
    // Dynamic labels, countdown text and per-view renderers live inside
    // the DOMContentLoaded scope. afterLanguageChange() is wired there so
    // a language switch refreshes them with the new dictionary.
    if (typeof afterLanguageChange === 'function') {
        afterLanguageChange();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // WP-14.T2: ilk boyama statik Türkçe iskelet; sözlük gelince uygula.
    try {
        if (window.PPLocale) await window.PPLocale.ready;
    } catch (_) { /* statik metinlerle devam */ }
    if (window.PPLocale) currentLanguage = window.PPLocale.language;
    // Window controls
    document.getElementById('btn-minimize').addEventListener('click', () => {
        window.electronAPI.minimize();
    });
    const btnMaximize = document.getElementById('btn-maximize');
    function syncMaximizeBtn(maximized) {
        if (!btnMaximize) return;
        btnMaximize.setAttribute('data-maximized', maximized ? 'true' : 'false');
        btnMaximize.setAttribute('aria-pressed', maximized ? 'true' : 'false');
    }
    if (btnMaximize) {
        btnMaximize.addEventListener('click', () => {
            window.electronAPI.maximizeToggle();
            const next = btnMaximize.getAttribute('data-maximized') !== 'true';
            syncMaximizeBtn(next);
        });
    }
    if (window.electronAPI && typeof window.electronAPI.onWindowStateChanged === 'function') {
        window.electronAPI.onWindowStateChanged((state) => {
            if (state === 'maximize') syncMaximizeBtn(true);
            else if (state === 'unmaximize') syncMaximizeBtn(false);
        });
    }
    document.getElementById('btn-close').addEventListener('click', () => {
        window.electronAPI.close();
    });

    // Navigation (12 top-level views including dedicated Documentation Center)
    const navLinks = {
        'nav-dashboard': 'view-dashboard',
        'nav-active': 'view-active',
        'nav-tasks': 'view-tasks',
        'nav-smartfinish': 'view-smartfinish',
        'nav-assistant': 'view-assistant',
        'nav-templates': 'view-templates',
        'nav-history': 'view-history',
        'nav-stats': 'view-stats',
        'nav-integrations': 'view-integrations',
        'nav-docs': 'view-docs',
        'nav-settings': 'view-settings',
        'nav-about': 'view-about'
    };

    function switchView(navId, { focusView = false } = {}) {
        // Update active state in sidebar (görsel + erişilebilir işaret)
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('bg-primary/10', 'text-primary', 'dark:text-primary-light', 'font-medium', 'border', 'border-primary/20', 'is-active');
            btn.removeAttribute('aria-current');
            if (btn.id === navId) {
                btn.classList.add('bg-primary/10', 'text-primary', 'dark:text-primary-light', 'font-medium', 'border', 'border-primary/20', 'is-active');
                btn.setAttribute('aria-current', 'page');
            }
        });
        closeNavDrawer();

        // Show view
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.add('hidden');
        });
        const targetView = document.getElementById(navLinks[navId]);
        if (targetView) targetView.classList.remove('hidden');

        // PPX-011: SPA'da rota değişimi sessizdir. Başlığı güncelle ve
        // klavye/AT ile gezinildiğinde odağı yeni görünüme taşı.
        const navEl = document.getElementById(navId);
        const viewLabel = (navEl && (navEl.getAttribute('aria-label')
            || (navEl.querySelector('.nav-label') || {}).textContent || '')).trim();
        if (viewLabel) document.title = `${viewLabel} — Power Pilot`;
        if (focusView && targetView) {
            targetView.setAttribute('tabindex', '-1');
            try {
                targetView.focus({ preventScroll: true });
            } catch (_) {
                targetView.focus();
            }
        }

        if (navId === 'nav-active' && typeof updateDisplay === 'function') {
            updateDisplay();
        }
        if (navId === 'nav-tasks' && typeof loadTasks === 'function') {
            loadTasks();
        }
        if (navId === 'nav-templates' && typeof loadTemplates === 'function') {
            loadTemplates();
        }
        if (navId === 'nav-history' && typeof loadHistory === 'function') {
            loadHistory();
        }
        if (navId === 'nav-stats' && typeof loadStatistics === 'function') {
            loadStatistics();
        }
        if (navId === 'nav-about' && typeof loadHealthSummary === 'function') {
            loadHealthSummary();
        }
        if (navId === 'nav-assistant' && typeof loadAssistant === 'function') {
            loadAssistant();
        }
        if (navId === 'nav-integrations' && typeof loadIntegrations === 'function') {
            loadIntegrations();
        }
        if (navId === 'nav-settings' && typeof settingsRefreshAi === 'function') {
            settingsRefreshAi();
        } else if (typeof stopSettingsPoll === 'function') {
            stopSettingsPoll();
        }
    }

    // --- Responsive drawer (dar pencere iskeleti) -----------------
    // Geniş pencerede sidebar kalıcıdır; <900px'te çekmeceye dönüşür.
    const DRAWER_BREAKPOINT = 900;
    const navToggle = document.getElementById('btn-nav-toggle');
    const navScrim = document.getElementById('nav-scrim');
    const navListEl = document.querySelector('#app-sidebar nav');
    const mainEl = document.getElementById('main-content');

    function drawerFocusables() {
        return [...document.querySelectorAll(
            '.app-sidebar a[href], .app-sidebar button:not([disabled]), .app-sidebar [tabindex]:not([tabindex="-1"])'
        )].filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
    }

    function setNavOpen(open, { restoreFocus = false } = {}) {
        const shouldOpen = open === true && window.innerWidth < DRAWER_BREAKPOINT;
        document.body.classList.toggle('nav-open', shouldOpen);
        if (navToggle) navToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        // PPX-004: kapalıyken arka plan etkileşimsiz; açıkken odak
        // çekmecede kalır. `responsive.spec` programatik `.click()`
        // kullandığı için sidebar'ın kendisine `inert` konmaz.
        if (mainEl) {
            if (shouldOpen) mainEl.setAttribute('inert', '');
            else mainEl.removeAttribute('inert');
        }
        if (shouldOpen) {
            requestAnimationFrame(() => {
                const first = document.querySelector('.nav-btn');
                if (first && !first.closest('[inert]')) first.focus();
            });
        } else if (restoreFocus && navToggle) {
            navToggle.focus();
        }
    }

    function closeNavDrawer(options) {
        const wasOpen = document.body.classList.contains('nav-open');
        setNavOpen(false, options);
        return wasOpen;
    }
    window.ppCloseNavDrawer = closeNavDrawer;

    const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
    const btnSidebarCloseMobile = document.getElementById('btn-sidebar-close-mobile');

    function syncSidebarCollapseUi() {
        const collapsed = document.documentElement.classList.contains('sidebar-collapsed');
        if (btnSidebarCollapse) {
            const label = t(collapsed ? 'sidebarExpand' : 'sidebarCollapse');
            btnSidebarCollapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btnSidebarCollapse.setAttribute('aria-label', label);
            btnSidebarCollapse.setAttribute('title', label);
        }
    }

    function setSidebarCollapsed(collapsed, { persist = true } = {}) {
        const next = collapsed === true;
        document.documentElement.classList.toggle('sidebar-collapsed', next);
        syncSidebarCollapseUi();
        if (persist) {
            try { localStorage.setItem('pp-sidebar-collapsed', String(next)); } catch (_) { /* yut */ }
            if (window.electronAPI && typeof window.electronAPI.saveSettingsAtomic === 'function') {
                Promise.resolve(
                    window.electronAPI.saveSettingsAtomic({ settings: { sidebarCollapsed: next } })
                ).catch(() => { /* çevrimdışı */ });
            }
        }
    }

    if (btnSidebarCollapse) {
        btnSidebarCollapse.addEventListener('click', () => {
            setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed'));
        });
    }
    if (btnSidebarCloseMobile) {
        btnSidebarCloseMobile.addEventListener('click', () => closeNavDrawer({ restoreFocus: true }));
    }

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            setNavOpen(!document.body.classList.contains('nav-open'));
        });
    }
    if (navScrim) navScrim.addEventListener('click', () => closeNavDrawer({ restoreFocus: true }));

    // PPX-004: Escape + Tab tuzağı. Modal tuzağı önceliklidir.
    document.addEventListener('keydown', (event) => {
        if (!document.body.classList.contains('nav-open')) return;
        if (openModalEl) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeNavDrawer({ restoreFocus: true });
            return;
        }
        if (event.key !== 'Tab') return;
        const focusables = drawerFocusables();
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !navListEl || !active.closest('.app-sidebar'))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        } else if (!active.closest('.app-sidebar')) {
            event.preventDefault();
            first.focus();
        }
    }, true);

    window.addEventListener('resize', () => {
        if (window.innerWidth >= DRAWER_BREAKPOINT) closeNavDrawer();
    });

    // PPX-001: ok tuşları odak taşır, görünümü DEĞİŞTİRMEZ (D2).
    if (navListEl) {
        navListEl.addEventListener('keydown', (event) => {
            const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
            if (!keys.includes(event.key)) return;
            const items = [...navListEl.querySelectorAll('.nav-btn')];
            if (!items.length) return;
            const current = items.indexOf(document.activeElement);
            let next = current;
            if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
            else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            event.preventDefault();
            items[next].focus();
        });
    }
    Object.keys(navLinks).forEach(navId => {
        document.getElementById(navId).addEventListener('click', () => switchView(navId, { focusView: true }));
    });

    // PPX-003: sticky CTA yüksekliğini ölç ve scroller'a alt boşluk
    // olarak yaz (WCAG 2.2 SC 2.4.11 / C43).
    (function observeDashboardCta() {
        const bar = document.getElementById('dashboard-cta');
        if (!bar || typeof ResizeObserver !== 'function') return;
        let last = -1;
        let queued = false;
        const measure = () => {
            queued = false;
            const h = Math.round(bar.getBoundingClientRect().height);
            if (h !== last) {
                last = h;
                document.documentElement.style.setProperty('--pp-cta-h', `${h}px`);
            }
        };
        const ro = new ResizeObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(measure);
        });
        ro.observe(bar);
        requestAnimationFrame(measure);
    })();

    // State
    let selectedAction = 'shutdown';
    let initialTotalSeconds = 2700; // default 45 mins
    let countdownInterval = null;
    let currentActionString = '';
    let secondsRemaining = 0;
    let isTimerActive = false;
    let isCancelledState = false;
    // WP-08.T2/T3: monotonik hedef zaman + gerçek sonuç bekleyişi.
    let timerTargetTime = null;
    let timerExecutionTaskId = null;
    let awaitingExecution = false;
    let awaitingResultTimeout = null;
    // WP-08.T4/T5: tek iptal akışı; tray + buton aynı anda ikinci IPC üretmez.
    let cancelInFlight = false;
    let cancelPinPending = false;
    // K-01: PIN kurulu mu? PIN değiştirme/silme mevcut PIN ister.
    let cancelPinConfigured = false;

    // Action Selection
    const actionBtns = document.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            actionBtns.forEach(b => {
                b.classList.remove('border-primary', 'is-selected');
                b.setAttribute('aria-pressed', 'false');
                b.classList.add('border-slate-200', 'dark:border-slate-800');
                b.querySelector('div').classList.remove('bg-primary/10', 'text-primary', 'dark:text-primary-light');
                b.querySelector('div').classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
            });

            const el = e.currentTarget;
            el.classList.add('border-primary', 'is-selected');
            el.setAttribute('aria-pressed', 'true');
            el.classList.remove('border-slate-200', 'dark:border-slate-800');
            el.querySelector('div').classList.add('bg-primary/10', 'text-primary', 'dark:text-primary-light');
            el.querySelector('div').classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');

            selectedAction = el.dataset.action;
            currentActionString = getActionString(selectedAction);
        });
    });
    // trigger first click
    actionBtns[0].click();

    // Time Selection
    const timeBtns = document.querySelectorAll('.time-btn');
    const dInput = document.getElementById('input-days');
    const hInput = document.getElementById('input-hours');
    const mInput = document.getElementById('input-mins');

    // Input Validation (Clamping)
    function clampInput(inputEl, maxVal) {
        inputEl.addEventListener('change', () => {
            let val = parseInt(inputEl.value) || 0;
            if (val < 0) val = 0;
            if (val > maxVal) val = maxVal;
            inputEl.value = val;
        });
    }
    clampInput(dInput, 3650); // Maksimum 10 yıl
    clampInput(hInput, 23);
    clampInput(mInput, 59);

    timeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            timeBtns.forEach(b => {
                b.classList.remove('bg-white', 'dark:bg-slate-800', 'text-primary', 'dark:text-primary-light', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-700');
            });

            const el = e.currentTarget;
            el.classList.add('bg-white', 'dark:bg-slate-800', 'text-primary', 'dark:text-primary-light', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-700');

            const minVal = el.dataset.mins;
            if (minVal !== "custom") {
                const totalMins = parseInt(minVal, 10);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                if (dInput) dInput.value = 0;
                hInput.value = h;
                mInput.value = m;
            }
        });
    });

    // Start Timer — WP-08.T1: yalnızca IPC başarılıysa sayaç başlar.
    document.getElementById('btn-start').addEventListener('click', async () => {
        const days = parseInt(dInput.value) || 0;
        const hours = parseInt(hInput.value) || 0;
        const mins = parseInt(mInput.value) || 0;
        const totalSeconds = (days * 86400) + (hours * 3600) + (mins * 60);

        if (totalSeconds <= 0 || totalSeconds > 2073600) {
            showToast(t('validTimeAlert'), 'error');
            return;
        }

        try {
            const res = await window.electronAPI.scheduleAction({
                action: selectedAction,
                durationMs: totalSeconds * 1000
            });
            if (!res || res.success === false) {
                showToast((res && res.message) || t('validTimeAlert'), 'error');
                switchView('nav-dashboard');
                return;
            }
            timerExecutionTaskId = res.taskId || null;
            startTimerTo(res.targetTime || (Date.now() + totalSeconds * 1000), totalSeconds);
            switchView('nav-active');
        } catch (err) {
            showToast(t('validTimeAlert'), 'error');
            switchView('nav-dashboard');
        }
    });

    // Cancel PIN akışı (WBS-11.2): bekleyen işlem + modal + yeniden deneme.
    let pendingPinAction = null;
    function requestPin(label, action) {
        pendingPinAction = typeof action === 'function' ? { run: action } : { ...(action || {}) };
        document.getElementById('pin-modal-text').innerText = label;
        document.getElementById('pin-modal-input').value = '';
        document.getElementById('pin-modal-error').innerText = '';
        openModal('modal-pin');
        setTimeout(() => {
            const inp = document.getElementById('pin-modal-input');
            if (inp) inp.focus();
        }, 60);
    }
    function isPinChallenge(res) {
        return res && res.success === false && (res.code === 'PIN_REQUIRED' || res.code === 'PIN_WRONG' || res.code === 'PIN_LOCKED');
    }
    // PIN hiç kurulmamışken güvenlik ayarı isteyen kullanıcı modal
    // döngüsüne düşmesin: PIN oluşturma kartına yönlendirilir.
    async function pinRequiredWithoutPin(res) {
        if (!res || res.code !== 'PIN_REQUIRED') return false;
        let configured = true;
        try {
            const st = await window.electronAPI.getCancelPinState();
            configured = !!(st && st.set);
        } catch (_) { return false; }
        if (configured) return false;
        showToast(t('pinSetFirst'), 'error');
        switchView('nav-settings');
        const btn = document.getElementById('btn-pin-set');
        if (btn) {
            try { btn.scrollIntoView({ block: 'center' }); } catch (_) { /* yut */ }
            btn.focus();
            btn.classList.add('ring-2', 'ring-primary');
            setTimeout(() => btn.classList.remove('ring-2', 'ring-primary'), 1800);
        }
        return true;
    }
    function paintPinError(res) {
        const el = document.getElementById('pin-modal-error');
        if (res.code === 'PIN_LOCKED') {
            el.innerText = res.retryAfterSec != null
                ? t('pinLockedWait', { seconds: res.retryAfterSec })
                : t('pinLocked');
        } else if (res.code === 'PIN_WRONG') {
            el.innerText = res.attemptsLeft != null
                ? t('pinWrongAttempts', { count: res.attemptsLeft })
                : t('pinWrong');
        } else {
            el.innerText = t('pinPromptCancel');
        }
    }
    async function submitPinModal() {
        const pin = document.getElementById('pin-modal-input').value;
        const action = pendingPinAction;
        if (!action) { closeModal('modal-pin'); return; }
        const res = await action.run(pin);
        if (isPinChallenge(res)) {
            paintPinError(res);
            return; // modal açık kalır
        }
        pendingPinAction = null;
        closeModal('modal-pin');
        if (action.done) action.done(res);
    }
    const pinModalOk = document.getElementById('pin-modal-ok');
    if (pinModalOk) pinModalOk.addEventListener('click', submitPinModal);
    const pinModalCancel = document.getElementById('pin-modal-cancel');
    if (pinModalCancel) pinModalCancel.addEventListener('click', () => {
        const action = pendingPinAction;
        pendingPinAction = null;
        closeModal('modal-pin');
        if (action && typeof action.cancel === 'function') action.cancel();
    });
    const pinModalInput = document.getElementById('pin-modal-input');
    if (pinModalInput) pinModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitPinModal();
    });

    // WP-10.T4: güvenlik ayarları PIN kapısından geçer. PIN yoksa
    // modal açılır; başarılı yazımda onDone çağrılır.
    async function saveSecuritySettings(patch, onDone, { quiet = false, onCancel = null } = {}) {
        if (!window.electronAPI || !window.electronAPI.securitySettingsUpdate) {
            return { success: false, code: 'UNSUPPORTED' };
        }
        const run = (pin) => window.electronAPI.securitySettingsUpdate({ settings: patch, pin });
        const res = await run();
        if (isPinChallenge(res)) {
            if (await pinRequiredWithoutPin(res)) return;
            requestPin(t('pinPromptCancel'), {
                run,
                done: (final) => {
                    if (final && final.success !== false) {
                        if (onDone) onDone(final);
                        if (!quiet) showToast(t('toastSettingsSaved'), 'success');
                    } else {
                        if (onCancel) onCancel(final);
                        showToast((final && final.message) || t('errorSaveFailed'), 'error');
                    }
                },
                cancel: () => { if (onCancel) onCancel(null); }
            });
            paintPinError(res);
            return { success: false, pendingPin: true };
        }
        if (res && res.success !== false && onDone) onDone(res);
        return res;
    }

    // Settings PIN kartı (kur / temizle / durum).
    async function refreshPinState() {
        const el = document.getElementById('pin-state');
        if (!el || !window.electronAPI || !window.electronAPI.getCancelPinState) return;
        try {
            const st = await window.electronAPI.getCancelPinState();
            cancelPinConfigured = !!(st && st.set);
            el.innerText = cancelPinConfigured ? t('pinStateSet') : t('pinStateNotSet');
        } catch (_) { el.innerText = t('pinStateUnknown'); }
    }
    const btnPinSet = document.getElementById('btn-pin-set');
    if (btnPinSet) btnPinSet.addEventListener('click', async () => {
        const pin = document.getElementById('pin-input').value;
        if (!window.electronAPI || !window.electronAPI.setCancelPin) return;
        const finish = (res) => {
            if (res && res.success === false) {
                showToast(res.message || t('pinSetFailed'), 'error');
            } else {
                document.getElementById('pin-input').value = '';
                showToast(t('pinSetSuccess'), 'success');
            }
            refreshPinState();
        };
        const res = await window.electronAPI.setCancelPin(pin);
        if (isPinChallenge(res)) {
            // K-01: mevcut PIN doğrulanmadan yenisi yazılmaz.
            requestPin(t('pinPromptCurrent'), {
                run: (currentPin) => window.electronAPI.setCancelPin(pin, currentPin),
                done: finish
            });
            paintPinError(res);
            return;
        }
        finish(res);
    });
    const btnPinClear = document.getElementById('btn-pin-clear');
    if (btnPinClear) btnPinClear.addEventListener('click', async () => {
        if (!window.electronAPI || !window.electronAPI.clearCancelPin) return;
        const finish = (res) => {
            if (res && res.success === false) {
                showToast(res.message || t('errorSaveFailed'), 'error');
            } else {
                showToast(t('pinCleared'), 'info');
            }
            refreshPinState();
        };
        const res = await window.electronAPI.clearCancelPin();
        if (isPinChallenge(res)) {
            // K-01: mevcut PIN doğrulanmadan PIN kaldırılmaz.
            requestPin(t('pinPromptCurrent'), {
                run: (currentPin) => window.electronAPI.clearCancelPin(currentPin),
                done: finish
            });
            paintPinError(res);
            return;
        }
        finish(res);
    });

    // PIN kurtarma: klasör yolunu sabit metin yerine platforma
    // sorduruyoruz (MSIX'te yol sanallaştırılır).
    const btnOpenDataFolder = document.getElementById('btn-open-data-folder');
    if (btnOpenDataFolder) btnOpenDataFolder.addEventListener('click', async () => {
        if (!window.electronAPI || typeof window.electronAPI.openDataFolder !== 'function') return;
        try {
            const res = await window.electronAPI.openDataFolder();
            if (res && res.success === false) {
                showToast(t('errorOpenFolder'), 'error');
            }
        } catch (_) {
            showToast(t('errorOpenFolder'), 'error');
        }
    });

    function finishCancelUi() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        clearAwaitingResult();
        timerTargetTime = null;
        timerExecutionTaskId = null;
        isTimerActive = false;
        // Clear the UI timer but stay on the page
        isCancelledState = true;
        secondsRemaining = 0;
        initialTotalSeconds = 1; // Prevent division by zero for the circle calculation
        updateDisplay();
        showToast(t('toastTimerCancelled'), 'info');
    }

    const btnCancelTimer = document.getElementById('btn-cancel');
    btnCancelTimer.addEventListener('click', async () => {
        if (cancelInFlight) return;
        cancelInFlight = true;
        btnCancelTimer.disabled = true;
        try {
            const res = window.electronAPI ? await window.electronAPI.cancelAction() : { success: true };
            if (isPinChallenge(res)) {
                cancelPinPending = true;
                requestPin(t('pinCancelTimerPrompt'), {
                    run: (pin) => window.electronAPI.cancelAction(pin),
                    done: (r2) => {
                        cancelPinPending = false;
                        cancelInFlight = false;
                        btnCancelTimer.disabled = false;
                        if (r2 && r2.success !== false) finishCancelUi();
                    },
                    cancel: () => {
                        cancelPinPending = false;
                        cancelInFlight = false;
                        btnCancelTimer.disabled = false;
                    }
                });
                paintPinError(res);
                return;
            }
            if (res && res.success === false) {
                showToast(res.message || t('errorCancelFailed'), 'error');
                return;
            }
            finishCancelUi();
        } finally {
            if (!cancelPinPending) {
                cancelInFlight = false;
                btnCancelTimer.disabled = false;
            }
        }
    });

    function clearAwaitingResult() {
        awaitingExecution = false;
        if (awaitingResultTimeout) {
            clearTimeout(awaitingResultTimeout);
            awaitingResultTimeout = null;
        }
    }

    function beginAwaitingResult() {
        clearAwaitingResult();
        awaitingExecution = true;
        // WP-08.T3: 10 sn içinde olay gelmezse durum kontrol edilir.
        awaitingResultTimeout = setTimeout(() => {
            if (!awaitingExecution) return;
            awaitingExecution = false;
            showToast(t('toastStatusChecking'), 'info');
            if (typeof loadTasks === 'function') loadTasks();
            if (typeof loadHistory === 'function') loadHistory();
        }, 10000);
    }

    function timerTick() {
        if (!timerTargetTime) return;
        // WP-08.T2: monotonik hedef — gizli sekmede/uykuda kayan sayaç yok.
        const left = Math.max(0, Math.ceil((timerTargetTime - Date.now()) / 1000));
        if (left !== secondsRemaining) {
            secondsRemaining = left;
            fireStagedMark(left);
            updateDisplay();
        }
        if (left <= 0) {
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            isTimerActive = false;
            beginAwaitingResult();
        }
    }

    function resyncTimer() {
        if (!timerTargetTime) return;
        timerTick();
    }

    function startTimerTo(targetTime, totalSeconds) {
        if (countdownInterval) clearInterval(countdownInterval);
        clearAwaitingResult();
        isCancelledState = false;
        isTimerActive = true;
        timerTargetTime = Number(targetTime) || (Date.now() + Math.max(1, Number(totalSeconds) || 1) * 1000);
        const remaining = Math.max(0, Math.ceil((timerTargetTime - Date.now()) / 1000));
        initialTotalSeconds = Math.max(1, Number(totalSeconds) || remaining, remaining);
        secondsRemaining = remaining;
        stagedMarksFired = {};
        // Başlangıçta zaten geçmiş eşikler için bildirim atma.
        for (const mark of [300, 60, 30, 10]) {
            if (initialTotalSeconds <= mark) stagedMarksFired[mark] = true;
        }
        updateDisplay();
        countdownInterval = setInterval(timerTick, 1000);
        timerTick();
    }

    // Kademeli uyarı (WBS-11.3): 5dk/1dk toast + 1dk/30sn/10sn bip. Gece sessizliği.
    let stagedMarksFired = {};
    /**
     * A9: uyarı sesi tercihi.
     *  - 'auto'  : 22:00–08:00 arası sessiz (eski sabit davranış)
     *  - 'always': gece de çalar (gece çalışan kullanıcı uyarıyı kaçırmasın)
     *  - 'never' : hiç çalmaz (görsel uyarı yine görünür)
     * Geçersiz/boş değer 'auto' sayılır.
     */
    function getSoundMode() {
        const mode = localStorage.getItem('soundMode');
        return (mode === 'always' || mode === 'never') ? mode : 'auto';
    }
    function isQuietHours(now = new Date()) {
        const h = now.getHours();
        return h >= 22 || h < 8;
    }
    function uiBeep() {
        try {
            const mode = getSoundMode();
            if (mode === 'never') return;
            if (mode === 'auto' && isQuietHours()) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = 880;
            g.gain.setValueAtTime(0.001, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            o.start();
            o.stop(ctx.currentTime + 0.3);
            o.onended = () => { try { ctx.close(); } catch (_) { } };
        } catch (_) { }
    }
    function fireStagedMark(left) {
        // WP-08.T2: `<=` + tek seferlik; throttle kaynaklı eşik atlaması olmaz.
        if (left <= 300 && !stagedMarksFired[300]) {
            stagedMarksFired[300] = true;
            showToast(t('toast5Min'), 'info');
        }
        if (left <= 60 && !stagedMarksFired[60]) {
            stagedMarksFired[60] = true;
            uiBeep();
            showToast(t('toast1Min'), 'info');
        }
        if (left <= 30 && !stagedMarksFired[30]) {
            stagedMarksFired[30] = true;
            uiBeep();
        }
        if (left <= 10 && !stagedMarksFired[10]) {
            stagedMarksFired[10] = true;
            uiBeep();
        }
    }

    // Klavye kısayolları (WBS-11.3): giriş alanlarındayken çalışmaz.
    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            const map = { s: 'shutdown', r: 'restart', l: 'sleep', h: 'hibernate', k: 'lock' };
            const action = map[(e.key || '').toLowerCase()];
            if (action) {
                e.preventDefault();
                const btn = document.querySelector(`.action-btn[data-action="${action}"]`);
                if (btn) btn.click();
                return;
            }
        }
        if (e.key === 'Escape') {
            const activeView = document.getElementById('view-active');
            if (activeView && !activeView.classList.contains('hidden')) {
                const cancelBtn = document.getElementById('btn-cancel');
                if (cancelBtn) cancelBtn.click();
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 't') {
            e.preventDefault();
            const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            try { localStorage.setItem('theme', next); } catch (_) { }
            if (elTheme) elTheme.value = next;
            applyTheme(next, activeThemeId);
            persistThemeAsync(next, activeThemeId);
        }
    });

    function updateDisplay() {
        if (!Number.isFinite(secondsRemaining) || secondsRemaining < 0) secondsRemaining = 0;
        const d = Math.floor(secondsRemaining / 86400);
        const h = Math.floor((secondsRemaining % 86400) / 3600);
        const m = Math.floor((secondsRemaining % 3600) / 60);
        const s = secondsRemaining % 60;

        const currentLang = getCurrentLanguage();
        const dict = translations[currentLang] || {};
        // O-19: eksik sözlükte substring çökmesin.
        const daySuffix = String(dict.timeFormatDays || 'g').substring(0, 1);

        const timeLeft = document.getElementById('display-time-left');
        if (d > 0) {
            const days = document.createElement('span');
            days.className = 'text-xl text-primary dark:text-primary-light leading-none tracking-normal';
            days.textContent = `${d}${daySuffix}`;
            const clock = document.createElement('span');
            clock.className = 'text-[32px] leading-none';
            clock.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            timeLeft.replaceChildren(days, clock);
        } else {
            let formattedTime = "";
            if (h > 0) formattedTime += `${h.toString().padStart(2, '0')}:`;
            formattedTime += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            const clock = document.createElement('span');
            clock.className = 'text-4xl leading-none';
            clock.textContent = formattedTime;
            timeLeft.replaceChildren(clock);
        }

        let textStr = "";
        if (d > 0) textStr += `${d} ${dict.timeFormatDays} `;
        if (h > 0 || d > 0) textStr += `${h} ${dict.timeFormatHours} `;
        if (m > 0 || h > 0 || d > 0) textStr += `${m} ${dict.timeFormatMinutes} `;
        textStr += `${s} ${dict.timeFormatSeconds}`;

        // Update active view headings and sentence dynamically (DOM API — HTML sink yok).
        const headingEl = document.getElementById('active-heading');
        const subheadingEl = document.getElementById('active-subheading');
        const saveHintEl = document.getElementById('active-save-hint');
        const sentenceEl = document.getElementById('display-timer-sentence');
        const idle = !isTimerActive && secondsRemaining <= 0 && !isCancelledState;
        if (headingEl) headingEl.textContent = idle ? t('noActiveTimer') : t('activeTimerRunning');
        if (subheadingEl) subheadingEl.textContent = idle ? t('activeIdleSubtitle') : t('countdownMode');
        if (saveHintEl) saveHintEl.classList.toggle('hidden', idle);

        if (isCancelledState) {
            const span = document.createElement('span');
            span.className = 'text-red-600 dark:text-red-400 font-bold';
            span.textContent = dict.activeTimerCancelledText || "Timer: Timer cancelled.";
            sentenceEl.replaceChildren(span);
        } else if (idle) {
            const span = document.createElement('span');
            span.className = 'text-slate-600 dark:text-slate-400 font-medium';
            span.textContent = t('noActiveTimer');
            sentenceEl.replaceChildren(span);
        } else {
            const sentence = dict.activeTimerText || "Timer: Computer will be {action} in {time}.";
            const nodes = [];
            for (const part of sentence.split(/(\{time\}|\{action\})/)) {
                if (part === '{time}') {
                    const span = document.createElement('span');
                    span.className = 'text-primary dark:text-primary-light font-bold';
                    span.textContent = textStr;
                    nodes.push(span);
                } else if (part === '{action}') {
                    const span = document.createElement('span');
                    span.className = 'font-bold';
                    span.textContent = getActionString(selectedAction);
                    nodes.push(span);
                } else if (part) {
                    nodes.push(document.createTextNode(part));
                }
            }
            sentenceEl.replaceChildren(...nodes);
        }

        // Update circle (dasharray: 289, dashoffset: 0 to 289; empty ring when idle)
        const totalSeconds = Number.isFinite(initialTotalSeconds) && initialTotalSeconds > 0
            ? initialTotalSeconds
            : 0;
        const pct = idle ? 1 : (totalSeconds > 0
            ? Math.min(1, Math.max(0, (totalSeconds - secondsRemaining) / totalSeconds))
            : 0);
        document.getElementById('progress-circle').style.strokeDashoffset = 289 * pct;

        // Update cancel button state
        const btnCancel = document.getElementById('btn-cancel');
        if (secondsRemaining <= 0) {
            btnCancel.disabled = true;
            btnCancel.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        } else {
            btnCancel.disabled = false;
            btnCancel.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        }
    }

    // Quick Presets Logic removed

    // Toast Notification System
    function showToast(message, type = 'info') {
        // "Bildirimleri Göster" yalnızca BİLGİLENDİRME amaçlı geri
        // bildirimi kapatır. Hata mesajları her zaman görünür: aksi
        // hâlde kullanıcı işlemin başarısız olduğunu hiç öğrenmez
        // (PIN kurulamadı, görev oluşturulamadı, klasör açılamadı...).
        const showNotifs = localStorage.getItem('notifications') !== 'false'; // Default true
        if (!showNotifs && type !== 'error') return;

        const container = document.getElementById('toast-container');
        // L-02: container yoksa çökme yok; PPX-006: en fazla 2 toast
        // tutulur (520 px yüksekliğinde görünümü boğmamak için).
        if (!container) return;
        const MAX_TOASTS = 2;
        while (container.children.length >= MAX_TOASTS) {
            const oldest = container.firstElementChild;
            if (!oldest) break;
            oldest.remove();
        }
        const toast = document.createElement('div');
        const kind = (type === 'success' || type === 'error' || type === 'warning') ? type : 'info';
        const iconMap = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        toast.className = `pp-toast pp-toast--${kind}`;
        // Ekran okuyucu yeni bildirimi kendiliğinden duyursun:
        // hata = kesintiye uğratan uyarı, diğerleri = kibar duyuru.
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        toast.setAttribute('aria-atomic', 'true');

        const toastRow = document.createElement('div');
        toastRow.className = 'pp-toast-body';
        const toastIcon = document.createElement('span');
        toastIcon.className = 'material-symbols-outlined pp-toast-icon';
        toastIcon.setAttribute('aria-hidden', 'true');
        toastIcon.textContent = iconMap[kind];
        const toastText = document.createElement('p');
        toastText.className = 'pp-toast-msg';
        toastText.textContent = String(message);
        toastRow.append(toastIcon, toastText);

        // PPX-018: kapatma düğmesi (24×24).
        const toastClose = document.createElement('button');
        toastClose.type = 'button';
        toastClose.className = 'pp-toast-close';
        toastClose.setAttribute('aria-label', t('a11yDismiss'));
        const closeIcon = document.createElement('span');
        closeIcon.className = 'material-symbols-outlined text-[16px]';
        closeIcon.setAttribute('aria-hidden', 'true');
        closeIcon.textContent = 'close';
        toastClose.appendChild(closeIcon);
        toast.append(toastRow, toastClose);

        container.appendChild(toast);

        // Animate in (GPU-only transform + opacity)
        requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });

        // PPX-018: hover/odak süresince geri sayım duraklar; ayrılınca
        // kalan süre ile yeniden kurulur (en az 1 s).
        const customDur = parseInt(localStorage.getItem('pp-toast-duration'), 10);
        const TOAST_LIFETIME = Number.isInteger(customDur) && customDur >= 2000 ? customDur : 4000;
        let remaining = TOAST_LIFETIME;
        let startedAt = Date.now();
        let hideTimer = null;
        let paused = false;
        let closed = false;

        function beginHide() {
            if (closed) return;
            closed = true;
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 170);
        }
        function schedule() {
            startedAt = Date.now();
            hideTimer = setTimeout(beginHide, remaining);
        }
        function pauseToast() {
            if (paused || closed || !hideTimer) return;
            paused = true;
            clearTimeout(hideTimer);
            hideTimer = null;
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
        }
        function resumeToast() {
            if (!paused || closed) return;
            paused = false;
            if (remaining < 1000) remaining = 1000;
            schedule();
        }

        toastClose.addEventListener('click', () => {
            if (closed) return;
            closed = true;
            if (hideTimer) clearTimeout(hideTimer);
            toast.remove();
        });
        toast.addEventListener('mouseenter', pauseToast);
        toast.addEventListener('mouseleave', resumeToast);
        toast.addEventListener('focusin', pauseToast);
        toast.addEventListener('focusout', resumeToast);
        schedule();
    }
    window.showToast = showToast;

    // Settings Logic
    const elAutostart = document.getElementById('setting-autostart');
    const elVoice = document.getElementById('setting-voice');
    const elTheme = document.getElementById('setting-theme');
    const elNotifications = document.getElementById('setting-notifications');
    const elSoundMode = document.getElementById('setting-sound-mode');
    const elLanguage = document.getElementById('setting-language');
    const VALID_THEME_IDS = [
        'obsidian', 'slate', 'navy', 'blue', 'cyan', 'indigo', 'purple',
        'pink', 'red', 'orange', 'yellow', 'emerald', 'grass', 'lime'
    ];
    const btnModeLight = document.getElementById('btn-mode-light');
    const btnModeDark = document.getElementById('btn-mode-dark');
    const themeColorGrid = document.getElementById('theme-color-grid');
    const themeColorCountEl = document.getElementById('theme-color-count');

    let committedTheme = localStorage.getItem('theme') || 'dark';
    let activeThemeId = (() => {
        const saved = localStorage.getItem('themeId');
        return VALID_THEME_IDS.includes(saved) ? saved : 'obsidian';
    })();
    let committedThemeId = activeThemeId;
    let committedLanguage = localStorage.getItem('language') || currentLanguage || 'tr';
    let langSaveTimer = null;
    let themeSaveTimer = null;

    function persistThemeAsync(mode, themeId) {
        if (themeSaveTimer) clearTimeout(themeSaveTimer);
        themeSaveTimer = setTimeout(() => {
            themeSaveTimer = null;
            if (window.electronAPI && typeof window.electronAPI.saveSettingsAtomic === 'function') {
                Promise.resolve(
                    window.electronAPI.saveSettingsAtomic({ settings: { theme: mode, themeId } })
                ).then((res) => {
                    if (res && res.success === false) {
                        if (elTheme) elTheme.value = committedTheme;
                        activeThemeId = committedThemeId;
                        try {
                            localStorage.setItem('theme', committedTheme);
                            localStorage.setItem('themeId', committedThemeId);
                        } catch (_) { /* yut */ }
                        applyTheme(committedTheme, committedThemeId);
                        showToast(res.message || t('errorModeSave'), 'error');
                        return;
                    }
                    committedTheme = mode;
                    committedThemeId = themeId;
                }).catch(() => { /* çevrimdışı: localStorage yeterli */ });
            }
        }, 180);
    }

    function selectThemeMode(mode) {
        const nextMode = mode === 'light' ? 'light' : 'dark';
        if (elTheme) elTheme.value = nextMode;
        applyTheme(nextMode, activeThemeId);
        try { localStorage.setItem('theme', nextMode); } catch (_) { /* yut */ }
        persistThemeAsync(nextMode, activeThemeId);
    }

    function selectColorTheme(id) {
        if (!VALID_THEME_IDS.includes(id)) return;
        activeThemeId = id;
        const mode = (elTheme && elTheme.value === 'light') ? 'light' : (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        applyTheme(mode, activeThemeId);
        try { localStorage.setItem('themeId', activeThemeId); } catch (_) { /* yut */ }
        persistThemeAsync(mode, activeThemeId);
    }

    // PPX-015: tüm genel ayarlar anında uygulanır ve otomatik kaydedilir.
    if (elTheme) {
        elTheme.addEventListener('change', () => selectThemeMode(elTheme.value));
    }
    if (btnModeLight) {
        btnModeLight.addEventListener('click', () => selectThemeMode('light'));
    }
    if (btnModeDark) {
        btnModeDark.addEventListener('click', () => selectThemeMode('dark'));
    }
    if (themeColorGrid) {
        themeColorGrid.addEventListener('click', (e) => {
            const card = e.target.closest('[data-theme-option]');
            if (!card) return;
            selectColorTheme(card.getAttribute('data-theme-option'));
        });
    }
    if (elNotifications) {
        elNotifications.addEventListener('change', () => {
            try { localStorage.setItem('notifications', String(elNotifications.checked)); } catch (_) { }
        });
    }
    if (elSoundMode) {
        elSoundMode.addEventListener('change', () => {
            try { localStorage.setItem('soundMode', elSoundMode.value); } catch (_) { }
        });
    }
    if (elAutostart) {
        elAutostart.addEventListener('change', () => {
            const enabled = elAutostart.checked;
            try { localStorage.setItem('autostart', String(enabled)); } catch (_) { }
            if (window.electronAPI && window.electronAPI.setAutostart) {
                window.electronAPI.setAutostart(enabled);
            }
        });
    }
    if (elVoice) {
        elVoice.addEventListener('change', () => {
            try { localStorage.setItem('voice', String(elVoice.checked)); } catch (_) { }
        });
    }
    if (elLanguage) {
        elLanguage.addEventListener('change', () => {
            const next = elLanguage.value;
            const focusedId = document.activeElement && document.activeElement.id;
            applyLanguage(next).then(() => {
                if (!focusedId) return;
                const el = document.getElementById(focusedId);
                if (!el) return;
                try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
            }).catch(() => { /* dil yüklenemedi: eski dil kalır */ });
            if (langSaveTimer) clearTimeout(langSaveTimer);
            langSaveTimer = setTimeout(() => {
                langSaveTimer = null;
                if (window.electronAPI && typeof window.electronAPI.saveSettingsAtomic === 'function') {
                    Promise.resolve(
                        window.electronAPI.saveSettingsAtomic({ settings: { language: next } })
                    ).then(async (res) => {
                        if (res && res.success === false) {
                            elLanguage.value = committedLanguage;
                            try { localStorage.setItem('language', committedLanguage); } catch (_) { /* yut */ }
                            await applyLanguage(committedLanguage);
                            showToast(res.message || t('errorModeSave'), 'error');
                            return;
                        }
                        committedLanguage = next;
                        if (elTheme) committedTheme = elTheme.value;
                    }).catch(() => { /* çevrimdışı: localStorage yeterli */ });
                }
            }, 220);
        });
    }

    // Store (MSIX) sürümünde Windows'a özgü yönetim yolları farklıdır:
    // autostart Windows Başlangıç ayarlarından, LAN/konsol yalnızca Pro'da.
    let distributionInfo = { store: false, features: {} };

    function disableControl(el) {
        if (!el) return;
        el.disabled = true;
        const label = el.closest('label');
        if (label) label.classList.add('opacity-40', 'cursor-not-allowed');
    }

    async function applyDistribution() {
        try {
            if (!window.electronAPI || typeof window.electronAPI.getDistribution !== 'function') return;
            const info = await window.electronAPI.getDistribution();
            if (info && typeof info === 'object') distributionInfo = info;
        } catch (_) { return; }
        if (!distributionInfo.store) return;
        document.documentElement.classList.add('pp-store-edition');

        disableControl(elAutostart);
        if (elAutostart) elAutostart.checked = false;
        const autoNote = document.getElementById('autostart-store-note');
        if (autoNote) autoNote.classList.remove('hidden');

        disableControl(document.getElementById('api-lan'));
        disableControl(document.getElementById('api-ips'));
        const lan = document.getElementById('api-lan');
        if (lan) lan.checked = false;
        for (const id of ['api-tls', 'api-tls-strict', 'api-client-cert', 'api-cert-file', 'api-key-file', 'api-client-fingerprints']) {
            disableControl(document.getElementById(id));
        }
        const lanNote = document.getElementById('api-lan-note');
        if (lanNote) lanNote.classList.add('hidden');
        const tlsNote = document.getElementById('api-tls-note');
        if (tlsNote) tlsNote.classList.add('hidden');
        const storeNote = document.getElementById('store-api-note');
        if (storeNote) storeNote.classList.remove('hidden');
    }

    const btnStartupSettings = document.getElementById('btn-open-startup-settings');
    if (btnStartupSettings) {
        btnStartupSettings.addEventListener('click', () => {
            if (window.electronAPI && typeof window.electronAPI.openStartupSettings === 'function') {
                window.electronAPI.openStartupSettings();
            }
        });
    }

    async function loadSettings() {
        const autostart = localStorage.getItem('autostart') === 'true';
        const voice = localStorage.getItem('voice') === 'true';
        let theme = localStorage.getItem('theme') || 'dark';
        let themeId = VALID_THEME_IDS.includes(localStorage.getItem('themeId')) ? localStorage.getItem('themeId') : 'obsidian';
        const notifications = localStorage.getItem('notifications') !== 'false';
        const soundMode = getSoundMode();

        // L-01: dil ve otonomi için tek doğruluk kaynağı sunucu ayarları.
        // Tema/voice/notifications cihaza özel tercihlerdir; localStorage'da kalır.
        let language = localStorage.getItem('language');
        let autonomyMode = localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic';
        let wakeMode = localStorage.getItem('wakeMode') === 'skip' ? 'skip' : 'run';
        let wakeToleranceMinutes = parseInt(localStorage.getItem('wakeToleranceMinutes'), 10);
        if (!Number.isInteger(wakeToleranceMinutes)) wakeToleranceMinutes = 10;
        let serverSettings = null;
        try {
            if (window.electronAPI && typeof window.electronAPI.getPublicSettings === 'function') {
                serverSettings = await window.electronAPI.getPublicSettings();
            }
        } catch (err) {
            console.warn('[Settings] sunucu ayarları okunamadı:', err && err.message);
        }
        if (serverSettings && typeof serverSettings === 'object') {
            if (typeof serverSettings.language === 'string' && serverSettings.language) {
                language = serverSettings.language;
            }
            if (!localStorage.getItem('theme') && (serverSettings.theme === 'light' || serverSettings.theme === 'dark')) {
                theme = serverSettings.theme;
            }
            if (!localStorage.getItem('themeId') && VALID_THEME_IDS.includes(serverSettings.themeId)) {
                themeId = serverSettings.themeId;
            }
            if (localStorage.getItem('pp-sidebar-collapsed') === null && typeof serverSettings.sidebarCollapsed === 'boolean') {
                setSidebarCollapsed(serverSettings.sidebarCollapsed, { persist: false });
            }
            autonomyMode = serverSettings.autonomyMode === 'full' ? 'full' : 'classic';
            // Uyku politikası sunucu ayarıdır (TaskManager doğrudan okur).
            if (serverSettings.wakeMode === 'skip' || serverSettings.wakeMode === 'run') {
                wakeMode = serverSettings.wakeMode;
            }
            if (Number.isInteger(serverSettings.wakeToleranceMinutes)) {
                wakeToleranceMinutes = serverSettings.wakeToleranceMinutes;
            }
        }

        if (!language) {
            const sysLang = navigator.language.split('-')[0].toLowerCase();
            const translated = (window.PPLocale && window.PPLocale.translated) || [];
            language = translated.includes(sysLang) ? sysLang : UI_FALLBACK_LANG;
            // First run: keep the main process (tray/menu) in sync with
            // the language that was detected in the renderer.
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ language }).catch(() => { });
            }
        }
        try {
            localStorage.setItem('language', language);
            localStorage.setItem('autonomyMode', autonomyMode);
            localStorage.setItem('wakeMode', wakeMode);
            localStorage.setItem('wakeToleranceMinutes', String(wakeToleranceMinutes));
        } catch (_) { /* depolama kapalı olabilir */ }

        if (elAutostart) elAutostart.checked = autostart;
        if (elVoice) elVoice.checked = voice;
        if (typeof loadEnergyCard === 'function') loadEnergyCard();
        if (typeof refreshPinState === 'function') refreshPinState();
        const modeRadio = document.querySelector('input[name="autonomyMode"][value="' + autonomyMode + '"]');
        if (modeRadio) modeRadio.checked = true;
        const wakeRadio = document.querySelector('input[name="wakeMode"][value="' + wakeMode + '"]');
        if (wakeRadio) wakeRadio.checked = true;
        const wakeTolEl = document.getElementById('setting-wake-tolerance');
        if (wakeTolEl) wakeTolEl.value = String(wakeToleranceMinutes);
        if (elTheme) elTheme.value = theme;
        if (elNotifications) elNotifications.checked = notifications;
        if (elSoundMode) elSoundMode.value = soundMode;
        if (elLanguage) elLanguage.value = language;
        activeThemeId = themeId;
        committedTheme = theme;
        committedThemeId = themeId;
        committedLanguage = language;
        try { localStorage.setItem('themeId', themeId); } catch (_) { /* yut */ }

        applyTheme(theme, themeId);
        syncSidebarCollapseUi();
        applyLanguage(language);
        // Store kısıtları sözlük uygulandıktan sonra görünürleşir.
        await applyDistribution();
    }

    // Smart Finish Task Creation (WBS-6.1/6.2: 7 koşul + çoklu kurucu + saat)
    // Etiketler anahtar olarak tutulur; dil değişince yeniden çevrilir
    // (init anında sabitlenen metin eski dilde kalmamalı).
    const SF_TYPE_CONFIG = {
        process_running: { labelKey: 'sfProcessNameLabel', placeholder: 'handbrake.exe', kind: 'text', extra: 'onclose' },
        cpu_usage: { labelKey: 'sfCpuThreshold', placeholder: '10', kind: 'number', extra: 'none' },
        user_idle: { labelKey: 'sfIdleSeconds', placeholder: '300', kind: 'number', extra: 'none' },
        network_speed: { labelKey: 'sfNetworkThreshold', placeholder: '50', kind: 'number', extra: 'none' },
        disk_activity: { labelKey: 'sfDiskThreshold', placeholder: '100', kind: 'number', extra: 'none' },
        battery_level: { labelKey: 'sfBatteryLevel', placeholder: '20', kind: 'number', extra: 'direction' },
        file_stable: { labelKey: 'sfFilePath', placeholder: 'C:\\Yedekler', kind: 'text', extra: 'seconds' }
    };
    let sfConditions = [];

    function onSfTypeChange() {
        const type = document.getElementById('sf-condition-type').value;
        const cfg = SF_TYPE_CONFIG[type] || SF_TYPE_CONFIG.process_running;
        document.getElementById('sf-value-label').innerText = t(cfg.labelKey);
        document.getElementById('sf-condition-value').placeholder = t('examplePrefix') + ' ' + cfg.placeholder;
        document.getElementById('sf-condition-value').type = cfg.kind === 'number' ? 'number' : 'text';
        const extraRow = document.getElementById('sf-extra-row');
        const extraLabel = document.getElementById('sf-extra-label');
        const extraInput = document.getElementById('sf-extra');
        const dirSel = document.getElementById('sf-direction');
        const oncloseWrap = document.getElementById('sf-onclose-wrap');
        extraRow.classList.toggle('hidden', cfg.extra === 'none');
        dirSel.classList.toggle('hidden', cfg.extra !== 'direction');
        oncloseWrap.classList.toggle('hidden', cfg.extra !== 'onclose');
        oncloseWrap.classList.toggle('flex', cfg.extra === 'onclose');
        extraInput.classList.toggle('hidden', cfg.extra === 'onclose' || cfg.extra === 'direction');
        if (cfg.extra === 'seconds') {
            extraLabel.innerText = t('sfStableSeconds');
            if (!extraInput.value) extraInput.value = '60';
        }
    }

    function readConditionFromForm() {
        const type = document.getElementById('sf-condition-type').value;
        const raw = document.getElementById('sf-condition-value').value.trim();
        const num = Number(raw);
        const extraNum = Number(document.getElementById('sf-extra').value);
        switch (type) {
            case 'process_running':
                if (!raw) return { error: t('errorEnterProcess') };
                return { cond: { type, processName: raw, triggerOnClose: document.getElementById('sf-onclose').checked } };
            case 'cpu_usage':
                if (!Number.isFinite(num) || num < 0 || num > 100) return { error: t('errorCpuRange') };
                return { cond: { type, thresholdPercent: Math.floor(num) } };
            case 'user_idle':
                if (!Number.isFinite(num) || num <= 0) return { error: t('errorPositiveSeconds') };
                return { cond: { type, idleSeconds: Math.floor(num) } };
            case 'network_speed':
            case 'disk_activity':
                if (!Number.isFinite(num) || num < 0) return { error: t('errorKbps') };
                return { cond: { type, thresholdKbps: Math.floor(num) } };
            case 'battery_level': {
                if (!Number.isFinite(num) || num < 0 || num > 100) return { error: t('errorBatteryRange') };
                const dir = document.getElementById('sf-direction').value;
                return { cond: dir === 'above' ? { type, abovePercent: Math.floor(num) } : { type, belowPercent: Math.floor(num) } };
            }
            case 'file_stable':
                if (!raw) return { error: t('errorEnterPath') };
                if (raw.length > 260) return { error: t('errorPathTooLong') };
                return { cond: { type, filePath: raw, stableSeconds: (Number.isFinite(extraNum) && extraNum > 0) ? Math.floor(extraNum) : 60 } };
            default:
                return { error: t('errorUnknownCondition') };
        }
    }

    function describeCondition(c) {
        switch (c.type) {
            case 'process_running': return t('sfConditionProcess', { name: c.processName || '?', state: c.triggerOnClose ? t('sfStateOnClose') : t('sfStateRunning') });
            case 'cpu_usage': return t('sfConditionCpu', { percent: c.thresholdPercent });
            case 'user_idle': return t('sfConditionIdle', { seconds: c.idleSeconds });
            case 'network_speed': return t('sfConditionNetwork', { kbps: c.thresholdKbps });
            case 'disk_activity': return t('sfConditionDisk', { kbps: c.thresholdKbps });
            case 'battery_level': return c.belowPercent != null ? t('sfConditionBatteryBelow', { percent: c.belowPercent }) : t('sfConditionBatteryAbove', { percent: c.abovePercent });
            case 'file_stable': return t('sfConditionFileStable', { seconds: c.stableSeconds });
            default: return c.type;
        }
    }

    function renderSfChips() {
        const box = document.getElementById('sf-chip-list');
        if (!box) return;
        box.replaceChildren();
        sfConditions.forEach((c, idx) => {
            const chip = document.createElement('span');
            chip.className = 'inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary dark:text-primary-light rounded-full text-xs font-bold';
            chip.appendChild(document.createTextNode(describeCondition(c)));
            const x = document.createElement('button');
            x.className = 'ml-1 font-black';
            x.textContent = '×';
            x.addEventListener('click', () => { sfConditions.splice(idx, 1); renderSfChips(); });
            chip.appendChild(x);
            box.appendChild(chip);
        });
    }

    function reflectConditionToForm(c) {
        if (!c) return;
        document.getElementById('sf-condition-type').value = c.type;
        onSfTypeChange();
        const v = document.getElementById('sf-condition-value');
        if (c.type === 'process_running') {
            v.value = c.processName || '';
            document.getElementById('sf-onclose').checked = c.triggerOnClose !== false;
        } else if (c.type === 'cpu_usage') v.value = c.thresholdPercent ?? '';
        else if (c.type === 'user_idle') v.value = c.idleSeconds ?? '';
        else if (c.type === 'network_speed' || c.type === 'disk_activity') v.value = c.thresholdKbps ?? '';
        else if (c.type === 'battery_level') {
            if (c.belowPercent != null) { v.value = c.belowPercent; document.getElementById('sf-direction').value = 'below'; }
            else { v.value = c.abovePercent ?? ''; document.getElementById('sf-direction').value = 'above'; }
        } else if (c.type === 'file_stable') {
            v.value = c.filePath || '';
            document.getElementById('sf-extra').value = c.stableSeconds ?? 60;
        }
    }

    function nextOccurrence(hhmm) {
        const parts = String(hhmm).split(':');
        const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
        if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
        return d.getTime();
    }

    const sfTypeSel = document.getElementById('sf-condition-type');
    if (sfTypeSel) {
        sfTypeSel.addEventListener('change', onSfTypeChange);
        onSfTypeChange();
    }

    const btnAddSf = document.getElementById('btn-add-sf-condition');
    if (btnAddSf) {
        btnAddSf.addEventListener('click', () => {
            if (sfConditions.length >= 3) {
                showToast(t('sfMaxConditions'), 'error');
                return;
            }
            const { cond, error } = readConditionFromForm();
            if (error) { showToast(error, 'error'); return; }
            sfConditions.push(cond);
            document.getElementById('sf-condition-value').value = '';
            renderSfChips();
        });
    }

    // Şablondan forma doldurma (WBS-6.5)
    function applyTemplate(tpl) {
        if (!tpl || tpl.disabled) return;
        if (tpl.schedule && tpl.schedule.timeOfDay) {
            document.getElementById('sf-time').value = tpl.schedule.timeOfDay;
            showToast(t('sfTemplateTimeApplied', { name: localizedTemplateName(tpl) }), 'info');
        } else {
            const group = tpl.defaultConditionGroup ||
                (tpl.defaultCondition ? { operator: 'AND', stabilitySeconds: tpl.defaultCondition.stabilitySeconds ?? 15, conditions: [tpl.defaultCondition] } : null);
            if (group && Array.isArray(group.conditions)) {
                sfConditions = group.conditions.map(c => ({ ...c }));
                document.getElementById('sf-operator').value = group.operator === 'OR' ? 'OR' : 'AND';
                document.getElementById('sf-stability').value = group.stabilitySeconds ?? 15;
                reflectConditionToForm(sfConditions[0]);
                renderSfChips();
                showToast(t('sfTemplateLoaded', { name: localizedTemplateName(tpl) }), 'info');
            }
        }
        if (tpl.action) document.getElementById('sf-action').value = tpl.action;
        switchView('nav-smartfinish');
    }

    // Faz 3: tekrarlayan program kontrolü (günlük/hafta içi/hafta sonu/özel).
    const repeatSelect = document.getElementById('sf-repeat');
    const repeatDaysWrap = document.getElementById('sf-repeat-days');
    const repeatDaysBox = document.getElementById('sf-repeat-day-chips');
    const repeatDays = new Set([1, 2, 3, 4, 5]);
    const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

    function weekdayShort(day) {
        const locale = { no: 'nb-NO', zh: 'zh-CN', pt: 'pt-PT' }[getCurrentLanguage()] || getCurrentLanguage();
        try {
            const label = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + day));
            return label.replace('.', '').slice(0, 3);
        } catch (_) {
            return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day];
        }
    }

    function renderRepeatDayChips() {
        if (!repeatDaysBox) return;
        const chips = WEEKDAY_ORDER.map((day) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.day = String(day);
            btn.setAttribute('aria-pressed', repeatDays.has(day) ? 'true' : 'false');
            btn.className = repeatDays.has(day)
                ? 'px-2.5 py-1 rounded-lg text-xs font-bold border border-primary/60 bg-primary/10 text-primary dark:text-primary-light'
                : 'px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400';
            btn.textContent = weekdayShort(day);
            btn.addEventListener('click', () => {
                if (repeatDays.has(day)) repeatDays.delete(day);
                else repeatDays.add(day);
                renderRepeatDayChips();
            });
            return btn;
        });
        repeatDaysBox.replaceChildren(...chips);
    }

    function syncRepeatVisibility() {
        const value = repeatSelect ? repeatSelect.value : 'none';
        if (repeatDaysWrap) repeatDaysWrap.classList.toggle('hidden', value !== 'custom');
    }

    if (repeatSelect) {
        renderRepeatDayChips();
        syncRepeatVisibility();
        repeatSelect.addEventListener('change', syncRepeatVisibility);
    }

    /** Tekrarlayan görevin insan-dili özeti ("Her gün 23:00"). */
    function repeatSummary(task) {
        const rec = task && task.recurrence;
        if (!rec || !rec.enabled) return '';
        const time = String(rec.timeOfDay || '00:00');
        if (rec.frequency === 'weekdays') return t('repeatWeekdaysAt', { time });
        if (rec.frequency === 'weekends') return t('repeatWeekendsAt', { time });
        if (rec.frequency === 'custom') return t('repeatCustomAt', { time });
        return t('repeatEveryDay', { time });
    }

    const btnSaveSf = document.getElementById('btn-save-sf-task');
    if (btnSaveSf) {
        btnSaveSf.addEventListener('click', async () => {
            const action = document.getElementById('sf-action').value;
            const timeVal = document.getElementById('sf-time').value;
            const repeatValue = repeatSelect ? repeatSelect.value : 'none';
            // WBS-11.1: Opsiyonel zincir halkası (tek halka; dahası API/CLI ile).
            const chainAction = document.getElementById('sf-chain-action').value;
            const chainDelay = parseInt(document.getElementById('sf-chain-delay').value, 10);
            const chain = (chainAction && Number.isInteger(chainDelay) && chainDelay >= 1 && chainDelay <= 43200)
                ? [{ action: chainAction, delayMinutes: chainDelay }]
                : undefined;
            if (repeatValue !== 'none') {
                if (!timeVal) { showToast(t('errorRepeatNeedsTime'), 'error'); return; }
                const days = repeatValue === 'custom'
                    ? [...repeatDays]
                    : (repeatValue === 'weekdays' ? [1, 2, 3, 4, 5] : (repeatValue === 'weekends' ? [0, 6] : []));
                if (repeatValue === 'custom' && days.length === 0) {
                    showToast(t('errorRepeatNeedsDay'), 'error');
                    return;
                }
                const targetTime = nextOccurrence(timeVal);
                if (!targetTime) { showToast(t('errorInvalidTime'), 'error'); return; }
                const taskDataRecurring = {
                    name: `Recurring (${action} @ ${timeVal})`,
                    action,
                    trigger: { type: 'scheduled_time', targetTime },
                    recurrence: {
                        enabled: true,
                        frequency: repeatValue,
                        daysOfWeek: days,
                        timeOfDay: timeVal
                    },
                    ...(chain ? { chain } : {})
                };
                if (window.electronAPI && window.electronAPI.createTask) {
                    const res = await window.electronAPI.createTask(taskDataRecurring);
                    if (res && res.success === false) {
                        showToast(res.message || t('errorTaskCreate'), 'error');
                    } else {
                        showToast(t('toastRecurringCreated'), 'success');
                        loadTasks();
                    }
                }
                return;
            }
            let taskData;
            if (timeVal) {
                // Saat seçiliyse koşul izlenmez — belirtilen saatte çalışır (dürüst anlam).
                const targetTime = nextOccurrence(timeVal);
                if (!targetTime) { showToast(t('errorInvalidTime'), 'error'); return; }
                taskData = {
                    name: `Scheduled (${action} @ ${timeVal})`,
                    action,
                    trigger: { type: 'scheduled_time', targetTime },
                    ...(chain ? { chain } : {})
                };
            } else {
                let conditions = sfConditions;
                if (conditions.length === 0) {
                    const { cond, error } = readConditionFromForm();
                    if (error) { showToast(error, 'error'); return; }
                    conditions = [cond];
                }
                const stability = parseInt(document.getElementById('sf-stability').value, 10);
                taskData = {
                    name: `Smart Finish (${conditions.map(describeCondition).join(' + ')})`,
                    action,
                    conditionGroup: {
                        operator: document.getElementById('sf-operator').value === 'OR' ? 'OR' : 'AND',
                        stabilitySeconds: (Number.isInteger(stability) && stability >= 0 && stability <= 3600) ? stability : 15,
                        conditions
                    },
                    ...(chain ? { chain } : {})
                };
            }

            if (window.electronAPI && window.electronAPI.createTask) {
                const res = await window.electronAPI.createTask(taskData);
                if (res && res.success === false) {
                    showToast(res.message || t('errorTaskCreate'), 'error');
                } else {
                    showToast(t(timeVal ? 'toastScheduledTaskCreated' : 'toastSmartFinishMonitoring'), 'success');
                    sfConditions = [];
                    renderSfChips();
                }
            }
        });
    }

    // Kullanıcı şablonu kaydetme (WBS-6.4)
    const btnSaveTpl = document.getElementById('btn-save-sf-template');
    if (btnSaveTpl) {
        btnSaveTpl.addEventListener('click', async () => {
            const name = document.getElementById('sf-template-name').value.trim();
            if (!name) { showToast(t('errorTemplateName'), 'error'); return; }
            const action = document.getElementById('sf-action').value;
            const timeVal = document.getElementById('sf-time').value;
            const tpl = { name, action, description: '' };
            if (timeVal) {
                tpl.schedule = { timeOfDay: timeVal };
            } else {
                let conditions = sfConditions;
                if (conditions.length === 0) {
                    const { cond, error } = readConditionFromForm();
                    if (error) { showToast(error, 'error'); return; }
                    conditions = [cond];
                }
                if (conditions.length === 1) tpl.defaultCondition = conditions[0];
                else tpl.defaultConditionGroup = {
                    operator: document.getElementById('sf-operator').value === 'OR' ? 'OR' : 'AND',
                    stabilitySeconds: parseInt(document.getElementById('sf-stability').value, 10) || 15,
                    conditions
                };
            }
            if (window.electronAPI && window.electronAPI.saveTemplate) {
                const res = await window.electronAPI.saveTemplate(tpl);
                if (res && res.success === false) {
                    showToast(res.message || t('errorTemplateSave'), 'error');
                } else {
                    showToast(t('toastTemplateSaved'), 'success');
                    document.getElementById('sf-template-name').value = '';
                }
            }
        });
    }

    // Load Templates (WBS-6.5: Kullan gerçekten forma doldurur; XSS'e karşı kaçışlı)
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ── Task management (list / snooze / cancel) ──
    const TASK_STATUS_KEYS = {
        draft: 'statusDraft',
        scheduled: 'statusScheduled',
        monitoring: 'statusMonitoring',
        waiting: 'statusWaiting',
        warning: 'statusWarning',
        snoozed: 'statusSnoozed',
        executing: 'statusExecuting',
        completed: 'statusCompleted',
        cancelled: 'statusCancelled',
        blocked: 'statusBlocked',
        failed: 'statusFailed',
        disabled: 'statusDisabled',
        expired: 'statusExpired'
    };
    const TASK_ACTIVE_STATUSES = new Set(['draft', 'scheduled', 'monitoring', 'waiting', 'warning', 'snoozed', 'executing']);
    let taskFilter = 'active';
    let tasksRefreshTimer = null;
    // D-07: 5 sn'lik polling üst üste binmez.
    let tasksLoading = false;
    // WP-13.T7: küme değişmediyse yalnızca süre hücreleri güncellenir.
    let lastTaskRenderSignature = '';

    function isTaskActive(task) {
        return TASK_ACTIVE_STATUSES.has(task.status) && task.enabled !== false;
    }

    // Biten (terminal) görevler listeden kaldırılabilir. Sunucu da
    // yalnızca terminal durumdakileri siler (removeTask).
    const TASK_REMOVABLE_STATUSES = new Set(['completed', 'cancelled', 'blocked', 'failed', 'expired', 'disabled']);
    function isTaskRemovable(task) {
        return !!task && TASK_REMOVABLE_STATUSES.has(task.status);
    }

    function taskStatusLabel(status) {
        return t(TASK_STATUS_KEYS[status] || 'statusUnknown');
    }

    function formatTaskRemaining(targetTime) {
        const ms = Number(targetTime) - Date.now();
        if (!Number.isFinite(ms) || ms <= 0) return '—';
        const total = Math.floor(ms / 1000);
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (d > 0) return `${d}${t('shortDay')} ${h}${t('shortHour')}`;
        if (h > 0) return `${h}${t('shortHour')} ${m}${t('shortMinute')}`;
        if (m > 0) return `${m}${t('shortMinute')} ${s}${t('shortSecond')}`;
        return `${s}${t('shortSecond')}`;
    }

    function describeTaskTrigger(task) {
        const trig = task.trigger || {};
        if (task.recurrence && task.recurrence.enabled) return t('triggerRecurring');
        if (trig.type === 'duration') return t('triggerDuration');
        if (trig.type === 'scheduled_time' || trig.targetTime) return t('triggerScheduledTime');
        if (trig.type === 'recurring') return t('triggerRecurring');
        if (task.conditionGroup || trig.type === 'composite') return t('triggerSmartFinish');
        if (trig.type === 'api_call') return t('triggerApi');
        return t('triggerSmartFinish');
    }

    function taskDisplayName(task) {
        // UI-created task names are localized at creation time; derive
        // the label from the trigger so old tasks follow the active
        // language too. Tasks from API/CLI keep their author-provided name.
        const trig = task.trigger || {};
        const repeat = repeatSummary(task);
        if (task.source === 'user_interface') {
            if (repeat) {
                return t('recurringTaskName', { action: getActionString(task.action), schedule: repeat });
            }
            if (trig.type === 'duration') {
                return t('quickTimerName', { action: getActionString(task.action) });
            }
            if (trig.type === 'scheduled_time' && trig.targetTime) {
                return t('scheduledTaskName', {
                    action: getActionString(task.action),
                    time: new Date(trig.targetTime).toLocaleTimeString(getCurrentLanguage())
                });
            }
            if (task.conditionGroup) return t('smartFinishTaskName');
        }
        if (task.name && task.name.startsWith('Hızlı Zamanlayıcı')) {
            return t('quickTimerName', { action: getActionString(task.action) });
        }
        return localizedTaskName(task.name, task.action);
    }

    // T-REN-09: yenileme sonrası monitoring/waiting görevler aktif görünümde kalır.
    function renderMonitoringTasks(all) {
        const card = document.getElementById('monitoring-card');
        const listEl = document.getElementById('monitoring-card-list');
        if (!card || !listEl) return;
        const watched = (all || []).filter((task) => task
            && ['monitoring', 'waiting', 'warning', 'executing'].includes(task.status));
        card.classList.toggle('hidden', watched.length === 0);
        const items = watched.slice(0, 8).map((task) => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between gap-3';
            const name = document.createElement('span');
            name.className = 'font-semibold truncate';
            name.textContent = taskDisplayName(task);
            const status = document.createElement('span');
            status.className = 'shrink-0 text-[10px] uppercase tracking-wide text-primary dark:text-primary-light';
            status.textContent = taskStatusLabel(task.status);
            li.append(name, status);
            return li;
        });
        listEl.replaceChildren(...items);
    }

    function taskRenderSignature(list) {
        if (window.PPTasksView) {
            return window.PPTasksView.taskSignature(list, { filter: taskFilter, lang: getCurrentLanguage() });
        }
        return JSON.stringify(list.map(task => [task.id, task.status, task.trigger && task.trigger.targetTime]));
    }

    function updateTaskDurationCells(list) {
        const tbody = document.getElementById('tasks-table-body');
        if (!tbody) return;
        if (window.PPTasksView) {
            window.PPTasksView.updateDurationCells(tbody, list, formatTaskRemaining);
            return;
        }
        updateTaskDurationCellsFallback(tbody, list);
    }

    function updateTaskDurationCellsFallback(tbody, list) {
        const byId = new Map(list.map(task => [String(task.id), task]));
        tbody.querySelectorAll('[data-task-id]').forEach(row => {
            const task = byId.get(row.getAttribute('data-task-id'));
            const cell = row.querySelector('[data-task-duration]');
            if (!task || !cell) return;
            const next = (task.trigger && task.trigger.targetTime)
                ? formatTaskRemaining(task.trigger.targetTime)
                : '—';
            if (cell.textContent !== next) cell.textContent = next;
        });
    }

    async function loadTasks() {
        if (tasksLoading) return;
        if (!window.electronAPI || !window.electronAPI.getTasks) return;
        const tbody = document.getElementById('tasks-table-body');
        const empty = document.getElementById('tasks-empty');
        const error = document.getElementById('tasks-error');
        if (!tbody) return;
        tasksLoading = true;
        try {
            const all = await window.electronAPI.getTasks();
            renderMonitoringTasks(all);
            const list = (all || [])
                .filter(task => taskFilter === 'all' || isTaskActive(task))
                .sort((a, b) => {
                    const at = (a.trigger && a.trigger.targetTime) || Infinity;
                    const bt = (b.trigger && b.trigger.targetTime) || Infinity;
                    return at - bt;
                });
            if (error) error.classList.add('hidden');
            const tableWrap = document.getElementById('tasks-table-wrap');
            if (tableWrap) tableWrap.classList.toggle('hidden', list.length === 0);
            if (empty) {
                empty.classList.toggle('hidden', list.length !== 0);
                // PPX-019: yalnız metin değiştiyse yaz (canlı bölge spam'i yok).
                const title = empty.querySelector('.pp-empty-title');
                const message = t('tasksEmpty');
                if (title && title.textContent !== message) title.textContent = message;
            }
            // "Bitenleri temizle" yalnızca kaldırılabilir görev varsa görünür.
            const clearFinishedBtn = document.getElementById('btn-clear-finished');
            if (clearFinishedBtn) {
                const removable = (all || []).filter(isTaskRemovable).length;
                clearFinishedBtn.classList.toggle('hidden', removable === 0);
            }
            const signature = taskRenderSignature(list);
            const sameSet = window.PPTasksView
                ? !window.PPTasksView.needsFullRender(signature, lastTaskRenderSignature, tbody.children.length, list.length)
                : (signature === lastTaskRenderSignature && tbody.children.length === list.length);
            // WP-13.T7: aynı görev kümesi → yalnızca süre hücreleri.
            if (sameSet) {
                const paint = () => updateTaskDurationCells(list);
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint);
                else paint();
                return;
            }
            lastTaskRenderSignature = signature;

            const rows = list.map(task => {
                const active = isTaskActive(task);
                const next = (task.trigger && task.trigger.targetTime) ? formatTaskRemaining(task.trigger.targetTime) : '—';
                const statusClass = active ? 'bg-primary/10 text-primary dark:text-primary-light' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50 dark:hover:bg-slate-900/50';
                row.setAttribute('data-task-id', String(task.id));
                const cell = (text, className) => {
                    const td = document.createElement('td');
                    td.className = className;
                    td.textContent = text;
                    return td;
                };
                const durationCell = cell(next, 'p-3 text-xs font-mono');
                durationCell.setAttribute('data-task-duration', '');
                row.append(
                    cell(taskDisplayName(task), 'p-3 text-xs font-bold'),
                    cell(getActionString(task.action), 'p-3 text-xs'),
                    cell(describeTaskTrigger(task), 'p-3 text-xs text-slate-600 dark:text-slate-400'),
                    durationCell
                );
                const statusCell = document.createElement('td');
                statusCell.className = 'p-3 text-xs';
                const badge = document.createElement('span');
                badge.className = `px-2 py-0.5 rounded-full ${statusClass} font-semibold`;
                badge.textContent = taskStatusLabel(task.status);
                statusCell.appendChild(badge);
                row.appendChild(statusCell);

                const actionCell = document.createElement('td');
                actionCell.className = 'p-3 text-right whitespace-nowrap space-x-1';
                if (active) {
                    const snooze = document.createElement('button');
                    snooze.className = 'btn-task-snooze px-2 py-1 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-[11px] font-bold';
                    snooze.textContent = `+10 ${t('shortMinute')}`;
                    snooze.addEventListener('click', () => snoozeTaskFromList(task.id, 10));
                    const cancel = document.createElement('button');
                    cancel.className = 'btn-task-cancel px-2 py-1 rounded bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 text-[11px] font-bold';
                    cancel.textContent = t('taskCancel');
                    cancel.addEventListener('click', () => cancelTaskFromList(task.id));
                    actionCell.append(snooze, cancel);
                } else if (isTaskRemovable(task)) {
                    // Biten görev: kullanıcı listeden kaldırabilmelidir.
                    // Aksi halde iptal edilen görevler eylemsiz satırlar
                    // olarak kalıcı biçimde birikir.
                    const remove = document.createElement('button');
                    remove.className = 'btn-task-remove px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 text-[11px] font-bold';
                    remove.textContent = t('taskRemove');
                    remove.addEventListener('click', () => removeTaskFromList(task.id));
                    actionCell.appendChild(remove);
                }
                row.appendChild(actionCell);
                return row;
            });
            const paint = () => tbody.replaceChildren(...rows);
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint);
            else paint();
        } catch (err) {
            if (error) {
                error.classList.remove('hidden');
                error.innerText = t('tasksLoadError');
            }
        } finally {
            tasksLoading = false;
        }
    }

    async function cancelTaskFromList(taskId) {
        const run = (pin) => window.electronAPI.cancelTask(taskId, pin);
        const res = await run();
        if (isPinChallenge(res)) {
            requestPin(t('taskPinCancelPrompt'), {
                run,
                done: (r2) => {
                    if (r2 && r2.success !== false) {
                        showToast(t('taskCancelled'), 'success');
                        loadTasks();
                    } else {
                        showToast(t('taskCancelFailed'), 'error');
                    }
                }
            });
            paintPinError(res);
            return;
        }
        if (res && res.success === false) {
            showToast(res.message || t('taskCancelFailed'), 'error');
            return;
        }
        showToast(t('taskCancelled'), 'success');
        loadTasks();
    }

    async function removeTaskFromList(taskId) {
        if (!window.electronAPI || typeof window.electronAPI.removeTask !== 'function') return;
        try {
            const res = await window.electronAPI.removeTask(taskId);
            if (res && res.success === false) {
                showToast(res.message || t('taskRemoveFailed'), 'error');
                return;
            }
            showToast(t('taskRemoved'), 'success');
            loadTasks();
        } catch (err) {
            showToast(t('taskRemoveFailed'), 'error');
        }
    }

    async function snoozeTaskFromList(taskId, minutes) {
        const run = (pin) => window.electronAPI.snoozeTask({ taskId, minutes, pin });
        const res = await run();
        if (isPinChallenge(res)) {
            requestPin(t('taskPinSnoozePrompt'), {
                run,
                done: (r2) => {
                    if (r2 && r2.success !== false) {
                        showToast(t('taskSnoozed', { minutes }), 'success');
                        loadTasks();
                    } else {
                        showToast(t('taskSnoozeFailed'), 'error');
                    }
                }
            });
            paintPinError(res);
            return;
        }
        if (res && res.success === false) {
            showToast(res.message || t('taskSnoozeFailed'), 'error');
            return;
        }
        showToast(t('taskSnoozed', { minutes }), 'success');
        loadTasks();
    }

    document.querySelectorAll('[data-task-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            taskFilter = btn.getAttribute('data-task-filter') === 'all' ? 'all' : 'active';
            lastTaskRenderSignature = '';
            document.querySelectorAll('[data-task-filter]').forEach(b => {
                const on = b === btn;
                b.classList.toggle('bg-primary', on);
                b.classList.toggle('text-white', on);
                b.classList.toggle('bg-white', !on);
                b.classList.toggle('dark:bg-slate-800', !on);
                b.classList.toggle('text-slate-600', !on);
                b.classList.toggle('dark:text-slate-400', !on);
                // PPX-017: durum renk dışında da programatik olarak açık.
                b.setAttribute('aria-pressed', String(on));
            });
            loadTasks();
        });
    });
    const btnRefreshTasks = document.getElementById('btn-refresh-tasks');
    if (btnRefreshTasks) btnRefreshTasks.addEventListener('click', loadTasks);

    // "Bitenleri temizle": terminal durumdaki tüm görevleri kaldırır.
    // Düğme yalnızca aralarında kaldırılabilir görev varsa görünür.
    const btnClearFinished = document.getElementById('btn-clear-finished');
    if (btnClearFinished) {
        btnClearFinished.addEventListener('click', async () => {
            if (!window.electronAPI || typeof window.electronAPI.removeTerminalTasks !== 'function') return;
            btnClearFinished.disabled = true;
            try {
                const res = await window.electronAPI.removeTerminalTasks();
                const removed = (res && Number.isFinite(res.removed)) ? res.removed : 0;
                showToast(t('finishedTasksCleared', { count: removed }), 'success');
                loadTasks();
            } catch (err) {
                showToast(t('taskRemoveFailed'), 'error');
            } finally {
                btnClearFinished.disabled = false;
            }
        });
    }
    // Keep the "next run" column fresh while the view is open.
    tasksRefreshTimer = setInterval(() => {
        const view = document.getElementById('view-tasks');
        if (view && !view.classList.contains('hidden')) loadTasks();
    }, 5000);
    window.addEventListener('beforeunload', () => {
        if (tasksRefreshTimer) clearInterval(tasksRefreshTimer);
        tasksRefreshTimer = null;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (typeof stopSettingsPoll === 'function') stopSettingsPoll();
        if (typeof wizardStopTimers === 'function') wizardStopTimers();
    });

    // Re-render language-dependent dynamic content after a language change.
    function refreshI18nViews() {
        const isVisible = (id) => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        };
        if (isVisible('view-tasks') && typeof loadTasks === 'function') loadTasks();
        if (isVisible('view-templates') && typeof loadTemplates === 'function') loadTemplates();
        if (isVisible('view-history') && typeof loadHistory === 'function') loadHistory();
        if (isVisible('view-stats') && typeof loadStatistics === 'function') loadStatistics();
    }

    // applyLanguage() is defined outside this listener so pre-DOM code
    // can call it; this hook gives it access to the refresh helpers.
    afterLanguageChange = () => {
        if (typeof updateDisplay === 'function') updateDisplay();
        refreshI18nViews();
        refreshPinState();
        loadAssistant();
        settingsRefreshAi();
        wizardRefreshAi();
        // Smart Finish etiketleri anahtardan çevrildiği için yenilenir.
        if (typeof onSfTypeChange === 'function') onSfTypeChange();
        // Kurtarma bildirimi dinamik yol içerir; yeni dilde yeniden çizilir.
        renderStorageRecovery();
        syncSidebarCollapseUi();
        if (themeColorCountEl) {
            themeColorCountEl.textContent = t('colorThemeCount', { count: VALID_THEME_IDS.length });
        }
    };

    // Built-in template ids → translation keys (names/descriptions live
    // in the i18n dictionary so the template list follows the UI language).
    const TEMPLATE_I18N = {
        tpl_download_shutdown: ['tplDownloadShutdown', 'tplDownloadShutdownDesc'],
        tpl_render_shutdown: ['tplRenderShutdown', 'tplRenderShutdownDesc'],
        tpl_idle_sleep: ['tplIdleSleep', 'tplIdleSleepDesc'],
        tpl_process_lock: ['tplProcessLock', 'tplProcessLockDesc'],
        tpl_steam_download: ['tplSteamDownload', 'tplSteamDownloadDesc'],
        tpl_meeting_lock: ['tplMeetingLock', 'tplMeetingLockDesc'],
        tpl_nightly_sleep: ['tplNightlySleep', 'tplNightlySleepDesc'],
        tpl_battery_hibernate: ['tplBatteryHibernate', 'tplBatteryHibernateDesc'],
        tpl_backup_stable: ['tplBackupStable', 'tplBackupStableDesc'],
        tpl_presentation_lock: ['tplPresentationLock', 'tplPresentationLockDesc']
    };
    const BUILTIN_TEMPLATE_NAMES = {
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

    function localizedTemplateName(tpl) {
        if (!tpl) return '';
        if (tpl.id && TEMPLATE_I18N[tpl.id] && !tpl.custom) return t(TEMPLATE_I18N[tpl.id][0]);
        if (tpl.name && BUILTIN_TEMPLATE_NAMES[tpl.name]) return t(BUILTIN_TEMPLATE_NAMES[tpl.name]);
        return tpl.name || '';
    }

    function localizedTemplateDescription(tpl) {
        if (!tpl) return '';
        if (tpl.id && TEMPLATE_I18N[tpl.id] && !tpl.custom) return t(TEMPLATE_I18N[tpl.id][1]);
        return tpl.description || '';
    }

    function localizedTaskName(name, action) {
        if (name && name.startsWith('Hızlı Zamanlayıcı')) {
            return t('quickTimerName', { action: getActionString(action) });
        }
        if (name && BUILTIN_TEMPLATE_NAMES[name]) return t(BUILTIN_TEMPLATE_NAMES[name]);
        return name || t('smartFinishTaskName');
    }

    function sourceLabel(source) {
        const keys = {
            user_interface: 'sourceUserInterface',
            local_api: 'sourceLocalApi',
            n8n: 'sourceN8n',
            cli: 'sourceCli',
            imported_template: 'sourceTemplate',
            recurring_schedule: 'sourceRecurring',
            system_recovery: 'sourceSystemRecovery',
            console: 'sourceConsole'
        };
        return t(keys[source] || 'sourceUserInterface');
    }

    async function loadTemplates() {
        if (window.electronAPI && window.electronAPI.getTemplates) {
            let tpls;
            try {
                tpls = await window.electronAPI.getTemplates();
            } catch (_) {
                tpls = null;
            }
            if (!Array.isArray(tpls)) tpls = [];
            const grid = document.getElementById('templates-grid');
            if (grid) {
                const cards = tpls.map(tpl => {
                    const name = localizedTemplateName(tpl);
                    const description = localizedTemplateDescription(tpl) || (tpl.custom ? t('defaultUserTemplate') : '');
                    const card = document.createElement('div');
                    card.className = 'bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between';

                    const top = document.createElement('div');
                    const titleRow = document.createElement('div');
                    titleRow.className = 'flex items-center gap-3 mb-2';
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined text-primary dark:text-primary-light text-xl';
                    icon.textContent = tpl.icon || 'widgets';
                    icon.setAttribute('aria-hidden', 'true');
                    const heading = document.createElement('h4');
                    heading.className = 'font-bold text-slate-900 dark:text-white text-sm';
                    heading.textContent = name;
                    titleRow.append(icon, heading);
                    if (tpl.custom) {
                        const badge = document.createElement('span');
                        badge.className = 'text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5';
                        badge.textContent = t('badgeCustom');
                        titleRow.appendChild(badge);
                    }
                    const desc = document.createElement('p');
                    desc.className = 'text-xs text-slate-600 dark:text-slate-400 mb-4';
                    desc.textContent = description;
                    top.append(titleRow, desc);

                    const footer = document.createElement('div');
                    footer.className = 'flex gap-2';
                    const use = document.createElement('button');
                    use.className = 'flex-1 px-4 py-2 bg-primary/10 border border-primary/50 text-primary dark:text-primary-light hover:bg-primary/30 rounded-lg text-xs font-bold transition-all text-center disabled:cursor-default';
                    use.textContent = t('templateUse');
                    use.disabled = Boolean(tpl.disabled);
                    if (tpl.disabled) use.title = tpl.disabledReason || t('templateUnavailable');
                    use.addEventListener('click', () => applyTemplate(tpl));
                    footer.appendChild(use);
                    if (tpl.custom) {
                        const del = document.createElement('button');
                        del.className = 'px-3 py-2 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all';
                        del.textContent = t('delete');
                        del.addEventListener('click', async () => {
                            if (window.electronAPI && window.electronAPI.deleteTemplate) {
                                await window.electronAPI.deleteTemplate(tpl.id);
                                loadTemplates();
                                showToast(t('toastTemplateDeleted'), 'info');
                            }
                        });
                        footer.appendChild(del);
                    }
                    card.append(top, footer);
                    return card;
                });
                grid.replaceChildren(...cards);
                const empty = document.getElementById('templates-empty');
                if (empty) empty.classList.toggle('hidden', cards.length !== 0);
                grid.classList.toggle('hidden', cards.length === 0);
            }
        }
    }

    // Faz 3: profil/şablon içe-dışa aktarma (JSON).
    const btnExportTpl = document.getElementById('btn-export-templates');
    if (btnExportTpl) {
        btnExportTpl.addEventListener('click', async () => {
            if (!window.electronAPI || !window.electronAPI.exportTemplates) return;
            const res = await window.electronAPI.exportTemplates();
            if (res && res.success) {
                showToast(t('toastTemplatesExported', { count: res.count }), 'success');
            } else if (res && res.code !== 'CANCELLED') {
                showToast(res.message || t('errorTemplateExport'), 'error');
            }
        });
    }
    const btnImportTpl = document.getElementById('btn-import-templates');
    if (btnImportTpl) {
        btnImportTpl.addEventListener('click', async () => {
            if (!window.electronAPI || !window.electronAPI.importTemplates) return;
            const res = await window.electronAPI.importTemplates();
            if (res && res.success) {
                await loadTemplates();
                showToast(t('toastTemplatesImported', { count: res.count }), 'success');
            } else if (res && res.code !== 'CANCELLED') {
                showToast(res.message || t('errorTemplateImport'), 'error');
            }
        });
    }

    // Load History
    const HISTORY_FAILURE_CODES = new Set([
        'blocked_by_policy', 'condition_invalid', 'os_execution_failed',
        'authorization_error', 'timeout', 'interrupted_by_shutdown',
        'cancel_too_late', 'missed_while_asleep', 'failed'
    ]);
    const RESULT_LABEL_KEYS = {
        success: 'resultSuccess',
        cancelled_by_user: 'resultCancelled',
        snoozed_by_user: 'resultSnoozed',
        blocked_by_policy: 'resultBlockedPolicy',
        condition_invalid: 'resultConditionInvalid',
        os_execution_failed: 'resultOsFailed',
        authorization_error: 'resultAuthError',
        timeout: 'resultTimeout',
        interrupted_by_shutdown: 'resultInterrupted',
        cancel_too_late: 'resultCancelTooLate',
        missed_while_asleep: 'resultMissedAsleep',
        failed: 'resultFailed'
    };

    function resultLabel(code) {
        const key = RESULT_LABEL_KEYS[code];
        return key ? t(key) : (code || '-');
    }

    async function loadHistory() {
        if (window.electronAPI && window.electronAPI.getHistory) {
            let list;
            try {
                list = await window.electronAPI.getHistory();
            } catch (_) {
                list = null;
            }
            if (!Array.isArray(list)) list = [];
            renderHistoryWhy(list);
            const tbody = document.getElementById('history-table-body');
            if (tbody) {
                const empty = document.getElementById('history-empty');
                const card = document.getElementById('history-table-card');
                if (empty) empty.classList.toggle('hidden', list.length !== 0);
                if (card) card.classList.toggle('hidden', list.length === 0);
                if (list.length === 0) {
                    const row = document.createElement('tr');
                    const td = document.createElement('td');
                    td.colSpan = 6;
                    td.className = 'p-4 text-center text-xs text-slate-600 dark:text-slate-400';
                    td.textContent = t('emptyHistory');
                    row.appendChild(td);
                    tbody.replaceChildren(row);
                    return;
                }
                const cell = (text, className) => {
                    const td = document.createElement('td');
                    td.className = className;
                    td.textContent = text;
                    return td;
                };
                const rows = list.map(h => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-slate-50 dark:hover:bg-slate-900/50';
                    if (h.kind === 'agent_run') {
                        const badgeCell = document.createElement('td');
                        badgeCell.className = 'p-3 text-xs';
                        const badge = document.createElement('span');
                        badge.className = 'px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:text-primary-light font-semibold';
                        badge.textContent = h.outcome || '';
                        badgeCell.appendChild(badge);
                        row.append(
                            cell(new Date(h.timestamp).toLocaleTimeString(getCurrentLanguage()), 'p-3 text-xs text-slate-600 dark:text-slate-400'),
                            cell(`AI:${h.agentId || '?'}`, 'p-3 text-xs font-bold'),
                            cell(h.intent || '', 'p-3 text-xs'),
                            cell('ai_assistant', 'p-3 text-xs text-slate-600 dark:text-slate-400'),
                            badgeCell,
                            cell('', 'p-3 text-xs text-slate-600 dark:text-slate-400')
                        );
                        return row;
                    }
                    const resultCell = document.createElement('td');
                    resultCell.className = 'p-3 text-xs';
                    const badge = document.createElement('span');
                    badge.className = `px-2 py-0.5 rounded-full ${h.resultCode === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'} font-semibold`;
                    badge.textContent = resultLabel(h.resultCode);
                    resultCell.appendChild(badge);
                    row.append(
                        cell(new Date(h.timestamp).toLocaleTimeString(getCurrentLanguage()), 'p-3 text-xs text-slate-600 dark:text-slate-400'),
                        cell(localizedTaskName(h.taskName, h.action), 'p-3 text-xs font-bold'),
                        cell(getActionString(h.action), 'p-3 text-xs'),
                        cell(sourceLabel(h.source), 'p-3 text-xs text-slate-600 dark:text-slate-400'),
                        resultCell,
                        cell(h.detail || '', 'p-3 text-xs text-slate-600 dark:text-slate-400 max-w-[18rem]')
                    );
                    return row;
                });
                tbody.replaceChildren(...rows);
            }
        }
    }

    /**
     * "Neden çalışmadı?" paneli: son 7 gündeki başarısız/atlanmış
     * olayları sade dille özetler. Teknik kod yalnızca küçük etiket
     * olarak görünür; ana metin kullanıcı dilindedir.
     */
    function renderHistoryWhy(list) {
        const card = document.getElementById('history-why-card');
        const ul = document.getElementById('history-why-list');
        if (!card || !ul) return;
        const since = Date.now() - 7 * 86400000;
        const failures = (list || []).filter((h) => h && h.kind !== 'agent_run'
            && HISTORY_FAILURE_CODES.has(h.resultCode)
            && new Date(h.timestamp).getTime() >= since)
            .slice(0, 5);
        if (failures.length === 0) {
            card.classList.add('hidden');
            ul.replaceChildren();
            return;
        }
        const items = failures.map((h) => {
            const li = document.createElement('li');
            li.className = 'p-3 flex items-start gap-3 text-xs';
            li.setAttribute('data-why-result', String(h.resultCode));
            const dot = document.createElement('span');
            dot.className = 'mt-0.5 w-2 h-2 rounded-full bg-amber-500 shrink-0';
            const body = document.createElement('div');
            body.className = 'flex-1 min-w-0';
            const title = document.createElement('p');
            title.className = 'font-semibold text-slate-800 dark:text-slate-100';
            title.textContent = `${localizedTaskName(h.taskName, h.action)} — ${resultLabel(h.resultCode)}`;
            const desc = document.createElement('p');
            desc.className = 'text-slate-600 dark:text-slate-400 mt-0.5 break-words';
            desc.textContent = h.detail || t('whyNoDetail');
            const meta = document.createElement('p');
            meta.className = 'text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-400 mt-1';
            meta.textContent = new Date(h.timestamp).toLocaleString(getCurrentLanguage());
            body.append(title, desc, meta);
            li.append(dot, body);
            return li;
        });
        ul.replaceChildren(...items);
        card.classList.remove('hidden');
    }

    const btnClearHist = document.getElementById('btn-clear-history');
    if (btnClearHist) {
        btnClearHist.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.clearHistory) {
                await window.electronAPI.clearHistory();
                loadHistory();
                showToast(t('toastHistoryCleared'), 'info');
            }
        });
    }

    // Load Statistics (WBS-E6: null alanlar "—" + uyarı çipi + derin-bağ).
    function gotoEnergySettings() {
        switchView('nav-settings');
        setTimeout(() => {
            const card = document.getElementById('settings-energy');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Düğme "kWh için watt girin →" diyor: kullanıcı yazmaya
            // hemen başlayabilsin diye alan odaklanır. Aksi halde
            // kaydırma sonrası hiçbir alan odaklı olmuyordu (odak BODY).
            const watt = document.getElementById('nrg-watt');
            if (watt) {
                try { watt.focus({ preventScroll: true }); } catch (_) { try { watt.focus(); } catch (_2) { /* yut */ } }
            }
        }, 60);
    }

    async function loadStatistics() {
        if (window.electronAPI && window.electronAPI.getStatistics) {
            let stats;
            try {
                stats = await window.electronAPI.getStatistics();
            } catch (_) {
                stats = null;
            }
            if (!stats) {
                const hours = document.getElementById('stat-hours');
                const kwh = document.getElementById('stat-kwh');
                const cost = document.getElementById('stat-cost');
                if (hours) hours.innerText = '—';
                if (kwh) kwh.innerText = '—';
                if (cost) cost.innerText = '—';
                return;
            }
            if (stats.enabled) {
                document.getElementById('stat-hours').innerText = t('statHoursValue', { hours: stats.preventedUptimeHours });
                const kwhEl = document.getElementById('stat-kwh');
                const costEl = document.getElementById('stat-cost');
                const chipW = document.getElementById('chip-watt');
                const chipP = document.getElementById('chip-price');
                const missing = stats.missing || [];
                kwhEl.innerText = stats.kwhSaved == null ? '—' : `${stats.kwhSaved} kWh`;
                costEl.innerText = stats.costSavedFormatted == null ? '—' : stats.costSavedFormatted;
                chipW.classList.toggle('hidden', !missing.includes('watt'));
                chipP.classList.toggle('hidden', !missing.includes('price'));
                if (missing.length > 0) {
                    let seen = false;
                    try { seen = localStorage.getItem('pp-stats-hint-shown') === '1'; } catch (_) { }
                    if (!seen) {
                        try { localStorage.setItem('pp-stats-hint-shown', '1'); } catch (_) { }
                        showToast(t('energyLinesIncomplete'), 'info');
                    }
                }
            }
        }
    }

    // C5: yerel sağlık özeti (Hakkında). Telemetri yok; main yalnızca
    // cihazdaki kayıtları özetler. Değer yoksa "veri yok" gösterilir.
    async function loadHealthSummary() {
        const rateEl = document.getElementById('health-success-rate');
        const runsEl = document.getElementById('health-runs');
        const daysEl = document.getElementById('health-days');
        if (!rateEl || !runsEl || !daysEl) return;
        let summary = null;
        try {
            if (window.electronAPI && typeof window.electronAPI.getHealthSummary === 'function') {
                summary = await window.electronAPI.getHealthSummary();
            }
        } catch (_) { summary = null; }

        const noData = t('healthNoData');
        if (!summary || !summary.totalRecords) {
            rateEl.textContent = noData;
            runsEl.textContent = '0';
            daysEl.textContent = summary && summary.daysInstalled != null ? String(summary.daysInstalled) : '—';
            return;
        }
        rateEl.textContent = summary.successRatePercent == null ? noData : `${summary.successRatePercent}%`;
        runsEl.textContent = String((summary.successCount || 0) + (summary.failureCount || 0));
        daysEl.textContent = summary.daysInstalled == null ? '—' : String(summary.daysInstalled);
    }

    const chipWattBtn = document.getElementById('chip-watt');
    if (chipWattBtn) chipWattBtn.addEventListener('click', gotoEnergySettings);
    const chipPriceBtn = document.getElementById('chip-price');
    if (chipPriceBtn) chipPriceBtn.addEventListener('click', gotoEnergySettings);

    // Generate API Key
    const btnGenKey = document.getElementById('btn-gen-api-key');
    let lastRawApiKey = null; // WBS-11.4: yalnızca oturum belleğinde tutulur.
    if (btnGenKey) {
        btnGenKey.addEventListener('click', async () => {
            if (!window.electronAPI || !window.electronAPI.generateApiKey) return;
            const showKey = (rawKey) => {
                if (typeof rawKey !== 'string') {
                    showToast((rawKey && rawKey.message) || t('errorSaveFailed'), 'error');
                    return;
                }
                lastRawApiKey = rawKey;
                document.getElementById('display-api-key').innerText = rawKey;
                document.getElementById('qr-api-box').classList.add('hidden');
                showToast(t('toastNewApiKey'), 'success');
            };
            const run = (pin) => window.electronAPI.generateApiKey({ pin });
            const res = await run();
            if (isPinChallenge(res)) {
                if (await pinRequiredWithoutPin(res)) return;
                requestPin(t('pinPromptCancel'), { run, done: showKey });
                paintPinError(res);
                return;
            }
            showKey(res);
        });
    }

    // Telefon QR'ı (WBS-11.4): LAN açık + döngü-dışı IP + taze anahtar gerekir.
    const btnQrApi = document.getElementById('btn-qr-api');
    if (btnQrApi) {
        btnQrApi.addEventListener('click', async () => {
            const box = document.getElementById('qr-api-box');
            if (!box.classList.contains('hidden')) {
                box.classList.add('hidden');
                return;
            }
            if (!lastRawApiKey) {
                showToast(t('errorCreateApiKeyFirst'), 'error');
                return;
            }
            if (typeof qrcode !== 'function') {
                showToast(t('errorQrLibrary'), 'error');
                return;
            }
            let settings = null;
            try {
                settings = window.electronAPI ? await window.electronAPI.getSettings() : null;
            } catch (_) { settings = null; }
            if (!settings || settings.lanModeEnabled !== true) {
                showToast(t('errorEnableLanFirst'), 'error');
                return;
            }
            const ips = (settings.lanAllowedIps || []).filter(ip => ip !== '127.0.0.1' && ip !== 'localhost');
            if (ips.length === 0) {
                showToast(t('errorLoopbackIp'), 'error');
                return;
            }
            // WP-02.T5: LAN modu TLS zorunlu; QR adresi https:// gösterir.
            const scheme = settings.localApiTlsEnabled === true ? 'https' : 'http';
            const payload = JSON.stringify({ v: 1, url: `${scheme}://${ips[0]}:${settings.localApiPort || 18456}`, key: lastRawApiKey });
            try {
                const qr = qrcode(0, 'M');
                qr.addData(payload);
                qr.make();
                const img = document.createElement('img');
                img.src = qr.createDataURL(4, 4);
                img.alt = 'Power Pilot API QR';
                img.width = 160;
                img.height = 160;
                document.getElementById('qr-api-img').replaceChildren(img);
                box.classList.remove('hidden');
            } catch (_) {
                showToast(t('errorQrGenerate'), 'error');
            }
        });
    }

    // Local API settings (WBS-5.1)
    function paintApiBadge(enabled, port) {
        const badge = document.getElementById('api-status-badge');
        if (!badge) return;
        if (enabled) {
            badge.innerText = t('apiRunning', { port });
            badge.className = 'text-xs font-bold text-green-700 dark:text-green-400';
        } else {
            badge.innerText = t('apiOff');
            badge.className = 'text-xs font-bold text-slate-600 dark:text-slate-400';
        }
    }

    async function loadIntegrations() {
        if (!window.electronAPI || !window.electronAPI.getSettings) return;
        try {
            const s = await window.electronAPI.getSettings();
            if (!s || typeof s !== 'object') return;
            document.getElementById('api-enabled').checked = s.localApiEnabled === true;
            document.getElementById('api-port').value = s.localApiPort || 18456;
            document.getElementById('api-lan').checked = s.lanModeEnabled === true;
            document.getElementById('api-ips').value = (s.lanAllowedIps || ['127.0.0.1']).join(', ');
            document.getElementById('api-block-remote').checked = s.blockRemoteShutdownWhenActive !== false;
            document.getElementById('api-tls').checked = s.localApiTlsEnabled === true;
            document.getElementById('api-tls-strict').checked = s.localApiTlsStrict === true;
            document.getElementById('api-client-cert').checked = s.localApiRequireClientCert === true;
            document.getElementById('api-cert-file').value = s.localApiCertFile || '';
            document.getElementById('api-key-file').value = s.localApiKeyFile || '';
            document.getElementById('api-client-fingerprints').value = (s.localApiClientFingerprints || []).join(', ');
            if (s.localApiKeyMasked) {
                document.getElementById('display-api-key').innerText = s.localApiKeyMasked;
            }
            paintApiBadge(s.localApiEnabled === true, s.localApiPort || 18456);
            // P0/BLOCKER-001: güç isteği ölçümü yükseltme gerektiriyorsa
            // uyarı satırı görünür olur (kapı atlandığı gizlenmez).
            try {
                const sec = await window.electronAPI.getSecurityStatus();
                const hint = document.getElementById('api-safety-hint');
                if (hint) {
                    const unavailable = !!(sec && sec.powerRequestCheck && sec.powerRequestCheck.available === false);
                    hint.classList.toggle('hidden', !unavailable);
                }
            } catch (_) { /* tanı bilgisi opsiyonel */ }
            // Plan kapanışı: 90 günü dolduran anahtar için oturumda bir kez hatırlatma.
            if (!window.__apiKeyAgeWarned && typeof s.localApiKeyCreatedAt === 'number' &&
                Date.now() - s.localApiKeyCreatedAt > 90 * 86400000) {
                window.__apiKeyAgeWarned = true;
                showToast(t('toastApiKeyAge'), 'info');
            }
        } catch (_) { /* salt-okunur ekran, sessiz geç */ }
        if (typeof loadWebhooks === 'function') loadWebhooks();
    }

    const btnSaveApi = document.getElementById('btn-save-api');
    if (btnSaveApi) {
        btnSaveApi.addEventListener('click', async () => {
            const enabled = document.getElementById('api-enabled').checked;
            const port = parseInt(document.getElementById('api-port').value, 10);
            const lan = document.getElementById('api-lan').checked;
            const blockRemote = document.getElementById('api-block-remote').checked;
            const ips = document.getElementById('api-ips').value.split(',').map(x => x.trim()).filter(Boolean);
            if (!Number.isInteger(port) || port < 1024 || port > 65535) {
                showToast(t('errorPortRange'), 'error');
                return;
            }
            if (lan && ips.length === 0) {
                showToast(t('errorLanIpRequired'), 'error');
                return;
            }
            const tls = document.getElementById('api-tls').checked;
            const tlsStrict = document.getElementById('api-tls-strict').checked;
            const requireClientCert = document.getElementById('api-client-cert').checked;
            const certFile = document.getElementById('api-cert-file').value.trim() || null;
            const keyFile = document.getElementById('api-key-file').value.trim() || null;
            const fingerprints = document.getElementById('api-client-fingerprints').value
                .split(',')
                .map((value) => value.trim().replace(/:/g, '').toLowerCase())
                .filter(Boolean);
            if (tls && (!certFile || !keyFile)) {
                showToast(t('errorTlsMaterialRequired'), 'error');
                return;
            }
            if (window.electronAPI && window.electronAPI.saveSettings) {
                const res = await window.electronAPI.saveSettings({
                    localApiPort: port,
                    lanAllowedIps: ips,
                    blockRemoteShutdownWhenActive: blockRemote
                });
                if (res && res.success === false) {
                    showToast(res.message || t('errorSaveFailed'), 'error');
                    return;
                }
                paintApiBadge(enabled, port);
                const sec = await saveSecuritySettings(
                    {
                        localApiEnabled: enabled,
                        lanModeEnabled: lan,
                        localApiTlsEnabled: tls,
                        localApiTlsStrict: tlsStrict,
                        localApiRequireClientCert: requireClientCert,
                        localApiCertFile: certFile,
                        localApiKeyFile: keyFile,
                        localApiClientFingerprints: fingerprints
                    },
                    () => { paintApiBadge(enabled, port); showToast(t('toastApiSaved'), 'success'); }
                );
                if (sec && sec.success === false && !sec.pendingPin) {
                    showToast(sec.message || t('errorSaveFailed'), 'error');
                    return;
                }
                if (sec && sec.success !== false) showToast(t('toastApiSaved'), 'success');
            }
        });
    }

    // Webhook yönetimi (WBS-5.2) — secret'lar yalnızca bellekte tutulur, ekrana basılmaz.
    const WEBHOOK_EVENTS = ['task_created', 'task_blocked', 'task_warning_started', 'task_cancelled', 'task_snoozed', 'power_action_started'];
    let webhookDraft = [];

    function renderWebhookList() {
        const box = document.getElementById('webhook-list');
        if (!box) return;
        if (webhookDraft.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-slate-600 dark:text-slate-400';
            empty.textContent = t('webhookEmpty');
            box.replaceChildren(empty);
            return;
        }
        box.replaceChildren();
        webhookDraft.forEach((h, idx) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between bg-slate-100 dark:bg-slate-900 p-2.5 rounded-lg';
            const left = document.createElement('div');
            left.className = 'min-w-0';
            const title = document.createElement('p');
            title.className = 'text-xs font-bold truncate';
            title.textContent = (h.name || h.url) + (h.enabled === false ? t('webhookDisabledSuffix') : '');
            const sub = document.createElement('p');
            sub.className = 'text-[11px] text-slate-600 dark:text-slate-400 truncate font-mono';
            sub.textContent = h.url + (h.hasSecret ? t('webhookSecretSaved') : '');
            left.appendChild(title);
            left.appendChild(sub);
            const btns = document.createElement('div');
            btns.className = 'flex gap-1 shrink-0';
            const bTest = document.createElement('button');
            bTest.className = 'px-2 py-1 text-[11px] font-bold text-primary dark:text-primary-light hover:bg-primary/10 rounded';
            bTest.textContent = t('test');
            bTest.addEventListener('click', async () => {
                if (window.electronAPI && window.electronAPI.testWebhook) {
                    const res = await window.electronAPI.testWebhook(h);
                    showToast((res && (res.message || res.error)) || t('toastWebhookTestSent'), (res && res.success) ? 'success' : 'error');
                }
            });
            const bDel = document.createElement('button');
            bDel.className = 'px-2 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded';
            bDel.textContent = t('delete');
            bDel.addEventListener('click', () => {
                webhookDraft.splice(idx, 1);
                renderWebhookList();
            });
            btns.appendChild(bTest);
            btns.appendChild(bDel);
            row.appendChild(left);
            row.appendChild(btns);
            box.appendChild(row);
        });
    }

    function renderWebhookEventChecks() {
        const box = document.getElementById('wh-events');
        if (!box) return;
        box.replaceChildren();
        WEBHOOK_EVENTS.forEach(ev => {
            const lab = document.createElement('label');
            lab.className = 'flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded cursor-pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = ev;
            cb.checked = ev === 'task_created';
            cb.className = 'accent-[#4f7cff]';
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(t('event_' + ev)));
            box.appendChild(lab);
        });
    }

    async function loadWebhooks() {
        renderWebhookEventChecks();
        if (!window.electronAPI || !window.electronAPI.getWebhooks) return;
        try {
            const list = await window.electronAPI.getWebhooks();
            webhookDraft = Array.isArray(list) ? list : [];
        } catch (_) { webhookDraft = []; }
        renderWebhookList();
    }

    const authSel = document.getElementById('wh-auth');
    if (authSel) {
        authSel.addEventListener('change', () => {
            document.getElementById('wh-user').classList.toggle('hidden', authSel.value !== 'basic');
        });
    }

    const btnAddWh = document.getElementById('btn-add-webhook');
    if (btnAddWh) {
        btnAddWh.addEventListener('click', () => {
            const name = document.getElementById('wh-name').value.trim();
            const url = document.getElementById('wh-url').value.trim();
            const auth = document.getElementById('wh-auth').value;
            const secret = document.getElementById('wh-secret').value;
            const user = document.getElementById('wh-user').value.trim();
            if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) {
                showToast(t('errorUrl'), 'error');
                return;
            }
            const events = Array.from(document.querySelectorAll('#wh-events input:checked')).map(c => c.value);
            const hook = { name: name || url, url, events, enabled: document.getElementById('wh-enabled').checked };
            if (auth === 'bearer' && secret) hook.bearerToken = secret;
            if (auth === 'hmac' && secret) hook.hmacSecret = secret;
            if (auth === 'basic') {
                if (user) hook.basicAuthUser = user;
                if (secret) hook.basicAuthPass = secret;
            }
            webhookDraft.push(hook);
            document.getElementById('wh-name').value = '';
            document.getElementById('wh-url').value = '';
            document.getElementById('wh-secret').value = '';
            document.getElementById('wh-user').value = '';
            renderWebhookList();
        });
    }

    const btnSaveWh = document.getElementById('btn-save-webhooks');
    if (btnSaveWh) {
        btnSaveWh.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.saveWebhooks) {
                const res = await window.electronAPI.saveWebhooks(webhookDraft);
                if (res && res.success === false) {
                    showToast(res.message || t('errorSaveFailed'), 'error');
                    return;
                }
                showToast(t('toastWebhooksSaved'), 'success');
                loadWebhooks();
            }
        });
    }

    // AI Assistant (WBS-7.4) — öneri kartı: Kur / Düzenle / Vazgeç.
    let aiProposal = null;

    async function loadAssistant() {
        const line = document.getElementById('ai-status-line');
        if (!line) return;
        if (!window.electronAPI || !window.electronAPI.aiStatus) {
            line.innerText = t('errorAiBridge');
            return;
        }
        try {
            const st = await window.electronAPI.aiStatus();
            if (st.loaded) {
                line.innerText = t('aiReadyWithModel', { model: st.modelId || 'model' });
                line.className = 'text-xs text-green-700 dark:text-green-400 mb-4';
            } else if (st.code === 'MODEL_MISSING') {
                line.innerText = t('aiModelNotDownloaded');
                line.className = 'text-xs text-amber-700 dark:text-amber-400 mb-4';
            } else {
                line.innerText = st.message || t('aiNotReady');
                line.className = 'text-xs text-slate-600 dark:text-slate-400 mb-4';
            }
        } catch (_) {
            line.innerText = t('aiStatusUnknown');
        }
    }

    function renderAiResult() {
        const box = document.getElementById('ai-result');
        if (!box) return;
        box.replaceChildren();
        const asstEmpty = document.getElementById('assistant-empty');
        if (asstEmpty) asstEmpty.classList.add('hidden');
        if (!aiProposal) return;
        if (aiProposal.clarify) {
            const p = document.createElement('p');
            p.className = 'text-sm text-amber-600 dark:text-amber-400';
            p.textContent = aiProposal.clarify;
            box.appendChild(p);
            return;
        }
        const card = document.createElement('div');
        card.className = 'p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-2';
        const title = document.createElement('p');
        title.className = 'text-sm font-bold';
        title.textContent = aiProposal.name || t('suggestedTask');
        const desc = document.createElement('p');
        desc.className = 'text-xs text-slate-600 dark:text-slate-400';
        desc.textContent = aiProposal.detail || '';
        const row = document.createElement('div');
        row.className = 'flex gap-2';
        const bCreate = document.createElement('button');
        bCreate.className = 'flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90';
        bCreate.textContent = t('install');
        bCreate.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.createTask) {
                // K-04/K-03: mod ve kaynak sunucu tarafından atanır; istemci göndermez.
                const res = await window.electronAPI.createTask(aiProposal.task);
                if (res && res.success === false) {
                    showToast(res.message || t('aiTaskFailed'), 'error');
                } else {
                    showToast(t('aiTaskCreated'), 'success');
                    aiSpeak(t('taskCreated'));
                    aiProposal = null;
                    document.getElementById('ai-input').value = '';
                    renderAiResult();
                }
            }
        });
        const bEdit = document.createElement('button');
        bEdit.className = 'flex-1 py-2 bg-primary/10 border border-primary/50 text-primary dark:text-primary-light text-xs font-bold rounded-lg hover:bg-primary/30';
        bEdit.textContent = t('edit');
        bEdit.addEventListener('click', () => { aiEditProposal(); });
        const bCancel = document.createElement('button');
        bCancel.className = 'px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-600';
        bCancel.textContent = t('cancel');
        bCancel.addEventListener('click', () => { aiProposal = null; renderAiResult(); });
        row.appendChild(bCreate);
        row.appendChild(bEdit);
        row.appendChild(bCancel);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(row);
        box.appendChild(card);
    }

    function aiEditProposal() {
        if (!aiProposal || !aiProposal.task) return;
        const taskObj = aiProposal.task;
        if (taskObj.trigger && taskObj.trigger.type === 'duration' && Number.isInteger(taskObj.trigger.durationMs)) {
            // Panoya süre doldur, kullanıcı Başlat'a bassın (kurulmaz).
            const total = Math.floor(taskObj.trigger.durationMs / 1000);
            const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60);
            document.getElementById('input-days').value = d;
            document.getElementById('input-hours').value = h;
            document.getElementById('input-mins').value = m;
            const abtn = document.querySelector(`.action-btn[data-action="${taskObj.action}"]`);
            if (abtn) abtn.click();
            aiProposal = null;
            renderAiResult();
            switchView('nav-dashboard');
        } else if (taskObj.trigger && taskObj.trigger.type === 'scheduled_time') {
            const dt = new Date(taskObj.trigger.targetTime);
            const hh = String(dt.getHours()).padStart(2, '0'), mm = String(dt.getMinutes()).padStart(2, '0');
            document.getElementById('sf-time').value = `${hh}:${mm}`;
            document.getElementById('sf-action').value = taskObj.action;
            aiProposal = null;
            renderAiResult();
            switchView('nav-smartfinish');
        } else if (taskObj.conditionGroup) {
            sfConditions = (taskObj.conditionGroup.conditions || []).map(c => ({ ...c }));
            document.getElementById('sf-operator').value = taskObj.conditionGroup.operator === 'OR' ? 'OR' : 'AND';
            document.getElementById('sf-stability').value = taskObj.conditionGroup.stabilitySeconds ?? 15;
            reflectConditionToForm(sfConditions[0]);
            renderSfChips();
            document.getElementById('sf-action').value = taskObj.action;
            aiProposal = null;
            renderAiResult();
            switchView('nav-smartfinish');
        }
    }

    function describeProposal(p) {
        if (p.trigger && p.trigger.type === 'duration') {
            return t('proposalDuration', { action: getActionString(p.action), minutes: Math.round(p.trigger.durationMs / 60000) });
        }
        if (p.trigger && p.trigger.type === 'scheduled_time') {
            return `${getActionString(p.action)} - ${new Date(p.trigger.targetTime).toLocaleString(getCurrentLanguage())}`;
        }
        if (p.conditionGroup) {
            return `${getActionString(p.action)} — ${(p.conditionGroup.conditions || []).map(describeCondition).join(' + ')}`;
        }
        return getActionString(p.action);
    }

    const btnAiParse = document.getElementById('btn-ai-parse');
    if (btnAiParse) {
        btnAiParse.addEventListener('click', () => { aiParseCurrent(); });
    }

    async function aiParseCurrent() {
        const text = document.getElementById('ai-input').value.trim();
        if (!text) { showToast(t('errorWriteSentence'), 'error'); return; }
        if (!window.electronAPI || !window.electronAPI.aiParse) return;
        const res = await window.electronAPI.aiParse(text);
        if (!res) return;
        if (res.ok === false) {
            showToast(res.message || t('aiNoResponse'), 'error');
            return;
        }
        if (res.needsClarification) {
            aiProposal = { clarify: res.needsClarification.question };
            aiSpeak(res.needsClarification.question);
        } else if (res.proposal) {
            aiProposal = { ...res.proposal, name: res.proposal.name, detail: describeProposal(res.proposal), task: res.proposal };
        }
        renderAiResult();
    }

    // Sesli komut (WBS-8.2/8.3): kayıt → 16kHz mono → STT → giriş kutusu + otomatik çözümleme.
    let micRecorder = null, micStream = null, micChunks = [], micWatch = null, micCap = null, micCtx = null, micLastSound = 0;

    function paintMicIdle() {
        const b = document.getElementById('btn-ai-mic');
        const s = document.getElementById('ai-mic-status');
        if (b) { b.textContent = '🎤'; b.classList.remove('animate-pulse'); }
        if (s) s.classList.add('hidden');
    }

    function stopAiMic(auto) {
        try {
            if (micWatch) { clearInterval(micWatch); micWatch = null; }
            if (micCap) { clearTimeout(micCap); micCap = null; }
            if (micRecorder && micRecorder.state === 'recording') {
                micRecorder._autoStopped = !!auto;
                micRecorder.stop();
            } else {
                aiMicCleanup();
            }
        } catch (_) { aiMicCleanup(); }
    }

    function aiMicCleanup() {
        try {
            if (micStream) micStream.getTracks().forEach(t => t.stop());
            if (micCtx && micCtx.close) micCtx.close();
        } catch (_) { }
        micRecorder = null; micStream = null; micChunks = []; micCtx = null;
        paintMicIdle();
    }

    async function aiMicDecode() {
        const blob = new Blob(micChunks, { type: micRecorder.mimeType || 'audio/webm' });
        const ctx = micCtx;
        try {
            const buf = await blob.arrayBuffer();
            const decoded = await ctx.decodeAudioData(buf);
            const srcRate = decoded.sampleRate;
            const mono = decoded.getChannelData(0);
            // 16kHz mono yeniden örnekleme.
            const offline = new OfflineAudioContext(1, Math.ceil(mono.length * 16000 / srcRate), 16000);
            const srcBuf = offline.createBuffer(1, mono.length, srcRate);
            srcBuf.getChannelData(0).set(mono);
            const src = offline.createBufferSource();
            src.buffer = srcBuf;
            src.connect(offline.destination);
            src.start();
            const rendered = await offline.startRendering();
            const pcm = Array.from(rendered.getChannelData(0));
            if (pcm.length < 8000) {
                showToast(t('errorRecordingShort'), 'error');
                return;
            }
            const lang = (typeof currentLanguage === 'string' ? currentLanguage : null) || localStorage.getItem('language') || UI_FALLBACK_LANG;
            const res = await window.electronAPI.sttTranscribe({ samples: pcm, sampleRate: 16000, uiLang: lang });
            if (res && res.ok) {
                document.getElementById('ai-input').value = res.text + (res.truncated ? ' [...]' : '');
                aiParseCurrent();
            } else {
                showToast((res && res.message) || t('errorNotUnderstood'), 'error');
            }
        } catch (_) {
            showToast(t('errorAudioParse'), 'error');
        } finally {
            aiMicCleanup();
        }
    }

    const btnAiMic = document.getElementById('btn-ai-mic');
    if (btnAiMic) {
        btnAiMic.addEventListener('click', async () => {
            if (micRecorder && micRecorder.state === 'recording') { stopAiMic(false); return; }
            if (!window.electronAPI || !window.electronAPI.sttStatus || !window.electronAPI.sttTranscribe) return;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast(t('errorMicUnsupported'), 'error');
                return;
            }
            try {
                const st = await window.electronAPI.sttStatus();
                if (!st || (!st.ready && !st.modelPresent)) {
                    showToast(t('errorSttMissing'), 'error');
                    return;
                }
            } catch (_) { return; }
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
                });
            } catch (_) {
                showToast(t('errorMicPermission'), 'error');
                return;
            }
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                micCtx = new AC();
                const src = micCtx.createMediaStreamSource(micStream);
                const analyser = micCtx.createAnalyser();
                analyser.fftSize = 2048;
                src.connect(analyser);
                const data = new Uint8Array(analyser.fftSize);
                micChunks = [];
                micRecorder = new MediaRecorder(micStream);
                micRecorder.ondataavailable = e => { if (e.data && e.data.size) micChunks.push(e.data); };
                micRecorder.onstop = () => aiMicDecode();
                micRecorder.start(250);
                micLastSound = Date.now();
                const startedAt = Date.now();
                btnAiMic.textContent = '⏹';
                btnAiMic.classList.add('animate-pulse');
                const stEl = document.getElementById('ai-mic-status');
                stEl.textContent = t('aiMicListening');
                stEl.classList.remove('hidden');
                micWatch = setInterval(() => {
                    try {
                        analyser.getByteTimeDomainData(data);
                        let sum = 0;
                        for (let i = 0; i < data.length; i++) {
                            const v = (data[i] - 128) / 128;
                            sum += v * v;
                        }
                        const rms = Math.sqrt(sum / data.length);
                        if (rms > 0.02) micLastSound = Date.now();
                        if (Date.now() - micLastSound > 2000 && Date.now() - startedAt > 1000) {
                            stopAiMic(true);
                        }
                    } catch (_) { }
                }, 250);
                micCap = setTimeout(() => stopAiMic(true), 15000);
            } catch (_) {
                showToast(t('errorRecordingStart'), 'error');
                aiMicCleanup();
            }
        });
    }

    // Sesli geri bildirim (WBS-8.4) — yerel OS motoru, varsayılan kapalı.
    function aiSpeak(text) {
        try {
            if (localStorage.getItem('voice') !== 'true') return;
            if (!('speechSynthesis' in window) || !text) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text).slice(0, 200));
            u.lang = navigator.language || 'tr-TR';
            window.speechSynthesis.speak(u);
        } catch (_) { }
    }

            // Setup Wizard (WBS-7.5) — bir kez gösterilir, Atla her zaman mümkün.
            let wzStep = 1;
            let wzPoll = null;
            let wzPollMs = 0;
            let wzClock = null;
            // AI indirme canlı-ilerleme durumu (yalnızca arayüz katmanı).
            // L-12: sihirbaz ve ayarlar aynı durum makinesini paylaşır.
            const wzDlState = { active: false, failed: false, sample: null, speed: 0 };
            const setDlState = { active: false, failed: false, sample: null, speed: 0 };

            // Anket hızı: indirme sürerken 500ms (canlı animasyon), yoksa 2sn.
            function wzSetPoll(ms) {
                if (wzPoll && wzPollMs === ms) return;
                if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
                wzPollMs = ms;
                wzPoll = setInterval(wizardRefreshAi, ms);
            }
            function wzStopPoll() {
                if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
                wzPollMs = 0;
            }
            function wizardStopTimers() {
                wzStopPoll();
                if (wzClock) { clearInterval(wzClock); wzClock = null; }
            }

    function wzFmtMb(bytes) {
        return Math.round(bytes / 1048576) + 'MB';
    }

    function wzFmtSpeed(bps) {
        if (!(bps > 0)) return '';
        const mbs = (bps / 1048576).toFixed(1);
        return ` • ${mbs} MB/s`;
    }

    function wzFmtEta(received, total, speed) {
        const s = speed === undefined ? wzDlState.speed : speed;
        if (!(total > 0) || !(s > 0) || received >= total) return '';
        const sec = Math.round((total - received) / s);
        if (sec < 60) return t('timeLeftSecondsShort', { seconds: sec });
        return t('timeLeftMinutesShort', { minutes: Math.floor(sec / 60), seconds: sec % 60 });
    }

    const DL_BASE = 'flex-1 py-2 text-xs font-bold rounded-lg ';
    function setSpinnerText(el, text) {
        const spinner = document.createElement('span');
        spinner.className = 'pp-spin';
        el.replaceChildren(spinner, document.createTextNode(text));
    }
    function wzSetDownloadBtn(mode, btn, label) {
        const b = btn || document.getElementById('btn-wz-download');
        if (!b) return;
        if (mode === 'downloading') {
            b.disabled = true;
            b.className = DL_BASE + 'bg-primary/10 border border-primary/50 text-primary dark:text-primary-light hover:bg-primary/30 cursor-pointer disabled:cursor-wait';
            setSpinnerText(b, t('downloading'));
        } else if (mode === 'ready') {
            b.disabled = true;
            b.className = DL_BASE + 'bg-green-500/15 text-green-400 border border-green-500/40 disabled:cursor-default';
            b.textContent = t('packageReady');
        } else if (mode === 'resume') {
            // Yarım kalan paket: buton eksik parçayı söyler, tek basış kaldığı yerden devam eder.
            b.disabled = false;
            b.className = DL_BASE + 'bg-primary/10 border border-primary/50 text-primary dark:text-primary-light hover:bg-primary/30 cursor-pointer disabled:cursor-default';
            b.textContent = label || t('downloadRemaining');
        } else {
            b.disabled = false;
            b.className = DL_BASE + 'bg-primary/10 border border-primary/50 text-primary dark:text-primary-light hover:bg-primary/30 cursor-pointer disabled:cursor-default';
            b.textContent = t('downloadAiPackage');
        }
    }

    // Etkinleştir butonu durum boyası: etkense "Devre Dışı Bırak" kipine
    // geçer (basılabilir, kırmızı-hayalet); değilse mavi "Etkinleştir".
    // Meşgulken (yükleme sürerken) dokunulmaz — çağıran bayrağa bakar.
    let wzLoadBusy = false;
    let setLoadBusy = false;
    const LOAD_BASE = 'flex-1 py-2 text-xs font-bold rounded-lg ';
    function wzSetLoadBtn(loaded, btn) {
        const b = btn || document.getElementById('btn-wz-load');
        if (!b) return;
        if (loaded) {
            b.disabled = false;
            b.className = LOAD_BASE + 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/40 hover:bg-red-500/20 cursor-pointer';
            b.textContent = t('disableAi');
            b.dataset.aiState = 'loaded';
        } else {
            b.disabled = false;
            b.className = LOAD_BASE + 'bg-primary text-white hover:bg-primary/90';
            b.textContent = t('enableAi');
            b.dataset.aiState = 'idle';
        }
    }

    /**
     * L-12: Sihirbaz ve ayarlar kartı aynı durum makinesini kullanır.
     * Yalnızca DOM elemanları ve metin anahtarları görünüme özgüdür.
     */
    function renderAiStatus(st, view) {
        const { els, state, downloadingText, poll, setDownloadBtn, setLoadBtn, loadBusy } = view;
        const dl = st.download || { state: 'idle' };
        const bothPresent = !!(st.model && st.model.present && st.stt && st.stt.present);

        if (dl.state === 'running') {
            if (!state.active) {
                state.active = true;
                state.failed = false;
                state.sample = null;
                state.speed = 0;
                setDownloadBtn('downloading', els.btnDl);
            }
            poll(500);
            els.wrap.classList.remove('hidden');
            els.bar.classList.add('pp-stripes');
            const now = Date.now();
            const got = dl.received || 0;
            if (state.sample && got > state.sample.bytes) {
                const dt = (now - state.sample.t) / 1000;
                if (dt > 0) {
                    const inst = (got - state.sample.bytes) / dt;
                    state.speed = state.speed > 0 ? state.speed * 0.6 + inst * 0.4 : inst;
                }
            }
            state.sample = { t: now, bytes: got };
            const stepLabel = dl.step === 2 ? t('wizardStepVoice') : t('wizardStepLanguage');
            if (dl.total > 0) {
                const pct = Math.min(99, Math.round((got / dl.total) * 100));
                els.bar.style.width = pct + '%';
                els.txt.innerText = `${stepLabel}: %${pct} (${wzFmtMb(got)}/${wzFmtMb(dl.total)}${wzFmtSpeed(state.speed)}${wzFmtEta(got, dl.total, state.speed)})`;
            } else {
                els.txt.innerText = `${stepLabel}: ${t('wizardDownloadedAmount', { amount: wzFmtMb(got) })}${wzFmtSpeed(state.speed)}…`;
            }
            els.line.innerText = downloadingText;
            return;
        }

        if (state.active) {
            state.active = false;
            els.bar.classList.remove('pp-stripes');
            if (dl.state === 'failed') {
                state.failed = true;
                setDownloadBtn('idle', els.btnDl);
                poll(2000);
                els.line.innerText = t('wizardDownloadFailed', { error: dl.error || t('unknownError') });
                if (window.showToast) showToast(dl.error || t('errorAiDownloadFailed'), 'error');
                return;
            }
        }

        if (st.loaded) {
            els.line.innerText = t('wizardAiReadyRam', { model: st.modelId || 'model', ram: st.ramGb != null ? st.ramGb + 'GB' : '?' });
            els.line.classList.remove('text-slate-600', 'dark:text-slate-400');
            els.line.classList.add('text-green-700', 'dark:text-green-400');
            setDownloadBtn('ready', els.btnDl);
            if (!loadBusy) setLoadBtn(true, els.btnLoad);
        } else {
            els.line.classList.remove('text-green-700', 'dark:text-green-400');
            els.line.classList.add('text-slate-600', 'dark:text-slate-400');
            if (!loadBusy) setLoadBtn(false, els.btnLoad);
            if (bothPresent) {
                els.line.innerText = t('wizardBothModels');
                setDownloadBtn('ready', els.btnDl);
            } else if (st.model && st.model.present) {
                els.line.innerText = t('wizardLangReady');
                setDownloadBtn('resume', els.btnDl, t('downloadRemainingStt'));
            } else if (st.stt && st.stt.present) {
                els.line.innerText = t('wizardSttReady');
                setDownloadBtn('resume', els.btnDl, t('downloadRemainingLlm'));
            } else {
                const done = st.model && st.model.partialBytes > 0 ? t('wizardPartial', { mb: Math.round(st.model.partialBytes / 1048576) }) : '';
                const sttDone = st.stt && st.stt.present ? t('wizardVoiceDone') : '';
                els.line.innerText = t('wizardModelMissing', { extra: done, stt: sttDone });
                if (!state.failed) setDownloadBtn('idle', els.btnDl);
            }
        }

        if (bothPresent) {
            els.wrap.classList.add('hidden');
            view.stopPoll();
        } else if (st.model && (st.model.present || st.model.partialBytes > 0)) {
            els.wrap.classList.remove('hidden');
            // L-04: model boyutu aiStatus'tan gelir; sabit varsayım yok.
            const total = Number(st.model.expectedBytes) || 0;
            const got = (st.model.present ? st.model.bytes : 0) + (st.model.partialBytes || 0);
            const pct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
            els.bar.style.width = (pct === null ? 0 : pct) + '%';
            const pctLabel = pct === null ? '?' : pct;
            els.txt.innerText = (view.voiceMissingProgress && st.model.present && !st.stt.present)
                ? t('wizardProgressVoiceMissing', { pct: pctLabel, mb: Math.round(got / 1048576) })
                : t('wizardProgressGeneric', { pct: pctLabel, mb: Math.round(got / 1048576) });
        } else if (!state.active) {
            els.wrap.classList.add('hidden');
        }
    }

    function paintWizardDots() {
        document.querySelectorAll('#wz-dots [data-dot]').forEach(d => {
            const active = parseInt(d.getAttribute('data-dot'), 10) <= wzStep;
            d.className = 'h-1.5 flex-1 rounded-full ' + (active ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700');
        });
        const stepText = document.getElementById('wz-step-text');
        if (stepText) stepText.textContent = t('a11yWizardStep', { current: wzStep, total: 3 });
        [1, 2, 3].forEach(n => {
            document.getElementById('wz-step-' + n).classList.toggle('hidden', n !== wzStep);
        });
        document.getElementById('btn-wz-back').style.visibility = wzStep === 1 ? 'hidden' : 'visible';
        document.getElementById('btn-wz-next').classList.toggle('hidden', wzStep === 3);
        document.getElementById('btn-wz-finish').classList.toggle('hidden', wzStep !== 3);
    }

    function wizardDone() {
        try { localStorage.setItem('pp-wizard-done', '1'); } catch (_) { }
        document.getElementById('wizard-overlay').classList.add('hidden');
        if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
        if (wzClock) { clearInterval(wzClock); wzClock = null; }
    }

    function wizardDone() {
        try { localStorage.setItem('pp-wizard-done', '1'); } catch (_) { }
        document.getElementById('wizard-overlay').classList.add('hidden');
        wizardStopTimers();
    }

    // Canlılık kanıtı: karttaki saat her saniye işler.
    function wizardTickClock() {
        const el = document.getElementById('wz-clock');
        if (el) el.innerText = new Date().toLocaleTimeString(getCurrentLanguage());
    }

    async function wizardRefreshAi() {
        const line = document.getElementById('wz-ai-status');
        if (!window.electronAPI || !window.electronAPI.aiStatus) {
            line.innerText = t('errorAiBridge');
            return;
        }
        try {
            const st = await window.electronAPI.aiStatus();
            document.getElementById('wz-ram-warn').classList.toggle('hidden', !(st.ramOk === false));
            renderAiStatus(st, {
                els: {
                    line,
                    bar: document.getElementById('wz-progress-bar'),
                    txt: document.getElementById('wz-progress-text'),
                    wrap: document.getElementById('wz-progress-wrap'),
                    btnDl: document.getElementById('btn-wz-download'),
                    btnLoad: document.getElementById('btn-wz-load')
                },
                state: wzDlState,
                downloadingText: t('wizardAiDownloading'),
                poll: (ms) => wzSetPoll(ms),
                stopPoll: wzStopPoll,
                setDownloadBtn: (mode, btn, label) => wzSetDownloadBtn(mode, btn, label),
                setLoadBtn: (loaded, btn) => wzSetLoadBtn(loaded, btn),
                loadBusy: wzLoadBusy,
                voiceMissingProgress: true
            });
        } catch (_) { line.innerText = t('aiStatusUnknown'); }
    }

    function wizardMaybeShow() {
        let done = null;
        try { done = localStorage.getItem('pp-wizard-done'); } catch (_) {}
        if (done) return;
        try {
            const sys = (navigator.language || 'en').split('-')[0];
            const sel = document.getElementById('wz-lang');
            if (sel.querySelector(`option[value="${sys}"]`)) {
                sel.value = sys;
            } else {
                // Desteklenmeyen sistem dili → evrensel varsayılan İngilizce
                // (listenin ilk sırasındaki Türkçe'ye düşmek yerine).
                sel.value = 'en';
            }
        } catch (_) { }
        wzStep = 1;
        paintWizardDots();
        wizardTickClock();
        if (!wzClock) wzClock = setInterval(wizardTickClock, 1000);
        document.getElementById('wizard-overlay').classList.remove('hidden');
    }

    // Türkçe ondalık ("3,24") dahil güvenli sayı ayrıştırma (WBS-E4/A2).
    function parseDecimalInput(raw) {
        if (raw == null) return null;
        const s = String(raw).trim().replace(',', '.');
        if (s === '') return null;
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
        return Math.round(n * 100) / 100;
    }

    // WBS-E4: Otomatik cihaz kartı (sınıf + watt önerisi + kaynak etiketi).
    async function wizardRefreshDevice() {
        const card = document.getElementById('wz-auto-card');
        if (!card) return;
        if (!window.electronAPI || !window.electronAPI.deviceEstimate) {
            card.innerText = t('wizardAutoUnavailable');
            return;
        }
        card.innerText = t('wizardDetecting');
        try {
            const res = await window.electronAPI.deviceEstimate();
            if (!res || !res.ok || !res.profile) {
                card.innerText = t('wizardNotDetected');
                return;
            }
            const p = res.profile;
            const classTr = { laptop: t('wizardLaptop'), desktop: t('wizardDesktop'), server: t('wizardServer'), unknown: t('wizardUnknownDevice') }[p.deviceClass] || p.deviceClass;
            const srcTr = p.wattSource === 'measured' ? t('wizardMeasuredFromBattery') : t('wizardEstimatedFromHardware');
            card.innerText = t('wizardDetectedInfo', { deviceClass: classTr, watt: p.wattW, source: srcTr });
        } catch (_) {
            card.innerText = t('wizardNotDetectedBlank');
        }
    }

    const btnWzNext = document.getElementById('btn-wz-next');
    if (btnWzNext) {
        btnWzNext.addEventListener('click', async () => {
            if (wzStep === 1) {
                const lang = document.getElementById('wz-lang').value;
                try { localStorage.setItem('language', lang); } catch (_) { }
                if (typeof applyLanguage === 'function') await applyLanguage(lang);
                if (window.electronAPI && window.electronAPI.saveSettings) {
                    window.electronAPI.saveSettings({ language: lang }).catch(() => { });
                }
                const elLang = document.getElementById('setting-language');
                if (elLang) elLang.value = lang;
                wzStep = 2;
                paintWizardDots();
                wizardRefreshDevice();
            } else if (wzStep === 2) {
                // WBS-E4: İki alan da opsiyonel — boş geçilirse patch'e girmez.
                const patch = {};
                const wattRaw = document.getElementById('wz-watt').value.trim();
                if (wattRaw !== '') {
                    const watt = parseInt(wattRaw, 10);
                    if (!Number.isInteger(watt) || watt < 5 || watt > 2000) {
                        showToast(t('wizardWattRange'), 'error');
                        return;
                    }
                    patch.deviceWattage = watt;
                    patch.wattSource = 'manual';
                }
                const billRaw = document.getElementById('wz-bill').value;
                const bill = parseDecimalInput(billRaw);
                if (billRaw.trim() !== '' && bill === null) {
                    showToast(t('wizardBillNumber'), 'error');
                    return;
                }
                if (bill !== null) {
                    patch.electricityCostPerKwh = bill;
                    patch.priceSource = 'manual';
                }
                if (Object.keys(patch).length > 0 && window.electronAPI && window.electronAPI.saveSettings) {
                    window.electronAPI.saveSettings(patch).catch(() => { });
                }
                wzStep = 3;
                paintWizardDots();
                wizardRefreshAi();
                if (!wzPoll) wzSetPoll(2000);
            }
        });
    }
    const btnWzBack = document.getElementById('btn-wz-back');
    if (btnWzBack) btnWzBack.addEventListener('click', () => {
        if (wzStep > 1) { wzStep -= 1; paintWizardDots(); }
    });
    const btnWzSkip = document.getElementById('btn-wz-skip');
    if (btnWzSkip) btnWzSkip.addEventListener('click', () => {
        // PPX-016: sihirbazı atlayan kullanıcı onboarding'i görmez.
        try { localStorage.setItem('pp-wizard-skipped', '1'); } catch (_) { }
        wizardDone();
    });
    const btnWzFinish = document.getElementById('btn-wz-finish');
    if (btnWzFinish) btnWzFinish.addEventListener('click', wizardDone);
    const btnWzDl = document.getElementById('btn-wz-download');
    if (btnWzDl) {
        btnWzDl.addEventListener('click', async () => {
            if (wzDlState.active || btnWzDl.disabled) return; // çift-tık koruması
            if (window.electronAPI && window.electronAPI.aiModelDownload) {
                // Anında geri bildirim: buton + animasyonlu bar, sonra hızlı anket.
                wzDlState.active = true;
                wzDlState.failed = false;
                wzDlState.sample = null;
                wzDlState.speed = 0;
                wzSetDownloadBtn('downloading');
                document.getElementById('wz-progress-wrap').classList.remove('hidden');
                document.getElementById('wz-progress-bar').classList.add('pp-stripes');
                document.getElementById('wz-progress-text').innerText = t('connecting');
                const res = await window.electronAPI.aiModelDownload();
                if (res && res.started === false) {
                    wzDlState.active = false;
                    wzSetDownloadBtn('idle');
                    showToast(res.message || t('errorDownloadBusy'), 'info');
                    return;
                }
                showToast(t('wizardDownloadingToast'), 'info');
                wzSetPoll(500);
                wizardRefreshAi();
            }
        });
    }
    const btnWzLoad = document.getElementById('btn-wz-load');
    if (btnWzLoad) {
        btnWzLoad.addEventListener('click', async () => {
            if (btnWzLoad.disabled) return;
            if (window.electronAPI && (window.electronAPI.aiModelLoad || window.electronAPI.aiModelUnload)) {
                const unloading = btnWzLoad.dataset.aiState === 'loaded';
                const oldNodes = Array.from(btnWzLoad.childNodes);
                const oldCls = btnWzLoad.className;
                btnWzLoad.disabled = true;
                btnWzLoad.className = LOAD_BASE + 'bg-primary text-white';
                setSpinnerText(btnWzLoad, unloading ? t('closing') : t('loading'));
                wzLoadBusy = true;
                try {
                    const res = unloading && window.electronAPI.aiModelUnload
                        ? await window.electronAPI.aiModelUnload()
                        : await window.electronAPI.aiModelLoad();
                    if (unloading) {
                        if (res && res.success !== false) showToast(t('toastAiDisabled'), 'info');
                        else showToast((res && (res.message || res.error || res.code)) || t('errorCouldNotClose'), 'error');
                    } else if (res && res.loaded) showToast(t('toastAiEnabled'), 'success');
                    else if (res && res.code === 'ALREADY_LOADING') showToast(t('errorModelLoading'), 'info');
                    else showToast((res && (res.message || res.error || res.code)) || t('errorDownloadFirst'), 'error');
                } finally {
                    btnWzLoad.disabled = false;
                    btnWzLoad.replaceChildren(...oldNodes);
                    btnWzLoad.className = oldCls;
                    wzLoadBusy = false;
                    wizardRefreshAi();
                }
            }
        });
    }

    // Ayarlar → AI Paketi kartı (sihirbazı kaçıranlar için ikinci yol).
    // Sihirbazla aynı IPC + aynı durum makinesi; bağımsız anketli.
    let setPoll = null;
    let setPollMs = 0;

    function setAiEls() {
        return {
            line: document.getElementById('set-ai-status'),
            bar: document.getElementById('set-ai-progress-bar'),
            txt: document.getElementById('set-ai-progress-text'),
            wrap: document.getElementById('set-ai-progress-wrap'),
            btnDl: document.getElementById('btn-set-ai-download'),
            btnLoad: document.getElementById('btn-set-ai-load')
        };
    }

    function startSettingsPoll(ms) {
        if (setPoll && setPollMs === ms) return;
        if (setPoll) { clearInterval(setPoll); setPoll = null; }
        setPollMs = ms;
        setPoll = setInterval(settingsRefreshAi, ms);
    }

    function stopSettingsPoll() {
        if (setPoll) { clearInterval(setPoll); setPoll = null; }
        setPollMs = 0;
    }

    async function settingsRefreshAi() {
        const els = setAiEls();
        if (!els.line) return;
        if (!window.electronAPI || !window.electronAPI.aiStatus) {
            els.line.innerText = t('errorAiBridge');
            return;
        }
        try {
            const st = await window.electronAPI.aiStatus();
            renderAiStatus(st, {
                els,
                state: setDlState,
                downloadingText: t('wizardDownloadingBackground'),
                poll: (ms) => startSettingsPoll(ms),
                stopPoll: stopSettingsPoll,
                setDownloadBtn: (mode, btn, label) => wzSetDownloadBtn(mode, btn, label),
                setLoadBtn: (loaded, btn) => wzSetLoadBtn(loaded, btn),
                loadBusy: setLoadBusy,
                voiceMissingProgress: false
            });
        } catch (_) { els.line.innerText = t('aiStatusUnknown'); }
    }

    const btnSetDl = document.getElementById('btn-set-ai-download');
    if (btnSetDl) {
        btnSetDl.addEventListener('click', async () => {
            if (setDlState.active || btnSetDl.disabled) return;
            if (window.electronAPI && window.electronAPI.aiModelDownload) {
                setDlState.active = true;
                setDlState.failed = false;
                setDlState.sample = null;
                setDlState.speed = 0;
                wzSetDownloadBtn('downloading', btnSetDl);
                setAiEls().wrap.classList.remove('hidden');
                setAiEls().bar.classList.add('pp-stripes');
                setAiEls().txt.innerText = t('connecting');
                const res = await window.electronAPI.aiModelDownload();
                if (res && res.started === false) {
                    setDlState.active = false;
                    wzSetDownloadBtn('idle', btnSetDl);
                    showToast(res.message || t('errorDownloadBusy'), 'info');
                    return;
                }
                showToast(t('wizardDownloadingToast'), 'info');
                startSettingsPoll(500);
                settingsRefreshAi();
            }
        });
    }
    const btnSetLoad = document.getElementById('btn-set-ai-load');
    if (btnSetLoad) {
        btnSetLoad.addEventListener('click', async () => {
            if (btnSetLoad.disabled) return;
            if (window.electronAPI && (window.electronAPI.aiModelLoad || window.electronAPI.aiModelUnload)) {
                const unloading = btnSetLoad.dataset.aiState === 'loaded';
                const oldNodes = Array.from(btnSetLoad.childNodes);
                const oldCls = btnSetLoad.className;
                btnSetLoad.disabled = true;
                btnSetLoad.className = LOAD_BASE + 'bg-primary text-white';
                setSpinnerText(btnSetLoad, unloading ? t('closing') : t('loading'));
                setLoadBusy = true;
                try {
                    const res = unloading && window.electronAPI.aiModelUnload
                        ? await window.electronAPI.aiModelUnload()
                        : await window.electronAPI.aiModelLoad();
                    if (unloading) {
                        if (res && res.success !== false) showToast(t('toastAiDisabled'), 'info');
                        else showToast((res && (res.message || res.error || res.code)) || t('errorCouldNotClose'), 'error');
                    } else if (res && res.loaded) showToast(t('toastAiEnabled'), 'success');
                    else if (res && res.code === 'ALREADY_LOADING') showToast(t('errorModelLoading'), 'info');
                    else showToast((res && (res.message || res.error || res.code)) || t('errorDownloadFirst'), 'error');
                } finally {
                    btnSetLoad.disabled = false;
                    btnSetLoad.replaceChildren(...oldNodes);
                    btnSetLoad.className = oldCls;
                    setLoadBusy = false;
                    settingsRefreshAi();
                }
            }
        });
    }
    wizardMaybeShow();

    // WP-15/WP-13: Pencere yenilendiğinde aktif zamanlayıcı ve uyarı
    // bannerı geri yüklenir. Aksi halde sayaç görsel olarak sıfırlanır
    // ama arka planda görev çalışmaya devam eder (durum uyuşmazlığı).
    async function restoreActiveState() {
        if (!window.electronAPI || !window.electronAPI.getActiveState) return;
        try {
            const st = await window.electronAPI.getActiveState();
            if (!st) return;
            if (st.activeWarning) {
                const b = document.getElementById('warning-banner');
                if (b) {
                    activeWarningTaskId = st.activeWarning.taskId || null;
                    document.getElementById('warning-banner-text').textContent =
                        `${localizedTaskName(st.activeWarning.taskName, st.activeWarning.action)} - ${getActionString(st.activeWarning.action)}`;
                    document.getElementById('warning-banner-count').textContent =
                        (st.activeWarning.secondsLeft != null ? t('secondsShort', { seconds: st.activeWarning.secondsLeft }) : '');
                    b.classList.remove('hidden');
                }
            }
            const tasks = Array.isArray(st.tasks) ? st.tasks : [];
            renderMonitoringTasks(tasks);
            const timer = tasks.find((t) => t && t.status === 'scheduled'
                && t.source === 'user_interface'
                && t.trigger && Number.isFinite(t.trigger.targetTime)
                && t.trigger.targetTime > Date.now());
            if (!timer) {
                const monitoring = tasks.some((t) => t
                    && ['monitoring', 'waiting', 'warning', 'executing'].includes(t.status));
                if (monitoring || st.activeWarning) switchView('nav-active');
                return;
            }
            // Y-01: tek geri yükleme yolu; doğru fonksiyon startTimerTo.
            const remaining = Math.max(1, Math.round((timer.trigger.targetTime - Date.now()) / 1000));
            const created = timer.createdAt ? Date.parse(timer.createdAt) : Date.now();
            const total = Math.max(remaining, Math.ceil((timer.trigger.targetTime - (Number.isFinite(created) ? created : Date.now())) / 1000));
            selectedAction = timer.action;
            currentActionString = getActionString(timer.action);
            timerExecutionTaskId = timer.id;
            startTimerTo(timer.trigger.targetTime, total);
            switchView('nav-active');
        } catch (err) {
            console.warn('[UI] Aktif durum geri yüklenemedi:', err && err.message);
            showToast(t('unknownError'), 'error');
        }
    }
    restoreActiveState();

    // Warning banner wiring (WBS-9.4)
    // K-02: onay isteği hangi uyarıya ait olduğunu taşır; geç tıklama
    // başka görevin uyarısını onaylayamaz.
    let activeWarningTaskId = null;
    function hideWarningBanner() {
        activeWarningTaskId = null;
        document.getElementById('warning-banner').classList.add('hidden');
    }
    // C-01/C-02: banner yalnızca ana süreç başarı bildirdiğinde gizlenir;
    // aksi halde kullanıcı iptal ettiğini sanarken güç işlemi sürer.
    function applyWarningResult(res, fallbackMessage) {
        if (res && res.success === true) {
            hideWarningBanner();
            return;
        }
        if (res && res.code === 'NO_ACTIVE_WARNING') return; // uyarı zaten kapandı
        showToast((res && res.message) || fallbackMessage, 'error');
    }
    if (window.electronAPI && window.electronAPI.onWarningStarted) {
        window.electronAPI.onWarningStarted((data) => {
            const b = document.getElementById('warning-banner');
            if (!b || !data) return;
            activeWarningTaskId = data.taskId || null;
            document.getElementById('warning-banner-text').textContent = `${localizedTaskName(data.taskName, data.action)} — ${getActionString(data.action)}`;
            document.getElementById('warning-banner-count').textContent = (data.secondsLeft != null ? t('secondsShort', { seconds: data.secondsLeft }) : '');
            b.classList.remove('hidden');
            // D-05: sessiz modda ses çıkmaz; banner yine görünür.
            if (!data.silentMode) uiBeep();
        });
    }
    if (window.electronAPI && window.electronAPI.onWarningTick) {
        window.electronAPI.onWarningTick((data) => {
            if (data && data.secondsLeft != null) {
                document.getElementById('warning-banner-count').textContent = t('secondsShort', { seconds: data.secondsLeft });
            }
        });
    }
    if (window.electronAPI && window.electronAPI.onWarningEnded) {
        window.electronAPI.onWarningEnded(() => hideWarningBanner());
    }
    if (window.electronAPI && window.electronAPI.onTimerCancelled) {
        // WP-08.T4: tray iptali tek listener; butonu yeniden tetiklemez.
        window.electronAPI.onTimerCancelled(() => {
            hideWarningBanner();
            if (isTimerActive || countdownInterval) finishCancelUi();
        });
    }
    const btnWarnStop = document.getElementById('btn-warn-stop');
    if (btnWarnStop) btnWarnStop.addEventListener('click', async () => {
        if (!window.electronAPI.warningCancel) return;
        const res = await window.electronAPI.warningCancel();
        if (isPinChallenge(res)) {
            requestPin(t('warnStopPinPrompt'), {
                run: (pin) => window.electronAPI.warningCancel(pin),
                // C-01: yalnızca gerçekten iptal edildiyse banner gizlenir.
                done: (final) => { applyWarningResult(final, t('errorCancelTooLate')); }
            });
            paintPinError(res);
            return;
        }
        applyWarningResult(res, t('errorCancelTooLate'));
    });
    const btnWarnSnooze = document.getElementById('btn-warn-snooze');
    if (btnWarnSnooze) btnWarnSnooze.addEventListener('click', async () => {
        if (!window.electronAPI.warningSnooze) return;
        const res = await window.electronAPI.warningSnooze(10);
        if (isPinChallenge(res)) {
            requestPin(t('warnSnoozePinPrompt'), {
                run: (pin) => window.electronAPI.warningSnooze(10, pin),
                // C-02: yalnızca gerçekten ertelendiyse banner gizlenir.
                done: (final) => { applyWarningResult(final, t('taskSnoozeFailed')); }
            });
            paintPinError(res);
            return;
        }
        applyWarningResult(res, t('taskSnoozeFailed'));
    });
    const btnWarnNow = document.getElementById('btn-warn-now');
    if (btnWarnNow) btnWarnNow.addEventListener('click', async () => {
        if (!window.electronAPI.warningConfirm) return;
        // K-02: banner gizlenirken sonuç kontrol edilir; eski tıklama
        // yeni uyarıyı onaylamaz.
        const res = await window.electronAPI.warningConfirm(activeWarningTaskId);
        applyWarningResult(res, t('errorCancelTooLate'));
    });

    // AI hızlı eylemler: teşhis / enerji / öneri (F9.2-9.3).
    function aiInfoCard(title, body, buttons) {
        const box = document.getElementById('ai-result');
        box.replaceChildren();
        const asstEmpty = document.getElementById('assistant-empty');
        if (asstEmpty) asstEmpty.classList.add('hidden');
        const card = document.createElement('div');
        card.className = 'p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2';
        const titleEl = document.createElement('p');
        titleEl.className = 'text-sm font-bold';
        titleEl.textContent = title;
        const b = document.createElement('p');
        b.className = 'text-xs text-slate-600 dark:text-slate-400';
        b.textContent = body;
        card.appendChild(titleEl);
        card.appendChild(b);
        const row = document.createElement('div');
        row.className = 'flex gap-2';
        (buttons || []).forEach(([label, cls, fn]) => {
            const btn = document.createElement('button');
            btn.className = cls;
            btn.textContent = label;
            btn.addEventListener('click', fn);
            row.appendChild(btn);
        });
        card.appendChild(row);
        box.appendChild(card);
    }

    async function aiApplyTemplateById(templateId) {
        if (!window.electronAPI || !window.electronAPI.getTemplates) return;
        const tpls = await window.electronAPI.getTemplates();
        const tpl = (tpls || []).find(x => x.id === templateId);
        if (tpl) applyTemplate(tpl);
        else showToast(t('templateNotFound'), 'error');
    }

    const chipWhy = document.getElementById('chip-ai-why');
    if (chipWhy) chipWhy.addEventListener('click', async () => {
        if (!window.electronAPI || !window.electronAPI.aiDiagnose) return;
        const res = await window.electronAPI.aiDiagnose('');
        if (res && res.ok) {
            aiInfoCard(t('diagnosis'), `${res.explanation || ''} ${res.whatToDo || ''}`.trim(), []);
        } else {
            showToast(t('diagnosisFailed'), 'error');
        }
    });
    const chipEnergy = document.getElementById('chip-ai-energy');
    if (chipEnergy) chipEnergy.addEventListener('click', async () => {
        if (!window.electronAPI || !window.electronAPI.aiEnergy) return;
        const res = await window.electronAPI.aiEnergy();
        if (res && res.ok) {
            const btns = [];
            if (res.suggestion) {
                btns.push([t('apply'), 'flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90', () => aiApplyTemplateById(res.suggestion.templateId)]);
            }
            aiInfoCard(t('energy'), `${res.summary || ''}${res.suggestion ? ' ' + res.suggestion.text : ''}`.trim(), btns);
            aiSpeak(res.summary);
        }
    });
    const chipSuggest = document.getElementById('chip-ai-suggest');
    if (chipSuggest) chipSuggest.addEventListener('click', async () => {
        if (!window.electronAPI || !window.electronAPI.aiSuggest) return;
        const res = await window.electronAPI.aiSuggest();
        if (res && res.suggestion) {
            const topic = res.suggestion.topic;
            aiInfoCard(t('suggestion'), res.suggestion.text, [
                [t('apply'), 'flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90', () => aiApplyTemplateById(res.suggestion.templateId)],
                [t('dontSuggestAgain'), 'px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-600', async () => {
                    if (window.electronAPI.aiDismissSuggestion) await window.electronAPI.aiDismissSuggestion(topic);
                    document.getElementById('ai-result').replaceChildren();
                    showToast(t('suggestionDismissed'), 'info');
                }]
            ]);
        } else {
            aiInfoCard(t('suggestion'), t('noPattern'), []);
        }
    });

    // Enerji kartı durumu (WBS-E5): sunucudan yüklenir, kayıtta değişmediyse yazılmaz.
    let nrgOrigWatt = null, nrgOrigPrice = null, nrgPendingSource = null;
    const ENERGY_SOURCE_KEYS = { unset: 'energySourceUnset', measured: 'energySourceMeasured', estimated: 'energySourceEstimated', manual: 'energySourceManual', legacy: 'energySourceLegacy', default: 'energySourceDefault' };

    async function loadEnergyCard() {
        if (!window.electronAPI || !window.electronAPI.getSettings) return;
        try {
            const s = await window.electronAPI.getSettings();
            if (!s || typeof s !== 'object') return;
            nrgOrigWatt = s.deviceWattage == null ? null : s.deviceWattage;
            nrgOrigPrice = s.electricityCostPerKwh == null ? null : s.electricityCostPerKwh;
            nrgPendingSource = null;
            document.getElementById('nrg-watt').value = nrgOrigWatt == null ? '' : nrgOrigWatt;
            document.getElementById('nrg-price').value = nrgOrigPrice == null ? '' : String(nrgOrigPrice).replace('.', ',');
            const parts = [];
            if (nrgOrigWatt != null) parts.push(t('energyWattLine', { watt: nrgOrigWatt, source: t(ENERGY_SOURCE_KEYS[s.wattSource] || 'energySourceDefault') }));
            if (nrgOrigPrice != null) parts.push(t('energyPriceLine', { price: nrgOrigPrice }));
            document.getElementById('nrg-source').innerText = parts.length > 0 ? parts.join(' • ') : t('notSetYet');
        } catch (_) { }
    }

    const btnNrgMeasure = document.getElementById('btn-nrg-measure');
    if (btnNrgMeasure) {
        btnNrgMeasure.addEventListener('click', async () => {
            const note = document.getElementById('nrg-measure-note');
            if (!window.electronAPI || !window.electronAPI.deviceEstimate) return;
            note.classList.remove('hidden');
            note.innerText = t('measuring');
            try {
                const res = await window.electronAPI.deviceEstimate();
                if (res && res.ok && res.profile && res.profile.wattW) {
                    const p = res.profile;
                    document.getElementById('nrg-watt').value = p.wattW;
                    nrgPendingSource = p.wattSource === 'measured' ? 'measured' : 'estimated';
                    note.innerText = p.wattSource === 'measured'
                        ? t('toastMeasuredFromBattery', { watt: p.wattW })
                        : t('toastEstimated', { watt: p.wattW, tier: p.tier || t('hardwareTier') });
                    saveEnergySettings();
                } else {
                    note.innerText = t('measureFailedBlank');
                }
            } catch (_) {
                note.innerText = t('measureFailed');
            }
        });
    }

    const btnNrgClear = document.getElementById('btn-nrg-clear');
    if (btnNrgClear) {
        btnNrgClear.addEventListener('click', () => {
            const hadAny = nrgOrigWatt !== null || nrgOrigPrice !== null;
            document.getElementById('nrg-watt').value = '';
            document.getElementById('nrg-price').value = '';
            nrgPendingSource = null;
            if (hadAny) saveEnergySettings();
            else showToast(t('clearedPressSave'), 'info');
        });
    }

    function readEnergyPatch() {
        const patch = {};
        const wattEl = document.getElementById('nrg-watt');
        const priceEl = document.getElementById('nrg-price');
        if (wattEl) {
            const raw = wattEl.value.trim();
            if (raw === '') {
                if (nrgOrigWatt !== null) {
                    patch.deviceWattage = null;
                    patch.wattSource = 'unset';
                }
            } else {
                const w = parseInt(raw, 10);
                if (!Number.isInteger(w) || w < 5 || w > 2000) return { error: t('wattRangeShort') };
                if (w !== nrgOrigWatt) {
                    patch.deviceWattage = w;
                    patch.wattSource = nrgPendingSource || 'manual';
                    if (patch.wattSource === 'measured' || patch.wattSource === 'estimated') {
                        patch.wattMeasuredAt = Date.now();
                    }
                }
            }
        }
        if (priceEl) {
            const raw = priceEl.value;
            const price = parseDecimalInput(raw);
            if (String(raw).trim() !== '' && price === null) {
                return { error: t('priceNumberShort') };
            }
            const origNull = nrgOrigPrice === null;
            if (price === null) {
                if (!origNull) {
                    patch.electricityCostPerKwh = null;
                    patch.priceSource = 'unset';
                }
            } else if (price !== nrgOrigPrice) {
                patch.electricityCostPerKwh = price;
                patch.priceSource = 'manual';
            }
        }
        return { patch };
    }

    // Send WoL
    const btnWoL = document.getElementById('btn-send-wol');
    if (btnWoL) {
        btnWoL.addEventListener('click', async () => {
            const mac = document.getElementById('wol-mac').value;
            // L-15: boş alan 255.255.255.255'e sabitlenmez; ana süreç
            // sanal adaptörleri atlayan yönlendirilmiş broadcast'i seçer.
            const ip = document.getElementById('wol-ip').value.trim() || undefined;
            if (!mac) {
                showToast(t('errorMac'), 'error');
                return;
            }
            if (window.electronAPI && window.electronAPI.sendWakeOnLan) {
                const res = await window.electronAPI.sendWakeOnLan({ macAddress: mac, broadcastIp: ip, port: 9 });
                if (res.success) {
                    showToast(t('toastWolSent'), 'success');
                } else {
                    showToast(t('errorWol', { error: res.error }), 'error');
                }
            }
        });
    }

    function applyTheme(theme, themeId) {
        const isDark = theme !== 'light';
        const resolvedId = VALID_THEME_IDS.includes(themeId) ? themeId : activeThemeId;
        activeThemeId = resolvedId;
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.setAttribute('data-theme', resolvedId);
        if (btnModeLight) {
            btnModeLight.classList.toggle('is-active', !isDark);
            btnModeLight.setAttribute('aria-pressed', !isDark ? 'true' : 'false');
        }
        if (btnModeDark) {
            btnModeDark.classList.toggle('is-active', isDark);
            btnModeDark.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        }
        if (themeColorGrid) {
            themeColorGrid.querySelectorAll('[data-theme-option]').forEach((card) => {
                const selected = card.getAttribute('data-theme-option') === resolvedId;
                card.classList.toggle('is-selected', selected);
                card.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        }
    }

    // Kritik Ayar Değişikliği Onay Penceresi (#modal-confirm-action)
    let pendingActionConfirm = null;
    function requestActionConfirm({ title, message, onConfirm, onCancel }) {
        const titleEl = document.getElementById('confirm-action-title');
        const msgEl = document.getElementById('confirm-action-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        pendingActionConfirm = { onConfirm, onCancel };
        openModal('modal-confirm-action');
    }
    const dismissActionConfirm = (accepted) => {
        const pending = pendingActionConfirm;
        pendingActionConfirm = null;
        closeModal('modal-confirm-action');
        if (!pending) return;
        if (accepted && typeof pending.onConfirm === 'function') pending.onConfirm();
        else if (!accepted && typeof pending.onCancel === 'function') pending.onCancel();
    };
    const btnConfirmActionYes = document.getElementById('modal-confirm-action-yes');
    const btnConfirmActionCancel = document.getElementById('modal-confirm-action-cancel');
    const btnConfirmActionClose = document.getElementById('modal-confirm-action-close');
    if (btnConfirmActionYes) btnConfirmActionYes.addEventListener('click', () => dismissActionConfirm(true));
    if (btnConfirmActionCancel) btnConfirmActionCancel.addEventListener('click', () => dismissActionConfirm(false));
    if (btnConfirmActionClose) btnConfirmActionClose.addEventListener('click', () => dismissActionConfirm(false));

    // Otomatik Ayar Kaydı (Uyku Politikası, Enerji, Özerklik + PIN kapısı)
    async function saveWakeSettings() {
        const wakeEl = document.querySelector('input[name="wakeMode"]:checked');
        const wakeMode = wakeEl && wakeEl.value === 'skip' ? 'skip' : 'run';
        const tolEl = document.getElementById('setting-wake-tolerance');
        const wakeTolRaw = parseInt(tolEl?.value, 10);
        const prevMode = localStorage.getItem('wakeMode') === 'skip' ? 'skip' : 'run';
        const prevTol = parseInt(localStorage.getItem('wakeToleranceMinutes'), 10);
        const safePrevTol = Number.isInteger(prevTol) ? prevTol : 10;

        if (!Number.isInteger(wakeTolRaw) || wakeTolRaw < 0 || wakeTolRaw > 1440) {
            showToast(t('errorWakeTolerance'), 'error');
            if (tolEl) tolEl.value = String(safePrevTol);
            return;
        }
        if (!window.electronAPI || !window.electronAPI.saveSettingsAtomic) return;
        const patch = { wakeMode, wakeToleranceMinutes: wakeTolRaw };
        const res = await window.electronAPI.saveSettingsAtomic({ settings: patch });
        if (res && res.success === false) {
            const oldWake = document.querySelector(`input[name="wakeMode"][value="${prevMode}"]`);
            if (oldWake) oldWake.checked = true;
            if (tolEl) tolEl.value = String(safePrevTol);
            showToast(res.message || t('errorModeSave'), 'error');
            return;
        }
        try {
            localStorage.setItem('wakeMode', wakeMode);
            localStorage.setItem('wakeToleranceMinutes', String(wakeTolRaw));
        } catch (_) { }
        showToast(t('toastSettingsSaved'), 'success');
    }

    document.querySelectorAll('input[name="wakeMode"]').forEach((radio) => {
        radio.addEventListener('change', () => { saveWakeSettings(); });
    });
    const elWakeTol = document.getElementById('setting-wake-tolerance');
    if (elWakeTol) {
        elWakeTol.addEventListener('change', () => { saveWakeSettings(); });
    }

    async function saveEnergySettings() {
        const energy = readEnergyPatch();
        if (energy.error) {
            showToast(energy.error, 'error');
            return;
        }
        if (!energy.patch || Object.keys(energy.patch).length === 0) return;
        if (!window.electronAPI || !window.electronAPI.saveSettingsAtomic) return;
        const res = await window.electronAPI.saveSettingsAtomic({ settings: energy.patch });
        if (res && res.success === false) {
            showToast(res.message || t('errorModeSave'), 'error');
            return;
        }
        if (typeof loadEnergyCard === 'function') loadEnergyCard();
        showToast(t('toastSettingsSaved'), 'success');
    }

    const elNrgWatt = document.getElementById('nrg-watt');
    const elNrgPrice = document.getElementById('nrg-price');
    if (elNrgWatt) elNrgWatt.addEventListener('change', () => { saveEnergySettings(); });
    if (elNrgPrice) elNrgPrice.addEventListener('change', () => { saveEnergySettings(); });

    async function commitAutonomyMode(nextMode) {
        const previousMode = localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic';
        const restoreAutonomy = () => {
            const oldMode = document.querySelector(`input[name="autonomyMode"][value="${previousMode}"]`);
            if (oldMode) oldMode.checked = true;
        };
        if (!window.electronAPI || !window.electronAPI.saveSettingsAtomic) return;
        const patch = { autonomyMode: nextMode };
        // O-20: PIN doğrulanmadan güvenlik ayarı yazılmaz; tek atomik IPC.
        const run = (pin) => window.electronAPI.saveSettingsAtomic({ settings: patch, pin });
        const res = await run();
        if (isPinChallenge(res)) {
            if (await pinRequiredWithoutPin(res)) {
                restoreAutonomy();
                return;
            }
            requestPin(t('pinPromptCancel'), {
                run,
                done: (final) => {
                    if (final && final.success !== false) {
                        try { localStorage.setItem('autonomyMode', nextMode); } catch (_) { }
                        showToast(t('toastSettingsSaved'), 'success');
                    } else {
                        restoreAutonomy();
                        showToast((final && final.message) || t('errorModeSave'), 'error');
                    }
                },
                cancel: () => { restoreAutonomy(); }
            });
            paintPinError(res);
            return;
        }
        if (res && res.success === false) {
            restoreAutonomy();
            showToast(res.message || t('errorModeSave'), 'error');
            return;
        }
        try { localStorage.setItem('autonomyMode', nextMode); } catch (_) { }
        showToast(t('toastSettingsSaved'), 'success');
    }

    document.querySelectorAll('input[name="autonomyMode"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            const nextMode = radio.value === 'full' ? 'full' : 'classic';
            const previousMode = localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic';
            if (nextMode === previousMode) return;
            if (nextMode === 'full') {
                requestActionConfirm({
                    title: t('autonomyFullConfirmTitle'),
                    message: t('autonomyFullConfirmMsg'),
                    onConfirm: () => { commitAutonomyMode('full'); },
                    onCancel: () => {
                        const oldMode = document.querySelector(`input[name="autonomyMode"][value="${previousMode}"]`);
                        if (oldMode) oldMode.checked = true;
                    }
                });
            } else {
                commitAutonomyMode('classic');
            }
        });
    });

    const btnSettingsDefault = document.getElementById('btn-settings-default');
    if (btnSettingsDefault) {
        btnSettingsDefault.addEventListener('click', () => {
            requestActionConfirm({
                title: t('settingsResetConfirmTitle'),
                message: t('settingsResetConfirmMsg'),
                onConfirm: async () => {
                    const sysLang = navigator.language.split('-')[0].toLowerCase();
                    const translated = (window.PPLocale && window.PPLocale.translated) || [];
                    const defaultLang = translated.includes(sysLang) ? sysLang : UI_FALLBACK_LANG;
                    const patch = {
                        language: defaultLang,
                        theme: 'dark',
                        themeId: 'obsidian',
                        wakeMode: 'run',
                        wakeToleranceMinutes: 10
                    };
                    if (window.electronAPI && window.electronAPI.saveSettingsAtomic) {
                        const res = await window.electronAPI.saveSettingsAtomic({ settings: patch });
                        if (res && res.success === false) {
                            showToast(res.message || t('errorModeSave'), 'error');
                            return;
                        }
                    }
                    if (elAutostart) elAutostart.checked = false;
                    if (elVoice) elVoice.checked = false;
                    if (elTheme) elTheme.value = 'dark';
                    activeThemeId = 'obsidian';
                    committedTheme = 'dark';
                    committedThemeId = 'obsidian';
                    committedLanguage = defaultLang;
                    if (elNotifications) elNotifications.checked = true;
                    if (elSoundMode) elSoundMode.value = 'auto';
                    if (elLanguage) elLanguage.value = defaultLang;
                    const runWake = document.querySelector('input[name="wakeMode"][value="run"]');
                    if (runWake) runWake.checked = true;
                    const wakeTol = document.getElementById('setting-wake-tolerance');
                    if (wakeTol) wakeTol.value = '10';
                    try {
                        localStorage.setItem('autostart', 'false');
                        localStorage.setItem('voice', 'false');
                        localStorage.setItem('theme', 'dark');
                        localStorage.setItem('themeId', 'obsidian');
                        localStorage.setItem('notifications', 'true');
                        localStorage.setItem('soundMode', 'auto');
                        localStorage.setItem('language', defaultLang);
                        localStorage.setItem('wakeMode', 'run');
                        localStorage.setItem('wakeToleranceMinutes', '10');
                    } catch (_) { }
                    if (window.electronAPI && window.electronAPI.setAutostart) {
                        window.electronAPI.setAutostart(false);
                    }
                    applyTheme('dark', 'obsidian');
                    await applyLanguage(defaultLang);
                    showToast(t('toastDefaultsLoaded'), 'success');
                }
            });
        });
    }

    // Split-Nav Smooth Section Jump + Docs Copy Buttons (Dev Cleaner Parity)
    function switchSplitSubpage(targetId) {
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return false;
        const subpage = target.classList.contains('pp-settings-subpage') || target.classList.contains('pp-docs-subpage')
            ? target
            : target.closest('.pp-settings-subpage, .pp-docs-subpage');
        if (subpage) {
            const groupClass = subpage.classList.contains('pp-docs-subpage') ? '.pp-docs-subpage' : '.pp-settings-subpage';
            const pane = subpage.closest('.pp-split-content-pane');
            document.querySelectorAll(groupClass).forEach((sec) => {
                sec.classList.toggle('hidden', sec !== subpage);
            });
            if (pane) pane.scrollTop = 0;
            const navScope = subpage.classList.contains('pp-docs-subpage') ? '[data-split-nav="docs"]' : '[data-split-nav="settings"]';
            const navRoot = document.querySelector(navScope);
            if (navRoot) {
                navRoot.querySelectorAll('.pp-split-nav-link').forEach((link) => {
                    link.classList.toggle('is-active', link.getAttribute('data-scroll-target') === subpage.id);
                });
            }
            if (target !== subpage) {
                try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { }
            }
            return true;
        }
        try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { }
        return true;
    }
    window.switchSplitSubpage = switchSplitSubpage;

    // Auto-reveal parent subpage when any element inside a hidden subpage is focused or scrolled into view
    (function installSubpageAutoReveal() {
        const origFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function (...args) {
            const sub = this && typeof this.closest === 'function'
                ? this.closest('.pp-settings-subpage, .pp-docs-subpage')
                : null;
            if (sub && sub.classList.contains('hidden')) {
                switchSplitSubpage(sub.id);
            }
            return origFocus.apply(this, args);
        };
        const origScroll = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = function (...args) {
            const sub = this && typeof this.closest === 'function'
                ? this.closest('.pp-settings-subpage, .pp-docs-subpage')
                : null;
            if (sub && sub.classList.contains('hidden')) {
                switchSplitSubpage(sub.id);
            }
            return origScroll.apply(this, args);
        };
    })();

    document.querySelectorAll('[data-split-nav]').forEach((navRoot) => {
        navRoot.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-scroll-target]');
            if (!btn) return;
            const targetId = btn.getAttribute('data-scroll-target');
            if (!targetId) return;
            navRoot.querySelectorAll('.pp-split-nav-link').forEach((link) => {
                link.classList.toggle('is-active', link === btn);
            });
            switchSplitSubpage(targetId);
        });
    });

    async function copyTextWithFeedback(text, btn) {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            }
            if (btn && btn.hasAttribute('data-copy-cmd')) {
                const prevText = btn.textContent;
                btn.textContent = t('docsCopiedBtn');
                setTimeout(() => {
                    btn.textContent = t('docsCopyBtn') || prevText;
                }, 1800);
            }
            showToast(t('docsCopiedBtn'), 'success');
        } catch (_) {
            showToast(t('unknownError'), 'error');
        }
    }

    document.querySelectorAll('[data-copy-cmd]').forEach((btn) => {
        btn.addEventListener('click', () => copyTextWithFeedback(btn.getAttribute('data-copy-cmd') || '', btn));
    });

    document.querySelectorAll('[data-copy-url]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyTextWithFeedback(btn.getAttribute('data-copy-url') || '', btn);
        });
    });

    const modalConfirmLinkCopy = document.getElementById('modal-confirm-link-copy');
    if (modalConfirmLinkCopy) {
        modalConfirmLinkCopy.addEventListener('click', () => {
            const elTarget = document.getElementById('confirm-link-target');
            const url = (elTarget && elTarget.textContent) || '';
            copyTextWithFeedback(url.trim(), modalConfirmLinkCopy);
        });
    }

    // Extended Enterprise & End-User Customization Controls + Presets
    const elCloseToTray = document.getElementById('setting-close-to-tray');
    const elStartMinimized = document.getElementById('setting-start-minimized');
    const elAutoMiniWidget = document.getElementById('setting-auto-mini-widget');
    const elDefaultAction = document.getElementById('setting-default-action');
    const elDefaultMinutes = document.getElementById('setting-default-minutes');
    const elUiDensity = document.getElementById('setting-ui-density');
    const elReduceMotion = document.getElementById('setting-reduce-motion');
    const elClockFormat = document.getElementById('setting-clock-format');
    const elToastPosition = document.getElementById('setting-toast-position');
    const elToastDuration = document.getElementById('setting-toast-duration');
    const elDesktopNotifyStart = document.getElementById('setting-desktop-notify-start');
    const elDesktopNotifyWarn = document.getElementById('setting-desktop-notify-warn');
    const elDesktopNotifySkip = document.getElementById('setting-desktop-notify-skip');
    const elPrewarnSeconds = document.getElementById('setting-prewarn-seconds');
    const elQuietStart = document.getElementById('setting-quiet-start');
    const elQuietEnd = document.getElementById('setting-quiet-end');
    const elFallbackAction = document.getElementById('setting-fallback-action');
    const elGraceSeconds = document.getElementById('setting-grace-seconds');
    const elProtectFullscreen = document.getElementById('setting-protect-fullscreen');
    const elProtectActiveIo = document.getElementById('setting-protect-active-io');
    const elPinLengthMode = document.getElementById('setting-pin-length-mode');
    const elAutoBackup = document.getElementById('setting-auto-backup');

    function applyExtendedUiPrefs() {
        const density = localStorage.getItem('pp-ui-density') || 'comfortable';
        document.body.classList.toggle('pp-density-compact', density === 'compact');
        if (elUiDensity) elUiDensity.value = density;

        const reduceMotion = localStorage.getItem('pp-reduce-motion') === 'true';
        document.body.classList.toggle('pp-reduce-motion', reduceMotion);
        if (elReduceMotion) elReduceMotion.checked = reduceMotion;

        const toastPos = localStorage.getItem('pp-toast-position') || 'bottom-right';
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) toastContainer.setAttribute('data-pos', toastPos);
        if (elToastPosition) elToastPosition.value = toastPos;

        const toastDur = localStorage.getItem('pp-toast-duration') || '4000';
        if (elToastDuration) elToastDuration.value = toastDur;

        const pinLen = localStorage.getItem('pp-pin-length-mode') || 'flex';
        if (elPinLengthMode) elPinLengthMode.value = pinLen;
        const pinInput = document.getElementById('pin-input');
        if (pinInput) {
            pinInput.maxLength = pinLen === '4' ? 4 : (pinLen === '6' ? 6 : 8);
        }
    }

    function bindLocalPref(el, key, onChange) {
        if (!el) return;
        const saved = localStorage.getItem(key);
        if (saved !== null) {
            if (el.type === 'checkbox') el.checked = saved === 'true';
            else el.value = saved;
        }
        el.addEventListener('change', () => {
            const val = el.type === 'checkbox' ? String(el.checked) : el.value;
            try { localStorage.setItem(key, val); } catch (_) { }
            if (onChange) onChange(val);
        });
    }

    bindLocalPref(elCloseToTray, 'pp-close-to-tray');
    bindLocalPref(elStartMinimized, 'pp-start-minimized');
    bindLocalPref(elAutoMiniWidget, 'pp-auto-mini-widget');
    bindLocalPref(elDefaultAction, 'pp-default-action', (val) => {
        const btn = document.querySelector(`.action-btn[data-action="${val}"]`);
        if (btn) btn.click();
    });
    bindLocalPref(elDefaultMinutes, 'pp-default-minutes', (val) => {
        const mins = parseInt(val, 10);
        if (Number.isInteger(mins) && mins > 0) {
            if (dInput) dInput.value = 0;
            if (hInput) hInput.value = Math.floor(mins / 60);
            if (mInput) mInput.value = mins % 60;
        }
    });
    bindLocalPref(elUiDensity, 'pp-ui-density', () => applyExtendedUiPrefs());
    bindLocalPref(elReduceMotion, 'pp-reduce-motion', () => applyExtendedUiPrefs());
    bindLocalPref(elClockFormat, 'pp-clock-format');
    bindLocalPref(elToastPosition, 'pp-toast-position', () => applyExtendedUiPrefs());
    bindLocalPref(elToastDuration, 'pp-toast-duration');
    bindLocalPref(elDesktopNotifyStart, 'pp-desktop-notify-start');
    bindLocalPref(elDesktopNotifyWarn, 'pp-desktop-notify-warn');
    bindLocalPref(elDesktopNotifySkip, 'pp-desktop-notify-skip');
    bindLocalPref(elPrewarnSeconds, 'pp-prewarn-seconds');
    bindLocalPref(elQuietStart, 'pp-quiet-start');
    bindLocalPref(elQuietEnd, 'pp-quiet-end');
    bindLocalPref(elFallbackAction, 'pp-fallback-action');
    bindLocalPref(elGraceSeconds, 'pp-grace-seconds');
    bindLocalPref(elProtectFullscreen, 'pp-protect-fullscreen');
    bindLocalPref(elProtectActiveIo, 'pp-protect-active-io');
    bindLocalPref(elPinLengthMode, 'pp-pin-length-mode', () => applyExtendedUiPrefs());
    bindLocalPref(elAutoBackup, 'pp-auto-backup');
    applyExtendedUiPrefs();

    // One-Click Preset Profiles
    document.querySelectorAll('[data-settings-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-settings-preset');
            if (preset === 'standard') {
                if (elNotifications) { elNotifications.checked = true; elNotifications.dispatchEvent(new Event('change')); }
                if (elSoundMode) { elSoundMode.value = 'auto'; elSoundMode.dispatchEvent(new Event('change')); }
                if (elCloseToTray) { elCloseToTray.checked = true; elCloseToTray.dispatchEvent(new Event('change')); }
                if (elPrewarnSeconds) { elPrewarnSeconds.value = '60'; elPrewarnSeconds.dispatchEvent(new Event('change')); }
            } else if (preset === 'night') {
                if (elSoundMode) { elSoundMode.value = 'never'; elSoundMode.dispatchEvent(new Event('change')); }
                if (elProtectFullscreen) { elProtectFullscreen.checked = true; elProtectFullscreen.dispatchEvent(new Event('change')); }
                if (elProtectActiveIo) { elProtectActiveIo.checked = true; elProtectActiveIo.dispatchEvent(new Event('change')); }
                if (elFallbackAction) { elFallbackAction.value = 'hibernate_to_sleep'; elFallbackAction.dispatchEvent(new Event('change')); }
            } else if (preset === 'enterprise') {
                if (elPinLengthMode) { elPinLengthMode.value = '6'; elPinLengthMode.dispatchEvent(new Event('change')); }
                if (elAutoBackup) { elAutoBackup.checked = true; elAutoBackup.dispatchEvent(new Event('change')); }
                if (elProtectActiveIo) { elProtectActiveIo.checked = true; elProtectActiveIo.dispatchEvent(new Event('change')); }
            } else if (preset === 'eco') {
                if (elDefaultAction) { elDefaultAction.value = 'sleep'; elDefaultAction.dispatchEvent(new Event('change')); }
                if (elDefaultMinutes) { elDefaultMinutes.value = '15'; elDefaultMinutes.dispatchEvent(new Event('change')); }
                if (elFallbackAction) { elFallbackAction.value = 'sleep_to_lock'; elFallbackAction.dispatchEvent(new Event('change')); }
            }
            showToast(t('presetAppliedToast'), 'success');
        });
    });

    const btnTestNotification = document.getElementById('btn-test-notification');
    if (btnTestNotification) {
        btnTestNotification.addEventListener('click', () => {
            showToast(t('toastSettingsSaved'), 'info');
        });
    }

    const btnResetShortcuts = document.getElementById('btn-reset-shortcuts');
    if (btnResetShortcuts) {
        btnResetShortcuts.addEventListener('click', () => {
            const defaults = {
                'shortcut-theme': 'Ctrl+T',
                'shortcut-quickstart': 'Ctrl+Enter',
                'shortcut-cancel': 'Escape',
                'shortcut-settings': 'Ctrl+,',
                'shortcut-docs': 'F1'
            };
            Object.entries(defaults).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
                try { localStorage.setItem(`pp-${id}`, val); } catch (_) { }
            });
            showToast(t('toastDefaultsLoaded'), 'success');
        });
    }

    const btnExportSettingsJson = document.getElementById('btn-export-settings-json');
    if (btnExportSettingsJson) {
        btnExportSettingsJson.addEventListener('click', async () => {
            const snapshot = {
                app: 'Power Pilot',
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                preferences: {
                    theme: localStorage.getItem('theme') || 'dark',
                    themeId: localStorage.getItem('themeId') || 'obsidian',
                    language: localStorage.getItem('language') || 'tr',
                    notifications: localStorage.getItem('notifications') !== 'false',
                    soundMode: localStorage.getItem('soundMode') || 'auto',
                    uiDensity: localStorage.getItem('pp-ui-density') || 'comfortable',
                    toastPosition: localStorage.getItem('pp-toast-position') || 'bottom-right',
                    fallbackAction: localStorage.getItem('pp-fallback-action') || 'none',
                    pinLengthMode: localStorage.getItem('pp-pin-length-mode') || 'flex'
                }
            };
            await copyTextWithFeedback(JSON.stringify(snapshot, null, 2), btnExportSettingsJson);
        });
    }

    const btnImportSettingsJson = document.getElementById('btn-import-settings-json');
    if (btnImportSettingsJson) {
        btnImportSettingsJson.addEventListener('click', () => {
            showToast(t('toastSettingsSaved'), 'success');
        });
    }


    // ── Legal Modals ──
    // Erişilebilirlik katmanı (WCAG 2.4.3 / 4.1.2). Öncesinde modallerde
    // `role`/`aria-modal` yoktu, Tab odağı modal dışına (pencere
    // düğmelerine) kaçıyordu, Escape kapatmıyordu ve kapanışta odak geri
    // dönmüyordu. Klavye/ekran okuyucu kullanıcısı modal içeriğini
    // okuyamıyor, nerede olduğunu kaybediyordu.
    const MODAL_DISMISS_MAP = {
        'modal-pin': 'pin-modal-cancel',
        'modal-confirm-link': 'modal-confirm-link-cancel',
        'modal-confirm-action': 'modal-confirm-action-cancel',
        'modal-delete-data': 'modal-delete-data-cancel',
        'modal-eula': 'modal-eula-close',
        'modal-privacy': 'modal-privacy-close',
        'modal-oss': 'modal-oss-close'
    };
    let openModalEl = null;
    let modalReturnFocus = null;

    // Görünür ve odaklanabilir öğeler (gizli PIN alanı hariç tutulur).
    const modalFocusables = (root) => [...root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.getBoundingClientRect().height > 0);

    // Modal başlığını erişilebilir ad yapar (ekran okuyucu duyurusu).
    function ensureModalLabel(el) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
        const head = el.querySelector('h1, h2, h3, h4, [role="heading"]')
            || el.querySelector('p.font-extrabold, p.font-bold')
            || el.querySelector('p');
        if (!head) return;
        if (!head.id) head.id = `${el.id}-title`;
        el.setAttribute('aria-labelledby', head.id);
    }

    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        // İlk açılan modal, kapanışta odağın döneceği hedefi belirler.
        if (!openModalEl) modalReturnFocus = document.activeElement;
        openModalEl = el;
        el.classList.remove('hidden');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        ensureModalLabel(el);
        const first = modalFocusables(el)[0];
        if (first) first.focus();
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
        el.removeAttribute('aria-modal');
        if (openModalEl === el) openModalEl = null;
        const target = modalReturnFocus;
        modalReturnFocus = null;
        if (target && typeof target.focus === 'function' && document.contains(target)) {
            target.focus();
        }
    }

    // Tek merkezden odak tuzağı + Escape. Capture aşamasında çalışır ki
    // başka işleyiciler odağı kaçırmadan önce yakalanabilsin.
    document.addEventListener('keydown', (e) => {
        if (!openModalEl || !document.contains(openModalEl)) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            const dismissId = MODAL_DISMISS_MAP[openModalEl.id];
            const btn = dismissId ? document.getElementById(dismissId) : null;
            // Uygulamanın kendi iptal yolunu kullan (pendingPinAction vb.).
            if (btn) btn.click();
            else closeModal(openModalEl.id);
            return;
        }
        if (e.key !== 'Tab') return;
        const items = modalFocusables(openModalEl);
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!openModalEl.contains(active)) {
            e.preventDefault();
            first.focus();
            return;
        }
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }, true);

    // ── Custom Link Confirmation ──
    let pendingExternalUrl = '';
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
            const hrefAttr = link.getAttribute('href');
            if (hrefAttr && (hrefAttr.startsWith('http://') || hrefAttr.startsWith('https://'))) {
                e.preventDefault();
                pendingExternalUrl = hrefAttr;

                const elTarget = document.getElementById('confirm-link-target');
                if (elTarget) {
                    elTarget.textContent = pendingExternalUrl;
                    elTarget.href = pendingExternalUrl;
                }

                openModal('modal-confirm-link');
            }
        }
    });

    document.getElementById('modal-confirm-link-close').addEventListener('click', () => closeModal('modal-confirm-link'));
    document.getElementById('modal-confirm-link-cancel').addEventListener('click', () => closeModal('modal-confirm-link'));
    document.getElementById('modal-confirm-link-backdrop').addEventListener('click', () => closeModal('modal-confirm-link'));

    document.getElementById('modal-confirm-link-yes').addEventListener('click', () => {
        if (pendingExternalUrl && window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(pendingExternalUrl);
        }
        closeModal('modal-confirm-link');
    });

    // ── Verilerimi sil (Store 10.2.7) ──
    const btnDeleteAllData = document.getElementById('btn-delete-all-data');
    if (btnDeleteAllData) {
        const showDeleteError = (msg) => {
            const errEl = document.getElementById('modal-delete-data-error');
            if (!errEl) return;
            errEl.textContent = msg;
            errEl.classList.remove('hidden');
        };
        btnDeleteAllData.addEventListener('click', async () => {
            const errEl = document.getElementById('modal-delete-data-error');
            if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
            const pinInput = document.getElementById('modal-delete-data-pin');
            const pinWrap = document.getElementById('modal-delete-data-pin-wrap');
            if (pinInput) pinInput.value = '';
            // PIN kuruluysa onay penceresinde doğrulama istenir.
            let pinSet = false;
            try {
                const st = window.electronAPI && window.electronAPI.getCancelPinState
                    ? await window.electronAPI.getCancelPinState()
                    : null;
                pinSet = !!(st && st.set);
            } catch (_) { pinSet = false; }
            if (pinWrap) pinWrap.classList.toggle('hidden', !pinSet);
            openModal('modal-delete-data');
        });
    }
    const deleteDataCancel = () => closeModal('modal-delete-data');
    ['modal-delete-data-close', 'modal-delete-data-cancel', 'modal-delete-data-backdrop'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', deleteDataCancel);
    });
    const btnDeleteDataYes = document.getElementById('modal-delete-data-yes');
    if (btnDeleteDataYes) {
        btnDeleteDataYes.addEventListener('click', async () => {
            const pinInput = document.getElementById('modal-delete-data-pin');
            const btn = btnDeleteDataYes;
            if (!window.electronAPI || typeof window.electronAPI.deleteAllData !== 'function') {
                return;
            }
            const payload = { confirm: true };
            if (pinInput && pinInput.value) payload.pin = pinInput.value;
            btn.disabled = true;
            let result = null;
            try {
                result = await window.electronAPI.deleteAllData(payload);
            } catch (_) {
                result = { success: false, code: 'WIPE_FAILED' };
            }
            if (result && result.success) {
                closeModal('modal-delete-data');
                return; // ana süreç uygulamayı kapatır
            }
            btn.disabled = false;
            const code = result && result.code;
            const msg = (code === 'PIN_REQUIRED' || code === 'PIN_INVALID')
                ? t('pinVerifyFailed')
                : t('privacyDeleteFailed');
            const errEl = document.getElementById('modal-delete-data-error');
            if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
        });
    }

    document.getElementById('btn-eula').addEventListener('click', () => openModal('modal-eula'));
    document.getElementById('modal-eula-close').addEventListener('click', () => closeModal('modal-eula'));
    document.getElementById('modal-eula-accept').addEventListener('click', () => closeModal('modal-eula'));
    document.getElementById('modal-eula-backdrop').addEventListener('click', () => closeModal('modal-eula'));

    document.getElementById('btn-privacy').addEventListener('click', () => openModal('modal-privacy'));
    document.getElementById('modal-privacy-close').addEventListener('click', () => closeModal('modal-privacy'));
    document.getElementById('modal-privacy-close2').addEventListener('click', () => closeModal('modal-privacy'));
    document.getElementById('modal-privacy-backdrop').addEventListener('click', () => closeModal('modal-privacy'));

    document.getElementById('btn-oss-licenses').addEventListener('click', () => openModal('modal-oss'));
    document.getElementById('modal-oss-close').addEventListener('click', () => closeModal('modal-oss'));
    document.getElementById('modal-oss-close2').addEventListener('click', () => closeModal('modal-oss'));
    document.getElementById('modal-oss-backdrop').addEventListener('click', () => closeModal('modal-oss'));

    // WBS-10.1: Uygunsuz AI içeriği bildirim kanalı (Store Politikası 11.16).
    // Vellium iletişim sayfasındaki "Technical Support" kanalına gider;
    // ana sayfa bir bildirim kanalı değildir (dead-end).
    document.getElementById('btn-report-content').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openExternal) {
            // WP-10.T2: dış bağlantılar yalnızca https allowlist'inden geçer.
            window.electronAPI.openExternal('https://vellium.dev/en/contact');
        }
    });

    // WP-10.T2: dış bağlantılar yalnızca https allowlist'inden geçer.
    document.getElementById('btn-support').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal('https://vellium.dev/en/legal/support');
        }
    });

    // Dynamic copyright year
    document.querySelectorAll('.copyright-year').forEach(el => {
        el.textContent = new Date().getFullYear();
    });

    // Show the real packaged version (single source: package.json).
    if (window.electronAPI && window.electronAPI.getAppVersion) {
        window.electronAPI.getAppVersion().then(version => {
            const el = document.getElementById('app-version');
            if (el && version) el.textContent = `v${version}`;
        }).catch(() => { });
    }

    // WP-10.T3: inline onclick yerine delege edilmiş step kontrolleri.
    document.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-pp-step]') : null;
        if (!btn) return;
        const target = document.getElementById(btn.getAttribute('data-pp-target') || '');
        if (!target || typeof target.stepUp !== 'function') return;
        if (btn.getAttribute('data-pp-step') === 'up') target.stepUp();
        else target.stepDown();
        // PPX-027: değer değişimi ekran okuyucuya duyurulur.
        const live = document.getElementById('pp-step-live');
        if (live) live.textContent = `${target.value}`;
    });

    // PPX-045 / T-08.9: boş durum birincil eylemi.
    document.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-pp-empty-action]') : null;
        if (!btn) return;
        const action = btn.getAttribute('data-pp-empty-action');
        if (action === 'focus-ai-input') {
            const input = document.getElementById('ai-input');
            if (input) input.focus();
            return;
        }
        if (action) switchView(action, { focusView: true });
    });

    // WP-08.T3: başarı/hata toast'ı yalnızca main'den gelen gerçek sonuçla.
    function handleTaskResult(payload, success) {
        if (!payload) return;
        const matches = !timerExecutionTaskId || payload.taskId === timerExecutionTaskId;
        if (matches) {
            clearAwaitingResult();
            timerTargetTime = null;
            timerExecutionTaskId = null;
            isTimerActive = false;
            if (success) {
                showToast(t('toastActionExecuted'), 'success');
            } else {
                showToast(payload.message || t('errorTaskFailed'), 'error');
            }
            switchView('nav-dashboard');
        }
        if (typeof loadTasks === 'function') loadTasks();
        if (typeof loadHistory === 'function') loadHistory();
    }
    if (window.electronAPI && window.electronAPI.onTaskExecuted) {
        window.electronAPI.onTaskExecuted((payload) => handleTaskResult(payload, true));
    }
    if (window.electronAPI && window.electronAPI.onTaskFailed) {
        window.electronAPI.onTaskFailed((payload) => handleTaskResult(payload, false));
    }
    // A6: kapatma engellendi — toast + kalıcı uyarı satırı.
    if (window.electronAPI && window.electronAPI.onShutdownVetoed) {
        window.electronAPI.onShutdownVetoed((payload) => {
            const title = t('shutdownVetoedTitle');
            const detail = (payload && payload.message) || t('shutdownVetoedDetail');
            showToast(`${title} — ${detail}`, 'error');
            const box = document.getElementById('shutdown-veto-notice');
            if (box) {
                const titleEl = box.querySelector('[data-veto-title]');
                const bodyEl = box.querySelector('[data-veto-body]');
                if (titleEl) titleEl.textContent = title;
                if (bodyEl) bodyEl.textContent = detail;
                box.classList.remove('hidden');
            }
        });
    }
    if (window.electronAPI && window.electronAPI.onSystemResumed) {
        window.electronAPI.onSystemResumed(resyncTimer);
    }
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resyncTimer();
    });
    window.addEventListener('focus', resyncTimer);
    window.addEventListener('pageshow', resyncTimer);

    // L-11: tepsi AI sessizleştirme isteği doğrulanmış ayar yolundan geçer.
    if (window.electronAPI && window.electronAPI.onRequestAiSilence) {
        window.electronAPI.onRequestAiSilence(async (until) => {
            try {
                const res = await window.electronAPI.saveSettings({ aiSilencedUntil: until });
                if (res && res.success !== false) {
                    showToast(t('toastSettingsSaved'), 'success');
                } else {
                    showToast((res && res.message) || t('errorSaveFailed'), 'error');
                }
            } catch (err) {
                showToast(t('errorSaveFailed'), 'error');
            }
        });
    }

    // Y-05: tepsi otonomi değişikliği PIN'li güvenlik akışından geçer.
    if (window.electronAPI && window.electronAPI.onRequestAutonomyChange) {
        window.electronAPI.onRequestAutonomyChange(async (mode) => {
            const target = mode === 'full' ? 'full' : 'classic';
            await saveSecuritySettings({ autonomyMode: target }, () => {
                try { localStorage.setItem('autonomyMode', target); } catch (_) { }
                const radio = document.querySelector(`input[name="autonomyMode"][value="${target}"]`);
                if (radio) radio.checked = true;
                showToast(t('toastSettingsSaved'), 'success');
            });
        });
    }

    // Y-02: tepsi duraklat/çıkış PIN'li akışı ana pencerede tamamlanır.
    if (window.electronAPI && window.electronAPI.onRequestTrayPinAction) {
        window.electronAPI.onRequestTrayPinAction(async (reason) => {
            const action = reason === 'quit' ? 'quit-app' : 'toggle-pause-all';
            const run = (pin) => window.electronAPI[reason === 'quit' ? 'quitApp' : 'togglePauseAll'](pin);
            requestPin(t('pinPromptCancel'), {
                run,
                done: (final) => {
                    if (final && final.success === false) {
                        showToast(final.message || t('errorSaveFailed'), 'error');
                    } else if (action === 'toggle-pause-all') {
                        showToast(t('toastSettingsSaved'), 'success');
                    }
                }
            });
        });
    }

    // Initial Load — aktif durum tek yoldan (restoreActiveState) yukarıda yüklendi.
    // ── First-run onboarding (3 adım) ─────────────────────────────
    // Normal kullanıcı ilk görevi ≤2 tıkla kursun: senaryo → ayrıntı →
    // oluştur. Seçimler mevcut IPC sözleşmesini kullanır (yeni yol yok).
    let onboardingChoice = null;
    let onboardingMinutes = 30;

    function onboardingSummaryText() {
        if (onboardingChoice === 'duration') {
            return t('onboardingDurationSummary', {
                minutes: onboardingMinutes,
                action: getActionString('shutdown')
            });
        }
        if (onboardingChoice === 'download') {
            return t('onboardingDownloadSummary', { action: getActionString('shutdown') });
        }
        return t('onboardingNightSummary', { action: getActionString('sleep') });
    }

    function paintOnboarding() {
        const summary = document.getElementById('onboarding-summary');
        if (summary) summary.textContent = onboardingSummaryText();
        const chips = document.getElementById('onboarding-duration-chips');
        if (chips) {
            chips.classList.toggle('hidden', onboardingChoice !== 'duration');
            chips.querySelectorAll('[data-onboarding-minutes]').forEach((chip) => {
                const active = Number(chip.getAttribute('data-onboarding-minutes')) === onboardingMinutes;
                chip.classList.toggle('bg-primary', active);
                chip.classList.toggle('text-white', active);
                chip.classList.toggle('border-primary', active);
            });
        }
    }

    function finishOnboarding() {
        try { localStorage.setItem('onboardingDone', '1'); } catch (_) { /* yut */ }
        const overlay = document.getElementById('onboarding');
        if (overlay) overlay.classList.add('hidden');
    }

    async function createOnboardingTask() {
        if (!window.electronAPI || typeof window.electronAPI.createTask !== 'function') return;
        const payload = { action: 'shutdown' };
        if (onboardingChoice === 'duration') {
            payload.trigger = { type: 'duration', durationMs: onboardingMinutes * 60 * 1000 };
        } else if (onboardingChoice === 'download') {
            payload.action = 'shutdown';
            payload.conditionGroup = {
                operator: 'AND',
                stabilitySeconds: 15,
                conditions: [{ type: 'network_speed', thresholdKbps: 50 }]
            };
        } else {
            payload.action = 'sleep';
            const target = new Date();
            target.setHours(23, 0, 0, 0);
            if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
            payload.trigger = { type: 'scheduled_time', targetTime: target.getTime() };
        }
        let res = null;
        try {
            res = await window.electronAPI.createTask(payload);
        } catch (err) {
            res = { success: false, message: err && err.message };
        }
        if (res && res.success !== false) {
            showToast(t('taskCreated'), 'success');
            finishOnboarding();
            if (typeof loadTasks === 'function') loadTasks();
            return;
        }
        showToast((res && res.message) || t('errorTaskCreate'), 'error');
    }

    async function initOnboarding() {
        const overlay = document.getElementById('onboarding');
        if (!overlay) return;
        let done = false;
        try { done = localStorage.getItem('onboardingDone') === '1'; } catch (_) { /* yut */ }
        if (done) return;
        // Cihaz/AI sihirbazı da ilk açılışta görünür; iki kaplama üst üste
        // binmesin diye rehber onun kapanmasını bekler.
        const wizard = document.getElementById('wizard-overlay');
        if (wizard && !wizard.classList.contains('hidden')) {
            await new Promise((resolve) => {
                const timer = setTimeout(doneWaiting, 120000);
                function doneWaiting() {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve();
                }
                const observer = new MutationObserver(() => {
                    if (wizard.classList.contains('hidden')) doneWaiting();
                });
                observer.observe(wizard, { attributes: true, attributeFilter: ['class'] });
            });
        }
        // PPX-016: sihirbazı atlayan kullanıcı rehberi de görmez.
        let skipped = false;
        try { skipped = localStorage.getItem('pp-wizard-skipped') === '1'; } catch (_) { /* yut */ }
        if (skipped) return;
        // Mevcut kullanıcı (görevleri olan) rehberi tekrar görmesin.
        // Kontrol sihirbaz beklemesinden SONRA: sihirbazın ürettiği
        // görev de görülür.
        try {
            if (window.electronAPI && typeof window.electronAPI.getTasks === 'function') {
                const existing = await window.electronAPI.getTasks();
                if (Array.isArray(existing) && existing.length > 0) {
                    finishOnboarding();
                    return;
                }
            }
        } catch (_) { /* görev listesi okunamadıysa rehber gösterilir */ }
        overlay.classList.remove('hidden');
        const step1 = document.getElementById('onboarding-step-1');
        const step2 = document.getElementById('onboarding-step-2');

        overlay.querySelectorAll('[data-onboarding-choice]').forEach((btn) => {
            btn.addEventListener('click', () => {
                onboardingChoice = btn.getAttribute('data-onboarding-choice');
                if (onboardingChoice === 'duration') onboardingMinutes = 30;
                if (step1) step1.classList.add('hidden');
                if (step2) step2.classList.remove('hidden');
                paintOnboarding();
            });
        });
        overlay.querySelectorAll('[data-onboarding-minutes]').forEach((chip) => {
            chip.addEventListener('click', () => {
                onboardingMinutes = Number(chip.getAttribute('data-onboarding-minutes')) || 30;
                paintOnboarding();
            });
        });
        const back = document.getElementById('onboarding-back');
        if (back) back.addEventListener('click', () => {
            if (step2) step2.classList.add('hidden');
            if (step1) step1.classList.remove('hidden');
        });
        const create = document.getElementById('onboarding-create');
        if (create) create.addEventListener('click', createOnboardingTask);
        const skip = document.getElementById('onboarding-skip');
        if (skip) skip.addEventListener('click', finishOnboarding);
    }

    loadSettings();
    if (typeof initOnboarding === 'function') initOnboarding();

    // A6: kapatma engellendi bildirimi kapatılabilir olmalı.
    (function initVetoNotice() {
        const box = document.getElementById('shutdown-veto-notice');
        if (!box) return;
        const closeBtn = document.getElementById('shutdown-veto-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => box.classList.add('hidden'));
        }
    })();

    // Depo bakım modu görünürlüğü: kayıtlar sessizce reddedilmesin.
    (async () => {
        try {
            if (!window.electronAPI || typeof window.electronAPI.getStorageStatus !== 'function') return;
            const st = await window.electronAPI.getStorageStatus();
            const box = document.getElementById('storage-warning');
            if (!box) return;
            // Çıkış yolu: kullanıcı veri klasörünü açıp özgün dosyayı
            // ve alınan yedeği görebilir. Kilitli bırakma yok.
            const openBtn = document.getElementById('btn-storage-open-folder');
            if (openBtn && !openBtn.dataset.bound) {
                openBtn.dataset.bound = '1';
                openBtn.addEventListener('click', async () => {
                    try {
                        const r = await window.electronAPI.openDataFolder();
                        if (!r || !r.success) {
                            showToast(t('errorOpenFolder'), 'error');
                        }
                    } catch (_) {
                        showToast(t('errorOpenFolder'), 'error');
                    }
                });
            }
            const maintenance = !!(st && st.maintenanceMode);
            const tampered = !!(st && st.auditTampered);
            storageStatusInfo = st;
            renderStorageWarning();
            if (!(maintenance || tampered)) return;
            console.warn('[Storage] depo sorunu:', st);
        } catch (_) { /* tanı opsiyonel */ }
    })();

    // Veri kurtarma bildirimi: bozuk dosya karantinaya alındıysa
    // sessiz sıfırlama YAPILMAZ — kullanıcı ne olduğunu ve özgün
    // dosyanın nerede olduğunu görmeli.
    (async () => {
        try {
            if (!window.electronAPI || typeof window.electronAPI.getStorageStatus !== 'function') return;
            const st = await window.electronAPI.getStorageStatus();
            const rec = st && st.recoveredFrom;
            if (!rec) return;
            storageRecoveryInfo = rec;
            renderStorageRecovery();
            // Yol metni tek başına işe yaramaz: kullanıcı oraya gidebilmeli.
            const folderBtn = document.getElementById('btn-storage-recovered-folder');
            if (folderBtn && !folderBtn.dataset.bound) {
                folderBtn.dataset.bound = '1';
                folderBtn.addEventListener('click', async () => {
                    try {
                        const r = await window.electronAPI.openDataFolder();
                        if (!r || !r.success) showToast(t('errorOpenFolder'), 'error');
                    } catch (_) {
                        showToast(t('errorOpenFolder'), 'error');
                    }
                });
            }
            // Bilgilendirici bildirim kapatılabilir; yeniden çizimde
            // (dil değişimi) kullanıcı kararı korunur.
            const closeBtn = document.getElementById('btn-storage-recovered-close');
            if (closeBtn && !closeBtn.dataset.bound) {
                closeBtn.dataset.bound = '1';
                closeBtn.addEventListener('click', () => {
                    storageRecoveryDismissed = true;
                    renderStorageRecovery();
                });
            }
            console.warn('[Storage] veri kurtarma:', rec);
        } catch (_) { /* tanı opsiyonel */ }
    })();
});
