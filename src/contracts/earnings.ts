import { z } from 'zod';
import type { ActionHandler, ActionResult, FieldErrorCode } from './actions';
import type { CategorySlug, Cents, ISODateTime } from './common';
import type { PriceBreakdown } from './money';
import { DEV_TEST_CARDS, type NewCardCollection, type PaymentMethodLabel, type SavedPaymentMethod } from './payments';
import type { PersonSummary } from './people';
import type { EarningsStatus, PaymentStatus, PayoutAccountStatus, PayoutStatus } from './status';

/**
 * Money pages (blueprint 04 §5–6, 02 J7): the client's receipts and saved cards (`/app/payments`), and
 * the helper's earnings and payouts (`/app/earnings`). Every amount is computed by the app.
 */

const code = (value: FieldErrorCode) => value;

// ---- The client: receipts and cards ----------------------------------------------------------------

/** One booking's money from the client's side. */
export interface ReceiptRow {
  bookingId: string;
  title: string;
  categorySlug: CategorySlug;
  helper: PersonSummary;
  /** When it was paid. */
  paidAt: ISODateTime;
  chargedCents: Cents;
  refundedCents: Cents;
  /** Charged − refunded. */
  netCents: Cents;
  /** The charge's state: `succeeded`, `partially_refunded`, or `refunded`. */
  status: PaymentStatus;
}

/** `/app/payments`: receipts (newest first) and saved cards. */
export interface PaymentsPageData {
  receipts: ReceiptRow[];
  methods: SavedPaymentMethod[];
  newCard: NewCardCollection;
}

/** A charge or refund on a receipt. */
export interface ReceiptLine {
  id: string;
  kind: 'charge' | 'refund';
  amountCents: Cents;
  /** Refunds: why (`cancellation`, `unused_cap`, `unused_allowance`, `change_decrease`, `dispute_settlement`, `goodwill`). */
  reason?: string;
  method?: PaymentMethodLabel;
  at: ISODateTime;
}

/** `/app/payments/[bookingId]`: a receipt (printable). */
export interface ReceiptPageData {
  receiptNumber: string;
  issuedAt: ISODateTime;
  booking: { id: string; title: string; categorySlug: CategorySlug; start: ISODateTime };
  helper: PersonSummary;
  /** Poster variant; the final numbers once the booking is completed. */
  breakdown: PriceBreakdown;
  lines: ReceiptLine[];
  netCents: Cents;
}

export const addCardInputSchema = z
  .object({
    /** A development test card. */
    card: z.enum(DEV_TEST_CARDS, code('required')).optional(),
    /** Stripe: the `pm_…` from Stripe's card field ('' until the card is complete). */
    paymentMethodId: z.string(code('required')).optional(),
    makeDefault: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethodId !== undefined) {
      if (!/^pm_[A-Za-z0-9_]{1,200}$/.test(value.paymentMethodId)) ctx.addIssue({ code: 'custom', path: ['paymentMethodId'], message: code('required') });
    } else if (!value.card) ctx.addIssue({ code: 'custom', path: ['card'], message: code('required') });
  });
export type AddCardInput = z.input<typeof addCardInputSchema>;

/**
 * Card handlers on `/app/payments`.
 * - `onAddCard`: ok `saved` (a development test card, or Stripe's card field). Errors: `validation_failed`,
 *   `payment_declined` (the test card declines), `rate_limited`, `unknown`.
 * - `onRemoveCard`: ok `updated`. Errors: `not_allowed` (the card pays an open booking or hold), `not_found`.
 * - `onMakeDefault`: ok `updated`.
 */
export interface PaymentMethodHandlers {
  onAddCard: ActionHandler<AddCardInput>;
  onRemoveCard: ActionHandler<{ methodId: string }>;
  onMakeDefault: ActionHandler<{ methodId: string }>;
}

// ---- The helper: earnings and payouts ---------------------------------------------------------------

export const EARNINGS_KINDS = ['earnings', 'reimbursement', 'cancellation_compensation'] as const;
export type EarningsKind = (typeof EARNINGS_KINDS)[number];

/** A transfer to the helper for one booking. */
export interface EarningsRowView {
  id: string;
  bookingId: string;
  title: string;
  client: PersonSummary;
  kind: EarningsKind;
  amountCents: Cents;
  status: EarningsStatus;
  /** `on_hold`: why (a reported problem, a payout account issue). */
  holdReason?: 'dispute' | 'payout_account';
  transferredAt?: ISODateTime;
  payout?: { id: string; arrivalDate: string; bankLast4: string; status: PayoutStatus };
}

/** `/app/earnings`. */
export interface EarningsPageData {
  totals: {
    /** Approved work not yet transferred, plus amounts on hold. */
    upcomingCents: Cents;
    /** Transferred, waiting for the bank payout. */
    onTheWayCents: Cents;
    /** Paid out this calendar year. */
    paidThisYearCents: Cents;
  };
  /** Newest first. */
  rows: EarningsRowView[];
  payoutAccount: {
    status: PayoutAccountStatus;
    bankLast4?: string;
    /** A payout failed: the helper must update their bank in the provider's dashboard. */
    actionNeeded: boolean;
  };
  /** The first payout usually arrives about 7 days after the first payment (blueprint 04 §5). */
  firstPayoutNotice: boolean;
}

/**
 * - `onOpenPayoutDashboard`: ok `updated` with `redirectTo` (the provider's payout dashboard; in development, the
 *   stand-in page).
 */
export interface EarningsHandlers {
  onOpenPayoutDashboard: () => Promise<ActionResult>;
}
