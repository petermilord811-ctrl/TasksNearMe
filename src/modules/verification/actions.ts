'use server';

import { eq } from 'drizzle-orm';
import { refresh, updateTag } from 'next/cache';
import type {
  ActionResult,
  CategorySlug,
  HelperAreaInput,
  HelperProfileInput,
  HelperServicesInput,
  HelperToolsInput,
  OnboardingStep,
  WorkSampleUploadResult,
} from '@/contracts';
import { ONBOARDING_STEPS, routes } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { computeOnboarding } from './progress';
import {
  addWorkSample,
  loadOnboardingState,
  removeWorkSample,
  reorderWorkSamples,
  saveHelperArea,
  saveHelperProfile,
  saveHelperServices,
  saveHelperTools,
  setHelperPaused,
  startBackgroundCheck,
  startIdentity,
  startPayout,
  updateWorkSample,
} from './service';
import { verificationProviders } from './server';
import { requestNow } from '@/platform/clock';

/** Server Actions for helper onboarding and the profile editor (src/contracts/onboarding.ts). */

async function signedInUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? viewer.user.id : null;
}

/** Public profiles and lists read cached data; refresh them after a change. */
async function refreshHelperPages(userId: string) {
  const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  updateTag('helpers');
  if (profile) updateTag(`helper:${profile.handle}`);
}

/** After a saved step: the next step in order, or the first step still to do when that one is locked. */
async function nextStepAfter(userId: string, saved: OnboardingStep): Promise<string> {
  const { progress, firstIncomplete } = computeOnboarding((await loadOnboardingState(db, userId, await requestNow())).facts);
  const following = ONBOARDING_STEPS.slice(ONBOARDING_STEPS.indexOf(saved) + 1).find((step) => {
    const state = progress.steps.find((s) => s.step === step)?.state;
    return state !== 'skipped';
  });
  const followingState = progress.steps.find((s) => s.step === following)?.state;
  return routes.app.helperOnboarding(following && followingState !== 'locked' ? following : firstIncomplete);
}

async function saved(userId: string, result: ActionResult, step?: OnboardingStep): Promise<ActionResult> {
  if (!result.ok) return result;
  await refreshHelperPages(userId);
  if (step) return { ...result, redirectTo: await nextStepAfter(userId, step) };
  refresh();
  return result;
}

// ---- Onboarding -----------------------------------------------------------------------------------

export async function onboardingSaveProfile(input: HelperProfileInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperProfile(db, userId, input, await requestNow()), 'profile');
}

export async function onboardingSaveServices(input: HelperServicesInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperServices(db, userId, input, await requestNow()), 'services');
}

export async function onboardingSaveArea(input: HelperAreaInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperArea(db, userId, input, await requestNow()), 'area');
}

export async function onboardingStartIdentity(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  return startIdentity(db, verificationProviders, userId, await requestNow());
}

export async function onboardingStartPayout(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  return startPayout(db, verificationProviders, userId, await requestNow());
}

export async function onboardingStartBackgroundCheck(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  return startBackgroundCheck(db, verificationProviders, userId, await requestNow());
}

/** Provider statuses arrive by webhook; this just re-renders with the latest. */
export async function onboardingRefreshStatus(): Promise<ActionResult> {
  refresh();
  return { ok: true, code: 'updated' };
}

// ---- Profile editor -------------------------------------------------------------------------------

export async function editorSaveProfile(input: HelperProfileInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperProfile(db, userId, input, await requestNow()));
}

export async function editorSaveServices(input: HelperServicesInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperServices(db, userId, input, await requestNow()));
}

export async function editorSaveArea(input: HelperAreaInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperArea(db, userId, input, await requestNow()));
}

export async function editorSaveTools(input: HelperToolsInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await saveHelperTools(db, userId, input, await requestNow()));
}

export async function editorUploadWorkSample(form: FormData): Promise<WorkSampleUploadResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'unknown' };
  const result = await addWorkSample({ db, storage: fileStorage }, userId, form, await requestNow());
  if (result.ok) await refreshHelperPages(userId);
  return result;
}

export async function editorUpdateWorkSample(input: { id: string; caption?: string; categorySlug?: CategorySlug }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await updateWorkSample(db, userId, input));
}

export async function editorRemoveWorkSample(input: { id: string }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await removeWorkSample(db, userId, String(input.id)));
}

export async function editorReorderWorkSamples(input: { ids: string[] }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !Array.isArray(input.ids)) return { ok: false, code: 'not_allowed' };
  return saved(userId, await reorderWorkSamples(db, userId, input.ids.map(String)));
}

export async function editorSetPaused(input: { paused: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  return saved(userId, await setHelperPaused(db, userId, Boolean(input.paused), await requestNow()));
}
