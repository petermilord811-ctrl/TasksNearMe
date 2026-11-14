'use server';

import { refresh } from 'next/cache';
import type { ActionResult, CommunityModerationInput, CommunityPostInput, CommunityReactInput, CommunityReplyInput } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { createCommunityPost, deleteOwnCommunityItem, moderateCommunityItem, pinCommunityAnswer, reactInCommunity, replyToCommunityPost, type CommunityViewer } from './service';

/** Server Actions behind the community pages (src/contracts/community.ts). */

async function communityViewer(): Promise<CommunityViewer | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? { id: viewer.user.id, staff: staffActorOf(viewer.user) } : null;
}

export async function createCommunityPostAction(input: CommunityPostInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  return createCommunityPost(db, viewer, input, await requestNow());
}

/** Bound to the post by the page: `replyToCommunityPostAction.bind(null, postId)`. */
export async function replyToCommunityPostAction(postId: string, input: CommunityReplyInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await replyToCommunityPost(db, viewer, String(postId), input, await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function reactInCommunityAction(input: CommunityReactInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await reactInCommunity(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** Bound to the post: `pinCommunityAnswerAction.bind(null, postId)`. */
export async function pinCommunityAnswerAction(postId: string, input: { replyId: string | null }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await pinCommunityAnswer(db, viewer, String(postId), input.replyId === null ? null : String(input.replyId), await requestNow());
  if (result.ok) refresh();
  return result;
}

export async function deleteOwnCommunityItemAction(input: { target: 'post' | 'reply'; id: string }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await deleteOwnCommunityItem(db, viewer, input.target === 'post' ? 'post' : 'reply', String(input.id), await requestNow());
  if (result.ok && !result.redirectTo) refresh();
  return result;
}

export async function moderateCommunityItemAction(input: { target: 'post' | 'reply'; id: string } & CommunityModerationInput): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer?.staff) return { ok: false, code: 'not_allowed' };
  const { target, id, ...moderation } = input;
  const result = await moderateCommunityItem(db, viewer.staff, target === 'post' ? 'post' : 'reply', String(id), moderation, await requestNow());
  if (result.ok) refresh();
  return result;
}
