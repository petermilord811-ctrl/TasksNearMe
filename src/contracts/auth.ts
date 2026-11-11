import { z } from 'zod';
import type { ActionHandler } from './actions';
import type { ISODateTime } from './common';
import { emailField, mustAcceptField, oneTimeCodeField, personNameField, usPhoneField } from './forms';

/**
 * Sign-in and sign-up are one flow on `/sign-in` (blueprint 02 §1): email → code → (new accounts)
 * name and age → (when the destination needs it) phone → phone code. The app decides the step
 * from the session and the pending codes; the UI renders `data.step` and never keeps its own step.
 */
export const SIGN_IN_STEPS = ['email', 'email_code', 'profile', 'phone', 'phone_code'] as const;
export type SignInStep = (typeof SIGN_IN_STEPS)[number];

/** Why we ask for a phone number. Posting, offering, and booking need a verified phone. */
export const PHONE_REASONS = ['post', 'offer', 'book', 'account'] as const;
export type PhoneReason = (typeof PHONE_REASONS)[number];

export interface SignInPageData {
  step: SignInStep;
  /** The same-site path the flow ends at (already validated by the app). */
  next: string;
  /** `email_code`: the address the code went to. It is the person's own, so show it in full. */
  email?: string;
  /** `phone`, `phone_code`: why we ask. */
  phoneReason?: PhoneReason;
  /** `phone_code`: the number the code went to, masked, e.g. "(512) •••-••67". */
  maskedPhone?: string;
  /** `email_code`, `phone_code`: how long a code works ("The code works for 10 minutes."). */
  codeLifetimeMinutes?: number;
  /**
   * `email_code`, `phone_code`: "Send a new code" is disabled until this time (count down with the
   * device clock). Absent: available now.
   */
  resendAvailableAt?: ISODateTime;
  /** `profile`: names already on the account, e.g. from an earlier attempt. */
  profileDefaults?: { firstName: string; lastName: string };
}

export const emailInputSchema = z.object({ email: emailField });
export type EmailInput = z.input<typeof emailInputSchema>;

export const oneTimeCodeInputSchema = z.object({ code: oneTimeCodeField });
export type OneTimeCodeInput = z.input<typeof oneTimeCodeInputSchema>;

/** First and last name (the last name stays private; others see "Maya R."), 18+ and terms. */
export const profileInputSchema = z.object({
  firstName: personNameField(40),
  lastName: personNameField(60),
  adultAttested: mustAcceptField,
  termsAccepted: mustAcceptField,
});
export type ProfileInput = z.input<typeof profileInputSchema>;

export const phoneInputSchema = z.object({ phone: usPhoneField });
export type PhoneInput = z.input<typeof phoneInputSchema>;

/**
 * Every handler resolves to an ActionResult. On success the app either refreshes `data` (the next
 * step) or returns `redirectTo` when the flow is done (navigate there with `router.replace`).
 *
 * Results to handle:
 * - `validation_failed` + `fieldErrors` (`email`, `code`, `firstName`, `lastName`, `adultAttested`,
 *   `termsAccepted`, `phone`): show on the field. For codes: `incorrect` ("That code isn't right").
 * - `expired` (+ `fieldErrors.code: ['expired']`): the code expired; offer "Send a new code".
 * - `rate_limited` + `retryAt`: too many tries; show the time it's allowed again.
 * - `not_allowed`: this account can't sign in; point to the help center.
 */
export interface SignInHandlers {
  /** `email` step. ok `sent`. */
  onRequestEmailCode: ActionHandler<EmailInput>;
  /** `email_code` step. */
  onVerifyEmailCode: ActionHandler<OneTimeCodeInput>;
  /** ok `sent`. */
  onResendEmailCode: ActionHandler;
  /** "Use a different email": back to the `email` step. */
  onChangeEmail: ActionHandler;
  /** `profile` step. ok `saved`. */
  onSaveProfile: ActionHandler<ProfileInput>;
  /** `phone` step. ok `sent`. `fieldErrors.phone`: `invalid`, `not_supported`, `in_use`. */
  onSendPhoneCode: ActionHandler<PhoneInput>;
  /** `phone_code` step. After 3 wrong codes: `rate_limited` with `retryAt` (10 minutes). */
  onVerifyPhoneCode: ActionHandler<OneTimeCodeInput>;
  onResendPhoneCode: ActionHandler;
  /** "Use a different number": back to the `phone` step. */
  onChangePhone: ActionHandler;
}
