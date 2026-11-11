'use server';

import { refresh } from 'next/cache';
import type { AcceptChangeInput, ActionResult, ChangeQuoteResult, PaymentAttemptResult, ProposeChangeInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { acceptChange, declineChange, finishChangeVerification, payChangeDifference, proposeChange, quoteChange, withdrawChange } from './changes';
import { bookingDeps } from './server';

/** Server Actions behind the change request pages (src/contracts/changes.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

export async function quoteChangeAction(bookingId: string, input: ProposeChangeInput): Promise<ChangeQuoteResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return quoteChange(db, userId, String(bookingId), input, new Date());
}

export async function proposeChangeAction(bookingId: string, input: ProposeChangeInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return proposeChange(db, userId, String(bookingId), input, new Date());
}

export async function acceptChangeAction(bookingId: string, changeId: string, input: AcceptChangeInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await acceptChange(deps, userId, String(bookingId), String(changeId), input, new Date()));
}

export async function payChangeDifferenceAction(bookingId: string, changeId: string, input: AcceptChangeInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await payChangeDifference(deps, userId, String(bookingId), String(changeId), input, new Date()));
}

export async function finishChangeVerificationAction(bookingId: string, changeId: string, input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const outcome = input.outcome === 'approved' ? 'approved' : 'failed';
  return refreshed(await finishChangeVerification(deps, userId, String(bookingId), String(changeId), String(input.paymentId), outcome, new Date()));
}

export async function declineChangeAction(bookingId: string, changeId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await declineChange(db, userId, String(bookingId), String(changeId), new Date()));
}

export async function withdrawChangeAction(bookingId: string, changeId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await withdrawChange(db, userId, String(bookingId), String(changeId), new Date()));
}
