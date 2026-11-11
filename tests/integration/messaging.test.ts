import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { canViewRelatedFile } from '@/modules/files/related-access';
import { blocks, threads } from '@/modules/messaging/schema';
import { getInbox, getThreadPage, offerThreadId, sendMessage } from '@/modules/messaging/service';
import { offers } from '@/modules/offers/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

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
    await getThreadPage(db, 'usr_ruth', offerThread, now());
    expect((await getInbox(db, 'usr_ruth', now())).threads.find((t) => t.id === offerThread)?.unreadCount).toBe(0);
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
});
