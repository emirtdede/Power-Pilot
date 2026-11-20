#!/usr/bin/env node

/**
 * powerpilot.js
 * Controlled CLI interface for the running Power Pilot Local API.
 *
 * B2: Komut kataloğu `commands.js` içinde saf ve test edilebilir tutulur;
 * bu dosya yalnızca HTTP taşımasını yapar.
 */

const http = require('http');
const {
    parseArgs,
    buildRequest,
    validate,
    usageText,
    renderResponse
} = require('./commands');

const apiKey = process.env.POWERPILOT_API_KEY || '';
const host = process.env.POWERPILOT_API_HOST || '127.0.0.1';
const port = Number(process.env.POWERPILOT_API_PORT) || 18456;

function requestApi(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const dataStr = body ? JSON.stringify(body) : '';
        const options = {
            hostname: host,
            port,
            path: `/api/v1${path}`,
            method,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) { /* düz metin yanıt */ }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', (err) => {
            if (err && err.code === 'ECONNREFUSED') {
                return reject(new Error(
                    `Power Pilot yerel API'sine bağlanılamadı (${host}:${port}). ` +
                    'Uygulama çalışıyor mu ve Entegrasyonlar sekmesinde API açık mı?'
                ));
            }
            reject(new Error(`API bağlantı hatası: ${err.message}`));
        });

        if (dataStr) req.write(dataStr);
        req.end();
    });
}

async function main() {
    const rawArgs = process.argv.slice(2);
    if (rawArgs[0] === 'mcp') {
        const { startStdioServer } = require('../mcp/server');
        startStdioServer();
        return;
    }
    const parsed = parseArgs(rawArgs);

    if (parsed.flags.help) {
        console.log(usageText());
        return;
    }
    if (parsed.errors.length > 0) {
        for (const err of parsed.errors) console.error(`Hata: ${err}`);
        console.error('');
        console.error(usageText());
        process.exitCode = 2;
        return;
    }
    const check = validate(parsed);
    if (!check.ok) {
        console.error(`Hata: ${check.error}`);
        console.error('');
        console.error(usageText());
        process.exitCode = 2;
        return;
    }
    if (!apiKey) {
        console.error('Hata: POWERPILOT_API_KEY tanımlı değil. Entegrasyonlar sekmesinden anahtar üretip ortam değişkenine atayın.');
        process.exitCode = 2;
        return;
    }

    const request = buildRequest(parsed);
    try {
        const res = await requestApi(request.method, request.path, request.body);
        const output = renderResponse(request, res, parsed.flags);
        if (res.status >= 400) {
            console.error(output);
            process.exitCode = 1;
            return;
        }
        console.log(output);
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

main();
