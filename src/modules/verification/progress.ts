import type {
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
 * Helper onboarding as a pure function (docs/blueprint/06 §1). Order: profile → services → area →
 * ID → payout → background check (only when an offered category needs it). The ID check opens once
 * the profile basics are saved, payouts after ID, the background check after payouts. A helper is
 * bookable in a category once ID and payouts are done and, for in-home categories, the background
 * check is clear.
 */

export interface OnboardingFacts {
  profileComplete: boolean;
  services: { categorySlug: CategorySlug; requiresBackgroundCheck: boolean }[];
  areaSet: boolean;
  identity: IdentityStatus;
  payout: PayoutAccountStatus;
  /** The latest check's status (`not_started` when there's none). */
  background: BackgroundCheckStatus;
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
  const done: Record<OnboardingStep, boolean> = {
    profile: facts.profileComplete,
    services: facts.services.length > 0,
    area: facts.areaSet,
    identity: facts.identity === 'verified',
    payout: facts.payout === 'active',
    background: !backgroundRequired || facts.background === 'clear',
    done: false,
  };
  const basics = done.profile && done.services && done.area;
  const locked: Record<OnboardingStep, boolean> = {
    profile: false,
    services: false,
    area: false,
    identity: !basics,
    payout: !basics || !done.identity,
    background: !basics || !done.identity || !done.payout,
    done: !(basics && done.identity && done.payout),
  };
  const complete = basics && done.identity && done.payout && done.background;
  done.done = complete;

  const bookableCategories =
    done.identity && done.payout
      ? facts.services
          .filter((service) => !service.requiresBackgroundCheck || facts.background === 'clear')
          .map((service) => service.categorySlug)
      : [];

  const firstIncomplete =
    ONBOARDING_STEPS.find((step) => step !== 'done' && !done[step] && !(step === 'background' && !backgroundRequired)) ?? 'done';

  const stateOf = (step: OnboardingStep): OnboardingStepState => {
    if (step === 'background' && !backgroundRequired) return 'skipped';
    if (step === viewing) return 'current';
    if (done[step]) return 'done';
    return locked[step] ? 'locked' : 'todo';
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
