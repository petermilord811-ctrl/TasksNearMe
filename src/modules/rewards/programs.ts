import type { Cents } from '@/contracts';

/**
 * Helper reward programs at launch (docs/blueprint/05 §2). Turned on and off per market with the
 * `reward.welcome` and `reward.repeat` feature flags. Amounts and windows move into versioned
 * program config when the rewards module lands (Phase 7); until then these are the only values.
 */

export interface WelcomeProgram {
  amountCents: Cents;
  /** The first N verified helpers in the market (founding cohort). */
  cohortLimit: number;
  minTaskPriceCents: Cents;
  /** The qualifying booking must happen within this many days of verification. */
  windowDays: number;
  unlockDays: number;
  redeemWithinDays: number;
}

export interface RepeatProgram {
  amountCents: Cents;
  bookingsNeeded: number;
  withinDays: number;
  minTaskPriceCents: Cents;
  unlockDays: number;
  redeemWithinDays: number;
}

export const WELCOME_PROGRAM: WelcomeProgram = {
  amountCents: 5000,
  cohortLimit: 100,
  minTaskPriceCents: 4000,
  windowDays: 60,
  unlockDays: 7,
  redeemWithinDays: 90,
};

export const REPEAT_PROGRAM: RepeatProgram = {
  amountCents: 1000,
  bookingsNeeded: 3,
  withinDays: 90,
  minTaskPriceCents: 2500,
  unlockDays: 7,
  redeemWithinDays: 90,
};

/** Stripe's usual first payout for a new US connected account (blueprint 04 §5). */
export const FIRST_PAYOUT_DAYS = 7;
