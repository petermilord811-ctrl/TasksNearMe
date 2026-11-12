import { eq } from 'drizzle-orm';
import { db } from '@/platform/db/client';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

/** Development only (404 in production): one email's designed version, full size, as an inbox would show it. */
export async function GET(_request: Request, { params }: RouteContext<'/dev/outbox/[id]'>): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
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
