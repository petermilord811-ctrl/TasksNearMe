'use server';

import { refresh } from 'next/cache';
import type { ActionResult, AddCardInput } from '@/contracts';
import { routes } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
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
 * The payout dashboard. Development: the payout step of helper onboarding (status and setup); with
 * Stripe Connect, an Express Dashboard login link.
 */
export async function openPayoutDashboardAction(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return { ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding('payout') };
}
