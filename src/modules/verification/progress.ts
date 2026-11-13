import type {
  AddressVerificationStatus,
  BackgroundCheckStatus,
  CategorySlug,
  IdentityStatus,
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepState,
  PayoutAccountStatus,
} from '@/contracts';
import { ONBOARDING_STEPS } from '@/contracts';

/**
 * Helper onboarding as a pure function (docs/blueprint/06 §1, extended 2026-11-12). Order: profile (with
 * the helper agreement) → services → area → phone → ID → home address → payout → background check (only
 * when an offered category needs it).
 *
 * Locks: the phone opens once the profile basics are saved; the ID check after the phone; the home
 * address and payouts (side by side) once the ID is verified; the background check once payouts are
 * active. A helper is bookable in a category once the agreement, phone, ID (with its name matched or
 * confirmed), home address and payouts are done and, for in-home categories, a background check is
 * clear (or approved) and current.
 */

export interface OnboardingFacts {
  profileComplete: boolean;
  /** The current helper agreement version is accepted. */
  agreementAccepted: boolean;
  services: { categorySlug: CategorySlug; requiresBackgroundCheck: boolean }[];
  areaSet: boolean;
  phoneVerified: boolean;
  identity: { status: IdentityStatus; cleared: boolean };
  address: { status: AddressVerificationStatus; verified: boolean };
  payout: PayoutAccountStatus;
  background: { status: BackgroundCheckStatus; eligible: boolean };
}

export interface OnboardingResult {
  progress: OnboardingProgress;
  /** The first step still to do, or `done`. */
  firstIncomplete: OnboardingStep;
  backgroundRequired: boolean;
  /** Every required step is done. */
  complete: boolean;
}

export function computeOnboarding(facts: OnboardingFacts, viewing?: OnboardingStep): OnboardingResult {
  const backgroundRequired = facts.services.some((service) => service.requiresBackgroundCheck);
  const identityVerified = facts.identity.status === 'verified';
  const done: Record<OnboardingStep, boolean> = {
    profile: facts.profileComplete && facts.agreementAccepted,
    services: facts.services.length > 0,
    area: facts.areaSet,
    phone: facts.phoneVerified,
    identity: facts.identity.cleared,
    address: facts.address.verified,
    payout: facts.payout === 'active',
    background: !backgroundRequired || facts.background.eligible,
    done: false,
  };
  /** Waiting on the provider or our team. */
  const inReview: Partial<Record<OnboardingStep, boolean>> = {
    identity: facts.identity.status === 'processing' || (identityVerified && !facts.identity.cleared),
    address: facts.address.status === 'in_review',
    payout: facts.payout === 'pending',
    background: facts.background.status === 'invited' || facts.background.status === 'pending' || facts.background.status === 'consider',
  };
  const basics = done.profile && done.services && done.area;
  const locked: Record<OnboardingStep, boolean> = {
    profile: false,
    services: false,
    area: false,
    phone: !basics,
    identity: !basics || !done.phone,
    address: !basics || !done.phone || !identityVerified,
    payout: !basics || !done.phone || !identityVerified,
    background: !basics || !done.phone || !identityVerified || !done.payout,
    done: !(basics && done.phone && identityVerified && done.payout),
  };
  const ready = done.profile && done.phone && done.identity && done.address && done.payout;
  const complete = basics && ready && done.background;
  done.done = complete;

  const bookableCategories = ready
    ? facts.services.filter((service) => !service.requiresBackgroundCheck || facts.background.eligible).map((service) => service.categorySlug)
    : [];

  const firstIncomplete =
    ONBOARDING_STEPS.find((step) => step !== 'done' && !done[step] && !(step === 'background' && !backgroundRequired)) ?? 'done';

  const stateOf = (step: OnboardingStep): OnboardingStepState => {
    if (step === 'background' && !backgroundRequired) return 'skipped';
    if (step === viewing) return 'current';
    if (done[step]) return 'done';
    if (locked[step]) return 'locked';
    return inReview[step] ? 'in_review' : 'todo';
  };

  return {
    progress: {
      steps: ONBOARDING_STEPS.map((step) => ({ step, state: stateOf(step) })),
      bookable: bookableCategories.length > 0,
      bookableCategories,
    },
    firstIncomplete,
    backgroundRequired,
    complete,
  };
}

/** Whether a step may be opened now (locked steps send people to the first step still to do). */
export function canOpenStep(facts: OnboardingFacts, step: OnboardingStep): boolean {
  const { progress } = computeOnboarding(facts);
  const state = progress.steps.find((s) => s.step === step)?.state;
  return state !== 'locked' && state !== 'skipped';
}
