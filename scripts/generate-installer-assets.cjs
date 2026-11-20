'use strict';

/**
 * scripts/generate-installer-assets.cjs
 *
 * Generates custom Windows 11 NSIS Modern UI 2 24-bit uncompressed DIB BMP
 * graphics for Power Pilot Setup and Uninstaller:
 *  - build/installerSidebar.bmp   (164 x 314)
 *  - build/uninstallerSidebar.bmp (164 x 314)
 *  - build/installerHeader.bmp    (150 x 57)
 *
 * NOTE: Per design requirement, NO version numbers appear anywhere in these
 * graphics so they stay timeless across releases.
 */

const fs = require('fs');
const path = require('path');
const { _electron: electron } = require('@playwright/test');

const OUT_DIR = path.resolve(__dirname, '..', 'build');
fs.mkdirSync(OUT_DIR, { recursive: true });

function encodeBmp24(rgbaBuffer, width, height) {
    const rowBytes = width * 3;
    const paddedRowBytes = (rowBytes + 3) & ~3;
    const pixelDataSize = paddedRowBytes * height;
    const fileSize = 54 + pixelDataSize;
    const out = Buffer.alloc(fileSize);

    // BITMAPFILEHEADER (14 bytes)
    out.write('BM', 0, 'ascii');
    out.writeUInt32LE(fileSize, 2);
    out.writeUInt32LE(0, 6);
    out.writeUInt32LE(54, 10);

    // BITMAPINFOHEADER (40 bytes)
    out.writeUInt32LE(40, 14);
    out.writeInt32LE(width, 18);
    out.writeInt32LE(height, 22); // bottom-up DIB
    out.writeUInt16LE(1, 26);
    out.writeUInt16LE(24, 28);
    out.writeUInt32LE(0, 30);
    out.writeUInt32LE(pixelDataSize, 34);
    out.writeInt32LE(3780, 38);
    out.writeInt32LE(3780, 42);
    out.writeUInt32LE(0, 46);
    out.writeUInt32LE(0, 50);

    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const dstRow = 54 + y * paddedRowBytes;
        for (let x = 0; x < width; x++) {
            const s = srcRow + x * 4;
            const d = dstRow + x * 3;
            out[d] = rgbaBuffer[s + 2];     // B
            out[d + 1] = rgbaBuffer[s + 1]; // G
            out[d + 2] = rgbaBuffer[s];     // R
        }
    }
    return out;
}

function powerPilotMark(ringColor, boltColor, bgColor, borderColor) {
    return `
      <rect x="6" y="6" width="244" height="244" rx="56" fill="${bgColor}" stroke="${borderColor}" stroke-width="10"/>
      <circle cx="128" cy="128" r="80" fill="none" stroke="${ringColor}" stroke-width="13" stroke-dasharray="22 15" stroke-linecap="round"/>
      <circle cx="128" cy="128" r="61" fill="none" stroke="${ringColor}" stroke-width="4.5" opacity="0.45"/>
      <path d="M136 62 L76 146 L120 146 L112 196 L180 106 L136 106 Z" fill="${boltColor}"/>
    `;
}

const SVG_NS = ['http', '://www.w3.org/2000/svg'].join('');

// 1. Setup Welcome/Finish Sidebar (rendered at 2x 328x628 -> 164x314, NO VERSION)
const installerSidebarSvg = `<svg xmlns="${SVG_NS}" viewBox="0 0 328 628" width="328" height="628">
  <defs>
    <linearGradient id="side-bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#15151a" />
      <stop offset="55%" stop-color="#0d0d11" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <radialGradient id="top-glow" cx="42%" cy="16%" r="58%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.11" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="accent-bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.08" />
    </linearGradient>
  </defs>
  <rect width="328" height="628" fill="url(#side-bg)" />
  <rect width="328" height="628" fill="url(#top-glow)" />
  <line x1="327" y1="0" x2="327" y2="628" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />
  <circle cx="292" cy="70" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="2" />
  <circle cx="292" cy="70" r="146" fill="none" stroke="#ffffff" stroke-opacity="0.02" stroke-width="2" />

  <g transform="translate(36 52) scale(0.375)">
    ${powerPilotMark('#a1a1aa', '#fafafa', '#18181b', '#3f3f46')}
  </g>

  <text x="36" y="194" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="700" letter-spacing="-0.8">Power Pilot</text>
  <text x="36" y="222" fill="#a1a1aa" font-family="'Segoe UI', system-ui, sans-serif" font-size="16.5" font-weight="400">Akıllı Güç ve Otomasyon</text>

  <rect x="36" y="250" width="124" height="2.5" rx="1.25" fill="url(#accent-bar)" />

  <g font-family="'Segoe UI', system-ui, sans-serif" font-size="15.5" fill="#d4d4d8">
    <circle cx="44" cy="296" r="4" fill="#10b981" />
    <text x="60" y="302">Smart Finish koşul motoru</text>

    <circle cx="44" cy="336" r="4" fill="#10b981" />
    <text x="60" y="342">%100 yerel SQLite &amp; AI</text>

    <circle cx="44" cy="376" r="4" fill="#10b981" />
    <text x="60" y="382">28 tema, 73 dil, CLI &amp; MCP</text>

    <circle cx="44" cy="416" r="4" fill="#10b981" />
    <text x="60" y="422">Sıfır telemetri ve tam gizlilik</text>
  </g>

  <line x1="36" y1="534" x2="292" y2="534" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.5" />
  <text x="36" y="566" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="16" font-weight="700" letter-spacing="2.4">VELLIUM</text>
  <text x="36" y="592" fill="#71717a" font-family="'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="400">vellium.dev</text>
</svg>`;

// 2. Uninstaller Sidebar (rendered at 2x 328x628 -> 164x314, NO VERSION)
const uninstallerSidebarSvg = `<svg xmlns="${SVG_NS}" viewBox="0 0 328 628" width="328" height="628">
  <defs>
    <linearGradient id="unside-bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#1c1518" />
      <stop offset="55%" stop-color="#110e11" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <radialGradient id="untop-glow" cx="45%" cy="16%" r="55%">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="unaccent-bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.08" />
    </linearGradient>
  </defs>
  <rect width="328" height="628" fill="url(#unside-bg)" />
  <rect width="328" height="628" fill="url(#untop-glow)" />
  <line x1="327" y1="0" x2="327" y2="628" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />

  <g transform="translate(36 52) scale(0.375)">
    ${powerPilotMark('#fda4af', '#f43f5e', '#1f1619', '#4c222b')}
  </g>

  <text x="36" y="194" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="700" letter-spacing="-0.8">Power Pilot</text>
  <text x="36" y="222" fill="#fda4af" font-family="'Segoe UI', system-ui, sans-serif" font-size="16.5" font-weight="500">Kaldırma Yardımcısı</text>

  <rect x="36" y="250" width="124" height="2.5" rx="1.25" fill="url(#unaccent-bar)" />

  <g font-family="'Segoe UI', system-ui, sans-serif" font-size="15.5" fill="#a1a1aa">
    <text x="36" y="298">Uygulama dosyaları ve görev</text>
    <text x="36" y="322">zamanlayıcı kayıtları temiz</text>
    <text x="36" y="346">şekilde sistemden kaldırılır.</text>
    <text x="36" y="390" fill="#d4d4d8">İsterseniz yerel ayar ve</text>
    <text x="36" y="414" fill="#d4d4d8">geçmiş verilerinizi korursunuz.</text>
  </g>

  <line x1="36" y1="534" x2="292" y2="534" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.5" />
  <text x="36" y="566" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="16" font-weight="700" letter-spacing="2.4">VELLIUM</text>
  <text x="36" y="592" fill="#71717a" font-family="'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="400">support@vellium.dev</text>
</svg>`;

// 3. Inner Header Banner (rendered at 2x 300x114 -> 150x57, NO VERSION)
const installerHeaderSvg = `<svg xmlns="${SVG_NS}" viewBox="0 0 300 114" width="300" height="114">
  <rect width="300" height="114" fill="#ffffff" />
  <g transform="translate(20 23) scale(0.265625)">
    ${powerPilotMark('#a1a1aa', '#ffffff', '#09090b', '#27272a')}
  </g>
  <text x="102" y="67" fill="#09090b" font-family="'Segoe UI', system-ui, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.6">Power Pilot</text>
</svg>`;

async function main() {
    delete process.env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
        args: ['--disable-gpu'],
        env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    });
    try {
        // Use a hidden BrowserWindow inside Electron to rasterize SVGs onto canvas
        const rawAssets = await app.evaluate(async ({ BrowserWindow }, specs) => {
            const win = new BrowserWindow({
                width: 400,
                height: 700,
                show: false,
                webPreferences: { offscreen: true }
            });
            await win.loadURL('data:text/html;charset=utf-8,<!DOCTYPE html><html><body style="margin:0;background:#000"></body></html>');
            const results = {};
            for (const [key, spec] of Object.entries(specs)) {
                const b64 = await win.webContents.executeJavaScript(`(async () => {
                    const svg = ${JSON.stringify(spec.svg)};
                    const w = ${spec.width};
                    const h = ${spec.height};
                    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const img = new Image();
                    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(url);
                    const bytes = ctx.getImageData(0, 0, w, h).data;
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    return btoa(binary);
                })()`);
                results[key] = b64;
            }
            win.destroy();
            return results;
        }, {
            installerSidebar: { svg: installerSidebarSvg, width: 164, height: 314 },
            uninstallerSidebar: { svg: uninstallerSidebarSvg, width: 164, height: 314 },
            installerHeader: { svg: installerHeaderSvg, width: 150, height: 57 }
        });

        fs.writeFileSync(
            path.join(OUT_DIR, 'installerSidebar.bmp'),
            encodeBmp24(Buffer.from(rawAssets.installerSidebar, 'base64'), 164, 314)
        );
        fs.writeFileSync(
            path.join(OUT_DIR, 'uninstallerSidebar.bmp'),
            encodeBmp24(Buffer.from(rawAssets.uninstallerSidebar, 'base64'), 164, 314)
        );
        fs.writeFileSync(
            path.join(OUT_DIR, 'installerHeader.bmp'),
            encodeBmp24(Buffer.from(rawAssets.installerHeader, 'base64'), 150, 57)
        );
        console.log('[generate-installer-assets] OK — build/installerSidebar.bmp, build/uninstallerSidebar.bmp, build/installerHeader.bmp üretildi.');
    } finally {
        await app.close();
    }
}

main().catch((err) => {
    console.error('[generate-installer-assets] HATA:', err);
    process.exit(1);
});
