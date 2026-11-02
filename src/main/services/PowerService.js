/**
 * PowerService.js
 * Centralized Power Management Service for Power Pilot.
 * Safe OS command execution for power operations:
 * - shutdown
 * - restart
 * - sleep
 * - hibernate
 * - lock
 * - signout
 */

const { execFile } = require('child_process');
const log = require('../logger');

const POWER_ACTIONS = {
    SHUTDOWN: 'shutdown',
    RESTART: 'restart',
    SLEEP: 'sleep',
    HIBERNATE: 'hibernate',
    LOCK: 'lock',
    SIGNOUT: 'signout'
};

class PowerService {
    /**
     * WP-11.T7: audit zinciri kurcalanmışsa veya depo bakım modundaysa
     * yıkıcı eylemler durdurulur. Guard main.js tarafından takılır.
     */
    static setExecutionGuard(fn) {
        PowerService._guard = typeof fn === 'function' ? fn : null;
    }

    static executionAllowed() {
        if (typeof PowerService._guard !== 'function') return { ok: true };
        return PowerService._guard();
    }

    /**
     * Executes a power action safely via OS utilities.
     * @param {string} action - One of POWER_ACTIONS
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    static execute(action) {
        const guard = PowerService.executionAllowed();
        if (!guard.ok) {
            log.error(`[PowerService] Eylem bloke edildi (${action}): ${guard.code || 'GUARD'}`);
            return Promise.resolve({ success: false, error: guard.error || 'Güvenlik denetimi eylemi engelledi.', code: guard.code || 'BLOCKED' });
        }
        return new Promise((resolve) => {
            log.info(`[PowerService] Executing action: ${action}`);

            let file = null;
            let args = [];

            switch (action) {
                case POWER_ACTIONS.SHUTDOWN:
                    file = 'shutdown.exe';
                    args = ['/s', '/t', '0'];
                    break;
                case POWER_ACTIONS.RESTART:
                    file = 'shutdown.exe';
                    args = ['/r', '/t', '0'];
                    break;
                case POWER_ACTIONS.SLEEP:
                    // L-09: rundll32 parametre yorumu hibernation ayarına göre
                    // değişebiliyor. Doğrudan SetSuspendState(FALSE, TRUE, FALSE)
                    // çağrısı uyku/hibernate ayrımını netleştirir.
                    file = 'powershell.exe';
                    args = [
                        '-NoProfile', '-NonInteractive', '-Command',
                        "Add-Type -MemberDefinition '[DllImport(\"powrprof.dll\", SetLastError=true)] public static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);' -Name PowrProf -Namespace Win32; if (-not [Win32.PowrProf]::SetSuspendState($false, $true, $false)) { exit 1 }"
                    ];
                    break;
                case POWER_ACTIONS.HIBERNATE:
                    file = 'shutdown.exe';
                    args = ['/h'];
                    break;
                case POWER_ACTIONS.LOCK:
                    file = 'rundll32.exe';
                    args = ['user32.dll,LockWorkStation'];
                    break;
                case POWER_ACTIONS.SIGNOUT:
                    file = 'shutdown.exe';
                    args = ['/l'];
                    break;
                default:
                    return resolve({ success: false, error: `Invalid power action: ${action}` });
            }

            execFile(file, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
                if (err) {
                    log.error(`[PowerService] Action execution failed (${action}):`, err);
                    return resolve({ success: false, error: err.message || stderr });
                }
                return resolve({ success: true });
            });
        });
    }

    /**
     * Validates if action string is supported
     */
    static isValidAction(action) {
        return Object.values(POWER_ACTIONS).includes(action);
    }
}

module.exports = {
    PowerService,
    POWER_ACTIONS
};
