import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ActionResult, BotCheckAction, BotCheckConfig } from '@/contracts';
import { botCheckConfig, createBotChecker, TURNSTILE_STAND_IN_COOKIE } from '@/integrations/turnstile';
import { fieldError } from '@/platform/actions/results';
import { isLocalRequest } from '@/shared/local-request';
import { clientIp } from './sign-in/server';

/**
 * The bot check for this request (blueprint 07 §8, 06 §4; `src/integrations/turnstile`): what the page tells
 * the form's widget, and the server-side check of its answer. Used by asking for a sign-in code, finishing
 * sign-up and posting a task.
 */

/** The test browser's request for the stand-in, honored only on this machine (never through a public proxy). */
async function standInCookie(): Promise<string | undefined> {
  const requestHeaders = await headers();
  if (!isLocalRequest((name) => requestHeaders.get(name))) return undefined;
  return (await cookies()).get(TURNSTILE_STAND_IN_COOKIE)?.value;
}

/** For the page: Turnstile's site key, the stand-in, or nothing (production without keys). */
export async function botCheckForPage(): Promise<BotCheckConfig | undefined> {
  return botCheckConfig(await standInCookie());
}

/**
 * Checks the form's answer. Null when it passed; otherwise the result to return: `validation_failed` with
 * `fieldErrors.botCheck` (`required`, `invalid`, `expired`) the person can act on, or `unknown` when bot
 * checks aren't set up (production without keys), which nobody can fix from the form.
 */
export async function checkBot(action: BotCheckAction, token: unknown): Promise<ActionResult | null> {
  const checker = createBotChecker(await standInCookie());
  const result = await checker.verify({ token: typeof token === 'string' && token !== '' ? token : undefined, action, ip: await clientIp() });
  if (result.ok) return null;
  switch (result.reason) {
    case 'missing':
      return fieldError('botCheck', 'required');
    case 'expired':
      return fieldError('botCheck', 'expired');
    case 'invalid':
      return fieldError('botCheck', 'invalid');
    case 'unconfigured':
      return { ok: false, code: 'unknown' };
  }
}
