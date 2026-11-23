import type { PeopleSearchData } from '@/contracts';
import { searchPeople } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { NO_STORE, signedOut } from '../_shared';

/** Typing asks about once a keystroke (the box waits a moment): a person's pace, not a script reading every name. */
const PEOPLE_SEARCH_RATE_LIMIT = { limit: 90, windowSeconds: 60 };

/**
 * New message's suggestions (2026-11-23): reachable people whose @username starts with `?q=` (`searchPeople`), and the
 * viewer's allowance of new conversations. Signed in only; asked as the person types, in the chat window, the dialog and
 * on the New message page.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return signedOut();
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `people-search:${viewer.user.id}`, PEOPLE_SEARCH_RATE_LIMIT, now);
  if (!limited.ok) return Response.json({ error: 'rate_limited', retryAt: limited.retryAt.toISOString() }, { status: 429, headers: NO_STORE });
  const text = new URL(request.url).searchParams.get('q') ?? '';
  const data: PeopleSearchData = await searchPeople(db, viewer.user.id, text, now);
  return Response.json(data, { headers: NO_STORE });
}
