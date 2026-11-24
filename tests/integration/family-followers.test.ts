import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usernames, users } from '@/modules/accounts/schema';
import { getBookingsPage, getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { familyViewFor } from '@/modules/followers/access';
import { bookingFollowers } from '@/modules/followers/schema';
import { addFollower, followedBookingRows, getFollowedBookingView, removeFollower } from '@/modules/followers/service';
import { bookingThreadLink, canViewMessageFile, ensureThread, getInbox, getThreadPage, maskingFor, notifyTyping, postEvent, reactToMessage, sendMessage, unreadMessageCount } from '@/modules/messaging/service';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { planNotifications } from '@/modules/notifications/service';
import { notifications } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Family followers (2026-11-24): a client lets family members follow a booking, read-only. People and a booking copied
 * from Maya's wardrobe with Sam, made for this file. Proves the access matrix (a follower reads, and never passes a check
 * meant for the client: no address, no money, no actions, no sending), the limit, ending, the notifications and the
 * helper's notice.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const hub = { db, cipher: fieldCipherFromEnv() };
const CLIENT = 'usr_ffw_client';
const HELPER = 'usr_ffw_helper';
const LIA = 'usr_ffw_lia';
const TOM = 'usr_ffw_tom';
const ANN = 'usr_ffw_ann';
const STRANGER = 'usr_ffw_stranger';
const PEOPLE = [CLIENT, HELPER, LIA, TOM, ANN, STRANGER];
const TASK = 'tsk_ffw';
const OFFER = 'off_ffw';
const BOOKING = 'bkg_ffw';
const LIA_EMAIL = 'ffw-lia@example.test';
const NOW = new Date('2027-04-06T15:00:00.000Z');
const START = new Date('2027-04-08T15:00:00.000Z');
const DAY = 86_400_000;
let thread = '';

const clearAddLimits = () => db.delete(rateLimits).where(like(rateLimits.key, 'followers:add:usr_ffw_%'));
const follows = (who: string) => db.select().from(bookingFollowers).where(and(eq(bookingFollowers.bookingId, BOOKING), eq(bookingFollowers.followerUserId, who)));
const lines = async () => (await db.select().from(messages).where(eq(messages.threadId, thread))).flatMap((row) => (row.event ? [row.event] : []));
async function planFor(type: string, payload: Record<string, unknown> = {}) {
  const [event] = await db.insert(outboxEvents).values({ id: `evt_ffw_${type}_${Math.random().toString(36).slice(2, 8)}`, type, aggregateType: 'booking', aggregateId: BOOKING, payload: { bookingId: BOOKING, ...payload } }).returning();
  const planned = await planNotifications(db, event!);
  await db.delete(outboxEvents).where(eq(outboxEvents.id, event!.id));
  return planned;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_wardrobe'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_wardrobe_sam'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_wardrobe'));
  const terms = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_wardrobe'));
  if (!maya || !sam || !profile || !task || !offer || !booking || terms.length === 0) throw new Error('The seeded wardrobe booking is missing');
  const person = (id: string, email: string, first: string, last: string) => ({ ...maya, id, email, name: `${first} ${last.charAt(0)}.`, firstName: first, lastName: last, phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin' });
  await db.insert(users).values([
    person(CLIENT, 'ffw-client@example.test', 'Fay', 'Ward'),
    { ...sam, id: HELPER, email: 'ffw-helper@example.test', name: 'Hugo W.', firstName: 'Hugo', lastName: 'West', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin' },
    person(LIA, LIA_EMAIL, 'Lia', 'Ward'),
    person(TOM, 'ffw-tom@example.test', 'Tom', 'Ward'),
    person(ANN, 'ffw-ann@example.test', 'Ann', 'Ward'),
    person(STRANGER, 'ffw-stranger@example.test', 'Sid', 'Stone'),
  ]);
  await db.insert(usernames).values([{ userId: TOM, username: 'ffwtom' }, { userId: ANN, username: 'ffwann' }]);
  await db.insert(helperProfiles).values({ ...profile, userId: HELPER, handle: 'ffw-helper', status: 'active', foundingNumber: null });
  await db.insert(tasks).values({ ...task, id: TASK, slug: `${task.slug}-ffw`, posterUserId: CLIENT });
  await db.insert(offers).values({ ...offer, id: OFFER, taskId: TASK, helperUserId: HELPER });
  // Unpaid at first: contact details hidden in the conversation, for the client and so for a follower.
  await db.insert(bookings).values({ ...booking, id: BOOKING, taskId: TASK, offerId: OFFER, posterUserId: CLIENT, helperUserId: HELPER, seriesId: null, status: 'confirmed', confirmedAt: null, startAt: START, completedAt: null, canceledAt: null, cancelReason: null, onMyWayAt: null, arrivedAt: null });
  await db.insert(bookingTerms).values(terms.map((row, index) => ({ ...row, id: `btm_ffw_${index}`, bookingId: BOOKING, startAt: START })));
  thread = await ensureThread(db, bookingThreadLink({ id: BOOKING, taskId: TASK, posterUserId: CLIENT, helperUserId: HELPER }), NOW);
  await db.insert(messages).values([
    { id: 'msg_ffw_1', threadId: thread, senderUserId: CLIENT, kind: 'text', body: 'The box is in the garage. Call me at 512-555-0144.', createdAt: new Date(NOW.getTime() - 50_000) },
    { id: 'msg_ffw_2', threadId: thread, senderUserId: HELPER, kind: 'text', body: 'Great, text me at 512-555-0377 if anything changes.', createdAt: new Date(NOW.getTime() - 40_000) },
  ]);
  await postEvent(db, bookingThreadLink({ id: BOOKING, taskId: TASK, posterUserId: CLIENT, helperUserId: HELPER }), 'system', { type: 'payment_succeeded', params: { amountCents: 9_900 } }, new Date(NOW.getTime() - 30_000));
  await clearAddLimits();
});

afterAll(async () => {
  await db.delete(bookingFollowers).where(eq(bookingFollowers.bookingId, BOOKING));
  await db.delete(notifications).where(inArray(notifications.userId, PEOPLE));
  await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, BOOKING));
  await db.delete(auditLog).where(eq(auditLog.targetId, BOOKING));
  await db.delete(messages).where(eq(messages.threadId, thread));
  await db.delete(threadParticipants).where(eq(threadParticipants.threadId, thread));
  await db.delete(threads).where(eq(threads.id, thread));
  await db.delete(bookingTerms).where(eq(bookingTerms.bookingId, BOOKING));
  await db.delete(bookings).where(eq(bookings.id, BOOKING));
  await db.delete(offers).where(eq(offers.id, OFFER));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(usernames).where(inArray(usernames.userId, PEOPLE));
  await clearAddLimits();
  await db.delete(rateLimits).where(or(...PEOPLE.map((id) => like(rateLimits.key, `%${id}%`))));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('adding a family member', () => {
  it('takes only an existing account, never the client, the helper, or a stranger asking', async () => {
    const add = (who: string, by = CLIENT) => addFollower(db, by, { bookingId: BOOKING, who }, NOW);
    expect(await add('x')).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await add('nobody-here@example.test')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await add('@ffwnobody')).toMatchObject({ ok: false, code: 'not_found' });
    expect(await add('ffw-client@example.test')).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await add('ffw-helper@example.test')).toMatchObject({ ok: false, code: 'not_allowed' });
    // Only the booking's client adds: its helper is refused, anyone else doesn't find it.
    expect(await add(LIA_EMAIL, HELPER)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await add(LIA_EMAIL, STRANGER)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await db.select().from(bookingFollowers).where(eq(bookingFollowers.bookingId, BOOKING))).toEqual([]);
    await clearAddLimits();
  });

  it('adds by email (any case): a status line both people see, and one notification for the follower', async () => {
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: 'FFW-Lia@Example.test' }, NOW)).toEqual({ ok: true, code: 'saved' });
    expect(await follows(LIA)).toHaveLength(1);
    expect(await lines()).toContainEqual({ type: 'follower_added', params: { name: 'Lia W.' } });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, BOOKING), eq(outboxEvents.type, 'booking.follower_added')));
    expect(await planNotifications(db, event!)).toEqual([expect.objectContaining({ userId: LIA, type: 'follow_added', actorName: 'Fay W.', title: expect.any(String), target: { kind: 'booking', bookingId: BOOKING } })]);
    // Again: nothing new.
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: LIA_EMAIL }, NOW)).toEqual({ ok: true, code: 'saved' });
    expect((await lines()).filter((line) => line.type === 'follower_added')).toHaveLength(1);
  });
});

describe('what a follower sees, and never', () => {
  it('reads the booking without its address, money or actions; the regular page stays the two people\'s', async () => {
    expect(await getBookingView(hub, LIA, BOOKING, NOW)).toBeNull();
    const view = await getFollowedBookingView(db, LIA, BOOKING, NOW);
    expect(view).toMatchObject({ id: BOOKING, status: 'confirmed', start: START.toISOString(), timeZone: 'America/Chicago', client: { displayName: 'Fay W.' }, helper: { id: HELPER }, threadId: thread });
    const json = JSON.stringify(view);
    for (const leak of ['exactAddress', 'line1', 'amountCents', 'payments', 'breakdown', 'actions', 'ffw-client@example.test', '+1512']) expect(json).not.toContain(leak);
    expect(await getFollowedBookingView(db, STRANGER, BOOKING, NOW)).toBeNull();
    // The client and the helper never get the follower's projection.
    expect(await getFollowedBookingView(db, CLIENT, BOOKING, NOW)).toBeNull();
  });

  it('reads the conversation as the client does, masked the same way, without a payment line, and read-only', async () => {
    const page = await getThreadPage(db, LIA, thread, NOW);
    expect(page?.composer).toMatchObject({ canSend: false, disabledReason: 'following' });
    expect(page?.thread).toMatchObject({ following: true, unreadCount: 0, contactMasking: true, otherParty: { id: HELPER } });
    expect(page?.family).toEqual({ following: { bookingId: BOOKING, clientName: 'Fay W.' } });
    const texts = page!.messages.filter((message) => message.kind === 'text');
    // The client's own words are hers ("me"), the helper's masked until paid, as on the client's page.
    expect(texts.map((message) => message.sender)).toEqual(['me', 'them']);
    expect(JSON.stringify(texts[1]!.segments)).not.toContain('555-0377');
    const client = await getThreadPage(db, CLIENT, thread, NOW);
    expect(texts[1]!.segments).toEqual(client!.messages.find((message) => message.id === 'msg_ffw_2')!.segments);
    expect(page!.messages.some((message) => message.event?.type.startsWith('payment'))).toBe(false);
    expect(JSON.stringify(page)).not.toContain('9900');
    for (const key of ['bookingActions', 'agreement', 'cards', 'canProposeChange', 'savedReplies', 'presence', 'readUpTo', 'seenMessageId', 'thanks', 'quietHours', 'requestOptions']) expect(page).not.toHaveProperty(key);
    // Opening it marks nothing read for anyone.
    expect(await db.select().from(threadParticipants).where(and(eq(threadParticipants.threadId, thread), eq(threadParticipants.userId, LIA)))).toEqual([]);
  });

  it('passes no check meant for the client: no sending, reacting, typing, searching or booking actions', async () => {
    expect(await sendMessage(db, LIA, thread, { body: 'Hello from Lia', attachmentIds: [] }, NOW)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await reactToMessage(db, LIA, thread, { messageId: 'msg_ffw_2', emoji: 'thumbs_up', on: true }, NOW)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await notifyTyping(db, LIA, thread, NOW)).toBe('not_found');
    expect(await maskingFor(db, LIA, thread, NOW)).toBeNull();
    for (const action of ['message', 'pay', 'review', 'approve', 'report_problem', 'add_to_calendar'] as const) expect(await runBookingAction(db, LIA, BOOKING, action, NOW)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await removeFollower(db, LIA, { bookingId: BOOKING, followerId: CLIENT }, NOW)).toMatchObject({ ok: false });
    expect(await addFollower(db, LIA, { bookingId: BOOKING, who: '@ffwtom' }, NOW)).toMatchObject({ ok: false, code: 'not_found' });
    expect((await db.select().from(messages).where(eq(messages.threadId, thread))).some((row) => row.senderUserId === LIA)).toBe(false);
  });

  it('finds it in Messages (marked Following, never unread) and under "Bookings you follow"', async () => {
    const inbox = await getInbox(db, LIA, NOW);
    expect(inbox.threads).toEqual([expect.objectContaining({ id: thread, following: true, unreadCount: 0 })]);
    expect(await unreadMessageCount(db, LIA)).toBe(0);
    const page = await getBookingsPage(db, LIA, NOW);
    expect(page.following).toEqual([expect.objectContaining({ id: BOOKING, clientName: 'Fay W.', status: 'confirmed' })]);
    expect(JSON.stringify(page.following)).not.toContain('amountCents');
    expect([...page.upcoming, ...page.past]).toEqual([]);
    // The client's own inbox has no "Following" mark.
    expect((await getInbox(db, CLIENT, NOW)).threads.find((row) => row.id === thread)?.following).toBeUndefined();
  });

  it('sees the conversation\'s photos, as the client does, and nobody else gains anything', async () => {
    const photo = 'fil_ffw_photo';
    await db.update(messages).set({ attachmentFileIds: [photo] }).where(eq(messages.id, 'msg_ffw_2'));
    expect(await canViewMessageFile(db, photo, CLIENT)).toBe(true);
    expect(await canViewMessageFile(db, photo, LIA)).toBe(true);
    expect(await canViewMessageFile(db, photo, STRANGER)).toBe(false);
    await db.update(messages).set({ attachmentFileIds: [] }).where(eq(messages.id, 'msg_ffw_2'));
  });
});

describe("the helper's notice", () => {
  it('always shows the helper who follows, by display name only, and the client their panel', async () => {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING));
    const helperView = await familyViewFor(db, booking!, HELPER, NOW);
    expect(helperView).toEqual({ followedBy: { clientName: 'Fay W.', names: ['Lia W.'] } });
    expect(JSON.stringify(helperView)).not.toContain(LIA_EMAIL);
    const helperPage = await getThreadPage(db, HELPER, thread, NOW);
    expect(helperPage?.family).toEqual({ followedBy: { clientName: 'Fay W.', names: ['Lia W.'] } });
    expect((await getBookingView(hub, HELPER, BOOKING, NOW))?.family).toEqual({ followedBy: { clientName: 'Fay W.', names: ['Lia W.'] } });
    const clientView = await getBookingView(hub, CLIENT, BOOKING, NOW);
    expect(clientView?.family?.manage).toMatchObject({ bookingId: BOOKING, canAdd: true, max: 2, followers: [{ id: LIA, displayName: 'Lia W.' }] });
    expect(JSON.stringify(clientView?.family)).not.toContain(LIA_EMAIL);
  });
});

describe('limits and removal', () => {
  it('takes at most 2 followers', async () => {
    await clearAddLimits();
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: '@ffwtom' }, NOW)).toEqual({ ok: true, code: 'saved' });
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: 'ffwann' }, NOW)).toEqual({ ok: false, code: 'limit_reached' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING));
    expect((await familyViewFor(db, booking!, CLIENT, NOW))?.manage).toMatchObject({ canAdd: false, addBlockedReason: 'limit' });
  });

  it('two adds at once never make a third', async () => {
    await removeFollower(db, CLIENT, { bookingId: BOOKING, followerId: TOM }, NOW);
    await clearAddLimits();
    const results = await Promise.all([addFollower(db, CLIENT, { bookingId: BOOKING, who: 'ffwtom' }, NOW), addFollower(db, CLIENT, { bookingId: BOOKING, who: 'ffwann' }, NOW)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await db.select().from(bookingFollowers).where(eq(bookingFollowers.bookingId, BOOKING))).filter((row) => row.endedAt === null)).toHaveLength(2);
    const added = results[0]!.ok ? TOM : ANN;
    await removeFollower(db, CLIENT, { bookingId: BOOKING, followerId: added }, NOW);
  });

  it('lets the client remove a follower and a follower leave; each leaves a line, and reading stops', async () => {
    await clearAddLimits();
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: 'ffwtom' }, NOW)).toEqual({ ok: true, code: 'saved' });
    // The helper can't remove anyone.
    expect(await removeFollower(db, HELPER, { bookingId: BOOKING, followerId: TOM }, NOW)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await removeFollower(db, CLIENT, { bookingId: BOOKING, followerId: TOM }, NOW)).toEqual({ ok: true, code: 'updated' });
    expect(await getThreadPage(db, TOM, thread, NOW)).toBeNull();
    expect(await removeFollower(db, CLIENT, { bookingId: BOOKING, followerId: TOM }, NOW)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await lines()).toContainEqual({ type: 'follower_removed', params: { name: 'Tom W.' } });
  });
});

describe('notifications for a follower', () => {
  it('hears on the way, arrived, done and canceled, never money or a tip', async () => {
    for (const [type, expected] of [['booking.on_my_way', 'followed_on_the_way'], ['booking.arrived', 'followed_arrived'], ['booking.completed', 'followed_completed'], ['booking.canceled', 'followed_canceled']] as const) {
      const planned = await planFor(type, { posterUserId: CLIENT, helperUserId: HELPER });
      expect(planned.filter((item) => item.userId === LIA)).toEqual([expect.objectContaining({ type: expected, target: { kind: 'booking', bookingId: BOOKING } })]);
    }
    for (const type of ['booking.tipped', 'booking.confirmed', 'earnings.transferred', 'booking.disputed']) {
      expect((await planFor(type, { amountCents: 500 })).some((item) => item.userId === LIA)).toBe(false);
    }
  });
});

describe('following ends', () => {
  it('7 days after the booking is done, and at once when it is canceled; nobody new can follow then', async () => {
    await db.update(bookings).set({ status: 'completed', completedAt: new Date(NOW.getTime() - 6 * DAY), confirmedAt: new Date(NOW.getTime() - 9 * DAY) }).where(eq(bookings.id, BOOKING));
    expect(await getFollowedBookingView(db, LIA, BOOKING, NOW)).toMatchObject({ status: 'completed', endsAt: new Date(NOW.getTime() + DAY).toISOString() });
    const later = new Date(NOW.getTime() + 2 * DAY);
    expect(await getFollowedBookingView(db, LIA, BOOKING, later)).toEqual(expect.objectContaining({ ended: true }));
    expect(await getFollowedBookingView(db, LIA, BOOKING, later)).not.toHaveProperty('threadId');
    expect(await getThreadPage(db, LIA, thread, later)).toBeNull();
    expect(await followedBookingRows(db, LIA, later)).toEqual([]);
    expect((await getInbox(db, LIA, later)).threads).toEqual([]);
    await clearAddLimits();
    expect(await addFollower(db, CLIENT, { bookingId: BOOKING, who: 'ffwann' }, later)).toMatchObject({ ok: false, code: 'expired' });

    await db.update(bookings).set({ status: 'canceled', canceledAt: NOW, cancelReason: 'poster_early', completedAt: null }).where(eq(bookings.id, BOOKING));
    expect(await getThreadPage(db, LIA, thread, NOW)).toBeNull();
    expect(await getFollowedBookingView(db, LIA, BOOKING, NOW)).toMatchObject({ ended: true, status: 'canceled' });
  });

  it('lets a follower leave', async () => {
    expect(await removeFollower(db, LIA, { bookingId: BOOKING }, NOW)).toEqual({ ok: true, code: 'updated' });
    expect(await getFollowedBookingView(db, LIA, BOOKING, NOW)).toBeNull();
    expect(await lines()).toContainEqual({ type: 'follower_left', params: { name: 'Lia W.' } });
  });
});
