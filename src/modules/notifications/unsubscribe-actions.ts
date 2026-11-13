'use server';

import type { ActionResult } from '@/contracts';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { setEmailsByToken } from './unsubscribe-service';

/** EmailUnsubscribeHandlers, each bound to the link's token by the page. No sign-in: the token is signed. */

const RULE = { limit: 20, windowSeconds: 60 * 60 };

async function set(token: string, enabled: boolean): Promise<ActionResult> {
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `unsubscribe:${String(token).slice(0, 80)}`, RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  return setEmailsByToken(db, token, enabled, now);
}

export async function unsubscribeByLinkAction(token: string): Promise<ActionResult> {
  return set(token, false);
}

export async function resubscribeByLinkAction(token: string): Promise<ActionResult> {
  return set(token, true);
}
