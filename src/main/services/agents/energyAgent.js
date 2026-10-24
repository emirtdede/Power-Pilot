/**
 * agents/energyAgent.js — F9.1
 * Deterministik enerji anlatıcısı: SAYILAR şablondan değişmez alınır
 * (LLM cilası yok — sayı uydurma riski sıfırdır).
 */
module.exports = {
    id: 'energy',
    version: '1.0.0',
    description: 'Tasarruf sayılarını cümleye döker, tek kural önerir.',
    async execute({ stats }) {
        if (!stats || stats.enabled === false) {
            return { ok: true, summary: 'İstatistikler kapalı.', suggestion: null };
        }
        // WBS-E7: Eksik veri cümleye girmez, sayı uydurulmaz.
        const parts = [`Şimdiye kadar ${stats.preventedUptimeHours || '0.0'} saat boşa çalışmayı önledin`];
        if (stats.kwhSaved != null) parts.push(`${stats.kwhSaved} kWh`);
        if (stats.costSavedFormatted) parts.push(`${stats.costSavedFormatted} tasarruf`);
        const summary = parts.join(' — ') + '.';
        let suggestion = null;
        if (parseFloat(stats.preventedUptimeHours) >= 5) {
            suggestion = {
                templateId: 'tpl_nightly_sleep',
                text: 'Gece boştayken otomatik uyku kuralı kuralım mı? (Her gece 01:00)'
            };
        }
        return { ok: true, summary, suggestion };
    }
};
