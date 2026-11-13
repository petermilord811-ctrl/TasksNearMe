import type {
  EarningsHandlers,
  EarningsPageData,
  EarningsRowView,
  PaymentMethodHandlers,
  PaymentsPageData,
  ReceiptPageData,
  ReceiptRow,
} from '@/contracts';
import { DEV_TEST_CARDS, routes } from '@/contracts';
import { mayaMastercard, mayaVisa } from './bookings';
import { deskBreakdown, deskWithExpensesFinalBreakdown, movingFinalBreakdown } from './money';
import { chris, jordan, maya, sam } from './people';
import { DESK_TIMES } from './timeline';

/**
 * Money pages (UI-016). The client is Maya; the helper is Jordan. "Now" is Mon, Nov 30, 2026: the desk
 * was approved Sat, Nov 21; the move on Sun, Nov 22.
 */

const person = (p: typeof maya | typeof jordan | typeof sam | typeof chris) => ({
  id: p.id,
  displayName: p.displayName,
  initials: p.initials,
  memberSince: p.memberSince,
  phoneVerified: p.phoneVerified,
});

const deskReceipt: ReceiptRow = {
  bookingId: 'bkg_desk',
  title: 'Assemble a desk (flat-pack, 1 item)',
  categorySlug: 'furniture-assembly',
  helper: person(jordan),
  paidAt: DESK_TIMES.booked,
  chargedCents: 6600,
  refundedCents: 0,
  netCents: 6600,
  status: 'succeeded',
};

/** The desk with a $20 allowance and an $8 receipt: $12.00 came back. */
const deskAllowanceReceipt: ReceiptRow = {
  ...deskReceipt,
  bookingId: 'bkg_desk_allowance',
  title: 'Assemble a desk and mount the shelf',
  chargedCents: 8600,
  refundedCents: 1200,
  netCents: 7400,
  status: 'partially_refunded',
};

/** October's yard work with Sam, canceled early: everything back. */
const yardRefundedReceipt: ReceiptRow = {
  bookingId: 'bkg_yard_oct',
  title: 'Rake the backyard and bag the leaves',
  categorySlug: 'yard-cleanup',
  helper: person(sam),
  paidAt: '2026-10-20T15:00:00.000Z',
  chargedCents: 9900,
  refundedCents: 9900,
  netCents: 0,
  status: 'refunded',
};

const devCards = { kind: 'dev', testCards: DEV_TEST_CARDS } as const;

export const mayaPaymentsPageData: PaymentsPageData = {
  receipts: [deskAllowanceReceipt, deskReceipt, yardRefundedReceipt],
  methods: [mayaVisa, mayaMastercard],
  newCard: devCards,
};

/** The desk after Maya tipped Jordan $9 (UI-057): its own line, in the net. */
export const mayaPaymentsWithTipData: PaymentsPageData = {
  ...mayaPaymentsPageData,
  receipts: [deskAllowanceReceipt, { ...deskReceipt, tipCents: 900, netCents: 7500 }, yardRefundedReceipt],
};

export const paymentsEmptyData: PaymentsPageData = { receipts: [], methods: [], newCard: devCards };

/** The desk receipt with the allowance refund. */
export const deskReceiptPageData: ReceiptPageData = {
  receiptNumber: 'TNM-2026-000142',
  issuedAt: DESK_TIMES.approved,
  booking: { id: 'bkg_desk_allowance', title: deskAllowanceReceipt.title, categorySlug: 'furniture-assembly', start: DESK_TIMES.agreedStart },
  helper: person(jordan),
  breakdown: deskWithExpensesFinalBreakdown,
  lines: [
    { id: 'pay_desk_allow', kind: 'charge', amountCents: 8600, method: { brand: 'visa', last4: '1881' }, at: DESK_TIMES.booked },
    { id: 'ref_desk_allow', kind: 'refund', amountCents: 1200, reason: 'unused_allowance', method: { brand: 'visa', last4: '1881' }, at: DESK_TIMES.approved },
  ],
  netCents: 7400,
};

/** A plain receipt: charged once, nothing back. */
export const deskSimpleReceiptPageData: ReceiptPageData = {
  ...deskReceiptPageData,
  receiptNumber: 'TNM-2026-000141',
  booking: { ...deskReceiptPageData.booking, id: 'bkg_desk', title: deskReceipt.title },
  breakdown: deskBreakdown,
  lines: [{ id: 'pay_desk', kind: 'charge', amountCents: 6600, method: { brand: 'visa', last4: '1881' }, at: DESK_TIMES.booked }],
  netCents: 6600,
};

/** The desk receipt with Maya's $9 tip after approval (UI-057). */
export const deskTipReceiptPageData: ReceiptPageData = {
  ...deskSimpleReceiptPageData,
  lines: [...deskSimpleReceiptPageData.lines, { id: 'pay_desk_tip', kind: 'tip', amountCents: 900, method: { brand: 'visa', last4: '1881' }, at: '2026-11-21T19:20:00.000Z' }],
  netCents: 7500,
};

const deskEarnings: EarningsRowView = {
  id: 'ern_desk',
  bookingId: 'bkg_desk',
  title: 'Assemble a desk (flat-pack, 1 item)',
  client: person(maya),
  kind: 'earnings',
  amountCents: 5400,
  status: 'paid_out',
  transferredAt: DESK_TIMES.approved,
  payout: { id: 'po_1123', arrivalDate: '2026-11-25', bankLast4: '6789', status: 'paid' },
};

const deskReimbursement: EarningsRowView = {
  ...deskEarnings,
  id: 'ern_desk_reimb',
  kind: 'reimbursement',
  amountCents: 800,
};

/** The move: approved Sunday, transferred, on its way to the bank. */
const movingEarnings: EarningsRowView = {
  id: 'ern_moving',
  bookingId: 'bkg_moving',
  title: 'Help loading a moving truck',
  client: person(chris),
  kind: 'earnings',
  amountCents: movingFinalBreakdown.helperEarningsCents,
  status: 'transferred',
  transferredAt: '2026-11-22T19:00:00.000Z',
  payout: { id: 'po_1127', arrivalDate: '2026-12-01', bankLast4: '6789', status: 'in_transit' },
};

/** A late cancellation: Jordan received $12.00. */
const lateCancellationEarnings: EarningsRowView = {
  id: 'ern_tv_comp',
  bookingId: 'bkg_tv_old',
  title: 'Anchor a tall bookshelf to the wall',
  client: person(chris),
  kind: 'cancellation_compensation',
  amountCents: 1200,
  status: 'scheduled',
};

/** A problem was reported: the earnings wait until support resolves it. */
const disputedEarnings: EarningsRowView = {
  id: 'ern_bookcase',
  bookingId: 'bkg_bookcase',
  title: 'Assemble a bookcase',
  client: { id: 'usr_ruth', displayName: 'Ruth A.', initials: 'RA', memberSince: '2026-11-02T15:00:00.000Z', phoneVerified: true },
  kind: 'earnings',
  amountCents: 6300,
  status: 'on_hold',
  holdReason: 'dispute',
};

export const jordanEarningsPageData: EarningsPageData = {
  totals: { upcomingCents: 7500, onTheWayCents: movingEarnings.amountCents, paidThisYearCents: 6200 },
  rows: [disputedEarnings, lateCancellationEarnings, movingEarnings, deskReimbursement, deskEarnings],
  payoutAccount: { status: 'active', bankLast4: '6789', actionNeeded: false },
  firstPayoutNotice: false,
};

/** Maya's $9 tip on the desk (UI-057): all of it Jordan's, transferred with the earnings. */
export const jordanEarningsWithTipData: EarningsPageData = {
  ...jordanEarningsPageData,
  rows: [...jordanEarningsPageData.rows.slice(0, 3), { ...deskEarnings, id: 'ern_desk_tip', kind: 'tip', amountCents: 900 }, ...jordanEarningsPageData.rows.slice(3)],
};

/** A payout failed: Jordan must update the bank account. */
export const jordanEarningsActionNeededData: EarningsPageData = {
  ...jordanEarningsPageData,
  rows: jordanEarningsPageData.rows.map((row) => (row.id === 'ern_moving' ? { ...row, payout: { ...row.payout!, status: 'failed' } } : row)),
  payoutAccount: { status: 'requirements_due', bankLast4: '6789', actionNeeded: true },
};

/** A new helper before the first payout. */
export const earningsFirstPayoutData: EarningsPageData = {
  totals: { upcomingCents: 5400, onTheWayCents: 0, paidThisYearCents: 0 },
  rows: [{ ...deskEarnings, status: 'scheduled', payout: undefined, transferredAt: undefined }],
  payoutAccount: { status: 'active', bankLast4: '6789', actionNeeded: false },
  firstPayoutNotice: true,
};

export const earningsEmptyData: EarningsPageData = {
  totals: { upcomingCents: 0, onTheWayCents: 0, paidThisYearCents: 0 },
  rows: [],
  payoutAccount: { status: 'active', bankLast4: '6789', actionNeeded: false },
  firstPayoutNotice: true,
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** Fake handlers: the test card `declined` declines; everything else succeeds. */
export const fakePaymentMethodHandlers: PaymentMethodHandlers = {
  onAddCard: ({ card }) => wait(card === 'declined' || card === 'insufficient_funds' ? { ok: false, code: 'payment_declined' } : { ok: true, code: 'saved' }),
  onRemoveCard: () => wait({ ok: true, code: 'updated' }),
  onMakeDefault: () => wait({ ok: true, code: 'updated' }),
};

export const fakeEarningsHandlers: EarningsHandlers = {
  onOpenPayoutDashboard: () => wait({ ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding('payout') }),
};
