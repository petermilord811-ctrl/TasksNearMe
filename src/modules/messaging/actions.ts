'use server';

import { refresh } from 'next/cache';
import type { ActionResult, DirectMessageSetting, MessageReaction, MessageSavedReplyInput, PhotoUploadResult, SendMessageInput, StartDirectChatInput } from '@/contracts';
import { storePhoto } from '@/modules/files/uploads';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { saveDirectMessageSetting, startDirectChat } from './direct';
import { deleteReply, notifyTyping, reactToMessage, saveReply, sendMessage } from './service';
import { requestNow } from '@/platform/clock';

/** Server Actions behind the conversation page (src/contracts/messaging.ts, ThreadHandlers). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Bound to the thread by the page: `sendMessageAction.bind(null, threadId)`. */
export async function sendMessageAction(threadId: string, input: SendMessageInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await sendMessage(db, userId, String(threadId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/**
 * "Typing…" for the thread's other participant (completion plan 7.1). Bound like `sendMessageAction`; fire and
 * forget (the service spaces the notices out and checks the viewer is in the thread).
 */
export async function typingAction(threadId: string): Promise<void> {
  const userId = await signedInUserId();
  if (!userId) return;
  await notifyTyping(db, userId, String(threadId), new Date());
}

/** A photo to attach to a message (re-encoded; location data removed). */
export async function uploadMessagePhoto(formData: FormData): Promise<PhotoUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  return storePhoto({ db, storage: fileStorage }, { userId, kind: 'message', file });
}

/** A reaction on a message (completion plan 7.3). Bound to the thread: `reactToMessageAction.bind(null, threadId)`. */
export async function reactToMessageAction(threadId: string, input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await reactToMessage(db, userId, String(threadId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Keep the composer's text as a saved reply (completion plan 7.3). */
export async function saveReplyAction(input: MessageSavedReplyInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await saveReply(db, userId, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function deleteReplyAction(input: { id: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await deleteReply(db, userId, String(input.id));
  if (result.ok) refresh();
  return result;
}

/** Start a direct conversation with its first message (2026-11-21): ok `sent`, `redirectTo` the conversation. */
export async function startDirectChatAction(input: StartDirectChatInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return startDirectChat(db, userId, input, await requestNow());
}

/** "Who can message me directly" (2026-11-21): everyone, people they've talked to about a task, or nobody. */
export async function saveDirectMessagesAction(input: { setting: DirectMessageSetting }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await saveDirectMessageSetting(db, userId, input, await requestNow());
  if (result.ok) refresh();
  return result;
}
