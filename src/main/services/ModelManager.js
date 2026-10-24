/**
 * ModelManager.js — WBS-7.2
 * AI model dosyalarının indirme + bütünlük yöneticisi.
 *
 * Dürüstlük notu: üst-akış (HuggingFace) published-SHA değeri indirme anında
 * sabitlenemediğinden, bütünlük zinciri şu şekildedir:
 *  1. İndirme tamamlanınca SHA256 hesaplanıp manifest'e yazılır.
 *  2. Her yükleme öncesi manifest'teki SHA ile dosya yeniden doğrulanır.
 *  3. Boyut/resume HTTP Range ile yönetilir; yarım dosya `.part` uzantılıdır.
 * Ağ gerekir — yalnızca kullanıcı "AI Paketini Kur" dediğinde çalışır.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');
const log = require('../logger');

const MODEL_ID = 'qwen3-1.7b-q4_k_m';
const MODEL_FILE = 'Qwen_Qwen3-1.7B-Q4_K_M.gguf';
// WP-06: `main` yerine immutable commit; boyut + SHA-256 sabit.
const QWEN_COMMIT = 'dcb19155b962dbb6389f4691a982043a8e651022';
const MODEL_URL = `https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/${QWEN_COMMIT}/Qwen_Qwen3-1.7B-Q4_K_M.gguf`;
const MODEL_BYTES = 1282439584;
const MODEL_SHA256 = 'e864889bee68f907ecb7cec2a713a4fb12280600c4a291e23ae5362d92ef4bfd';
// STT varsayılanları (WBS-8.1 sabitleri; SttService ile aynı olmalı).
const STT_MODEL_ID = 'whisper-base';
const STT_MODEL_FILE = 'ggml-base.bin';
const WHISPER_COMMIT = '5359861c739e955e79d9a303bcbc70fb988958b1';
const STT_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/${WHISPER_COMMIT}/ggml-base.bin`;
const STT_MODEL_BYTES = 147951465;
const STT_MODEL_SHA256 = '2f62d18b50c3f3feafbf990eec23a93d319660b1efbdd3fff55e52b7cde2e374';

const MODEL_SPECS = {
    [MODEL_ID]: { file: MODEL_FILE, url: MODEL_URL, bytes: MODEL_BYTES, sha256: MODEL_SHA256 },
    [STT_MODEL_ID]: { file: STT_MODEL_FILE, url: STT_MODEL_URL, bytes: STT_MODEL_BYTES, sha256: STT_MODEL_SHA256 }
};

class ModelManager {
    // fetchFn/url/file/modelId: test izolasyonu + yedek ayna + ek modeller için.
    // expectedBytes/expectedSha256: WP-06 bütünlük sözleşmesi (test/özel model).
    constructor({
        modelDir = null,
        fetchFn = null,
        url = null,
        modelId = null,
        file = null,
        expectedBytes = null,
        expectedSha256 = null
    } = {}) {
        const id = modelId || MODEL_ID;
        const spec = MODEL_SPECS[id] || null;
        // Pinler yalnızca resmî URL kullanılırken uygulanır. Test/ayna URL'si
        // verilmişse bütünlük için expectedBytes/SHA açıkça geçilmelidir.
        const useSpec = !!(spec && (!url || url === spec.url));
        this.modelDir = modelDir;
        this.fetchFn = fetchFn || ((...args) => fetch(...args));
        this.url = url || (spec && spec.url) || MODEL_URL;
        this.modelId = id;
        this.file = file || (spec && spec.file) || MODEL_FILE;
        this.expectedBytes = Number.isInteger(expectedBytes) ? expectedBytes : (useSpec ? spec.bytes : null);
        this.expectedSha256 = typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/i.test(expectedSha256)
            ? expectedSha256.toLowerCase()
            : (useSpec ? spec.sha256 : null);
        this.downloading = false;
    }

    modelPath() {
        if (!this.modelDir) return null;
        return path.join(this.modelDir, this.file);
    }

    partPath() {
        const full = this.modelPath();
        return full ? `${full}.part` : null;
    }

    manifestPath() {
        if (!this.modelDir) return null;
        // Her model dosyasının kendi manifesti (LLM + STT aynı dizinde çakışmaz).
        return path.join(this.modelDir, `${this.file}.manifest.json`);
    }

    ensureDir() {
        if (!this.modelDir) throw new Error('Model dizini tanımlı değil.');
        fs.mkdirSync(this.modelDir, { recursive: true });
    }

    readManifest() {
        try {
            const raw = fs.readFileSync(this.manifestPath(), 'utf8');
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    status() {
        const full = this.modelPath();
        const part = this.partPath();
        const manifest = this.readManifest();
        const present = !!(full && fs.existsSync(full));
        return {
            modelId: this.modelId,
            file: this.file,
            url: this.url,
            present,
            bytes: present ? fs.statSync(full).size : 0,
            expectedBytes: this.expectedBytes,
            expectedSha256: this.expectedSha256,
            partialBytes: !!(part && fs.existsSync(part)) ? fs.statSync(part).size : 0,
            manifest
        };
    }

    computeSha256(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    // Tam dosyayı manifest + pinlenmiş boyut/SHA'ya karşı doğrular.
    async verify() {
        const full = this.modelPath();
        const manifest = this.readManifest();
        if (!full || !fs.existsSync(full) || !manifest || !manifest.sha256) return false;
        const stat = fs.statSync(full);
        if (this.expectedBytes != null && stat.size !== this.expectedBytes) return false;
        if (this.expectedSha256 && manifest.sha256 !== this.expectedSha256) return false;
        const actual = await this.computeSha256(full);
        return actual === manifest.sha256 && (!this.expectedSha256 || actual === this.expectedSha256);
    }

    /**
     * Modeli indirir (varsa kaldığı yerden). Başarıda manifest yazar.
     * @param {(received:number,total:number|null)=>void} onProgress
     * @returns {Promise<{success:boolean, bytes:number, sha256?:string, resumed?:boolean, error?:string}>}
     */
    async download(onProgress = null) {
        if (!this.modelDir) {
            return { success: false, error: 'Model dizini tanımlı değil.' };
        }
        // Eşzamanlı çift indirme aynı .part dosyasını bozar — ikinci çağrı reddedilir.
        if (this.downloading) {
            return { success: false, code: 'ALREADY_DOWNLOADING', error: 'İndirme zaten sürüyor.' };
        }
        this.downloading = true;
        try {
            return await this.downloadInner(onProgress);
        } finally {
            this.downloading = false;
        }
    }

    async downloadInner(onProgress = null, attempt = 0) {
        this.ensureDir();
        const full = this.modelPath();
        const part = this.partPath();

        if (fs.existsSync(full)) {
            const ok = await this.verify();
            if (ok) {
                return { success: true, bytes: fs.statSync(full).size, sha256: this.readManifest().sha256, resumed: false };
            }
            log.warn('[ModelManager] mevcut dosya manifest/pin ile uyuşmuyor, yeniden indiriliyor.');
            fs.rmSync(full, { force: true });
        }

        let startAt = fs.existsSync(part) ? fs.statSync(part).size : 0;
        if (this.expectedBytes != null && startAt > this.expectedBytes) {
            fs.rmSync(part, { force: true });
            startAt = 0;
        }
        const headers = startAt > 0 ? { Range: `bytes=${startAt}-` } : {};
        let res;
        try {
            res = await this.fetchFn(this.url, { headers });
        } catch (err) {
            return { success: false, error: `Bağlantı hatası: ${err.message}` };
        }

        // 416: .part zaten tam olabilir; değilse baştan tek deneme.
        if (res.status === 416) {
            const total = this.parseUnsatisfiedTotal(res);
            if (this.expectedBytes != null && startAt === this.expectedBytes && total === this.expectedBytes) {
                // Aşağıdaki doğrulama akışına devam etmek için gövdesiz finalize.
                return this.finalizeDownload(part, full, startAt, onProgress);
            }
            if (attempt < 1) {
                fs.rmSync(part, { force: true });
                return this.downloadInner(onProgress, attempt + 1);
            }
            return { success: false, error: 'Sunucu Range isteğini reddetti (HTTP 416).', bytes: startAt };
        }

        if (res.status === 200 && startAt > 0) {
            // Sunucu Range'i yok saydı: dosya baştan yazılır.
            startAt = 0;
        }
        if (res.status !== 200 && res.status !== 206) {
            return { success: false, error: `Sunucu hatası: HTTP ${res.status}` };
        }

        if (res.status === 206) {
            const rangeStart = this.parseContentRangeStart(res);
            if (rangeStart != null && rangeStart !== startAt) {
                if (attempt < 1) {
                    fs.rmSync(part, { force: true });
                    return this.downloadInner(onProgress, attempt + 1);
                }
                return { success: false, error: `Content-Range uyuşmazlığı (beklenen ${startAt}, gelen ${rangeStart}).` };
            }
        }

        if (!res.body) {
            return { success: false, error: 'Sunucu gövdesi boş (res.body null).' };
        }

        const total = this.parseTotal(res, startAt);
        if (this.expectedBytes != null && total != null && total !== this.expectedBytes) {
            return { success: false, error: `Boyut uyuşmazlığı (beklenen ${this.expectedBytes}, sunucu ${total}).` };
        }

        const out = fs.createWriteStream(part, { flags: startAt > 0 ? 'a' : 'w' });
        let received = startAt;
        try {
            for await (const chunk of res.body) {
                received += chunk.length;
                if (this.expectedBytes != null && received > this.expectedBytes) {
                    throw new Error(`Beklenenden fazla bayt: ${received} > ${this.expectedBytes}`);
                }
                if (!out.write(chunk)) {
                    await once(out, 'drain');
                }
                if (onProgress) {
                    try { onProgress(received, total); } catch (_) {}
                }
            }
            out.end();
            await once(out, 'finish');
        } catch (err) {
            try { out.destroy(); } catch (_) {}
            return { success: false, error: `İndirme kesildi: ${err.message}`, bytes: received };
        }

        return this.finalizeDownload(part, full, received, onProgress);
    }

    async finalizeDownload(part, full, received, onProgress) {
        let actualBytes;
        try {
            actualBytes = fs.statSync(part).size;
        } catch (_) {
            return { success: false, error: 'İndirilen .part dosyası bulunamadı.' };
        }

        if (this.expectedBytes != null && actualBytes !== this.expectedBytes) {
            // Eksik dosya resume için saklanır; fazla dosya silinir.
            if (actualBytes > this.expectedBytes) fs.rmSync(part, { force: true });
            return { success: false, error: `Boyut doğrulaması başarısız (${actualBytes}/${this.expectedBytes}).`, bytes: actualBytes };
        }

        let sha256;
        try {
            sha256 = await this.computeSha256(part);
        } catch (err) {
            return { success: false, error: `SHA-256 hesaplanamadı: ${err.message}`, bytes: actualBytes };
        }
        if (this.expectedSha256 && sha256 !== this.expectedSha256) {
            fs.rmSync(part, { force: true });
            return { success: false, error: `SHA-256 uyuşmazlığı (${sha256}).`, bytes: actualBytes };
        }

        try {
            fs.renameSync(part, full);
        } catch (err) {
            return { success: false, error: `Dosya taşınamadı: ${err.message}`, bytes: actualBytes };
        }

        const manifest = {
            modelId: this.modelId,
            file: this.file,
            url: this.url,
            bytes: actualBytes,
            sha256,
            expectedBytes: this.expectedBytes,
            downloadedAt: new Date().toISOString()
        };
        fs.writeFileSync(this.manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
        log.info(`[ModelManager] indirildi: ${this.file} (${actualBytes} bayt)`);
        return { success: true, bytes: actualBytes, sha256, resumed: actualBytes !== received ? false : received > 0 };
    }

    parseUnsatisfiedTotal(res) {
        try {
            const cr = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-range') : null;
            const m = cr && cr.match(/^bytes\s+\*\/(\d+)$/i);
            return m ? parseInt(m[1], 10) : null;
        } catch (_) {
            return null;
        }
    }

    parseContentRangeStart(res) {
        try {
            const cr = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-range') : null;
            const m = cr && cr.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
            return m ? parseInt(m[1], 10) : null;
        } catch (_) {
            return null;
        }
    }

    parseTotal(res, startAt) {
        // 206: Content-Range: bytes 100-999/1234 ; 200: Content-Length.
        try {
            const cr = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-range') : null;
            if (cr) {
                const m = cr.match(/\/(\d+)\s*$/);
                if (m) return parseInt(m[1], 10);
            }
            const cl = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : null;
            if (cl) return parseInt(cl, 10) + startAt;
        } catch (_) {}
        return null;
    }

    /**
     * AI paketi (LLM + STT) sıralı indirilir. onProgress({file, received, total,
     * step, steps}) her chunk'ta çağrılır; indirme bitmiş dosya atlanır
     * (sonuçta skipped:true). Çift-başlatma ALREADY_DOWNLOADING ile reddedilir.
     * @param {ModelManager} llm
     * @param {ModelManager} stt
     * @param {(ev:{file:string,received:number,total:number|null,step:number,steps:number})=>void} onProgress
     * @returns {Promise<{llm:object, stt:object}>}
     */
    static async downloadBundle(llm, stt, onProgress = null) {
        if (!llm || !stt) {
            throw Object.assign(new Error('LLM ve STT yöneticileri gerekli.'), { code: 'INVALID_MANAGERS' });
        }
        if (llm.downloading || stt.downloading) {
            return { llm: { success: false, code: 'ALREADY_DOWNLOADING', error: 'İndirme zaten sürüyor.' }, stt: { success: false, code: 'ALREADY_DOWNLOADING', error: 'İndirme zaten sürüyor.' } };
        }
        const steps = [
            { mgr: llm, step: 1 },
            { mgr: stt, step: 2 }
        ];
        const out = {};
        for (const { mgr, step } of steps) {
            const tag = step === 1 ? 'llm' : 'stt';
            const probe = mgr.status();
            if (probe.present) {
                const ok = await mgr.verify().catch(() => false);
                if (ok) {
                    out[tag] = { success: true, skipped: true, bytes: probe.bytes };
                    if (onProgress) {
                        try { onProgress({ file: mgr.file, received: probe.bytes, total: probe.bytes, step, steps: 2, skipped: true }); } catch (_) {}
                    }
                    continue;
                }
            }
            const res = await mgr.download((received, total) => {
                if (!onProgress) return;
                try { onProgress({ file: mgr.file, received, total, step, steps: 2 }); } catch (_) {}
            });
            out[tag] = res;
            if (!res.success) break; // LLM patlarsa STT'ye geçilmez
        }
        return out;
    }
}

module.exports = {
    ModelManager,
    MODEL_SPECS,
    MODEL_ID,
    MODEL_FILE,
    MODEL_URL,
    MODEL_BYTES,
    MODEL_SHA256,
    STT_MODEL_ID,
    STT_MODEL_FILE,
    STT_MODEL_URL,
    STT_MODEL_BYTES,
    STT_MODEL_SHA256
};
