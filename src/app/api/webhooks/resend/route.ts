import { receiveWebhook } from '@/modules/webhooks/inbox';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { readTextUpTo, WEBHOOK_MAX_BYTES } from '@/platform/http/body';

/**
 * Resend's delivery feedback (docs/integration-points.md): a permanent bounce or a spam complaint stops
 * notification email to that address. Signed with RESEND_WEBHOOK_SECRET; without it the endpoint doesn't
 * exist. Other events are acknowledged and ignored. Repeats are harmless (the first reason is kept).
 *
 * Every signed event goes through the webhook inbox (src/modules/webhooks/inbox.ts): recorded once by its id,
 * retried with backoff when processing fails, and listed for staff when it can't be processed.
 */
export async function POST(request: Request) {
  // Bounded: anyone can post here, and the body is held before its signature is checked.
  const payload = await readTextUpTo(request, WEBHOOK_MAX_BYTES);
  if (payload === null) return new Response('Payload too large', { status: 413 });
  const outcome = await receiveWebhook(db, 'resend', payload, { 'svix-id': request.headers.get('svix-id'), 'svix-timestamp': request.headers.get('svix-timestamp'), 'svix-signature': request.headers.get('svix-signature') }, await requestNow());
  if (!outcome) return new Response('Not found', { status: 404 });
  return Response.json(outcome.body, { status: outcome.status });
}
