import type {
  BookingConfirmHandlers,
  BookingConfirmPageData,
  BookingUnavailableReason,
  PaymentAttemptResult,
  PaymentPanelData,
  SavedPaymentMethod,
} from '@/contracts';
import { DEV_TEST_CARDS, routes } from '@/contracts';
import { crestviewArea } from './locations';
import { deskPublicTask, remoteComputerPublicTask } from './marketing';
import { movingPublicTask } from './helper-work';
import { deskBreakdown, movingFundedBreakdown, remoteComputerBreakdown } from './money';
import { deskOfferJordan } from './offers';
import { jordan, lee } from './people';

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
