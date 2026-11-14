import type { Cents, RewardProgramCode, RewardProgramView, RewardStatus } from '@/contracts';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * Pure reward rules (blueprint 05 §1–§2). Launch programs: the welcome gift card ($50 for every helper whose phone,
 * ID and background checks have passed; the owner's choice on 2026-11-14) and repeat ($10, paid-bookings
 * version). Acceptance and completion are built later, off at launch. With regular visits, the recurring-month
 * reward (variant B): $15 once per series.
 */

const DAY = 86_400_000;

export const REWARD_RULES = {
  /** No booking, no window, no cohort: the three checks earn it (`welcomeEarnedAt`). */
  welcome: { amountCents: 5000 },
  repeat: { amountCents: 1000, thresholdCents: 2500, needed: 3, windowDays: 90 },
  /** A calendar month (market time) in which every visit of a series, at least 2, was completed and paid. */
  recurringMonth: { amountCents: 1500, minVisits: 2 },
  holdDays: 7,
  redeemDays: 90,
  monthlyCapCents: 7500,
} as const;

/** The checks that earn the welcome gift card, in onboarding order (blueprint 05 §2, 2026-11-14). */
export const WELCOME_CHECKS = ['phone', 'identity', 'background'] as const;
export type WelcomeCheck = (typeof WELCOME_CHECKS)[number];

/** When each check passed (null: not yet): the phone code, the ID (both stages), a clear background check. */
export interface WelcomeFacts {
  phoneVerifiedAt: Date | null;
  idVerifiedAt: Date | null;
  backgroundCheckedAt: Date | null;
}

const CHECK_FACT: Record<WelcomeCheck, keyof WelcomeFacts> = { phone: 'phoneVerifiedAt', identity: 'idVerifiedAt', background: 'backgroundCheckedAt' };

/** The welcome checks that have passed, in order. */
export function welcomeChecksDone(facts: WelcomeFacts): WelcomeCheck[] {
  return WELCOME_CHECKS.filter((check) => facts[CHECK_FACT[check]] !== null);
}

/** The moment the last of the three checks passed (the welcome gift card is earned then), or null. */
export function welcomeEarnedAt(facts: WelcomeFacts): Date | null {
  const times = WELCOME_CHECKS.map((check) => facts[CHECK_FACT[check]]);
  if (times.some((time) => time === null)) return null;
  return new Date(Math.max(...times.map((time) => time!.getTime())));
}

/**
 * Monthly program budgets (blueprint 05 §1.4, as changed on 2026-11-14): a safety valve, never a count of spots.
 * A program with a budget limits how much leaves the waiting line for review in one calendar month (market time);
 * past it, grants wait (pending) and move on, oldest first, when the next month starts. The welcome gift card has
 * none (the owner's choice, 2026-11-14: "no monthly limit"): every card earned goes to staff review within the
 * minute, and the program's switch (`reward.welcome`) is the only limit on spend. The mechanism stays for a
 * budget set later.
 */
export type RewardBudgets = Partial<Record<RewardProgramCode, Cents>>;
export const REWARD_BUDGETS: RewardBudgets = {};
/** Grants that hold part of their program's budget: all but voided and expired ones. */
export const BUDGET_COMMITTED_STATUSES: readonly RewardStatus[] = ['pending', 'qualified', 'in_review', 'redeemable', 'issuing', 'delivered', 'failed'];
/** A welcome grant waiting in line for its month's budget (`qualified`: one earned under the old booking rule). */
export const WELCOME_QUEUED_STATUSES: readonly RewardStatus[] = ['pending', 'qualified'];
/** Welcome grants that left the line: they count against the month they left it in (their `holdUntil`). */
export const WELCOME_RELEASED_STATUSES: readonly RewardStatus[] = ['in_review', 'redeemable', 'issuing', 'delivered', 'failed'];

/**
 * Which waiting welcome grants leave the line now: oldest first, while the month's budget has room for the whole
 * amount (no budget: all of them). `releasedCents`: what already left the line this month.
 */
export function welcomeReleases(queue: readonly { id: string; amountCents: Cents }[], releasedCents: Cents, budgetCents: Cents | undefined): string[] {
  const ids: string[] = [];
  let used = releasedCents;
  for (const grant of queue) {
    if (budgetCents !== undefined && used + grant.amountCents > budgetCents) break;
    used += grant.amountCents;
    ids.push(grant.id);
  }
  return ids;
}

/**
 * What left a program's waiting line in `now`'s calendar month (market time), by when it left (`holdUntil`): the
 * amount that counts against the month's budget. Staff tools and the metrics page use it.
 */
export function releasedThisMonthCents(
  grants: readonly { program: string; status: string; amountCents: Cents; holdUntil?: Date | null }[],
  program: RewardProgramCode,
  now: Date,
): Cents {
  const start = marketMonthStart(now);
  return grants
    .filter((grant) => grant.program === program && (WELCOME_RELEASED_STATUSES as readonly string[]).includes(grant.status) && grant.holdUntil && grant.holdUntil >= start)
    .reduce((total, grant) => total + grant.amountCents, 0);
}

/**
 * The start of the calendar month in market time (America/Chicago) that `now` falls in: the $75 monthly cap
 * counts grants made since then (blueprint 05 §1). At 11 pm on Nov 30 in Austin it's still November, even
 * though it's already December in UTC.
 */
export function marketMonthStart(now: Date): Date {
  return new Date(marketLocalToUtc(`${marketDayKey(now).slice(0, 7)}-01`, '00:00'));
}

/** The start of the next calendar month in market time: when a waiting welcome grant gets the new budget. */
export function nextMarketMonthStart(now: Date): Date {
  const [year, month] = marketDayKey(now).slice(0, 7).split('-').map(Number) as [number, number];
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return new Date(marketLocalToUtc(`${next}-01`, '00:00'));
}

export const LAUNCH_PROGRAMS: RewardProgramView[] = [
  { program: 'welcome', amountCents: REWARD_RULES.welcome.amountCents },
  { program: 'repeat', amountCents: REWARD_RULES.repeat.amountCents, thresholdCents: REWARD_RULES.repeat.thresholdCents },
  { program: 'recurring_month', amountCents: REWARD_RULES.recurringMonth.amountCents },
];

/** One visit of a helper's regular visits, for the recurring-month reward. */
export interface SeriesVisitFact {
  bookingId: string;
  startAt: Date;
  status: string;
  /** The helper's earnings for it were transferred: completed and paid. */
  transferredAt?: Date;
}

/**
 * The recurring-month reward's trigger: the first calendar month (market time) that is over and in which every
 * visit of the series, at least two, was completed and paid. A skipped or canceled visit in a month spoils that
 * month (later months can still qualify). Returns the month's last visit (the grant's booking).
 */
export function recurringMonthTrigger(visits: SeriesVisitFact[], now: Date): SeriesVisitFact | undefined {
  const thisMonth = marketDayKey(now).slice(0, 7);
  const months = new Map<string, SeriesVisitFact[]>();
  for (const visit of [...visits].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    const month = marketDayKey(visit.startAt).slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), visit]);
  }
  for (const [month, inMonth] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    if (month >= thisMonth) break;
    if (inMonth.length < REWARD_RULES.recurringMonth.minVisits) continue;
    if (inMonth.every((visit) => visit.status === 'completed' && visit.transferredAt)) return inMonth.at(-1);
  }
  return undefined;
}

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
 * The next state of a grant from its booking (lazily, when the helper looks at their rewards):
 * - pending, qualified or in review, and the booking was canceled: voided;
 * - pending, and the work was completed and paid: qualified for 7 days (voided if the final price fell
 *   below the program's threshold);
 * - qualified, the hold is over, and no dispute: redeemable for 90 days, or to staff review when a risk signal
 *   says so;
 * - redeemable past its 90 days: expired.
 * Welcome grants follow no booking (2026-11-14): they leave their waiting line for review (`welcomeReleases`),
 * staff make them redeemable, and only the expiry applies here.
 */
export function nextGrantState(grant: GrantFacts, booking: BookingFact | undefined, now: Date): GrantChange | null {
  if (grant.program === 'welcome') return grant.status === 'redeemable' && grant.expiresAt && grant.expiresAt <= now ? { status: 'expired' } : null;
  const open = grant.status === 'pending' || grant.status === 'qualified' || grant.status === 'in_review';
  if (open && booking?.status === 'canceled') return { status: 'voided', voidReason: 'booking_canceled' };
  if (grant.status === 'pending' && booking?.status === 'completed' && booking.transferredAt) {
    // The recurring-month reward has no price threshold (each visit was paid).
    const threshold = grant.program === 'recurring_month' ? 0 : REWARD_RULES.repeat.thresholdCents;
    if ((booking.finalPriceCents ?? booking.priceCents) < threshold) return { status: 'voided', voidReason: 'below_threshold' };
    return { status: 'qualified', holdUntil: new Date(booking.transferredAt.getTime() + REWARD_RULES.holdDays * DAY) };
  }
  if (grant.status === 'qualified' && grant.holdUntil && grant.holdUntil <= now && booking?.status !== 'disputed') {
    // Staff review when a risk signal says so (a self-dealing pair).
    if (grant.needsReview) return { status: 'in_review' };
    return { status: 'redeemable', redeemableAt: grant.holdUntil, expiresAt: new Date(grant.holdUntil.getTime() + REWARD_RULES.redeemDays * DAY) };
  }
  if (grant.status === 'redeemable' && grant.expiresAt && grant.expiresAt <= now) return { status: 'expired' };
  return null;
}

/** The order on the rewards page: ready to redeem, on the way, delivered, then the rest. */
const ORDER: Record<RewardStatus, number> = { redeemable: 0, pending: 1, qualified: 1, in_review: 1, issuing: 1, failed: 1, delivered: 2, voided: 3, expired: 3 };
export const rewardOrder = (status: RewardStatus) => ORDER[status];
