import { pushSetup } from '@/modules/notifications/push';
import { and, asc, eq, inArray, max, notInArray } from 'drizzle-orm';
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
import { marketForZip, OPEN_MARKET_STATUSES } from '@/modules/markets/coverage';
import { getFlags, getMarketView, listCategoryViews } from '@/modules/markets/queries';
import { areas, categories, markets } from '@/modules/markets/schema';
import { fileUrl, initialsOf } from '@/modules/profiles/queries';
import { helperProfiles, helperServices, helperWorkSamples } from '@/modules/profiles/schema';
import { FIRST_PAYOUT_DAYS } from '@/modules/rewards/programs';
import { welcomeCardFor } from '@/modules/rewards/welcome';
import { files } from '@/modules/tasks/schema';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { fieldCipherFromEnv, type FieldCipher } from '@/platform/crypto/field-encryption';
import { normalizeZip, stateOfZip, tidyCityName } from '@/shared/us-zip';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { computeOnboarding } from './progress';
import { serviceDefaultsFor } from './service-defaults';
import { loadOnboardingState, syncHelperProfile, verificationSummary, type OnboardingState } from './state';

/**
 * Helper onboarding and verification (docs/blueprint/06 §1): saving the profile steps, work samples, and
 * the page data. The tracks themselves are in `state.ts` (where each stands), `capture.ts` (our own ID
 * check, stage 1), `tracks.ts` (the provider's ID check, payouts, background checks), `address.ts` (the
 * home address and its proof) and `staff.ts` (reviews). Functions take the database so tests can use
 * their own.
 */

export { createDevVerificationProviders, type VerificationProviders } from './providers';
export { loadOnboardingState, syncHelperProfile } from './state';
export {
  recordBackgroundResult,
  recordIdentityResult,
  recordPayoutAccountStatus,
  recordPayoutStatus,
  startBackgroundCheck,
  startIdentity,
  startPayout,
  syncPayoutStatus,
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

/** Keys the selfie's prompt in our own ID check (the same secret `submitIdentityCapture` gets). */
const promptSecret = () => ({ promptSecret: process.env.BETTER_AUTH_SECRET ?? '' });


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

/**
 * The draft helper profile, created when the first part of setup is saved (plan 9.11: services and area can come
 * before the headline and about me). A draft is invisible to clients until setup makes it active.
 */
async function ensureDraftProfile(db: Db, userId: string): Promise<boolean> {
  const [existing] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (existing) return true;
  const [user] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;
  await db.insert(helperProfiles).values({ userId, handle: await uniqueHandle(db, user.firstName, user.lastName), status: 'draft' }).onConflictDoNothing();
  return true;
}

async function marketIdOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.marketId ?? null;
}

export async function saveHelperServices(db: Db, userId: string, input: HelperServicesInput, now: Date): Promise<ActionResult> {
  const marketId = await marketIdOf(db, userId);
  if (!marketId) return { ok: false, code: 'not_allowed' };
  const categoryViews = await listCategoryViews(marketId, db);
  const parsed = createHelperServicesSchema(categoryViews).safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!(await ensureDraftProfile(db, userId))) return { ok: false, code: 'not_allowed' };

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

/**
 * The area step: a neighborhood in the helper's market, or (owner, 2026-11-14: national, cities open in turn)
 * a ZIP and city anywhere else in the US. Outside every open market the helper waits for their city: they can
 * finish their checks, and aren't bookable until it opens. A ZIP in another city we're open in moves the
 * helper's market there, and they choose a neighborhood in it next.
 */
export async function saveHelperArea(db: Db, userId: string, input: HelperAreaInput, now: Date): Promise<ActionResult> {
  const parsed = helperAreaInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const marketId = await marketIdOf(db, userId);
  const reach = { serviceRadiusKm: Math.round(parsed.data.serviceRadiusMiles * KM_PER_MILE), remoteOk: parsed.data.remoteOk, updatedAt: now.toISOString() };
  let place: Partial<typeof helperProfiles.$inferInsert>;
  if (parsed.data.where === 'elsewhere') {
    const zip = normalizeZip(parsed.data.homeZip ?? '');
    const state = zip ? stateOfZip(zip) : null;
    if (!zip || !state) return fieldError('homeZip', 'not_supported');
    const city = tidyCityName(parsed.data.homeCity);
    if (!city) return fieldError('homeCity', 'invalid');
    const open = await db.select({ id: markets.id, status: markets.status, zipPrefixes: markets.zipPrefixes }).from(markets).where(inArray(markets.status, [...OPEN_MARKET_STATUSES]));
    const covering = marketForZip(open, zip);
    if (covering && covering.id === marketId) return fieldError('homeZip', 'in_market');
    if (covering) await db.update(users).set({ homeMarketId: covering.id, updatedAt: now }).where(eq(users.id, userId));
    place = { areaId: null, homeZip: zip, homeCity: city, homeState: state };
  } else {
    const [area] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, parsed.data.areaId), eq(areas.marketId, marketId ?? ''))).limit(1);
    if (!area) return fieldError('areaId', 'invalid');
    place = { areaId: area.id, homeZip: null, homeCity: null, homeState: null };
  }
  if (!(await ensureDraftProfile(db, userId))) return { ok: false, code: 'not_allowed' };
  const updated = await db
    .update(helperProfiles)
    .set({ ...place, ...reach })
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
    db.select({ id: areas.id, name: areas.name, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, marketId)).orderBy(asc(areas.name)),
  ]);
  return {
    market,
    homeMarket: { name: market.name, zipPrefixes: market.zipPrefixes },
    categories: categoryViews,
    areas: areaRows.map((area) => ({ id: area.id, name: area.name, center: { lat: area.lat, lng: area.lng } })),
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
      // A helper whose city has since opened chooses a neighborhood in it.
      where: !profile?.areaId && state.awaitingCity ? ('elsewhere' as const) : ('market' as const),
      areaId: profile?.areaId ?? '',
      homeZip: profile?.homeZip ?? '',
      homeCity: profile?.homeCity ?? '',
      serviceRadiusMiles: nearestRadius(profile?.serviceRadiusKm ?? 8),
      remoteOk: profile?.remoteOk ?? false,
    },
  };
}

/** Where a helper outside every open market waits, for the screens. */
function waitingFor(state: OnboardingState) {
  return state.awaitingCity ? { awaitingCity: { city: state.awaitingCity.city, state: state.awaitingCity.state } } : {};
}

export async function getOnboardingPageData(db: Db, userId: string, step: OnboardingStep, now: Date): Promise<HelperOnboardingPageData | null> {
  const [state, shared, [person]] = await Promise.all([
    loadOnboardingState(db, userId, now),
    sharedPageData(db, userId),
    db.select({ name: users.name, firstName: users.firstName, lastName: users.lastName, avatarFileId: users.avatarFileId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!shared || !person) return null;
  const result = computeOnboarding(state.facts, step);
  const flags = await getFlags(shared.market.id, db);
  // The $50 welcome gift card and where its three checks stand (blueprint 05 §2, 2026-11-14): every helper earns it.
  const welcomeReward = await welcomeCardFor(db, userId, now, result.progress);
  return {
    step,
    ...(step === 'done' && pushSetup() ? { push: pushSetup()! } : {}),
    progress: result.progress,
    categories: shared.categories,
    areas: shared.areas,
    homeMarket: shared.homeMarket,
    ...waitingFor(state),
    languageOptions: shared.languageOptions,
    values: formValues(state),
    verification: verificationSummary(state, result.backgroundRequired, optionalCipher(), promptSecret()),
    agreementNeeded: !state.facts.agreementAccepted,
    firstPayoutDays: FIRST_PAYOUT_DAYS,
    aiDraftingEnabled: aiWritingSetUp() && flags.ai_drafting === true,
    ...(welcomeReward ? { welcomeReward } : {}),
    // The profile in one flow (plan 9.11): the card's person, the photo's limit, prefilled prices and drafting help.
    person: setupPerson(person),
    userId,
    maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    serviceDefaults: serviceDefaultsFor(shared.categories),
    profileDraft: aiWritingSetUp() && flags.ai_drafting === true ? 'ai' : 'template',
  };
}

/** The person as clients see them on a helper card: first name, "First L.", initials and photo. */
function setupPerson(person: { name: string; firstName: string; lastName: string; avatarFileId: string | null }): HelperOnboardingPageData['person'] {
  return {
    firstName: person.firstName,
    displayName: person.name,
    initials: initialsOf(person.firstName, person.lastName),
    ...(person.avatarFileId ? { photo: avatarPhoto(person.avatarFileId, person.name) } : {}),
  };
}

/** "Write it for me" with Claude, or the written examples without it (plan 9.11). */
async function draftingFor(db: Db, userId: string): Promise<Pick<HelperProfileEditorData, 'aiDraftingEnabled' | 'profileDraft'>> {
  const ai = await aiDraftingEnabledFor(db, userId);
  return { aiDraftingEnabled: ai, profileDraft: ai ? 'ai' : 'template' };
}

/**
 * Where onboarding should be: a locked step, or one not shown at all (the phone without texts, plan 9.2; aa's sweep
 * S2: an old link or tab), opens the first step still to do.
 */
export async function onboardingRedirect(db: Db, userId: string, step: OnboardingStep, now: Date): Promise<OnboardingStep | null> {
  const state = await loadOnboardingState(db, userId, now);
  const result = computeOnboarding(state.facts);
  const stepState = result.progress.steps.find((s) => s.step === step)?.state;
  return stepState === undefined || stepState === 'locked' || stepState === 'skipped' || stepState === 'later' ? result.firstIncomplete : null;
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
    person: setupPerson(person),
    progress: result.progress,
    categories: shared.categories,
    areas: shared.areas,
    homeMarket: shared.homeMarket,
    ...waitingFor(state),
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
    verification: verificationSummary(state, result.backgroundRequired, optionalCipher(), promptSecret()),
    paused: state.profile.status === 'paused',
    // As the public page decides (profiles/queries getHelperProfile): only an active profile has one.
    publicProfile: state.profile.status === 'active',
    ...(await draftingFor(db, userId)),
  };
}

/** The market view for a helper's home market (used by find work). */
export async function helperMarketView(db: Db, userId: string) {
  const marketId = await marketIdOf(db, userId);
  const [market] = marketId ? await db.select().from(markets).where(eq(markets.id, marketId)).limit(1) : [];
  return market ? getMarketView(market, db) : null;
}

