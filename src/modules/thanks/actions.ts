'use server';

import { eq } from 'drizzle-orm';
import { refresh, updateTag } from 'next/cache';
import type { ActionResult, ThankYouNoteInput } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { deleteThanks, saveThanks, setThanksNameHidden, setThanksShown } from './service';

/**
 * Server Actions for thank-you notes (src/contracts/thanks.ts), bound by where they're used: `page` refreshes the page
 * (the booking page, the conversation page), `window` doesn't (the chat window reloads its conversation itself and
 * leaves the page behind it as it was). The helper's public profile is refreshed whenever a note changed.
 */

type From = 'page' | 'window';

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

async function settled(from: From, { helperUserId, ...result }: ActionResult & { helperUserId?: string }): Promise<ActionResult> {
  if (!result.ok) return result;
  if (helperUserId) {
    const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, helperUserId)).limit(1);
    if (profile) updateTag(`helper:${profile.handle}`);
  }
  if (from === 'page') refresh();
  return result;
}

export async function saveThanksAction(from: From, input: ThankYouNoteInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await saveThanks(db, userId, input, await requestNow()));
}

export async function deleteThanksAction(from: From, input: { noteId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await deleteThanks(db, userId, String(input?.noteId)));
}

export async function showThanksOnProfileAction(from: From, input: { noteId: string; shown: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await setThanksShown(db, userId, String(input?.noteId), input?.shown === true, await requestNow()));
}

export async function hideThanksNameAction(from: From, input: { noteId: string; hidden: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return settled(from, await setThanksNameHidden(db, userId, String(input?.noteId), input?.hidden === true, await requestNow()));
}
