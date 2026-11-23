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
import type { PhoneCheck } from '@/modules/accounts/phone-check';

/**
 * Helper onboarding as a pure function (docs/blueprint/06 §1; owner, 2026-11-23: "remove 'You can't post until you
 * setup profile', only make users can't post when they don't setup location profiles (proof of address)" and "Don't
 * care certain step, so I can do background first or can do address check first").
 *
 * Two levels:
 * - **Helping** (`progress.bookable`): the profile basics (the profile with the helper agreement, services, area)
 *   and a verified home address, the location profile. Then the helper sends offers, posts open times, gets task
 *   alerts and can be booked, in every category they offer, except that in-home categories still need a clear (or
 *   approved) and current background check (blueprint 06 D7).
 * - **Verified helper** (`complete`, `progress.verified`): every check is done as well: the phone (where texts work),
 *   the ID (both stages, its name matched or confirmed), payouts and, when an offered category needs it, the
 *   background check.
 *
 * Order: none among the checks. Once the basics are saved, the home address, phone, ID, payouts and background check
 * each open, in any order. Payouts are needed to be paid, not to be booked: earnings wait for an active account
 * (payments/connect.ts transfers only to one).
 *
 * The ID step has two stages (owner, 2026-11-13): our own photos and selfie, which our team compares, then
 * the provider's double check; the provider's result is what verifies.
 *
 * Where: anywhere in the US (owner, 2026-11-23: "remove the limit of Location totally"). A helper outside the
 * market's neighborhoods helps from their city (an area of their market, made on first use), so nobody waits for
 * their city any more.
 *
 * The phone counts only where texts work (`phoneCheck`, plan 9.2): without an SMS provider (`off`) it isn't a step
 * at all; in the grace (`asked`: the helper started their ID check before texts worked) it stays a step to do but
 * isn't needed to be a verified helper.
 */

export interface OnboardingFacts {
  profileComplete: boolean;
  /** The current helper agreement version is accepted. */
  agreementAccepted: boolean;
  services: { categorySlug: CategorySlug; requiresBackgroundCheck: boolean }[];
  areaSet: boolean;
  phoneVerified: boolean;
  /** Whether the phone is asked for or needed (plan 9.2, `phone-check.ts`). Default `required`. */
  phoneCheck?: PhoneCheck;
  /**
   * `captureInReview`: our team has it: our own check's photos (stage 1), a double check that didn't
   * confirm them, or the same ID on another account. `renewal`: a new check was asked for because the ID
   * runs out, while the earlier one still counts (`cleared`; plan 6.3).
   */
  identity: { status: IdentityStatus; cleared: boolean; captureInReview?: boolean; captureApproved?: boolean; renewal?: boolean };
  address: { status: AddressVerificationStatus; verified: boolean };
  payout: PayoutAccountStatus;
  background: { status: BackgroundCheckStatus; eligible: boolean };
}

export interface OnboardingResult {
  progress: OnboardingProgress;
  /** The step to suggest next, or `done`: the home address first while helping isn't open, then the rest in order. */
  firstIncomplete: OnboardingStep;
  backgroundRequired: boolean;
  /** Every check is done: a verified helper. */
  complete: boolean;
}

/** The checks a verified helper passes, in the stepper's order (the reminder counts the ones that apply). */
export const VERIFIED_HELPER_CHECKS = ['address', 'phone', 'identity', 'payout', 'background'] as const satisfies readonly OnboardingStep[];

export function computeOnboarding(facts: OnboardingFacts, viewing?: OnboardingStep): OnboardingResult {
  const backgroundRequired = facts.services.some((service) => service.requiresBackgroundCheck);
  // A renewal's earlier check still counts.
  const identityVerified = facts.identity.status === 'verified' || facts.identity.cleared;
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
    identity: facts.identity.captureInReview === true || facts.identity.status === 'processing' || (identityVerified && !facts.identity.cleared),
    address: facts.address.status === 'in_review',
    payout: facts.payout === 'pending',
    background: facts.background.status === 'invited' || facts.background.status === 'pending' || facts.background.status === 'consider',
  };
  const basics = done.profile && done.services && done.area;
  const phoneCheck = facts.phoneCheck ?? 'required';
  // The phone counts where it's needed: a verified phone, or no texts here, or the grace.
  const phoneOk = done.phone || phoneCheck !== 'required';
  // No texts and no verified phone: the step isn't shown.
  const phoneShown = phoneCheck !== 'off' || done.phone;
  // Helping opens with the basics and the location profile (the verified home address).
  const helping = basics && done.address;
  const locked: Record<OnboardingStep, boolean> = {
    profile: false,
    services: false,
    area: false,
    address: !basics,
    phone: !basics,
    identity: !basics,
    payout: !basics,
    background: !basics,
    // The last page says what helping opens and what's left for the badge.
    done: !helping,
  };
  const complete = helping && phoneOk && done.identity && done.payout && done.background;
  done.done = complete;

  const bookableCategories = helping
    ? facts.services.filter((service) => !service.requiresBackgroundCheck || facts.background.eligible).map((service) => service.categorySlug)
    : [];

  /** A step that still needs the helper (the phone only where it's needed, the background check only when it applies). */
  const toDo = (step: OnboardingStep) =>
    step !== 'done' && !done[step] && !(step === 'background' && !backgroundRequired) && !(step === 'phone' && phoneCheck !== 'required');
  // The location profile first, since it opens helping; while it's with our team, the rest in order.
  const firstIncomplete: OnboardingStep =
    basics && toDo('address') && !inReview.address
      ? 'address'
      : (ONBOARDING_STEPS.find((step) => toDo(step) && !(basics && step === 'address')) ?? (toDo('address') ? 'address' : 'done'));

  const stateOf = (step: OnboardingStep): OnboardingStepState => {
    if (step === 'background' && !backgroundRequired) return 'skipped';
    if (step === viewing) return 'current';
    // Still counting, but a new ID check is due: the step asks for it again.
    if (step === 'identity' && facts.identity.renewal) return inReview.identity ? 'in_review' : 'todo';
    if (done[step]) return 'done';
    if (locked[step]) return 'locked';
    return inReview[step] ? 'in_review' : 'todo';
  };

  // The checks that apply: the phone where it's needed (or already verified), the background check when it applies.
  const checks = VERIFIED_HELPER_CHECKS.filter((step) => (step !== 'background' || backgroundRequired) && (step !== 'phone' || phoneCheck === 'required' || done.phone));
  return {
    progress: {
      steps: ONBOARDING_STEPS.filter((step) => step !== 'phone' || phoneShown).map((step) => ({ step, state: stateOf(step) })),
      bookable: bookableCategories.length > 0,
      bookableCategories,
      verified: complete,
      checks: { done: checks.filter((step) => done[step]).length, total: checks.length },
    },
    firstIncomplete,
    backgroundRequired,
    complete,
  };
}

/** Whether a step may be opened now (locked steps, and ones not shown, send people to the step to do next). */
export function canOpenStep(facts: OnboardingFacts, step: OnboardingStep): boolean {
  const { progress } = computeOnboarding(facts);
  const state = progress.steps.find((s) => s.step === step)?.state;
  return state !== undefined && state !== 'locked' && state !== 'skipped' && state !== 'later';
}
