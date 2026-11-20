import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { reviews } from '@/modules/reviews/schema';
import { planNotifications } from '@/modules/notifications/service';
import { getReviewPage, getSavedHelpers, publishDueReviews, setHelperSaved, submitReview } from '@/modules/reviews/service';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { getSupportCasePage, getSupportPage } from '@/modules/support/service';
import { getAdminCase } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { throwawayClient } from '../support/people';

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

describe('review text on the public profile (sweep RV5)', () => {
  it('masks contact details there, and keeps the review as written', async () => {
    const written = 'Great work. Call me for more at 352-555-0101 or ruth@example.test';
    const [mine] = await db.select().from(reviews).where(and(eq(reviews.bookingId, bookingId), eq(reviews.authorUserId, 'usr_ruth')));
    await db.update(reviews).set({ body: written }).where(eq(reviews.id, mine!.id));
    try {
      const shown = (await getHelperProfile('sam-k', db))?.reviews.find((review) => review.id === mine!.id);
      expect(shown?.body).toBeDefined();
      expect(shown?.body).not.toContain('555-0101');
      expect(shown?.body).not.toContain('ruth@example.test');
      expect(shown?.body).toContain('Great work.');
      expect((await db.select({ body: reviews.body }).from(reviews).where(eq(reviews.id, mine!.id)))[0]?.body).toBe(written);
    } finally {
      await db.update(reviews).set({ body: mine!.body }).where(eq(reviews.id, mine!.id));
    }
  });
});

describe('both reviews readable once published, and who hears it (sweep RV1, RV2)', () => {
  let soloId = '';
  let soloClient = '';
  const hub = () => ({ db, cipher: fieldCipherFromEnv() });
  beforeAll(async () => {
    // A client made for this test books Sam on another copy of the desk; only the client will review.
    soloClient = await throwawayClient(db, 'usr_rev_solo');
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_sam'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_rev_solo', slug: 'rev-desk-solo', posterUserId: soloClient, status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer!, id: 'off_rev_solo', taskId: 'tsk_rev_solo', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
    const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, soloClient, 'tsk_rev_solo', 'off_rev_solo', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
    if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
    soloId = booked.redirectTo.split('/').pop()!;
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date() }).where(eq(bookings.id, soloId));
  });

  it("shows each person the other's review once both are in, and tells each that the other's is out", async () => {
    // The first booking: Ruth and Sam both reviewed (the first test above).
    expect((await getReviewPage(db, 'usr_ruth', bookingId, new Date()))?.theirs).toMatchObject({ rating: 5, tags: ['clear_instructions'] });
    expect((await getReviewPage(db, 'usr_sam', bookingId, new Date()))?.theirs).toMatchObject({ rating: 4, tags: ['careful'], body: 'Good work.' });
    expect((await getBookingView(hub(), 'usr_sam', bookingId, new Date()))?.theirReview).toMatchObject({ rating: 4 });
    expect((await getBookingView(hub(), 'usr_ruth', bookingId, new Date()))?.theirReview).toMatchObject({ rating: 5 });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'reviews.published'), eq(outboxEvents.aggregateId, bookingId)));
    const planned = await planNotifications(db, event!);
    expect(planned).toHaveLength(2);
    expect(planned).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'usr_sam', type: 'review_published', actorName: 'Ruth A.', target: { kind: 'booking_review', bookingId } }),
      expect.objectContaining({ userId: 'usr_ruth', type: 'review_published', actorName: 'Sam K.', target: { kind: 'booking_review', bookingId } }),
    ]));
  });

  it('when only one reviewed, publishes it after 14 days and tells only the person it is about', async () => {
    expect((await submitReview(db, soloClient, soloId, { rating: 2, tags: [], body: 'Late. Text me first next time at 352-555-0101.' }, new Date())).result).toMatchObject({ ok: true });
    // Double-blind until then: Sam reads nothing yet.
    expect((await getReviewPage(db, 'usr_sam', soloId, new Date()))?.theirs).toBeUndefined();
    expect((await getBookingView(hub(), 'usr_sam', soloId, new Date()))?.theirReview).toBeUndefined();
    const later = new Date(Date.now() + 15 * DAY);
    await publishDueReviews(db, later);
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'reviews.published'), eq(outboxEvents.aggregateId, soloId)));
    expect(event?.payload).toMatchObject({ bookingId: soloId, reviews: [{ authorUserId: soloClient, subjectUserId: 'usr_sam' }] });
    expect(await planNotifications(db, event!)).toEqual([expect.objectContaining({ userId: 'usr_sam', type: 'review_published', actorName: 'Ruth A.' })]);
    // Sam reads it (masked) though he never reviewed; the client reads that Sam didn't leave one.
    const forSam = await getReviewPage(db, 'usr_sam', soloId, later);
    expect(forSam).toMatchObject({ unavailable: 'window_closed', theirs: { rating: 2 } });
    expect(forSam?.theirs?.body).not.toContain('555-0101');
    const forClient = await getReviewPage(db, soloClient, soloId, later);
    expect(forClient).toMatchObject({ theirsMissing: true, mine: { rating: 2 } });
    expect(forClient?.theirs).toBeUndefined();
    expect((await getBookingView(hub(), 'usr_sam', soloId, later))?.theirReview).toMatchObject({ rating: 2 });
  });

  it("keeps a review staff hid out of the other person's view", async () => {
    const later = new Date(Date.now() + 15 * DAY);
    const mine = and(eq(reviews.bookingId, soloId), eq(reviews.authorUserId, soloClient));
    await db.update(reviews).set({ status: 'hidden', hiddenReason: 'Testing: hidden per policy.' }).where(mine);
    try {
      expect((await getReviewPage(db, 'usr_sam', soloId, later))?.theirs).toBeUndefined();
      expect((await getReviewPage(db, 'usr_sam', soloId, later))?.theirsMissing).toBeUndefined();
      expect((await getBookingView(hub(), 'usr_sam', soloId, later))?.theirReview).toBeUndefined();
    } finally {
      await db.update(reviews).set({ status: 'published', hiddenReason: null }).where(mine);
    }
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

describe('private feedback with a review', () => {
  let privateBookingId = '';
  beforeAll(async () => {
    // Ruth books Sam again on another copy of the desk, and it's completed.
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_sam'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_rev_private', slug: 'rev-desk-private', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer!, id: 'off_rev_private', taskId: 'tsk_rev_private', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
    const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, 'usr_ruth', 'tsk_rev_private', 'off_rev_private', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
    if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
    privateBookingId = booked.redirectTo.split('/').pop()!;
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date() }).where(eq(bookings.id, privateBookingId));
  });

  it('opens a low-priority case only its author is on; the other person never sees it', async () => {
    const feedback = 'He arrived two hours late and did not message me.';
    expect((await submitReview(db, 'usr_ruth', privateBookingId, { rating: 2, tags: [], body: '', privateFeedback: `  ${feedback}  ` }, new Date())).result).toMatchObject({ ok: true, code: 'submitted' });
    const [opened] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_ruth'), eq(supportCases.description, feedback)));
    expect(opened).toMatchObject({ type: 'request', status: 'open', priority: 'low', bookingId: null, context: { taskId: 'tsk_rev_private' } });

    // Sam can't see it, Ruth can, and staff see where it came from in a note only they read.
    expect((await getSupportPage(db, 'usr_sam')).cases.map((row) => row.id)).not.toContain(opened!.id);
    expect(await getSupportCasePage(db, 'usr_sam', opened!.id, new Date())).toBeNull();
    expect((await getSupportPage(db, 'usr_ruth')).cases.map((row) => row.id)).toContain(opened!.id);
    const staffView = await getAdminCase(db, { id: 'usr_alex', roles: ['support_agent'] }, opened!.id, new Date());
    expect(staffView?.data.parties.map((party) => party.person.id)).toEqual(['usr_ruth']);
    expect(staffView?.data.taskId).toBe('tsk_rev_private');
    expect(staffView?.data.events.find((event) => event.kind === 'note')).toMatchObject({ actor: { kind: 'system' }, body: expect.stringContaining('2-star review of Sam K.') });
    const ruthView = await getSupportCasePage(db, 'usr_ruth', opened!.id, new Date());
    expect(JSON.stringify(ruthView)).not.toContain('2-star review');

    // Nothing but spaces: no case.
    const before = await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, 'usr_sam'));
    expect((await submitReview(db, 'usr_sam', privateBookingId, { rating: 5, tags: [], body: '', privateFeedback: '   ' }, new Date())).result).toMatchObject({ ok: true });
    expect(await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, 'usr_sam'))).toHaveLength(before.length);

    await db.delete(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    await db.delete(supportCaseReads).where(eq(supportCaseReads.caseId, opened!.id));
    await db.delete(supportCases).where(eq(supportCases.id, opened!.id));
  });
});
