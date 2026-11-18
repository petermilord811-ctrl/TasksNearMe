'use server';

import { refresh } from 'next/cache';
import type { ActionResult, PlanCheckoutInput } from '@/contracts';
import { createBillingProvider } from '@/integrations/billing';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { rateLimited } from '@/platform/actions/results';
import { consumeRateLimit } from '@/platform/rate-limit';
import { openPortal, startCheckout } from './service';

/** Server Actions behind `/app/plan` (src/contracts/billing.ts, completion plan 9.13). */

/** Each opens a Stripe page: plenty for a person, little for a script (aa's sweep #9; Stripe's limit is shared with payments). */
const BILLING_RULE = { limit: 10, windowSeconds: 10 * 60 };

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Subscribe: Stripe Checkout's URL, or (the stand-in) the plan at once and back to the page. */
export async function subscribeToPlanAction(input: PlanCheckoutInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `billing:checkout:${userId}`, BILLING_RULE, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  const result = await startCheckout(db, createBillingProvider(), userId, input, now);
  if (result.ok) refresh();
  return result;
}

/** Manage or cancel: Stripe's customer portal (the stand-in cancels or keeps the plans and comes back). */
export async function managePlanAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const now = await requestNow();
  const limited = await consumeRateLimit(db, `billing:portal:${userId}`, BILLING_RULE, now);
  if (!limited.ok) return rateLimited(limited.retryAt);
  const result = await openPortal(db, createBillingProvider(), userId, now);
  if (result.ok) refresh();
  return result;
}
