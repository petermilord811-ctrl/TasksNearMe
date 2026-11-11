import type {
  ActionDescriptor,
  BookingActionId,
  BookingConfirmHandlers,
  BookingConfirmPageData,
  BookingHubHandlers,
  BookingListRow,
  BookingPaymentLine,
  BookingsPageData,
  BookingTermsView,
  BookingUnavailableReason,
  BookingView,
  PaymentAttemptResult,
  PaymentPanelData,
  SavedPaymentMethod,
} from '@/contracts';
import { DEV_TEST_CARDS, routes } from '@/contracts';
import { crestviewArea, deskExactAddress, muellerArea } from './locations';
import { deskPublicTask, remoteComputerPublicTask } from './marketing';
import { movingPublicTask } from './helper-work';
import { deskBreakdown, movingFundedBreakdown, remoteComputerBreakdown } from './money';
import { deskOfferJordan } from './offers';
import { chris, jordan, lee, maya, ruth, sam } from './people';
import { DESK_TIMES, deskTimelineCompleted } from './timeline';

/**
 * Booking confirmation (UI-010). "Now" for the desk is Tue, Nov 17, 2026, 9:00 am in Austin:
 * Maya books Jordan's $60 offer and pays $66.00. Cancellation values follow blueprint 04 §6:
 * free until 24 h before the start; later, the helper gets max($10, 20% of the price).
 */

/** Maya's saved cards. The Visa is her default; it's the card declined in `desk.payment_declined`. */
export const mayaVisa: SavedPaymentMethod = { id: 'pm_maya_visa', brand: 'visa', last4: '1881', expMonth: 8, expYear: 2028, isDefault: true };
export const mayaMastercard: SavedPaymentMethod = {
  id: 'pm_maya_mc',
  brand: 'mastercard',
  last4: '4444',
  expMonth: 3,
  expYear: 2027,
  isDefault: false,
};

const devCards = { kind: 'dev', testCards: DEV_TEST_CARDS } as const;

export const mayaPaymentPanel: PaymentPanelData = { methods: [mayaVisa, mayaMastercard], newCard: devCards };
export const noSavedCardsPaymentPanel: PaymentPanelData = { methods: [], newCard: devCards };

/** Maya books Jordan: $60 + $6.00 fee = $66.00 today. Late cancellation: $54.00 back, Jordan gets $12.00. */
export const deskConfirmData: BookingConfirmPageData = {
  task: {
    id: deskPublicTask.id,
    title: deskPublicTask.title,
    categorySlug: deskPublicTask.categorySlug,
    location: deskPublicTask.location,
    schedule: deskPublicTask.schedule,
  },
  offer: {
    id: deskOfferJordan.id,
    revision: deskOfferJordan.revision,
    helper: jordan,
    pricing: deskOfferJordan.pricing,
    proposedStart: deskOfferJordan.proposedStart,
    message: deskOfferJordan.message,
    brings: deskOfferJordan.brings,
  },
  breakdown: deskBreakdown,
  cancellation: { freeUntil: '2026-11-20T16:00:00.000Z', lateRefundCents: 5400, lateHelperCompensationCents: 1200 },
  payment: mayaPaymentPanel,
};

/** First booking ever: no saved cards, so the new-card form is selected. */
export const deskConfirmNewCardData: BookingConfirmPageData = { ...deskConfirmData, payment: noSavedCardsPaymentPanel };

/** `desk.payment_declined`: the Visa was declined at 9:01 am; the booking waits until 9:31 am. */
export const deskConfirmDeclinedData: BookingConfirmPageData = {
  ...deskConfirmData,
  pending: {
    bookingId: 'bkg_desk',
    expiresAt: '2026-11-17T15:31:00.000Z',
    lastFailure: { code: 'payment_declined', method: { brand: 'visa', last4: '1881' }, at: '2026-11-17T15:01:00.000Z' },
  },
};

/** The same, declined for funds. */
export const deskConfirmInsufficientFundsData: BookingConfirmPageData = {
  ...deskConfirmDeclinedData,
  pending: {
    ...deskConfirmDeclinedData.pending!,
    lastFailure: { code: 'insufficient_funds', method: { brand: 'visa', last4: '1881' }, at: '2026-11-17T15:01:00.000Z' },
  },
};

/** One page per reason the offer can't be booked. */
export const deskConfirmUnavailableData: Record<BookingUnavailableReason, BookingConfirmPageData> = {
  offer_withdrawn: { ...deskConfirmData, unavailable: 'offer_withdrawn' },
  offer_expired: { ...deskConfirmData, unavailable: 'offer_expired' },
  offer_declined: { ...deskConfirmData, unavailable: 'offer_declined' },
  offer_stale: { ...deskConfirmData, unavailable: 'offer_stale' },
  task_booked: { ...deskConfirmData, unavailable: 'task_booked' },
  task_closed: { ...deskConfirmData, unavailable: 'task_closed' },
};

/**
 * Chris's move in Crestview (Sun, Nov 22, 9:00 am–1:00 pm), booked with Jordan at $35/h: 3.5 h estimate, 4 h cap.
 * Hourly: Chris pays for the 4 h cap now ($140 + $14.00 = $154.00); unused hours come back after approval.
 * Late cancellation: Jordan gets 20% of $140 = $28.00; Chris gets $126.00 back.
 */
export const movingConfirmHourlyData: BookingConfirmPageData = {
  task: {
    id: movingPublicTask.id,
    title: movingPublicTask.title,
    categorySlug: movingPublicTask.categorySlug,
    location: crestviewArea, // as the poster sees it: no distance band
    schedule: movingPublicTask.schedule,
  },
  offer: {
    id: 'off_moving_jordan',
    revision: 2,
    helper: jordan,
    pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
    proposedStart: '2026-11-22T15:00:00.000Z',
    message: [{ kind: 'text', text: 'I can lift and load. I bring straps and a dolly.' }],
    brings: ['Moving straps', 'Dolly'],
  },
  breakdown: movingFundedBreakdown,
  cancellation: { freeUntil: '2026-11-21T15:00:00.000Z', lateRefundCents: 12600, lateHelperCompensationCents: 2800 },
  payment: { methods: [], newCard: devCards },
};

/**
 * Remote: Ruth books Lee's $40 laptop setup ($44.00). No address is shared.
 * Late cancellation: Lee gets the $10.00 minimum; Ruth gets $34.00 back.
 */
export const remoteConfirmData: BookingConfirmPageData = {
  task: {
    id: remoteComputerPublicTask.id,
    title: remoteComputerPublicTask.title,
    categorySlug: remoteComputerPublicTask.categorySlug,
    location: remoteComputerPublicTask.location,
    schedule: remoteComputerPublicTask.schedule,
  },
  offer: {
    id: 'off_computer_lee',
    revision: 1,
    helper: lee,
    pricing: { type: 'fixed', priceCents: 4000 },
    proposedStart: '2026-11-23T16:00:00.000Z',
    message: [{ kind: 'text', text: 'I set up laptops every week. We can do it over a screen share.' }],
    brings: [],
  },
  breakdown: remoteComputerBreakdown,
  cancellation: { freeUntil: '2026-11-22T16:00:00.000Z', lateRefundCents: 3400, lateHelperCompensationCents: 1000 },
  payment: { methods: [], newCard: devCards },
};

const wait = <T,>(value: T, ms = 600) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const booked: PaymentAttemptResult = { ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_desk') };

/**
 * Fake handlers for previews and tests. Saved cards and the `success` test card book; the other test
 * cards give their outcome; `requires_verification` asks for the bank step, which then books when
 * approved and declines when failed.
 */
export const fakeBookingConfirmHandlers: BookingConfirmHandlers = {
  onConfirm: ({ payment }) => {
    if (payment.kind === 'saved') return wait(booked);
    switch (payment.card) {
      case 'declined':
        return wait({ ok: false, code: 'payment_declined' });
      case 'insufficient_funds':
        return wait({ ok: false, code: 'insufficient_funds' });
      case 'requires_verification':
        return wait({ ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_desk_2', kind: 'dev' } });
      default:
        return wait(booked);
    }
  },
  onFinishVerification: ({ outcome }) => wait(outcome === 'approved' ? booked : { ok: false, code: 'payment_declined' }),
};

// ---- The booking page and the bookings list (UI-011) ---------------------------------------------
// The desk booking: Maya ↔ Jordan, Sat, Nov 21, agreed start 10:30 am (DESK_TIMES), $66.00 charged.

const deskBookingTask = {
  id: deskPublicTask.id,
  title: deskPublicTask.title,
  categorySlug: deskPublicTask.categorySlug,
  schedule: deskPublicTask.schedule,
};

const deskTerms: BookingTermsView = {
  version: 1,
  pricing: { type: 'fixed', priceCents: 6000 },
  breakdown: deskBreakdown,
  scopeText: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
  start: DESK_TIMES.agreedStart,
};

const deskCharge: BookingPaymentLine = {
  id: 'pay_desk',
  kind: 'charge',
  amountCents: 6600,
  status: 'succeeded',
  method: { brand: 'visa', last4: '1881' },
  at: DESK_TIMES.booked,
};

const action = (
  id: BookingActionId,
  kind: ActionDescriptor['kind'] = 'secondary',
  extra: Partial<ActionDescriptor<BookingActionId>> = {},
): ActionDescriptor<BookingActionId> => ({ id, kind, enabled: true, ...extra });

/** Maya's view once booked: her own address, the $66.00 charge. */
export const deskBookingPosterConfirmed: BookingView = {
  id: 'bkg_desk',
  task: deskBookingTask,
  status: 'confirmed',
  viewerRole: 'poster',
  poster: maya,
  helper: jordan,
  location: muellerArea,
  exactAddress: deskExactAddress,
  addressVisibility: 'visible',
  terms: deskTerms,
  deadlines: { noShowReportableAt: DESK_TIMES.noShowReportable },
  timeline: deskTimelineCompleted.slice(0, 4),
  payments: [deskCharge],
  actions: [action('message'), action('add_to_calendar')],
};

/** Jordan's view once booked: the address is his to see now. "On my way" opens 2 h before the start. */
export const deskBookingHelperConfirmed: BookingView = {
  ...deskBookingPosterConfirmed,
  viewerRole: 'helper',
  payments: undefined,
  actions: [
    action('on_my_way', 'primary', { enabled: false, disabledReason: { code: 'available_at', at: '2026-11-21T14:30:00.000Z' } }),
    action('message'),
    action('add_to_calendar'),
  ],
};

/** `desk.confirmed.day_of`: Jordan tapped "On my way" at 9:58 am. */
export const deskBookingHelperDayOf: BookingView = {
  ...deskBookingHelperConfirmed,
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z' },
  timeline: deskTimelineCompleted.slice(0, 5),
  actions: [action('arrived', 'primary'), action('running_late'), action('message')],
};

/** Jordan arrived at 10:24 am. */
export const deskBookingHelperInProgress: BookingView = {
  ...deskBookingHelperDayOf,
  status: 'in_progress',
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', arrivedAt: DESK_TIMES.arrived },
  timeline: deskTimelineCompleted.slice(0, 6),
  deadlines: {},
  actions: [action('submit_completion', 'primary'), action('message')],
};

/** `desk.payment_declined` from Maya's booking page: pay again before 9:31 am. */
export const deskBookingPosterPendingFunding: BookingView = {
  ...deskBookingPosterConfirmed,
  status: 'pending_funding',
  deadlines: { pendingFundingExpiresAt: '2026-11-17T15:31:00.000Z' },
  timeline: [
    ...deskTimelineCompleted.slice(0, 2),
    { id: 'evt_pf', at: '2026-11-17T15:01:00.000Z', actor: 'system', type: 'payment_failed', params: { amountCents: 6600 } },
  ],
  payments: [{ ...deskCharge, id: 'pay_desk_1', status: 'failed', at: '2026-11-17T15:01:00.000Z' }],
  actions: [action('pay', 'primary')],
};

/** Jordan while Maya is still paying: no address yet. */
export const deskBookingHelperPendingFunding: BookingView = {
  ...deskBookingPosterPendingFunding,
  viewerRole: 'helper',
  exactAddress: undefined,
  addressVisibility: 'after_confirmation',
  payments: undefined,
  actions: [],
};

/** Jordan submitted the work at 11:48 am; Maya approves by Tue 11:48 am or it's approved automatically. */
export const deskBookingPosterCompletionSubmitted: BookingView = {
  ...deskBookingPosterConfirmed,
  status: 'completion_submitted',
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', arrivedAt: DESK_TIMES.arrived },
  deadlines: { approvalDueAt: DESK_TIMES.approvalDue },
  timeline: deskTimelineCompleted.slice(0, 7),
  actions: [action('approve', 'primary', { confirm: true }), action('report_problem'), action('message')],
};

/** Approved at 1:05 pm. */
export const deskBookingPosterCompleted: BookingView = {
  ...deskBookingPosterCompletionSubmitted,
  status: 'completed',
  completedVia: 'poster',
  deadlines: {},
  timeline: deskTimelineCompleted,
  actions: [action('review', 'primary'), action('save_helper'), action('book_again'), action('message')],
};

/** Jordan within 48 h of approval: still sees the address, until Mon 1:05 pm. */
export const deskBookingHelperCompleted: BookingView = {
  ...deskBookingPosterCompleted,
  viewerRole: 'helper',
  payments: undefined,
  deadlines: { addressHiddenAt: DESK_TIMES.addressHidden },
  actions: [action('review', 'primary'), action('message')],
};

/** Jordan after the 48 h: the address is gone for good. */
export const deskBookingHelperCompletedAddressHidden: BookingView = {
  ...deskBookingHelperCompleted,
  exactAddress: undefined,
  addressVisibility: 'hidden_after_completion',
  deadlines: {},
};

/** Maya canceled less than 24 h before: $54.00 back; Jordan receives $12.00. */
export const deskBookingPosterCanceledLate: BookingView = {
  ...deskBookingPosterConfirmed,
  status: 'canceled',
  cancelReason: 'poster_late',
  deadlines: {},
  timeline: [
    ...deskTimelineCompleted.slice(0, 4),
    { id: 'evt_cl', at: '2026-11-20T22:00:00.000Z', actor: 'poster', actorName: 'Maya R.', type: 'canceled' },
    { id: 'evt_rf', at: '2026-11-20T22:00:00.000Z', actor: 'system', type: 'refund_issued', params: { amountCents: 5400 } },
  ],
  payments: [deskCharge, { id: 'ref_desk', kind: 'refund', amountCents: 5400, status: 'succeeded', at: '2026-11-20T22:00:00.000Z' }],
  actions: [],
};

/** Jordan canceled: Maya gets everything back and can find someone else. */
export const deskBookingPosterCanceledByHelper: BookingView = {
  ...deskBookingPosterCanceledLate,
  cancelReason: 'helper',
  timeline: [
    ...deskTimelineCompleted.slice(0, 4),
    { id: 'evt_ch', at: '2026-11-19T18:00:00.000Z', actor: 'helper', actorName: 'Jordan T.', type: 'canceled' },
    { id: 'evt_rh', at: '2026-11-19T18:00:00.000Z', actor: 'system', type: 'refund_issued', params: { amountCents: 6600 } },
  ],
  payments: [deskCharge, { id: 'ref_desk_h', kind: 'refund', amountCents: 6600, status: 'succeeded', at: '2026-11-19T18:00:00.000Z' }],
  actions: [action('find_replacement', 'primary')],
};

/** `moving.confirmed` from Chris's side: $35/h, 4 h cap, $154.00 charged; unused hours come back. */
export const movingBookingPosterConfirmed: BookingView = {
  id: 'bkg_moving',
  task: { id: movingPublicTask.id, title: movingPublicTask.title, categorySlug: movingPublicTask.categorySlug, schedule: movingPublicTask.schedule },
  status: 'confirmed',
  viewerRole: 'poster',
  poster: chris,
  helper: jordan,
  location: crestviewArea,
  exactAddress: { line1: '88 Sample Street', city: 'Austin', state: 'TX', zip: '78757', accessNotes: 'The truck parks in the driveway.' },
  addressVisibility: 'visible',
  terms: {
    version: 1,
    pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
    breakdown: movingFundedBreakdown,
    scopeText: 'Two-bedroom apartment, boxes are packed. Couch, dresser, and a queen bed. Truck is rented.',
    start: '2026-11-22T15:00:00.000Z',
    expenseAllowance: { amountCents: 2000, description: 'Up to $20 for moving blankets or tape' },
  },
  deadlines: { noShowReportableAt: '2026-11-22T15:30:00.000Z' },
  timeline: [
    { id: 'evt_m1', at: '2026-11-17T12:00:00.000Z', actor: 'poster', actorName: 'Chris D.', type: 'task_posted' },
    { id: 'evt_m2', at: '2026-11-18T14:00:00.000Z', actor: 'poster', actorName: 'Chris D.', type: 'booked' },
    { id: 'evt_m3', at: '2026-11-18T14:00:00.000Z', actor: 'system', type: 'payment_succeeded', params: { amountCents: 15400 } },
  ],
  payments: [
    { id: 'pay_moving', kind: 'charge', amountCents: 15400, status: 'succeeded', method: { brand: 'mastercard', last4: '4444' }, at: '2026-11-18T14:00:00.000Z' },
  ],
  actions: [action('message'), action('add_to_calendar')],
};

/** Remote laptop help from Lee's side: no address at all; a meeting link is shared in chat. */
export const remoteBookingHelperConfirmed: BookingView = {
  id: 'bkg_computer',
  task: {
    id: remoteComputerPublicTask.id,
    title: remoteComputerPublicTask.title,
    categorySlug: remoteComputerPublicTask.categorySlug,
    schedule: remoteComputerPublicTask.schedule,
  },
  status: 'confirmed',
  viewerRole: 'helper',
  poster: ruth,
  helper: lee,
  location: remoteComputerPublicTask.location,
  addressVisibility: 'not_applicable',
  terms: {
    version: 1,
    pricing: { type: 'fixed', priceCents: 4000 },
    breakdown: remoteComputerBreakdown,
    scopeText: 'New Windows laptop. I need my photos moved from the old one and email set up. Happy to share my screen.',
    start: '2026-11-23T16:00:00.000Z',
  },
  deadlines: {},
  timeline: [
    { id: 'evt_r1', at: '2026-11-16T17:30:00.000Z', actor: 'poster', actorName: 'Ruth A.', type: 'task_posted' },
    { id: 'evt_r2', at: '2026-11-18T16:00:00.000Z', actor: 'poster', actorName: 'Ruth A.', type: 'booked' },
  ],
  actions: [action('submit_completion', 'primary'), action('message'), action('add_to_calendar')],
};

const rowOf = (view: BookingView, amountCents: number, needsAction = false): BookingListRow => ({
  id: view.id,
  title: view.task.title,
  categorySlug: view.task.categorySlug,
  status: view.status,
  ...(view.cancelReason ? { cancelReason: view.cancelReason } : {}),
  viewerRole: view.viewerRole,
  otherParty: view.viewerRole === 'poster' ? view.helper : view.poster,
  start: view.terms.start,
  location: view.location,
  amountCents,
  needsAction,
});

/** Maya's earlier yard booking with Sam (Oct 2026): $90 + $9.00. */
const mayaYardRow: BookingListRow = {
  id: 'bkg_yard_oct',
  title: 'Rake the backyard and bag the leaves',
  categorySlug: 'yard-cleanup',
  status: 'completed',
  viewerRole: 'poster',
  otherParty: sam,
  start: '2026-10-24T14:00:00.000Z',
  location: muellerArea,
  amountCents: 9900,
  needsAction: false,
};

/** Maya: the desk is coming up; the yard is done. */
export const mayaBookingsPageData: BookingsPageData = {
  needsAction: [],
  upcoming: [rowOf(deskBookingPosterConfirmed, 6600)],
  past: [mayaYardRow],
};

/** Maya after Jordan submitted the work: approving is waiting on her. */
export const mayaBookingsNeedsActionData: BookingsPageData = {
  needsAction: [rowOf(deskBookingPosterCompletionSubmitted, 6600, true)],
  upcoming: [rowOf(deskBookingPosterCompletionSubmitted, 6600, true)],
  past: [mayaYardRow],
};

/** Jordan: the desk (Maya) and the move (Chris), as earnings; an older booking Jordan canceled. */
export const jordanBookingsPageData: BookingsPageData = {
  needsAction: [],
  upcoming: [rowOf(deskBookingHelperConfirmed, 5400), rowOf({ ...movingBookingPosterConfirmed, viewerRole: 'helper' }, 12600)],
  past: [rowOf({ ...deskBookingPosterCanceledByHelper, viewerRole: 'helper', id: 'bkg_old' }, 0)],
};

export const bookingsEmptyData: BookingsPageData = { needsAction: [], upcoming: [], past: [] };

/** Fake handlers: `pay` goes to the confirmation page, `message` to the inbox; everything else updates. */
export const fakeBookingHubHandlers: BookingHubHandlers = {
  onAction: ({ action: id }) =>
    wait(
      id === 'pay'
        ? { ok: true, code: 'updated', redirectTo: routes.app.confirmOffer('tsk_desk', 'off_jordan') }
        : id === 'message'
          ? { ok: true, code: 'updated', redirectTo: routes.app.messages() }
          : { ok: true, code: 'updated' },
    ),
};
