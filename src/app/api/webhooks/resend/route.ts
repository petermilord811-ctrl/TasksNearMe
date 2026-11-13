import { parseResendEvent, verifyResendWebhook } from '@/integrations/email/resend-webhook';
import { recordEmailFeedback } from '@/modules/notifications/suppressions';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * Resend's delivery feedback (docs/integration-points.md): a permanent bounce or a spam complaint stops
 * notification email to that address. Signed with RESEND_WEBHOOK_SECRET; without it the endpoint doesn't
 * exist. Other events are acknowledged and ignored. Repeats are harmless (the first reason is kept).
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response('Not found', { status: 404 });
  const body = await request.text();
  const valid = verifyResendWebhook({
    secret,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    body,
  });
  if (!valid) return new Response('Invalid signature', { status: 401 });
  const event = parseResendEvent(body);
  if (event) await recordEmailFeedback(db, event, 'resend', await requestNow());
  return Response.json({ ok: true });
}
