import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookingTerms } from '@/modules/bookings/schema';
import { invites } from '@/modules/invites/schema';
import { getThreadPage, offerThreadId, sendMessage, unreadMessageCount } from '@/modules/messaging/service';
import { notifications } from '@/modules/notifications/schema';
import { communityPosts } from '@/modules/community/schema';
import { blocks } from '@/modules/messaging/schema';
import {
  dispatchNotifications,
  getAccountPage,
  getNotificationsPage,
  markAllNotificationsRead,
  saveAccountProfile,
  saveNotificationPreference,
} from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { requestAccountDeletion, requestDataExport } from '@/modules/privacy/requests';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

let bookingId = '';
beforeAll(async () => {
  // Chris books Lee on a copy of the desk (nobody else in the tests pays as Chris here).
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: 'tsk_ntf', slug: 'ntf-desk', posterUserId: 'usr_chris', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_ntf_lee', taskId: 'tsk_ntf', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, 'usr_chris', 'tsk_ntf', 'off_ntf_lee', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  bookingId = booked.redirectTo.split('/').pop()!;
});

describe('notifications', () => {
  it('tells the helper about the booking, once, however often the dispatcher runs', async () => {
    await dispatchNotifications(db, new Date());
    await dispatchNotifications(db, new Date());
    const page = await getNotificationsPage(db, 'usr_lee', new Date());
    const confirmed = page.notifications.filter((n) => n.type === 'booking_confirmed' && n.target.kind === 'booking' && n.target.bookingId === bookingId);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ title: 'Assemble a desk (flat-pack, 1 item)', actorName: 'Chris D.' });
    expect(page.unreadCount).toBeGreaterThan(0);
    await markAllNotificationsRead(db, 'usr_lee', new Date());
    expect((await getNotificationsPage(db, 'usr_lee', new Date())).unreadCount).toBe(0);
  });

  it('makes one notification for several unread messages in a thread', async () => {
    const thread = (await offerThreadId(db, 'off_ntf_lee', new Date()))!;
    const leeBefore = await unreadMessageCount(db, 'usr_lee');
    await sendMessage(db, 'usr_lee', thread, { body: 'See you soon.', attachmentIds: [] }, new Date());
    await sendMessage(db, 'usr_lee', thread, { body: 'I am bringing a drill.', attachmentIds: [] }, new Date());
    await dispatchNotifications(db, new Date());
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, 'usr_chris'), eq(notifications.type, 'message_received')));
    expect(rows.filter((row) => row.target.kind === 'thread' && row.target.threadId === thread)).toHaveLength(1);
    // The messages badge counts both; opening the thread reads them.
    const before = await unreadMessageCount(db, 'usr_chris');
    expect(before).toBeGreaterThanOrEqual(2);
    expect(await getThreadPage(db, 'usr_chris', thread, new Date())).not.toBeNull();
    expect(before - (await unreadMessageCount(db, 'usr_chris'))).toBeGreaterThanOrEqual(2);
    // Your own messages never count (sending also reads the thread).
    expect(await unreadMessageCount(db, 'usr_lee')).toBeLessThanOrEqual(leeBefore);
  });
});

describe('change and invite notifications', () => {
  // Other test files add events too: a large limit dispatches everything pending.
  const dispatchAll = () => dispatchNotifications(db, new Date(), 10_000);

  it('tells the other person about a proposed change, and both people when it applies', async () => {
    await db.insert(outboxEvents).values([
      { id: 'evt_ntf_chg_proposed', type: 'change.proposed', aggregateType: 'booking', aggregateId: bookingId, payload: { bookingId, changeId: 'chg_ntf', proposedByUserId: 'usr_lee' } },
      { id: 'evt_ntf_chg_applied', type: 'change.applied', aggregateType: 'booking', aggregateId: bookingId, payload: { bookingId, changeId: 'chg_ntf' } },
    ]);
    await dispatchAll();
    const rows = await db.select().from(notifications).where(inArray(notifications.sourceEventId, ['evt_ntf_chg_proposed', 'evt_ntf_chg_applied']));
    expect(rows.filter((row) => row.type === 'change_proposed')).toEqual([
      expect.objectContaining({ userId: 'usr_chris', actorName: 'Lee M.', title: 'Assemble a desk (flat-pack, 1 item)', target: { kind: 'booking', bookingId } }),
    ]);
    expect(rows.filter((row) => row.type === 'change_applied').map((row) => row.userId).sort()).toEqual(['usr_chris', 'usr_lee']);
  });

  it('tells the helper about an invite, and the client about a counter and an acceptance', async () => {
    const [terms] = await db.select({ breakdown: bookingTerms.breakdown }).from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId)).limit(1);
    await db.insert(invites).values({
      id: 'inv_ntf',
      taskId: 'tsk_ntf',
      posterUserId: 'usr_chris',
      helperUserId: 'usr_lee',
      status: 'accepted',
      pricingType: 'fixed',
      priceCents: 6000,
      startAt: new Date(Date.now() + 5 * 86_400_000),
      breakdown: terms!.breakdown,
      bookingId,
    });
    const people = { inviteId: 'inv_ntf', posterUserId: 'usr_chris', helperUserId: 'usr_lee' };
    await db.insert(outboxEvents).values([
      { id: 'evt_ntf_inv_sent', type: 'invite.sent', aggregateType: 'invite', aggregateId: 'inv_ntf', payload: { ...people, taskId: 'tsk_ntf' } },
      { id: 'evt_ntf_inv_countered', type: 'invite.countered', aggregateType: 'invite', aggregateId: 'inv_ntf', payload: people },
      { id: 'evt_ntf_inv_accepted', type: 'invite.accepted', aggregateType: 'invite', aggregateId: 'inv_ntf', payload: { ...people, bookingId } },
    ]);
    await dispatchAll();
    const rows = await db.select().from(notifications).where(inArray(notifications.sourceEventId, ['evt_ntf_inv_sent', 'evt_ntf_inv_countered', 'evt_ntf_inv_accepted']));
    expect(rows).toHaveLength(3);
    const byType = Object.fromEntries(rows.map((row) => [row.type, row]));
    expect(byType.invite_received).toMatchObject({ userId: 'usr_lee', actorName: 'Chris D.', title: 'Assemble a desk (flat-pack, 1 item)', target: { kind: 'invite', inviteId: 'inv_ntf' } });
    expect(byType.invite_countered).toMatchObject({ userId: 'usr_chris', actorName: 'Lee M.', target: { kind: 'task', taskId: 'tsk_ntf' } });
    expect(byType.invite_accepted).toMatchObject({ userId: 'usr_chris', actorName: 'Lee M.', target: { kind: 'booking', bookingId } });
  });
});

describe('the account page', () => {
  it('saves the name, preferences (not the locked ones), and privacy requests', async () => {
    const before = await getAccountPage(db, 'usr_chris');
    expect(before?.phone).toEqual({ last4: '0102', verified: true });
    expect(before?.preferences.find((p) => p.topic === 'bookings' && p.channel === 'email')).toMatchObject({ enabled: true, locked: true });

    expect(await saveAccountProfile(db, 'usr_chris', { firstName: 'Christopher', lastName: 'Davis' }, new Date())).toEqual({ ok: true, code: 'saved' });
    expect((await getAccountPage(db, 'usr_chris'))?.profile.displayName).toBe('Christopher D.');
    await saveAccountProfile(db, 'usr_chris', { firstName: 'Chris', lastName: 'Davis' }, new Date());

    expect(await saveNotificationPreference(db, 'usr_chris', { topic: 'bookings', channel: 'email', enabled: false }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await saveNotificationPreference(db, 'usr_chris', { topic: 'tips_and_news', channel: 'email', enabled: true }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect((await getAccountPage(db, 'usr_chris'))?.preferences.find((p) => p.topic === 'tips_and_news' && p.channel === 'email')?.enabled).toBe(true);

    expect(await requestDataExport(db, 'usr_chris', new Date())).toEqual({ ok: true, code: 'submitted' });
    expect((await getAccountPage(db, 'usr_chris'))?.privacy.export).toMatchObject({ status: 'preparing' });
    // Chris has a booking in progress: deletion waits.
    expect(await requestAccountDeletion(db, 'usr_chris', new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });
});

describe('community notifications (completion plan 7.7)', () => {
  const dispatchAll = () => dispatchNotifications(db, new Date(), 10_000);
  const postId = `cpo_ntf_${Date.now().toString(36)}`;

  beforeAll(async () => {
    await db.insert(communityPosts).values({ id: postId, marketId: 'mkt_austin', authorUserId: 'usr_chris', kind: 'question', title: 'Leaf pickup this week?', body: 'Does curbside pickup still run weekly in December?' });
  });

  it('tells the post’s author about an answer, never about their own, and never across a block', async () => {
    await db.insert(outboxEvents).values([
      { id: `evt_${postId}_r1`, type: 'community.replied', aggregateType: 'community_post', aggregateId: postId, payload: { postId, replyId: 'cre_1', postAuthorUserId: 'usr_chris', replierUserId: 'usr_lee', marketId: 'mkt_austin' } },
      { id: `evt_${postId}_r2`, type: 'community.replied', aggregateType: 'community_post', aggregateId: postId, payload: { postId, replyId: 'cre_2', postAuthorUserId: 'usr_chris', replierUserId: 'usr_chris', marketId: 'mkt_austin' } },
    ]);
    await db.insert(blocks).values({ blockerId: 'usr_chris', blockedId: 'usr_ben' }).onConflictDoNothing();
    await db.insert(outboxEvents).values({ id: `evt_${postId}_r3`, type: 'community.replied', aggregateType: 'community_post', aggregateId: postId, payload: { postId, replyId: 'cre_3', postAuthorUserId: 'usr_chris', replierUserId: 'usr_ben', marketId: 'mkt_austin' } });
    try {
      await dispatchAll();
      const rows = await db.select().from(notifications).where(inArray(notifications.sourceEventId, [`evt_${postId}_r1`, `evt_${postId}_r2`, `evt_${postId}_r3`]));
      expect(rows).toEqual([expect.objectContaining({ userId: 'usr_chris', type: 'community_reply', actorName: 'Lee M.', title: 'Leaf pickup this week?', target: { kind: 'community_post', postId } })]);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_chris'), eq(blocks.blockedId, 'usr_ben')));
    }
  });

  it('tells someone their answer was pinned, and about Helpful once per milestone', async () => {
    await db.insert(outboxEvents).values([
      { id: `evt_pinned_${postId}`, type: 'community.answer_pinned', aggregateType: 'community_post', aggregateId: postId, payload: { postId, replyId: 'cre_1', replyAuthorUserId: 'usr_lee', marketId: 'mkt_austin' } },
      { id: `evt_helpful_post_${postId}_5`, type: 'community.helpful', aggregateType: 'community_post', aggregateId: postId, payload: { postId, targetKind: 'post', targetId: postId, authorUserId: 'usr_chris', count: 5, marketId: 'mkt_austin' } },
    ]);
    // A recount can't send the same milestone again: its event id is the same.
    await db.insert(outboxEvents).values({ id: `evt_helpful_post_${postId}_5`, type: 'community.helpful', aggregateType: 'community_post', aggregateId: postId, payload: { postId, targetKind: 'post', targetId: postId, authorUserId: 'usr_chris', count: 5, marketId: 'mkt_austin' } }).onConflictDoNothing();
    await dispatchAll();
    const pinned = await db.select().from(notifications).where(eq(notifications.sourceEventId, `evt_pinned_${postId}`));
    expect(pinned).toEqual([expect.objectContaining({ userId: 'usr_lee', type: 'community_answer_pinned', actorName: 'Chris D.', target: { kind: 'community_post', postId } })]);
    const helpful = await db.select().from(notifications).where(eq(notifications.sourceEventId, `evt_helpful_post_${postId}_5`));
    expect(helpful).toEqual([expect.objectContaining({ userId: 'usr_chris', type: 'community_helpful', params: { count: 5, on: 'post' } })]);
  });
});
