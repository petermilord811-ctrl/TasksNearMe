import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { canViewRelatedFile } from '@/modules/files/related-access';
import { blocks, threads } from '@/modules/messaging/schema';
import { bookingThreadLink, ensureThread, getInbox, getThreadPage, offerThreadId, postEvent, sendMessage, unreadMessageCount } from '@/modules/messaging/service';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { cancelTask } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const now = () => new Date();
const TASK = 'tsk_msg_test';
let offerThread = '';

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  // Posted by Ruth: paying has a per-person limit, and other files book as Maya and Ana.
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'msg-test-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_msg_jordan', taskId: TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(files).values({ id: 'fil_msg_photo', ownerUserId: 'usr_jordan', kind: 'message', storageKey: 'test/msg.webp', contentType: 'image/webp', width: 800, height: 600, bytes: 10 });
  offerThread = (await offerThreadId(db, 'off_msg_jordan', now()))!;
});

describe('offer threads', () => {
  it('is one thread per offer, for the client and the helper only', async () => {
    expect(await offerThreadId(db, 'off_msg_jordan', now())).toBe(offerThread);
    expect(await getThreadPage(db, 'usr_maya', offerThread, now())).toBeNull();
    const client = await getThreadPage(db, 'usr_ruth', offerThread, now());
    expect(client?.thread).toMatchObject({ kind: 'offer', contactMasking: true, subject: { kind: 'offer_for_client', taskId: TASK, offerId: 'off_msg_jordan' } });
    const helper = await getThreadPage(db, 'usr_jordan', offerThread, now());
    expect(helper?.thread.subject).toEqual({ kind: 'task_for_helper', taskId: TASK });
    expect(helper?.composer).toMatchObject({ canSend: true, maxLength: 2000 });
  });

  it('masks contact details for the other person before booking, never for the writer', async () => {
    expect(await sendMessage(db, 'usr_jordan', offerThread, { body: 'Text me at 512-555-0199', attachmentIds: ['fil_msg_photo'] }, now())).toEqual({ ok: true, code: 'sent' });
    const client = await getThreadPage(db, 'usr_ruth', offerThread, now());
    expect(JSON.stringify(client?.messages)).not.toContain('512-555-0199');
    expect(client?.messages.at(-1)?.segments).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0199' });
    expect(client?.messages.at(-1)?.attachments).toEqual([expect.objectContaining({ id: 'fil_msg_photo' })]);
    expect(await canViewRelatedFile(db, { id: 'fil_msg_photo', kind: 'message' }, 'usr_ruth', now())).toBe(true);
    expect(await canViewRelatedFile(db, { id: 'fil_msg_photo', kind: 'message' }, 'usr_maya', now())).toBe(false);
    const helper = await getThreadPage(db, 'usr_jordan', offerThread, now());
    expect(JSON.stringify(helper?.messages)).toContain('512-555-0199');
  });

  it('counts unread messages until the thread is opened', async () => {
    await sendMessage(db, 'usr_jordan', offerThread, { body: 'I can also come at 11.', attachmentIds: [] }, now());
    const inbox = await getInbox(db, 'usr_ruth', now());
    expect(inbox.threads.find((t) => t.id === offerThread)?.unreadCount).toBe(1);
    // Unread conversations first, whatever their age (audit M33).
    const firstRead = inbox.threads.findIndex((t) => t.unreadCount === 0);
    expect(firstRead === -1 || inbox.threads.slice(firstRead).every((t) => t.unreadCount === 0)).toBe(true);
    await getThreadPage(db, 'usr_ruth', offerThread, now());
    expect((await getInbox(db, 'usr_ruth', now())).threads.find((t) => t.id === offerThread)?.unreadCount).toBe(0);
  });

  it('says why an offer thread closed: expired, declined or withdrawn (audit L13)', async () => {
    const offer = await db.select().from(offers).where(eq(offers.id, 'off_msg_jordan')).then((rows) => rows[0]!);
    try {
      await db.update(offers).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(offers.id, 'off_msg_jordan'));
      expect((await getThreadPage(db, 'usr_ruth', offerThread, now()))?.composer).toMatchObject({ canSend: false, disabledReason: 'closed', closedReason: 'offer_expired' });
      await db.update(offers).set({ expiresAt: offer.expiresAt, status: 'declined' }).where(eq(offers.id, 'off_msg_jordan'));
      expect((await getThreadPage(db, 'usr_jordan', offerThread, now()))?.composer).toMatchObject({ disabledReason: 'closed', closedReason: 'offer_declined' });
      await db.update(offers).set({ status: 'withdrawn' }).where(eq(offers.id, 'off_msg_jordan'));
      expect((await getThreadPage(db, 'usr_ruth', offerThread, now()))?.composer).toMatchObject({ disabledReason: 'closed', closedReason: 'offer_withdrawn' });
    } finally {
      await db.update(offers).set({ status: offer.status, expiresAt: offer.expiresAt }).where(eq(offers.id, 'off_msg_jordan'));
    }
    expect((await getThreadPage(db, 'usr_ruth', offerThread, now()))?.composer).toMatchObject({ canSend: true });
    expect((await getThreadPage(db, 'usr_ruth', offerThread, now()))?.composer.closedReason).toBeUndefined();
  });

  it('refuses empty messages, other people, and blocked pairs', async () => {
    expect(await sendMessage(db, 'usr_ruth', offerThread, { body: '  ', attachmentIds: [] }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await sendMessage(db, 'usr_maya', offerThread, { body: 'Hello', attachmentIds: [] }, now())).toEqual({ ok: false, code: 'not_found' });
    expect(await sendMessage(db, 'usr_ruth', offerThread, { body: 'Hello', attachmentIds: ['fil_msg_photo'] }, now())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { attachmentIds: ['invalid'] },
    });
    await db.insert(blocks).values({ blockerId: 'usr_ruth', blockedId: 'usr_jordan' });
    expect((await getThreadPage(db, 'usr_jordan', offerThread, now()))?.composer).toMatchObject({ canSend: false, disabledReason: 'blocked' });
    expect(await sendMessage(db, 'usr_jordan', offerThread, { body: 'Hello?', attachmentIds: [] }, now())).toEqual({ ok: false, code: 'not_allowed' });
    await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_ruth'), eq(blocks.blockedId, 'usr_jordan')));
  });
});

describe('offer threads on a canceled task (sweep D9)', () => {
  async function seededDeskAndOffer() {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!desk || !offer) throw new Error('The seeded desk is missing');
    return { desk, offer };
  }

  it('says the task was canceled, to the client and the helper, when canceling it declined the open offer', async () => {
    const { desk, offer } = await seededDeskAndOffer();
    await db.insert(tasks).values({ ...desk, id: 'tsk_msg_cancel', slug: 'msg-cancel-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer, id: 'off_msg_cancel', taskId: 'tsk_msg_cancel', status: 'pending', revision: 1, closedAt: null, expiresAt: new Date(Date.now() + 86_400_000) });
    const thread = (await offerThreadId(db, 'off_msg_cancel', now()))!;
    expect(await cancelTask(db, 'usr_ruth', 'tsk_msg_cancel', 'no_longer_needed', now())).toEqual({ ok: true, code: 'canceled' });
    // Not "You declined Jordan's offer" for Ruth, nor "Ruth chose another offer" for Jordan.
    for (const userId of ['usr_ruth', 'usr_jordan']) {
      expect((await getThreadPage(db, userId, thread, now()))?.composer).toMatchObject({ canSend: false, disabledReason: 'closed', closedReason: 'task_canceled' });
    }
  });

  it('still says another offer was chosen when booking it declined this one, even once the task is canceled', async () => {
    const { desk, offer } = await seededDeskAndOffer();
    const bookedAt = new Date(Date.now() - 3_600_000);
    await db.insert(tasks).values({ ...desk, id: 'tsk_msg_chosen', slug: 'msg-chosen-desk', posterUserId: 'usr_ruth', status: 'canceled', offerCount: 0, version: 3 });
    await db.insert(offers).values([
      { ...offer, id: 'off_msg_chosen_lee', taskId: 'tsk_msg_chosen', helperUserId: 'usr_lee', status: 'accepted', revision: 1, closedAt: bookedAt },
      { ...offer, id: 'off_msg_lost_jordan', taskId: 'tsk_msg_chosen', status: 'declined', revision: 1, closedAt: bookedAt },
    ]);
    const thread = (await offerThreadId(db, 'off_msg_lost_jordan', now()))!;
    expect((await getThreadPage(db, 'usr_jordan', thread, now()))?.composer).toMatchObject({ disabledReason: 'closed', closedReason: 'offer_declined' });
  });
});

describe('booking threads', () => {
  it('opens with a notice when booked; contact details show from then on; check-in posts status lines', async () => {
    const booked = await confirmBooking(
      { db, payments: createDevPaymentProvider() },
      'usr_ruth',
      TASK,
      'off_msg_jordan',
      { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true },
      now(),
    );
    if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
    const bookingId = booked.redirectTo.split('/').pop()!;
    const [thread] = await db.select().from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, bookingId)));
    expect(thread).toBeDefined();

    // The offer thread unmasks once the booking is confirmed.
    const offerView = await getThreadPage(db, 'usr_ruth', offerThread, now());
    expect(offerView?.thread.contactMasking).toBe(false);
    expect(JSON.stringify(offerView?.messages)).toContain('512-555-0199');

    const [booking] = await db.select({ startAt: bookings.startAt }).from(bookings).where(eq(bookings.id, bookingId));
    await runBookingAction(db, 'usr_jordan', bookingId, 'on_my_way', new Date(booking!.startAt.getTime() - 3_600_000));
    const page = await getThreadPage(db, 'usr_ruth', thread!.id, now());
    expect(page?.thread).toMatchObject({ kind: 'booking', contactMasking: false, subject: { kind: 'booking', bookingId } });
    expect(page?.messages.map((m) => [m.kind, m.event?.type])).toEqual([
      ['system', 'booked'],
      ['status', 'on_my_way'],
    ]);
  });

  it('keeps contact details hidden until the booking is paid: not while it waits for its charge, nor once canceled unpaid (sweep MN3)', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const policy = await getPublishedPolicy(desk!.marketId, db);
    // People made for this test, so the booking never shows in the seeded people's lists.
    const client = await throwawayClient(db, 'usr_mn3_client');
    const helper = await throwawayClient(db, 'usr_mn3_helper', 'usr_jordan');
    await db.insert(tasks).values({ ...desk!, id: 'tsk_mn3', slug: 'mn3-desk', posterUserId: client, status: 'assigned', offerCount: 0, version: 2 });
    // Booked more than 14 days ahead: `scheduled`, its card charged 72 h before, free to cancel until then.
    await db.insert(bookings).values({ id: 'bkg_mn3', taskId: 'tsk_mn3', posterUserId: client, helperUserId: helper, marketId: desk!.marketId, policyVersionId: policy!.id, status: 'scheduled', startAt: new Date(Date.now() + 20 * 86_400_000) });
    const thread = await ensureThread(db, bookingThreadLink({ id: 'bkg_mn3', taskId: 'tsk_mn3', posterUserId: client, helperUserId: helper }), now());
    expect(await sendMessage(db, helper, thread, { body: 'My cell is 512-555-0188', attachmentIds: [] }, now())).toEqual({ ok: true, code: 'sent' });
    const waiting = await getThreadPage(db, client, thread, now());
    expect(waiting?.thread.contactMasking).toBe(true);
    expect(waiting?.messages.at(-1)?.segments).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0188' });
    expect(JSON.stringify(waiting?.messages)).not.toContain('512-555-0188');
    // Canceled before its money came: still hidden.
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'funding_failed', canceledAt: now() }).where(eq(bookings.id, 'bkg_mn3'));
    expect(JSON.stringify((await getThreadPage(db, client, thread, now()))?.messages)).not.toContain('512-555-0188');
    // Paid: shown.
    await db.update(bookings).set({ status: 'confirmed', confirmedAt: now(), cancelReason: null, canceledAt: null }).where(eq(bookings.id, 'bkg_mn3'));
    expect(JSON.stringify((await getThreadPage(db, client, thread, now()))?.messages)).toContain('512-555-0188');
  });

  it("doesn't count a status line as unread for the person whose act it records, unless something else is unread for them (sweep MN8)", async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const policy = await getPublishedPolicy(desk!.marketId, db);
    const client = await throwawayClient(db, 'usr_mn8_client');
    const helper = await throwawayClient(db, 'usr_mn8_helper', 'usr_jordan');
    await db.insert(tasks).values({ ...desk!, id: 'tsk_mn8', slug: 'mn8-desk', posterUserId: client, status: 'assigned', offerCount: 0, version: 2 });
    await db.insert(bookings).values({ id: 'bkg_mn8', taskId: 'tsk_mn8', posterUserId: client, helperUserId: helper, marketId: desk!.marketId, policyVersionId: policy!.id, status: 'confirmed', confirmedAt: now(), startAt: new Date(Date.now() + 2 * 86_400_000) });
    const link = bookingThreadLink({ id: 'bkg_mn8', taskId: 'tsk_mn8', posterUserId: client, helperUserId: helper });
    // The client pays: "booked" is news to the helper, not to the client.
    await postEvent(db, link, 'system', { type: 'booked' }, now(), client);
    expect(await unreadMessageCount(db, client)).toBe(0);
    expect(await unreadMessageCount(db, helper)).toBe(1);
    // The helper's own "on my way", while the client's message waits unread for him: his read mark stays where it was,
    // so the message isn't taken as read (the line counts for him this once).
    await sendMessage(db, client, await ensureThread(db, link, now()), { body: 'The gate code is 4321.', attachmentIds: [] }, now());
    await postEvent(db, link, 'status', { type: 'on_my_way' }, now(), helper);
    expect(await unreadMessageCount(db, helper)).toBe(3);
    expect(await unreadMessageCount(db, client)).toBe(1);
    // Without an actor (the system's own notices), it's unread for both, as before.
    await postEvent(db, link, 'system', { type: 'auto_approved' }, now());
    expect(await unreadMessageCount(db, client)).toBe(2);
    expect(await unreadMessageCount(db, helper)).toBe(4);
  });
});
