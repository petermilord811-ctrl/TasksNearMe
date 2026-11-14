import type {
  AddressSuggestion,
  AreaOption,
  HelperOnboardingHandlers,
  IdentityCaptureSummary,
  HelperOnboardingPageData,
  HelperProfileEditorData,
  HelperProfileEditorHandlers,
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepState,
  VerificationSummary,
  WelcomeGiftCard,
} from '@/contracts';
import { ONBOARDING_STEPS, routes } from '@/contracts';
import { welcomeAlmostCard, welcomeEarnedCard, welcomeOpenCard } from './helper-standing';
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

/** Our own ID check (stage 1): the photos still to take. */
const captureNeeded: IdentityCaptureSummary = { stage: 'needed', canSubmit: true, prompt: 'look_left' };
/** What Priya sent, and when. */
const sentPhotos = { documentType: 'drivers_license', submittedAt: '2026-11-17T13:00:00.000Z' } as const;
/** Our team approved the photos: the double check with the provider is next (or under way). */
const captureApproved: IdentityCaptureSummary = { stage: 'approved', canSubmit: false, ...sentPhotos, prompt: 'smile' };
const captureDone: IdentityCaptureSummary = { stage: 'done', canSubmit: false, ...sentPhotos, prompt: 'smile' };

const notStarted: VerificationSummary = {
  phone: { verified: false },
  identity: { status: 'not_started', consentNeeded: true, capture: captureNeeded },
  address: { status: 'not_started' },
  payout: { status: 'not_started' },
  background: { status: 'not_required', requiredFor: [], disclosureNeeded: true, renewalOpen: false, canStart: false },
};

const phoneDone: VerificationSummary['phone'] = { verified: true, last4: '0204' };
const idVerified: VerificationSummary['identity'] = { status: 'verified', verifiedAt: '2026-11-17T14:00:00.000Z', consentNeeded: false, capture: captureDone };
const addressVerified: VerificationSummary['address'] = {
  status: 'verified',
  verifiedAt: '2026-11-18T15:00:00.000Z',
  label: '1234 Example Lane, Austin, TX 78723',
  submittedAt: '2026-11-17T16:00:00.000Z',
  documentType: 'utility_bill',
};
const cleaningNeedsCheck: VerificationSummary['background'] = { status: 'not_started', requiredFor: ['light-cleaning'], disclosureNeeded: true, renewalOpen: false, canStart: false };

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
  // The welcome gift card before any check: the phone comes first.
  welcomeReward: {
    state: 'open',
    amountCents: 5000,
    checks: [
      { check: 'phone', state: 'todo' },
      { check: 'identity', state: 'locked' },
      { check: 'background', state: 'locked' },
    ],
  } satisfies WelcomeGiftCard,
  aiDraftingEnabled: true,
  agreementNeeded: false,
  homeMarket: { name: 'Austin', zipPrefixes: ['786', '787'] },
};

const lockedAfterBasics: OnboardingStep[] = ['phone', 'identity', 'address', 'payout', 'background', 'done'];

/** A new helper on the first step (the helper agreement still to accept). */
export const onboardingProfileStep: HelperOnboardingPageData = {
  ...base,
  agreementNeeded: true,
  step: 'profile',
  progress: progress('profile', { locked: lockedAfterBasics }),
  values: emptyValues,
  verification: notStarted,
};

export const onboardingServicesStep: HelperOnboardingPageData = {
  ...base,
  step: 'services',
  progress: progress('services', { locked: lockedAfterBasics }),
  values: { ...priyaValues, services: { services: [] } },
  verification: notStarted,
};

export const onboardingAreaStep: HelperOnboardingPageData = {
  ...base,
  step: 'area',
  progress: progress('area', { locked: lockedAfterBasics }),
  values: { ...priyaValues, area: emptyValues.area },
  verification: { ...notStarted, background: cleaningNeedsCheck },
};

/** Somewhere else in the US (owner, 2026-11-14: national, cities open in turn): a ZIP and city instead of a neighborhood. */
export const onboardingAreaElsewhere: HelperOnboardingPageData = {
  ...onboardingAreaStep,
  values: { ...priyaValues, area: { where: 'elsewhere', areaId: '', homeZip: '', homeCity: '', serviceRadiusMiles: 5, remoteOk: false } },
};

/** Priya lives in Dallas: her ZIP and city are saved, and she waits for Dallas to open. */
const dallasArea: HelperOnboardingPageData['values']['area'] = { where: 'elsewhere', areaId: '', homeZip: '75204', homeCity: 'Dallas', serviceRadiusMiles: 12, remoteOk: false };
export const onboardingAreaAwaiting: HelperOnboardingPageData = {
  ...onboardingAreaStep,
  awaitingCity: { city: 'Dallas', state: 'TX' },
  values: { ...priyaValues, area: dallasArea },
};

/** The phone step: a number to add and verify. */
export const onboardingPhoneStep: HelperOnboardingPageData = {
  ...base,
  step: 'phone',
  progress: progress('phone', { locked: ['identity', 'address', 'payout', 'background', 'done'] }),
  values: priyaValues,
  verification: { ...notStarted, background: cleaningNeedsCheck },
};

/** The phone step when the account's number is already verified. */
export const onboardingPhoneVerified: HelperOnboardingPageData = {
  ...onboardingPhoneStep,
  verification: { ...onboardingPhoneStep.verification, phone: phoneDone },
};

/** The ID step, before the Texas biometric notice is accepted (our own check comes first). */
export const onboardingIdentityStep: HelperOnboardingPageData = {
  ...base,
  welcomeReward: { ...welcomeOpenCard, checks: [{ check: 'phone', state: 'done' }, { check: 'identity', state: 'current' }, { check: 'background', state: 'locked' }] },
  step: 'identity',
  progress: progress('identity', { locked: ['address', 'payout', 'background', 'done'] }),
  values: priyaValues,
  verification: { ...notStarted, phone: phoneDone, background: cleaningNeedsCheck },
};

const withIdentity = (identity: VerificationSummary['identity']): HelperOnboardingPageData => ({
  ...onboardingIdentityStep,
  verification: { ...onboardingIdentityStep.verification, identity },
});

/** The notice accepted: the ID's photos and the selfie are next. */
export const onboardingIdentityCapture = withIdentity({ status: 'not_started', consentNeeded: false, capture: captureNeeded });

/** Our team turned the photos down (the selfie didn't follow its prompt): a new try, with a new prompt. */
export const onboardingIdentityCaptureRejected = withIdentity({ status: 'not_started', consentNeeded: false, capture: { ...captureNeeded, ...sentPhotos, rejectionReason: 'prompt_not_followed', prompt: 'tilt_head' } });

/** The photos were sent: our team is comparing them. */
export const onboardingIdentityCaptureInReview = withIdentity({ status: 'not_started', consentNeeded: false, capture: { stage: 'in_review', canSubmit: false, ...sentPhotos, prompt: 'smile' } });

/** Our team approved the photos: the double check with our ID partner is next. */
export const onboardingIdentityCaptureApproved = withIdentity({ status: 'not_started', consentNeeded: false, capture: captureApproved });

/** The double check needs another try (the photos stay approved). */
export const onboardingIdentityRetry = withIdentity({ status: 'requires_input', failureReason: 'document_unreadable', consentNeeded: false, capture: captureApproved });

/** The double check didn't confirm the photos our team approved: paused while our team looks at both. */
export const onboardingIdentityDoubleCheckReview = withIdentity({ status: 'requires_input', failureReason: 'other', consentNeeded: false, blocked: 'double_check_review', capture: captureApproved });

/** Our team then turned the approved photos down: new photos, with a new prompt. */
export const onboardingIdentityDoubleCheckRejected = withIdentity({ status: 'requires_input', failureReason: 'other', consentNeeded: false, capture: { ...captureNeeded, ...sentPhotos, rejectionReason: 'double_check_failed', prompt: 'tilt_head' } });

/** The same ID is on another account (6.3): the double check waits for our team. */
export const onboardingIdentityDuplicateHold = withIdentity({ status: 'not_started', consentNeeded: false, blocked: 'duplicate_id', capture: captureApproved });

/** The ID runs out at the end of November (6.3): a new check is asked for, and the earlier one counts until then. */
export const onboardingIdentityRenewal = withIdentity({
  status: 'not_started',
  consentNeeded: false,
  requested: 'id_expiring',
  renewal: { countsUntil: '2026-12-01T06:00:00.000Z' },
  capture: { ...captureNeeded, prompt: 'look_up' },
});

/** The month ended before a new check passed: offers are paused until one does. */
export const onboardingIdentityExpired = withIdentity({ status: 'not_started', consentNeeded: false, requested: 'id_expired', capture: { ...captureNeeded, prompt: 'look_up' } });

/** The double check was sent; the provider is still processing. */
export const onboardingIdentityProcessing = withIdentity({ status: 'processing', consentNeeded: false, capture: captureApproved });

/** 3 tries today (photos turned down): the next one opens tomorrow. */
export const onboardingIdentityTryLater = withIdentity({
  status: 'not_started',
  consentNeeded: false,
  blocked: 'try_later',
  retryAt: '2026-11-18T15:30:00.000Z',
  capture: { ...captureNeeded, ...sentPhotos, canSubmit: false, rejectionReason: 'document_unreadable' },
});

/** 5 tries without a pass: our team looks at it. */
export const onboardingIdentityTooMany = withIdentity({ status: 'not_started', consentNeeded: false, blocked: 'too_many_attempts', capture: { ...captureNeeded, ...sentPhotos, canSubmit: false, rejectionReason: 'selfie_mismatch' } });

/** The ID says under 18: helper onboarding is closed. */
export const onboardingIdentityUnder18 = withIdentity({ status: 'not_started', consentNeeded: false, blocked: 'under_18', capture: { ...captureNeeded, ...sentPhotos, canSubmit: false, rejectionReason: 'under_18' } });

/** Verified, but the ID's name differs from the account's: staff are checking it. */
export const onboardingIdentityNameCheck: HelperOnboardingPageData = {
  ...onboardingIdentityStep,
  progress: progress('identity', { locked: ['background', 'done'] }),
  verification: { ...onboardingIdentityStep.verification, identity: { ...idVerified, nameCheck: 'in_review' } },
};

/** Staff asked for a new ID check: new photos first. */
export const onboardingIdentityRequested = withIdentity({ status: 'not_started', consentNeeded: false, requested: 'staff_request', capture: captureNeeded });

/** Verified: both stages done. */
export const onboardingIdentityVerified: HelperOnboardingPageData = {
  ...onboardingIdentityStep,
  progress: progress('identity', { locked: ['background', 'done'] }),
  verification: { ...onboardingIdentityStep.verification, identity: idVerified },
};

/** The home address step, nothing sent yet. */
export const onboardingAddressStep: HelperOnboardingPageData = {
  ...base,
  step: 'address',
  progress: progress('address', { locked: ['background', 'done'] }),
  values: priyaValues,
  verification: { ...notStarted, phone: phoneDone, identity: idVerified, background: cleaningNeedsCheck },
};

export const onboardingAddressInReview: HelperOnboardingPageData = {
  ...onboardingAddressStep,
  verification: {
    ...onboardingAddressStep.verification,
    address: { status: 'in_review', label: '1234 Example Lane, Austin, TX 78723', submittedAt: '2026-11-17T16:00:00.000Z', documentType: 'utility_bill' },
  },
};

export const onboardingAddressRejected: HelperOnboardingPageData = {
  ...onboardingAddressStep,
  verification: {
    ...onboardingAddressStep.verification,
    address: { status: 'rejected', label: '1234 Example Lane, Austin, TX 78723', submittedAt: '2026-11-17T16:00:00.000Z', documentType: 'bank_statement', rejectionReason: 'too_old' },
  },
};

export const onboardingAddressVerified: HelperOnboardingPageData = {
  ...onboardingAddressStep,
  verification: { ...onboardingAddressStep.verification, address: addressVerified },
};

/** A move: the new proof is in review while the earlier verification still counts. */
export const onboardingAddressUpdate: HelperOnboardingPageData = {
  ...onboardingAddressStep,
  verification: { ...onboardingAddressStep.verification, address: { ...addressVerified, update: { status: 'in_review' } } },
};

/** Staff asked for a new proof. */
export const onboardingAddressRequested: HelperOnboardingPageData = {
  ...onboardingAddressStep,
  verification: { ...onboardingAddressStep.verification, address: { status: 'requested' } },
};

/** Home address suggestions for previews and tests (fictional). */
export const homeAddressSuggestions: AddressSuggestion[] = [
  { placeId: 'plc_example_lane', line1: '1234 Example Lane', line2: 'Austin, TX 78723', areaName: 'Mueller', inServiceArea: true },
  { placeId: 'plc_example_lane_unit', line1: '1234 Example Lane Unit B', line2: 'Austin, TX 78723', areaName: 'Mueller', inServiceArea: true },
  { placeId: 'plc_example_far', line1: '1234 Example Road', line2: 'Waco, TX 76701', inServiceArea: false },
];

const readyForPayout: VerificationSummary = { ...notStarted, phone: phoneDone, identity: idVerified, address: addressVerified, background: cleaningNeedsCheck };

export const onboardingPayoutStep: HelperOnboardingPageData = {
  ...base,
  step: 'payout',
  progress: progress('payout', { locked: ['background', 'done'] }),
  values: priyaValues,
  verification: readyForPayout,
};

/** Stripe needs more information before payouts can start. */
export const onboardingPayoutActionNeeded: HelperOnboardingPageData = {
  ...onboardingPayoutStep,
  verification: { ...onboardingPayoutStep.verification, payout: { status: 'requirements_due' } },
};

const backgroundBase: VerificationSummary = { ...readyForPayout, payout: { status: 'active' } };

/** Yard work is bookable now; cleaning waits for the background check. */
export const onboardingBackgroundPending: HelperOnboardingPageData = {
  ...base,
  welcomeReward: welcomeAlmostCard,
  step: 'background',
  progress: progress('background', { bookableCategories: ['yard-cleanup'] }),
  values: priyaValues,
  verification: { ...backgroundBase, background: { status: 'pending', requiredFor: ['light-cleaning'], disclosureNeeded: false, renewalOpen: false, canStart: false } },
};

/** Before the disclosure is acknowledged. */
export const onboardingBackgroundNotStarted: HelperOnboardingPageData = {
  ...onboardingBackgroundPending,
  verification: { ...backgroundBase, background: { ...cleaningNeedsCheck, canStart: true } },
};

const withBackground = (background: Partial<VerificationSummary['background']>): HelperOnboardingPageData => ({
  ...onboardingBackgroundPending,
  verification: { ...backgroundBase, background: { status: 'pending', requiredFor: ['light-cleaning'], disclosureNeeded: false, renewalOpen: false, canStart: false, ...background } },
});

export const onboardingBackgroundInvited = withBackground({ status: 'invited', invitationExpiresAt: '2026-11-24T16:00:00.000Z' });
export const onboardingBackgroundReview = withBackground({ status: 'consider' });
export const onboardingBackgroundPreAdverse = withBackground({ status: 'consider', adjudication: 'pre_adverse', disputeUntil: '2026-11-25T16:00:00.000Z' });
export const onboardingBackgroundPostAdverse = withBackground({ status: 'consider', adjudication: 'post_adverse' });
export const onboardingBackgroundEngaged: HelperOnboardingPageData = {
  ...withBackground({ status: 'consider', adjudication: 'engaged', checkedAt: '2026-11-19T16:00:00.000Z', validUntil: '2027-11-19T16:00:00.000Z' }),
  progress: progress('background', { bookableCategories: ['light-cleaning', 'yard-cleanup'] }),
};
/** The current check runs out in 3 weeks: the renewal can start. */
export const onboardingBackgroundRenewal: HelperOnboardingPageData = {
  ...withBackground({ status: 'clear', checkedAt: '2025-12-10T16:00:00.000Z', validUntil: '2026-12-10T16:00:00.000Z', renewalOpen: true, canStart: true }),
  progress: progress('background', { bookableCategories: ['light-cleaning', 'yard-cleanup'] }),
};
export const onboardingBackgroundSuspended = withBackground({ status: 'suspended' });

/** Jordan: everything done, bookable in every category he offers; the welcome gift card earned. */
export const onboardingDone: HelperOnboardingPageData = {
  ...base,
  welcomeReward: welcomeEarnedCard,
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
    phone: { verified: true, last4: '0201' },
    // Verified before our own check existed: nothing to capture.
    identity: { status: 'verified', verifiedAt: '2026-11-10T16:00:00.000Z', consentNeeded: false, capture: { stage: 'done', canSubmit: false, prompt: 'look_up' } },
    address: { ...addressVerified, label: '5678 Example Street, Austin, TX 78702' },
    payout: { status: 'active' },
    background: { status: 'clear', checkedAt: '2026-11-12T16:00:00.000Z', requiredFor: ['furniture-assembly', 'moving-help'], disclosureNeeded: false, validUntil: '2027-11-12T16:00:00.000Z', renewalOpen: false, canStart: false },
  },
};

/** Steps for a helper waiting for their city: everything before `pending` done, the home address `later`. */
function awaitingProgress(pending: OnboardingStep[] = []): OnboardingProgress {
  return {
    steps: ONBOARDING_STEPS.map((step) => ({ step, state: step === 'address' ? 'later' : step === 'done' ? 'current' : pending.includes(step) ? 'todo' : 'done' })),
    bookable: false,
    bookableCategories: [],
  };
}

/**
 * Done while waiting for Dallas (owner, 2026-11-14): the phone, ID, payouts and background check are done; the
 * home address waits until Dallas opens, and nothing is bookable yet.
 */
export const onboardingDoneAwaitingCity: HelperOnboardingPageData = {
  ...onboardingDone,
  progress: awaitingProgress(),
  awaitingCity: { city: 'Dallas', state: 'TX' },
  values: { ...onboardingDone.values, area: dallasArea },
  verification: { ...onboardingDone.verification, address: { status: 'not_started' } },
};

/** Waiting for Dallas with the background check still to do. */
export const onboardingDoneAwaitingCityPending: HelperOnboardingPageData = {
  ...onboardingDoneAwaitingCity,
  progress: awaitingProgress(['background']),
  verification: { ...onboardingDoneAwaitingCity.verification, background: { status: 'not_started', requiredFor: ['furniture-assembly', 'moving-help'], disclosureNeeded: true, renewalOpen: false, canStart: true } },
};

/** The profile photo Sam can add in the editor (previews). */
export const samProfilePhoto = { id: 'fil_avatar_sam', src: '/samples/avatar-sam.svg', alt: 'Sam K.', width: 512, height: 512 };

/** Sam's profile editor. */
export const samProfileEditorData: HelperProfileEditorData = {
  handle: sam.handle,
  // No profile photo yet (the editor offers to add one).
  person: { displayName: sam.displayName, initials: sam.initials },
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
    phone: { verified: true, last4: '0202' },
    identity: { status: 'verified', verifiedAt: sam.badges.idVerifiedAt!, consentNeeded: false, capture: { stage: 'done', canSubmit: false, prompt: 'look_right' } },
    address: { status: 'verified', verifiedAt: '2026-01-11T16:00:00.000Z', label: '4321 Example Avenue, Austin, TX 78751', documentType: 'lease' },
    payout: { status: 'active' },
    background: { status: 'clear', checkedAt: sam.badges.backgroundCheckedAt!, requiredFor: ['furniture-assembly', 'moving-help', 'light-cleaning'], disclosureNeeded: false, validUntil: '2027-01-12T16:00:00.000Z', renewalOpen: false, canStart: false },
  },
  paused: false,
  aiDraftingEnabled: true,
};

/** What "Write it for me" drafts for Sam in previews and tests. */
export const samProfileDraft = {
  headline: 'Careful flat-pack assembly and moving help in Hyde Park',
  bio: [
    "Hi, I'm Sam. I put together desks, beds and bookshelves, and I help neighbors load and unload moving trucks.",
    "I bring my own cordless drill, bits and moving straps, and I clean up when I'm done.",
    'I speak English and Spanish.',
  ].join('\n\n'),
};

const wait = <T,>(value: T, ms = 500) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const nextStepUrl = (step: Parameters<typeof routes.app.helperOnboarding>[0]) => routes.app.helperOnboarding(step);

export const fakeOnboardingHandlers: HelperOnboardingHandlers = {
  onDraftProfile: () => wait({ ok: true, draft: samProfileDraft }, 900),
  onSaveProfile: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('services') }),
  onSaveServices: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('area') }),
  onSaveArea: () => wait({ ok: true, code: 'saved', redirectTo: nextStepUrl('phone') }),
  onStartPhone: () => wait({ ok: true, code: 'sent' }),
  onConfirmPhone: () => wait({ ok: true, code: 'updated', redirectTo: nextStepUrl('identity') }),
  onAcceptIdentityNotice: () => wait({ ok: true, code: 'updated' }),
  onSubmitIdentityCapture: () => wait({ ok: true, code: 'submitted' }, 900),
  onStartIdentity: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/identity' }),
  onSearchAddresses: () => wait(homeAddressSuggestions, 300),
  onSubmitAddressProof: () => wait({ ok: true, code: 'submitted', redirectTo: nextStepUrl('payout') }, 800),
  onStartPayout: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/payout' }),
  onStartBackgroundCheck: () => wait({ ok: true, code: 'updated', redirectTo: '/dev/providers/background' }),
  onRefreshStatus: () => wait({ ok: true, code: 'updated' }),
};

export const fakeProfileEditorHandlers: HelperProfileEditorHandlers = {
  onSaveProfile: () => wait({ ok: true, code: 'saved' }),
  onDraftProfile: () => wait({ ok: true, draft: samProfileDraft }, 900),
  onSaveServices: () => wait({ ok: true, code: 'saved' }),
  onSaveArea: () => wait({ ok: true, code: 'saved' }),
  onSaveTools: () => wait({ ok: true, code: 'saved' }),
  onUploadWorkSample: () =>
    wait({ ok: true, sample: samProfilePageData.workSamples[0]!, photo: samProfilePageData.workSamples[0]!.photo }, 700),
  onUpdateWorkSample: () => wait({ ok: true, code: 'updated' }),
  onRemoveWorkSample: () => wait({ ok: true, code: 'updated' }),
  onReorderWorkSamples: () => wait({ ok: true, code: 'updated' }),
  onSetPaused: () => wait({ ok: true, code: 'updated' }),
  onUploadPhoto: () => wait({ ok: true, photo: samProfilePhoto }, 700),
  onRemovePhoto: () => wait({ ok: true, code: 'updated' }),
};
