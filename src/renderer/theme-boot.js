/**
 * theme-boot.js — PPX-021
 * İlk boyamadan ÖNCE temayı (mod + 14 renk paleti) ve kenar çubuğu durumunu
 * uygular. CSP `script-src 'self'` uyumu için harici dosya; inline script yok.
 */
(function () {
    'use strict';
    var VALID_THEMES = [
        'obsidian', 'slate', 'navy', 'blue', 'cyan', 'indigo', 'purple',
        'pink', 'red', 'orange', 'yellow', 'emerald', 'grass', 'lime'
    ];
    var mode = 'dark';
    var themeId = 'obsidian';
    var collapsed = false;
    try {
        var savedMode = localStorage.getItem('theme');
        if (savedMode === 'light' || savedMode === 'dark') mode = savedMode;
        var savedId = localStorage.getItem('themeId');
        if (savedId && VALID_THEMES.indexOf(savedId) !== -1) themeId = savedId;
        collapsed = localStorage.getItem('pp-sidebar-collapsed') === 'true';
    } catch (_) { /* depolama kapalı: koyu obsidian varsayılan */ }

    var root = document.documentElement;
    if (mode === 'light') root.classList.remove('dark');
    else root.classList.add('dark');
    root.setAttribute('data-theme', themeId);
    if (collapsed) root.classList.add('sidebar-collapsed');
    else root.classList.remove('sidebar-collapsed');
    window.__ppEarlyTheme = { mode: mode, themeId: themeId, collapsed: collapsed };
})();
