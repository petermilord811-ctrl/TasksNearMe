'use server';

import type { ActionResult, HandOffInput, SupportReplyInput } from '@/contracts';
import { replyToSupportCase } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { handOffToSupport } from './support-chat';

/**
 * The Help conversation's Server Actions (2026-11-22; src/contracts/assistant.ts, HelpChatHandlers). Neither refreshes
 * the page: the chat window reads the conversation again itself, and the Help page refreshes after an answer.
 */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** "Talk to a person": the chat and the request go to support as a case (ok `submitted`). */
export async function handOffToSupportAction(input: HandOffInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return handOffToSupport(db, userId, input, await requestNow());
}

/** A message to support on the open case from the assistant (any case the person may write on). */
export async function replyToHelpCaseAction(caseId: string, input: SupportReplyInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return replyToSupportCase(db, userId, String(caseId), input, await requestNow());
}
