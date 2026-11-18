import { z } from 'zod';
import type { ActionHandler, ActionResult } from './actions';
import type { RedeemInviteHandler, SignInInvite } from './beta';
import type { BotCheckConfig, BotCheckInput } from './bot-check';
import type { ISODateTime } from './common';
import { emailField, mustAcceptField, oneTimeCodeField, personNameField, usPhoneField } from './forms';

/**
 * Sign-in and sign-up are one flow on `/sign-in` (blueprint 02 §1): email → code → (new accounts)
 * name and age → (when the destination needs it) phone → phone code. The app decides the step
 * from the session and the pending codes; the UI renders `data.step` and never keeps its own step.
 * During a private beta, a new account that has no invite yet gets `invite_code` before the name and age.
 *
 * `/sign-up` (completion plan 9.6) is the same flow with its own first step, `sign_up`: name, email, what the person
 * is here for, 18+ and the terms, or Google and Microsoft. What it gathers is kept until the email code is right, then
 * saved at once, so the `profile` step doesn't ask again (it still comes after Google or Microsoft, for the 18+ and the
 * terms, and after an invite). `/sign-in` never shows `sign_up`.
 */
export const SIGN_IN_STEPS = ['sign_up', 'email', 'email_code', 'invite_code', 'profile', 'phone', 'phone_code'] as const;
export type SignInStep = (typeof SIGN_IN_STEPS)[number];

/** Why we ask for a phone number. Posting, offering, and booking need a verified phone. */
export const PHONE_REASONS = ['post', 'offer', 'book', 'account'] as const;
export type PhoneReason = (typeof PHONE_REASONS)[number];

/**
 * Other ways to sign in besides the email code: a Google account, or a Microsoft account (Outlook.com,
 * Hotmail and Live addresses, and work or school accounts). The steps after it are the same: name and age
 * for a new account, then the phone when the destination needs it.
 */
export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/**
 * Why a sign-in with Google or Microsoft came back without signing in (shown on the `email` step):
 * - `cancelled`: the person stopped on the provider's page.
 * - `email_unconfirmed`: the provider didn't confirm the account's email address (some work and school
 *   accounts). Use an email code instead.
 * - `use_email_code`: an account with this email already exists and can't be joined automatically. Sign in
 *   with an email code, then connect the provider from the account page.
 * - `not_allowed`: this account can't sign in (suspended or closed). Point to the help center.
 * - `failed`: anything else. Try again, or use an email code.
 */
export const SOCIAL_SIGN_IN_ERRORS = ['cancelled', 'email_unconfirmed', 'use_email_code', 'not_allowed', 'failed'] as const;
export type SocialSignInError = (typeof SOCIAL_SIGN_IN_ERRORS)[number];

export const socialSignInInputSchema = z.object({ provider: z.enum(SOCIAL_PROVIDERS) });
export type SocialSignInInput = z.input<typeof socialSignInInputSchema>;

/**
 * What a new person is here for (the `sign_up` step): getting help with tasks (they start as a client, in the app), or
 * helping out and earning (they start as a helper, in helper setup). Either can do both later.
 */
export const SIGN_UP_INTENTS = ['get_help', 'help_out'] as const;
export type SignUpIntent = (typeof SIGN_UP_INTENTS)[number];

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
  /** `profile`: names already on the account, e.g. from an earlier attempt or from Google or Microsoft. */
  profileDefaults?: { firstName: string; lastName: string };
  /** `email`: the other ways to sign in, in this order. Empty or absent: only the email code. */
  socialProviders?: SocialProvider[];
  /** `email`: a sign-in with Google or Microsoft that came back without signing in. */
  socialError?: { provider: SocialProvider; reason: SocialSignInError };
  /** `invite_code`: the market that's invite-only, and the code from an invite link the person opened. */
  invite?: SignInInvite;
  /**
   * `email` (action `sign_in`), `sign_up` and `profile` (action `sign_up`): the bot check to run before Continue
   * (contracts/bot-check.ts). Absent: none is set up.
   */
  botCheck?: BotCheckConfig;
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

/** The `sign_up` step: who they are, how to reach them, what they're here for, 18+ and terms. */
export const signUpInputSchema = z.object({
  firstName: personNameField(40),
  lastName: personNameField(60),
  email: emailField,
  intent: z.enum(SIGN_UP_INTENTS),
  adultAttested: mustAcceptField,
  termsAccepted: mustAcceptField,
});
export type SignUpInput = z.input<typeof signUpInputSchema>;

/** The `sign_up` step's Google and Microsoft buttons carry what the person chose they're here for. */
export const signUpSocialInputSchema = socialSignInInputSchema.extend({ intent: z.enum(SIGN_UP_INTENTS) });
export type SignUpSocialInput = z.input<typeof signUpSocialInputSchema>;

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
/** The browser's WebAuthn request (from the server, passed to the platform's passkey prompt as is). */
export type PasskeyOptionsResult = { ok: true; options: Record<string, unknown> } | Extract<ActionResult, { ok: false }>;

export interface SignInHandlers {
  /**
   * `email` step: "Sign in with a passkey" (shown when both are given and the browser has passkeys). The
   * options start the device's prompt; its answer goes to `onPasskeySignIn`, which signs in and continues like
   * the email code (ok `updated`, maybe with `redirectTo`). Errors: `not_allowed` (no account has this passkey,
   * or the account can't sign in), `unknown`.
   */
  onPasskeyOptions?: () => Promise<PasskeyOptionsResult>;
  onPasskeySignIn?: ActionHandler<{ response: Record<string, unknown> }>;
  /**
   * `sign_up` step (given on `/sign-up` only), with the bot check's answer: keeps the details and emails a code. ok
   * `sent` with `redirectTo`: the same page, now for where the person goes after (helper setup when they're here to
   * help); navigate with `router.replace`, and it shows the `email_code` step. Errors: `validation_failed` +
   * `fieldErrors` (`firstName`, `lastName`, `email`, `intent`, `adultAttested`, `termsAccepted`, `botCheck`),
   * `rate_limited` + `retryAt`, `not_allowed`.
   */
  onStartSignUp?: ActionHandler<SignUpInput & BotCheckInput>;
  /**
   * `sign_up` step: "Continue with Google / Microsoft", with what the person is here for. As `onContinueWith`: ok
   * `sent` with `redirectTo` the provider's page (a full page load).
   */
  onSignUpWith?: ActionHandler<SignUpSocialInput>;
  /** `email` step, with the bot check's answer. ok `sent`. `fieldErrors.botCheck`: the check was turned down. */
  onRequestEmailCode: ActionHandler<EmailInput & BotCheckInput>;
  /**
   * `email` step: "Continue with Google" or "Continue with Microsoft". ok `sent` with `redirectTo`: the
   * provider's sign-in page, on another site, so navigate with a full page load. Errors: `not_allowed`
   * (that provider isn't offered), `rate_limited` + `retryAt`. The provider sends the person back to
   * `/sign-in`, which shows the next step or `socialError`.
   */
  onContinueWith: ActionHandler<SocialSignInInput>;
  /** `email_code` step. */
  onVerifyEmailCode: ActionHandler<OneTimeCodeInput>;
  /** ok `sent`. */
  onResendEmailCode: ActionHandler;
  /** "Use a different email": back to the `email` step. */
  onChangeEmail: ActionHandler;
  /**
   * `invite_code` step: the invite (contracts/beta.ts). ok `redeemed`: the page shows the next step. Errors on
   * `fieldErrors.inviteCode`: `required`, `incorrect`, `expired`; `rate_limited` + `retryAt`.
   */
  onRedeemInvite: RedeemInviteHandler;
  /** `invite_code` step: "Use a different email" signs out and goes back to the `email` step. ok `updated`. */
  onSignOut: ActionHandler;
  /** `profile` step. ok `saved`. `not_allowed`: an invite is needed first (the page goes back to `invite_code`). */
  onSaveProfile: ActionHandler<ProfileInput & BotCheckInput>;
  /** `phone` step. ok `sent`. `fieldErrors.phone`: `invalid`, `not_supported`, `in_use`. */
  onSendPhoneCode: ActionHandler<PhoneInput>;
  /** `phone_code` step. After 3 wrong codes: `rate_limited` with `retryAt` (10 minutes). */
  onVerifyPhoneCode: ActionHandler<OneTimeCodeInput>;
  onResendPhoneCode: ActionHandler;
  /** "Use a different number": back to the `phone` step. */
  onChangePhone: ActionHandler;
}
