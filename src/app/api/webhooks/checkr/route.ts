import { receiveWebhook } from '@/modules/webhooks/inbox';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { readTextUpTo, WEBHOOK_MAX_BYTES } from '@/platform/http/body';

/**
 * Checkr's events (background checks; docs/integration-points.md), signed with the API key
 * (X-Checkr-Signature); without CHECKR_API_KEY the endpoint doesn't exist. Subscribe it to the invitation
 * and report events.
 *
 * Every signed event goes through the webhook inbox (src/modules/webhooks/inbox.ts): recorded once by its id,
 * retried with backoff when processing fails, and listed for staff when it can't be processed.
 */
export async function POST(request: Request) {
  // Bounded: anyone can post here, and the body is held before its signature is checked.
  const payload = await readTextUpTo(request, WEBHOOK_MAX_BYTES);
  if (payload === null) return new Response('Payload too large', { status: 413 });
  const outcome = await receiveWebhook(db, 'checkr', payload, { 'x-checkr-signature': request.headers.get('x-checkr-signature') }, await requestNow());
  if (!outcome) return new Response('Not found', { status: 404 });
  return Response.json(outcome.body, { status: outcome.status });
}
