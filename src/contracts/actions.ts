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
  /** Waiting for the other person first (e.g. a helper re-confirming a stale offer). */
  'awaiting_other_party',
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
  /** A limit on the account was reached (e.g. 3 open tasks in the first week). */
  'limit_reached',
  /** The client has to verify their ID first (`routes.app.verifyIdentity()`; contracts/poster-identity.ts). */
  'identity_required',
  /**
   * New bookings and payments are paused in this market for a while (the outage switch, completion plan 5.15):
   * nothing was charged, and bookings people already have go ahead.
   */
  'paused',
  /**
   * Not yet: something it depends on is still running (completion plan 5.18: approving an ID waits for its
   * automatic reading, so a duplicate ID is found first). Try again in a few minutes.
   */
  'not_ready',
  'unknown',
] as const;
export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

/**
 * Why a form field is invalid. Contract zod schemas use these codes as their messages, and server
 * results return them in `fieldErrors`, so the UI maps one set of codes to copy (`forms.fieldErrors`).
 */
export const FIELD_ERROR_CODES = [
  'required',
  'invalid',
  'too_short',
  'too_long',
  /** A one-time code that doesn't match. */
  'incorrect',
  /** A one-time code that has expired; the person needs a new one. */
  'expired',
  /** A value we can't serve yet, e.g. a phone number outside the US. */
  'not_supported',
  /** Already used by another account (e.g. a phone number). */
  'in_use',
  /** The same as what's already there (e.g. changing your email to the one you have). */
  'unchanged',
  /** Text describing something on the prohibited-tasks list. */
  'prohibited',
  /** A phone number, an email or a link where it would be public (a task's title; sweep 2026-11-20, PT8). */
  'contact_details',
  /** A date or time outside what the policy allows (too soon, too far out, end before start). */
  'out_of_range',
  /** A checkbox that must be ticked (age, terms). */
  'must_accept',
  /** A place inside a city we already serve, given where another one was asked for (a helper's ZIP in their own market). */
  'in_market',
  /**
   * Held: the account's email, phone and ways to sign in can't change until our team has checked it (someone used
   * the "Not you?" link in a contact change notice, completion plan 5.23).
   */
  'held',
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

/** What every mutation handler resolves to. The UI maps codes to toasts or inline messages. */
export type ActionResult =
  | { ok: true; code: ActionSuccessCode; redirectTo?: string }
  | {
      ok: false;
      code: ActionErrorCode;
      /** Field name → error codes. Show them on the fields (first code wins). */
      fieldErrors?: Partial<Record<string, FieldErrorCode[]>>;
      /** For `rate_limited`: when trying again is allowed ("Try again after 3:40 pm"). */
      retryAt?: ISODateTime;
    };

/**
 * A mutation the UI can call. In the app these are Server Actions; in previews and tests they are
 * plain async functions. UI code must treat them as slow, possibly failing calls (pending states).
 */
export type ActionHandler<TInput = void> = (input: TInput) => Promise<ActionResult>;

/**
 * A read the UI triggers (search, quote, upload). Unlike ActionHandler it resolves with data.
 * In the app these are Server Actions; in previews and tests, plain async functions.
 */
export type QueryHandler<TInput, TOutput> = (input: TInput) => Promise<TOutput>;
