'use server';

import { refresh } from 'next/cache';
import type { ActionResult, CommunityModerationInput, CommunityPostInput, CommunityReactInput, CommunityReplyInput, PortalMore, PortalQuery } from '@/contracts';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { getPortalMore } from './portal';
import { createCommunityPost, deleteOwnCommunityItem, moderateCommunityItem, pinCommunityAnswer, reactInCommunity, replyToCommunityPost, saveCommunityPost, type CommunityViewer } from './service';

/** Server Actions behind the community pages (src/contracts/community.ts). */

async function communityViewer(): Promise<CommunityViewer | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? { id: viewer.user.id, staff: staffActorOf(viewer.user) } : null;
}

/**
 * The portal's next page for "Show more" (plan 9.10): the same filters read the way the page reads them (the
 * viewer's market and place, blocks both ways), parsed like the address's, so nothing sent here widens what they see.
 */
export async function loadPortalPageAction(query: PortalQuery & { page: number }): Promise<PortalMore | null> {
  const viewer = await communityViewer();
  if (!viewer) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return getPortalMore(
    db,
    viewer,
    {
      area: text(query?.area),
      category: text(query?.category) as PortalQuery['category'],
      type: text(query?.type) as PortalQuery['type'],
      time: text(query?.time) as PortalQuery['time'],
      q: text(query?.q),
      saved: query?.saved === true,
      sort: text(query?.sort) as PortalQuery['sort'],
      view: text(query?.view) as PortalQuery['view'],
      group: text(query?.group) as PortalQuery['group'],
      page: Number(query?.page) || 1,
    },
    await requestNow(),
  );
}

/** Keeps a post in the viewer's Saved, or takes it out (plan 9.10). */
export async function saveCommunityPostAction(input: { postId: string; saved: boolean }): Promise<ActionResult> {
  const viewer = await communityViewer();
  if (!viewer) return { ok: false, code: 'not_allowed' };
  const result = await saveCommunityPost(db, viewer, input, await requestNow());
  if (result.ok) refresh();
  return result;
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
