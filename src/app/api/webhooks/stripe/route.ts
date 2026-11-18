import { receiveWebhook } from '@/modules/webhooks/inbox';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Stripe's events (docs/integration-points.md), signed with STRIPE_WEBHOOK_SECRET; without it and
 * STRIPE_SECRET_KEY the endpoint doesn't exist. Subscribe it to:
 * - identity.verification_session.processing, .verified, .requires_input and .canceled (ID checks);
 * - payment_intent.succeeded, .amount_capturable_updated, .payment_failed and .canceled (a bank step
 *   finished after the browser closed); charge.dispute.created and .closed (chargebacks: a case for staff);
 * - Connect: account.updated, account.external_account.created and .updated (a helper's bank works again after a
 *   failed payout), and payout.created, .paid, .failed and .canceled, from a Connect endpoint (events on connected
 *   accounts) pointed at this URL and signed with STRIPE_CONNECT_WEBHOOK_SECRET;
 * - plans (9.13): checkout.session.completed and customer.subscription.created, .updated, .deleted, .paused and
 *   .resumed (each is read back from Stripe, src/modules/billing/service.ts).
 *
 * Every signed event goes through the webhook inbox (src/modules/webhooks/inbox.ts): recorded once by its id,
 * retried with backoff when processing fails, and listed for staff when it can't be processed.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const outcome = await receiveWebhook(db, 'stripe', payload, { 'stripe-signature': request.headers.get('stripe-signature') }, await requestNow());
  if (!outcome) return new Response('Not found', { status: 404 });
  return Response.json(outcome.body, { status: outcome.status });
}
