import { describe, expect, it } from 'vitest';
import { noteCodeNotSent, trackCodeDelivery } from './code-delivery';

describe('code delivery (when things break, 2026-11-21)', () => {
  it('tells the asking action whether the code went out, through the library that swallows the error', async () => {
    // As Better Auth does: it awaits the send and catches what it throws.
    const swallowing = (send: () => Promise<void>) => send().catch(() => undefined);
    expect(await trackCodeDelivery(() => swallowing(async () => {}))).toEqual({ sent: true });
    expect(await trackCodeDelivery(() => swallowing(async () => { noteCodeNotSent(); throw new Error('Postmark 503'); }))).toEqual({ sent: false });
    // Each request is its own.
    const [one, two] = await Promise.all([trackCodeDelivery(async () => noteCodeNotSent()), trackCodeDelivery(async () => {})]);
    expect([one.sent, two.sent]).toEqual([false, true]);
    expect(() => noteCodeNotSent()).not.toThrow();
  });
});
