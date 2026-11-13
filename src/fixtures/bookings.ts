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
  BookingSheetHandlers,
  BookingTipHandlers,
  BookingTipView,
  BookingView,
  CancellationPreview,
  CompletionHandlers,
  CompletionPageData,
  CompletionRules,
  CompletionUnavailableReason,
  CompletionView,
  PaymentAttemptResult,
  PaymentPanelData,
  Photo,
  PhotoUploadResult,
  ProblemUnavailableReason,
  ReportProblemHandlers,
  ReportProblemPageData,
  SavedPaymentMethod,
  TimelineEvent,
} from '@/contracts';
import { DEV_TEST_CARDS, EVIDENCE_CHECKLISTS, routes } from '@/contracts';
import { crestviewArea, deskExactAddress, muellerArea } from './locations';
import { deskPublicTask, remoteComputerPublicTask } from './marketing';
import { movingPublicTask } from './helper-work';
import {
  deskBreakdown,
  deskSettledBreakdown,
  deskWithAllowanceFundedBreakdown,
  deskWithExpensesFinalBreakdown,
  movingFinalBreakdown,
  movingFundedBreakdown,
  remoteComputerBreakdown,
} from './money';
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
    if (payment.kind !== 'dev_card') return wait(booked);
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
  actions: [action('find_replacement', 'primary'), action('book_again', 'secondary'), action('message', 'secondary')],
};

/** Maya reported Jordan as a no-show 31 minutes after the start: Jordan can contest it for 24 h. */
export const deskBookingHelperNoShowReported: BookingView = {
  ...deskBookingPosterCanceledByHelper,
  viewerRole: 'helper',
  cancelReason: 'helper_no_show',
  exactAddress: undefined,
  addressVisibility: 'hidden_after_completion',
  payments: undefined,
  timeline: [
    ...deskTimelineCompleted.slice(0, 4),
    { id: 'evt_ns', at: '2026-11-21T17:01:00.000Z', actor: 'helper', actorName: 'Jordan T.', type: 'canceled' },
  ],
  actions: [action('contest_no_show', 'secondary'), action('message', 'secondary')],
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

const rowOf = (view: BookingView, amountCents: number, nextStep?: BookingListRow['nextStep']): BookingListRow => ({
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
  needsAction: nextStep !== undefined,
  ...(nextStep ? { nextStep } : {}),
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
  needsAction: [rowOf(deskBookingPosterCompletionSubmitted, 6600, { kind: 'review_work', dueAt: DESK_TIMES.approvalDue })],
  upcoming: [rowOf(deskBookingPosterCompletionSubmitted, 6600, { kind: 'review_work', dueAt: DESK_TIMES.approvalDue })],
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

// ---- Tips (UI-057) ------------------------------------------------------------------------------

/** When Maya tipped: a quarter of an hour after approving. */
export const DESK_TIP_AT = '2026-11-21T19:20:00.000Z';

/** Maya after approving: a tip for Jordan until Sat, Dec 5 (14 days): $6, $9 or $12 (10, 15 or 20% of $60), or her own. */
export const deskTipAvailable: Extract<BookingTipView, { state: 'available' }> = {
  state: 'available',
  presets: [{ percent: 10, amountCents: 600 }, { percent: 15, amountCents: 900 }, { percent: 20, amountCents: 1200 }],
  minCents: 100,
  maxCents: 20_000,
  availableUntil: new Date(Date.parse(DESK_TIMES.approved) + 14 * 86_400_000).toISOString(),
  payment: mayaPaymentPanel,
};

const deskTipEvent: TimelineEvent = { id: 'evt_tip_added', at: DESK_TIP_AT, actor: 'poster', actorName: maya.displayName, type: 'tip_added', params: { amountCents: 900 } };

/** Maya's booking page right after approving: the tip card. */
export const deskBookingPosterTipAvailable: BookingView = { ...deskBookingPosterCompleted, tip: deskTipAvailable };

/** Maya tipped $9 with her Visa: "You tipped", the tip in her payments and the timeline. */
export const deskBookingPosterTipped: BookingView = {
  ...deskBookingPosterCompleted,
  tip: { state: 'tipped', amountCents: 900, at: DESK_TIP_AT },
  payments: [...(deskBookingPosterCompleted.payments ?? []), { id: 'pay_desk_tip', kind: 'tip', amountCents: 900, status: 'succeeded', method: { brand: 'visa', last4: '1881' }, at: DESK_TIP_AT }],
  timeline: [...deskTimelineCompleted, deskTipEvent],
};

/** Jordan's side: "Tip: $9.00". */
export const deskBookingHelperTipped: BookingView = {
  ...deskBookingHelperCompleted,
  tip: { state: 'tipped', amountCents: 900, at: DESK_TIP_AT },
  timeline: [...deskTimelineCompleted, deskTipEvent],
};

/** Fake tip handlers: the tip goes through. */
export const fakeBookingTipHandlers: BookingTipHandlers = {
  onTip: () => wait({ ok: true, code: 'paid' }),
  onFinishTipVerification: () => wait({ ok: true, code: 'paid' }),
};

// ---- Completing the work and reporting a problem (UI-013) ---------------------------------------

const finishedDeskPhotos: Photo[] = [
  { id: 'ph_done_desk', src: '/samples/work-desk.svg', alt: 'The assembled desk against the wall', width: 800, height: 600 },
  { id: 'ph_done_drawers', src: '/samples/work-bookshelf.svg', alt: 'The drawer unit next to the desk', width: 800, height: 600 },
];
const anchorsReceipt: Photo = { id: 'ph_receipt', src: '/samples/receipt.svg', alt: 'Hardware store receipt for $8.00', width: 600, height: 800 };

const deskAllowance = { amountCents: 2000, description: 'Up to $20 for wall anchors' };
const deskAllowanceTerms: BookingTermsView = { ...deskTerms, breakdown: deskWithAllowanceFundedBreakdown, expenseAllowance: deskAllowance };
/** The move as booked, without an expense allowance (matches `movingFundedBreakdown`). */
const movingTerms: BookingTermsView = { ...movingBookingPosterConfirmed.terms, expenseAllowance: undefined };

const completionBooking = (view: BookingView): CompletionPageData['booking'] => ({
  id: view.id,
  task: view.task,
  poster: view.poster,
  terms: view.terms,
  location: view.location,
});

export const deskCompletionRules: CompletionRules = { photosMin: 1, photosMax: 8, noteRequired: false, noteMaxLength: 1000, maxPhotoMegabytes: 10, checklist: EVIDENCE_CHECKLISTS['furniture-assembly'] };

/** Jordan at the desk, checked in: at least one photo of the finished work. */
export const deskCompletionPageData: CompletionPageData = { booking: completionBooking(deskBookingHelperInProgress), rules: deskCompletionRules };

/** The desk with a $20 expense allowance: receipts up to $20 in total. */
export const deskAllowanceCompletionPageData: CompletionPageData = {
  booking: { ...completionBooking(deskBookingHelperInProgress), terms: deskAllowanceTerms },
  rules: { ...deskCompletionRules, expenses: { allowanceCents: deskAllowance.amountCents, description: deskAllowance.description, maxItems: 5 } },
};

/** The move, hourly: the hours worked (half hours, at most the 4 h cap); no photos needed. */
export const movingCompletionPageData: CompletionPageData = {
  booking: { ...completionBooking(movingBookingPosterConfirmed), terms: movingTerms },
  rules: { photosMin: 0, photosMax: 8, hours: { estimated: 3.5, cap: 4 }, noteRequired: false, noteMaxLength: 1000, maxPhotoMegabytes: 10, checklist: EVIDENCE_CHECKLISTS['moving-help'] },
};

/** Remote laptop help: a short summary instead of photos. */
export const remoteCompletionPageData: CompletionPageData = {
  booking: completionBooking(remoteBookingHelperConfirmed),
  rules: { photosMin: 0, photosMax: 8, noteRequired: true, noteMaxLength: 1000, maxPhotoMegabytes: 10, checklist: EVIDENCE_CHECKLISTS['computer-help'] },
};

/** One page per reason the form can't be used. */
export const completionUnavailableData: Record<CompletionUnavailableReason, CompletionPageData> = {
  already_submitted: { ...deskCompletionPageData, unavailable: 'already_submitted' },
  not_started: { ...deskCompletionPageData, unavailable: 'not_started' },
  closed: { ...deskCompletionPageData, unavailable: 'closed' },
};

/** What Jordan sent for the desk at 11:48 am. */
export const deskCompletionView: CompletionView = {
  submittedAt: DESK_TIMES.completionSubmitted,
  note: 'Desk assembled, leveled and wiped down. I took the packaging with me.',
  photos: finishedDeskPhotos,
  expenses: [],
  finalBreakdown: deskBreakdown,
  // A desk needs no anchoring, so Jordan left that one unticked.
  checklist: {
    categorySlug: 'furniture-assembly',
    items: [
      { key: 'all_parts_used', done: true },
      { key: 'level_and_stable', done: true },
      { key: 'anchored_if_asked', done: false },
      { key: 'packaging_cleared', done: true },
    ],
  },
};

/** With an $8 receipt against the $20 allowance: Maya gets $12.00 back; Jordan is reimbursed $8.00. */
export const deskWithExpensesCompletionView: CompletionView = {
  ...deskCompletionView,
  expenses: [{ id: 'exp_anchors', description: 'Wall anchors', amountCents: 800, receipt: anchorsReceipt }],
  finalBreakdown: deskWithExpensesFinalBreakdown,
};

/** The move: 3.5 of the 4 capped hours; Chris gets $19.25 back. */
export const movingCompletionView: CompletionView = {
  submittedAt: '2026-11-22T18:40:00.000Z',
  photos: [],
  hoursWorked: 3.5,
  hoursCap: 4,
  expenses: [],
  finalBreakdown: movingFinalBreakdown,
  checklist: { categorySlug: 'moving-help', items: [{ key: 'placed_where_asked', done: true }, { key: 'nothing_damaged', done: true }, { key: 'load_secured', done: true }] },
};

/** Maya's booking page after Jordan submitted: the work is shown. */
export const deskBookingPosterCompletionWithWork: BookingView = { ...deskBookingPosterCompletionSubmitted, completion: deskCompletionView };

/** The same with the receipt. */
export const deskBookingPosterCompletionWithExpenses: BookingView = {
  ...deskBookingPosterCompletionSubmitted,
  terms: deskAllowanceTerms,
  completion: deskWithExpensesCompletionView,
};

/** Chris after the move was submitted: 3.5 hours. */
export const movingBookingPosterCompletionHourly: BookingView = {
  ...movingBookingPosterConfirmed,
  terms: movingTerms,
  status: 'completion_submitted',
  checkIn: { arrivedAt: '2026-11-22T15:05:00.000Z' },
  deadlines: { approvalDueAt: '2026-11-25T18:40:00.000Z' },
  completion: movingCompletionView,
  actions: [action('approve', 'primary', { confirm: true }), action('report_problem'), action('message')],
};

/** Jordan's view of the submitted move. */
export const movingBookingHelperCompletionHourly: BookingView = {
  ...movingBookingPosterCompletionHourly,
  viewerRole: 'helper',
  payments: undefined,
  actions: [action('message')],
};

/** Maya reports a problem with the desk instead of approving. */
export const deskReportProblemPageData: ReportProblemPageData = {
  booking: {
    id: deskBookingPosterCompletionSubmitted.id,
    task: deskBookingPosterCompletionSubmitted.task,
    helper: deskBookingPosterCompletionSubmitted.helper,
    terms: deskBookingPosterCompletionSubmitted.terms,
  },
  completion: deskCompletionView,
  approvalDueAt: DESK_TIMES.approvalDue,
  maxPhotoMegabytes: 10,
};

/** One page per reason the problem form can't be used. */
export const reportProblemUnavailableData: Record<ProblemUnavailableReason, ReportProblemPageData> = {
  not_submitted: { ...deskReportProblemPageData, completion: undefined, approvalDueAt: undefined, unavailable: 'not_submitted' },
  window_passed: { ...deskReportProblemPageData, unavailable: 'window_passed' },
  closed: { ...deskReportProblemPageData, unavailable: 'closed' },
};

let uploadCount = 0;
const uploaded = (): PhotoUploadResult => {
  uploadCount += 1;
  return { ok: true, photo: { id: `ph_upload_${uploadCount}`, src: '/samples/work-desk.svg', alt: `Uploaded photo ${uploadCount}`, width: 800, height: 600 } };
};

/** Fake handlers: uploads succeed, the final quote follows the hours and expenses, submitting goes to the booking. */
export const fakeCompletionHandlers: CompletionHandlers = {
  onUploadPhoto: () => wait(uploaded()),
  onQuoteFinal: ({ hoursWorked, expensesCents }) =>
    wait(hoursWorked !== undefined ? movingFinalBreakdown : expensesCents > 0 ? deskWithExpensesFinalBreakdown : deskBreakdown),
  onSubmit: () => wait({ ok: true, code: 'submitted', redirectTo: routes.app.booking('bkg_desk') }),
};

export const fakeReportProblemHandlers: ReportProblemHandlers = {
  onUploadPhoto: () => wait(uploaded()),
  onSubmit: () => wait({ ok: true, code: 'submitted', redirectTo: routes.app.booking('bkg_desk') }),
};

// ---- Booking sheets (UI-012) ----------------------------------------------------------------------
// The desk starts Sat 10:30 am; free cancellation until Fri 10:30 am (blueprint 04 §6).

const deskFreeUntil = '2026-11-20T16:30:00.000Z';

/** Maya cancels on Thursday: everything back. */
export const deskCancelPreviewPosterEarly: CancellationPreview = {
  by: 'poster',
  late: false,
  freeUntil: deskFreeUntil,
  posterRefundCents: 6600,
  helperCompensationCents: 0,
  helperStrike: false,
};

/** Maya cancels on Friday evening: $54.00 back; Jordan receives $12.00. */
export const deskCancelPreviewPosterLate: CancellationPreview = { ...deskCancelPreviewPosterEarly, late: true, posterRefundCents: 5400, helperCompensationCents: 1200 };

/** Jordan cancels early: Maya gets everything back; no strike. */
export const deskCancelPreviewHelperEarly: CancellationPreview = { ...deskCancelPreviewPosterEarly, by: 'helper' };

/** Jordan cancels late: Maya still gets everything back; it counts against Jordan. */
export const deskCancelPreviewHelperLate: CancellationPreview = { ...deskCancelPreviewHelperEarly, late: true, helperStrike: true };

/** Maya's booking page with cancel and safety. */
export const deskBookingPosterWithSheets: BookingView = {
  ...deskBookingPosterConfirmed,
  actions: [action('message'), action('add_to_calendar'), action('safety_report'), action('cancel', 'destructive')],
};

/** Jordan on the day: arrived, running late, cancel, safety. */
export const deskBookingHelperWithSheets: BookingView = {
  ...deskBookingHelperDayOf,
  actions: [action('arrived', 'primary'), action('running_late'), action('message'), action('safety_report'), action('cancel', 'destructive')],
};

/** Jordan said he's running 20 minutes late. */
export const deskBookingHelperRunningLate: BookingView = {
  ...deskBookingHelperWithSheets,
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', lateByMinutes: 20 },
  timeline: [...deskTimelineCompleted.slice(0, 5), { id: 'evt_late', at: '2026-11-21T16:25:00.000Z', actor: 'helper', actorName: 'Jordan T.', type: 'running_late', params: { minutes: 20 } }],
};

/** 11:00 am and no check-in: Maya may report a no-show. */
export const deskBookingPosterNoShowReportable: BookingView = {
  ...deskBookingPosterConfirmed,
  actions: [action('report_no_show', 'primary'), action('message'), action('safety_report')],
};

/** Before 11:00 am, the report waits. */
export const deskBookingPosterNoShowNotYet: BookingView = {
  ...deskBookingPosterConfirmed,
  actions: [
    action('report_no_show', 'secondary', { enabled: false, disabledReason: { code: 'available_at', at: DESK_TIMES.noShowReportable } }),
    action('message'),
    action('add_to_calendar'),
  ],
};

/** Jordan arrived 25 minutes ago and can't get in. */
export const deskBookingHelperCantAccessAvailable: BookingView = {
  ...deskBookingHelperInProgress,
  actions: [action('submit_completion', 'primary'), action('cant_access'), action('message'), action('safety_report')],
};

/** Jordan reported he can't get in at 10:50; Maya has until 11:20 to answer. */
export const deskBookingPosterCantAccessReported: BookingView = {
  ...deskBookingPosterConfirmed,
  status: 'in_progress',
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', arrivedAt: DESK_TIMES.arrived, cantAccessAt: '2026-11-21T16:50:00.000Z' },
  deadlines: { posterResponseDueAt: '2026-11-21T17:20:00.000Z' },
  timeline: [
    ...deskTimelineCompleted.slice(0, 6),
    { id: 'evt_ca', at: '2026-11-21T16:50:00.000Z', actor: 'helper', actorName: 'Jordan T.', type: 'cant_access' },
  ],
  actions: [action('im_here', 'primary'), action('message'), action('safety_report')],
};

/** Fake sheet handlers: the preview follows the viewer; everything else succeeds. */
export const fakeBookingSheetHandlers: BookingSheetHandlers = {
  onPreviewCancel: () => wait(deskCancelPreviewPosterLate),
  onCancel: () => wait({ ok: true, code: 'canceled' }),
  onRunningLate: () => wait({ ok: true, code: 'updated' }),
  onReportNoShow: () => wait({ ok: true, code: 'canceled' }),
  onCantAccess: () => wait({ ok: true, code: 'updated' }),
  onSafetyReport: () => wait({ ok: true, code: 'submitted' }),
};

// ---- Disputes on the booking page (UI-026) ------------------------------------------------------------

const deskDispute = { caseId: 'case_dispute', reason: 'not_done' as const, openedAt: '2026-11-22T15:00:00.000Z' };

/** Maya reported a problem; support is looking at it. She can open the case. */
export const deskBookingPosterDisputed: BookingView = {
  ...deskBookingPosterCompletionSubmitted,
  status: 'disputed',
  deadlines: {},
  dispute: { ...deskDispute, status: 'awaiting_support', canOpenCase: true },
  actions: [action('message')],
};

/** Jordan before support wrote to Jordan: there's a report, without its details. */
export const deskBookingHelperDisputed: BookingView = {
  ...deskBookingHelperInProgress,
  status: 'disputed',
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', arrivedAt: DESK_TIMES.arrived },
  deadlines: {},
  dispute: { ...deskDispute, status: 'awaiting_support', canOpenCase: false },
  actions: [action('message')],
};

/** Support asked Jordan a question: Jordan can open the case to answer. */
export const deskBookingHelperDisputedContacted: BookingView = {
  ...deskBookingHelperDisputed,
  dispute: { ...deskDispute, status: 'awaiting_helper', canOpenCase: true },
};

const settled = { type: 'settle' as const, summary: 'Settled at $45 because the drawers were left unfinished.', at: '2026-11-24T17:00:00.000Z' };

/** Settled at $45: Maya got $16.50 back (the refund shows in her payment history; the final numbers on the work). */
export const deskBookingPosterSettled: BookingView = {
  ...deskBookingPosterCompleted,
  completedVia: 'settlement',
  completion: { ...deskCompletionView, finalBreakdown: deskSettledBreakdown },
  payments: [deskCharge, { id: 'ref_desk_settle', kind: 'refund', amountCents: 1650, status: 'succeeded', at: '2026-11-24T17:00:00.000Z' }],
  dispute: { ...deskDispute, status: 'resolved', canOpenCase: true, resolution: { ...settled, refundCents: 1650 } },
};

/** Settled at $45: Jordan receives $40.50 (the final numbers on the work). */
export const deskBookingHelperSettled: BookingView = {
  ...deskBookingHelperCompleted,
  completedVia: 'settlement',
  completion: { ...deskCompletionView, finalBreakdown: deskSettledBreakdown },
  dispute: { ...deskDispute, status: 'resolved', canOpenCase: true, resolution: { ...settled, receivesCents: 4050 } },
};

// ---- Change requests on the booking page (UI-027) -----------------------------------------------------

/** Maya proposed adding the chair: the page points to it (she'd pay $22.00 more). */
export const deskBookingPosterWithOpenChange: BookingView = {
  ...deskBookingPosterConfirmed,
  openChange: { id: 'chg_desk_chair', status: 'proposed', fromMe: true, differenceCents: 2200 },
};

/** Jordan sees Maya's proposal waiting for an answer. */
export const deskBookingHelperWithOpenChange: BookingView = {
  ...deskBookingHelperConfirmed,
  openChange: { id: 'chg_desk_chair', status: 'proposed', fromMe: false },
};
