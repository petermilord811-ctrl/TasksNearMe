import { createHmac } from 'node:crypto';
import { stripeIdentityFromEnv } from '@/integrations/stripe-identity';
import { parseResendEvent, signResendWebhook, verifyResendWebhook } from '@/integrations/email/resend-webhook';
import { bookingDeps } from '@/modules/bookings/server';
import { handleConnectWebhook } from '@/modules/payments/connect';
import { handleStripePaymentWebhook, stripeEventType } from '@/modules/payments/stripe-webhooks';
import { recordEmailFeedback } from '@/modules/notifications/suppressions';
import { handleCheckrWebhook, handleStripeIdentityWebhook } from '@/modules/verification/webhooks';
import type { Db } from '@/platform/db/connect';

/**
 * What each webhook endpoint does with a request, as functions the routes and the inbox's retries share
 * (completion plan 5.11). The logic is the routes' own, moved here unchanged: each provider's handler checks
 * the signature and acts. `null`: the endpoint is off (its keys aren't set), so the route answers 404.
 */

export type WebhookProvider = 'stripe' | 'checkr' | 'resend';
export const WEBHOOK_PROVIDERS: readonly WebhookProvider[] = ['stripe', 'checkr', 'resend'];
export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}
/** The request headers the handlers read (lower case). */
export type WebhookHeaders = Record<string, string | null>;

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Stripe: payments, chargebacks and Connect (accounts and payouts), and Stripe Identity. */
async function stripe(db: Db, payload: string, headers: WebhookHeaders, now: Date): Promise<WebhookOutcome | null> {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  const identity = stripeIdentityFromEnv();
  if (!secret || !identity) return null;
  const signature = headers['stripe-signature'] ?? null;
  const type = stripeEventType(payload);
  if (type === 'account.updated' || type?.startsWith('payout.')) {
    const secrets = [env('STRIPE_CONNECT_WEBHOOK_SECRET'), secret].filter((value): value is string => Boolean(value));
    return handleConnectWebhook(db, { payload, signature, secrets }, now);
  }
  if (type?.startsWith('payment_intent.') || type?.startsWith('charge.dispute.')) {
    const deps = bookingDeps();
    if (!deps) return { status: 200, body: { ok: true, ignored: true } };
    return handleStripePaymentWebhook(deps, { payload, signature, secret }, now);
  }
  return handleStripeIdentityWebhook(db, { payload, signature, secret, identity }, now);
}

async function checkr(db: Db, payload: string, headers: WebhookHeaders, now: Date): Promise<WebhookOutcome | null> {
  const apiKey = env('CHECKR_API_KEY');
  if (!apiKey) return null;
  return handleCheckrWebhook(db, { payload, signature: headers['x-checkr-signature'] ?? null, apiKey }, now);
}

async function resend(db: Db, payload: string, headers: WebhookHeaders, now: Date): Promise<WebhookOutcome | null> {
  const secret = env('RESEND_WEBHOOK_SECRET');
  if (!secret) return null;
  const valid = verifyResendWebhook({ secret, id: headers['svix-id'] ?? null, timestamp: headers['svix-timestamp'] ?? null, signature: headers['svix-signature'] ?? null, body: payload, now });
  if (!valid) return { status: 401, body: { ok: false } };
  const event = parseResendEvent(payload);
  if (!event) return { status: 200, body: { ok: true, ignored: true } };
  await recordEmailFeedback(db, event, 'resend', now);
  return { status: 200, body: { ok: true } };
}

const DISPATCH = { stripe, checkr, resend } as const;

export function dispatchWebhook(provider: WebhookProvider, db: Db, payload: string, headers: WebhookHeaders, now: Date): Promise<WebhookOutcome | null> {
  return DISPATCH[provider](db, payload, headers, now);
}

/** The provider's id and type for an event (Resend's id is the svix-id header). */
export function eventIdentity(provider: WebhookProvider, payload: string, headers: WebhookHeaders): { eventId: string; type: string } | null {
  let parsed: { id?: unknown; type?: unknown } = {};
  try {
    parsed = JSON.parse(payload) as typeof parsed;
  } catch {
    return null;
  }
  const type = typeof parsed.type === 'string' ? parsed.type : '';
  const eventId = provider === 'resend' ? headers['svix-id'] : typeof parsed.id === 'string' ? parsed.id : null;
  return eventId ? { eventId, type } : null;
}

/**
 * Headers that sign a stored payload again with our own secrets, the way each provider signs it, so a retry
 * or a staff replay goes through the same checks as a delivery. Null when the provider's keys aren't set.
 */
export function signAgain(provider: WebhookProvider, payload: string, eventId: string, now: Date): WebhookHeaders | null {
  const seconds = Math.floor(now.getTime() / 1000);
  if (provider === 'stripe') {
    const secret = env('STRIPE_WEBHOOK_SECRET');
    if (!secret) return null;
    const signatures = [secret, env('STRIPE_CONNECT_WEBHOOK_SECRET')]
      .filter((value): value is string => Boolean(value))
      .map((key) => `v1=${createHmac('sha256', key).update(`${seconds}.${payload}`).digest('hex')}`);
    return { 'stripe-signature': [`t=${seconds}`, ...signatures].join(',') };
  }
  if (provider === 'checkr') {
    const apiKey = env('CHECKR_API_KEY');
    return apiKey ? { 'x-checkr-signature': createHmac('sha256', apiKey).update(payload).digest('hex') } : null;
  }
  const secret = env('RESEND_WEBHOOK_SECRET');
  return secret ? { 'svix-id': eventId, 'svix-timestamp': String(seconds), 'svix-signature': signResendWebhook(secret, eventId, seconds, payload) } : null;
}
