/**
 * SttService.js — WBS-8.1
 * Yerel konuşma-metin servisi (whisper.cpp binding, Spike WBS-8.0 kararı:
 * `@fugood/whisper.node`, MIT, win-x64 hazır ikili, API doğrulanmış).
 *
 * Kurallar:
 * - Dil her zaman açıkça verilir (otomatik algılama yok — hızlı + isabetli).
 * - Enerji kapısı: sessizlik/kısa kayıt modele gitmeden reddedilir
 *   (halüsinasyon önlemi, ek VAD modeli indirmeden).
 * - Kayıt tavanı 15sn (240000 örnek @16kHz); uzun kayıt kırpılır + işaretlenir.
 * - Model yoksa fail-closed: {ok:false, code:'STT_MODEL_MISSING'}.
 */

const fs = require('fs');
const path = require('path');
const log = require('../logger');

const SAMPLE_RATE = 16000;
const MIN_SAMPLES = 8000; // 0.5sn
const MAX_SAMPLES = 240000; // 15sn
const SPEECH_THRESHOLD = 0.02; // mutlak genlik eşiği
const MIN_SPEECH_RATIO = 0.10; // kaydın en az %10'u konuşma olmalı

// WBS-8.1 eki: 17 arayüz dili → whisper dil kodu.
const STT_LANGS = {
    tr: 'tr', en: 'en', de: 'de', sv: 'sv', no: 'nn', da: 'da', fr: 'fr',
    pl: 'pl', it: 'it', nl: 'nl', cs: 'cs', es: 'es', pt: 'pt', ja: 'ja',
    zh: 'zh', ko: 'ko', ar: 'ar'
};

// ggerganov/whisper.cpp resmi tablosundan doğrulanmış değerler.
const STT_MODELS = {
    base: { file: 'ggml-base.bin', bytes: 142, sha256: '465707469ff3a37a2b9b8d8f89f2f99de7299dac' },
    tiny: { file: 'ggml-tiny.bin', bytes: 75, sha256: 'bd577a113a864445d4c299885e0cb97d4ba92b5f' }
};

class SttService {
    // whisperModule: test izolasyonu için (varsayılan: gerçek dinamik import).
    constructor({ modelDir = null, modelId = 'base', whisperModule = null } = {}) {
        this.modelDir = modelDir;
        this.modelId = modelId in STT_MODELS ? modelId : 'base';
        this.whisperModule = whisperModule;
        this.context = null;
    }

    modelPath() {
        if (!this.modelDir) return null;
        return path.join(this.modelDir, STT_MODELS[this.modelId].file);
    }

    getStatus() {
        const p = this.modelPath();
        const present = !!(p && fs.existsSync(p));
        return {
            ready: present && !!this.context,
            modelPresent: present,
            modelId: this.modelId,
            modelFile: STT_MODELS[this.modelId].file
        };
    }

    async ensureBinding() {
        if (this.whisperModule) return this.whisperModule;
        const mod = await import('@fugood/whisper.node');
        this.whisperModule = mod.default || mod;
        return this.whisperModule;
    }

    async ensureContext() {
        if (this.context) return this.context;
        const p = this.modelPath();
        if (!p || !fs.existsSync(p)) {
            throw new Error('STT_MODEL_MISSING');
        }
        const binding = await this.ensureBinding();
        if (typeof binding.initWhisper !== 'function') {
            throw new Error('STT_BINDING_UNSUPPORTED');
        }
        this.context = await binding.initWhisper({ filePath: p, useGpu: false });
        return this.context;
    }

    // Enerji kapısı: {speechRatio} — saf, test edilebilir.
    static speechRatio(samples) {
        if (!samples || samples.length === 0) return 0;
        let voiced = 0;
        for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) >= SPEECH_THRESHOLD) voiced += 1;
        }
        return voiced / samples.length;
    }

    static toFloat32Array(input) {
        if (input instanceof Float32Array) return input;
        if (Array.isArray(input)) return Float32Array.from(input);
        return null;
    }

    /**
     * @param {Float32Array|number[]} pcm16k — 16kHz mono örnekler
     * @param {string} uiLang — arayüz dili (STT_LANGS ile eşlenir, varsayılan 'tr')
     */
    async transcribePcm(pcm16k, uiLang = 'tr') {
        const samples = SttService.toFloat32Array(pcm16k);
        if (!samples) {
            return { ok: false, code: 'INVALID_AUDIO', message: 'Ses verisi anlaşılmadı.' };
        }
        if (samples.length < MIN_SAMPLES) {
            return { ok: false, code: 'TOO_SHORT', message: 'Kayıt çok kısa (en az 0.5sn konuşun).' };
        }
        let truncated = false;
        let work = samples;
        if (samples.length > MAX_SAMPLES) {
            work = samples.subarray ? samples.subarray(0, MAX_SAMPLES) : samples.slice(0, MAX_SAMPLES);
            truncated = true;
        }
        if (SttService.speechRatio(work) < MIN_SPEECH_RATIO) {
            return { ok: false, code: 'SILENCE', message: 'Sessizlik algılandı, bir şey duyamadım.' };
        }
        let context;
        try {
            context = await this.ensureContext();
        } catch (err) {
            const code = err && err.message === 'STT_MODEL_MISSING' ? 'STT_MODEL_MISSING' : 'STT_UNAVAILABLE';
            return { ok: false, code, message: code === 'STT_MODEL_MISSING' ? 'Ses modeli indirilmedi.' : 'Ses motoru başlatılamadı.' };
        }
        try {
            const { promise } = await context.transcribeData(work.buffer.slice(work.byteOffset, work.byteOffset + work.byteLength), {
                language: STT_LANGS[uiLang] || 'tr'
            });
            const result = await promise;
            const text = String((result && result.result) || '').trim();
            if (!text) {
                return { ok: false, code: 'NOT_HEARD', message: 'Anlaşılmadı, tekrar deneyin.' };
            }
            return { ok: true, text, truncated };
        } catch (err) {
            log.warn(`[SttService] deşifre hatası: ${err && err.message}`);
            return { ok: false, code: 'TRANSCRIBE_FAILED', message: 'Deşifre başarısız.' };
        }
    }

    async unload() {
        if (this.context && typeof this.context.release === 'function') {
            try { await this.context.release(); } catch (_) {}
        }
        this.context = null;
    }
}

module.exports = { SttService, STT_LANGS, STT_MODELS, SAMPLE_RATE, MIN_SAMPLES, MAX_SAMPLES };
