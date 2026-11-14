import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { BotCheckConfig, BotCheckInput } from './bot-check';
import { emailField } from './forms';

/**
 * Support for people who aren't signed in (completion plan 5.22): `routes.helpContact()`, a form on the help
 * center for someone who lost access to their email or account, or has no account. It opens a support case
 * keyed by the email address typed, which proves nothing: staff reply to it by email and never treat it as
 * the account's owner. Signed-in people use `routes.app.support()`.
 */

const code = (value: FieldErrorCode) => value;

/** What a visitor can ask about. `account_access` ("I can't get into my account") is shown to staff apart. */
export const PUBLIC_SUPPORT_TOPICS = ['account_access', 'payment', 'safety', 'other'] as const;
export type PublicSupportTopic = (typeof PUBLIC_SUPPORT_TOPICS)[number];

export const publicSupportInputSchema = z.object({
  email: emailField,
  topic: z.enum(PUBLIC_SUPPORT_TOPICS, code('required')),
  message: z.string(code('required')).trim().min(20, code('too_short')).max(2000, code('too_long')),
});
export type PublicSupportInput = z.input<typeof publicSupportInputSchema> & BotCheckInput;

/** `routes.helpContact()`: the form and its bot check (absent when none is set up). */
export interface PublicSupportPageData {
  botCheck?: BotCheckConfig;
}

/**
 * `onSubmit`: ok `submitted` (always the same answer, whether or not the address has an account; a
 * confirmation email goes to it). Errors: `validation_failed` (a field, or `fieldErrors.botCheck`),
 * `rate_limited` (with `retryAt`), `unknown`.
 */
export interface PublicSupportHandlers {
  onSubmit: ActionHandler<PublicSupportInput>;
}
