import type { ChatThreadData } from '@/contracts';
import { getThreadPage } from '@/modules/messaging/service';
import { getReportSubject } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { NO_STORE, signedOut } from '../../_shared';

/**
 * One conversation for the chat window (2026-11-22): exactly what its page shows (`getThreadPage`: its two people only,
 * anyone else gets not found; masked until a booking), with what Report and Block need. Like opening the page, reading
 * it marks it read, so the window asks only while the conversation is on screen. `?from=`: from an earlier message on.
 * `?peek=1`: a conversation docked as a head (not on screen) reads nothing, and keeps its unread count (sweep C1).
 */
export async function GET(request: Request, { params }: RouteContext<'/api/messages/threads/[threadId]'>): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return signedOut();
  const { threadId } = await params;
  const query = new URL(request.url).searchParams;
  const from = query.get('from');
  const peek = query.get('peek') === '1';
  const now = await requestNow();
  const [data, safety] = await Promise.all([getThreadPage(db, viewer.user.id, threadId, now, { ...(from ? { from } : {}), ...(peek ? { peek } : {}) }), getReportSubject(db, viewer.user.id, threadId)]);
  if (!data) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  const body: ChatThreadData = { data, ...(safety ? { safety } : {}) };
  return Response.json(body, { headers: NO_STORE });
}
