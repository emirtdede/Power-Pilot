/**
 * after-pack.cjs — WP-15.T1
 * electron-builder 26'nın şema sürümü `wasmTrapHandlers` fuse'unu tanımıyor;
 * kalan fuses `electronFuses` ile, bu fuse ise doğrudan @electron/fuses ile
 * paketleme sonrası (imzadan önce) çevrilir.
 */
'use strict';

const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') return;
    const executable = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.exe`
    );
    await flipFuses(executable, {
        version: FuseVersion.V1,
        [FuseV1Options.WasmTrapHandlers]: true
    });
    console.log(`[after-pack] WasmTrapHandlers=true: ${executable}`);
};
