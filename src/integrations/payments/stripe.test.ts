import { describe, expect, it, vi } from 'vitest';
import { createPaymentProvider, stripePublishableKey } from './index';
import { createStripePayments } from './stripe';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type Call = [string, RequestInit | undefined];

/** A fake Stripe: answers by method and path, and records each call. */
function fakeStripe(answer: (method: string, path: string, params: URLSearchParams) => Response) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const { pathname, searchParams } = new URL(url);
    const params = init?.method === 'POST' ? new URLSearchParams(String(init.body)) : searchParams;
    return answer(init?.method ?? 'GET', pathname.replace('/v1', ''), params);
  });
  return { payments: createStripePayments({ secretKey: 'sk_test_x', fetch: fetcher as unknown as typeof fetch }), calls };
}
const paramsOf = (call: Call) => new URLSearchParams(String(call[1]?.body));
const headersOf = (call: Call) => call[1]?.headers as Record<string, string>;
const cardError = (code: string, decline?: string) => json({ error: { type: 'card_error', code, ...(decline ? { decline_code: decline } : {}), payment_intent: { id: 'pi_declined', status: 'requires_payment_method' } } }, 402);

describe('Stripe payments', () => {
  it('charges a card on the person’s customer at once, with the app’s idempotency key', async () => {
    const { payments, calls } = fakeStripe(() => json({ id: 'pi_1', status: 'succeeded' }));
    const result = await payments.charge({ amountCents: 6600, method: { providerRef: 'pm_card', customerRef: 'cus_maya' }, idempotencyKey: 'booking:bkg_1:pay_1', description: 'TasksNearMe booking bkg_1' });
    expect(result).toEqual({ status: 'succeeded', providerRef: 'pi_1' });
    expect(calls[0]![0]).toBe('https://api.stripe.com/v1/payment_intents');
    expect(headersOf(calls[0]!)).toMatchObject({ Authorization: 'Bearer sk_test_x', 'Idempotency-Key': 'booking:bkg_1:pay_1' });
    expect(Object.fromEntries(paramsOf(calls[0]!))).toEqual({
      amount: '6600', currency: 'usd', payment_method: 'pm_card', 'payment_method_types[]': 'card', capture_method: 'automatic', confirm: 'true',
      description: 'TasksNearMe booking bkg_1', customer: 'cus_maya',
    });
  });

  it('hands the bank’s step to the browser, and reads declines as the app’s codes', async () => {
    const action = fakeStripe(() => json({ id: 'pi_3ds', status: 'requires_action', client_secret: 'pi_3ds_secret_abc' }));
    expect(await action.payments.charge({ amountCents: 100, method: { providerRef: 'pm_1' }, idempotencyKey: 'k', description: 'd' })).toEqual({ status: 'requires_action', providerRef: 'pi_3ds' });
    expect(await action.payments.clientSecretOf('pi_3ds')).toBe('pi_3ds_secret_abc');

    const poor = fakeStripe(() => cardError('card_declined', 'insufficient_funds'));
    expect(await poor.payments.charge({ amountCents: 100, method: { providerRef: 'pm_1' }, idempotencyKey: 'k', description: 'd' })).toEqual({ status: 'failed', providerRef: 'pi_declined', failureCode: 'insufficient_funds' });
    const stolen = fakeStripe(() => cardError('card_declined', 'stolen_card'));
    expect(await stolen.payments.authorize({ amountCents: 100, method: { providerRef: 'pm_1' }, idempotencyKey: 'k', description: 'd' })).toEqual({ status: 'failed', providerRef: 'pi_declined', failureCode: 'payment_declined' });
    // Not the card's fault: an error to retry, not a decline.
    const down = fakeStripe(() => json({ error: { type: 'api_error' } }, 500));
    await expect(down.payments.charge({ amountCents: 100, method: { providerRef: 'pm_1' }, idempotencyKey: 'k', description: 'd' })).rejects.toThrow('Stripe answered 500');
  });

  it('charges a saved card while the person is away, and asks for them when the bank insists', async () => {
    const away = fakeStripe(() => json({ id: 'pi_off', status: 'succeeded' }));
    expect(await away.payments.charge({ amountCents: 9000, method: { providerRef: 'pm_saved', customerRef: 'cus_maya' }, idempotencyKey: 'series:srs_1:visit_3', description: 'd', offSession: true })).toEqual({ status: 'succeeded', providerRef: 'pi_off' });
    expect(Object.fromEntries(paramsOf(away.calls[0]!))).toMatchObject({ off_session: 'true', confirm: 'true', customer: 'cus_maya', payment_method: 'pm_saved' });
    // On the person's session (the default), no off_session.
    await away.payments.charge({ amountCents: 1, method: { providerRef: 'pm_saved', customerRef: 'cus_maya' }, idempotencyKey: 'k', description: 'd' });
    expect(paramsOf(away.calls[1]!).has('off_session')).toBe(false);

    const bank = fakeStripe(() => json({ error: { type: 'card_error', code: 'authentication_required', payment_intent: { id: 'pi_needs_you', status: 'requires_payment_method' } } }, 402));
    expect(await bank.payments.charge({ amountCents: 9000, method: { providerRef: 'pm_saved', customerRef: 'cus_maya' }, idempotencyKey: 'k', description: 'd', offSession: true })).toEqual({ status: 'requires_action', providerRef: 'pi_needs_you' });
    expect(await bank.payments.authorize({ amountCents: 9000, method: { providerRef: 'pm_saved', customerRef: 'cus_maya' }, idempotencyKey: 'k', description: 'd', offSession: true })).toEqual({ status: 'requires_action', providerRef: 'pi_needs_you' });
    // Without the person's customer there's no saved card to use.
    await expect(away.payments.charge({ amountCents: 1, method: { providerRef: 'pm_x' }, idempotencyKey: 'k', description: 'd', offSession: true })).rejects.toThrow(/customerRef/);
  });

  it('holds an amount for a direct invite, captures part of it, or releases it', async () => {
    const { payments, calls } = fakeStripe((method, path) => {
      if (path === '/payment_intents') return json({ id: 'pi_hold', status: 'requires_capture' });
      if (path.endsWith('/capture')) return json({ id: 'pi_hold', status: 'succeeded' });
      return json({ error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state' } }, 400);
    });
    expect(await payments.authorize({ amountCents: 9000, method: { providerRef: 'pm_1', customerRef: 'cus_1' }, idempotencyKey: 'invite:inv_1:pay_1', description: 'd' })).toEqual({ status: 'authorized', providerRef: 'pi_hold' });
    expect(paramsOf(calls[0]!).get('capture_method')).toBe('manual');
    expect(await payments.capture({ authorizationRef: 'pi_hold', amountCents: 8500, idempotencyKey: 'capture:inv_1' })).toEqual({ status: 'succeeded' });
    expect(calls[1]![0]).toBe('https://api.stripe.com/v1/payment_intents/pi_hold/capture');
    expect(paramsOf(calls[1]!).get('amount_to_capture')).toBe('8500');
    // Releasing one that's already gone is fine.
    expect(await payments.cancelAuthorization({ authorizationRef: 'pi_hold' })).toEqual({ status: 'canceled' });
  });

  it('refunds part of a charge, counting a pending refund as done', async () => {
    const { payments, calls } = fakeStripe(() => json({ id: 're_1', status: 'pending' }));
    expect(await payments.refund({ chargeRef: 'pi_1', amountCents: 1500, idempotencyKey: 'refund:x' })).toEqual({ status: 'succeeded', refundRef: 're_1' });
    expect(Object.fromEntries(paramsOf(calls[0]!))).toEqual({ payment_intent: 'pi_1', amount: '1500' });
    const failed = fakeStripe(() => json({ id: 're_2', status: 'failed' }));
    expect((await failed.payments.refund({ chargeRef: 'pi_1', amountCents: 1, idempotencyKey: 'k' })).status).toBe('failed');
  });

  it('reads the outcome after the bank’s step from the intent itself', async () => {
    const done = fakeStripe(() => json({ id: 'pi_1', status: 'succeeded' }));
    expect(await done.payments.completeAction({ providerRef: 'pi_1', outcome: 'failed' })).toEqual({ status: 'succeeded' });
    const held = fakeStripe(() => json({ id: 'pi_1', status: 'requires_capture' }));
    expect(await held.payments.completeAction({ providerRef: 'pi_1', outcome: 'approved' })).toEqual({ status: 'succeeded' });
    const failed = fakeStripe(() => json({ id: 'pi_1', status: 'requires_payment_method', last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' } }));
    expect(await failed.payments.completeAction({ providerRef: 'pi_1', outcome: 'approved' })).toEqual({ status: 'failed', failureCode: 'insufficient_funds' });
    const abandoned = fakeStripe(() => json({ id: 'pi_1', status: 'requires_action' }));
    expect(await abandoned.payments.completeAction({ providerRef: 'pi_1', outcome: 'approved' })).toEqual({ status: 'failed', failureCode: 'payment_declined' });
  });

  it('takes a card from Stripe.js: checks the brand, makes the customer once, attaches the card', async () => {
    const { payments, calls } = fakeStripe((method, path) => {
      if (path === '/payment_methods/pm_new') return json({ id: 'pm_new', type: 'card', customer: null, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } });
      if (path === '/customers') return json({ id: 'cus_new' });
      return json({ id: 'pm_new', customer: 'cus_new' });
    });
    const customer = { userId: 'usr_maya', email: 'maya@example.test', name: 'Maya Rivera' };
    expect(await payments.prepareCard!({ paymentMethodRef: 'pm_new', customer })).toEqual({ ok: true, customerRef: 'cus_new', card: { providerRef: 'pm_new', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 } });
    expect(calls.map(([url, init]) => `${init?.method} ${new URL(url).pathname}`)).toEqual(['GET /v1/payment_methods/pm_new', 'POST /v1/customers', 'POST /v1/payment_methods/pm_new/attach']);
    expect(headersOf(calls[1]!)['Idempotency-Key']).toBe('customer:usr_maya');
    expect(paramsOf(calls[2]!).get('customer')).toBe('cus_new');

    // A stored customer is reused.
    const again = fakeStripe((method, path) => (path.startsWith('/payment_methods/pm_2') && method === 'GET' ? json({ id: 'pm_2', type: 'card', customer: null, card: { brand: 'mastercard', last4: '4444', exp_month: 1, exp_year: 2031 } }) : json({ id: 'pm_2' })));
    expect(await again.payments.prepareCard!({ paymentMethodRef: 'pm_2', customer: { ...customer, ref: 'cus_maya' } })).toMatchObject({ ok: true, customerRef: 'cus_maya' });
    expect(again.calls.some(([url]) => url.endsWith('/customers'))).toBe(false);
  });

  it('refuses card brands we don’t take, and cards that belong to someone else', async () => {
    const jcb = fakeStripe(() => json({ id: 'pm_j', type: 'card', customer: null, card: { brand: 'jcb', last4: '0000', exp_month: 1, exp_year: 2030 } }));
    expect(await jcb.payments.prepareCard!({ paymentMethodRef: 'pm_j', customer: { ref: 'cus_1', userId: 'u', email: 'e', name: 'n' } })).toEqual({ ok: false, reason: 'not_supported' });
    const theirs = fakeStripe(() => json({ id: 'pm_t', type: 'card', customer: 'cus_other', card: { brand: 'visa', last4: '4242', exp_month: 1, exp_year: 2030 } }));
    expect(await theirs.payments.prepareCard!({ paymentMethodRef: 'pm_t', customer: { ref: 'cus_mine', userId: 'u', email: 'e', name: 'n' } })).toEqual({ ok: false, reason: 'not_supported' });
  });
});

describe('choosing the payment provider', () => {
  it('takes Stripe with both keys; the stand-in keeps payments when only Identity is set up', () => {
    expect(createPaymentProvider({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_PUBLISHABLE_KEY: 'pk_test' })?.name).toBe('stripe');
    expect(createPaymentProvider({ STRIPE_SECRET_KEY: 'sk_test' })?.name).toBe('dev');
    expect(createPaymentProvider({})?.name).toBe('dev');
    expect(createPaymentProvider({ NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live' })).toBeNull();
    expect(stripePublishableKey({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_PUBLISHABLE_KEY: 'pk_test' })).toBe('pk_test');
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_test' })).toBeNull();
  });
});
