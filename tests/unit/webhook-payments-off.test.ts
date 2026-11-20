import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/platform/db/connect';

/**
 * With payments off (a Stripe Identity-only setup), Stripe's payment and dispute events are answered as ignored only
 * when they're signed (security review SEC23): the inbox records what's answered, and an ignored event id counts as
 * handled, so an unsigned one could have claimed a real event's id before Stripe sent it.
 */
vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_payments_off';
  process.env.STRIPE_SECRET_KEY ||= 'sk_test_payments_off';
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-payments-off';
});
vi.mock('@/platform/db/client', () => ({ db: {} }));
vi.mock('@/modules/bookings/server', () => ({ bookingDeps: () => null }));

const { dispatchWebhook } = await import('@/modules/webhooks/dispatch');
const db = {} as Db;
const payload = JSON.stringify({ id: 'evt_claim_attempt', object: 'event', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x' } } });

describe('Stripe payment events while payments are off', () => {
  it('refuses an unsigned one, so the inbox records nothing', async () => {
    expect(await dispatchWebhook('stripe', db, payload, { 'stripe-signature': 't=1,v1=forged' }, new Date())).toEqual({ status: 400, body: { ok: false } });
  });

  it('answers a signed one as ignored', async () => {
    const now = new Date();
    const t = Math.floor(now.getTime() / 1000);
    const signature = createHmac('sha256', 'whsec_test_payments_off').update(`${t}.${payload}`).digest('hex');
    expect(await dispatchWebhook('stripe', db, payload, { 'stripe-signature': `t=${t},v1=${signature}` }, now)).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });
});
