/**
 * Bot checks on abuse-prone forms (blueprint 07 §2 and §8, 06 §4): asking for a sign-in code, finishing
 * sign-up, and posting a task. The page says which check runs; the form sends the widget's answer as
 * `botCheck` with its input. A check the server turns down comes back as `validation_failed` with
 * `fieldErrors.botCheck`: `required` (no answer yet), `invalid` (try again), `expired` (the answer timed out or
 * was used: the widget gets a new one).
 */

/** Which form the check ran on (Cloudflare's `action`; letters, digits and `_` only). */
export const BOT_CHECK_ACTIONS = ['sign_in', 'sign_up', 'post_task'] as const;
export type BotCheckAction = (typeof BOT_CHECK_ACTIONS)[number];

/**
 * - `turnstile`: Cloudflare Turnstile's widget with this site key (it asks for a click only when unsure).
 * - `stand_in`: development and tests. Nothing shows, and the answer is `BOT_CHECK_STAND_IN_TOKEN`.
 * Absent on a page: no check is set up (the server decides what that means).
 */
export type BotCheckConfig = { provider: 'turnstile'; siteKey: string } | { provider: 'stand_in' };

/** The stand-in's answer. Any other answer fails the stand-in's check, so previews and tests can show the error. */
export const BOT_CHECK_STAND_IN_TOKEN = 'stand-in:pass';

/** Sent with a form's input (never part of its zod schema, so the form's own validation ignores it). */
export interface BotCheckInput {
  botCheck?: string;
}
