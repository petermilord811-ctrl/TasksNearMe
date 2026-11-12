'use server';

import { refresh } from 'next/cache';
import type { ActionResult, CaseResolutionInput, CaseStatusInput, RefundDecisionInput, ResolutionPreviewResult, RestrictedAccessInput, RevealAddressResult, RevealConversationResult, StaffNoteInput, StaffRefundInput, StaffReplyInput } from '@/contracts';
import { createPaymentProvider } from '@/integrations/payments';
import { getViewer } from '@/platform/auth/viewer';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { db } from '@/platform/db/client';
import { addCaseNote, assignCase, closeCase, previewResolution, reopenCase, revealCaseConversation, setCaseStatus, staffActorOf, staffReply, type StaffActor } from './staff';
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
