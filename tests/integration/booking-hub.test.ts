import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingsPage, getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const hub = { db, cipher: fieldCipherFromEnv() };
const TASK = 'tsk_hub_test';
let bookingId = '';
let start = new Date();
const minutes = (n: number) => new Date(start.getTime() + n * 60_000);

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  // Posted by Ana: paying has a per-person limit, and other files book as Maya.
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'hub-test-desk', posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_hub_jordan', taskId: TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking(
    { db, payments: createDevPaymentProvider() },
    'usr_ana',
    TASK,
    'off_hub_jordan',
    { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true },
    new Date(),
  );
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  bookingId = booked.redirectTo.split('/').pop()!;
  const [row] = await db.select({ startAt: bookings.startAt }).from(bookings).where(eq(bookings.id, bookingId));
  start = row!.startAt;
});

describe('the booking page', () => {
  it('shows the client the address, the charge and the calendar; strangers get nothing', async () => {
    const view = await getBookingView(hub, 'usr_ana', bookingId, new Date());
    expect(view).toMatchObject({ status: 'confirmed', viewerRole: 'poster', addressVisibility: 'visible', exactAddress: { line1: '1234 Example Lane' } });
    expect(view?.payments).toEqual([expect.objectContaining({ kind: 'charge', amountCents: 6600, status: 'succeeded', method: { brand: 'visa', last4: '4242' } })]);
    expect(view?.actions.map((a) => a.id)).toEqual(['message', 'add_to_calendar', 'report_no_show', 'safety_report', 'cancel']);
    expect(view?.timeline.map((e) => e.type)).toEqual(['task_posted', 'offer_received', 'booked', 'payment_succeeded']);
    expect(await getBookingView(hub, 'usr_chris', bookingId, new Date())).toBeNull();
  });

  it('shows the helper the address but never the payments', async () => {
    const view = await getBookingView(hub, 'usr_jordan', bookingId, new Date());
    expect(view).toMatchObject({ viewerRole: 'helper', addressVisibility: 'visible', exactAddress: { line1: '1234 Example Lane' } });
    expect(view?.payments).toBeUndefined();
    expect(view?.actions.map((a) => [a.id, a.enabled])).toEqual([
      ['on_my_way', false],
      ['arrived', false],
      ['message', true],
      ['add_to_calendar', true],
      ['running_late', false],
      ['safety_report', true],
      ['cancel', true],
    ]);
  });

  it('checks in on the day: on my way, then arrived', async () => {
    expect(await runBookingAction(db, 'usr_jordan', bookingId, 'arrived', minutes(-120))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await runBookingAction(db, 'usr_ana', bookingId, 'on_my_way', minutes(-60))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await runBookingAction(db, 'usr_jordan', bookingId, 'on_my_way', minutes(-60))).toEqual({ ok: true, code: 'updated' });
    expect(await runBookingAction(db, 'usr_jordan', bookingId, 'arrived', minutes(-10))).toEqual({ ok: true, code: 'updated' });
    const view = await getBookingView(hub, 'usr_jordan', bookingId, minutes(-5));
    expect(view?.status).toBe('in_progress');
    expect(view?.checkIn).toEqual({ onMyWayAt: minutes(-60).toISOString(), arrivedAt: minutes(-10).toISOString() });
  });

  it('lets the client approve submitted work, then hides the address from the helper after 48 h', async () => {
    await db
      .update(bookings)
      .set({ status: 'completion_submitted', completionSubmittedAt: minutes(60), approvalDueAt: minutes(60 + 72 * 60) })
      .where(eq(bookings.id, bookingId));
    expect(await runBookingAction(db, 'usr_ana', bookingId, 'approve', minutes(70))).toEqual({ ok: true, code: 'updated' });
    expect(await runBookingAction(db, 'usr_ana', bookingId, 'approve', minutes(71))).toEqual({ ok: false, code: 'not_allowed' });
    const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, TASK));
    expect(task?.status).toBe('completed');

    const soon = await getBookingView(hub, 'usr_jordan', bookingId, minutes(70 + 47 * 60));
    expect(soon).toMatchObject({ status: 'completed', completedVia: 'poster', addressVisibility: 'visible' });
    const later = await getBookingView(hub, 'usr_jordan', bookingId, minutes(70 + 49 * 60));
    expect(later?.addressVisibility).toBe('hidden_after_completion');
    expect(later?.exactAddress).toBeUndefined();
  });

  it('lists the booking for both people with their own amounts', async () => {
    const ana = await getBookingsPage(db, 'usr_ana', new Date());
    expect(ana.past.find((row) => row.id === bookingId)).toMatchObject({ viewerRole: 'poster', amountCents: 6600, otherParty: { displayName: 'Jordan T.' } });
    const jordan = await getBookingsPage(db, 'usr_jordan', new Date());
    expect(jordan.past.find((row) => row.id === bookingId)).toMatchObject({ viewerRole: 'helper', amountCents: 5400, otherParty: { displayName: 'Ana P.' } });
    expect((await getBookingsPage(db, 'usr_chris', new Date())).past.find((row) => row.id === bookingId)).toBeUndefined();
  });
});
