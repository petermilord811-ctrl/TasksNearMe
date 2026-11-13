import { and, asc, desc, eq, max, notInArray } from 'drizzle-orm';
import type {
  ActionResult,
  BackgroundCheckStatus,
  CategorySlug,
  HelperAreaInput,
  HelperOnboardingPageData,
  HelperProfileEditorData,
  HelperProfileInput,
  HelperServicesInput,
  HelperToolsInput,
  IdentityFailureReason,
  IdentityStatus,
  LanguageCode,
  OnboardingStep,
  PayoutAccountStatus,
  VerificationSummary,
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
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { computeOnboarding, type OnboardingFacts } from './progress';
import { backgroundChecks, identityVerifications, payoutAccounts } from './schema';

/** Helper onboarding and verification (docs/blueprint/06 §1). Functions take the database so tests can use their own. */

const KM_PER_MILE = 1.609344;
const BACKGROUND_VALID_DAYS = 365;
const MAX_WORK_SAMPLES = 12;
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

export interface VerificationProviders {
  /** Starts a hosted flow and returns its URL (a dev stand-in in development). */
  identity: { start(userId: string): Promise<{ sessionId: string; url: string }> };
  payout: { start(userId: string): Promise<{ accountId: string; url: string }> };
  background: { start(userId: string): Promise<{ ref: string; url: string }> };
}

/** Development stand-ins: pages under /dev/providers simulate the provider and its webhook. */
export function createDevVerificationProviders(): VerificationProviders {
  return {
    identity: {
      async start() {
        const sessionId = newId('vs_dev');
        return { sessionId, url: `/dev/providers/identity?session=${sessionId}` };
      },
    },
    payout: {
      async start(userId) {
        const accountId = `acct_dev_${userId.slice(4)}`;
        return { accountId, url: '/dev/providers/payout' };
      },
    },
    background: {
      async start() {
        const ref = newId('chk_dev');
        return { ref, url: `/dev/providers/background?check=${ref}` };
      },
    },
  };
}

// ---- Facts and the cached profile state ---------------------------------------------------------

async function latestIdentity(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(identityVerifications)
    .where(eq(identityVerifications.userId, userId))
    .orderBy(desc(identityVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

async function latestBackground(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(backgroundChecks)
    .where(eq(backgroundChecks.userId, userId))
    .orderBy(desc(backgroundChecks.createdAt))
    .limit(1);
  return row ?? null;
}

export async function loadOnboardingState(db: Db, userId: string, now: Date) {
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  const serviceRows = await db
    .select({ service: helperServices, category: categories })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active')))
    .orderBy(asc(categories.sortOrder));
  const [identity, payout, background] = await Promise.all([
    latestIdentity(db, userId),
    db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1),
    latestBackground(db, userId),
  ]);
  const backgroundStatus: BackgroundCheckStatus = !background
    ? 'not_started'
    : background.status === 'clear' && background.expiresAt && background.expiresAt <= now
      ? 'expired'
      : (background.status as BackgroundCheckStatus);

  const facts: OnboardingFacts = {
    profileComplete: Boolean(profile && profile.headline.trim() && profile.bio.trim() && profile.languages.length > 0),
    services: serviceRows.map(({ category }) => ({
      categorySlug: category.slug as CategorySlug,
      requiresBackgroundCheck: category.requiresBackgroundCheck,
    })),
    areaSet: Boolean(profile?.areaId),
    identity: (identity?.status as IdentityStatus | undefined) ?? 'not_started',
    payout: (payout[0]?.status as PayoutAccountStatus | undefined) ?? 'not_started',
    background: backgroundStatus,
  };
  return { profile: profile ?? null, serviceRows, identity, payout: payout[0] ?? null, background, facts };
}

/**
 * Recomputes what the profile shows from the three tracks: status (draft until bookable; paused
 * and suspended stay as they are) and the badge dates.
 */
export async function syncHelperProfile(db: Db, userId: string, now: Date): Promise<void> {
  const state = await loadOnboardingState(db, userId, now);
  if (!state.profile) return;
  const { progress } = computeOnboarding(state.facts);
  const keep = state.profile.status === 'paused' || state.profile.status === 'suspended';
  await db
    .update(helperProfiles)
    .set({
      status: keep ? state.profile.status : progress.bookable ? 'active' : 'draft',
      idVerifiedAt: state.identity?.status === 'verified' && state.identity.verifiedAt ? state.identity.verifiedAt.toISOString() : null,
      backgroundCheckedAt:
        state.facts.background === 'clear' && state.background?.completedAt ? state.background.completedAt.toISOString() : null,
      payoutsReadyAt: state.payout?.status === 'active' && state.payout.activatedAt ? state.payout.activatedAt.toISOString() : null,
      updatedAt: now.toISOString(),
    })
    .where(eq(helperProfiles.userId, userId));
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

export async function saveHelperProfile(db: Db, userId: string, input: HelperProfileInput, now: Date): Promise<ActionResult> {
  const parsed = helperProfileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { headline, bio, languages } = parsed.data;
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

// ---- Provider flows -------------------------------------------------------------------------------

export async function startIdentity(db: Db, providers: VerificationProviders, userId: string, now: Date): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  if (!computeOnboarding(state.facts).progress.steps.some((s) => s.step === 'identity' && s.state !== 'locked')) {
    return { ok: false, code: 'not_allowed' };
  }
  if (state.facts.identity === 'verified') return { ok: false, code: 'not_allowed' };
  const { sessionId, url } = await providers.identity.start(userId);
  await db.insert(identityVerifications).values({
    id: newId('idv'),
    userId,
    provider: 'dev',
    providerSessionId: sessionId,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, code: 'updated', redirectTo: url };
}

export async function startPayout(db: Db, providers: VerificationProviders, userId: string, now: Date): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  if (state.facts.identity !== 'verified') return { ok: false, code: 'not_allowed' };
  const { accountId, url } = await providers.payout.start(userId);
  if (!state.payout) {
    await db.insert(payoutAccounts).values({ userId, provider: 'dev', providerAccountId: accountId, status: 'pending', createdAt: now, updatedAt: now });
  }
  return { ok: true, code: 'updated', redirectTo: url };
}

export async function startBackgroundCheck(db: Db, providers: VerificationProviders, userId: string, now: Date): Promise<ActionResult> {
  const state = await loadOnboardingState(db, userId, now);
  const { backgroundRequired } = computeOnboarding(state.facts);
  if (state.facts.payout !== 'active' || !backgroundRequired) return { ok: false, code: 'not_allowed' };
  if (['invited', 'pending', 'clear', 'consider'].includes(state.facts.background)) return { ok: false, code: 'not_allowed' };
  const { ref, url } = await providers.background.start(userId);
  await db.insert(backgroundChecks).values({ id: newId('bgc'), userId, provider: 'dev', providerRef: ref, status: 'invited', createdAt: now, updatedAt: now });
  return { ok: true, code: 'updated', redirectTo: url };
}

/** Provider results (webhooks; the dev stand-in pages call these). */
export async function recordIdentityResult(
  db: Db,
  sessionId: string,
  result: { status: 'verified' } | { status: 'requires_input'; reason: IdentityFailureReason } | { status: 'processing' },
  now: Date,
): Promise<string | null> {
  const [row] = await db.select().from(identityVerifications).where(eq(identityVerifications.providerSessionId, sessionId)).limit(1);
  if (!row) return null;
  await db
    .update(identityVerifications)
    .set({
      status: result.status,
      failureReason: result.status === 'requires_input' ? result.reason : null,
      isAdult: result.status === 'verified' ? true : result.status === 'requires_input' && result.reason === 'under_18' ? false : null,
      verifiedAt: result.status === 'verified' ? now : null,
      updatedAt: now,
    })
    .where(eq(identityVerifications.id, row.id));
  await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: `identity.${result.status}`, targetType: 'user', targetId: row.userId });
  await syncHelperProfile(db, row.userId, now);
  return row.userId;
}

export async function recordPayoutStatus(db: Db, userId: string, status: PayoutAccountStatus, now: Date): Promise<void> {
  await db
    .update(payoutAccounts)
    .set({ status, activatedAt: status === 'active' ? now : null, updatedAt: now })
    .where(eq(payoutAccounts.userId, userId));
  await syncHelperProfile(db, userId, now);
}

export async function recordBackgroundResult(
  db: Db,
  ref: string,
  status: Extract<BackgroundCheckStatus, 'pending' | 'clear' | 'consider'>,
  now: Date,
): Promise<string | null> {
  const [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.providerRef, ref)).limit(1);
  if (!row) return null;
  await db
    .update(backgroundChecks)
    .set({
      status,
      completedAt: status === 'clear' || status === 'consider' ? now : null,
      expiresAt: status === 'clear' ? new Date(now.getTime() + BACKGROUND_VALID_DAYS * 86_400_000) : null,
      updatedAt: now,
    })
    .where(eq(backgroundChecks.id, row.id));
  await db.insert(auditLog).values({ id: newId('aud'), actorRole: 'system', action: `background.${status}`, targetType: 'user', targetId: row.userId });
  await syncHelperProfile(db, row.userId, now);
  return row.userId;
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

function summary(state: Awaited<ReturnType<typeof loadOnboardingState>>, backgroundRequired: boolean): VerificationSummary {
  return {
    identity: {
      status: state.facts.identity,
      ...(state.identity?.verifiedAt ? { verifiedAt: state.identity.verifiedAt.toISOString() } : {}),
      ...(state.identity?.status === 'requires_input' && state.identity.failureReason
        ? { failureReason: state.identity.failureReason as IdentityFailureReason }
        : {}),
    },
    payout: { status: state.facts.payout },
    background: {
      status: backgroundRequired ? state.facts.background : 'not_required',
      ...(state.facts.background === 'clear' && state.background?.completedAt ? { checkedAt: state.background.completedAt.toISOString() } : {}),
      requiredFor: state.facts.services.filter((s) => s.requiresBackgroundCheck).map((s) => s.categorySlug),
    },
  };
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

function formValues(state: Awaited<ReturnType<typeof loadOnboardingState>>) {
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
    verification: summary(state, result.backgroundRequired),
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
      phoneVerified: true,
    },
    verification: summary(state, result.backgroundRequired),
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

