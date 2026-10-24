/**
 * agents/recommenderAgent.js — F9.1
 * Proaktif önerici: 7 günlük desen + katı sessizlik kuralları.
 * - Haftada en fazla 1 teklif (settings.aiAdvisorLastAt).
 * - Reddedilen konuda 30 gün susma (settings.aiDismissed = {konu: ts}).
 * - 22:00–08:00 arası teklif üretilmez.
 */
const DAY_MS = 86400000;

module.exports = {
    id: 'recommender',
    version: '1.0.0',
    description: 'Kullanım deseninden tek kural teklifi üretir.',
    async execute({ history, settings, now }) {
        const at = now || Date.now();
        const hour = new Date(at).getHours();
        if (hour >= 22 || hour < 8) {
            return { ok: true, suggestion: null, reason: 'QUIET_HOURS' };
        }
        const s = settings || {};
        if (s.aiAdvisorLastAt && at - s.aiAdvisorLastAt < 7 * DAY_MS) {
            return { ok: true, suggestion: null, reason: 'WEEKLY_CAP' };
        }
        const dismissedAt = s.aiDismissed && s.aiDismissed.nightly;
        if (dismissedAt && at - dismissedAt < 30 * DAY_MS) {
            return { ok: true, suggestion: null, reason: 'DISMISSED_30D' };
        }
        const weekAgo = at - 7 * DAY_MS;
        const nightlies = (history || []).filter((h) => {
            if (h.resultCode !== 'success') return false;
            if (h.action !== 'shutdown' && h.action !== 'sleep') return false;
            const t = new Date(h.timestamp).getTime();
            if (!(t >= weekAgo && t <= at)) return false;
            const hh = new Date(t).getHours();
            return hh >= 0 && hh < 5;
        });
        if (nightlies.length >= 3) {
            return {
                ok: true,
                suggestion: {
                    templateId: 'tpl_nightly_sleep',
                    topic: 'nightly',
                    text: `Son 7 günde ${nightlies.length} kez gece kapatmışsın. Her gece 01:00 uyku kuralı kuralım mı?`
                }
            };
        }
        return { ok: true, suggestion: null, reason: 'NO_PATTERN' };
    }
};
