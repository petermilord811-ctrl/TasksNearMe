'use server';

import { refresh } from 'next/cache';
import type { ActionResult, ChangeSeriesCardInput, PauseSeriesInput, PayScheduledInput, PaymentAttemptResult } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';
import { finishScheduledVerification, payScheduledNow } from './scheduled';
import { cancelSeries, changeSeriesCard, endSeries, pauseSeries, resumeSeries, seriesConversation, skipVisit } from './series';
import { bookingDeps } from './server';

/**
 * Server Actions for regular visits (SeriesHandlers, each bound to the series by its page) and for paying a
 * booking paid later now (ScheduledPaymentHandlers, bound to the booking by the booking page).
 */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

async function asUser(run: (userId: string, now: Date) => Promise<ActionResult>): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await run(userId, await requestNow()));
}

export async function skipVisitAction(_seriesId: string, input: { visitId: string }): Promise<ActionResult> {
  return asUser((userId, now) => skipVisit(db, userId, String(input.visitId), now));
}

export async function pauseSeriesAction(seriesId: string, input: PauseSeriesInput): Promise<ActionResult> {
  return asUser((userId, now) => pauseSeries(db, userId, String(seriesId), input, now));
}

export async function resumeSeriesAction(seriesId: string): Promise<ActionResult> {
  return asUser((userId, now) => resumeSeries(db, userId, String(seriesId), now));
}

export async function cancelSeriesAction(seriesId: string): Promise<ActionResult> {
  return asUser((userId, now) => cancelSeries(db, userId, String(seriesId), now));
}

export async function endSeriesAction(seriesId: string): Promise<ActionResult> {
  return asUser((userId, now) => endSeries(db, userId, String(seriesId), now));
}

export async function changeSeriesCardAction(seriesId: string, input: ChangeSeriesCardInput): Promise<ActionResult> {
  return asUser((userId, now) => changeSeriesCard(db, userId, String(seriesId), input, now));
}

export async function seriesMessageAction(seriesId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return seriesConversation(db, userId, String(seriesId), await requestNow());
}

export async function payScheduledAction(bookingId: string, input: PayScheduledInput): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await payScheduledNow(deps, userId, String(bookingId), input, await requestNow()));
}

export async function finishScheduledVerificationAction(bookingId: string, input: { paymentId: string; outcome: 'approved' | 'failed' }): Promise<PaymentAttemptResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const outcome = input.outcome === 'approved' ? 'approved' : 'failed';
  return refreshed(await finishScheduledVerification(deps, userId, String(bookingId), String(input.paymentId), outcome, await requestNow()));
}
