import type { ReviewHandlers, ReviewPageData, ReviewUnavailableReason, SavedHelperHandlers, SavedHelpersPageData } from '@/contracts';
import { routes } from '@/contracts';
import { jordan, lee, maya, sam } from './people';
import { DESK_TIMES } from './timeline';

/** Reviews after the desk (approved Sat, Nov 21; reviews publish by Sat, Dec 5) and Maya's saved helpers (UI-015). */

const deskBooking = { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly' as const, start: DESK_TIMES.agreedStart };
const person = (p: typeof maya | typeof jordan) => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified });

/** Maya reviews Jordan. */
export const deskReviewByClientData: ReviewPageData = {
  booking: deskBooking,
  direction: 'client_to_helper',
  subject: person(jordan),
  publishesBy: DESK_TIMES.reviewsPublishBy,
};

/** Jordan reviews Maya. */
export const deskReviewByHelperData: ReviewPageData = {
  ...deskReviewByClientData,
  direction: 'helper_to_client',
  subject: person(maya),
};

/** Maya sent hers; it shows when Jordan sends his, or on Dec 5. */
export const deskReviewSubmittedData: ReviewPageData = {
  ...deskReviewByClientData,
  mine: { rating: 5, tags: ['on_time', 'careful', 'tidy'], body: 'Jordan had the desk up in no time and took the packaging with him.', submittedAt: '2026-11-21T20:00:00.000Z' },
};

/** Both sent: visible now. */
export const deskReviewPublishedData: ReviewPageData = {
  ...deskReviewSubmittedData,
  mine: { ...deskReviewSubmittedData.mine!, publishedAt: '2026-11-22T09:00:00.000Z' },
};

export const reviewUnavailableData: Record<ReviewUnavailableReason, ReviewPageData> = {
  not_completed: { ...deskReviewByClientData, unavailable: 'not_completed' },
  window_closed: { ...deskReviewByClientData, unavailable: 'window_closed' },
};

export const mayaSavedHelpersData: SavedHelpersPageData = { helpers: [jordan, sam, lee] };
export const savedHelpersEmptyData: SavedHelpersPageData = { helpers: [] };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeReviewHandlers: ReviewHandlers = {
  onSubmit: () => wait({ ok: true, code: 'submitted', redirectTo: routes.app.booking('bkg_desk') }),
};

export const fakeSavedHelperHandlers: SavedHelperHandlers = {
  onToggleSaved: () => wait({ ok: true, code: 'updated' }),
};
