'use server';

import type { ActionResult, WaitlistInput } from '@/contracts';
import { localeOrDefault, waitlistInputSchema } from '@/contracts';
import { limitAddress } from '@/modules/accounts/sign-in/server';
import { rateLimited, validationFailed } from '@/platform/actions/results';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { updateTag } from 'next/cache';
import { joinWaitlist, WAITLIST_TAG } from './waitlist';
import { setWaitlistEmailsByToken } from './waitlist-unsubscribe';

/**
 * `/waitlist` form (WaitlistHandlers.onJoin), bound to the page's language by the page: the email telling them their
 * city opened goes out in it (completion plan 8.3).
 */
export async function joinWaitlistAction(locale: string, input: WaitlistInput): Promise<ActionResult> {
  const parsed = waitlistInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ip = await limitAddress();
  if (ip) {
    const limited = await consumeRateLimit(db, `waitlist:ip:${ip}`, { limit: 5, windowSeconds: 60 * 60 });
    if (!limited.ok) return rateLimited(limited.retryAt);
  }
  await joinWaitlist(db, { ...parsed.data, locale: localeOrDefault(locale) });
  // The waitlist page's cities and counts include this entry.
  updateTag(WAITLIST_TAG);
  return { ok: true, code: 'submitted' };
}

/** WaitlistUnsubscribeHandlers, each bound to the link's token by the page. No sign-in: the token is signed. */
const UNSUBSCRIBE_RULE = { limit: 20, windowSeconds: 60 * 60 };

async function setWaitlistEmails(token: string, enabled: boolean): Promise<ActionResult> {
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `waitlist-unsubscribe:${String(token).slice(0, 80)}`, UNSUBSCRIBE_RULE, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  return setWaitlistEmailsByToken(db, token, enabled, now);
}

export async function unsubscribeWaitlistByLinkAction(token: string): Promise<ActionResult> {
  return setWaitlistEmails(token, false);
}

export async function resubscribeWaitlistByLinkAction(token: string): Promise<ActionResult> {
  return setWaitlistEmails(token, true);
}
