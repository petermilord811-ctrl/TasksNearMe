'use server';

import type {
  ActionResult,
  NeighborGroupCodeInput,
  NeighborGroupCreateInput,
  NeighborGroupInvitePreview,
  NeighborGroupInviteResult,
  NeighborGroupMessageInput,
  NeighborGroupResult,
  NeighborGroupView,
} from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import {
  createGroupInvite,
  createNeighborGroup,
  deleteGroupMessage,
  getNeighborGroupView,
  joinNeighborGroup,
  leaveNeighborGroup,
  muteNeighborGroup,
  previewInvite,
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
