import type {
  AreaOption,
  HelperOnboardingHandlers,
  HelperOnboardingPageData,
  HelperProfileEditorData,
  HelperProfileEditorHandlers,
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepState,
  VerificationSummary,
} from '@/contracts';
import { ONBOARDING_STEPS, routes } from '@/contracts';
import { categoryViews } from './marketing';
import { jordan, sam } from './people';
import { samProfilePageData } from './profiles';

/** Helper onboarding at every step, and Sam's profile editor. */

export const austinAreaOptions: AreaOption[] = [
  { id: 'area_allandale', name: 'Allandale' },
  { id: 'area_cherrywood', name: 'Cherrywood' },
  { id: 'area_circle_c', name: 'Circle C' },
  { id: 'area_crestview', name: 'Crestview' },
  { id: 'area_downtown', name: 'Downtown' },
  { id: 'area_east_austin', name: 'East Austin' },
  { id: 'area_hyde_park', name: 'Hyde Park' },
  { id: 'area_mueller', name: 'Mueller' },
  { id: 'area_north_loop', name: 'North Loop' },
  { id: 'area_travis_heights', name: 'Travis Heights' },
  { id: 'area_windsor_park', name: 'Windsor Park' },
  { id: 'area_zilker', name: 'Zilker' },
];

export const languageOptions: HelperOnboardingPageData['languageOptions'] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ko', name: 'Korean' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' },
];

/** Steps before `current` are done; after it, todo (or locked once a provider step blocks them). */
function progress(
  current: OnboardingStep,
  options: { skipped?: OnboardingStep[]; locked?: OnboardingStep[]; bookableCategories?: OnboardingProgress['bookableCategories'] } = {},
): OnboardingProgress {
  const index = ONBOARDING_STEPS.indexOf(current);
  return {
    steps: ONBOARDING_STEPS.map((step, i): { step: OnboardingStep; state: OnboardingStepState } => ({
      step,
      state: options.skipped?.includes(step)
        ? 'skipped'
        : i < index
          ? 'done'
          : i === index
            ? current === 'done'
              ? 'done'
              : 'current'
            : options.locked?.includes(step)
              ? 'locked'
              : 'todo',
    })),
    bookable: (options.bookableCategories?.length ?? 0) > 0,
    bookableCategories: options.bookableCategories ?? [],
  };
}

const notStarted: VerificationSummary = {
  identity: { status: 'not_started' },
  payout: { status: 'not_started' },
  background: { status: 'not_required', requiredFor: [] },
};

const emptyValues: HelperOnboardingPageData['values'] = {
  profile: { headline: '', bio: '', languages: ['en'] },
  services: { services: [] },
  area: { areaId: '', serviceRadiusMiles: 5, remoteOk: false },
};

const priyaValues: HelperOnboardingPageData['values'] = {
  profile: {
    headline: 'Tidy, careful cleaning in Mueller',
    bio: 'I clean homes the way I clean my own: kitchens, bathrooms, and floors, with my own eco-friendly supplies.',
    languages: ['en', 'hi'],
  },
  services: {
    services: [
      { categorySlug: 'light-cleaning', pricingType: 'fixed', fromPriceCents: 9000, description: 'Kitchens, bathrooms, and floors.' },
      { categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: 'Leaves and weeding.' },
    ],
  },
  area: { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false },
};

const base = {
  categories: categoryViews,
  areas: austinAreaOptions,
  languageOptions,
  firstPayoutDays: 7,
  welcomeReward: { amountCents: 5000, minTaskPriceCents: 4000, windowDays: 60 },
};

/** A new helper on the first step. */
export const onboardingProfileStep: HelperOnboardingPageData = {
  ...base,
  step: 'profile',
  progress: progress('profile', { locked: ['identity', 'payout', 'background', 'done'] }),
  values: emptyValues,
  verification: notStarted,
};

export const onboardingServicesStep: HelperOnboardingPageData = {
  ...base,
  step: 'services',
  progress: progress('services', { locked: ['identity', 'payout', 'background', 'done'] }),
  values: { ...priyaValues, services: { services: [] } },
  verification: notStarted,
};

export const onboardingAreaStep: HelperOnboardingPageData = {
  ...base,
  step: 'area',
  progress: progress('area', { locked: ['identity', 'payout', 'background', 'done'] }),
  values: { ...priyaValues, area: emptyValues.area },
  verification: { ...notStarted, background: { status: 'not_started', requiredFor: ['light-cleaning'] } },
};

export const onboardingIdentityStep: HelperOnboardingPageData = {
  ...base,
  step: 'identity',
  progress: progress('identity', { locked: ['payout', 'background', 'done'] }),
  values: priyaValues,
  verification: { ...notStarted, background: { status: 'not_started', requiredFor: ['light-cleaning'] } },
};

/** The ID check needs another try. */
export const onboardingIdentityRetry: HelperOnboardingPageData = {
  ...onboardingIdentityStep,
  verification: {
    ...onboardingIdentityStep.verification,
    identity: { status: 'requires_input', failureReason: 'document_unreadable' },
  },
};

/** Submitted; Stripe is still processing. */
export const onboardingIdentityProcessing: HelperOnboardingPageData = {
  ...onboardingIdentityStep,
  verification: { ...onboardingIdentityStep.verification, identity: { status: 'processing' } },
};

export const onboardingPayoutStep: HelperOnboardingPageData = {
  ...base,
  step: 'payout',
  progress: progress('payout', { locked: ['background', 'done'] }),
  values: priyaValues,
  verification: {
    identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z' },
    payout: { status: 'not_started' },
    background: { status: 'not_started', requiredFor: ['light-cleaning'] },
  },
};

/** Stripe needs more information before payouts can start. */
export const onboardingPayoutActionNeeded: HelperOnboardingPageData = {
  ...onboardingPayoutStep,
  verification: { ...onboardingPayoutStep.verification, payout: { status: 'requirements_due' } },
};

/** Yard work is bookable now; cleaning waits for the background check. */
export const onboardingBackgroundPending: HelperOnboardingPageData = {
  ...base,
  step: 'background',
  progress: progress('background', { bookableCategories: ['yard-cleanup'] }),
  values: priyaValues,
  verification: {
    identity: { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z' },
    payout: { status: 'active' },
    background: { status: 'pending', requiredFor: ['light-cleaning'] },
  },
};

export const onboardingBackgroundNotStarted: HelperOnboardingPageData = {
  ...onboardingBackgroundPending,
  verification: { ...onboardingBackgroundPending.verification, background: { status: 'not_started', requiredFor: ['light-cleaning'] } },
};

/** Jordan: everything done, bookable in every category he offers. */
export const onboardingDone: HelperOnboardingPageData = {
  ...base,
  step: 'done',
  progress: progress('done', { bookableCategories: ['furniture-assembly', 'moving-help', 'yard-cleanup'] }),
  values: {
    profile: { headline: jordan.headline, bio: 'New to TasksNearMe and happy to help around East Austin.', languages: ['en'] },
    services: {
      services: jordan.services.map((service) => ({
        categorySlug: service.categorySlug,
        pricingType: service.pricingType,
        ...(service.fromPriceCents !== undefined ? { fromPriceCents: service.fromPriceCents } : {}),
        ...(service.hourlyRateCents !== undefined ? { hourlyRateCents: service.hourlyRateCents } : {}),
        ...(service.minHours !== undefined ? { minHours: service.minHours } : {}),
        description: '',
      })),
    },
    area: { areaId: 'area_east_austin', serviceRadiusMiles: 5, remoteOk: false },
  },
  verification: {
    identity: { status: 'verified', verifiedAt: '2026-11-10T16:00:00.000Z' },
    payout: { status: 'active' },
    background: { status: 'clear', checkedAt: '2026-11-12T16:00:00.000Z', requiredFor: ['furniture-assembly', 'moving-help'] },
  },
};

/** Sam's profile editor. */
export const samProfileEditorData: HelperProfileEditorData = {
  handle: sam.handle,
  progress: progress('done', { bookableCategories: sam.services.map((s) => s.categorySlug) }),
  categories: categoryViews,
  areas: austinAreaOptions,
  languageOptions,
  values: {
    profile: { headline: sam.headline, bio: samProfilePageData.bio, languages: ['en', 'es'] },
    services: {
      services: samProfilePageData.services.map((service) => ({
        categorySlug: service.categorySlug,
        pricingType: service.pricingType,
        ...(service.fromPriceCents !== undefined ? { fromPriceCents: service.fromPriceCents } : {}),
        ...(service.hourlyRateCents !== undefined ? { hourlyRateCents: service.hourlyRateCents } : {}),
        ...(service.minHours !== undefined ? { minHours: service.minHours } : {}),
        description: service.description,
      })),
    },
    area: { areaId: 'area_hyde_park', serviceRadiusMiles: 5, remoteOk: false },
    tools: { tools: samProfilePageData.tools },
  },
  workSamples: samProfilePageData.workSamples,
  maxWorkSamples: 12,
  maxPhotoMegabytes: 10,
  badges: sam.badges,
  verification: {
    identity: { status: 'verified', verifiedAt: sam.badges.idVerifiedAt! },
    payout: { status: 'active' },
    background: { status: 'clear', checkedAt: sam.badges.backgroundCheckedAt!, requiredFor: ['furniture-assembly', 'moving-help', 'light-cleaning'] },
  },
  paused: false,
};

const wait = <T,>(value: T, ms = 500) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const nextStepUrl = (step: Parameters<typeof routes.app.helperOnboarding>[0]) => routes.app.helperOnboarding(step);

export const fakeOnboardingHandlers: HelperOnboardingHandlers = {
  onSaveProfile: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('services') }),
  onSaveServices: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('area') }),
  onSaveArea: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('identity') }),
  onStartIdentity: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/identity' }),
  onStartPayout: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/payout' }),
  onStartBackgroundCheck: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/background' }),
  onRefreshStatus: () => wait({ ok: true, code: 'updated' }),
};

export const fakeProfileEditorHandlers: HelperProfileEditorHandlers = {
  onSaveProfile: () => wait({ ok: true, code: 'saved' }),
  onSaveServices: () => wait({ ok: true, code: 'saved' }),
  onSaveArea: () => wait({ ok: true, code: 'saved' }),
  onSaveTools: () => wait({ ok: true, code: 'saved' }),
  onUploadWorkSample: () =>
    wait({ ok: true, sample: samProfilePageData.workSamples[0]!, photo: samProfilePageData.workSamples[0]!.photo }, 700),
  onUpdateWorkSample: () => wait({ ok: true, code: 'updated' }),
  onRemoveWorkSample: () => wait({ ok: true, code: 'updated' }),
  onReorderWorkSamples: () => wait({ ok: true, code: 'updated' }),
  onSetPaused: () => wait({ ok: true, code: 'updated' }),
};
