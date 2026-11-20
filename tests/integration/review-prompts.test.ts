import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { deliveryContent } from '@/modules/notifications/delivery';
import { planNotifications } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { REVIEW_REMINDER_DAYS, sendReviewPrompts, submitReview } from '@/modules/reviews/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { throwawayClient } from '../support/people';

/**
 * Prompts to review (sweep RV4, blueprint 02 J8): at completion both people are asked, in the bell and by email in
 * their language, and a few days before the 14 days end whoever hasn't reviewed is reminded once. A client made for
 * this file books Sam on copies of the desk.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });

const DAY = 86_400_000;
const run = Date.now().toString(36);
let client = '';

async function completedBooking(name: string, completedAt: Date): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_sam'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const taskId = `tsk_rp_${name}_${run}`;
  const offerId = `off_rp_${name}_${run}`;
  await db.insert(tasks).values({ ...desk, id: taskId, slug: `rp-${name}-${run}`, posterUserId: client, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
  const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, client, taskId, offerId, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'completed', completedVia: 'auto', completedAt }).where(eq(bookings.id, bookingId));
  return bookingId;
}

const eventOf = async (id: string) => (await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)))[0];

let started = new Date();
beforeAll(async () => {
  client = await throwawayClient(db, `usr_rp_${run}`);
  started = new Date(((await db.execute(sql`select now() as at`)).rows[0] as { at: string | Date }).at);
});
afterAll(async () => {
  await db.execute(sql`delete from outbox_events where type in ('reviews.prompt', 'reviews.reminder') and created_at >= ${started}`);
  await db.execute(sql`delete from outbox_events where type = 'reviews.published' and aggregate_id in (select id from bookings where poster_user_id = ${client})`);
  await pool.end();
});

describe('prompts to review', () => {
  it('asks both people once the work is approved, even on its own, and only once', async () => {
    const now = new Date();
    const bookingId = await completedBooking('both', new Date(now.getTime() - 60_000));
    expect(await sendReviewPrompts(db, now)).toBeGreaterThanOrEqual(1);
    const event = await eventOf(`evt_review_prompt_${bookingId}`);
    expect(event).toMatchObject({ type: 'reviews.prompt', aggregateId: bookingId, payload: { bookingId, userIds: [client, 'usr_sam'] } });
    const planned = await planNotifications(db, event!);
    expect(planned).toEqual([
      expect.objectContaining({ userId: client, type: 'review_prompt', actorName: 'Sam K.', target: { kind: 'booking_review', bookingId } }),
      expect.objectContaining({ userId: 'usr_sam', type: 'review_prompt', actorName: 'Ruth A.', target: { kind: 'booking_review', bookingId } }),
    ]);
    // Once per booking.
    await sendReviewPrompts(db, new Date(now.getTime() + 60_000));
    expect(await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'reviews.prompt'), eq(outboxEvents.aggregateId, bookingId)))).toHaveLength(1);
  });

  it('reminds only whoever has not reviewed, a few days before the window closes, once', async () => {
    const completedAt = new Date();
    const bookingId = await completedBooking('remind', completedAt);
    expect((await submitReview(db, client, bookingId, { rating: 5, tags: [], body: 'Quick and tidy.' }, new Date(completedAt.getTime() + 60_000))).result).toMatchObject({ ok: true });
    // Not yet: more than three days are left.
    const early = new Date(completedAt.getTime() + (14 - REVIEW_REMINDER_DAYS) * DAY - 3_600_000);
    await sendReviewPrompts(db, early);
    expect(await eventOf(`evt_review_reminder_${bookingId}`)).toBeUndefined();
    const due = new Date(completedAt.getTime() + (14 - REVIEW_REMINDER_DAYS) * DAY + 3_600_000);
    await sendReviewPrompts(db, due);
    const event = await eventOf(`evt_review_reminder_${bookingId}`);
    expect(event).toMatchObject({ type: 'reviews.reminder', payload: { bookingId, userIds: ['usr_sam'], days: REVIEW_REMINDER_DAYS } });
    expect(await planNotifications(db, event!)).toEqual([expect.objectContaining({ userId: 'usr_sam', type: 'review_reminder', actorName: 'Ruth A.', params: { days: REVIEW_REMINDER_DAYS }, target: { kind: 'booking_review', bookingId } })]);
    // Sam reviewed meanwhile: nobody is reminded.
    expect((await submitReview(db, 'usr_sam', bookingId, { rating: 5, tags: [], body: '' }, due)).result).toMatchObject({ ok: true });
    expect(await planNotifications(db, event!)).toEqual([]);
    await sendReviewPrompts(db, new Date(due.getTime() + DAY));
    expect(await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'reviews.reminder'), eq(outboxEvents.aggregateId, bookingId)))).toHaveLength(1);
  });

  it("doesn't ask about an old booking, or someone who reviewed the same person lately", async () => {
    const now = new Date();
    const old = await completedBooking('old', new Date(now.getTime() - 3 * DAY));
    const again = await completedBooking('again', new Date(now.getTime() - 60_000));
    await sendReviewPrompts(db, now);
    expect(await eventOf(`evt_review_prompt_${old}`)).toBeUndefined();
    // The client and Sam reviewed each other on the first booking: neither is asked again within 30 days.
    expect((await eventOf(`evt_review_prompt_${again}`))?.payload).toMatchObject({ userIds: [] });
  });

  it("reads in the person's language, with a button to leave the review", () => {
    const row = { type: 'review_prompt' as const, title: 'Montar un escritorio', actorName: 'Sam K.', params: null, target: { kind: 'booking_review' as const, bookingId: 'bkg_x' }, userId: client };
    const spanish = deliveryContent(row, 'es');
    expect(spanish.subject).toBe('¿Qué tal te fue con Sam K.? Deja una reseña sobre Montar un escritorio.');
    expect(spanish.html).toContain('Dejar una reseña');
    expect(spanish.html).toContain('/app/bookings/bkg_x/review');
    const reminder = deliveryContent({ ...row, type: 'review_reminder', params: { days: 3 } }, 'en');
    expect(reminder.subject).toBe('3 days left to review Sam K. for Montar un escritorio.');
    expect(reminder.html).toContain('Leave a review');
  });
});
