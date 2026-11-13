import { stripeIdentityFromEnv } from '@/integrations/stripe-identity';
import { handleStripeIdentityWebhook } from '@/modules/verification/webhooks';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Stripe's events (Stripe Identity sessions; docs/integration-points.md). Signed with STRIPE_WEBHOOK_SECRET;
 * without it and STRIPE_SECRET_KEY the endpoint doesn't exist. Subscribe it to
 * identity.verification_session.processing, .verified, .requires_input and .canceled.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const identity = stripeIdentityFromEnv();
  if (!secret || !identity) return new Response('Not found', { status: 404 });
  const outcome = await handleStripeIdentityWebhook(db, { payload: await request.text(), signature: request.headers.get('stripe-signature'), secret, identity }, await requestNow());
  return Response.json(outcome.body, { status: outcome.status });
}
