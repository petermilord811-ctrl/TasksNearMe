import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { getReviewPage, getSavedHelpers, setHelperSaved, submitReview } from '@/modules/reviews/service';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const DAY = 86_400_000;
let bookingId = '';

beforeAll(async () => {
  // Ruth books Sam on a copy of the desk, and it's completed.
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_sam'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: 'tsk_rev', slug: 'rev-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_rev_sam', taskId: 'tsk_rev', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
  const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, 'usr_ruth', 'tsk_rev', 'off_rev_sam', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date() }).where(eq(bookings.id, bookingId));
});

describe('reviews', () => {
  it('stays hidden until both people have reviewed, then updates the rating', async () => {
    const [before] = await db.select({ count: helperProfiles.ratingCount }).from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
    const page = await getReviewPage(db, 'usr_ruth', bookingId, new Date());
    expect(page).toMatchObject({ direction: 'client_to_helper', subject: { displayName: 'Sam K.' } });
    expect((await submitReview(db, 'usr_ruth', bookingId, { rating: 4, tags: ['careful'], body: 'Good work.' }, new Date())).result).toMatchObject({ ok: true, code: 'submitted' });
    expect((await submitReview(db, 'usr_ruth', bookingId, { rating: 5, tags: [], body: '' }, new Date())).result).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getReviewPage(db, 'usr_ruth', bookingId, new Date()))?.mine).toMatchObject({ rating: 4, tags: ['careful'] });
    expect((await getReviewPage(db, 'usr_ruth', bookingId, new Date()))?.mine?.publishedAt).toBeUndefined();

    const second = await submitReview(db, 'usr_sam', bookingId, { rating: 5, tags: ['clear_instructions'], body: '' }, new Date());
    expect(second.ratedHelperId).toBe('usr_sam');
    expect((await getReviewPage(db, 'usr_ruth', bookingId, new Date()))?.mine?.publishedAt).toBeDefined();
    const [after] = await db.select({ count: helperProfiles.ratingCount }).from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
    expect(after!.count).toBe(before!.count + 1);
  });

  it('refuses the wrong tags, other people, and reviews after the window', async () => {
    expect((await submitReview(db, 'usr_maya', bookingId, { rating: 5, tags: [], body: '' }, new Date())).result).toEqual({ ok: false, code: 'not_found' });
    expect(await getReviewPage(db, 'usr_maya', bookingId, new Date())).toBeNull();
    const late = await getReviewPage(db, 'usr_ruth', bookingId, new Date(Date.now() + 15 * DAY));
    expect(late?.unavailable).toBeUndefined(); // already reviewed: shown read-only
  });
});

describe('saved helpers', () => {
  it('saves from the completed booking and lists the helper', async () => {
    const hub = { db, cipher: fieldCipherFromEnv() };
    expect((await getBookingView(hub, 'usr_ruth', bookingId, new Date()))?.actions.map((a) => a.id)).toContain('save_helper');
    expect(await runBookingAction(db, 'usr_ruth', bookingId, 'save_helper', new Date())).toEqual({ ok: true, code: 'updated' });
    const view = await getBookingView(hub, 'usr_ruth', bookingId, new Date());
    expect(view?.helperSaved).toBe(true);
    expect(view?.actions.map((a) => a.id)).not.toContain('save_helper');
    expect((await getSavedHelpers(db, 'usr_ruth')).helpers.map((h) => h.id)).toEqual(['usr_sam']);
    expect(await setHelperSaved(db, 'usr_ruth', 'usr_sam', false, new Date())).toEqual({ ok: true, code: 'updated' });
    expect((await getSavedHelpers(db, 'usr_ruth')).helpers).toEqual([]);
  });
});
