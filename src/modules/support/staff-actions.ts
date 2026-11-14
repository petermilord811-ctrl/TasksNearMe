'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, SavedReplyInput, CaseResolutionInput, CaseStatusInput, RefundDecisionInput, ResolutionPreviewResult, RestrictedAccessInput, RevealAddressResult, RevealConversationResult, ReviewModerationInput, StaffEmailContactInput, StaffNoteInput, StaffRefundInput, StaffReplyInput } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { createPaymentProvider } from '@/integrations/payments';
import { getViewer } from '@/platform/auth/viewer';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import { addCaseNote, assignCase, closeCase, moderateReportedReview, previewResolution, reopenCase, revealCaseConversation, setCaseStatus, staffActorOf, staffEmailContact, staffReply, type StaffActor } from './staff';
import { archiveSavedReply, createSavedReply, updateSavedReply } from './saved-replies';
import { decideRefundRequest, resolveCaseWithMoney, revealBookingAddress, revealBookingConversation, staffRefund } from './staff-money';
import { requestNow } from '@/platform/clock';

/**
 * Server Actions behind the staff case page (src/contracts/admin.ts). Each checks for a staff member who
 * passed the two-step check. Moves are bound to the case version the page rendered (`version_conflict`
 * when someone else changed the case first).
 */

async function staff(): Promise<StaffActor | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) refresh();
  return result;
}

export async function assignCaseAction(caseId: string, version: number, input: { assign: boolean }): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await assignCase(db, actor, String(caseId), Number(version), Boolean(input.assign), await requestNow()));
}

export async function setCaseStatusAction(caseId: string, version: number, input: CaseStatusInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await setCaseStatus(db, actor, String(caseId), Number(version), input, await requestNow()));
}

export async function staffReplyAction(caseId: string, input: StaffReplyInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await staffReply(db, actor, String(caseId), input, await requestNow()));
}

/** A public request's answer, by email (5.22). */
export async function staffEmailContactAction(caseId: string, input: StaffEmailContactInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await staffEmailContact(db, { email: createEmailProvider(db), appUrl: appUrl() }, actor, String(caseId), input, await requestNow()));
}

export async function addCaseNoteAction(caseId: string, input: StaffNoteInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await addCaseNote(db, actor, String(caseId), input, await requestNow()));
}

export async function resolveCaseAction(caseId: string, version: number, input: CaseResolutionInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await resolveCaseWithMoney(db, createPaymentProvider(), actor, String(caseId), Number(version), input, await requestNow()));
}

/** Hides the case's reported review, or shows it again; the helper's public profile and cards refresh. */
export async function moderateReviewAction(caseId: string, input: ReviewModerationInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  const { helperHandle, ...result } = await moderateReportedReview(db, actor, String(caseId), input, await requestNow());
  if (result.ok) {
    updateTag('helpers');
    if (helperHandle) updateTag(`helper:${helperHandle}`);
  }
  return refreshed(result);
}

export async function closeCaseAction(caseId: string, version: number): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await closeCase(db, actor, String(caseId), Number(version), await requestNow()));
}

export async function reopenCaseAction(caseId: string, version: number): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await reopenCase(db, actor, String(caseId), Number(version), await requestNow()));
}

export async function revealCaseConversationAction(caseId: string, input: RestrictedAccessInput): Promise<RevealConversationResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return revealCaseConversation(db, actor, String(caseId), input, await requestNow());
}

export async function previewResolutionAction(caseId: string, input: CaseResolutionInput): Promise<ResolutionPreviewResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return previewResolution(db, actor, String(caseId), input);
}

// ---- The staff booking page ---------------------------------------------------------------------------

export async function staffRefundAction(bookingId: string, input: StaffRefundInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await staffRefund(db, createPaymentProvider(), actor, String(bookingId), input, await requestNow()));
}

/** Approve or decline a refund asked for above someone's limit. */
export async function decideRefundAction(bookingId: string, input: RefundDecisionInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await decideRefundRequest(db, createPaymentProvider(), actor, String(bookingId), input, await requestNow()));
}

export async function revealBookingAddressAction(bookingId: string, input: RestrictedAccessInput): Promise<RevealAddressResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return revealBookingAddress(db, fieldCipherFromEnv(), actor, String(bookingId), input, await requestNow());
}

export async function revealBookingConversationAction(bookingId: string, input: RestrictedAccessInput): Promise<RevealConversationResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return revealBookingConversation(db, actor, String(bookingId), input, await requestNow());
}

// ---- Saved replies --------------------------------------------------------------------------------

export async function createSavedReplyAction(input: SavedReplyInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await createSavedReply(db, actor, input, await requestNow()));
}

export async function updateSavedReplyAction(input: SavedReplyInput & { id: string }): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await updateSavedReply(db, actor, String(input?.id ?? ''), input, await requestNow()));
}

export async function archiveSavedReplyAction(input: { id: string }): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await archiveSavedReply(db, actor, String(input?.id ?? ''), await requestNow()));
}
