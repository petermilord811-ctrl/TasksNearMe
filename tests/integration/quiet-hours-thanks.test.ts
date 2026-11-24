import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttentionTarget, NotificationType } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { bookingThreadLink, ensureThread, getThreadPage } from '@/modules/messaging/service';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { deliverNotifications, type DeliveryProviders } from '@/modules/notifications/delivery';
import { saveQuietHours } from '@/modules/notifications/own-quiet-hours';
import { notificationDeliveries, notificationPreferences, notificationQuietHours, notifications } from '@/modules/notifications/schema';
import { offers } from '@/modules/offers/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { moderateReportedThanks } from '@/modules/support/staff';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { reportTarget } from '@/modules/support/target-reports';
import { tasks } from '@/modules/tasks/schema';
import { deleteThanks, saveThanks, setThanksNameHidden, setThanksShown } from '@/modules/thanks/service';
import { thankYouNotes } from '@/modules/thanks/schema';
import { publicThanksOf } from '@/modules/thanks/views';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Quiet hours of one's own and thank-you notes (2026-11-24). A client and a helper made for this file, with a completed
 * booking copied from Maya's wardrobe with Sam. Times in March 2027 on Austin's clock (CST, UTC-6), away from other files'
 * notifications.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tyn_client';
const HELPER = 'usr_tyn_helper';
const HANDLE = 'tyn-helper';
const TASK = 'tsk_tyn';
const OFFER = 'off_tyn';
const BOOKING = 'bkg_tyn';
const DIRECT_THREAD = 'thr_tyn_direct';
const HELPER_EMAIL = 'tyn-helper@example.test';
const HELPER_PHONE = '+15125550290';
const STAFF = { id: 'usr_morgan', roles: ['support_lead' as const] };

const DAY = new Date('2027-03-02T18:00:00.000Z'); // noon
const LATE = new Date('2027-03-03T03:30:00.000Z'); // 9:30 pm
const NIGHT = new Date('2027-03-03T04:00:00.000Z'); // 10 pm
const EIGHT = new Date('2027-03-03T14:00:00.000Z'); // 8 am the next morning
const HOUR = 3_600_000;

type Sent = { channel: 'email' | 'sms'; to: string; text: string };
let sent: Sent[] = [];
const providers: DeliveryProviders = {
  email: { name: 'test', async send(message) { sent.push({ channel: 'email', to: message.to, text: message.text }); } },
  sms: { name: 'test', async send(message) { sent.push({ channel: 'sms', to: message.to, text: message.text }); } },
};
const mine = () => sent.filter((item) => item.to === HELPER_EMAIL || item.to === HELPER_PHONE);
const run = (now: Date) => deliverNotifications(db, now, providers, 1_000);
let bookingThread = '';
/** Every note written here, for the audit rows staff decisions leave. */
const noteIds: string[] = [];

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_wardrobe'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_wardrobe_sam'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_wardrobe'));
  if (!maya || !sam || !profile || !task || !offer || !booking) throw new Error('The seeded wardrobe booking is missing');
  await db.insert(users).values([
    { ...maya, id: CLIENT, email: 'tyn-client@example.test', name: 'Tia N.', firstName: 'Tia', lastName: 'Nolan', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin' },
    { ...sam, id: HELPER, email: HELPER_EMAIL, name: 'Hal P.', firstName: 'Hal', lastName: 'Price', phone: HELPER_PHONE, phoneVerifiedAt: new Date('2027-01-01T00:00:00Z'), homeMarketId: 'mkt_austin' },
  ]);
  await db.insert(helperProfiles).values({ ...profile, userId: HELPER, handle: HANDLE, status: 'active', foundingNumber: null });
  await db.insert(tasks).values({ ...task, id: TASK, slug: `${task.slug}-tyn`, posterUserId: CLIENT });
  await db.insert(offers).values({ ...offer, id: OFFER, taskId: TASK, helperUserId: HELPER });
  await db.insert(bookings).values({ ...booking, id: BOOKING, taskId: TASK, offerId: OFFER, posterUserId: CLIENT, helperUserId: HELPER, seriesId: null, status: 'completed', startAt: new Date(NIGHT.getTime() - 72 * HOUR), completedAt: new Date(NIGHT.getTime() - 48 * HOUR) });
  bookingThread = await ensureThread(db, bookingThreadLink({ id: BOOKING, taskId: TASK, posterUserId: CLIENT, helperUserId: HELPER }), new Date(NIGHT.getTime() - 48 * HOUR));
  // Message texts on, so a held text can be seen keeping quiet hours later.
  await db.insert(notificationPreferences).values({ userId: HELPER, topic: 'messages', channel: 'sms', enabled: 'true' });
});

afterAll(async () => {
  const people = [CLIENT, HELPER];
  const cases = (await db.select({ id: supportCases.id }).from(supportCases).where(or(inArray(supportCases.openedByUserId, people), inArray(supportCases.subjectUserId, people)))).map((row) => row.id);
  if (cases.length) {
    await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, cases));
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, cases));
    await db.delete(supportCases).where(inArray(supportCases.id, cases));
  }
  await db.delete(thankYouNotes).where(eq(thankYouNotes.bookingId, BOOKING));
  if (noteIds.length || cases.length) await db.delete(auditLog).where(inArray(auditLog.targetId, [...noteIds, ...cases]));
  await db.delete(messages).where(inArray(messages.threadId, [bookingThread, DIRECT_THREAD]));
  await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, [bookingThread, DIRECT_THREAD]));
  await db.delete(threads).where(inArray(threads.id, [bookingThread, DIRECT_THREAD]));
  await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, people));
  await db.delete(notifications).where(inArray(notifications.userId, people));
  await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, people));
  await db.delete(notificationQuietHours).where(inArray(notificationQuietHours.userId, people));
  await db.delete(bookings).where(eq(bookings.id, BOOKING));
  await db.delete(offers).where(eq(offers.id, OFFER));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(users).where(inArray(users.id, people));
  await pool.end();
});

let count = 0;
async function notify(type: NotificationType, at: Date, target: AttentionTarget): Promise<string> {
  const id = `ntf_tyn_${++count}`;
  await db.insert(notifications).values({ id, userId: HELPER, type, title: 'Assemble a wardrobe', actorName: 'Tia N.', target, sourceEventId: `evt_tyn_${count}`, createdAt: at });
  return id;
}
const deliveriesOf = async (notificationId: string) =>
  Object.fromEntries((await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, notificationId))).map((row) => [row.channel, row]));
const quiet = (enabled: boolean, startsAt = '21:00', endsAt = '08:00') => saveQuietHours(db, HELPER, { enabled, startsAt, endsAt }, DAY);

describe('quiet hours of their own', () => {
  it('saves only real, different times', async () => {
    expect(await saveQuietHours(db, HELPER, { enabled: true, startsAt: '21:00', endsAt: '21:00' }, DAY)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await saveQuietHours(db, HELPER, { enabled: true, startsAt: '25:00', endsAt: '08:00' }, DAY)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await quiet(true)).toEqual({ ok: true, code: 'updated' });
  });

  it('keeps a message notification in the app inside them: no email or text, and nothing later', async () => {
    sent = [];
    await quiet(true);
    const message = await notify('message_received', NIGHT, { kind: 'thread', threadId: DIRECT_THREAD });
    await run(NIGHT);
    expect(await deliveriesOf(message)).toMatchObject({ email: { status: 'skipped', reason: 'own_quiet_hours' }, sms: { status: 'skipped', reason: 'own_quiet_hours' } });
    await run(new Date(EIGHT.getTime() + 60_000));
    expect(mine()).toEqual([]);
    // Still in the app (the bell and the unread count).
    const [row] = await db.select().from(notifications).where(eq(notifications.id, message));
    expect(row?.readAt).toBeNull();
  });

  it('lets every other notification through: a booking update goes by email at once', async () => {
    sent = [];
    await quiet(true);
    const confirmed = await notify('booking_confirmed', NIGHT, { kind: 'booking', bookingId: BOOKING });
    await run(NIGHT);
    expect(await deliveriesOf(confirmed)).toMatchObject({ email: { status: 'sent' } });
    // Its text waits for 8 am under the night's rule for texts that can wait; settled here so it doesn't go out below.
    await db.update(notificationDeliveries).set({ status: 'skipped', reason: 'preference_off', sendAfter: null }).where(and(eq(notificationDeliveries.notificationId, confirmed), eq(notificationDeliveries.status, 'held')));
  });

  it("lets a booking conversation's message through on the booking's day or within 12 hours", async () => {
    sent = [];
    await quiet(true);
    await db.update(bookings).set({ startAt: new Date(NIGHT.getTime() + 10 * HOUR) }).where(eq(bookings.id, BOOKING));
    try {
      const message = await notify('message_received', NIGHT, { kind: 'thread', threadId: bookingThread });
      await run(NIGHT);
      expect(await deliveriesOf(message)).toMatchObject({ email: { status: 'sent' } });
      // The text still waits out the night's quiet hours for texts that can wait, as before.
      expect((await deliveriesOf(message)).sms?.status).toBe('held');
      await db.delete(notificationDeliveries).where(eq(notificationDeliveries.notificationId, message));
      await db.update(notifications).set({ readAt: NIGHT }).where(eq(notifications.id, message));
    } finally {
      await db.update(bookings).set({ startAt: new Date(NIGHT.getTime() - 72 * HOUR) }).where(eq(bookings.id, BOOKING));
    }
  });

  it('outside them, or once turned off, messages notify as usual', async () => {
    sent = [];
    await quiet(true);
    const midday = await notify('message_received', DAY, { kind: 'thread', threadId: DIRECT_THREAD });
    await run(DAY);
    expect(await deliveriesOf(midday)).toMatchObject({ email: { status: 'sent' } });
    await db.update(notifications).set({ readAt: DAY }).where(eq(notifications.id, midday));
    await quiet(false);
    const night = await notify('message_received', NIGHT, { kind: 'thread', threadId: DIRECT_THREAD });
    await run(NIGHT);
    expect(await deliveriesOf(night)).toMatchObject({ email: { status: 'sent' } });
    await db.update(notifications).set({ readAt: NIGHT }).where(eq(notifications.id, night));
  });

  it('a text held through the night keeps their own quiet hours when it comes due: never a burst later', async () => {
    sent = [];
    await quiet(true, '22:00', '09:00');
    const message = await notify('message_received', LATE, { kind: 'thread', threadId: DIRECT_THREAD });
    await run(LATE);
    // 9:30 pm: not quiet for them yet, so the email goes; the text waits for 8 am (texts that can wait).
    expect(await deliveriesOf(message)).toMatchObject({ email: { status: 'sent' }, sms: { status: 'held', reason: 'quiet_hours' } });
    await run(EIGHT);
    expect(await deliveriesOf(message)).toMatchObject({ sms: { status: 'skipped', reason: 'own_quiet_hours' } });
    expect(mine().filter((item) => item.channel === 'sms')).toEqual([]);
    await quiet(false);
  });

  it("shows the sender when the recipient's quiet hours end, only while they're on and the booking isn't soon", async () => {
    await quiet(true);
    expect((await getThreadPage(db, CLIENT, bookingThread, NIGHT))?.quietHours).toEqual({ until: '2027-03-03T14:00:00.000Z' });
    expect((await getThreadPage(db, CLIENT, bookingThread, DAY))?.quietHours).toBeUndefined();
    await db.update(bookings).set({ startAt: new Date(NIGHT.getTime() + 10 * HOUR) }).where(eq(bookings.id, BOOKING));
    expect((await getThreadPage(db, CLIENT, bookingThread, NIGHT))?.quietHours).toBeUndefined();
    await db.update(bookings).set({ startAt: new Date(NIGHT.getTime() - 72 * HOUR) }).where(eq(bookings.id, BOOKING));
    await quiet(false);
    expect((await getThreadPage(db, CLIENT, bookingThread, NIGHT))?.quietHours).toBeUndefined();
  });
});

describe('thank-you notes', () => {
  const words = 'Thank you, Hal! The wardrobe is perfect. Call me at 512-555-0199 for the next one.';
  let noteId = '';

  it('only the client of a completed booking writes one, up to 280 characters', async () => {
    expect(await saveThanks(db, HELPER, { bookingId: BOOKING, body: words }, NIGHT)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: '  ' }, NIGHT)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: 'x'.repeat(281) }, NIGHT)).toMatchObject({ ok: false, code: 'validation_failed' });
    await db.update(bookings).set({ status: 'completion_submitted' }).where(eq(bookings.id, BOOKING));
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: words }, NIGHT)).toMatchObject({ ok: false, code: 'not_allowed' });
    await db.update(bookings).set({ status: 'completed' }).where(eq(bookings.id, BOOKING));

    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: words }, NIGHT)).toMatchObject({ ok: true, code: 'sent', helperUserId: HELPER });
    const [note] = await db.select().from(thankYouNotes).where(eq(thankYouNotes.bookingId, BOOKING));
    noteId = note!.id;
    noteIds.push(noteId);
    expect(note).toMatchObject({ authorUserId: CLIENT, helperUserId: HELPER, shownOnProfile: false, hideName: false });
    // Its line in the booking's conversation, with the note's id.
    const lines = await db.select().from(messages).where(and(eq(messages.threadId, bookingThread), sql`${messages.event}->>'type' = 'thanks_sent'`));
    expect(lines.map((line) => line.event?.params?.noteId)).toEqual([noteId]);
  });

  it('shows as a card in the conversation: for the helper masked as the conversation is, for the client as written', async () => {
    const helperPage = await getThreadPage(db, HELPER, bookingThread, NIGHT);
    const card = helperPage?.cards?.thanks?.[noteId];
    expect(card).toMatchObject({ viewerRole: 'helper', shownOnProfile: false, reportable: true });
    // A paid booking's conversation shows contact details, and so does its note.
    expect(card?.segments).toEqual([{ kind: 'text', text: words }]);
    expect(card?.draft).toBeUndefined();
    // Unpaid (`confirmed_at` unset), they're masked, as in the conversation.
    const [paid] = await db.select({ confirmedAt: bookings.confirmedAt }).from(bookings).where(eq(bookings.id, BOOKING));
    await db.update(bookings).set({ confirmedAt: null }).where(eq(bookings.id, BOOKING));
    const unpaid = (await getThreadPage(db, HELPER, bookingThread, NIGHT))?.cards?.thanks?.[noteId];
    expect(unpaid?.segments.some((segment) => segment.kind === 'masked' && segment.detail === 'phone')).toBe(true);
    await db.update(bookings).set({ confirmedAt: paid?.confirmedAt ?? NIGHT }).where(eq(bookings.id, BOOKING));
    const clientPage = await getThreadPage(db, CLIENT, bookingThread, NIGHT);
    expect(clientPage?.cards?.thanks?.[noteId]).toMatchObject({ viewerRole: 'client', draft: words, editableUntil: new Date(NIGHT.getTime() + 24 * HOUR).toISOString() });
    // The offer is gone once it's written.
    expect(clientPage?.thanks).toMatchObject({ canWrite: false, note: { id: noteId } });
  });

  it('one note per booking: writing again edits it for 24 hours, then it stays as it is', async () => {
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: 'Thank you, Hal! Call me at 512-555-0199 anytime.', hideName: true }, new Date(NIGHT.getTime() + 2 * HOUR))).toMatchObject({ ok: true, code: 'saved' });
    expect(await db.select({ body: thankYouNotes.body, hideName: thankYouNotes.hideName }).from(thankYouNotes).where(eq(thankYouNotes.bookingId, BOOKING))).toEqual([{ body: 'Thank you, Hal! Call me at 512-555-0199 anytime.', hideName: true }]);
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: 'Too late now' }, new Date(NIGHT.getTime() + 25 * HOUR))).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await db.select().from(thankYouNotes).where(eq(thankYouNotes.bookingId, BOOKING))).toHaveLength(1);
  });

  it("goes on the helper's profile only with their consent, by area alone when the client hid their name", async () => {
    expect(await publicThanksOf(db, HELPER)).toEqual([]);
    expect(await setThanksShown(db, CLIENT, noteId, true, NIGHT)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await setThanksShown(db, HELPER, noteId, true, NIGHT)).toMatchObject({ ok: true, code: 'updated' });
    const [shown] = await publicThanksOf(db, HELPER);
    expect(shown).toMatchObject({ id: noteId, area: expect.any(String) });
    // Public: contact details are always masked.
    expect(shown?.text).toMatch(/^Thank you, Hal! Call me at /);
    expect(shown?.text).not.toContain('555-0199');
    expect(shown?.firstName).toBeUndefined();
    expect(await setThanksNameHidden(db, CLIENT, noteId, false, NIGHT)).toMatchObject({ ok: true, code: 'updated' });
    expect((await publicThanksOf(db, HELPER))[0]).toMatchObject({ firstName: 'Tia' });
    expect((await getHelperProfile(HANDLE, db))?.thanks?.map((note) => note.id)).toEqual([noteId]);
    // Revocable.
    await setThanksShown(db, HELPER, noteId, false, NIGHT);
    expect(await publicThanksOf(db, HELPER)).toEqual([]);
    await setThanksShown(db, HELPER, noteId, true, NIGHT);
  });

  it('can be reported, and staff can hide it (off the profile, and the helper no longer sees its words) and show it again', async () => {
    expect(await reportTarget(db, CLIENT, 'thanks', noteId, { reason: 'harassment', details: 'Reporting my own note should not work.' }, NIGHT)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await reportTarget(db, HELPER, 'thanks', noteId, { reason: 'harassment', details: 'This note says things that are not okay.' }, NIGHT)).toMatchObject({ ok: true, code: 'submitted' });
    const [reported] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, HELPER), sql`${supportCases.context}->>'thanksId' = ${noteId}`));
    expect(reported).toMatchObject({ type: 'report_content', subjectUserId: CLIENT });

    expect(await moderateReportedThanks(db, STAFF, reported!.id, { visible: false, reason: 'Hidden after reading the report.' }, NIGHT)).toMatchObject({ ok: true, code: 'updated', helperHandle: HANDLE });
    expect(await publicThanksOf(db, HELPER)).toEqual([]);
    expect(await setThanksShown(db, HELPER, noteId, true, NIGHT)).toMatchObject({ ok: false, code: 'not_allowed' });
    const helperCard = (await getThreadPage(db, HELPER, bookingThread, NIGHT))?.cards?.thanks?.[noteId];
    expect(helperCard).toMatchObject({ hidden: true, segments: [] });
    expect(helperCard?.reportable).toBeUndefined();
    expect(await saveThanks(db, CLIENT, { bookingId: BOOKING, body: 'Changed' }, new Date(NIGHT.getTime() + HOUR))).toMatchObject({ ok: false, code: 'not_allowed' });

    expect(await moderateReportedThanks(db, STAFF, reported!.id, { visible: true, reason: 'Shown again after a second look.' }, NIGHT)).toMatchObject({ ok: true, code: 'updated' });
    expect((await publicThanksOf(db, HELPER)).map((note) => note.id)).toEqual([noteId]);
  });

  it('the client deletes it at any time: it leaves the conversation and the profile, and they may write a new one', async () => {
    expect(await deleteThanks(db, HELPER, noteId)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await deleteThanks(db, CLIENT, noteId)).toMatchObject({ ok: true, code: 'updated', helperUserId: HELPER });
    expect(await publicThanksOf(db, HELPER)).toEqual([]);
    expect((await getThreadPage(db, HELPER, bookingThread, new Date(NIGHT.getTime() + 30 * HOUR)))?.cards?.thanks).toBeUndefined();
    expect((await getThreadPage(db, CLIENT, bookingThread, new Date(NIGHT.getTime() + 30 * HOUR)))?.thanks).toMatchObject({ canWrite: true });
  });
});
