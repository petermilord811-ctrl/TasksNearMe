import { routes, type PosterIdentityHandlers, type PosterIdentityPageData, type VerificationSummary } from '@/contracts';
import { fakeHandler } from './actions';

/**
 * A client's ID check (Maya), in each state the page shows. She was sent here from posting (or from
 * paying for a booking) and goes back there with "Continue".
 */

const fresh: VerificationSummary['identity'] = { status: 'not_started', consentNeeded: true };
const continuePosting = routes.app.newTask();

/** Two reports in 30 days, before her first check (the Texas notice comes first). */
export const posterIdentityReports: PosterIdentityPageData = { reason: 'reports', identity: fresh, continueHref: continuePosting };

/** A $500+ booking from a week-old account: back to paying once verified. */
export const posterIdentityLargeBooking: PosterIdentityPageData = {
  reason: 'new_account_large_booking',
  identity: fresh,
  continueHref: routes.app.confirmOffer('tsk_fence', 'off_jordan_fence'),
};

/** Five failed card payments in a day. */
export const posterIdentityFailedPayments: PosterIdentityPageData = { reason: 'failed_payments', identity: fresh, continueHref: continuePosting };

/** Our team asked; she accepted the notice on an earlier check. */
export const posterIdentityStaffRequest: PosterIdentityPageData = {
  reason: 'staff_request',
  identity: { status: 'not_started', consentNeeded: false, requested: 'staff_request' },
  continueHref: continuePosting,
};

/** The photo of her ID couldn't be read: try again. */
export const posterIdentityRetry: PosterIdentityPageData = {
  reason: 'reports',
  identity: { status: 'requires_input', failureReason: 'document_unreadable', consentNeeded: false },
  continueHref: continuePosting,
};

/** Submitted; the provider is still checking. */
export const posterIdentityProcessing: PosterIdentityPageData = { reason: 'reports', identity: { status: 'processing', consentNeeded: false }, continueHref: continuePosting };

/** 3 tries today: the next one opens tomorrow. */
export const posterIdentityTryLater: PosterIdentityPageData = {
  reason: 'reports',
  identity: { status: 'requires_input', failureReason: 'selfie_mismatch', consentNeeded: false, blocked: 'try_later', retryAt: '2026-11-18T15:30:00.000Z' },
  continueHref: continuePosting,
};

/** 5 tries without a pass: support takes it from here. */
export const posterIdentityTooMany: PosterIdentityPageData = {
  reason: 'reports',
  identity: { status: 'requires_input', failureReason: 'document_unreadable', consentNeeded: false, blocked: 'too_many_attempts' },
  continueHref: continuePosting,
};

/** Verified, but the ID's name differs from the account's: our team is checking. */
export const posterIdentityNameCheck: PosterIdentityPageData = {
  reason: 'reports',
  identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z', consentNeeded: false, nameCheck: 'in_review' },
  continueHref: continuePosting,
};

/** Passed: back to the booking she was paying for. */
export const posterIdentityVerified: PosterIdentityPageData = {
  identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z', consentNeeded: false },
  continueHref: routes.app.confirmOffer('tsk_fence', 'off_jordan_fence'),
};

/** Nothing asks for a check (she opened the page herself). */
export const posterIdentityNotNeeded: PosterIdentityPageData = { identity: fresh, continueHref: routes.app.home() };

export const fakePosterIdentityHandlers: PosterIdentityHandlers = {
  onStartIdentity: fakeHandler<{ consent?: boolean; next?: string }>({ ok: true, code: 'updated' }),
  onRefreshStatus: fakeHandler({ ok: true, code: 'updated' }),
};
