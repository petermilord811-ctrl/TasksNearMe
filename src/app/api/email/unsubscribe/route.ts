import { setEmailsByToken } from '@/modules/notifications/unsubscribe-service';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * One-click unsubscribe (RFC 8058): a notification email's `List-Unsubscribe` header points here, and the
 * mail app posts `List-Unsubscribe=One-Click` without opening a page. The signed token says who and which
 * topic. A browser opening the link goes to the page, which asks first.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const result = await setEmailsByToken(db, token, false, await requestNow());
  return result.ok ? new Response('Unsubscribed', { status: 200 }) : new Response('Not found', { status: 404 });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return Response.redirect(new URL(`/email/unsubscribe?token=${encodeURIComponent(token)}`, request.url), 303);
}
