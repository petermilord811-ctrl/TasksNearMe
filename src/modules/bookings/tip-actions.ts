'use server';

import { refresh } from 'next/cache';
import type { PaymentAttemptResult, TipInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { bookingDeps } from './server';
import { finishTipVerification, tipBooking } from './tips';

/** Server Actions behind the booking page's tip card (BookingTipHandlers), each bound to the booking by the page. */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

export async function tipAction(bookingId: string, input: TipInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await tipBooking(deps, userId, String(bookingId), input, await requestNow()));
}

export async function finishTipVerificationAction(bookingId: string, input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const outcome = input.outcome === 'approved' ? 'approved' : 'failed';
  return refreshed(await finishTipVerification(deps, userId, String(bookingId), String(input.paymentId), outcome, await requestNow()));
}
