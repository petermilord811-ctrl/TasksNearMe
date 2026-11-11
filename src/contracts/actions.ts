import type { ISODateTime } from './common';

/**
 * Which buttons a screen shows is decided by the app (pure domain functions), never by the UI.
 * The UI renders ActionDescriptor[] and reports clicks through handlers it receives as props.
 */

export type ActionKind = 'primary' | 'secondary' | 'destructive';

/** Why an action is visible but disabled. The UI maps codes to copy. */
export const DISABLED_REASON_CODES = [
  /** Becomes available at `at` (e.g. reporting a no-show 30 minutes after the start). */
  'available_at',
  /** Another change request is already open. */
  'open_change_exists',
  /** A deadline (`at`) has passed. */
  'deadline_passed',
  /** The helper hasn't finished setup (ID, payouts, background check). */
  'not_bookable',
  /** The category needs a background check the helper doesn't have. */
  'needs_background_check',
  /** Already done (e.g. already reviewed). */
  'already_done',
  /** The viewer's role doesn't allow it (staff limits, ownership). */
  'not_allowed',
] as const;
export type DisabledReasonCode = (typeof DISABLED_REASON_CODES)[number];

export interface DisabledReason {
  code: DisabledReasonCode;
  /** For `available_at` and `deadline_passed`. */
  at?: ISODateTime;
}

export interface ActionDescriptor<TId extends string = string> {
  id: TId;
  kind: ActionKind;
  enabled: boolean;
  disabledReason?: DisabledReason;
  /** The UI must ask for confirmation (alert dialog) before calling the handler. */
  confirm?: boolean;
}

export const ACTION_SUCCESS_CODES = [
  'saved',
  'sent',
  'booked',
  'paid',
  'approved',
  'canceled',
  'submitted',
  'redeemed',
  'updated',
] as const;
export type ActionSuccessCode = (typeof ACTION_SUCCESS_CODES)[number];

export const ACTION_ERROR_CODES = [
  'validation_failed',
  'payment_declined',
  'insufficient_funds',
  'requires_bank_verification',
  'version_conflict',
  'not_allowed',
  'not_found',
  'expired',
  'rate_limited',
  'unknown',
] as const;
export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

/** What every mutation handler resolves to. The UI maps codes to toasts or inline messages. */
export type ActionResult =
  | { ok: true; code: ActionSuccessCode; redirectTo?: string }
  | { ok: false; code: ActionErrorCode; fieldErrors?: Record<string, string[]> };

/**
 * A mutation the UI can call. In the app these are Server Actions; in previews and tests they are
 * plain async functions. UI code must treat them as slow, possibly failing calls (pending states).
 */
export type ActionHandler<TInput = void> = (input: TInput) => Promise<ActionResult>;
