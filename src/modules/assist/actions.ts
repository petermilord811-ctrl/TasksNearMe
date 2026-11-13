'use server';

import { cookies } from 'next/headers';
import type { OfferMessageDraftInput, OfferMessageDraftResult, ProfileDraftInput, ProfileDraftResult } from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeOfferWriter, createOfferWriter } from '@/integrations/ai/offer-writer';
import { createFakeProfileWriter, createProfileWriter } from '@/integrations/ai/profile-writer';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { draftHelperProfile, draftOfferMessage } from './service';

/**
 * "Write it for me" for helpers: their profile (HelperOnboardingHandlers / HelperProfileEditorHandlers
 * `onDraftProfile`) and an offer message (HelperWorkHandlers `onDraftOfferMessage`). Drafts save nothing.
 */

const profileWriter = createProfileWriter();
const offerWriter = createOfferWriter();

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Tests ask for the stand-ins, so they never reach Claude where a key is set (never in production). */
async function standIn(): Promise<boolean> {
  return wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
}

export async function draftHelperProfileAction(input: ProfileDraftInput): Promise<ProfileDraftResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unavailable' };
  const writer = (await standIn()) ? createFakeProfileWriter() : profileWriter;
  return draftHelperProfile({ db, writer, now: await requestNow() }, userId, input);
}

/** Bound to the task id by the page: `draftOfferMessageAction.bind(null, taskId)`. */
export async function draftOfferMessageAction(taskId: string, input: OfferMessageDraftInput): Promise<OfferMessageDraftResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unavailable' };
  const writer = (await standIn()) ? createFakeOfferWriter() : offerWriter;
  return draftOfferMessage({ db, writer, now: await requestNow() }, userId, String(taskId), input);
}
