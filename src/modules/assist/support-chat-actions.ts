'use server';

import type { ActionResult, HandOffInput, SupportReplyInput } from '@/contracts';
import { announceMemberReply, requestLiveChat, typingInLiveChat } from '@/modules/support/live-chat';
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
  const result = await replyToSupportCase(db, userId, String(caseId), input, await requestNow());
  // In a live chat, support staff on duty hear it at once (2026-11-22).
  if (result.ok) await announceMemberReply(db, String(caseId));
  return result;
}

/** A live chat on the open case (2026-11-22): it waits in line for someone from support. */
export async function requestLiveChatAction(caseId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return requestLiveChat(db, userId, String(caseId), await requestNow());
}

/** The member is typing in a live chat: the one on it sees "typing…" (spaced out; fire and forget). */
export async function typingInHelpCaseAction(caseId: string): Promise<void> {
  const userId = await signedInUserId();
  if (!userId) return;
  await typingInLiveChat(db, { userId, staff: false }, String(caseId), new Date());
}
