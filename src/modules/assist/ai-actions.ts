'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import {
  localeOrDefault,
  type AdminCaseSummary,
  type AiAssistResult,
  type AppLocale,
  type BookingChecklist,
  type CommunityAnswerDraft,
  type CommunityAnswerDraftInput,
  type CommunityPolish,
  type CommunityPolishInput,
  type PriceCheck,
  type PriceCheckInput,
  type ReviewDraft,
  type ReviewDraftInput,
} from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createBookingPrepper, createFakeBookingPrepper } from '@/integrations/ai/booking-prepper';
import { createCaseSummarizer, createFakeCaseSummarizer } from '@/integrations/ai/case-summarizer';
import { createFakeNeighborsWriter, createNeighborsWriter } from '@/integrations/ai/neighbors-writer';
import { createFakeJobSizer, createJobSizer } from '@/integrations/ai/price-sizer';
import { createFakeReviewWriter, createReviewWriter } from '@/integrations/ai/review-writer';
import { getBookingView } from '@/modules/bookings/hub';
import { hubDeps } from '@/modules/bookings/server';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { NOT_FOUND, UNAVAILABLE } from './ai-run';
import { prepareBookingChecklist } from './booking-prep';
import { summarizeSupportCase } from './case-summary';
import { draftCommunityAnswer, polishCommunityPost } from './neighbors-ai';
import { checkTaskPrice } from './price-check';
import { draftReview } from './review-draft';

/**
 * The AI features' Server Actions (2026-11-24; src/contracts/ai-assist.ts). Each one needs a signed-in person (staff
 * for a case), reads everything it acts on from the database with that person's access, validates its input with the
 * contract's schema, and saves nothing but a "Get ready" checklist for the person who asked. Answers come in the page's
 * language. Tests ask for the stand-ins with the `tnm_ai_stand_in` cookie, so they never reach a model where a key is
 * set (never in production).
 */

const reviewWriter = createReviewWriter();
const prepper = createBookingPrepper();
const sizer = createJobSizer();
const neighborsWriter = createNeighborsWriter();
const caseSummarizer = createCaseSummarizer();

async function signedIn() {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user : null;
}

async function standIn(): Promise<boolean> {
  return wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
}

async function pageLocale(): Promise<AppLocale> {
  return localeOrDefault(await getLocale());
}

/** "Write it with AI" on the review form; bound to the booking by the page. */
export async function draftReviewAction(bookingId: string, input: ReviewDraftInput): Promise<AiAssistResult<ReviewDraft>> {
  const user = await signedIn();
  if (!user) return UNAVAILABLE;
  const writer = (await standIn()) ? createFakeReviewWriter() : reviewWriter;
  return draftReview({ db, writer, now: await requestNow() }, user.id, String(bookingId), input, await pageLocale());
}

/** "Make my checklist" on a booking; bound to it by the page. */
export async function prepareBookingAction(bookingId: string, _input?: Record<string, never>): Promise<AiAssistResult<BookingChecklist>> {
  const user = await signedIn();
  if (!user) return UNAVAILABLE;
  const now = await requestNow();
  const view = await getBookingView(hubDeps(), user.id, String(bookingId), now);
  if (!view) return NOT_FOUND;
  const chosen = (await standIn()) ? createFakeBookingPrepper() : prepper;
  return prepareBookingChecklist({ db, prepper: chosen, now }, user.id, view, await pageLocale());
}

/** "Check my price with AI" on the posting form's budget step. */
export async function checkTaskPriceAction(input: PriceCheckInput): Promise<AiAssistResult<PriceCheck>> {
  const user = await signedIn();
  if (!user) return UNAVAILABLE;
  const chosen = (await standIn()) ? createFakeJobSizer() : sizer;
  return checkTaskPrice({ db, sizer: chosen, now: await requestNow() }, user.id, input, await pageLocale());
}

/** "Make it clearer" in the Neighbors composer. */
export async function polishCommunityPostAction(input: CommunityPolishInput): Promise<AiAssistResult<CommunityPolish>> {
  const user = await signedIn();
  if (!user) return UNAVAILABLE;
  const writer = (await standIn()) ? createFakeNeighborsWriter() : neighborsWriter;
  return polishCommunityPost({ db, writer, now: await requestNow() }, user.id, input, await pageLocale());
}

/** "Draft an answer with AI" on a Neighbors post; bound to the post by the page. */
export async function draftCommunityAnswerAction(postId: string, input: CommunityAnswerDraftInput): Promise<AiAssistResult<CommunityAnswerDraft>> {
  const user = await signedIn();
  if (!user) return UNAVAILABLE;
  const locale = await pageLocale();
  const writer = (await standIn()) ? createFakeNeighborsWriter() : neighborsWriter;
  return draftCommunityAnswer({ db, writer, now: await requestNow() }, await communityViewerOf(user, locale), String(postId), input, locale);
}

/** "Summarize with AI" on a support case, for staff who passed the two-step check; bound to the case by the page. */
export async function summarizeCaseAction(caseId: string, _input?: Record<string, never>): Promise<AiAssistResult<AdminCaseSummary>> {
  const user = await signedIn();
  const staff = user ? staffActorOf(user) : null;
  if (!staff) return { ok: false, code: 'not_allowed' };
  const summarizer = (await standIn()) ? createFakeCaseSummarizer() : caseSummarizer;
  return summarizeSupportCase({ db, summarizer, now: await requestNow() }, staff, String(caseId));
}
