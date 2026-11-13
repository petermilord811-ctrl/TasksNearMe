import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createStripeIdentity, identityFailureReason, isAdult, parseStripeIdentityEvent, stripeIdentityFromEnv, verifyStripeSignature } from './index';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Stripe Identity', () => {
  it('opens a hosted document-and-selfie session for the person, once a minute at most', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ id: 'vs_123', url: 'https://verify.stripe.com/start/abc', status: 'requires_input' }));
    const identity = createStripeIdentity({ secretKey: 'sk_test_x', appUrl: 'https://app.example', fetch: fetcher as unknown as typeof fetch, now: () => new Date('2026-11-17T15:00:30.000Z') });
    expect(await identity.start('usr_jordan')).toEqual({ sessionId: 'vs_123', url: 'https://verify.stripe.com/start/abc' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/identity/verification_sessions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk_test_x', 'Idempotency-Key': `idv-usr_jordan-${Math.floor(Date.parse('2026-11-17T15:00:30.000Z') / 60_000)}` });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('type')).toBe('document');
    expect(body.get('options[document][require_matching_selfie]')).toBe('true');
    expect(body.get('options[document][require_live_capture]')).toBe('true');
    expect(body.getAll('options[document][allowed_types][]')).toEqual(['driving_license', 'id_card', 'passport']);
    expect(body.get('return_url')).toBe('https://app.example/app/helper/onboarding/identity');
    expect(body.get('client_reference_id')).toBe('usr_jordan');
    // A client's check comes back to their own page.
    await identity.start('usr_maya', { returnPath: '/app/verify-identity' });
    expect(new URLSearchParams(String(fetcher.mock.calls[1]![1]?.body)).get('return_url')).toBe('https://app.example/app/verify-identity');
  });

  it('reads the verified name and date of birth once, and redacts on request', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/redact') ? json({ id: 'vs_123' }) : json({ id: 'vs_123', status: 'verified', verified_outputs: { first_name: 'Jordan', last_name: 'Thompson', dob: { day: 4, month: 7, year: 1994 } } }),
    );
    const identity = createStripeIdentity({ secretKey: 'sk_test_x', appUrl: 'https://app.example', fetch: fetcher as unknown as typeof fetch });
    expect(await identity.verifiedOutputs('vs_123')).toEqual({ firstName: 'Jordan', lastName: 'Thompson', dob: { day: 4, month: 7, year: 1994 } });
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.stripe.com/v1/identity/verification_sessions/vs_123?expand%5B%5D=verified_outputs&expand%5B%5D=verified_outputs.dob');
    await identity.redact('vs_123');
    expect(fetcher.mock.calls[1]![0]).toBe('https://api.stripe.com/v1/identity/verification_sessions/vs_123/redact');
    await expect(createStripeIdentity({ secretKey: 'k', appUrl: 'https://app.example', fetch: (async () => json({}, 402)) as unknown as typeof fetch }).start('u')).rejects.toThrow(/402/);
  });

  it('accepts only webhooks Stripe signed, recently', () => {
    const payload = '{"id":"evt_1","type":"identity.verification_session.verified"}';
    const now = new Date('2026-11-17T15:00:00.000Z');
    const t = Math.floor(now.getTime() / 1000);
    const sign = (secret: string, at = t) => createHmac('sha256', secret).update(`${at}.${payload}`).digest('hex');
    const header = `t=${t},v1=${sign('whsec_test')},v0=deadbeef,secret=whsec_****`;
    expect(verifyStripeSignature({ payload, header, secret: 'whsec_test', now })).toBe(true);
    // A rolled secret: any v1 may match.
    expect(verifyStripeSignature({ payload, header: `t=${t},v1=${sign('whsec_old')},v1=${sign('whsec_test')}`, secret: 'whsec_test', now })).toBe(true);
    expect(verifyStripeSignature({ payload, header: `t=${t},v1=${sign('whsec_other')}`, secret: 'whsec_test', now })).toBe(false);
    expect(verifyStripeSignature({ payload: payload.replace('verified', 'canceled'), header, secret: 'whsec_test', now })).toBe(false);
    expect(verifyStripeSignature({ payload, header: `t=${t - 600},v1=${sign('whsec_test', t - 600)}`, secret: 'whsec_test', now })).toBe(false);
    expect(verifyStripeSignature({ payload, header: `t=${t},v0=${sign('whsec_test')}`, secret: 'whsec_test', now })).toBe(false);
    expect(verifyStripeSignature({ payload, header: null, secret: 'whsec_test', now })).toBe(false);
  });

  it('turns session events into outcomes, and error codes into what the person can do', () => {
    const event = (type: string, object: Record<string, unknown> = {}) => ({ id: 'evt', type, data: { object: { id: 'vs_9', object: 'identity.verification_session', ...object } } });
    expect(parseStripeIdentityEvent(event('identity.verification_session.verified'))).toEqual({ sessionId: 'vs_9', kind: 'verified' });
    expect(parseStripeIdentityEvent(event('identity.verification_session.requires_input', { last_error: { code: 'selfie_face_mismatch' } }))).toEqual({ sessionId: 'vs_9', kind: 'requires_input', errorCode: 'selfie_face_mismatch' });
    expect(parseStripeIdentityEvent(event('identity.verification_session.created'))).toBeNull();
    expect(parseStripeIdentityEvent(event('payment_intent.succeeded'))).toBeNull();
    expect(identityFailureReason('under_supported_age')).toBe('under_18');
    expect(identityFailureReason('selfie_manipulated')).toBe('selfie_mismatch');
    expect(identityFailureReason('document_expired')).toBe('document_unreadable');
    expect(identityFailureReason('consent_declined')).toBe('other');
  });

  it('counts 18 from the day of the birthday', () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(isAdult({ year: 2008, month: 11, day: 17 }, now)).toBe(true);
    expect(isAdult({ year: 2008, month: 11, day: 18 }, now)).toBe(false);
    expect(isAdult({ year: 1990, month: 1, day: 1 }, now)).toBe(true);
  });

  it('is on with a secret key only', () => {
    expect(stripeIdentityFromEnv({})).toBeNull();
    expect(stripeIdentityFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x' })?.provider).toBe('stripe_identity');
  });
});
