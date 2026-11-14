import { eq } from 'drizzle-orm';
import { db } from '@/platform/db/client';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { isLocalRequest } from '@/shared/local-request';
import { devHelpersOn } from '@/shared/dev-helpers';

/** Development only (404 in production): one email's designed version, full size, as an inbox would show it. */
export async function GET(request: Request, { params }: RouteContext<'/[locale]/dev/outbox/[id]'>): Promise<Response> {
  if (!devHelpersOn()) return new Response('Not found', { status: 404 });
  // Only on this machine (also checked in src/proxy.ts): the outbox holds everyone's sign-in codes.
  if (!isLocalRequest((name) => request.headers.get(name))) return new Response('Not found', { status: 404 });
  const { id } = await params;
  const [message] = await db.select({ html: devOutboxMessages.html }).from(devOutboxMessages).where(eq(devOutboxMessages.id, id)).limit(1);
  if (!message?.html) return new Response('Not found', { status: 404 });
  return new Response(message.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Emails run no scripts; neither does this page.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src * data:; font-src *",
      'cache-control': 'no-store',
    },
  });
}
