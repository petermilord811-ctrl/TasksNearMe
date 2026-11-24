import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { availabilityPosts } from '@/modules/availability/schema';
import { runBookingChatAction } from '@/modules/bookings/chat-run';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { reportCantAccess } from '@/modules/bookings/sheets';
import { directPairKey } from '@/modules/messaging/direct-rules';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { bookingThreadLink, ensureThread, getThreadPage } from '@/modules/messaging/service';
import { SHARE_TIMES_RULE, shareTimes } from '@/modules/messaging/times';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * A booking's conversation and shared times, 2026-11-24 (owner: "implement others all one by one"): who gets which day-of
 * chip, a chip running the booking page's own action with its line in the conversation, "What we agreed" with each
 * person's own money and no address, and a helper sharing two or three of their own open times with the other person
 * only. Chris books Jordan for a copy of the seeded desk; Jordan's slots are this file's own (avl_bct_*), removed after.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_chris';
const HELPER = 'usr_jordan';
const STRANGER = 'usr_maya';
const TASK = 'tsk_bct_desk';
const OFFER_TASK = 'tsk_bct_offer';
const SLOTS = ['avl_bct_1', 'avl_bct_2', 'avl_bct_3', 'avl_bct_4', 'avl_bct_held', 'avl_bct_sam'];
const DAY = 86_400_000;
const now = new Date();
let bookingId = '';
let bookingThread = '';
let directThread = '';
let createdDirect = false;
let offerThread = '';
let start = new Date();
const minutes = (n: number) => new Date(start.getTime() + n * 60_000);
const timesLine = sql`${messages.event}->>'type' = 'times_shared'`;

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values([
    { ...desk, id: TASK, slug: 'bct-test-desk', posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 },
    { ...desk, id: OFFER_TASK, slug: 'bct-test-offer', posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 },
  ]);
  await db.insert(offers).values([
    { ...offer, id: 'off_bct_jordan', taskId: TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) },
    { ...offer, id: 'off_bct_offer', taskId: OFFER_TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) },
  ]);
  const booked = await confirmBooking(
    { db, payments: createDevPaymentProvider() },
    CLIENT,
    TASK,
    'off_bct_jordan',
    { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true },
    new Date(),
  );
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  bookingId = booked.redirectTo.split('/').pop()!;
  const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  start = row!.startAt;
  bookingThread = await ensureThread(db, bookingThreadLink(row!), now);
  offerThread = await ensureThread(db, { kind: 'offer', linkedId: 'off_bct_offer', taskId: OFFER_TASK, participantIds: [CLIENT, HELPER] }, now);

  // Jordan's open times: four open, one someone requested, and one of Sam's.
  const slot = (id: string, days: number, extra: Partial<typeof availabilityPosts.$inferInsert> = {}) => ({
    id, helperUserId: HELPER, marketId: 'mkt_austin', categoryId: 'cat_furniture_assembly', startAt: new Date(now.getTime() + days * DAY), endAt: new Date(now.getTime() + days * DAY + 3 * 3_600_000),
    pricingType: 'fixed', priceCents: 6000, status: 'active', ...extra,
  });
  await db.insert(availabilityPosts).values([slot('avl_bct_3', 4), slot('avl_bct_1', 2), slot('avl_bct_2', 3), slot('avl_bct_4', 5), slot('avl_bct_held', 6, { status: 'held' }), slot('avl_bct_sam', 2, { helperUserId: 'usr_sam' })]);

  const pair = directPairKey(CLIENT, HELPER);
  const [existing] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, pair))).limit(1);
  if (existing) directThread = existing.id;
  else {
    directThread = 'thr_bct_direct';
    createdDirect = true;
    await db.insert(threads).values({ id: directThread, kind: 'direct', linkedId: pair, startedByUserId: CLIENT, createdAt: now });
    await db.insert(threadParticipants).values([{ threadId: directThread, userId: CLIENT }, { threadId: directThread, userId: HELPER }]);
  }
});

afterAll(async () => {
  await db.delete(messages).where(and(inArray(messages.threadId, [directThread, offerThread]), timesLine));
  if (createdDirect) {
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, directThread));
    await db.delete(threads).where(eq(threads.id, directThread));
  }
  await db.delete(outboxEvents).where(and(eq(outboxEvents.type, 'message.sent'), inArray(outboxEvents.aggregateId, [directThread, offerThread])));
  await db.delete(availabilityPosts).where(inArray(availabilityPosts.id, SLOTS));
  await db.delete(rateLimits).where(or(like(rateLimits.key, `%share-times:${HELPER}%`), like(rateLimits.key, `%running-late:${bookingId}%`)));
  await pool.end();
});

const tools = async (userId: string, at: Date) => {
  const page = await getThreadPage(db, userId, bookingThread, at);
  return { chips: page?.bookingActions?.map((action) => action.id) ?? [], agreement: page?.agreement, page };
};

describe('a booking\'s conversation', () => {
  it('pins what they agreed, each with their own money and never the address', async () => {
    const client = await tools(CLIENT, minutes(-180));
    expect(client.agreement).toMatchObject({ bookingId, categorySlug: 'furniture-assembly', money: { kind: 'client_total', amountCents: 6300 }, remote: false, checklist: ['all_parts_used', 'level_and_stable', 'anchored_if_asked', 'packaging_cleared'] });
    expect(client.agreement?.start).toBe(start.toISOString());
    const helper = await tools(HELPER, minutes(-180));
    expect(helper.agreement?.money).toEqual({ kind: 'helper_earnings', amountCents: 6000 });
    // Each sees only their own side of the money, and no part of the address anywhere in it.
    expect(JSON.stringify(helper.agreement)).not.toContain('6300');
    expect(JSON.stringify(client.agreement)).not.toContain('"amountCents":6000');
    expect(JSON.stringify(client.agreement)).not.toContain('1234 Example Lane');
    expect(await getThreadPage(db, STRANGER, bookingThread, minutes(-180))).toBeNull();
  });

  it('offers each person the day-of updates the booking page allows them now', async () => {
    // Three hours ahead: nothing yet (On my way and Running late open two hours before).
    expect((await tools(HELPER, minutes(-180))).chips).toEqual([]);
    expect((await tools(HELPER, minutes(-60))).chips).toEqual(['on_my_way', 'running_late']);
    expect((await tools(CLIENT, minutes(-60))).chips).toEqual([]);
  });

  it('runs a chip as the booking page does, and the conversation shows its line', async () => {
    // The client can't say the helper is on the way; nor can anyone outside the booking.
    expect(await runBookingChatAction(db, CLIENT, bookingThread, { action: 'on_my_way' }, minutes(-60))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await runBookingChatAction(db, STRANGER, bookingThread, { action: 'on_my_way' }, minutes(-60))).toEqual({ ok: false, code: 'not_found' });
    expect(await runBookingChatAction(db, HELPER, directThread, { action: 'on_my_way' }, minutes(-60))).toEqual({ ok: false, code: 'not_found' });
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'approve' } as never, minutes(-60))).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'on_my_way' }, minutes(-60))).toEqual({ ok: true, code: 'on_the_way' });
    // Running late asks by how many minutes, as the booking page's sheet.
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'running_late' }, minutes(-25))).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { minutes: ['required'] } });
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'running_late', minutes: 20 }, minutes(-25))).toEqual({ ok: true, code: 'updated' });
    const onTheWay = await tools(HELPER, minutes(-25));
    expect(onTheWay.chips).toEqual(['arrived', 'running_late']);
    expect(onTheWay.page?.messages.filter((message) => message.kind === 'status').map((message) => [message.event?.type, message.event?.params?.minutes])).toEqual(expect.arrayContaining([['on_my_way', undefined], ['running_late', 20]]));
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'arrived' }, minutes(-20))).toEqual({ ok: true, code: 'arrived' });
    expect((await tools(HELPER, minutes(-15))).chips).toEqual(['submit_completion']);
    expect(await runBookingChatAction(db, HELPER, bookingThread, { action: 'submit_completion' }, minutes(-15))).toEqual({ ok: true, code: 'opened', redirectTo: routes.app.bookingComplete(bookingId) });
  });

  it('gives the client "I\'m here" while the helper can\'t get in, and the helper sees the answer', async () => {
    expect(await reportCantAccess(db, HELPER, bookingId, { note: '' }, minutes(1))).toMatchObject({ ok: true });
    expect((await tools(CLIENT, minutes(2))).chips).toEqual(['im_here']);
    expect(await runBookingChatAction(db, CLIENT, bookingThread, { action: 'im_here' }, minutes(2))).toEqual({ ok: true, code: 'updated' });
    const after = await tools(HELPER, minutes(3));
    expect(after.page?.messages.some((message) => message.event?.type === 'client_present')).toBe(true);
    expect((await tools(CLIENT, minutes(3))).chips).toEqual([]);
  });
});

describe('shared open times', () => {
  it('offers a helper their own open slots to share, soonest first; nothing for the client', async () => {
    const helper = await getThreadPage(db, HELPER, directThread, now);
    const shareable = helper?.requestOptions?.shareableSlots?.map((slot) => slot.id) ?? [];
    expect(shareable.filter((id) => id.startsWith('avl_bct_'))).toEqual(['avl_bct_1', 'avl_bct_2', 'avl_bct_3', 'avl_bct_4']);
    const client = await getThreadPage(db, CLIENT, directThread, now);
    expect(client?.requestOptions?.shareableSlots).toBeUndefined();
  });

  it('shares only two or three of the helper\'s own open slots, with the other person in the conversation', async () => {
    const share = (userId: string, slotIds: string[], thread = directThread) => shareTimes(db, userId, thread, { slotIds }, now);
    expect(await share(CLIENT, ['avl_bct_1', 'avl_bct_2'])).toEqual({ ok: false, code: 'not_allowed' });
    expect(await share(STRANGER, ['avl_bct_1', 'avl_bct_2'])).toEqual({ ok: false, code: 'not_found' });
    expect(await share(HELPER, ['avl_bct_1'])).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['too_short'] } });
    expect(await share(HELPER, ['avl_bct_1', 'avl_bct_2', 'avl_bct_3', 'avl_bct_4'])).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['too_long'] } });
    expect(await share(HELPER, ['avl_bct_1', 'avl_bct_1'])).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await share(HELPER, ['avl_bct_1', 'avl_bct_sam'])).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['invalid'] } });
    expect(await share(HELPER, ['avl_bct_1', 'avl_bct_held'])).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['invalid'] } });
    // Not in a booking's conversation.
    expect(await share(HELPER, ['avl_bct_1', 'avl_bct_2'], bookingThread)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await share(HELPER, ['avl_bct_3', 'avl_bct_1'])).toEqual({ ok: true, code: 'sent' });
    const [line] = await db.select().from(messages).where(and(eq(messages.threadId, directThread), timesLine));
    expect(line?.event).toEqual({ type: 'times_shared', params: { slotIds: ['avl_bct_1', 'avl_bct_3'] } });
    const [told] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'message.sent'), eq(outboxEvents.aggregateId, directThread)));
    expect(told?.payload).toMatchObject({ threadId: directThread, senderUserId: HELPER, recipientIds: [CLIENT] });
  });

  it('shows the card with where each time stands, for the client to pick and the helper to follow', async () => {
    const [line] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, directThread), timesLine));
    const client = await getThreadPage(db, CLIENT, directThread, now);
    expect(client?.cards?.sharedTimes?.[line!.id]).toMatchObject({ viewerRole: 'client', helperHandle: 'jordan-t', timeZone: 'America/Chicago', slots: [{ id: 'avl_bct_1', state: 'open' }, { id: 'avl_bct_3', state: 'open' }] });
    await db.update(availabilityPosts).set({ status: 'held' }).where(eq(availabilityPosts.id, 'avl_bct_3'));
    const later = await getThreadPage(db, CLIENT, directThread, new Date(now.getTime() + 2 * DAY + 3_600_000));
    expect(later?.cards?.sharedTimes?.[line!.id]?.slots.map((slot) => [slot.id, slot.state])).toEqual([['avl_bct_1', 'past'], ['avl_bct_3', 'taken']]);
    const helper = await getThreadPage(db, HELPER, directThread, now);
    expect(helper?.cards?.sharedTimes?.[line!.id]?.viewerRole).toBe('helper');
    await db.update(availabilityPosts).set({ status: 'active' }).where(eq(availabilityPosts.id, 'avl_bct_3'));
  });

  it('works in the helper\'s open offer conversation, and not once the offer is closed', async () => {
    const helper = await getThreadPage(db, HELPER, offerThread, now);
    expect(helper?.requestOptions?.shareableSlots?.length).toBeGreaterThanOrEqual(2);
    expect((await getThreadPage(db, CLIENT, offerThread, now))?.requestOptions?.shareableSlots).toBeUndefined();
    expect(await shareTimes(db, HELPER, offerThread, { slotIds: ['avl_bct_2', 'avl_bct_4'] }, now)).toEqual({ ok: true, code: 'sent' });
    await db.update(offers).set({ status: 'declined' }).where(eq(offers.id, 'off_bct_offer'));
    expect(await shareTimes(db, HELPER, offerThread, { slotIds: ['avl_bct_2', 'avl_bct_4'] }, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('is rate-limited', async () => {
    let sent = 2;
    let limited = false;
    for (let i = 0; i < SHARE_TIMES_RULE.limit && !limited; i += 1) {
      const result = await shareTimes(db, HELPER, directThread, { slotIds: ['avl_bct_1', 'avl_bct_2'] }, now);
      if (result.ok) sent += 1;
      else limited = result.code === 'rate_limited';
    }
    expect(limited).toBe(true);
    expect(sent).toBe(SHARE_TIMES_RULE.limit);
  });
});
