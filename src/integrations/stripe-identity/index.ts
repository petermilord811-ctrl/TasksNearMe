import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IdentityFailureReason } from '@/contracts';

/**
 * Stripe Identity (blueprint 06 §1): the hosted ID check (a document and a live selfie). Written against
 * Stripe's REST API, without the SDK. With `STRIPE_SECRET_KEY` (test keys in development) it replaces the
 * stand-in at /dev/providers/identity; its outcomes arrive at /api/webhooks/stripe, signed with
 * `STRIPE_WEBHOOK_SECRET`. Only "verified", "is adult" and the name comparison come back into the app;
 * the date of birth is used once to check the age and never stored (docs/integration-points.md).
 */

const API = 'https://api.stripe.com/v1';

export interface StripeIdentity {
  readonly provider: 'stripe_identity';
  start(userId: string): Promise<{ sessionId: string; url: string }>;
  redact(sessionId: string): Promise<void>;
  /** The verified name and date of birth, read once to finish a verified session. */
  verifiedOutputs(sessionId: string): Promise<{ firstName: string; lastName: string; dob: { day: number; month: number; year: number } | null }>;
}

export function createStripeIdentity(config: { secretKey: string; returnUrl: string; fetch?: typeof fetch; now?: () => Date }): StripeIdentity {
  const doFetch = config.fetch ?? fetch;
  async function call(method: 'GET' | 'POST', path: string, body?: URLSearchParams, idempotencyKey?: string) {
    const response = await doFetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body ? { body: body.toString() } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Stripe Identity answered ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
  return {
    provider: 'stripe_identity',
    async start(userId) {
      const body = new URLSearchParams();
      body.set('type', 'document');
      body.set('options[document][require_matching_selfie]', 'true');
      body.set('options[document][require_live_capture]', 'true');
      for (const type of ['driving_license', 'id_card', 'passport']) body.append('options[document][allowed_types][]', type);
      body.set('return_url', config.returnUrl);
      body.set('client_reference_id', userId);
      body.set('metadata[user_id]', userId);
      // A double tap within the same minute opens one session.
      const minute = Math.floor((config.now?.() ?? new Date()).getTime() / 60_000);
      const session = await call('POST', '/identity/verification_sessions', body, `idv-${userId}-${minute}`);
      if (typeof session.id !== 'string' || typeof session.url !== 'string') throw new Error('Stripe Identity sent no session URL');
      return { sessionId: session.id, url: session.url };
    },
    async redact(sessionId) {
      await call('POST', `/identity/verification_sessions/${encodeURIComponent(sessionId)}/redact`, new URLSearchParams());
    },
    async verifiedOutputs(sessionId) {
      const query = new URLSearchParams();
      query.append('expand[]', 'verified_outputs');
      query.append('expand[]', 'verified_outputs.dob');
      const session = await call('GET', `/identity/verification_sessions/${encodeURIComponent(sessionId)}?${query.toString()}`);
      const outputs = (session.verified_outputs ?? {}) as { first_name?: unknown; last_name?: unknown; dob?: { day?: unknown; month?: unknown; year?: unknown } | null };
      const dob = outputs.dob && typeof outputs.dob.year === 'number' && typeof outputs.dob.month === 'number' && typeof outputs.dob.day === 'number' ? { day: outputs.dob.day, month: outputs.dob.month, year: outputs.dob.year } : null;
      return { firstName: typeof outputs.first_name === 'string' ? outputs.first_name : '', lastName: typeof outputs.last_name === 'string' ? outputs.last_name : '', dob };
    },
  };
}

/**
 * A Stripe webhook's `Stripe-Signature` header (t=…,v1=…): an HMAC-SHA256 of `t.payload` with the endpoint
 * secret, any `v1` matching, within 5 minutes. Other schemes (`v0`) and debug entries are ignored.
 */
export function verifyStripeSignature(input: { payload: string; header: string | null; secret: string; now: Date; toleranceSeconds?: number }): boolean {
  if (!input.header) return false;
  const parts = input.header.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const tolerance = input.toleranceSeconds ?? 300;
  if (tolerance <= 0 || Math.abs(Math.floor(input.now.getTime() / 1000) - Number(timestamp)) > tolerance) return false;
  const expected = createHmac('sha256', input.secret).update(`${timestamp}.${input.payload}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type StripeIdentityEvent = { sessionId: string; kind: 'verified' | 'requires_input' | 'processing' | 'canceled'; errorCode?: string };

/** The identity session events the app acts on (others are acknowledged and ignored). */
export function parseStripeIdentityEvent(event: unknown): StripeIdentityEvent | null {
  if (!event || typeof event !== 'object') return null;
  const { type, data } = event as { type?: unknown; data?: { object?: { id?: unknown; object?: unknown; last_error?: { code?: unknown } | null } } };
  const object = data?.object;
  if (typeof type !== 'string' || !type.startsWith('identity.verification_session.') || typeof object?.id !== 'string') return null;
  const kind = type.slice('identity.verification_session.'.length);
  if (kind !== 'verified' && kind !== 'requires_input' && kind !== 'processing' && kind !== 'canceled') return null;
  const code = object.last_error && typeof object.last_error.code === 'string' ? object.last_error.code : undefined;
  return { sessionId: object.id, kind, ...(code ? { errorCode: code } : {}) };
}

/** Stripe's `last_error.code` as the app's reason (the person sees what to do next). */
export function identityFailureReason(code: string | undefined): IdentityFailureReason {
  if (code === 'under_supported_age') return 'under_18';
  if (code === 'selfie_face_mismatch' || code === 'selfie_manipulated' || code === 'selfie_unverified_other' || code === 'selfie_document_missing_photo') return 'selfie_mismatch';
  if (code === 'document_expired' || code === 'document_unverified_other' || code === 'document_type_not_supported') return 'document_unreadable';
  return 'other';
}

/** 18 or older on `now`'s date (UTC), from the verified date of birth. */
export function isAdult(dob: { day: number; month: number; year: number }, now: Date): boolean {
  const year = now.getUTCFullYear();
  const hadBirthday = now.getUTCMonth() + 1 > dob.month || (now.getUTCMonth() + 1 === dob.month && now.getUTCDate() >= dob.day);
  return year - dob.year - (hadBirthday ? 0 : 1) >= 18;
}

export function stripeIdentityFromEnv(env: Record<string, string | undefined> = process.env): StripeIdentity | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const appUrl = (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return createStripeIdentity({ secretKey, returnUrl: `${appUrl}/app/helper/onboarding/identity` });
}
