'use server';

import { refresh } from 'next/cache';
import type { ActionResult, TeamActionInput, TeamInviteInput, TeamKeepInput } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { inviteTeamPartner, keepPartner, runTeamAction } from './service';

/**
 * Server Actions for team up (src/contracts/teams.ts), bound by where they're used: `page` refreshes the page (the
 * booking page, the conversation page), `window` doesn't (the chat window reloads its conversation itself). An action
 * that opens the confirm dialog (`redirectTo`) changes nothing on the page yet, so nothing refreshes for it.
 */

type From = 'page' | 'window';

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

function settled(from: From, result: ActionResult): ActionResult {
  if (result.ok && from === 'page' && !result.redirectTo) refresh();
  return result;
}

/** The lead invites a partner for their booking (bound to it). */
export async function inviteTeamPartnerAction(bookingId: string, input: TeamInviteInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled('page', await inviteTeamPartner(db, userId, String(bookingId), input, await requestNow()));
}

/** An answer on a team invite: the partner's, the lead's or the client's. */
export async function teamAction(from: From, input: TeamActionInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await runTeamAction(db, userId, input, await requestNow()));
}

/** The client keeps the partner after the lead's booking was canceled. */
export async function keepPartnerAction(from: From, input: TeamKeepInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await keepPartner(db, userId, input, await requestNow()));
}
