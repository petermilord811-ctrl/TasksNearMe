'use server';

import { refresh } from 'next/cache';
import type { ActionResult, PhotoUploadResult, SendMessageInput } from '@/contracts';
import { storePhoto } from '@/modules/files/uploads';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { notifyTyping, sendMessage } from './service';
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
