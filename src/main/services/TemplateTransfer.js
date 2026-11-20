/**
 * TemplateTransfer.js
 * Faz 3: kullanıcı şablonlarının sürümlü JSON ile taşınması.
 *
 * main.js yalnızca dosya/dialog katmanını yönetir; doğrulama ve birleştirme
 * kuralları burada saf fonksiyonlar olarak durur. Böylece aynı kurallar
 * birim testleriyle (dialog açmadan) kanıtlanabilir.
 */

const TemplateService = require('./TemplateService');

const EXPORT_SCHEMA = 1;
const MAX_IMPORTED = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isUserTemplate(tpl) {
    return !!(tpl && typeof tpl.id === 'string' && tpl.id.startsWith('user_tpl_'));
}

/** Dışa aktarılacak kullanıcı şablonlarını seçer (hazır şablonlar taşınmaz). */
function collectExportable(templates, nowIso = new Date().toISOString()) {
    const custom = (Array.isArray(templates) ? templates : []).filter(isUserTemplate);
    if (custom.length === 0) return null;
    return {
        schema: EXPORT_SCHEMA,
        app: 'PowerPilot',
        exportedAt: nowIso,
        templates: custom
    };
}

/** Dosyadan okunan ham metni JSON'a çevirir; boyut sınırı ve sözdizimi kapısı. */
function parseImportPayload(raw) {
    if (typeof raw !== 'string') return { ok: false, code: 'PARSE_ERROR' };
    if (raw.length > MAX_FILE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (_) {
        return { ok: false, code: 'PARSE_ERROR' };
    }
    const incoming = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.templates) ? parsed.templates : null);
    if (!incoming) return { ok: false, code: 'INVALID_SCHEMA' };
    return { ok: true, templates: incoming };
}

/**
 * İçe aktarılan kayıtları mevcut listeyle birleştirir.
 *
 * Kurallar:
 *  - Ad/açıklama önce kırpılır (görsel alan; uzun ad yüzünden kayıt
 *    kaybedilmez), sonra geçerlilik denetlenir.
 *  - Yalnızca geçerli şablonlar yazılır (TemplateService.isValidTemplate).
 *  - Kimlik her zaman sunucuda üretilir; dosyadaki id kullanılmaz (çakışma yok).
 *  - Gelen kayıt "user_tpl_imp_" önekli kullanıcı şablonu olarak yazılır;
 *    hazır şablonların üzerine yazılamaz.
 *  - En fazla MAX_IMPORTED kayıt işlenir.
 */
function mergeImportedTemplates(incoming, existing, nowMs = Date.now()) {
    const base = Array.isArray(existing) ? existing.slice() : [];
    const knownIds = new Set(base.map((x) => String(x && x.id)));
    const added = [];
    let rejected = 0;

    for (const tpl of (Array.isArray(incoming) ? incoming : []).slice(0, MAX_IMPORTED)) {
        // Ad/açıklama görsel alanlardır: kırpılır, kayıt reddedilmez.
        const normalized = tpl && typeof tpl === 'object'
            ? { ...tpl, name: String(tpl.name || '').trim().slice(0, 80), description: String(tpl.description || '').slice(0, 200) }
            : tpl;
        if (!TemplateService.isValidTemplate(normalized)) {
            rejected += 1;
            continue;
        }
        let id = `user_tpl_imp_${nowMs.toString(36)}_${added.length}`;
        while (knownIds.has(id)) id = `${id}_2`;
        knownIds.add(id);
        added.push({
            id,
            name: normalized.name,
            description: normalized.description,
            action: normalized.action,
            icon: 'bookmark',
            category: 'custom',
            ...(normalized.defaultCondition ? { defaultCondition: normalized.defaultCondition } : {}),
            ...(normalized.defaultConditionGroup ? { defaultConditionGroup: normalized.defaultConditionGroup } : {}),
            ...(normalized.schedule ? { schedule: { timeOfDay: normalized.schedule.timeOfDay } } : {})
        });
    }

    return { templates: [...base, ...added], added, rejected };
}

module.exports = {
    EXPORT_SCHEMA,
    MAX_IMPORTED,
    MAX_FILE_BYTES,
    isUserTemplate,
    collectExportable,
    parseImportPayload,
    mergeImportedTemplates
};
