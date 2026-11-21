'use server';

import type { ActionResult, SparkPack } from '@/contracts';
import { createBillingProvider } from '@/integrations/billing';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { rateLimited } from '@/platform/actions/results';
import { consumeRateLimit } from '@/platform/rate-limit';
import { buySparks } from './service';

/** Server Actions behind `/app/sparks` (src/contracts/sparks.ts, 2026-11-21). */

/** Each opens a Stripe page, like a plan's checkout (billing/actions.ts). */
const CHECKOUT_RULE = { limit: 10, windowSeconds: 10 * 60 };

/** Buy a pack: Stripe Checkout's URL, or (the stand-in) the pack counted at once and back to the page. */
export async function buySparksAction(input: { pack: SparkPack }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `sparks:checkout:${viewer.user.id}`, CHECKOUT_RULE, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  return buySparks(db, createBillingProvider(), viewer.user.id, input, now);
}
