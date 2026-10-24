#!/usr/bin/env node

/**
 * powerpilot.js
 * Controlled CLI Interface connecting to running Power Pilot Local API.
 */

const http = require('http');

const apiKey = process.env.POWERPILOT_API_KEY || 'pp_key_demo';
const host = process.env.POWERPILOT_API_HOST || '127.0.0.1';
const port = process.env.POWERPILOT_API_PORT || 18456;

const args = process.argv.slice(2);
const command = args[0] || 'status';

function requestApi(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const dataStr = body ? JSON.stringify(body) : '';
        const options = {
            hostname: host,
            port: port,
            path: `/api/v1${path}`,
            method: method,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`API Bağlantı Hatası: ${err.message}. Power Pilot çalışıyor mu?`));
        });

        if (dataStr) req.write(dataStr);
        req.end();
    });
}

async function main() {
    try {
        if (command === 'status') {
            const res = await requestApi('GET', '/status');
            console.log(JSON.stringify(res.body, null, 2));
        } else if (command === 'tasks') {
            const res = await requestApi('GET', '/tasks');
            console.log(JSON.stringify(res.body, null, 2));
        } else if (['lock', 'signout', 'restart', 'sleep', 'hibernate'].includes(command)) {
            // WBS-0.3: 6 eylemden 5'i anında çalışır (shutdown hariç — altta).
            const res = await requestApi('POST', `/power/${command}`);
            console.log(res.body.message || `${command} çalıştırıldı`);
        } else if (command === 'shutdown') {
            const res = await requestApi('POST', '/power/shutdown');
            console.log(res.body.message || 'Kapatma başlatıldı');
        } else {
            console.log(`Kullanım: powerpilot [status|tasks|lock|signout|restart|sleep|hibernate|shutdown]`);
        }
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

main();
