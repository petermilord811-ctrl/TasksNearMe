import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { Cents, ISODateTime } from './common';

/**
 * Taking back a helper's transfer (blueprint 08: finance only, reversals need a case link; completion plan
 * 5.13). On `/admin/bookings/[bookingId]`: each transfer made for the booking with what's already been taken
 * back, the reversals so far, and (for finance) a form that names the case, the amount and why.
 */

const code = (value: FieldErrorCode) => value;

export interface AdminTransferRow {
  earningsId: string;
  kind: 'earnings' | 'reimbursement' | 'cancellation_compensation' | 'tip';
  transferredCents: Cents;
  reversedCents: Cents;
  /** What can still be taken back. */
  reversibleCents: Cents;
  transferredAt?: ISODateTime;
}

export interface AdminReversalRow {
  id: string;
  earningsId: string;
  amountCents: Cents;
  caseId: string;
  reason: string;
  /** `failed`: Stripe couldn't take it back (the helper's balance was already paid out); recover it by hand. */
  status: 'succeeded' | 'failed';
  at: ISODateTime;
  byDisplayName: string;
}

export interface AdminBookingReversals {
  transfers: AdminTransferRow[];
  history: AdminReversalRow[];
  /** Finance only. */
  canReverse: boolean;
  /** The booking's cases, one of which every reversal names. */
  cases: { id: string; label: string }[];
}

export const transferReversalInputSchema = z.object({
  earningsId: z.string(code('required')).min(1, code('required')),
  amountCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')),
  caseId: z.string(code('required')).min(1, code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type TransferReversalInput = z.input<typeof transferReversalInputSchema>;

/**
 * ok `updated`. Errors: `validation_failed` (`amountCents`: `out_of_range` above what can still be taken back;
 * `caseId`: `invalid` for a case not on this booking), `not_allowed` (finance only), `insufficient_funds`
 * (Stripe couldn't take it back: recorded as failed, recover it by hand), `unknown`.
 */
export interface AdminReversalHandlers {
  onReverseTransfer: ActionHandler<TransferReversalInput>;
}
