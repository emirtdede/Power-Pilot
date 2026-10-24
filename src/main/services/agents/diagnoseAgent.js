/**
 * agents/diagnoseAgent.js — F9.1
 * Deterministik teşhisçi: şablon cümleler (LLM cilası yok — sayılar ve
 * gerekçeler değişmez metinden gelir, halüsinasyon yüzeyi sıfırdır).
 */
function explainBlocked(reason) {
    const r = String(reason || '');
    if (/Korunan uygulama/i.test(r)) {
        return {
            explanation: `${r} Bu uygulama açıkken otomatik kapatma duraklatıldı; çalışmanız korunuyor.`,
            whatToDo: 'Uygulamayı kapatıp görevi yeniden kurun ya da erteleyin.'
        };
    }
    if (/uzaktan kapatma/i.test(r)) {
        return {
            explanation: 'Bilgisayar başında biri aktif olduğu için uzaktan kapatma engellendi.',
            whatToDo: 'Kullanıcı boşta kalınca tekrar deneyin ya da doğrudan zamanlayıcı kurun.'
        };
    }
    if (/Çakışan görev/i.test(r)) {
        return {
            explanation: r,
            whatToDo: 'Önce çalışan görevi iptal edin, sonra yenisini kurun.'
        };
    }
    return {
        explanation: r || 'Görev güvenlik kuralına takıldı.',
        whatToDo: 'Geçmiş kaydındaki gerekçeyi kontrol edin.'
    };
}

module.exports = {
    id: 'diagnose',
    version: '1.0.0',
    description: 'Engelleme gerekçesini sade Türkçeye çevirir.',
    async execute({ reason }) {
        return { ok: true, ...explainBlocked(reason) };
    }
};
