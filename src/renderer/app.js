

        let currentLanguage = (() => {
            let lang = localStorage.getItem('language');
            if (!lang) {
                const sysLang = navigator.language.split('-')[0];
                lang = (window.PPLocale && window.PPLocale.supported.includes(sysLang)) ? sysLang : 'tr';
            }
            return (window.PPLocale && window.PPLocale.supported.includes(lang)) ? lang : 'tr';
        })();

        // Set inside DOMContentLoaded once the view-specific refresh helpers are
        // in scope; applyLanguage() runs before that on some code paths.
        let afterLanguageChange = null;

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
            } catch (e) {}
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
            // Update the HTML class lang attribute
            document.documentElement.setAttribute('lang', lang);
            // WP-14: Arapça sağdan-sola; diğerleri soldan-sağa.
            document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
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
            document.getElementById('btn-maximize').addEventListener('click', () => {
                window.electronAPI.maximizeToggle();
                const icon = document.querySelector('#btn-maximize .material-symbols-outlined');
                if (icon) icon.textContent = icon.textContent === 'crop_square' ? 'filter_none' : 'crop_square';
            });
            document.getElementById('btn-close').addEventListener('click', () => {
                window.electronAPI.close();
            });

            // Navigation
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
                'nav-settings': 'view-settings',
                'nav-about': 'view-about'
            };

            function switchView(navId) {
                // Update active state in sidebar
                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.classList.remove('bg-primary/10', 'text-primary', 'font-medium', 'border', 'border-primary/20');
                    if (btn.id === navId) {
                        btn.classList.add('bg-primary/10', 'text-primary', 'font-medium', 'border', 'border-primary/20');
                    }
                });

                // Show view
                document.querySelectorAll('.view-section').forEach(view => {
                    view.classList.add('hidden');
                });
                const targetView = document.getElementById(navLinks[navId]);
                if (targetView) targetView.classList.remove('hidden');

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
                if (navId === 'nav-assistant' && typeof loadAssistant === 'function') {
                    loadAssistant();
                }
                if (navId === 'nav-integrations' && typeof loadIntegrations === 'function') {
                    loadIntegrations();
                }
                if (navId === 'nav-settings' && typeof settingsRefreshAi === 'function') {
                    settingsRefreshAi();
                    if (typeof startSettingsPoll === 'function' && !setPoll) startSettingsPoll(2000);
                } else if (typeof stopSettingsPoll === 'function') {
                    stopSettingsPoll();
                }
            }

            Object.keys(navLinks).forEach(navId => {
                document.getElementById(navId).addEventListener('click', () => switchView(navId));
            });

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

            // Action Selection
            const actionBtns = document.querySelectorAll('.action-btn');
            actionBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    actionBtns.forEach(b => {
                        b.classList.remove('border-primary');
                        b.classList.add('border-slate-200', 'dark:border-slate-700');
                        b.querySelector('div').classList.remove('bg-primary/10', 'text-primary');
                        b.querySelector('div').classList.add('bg-slate-100', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
                    });

                    const el = e.currentTarget;
                    el.classList.add('border-primary');
                    el.classList.remove('border-slate-200', 'dark:border-slate-700');
                    el.querySelector('div').classList.add('bg-primary/10', 'text-primary');
                    el.querySelector('div').classList.remove('bg-slate-100', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');

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
                        b.classList.remove('bg-white', 'dark:bg-slate-800', 'text-primary', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-700');
                    });

                    const el = e.currentTarget;
                    el.classList.add('bg-white', 'dark:bg-slate-800', 'text-primary', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-700');

                    const minVal = el.dataset.mins;
                    if (minVal !== "custom") {
                        const totalMins = parseInt(minVal);
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
                    const currentLang = localStorage.getItem('language') || 'tr';
                    showToast(t('validTimeAlert'), 'error');
                    return;
                }

                const lang = localStorage.getItem('language') || 'tr';
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
                    el.innerText = st && st.set ? t('pinStateSet') : t('pinStateNotSet');
                } catch (_) { el.innerText = t('pinStateUnknown'); }
            }
            const btnPinSet = document.getElementById('btn-pin-set');
            if (btnPinSet) btnPinSet.addEventListener('click', async () => {
                const pin = document.getElementById('pin-input').value;
                if (!window.electronAPI || !window.electronAPI.setCancelPin) return;
                const res = await window.electronAPI.setCancelPin(pin);
                if (res && res.success === false) {
                    showToast(res.message || t('pinSetFailed'), 'error');
                } else {
                    document.getElementById('pin-input').value = '';
                    showToast(t('pinSetSuccess'), 'success');
                }
                refreshPinState();
            });
            const btnPinClear = document.getElementById('btn-pin-clear');
            if (btnPinClear) btnPinClear.addEventListener('click', async () => {
                if (window.electronAPI && window.electronAPI.clearCancelPin) {
                    await window.electronAPI.clearCancelPin();
                    showToast(t('pinCleared'), 'info');
                }
                refreshPinState();
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

            async function restoreActiveTimer() {
                if (!window.electronAPI || !window.electronAPI.getActiveState) return;
                if (timerTargetTime && Date.now() < timerTargetTime) return;
                try {
                    const state = await window.electronAPI.getActiveState();
                    const now = Date.now();
                    const next = (state && state.tasks ? state.tasks : [])
                        .filter(task => task && task.trigger && task.trigger.targetTime && task.trigger.targetTime > now)
                        .sort((a, b) => a.trigger.targetTime - b.trigger.targetTime)[0];
                    if (!next) return;
                    const created = next.createdAt ? Date.parse(next.createdAt) : now;
                    const total = Math.max(1, Math.ceil((next.trigger.targetTime - (Number.isFinite(created) ? created : now)) / 1000));
                    timerExecutionTaskId = next.id;
                    startTimerTo(next.trigger.targetTime, total);
                } catch (_) { /* salt-okunur; sayaç yoksa başlatma */ }
            }

            // Kademeli uyarı (WBS-11.3): 5dk/1dk toast + 1dk/30sn/10sn bip. Gece sessizliği.
            let stagedMarksFired = {};
            function uiBeep() {
                try {
                    const h = new Date().getHours();
                    if (h >= 22 || h < 8) return;
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
                    o.onended = () => { try { ctx.close(); } catch (_) {} };
                } catch (_) {}
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
                    try { localStorage.setItem('theme', next); } catch (_) {}
                    if (elTheme) elTheme.value = next;
                    applyTheme(next);
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

                const timeLeft = document.getElementById('display-time-left');
                if (d > 0) {
                    const days = document.createElement('span');
                    days.className = 'text-xl text-primary leading-none tracking-normal';
                    days.textContent = `${d}${dict.timeFormatDays.substring(0, 1)}`;
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

                // Update display sentence dynamically (DOM API — HTML sink yok).
                const sentenceEl = document.getElementById('display-timer-sentence');
                if (isCancelledState) {
                    const span = document.createElement('span');
                    span.className = 'text-red-500 font-bold';
                    span.textContent = dict.activeTimerCancelledText || "Timer: Timer cancelled.";
                    sentenceEl.replaceChildren(span);
                } else {
                    const sentence = dict.activeTimerText || "Timer: Computer will be {action} in {time}.";
                    const nodes = [];
                    for (const part of sentence.split(/(\{time\}|\{action\})/)) {
                        if (part === '{time}') {
                            const span = document.createElement('span');
                            span.className = 'text-primary font-bold';
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

                // Update circle (dasharray: 289, dashoffset: 0 to 289)
                const totalSeconds = Number.isFinite(initialTotalSeconds) && initialTotalSeconds > 0
                    ? initialTotalSeconds
                    : 0;
                const pct = totalSeconds > 0
                    ? Math.min(1, Math.max(0, (totalSeconds - secondsRemaining) / totalSeconds))
                    : 0;
                document.getElementById('progress-circle').style.strokeDashoffset = 289 * pct;

                // Sync with miniWindow widget via IPC
                if (secondsRemaining > 0) {
                    let formattedCountdown = "";
                    if (d > 0) formattedCountdown += `${d}${dict.timeFormatDays.substring(0,1)} `;
                    if (h > 0 || d > 0) formattedCountdown += `${h.toString().padStart(2, '0')}:`;
                    formattedCountdown += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                    const actionName = getActionString(selectedAction);

                    if (window.electronAPI && window.electronAPI.updateMiniTimer) {
                        window.electronAPI.updateMiniTimer({
                            secondsRemaining,
                            formattedCountdown,
                            actionText: actionName,
                            action: selectedAction
                        });
                    }
                }

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
                const showNotifs = localStorage.getItem('notifications') !== 'false'; // Default true
                if (!showNotifs) return;

                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');

                // Base styling for toast
                let bgClass = "bg-slate-800 text-white";
                let icon = "info";

                if (type === 'success') {
                    bgClass = "bg-green-600 text-white";
                    icon = "check_circle";
                } else if (type === 'error') {
                    bgClass = "bg-red-600 text-white";
                    icon = "error";
                } else if (type === 'info') {
                    bgClass = "bg-primary text-white";
                    icon = "info";
                }

                toast.className = `flex items-center justify-between gap-3 p-4 rounded-lg shadow-lg ${bgClass} transform transition-all duration-300 translate-y-10 opacity-0 min-w-[300px] border border-white/10`;

                const toastRow = document.createElement('div');
                toastRow.className = 'flex items-center gap-3';
                const toastIcon = document.createElement('span');
                toastIcon.className = 'material-symbols-outlined text-lg';
                toastIcon.textContent = icon;
                const toastText = document.createElement('p');
                toastText.className = 'text-sm font-semibold';
                toastText.textContent = String(message);
                toastRow.append(toastIcon, toastText);
                toast.appendChild(toastRow);

                container.appendChild(toast);

                // Animate in
                setTimeout(() => {
                    toast.classList.remove('translate-y-10', 'opacity-0');
                    toast.classList.add('translate-y-0', 'opacity-100');
                }, 10);

                // Animate out and remove
                setTimeout(() => {
                    toast.classList.remove('translate-y-0', 'opacity-100');
                    toast.classList.add('translate-y-10', 'opacity-0');
                    setTimeout(() => toast.remove(), 300);
                }, 4000);
            }

            // Settings Logic
            const elAutostart = document.getElementById('setting-autostart');
            const elVoice = document.getElementById('setting-voice');
            const elTheme = document.getElementById('setting-theme');
            const elNotifications = document.getElementById('setting-notifications');
            const elLanguage = document.getElementById('setting-language');

            function loadSettings() {
                const autostart = localStorage.getItem('autostart') === 'true';
                const voice = localStorage.getItem('voice') === 'true';
                const theme = localStorage.getItem('theme') || 'dark';
                const notifications = localStorage.getItem('notifications') !== 'false';
                const autonomyMode = localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic';
                
                let language = localStorage.getItem('language');
                if (!language) {
                    const sysLang = navigator.language.split('-')[0];
                    language = (window.PPLocale && window.PPLocale.supported.includes(sysLang)) ? sysLang : 'tr';
                    // First run: keep the main process (tray/menu) in sync with
                    // the language that was detected in the renderer.
                    if (window.electronAPI && window.electronAPI.saveSettings) {
                        window.electronAPI.saveSettings({ language }).catch(() => {});
                    }
                }

                if (elAutostart) elAutostart.checked = autostart;
                if (elVoice) elVoice.checked = voice;
                if (typeof loadEnergyCard === 'function') loadEnergyCard();
                if (typeof refreshPinState === 'function') refreshPinState();
                const modeRadio = document.querySelector('input[name="autonomyMode"][value="' + autonomyMode + '"]');
                if (modeRadio) modeRadio.checked = true;
                if (elTheme) elTheme.value = theme;
                if (elNotifications) elNotifications.checked = notifications;
                if (elLanguage) elLanguage.value = language;

                applyTheme(theme);
                applyLanguage(language);
            }

            // Smart Finish Task Creation (WBS-6.1/6.2: 7 koşul + çoklu kurucu + saat)
            const SF_TYPE_CONFIG = {
                process_running: { label: t('sfProcessNameLabel'), placeholder: 'handbrake.exe', kind: 'text', extra: 'onclose' },
                cpu_usage: { label: t('sfCpuThreshold'), placeholder: '10', kind: 'number', extra: 'none' },
                user_idle: { label: t('sfIdleSeconds'), placeholder: '300', kind: 'number', extra: 'none' },
                network_speed: { label: t('sfNetworkThreshold'), placeholder: '50', kind: 'number', extra: 'none' },
                disk_activity: { label: t('sfDiskThreshold'), placeholder: '100', kind: 'number', extra: 'none' },
                battery_level: { label: t('sfBatteryLevel'), placeholder: '20', kind: 'number', extra: 'direction' },
                file_stable: { label: t('sfFilePath'), placeholder: 'C:\\Yedekler', kind: 'text', extra: 'seconds' }
            };
            let sfConditions = [];

            function onSfTypeChange() {
                const type = document.getElementById('sf-condition-type').value;
                const cfg = SF_TYPE_CONFIG[type] || SF_TYPE_CONFIG.process_running;
                document.getElementById('sf-value-label').innerText = cfg.label;
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
                    chip.className = 'inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold';
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

            const btnSaveSf = document.getElementById('btn-save-sf-task');
            if (btnSaveSf) {
                btnSaveSf.addEventListener('click', async () => {
                    const action = document.getElementById('sf-action').value;
                    const timeVal = document.getElementById('sf-time').value;
                    // WBS-11.1: Opsiyonel zincir halkası (tek halka; dahası API/CLI ile).
                    const chainAction = document.getElementById('sf-chain-action').value;
                    const chainDelay = parseInt(document.getElementById('sf-chain-delay').value, 10);
                    const chain = (chainAction && Number.isInteger(chainDelay) && chainDelay >= 1 && chainDelay <= 43200)
                        ? [{ action: chainAction, delayMinutes: chainDelay }]
                        : undefined;
                    let taskData;
                    if (timeVal) {
                        // Saat seçiliyse koşul izlenmez — belirtilen saatte çalışır (dürüst anlam).
                        const targetTime = nextOccurrence(timeVal);
                        if (!targetTime) { showToast(t('errorInvalidTime'), 'error'); return; }
                        taskData = {
                            name: `Scheduled (${action} @ ${timeVal})`,
                            action, source: 'user_interface',
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
                            action, source: 'user_interface',
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
            // WP-13.T7: küme değişmediyse yalnızca süre hücreleri güncellenir.
            let lastTaskRenderSignature = '';

            function isTaskActive(task) {
                return TASK_ACTIVE_STATUSES.has(task.status) && task.enabled !== false;
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
                if (task.source === 'user_interface') {
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
                    status.className = 'shrink-0 text-[10px] uppercase tracking-wide text-primary';
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
                if (!window.electronAPI || !window.electronAPI.getTasks) return;
                const tbody = document.getElementById('tasks-table-body');
                const empty = document.getElementById('tasks-empty');
                const error = document.getElementById('tasks-error');
                if (!tbody) return;
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
                    if (empty) {
                        empty.classList.toggle('hidden', list.length !== 0);
                        empty.innerText = t('tasksEmpty');
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
                        const statusClass = active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
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
                            cell(describeTaskTrigger(task), 'p-3 text-xs text-slate-500'),
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
                            cancel.className = 'btn-task-cancel px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[11px] font-bold';
                            cancel.textContent = t('taskCancel');
                            cancel.addEventListener('click', () => cancelTaskFromList(task.id));
                            actionCell.append(snooze, cancel);
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
                        b.classList.toggle('text-slate-500', !on);
                    });
                    loadTasks();
                });
            });
            const btnRefreshTasks = document.getElementById('btn-refresh-tasks');
            if (btnRefreshTasks) btnRefreshTasks.addEventListener('click', loadTasks);
            // Keep the "next run" column fresh while the view is open.
            tasksRefreshTimer = setInterval(() => {
                const view = document.getElementById('view-tasks');
                if (view && !view.classList.contains('hidden')) loadTasks();
            }, 5000);
            window.addEventListener('beforeunload', () => {
                if (tasksRefreshTimer) clearInterval(tasksRefreshTimer);
                tasksRefreshTimer = null;
                if (typeof stopSettingsPoll === 'function') stopSettingsPoll();
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

            function resultLabel(code) {
                if (code === 'success') return t('resultSuccess');
                if (code === 'cancelled') return t('resultCancelled');
                if (code === 'failed') return t('resultFailed');
                return code || '—';
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
                            icon.className = 'material-symbols-outlined text-primary text-xl';
                            icon.textContent = tpl.icon || 'widgets';
                            const heading = document.createElement('h4');
                            heading.className = 'font-bold text-slate-900 dark:text-white text-sm';
                            heading.textContent = name;
                            titleRow.append(icon, heading);
                            if (tpl.custom) {
                                const badge = document.createElement('span');
                                badge.className = 'text-[10px] font-bold text-amber-500 border border-amber-500/40 rounded px-1.5 py-0.5';
                                badge.textContent = t('badgeCustom');
                                titleRow.appendChild(badge);
                            }
                            const desc = document.createElement('p');
                            desc.className = 'text-xs text-slate-500 mb-4';
                            desc.textContent = description;
                            top.append(titleRow, desc);

                            const footer = document.createElement('div');
                            footer.className = 'flex gap-2';
                            const use = document.createElement('button');
                            use.className = 'flex-1 px-4 py-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 rounded-lg text-xs font-bold transition-all text-center disabled:cursor-default';
                            use.textContent = t('templateUse');
                            use.disabled = Boolean(tpl.disabled);
                            if (tpl.disabled) use.title = tpl.disabledReason || t('templateUnavailable');
                            use.addEventListener('click', () => applyTemplate(tpl));
                            footer.appendChild(use);
                            if (tpl.custom) {
                                const del = document.createElement('button');
                                del.className = 'px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all';
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
                    }
                }
            }

            // Load History
            async function loadHistory() {
                if (window.electronAPI && window.electronAPI.getHistory) {
                    let list;
                    try {
                        list = await window.electronAPI.getHistory();
                    } catch (_) {
                        list = null;
                    }
                    if (!Array.isArray(list)) list = [];
                    const tbody = document.getElementById('history-table-body');
                    if (tbody) {
                        if (list.length === 0) {
                            const row = document.createElement('tr');
                            const td = document.createElement('td');
                            td.colSpan = 5;
                            td.className = 'p-4 text-center text-xs text-slate-400';
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
                                badge.className = 'px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold';
                                badge.textContent = h.outcome || '';
                                badgeCell.appendChild(badge);
                                row.append(
                                    cell(new Date(h.timestamp).toLocaleTimeString(getCurrentLanguage()), 'p-3 text-xs text-slate-400'),
                                    cell(`AI:${h.agentId || '?'}`, 'p-3 text-xs font-bold'),
                                    cell(h.intent || '', 'p-3 text-xs'),
                                    cell('ai_assistant', 'p-3 text-xs text-slate-400'),
                                    badgeCell
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
                                cell(new Date(h.timestamp).toLocaleTimeString(getCurrentLanguage()), 'p-3 text-xs text-slate-400'),
                                cell(localizedTaskName(h.taskName, h.action), 'p-3 text-xs font-bold'),
                                cell(getActionString(h.action), 'p-3 text-xs'),
                                cell(sourceLabel(h.source), 'p-3 text-xs text-slate-400'),
                                resultCell
                            );
                            return row;
                        });
                        tbody.replaceChildren(...rows);
                    }
                }
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
                            try { seen = localStorage.getItem('pp-stats-hint-shown') === '1'; } catch (_) {}
                            if (!seen) {
                                try { localStorage.setItem('pp-stats-hint-shown', '1'); } catch (_) {}
                                showToast(t('energyLinesIncomplete'), 'info');
                            }
                        }
                    }
                }
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
                    badge.className = 'text-xs font-bold text-green-500';
                } else {
                    badge.innerText = t('apiOff');
                    badge.className = 'text-xs font-bold text-slate-400';
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
                    empty.className = 'text-xs text-slate-400';
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
                    sub.className = 'text-[11px] text-slate-400 truncate font-mono';
                    sub.textContent = h.url + (h.hasSecret ? t('webhookSecretSaved') : '');
                    left.appendChild(title);
                    left.appendChild(sub);
                    const btns = document.createElement('div');
                    btns.className = 'flex gap-1 shrink-0';
                    const bTest = document.createElement('button');
                    bTest.className = 'px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 rounded';
                    bTest.textContent = t('test');
                    bTest.addEventListener('click', async () => {
                        if (window.electronAPI && window.electronAPI.testWebhook) {
                            const res = await window.electronAPI.testWebhook(h);
                            showToast((res && (res.message || res.error)) || t('toastWebhookTestSent'), (res && res.success) ? 'success' : 'error');
                        }
                    });
                    const bDel = document.createElement('button');
                    bDel.className = 'px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-500/10 rounded';
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
                    lab.className = 'flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded cursor-pointer';
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
                        line.className = 'text-xs text-green-500 mb-4';
                    } else if (st.code === 'MODEL_MISSING') {
                        line.innerText = t('aiModelNotDownloaded');
                        line.className = 'text-xs text-amber-500 mb-4';
                    } else {
                        line.innerText = st.message || t('aiNotReady');
                        line.className = 'text-xs text-slate-400 mb-4';
                    }
                } catch (_) {
                    line.innerText = t('aiStatusUnknown');
                }
            }

            function renderAiResult() {
                const box = document.getElementById('ai-result');
                if (!box) return;
                box.replaceChildren();
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
                desc.className = 'text-xs text-slate-500';
                desc.textContent = aiProposal.detail || '';
                const row = document.createElement('div');
                row.className = 'flex gap-2';
                const bCreate = document.createElement('button');
                bCreate.className = 'flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90';
                bCreate.textContent = t('install');
                bCreate.addEventListener('click', async () => {
                    if (window.electronAPI && window.electronAPI.createTask) {
                        // WBS-9.4: Damga kuruluşta vurulur (varsayılan classic).
                        let mode = 'classic';
                        try { if (localStorage.getItem('autonomyMode') === 'full') mode = 'full'; } catch (_) {}
                        const res = await window.electronAPI.createTask({ ...aiProposal.task, mode });
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
                bEdit.className = 'flex-1 py-2 bg-primary/20 border border-primary/50 text-primary text-xs font-bold rounded-lg hover:bg-primary/30';
                bEdit.textContent = t('edit');
                bEdit.addEventListener('click', () => { aiEditProposal(); });
                const bCancel = document.createElement('button');
                bCancel.className = 'px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600';
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
                } catch (_) {}
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
                    const lang = (typeof currentLanguage === 'string' ? currentLanguage : null) || localStorage.getItem('language') || 'tr';
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
                        stEl.textContent = 'Dinleniyor... (sessizlikte durur, en fazla 15sn)';
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
                            } catch (_) {}
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
                } catch (_) {}
            }

            // Setup Wizard (WBS-7.5) — bir kez gösterilir, Atla her zaman mümkün.
            let wzStep = 1;
            let wzPoll = null;
            let wzClock = null;
            // AI indirme canlı-ilerleme durumu (yalnızca arayüz katmanı).
            let wzDlActive = false;
            let wzDlFailed = false;
            let wzSample = null; // { t, bytes } — hız/ETA hesabı için
            let wzSpeed = 0; // bayt/sn (yumuşatılmış)

            // Anket hızı: indirme sürerken 500ms (canlı animasyon), yoksa 2sn.
            function wzSetPoll(ms) {
                if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
                wzPoll = setInterval(wizardRefreshAi, ms);
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
                const s = speed === undefined ? wzSpeed : speed;
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
                    b.className = DL_BASE + 'bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 cursor-pointer disabled:cursor-wait';
                    setSpinnerText(b, t('downloading'));
                } else if (mode === 'ready') {
                    b.disabled = true;
                    b.className = DL_BASE + 'bg-green-500/15 text-green-400 border border-green-500/40 disabled:cursor-default';
                    b.textContent = t('packageReady');
                } else if (mode === 'resume') {
                    // Yarım kalan paket: buton eksik parçayı söyler, tek basış kaldığı yerden devam eder.
                    b.disabled = false;
                    b.className = DL_BASE + 'bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 cursor-pointer disabled:cursor-default';
                    b.textContent = label || t('downloadRemaining');
                } else {
                    b.disabled = false;
                    b.className = DL_BASE + 'bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 cursor-pointer disabled:cursor-default';
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
                    b.className = LOAD_BASE + 'bg-red-500/10 text-red-500 border border-red-500/40 hover:bg-red-500/20 cursor-pointer';
                    b.textContent = t('disableAi');
                    b.dataset.aiState = 'loaded';
                } else {
                    b.disabled = false;
                    b.className = LOAD_BASE + 'bg-primary text-white hover:bg-primary/90';
                    b.textContent = t('enableAi');
                    b.dataset.aiState = 'idle';
                }
            }

            function paintWizardDots() {
                document.querySelectorAll('#wz-dots [data-dot]').forEach(d => {
                    const active = parseInt(d.getAttribute('data-dot'), 10) <= wzStep;
                    d.className = 'h-1.5 flex-1 rounded-full ' + (active ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700');
                });
                [1, 2, 3].forEach(n => {
                    document.getElementById('wz-step-' + n).classList.toggle('hidden', n !== wzStep);
                });
                document.getElementById('btn-wz-back').style.visibility = wzStep === 1 ? 'hidden' : 'visible';
                document.getElementById('btn-wz-next').classList.toggle('hidden', wzStep === 3);
                document.getElementById('btn-wz-finish').classList.toggle('hidden', wzStep !== 3);
            }

            function wizardDone() {
                try { localStorage.setItem('pp-wizard-done', '1'); } catch (_) {}
                document.getElementById('wizard-overlay').classList.add('hidden');
                if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
                if (wzClock) { clearInterval(wzClock); wzClock = null; }
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
                    const dl = st.download || { state: 'idle' };
                    const bar = document.getElementById('wz-progress-bar');
                    const txt = document.getElementById('wz-progress-text');
                    const wrap = document.getElementById('wz-progress-wrap');
                    const bothPresent = !!(st.model && st.model.present && st.stt && st.stt.present);

                    // Canlı indirme: ai-status.download içinden dosya-adım ilerleme.
                    if (dl.state === 'running') {
                        if (!wzDlActive) {
                            wzDlActive = true;
                            wzDlFailed = false;
                            wzSample = null;
                            wzSpeed = 0;
                            wzSetDownloadBtn('downloading');
                        }
                        wzSetPoll(500);
                        wrap.classList.remove('hidden');
                        bar.classList.add('pp-stripes');
                        const now = Date.now();
                        const got = dl.received || 0;
                        if (wzSample && got > wzSample.bytes) {
                            const dt = (now - wzSample.t) / 1000;
                            if (dt > 0) {
                                const inst = (got - wzSample.bytes) / dt;
                                wzSpeed = wzSpeed > 0 ? wzSpeed * 0.6 + inst * 0.4 : inst;
                            }
                        }
                        wzSample = { t: now, bytes: got };
                        const stepLabel = dl.step === 2 ? t('wizardStepVoice') : t('wizardStepLanguage');
                        if (dl.total > 0) {
                            const pct = Math.min(99, Math.round((got / dl.total) * 100));
                            bar.style.width = pct + '%';
                            txt.innerText = `${stepLabel}: %${pct} (${wzFmtMb(got)}/${wzFmtMb(dl.total)}${wzFmtSpeed(wzSpeed)}${wzFmtEta(got, dl.total)})`;
                        } else {
                            txt.innerText = `${stepLabel}: ${t('wizardDownloadedAmount', { amount: wzFmtMb(got) })}${wzFmtSpeed(wzSpeed)}…`;
                        }
                        line.innerText = t('wizardAiDownloading');
                        return;
                    }

                    // İndirme bitimi / hatası: buton durumunu toparla.
                    if (wzDlActive) {
                        wzDlActive = false;
                        bar.classList.remove('pp-stripes');
                        if (dl.state === 'failed') {
                            wzDlFailed = true;
                            wzSetDownloadBtn('idle');
                            wzSetPoll(2000);
                            line.innerText = t('wizardDownloadFailed', { error: dl.error || t('unknownError') });
                            if (window.showToast) showToast(dl.error || t('errorAiDownloadFailed'), 'error');
                            return;
                        }
                    }

                    if (st.loaded) {
                        line.innerText = t('wizardAiReadyRam', { model: st.modelId || 'model', ram: st.ramGb != null ? st.ramGb + 'GB' : '?' });
                        line.classList.remove('text-slate-500');
                        line.classList.add('text-green-500');
                        wzSetDownloadBtn('ready');
                        if (!wzLoadBusy) wzSetLoadBtn(true);
                    } else {
                        line.classList.remove('text-green-500');
                        line.classList.add('text-slate-500');
                        if (!wzLoadBusy) wzSetLoadBtn(false);
                        if (bothPresent) {
                            line.innerText = t('wizardBothModels');
                            wzSetDownloadBtn('ready');
                        } else if (st.model && st.model.present) {
                        line.innerText = t('wizardLangReady');
                        wzSetDownloadBtn('resume', undefined, t('downloadRemainingStt'));
                    } else if (st.stt && st.stt.present) {
                        line.innerText = t('wizardSttReady');
                        wzSetDownloadBtn('resume', undefined, t('downloadRemainingLlm'));
                    } else {
                        const done = st.model && st.model.partialBytes > 0 ? t('wizardPartial', { mb: Math.round(st.model.partialBytes / 1048576) }) : '';
                        const sttDone = st.stt && st.stt.present ? t('wizardVoiceDone') : '';
                        line.innerText = t('wizardModelMissing', { extra: done, stt: sttDone });
                        if (!wzDlFailed) wzSetDownloadBtn('idle');
                    }
                    } // else (yüklü değil) sonu
                    // Yarım kalan önceki indirme (diskten okunur) — bilgi amaçlı bar.
                    if (bothPresent) {
                        wrap.classList.add('hidden');
                        if (wzPoll) { clearInterval(wzPoll); wzPoll = null; }
                    } else if (st.model && (st.model.present || st.model.partialBytes > 0)) {
                        wrap.classList.remove('hidden');
                        const total = 1374389534; // ~1.28GB hedef (bilgi amaçlı)
                        const got = (st.model.present ? st.model.bytes : 0) + (st.model.partialBytes || 0);
                        const pct = Math.min(100, Math.round((got / total) * 100));
                        bar.style.width = pct + '%';
                        txt.innerText = st.model.present && !st.stt.present
                            ? t('wizardProgressVoiceMissing', { pct, mb: Math.round(got / 1048576) })
                            : t('wizardProgressGeneric', { pct, mb: Math.round(got / 1048576) });
                    } else if (!wzDlActive) {
                        wrap.classList.add('hidden');
                    }
                } catch (_) { line.innerText = t('aiStatusUnknown'); }
            }

            function wizardMaybeShow() {
                let done = null;
                try { done = localStorage.getItem('pp-wizard-done'); } catch (_) {}
                if (done) return;
                try {
                    const sys = (navigator.language || 'tr').split('-')[0];
                    const sel = document.getElementById('wz-lang');
                    if (sel.querySelector(`option[value="${sys}"]`)) {
                        sel.value = sys;
                    } else {
                        // Desteklenmeyen sistem dili → evrensel varsayılan İngilizce
                        // (listenin ilk sırasındaki Türkçe'ye düşmek yerine).
                        sel.value = 'en';
                    }
                } catch (_) {}
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
                        try { localStorage.setItem('language', lang); } catch (_) {}
                        if (typeof applyLanguage === 'function') await applyLanguage(lang);
                        if (window.electronAPI && window.electronAPI.saveSettings) {
                            window.electronAPI.saveSettings({ language: lang }).catch(() => {});
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
                        if (window.electronAPI && window.electronAPI.saveSettings && Object.keys(patch).length > 0) {
                            const res = await window.electronAPI.saveSettings(patch);
                            if (res && res.success === false) {
                                showToast(res.message || t('errorSaveFailed'), 'error');
                                return;
                            }
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
            if (btnWzSkip) btnWzSkip.addEventListener('click', wizardDone);
            const btnWzFinish = document.getElementById('btn-wz-finish');
            if (btnWzFinish) btnWzFinish.addEventListener('click', wizardDone);
            const btnWzDl = document.getElementById('btn-wz-download');
            if (btnWzDl) {
                btnWzDl.addEventListener('click', async () => {
                    if (wzDlActive || btnWzDl.disabled) return; // çift-tık koruması
                    if (window.electronAPI && window.electronAPI.aiModelDownload) {
                        // Anında geri bildirim: buton + animasyonlu bar, sonra hızlı anket.
                        wzDlActive = true;
                        wzDlFailed = false;
                        wzSample = null;
                        wzSpeed = 0;
                        wzSetDownloadBtn('downloading');
                        document.getElementById('wz-progress-wrap').classList.remove('hidden');
                        document.getElementById('wz-progress-bar').classList.add('pp-stripes');
                        document.getElementById('wz-progress-text').innerText = t('connecting');
                        const res = await window.electronAPI.aiModelDownload();
                        if (res && res.started === false) {
                            wzDlActive = false;
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
                                else showToast((res && (res.error || res.code)) || t('errorCouldNotClose'), 'error');
                            } else if (res && res.loaded) showToast(t('toastAiEnabled'), 'success');
                            else if (res && res.code === 'ALREADY_LOADING') showToast(t('errorModelLoading'), 'info');
                            else showToast((res && (res.error || res.code)) || t('errorDownloadFirst'), 'error');
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
            // Sihirbazla aynı IPC + aynı ilerleme gösterimi; bağımsız anketli.
            let setPoll = null;
            let setDlActive = false;
            let setSample = null;
            let setSpeed = 0;

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
                if (setPoll) { clearInterval(setPoll); setPoll = null; }
                setPoll = setInterval(settingsRefreshAi, ms);
            }

            function stopSettingsPoll() {
                if (setPoll) { clearInterval(setPoll); setPoll = null; }
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
                    const dl = st.download || { state: 'idle' };
                    const bothPresent = !!(st.model && st.model.present && st.stt && st.stt.present);

                    if (dl.state === 'running') {
                        if (!setDlActive) {
                            setDlActive = true;
                            setSample = null;
                            setSpeed = 0;
                            wzSetDownloadBtn('downloading', els.btnDl);
                        }
                        startSettingsPoll(500);
                        els.wrap.classList.remove('hidden');
                        els.bar.classList.add('pp-stripes');
                        const now = Date.now();
                        const got = dl.received || 0;
                        if (setSample && got > setSample.bytes) {
                            const dt = (now - setSample.t) / 1000;
                            if (dt > 0) {
                                const inst = (got - setSample.bytes) / dt;
                                setSpeed = setSpeed > 0 ? setSpeed * 0.6 + inst * 0.4 : inst;
                            }
                        }
                        setSample = { t: now, bytes: got };
                        const stepLabel = dl.step === 2 ? t('wizardStepVoice') : t('wizardStepLanguage');
                        if (dl.total > 0) {
                            const pct = Math.min(99, Math.round((got / dl.total) * 100));
                            els.bar.style.width = pct + '%';
                            els.txt.innerText = `${stepLabel}: %${pct} (${wzFmtMb(got)}/${wzFmtMb(dl.total)}${wzFmtSpeed(setSpeed)}${wzFmtEta(got, dl.total, setSpeed)})`;
                        } else {
                            els.txt.innerText = `${stepLabel}: ${t('wizardDownloadedAmount', { amount: wzFmtMb(got) })}${wzFmtSpeed(setSpeed)}…`;
                        }
                        els.line.innerText = t('wizardDownloadingBackground');
                        return;
                    }

                    if (setDlActive) {
                        setDlActive = false;
                        els.bar.classList.remove('pp-stripes');
                        if (dl.state === 'failed') {
                            wzSetDownloadBtn('idle', els.btnDl);
                            startSettingsPoll(2000);
                            els.line.innerText = t('wizardDownloadFailed', { error: dl.error || t('unknownError') });
                            if (window.showToast) showToast(dl.error || t('errorAiDownloadFailed'), 'error');
                            return;
                        }
                    }

                    if (st.loaded) {
                        els.line.innerText = t('wizardAiReadyRam', { model: st.modelId || 'model', ram: st.ramGb != null ? st.ramGb + 'GB' : '?' });
                        els.line.classList.remove('text-slate-500');
                        els.line.classList.add('text-green-500');
                        wzSetDownloadBtn('ready', els.btnDl);
                        if (!setLoadBusy) wzSetLoadBtn(true, els.btnLoad);
                    } else {
                        els.line.classList.remove('text-green-500');
                        els.line.classList.add('text-slate-500');
                        if (!setLoadBusy) wzSetLoadBtn(false, els.btnLoad);
                        if (bothPresent) {
                        els.line.innerText = t('wizardBothModels');
                        wzSetDownloadBtn('ready', els.btnDl);
                    } else if (st.model && st.model.present) {
                        els.line.innerText = t('wizardLangReady');
                        wzSetDownloadBtn('resume', els.btnDl, t('downloadRemainingStt'));
                    } else if (st.stt && st.stt.present) {
                        els.line.innerText = t('wizardSttReady');
                        wzSetDownloadBtn('resume', els.btnDl, t('downloadRemainingLlm'));
                    } else {
                        const done = st.model && st.model.partialBytes > 0 ? t('wizardPartial', { mb: Math.round(st.model.partialBytes / 1048576) }) : '';
                        const sttDone = st.stt && st.stt.present ? t('wizardVoiceDone') : '';
                        els.line.innerText = t('wizardModelMissing', { extra: done, stt: sttDone });
                        wzSetDownloadBtn('idle', els.btnDl);
                    }
                    } // else (yüklü değil) sonu
                    if (bothPresent) {
                        els.wrap.classList.add('hidden');
                    } else if (st.model && (st.model.present || st.model.partialBytes > 0)) {
                        els.wrap.classList.remove('hidden');
                        const total = 1374389534;
                        const got = (st.model.present ? st.model.bytes : 0) + (st.model.partialBytes || 0);
                        const pct = Math.min(100, Math.round((got / total) * 100));
                        els.bar.style.width = pct + '%';
                        els.txt.innerText = t('wizardProgressGeneric', { pct, mb: Math.round(got / 1048576) });
                    } else if (!setDlActive) {
                        els.wrap.classList.add('hidden');
                    }
                } catch (_) { els.line.innerText = t('aiStatusUnknown'); }
            }

            const btnSetDl = document.getElementById('btn-set-ai-download');
            if (btnSetDl) {
                btnSetDl.addEventListener('click', async () => {
                    if (setDlActive || btnSetDl.disabled) return;
                    if (window.electronAPI && window.electronAPI.aiModelDownload) {
                        setDlActive = true;
                        setSample = null;
                        setSpeed = 0;
                        wzSetDownloadBtn('downloading', btnSetDl);
                        setAiEls().wrap.classList.remove('hidden');
                        setAiEls().bar.classList.add('pp-stripes');
                        setAiEls().txt.innerText = t('connecting');
                        const res = await window.electronAPI.aiModelDownload();
                        if (res && res.started === false) {
                            setDlActive = false;
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
                                else showToast((res && (res.error || res.code)) || t('errorCouldNotClose'), 'error');
                            } else if (res && res.loaded) showToast(t('toastAiEnabled'), 'success');
                            else if (res && res.code === 'ALREADY_LOADING') showToast(t('errorModelLoading'), 'info');
                            else showToast((res && (res.error || res.code)) || t('errorDownloadFirst'), 'error');
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
                    const remaining = Math.max(1, Math.round((timer.trigger.targetTime - Date.now()) / 1000));
                    selectedAction = timer.action;
                    currentActionString = getActionString(timer.action);
                    startTimer(remaining);
                    switchView('nav-active');
                } catch (_) { /* geri yükleme başarısızsa boş durum gösterilir */ }
            }
            restoreActiveState();

            // Warning banner wiring (WBS-9.4)
            function hideWarningBanner() {
                document.getElementById('warning-banner').classList.add('hidden');
            }
            if (window.electronAPI && window.electronAPI.onWarningStarted) {
                window.electronAPI.onWarningStarted((data) => {
                    const b = document.getElementById('warning-banner');
                    if (!b || !data) return;
                    document.getElementById('warning-banner-text').textContent = `${localizedTaskName(data.taskName, data.action)} — ${getActionString(data.action)}`;
                    document.getElementById('warning-banner-count').textContent = (data.secondsLeft != null ? t('secondsShort', { seconds: data.secondsLeft }) : '');
                    b.classList.remove('hidden');
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
                        done: () => hideWarningBanner()
                    });
                    paintPinError(res);
                    return;
                }
                hideWarningBanner();
            });
            const btnWarnSnooze = document.getElementById('btn-warn-snooze');
            if (btnWarnSnooze) btnWarnSnooze.addEventListener('click', async () => {
                if (!window.electronAPI.warningSnooze) return;
                const res = await window.electronAPI.warningSnooze(10);
                if (isPinChallenge(res)) {
                    requestPin(t('warnSnoozePinPrompt'), {
                        run: (pin) => window.electronAPI.warningSnooze(10, pin),
                        done: () => hideWarningBanner()
                    });
                    paintPinError(res);
                    return;
                }
                hideWarningBanner();
            });
            const btnWarnNow = document.getElementById('btn-warn-now');
            if (btnWarnNow) btnWarnNow.addEventListener('click', async () => {
                if (window.electronAPI.warningConfirm) await window.electronAPI.warningConfirm();
                hideWarningBanner();
            });

            // AI hızlı eylemler: teşhis / enerji / öneri (F9.2-9.3).
            function aiInfoCard(title, body, buttons) {
                const box = document.getElementById('ai-result');
                box.replaceChildren();
                const card = document.createElement('div');
                card.className = 'p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2';
                const titleEl = document.createElement('p');
                titleEl.className = 'text-sm font-bold';
                titleEl.textContent = title;
                const b = document.createElement('p');
                b.className = 'text-xs text-slate-500';
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
                        [t('dontSuggestAgain'), 'px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600', async () => {
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
                } catch (_) {}
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
                    document.getElementById('nrg-watt').value = '';
                    document.getElementById('nrg-price').value = '';
                    nrgPendingSource = null;
                    showToast(t('clearedPressSave'), 'info');
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
                    const ip = document.getElementById('wol-ip').value || '255.255.255.255';
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

            function applyTheme(theme) {
                if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }

            document.getElementById('btn-settings-save').addEventListener('click', async () => {
                const previous = {
                    autostart: localStorage.getItem('autostart') === 'true',
                    voice: localStorage.getItem('voice') === 'true',
                    theme: localStorage.getItem('theme') || 'dark',
                    notifications: localStorage.getItem('notifications') !== 'false',
                    language: getCurrentLanguage(),
                    autonomyMode: localStorage.getItem('autonomyMode') === 'full' ? 'full' : 'classic'
                };
                const autostart = elAutostart.checked;
                const language = elLanguage.value;
                const modeEl = document.querySelector('input[name="autonomyMode"]:checked');
                const autonomyMode = modeEl && modeEl.value === 'full' ? 'full' : 'classic';

                const restoreForm = async () => {
                    elAutostart.checked = previous.autostart;
                    if (elVoice) elVoice.checked = previous.voice;
                    elTheme.value = previous.theme;
                    elNotifications.checked = previous.notifications;
                    if (elLanguage) elLanguage.value = previous.language;
                    const oldMode = document.querySelector(`input[name="autonomyMode"][value="${previous.autonomyMode}"]`);
                    if (oldMode) oldMode.checked = true;
                    applyTheme(previous.theme);
                    if (getCurrentLanguage() !== previous.language) await applyLanguage(previous.language);
                };

                if (!window.electronAPI || !window.electronAPI.saveSettings) return;
                const energy = readEnergyPatch();
                if (energy.error) {
                    showToast(energy.error, 'error');
                    return;
                }
                const commit = async () => {
                    localStorage.setItem('autostart', autostart);
                    localStorage.setItem('voice', elVoice ? elVoice.checked : false);
                    localStorage.setItem('theme', elTheme.value);
                    localStorage.setItem('notifications', elNotifications.checked);
                    localStorage.setItem('language', language);
                    localStorage.setItem('autonomyMode', autonomyMode);
                    applyTheme(elTheme.value);
                    await applyLanguage(language);
                    if (window.electronAPI.setAutostart) window.electronAPI.setAutostart(autostart);
                    showToast(t('toastSettingsSaved'), 'success');
                };

                // T-REN-05: sunucu reddederse localStorage ve form eski değerde kalır.
                const res = await window.electronAPI.saveSettings({ language, ...energy.patch });
                if (res && res.success === false) {
                    await restoreForm();
                    showToast(res.message || t('errorModeSave'), 'error');
                    return;
                }
                if (typeof loadEnergyCard === 'function') loadEnergyCard();
                // WP-10.T4: otonomi modu güvenlik bayrağıdır; PIN'li yoldan yazılır.
                const sec = await saveSecuritySettings({ autonomyMode }, commit, {
                    quiet: true,
                    onCancel: restoreForm
                });
                if (sec && sec.success === false && !sec.pendingPin) {
                    await restoreForm();
                    showToast(sec.message || t('errorModeSave'), 'error');
                    return;
                }
                if (sec && sec.pendingPin) return;
            });

            document.getElementById('btn-settings-default').addEventListener('click', () => {
                elAutostart.checked = false;
                if (elVoice) elVoice.checked = false;
                const classicRadio = document.querySelector('input[name="autonomyMode"][value="classic"]');
                if (classicRadio) classicRadio.checked = true;
                elTheme.value = 'dark';
                elNotifications.checked = true;

                const sysLang = navigator.language.split('-')[0];
                const defaultLang = (window.PPLocale && window.PPLocale.supported.includes(sysLang)) ? sysLang : 'tr';
                elLanguage.value = defaultLang;

                const currentLang = localStorage.getItem('language') || defaultLang;
                showToast(t('toastDefaultsLoaded'), 'info');
            });


            // ── Legal Modals ──
            function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
            function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

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
            document.getElementById('btn-report-content').addEventListener('click', () => {
                if (window.electronAPI && window.electronAPI.openExternal) {
                    // WP-10.T2: dış bağlantılar yalnızca https allowlist'inden geçer.
                    window.electronAPI.openExternal('https://vellium.dev');
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
                }).catch(() => {});
            }

            // WP-10.T3: inline onclick yerine delege edilmiş step kontrolleri.
            document.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('[data-pp-step]') : null;
                if (!btn) return;
                const target = document.getElementById(btn.getAttribute('data-pp-target') || '');
                if (!target || typeof target.stepUp !== 'function') return;
                if (btn.getAttribute('data-pp-step') === 'up') target.stepUp();
                else target.stepDown();
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
            if (window.electronAPI && window.electronAPI.onSystemResumed) {
                window.electronAPI.onSystemResumed(resyncTimer);
            }
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) resyncTimer();
            });
            window.addEventListener('focus', resyncTimer);
            window.addEventListener('pageshow', resyncTimer);

            // Initial Load
            loadSettings();
            restoreActiveTimer();
        });
    