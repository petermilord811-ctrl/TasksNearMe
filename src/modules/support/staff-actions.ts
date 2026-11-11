'use server';

import { refresh } from 'next/cache';
import type { ActionResult, CaseResolutionInput, CaseStatusInput, ResolutionPreviewResult, RestrictedAccessInput, RevealConversationResult, StaffNoteInput, StaffReplyInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { addCaseNote, assignCase, closeCase, previewResolution, reopenCase, resolveCase, revealCaseConversation, setCaseStatus, staffActorOf, staffReply, type StaffActor } from './staff';

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
  return refreshed(await assignCase(db, actor, String(caseId), Number(version), Boolean(input.assign), new Date()));
}

export async function setCaseStatusAction(caseId: string, version: number, input: CaseStatusInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await setCaseStatus(db, actor, String(caseId), Number(version), input, new Date()));
}

export async function staffReplyAction(caseId: string, input: StaffReplyInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await staffReply(db, actor, String(caseId), input, new Date()));
}

export async function addCaseNoteAction(caseId: string, input: StaffNoteInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await addCaseNote(db, actor, String(caseId), input, new Date()));
}

export async function resolveCaseAction(caseId: string, version: number, input: CaseResolutionInput): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await resolveCase(db, actor, String(caseId), Number(version), input, new Date()));
}

export async function closeCaseAction(caseId: string, version: number): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await closeCase(db, actor, String(caseId), Number(version), new Date()));
}

export async function reopenCaseAction(caseId: string, version: number): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await reopenCase(db, actor, String(caseId), Number(version), new Date()));
}

export async function revealCaseConversationAction(caseId: string, input: RestrictedAccessInput): Promise<RevealConversationResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return revealCaseConversation(db, actor, String(caseId), input, new Date());
}

export async function previewResolutionAction(caseId: string, input: CaseResolutionInput): Promise<ResolutionPreviewResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return previewResolution(db, actor, String(caseId), input);
}
