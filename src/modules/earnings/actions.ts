'use server';

import { refresh } from 'next/cache';
import type { ActionResult, AddCardInput } from '@/contracts';
import { routes } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { eq } from 'drizzle-orm';
import { stripeConnectFromEnv } from '@/integrations/payments/stripe-connect';
import { payoutAccounts } from '@/modules/verification/schema';
import { requestInstantPayout } from './instant';
import { addCard, makeDefaultCard, removeCard } from './service';
import { requestNow } from '@/platform/clock';

/** Server Actions behind the money pages (src/contracts/earnings.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

export async function addCardAction(input: AddCardInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await addCard(db, userId, input, await requestNow()));
}

export async function removeCardAction(input: { methodId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await removeCard(db, userId, String(input.methodId), await requestNow()));
}

export async function makeDefaultCardAction(input: { methodId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await makeDefaultCard(db, userId, String(input.methodId)));
}

/**
 * The payout dashboard. With Stripe Connect and a finished account, a one-time Express Dashboard login link
 * (payouts, bank details, tax forms); otherwise the payout step of helper onboarding (status and setup).
 */
export async function openPayoutDashboardAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const connect = stripeConnectFromEnv();
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1);
  if (connect && account?.provider === 'stripe' && account.status === 'active') {
    return { ok: true, code: 'updated', redirectTo: await connect.dashboardLink(account.providerAccountId) };
  }
  return { ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding('payout') };
}

/** Cashes out what can be paid instantly now (src/modules/earnings/instant.ts). */
export async function instantPayoutAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await requestInstantPayout(db, stripeConnectFromEnv(), userId, await requestNow()));
}
