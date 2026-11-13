import { stripeIdentityFromEnv } from '@/integrations/stripe-identity';
import { bookingDeps } from '@/modules/bookings/server';
import { handleConnectWebhook } from '@/modules/payments/connect';
import { handleStripePaymentWebhook, stripeEventType } from '@/modules/payments/stripe-webhooks';
import { handleStripeIdentityWebhook } from '@/modules/verification/webhooks';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Stripe's events (docs/integration-points.md), signed with STRIPE_WEBHOOK_SECRET; without it and
 * STRIPE_SECRET_KEY the endpoint doesn't exist. Subscribe it to:
 * - identity.verification_session.processing, .verified, .requires_input and .canceled (ID checks);
 * - payment_intent.succeeded, .amount_capturable_updated, .payment_failed and .canceled (a bank step
 *   finished after the browser closed);
 * - Connect: account.updated and payout.created, .paid, .failed and .canceled, from a Connect endpoint (events
 *   on connected accounts) pointed at this URL and signed with STRIPE_CONNECT_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const identity = stripeIdentityFromEnv();
  if (!secret || !identity) return new Response('Not found', { status: 404 });
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  const now = await requestNow();
  const type = stripeEventType(payload);
  if (type === 'account.updated' || type?.startsWith('payout.')) {
    const secrets = [process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim(), secret].filter((value): value is string => Boolean(value));
    const outcome = await handleConnectWebhook(db, { payload, signature, secrets }, now);
    return Response.json(outcome.body, { status: outcome.status });
  }
  if (type?.startsWith('payment_intent.')) {
    const deps = bookingDeps();
    if (!deps) return Response.json({ ok: true, ignored: true });
    const outcome = await handleStripePaymentWebhook(deps, { payload, signature, secret }, now);
    return Response.json(outcome.body, { status: outcome.status });
  }
  const outcome = await handleStripeIdentityWebhook(db, { payload, signature, secret, identity }, now);
  return Response.json(outcome.body, { status: outcome.status });
}
