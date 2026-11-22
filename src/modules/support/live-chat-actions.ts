'use server';

import { refresh } from 'next/cache';
import type { ActionResult } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { endLiveChat, joinLiveChat, liveReply, typingInLiveChat } from './live-chat';
import { staffActorOf, type StaffActor } from './staff';

/**
 * The live chat console's Server Actions (2026-11-22; src/contracts/admin-live.ts, AdminLiveHandlers): staff who passed
 * this session's two-step check, as every staff action.
 */

async function staff(): Promise<StaffActor | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
}

const refreshed = (result: ActionResult) => {
  if (result.ok) refresh();
  return result;
};

export async function joinLiveChatAction(caseId: string): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await joinLiveChat(db, actor, String(caseId), await requestNow()));
}

export async function endLiveChatAction(caseId: string): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await endLiveChat(db, actor, String(caseId), await requestNow()));
}

export async function liveReplyAction(caseId: string, input: { body: string }): Promise<ActionResult> {
  const actor = await staff();
  if (!actor) return { ok: false, code: 'not_allowed' };
  return refreshed(await liveReply(db, actor, String(caseId), input, await requestNow()));
}

/** The one on the chat is typing: the member sees "typing…" (spaced out; fire and forget). */
export async function liveTypingAction(caseId: string): Promise<void> {
  const actor = await staff();
  if (!actor) return;
  await typingInLiveChat(db, { userId: actor.id, staff: true }, String(caseId), new Date());
}
