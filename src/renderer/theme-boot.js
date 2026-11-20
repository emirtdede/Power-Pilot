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
    var VALID_ICONS = [
        'monochrome-dark', 'monochrome-light', 'monochrome-contrast', 'classic-cyan'
    ];
    var mode = 'dark';
    var themeId = 'obsidian';
    var appIcon = 'monochrome-dark';
    var collapsed = false;
    try {
        var savedMode = localStorage.getItem('theme');
        if (savedMode === 'light' || savedMode === 'dark') mode = savedMode;
        var savedId = localStorage.getItem('themeId');
        if (savedId && VALID_THEMES.indexOf(savedId) !== -1) themeId = savedId;
        var savedIcon = localStorage.getItem('appIcon');
        if (savedIcon && VALID_ICONS.indexOf(savedIcon) !== -1) appIcon = savedIcon;
        collapsed = localStorage.getItem('pp-sidebar-collapsed') === 'true';
    } catch (_) { /* depolama kapalı: koyu obsidian varsayılan */ }

    var root = document.documentElement;
    if (mode === 'light') root.classList.remove('dark');
    else root.classList.add('dark');
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-app-icon', appIcon);
    var syncFav = function () {
        var fav = document.getElementById('pp-favicon');
        if (fav) fav.setAttribute('href', 'assets/icons/' + appIcon + '.png');
    };
    syncFav();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncFav, { once: true });
    }
    if (collapsed) root.classList.add('sidebar-collapsed');
    else root.classList.remove('sidebar-collapsed');
    window.__ppEarlyTheme = { mode: mode, themeId: themeId, appIcon: appIcon, collapsed: collapsed };
})();
