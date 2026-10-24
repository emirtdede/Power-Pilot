/**
 * OrderQueue.js — FAZ B.
 * Konsol emirleri için kalıcı, idempotent kuyruk (çevrimdışı → bekliyor).
 * - Tekrar-gönderim aynı idempotencyKey/nonce ile gelirse TEK kayıt tutulur.
 * - Durumlar: pending → acked (sonuçla) ; eski acked kayıtlar purge ile temizlenir.
 * Depolama: StorageService orders koleksiyonu.
 */

const MAX_ORDERS = 200;

class OrderQueue {
    constructor(storageService = null) {
        this.storage = storageService;
        this.memory = []; // storage yoksa (test) bellek modu
    }

    load() {
        if (this.storage && typeof this.storage.getOrders === 'function') {
            const list = this.storage.getOrders();
            return Array.isArray(list) ? list : [];
        }
        return this.memory;
    }

    persist(list) {
        if (this.storage && typeof this.storage.saveOrders === 'function') {
            this.storage.saveOrders(list);
        } else {
            this.memory = list;
        }
    }

    static keyOf(signed) {
        const order = (signed && signed.order) || {};
        if (typeof order.nonce === 'string' && order.nonce) return `nonce:${order.nonce}`;
        if (typeof signed.idempotencyKey === 'string' && signed.idempotencyKey) {
            return `key:${signed.idempotencyKey}`;
        }
        return null;
    }

    /**
     * Doğrulanmış imzalı emri kuyruğa alır. Aynı anahtar varsa mevcut kayıt döner
     * (yeniden oluşturulmaz) → idempotent.
     * K6: kapasite dolunca önce acked kayıtlar budanır; bekleyen (pending) emir
     * ASLA otomatik düşürülmez — yer yoksa QUEUE_FULL ile reddedilir.
     */
    enqueue(signed, { idempotencyKey = null } = {}) {
        if (!signed || typeof signed !== 'object' || !signed.order) {
            throw Object.assign(new Error('Geçersiz emir.'), { code: 'INVALID_ORDER' });
        }
        const key = (typeof idempotencyKey === 'string' && idempotencyKey)
            || OrderQueue.keyOf(signed)
            || `auto:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        let list = this.load();
        const existing = list.find((o) => o.key === key);
        if (existing) return { record: existing, duplicate: true };
        if (list.length >= MAX_ORDERS) {
            list = this.makeRoom(list);
            if (list.length >= MAX_ORDERS) {
                throw Object.assign(new Error('Emir kuyruğu dolu.'), { code: 'QUEUE_FULL' });
            }
        }
        const record = {
            key,
            order: signed.order,
            signature: signed.signature || null,
            alg: signed.alg || 'ed25519',
            status: 'pending',
            receivedAt: new Date().toISOString(),
            ackedAt: null,
            result: null,
            receiptSent: false // Denetim: konsola makbuzu gönderildi mi
        };
        list.push(record);
        this.persist(list);
        return { record, duplicate: false };
    }

    /**
     * K6: Yer açma — süresi dolmuş acked kayıtlar (purge), sonra en eski
     * acked kayıtlar. Pending'e dokunulmaz. Yeni listeyi döner (persist eder).
     */
    makeRoom(list) {
        const nowMs = Date.now();
        let kept = list.filter((o) => {
            if (o.status === 'pending') return true;
            const t = new Date(o.ackedAt || o.receivedAt).getTime();
            return Number.isFinite(t) && (nowMs - t) < 7 * 86400000;
        });
        while (kept.length >= MAX_ORDERS) {
            const idx = kept.findIndex((o) => o.status !== 'pending');
            if (idx < 0) break;
            kept.splice(idx, 1);
        }
        if (kept.length !== list.length) this.persist(kept);
        return kept;
    }

    pending() {
        return this.load().filter((o) => o.status === 'pending');
    }

    ack(key, result = {}) {
        const list = this.load();
        const rec = list.find((o) => o.key === key);
        if (!rec) return null;
        rec.status = 'acked';
        rec.ackedAt = new Date().toISOString();
        rec.result = {
            code: String(result.code || 'unknown').slice(0, 40),
            message: String(result.message || '').slice(0, 200)
        };
        this.persist(list);
        return rec;
    }

    /**
     * WP-07: Gönderilecek makbuzları yalnızca OKUR; teslim edilene kadar
     * `receiptSent` işaretlenmez. Böylece heartbeat hatasında makbuz kaybolmaz.
     */
    peekUnsentReceipts() {
        const out = [];
        for (const o of this.load()) {
            if (o.status === 'acked' && !o.receiptSent && o.order) {
                out.push({
                    key: o.key,
                    nonce: o.order.nonce || null,
                    action: o.order.action || null,
                    code: (o.result && o.result.code) || 'unknown',
                    message: (o.result && o.result.message) || '',
                    ackedAt: o.ackedAt
                });
            }
        }
        return out;
    }

    markReceiptsSent(receipts = []) {
        const keys = new Set((receipts || []).map((r) => r && r.key).filter(Boolean));
        if (keys.size === 0) return 0;
        const list = this.load();
        let marked = 0;
        for (const o of list) {
            if (keys.has(o.key) && !o.receiptSent) {
                o.receiptSent = true;
                o.receiptSentAt = new Date().toISOString();
                marked += 1;
            }
        }
        if (marked > 0) this.persist(list);
        return marked;
    }

    markReceiptsFailed(receipts = [], error = '') {
        const keys = new Set((receipts || []).map((r) => r && r.key).filter(Boolean));
        if (keys.size === 0) return 0;
        const list = this.load();
        let marked = 0;
        for (const o of list) {
            if (keys.has(o.key) && !o.receiptSent) {
                o.receiptAttempts = (o.receiptAttempts || 0) + 1;
                o.lastReceiptError = String(error || '').slice(0, 200);
                o.lastReceiptAttemptAt = new Date().toISOString();
                marked += 1;
            }
        }
        if (marked > 0) this.persist(list);
        return marked;
    }

    /**
     * Geriye uyumlu API: oku + hemen gönderildi işaretle.
     * Üretim yolu ConsoleClient'ta peek/mark ayrımını kullanır.
     */
    takeUnsentReceipts() {
        const out = this.peekUnsentReceipts();
        this.markReceiptsSent(out);
        return out;
    }

    /** 7 günden eski acked kayıtları temizler; kuyruk şişmez. */
    purge(nowMs = Date.now()) {
        const list = this.load();
        const kept = list.filter((o) => {
            if (o.status === 'pending') return true;
            const t = new Date(o.ackedAt || o.receivedAt).getTime();
            return Number.isFinite(t) && (nowMs - t) < 7 * 86400000;
        });
        const removed = list.length - kept.length;
        if (removed > 0) this.persist(kept);
        return removed;
    }
}

module.exports = { OrderQueue, MAX_ORDERS };
