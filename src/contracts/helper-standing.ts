import type { Cents, ISODateTime } from './common';
import type { OnboardingStepState } from './onboarding';
import type { VerificationBadges } from './people';

/**
 * The profile's first page (completion plan 6.5; the owner: "show that $50 gift card and that ID check
 * workflow at the profile first page"): the founding-helper gift card and the verification steps, at the top
 * of the first onboarding step and of the profile editor, and a verification section on the account page.
 */

/** The verification steps, in onboarding order (the profile basics come before them). */
export const VERIFICATION_STEP_IDS = ['phone', 'identity', 'address', 'payout', 'background'] as const;
export type VerificationStepId = (typeof VERIFICATION_STEP_IDS)[number];

/**
 * The $50 founding-helper gift card (blueprint 05 §2: the market's first 100 verified helpers).
 * - `open`: spots are left; finishing `stillNeeded` gives the helper the next founding number.
 * - `yours`: the helper has founding number `number`; the gift card comes with their first completed and paid
 *   task of `minTaskPriceCents` or more, by `claimBy`.
 * - `earned`: the gift card is on its way (pending, unlocking, or ready on the rewards page).
 * Absent when it doesn't apply: the program is off, the spots are gone before the helper got one, or their
 * window passed.
 */
export interface FoundingHelperCard {
  state: 'open' | 'yours' | 'earned';
  amountCents: Cents;
  cohortSize: number;
  spotsLeft: number;
  minTaskPriceCents: Cents;
  windowDays: number;
  /** `yours` and `earned`. */
  number?: number;
  /** `yours`: the first qualifying task has to be done by then (60 days after the ID was verified). */
  claimBy?: ISODateTime;
  /** `open`: the verification steps still to finish, in order. */
  stillNeeded: VerificationStepId[];
  /** Verification steps done of those the helper needs (the background check only for in-home categories). */
  progress: { done: number; total: number };
}

/** Extra data for the profile step of onboarding and for the profile editor. */
export interface HelperStandingView {
  founding?: FoundingHelperCard;
  /** The verification steps the helper needs, in order, with their states. */
  steps: AccountVerification['steps'];
}

/**
 * `AccountPageData.verification`: where the person's checks stand.
 * - Helpers: every verification step with its state (as in onboarding); unfinished steps link to onboarding.
 * - Clients: the phone, and the ID check when our team asked for one or it's done.
 */
export interface AccountVerification {
  role: 'helper' | 'client';
  steps: { step: VerificationStepId; state: OnboardingStepState }[];
  badges: VerificationBadges;
}
