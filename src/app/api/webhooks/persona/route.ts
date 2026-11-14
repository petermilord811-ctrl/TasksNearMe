import { receiveWebhook } from '@/modules/webhooks/inbox';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Persona's events (the ID check's double check; docs/integration-points.md), signed with
 * PERSONA_WEBHOOK_SECRET over the raw body (Persona-Signature). Without Persona's three settings the
 * endpoint doesn't exist. Subscribe it to the inquiry events: inquiry.completed, .approved, .declined,
 * .failed, .expired and .marked-for-review (others are acknowledged and ignored).
 *
 * Every signed event goes through the webhook inbox (src/modules/webhooks/inbox.ts), recorded once by the
 * event's id (`data.id`, evt_…): retried with backoff when processing fails, and listed for staff when it
 * can't be processed. The signature is checked over these exact bytes, never re-serialized JSON.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const outcome = await receiveWebhook(db, 'persona', payload, { 'persona-signature': request.headers.get('persona-signature') }, await requestNow());
  if (!outcome) return new Response('Not found', { status: 404 });
  return Response.json(outcome.body, { status: outcome.status });
}
