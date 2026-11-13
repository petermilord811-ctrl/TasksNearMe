import { handleCheckrWebhook } from '@/modules/verification/webhooks';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Checkr's events (background checks; docs/integration-points.md), signed with the API key
 * (X-Checkr-Signature); without CHECKR_API_KEY the endpoint doesn't exist. Subscribe it to the invitation
 * and report events.
 */
export async function POST(request: Request) {
  const apiKey = process.env.CHECKR_API_KEY?.trim();
  if (!apiKey) return new Response('Not found', { status: 404 });
  const outcome = await handleCheckrWebhook(db, { payload: await request.text(), signature: request.headers.get('x-checkr-signature'), apiKey }, await requestNow());
  return Response.json(outcome.body, { status: outcome.status });
}
