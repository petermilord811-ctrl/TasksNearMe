import { routes } from '@/contracts';
import { setWaitlistEmailsByToken } from '@/modules/marketing/waitlist-unsubscribe';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';

/**
 * One-click unsubscribe (RFC 8058) for waitlist emails (completion plan 8.3): the email's `List-Unsubscribe` header
 * points here, and the mail app posts `List-Unsubscribe=One-Click` without opening a page. The signed token names the
 * waitlist entry. A browser opening the link goes to the page, which asks first.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const result = await setWaitlistEmailsByToken(db, token, false, await requestNow());
  return result.ok ? new Response('Unsubscribed', { status: 200 }) : new Response('Not found', { status: 404 });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return Response.redirect(new URL(routes.waitlistUnsubscribe(token), request.url), 303);
}
