import type {
  ChangeQuoteResult,
  ChangeRequestView,
  ChangeReviewHandlers,
  ChangeReviewPageData,
  ChangeTermsView,
  PriceBreakdown,
  ProposeChangeHandlers,
  ProposeChangePageData,
} from '@/contracts';
import { routes } from '@/contracts';
import { deskBookingPosterConfirmed, mayaPaymentPanel, movingBookingPosterConfirmed } from './bookings';
import { deskBreakdown, deskWithChairBreakdown, movingFundedBreakdown } from './money';
import { DESK_TIMES } from './timeline';

/**
 * Change requests (UI-027; ui-contract §3): Maya adds a chair to the desk (+$20 → she pays $22.00 more),
 * Jordan asks Chris for one more hour on the move (+$35 → Chris pays $38.50 more), and a lower price.
 */

const deskTerms: ChangeTermsView = { pricing: { type: 'fixed', priceCents: 6000 }, start: DESK_TIMES.agreedStart, scopeText: deskBookingPosterConfirmed.terms.scopeText, expenseAllowanceCents: 0 };
const deskWithChairTerms: ChangeTermsView = { ...deskTerms, pricing: { type: 'fixed', priceCents: 8000 }, scopeText: `${deskTerms.scopeText} Also assemble the matching desk chair.` };

const deskChair: ChangeRequestView = {
  id: 'chg_desk_chair',
  bookingId: 'bkg_desk',
  status: 'proposed',
  fromMe: true,
  types: ['price', 'scope'],
  current: deskTerms,
  proposed: deskWithChairTerms,
  message: 'Could you also assemble the matching chair? It came in the same box.',
  before: deskBreakdown,
  after: deskWithChairBreakdown,
  differenceCents: 2200,
  createdAt: '2026-11-19T18:00:00.000Z',
  expiresAt: DESK_TIMES.agreedStart,
  actions: ['withdraw_change'],
};

/** Maya proposed the chair and waits for Jordan. */
export const deskChairChangeProposerData: ChangeReviewPageData = {
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', viewerRole: 'poster', posterDisplayName: 'Maya R.', helperDisplayName: 'Jordan T.' },
  change: deskChair,
};

/** Jordan sees Maya's proposal (helpers see their earnings, not the client's difference). */
export const deskChairChangeCounterpartyData: ChangeReviewPageData = {
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', viewerRole: 'helper', posterDisplayName: 'Maya R.', helperDisplayName: 'Jordan T.' },
  change: { ...deskChair, fromMe: false, differenceCents: undefined, actions: ['accept_change', 'decline_change'] },
};

/** Jordan accepted: Maya pays the $22.00 difference before the new terms apply. */
export const deskChairChangePayData: ChangeReviewPageData = {
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', viewerRole: 'poster', posterDisplayName: 'Maya R.', helperDisplayName: 'Jordan T.' },
  change: { ...deskChair, status: 'accepted_pending_funding', expiresAt: '2026-11-20T18:00:00.000Z', actions: ['pay_change_difference'] },
  payment: mayaPaymentPanel,
};

/** Applied: the new terms are in force. */
export const deskChairChangeAppliedData: ChangeReviewPageData = {
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', viewerRole: 'poster', posterDisplayName: 'Maya R.', helperDisplayName: 'Jordan T.' },
  change: { ...deskChair, status: 'applied', expiresAt: undefined, actions: [] },
};

/** Jordan declined: the previous terms stay. */
export const deskChairChangeDeclinedData: ChangeReviewPageData = {
  ...deskChairChangeAppliedData,
  change: { ...deskChair, status: 'declined', expiresAt: undefined, actions: [] },
};

const movingCap5: PriceBreakdown = {
  ...movingFundedBreakdown,
  taskPriceCents: 17500,
  hourly: { rateCents: 3500, hours: 5, basis: 'cap' },
  posterFeeCents: 1750,
  helperFeeCents: 1750,
  posterTotalCents: 19250,
  helperEarningsCents: 15750,
  platformRevenueCents: 3500,
};

const movingTerms: ChangeTermsView = {
  pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 4 },
  start: movingBookingPosterConfirmed.terms.start,
  scopeText: movingBookingPosterConfirmed.terms.scopeText,
  expenseAllowanceCents: 0,
};

/** During the move, Jordan asks Chris for one more hour: Chris would pay $38.50 more. */
export const movingCapChangeData: ChangeReviewPageData = {
  booking: { id: 'bkg_moving', title: 'Help loading a moving truck', viewerRole: 'poster', posterDisplayName: 'Chris D.', helperDisplayName: 'Jordan T.' },
  change: {
    id: 'chg_moving_cap',
    bookingId: 'bkg_moving',
    status: 'proposed',
    fromMe: false,
    types: ['hours_cap'],
    current: movingTerms,
    proposed: { ...movingTerms, pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3, hoursCap: 5 } },
    message: 'The truck is bigger than we planned. One more hour should cover it.',
    before: movingFundedBreakdown,
    after: movingCap5,
    differenceCents: 3850,
    createdAt: '2026-12-05T17:30:00.000Z',
    expiresAt: '2026-12-06T17:30:00.000Z',
    actions: ['accept_change', 'decline_change'],
  },
  payment: mayaPaymentPanel,
};

/** Maya proposes a change on the desk (before the start: everything can change). */
export const deskProposeChangeData: ProposeChangePageData = {
  booking: { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)', viewerRole: 'poster' },
  current: deskTerms,
  allowedTypes: ['price', 'scope', 'schedule', 'expense_allowance'],
  scheduleWindow: { earliest: '2026-11-18T16:00:00.000Z', latest: '2026-12-17T16:00:00.000Z' },
};

/** Jordan during the move: the hours cap and price, not the start. */
export const movingProposeChangeData: ProposeChangePageData = {
  booking: { id: 'bkg_moving', title: 'Help loading a moving truck', viewerRole: 'helper' },
  current: movingTerms,
  allowedTypes: ['price', 'scope', 'hours_cap', 'expense_allowance'],
};

/** A change is already open: the page points to it. */
export const deskProposeChangeBlockedData: ProposeChangePageData = { ...deskProposeChangeData, openChangeId: 'chg_desk_chair' };

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const deskChairQuote: ChangeQuoteResult = { ok: true, before: deskBreakdown, after: deskWithChairBreakdown, differenceCents: 2200 };

export const fakeProposeChangeHandlers: ProposeChangeHandlers = {
  onQuote: () => wait(deskChairQuote),
  onPropose: () => wait({ ok: true, code: 'sent', redirectTo: routes.app.bookingChange('bkg_desk', 'chg_desk_chair') }),
};

export const fakeChangeReviewHandlers: ChangeReviewHandlers = {
  onAccept: () => wait({ ok: true, code: 'updated', redirectTo: routes.app.booking('bkg_desk') }),
  onPayDifference: () => wait({ ok: true, code: 'paid', redirectTo: routes.app.booking('bkg_desk') }),
  onFinishVerification: () => wait({ ok: true, code: 'paid', redirectTo: routes.app.booking('bkg_desk') }),
  onDecline: () => wait({ ok: true, code: 'updated', redirectTo: routes.app.booking('bkg_desk') }),
  onWithdraw: () => wait({ ok: true, code: 'updated', redirectTo: routes.app.booking('bkg_desk') }),
};
