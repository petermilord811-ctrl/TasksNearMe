import { and, asc, eq, max, notInArray } from 'drizzle-orm';
import type {
  ActionResult,
  CategorySlug,
  HelperAreaInput,
  HelperOnboardingPageData,
  HelperProfileEditorData,
  HelperProfileInput,
  HelperServicesInput,
  HelperToolsInput,
  LanguageCode,
  OnboardingStep,
  WorkSampleUploadResult,
} from '@/contracts';
import {
  createHelperServicesSchema,
  helperAreaInputSchema,
  helperProfileInputSchema,
  helperToolsInputSchema,
  LANGUAGE_CODES,
  SERVICE_RADIUS_MILES,
} from '@/contracts';
import type { FileStorage } from '@/integrations/storage';
import { recordAgreement, type RequestOrigin } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { avatarPhoto, MAX_PHOTO_BYTES } from '@/modules/files/photos';
import { storePhoto } from '@/modules/files/uploads';
import { aiWritingSetUp } from '@/integrations/ai';
import { aiDraftingEnabledFor } from '@/modules/assist/availability';
import { getFlags, getMarketView, listCategoryViews } from '@/modules/markets/queries';
import { areas, categories, markets } from '@/modules/markets/schema';
import { countFoundingHelpers, fileUrl, initialsOf } from '@/modules/profiles/queries';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { FIRST_PAYOUT_DAYS, WELCOME_PROGRAM } from '@/modules/rewards/programs';
import { files } from '@/modules/tasks/schema';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { fieldCipherFromEnv, type FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { computeOnboarding } from './progress';
import { loadOnboardingState, syncHelperProfile, verificationSummary, type OnboardingState } from './state';

/**
 * Helper onboarding and verification (docs/blueprint/06 §1): saving the profile steps, work samples, and
 * the page data. The tracks themselves are in `state.ts` (where each stands), `tracks.ts` (ID, payouts,
 * background checks), `address.ts` (the home address and its proof) and `staff.ts` (reviews). Functions
 * take the database so tests can use their own.
 */

export { createDevVerificationProviders, type VerificationProviders } from './providers';
export { loadOnboardingState, syncHelperProfile } from './state';
export {
  recordBackgroundResult,
  recordIdentityResult,
  recordPayoutStatus,
  startBackgroundCheck,
  startIdentity,
  startPayout,
  type BackgroundResult,
  type IdentityResult,
} from './tracks';

const KM_PER_MILE = 1.609344;
const MAX_WORK_SAMPLES = 12;
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** The app's cipher, when the key is set (the person's own address label needs it). */
function optionalCipher(): FieldCipher | null {
  try {
    return fieldCipherFromEnv();
  } catch {
    return null;
  }
}


// ---- Saving the profile ---------------------------------------------------------------------------

async function uniqueHandle(db: Db, firstName: string, lastName: string): Promise<string> {
  const base = `${firstName}-${lastName.charAt(0)}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '') || 'helper';
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db.select({ id: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.handle, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Saves the profile basics. From onboarding (`requireAgreement`), the helper agreement must be accepted
 * once per version: with the save, or before.
 */
export async function saveHelperProfile(
  db: Db,
  userId: string,
  input: HelperProfileInput,
  now: Date,
  options: { requireAgreement?: boolean; origin?: RequestOrigin } = {},
): Promise<ActionResult> {
  const parsed = helperProfileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { headline, bio, languages, acceptHelperAgreement } = parsed.data;
  if (acceptHelperAgreement === true) await recordAgreement(db, userId, 'helper_agreement', options.origin ?? {}, now);
  else if (options.requireAgreement && !(await loadOnboardingState(db, userId, now)).facts.agreementAccepted) {
    return fieldError('acceptHelperAgreement', 'must_accept');
  }
  const [existing] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (existing) {
    await db.update(helperProfiles).set({ headline, bio, languages, updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, userId));
  } else {
    const [user] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { ok: false, code: 'not_found' };
    await db.insert(helperProfiles).values({
      userId,
      handle: await uniqueHandle(db, user.firstName, user.lastName),
      headline,
      bio,
      languages,
      status: 'draft',
    });
  }
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'saved' };
}

async function marketIdOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.marketId ?? null;
}

export async function saveHelperServices(db: Db, userId: string, input: HelperServicesInput, now: Date): Promise<ActionResult> {
  const marketId = await marketIdOf(db, userId);
  const [profile] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (!marketId || !profile) return { ok: false, code: 'not_allowed' };
  const categoryViews = await listCategoryViews(marketId, db);
  const parsed = createHelperServicesSchema(categoryViews).safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);

  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const idOf = new Map(categoryRows.map((row) => [row.slug, row.id]));
  const keptIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const service of parsed.data.services) {
      const categoryId = idOf.get(service.categorySlug)!;
      keptIds.push(categoryId);
      const row = {
        id: `svc_${userId.slice(4)}_${categoryId.slice(4)}`,
        userId,
        categoryId,
        pricingType: service.pricingType,
        fromPriceCents: service.pricingType === 'fixed' ? (service.fromPriceCents ?? null) : null,
        hourlyRateCents: service.pricingType === 'hourly' ? (service.hourlyRateCents ?? null) : null,
        minHours: service.pricingType === 'hourly' ? (service.minHours ?? null) : null,
        description: service.description,
        status: 'active',
      };
      await tx
        .insert(helperServices)
        .values(row)
        .onConflictDoUpdate({ target: [helperServices.userId, helperServices.categoryId], set: row });
    }
    await tx
      .update(helperServices)
      .set({ status: 'inactive' })
      .where(and(eq(helperServices.userId, userId), notInArray(helperServices.categoryId, keptIds)));
  });
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'saved' };
}

export async function saveHelperArea(db: Db, userId: string, input: HelperAreaInput, now: Date): Promise<ActionResult> {
  const parsed = helperAreaInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const marketId = await marketIdOf(db, userId);
  const [area] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, parsed.data.areaId), eq(areas.marketId, marketId ?? ''))).limit(1);
  if (!area) return fieldError('areaId', 'invalid');
  const updated = await db
    .update(helperProfiles)
    .set({
      areaId: area.id,
      serviceRadiusKm: Math.round(parsed.data.serviceRadiusMiles * KM_PER_MILE),
      remoteOk: parsed.data.remoteOk,
      updatedAt: now.toISOString(),
    })
    .where(eq(helperProfiles.userId, userId))
    .returning({ userId: helperProfiles.userId });
  if (updated.length === 0) return { ok: false, code: 'not_allowed' };
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'saved' };
}

export async function saveHelperTools(db: Db, userId: string, input: HelperToolsInput, now: Date): Promise<ActionResult> {
  const parsed = helperToolsInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  await db.update(helperProfiles).set({ tools: parsed.data.tools, updatedAt: now.toISOString() }).where(eq(helperProfiles.userId, userId));
  return { ok: true, code: 'saved' };
}

/** Paused profiles don't appear in search or receive invites. Resuming recomputes the status. */
export async function setHelperPaused(db: Db, userId: string, paused: boolean, now: Date): Promise<ActionResult> {
  const [profile] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (!profile || profile.status === 'suspended') return { ok: false, code: 'not_allowed' };
  await db
    .update(helperProfiles)
    .set({ status: paused ? 'paused' : 'draft', updatedAt: now.toISOString() })
    .where(eq(helperProfiles.userId, userId));
  if (!paused) await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'updated' };
}

// ---- Work samples ---------------------------------------------------------------------------------

async function workSampleViews(db: Db, userId: string) {
  const rows = await db
    .select({ sample: helperWorkSamples, file: files, categorySlug: categories.slug })
    .from(helperWorkSamples)
    .innerJoin(files, eq(files.id, helperWorkSamples.fileId))
    .leftJoin(categories, eq(categories.id, helperWorkSamples.categoryId))
    .where(eq(helperWorkSamples.userId, userId))
    .orderBy(asc(helperWorkSamples.position));
  return rows.map(({ sample, file, categorySlug }) => ({
    id: sample.id,
    photo: { id: file.id, src: fileUrl(file), alt: file.alt, width: file.width, height: file.height },
    ...(categorySlug ? { categorySlug: categorySlug as CategorySlug } : {}),
    ...(sample.caption ? { caption: sample.caption } : {}),
  }));
}

export async function addWorkSample(
  deps: { db: Db; storage: FileStorage },
  userId: string,
  form: FormData,
  now: Date,
): Promise<WorkSampleUploadResult> {
  const { db } = deps;
  const existing = await db.select({ id: helperWorkSamples.id }).from(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
  if (existing.length >= MAX_WORK_SAMPLES) return { ok: false, code: 'too_many' };
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, code: 'unsupported_type' };
  const caption = String(form.get('caption') ?? '').trim().slice(0, 120);
  const categorySlug = String(form.get('categorySlug') ?? '');
  const uploaded = await storePhoto(deps, { userId, kind: 'work_sample', file, alt: caption });
  if (!uploaded.ok) return uploaded;
  const [category] = categorySlug ? await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug)).limit(1) : [];
  const [position] = await db.select({ value: max(helperWorkSamples.position) }).from(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
  const id = newId('ws');
  await db.insert(helperWorkSamples).values({
    id,
    userId,
    fileId: uploaded.photo.id,
    categoryId: category?.id ?? null,
    caption: caption || null,
    position: (position?.value ?? -1) + 1,
    createdAt: now,
  });
  const sample = (await workSampleViews(db, userId)).find((s) => s.id === id)!;
  return { ok: true, photo: sample.photo, sample };
}

export async function updateWorkSample(db: Db, userId: string, input: { id: string; caption?: string; categorySlug?: CategorySlug }): Promise<ActionResult> {
  const [category] = input.categorySlug ? await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, input.categorySlug)).limit(1) : [];
  const updated = await db
    .update(helperWorkSamples)
    .set({
      ...(input.caption !== undefined ? { caption: input.caption.trim().slice(0, 120) || null } : {}),
      ...(input.categorySlug !== undefined ? { categoryId: category?.id ?? null } : {}),
    })
    .where(and(eq(helperWorkSamples.id, input.id), eq(helperWorkSamples.userId, userId)))
    .returning({ id: helperWorkSamples.id });
  return updated.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

export async function removeWorkSample(db: Db, userId: string, id: string): Promise<ActionResult> {
  const removed = await db
    .delete(helperWorkSamples)
    .where(and(eq(helperWorkSamples.id, id), eq(helperWorkSamples.userId, userId)))
    .returning({ id: helperWorkSamples.id });
  return removed.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

export async function reorderWorkSamples(db: Db, userId: string, ids: string[]): Promise<ActionResult> {
  const owned = await db.select({ id: helperWorkSamples.id }).from(helperWorkSamples).where(eq(helperWorkSamples.userId, userId));
  const ownedIds = new Set(owned.map((row) => row.id));
  if (ids.length !== ownedIds.size || ids.some((id) => !ownedIds.has(id))) return { ok: false, code: 'validation_failed' };
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(helperWorkSamples).set({ position }).where(eq(helperWorkSamples.id, id));
    }
  });
  return { ok: true, code: 'updated' };
}

// ---- Page data ------------------------------------------------------------------------------------

/** The radius option (miles) a stored kilometre radius came from. */
export function nearestRadius(km: number): (typeof SERVICE_RADIUS_MILES)[number] {
  const miles = km / KM_PER_MILE;
  return SERVICE_RADIUS_MILES.reduce((best, option) => (Math.abs(option - miles) < Math.abs(best - miles) ? option : best));
}

async function sharedPageData(db: Db, userId: string) {
  const marketId = await marketIdOf(db, userId);
  if (!marketId) return null;
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!market) return null;
  const [categoryViews, areaRows] = await Promise.all([
    listCategoryViews(marketId, db),
    db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.marketId, marketId)).orderBy(asc(areas.name)),
  ]);
  return {
    market,
    categories: categoryViews,
    areas: areaRows,
    languageOptions: LANGUAGE_CODES.map((code) => ({ code, name: languageNames.of(code) ?? code })),
  };
}

function formValues(state: OnboardingState) {
  const profile = state.profile;
  return {
    profile: {
      headline: profile?.headline ?? '',
      bio: profile?.bio ?? '',
      languages: (profile?.languages.filter((code): code is LanguageCode => (LANGUAGE_CODES as readonly string[]).includes(code)) ?? ['en']) as LanguageCode[],
    },
    services: {
      services: state.serviceRows.map(({ service, category }) => ({
        categorySlug: category.slug as CategorySlug,
        pricingType: service.pricingType as 'fixed' | 'hourly',
        ...(service.fromPriceCents !== null ? { fromPriceCents: service.fromPriceCents } : {}),
        ...(service.hourlyRateCents !== null ? { hourlyRateCents: service.hourlyRateCents } : {}),
        ...(service.minHours !== null ? { minHours: service.minHours } : {}),
        description: service.description,
      })),
    },
    area: {
      areaId: profile?.areaId ?? '',
      serviceRadiusMiles: nearestRadius(profile?.serviceRadiusKm ?? 8),
      remoteOk: profile?.remoteOk ?? false,
    },
  };
}

export async function getOnboardingPageData(db: Db, userId: string, step: OnboardingStep, now: Date): Promise<HelperOnboardingPageData | null> {
  const [state, shared] = await Promise.all([loadOnboardingState(db, userId, now), sharedPageData(db, userId)]);
  if (!shared) return null;
  const result = computeOnboarding(state.facts, step);
  const flags = await getFlags(shared.market.id, db);
  const spots = await countFoundingHelpers(shared.market.id, db);
  const welcomeOpen = flags['reward.welcome'] === true && spots < WELCOME_PROGRAM.cohortLimit && !state.profile?.foundingNumber;
  return {
    step,
    progress: result.progress,
    categories: shared.categories,
    areas: shared.areas,
    languageOptions: shared.languageOptions,
    values: formValues(state),
    verification: verificationSummary(state, result.backgroundRequired, optionalCipher()),
    agreementNeeded: !state.facts.agreementAccepted,
    firstPayoutDays: FIRST_PAYOUT_DAYS,
    aiDraftingEnabled: aiWritingSetUp() && flags.ai_drafting === true,
    ...(welcomeOpen
      ? { welcomeReward: { amountCents: WELCOME_PROGRAM.amountCents, minTaskPriceCents: WELCOME_PROGRAM.minTaskPriceCents, windowDays: WELCOME_PROGRAM.windowDays } }
      : {}),
  };
}

/** Where onboarding should be: a locked step opens the first step still to do. */
export async function onboardingRedirect(db: Db, userId: string, step: OnboardingStep, now: Date): Promise<OnboardingStep | null> {
  const state = await loadOnboardingState(db, userId, now);
  const result = computeOnboarding(state.facts);
  const stepState = result.progress.steps.find((s) => s.step === step)?.state;
  return stepState === 'locked' || stepState === 'skipped' ? result.firstIncomplete : null;
}

export async function getProfileEditorData(db: Db, userId: string, now: Date): Promise<HelperProfileEditorData | null> {
  const [state, shared, [person]] = await Promise.all([
    loadOnboardingState(db, userId, now),
    sharedPageData(db, userId),
    db.select({ name: users.name, firstName: users.firstName, lastName: users.lastName, avatarFileId: users.avatarFileId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!shared || !state.profile || !person) return null;
  const result = computeOnboarding(state.facts);
  return {
    handle: state.profile.handle,
    person: {
      displayName: person.name,
      initials: initialsOf(person.firstName, person.lastName),
      ...(person.avatarFileId ? { photo: avatarPhoto(person.avatarFileId, person.name) } : {}),
    },
    progress: result.progress,
    categories: shared.categories,
    areas: shared.areas,
    languageOptions: shared.languageOptions,
    values: { ...formValues(state), tools: { tools: state.profile.tools } },
    workSamples: await workSampleViews(db, userId),
    maxWorkSamples: MAX_WORK_SAMPLES,
    maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    badges: {
      ...(state.profile.idVerifiedAt ? { idVerifiedAt: new Date(state.profile.idVerifiedAt).toISOString() } : {}),
      ...(state.profile.backgroundCheckedAt ? { backgroundCheckedAt: new Date(state.profile.backgroundCheckedAt).toISOString() } : {}),
      ...(state.profile.addressVerifiedAt ? { addressVerifiedAt: new Date(state.profile.addressVerifiedAt).toISOString() } : {}),
      phoneVerified: state.facts.phoneVerified,
    },
    verification: verificationSummary(state, result.backgroundRequired, optionalCipher()),
    paused: state.profile.status === 'paused',
    aiDraftingEnabled: await aiDraftingEnabledFor(db, userId),
  };
}

/** The market view for a helper's home market (used by find work). */
export async function helperMarketView(db: Db, userId: string) {
  const marketId = await marketIdOf(db, userId);
  const [market] = marketId ? await db.select().from(markets).where(eq(markets.id, marketId)).limit(1) : [];
  return market ? getMarketView(market, db) : null;
}

