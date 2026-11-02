const dgram = require('dgram');
const net = require('net');
const os = require('os');
const log = require('../logger');

function ipv4ToInt (ip) {
    return ip.split('.').reduce((acc, part) => ((acc << 8) + (parseInt(part, 10) & 0xff)) >>> 0, 0) >>> 0;
}

function intToIpv4 (value) {
    return [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
    ].join('.');
}

/** WP-12.T7: arayüz IP + netmask'ten yönlendirilmiş broadcast adresi. */
function broadcastFromNetmask (address, netmask) {
    if (!net.isIPv4(address) || !net.isIPv4(netmask)) return null;
    const ip = ipv4ToInt(address);
    const mask = ipv4ToInt(netmask);
    return intToIpv4((ip | (~mask >>> 0)) >>> 0);
}

function defaultBroadcastAddress (interfaces = os.networkInterfaces()) {
    // L-15: VPN/Hyper-V/sanal adaptörler atlanır; aksi halde WoL yanlış ağa gider.
    const candidates = Object.entries(interfaces || {})
        .filter(([name]) => !/vEthernet|Hyper-V|VPN|Loopback|VirtualBox|VMware|TAP|TUN|WSL/i.test(String(name || '')))
        .flatMap(([, list]) => list || [])
        .filter((info) => info && info.family === 'IPv4' && !info.internal);
    for (const info of candidates) {
        const broadcast = broadcastFromNetmask(info.address, info.netmask);
        if (broadcast && broadcast !== '0.0.0.0') return broadcast;
    }
    return '255.255.255.255';
}

class DeviceProfileService {
    constructor (storageService, options = {}) {
        this.storage = storageService;
        this.dgramModule = options.dgramModule || dgram;
        this.timeoutMs = options.timeoutMs || 3000;
    }

    /**
     * WoL Magic Packet (6x 0xFF + 16x MAC).
     * @returns {Promise<{success:boolean,error?:string}>}
     */
    sendWakeOnLan (macAddress, broadcastIp = null, port = 9) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            let socket = null;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (socket) {
                    try { socket.close(); } catch (_) { /* zaten kapalı */ }
                }
                resolve(result);
            };

            try {
                const cleanMac = String(macAddress || '').replace(/[^a-fA-F0-9]/g, '');
                if (cleanMac.length !== 12) {
                    return finish({ success: false, error: 'Invalid MAC address length (12 hex digits required)' });
                }
                const targetPort = Number(port);
                if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
                    return finish({ success: false, error: 'Invalid WoL port' });
                }
                const target = broadcastIp || defaultBroadcastAddress();
                if (!net.isIPv4(target)) {
                    return finish({ success: false, error: 'Broadcast address must be IPv4' });
                }

                const macBuffer = Buffer.from(cleanMac, 'hex');
                const magicPacket = Buffer.alloc(102);
                magicPacket.fill(0xFF, 0, 6);
                for (let i = 0; i < 16; i++) {
                    macBuffer.copy(magicPacket, 6 + i * 6);
                }

                socket = this.dgramModule.createSocket('udp4');
                socket.once('error', (err) => {
                    log.error('[DeviceProfileService] WoL soket hatası:', err && err.message);
                    finish({ success: false, error: (err && err.message) || 'WoL socket error' });
                });
                // Windows'ta broadcast yalnızca bind tamamlandıktan sonra açılabilir.
                socket.bind(() => {
                    if (settled) return;
                    try {
                        socket.setBroadcast(true);
                    } catch (err) {
                        return finish({ success: false, error: (err && err.message) || 'WoL broadcast error' });
                    }
                    socket.send(magicPacket, 0, magicPacket.length, targetPort, target, (err) => {
                        if (err) {
                            log.error('[DeviceProfileService] WoL send error:', err);
                            return finish({ success: false, error: err.message });
                        }
                        log.info(`[DeviceProfileService] WoL Magic Packet sent to ${macAddress}`);
                        finish({ success: true });
                    });
                });

                timer = setTimeout(() => {
                    log.warn('[DeviceProfileService] WoL zaman aşımı');
                    finish({ success: false, error: 'WoL timeout' });
                }, this.timeoutMs);
            } catch (err) {
                log.error('[DeviceProfileService] WoL error:', err && err.message);
                finish({ success: false, error: (err && err.message) || 'WoL error' });
            }
        });
    }
}

module.exports = DeviceProfileService;
module.exports.broadcastFromNetmask = broadcastFromNetmask;
module.exports.defaultBroadcastAddress = defaultBroadcastAddress;
