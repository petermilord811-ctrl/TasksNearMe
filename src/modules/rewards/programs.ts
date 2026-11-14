import { WELCOME_GIFT_CHECKS, type Cents, type WelcomeGiftCheck } from '@/contracts';

/**
 * Helper reward programs at launch (docs/blueprint/05 §2). Turned on and off per market with the
 * `reward.welcome` and `reward.repeat` feature flags. Amounts and windows move into versioned
 * program config when the rewards module lands (Phase 7); until then these are the only values.
 */

/** The welcome gift card (2026-11-14): every helper whose three checks pass. No cohort, no first task. */
export interface WelcomeProgram {
  amountCents: Cents;
  /** The checks that earn it, in order. */
  checks: readonly WelcomeGiftCheck[];
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
  checks: WELCOME_GIFT_CHECKS,
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
