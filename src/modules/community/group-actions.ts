'use server';

import { cookies } from 'next/headers';
import type {
  ActionResult,
  AttachGifInput,
  NeighborGroupCodeInput,
  NeighborGroupCreateInput,
  NeighborGroupInvitePreview,
  NeighborGroupInviteResult,
  NeighborGroupMessageInput,
  NeighborGroupReactionInput,
  NeighborGroupResult,
  NeighborGroupView,
  PhotoUploadResult,
} from '@/contracts';
import { GIF_STAND_IN_COOKIE, createGifProvider, wantsGifStandIn } from '@/integrations/gifs';
import { storePhoto } from '@/modules/files/uploads';
import { attachGif } from '@/modules/messaging/gifs';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import {
  GROUP_PHOTO_KIND,
  createGroupInvite,
  createNeighborGroup,
  deleteGroupMessage,
  getNeighborGroupView,
  joinNeighborGroup,
  leaveNeighborGroup,
  muteNeighborGroup,
  notifyGroupTyping,
  previewInvite,
  reactToGroupMessage,
  removeGroupMember,
  revokeGroupInvite,
  sendGroupMessage,
} from './groups';

/**
 * Server Actions behind building and street groups on Neighbors (src/contracts/neighbor-groups.ts, 2026-11-24). Each
 * checks the session first; the group's own rules (members only, the admin's powers) are the service's. The screens
 * reload the open group themselves, and the page's list refreshes from the live notice, so nothing here revalidates.
 */

async function viewerId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

export async function openNeighborGroupAction(input: { groupId: string }): Promise<NeighborGroupView | null> {
  const id = await viewerId();
  if (!id || !input) return null;
  return getNeighborGroupView(db, id, String(input.groupId ?? ''), await requestNow());
}

export async function createNeighborGroupAction(input: NeighborGroupCreateInput): Promise<NeighborGroupResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return createNeighborGroup(db, id, input, await requestNow());
}

export async function previewNeighborGroupInviteAction(input: NeighborGroupCodeInput): Promise<NeighborGroupInvitePreview> {
  const id = await viewerId();
  if (!id || !input) return { code: '', state: 'not_found' };
  return previewInvite(db, id, input, await requestNow());
}

export async function joinNeighborGroupAction(input: NeighborGroupCodeInput): Promise<NeighborGroupResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return joinNeighborGroup(db, id, input, await requestNow());
}

export async function sendNeighborGroupMessageAction(input: NeighborGroupMessageInput): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return sendGroupMessage(db, id, input, await requestNow());
}

/** A photo for a group message (re-encoded; location data removed): only the group's members ever open it. */
export async function uploadNeighborGroupPhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'unknown' };
  const file = formData instanceof FormData ? formData.get('file') : null;
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  return storePhoto({ db, storage: fileStorage }, { userId: id, kind: GROUP_PHOTO_KIND, file });
}

/**
 * A picked GIF for a group message, by its id (as in a conversation: src/modules/messaging/gif-actions.ts), stored as a
 * group photo. The GIF search itself is the conversation's (`searchGifsAction`).
 */
export async function attachNeighborGroupGifAction(input: AttachGifInput): Promise<PhotoUploadResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'unknown' };
  const provider = createGifProvider(process.env, { standIn: wantsGifStandIn((await cookies()).get(GIF_STAND_IN_COOKIE)?.value) });
  return attachGif({ db, storage: fileStorage }, { userId: id, id: input?.id, kind: GROUP_PHOTO_KIND }, provider);
}

export async function reactToNeighborGroupMessageAction(input: NeighborGroupReactionInput): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return reactToGroupMessage(db, id, input, await requestNow());
}

/** "Typing…" for the group's other members: fire and forget (the service spaces the notices out). */
export async function typingInNeighborGroupAction(input: { groupId: string }): Promise<void> {
  const id = await viewerId();
  if (!id) return;
  await notifyGroupTyping(db, id, input, new Date());
}

export async function deleteNeighborGroupMessageAction(input: { messageId: string }): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return deleteGroupMessage(db, id, input, await requestNow());
}

export async function inviteToNeighborGroupAction(input: { groupId: string }): Promise<NeighborGroupInviteResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return createGroupInvite(db, id, input, await requestNow());
}

export async function revokeNeighborGroupInviteAction(input: { inviteId: string }): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return revokeGroupInvite(db, id, input, await requestNow());
}

export async function removeNeighborGroupMemberAction(input: { groupId: string; userId: string }): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return removeGroupMember(db, id, input, await requestNow());
}

export async function leaveNeighborGroupAction(input: { groupId: string }): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return leaveNeighborGroup(db, id, input, await requestNow());
}

export async function muteNeighborGroupAction(input: { groupId: string; muted: boolean }): Promise<ActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, code: 'not_allowed' };
  return muteNeighborGroup(db, id, input, await requestNow());
}
