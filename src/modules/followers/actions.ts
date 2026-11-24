'use server';

import { refresh } from 'next/cache';
import { routes, type ActionResult, type AddFollowerInput, type RemoveFollowerInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { addFollower, removeFollower } from './service';

/**
 * Server Actions for family followers (src/contracts/followers.ts), bound by where they're used: `page` refreshes the
 * page (the booking page, the conversation page), `window` doesn't (the chat window reloads its conversation itself).
 */

type From = 'page' | 'window';

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function settled(from: From, result: ActionResult): ActionResult {
  if (result.ok && from === 'page') refresh();
  return result;
}

/** "Add a family member": the booking's client names an existing account by @username or email. */
export async function addFollowerAction(from: From, input: AddFollowerInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await addFollower(db, userId, input, await requestNow()));
}

/** The client removes a follower. */
export async function removeFollowerAction(from: From, input: RemoveFollowerInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  if (!input?.followerId) return { ok: false, code: 'validation_failed', fieldErrors: { followerId: ['required'] } };
  return settled(from, await removeFollower(db, userId, { bookingId: String(input.bookingId), followerId: String(input.followerId) }, await requestNow()));
}

/** A follower stops following: back to their bookings. */
export async function leaveFollowAction(input: { bookingId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await removeFollower(db, userId, { bookingId: String(input?.bookingId ?? '') }, await requestNow());
  return result.ok ? { ...result, redirectTo: routes.app.bookings() } : result;
}
