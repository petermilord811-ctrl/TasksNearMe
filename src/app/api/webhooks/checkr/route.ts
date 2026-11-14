import { receiveWebhook } from '@/modules/webhooks/inbox';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Checkr's events (background checks; docs/integration-points.md), signed with the API key
 * (X-Checkr-Signature); without CHECKR_API_KEY the endpoint doesn't exist. Subscribe it to the invitation
 * and report events.
 *
 * Every signed event goes through the webhook inbox (src/modules/webhooks/inbox.ts): recorded once by its id,
 * retried with backoff when processing fails, and listed for staff when it can't be processed.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const outcome = await receiveWebhook(db, 'checkr', payload, { 'x-checkr-signature': request.headers.get('x-checkr-signature') }, await requestNow());
  if (!outcome) return new Response('Not found', { status: 404 });
  return Response.json(outcome.body, { status: outcome.status });
}
