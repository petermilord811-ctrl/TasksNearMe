import type { RewardProgramView, RewardStatus } from '@/contracts';

/**
 * Pure reward rules (blueprint 05 §1–§2). Launch programs: welcome ($50, founding cohort) and repeat
 * ($10, paid-bookings version). Acceptance and completion are built later, off at launch.
 */

const DAY = 86_400_000;

export const REWARD_RULES = {
  welcome: { amountCents: 5000, thresholdCents: 4000, cohortSize: 100, windowDays: 60 },
  repeat: { amountCents: 1000, thresholdCents: 2500, needed: 3, windowDays: 90 },
  holdDays: 7,
  redeemDays: 90,
  monthlyCapCents: 7500,
} as const;

export const LAUNCH_PROGRAMS: RewardProgramView[] = [
  { program: 'welcome', amountCents: REWARD_RULES.welcome.amountCents, thresholdCents: REWARD_RULES.welcome.thresholdCents },
  { program: 'repeat', amountCents: REWARD_RULES.repeat.amountCents, thresholdCents: REWARD_RULES.repeat.thresholdCents },
];

/** Bookings that were paid for (funded) and not canceled. */
export const FUNDED_STATUSES = ['confirmed', 'in_progress', 'completion_submitted', 'completed', 'disputed'] as const;

/** What the rules need to know about one of the helper's bookings. */
export interface BookingFact {
  id: string;
  title: string;
  posterUserId: string;
  status: string;
  fundedAt: Date;
  /** The agreed task price (fees, expenses and tips excluded). */
  priceCents: number;
  /** The final task price once completed. */
  finalPriceCents?: number;
  /** When the helper's earnings were transferred (the work is completed and paid). */
  transferredAt?: Date;
}

const funded = (booking: BookingFact) => (FUNDED_STATUSES as readonly string[]).includes(booking.status);
const byFundedAt = (a: BookingFact, b: BookingFact) => a.fundedAt.getTime() - b.fundedAt.getTime();

/** The first funded booking of $40 or more within 60 days of the ID check. */
export function welcomeCandidate(bookings: BookingFact[], verifiedAt: Date): BookingFact | undefined {
  const windowEnd = verifiedAt.getTime() + REWARD_RULES.welcome.windowDays * DAY;
  return bookings
    .filter((booking) => funded(booking) && booking.priceCents >= REWARD_RULES.welcome.thresholdCents && booking.fundedAt >= verifiedAt && booking.fundedAt.getTime() <= windowEnd)
    .sort(byFundedAt)[0];
}

/** Funded bookings of $25 or more with one client, oldest first. */
function qualifyingWith(bookings: BookingFact[], posterUserId: string): BookingFact[] {
  return bookings.filter((booking) => booking.posterUserId === posterUserId && funded(booking) && booking.priceCents >= REWARD_RULES.repeat.thresholdCents).sort(byFundedAt);
}

/** The booking that makes three with one client within 90 days of the first of them, if any. */
export function repeatTrigger(bookings: BookingFact[], posterUserId: string): BookingFact | undefined {
  const list = qualifyingWith(bookings, posterUserId);
  for (let i = 0; i < list.length; i += 1) {
    const windowEnd = list[i]!.fundedAt.getTime() + REWARD_RULES.repeat.windowDays * DAY;
    const inWindow = list.slice(i).filter((booking) => booking.fundedAt.getTime() <= windowEnd);
    if (inWindow.length >= REWARD_RULES.repeat.needed) return inWindow[REWARD_RULES.repeat.needed - 1];
  }
  return undefined;
}

/** Progress toward the repeat reward with one client: the current window, if it hasn't ended. */
export function repeatProgress(bookings: BookingFact[], posterUserId: string, now: Date): { paidBookings: number; windowEndsAt: Date } | undefined {
  const list = qualifyingWith(bookings, posterUserId);
  for (let i = 0; i < list.length; i += 1) {
    const windowEnd = list[i]!.fundedAt.getTime() + REWARD_RULES.repeat.windowDays * DAY;
    if (windowEnd < now.getTime()) continue;
    const count = list.slice(i).filter((booking) => booking.fundedAt.getTime() <= windowEnd).length;
    return { paidBookings: Math.min(count, REWARD_RULES.repeat.needed), windowEndsAt: new Date(windowEnd) };
  }
  return undefined;
}

export interface GrantFacts {
  program: string;
  status: RewardStatus;
  holdUntil: Date | null;
  expiresAt: Date | null;
  /** A risk signal that needs staff (a shared card, a new client account: T-25). */
  needsReview?: boolean;
}

export type GrantChange =
  | { status: 'voided'; voidReason: 'booking_canceled' | 'below_threshold' }
  | { status: 'qualified'; holdUntil: Date }
  | { status: 'in_review' }
  | { status: 'redeemable'; redeemableAt: Date; expiresAt: Date }
  | { status: 'expired' };

/**
 * The next state of a grant from its booking (lazily, until the job runner exists):
 * - pending, qualified or in review, and the booking was canceled: voided;
 * - pending, and the work was completed and paid: qualified for 7 days (voided if the final price fell
 *   below the program's threshold);
 * - qualified, the hold is over, and no dispute: welcome rewards go to review (every one at launch),
 *   the others become redeemable for 90 days;
 * - redeemable past its 90 days: expired.
 */
export function nextGrantState(grant: GrantFacts, booking: BookingFact | undefined, now: Date): GrantChange | null {
  const open = grant.status === 'pending' || grant.status === 'qualified' || grant.status === 'in_review';
  if (open && booking?.status === 'canceled') return { status: 'voided', voidReason: 'booking_canceled' };
  if (grant.status === 'pending' && booking?.status === 'completed' && booking.transferredAt) {
    const threshold = grant.program === 'welcome' ? REWARD_RULES.welcome.thresholdCents : REWARD_RULES.repeat.thresholdCents;
    if ((booking.finalPriceCents ?? booking.priceCents) < threshold) return { status: 'voided', voidReason: 'below_threshold' };
    return { status: 'qualified', holdUntil: new Date(booking.transferredAt.getTime() + REWARD_RULES.holdDays * DAY) };
  }
  if (grant.status === 'qualified' && grant.holdUntil && grant.holdUntil <= now && booking?.status !== 'disputed') {
    // Welcome rewards are always reviewed; others when a risk signal says so (a self-dealing pair).
    if (grant.program === 'welcome' || grant.needsReview) return { status: 'in_review' };
    return { status: 'redeemable', redeemableAt: grant.holdUntil, expiresAt: new Date(grant.holdUntil.getTime() + REWARD_RULES.redeemDays * DAY) };
  }
  if (grant.status === 'redeemable' && grant.expiresAt && grant.expiresAt <= now) return { status: 'expired' };
  return null;
}

/** The order on the rewards page: ready to redeem, on the way, delivered, then the rest. */
const ORDER: Record<RewardStatus, number> = { redeemable: 0, pending: 1, qualified: 1, in_review: 1, issuing: 1, failed: 1, delivered: 2, voided: 3, expired: 3 };
export const rewardOrder = (status: RewardStatus) => ORDER[status];
