'use server';

import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import type { ActionResult, ConversationFlagInput, ConversationSearchData, DirectMessageSetting, MessageReaction, MessageSavedReplyInput, MessageTranslation, PhotoUploadResult, ReplySuggestions, SendMessageInput, StartDirectChatInput } from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeReplySuggester } from '@/integrations/ai/reply-suggester';
import { createFakeTranslator } from '@/integrations/ai/translator';
import { suggestReplies, translateMessage } from './assist';
import { storePhoto } from '@/modules/files/uploads';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { saveDirectMessageSetting, startDirectChat } from './direct';
import { acceptMessageRequest, searchConversation, setConversationFlag } from './folders';
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
 * The chat window's Send (2026-11-22): the same as `sendMessageAction`, without refreshing the page behind the window
 * (the window reads the conversation again itself). Called with the conversation's id.
 */
export async function sendFromWindowAction(threadId: string, input: SendMessageInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return sendMessage(db, userId, String(threadId), input, await requestNow());
}

/** The chat window's reactions: as `reactToMessageAction`, without refreshing the page behind it. */
export async function reactFromWindowAction(threadId: string, input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return reactToMessage(db, userId, String(threadId), input, await requestNow());
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

// ---- The viewer's own list (2026-11-23): pin, mute, archive; message requests; a conversation's search -----------------

/** Pin, mute or archive a conversation (Messages, the conversation page): ok `updated`; the page refreshes. */
export async function setConversationFlagAction(threadId: string, input: ConversationFlagInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await setConversationFlag(db, userId, String(threadId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** The chat window's: the same, without refreshing the page behind it (the window reads its list again). */
export async function setConversationFlagFromWindowAction(threadId: string, input: ConversationFlagInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return setConversationFlag(db, userId, String(threadId), input, await requestNow());
}

/** Accept a message request: ok `updated`; the page refreshes. */
export async function acceptMessageRequestAction(threadId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await acceptMessageRequest(db, userId, String(threadId), await requestNow());
  if (result.ok) refresh();
  return result;
}

/** The chat window's Accept: without refreshing the page behind it. */
export async function acceptRequestFromWindowAction(threadId: string): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return acceptMessageRequest(db, userId, String(threadId), await requestNow());
}

/** Search one conversation of the viewer's (null: not theirs). Called with the conversation's id. */
export async function searchConversationAction(threadId: string, query: string): Promise<ConversationSearchData | null> {
  const userId = await signedInUserId();
  if (!userId) return null;
  return searchConversation(db, userId, String(threadId), String(query ?? ''), await requestNow());
}

/** Tests ask for the stand-ins with the AI cookie (never in production), as the other AI features do. */
async function aiStandIn(): Promise<boolean> {
  return wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
}

/** A message of the viewer's conversation in their language (2026-11-23). Called with the conversation's id. */
export async function translateMessageAction(threadId: string, messageId: string): Promise<MessageTranslation | null> {
  const userId = await signedInUserId();
  if (!userId) return null;
  return translateMessage(db, userId, String(threadId), String(messageId ?? ''), await requestNow(), (await aiStandIn()) ? createFakeTranslator() : undefined);
}

/** Replies the viewer might send next (2026-11-23). Called with the conversation's id. */
export async function suggestRepliesAction(threadId: string): Promise<ReplySuggestions | null> {
  const userId = await signedInUserId();
  if (!userId) return null;
  return suggestReplies(db, userId, String(threadId), await requestNow(), (await aiStandIn()) ? createFakeReplySuggester() : undefined);
}
