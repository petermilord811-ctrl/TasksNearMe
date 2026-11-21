import os from 'node:os';
import path from 'node:path';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from '@/integrations/storage';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { communityPosts, communityReplies } from '@/modules/community/schema';
import { moderateCommunityItem } from '@/modules/community/service';
import { earnings, transferReversals } from '@/modules/earnings/schema';
import { categories } from '@/modules/markets/schema';
import { getBookingReversals, reverseTransfer } from '@/modules/payments/reversals';
import { reviews } from '@/modules/reviews/schema';
import { supportCases } from '@/modules/support/schema';
import { moderateReportedReview, type StaffActor } from '@/modules/support/staff';
import { getAdminBooking, revealBookingAddress } from '@/modules/support/staff-money';
import { moderateTask } from '@/modules/tasks/moderation';
import { files, tasks } from '@/modules/tasks/schema';
import { addressVerifications, identityCaptures } from '@/modules/verification/schema';
import { documentForToken, documentToken, revealAddressProof, revealIdentityCapture } from '@/modules/verification/staff';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { deleteCases } from '../support/cases';
import { throwawayClient } from '../support/people';

/**
 * Staff and their own matters, in the actions themselves (ab, 2026-11-21; SEC3 covered cases and refunds): a staff member
 * never opens their own verification documents, reveals the address on a booking they're a party to, moderates their own
 * task, post, reply or a review by or about them, or reverses a transfer on their own booking. Each is refused with
 * `not_allowed` whatever the page shows, and each has a control: a different staff member does the same thing.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const now = new Date();
const root = path.join(os.tmpdir(), `tnm-self-guards-${process.pid}`);
const storage = createLocalFileStorage(root);
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const secret = 'test-secret-for-document-links-0123456789';
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
/** A second finance person (Riley, given the role here): reversals are finance's alone. */
const otherFinance: StaffActor = { id: 'usr_riley', roles: ['finance'] };
const AUTHOR = 'usr_tmp_sg_author';
const reason = 'Checking this one for the staff handbook.';
const CASES = ['case_tmp_sg_review_about', 'case_tmp_sg_review_by', 'case_tmp_sg_rev'];

/** A copy of the desk booked through the TV booking's numbers, with these two people on it. */
async function booking(id: string, people: { poster: string; helper: string }, values: Partial<typeof bookings.$inferInsert> = {}): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [template] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const taskId = `tsk_sg_${id}`;
  const bookingId = `bkg_tmp_sg_${id}`;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `tsk-sg-${id}-slug`, posterUserId: people.poster, status: 'assigned', offerCount: 0, version: 1 });
  await db.insert(bookings).values({ ...template!, id: bookingId, taskId, offerId: null, seriesId: null, visitIndex: null, posterUserId: people.poster, helperUserId: people.helper, status: 'confirmed', createdAt: now, updatedAt: now, ...values });
  await db.insert(bookingTerms).values({ ...terms!, id: `btm_tmp_sg_${id}`, bookingId });
  return bookingId;
}

beforeAll(async () => {
  await throwawayClient(db, AUTHOR);
});

afterAll(async () => {
  // Reversals name their case: they go first.
  await db.delete(transferReversals).where(like(transferReversals.bookingId, 'bkg\\_tmp\\_sg\\_%'));
  await db.delete(earnings).where(like(earnings.id, 'ern\\_tmp\\_sg\\_%'));
  await deleteCases(db, CASES);
  await db.delete(reviews).where(like(reviews.id, 'rev\\_tmp\\_sg\\_%'));
  await db.delete(communityReplies).where(like(communityReplies.id, 'cre\\_tmp\\_sg\\_%'));
  await db.delete(communityPosts).where(like(communityPosts.id, 'cpo\\_tmp\\_sg\\_%'));
  await db.delete(identityCaptures).where(like(identityCaptures.id, 'idc\\_tmp\\_sg\\_%'));
  await db.delete(addressVerifications).where(like(addressVerifications.id, 'adr\\_tmp\\_sg\\_%'));
  await db.delete(files).where(eq(files.id, 'fil_tmp_sg_proof'));
  await db.update(bookings).set({ status: 'canceled' }).where(like(bookings.id, 'bkg\\_tmp\\_sg\\_%'));
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_sg\\_%'));
  await pool.end();
});

describe('their own verification documents', () => {
  it('never opens a staff member’s own proof of address, its document, or their ID photos', async () => {
    // Taylor (trust and safety, who decides verifications) sent a proof of address and an ID check too.
    await db.insert(files).values({ id: 'fil_tmp_sg_proof', ownerUserId: 'usr_taylor', kind: 'address_proof', storageKey: 'address_proof/usr_taylor/sg.webp', contentType: 'image/webp', width: 10, height: 10, bytes: 4 });
    await storage.put('address_proof/usr_taylor/sg.webp', Buffer.from('webp'), 'image/webp');
    const address = cipher.encrypt(JSON.stringify({ line1: '100 Example Lane', city: 'Austin', state: 'TX', zip: '78723' }));
    await db.insert(addressVerifications).values({ id: 'adr_tmp_sg_taylor', userId: 'usr_taylor', status: 'in_review', addressCiphertext: address, documentType: 'utility_bill', documentFileId: 'fil_tmp_sg_proof', submittedAt: now });
    await db.insert(identityCaptures).values({ id: 'idc_tmp_sg_taylor', userId: 'usr_taylor', documentType: 'drivers_license', promptKey: 'smile', status: 'submitted', submittedAt: now });

    expect(await revealAddressProof(db, { cipher, secret }, taylor, { verificationId: 'adr_tmp_sg_taylor', reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revealIdentityCapture(db, { secret }, taylor, { captureId: 'idc_tmp_sg_taylor', reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    // A link made out to Taylor for Taylor's own document opens nothing, however it was made.
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const own = documentToken({ fileId: 'fil_tmp_sg_proof', staffUserId: 'usr_taylor', expiresAt }, secret);
    expect(await documentForToken(db, storage, own, taylor, secret, now)).toBeNull();

    // Somebody else on staff reviews them.
    expect(await revealAddressProof(db, { cipher, secret }, riley, { verificationId: 'adr_tmp_sg_taylor', reason }, now)).toMatchObject({ ok: true, address: '100 Example Lane, Austin, TX 78723' });
    expect(await revealIdentityCapture(db, { secret }, riley, { captureId: 'idc_tmp_sg_taylor', reason }, now)).toMatchObject({ ok: true });
    const theirs = documentToken({ fileId: 'fil_tmp_sg_proof', staffUserId: 'usr_riley', expiresAt }, secret);
    expect(await documentForToken(db, storage, theirs, riley, secret, now)).toMatchObject({ contentType: 'image/webp' });
  });
});

describe('the address on their own booking', () => {
  it('is refused to a staff member who is a party, and the button is gone; another agent opens it', async () => {
    const bookingId = await booking('address', { poster: 'usr_morgan', helper: 'usr_jordan' });
    expect(await revealBookingAddress(db, cipher, morgan, bookingId, { reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminBooking(db, morgan, bookingId, now))?.actions).not.toContain('reveal_address');
    expect((await getAdminBooking(db, alex, bookingId, now))?.actions).toContain('reveal_address');
    expect(await revealBookingAddress(db, cipher, alex, bookingId, { reason }, now)).toMatchObject({ ok: true });
  });
});

describe('moderating their own things', () => {
  it('never lets a moderator hide their own task', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_sg_own', slug: 'tsk-sg-own-slug', posterUserId: 'usr_taylor', status: 'open', offerCount: 0, version: 1, hiddenAt: null, hiddenByUserId: null, hiddenReason: null });
    expect((await moderateTask(db, taylor, 'tsk_sg_own', { action: 'hide_task', reason }, now)).result).toEqual({ ok: false, code: 'not_allowed' });
    expect((await db.select({ hiddenAt: tasks.hiddenAt }).from(tasks).where(eq(tasks.id, 'tsk_sg_own')))[0]?.hiddenAt).toBeNull();
    expect((await moderateTask(db, riley, 'tsk_sg_own', { action: 'hide_task', reason }, now)).result).toMatchObject({ ok: true });
  });

  it('never lets a moderator hide their own community post or reply', async () => {
    await db.insert(communityPosts).values([
      { id: 'cpo_tmp_sg_own', marketId: 'mkt_austin', authorUserId: 'usr_morgan', kind: 'question', title: 'Who fixes fences nearby?', body: 'Looking for someone who fixes fences.' },
      { id: 'cpo_tmp_sg_other', marketId: 'mkt_austin', authorUserId: AUTHOR, kind: 'question', title: 'Leaf pickup this week?', body: 'Does curbside pickup still run weekly?' },
    ]);
    await db.insert(communityReplies).values({ id: 'cre_tmp_sg_own', postId: 'cpo_tmp_sg_other', authorUserId: 'usr_morgan', body: 'It runs every Tuesday on our street.' });
    const hide = { action: 'hide' as const, reason };
    expect(await moderateCommunityItem(db, morgan, 'post', 'cpo_tmp_sg_own', hide, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateCommunityItem(db, morgan, 'reply', 'cre_tmp_sg_own', hide, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await db.select({ status: communityPosts.status }).from(communityPosts).where(eq(communityPosts.id, 'cpo_tmp_sg_own')))[0]?.status).toBe('visible');
    expect(await moderateCommunityItem(db, taylor, 'post', 'cpo_tmp_sg_own', hide, now)).toEqual({ ok: true, code: 'updated' });
    expect(await moderateCommunityItem(db, taylor, 'reply', 'cre_tmp_sg_own', hide, now)).toEqual({ ok: true, code: 'updated' });
  });

  it('never lets a moderator hide a review about them, or one they wrote, from its report', async () => {
    const [category] = await db.select({ id: categories.id }).from(categories).limit(1);
    const review = (id: string, author: string, subject: string) => ({ id, bookingId: null, authorUserId: author, subjectUserId: subject, direction: 'helper_to_client', categoryId: category!.id, rating: 1, body: 'Hard to reach and changed the plan twice.', status: 'published', publishedAt: now });
    await db.insert(reviews).values([review('rev_tmp_sg_about', AUTHOR, 'usr_morgan'), review('rev_tmp_sg_by', 'usr_morgan', AUTHOR)]);
    // Filed as a page report files them: about the review's author, with the review in the context.
    const report = (id: string, reviewId: string, author: string) => ({ id, type: 'report_content', status: 'open', openedByUserId: 'usr_maya', subjectUserId: author, context: { reviewId }, reason: 'harassment', description: 'This review is about the person, not the work.' });
    await db.insert(supportCases).values([report('case_tmp_sg_review_about', 'rev_tmp_sg_about', AUTHOR), report('case_tmp_sg_review_by', 'rev_tmp_sg_by', 'usr_morgan')]);
    const hide = { visible: false, reason };
    // The report on a review of Morgan is about its author, so Morgan may work the case, but not hide the review.
    expect(await moderateReportedReview(db, morgan, 'case_tmp_sg_review_about', hide, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateReportedReview(db, morgan, 'case_tmp_sg_review_by', hide, now)).toEqual({ ok: false, code: 'not_allowed' });
    const statuses = await db.select({ status: reviews.status }).from(reviews).where(inArray(reviews.id, ['rev_tmp_sg_about', 'rev_tmp_sg_by']));
    expect(statuses).toEqual([{ status: 'published' }, { status: 'published' }]);
    expect(await moderateReportedReview(db, taylor, 'case_tmp_sg_review_about', hide, now)).toMatchObject({ ok: true, code: 'updated' });
    expect(await moderateReportedReview(db, taylor, 'case_tmp_sg_review_by', hide, now)).toMatchObject({ ok: true, code: 'updated' });
  });
});

describe('a transfer on their own booking', () => {
  it('is never reversed by the finance person who was its helper, and the button is gone; another finance person can', async () => {
    const bookingId = await booking('rev', { poster: 'usr_ben', helper: 'usr_casey' }, { status: 'completed', completedAt: now });
    await db.insert(earnings).values({ id: 'ern_tmp_sg_rev', bookingId, helperUserId: 'usr_casey', kind: 'earnings', amountCents: 5400, status: 'transferred', transferRef: 'tr_tmp_sg_rev', transferredAt: now, createdAt: now });
    await db.insert(supportCases).values({ id: 'case_tmp_sg_rev', type: 'payment_issue', status: 'open', priority: 'urgent', bookingId, openedByUserId: 'usr_ben', description: 'Chargeback.' });
    const input = { earningsId: 'ern_tmp_sg_rev', amountCents: 2000, caseId: 'case_tmp_sg_rev', reason: 'Chargeback lost: half the work was done.' };
    expect(await reverseTransfer(db, null, casey, bookingId, input, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getBookingReversals(db, casey, bookingId)).canReverse).toBe(false);
    expect(await db.select().from(transferReversals).where(eq(transferReversals.bookingId, bookingId))).toHaveLength(0);
    expect((await getBookingReversals(db, otherFinance, bookingId)).canReverse).toBe(true);
    expect(await reverseTransfer(db, null, otherFinance, bookingId, input, now)).toEqual({ ok: true, code: 'updated' });
  });
});
