'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, BookingNoteInput, CancelBookingInput, CancellationPreview, LateByMinutes, SafetyReportInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { bookingDeps } from './server';
import { cancelBookingBy, previewCancellation, reportCantAccess, reportNoShow, reportRunningLate, submitSafetyReport } from './sheets';

/** Server Actions behind the booking sheets (BookingSheetHandlers). Each is bound to the booking by the page. */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function refreshed(result: ActionResult): ActionResult {
  if (result.ok) refresh();
  return result;
}

export async function previewCancelAction(bookingId: string, _input: Record<string, never>): Promise<CancellationPreview> {
  const userId = await signedInUserId();
  const preview = userId ? await previewCancellation(db, userId, String(bookingId), new Date()) : null;
  if (!preview) throw new Error('No cancellation preview for this booking');
  return preview;
}

export async function cancelBookingAction(bookingId: string, input: CancelBookingInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  const result = await cancelBookingBy(deps, userId, String(bookingId), input, new Date());
  if (result.ok) updateTag('tasks');
  return refreshed(result);
}

export async function runningLateAction(bookingId: string, input: { minutes: LateByMinutes }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await reportRunningLate(db, userId, String(bookingId), input.minutes, new Date()));
}

export async function reportNoShowAction(bookingId: string, input: BookingNoteInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  const deps = bookingDeps();
  if (!userId || !deps) return { ok: false, code: 'not_allowed' };
  return refreshed(await reportNoShow(deps, userId, String(bookingId), input, new Date()));
}

export async function cantAccessAction(bookingId: string, input: BookingNoteInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return refreshed(await reportCantAccess(db, userId, String(bookingId), input, new Date()));
}

export async function safetyReportAction(bookingId: string, input: SafetyReportInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return submitSafetyReport(db, userId, String(bookingId), input, new Date());
}
