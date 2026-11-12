'use server';

import { refresh, updateTag } from 'next/cache';
import type { ConfirmBookingInput, PaymentAttemptResult } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { confirmBooking, finishBankVerification } from './confirm';
import { bookingDeps } from './server';
import { requestNow } from '@/platform/clock';

/** Server Actions behind the confirmation page (src/contracts/bookings.ts, BookingConfirmHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function afterAttempt(result: PaymentAttemptResult) {
  if (result.ok) {
    // The task left the board and its offer count changed.
    updateTag('tasks');
  } else {
    // Show the hold and the failed attempt on the page.
    refresh();
  }
  return result;
}

/** Bound to the task and offer by the page: `confirmBookingAction.bind(null, taskId, offerId)`. */
export async function confirmBookingAction(taskId: string, offerId: string, input: ConfirmBookingInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return afterAttempt(await confirmBooking(deps, userId, String(taskId), String(offerId), input, await requestNow()));
}

export async function finishBankVerificationAction(input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const outcome = input.outcome === 'approved' ? 'approved' : 'failed';
  return afterAttempt(await finishBankVerification(deps, userId, String(input.paymentId), outcome, await requestNow()));
}
