const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    maximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),

    // Legacy quick timer IPC
    scheduleAction: (args) => ipcRenderer.invoke('schedule-action', args),
    cancelAction: (pin) => ipcRenderer.invoke('cancel-action', pin === undefined ? undefined : { pin }),
    setAutostart: (enable) => ipcRenderer.send('setting-autostart', enable),
    updateMiniTimer: (data) => ipcRenderer.send('update-mini-timer', data),
    hideMiniWidget: () => ipcRenderer.send('hide-mini-widget'),
    restoreMainWindow: () => ipcRenderer.send('restore-main-window'),

    // Comprehensive Tasks API
    getTasks: () => ipcRenderer.invoke('get-tasks'),
    getActiveState: () => ipcRenderer.invoke('get-active-state'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    createTask: (taskData) => ipcRenderer.invoke('create-task', taskData),
    cancelTask: (taskId, pin) => ipcRenderer.invoke('cancel-task', pin === undefined ? taskId : { taskId, pin }),
    snoozeTask: (args) => ipcRenderer.invoke('snooze-task', args),
    // Cancel PIN API (WBS-11.2)
    setCancelPin: (pin) => ipcRenderer.invoke('set-cancel-pin', { pin }),
    clearCancelPin: () => ipcRenderer.invoke('clear-cancel-pin'),
    getCancelPinState: () => ipcRenderer.invoke('get-cancel-pin-state'),

    // History & Stats API
    getHistory: (filter) => ipcRenderer.invoke('get-history', filter),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    getStatistics: () => ipcRenderer.invoke('get-statistics'),

    // Templates API
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    saveTemplate: (tpl) => ipcRenderer.invoke('save-template', tpl),
    deleteTemplate: (templateId) => ipcRenderer.invoke('delete-template', templateId),

    // AI Assistant API (WBS-7.4)
    aiStatus: () => ipcRenderer.invoke('ai-status'),
    aiParse: (text) => ipcRenderer.invoke('ai-parse', text),
    aiDiagnose: (reason) => ipcRenderer.invoke('ai-diagnose', reason),
    aiEnergy: () => ipcRenderer.invoke('ai-energy'),
    aiSuggest: () => ipcRenderer.invoke('ai-suggest'),
    aiDismissSuggestion: (topic) => ipcRenderer.invoke('ai-dismiss-suggestion', topic),
    warningCancel: (pin) => ipcRenderer.invoke('warning-cancel', pin === undefined ? undefined : { pin }),
    warningSnooze: (minutes, pin) => ipcRenderer.invoke('warning-snooze', typeof minutes === 'object' ? minutes : { minutes, pin }),
    warningConfirm: () => ipcRenderer.invoke('warning-confirm'),
    // AI Model API (WBS-7.5)
    aiModelDownload: () => ipcRenderer.invoke('ai-model-download'),
    aiModelLoad: () => ipcRenderer.invoke('ai-model-load'),
    aiModelUnload: () => ipcRenderer.invoke('ai-model-unload'),
    // Voice API (WBS-8.3)
    sttStatus: () => ipcRenderer.invoke('stt-status'),
    sttTranscribe: (payload) => ipcRenderer.invoke('stt-transcribe', payload),
    // Device profiler API (WBS-E3)
    deviceEstimate: () => ipcRenderer.invoke('device-estimate'),

    // Settings & Integrations API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getLocale: (lang) => ipcRenderer.invoke('get-locale', lang),
    reportCspViolation: (data) => ipcRenderer.send('csp-violation', data),
    saveSettings: (newSettings) => ipcRenderer.invoke('save-settings', newSettings),
    // WP-10.T4: güvenlik bayrakları ve API anahtarı PIN gerektirir.
    securitySettingsUpdate: (args) => ipcRenderer.invoke('security-settings-update', args),
    generateApiKey: (args) => ipcRenderer.invoke('generate-api-key', args),
    getWebhooks: () => ipcRenderer.invoke('get-webhooks'),
    saveWebhooks: (webhooks) => ipcRenderer.invoke('save-webhooks', webhooks),
    testWebhook: (hook) => ipcRenderer.invoke('test-webhook', hook),
    sendWakeOnLan: (args) => ipcRenderer.invoke('send-wol', args),

    // Enterprise pilot API (FAZ B/D) — konsol eşleştirme, envanter, denetim
    getInventory: () => ipcRenderer.invoke('get-inventory'),
    getExemptions: () => ipcRenderer.invoke('get-exemptions'),
    getSecurityStatus: () => ipcRenderer.invoke('get-security-status'),
    getAudit: () => ipcRenderer.invoke('get-audit'),
    consoleSync: () => ipcRenderer.invoke('console-sync'),

    // Event listeners
    onTimerCancelled: (callback) => ipcRenderer.on('timer-cancelled-from-tray', callback),
    onWindowStateChanged: (callback) => ipcRenderer.on('window-state-changed', (event, state) => callback(state)),
    onTimerTick: (callback) => ipcRenderer.on('timer-tick', (event, data) => callback(data)),
    // WP-08.T3/T2: gerçek yürütme sonucu ve uykudan dönüş.
    onTaskExecuted: (callback) => ipcRenderer.on('task-executed', (event, data) => callback(data)),
    onTaskFailed: (callback) => ipcRenderer.on('task-failed', (event, data) => callback(data)),
    onSystemResumed: (callback) => ipcRenderer.on('system-resumed', () => callback()),
    onWarningStarted: (callback) => ipcRenderer.on('warning-started', (event, data) => callback(data)),
    onWarningTick: (callback) => ipcRenderer.on('warning-tick', (event, data) => callback(data)),
    // WBS-9.4: Banner kapatma — üç terminal olaydan biri.
    onWarningEnded: (callback) => {
        const h = (event, data) => callback(data);
        ipcRenderer.on('warning-cancelled', h);
        ipcRenderer.on('warning-snoozed', h);
        ipcRenderer.on('warning-finished', h);
    },

    // External link
    openExternal: (url) => ipcRenderer.send('open-external-link', url)
});
