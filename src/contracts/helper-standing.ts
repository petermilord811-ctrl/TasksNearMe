import type { OnboardingStepState } from './onboarding';
import type { VerificationBadges } from './people';
import type { WelcomeGiftCard } from './rewards';

/**
 * The profile's first page (completion plan 6.5; the owner: "show that $50 gift card and that ID check
 * workflow at the profile first page"): the welcome gift card and the verification steps, at the top of the
 * first onboarding step and of the profile editor, and a verification section on the account page.
 */

/** The verification steps, in onboarding order (the profile basics come before them). */
export const VERIFICATION_STEP_IDS = ['phone', 'identity', 'address', 'payout', 'background'] as const;
export type VerificationStepId = (typeof VERIFICATION_STEP_IDS)[number];

/** Extra data for the profile step of onboarding and for the profile editor. */
export interface HelperStandingView {
  /** The $50 welcome gift card and its three checks (absent when it doesn't apply). */
  giftCard?: WelcomeGiftCard;
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
