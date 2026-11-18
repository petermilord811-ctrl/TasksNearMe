'use server';

import { eq } from 'drizzle-orm';
import { refresh, updateTag } from 'next/cache';
import { cookies, headers } from 'next/headers';
import type {
  ActionResult,
  AddressProofResult,
  AddressSuggestion,
  CategorySlug,
  IdentityCaptureResult,
  HelperAreaInput,
  HelperProfileInput,
  HelperServicesInput,
  HelperToolsInput,
  OneTimeCodeInput,
  OnboardingStep,
  PhoneInput,
  WorkSampleUploadResult,
} from '@/contracts';
import { ONBOARDING_STEPS, routes } from '@/contracts';
import { GEO_STAND_IN_COOKIE, wantsGeoStandIn } from '@/integrations/geocoding';
import { originFromHeaders } from '@/modules/accounts/agreements';
import { confirmPhoneChangeAction, startPhoneChangeAction } from '@/modules/accounts/account-actions';
import { helperProfiles } from '@/modules/profiles/schema';
import { fileStorage } from '@/modules/tasks/server';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { searchHomeAddresses, submitAddressProof } from './address';
import { acceptIdentityNotice, submitIdentityCapture } from './capture';
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
  syncPayoutStatus,
  syncHelperProfile,
  updateWorkSample,
} from './service';
import { homeGeocoder, livenessSecret, sampleHomeGeocoder, verificationCipher, verificationFileCipher, verificationProviders } from './server';
import { startPosterIdentity } from './poster-identity';
import { requestNow } from '@/platform/clock';
import { helperInviteFor } from '@/modules/beta/server';

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

/**
 * After a saved step: the next step in order that still needs something (a phone verified at sign-up is
 * skipped over), or the first step still to do when that one is locked. `done` once nothing is left.
 */
async function nextStepAfter(userId: string, saved: OnboardingStep): Promise<string> {
  const { progress, firstIncomplete } = computeOnboarding((await loadOnboardingState(db, userId, await requestNow())).facts);
  // The steps shown (no phone step without texts, plan 9.2), in order.
  const shown = progress.steps.map((entry) => entry.step);
  const following = (shown.includes(saved) ? shown.slice(shown.indexOf(saved) + 1) : ONBOARDING_STEPS.slice(ONBOARDING_STEPS.indexOf(saved) + 1).filter((step) => shown.includes(step))).find((step) => {
    const state = progress.steps.find((s) => s.step === step)?.state;
    return state !== 'skipped' && state !== 'later' && (state !== 'done' || step === 'done');
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
  // Private beta: starting helper setup can wait for a helper invite (src/modules/beta).
  if (await helperInviteFor(db, userId)) return { ok: false, code: 'not_allowed' };
  const origin = originFromHeaders(await headers());
  return saved(userId, await saveHelperProfile(db, userId, input, await requestNow(), { requireAgreement: true, origin }), 'profile');
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

/** The phone step: a code by text, as on the account page. */
export async function onboardingStartPhone(input: PhoneInput): Promise<ActionResult> {
  return startPhoneChangeAction(input);
}

/** Verifies the number, then goes on to the next step. */
export async function onboardingConfirmPhone(input: OneTimeCodeInput): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const result = await confirmPhoneChangeAction(input);
  if (!result.ok) return result;
  await syncHelperProfile(db, userId, await requestNow());
  return { ...result, redirectTo: await nextStepAfter(userId, 'phone') };
}

/** The Texas biometric notice, before our own ID check's photos are taken. */
export async function onboardingAcceptIdentityNotice(input: { consent: boolean }): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const origin = originFromHeaders(await headers());
  const result = await acceptIdentityNotice(db, userId, { consent: input?.consent }, await requestNow(), origin);
  if (result.ok) refresh();
  return result;
}

/** Our own ID check's photos (FormData: `documentType`, `front`, `back` unless a passport, `selfie`). */
export async function onboardingSubmitIdentityCapture(form: FormData): Promise<IdentityCaptureResult> {
  const userId = await signedInUserId();
  if (!userId || !(form instanceof FormData)) return { ok: false, code: 'not_allowed' };
  const result = await submitIdentityCapture({ db, storage: fileStorage, files: verificationFileCipher, secret: livenessSecret }, userId, form, await requestNow());
  if (result.ok) refresh();
  return result;
}

/** The provider's hosted check: the double check once our team approved the photos. */
export async function onboardingStartIdentity(input: { consent?: boolean } = {}): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  const origin = originFromHeaders(await headers());
  return startIdentity(db, verificationProviders, userId, await requestNow(), { consent: input?.consent === true, origin });
}

/** Tests ask for the sample addresses, so they never reach Mapbox where a token is set. */
async function geocoderForRequest() {
  const standIn = wantsGeoStandIn((await cookies()).get(GEO_STAND_IN_COOKIE)?.value);
  return standIn && sampleHomeGeocoder ? sampleHomeGeocoder : homeGeocoder;
}

const ADDRESS_SEARCH_RULE = { limit: 120, windowSeconds: 10 * 60 };

/** Home address suggestions for the address step. */
export async function onboardingSearchHomeAddresses(input: { query: string }): Promise<AddressSuggestion[]> {
  const userId = await signedInUserId();
  if (!userId) return [];
  const query = String(input?.query ?? '').slice(0, 120);
  if (query.trim().length < 3) return [];
  const limited = await consumeRateLimit(db, `address-search:user:${userId}`, ADDRESS_SEARCH_RULE);
  if (!limited.ok) throw new Error('Too many address searches; try again in a few minutes.');
  return searchHomeAddresses({ db, geocoder: await geocoderForRequest() }, userId, query);
}

/** The home address with its proof of address (FormData). */
export async function onboardingSubmitAddressProof(form: FormData): Promise<AddressProofResult> {
  const userId = await signedInUserId();
  if (!userId || !(form instanceof FormData)) return { ok: false, code: 'not_allowed' };
  const result = await submitAddressProof({ db, storage: fileStorage, geocoder: await geocoderForRequest(), cipher: verificationCipher }, userId, form, await requestNow());
  if (!result.ok) return result;
  await refreshHelperPages(userId);
  return { ...result, redirectTo: await nextStepAfter(userId, 'address') };
}

export async function onboardingStartPayout(): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  return startPayout(db, verificationProviders, userId, await requestNow());
}

export async function onboardingStartBackgroundCheck(input: { acknowledged?: boolean } = {}): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  const origin = originFromHeaders(await headers());
  return startBackgroundCheck(db, verificationProviders, userId, await requestNow(), { acknowledged: input?.acknowledged === true, origin });
}

/** Provider statuses arrive by webhook; this just re-renders with the latest. */
export async function onboardingRefreshStatus(): Promise<ActionResult> {
  // The payout account's state from Stripe (webhooks can lag a return from its onboarding).
  const userId = await signedInUserId();
  if (userId && verificationProviders) await syncPayoutStatus(db, verificationProviders, userId, await requestNow());
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

/** A client's ID check (asked for by risk): opens the hosted check, coming back to their ID page. */
export async function startPosterIdentityAction(input: { consent?: boolean; next?: string } = {}): Promise<ActionResult> {
  const userId = await signedInUserId();
  if (!userId || !verificationProviders) return { ok: false, code: 'not_allowed' };
  const origin = originFromHeaders(await headers());
  return startPosterIdentity(db, verificationProviders, userId, await requestNow(), { consent: input?.consent === true, origin, ...(typeof input?.next === 'string' ? { next: input.next } : {}) });
}
