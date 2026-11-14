import { describe, expect, it, vi } from 'vitest';
import { createStripeConnect, parseConnectEvent, payoutStatusOf, stripeConnectFromEnv } from './stripe-connect';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeStripe(answer: (method: string, path: string, params: URLSearchParams) => Response) {
  const calls: { method: string; path: string; params: URLSearchParams; headers: Record<string, string> }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url);
    const method = init?.method ?? 'GET';
    const params = method === 'POST' ? new URLSearchParams(String(init?.body)) : searchParams;
    calls.push({ method, path: pathname.replace('/v1', ''), params, headers: init?.headers as Record<string, string> });
    return answer(method, pathname.replace('/v1', ''), params);
  });
  return { connect: createStripeConnect({ secretKey: 'sk_test_x', fetch: fetcher as unknown as typeof fetch }), calls };
}

describe('Stripe Connect payouts', () => {
  it('opens one Express account per helper, and Stripe’s onboarding for it', async () => {
    const { connect, calls } = fakeStripe((method, path) => (path === '/accounts' ? json({ id: 'acct_123' }) : json({ url: 'https://connect.stripe.com/setup/e/acct_123/abc' })));
    expect(await connect.createAccount({ userId: 'usr_jordan', email: 'jordan@example.test' })).toBe('acct_123');
    expect(Object.fromEntries(calls[0]!.params)).toEqual({ type: 'express', country: 'US', email: 'jordan@example.test', business_type: 'individual', 'capabilities[transfers][requested]': 'true', 'metadata[user_id]': 'usr_jordan' });
    expect(calls[0]!.headers['Idempotency-Key']).toBe('account:usr_jordan');
    const back = 'https://app.example/app/helper/onboarding/payout';
    expect(await connect.onboardingLink({ accountId: 'acct_123', returnUrl: back, refreshUrl: back })).toBe('https://connect.stripe.com/setup/e/acct_123/abc');
    expect(Object.fromEntries(calls[1]!.params)).toEqual({ account: 'acct_123', type: 'account_onboarding', return_url: back, refresh_url: back });
  });

  it('reads an account as the app’s payout status', () => {
    expect(payoutStatusOf({ capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null } })).toBe('active');
    expect(payoutStatusOf({ capabilities: { transfers: 'inactive' }, payouts_enabled: false, requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } })).toBe('requirements_due');
    expect(payoutStatusOf({ capabilities: { transfers: 'pending' }, payouts_enabled: false, requirements: { currently_due: [], disabled_reason: 'requirements.pending_verification' } })).toBe('pending');
    expect(payoutStatusOf({ capabilities: { transfers: 'inactive' }, payouts_enabled: false, requirements: { currently_due: [], disabled_reason: 'rejected.fraud' } })).toBe('restricted');
    expect(payoutStatusOf({})).toBe('pending');
  });

  it('moves earnings as a transfer tied to the booking’s charge, once per earnings row', async () => {
    const { connect, calls } = fakeStripe((method, path) => (path.startsWith('/payment_intents/') ? json({ id: 'pi_1', latest_charge: 'ch_1', amount_received: 6600 }) : json({ id: 'tr_1' })));
    expect(await connect.chargeOf('pi_1')).toEqual({ chargeId: 'ch_1', amountCents: 6600 });
    expect(await connect.transfer({ amountCents: 5400, accountId: 'acct_123', sourceChargeId: 'ch_1', group: 'booking:bkg_1', idempotencyKey: 'transfer:ern_1' })).toEqual({ ok: true, transferId: 'tr_1' });
    expect(Object.fromEntries(calls[1]!.params)).toEqual({ amount: '5400', currency: 'usd', destination: 'acct_123', transfer_group: 'booking:bkg_1', source_transaction: 'ch_1' });
    expect(calls[1]!.headers['Idempotency-Key']).toBe('transfer:ern_1');
  });

  it('waits for an account that can’t take transfers yet, and rethrows anything else', async () => {
    const notReady = fakeStripe(() => json({ error: { type: 'invalid_request_error', code: 'insufficient_capabilities_for_transfer' } }, 400));
    expect(await notReady.connect.transfer({ amountCents: 1, accountId: 'acct_1', group: 'g', idempotencyKey: 'k' })).toEqual({ ok: false, reason: 'account_not_ready' });
    const down = fakeStripe(() => json({ error: { type: 'api_error' } }, 500));
    await expect(down.connect.transfer({ amountCents: 1, accountId: 'acct_1', group: 'g', idempotencyKey: 'k' })).rejects.toThrow('Stripe answered 500');
  });

  it('turns Connect events into account states and payouts', () => {
    expect(parseConnectEvent({ type: 'account.updated', data: { object: { id: 'acct_1', capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [] } } } })).toEqual({ kind: 'account', accountId: 'acct_1', status: 'active' });
    expect(parseConnectEvent({ type: 'payout.paid', account: 'acct_1', data: { object: { id: 'po_1', amount: 5400, status: 'paid', arrival_date: Date.parse('2026-11-20T00:00:00Z') / 1000, created: Date.parse('2026-11-18T12:00:00Z') / 1000 } } })).toEqual({
      kind: 'payout', accountId: 'acct_1', payoutId: 'po_1', amountCents: 5400, status: 'paid', arrivalDate: '2026-11-20', createdAt: new Date('2026-11-18T12:00:00Z'),
    });
    expect(parseConnectEvent({ type: 'payout.paid', data: { object: { id: 'po_1' } } })).toBeNull();
    expect(parseConnectEvent({ type: 'charge.succeeded', data: { object: { id: 'ch_1' } } })).toBeNull();
  });

  it('tells a bank account Stripe can pay out to from one it stopped using', () => {
    const bank = (type: string, object: Record<string, unknown>, account: string | null = 'acct_1') => parseConnectEvent({ type, ...(account ? { account } : {}), data: { object: { id: 'ba_1', object: 'bank_account', ...object } } });
    expect(bank('account.external_account.created', { status: 'new', default_for_currency: true })).toEqual({ kind: 'external_account', accountId: 'acct_1', usable: true });
    expect(bank('account.external_account.updated', { status: 'verified', default_for_currency: true })).toEqual({ kind: 'external_account', accountId: 'acct_1', usable: true });
    // After a failed payout Stripe disables the bank; an extra account that isn't the default pays nothing out.
    expect(bank('account.external_account.updated', { status: 'errored', default_for_currency: true })).toEqual({ kind: 'external_account', accountId: 'acct_1', usable: false });
    expect(bank('account.external_account.created', { status: 'new', default_for_currency: false })).toEqual({ kind: 'external_account', accountId: 'acct_1', usable: false });
    // The connected account from the object when the event doesn't name it; neither: nothing to act on.
    expect(bank('account.external_account.created', { status: 'new', default_for_currency: true, account: 'acct_2' }, null)).toEqual({ kind: 'external_account', accountId: 'acct_2', usable: true });
    expect(bank('account.external_account.created', { status: 'new', default_for_currency: true }, null)).toBeNull();
    expect(bank('account.external_account.deleted', { status: 'new', default_for_currency: true })).toBeNull();
  });

  it('is on with the Stripe payment keys', () => {
    expect(stripeConnectFromEnv({})).toBeNull();
    expect(stripeConnectFromEnv({ STRIPE_SECRET_KEY: 'sk_test' })).toBeNull();
    expect(stripeConnectFromEnv({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_PUBLISHABLE_KEY: 'pk_test' })?.provider).toBe('stripe');
  });

  it('reverses a transfer with the case on it, and says when the helper’s balance can’t cover it', async () => {
    const ok = fakeStripe(() => json({ id: 'trr_1' }));
    expect(await ok.connect.reverseTransfer({ transferId: 'tr_9', amountCents: 2700, idempotencyKey: 'trr:rev_1', caseId: 'case_1' })).toEqual({ ok: true, reversalId: 'trr_1' });
    expect(ok.calls[0]).toMatchObject({ method: 'POST', path: '/transfers/tr_9/reversals' });
    expect(Object.fromEntries(ok.calls[0]!.params)).toEqual({ amount: '2700', 'metadata[case_id]': 'case_1' });
    expect(ok.calls[0]!.headers['Idempotency-Key']).toBe('trr:rev_1');

    const short = fakeStripe(() => json({ error: { type: 'invalid_request_error', code: 'insufficient_funds' } }, 400));
    expect(await short.connect.reverseTransfer({ transferId: 'tr_9', amountCents: 2700, idempotencyKey: 'trr:rev_2', caseId: 'case_1' })).toEqual({ ok: false, reason: 'insufficient' });
    const done = fakeStripe(() => json({ error: { type: 'invalid_request_error', code: 'transfer_already_reversed' } }, 400));
    expect(await done.connect.reverseTransfer({ transferId: 'tr_9', amountCents: 2700, idempotencyKey: 'trr:rev_3', caseId: 'case_1' })).toEqual({ ok: false, reason: 'already_reversed' });
  });
});

