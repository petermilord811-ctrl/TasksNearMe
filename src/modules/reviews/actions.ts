'use server';

import { eq } from 'drizzle-orm';
import { refresh, updateTag } from 'next/cache';
import type { ActionResult, ReviewInput } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { setHelperSaved, submitReview } from './service';

/** Server Actions behind the review and saved-helpers pages (src/contracts/reviews.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Bound to the booking by the page. Publishing changes the helper's public profile (reviews, rating). */
export async function submitReviewAction(bookingId: string, input: ReviewInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const { result, ratedHelperId } = await submitReview(db, userId, String(bookingId), input, new Date());
  if (ratedHelperId) {
    const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, ratedHelperId)).limit(1);
    updateTag('helpers');
    if (profile) updateTag(`helper:${profile.handle}`);
  }
  return result;
}

export async function toggleSavedHelperAction(input: { helperId: string; saved: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await setHelperSaved(db, userId, String(input.helperId), Boolean(input.saved), new Date());
  if (result.ok) refresh();
  return result;
}
