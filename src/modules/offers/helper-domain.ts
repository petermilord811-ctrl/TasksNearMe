import type {
  ActionDescriptor,
  CategorySlug,
  DistanceBand,
  FindWorkDistance,
  OfferActionId,
  OfferBlockedReason,
  OfferRules,
  OfferStatus,
  PricingInput,
  TaskStatus,
  TimeZone,
} from '@/contracts';
import { marketClockTime, marketDayKey } from '@/shared/format';

/**
 * The helper's side of offers as pure rules (blueprint 02 J2, 03 §3): who may offer on what,
 * the form's rules, expiry, and the actions on the helper's own offer.
 */

/** An offer expires at the task window start or after 72 h, whichever is first. */
export const OFFER_TTL_HOURS = 72;
/** At most 25 active (pending or stale) offers per helper. */
export const MAX_ACTIVE_OFFERS = 25;
export const OFFER_MESSAGE_MAX_LENGTH = 500;
const STEP_MS = 30 * 60_000;
const KM_PER_MILE = 1.609344;

export const kmToMiles = (km: number) => km / KM_PER_MILE;

export function offerExpiresAt(windowStart: Date, now: Date): Date {
  return new Date(Math.min(windowStart.getTime(), now.getTime() + OFFER_TTL_HOURS * 3_600_000));
}

/** A distance shown as a band, never exact (blueprint 02 J2: "~2 mi"). */
export function distanceBandOf(miles: number): DistanceBand {
  if (miles < 0.75) return 'under-1-mi';
  if (miles < 1.5) return 'about-1-mi';
  if (miles < 3.5) return 'about-2-mi';
  if (miles < 7.5) return 'about-5-mi';
  return 'over-5-mi';
}

/** The feed's distance filter in miles; `any` → no limit. */
export function maxMilesOf(distance: FindWorkDistance): number | null {
  switch (distance) {
    case 'within_2_mi':
      return 2;
    case 'within_5_mi':
      return 5;
    case 'within_10_mi':
      return 10;
    default:
      return null;
  }
}

export interface HelperOfferFacts {
  userId: string;
  /** Categories the helper can be booked for now (ID, payouts, and background check where needed). */
  bookableCategories: readonly CategorySlug[];
  /** Categories the helper lists as services. */
  offeredCategories: readonly CategorySlug[];
  suspended: boolean;
  serviceRadiusMiles: number;
}

export interface TaskOfferFacts {
  posterUserId: string;
  status: TaskStatus | string;
  /** Hidden by staff (UI-033): no offers, like a closed task. */
  hidden?: boolean;
  /** Its poster can't use their account (suspended, banned or deleted): no offers, as the feeds leave it out (sweep PT10). */
  posterInactive?: boolean;
  /** Offers close here: they expire at the window's start (blueprint 03), so one sent later would be dead on arrival. */
  windowStart: Date;
  windowEnd: Date;
  categorySlug: CategorySlug;
  requiresBackgroundCheck: boolean;
  remote: boolean;
  /** From the helper's area to the task's public point; null when unknown. */
  distanceMiles: number | null;
}

/** Why this helper can't offer on this task, or undefined when they can. Checked in this order. */
export function offerBlockedReason(helper: HelperOfferFacts, task: TaskOfferFacts, now: Date): OfferBlockedReason | undefined {
  if (task.posterUserId === helper.userId) return 'own_task';
  if (task.status !== 'open' || task.hidden || task.posterInactive || task.windowStart <= now) return 'task_closed';
  if (helper.suspended || helper.bookableCategories.length === 0) return 'not_bookable';
  if (!helper.offeredCategories.includes(task.categorySlug)) return 'category_not_offered';
  if (!helper.bookableCategories.includes(task.categorySlug)) {
    return task.requiresBackgroundCheck ? 'needs_background_check' : 'not_bookable';
  }
  if (!task.remote && task.distanceMiles !== null && task.distanceMiles > helper.serviceRadiusMiles) return 'outside_area';
  return undefined;
}

/**
 * The offer form's rules: start times every 30 minutes from the window start until 30 minutes before
 * its end, on the window's day on its market's clock (a window shorter than 30 minutes offers its start only). Each
 * wall-clock time once: when the clocks fall back, 1:00 and 1:30 happen twice, and the form's time means
 * the first (`marketLocalToUtc`).
 */
export function offerRulesFor(
  task: { windowStart: Date; windowEnd: Date; pricingType: string; estimatedHours: number | null },
  category: { minPriceCents: number },
  timeZone: TimeZone,
): OfferRules {
  const date = marketDayKey(task.windowStart, timeZone);
  const startTimes: string[] = [];
  for (let at = task.windowStart.getTime(); at + STEP_MS <= task.windowEnd.getTime(); at += STEP_MS) {
    if (marketDayKey(new Date(at), timeZone) !== date) break;
    const time = marketClockTime(new Date(at), timeZone);
    if (!startTimes.includes(time)) startTimes.push(time);
  }
  if (startTimes.length === 0) startTimes.push(marketClockTime(task.windowStart, timeZone));
  const hourly = task.pricingType === 'hourly';
  return {
    timeZone,
    date,
    startTimes,
    pricingType: hourly ? 'hourly' : 'fixed',
    minPriceCents: category.minPriceCents,
    ...(hourly && task.estimatedHours ? { minHoursCap: task.estimatedHours } : {}),
    messageMaxLength: OFFER_MESSAGE_MAX_LENGTH,
  };
}

/** The form's starting values: the poster's budget and the first start time. */
export function offerDefaultsFor(budget: PricingInput, rules: OfferRules) {
  return { pricing: budget, startTime: rules.startTimes[0] ?? '', message: '', brings: [] as string[] };
}

/** What the helper can do with their own offer while the task is open. */
export function helperOfferActions(
  offer: { status: OfferStatus | string },
  task: { status: TaskStatus | string; windowEnd: Date },
  now: Date,
): ActionDescriptor<OfferActionId>[] {
  const message: ActionDescriptor<OfferActionId> = { id: 'message_poster', kind: 'secondary', enabled: true };
  if (offer.status === 'accepted') return [message];
  if (task.status !== 'open' || task.windowEnd <= now) return [];
  const revise: ActionDescriptor<OfferActionId> = { id: 'revise_offer', kind: 'secondary', enabled: true };
  const withdraw: ActionDescriptor<OfferActionId> = { id: 'withdraw_offer', kind: 'destructive', enabled: true, confirm: true };
  if (offer.status === 'pending') return [revise, message, withdraw];
  if (offer.status === 'stale') return [{ id: 'reconfirm_offer', kind: 'primary', enabled: true }, revise, message, withdraw];
  return [];
}
