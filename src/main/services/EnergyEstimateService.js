/**
 * EnergyEstimateService.js — FAZ D dürüstlük revizyonu.
 * ÖNCE: her başarılı eylem = 2.5h sabit varsayım (uydurma sayı).
 * ŞİMDİ: kapanış kaydı → sonraki açılış kaydı (bootHistory) = GERÇEK kapalı-süre.
 * Eşleşmeyen kapanışlar SADECE kullanıcı beyanlı assumedOffHours ile ve
 * isEstimate:true + missing listesiyle raporlanır; beyan yoksa "—" döner.
 */

const POWER_DOWN_ACTIONS = new Set(['shutdown', 'sleep', 'hibernate']);

class EnergyEstimateService {
    constructor(storageService) {
        this.storage = storageService;
    }

    /**
     * WP-11.T8: boot/down sıralı iki-pointer. Aynı boot'a düşen ardışık
     * kapanışlardan yalnızca SONUNCUSU sayılır (22:00 sleep + 23:00 hibernate
     * → 08:00 boot = 9 saat; çift sayım yok). 14 günü aşan eşleşme bozuk sayılır.
     * @returns {{measuredHours:number, unmatched:number}}
     */
    static matchOffHours(powerDowns, boots) {
        const downMs = (powerDowns || [])
            .map((d) => new Date(d).getTime())
            .filter((t) => Number.isFinite(t))
            .sort((a, b) => a - b);
        const bootMs = (boots || [])
            .map((b) => new Date(b).getTime())
            .filter((t) => Number.isFinite(t))
            .sort((a, b) => a - b);
        let measuredHours = 0;
        let unmatched = 0;
        let bi = 0;
        let i = 0;
        while (i < downMs.length) {
            const t = downMs[i];
            while (bi < bootMs.length && bootMs[bi] <= t) bi += 1;
            if (bi >= bootMs.length) {
                // Kalan tüm kapanışlar eşleşmedi.
                unmatched += downMs.length - i;
                break;
            }
            const next = bootMs[bi];
            // Aynı boot'a düşen kapanışların sonuncusunu seç.
            let last = i;
            while (last + 1 < downMs.length && downMs[last + 1] < next) last += 1;
            const hours = (next - downMs[last]) / 3600000;
            if (hours > 0 && hours <= 24 * 14) measuredHours += hours;
            else unmatched += 1;
            i = last + 1;
        }
        return { measuredHours, unmatched };
    }

    getStatistics() {
        const settings = this.storage.getSettings();
        if (!settings.statsEnabled) {
            return { enabled: false };
        }

        const history = this.storage.getHistory();
        const successExecutions = history.filter(h => h.resultCode === 'success');
        const cancelledExecutions = history.filter(h => h.resultCode === 'cancelled_by_user');
        const blockedExecutions = history.filter(h => h.resultCode === 'blocked_by_policy');

        const downs = successExecutions
            .filter(h => POWER_DOWN_ACTIONS.has(h.action))
            .map(h => h.timestamp);
        const boots = typeof this.storage.getBootHistory === 'function' ? this.storage.getBootHistory() : [];
        const { measuredHours, unmatched } = EnergyEstimateService.matchOffHours(downs, boots);

        // Beyanlı varsayım (ayarlıysa, damgalı).
        const assumed = typeof settings.assumedOffHours === 'number' && settings.assumedOffHours > 0
            ? settings.assumedOffHours
            : null;
        const estimatedHours = assumed !== null ? unmatched * assumed : 0;

        const missing = [];
        const deviceWatt = settings.deviceWattage;
        const hasWatt = typeof deviceWatt === 'number' && Number.isFinite(deviceWatt) && deviceWatt > 0;
        if (!hasWatt) missing.push('watt');
        if (unmatched > 0 && assumed === null) missing.push('offhours');

        const totalHours = measuredHours + estimatedHours;
        const kwhSaved = hasWatt ? (deviceWatt * totalHours) / 1000 : null;

        const costPerKwh = settings.electricityCostPerKwh;
        const hasPrice = typeof costPerKwh === 'number' && Number.isFinite(costPerKwh) && costPerKwh >= 0;
        if (!hasPrice) missing.push('price');
        const currency = settings.currency || 'TL';

        const costSaved = hasWatt && hasPrice ? kwhSaved * costPerKwh : null;

        return {
            enabled: true,
            totalActionsCount: successExecutions.length,
            cancelledCount: cancelledExecutions.length,
            blockedCount: blockedExecutions.length,
            preventedUptimeHours: totalHours.toFixed(1),
            measuredHours: measuredHours.toFixed(1),
            estimatedHours: estimatedHours.toFixed(1),
            unmeasuredCount: assumed === null ? unmatched : 0,
            method: measuredHours > 0 && estimatedHours === 0 ? 'measured'
                : measuredHours > 0 ? 'mixed'
                : estimatedHours > 0 ? 'assumed' : 'none',
            kwhSaved: kwhSaved == null ? null : kwhSaved.toFixed(2),
            costSavedFormatted: costSaved == null ? null : `${costSaved.toFixed(2)} ${currency}`,
            missing,
            isEstimate: estimatedHours > 0 || unmatched > 0
        };
    }
}

module.exports = EnergyEstimateService;
