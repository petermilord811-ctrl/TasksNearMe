'use server';

import { eq } from 'drizzle-orm';
import { refresh, updateTag } from 'next/cache';
import type { ActionResult, ResumeApplyInput, ResumeReadResult } from '@/contracts';
import { resumeReaderFromEnv } from '@/integrations/ai/resume-reader';
import { isReservedEmailAddress } from '@/integrations/email';
import { aiDraftingFlag } from '@/modules/assist/availability';
import { helperInviteFor } from '@/modules/beta/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { applyResume, readResume } from './resume';
import { helperProfiles } from './schema';

/**
 * "Import from resume" on the helper's profile (owner, 2026-11-27): read a resume and suggest, then apply what the
 * helper kept. src/modules/profiles/resume.ts does the work. AI reads it where writing help is on for the person's market
 * (the `ai_drafting` flag) and a free model is set up; otherwise the suggestions come from keywords.
 */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

export async function readResumeAction(form: FormData): Promise<ResumeReadResult> {
  const viewer = await getViewer();
  const userId = viewer.kind === 'user' ? viewer.user.id : null;
  if (!userId || viewer.kind !== 'user' || !(form instanceof FormData)) return { ok: false, code: 'unknown' };
  // Private beta: helper setup can wait for a helper invite (src/modules/beta), as its saves do.
  if (await helperInviteFor(db, userId)) return { ok: false, code: 'unavailable' };
  // Test accounts (reserved email domains) get the keyword suggestions, as they get stand-in document readers: nothing of
  // theirs reaches an AI provider, and e2e runs stay the same every time.
  const reader = !isReservedEmailAddress(viewer.user.email) && (await aiDraftingFlag(db, userId)) ? resumeReaderFromEnv() : null;
  return readResume({ db, reader }, userId, form, await requestNow());
}

export async function applyResumeAction(input: ResumeApplyInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  if (await helperInviteFor(db, userId)) return { ok: false, code: 'not_allowed' };
  const result = await applyResume(db, userId, input, await requestNow());
  if (!result.ok) return result;
  // Public profiles and lists read cached data.
  const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  updateTag('helpers');
  if (profile) updateTag(`helper:${profile.handle}`);
  refresh();
  return result;
}
