'use server';

import { refresh } from 'next/cache';
import type { ActionResult, CompletionInput, PhotoUploadResult, PriceBreakdown, ReportProblemInput } from '@/contracts';
import { storePhoto } from '@/modules/files/uploads';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { quoteFinal, reportProblem, submitCompletion } from './completion';
import { requestNow } from '@/platform/clock';

/** Server Actions behind the completion and problem pages (CompletionHandlers, ReportProblemHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Work photos, receipts, and photos of a problem (re-encoded; location data removed). */
export async function uploadEvidencePhoto(formData: FormData): Promise<PhotoUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  return storePhoto({ db, storage: fileStorage }, { userId, kind: 'evidence', file });
}

/** Bound to the booking by the page. Throws when the quote isn't available (the UI offers a retry). */
export async function quoteFinalAction(bookingId: string, input: { hoursWorked?: number; expensesCents: number }): Promise<PriceBreakdown> {
  const userId = await signedInUserId();
  if (!userId) throw new Error('Not signed in');
  const hoursWorked = typeof input.hoursWorked === 'number' && Number.isFinite(input.hoursWorked) ? Math.min(24, input.hoursWorked) : undefined;
  const expensesCents = Number.isFinite(input.expensesCents) ? Math.min(1_000_000, Math.max(0, input.expensesCents)) : 0;
  const quote = await quoteFinal(db, userId, String(bookingId), { ...(hoursWorked !== undefined ? { hoursWorked } : {}), expensesCents });
  if (!quote) throw new Error('No quote for this booking');
  return quote;
}

/** Bound to the booking by the page. */
export async function submitCompletionAction(bookingId: string, input: CompletionInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await submitCompletion(db, userId, String(bookingId), input, await requestNow());
  if (!result.ok) refresh();
  return result;
}

/** Bound to the booking by the page. */
export async function reportProblemAction(bookingId: string, input: ReportProblemInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await reportProblem(db, userId, String(bookingId), input, await requestNow());
  if (!result.ok) refresh();
  return result;
}
