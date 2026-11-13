import type {
  AdminMetricsPageData,
  CategorySlug,
  Cents,
  LiquidityFigures,
  LiquidityRow,
  MetricShare,
  MetricTarget,
  MetricsDay,
  MetricsFunnel,
  MetricsFunnelStep,
  MetricsLiquidity,
  MetricsPeriodDays,
  MetricsRewardSpend,
  MetricsTotals,
  PriceBreakdown,
  RewardProgramCode,
  RewardProgramSpend,
  RewardStatus,
} from '@/contracts';
import { REWARD_PROGRAM_CODES } from '@/contracts';
import { marketMonthStart } from '@/modules/rewards/domain';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * Pure market metrics (B-067; blueprint 01 §9 targets, 11 E7). `service.ts` loads the facts; everything here is
 * arithmetic on them, so the integration test and the unit tests check the same rules the page shows.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 01 §9: liquidity counts tasks posted 7 am–9 pm market time. */
const BUSINESS_HOURS = { from: 7, to: 21 } as const;
const REBOOK_WINDOW_DAYS = 60;

/**
 * Contribution per booking before rewards, estimated with blueprint 04 §8's assumptions (there is no ledger of
 * provider fees yet): platform fees less card processing (2.9% + 30¢ of the charge), the payout fee (0.25% + 25¢
 * of the helper's earnings), the connected account's $2 a month (split over that helper's completed bookings in
 * the month), notifications and infrastructure (10¢) and the loss reserve (0.5% of the charge).
 */
export const CONTRIBUTION_ASSUMPTIONS = {
  cardPercent: 0.029,
  cardFixedCents: 30,
  payoutPercent: 0.0025,
  payoutFixedCents: 25,
  activeAccountMonthlyCents: 200,
  infrastructureCents: 10,
  reservePercent: 0.005,
} as const;

/** Rewards that count against a budget: everything not voided or expired (as on `/admin/rewards`). */
const COMMITTED: readonly RewardStatus[] = ['pending', 'qualified', 'in_review', 'redeemable', 'issuing', 'delivered', 'failed'];
/** Shown even before their first grant: the programs on at launch. */
const LAUNCH_PROGRAMS: readonly RewardProgramCode[] = ['welcome', 'repeat', 'recurring_month'];

export interface TaskFact {
  id: string;
  posterUserId: string;
  category: CategorySlug;
  categoryName: string;
  /** Remote tasks have no area. */
  areaId?: string;
  areaName?: string;
  status: string;
  publishedAt: Date;
  firstOfferAt?: Date;
}

export interface BookingFact {
  id: string;
  taskId: string;
  posterUserId: string;
  helperUserId: string;
  status: string;
  createdAt: Date;
  confirmedAt?: Date;
  startAt: Date;
  completedAt?: Date;
  /** Regular visits after the first are made by the series, not by the client. */
  visitIndex?: number;
  /** The final breakdown once completed, otherwise the current terms'. */
  breakdown: PriceBreakdown;
}

export interface GrantFact {
  helperUserId: string;
  program: RewardProgramCode;
  amountCents: Cents;
  status: RewardStatus;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
}

export interface MetricsFacts {
  /** Board tasks published in the period. */
  tasks: TaskFact[];
  /** When each offer made in the period was sent. */
  offerTimes: Date[];
  /** Bookings made, starting or completed in the period, and every booking on the period's tasks. */
  bookings: BookingFact[];
  /** Each client's first completed booking, ever (for repeat bookings). */
  firstCompletionByPoster: ReadonlyMap<string, Date>;
  /** Bookings with a helper strike (late cancellation or no-show) that wasn't reversed. */
  strikeBookingIds: ReadonlySet<string>;
  /** Bookings with a dispute case. */
  disputeBookingIds: ReadonlySet<string>;
  /** When each helper's ID was verified (never: absent). */
  helperIdVerifiedAt: ReadonlyMap<string, Date>;
  /** Every reward grant (finance and admins only; empty otherwise). */
  grants: GrantFact[];
  budgets: Partial<Record<RewardProgramCode, Cents>>;
  monthlyCapCents: Cents;
}

export interface MetricsPeriod {
  days: MetricsPeriodDays;
  dayKeys: string[];
  from: Date;
  now: Date;
}

/** The last `days` market days, today included; the period starts at the first one's market midnight. */
export function metricsPeriod(days: MetricsPeriodDays, now: Date): MetricsPeriod {
  const [year, month, day] = marketDayKey(now).split('-').map(Number) as [number, number, number];
  const dayKeys = Array.from({ length: days }, (_, index) => new Date(Date.UTC(year, month - 1, day - (days - 1 - index))).toISOString().slice(0, 10));
  return { days, dayKeys, from: new Date(marketLocalToUtc(dayKeys[0]!, '00:00')), now };
}

export function share(part: number, whole: number): MetricShare {
  return whole > 0 ? { part, whole, percent: Math.round((1000 * part) / whole) / 10 } : { part, whole };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

const inPeriod = (at: Date | undefined, period: MetricsPeriod): at is Date => !!at && at >= period.from && at <= period.now;

/** A booking was made once it's confirmed (paid), or booked now and charged later (`scheduled`). */
export const isMade = (booking: BookingFact) => !!booking.confirmedAt || booking.status === 'scheduled';
export const madeAt = (booking: BookingFact) => booking.confirmedAt ?? booking.createdAt;

function liquidityOf(tasks: TaskFact[], bookedTaskIds: ReadonlySet<string>, now: Date): LiquidityFigures {
  const businessHours = tasks.filter((task) => {
    const hour = Number(marketClockTime(task.publishedAt).slice(0, 2));
    return hour >= BUSINESS_HOURS.from && hour < BUSINESS_HOURS.to && task.publishedAt.getTime() + 2 * HOUR <= now.getTime();
  });
  const dayOld = tasks.filter((task) => task.publishedAt.getTime() + DAY <= now.getTime());
  const within = (task: TaskFact, ms: number) => !!task.firstOfferAt && task.firstOfferAt.getTime() - task.publishedAt.getTime() <= ms;
  const firstOfferMinutes = tasks.flatMap((task) => (task.firstOfferAt ? [Math.round((task.firstOfferAt.getTime() - task.publishedAt.getTime()) / MINUTE)] : []));
  const medianMinutes = median(firstOfferMinutes);
  return {
    offerWithin2h: share(businessHours.filter((task) => within(task, 2 * HOUR)).length, businessHours.length),
    offerWithin24h: share(dayOld.filter((task) => within(task, DAY)).length, dayOld.length),
    ...(medianMinutes !== undefined ? { medianFirstOfferMinutes: medianMinutes } : {}),
    filled: share(tasks.filter((task) => bookedTaskIds.has(task.id)).length, tasks.length),
  };
}

function groupRows<T extends { key: string; name: string }>(tasks: TaskFact[], keyOf: (task: TaskFact) => T, bookedTaskIds: ReadonlySet<string>, now: Date): (LiquidityRow & T)[] {
  const groups = new Map<string, { head: T; tasks: TaskFact[] }>();
  for (const task of tasks) {
    const head = keyOf(task);
    const group = groups.get(head.key) ?? { head, tasks: [] };
    group.tasks.push(task);
    groups.set(head.key, group);
  }
  return [...groups.values()]
    .map(({ head, tasks: inGroup }) => ({ ...head, posted: inGroup.length, ...liquidityOf(inGroup, bookedTaskIds, now) }))
    .sort((a, b) => b.posted - a.posted || a.name.localeCompare(b.name));
}

/** Contribution per completed booking before rewards (04 §8 assumptions), in cents. */
export function contributionOf(bookings: BookingFact[]): { cents: Cents; bookings: number } | undefined {
  if (bookings.length === 0) return undefined;
  const a = CONTRIBUTION_ASSUMPTIONS;
  // The connected account's monthly fee, split over the helper's completed bookings that month.
  const perHelperMonth = new Map<string, number>();
  const monthKey = (booking: BookingFact) => `${booking.helperUserId}:${marketDayKey(booking.completedAt!).slice(0, 7)}`;
  for (const booking of bookings) perHelperMonth.set(monthKey(booking), (perHelperMonth.get(monthKey(booking)) ?? 0) + 1);
  let total = 0;
  for (const booking of bookings) {
    const { breakdown } = booking;
    const charge = breakdown.posterChargedCents ?? breakdown.posterTotalCents;
    total +=
      breakdown.platformRevenueCents -
      (charge * a.cardPercent + a.cardFixedCents) -
      (breakdown.helperEarningsCents * a.payoutPercent + a.payoutFixedCents) -
      a.activeAccountMonthlyCents / perHelperMonth.get(monthKey(booking))! -
      a.infrastructureCents -
      charge * a.reservePercent;
  }
  return { cents: Math.round(total / bookings.length), bookings: bookings.length };
}

function shareTarget(
  id: MetricTarget['id'],
  area: MetricTarget['area'],
  comparison: MetricTarget['comparison'],
  percent: number,
  value: MetricShare,
  maturing?: number,
): MetricTarget {
  const base = { id, area, comparison, target: { kind: 'percent' as const, percent }, ...(maturing ? { maturing } : {}) };
  if (value.whole === 0) return { ...base, status: 'no_data' };
  const met = comparison === 'at_least' ? value.part * 100 >= percent * value.whole : value.part * 100 <= percent * value.whole;
  return { ...base, value: { kind: 'share', share: value }, status: met ? 'met' : 'missed' };
}

function rewardSpendOf(facts: MetricsFacts, period: MetricsPeriod): MetricsRewardSpend {
  const committed = (grant: GrantFact) => COMMITTED.includes(grant.status);
  const present = new Set<RewardProgramCode>([...LAUNCH_PROGRAMS, ...(Object.keys(facts.budgets) as RewardProgramCode[]), ...facts.grants.map((grant) => grant.program)]);
  const programs = REWARD_PROGRAM_CODES.filter((program) => present.has(program)).map((program): RewardProgramSpend => {
    const grants = facts.grants.filter((grant) => grant.program === program);
    const sum = (list: GrantFact[]) => list.reduce((total, grant) => total + grant.amountCents, 0);
    const committedCents = sum(grants.filter(committed));
    const budgetCents = facts.budgets[program];
    const periodGranted = grants.filter((grant) => committed(grant) && inPeriod(grant.createdAt, period));
    return {
      program,
      ...(budgetCents !== undefined
        ? { budgetCents, remainingCents: Math.max(0, budgetCents - committedCents), budgetUsedPercent: budgetCents > 0 ? Math.round((100 * committedCents) / budgetCents) : 100 }
        : {}),
      committedCents,
      deliveredCents: sum(grants.filter((grant) => grant.status === 'delivered')),
      periodGrantedCents: sum(periodGranted),
      periodGrants: periodGranted.length,
      periodDeliveredCents: sum(grants.filter((grant) => grant.status === 'delivered' && inPeriod(grant.deliveredAt, period))),
      periodVoided: grants.filter((grant) => grant.status === 'voided' && inPeriod(grant.updatedAt, period)).length,
      inReview: grants.filter((grant) => grant.status === 'in_review').length,
    };
  });
  // The monthly cap as the rewards service applies it: grants not voided, created this calendar month (market time).
  const monthStart = marketMonthStart(period.now);
  const thisMonth = new Map<string, number>();
  for (const grant of facts.grants) {
    if (grant.status === 'voided' || grant.createdAt < monthStart) continue;
    thisMonth.set(grant.helperUserId, (thisMonth.get(grant.helperUserId) ?? 0) + grant.amountCents);
  }
  const used = [...thisMonth.values()];
  return {
    programs,
    periodDeliveredCents: programs.reduce((total, program) => total + program.periodDeliveredCents, 0),
    monthlyCapCents: facts.monthlyCapCents,
    helpersAtCap: used.filter((cents) => cents >= facts.monthlyCapCents).length,
    helpersNearCap: used.filter((cents) => cents < facts.monthlyCapCents && cents * 10 >= facts.monthlyCapCents * 8).length,
  };
}

export function computeMetrics(facts: MetricsFacts, period: MetricsPeriod, canSeeMoney: boolean): AdminMetricsPageData {
  const { now } = period;
  const made = facts.bookings.filter(isMade);
  const bookedTaskIds = new Set(made.map((booking) => booking.taskId));
  const completedTaskIds = new Set(facts.bookings.filter((booking) => booking.status === 'completed').map((booking) => booking.taskId));

  // Booked again: a booking the client made (not a later visit of a series) within 60 days after a completion.
  const againByPoster = new Map<string, Date[]>();
  for (const booking of made) {
    if ((booking.visitIndex ?? 1) > 1) continue;
    againByPoster.set(booking.posterUserId, [...(againByPoster.get(booking.posterUserId) ?? []), madeAt(booking)]);
  }
  const bookedAgainAfter = (posterUserId: string, completedAt: Date) =>
    (againByPoster.get(posterUserId) ?? []).some((at) => at > completedAt && at.getTime() <= completedAt.getTime() + REBOOK_WINDOW_DAYS * DAY);
  const rebookSettled = (completedAt: Date) => completedAt.getTime() + REBOOK_WINDOW_DAYS * DAY <= now.getTime();

  // ---- Funnel: the period's tasks, followed.
  const cohortIds = new Set(facts.tasks.map((task) => task.id));
  const cohortCompletions = facts.bookings.filter((booking) => booking.status === 'completed' && booking.completedAt && cohortIds.has(booking.taskId));
  const rebookedTasks = cohortCompletions.filter((booking) => bookedAgainAfter(booking.posterUserId, booking.completedAt!));
  const counts: Record<MetricsFunnelStep['id'], number> = {
    posted: facts.tasks.length,
    offered: facts.tasks.filter((task) => task.firstOfferAt).length,
    booked: facts.tasks.filter((task) => bookedTaskIds.has(task.id)).length,
    completed: facts.tasks.filter((task) => completedTaskIds.has(task.id)).length,
    rebooked: new Set(rebookedTasks.map((booking) => booking.taskId)).size,
  };
  const order = ['posted', 'offered', 'booked', 'completed', 'rebooked'] as const;
  const funnel: MetricsFunnel = {
    steps: order.map((id, index) => ({ id, count: counts[id], ofPosted: share(counts[id], counts.posted), ofPrevious: share(counts[id], counts[order[Math.max(0, index - 1)]!]) })),
    rebookMaturing: cohortCompletions.filter((booking) => !bookedAgainAfter(booking.posterUserId, booking.completedAt!) && !rebookSettled(booking.completedAt!)).length,
  };

  // ---- Liquidity, overall and by category and area.
  const liquidity: MetricsLiquidity = {
    overall: liquidityOf(facts.tasks, bookedTaskIds, now),
    byCategory: groupRows(facts.tasks, (task) => ({ key: task.category, name: task.categoryName, category: task.category }), bookedTaskIds, now),
    byArea: groupRows(facts.tasks, (task) => (task.areaId ? { key: task.areaId, name: task.areaName ?? task.areaId } : { key: 'remote', name: '', remote: true as const }), bookedTaskIds, now).sort(
      (a, b) => Number(!!a.remote) - Number(!!b.remote),
    ),
  };

  // ---- Bookings that were confirmed and were due to start in the period.
  const started = facts.bookings.filter((booking) => booking.confirmedAt && inPeriod(booking.startAt, period));
  const settled = started.filter((booking) => booking.status === 'completed' || booking.status === 'canceled');

  // ---- Clients with a completion in the period (their first one in it), and whether they booked again.
  const firstInPeriod = new Map<string, Date>();
  for (const booking of facts.bookings) {
    if (booking.status !== 'completed' || !inPeriod(booking.completedAt, period)) continue;
    const seen = firstInPeriod.get(booking.posterUserId);
    if (!seen || booking.completedAt < seen) firstInPeriod.set(booking.posterUserId, booking.completedAt);
  }
  const clients = [...firstInPeriod];
  const rebookedClients = clients.filter(([poster, at]) => bookedAgainAfter(poster, at));

  // ---- Helpers booked in the period: ID-verified before their booking.
  const firstBookedInPeriod = new Map<string, Date>();
  for (const booking of made) {
    const at = madeAt(booking);
    if (!inPeriod(at, period)) continue;
    const seen = firstBookedInPeriod.get(booking.helperUserId);
    if (!seen || at < seen) firstBookedInPeriod.set(booking.helperUserId, at);
  }
  const helpers = [...firstBookedInPeriod];
  const verifiedHelpers = helpers.filter(([helper, at]) => {
    const verifiedAt = facts.helperIdVerifiedAt.get(helper);
    return !!verifiedAt && verifiedAt <= at;
  });

  const completedInPeriod = facts.bookings.filter((booking) => booking.status === 'completed' && inPeriod(booking.completedAt, period));
  const contribution = contributionOf(completedInPeriod);

  const targets: MetricTarget[] = [
    shareTarget('offer_within_2h', 'liquidity', 'at_least', 70, liquidity.overall.offerWithin2h),
    shareTarget('posted_to_booked', 'liquidity', 'at_least', 50, liquidity.overall.filled, facts.tasks.filter((task) => task.status === 'open' && !bookedTaskIds.has(task.id)).length),
    shareTarget('bookings_completed', 'quality', 'at_least', 90, share(settled.filter((booking) => booking.status === 'completed').length, settled.length), started.length - settled.length),
    shareTarget('bookings_disputed', 'quality', 'at_most', 3, share(started.filter((booking) => facts.disputeBookingIds.has(booking.id)).length, started.length)),
    shareTarget('helper_reliability', 'reliability', 'at_most', 2, share(started.filter((booking) => facts.strikeBookingIds.has(booking.id)).length, started.length)),
    shareTarget(
      'rebook_60d',
      'retention',
      'at_least',
      25,
      share(rebookedClients.length, clients.length),
      clients.filter(([poster, at]) => !bookedAgainAfter(poster, at) && !rebookSettled(at)).length,
    ),
    {
      id: 'contribution_per_booking',
      area: 'economics',
      comparison: 'at_least',
      target: { kind: 'money', cents: 600 },
      ...(!canSeeMoney
        ? { status: 'restricted' as const }
        : contribution
          ? { value: { kind: 'money_per_booking' as const, ...contribution }, status: contribution.cents >= 600 ? ('met' as const) : ('missed' as const) }
          : { status: 'no_data' as const }),
    },
    shareTarget('helpers_id_verified', 'trust', 'at_least', 100, share(verifiedHelpers.length, helpers.length)),
    { id: 'address_incidents', area: 'privacy', comparison: 'at_most', target: { kind: 'count', count: 0 }, status: 'not_measured' },
  ];

  // ---- Daily figures (market days).
  const days = new Map<string, MetricsDay>(
    period.dayKeys.map((day) => [day, { day, startsAt: marketLocalToUtc(day, '00:00'), posted: 0, offers: 0, booked: 0, completed: 0, repeat: 0, ...(canSeeMoney ? { rewardsDeliveredCents: 0 } : {}) }]),
  );
  const bump = (at: Date | undefined, field: 'posted' | 'offers' | 'booked' | 'completed' | 'repeat', by = 1) => {
    if (!inPeriod(at, period)) return;
    const entry = days.get(marketDayKey(at));
    if (entry) entry[field] += by;
  };
  for (const task of facts.tasks) bump(task.publishedAt, 'posted');
  for (const at of facts.offerTimes) bump(at, 'offers');
  for (const booking of made) {
    const at = madeAt(booking);
    bump(at, 'booked');
    const first = facts.firstCompletionByPoster.get(booking.posterUserId);
    if (first && first < at) bump(at, 'repeat');
  }
  for (const booking of facts.bookings) if (booking.status === 'completed') bump(booking.completedAt, 'completed');
  if (canSeeMoney) {
    for (const grant of facts.grants) {
      if (grant.status !== 'delivered' || !inPeriod(grant.deliveredAt, period)) continue;
      const entry = days.get(marketDayKey(grant.deliveredAt));
      if (entry) entry.rewardsDeliveredCents = (entry.rewardsDeliveredCents ?? 0) + grant.amountCents;
    }
  }

  const daily = [...days.values()];
  const sum = (field: 'posted' | 'offers' | 'booked' | 'completed' | 'repeat') => daily.reduce((total, day) => total + day[field], 0);
  const totals: MetricsTotals = {
    posted: sum('posted'),
    offers: sum('offers'),
    booked: sum('booked'),
    completed: sum('completed'),
    repeat: sum('repeat'),
    ...(canSeeMoney ? { rewardsDeliveredCents: daily.reduce((total, day) => total + (day.rewardsDeliveredCents ?? 0), 0) } : {}),
  };

  return {
    days: period.days,
    from: period.from.toISOString(),
    generatedAt: now.toISOString(),
    canSeeMoney,
    targets,
    funnel,
    daily,
    totals,
    liquidity,
    ...(canSeeMoney ? { rewards: rewardSpendOf(facts, period) } : {}),
  };
}
