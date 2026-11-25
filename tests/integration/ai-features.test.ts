import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { BookingPrepFacts, BookingPrepper } from '@/integrations/ai/booking-prepper';
import type { CaseFacts, CaseSummarizer } from '@/integrations/ai/case-summarizer';
import type { AnswerFacts, NeighborsWriter, PostPolishFacts } from '@/integrations/ai/neighbors-writer';
import type { JobSizeFacts, JobSizer } from '@/integrations/ai/price-sizer';
import { createFakeProfileWriter, type ProfileFacts, type ProfileWriter } from '@/integrations/ai/profile-writer';
import type { ReviewSummarizer, ReviewSummaryFacts } from '@/integrations/ai/review-summarizer';
import type { ReviewFacts, ReviewWriter } from '@/integrations/ai/review-writer';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { bookingPrepViewFor, prepareBookingChecklist } from '@/modules/assist/booking-prep';
import { summarizeSupportCase } from '@/modules/assist/case-summary';
import { draftCommunityAnswer, polishCommunityPost, withAnswerDraft } from '@/modules/assist/neighbors-ai';
import { checkTaskPrice } from '@/modules/assist/price-check';
import { draftReview } from '@/modules/assist/review-draft';
import { reviewSummaryOf } from '@/modules/assist/review-summaries';
import { refreshReviewSummaries } from '@/modules/assist/review-summaries-job';
import { aiResults } from '@/modules/assist/schema';
import { draftHelperProfile } from '@/modules/assist/service';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView } from '@/modules/bookings/hub';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { communityPosts } from '@/modules/community/schema';
import { getCommunityPost } from '@/modules/community/service';
import { featureFlags } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { reviews } from '@/modules/reviews/schema';
import { submitReview } from '@/modules/reviews/service';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { rateLimits } from '@/platform/rate-limit/schema';
import { throwawayClient } from '../support/people';

/**
 * The AI features of 2026-11-24 (src/modules/assist; docs/automation/ai-plan-2026-11-24.md): facts from the database
 * with the person's access, the market's switch, limits, prohibited words, masking both ways, what's kept and when it's
 * stale. Recording stand-ins answer; no model is ever called.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_ai_client';
const HELPER = 'usr_tmp_ai_helper';
const HELPER_HANDLE = 'tmp-ai-helper';
const DAY = 86_400_000;
const now = () => new Date();
const hub = { db, cipher: fieldCipherFromEnv(), payments: createDevPaymentProvider() };
const cleanups: (() => Promise<unknown>)[] = [];

function recorder<TFacts, TAnswer>(answer: TAnswer | Error) {
  const seen: TFacts[] = [];
  const call = async (facts: TFacts): Promise<TAnswer> => {
    seen.push(facts);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { seen, call };
}

async function setAustinAi(enabled: boolean | null) {
  await db.delete(featureFlags).where(and(eq(featureFlags.key, 'ai_drafting'), eq(featureFlags.marketId, 'mkt_austin')));
  if (enabled !== null) await db.insert(featureFlags).values({ key: 'ai_drafting', marketId: 'mkt_austin', enabled, description: 'test' });
}

/** A copy of the desk, booked by our client with the helper of `offerId` (Sam's or Jordan's offer). */
async function bookDesk(suffix: string, offerId: 'off_sam' | 'off_jordan'): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const taskId = `tsk_ai_${suffix}`;
  await db.insert(tasks).values({ ...desk, id: taskId, slug: `ai-${suffix}-desk`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1, description: 'Flat-pack desk. Call 512-555-0199 before you come.' });
  await db.insert(offers).values({ ...offer, id: `off_ai_${suffix}`, taskId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
  const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, CLIENT, taskId, `off_ai_${suffix}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  return booked.redirectTo.split('/').pop()!;
}

beforeAll(async () => {
  await throwawayClient(db, CLIENT);
  // A helper of our own with three published client reviews with words (and one without), for "What neighbors say".
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [samProfile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  if (!sam || !samProfile) throw new Error('Seeded Sam is missing');
  await db.insert(users).values({ ...sam, id: HELPER, email: `${HELPER}@example.test`, phone: null, phoneVerifiedAt: null }).onConflictDoNothing();
  await db.insert(helperProfiles).values({ ...samProfile, userId: HELPER, handle: HELPER_HANDLE }).onConflictDoNothing();
  await db.insert(helperServices).values({ id: 'hsv_tmp_ai_helper', userId: HELPER, categoryId: 'cat_furniture_assembly', pricingType: 'fixed', fromPriceCents: 4500, status: 'active', description: 'Careful assembly' }).onConflictDoNothing();
  const written = [
    { author: 'usr_ruth', rating: 5, body: 'Built my desk fast and took the boxes. Call him at 352-555-0101.' },
    { author: 'usr_maya', rating: 5, body: 'Careful with my floors, and very tidy.' },
    { author: 'usr_chris', rating: 4, body: 'Good work, a little late.' },
    { author: 'usr_ana', rating: 5, body: null },
  ];
  await db.insert(reviews).values(written.map((review, index) => ({
    id: `rev_tmp_ai_${index}`, authorUserId: review.author, subjectUserId: HELPER, direction: 'client_to_helper', categoryId: 'cat_furniture_assembly',
    rating: review.rating, tags: index === 1 ? ['careful', 'tidy'] : ['on_time'], body: review.body, status: 'published', publishedAt: new Date(Date.now() - (index + 1) * DAY),
  })));
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await setAustinAi(null);
  await db.delete(aiResults).where(inArray(aiResults.kind, ['review_summary', 'booking_prep']));
  await db.delete(reviews).where(like(reviews.id, 'rev\\_tmp\\_ai\\_%'));
  // The review our client sent (it never publishes: Sam didn't review back).
  await db.delete(reviews).where(eq(reviews.authorUserId, CLIENT));
  await db.delete(helperServices).where(eq(helperServices.userId, HELPER));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  // Every desk copy here is off the board afterwards (an open one pushes other files' searches past the first page).
  await db.update(tasks).set({ status: 'canceled' }).where(like(tasks.id, 'tsk\\_ai\\_%'));
  await pool.end();
});

describe('Write it with AI on a review', () => {
  let bookingId = '';
  beforeAll(async () => {
    bookingId = await bookDesk('review', 'off_sam');
    await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date() }).where(eq(bookings.id, bookingId));
  });

  it('drafts from the booking as the reviewer sees it, in the page language, masked both ways', async () => {
    const { seen, call } = recorder<ReviewFacts, string>('Sam was great. Text him at 512-555-0142 next time.');
    const result = await draftReview({ db, writer: { name: 'recording', draft: call } satisfies ReviewWriter, now: now() }, CLIENT, bookingId, { rating: 5, tags: ['careful', 'clear_instructions'], notes: 'quick, email me at ruth@example.test' }, 'es');
    expect(result).toEqual({ ok: true, code: 'drafted', value: { body: 'Sam was great. Text him at [hidden] next time.' } });
    // The other direction's tag is dropped; the person reviewed and the task come from the database.
    expect(seen[0]).toMatchObject({ direction: 'client_to_helper', subjectFirstName: 'Sam', rating: 5, tags: ['careful'], notes: 'quick, email me at [hidden]', locale: 'es' });
    expect(seen[0]!.task.title).toBe('Assemble a desk (flat-pack, 1 item)');
  });

  it('refuses prohibited words, bad input, other people, and a refusal reads as prohibited', async () => {
    const writer: ReviewWriter = { name: 'recording', draft: recorder<ReviewFacts, string>('x').call };
    expect(await draftReview({ db, writer, now: now() }, CLIENT, bookingId, { rating: 5, tags: [], notes: 'he fixed my roof too' }, 'en')).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } });
    expect(await draftReview({ db, writer, now: now() }, CLIENT, bookingId, { rating: 9, tags: [], notes: '' }, 'en')).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { rating: ['out_of_range'] } });
    expect(await draftReview({ db, writer, now: now() }, 'usr_maya', bookingId, { rating: 5, tags: [], notes: '' }, 'en')).toEqual({ ok: false, code: 'not_found' });
    const refusing: ReviewWriter = { name: 'recording', draft: recorder<ReviewFacts, string>(new AiRefusedError()).call };
    expect(await draftReview({ db, writer: refusing, now: now() }, CLIENT, bookingId, { rating: 3, tags: [], notes: '' }, 'en')).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } });
  });

  it('is off with the market switch or without a model, and limited per person', async () => {
    const writer: ReviewWriter = { name: 'recording', draft: recorder<ReviewFacts, string>('Fine work all round.').call };
    await setAustinAi(false);
    try {
      expect(await draftReview({ db, writer, now: now() }, CLIENT, bookingId, { rating: 5, tags: [], notes: '' }, 'en')).toEqual({ ok: false, code: 'unavailable' });
    } finally {
      await setAustinAi(null);
    }
    expect(await draftReview({ db, writer: null, now: now() }, CLIENT, bookingId, { rating: 5, tags: [], notes: '' }, 'en')).toEqual({ ok: false, code: 'unavailable' });
    const at = now();
    const windowStart = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000);
    await db.insert(rateLimits).values({ key: `assist:review:${CLIENT}`, windowStart, count: 20 }).onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: 20 } });
    try {
      expect(await draftReview({ db, writer, now: at }, CLIENT, bookingId, { rating: 5, tags: [], notes: '' }, 'en')).toMatchObject({ ok: false, code: 'rate_limited' });
    } finally {
      await db.delete(rateLimits).where(eq(rateLimits.key, `assist:review:${CLIENT}`));
    }
  });

  it('has nothing to write once the review is sent', async () => {
    await submitReview(db, CLIENT, bookingId, { rating: 5, tags: [], body: 'Great.' }, now());
    const writer: ReviewWriter = { name: 'recording', draft: recorder<ReviewFacts, string>('x').call };
    expect(await draftReview({ db, writer, now: now() }, CLIENT, bookingId, { rating: 5, tags: [], notes: '' }, 'en')).toEqual({ ok: false, code: 'not_allowed' });
  });
});

describe('Get ready on a booking', () => {
  let bookingId = '';
  beforeAll(async () => {
    bookingId = await bookDesk('prep', 'off_jordan');
  });

  it("makes the viewer's checklist from the booking they see, keeps it, and says when the booking changed", async () => {
    const view = await getBookingView(hub, CLIENT, bookingId, now());
    if (!view) throw new Error('The booking view is missing');
    expect(await bookingPrepViewFor(db, CLIENT, view, 'en')).toEqual({});
    const { seen, call } = recorder<BookingPrepFacts, string[]>(['Unbox the parts.', 'Clear the room.', 'Text 512-555-0142.']);
    const prepper: BookingPrepper = { name: 'recording', checklist: call };
    const made = await prepareBookingChecklist({ db, prepper, now: now() }, CLIENT, view, 'en');
    expect(made).toMatchObject({ ok: true, code: 'drafted', value: { items: ['Unbox the parts.', 'Clear the room.', 'Text [hidden].'] } });
    expect(seen[0]).toMatchObject({ role: 'poster', categorySlug: 'furniture-assembly', otherFirstName: 'Jordan', remote: false, locale: 'en' });
    // The address never reaches the facts, whatever the booking holds.
    expect(JSON.stringify(seen[0])).not.toMatch(/Example (Lane|Street|Avenue|Court)/);
    expect((await bookingPrepViewFor(db, CLIENT, view, 'en'))?.checklist?.items).toHaveLength(3);
    // Kept per role and language: Jordan and a Spanish page have none yet.
    const helperView = await getBookingView(hub, 'usr_jordan', bookingId, now());
    expect(await bookingPrepViewFor(db, 'usr_jordan', helperView!, 'en')).toEqual({});
    expect(await bookingPrepViewFor(db, CLIENT, view, 'es')).toEqual({});

    await db.update(bookingTerms).set({ scopeText: 'Flat-pack desk and a shelf now.' }).where(eq(bookingTerms.bookingId, bookingId));
    const changed = await getBookingView(hub, CLIENT, bookingId, now());
    expect(await bookingPrepViewFor(db, CLIENT, changed!, 'en')).toMatchObject({ stale: true });
  });

  it('is only for bookings still ahead, with AI on', async () => {
    const view = await getBookingView(hub, CLIENT, bookingId, now());
    const prepper: BookingPrepper = { name: 'recording', checklist: recorder<BookingPrepFacts, string[]>(['a step', 'another step']).call };
    expect(await prepareBookingChecklist({ db, prepper, now: now() }, CLIENT, { ...view!, status: 'completed' }, 'en')).toEqual({ ok: false, code: 'not_allowed' });
    expect(await bookingPrepViewFor(db, CLIENT, { ...view!, status: 'canceled' }, 'en')).toBeUndefined();
    const failing: BookingPrepper = { name: 'recording', checklist: recorder<BookingPrepFacts, string[]>(new AiUnavailableError('down')).call };
    expect(await prepareBookingChecklist({ db, prepper: failing, now: now() }, CLIENT, view!, 'en')).toEqual({ ok: false, code: 'unavailable' });
  });
});

describe('What neighbors say', () => {
  const state = { failedUntil: new Map<string, number>() };

  it("summarizes a helper's published reviews with words, without their authors, and shows it while it still matches", async () => {
    const { seen, call } = recorder<ReviewSummaryFacts, { en: string[]; es: string[] }>({ en: ['Fast and tidy.', 'Careful with floors.'], es: ['Rápido y ordenado.', 'Cuidadoso con los pisos.'] });
    const summarizer: ReviewSummarizer = { name: 'recording', summarize: call };
    const run = await refreshReviewSummaries(db, summarizer, now(), { rows: 'all', limit: 10, state });
    expect(run.made).toContain(HELPER);
    const facts = seen.find((entry) => entry.reviews.some((review) => review.body.includes('Careful with my floors')));
    expect(facts?.reviews.map((review) => review.rating)).toEqual([5, 5, 4]);
    expect(JSON.stringify(facts)).not.toMatch(/Ruth|Maya|Chris|usr_/);
    const shown = await reviewSummaryOf(db, HELPER, 'all');
    expect(shown).toMatchObject({ points: { en: ['Fast and tidy.', 'Careful with floors.'], es: ['Rápido y ordenado.', 'Cuidadoso con los pisos.'] }, reviewCount: 3 });
    expect((await getHelperProfile(HELPER_HANDLE, db))?.reviewSummary?.reviewCount).toBe(3);
    // Nothing changed: the next run leaves it alone.
    const again = await refreshReviewSummaries(db, summarizer, now(), { rows: 'all', limit: 10, state });
    expect(again.made).not.toContain(HELPER);
  });

  it("stops showing it the moment a review is hidden, drops it below three, and makes it again", async () => {
    const summarizer: ReviewSummarizer = { name: 'recording', summarize: recorder<ReviewSummaryFacts, { en: string[]; es: string[] }>({ en: ['Again.'], es: ['Otra vez.'] }).call };
    await db.update(reviews).set({ status: 'hidden' }).where(eq(reviews.id, 'rev_tmp_ai_2'));
    expect(await reviewSummaryOf(db, HELPER, 'all')).toBeUndefined();
    const run = await refreshReviewSummaries(db, summarizer, now(), { rows: 'all', limit: 10, state });
    expect(run.dropped).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(aiResults).where(and(eq(aiResults.kind, 'review_summary'), eq(aiResults.subjectId, HELPER)))).toHaveLength(0);
    await db.update(reviews).set({ status: 'published' }).where(eq(reviews.id, 'rev_tmp_ai_2'));
    expect((await refreshReviewSummaries(db, summarizer, now(), { rows: 'all', limit: 10, state })).made).toContain(HELPER);
    expect((await reviewSummaryOf(db, HELPER, 'all'))?.points.en).toEqual(['Again.']);
  });

  it('waits half an hour after a failure, and none shows with AI off for their market', async () => {
    await db.update(reviews).set({ body: 'Built my desk fast, edited.' }).where(eq(reviews.id, 'rev_tmp_ai_0'));
    const failing: ReviewSummarizer = { name: 'recording', summarize: recorder<ReviewSummaryFacts, { en: string[]; es: string[] }>(new AiUnavailableError('down')).call };
    const at = now();
    expect((await refreshReviewSummaries(db, failing, at, { rows: 'all', limit: 10, state })).failed).toContain(HELPER);
    const working: ReviewSummaryFacts[] = [];
    const later: ReviewSummarizer = { name: 'recording', summarize: async (facts) => { working.push(facts); return { en: ['Later.'], es: ['Después.'] }; } };
    await refreshReviewSummaries(db, later, new Date(at.getTime() + 60_000), { rows: 'all', limit: 10, state });
    expect(working.some((facts) => facts.reviews.some((review) => review.body.includes('edited')))).toBe(false);
    await refreshReviewSummaries(db, later, new Date(at.getTime() + 31 * 60_000), { rows: 'all', limit: 10, state });
    expect((await reviewSummaryOf(db, HELPER, 'all'))?.points.en).toEqual(['Later.']);
    await setAustinAi(false);
    try {
      expect(await reviewSummaryOf(db, HELPER, 'all')).toBeUndefined();
    } finally {
      await setAustinAi(null);
    }
  });
});

describe('Check my price with AI', () => {
  const draft = { categorySlug: 'furniture-assembly' as const, title: 'Assemble two desks', description: 'Two flat-pack desks on the 3rd floor, no elevator.', details: { itemType: 'desk', itemCount: 2 }, budget: { type: 'fixed' as const, priceCents: 12000 } };

  it("sizes the job with AI and prices it from the market's own guide", async () => {
    const { seen, call } = recorder<JobSizeFacts, { units: number; effort: 'typical'; reasons: string[] }>({ units: 2, effort: 'typical', reasons: ['Two desks. Call 512-555-0142'] });
    const sizer: JobSizer = { name: 'recording', size: call };
    const result = await checkTaskPrice({ db, sizer, now: now() }, 'usr_maya', draft, 'en');
    // Austin's furniture guide is $50–$80 an item: two items, typical work, $110–$150.
    expect(result).toMatchObject({ ok: true, code: 'drafted', value: { unit: 'item', units: 2, lowCents: 11000, highCents: 15000, verdict: 'within', budgetCents: 12000, reasons: ['Two desks. Call [hidden]'] } });
    expect(seen[0]).toMatchObject({ unit: 'item', details: ['itemType: desk', 'itemCount: 2'], locale: 'en' });
  });

  it('refuses prohibited words and words too short', async () => {
    const sizer: JobSizer = { name: 'recording', size: recorder<JobSizeFacts, never>(new Error('not called')).call };
    expect(await checkTaskPrice({ db, sizer, now: now() }, 'usr_maya', { ...draft, description: 'Fix the roof and assemble a desk please' }, 'en')).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { description: ['prohibited'] } });
    expect(await checkTaskPrice({ db, sizer, now: now() }, 'usr_maya', { ...draft, description: 'desk' }, 'en')).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { description: ['too_short'] } });
  });
});

describe('Neighbors: Make it clearer and Draft an answer', () => {
  let postId = '';
  beforeAll(async () => {
    postId = newId('cpo');
    await db.insert(communityPosts).values({ id: postId, marketId: 'mkt_austin', authorUserId: 'usr_maya', kind: 'recommendation', categorySlug: 'furniture-assembly', title: 'Who can build a desk?', body: 'Near 1240 Example Lane, text 512-555-0199' });
    cleanups.push(() => db.delete(communityPosts).where(eq(communityPosts.id, postId)));
  });

  it('rewrites a post with its words masked, and masks what comes back', async () => {
    const { seen, call } = recorder<PostPolishFacts, { title: string; body: string }>({ title: 'Who can assemble a desk?', body: 'Please email me at maya@example.test' });
    const writer: NeighborsWriter = { name: 'recording', polish: call, answer: async () => '' };
    const result = await polishCommunityPost({ db, writer, now: now() }, 'usr_maya', { kind: 'question', title: 'desk?? call 512-555-0142', body: 'need help soon' }, 'en');
    expect(result).toEqual({ ok: true, code: 'drafted', value: { title: 'Who can assemble a desk?', body: 'Please email me at [hidden]' } });
    expect(seen[0]).toMatchObject({ kind: 'question', title: 'desk?? call [hidden]', body: 'need help soon', locale: 'en' });
    expect(await polishCommunityPost({ db, writer, now: now() }, 'usr_maya', { kind: 'general', body: 'hi' }, 'en')).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { body: ['too_short'] } });
  });

  it("drafts an answer for a helper who offers the post's service, from their profile, and for nobody else", async () => {
    const { seen, call } = recorder<AnswerFacts, string>('Plan about two hours, and anchor anything tall to the wall.');
    const writer: NeighborsWriter = { name: 'recording', polish: async () => ({ body: '' }), answer: call };
    const lee = { id: 'usr_lee', staff: null, rows: 'all' as const };
    expect(await draftCommunityAnswer({ db, writer, now: now() }, lee, postId, { notes: 'I build these often' }, 'en')).toEqual({ ok: true, code: 'drafted', value: { body: 'Plan about two hours, and anchor anything tall to the wall.' } });
    expect(seen[0]).toMatchObject({ post: { kind: 'recommendation', categorySlug: 'furniture-assembly' }, helper: { firstName: 'Lee' }, notes: 'I build these often' });
    expect(seen[0]!.helper.services).toContain('furniture-assembly');
    // The author, and someone who doesn't offer the service, get nothing.
    expect(await draftCommunityAnswer({ db, writer, now: now() }, { id: 'usr_maya', staff: null }, postId, { notes: '' }, 'en')).toEqual({ ok: false, code: 'not_allowed' });
    expect(await draftCommunityAnswer({ db, writer, now: now() }, { id: 'usr_ruth', staff: null }, postId, { notes: '' }, 'en')).toEqual({ ok: false, code: 'not_allowed' });
    expect(await draftCommunityAnswer({ db, writer, now: now() }, lee, 'cpo_missing', { notes: '' }, 'en')).toEqual({ ok: false, code: 'not_found' });
    // The page offers it to Lee, and not to Maya.
    const leePage = await getCommunityPost(db, lee, postId, now());
    expect((await withAnswerDraft(db, 'usr_lee', leePage!)).viewer.answerDraft).toBe(true);
    const mayaPage = await getCommunityPost(db, { id: 'usr_maya', staff: null, rows: 'all' }, postId, now());
    expect((await withAnswerDraft(db, 'usr_maya', mayaPage!)).viewer.answerDraft).toBeUndefined();
  });
});

describe('Summarize with AI on a case', () => {
  it('reads the case as the page shows staff, masked, and saves nothing', async () => {
    const { seen, call } = recorder<CaseFacts, { points: string[]; open: string[] }>({ points: ['Ana says two drawers stick.'], open: ['Waiting for photos.'] });
    const summarizer: CaseSummarizer = { name: 'recording', summarize: call };
    const staff = { id: 'usr_morgan', roles: ['support_lead' as const] };
    expect(await summarizeSupportCase({ db, summarizer, now: now() }, staff, 'case_seed_dresser')).toEqual({ ok: true, code: 'drafted', value: { points: ['Ana says two drawers stick.'], open: ['Waiting for photos.'] } });
    expect(seen[0]).toMatchObject({ type: 'dispute', reason: 'not_done', description: 'Two of the drawers still stick and one runner is missing.' });
    expect(seen[0]!.parties.length).toBeGreaterThan(0);
    expect(await summarizeSupportCase({ db, summarizer, now: now() }, staff, 'case_missing')).toEqual({ ok: false, code: 'not_found' });
    expect(await summarizeSupportCase({ db, summarizer: null, now: now() }, staff, 'case_seed_dresser')).toEqual({ ok: false, code: 'unavailable' });
  });
});

describe('Write it for me on a profile reads published reviews', () => {
  it('passes what clients wrote, masked', async () => {
    const seen: ProfileFacts[] = [];
    const writer: ProfileWriter = { name: 'recording', draft: async (facts) => { seen.push(facts); return createFakeProfileWriter().draft(facts); } };
    await db.delete(rateLimits).where(eq(rateLimits.key, `assist:profile:${HELPER}`));
    const result = await draftHelperProfile({ db, writer, now: now() }, HELPER, { notes: '' });
    expect(result.ok).toBe(true);
    expect(seen[0]?.reviews).toEqual(expect.arrayContaining(['Careful with my floors, and very tidy.']));
    expect(seen[0]?.reviews?.join(' ')).not.toContain('352-555-0101');
  });
});
