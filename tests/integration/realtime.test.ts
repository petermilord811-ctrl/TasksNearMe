import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { blocks, messages } from '@/modules/messaging/schema';
import { getThreadPage, notifyTyping, offerThreadId, sendMessage } from '@/modules/messaging/service';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { findTaskLiveState } from '@/modules/realtime/board';
import { noticesFor } from '@/modules/realtime/reactions';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketChannel, userChannel, type RealtimeHub, type RealtimeNotice } from '@/platform/realtime/hub';
import { onOutboxInsert, realtimeConnected, startRealtimeListener, stopRealtimeListener } from '@/platform/realtime/listener';
import { publishNotices } from '@/platform/realtime/publish';

/**
 * Real time (completion plan 7.1) against Postgres: notices go out on commit through the one LISTEN connection,
 * an outbox insert wakes the dispatcher, a message reaches the other participant only (never across a block),
 * typing is spaced out and for participants only, presence and "Seen" are mutual, and a posted task reaches its
 * market's public stream while it's open, as do changes to a task's offers or state (7.6).
 */
const url = process.env.TEST_DATABASE_URL ?? '';
const { db, pool } = createDb(url, { max: 3 });
let hub: RealtimeHub;
let threadId = '';

async function waitFor(check: () => boolean, ms = 4000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return check();
}

function collect(channel: string) {
  const got: RealtimeNotice[] = [];
  const stop = hub.subscribe(channel, (notice) => got.push(notice));
  return { got, stop };
}

beforeAll(async () => {
  hub = startRealtimeListener(url);
  expect(await waitFor(() => realtimeConnected(), 8000)).toBe(true);
  threadId = (await offerThreadId(db, 'off_lee', new Date()))!;
  expect(threadId).toBeTruthy();
});

afterAll(async () => {
  const events = await db.select({ id: outboxEvents.id }).from(outboxEvents).where(sql`${outboxEvents.payload}->>'threadId' = ${threadId}`);
  if (events.length > 0) {
    await db.delete(notifications).where(inArray(notifications.sourceEventId, events.map((event) => event.id)));
    await db.delete(outboxEvents).where(inArray(outboxEvents.id, events.map((event) => event.id)));
  }
  await db.delete(messages).where(eq(messages.threadId, threadId));
  await db.delete(outboxEvents).where(eq(outboxEvents.type, 'realtime.test'));
  await db.update(users).set({ lastActiveAt: null, showActivity: true }).where(inArray(users.id, ['usr_maya', 'usr_lee']));
  await stopRealtimeListener();
  await pool.end();
});

describe('real time through Postgres', () => {
  it('sends notices when the transaction commits, and not at all when it rolls back', async () => {
    const maya = collect(userChannel('usr_maya'));
    await db.transaction(async (tx) => {
      await publishNotices(tx, [{ channel: userChannel('usr_maya'), notice: { type: 'update', event: 'test.commit' } }]);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(maya.got).toEqual([]);
    });
    expect(await waitFor(() => maya.got.length === 1)).toBe(true);
    await db
      .transaction(async (tx) => {
        await publishNotices(tx, [{ channel: userChannel('usr_maya'), notice: { type: 'update', event: 'test.rollback' } }]);
        throw new Error('rollback');
      })
      .catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(maya.got.map((notice) => notice.event)).toEqual(['test.commit']);
    maya.stop();
  });

  it('wakes the dispatcher when an outbox event is inserted', async () => {
    let woke = 0;
    onOutboxInsert(() => {
      woke += 1;
    });
    await db.insert(outboxEvents).values({ id: 'evt_realtime_wake', type: 'realtime.test', aggregateType: 'test', aggregateId: 'x', payload: {} });
    expect(await waitFor(() => woke >= 1)).toBe(true);
    onOutboxInsert(() => {});
  });

  it('tells the other participant about a new message, never the sender, and nothing across a block', async () => {
    const maya = collect(userChannel('usr_maya'));
    const lee = collect(userChannel('usr_lee'));
    expect((await sendMessage(db, 'usr_lee', threadId, { body: 'I can bring a drill.', attachmentIds: [] }, new Date())).ok).toBe(true);
    await dispatchNotifications(db, new Date());
    expect(await waitFor(() => maya.got.some((notice) => notice.type === 'message' && notice.thread === threadId))).toBe(true);
    expect(lee.got.filter((notice) => notice.type === 'message')).toEqual([]);
    maya.stop();
    lee.stop();

    await db.insert(blocks).values({ blockerId: 'usr_maya', blockedId: 'usr_lee' });
    try {
      expect(await noticesFor(db, { type: 'message.sent', payload: { threadId, senderUserId: 'usr_lee', recipientIds: ['usr_maya'] } })).toEqual([]);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_maya'), eq(blocks.blockedId, 'usr_lee')));
    }
  });

  it('sends "typing" to the thread’s other participant only, at most once every 2.5 seconds', async () => {
    const maya = collect(userChannel('usr_maya'));
    const at = new Date('2026-11-14T18:00:00.000Z');
    expect(await notifyTyping(db, 'usr_lee', threadId, at)).toBe('sent');
    expect(await notifyTyping(db, 'usr_lee', threadId, new Date(at.getTime() + 1000))).toBe('throttled');
    expect(await notifyTyping(db, 'usr_ana', threadId, at)).toBe('not_found');
    expect(await waitFor(() => maya.got.some((notice) => notice.type === 'typing' && notice.thread === threadId))).toBe(true);
    expect(maya.got.filter((notice) => notice.type === 'typing')).toHaveLength(1);
    maya.stop();
  });

  it('shows presence and "Seen" only when both people share their activity', async () => {
    const now = new Date();
    await db.update(users).set({ lastActiveAt: now, showActivity: true }).where(inArray(users.id, ['usr_maya', 'usr_lee']));
    // Only Lee has written in this offer thread: Maya's activity stays hidden from him until she answers.
    expect((await getThreadPage(db, 'usr_lee', threadId, now))?.presence).toBeUndefined();
    expect((await sendMessage(db, 'usr_maya', threadId, { body: 'Great, see you then.', attachmentIds: [] }, new Date(now.getTime() + 500))).ok).toBe(true);
    const [mine] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, threadId), eq(messages.senderUserId, 'usr_maya')));

    const maya = collect(userChannel('usr_maya'));
    await getThreadPage(db, 'usr_lee', threadId, new Date(now.getTime() + 1000));
    expect(await waitFor(() => maya.got.some((notice) => notice.type === 'read' && notice.thread === threadId))).toBe(true);
    maya.stop();

    const shared = await getThreadPage(db, 'usr_maya', threadId, new Date(now.getTime() + 2000));
    expect(shared?.presence).toBe('now');
    expect(shared?.seenMessageId).toBe(mine!.id);

    await db.update(users).set({ showActivity: false }).where(eq(users.id, 'usr_maya'));
    const hidden = await getThreadPage(db, 'usr_maya', threadId, new Date(now.getTime() + 3000));
    expect(hidden?.presence).toBeUndefined();
    expect(hidden?.seenMessageId).toBeUndefined();
    const theirs = await getThreadPage(db, 'usr_lee', threadId, new Date(now.getTime() + 3000));
    expect(theirs?.presence).toBeUndefined();
  });

  it('puts a posted task on its market’s public stream only while it’s open', async () => {
    expect(await noticesFor(db, { type: 'task.posted', payload: { taskId: 'tsk_desk', marketId: 'mkt_austin' } })).toEqual([
      { channel: marketChannel('mkt_austin'), notice: { type: 'task.posted', task: 'tsk_desk' } },
    ]);
    expect(await noticesFor(db, { type: 'task.posted', payload: { taskId: 'tsk_missing', marketId: 'mkt_austin' } })).toEqual([]);
  });

  it('tells a task’s board when its offers or state change (its id), and the stream reads only public facts', async () => {
    const notices = await noticesFor(db, { type: 'offer.withdrawn', payload: { offerId: 'off_none', taskId: 'tsk_desk', helperUserId: 'usr_jordan', posterUserId: 'usr_maya' } });
    expect(notices).toContainEqual({ channel: marketChannel('mkt_austin'), notice: { type: 'task.changed', task: 'tsk_desk' } });
    expect(await noticesFor(db, { type: 'task.canceled', payload: { taskId: 'tsk_missing', reason: 'staff' } })).toEqual([]);

    const readAt = new Date('2026-11-14T12:00:00.000Z');
    const state = await findTaskLiveState(db, 'tsk_desk', readAt);
    expect(state).toEqual({ id: 'tsk_desk', offerCount: expect.any(Number), state: 'open', readAt: readAt.toISOString() });
    expect(await findTaskLiveState(db, 'tsk_missing')).toBeNull();
  });
});
