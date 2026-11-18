'use server';

import type { ActionResult, BotCheckInput, SignUpInput, SignUpSocialInput } from '@/contracts';
import { routes, signUpInputSchema, signUpSocialInputSchema } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import { requestNow } from '@/platform/clock';
import { checkBot } from '../bot-check';
import { continueWith, requestEmailCode } from './actions';
import { destinationAfterSignUp } from './sign-up-domain';
import { writePendingSignUp } from './sign-up-pending';
import { safeNextPath } from './steps';

/**
 * Server Actions behind `/sign-up`'s first step (completion plan 9.6; src/contracts/auth.ts `onStartSignUp`,
 * `onSignUpWith`). Both keep what the person gave (sign-up-pending.ts) and hand over to sign-in's steps: the email code,
 * or Google and Microsoft. The rest of the flow is shared (actions.ts applies what was kept once the code is right).
 */

/** "Create account": the bot check, then a code is emailed, as on `/sign-in`, and the details are kept for it. */
export async function startSignUp(rawNext: string, input: SignUpInput & BotCheckInput): Promise<ActionResult> {
  const parsed = signUpInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const refused = await checkBot('sign_up', input?.botCheck);
  if (refused) return refused;

  const { email, firstName, lastName, intent } = parsed.data;
  const next = destinationAfterSignUp(intent, safeNextPath(rawNext));
  const agreedAt = (await requestNow()).getTime();
  const sent = await requestEmailCode(next, { email });
  if (!sent.ok) return sent;
  // Kept after requestEmailCode, which ends what an earlier start left in this browser (aa's sweep S8).
  await writePendingSignUp({ intent, details: { email, firstName, lastName, agreedAt } });
  // The same page, now bound to where they go after: it shows the code step.
  return { ...sent, redirectTo: routes.signUp(next) };
}

/**
 * "Continue with Google / Microsoft" on `/sign-up`: what they're here for waits for the account the provider brings
 * back, one that links it from now on (sign-up-domain.ts `signUpIntentApplies`).
 */
export async function signUpWith(rawNext: string, input: SignUpSocialInput): Promise<ActionResult> {
  const parsed = signUpSocialInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { provider, intent } = parsed.data;
  // The server's own clock, not the test clock (requestNow): Better Auth stamps the link with it.
  const at = Date.now();
  const started = await continueWith(destinationAfterSignUp(intent, safeNextPath(rawNext)), { provider });
  // Kept after continueWith, which ends what an earlier start left in this browser (aa's sweep S8).
  if (started.ok) await writePendingSignUp({ intent, via: { provider, at } });
  return started;
}
