import { eq } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { HEARTBEAT_MS, touchActivity } from '@/modules/realtime/presence';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { marketChannel, userChannel } from '@/platform/realtime/hub';
import { realtimeHub } from '@/platform/realtime/listener';
import { sseResponse } from '@/platform/realtime/sse';

/** More tabs than this for one person on one server: the extra ones fall back to refreshing. */
const MAX_STREAMS_PER_USER = 8;
/** Accounts whose streams end (restricted accounts keep using the app). */
const ENDED = new Set(['suspended', 'banned', 'deleted']);

/**
 * The signed-in person's live notices (completion plan 7.1): their own channel, and their market's community
 * notices (7.7), as server-sent events.
 * Each notice is a type and ids (a new message in a thread, someone typing, something read, an update to a task
 * or booking); the page reads the rest the usual way. Signed out: 204, which tells EventSource to stop.
 * While it's open, a heartbeat records that they're around (at most once a minute) and checks every five
 * minutes that the account is still active; the stream ends after 15 minutes and the browser reconnects, which
 * checks the session again.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const userId = viewer.user.id;
  const hub = realtimeHub();
  if (hub.count(userChannel(userId)) >= MAX_STREAMS_PER_USER) return new Response(null, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  void touchActivity(db, userId, new Date()).catch(() => {});

  // Their market's community notices too (completion plan 7.7): a post's id, kind and neighborhood, nothing else.
  const [account] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);

  return sseResponse(request.signal, (out) => {
    const unsubscribeOwn = hub.subscribe(userChannel(userId), (notice) => out.send(null, notice));
    const unsubscribeMarket = account ? hub.subscribe(marketChannel(account.marketId), (notice) => {
      if (notice.type === 'community') out.send(null, notice);
    }) : () => {};
    const unsubscribe = () => {
      unsubscribeOwn();
      unsubscribeMarket();
    };
    let beats = 0;
    const heartbeat = setInterval(() => {
      beats += 1;
      void touchActivity(db, userId, new Date()).catch(() => {});
      if (beats % 5 !== 0) return;
      void db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(([row]) => {
          if (!row || ENDED.has(row.status)) out.close();
        })
        .catch(() => {});
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    return () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
  });
}
