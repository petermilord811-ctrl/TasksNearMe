'use server';

import type { ActionResult, WaitlistInput } from '@/contracts';
import { waitlistInputSchema } from '@/contracts';
import { clientIp } from '@/modules/accounts/sign-in/server';
import { rateLimited, validationFailed } from '@/platform/actions/results';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { joinWaitlist } from './waitlist';

/** `/waitlist` form (WaitlistHandlers.onJoin). */
export async function joinWaitlistAction(input: WaitlistInput): Promise<ActionResult> {
  const parsed = waitlistInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const ip = await clientIp();
  if (ip) {
    const limited = await consumeRateLimit(db, `waitlist:ip:${ip}`, { limit: 5, windowSeconds: 60 * 60 });
    if (!limited.ok) return rateLimited(limited.retryAt);
  }
  await joinWaitlist(db, parsed.data);
  return { ok: true, code: 'submitted' };
}
