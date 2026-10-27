/**
 * Material Symbols boot gate.
 *
 * `font-display: block` only hides the fallback for a few seconds. If the
 * local font is slow to load (antivirus, cold cache, slow disk), the raw
 * ligature names ("power_settings_new", "settings", ...) can still appear.
 * The `fonts-pending` class keeps those glyphs hidden until the icon font is
 * actually ready, then removes it without changing the layout.
 */
(function () {
    'use strict';

    var root = document.documentElement;
    var revealed = false;

    root.classList.add('fonts-pending');

    function reveal() {
        if (revealed) return;
        revealed = true;
        root.classList.remove('fonts-pending');
        root.classList.add('fonts-ready');
    }

    // Safety net: a broken/missing font must not leave the UI permanently
    // blank. The font ships with the app, so this should never be reached.
    var fallback = setTimeout(reveal, 8000);

    if (document.fonts && typeof document.fonts.load === 'function') {
        document.fonts.load('24px "Material Symbols Outlined"')
            .then(function () {
                return document.fonts.ready;
            })
            .then(function () {
                clearTimeout(fallback);
                requestAnimationFrame(reveal);
            })
            .catch(function () {
                clearTimeout(fallback);
                reveal();
            });
    } else {
        clearTimeout(fallback);
        reveal();
    }
})();
