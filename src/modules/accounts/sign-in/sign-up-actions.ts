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

/** "Create account": the bot check, then the details are kept and a code is emailed, as on `/sign-in`. */
export async function startSignUp(rawNext: string, input: SignUpInput & BotCheckInput): Promise<ActionResult> {
  const parsed = signUpInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const refused = await checkBot('sign_up', input?.botCheck);
  if (refused) return refused;

  const { email, firstName, lastName, intent } = parsed.data;
  const next = destinationAfterSignUp(intent, safeNextPath(rawNext));
  await writePendingSignUp({ intent, details: { email, firstName, lastName, agreedAt: (await requestNow()).getTime() } });
  const sent = await requestEmailCode(next, { email });
  // The same page, now bound to where they go after: it shows the code step.
  return sent.ok ? { ...sent, redirectTo: routes.signUp(next) } : sent;
}

/** "Continue with Google / Microsoft" on `/sign-up`: what they're here for is kept for after the provider. */
export async function signUpWith(rawNext: string, input: SignUpSocialInput): Promise<ActionResult> {
  const parsed = signUpSocialInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { provider, intent } = parsed.data;
  await writePendingSignUp({ intent });
  return continueWith(destinationAfterSignUp(intent, safeNextPath(rawNext)), { provider });
}
