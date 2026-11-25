import type {
  QueryHandler,
  AdminCaseSummary,
  AiAssistResult,
  BookingPrepView,
  BookingView,
  CommunityAnswerDraft,
  CommunityPolish,
  CommunityPostPageData,
  HelperProfilePageData,
  PriceCheck,
  ReviewDraft,
  ReviewSummaryView,
} from '@/contracts';
import { deskBookingHelperConfirmed, deskBookingPosterConfirmed } from './bookings';
import { communityPostHelperViewData } from './community';
import { samProfilePageData } from './profiles';

/**
 * The AI features (2026-11-24; src/contracts/ai-assist.ts): what each answers, and the pages that show them, for the
 * previews and the component tests. The words are what a model might write, kept plain and short.
 */

/** A query handler for previews and tests: answers `result` after a moment, like a model would. */
export function fakeQuery<TInput, TOutput>(result: TOutput, delayMs = 600): QueryHandler<TInput, TOutput> {
  return () => new Promise((resolve) => setTimeout(() => resolve(result), delayMs));
}

// ---- Reviews ----------------------------------------------------------------------------------------------------

export const reviewDraftResult: AiAssistResult<ReviewDraft> = {
  ok: true,
  code: 'drafted',
  value: { body: 'Jordan had the standing desk built and level in under an hour, and tidied up the packaging before he left. Friendly and careful with my floors. I would book him again.' },
};

/** Sam's "What neighbors say" (made from his published client reviews). */
export const samReviewSummary: ReviewSummaryView = {
  points: {
    en: [
      'Reviewers say Sam works fast and leaves the space tidy, packaging included.',
      'Moves heavy furniture down stairs without scratches.',
      'Messages when he is on his way and often finishes early.',
    ],
    es: [
      'Las reseñas dicen que Sam trabaja rápido y deja todo ordenado, incluido el empaque.',
      'Baja muebles pesados por escaleras sin rayones.',
      'Avisa cuando va en camino y muchas veces termina antes.',
    ],
  },
  reviewCount: 3,
  updatedAt: '2026-11-22T09:00:00.000Z',
};

export const samProfileWithSummaryData: HelperProfilePageData = { ...samProfilePageData, reviewSummary: samReviewSummary };

// ---- Bookings: Get ready ------------------------------------------------------------------------------------------

export const deskChecklistPoster = {
  items: [
    'Unbox the desk parts and keep the screws and instructions together.',
    'Clear a 6 by 6 foot space in the office for the build.',
    'Confirm in the chat whether Jordan should anchor the desk to the wall.',
    'Plan for someone to be home from 10:00 AM to let Jordan in.',
  ],
  madeAt: '2026-11-22T14:10:00.000Z',
};

export const deskChecklistHelper = {
  items: [
    'Pack a drill with hex bits, a level and a rubber mallet.',
    'Confirm the floor and whether there is an elevator in the chat.',
    'Bring a bag for the packaging so the room is left tidy.',
  ],
  madeAt: '2026-11-22T14:12:00.000Z',
};

export const bookingPrepEmpty: BookingPrepView = {};
export const bookingPrepPosterMade: BookingPrepView = { checklist: deskChecklistPoster };
export const bookingPrepPosterStale: BookingPrepView = { checklist: deskChecklistPoster, stale: true };
export const bookingPrepHelperMade: BookingPrepView = { checklist: deskChecklistHelper };

export const deskBookingPosterPrep: BookingView = { ...deskBookingPosterConfirmed, prep: bookingPrepEmpty };
export const deskBookingPosterPrepMade: BookingView = { ...deskBookingPosterConfirmed, prep: bookingPrepPosterMade };
export const deskBookingPosterPrepStale: BookingView = { ...deskBookingPosterConfirmed, prep: bookingPrepPosterStale };
export const deskBookingHelperPrepMade: BookingView = { ...deskBookingHelperConfirmed, prep: bookingPrepHelperMade };

export const bookingChecklistResult: AiAssistResult<typeof deskChecklistPoster> = { ok: true, code: 'drafted', value: deskChecklistPoster };

// ---- Posting: Check my price with AI ------------------------------------------------------------------------------

/** Two flat-pack pieces in Austin's guide ($50–$80 an item), typical work. */
export const priceCheckWithin: PriceCheck = {
  unit: 'item',
  units: 2,
  lowCents: 11000,
  highCents: 15000,
  verdict: 'within',
  budgetCents: 12000,
  reasons: ['Two flat-pack pieces: a desk and a bookshelf.', 'Third floor with no elevator adds carrying time.'],
  recent: { count: 12, lowCents: 9000, highCents: 14000 },
};
export const priceCheckBelow: PriceCheck = { ...priceCheckWithin, verdict: 'below', budgetCents: 6000 };
export const priceCheckAbove: PriceCheck = { ...priceCheckWithin, verdict: 'above', budgetCents: 25000 };
/** No budget typed yet, and too few recent bookings to show. */
export const priceCheckNoBudget: PriceCheck = { unit: 'hour', units: 3, lowCents: 10500, highCents: 12000, reasons: ['About 3 hours for a two-bedroom load with stairs.'] };

export const priceCheckResult = (value: PriceCheck): AiAssistResult<PriceCheck> => ({ ok: true, code: 'drafted', value });

// ---- Neighbors ----------------------------------------------------------------------------------------------------

export const communityPolishResult: AiAssistResult<CommunityPolish> = {
  ok: true,
  code: 'drafted',
  value: {
    title: 'Who do you recommend to assemble a flat-pack desk and bookshelf?',
    body: 'I just got a standing desk and a bookshelf from IKEA and would love help putting them together this weekend. Has anyone booked someone careful they would recommend?',
  },
};

export const communityAnswerResult: AiAssistResult<CommunityAnswerDraft> = {
  ok: true,
  code: 'drafted',
  value: { body: 'For a desk and a bookshelf, plan on about two hours and keep the parts in one room. Anchoring the bookshelf to the wall is worth it. I assemble flat-pack furniture on TasksNearMe if that helps.' },
};

/** Lee (a helper who assembles furniture) on Maya's recommendation request: "Draft an answer with AI". */
export const communityPostAnswerDraftData: CommunityPostPageData = {
  ...communityPostHelperViewData,
  viewer: { ...communityPostHelperViewData.viewer, answerDraft: true },
};

// ---- Staff ----------------------------------------------------------------------------------------------------------

export const adminCaseSummary: AdminCaseSummary = {
  points: [
    'Maya R. reported that the desk wobbled after Jordan T. assembled it, and asked for part of the price back.',
    'Jordan T. says he tightened every bolt and offered to come back to check the frame.',
    'Support asked Maya for a photo of the loose joint.',
  ],
  open: ['Waiting for Maya R. to send the photo.', 'No refund amount decided yet.'],
};

export const adminCaseSummaryResult: AiAssistResult<AdminCaseSummary> = { ok: true, code: 'drafted', value: adminCaseSummary };
