/**
 * order-queue.test.mjs — FAZ B
 * Idempotent kuyruk: tekrar-gönderim tek kayıt, ack, purge.
 */
import { describe, it, expect } from 'vitest';
import { OrderQueue } from '../../src/main/services/OrderQueue.js';

function signed(nonce) {
    return { order: { action: 'lock', nonce, issuedAt: Date.now() }, signature: 'x', alg: 'ed25519' };
}

describe('OrderQueue', () => {
    it('aynı nonce ikinci kez kuyruğa girmez', () => {
        const q = new OrderQueue(null);
        const first = q.enqueue(signed('n1'));
        const second = q.enqueue(signed('n1'));
        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(true);
        expect(q.pending()).toHaveLength(1);
    });

    it('farklı nonce ayrı kayıt', () => {
        const q = new OrderQueue(null);
        q.enqueue(signed('n1'));
        q.enqueue(signed('n2'));
        expect(q.pending()).toHaveLength(2);
    });

    it('ack bekleyeni düşürür', () => {
        const q = new OrderQueue(null);
        const { record } = q.enqueue(signed('n1'));
        q.ack(record.key, { code: 'success', message: 'ok' });
        expect(q.pending()).toHaveLength(0);
    });

    it('purge eski acked kayıtları temizler, bekleyene dokunmaz', () => {
        const q = new OrderQueue(null);
        const { record } = q.enqueue(signed('n1'));
        q.ack(record.key, { code: 'success' });
        q.enqueue(signed('n2'));
        const removed = q.purge(Date.now() + 8 * 86400000);
        expect(removed).toBe(1);
        expect(q.pending()).toHaveLength(1);
    });

    it('bozuk emir reddedilir', () => {
        const q = new OrderQueue(null);
        expect(() => q.enqueue(null)).toThrow();
        expect(() => q.enqueue({})).toThrow();
    });

    it('dolu kuyruk bekleyeni düşürmez, QUEUE_FULL ile reddeder (K6)', () => {
        const q = new OrderQueue(null);
        for (let i = 0; i < 200; i++) q.enqueue(signed(`p-${i}`));
        expect(q.pending()).toHaveLength(200);
        let err = null;
        try { q.enqueue(signed('p-overflow')); } catch (e) { err = e; }
        expect(err && err.code).toBe('QUEUE_FULL');
        expect(q.pending()).toHaveLength(200);
        expect(q.pending().some((o) => o.order.nonce === 'p-0')).toBe(true);
    });

    it('taşmada önce acked budanır, pending korunur (K6)', () => {
        const q = new OrderQueue(null);
        for (let i = 0; i < 150; i++) {
            const { record } = q.enqueue(signed(`a-${i}`));
            q.ack(record.key, { code: 'success' });
        }
        for (let i = 0; i < 50; i++) q.enqueue(signed(`p-${i}`));
        const { record } = q.enqueue(signed('yeni'));
        expect(record.order.nonce).toBe('yeni');
        expect(q.pending().some((o) => o.order.nonce === 'p-0')).toBe(true);
        expect(q.pending()).toHaveLength(51);
    });
});
