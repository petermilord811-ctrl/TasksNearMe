'use server';

import { refresh, updateTag } from 'next/cache';
import type { ActionResult, AvailabilityPostInput, NeighborhoodDayInput } from '@/contracts';
import { createPaymentProvider } from '@/integrations/payments';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { cancelNeighborhoodDay, createNeighborhoodDay } from './neighborhood-days';
import { cancelAvailabilityPost, createAvailabilityPost, helperAreaOf } from './service';
import { requestNow } from '@/platform/clock';

/** Server Actions behind `/app/availability` (src/contracts/availability.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** The helper's public profile lists their open slots: show the change at once. */
async function changed(userId: string): Promise<void> {
  const area = await helperAreaOf(db, userId);
  if (area) updateTag(`helper:${area.handle}`);
  refresh();
}

export async function createAvailabilityPostAction(input: AvailabilityPostInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await createAvailabilityPost(db, userId, input, await requestNow());
  if (result.ok) await changed(userId);
  return result;
}

export async function cancelAvailabilityPostAction(input: { postId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await cancelAvailabilityPost(db, createPaymentProvider(), userId, String(input.postId), await requestNow());
  if (result.ok) await changed(userId);
  return result;
}

/** A neighborhood day (2026-11-24): its visits are slots, so the profile and Neighbors show the change at once. */
export async function createNeighborhoodDayAction(input: NeighborhoodDayInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await createNeighborhoodDay(db, userId, input, await requestNow());
  if (result.ok) await changed(userId);
  return result;
}

export async function cancelNeighborhoodDayAction(input: { dayId: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await cancelNeighborhoodDay(db, createPaymentProvider(), userId, String(input.dayId), await requestNow());
  if (result.ok) await changed(userId);
  return result;
}
